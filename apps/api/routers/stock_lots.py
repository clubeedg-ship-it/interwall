"""
Stock lots endpoints for Interwall Inventory OS.
Manual stock-IN via write_purchase from email_poller.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from auth import require_session
from db import get_conn
from email_poller.purchase_writer import write_purchase

router = APIRouter(prefix="/api/stock-lots", tags=["stock-lots"])

_HISTORY_DEFAULT_LIMIT = 200
_HISTORY_MAX_LIMIT = 1000


class StockLotIn(BaseModel):
    ean: str
    quantity: int
    unit_cost: float
    marketplace: str = "manual"
    shelf_id: str | None = None


class ConsumeIn(BaseModel):
    qty: int
    notes: str | None = None

    @field_validator("qty")
    @classmethod
    def qty_positive(cls, v):
        if v <= 0:
            raise ValueError("qty must be a positive integer")
        return v


@router.post("", status_code=201)
def create_stock_lot(body: StockLotIn, session=Depends(require_session)):
    """Create a new stock lot (manual purchase stock-IN)."""
    try:
        lot_id = write_purchase(body.ean, body.quantity, body.unit_cost, body.marketplace)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    # Assign shelf if provided
    if body.shelf_id:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE stock_lots SET shelf_id = %s WHERE id = %s", (body.shelf_id, lot_id))
    return {"id": lot_id, "ok": True}


@router.get("")
def list_active_stock_lots(session=Depends(require_session)):
    """Return all active stock lots (quantity > 0) with product + shelf metadata.

    Ordered newest-first by received_at. Feeds the Batches view active cards.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT sl.id,
                          p.ean,
                          p.name AS product_name,
                          sl.quantity,
                          sl.unit_cost,
                          sl.marketplace,
                          sl.received_at,
                          sl.shelf_id,
                          s.label AS shelf_label,
                          z.name  AS zone_name
                   FROM stock_lots sl
                   JOIN products p ON p.id = sl.product_id
                   LEFT JOIN shelves s ON s.id = sl.shelf_id
                   LEFT JOIN zones   z ON z.id = s.zone_id
                   WHERE sl.quantity > 0
                   ORDER BY sl.received_at DESC, sl.id DESC"""
            )
            rows = cur.fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        d["shelf_id"] = str(d["shelf_id"]) if d["shelf_id"] is not None else None
        d["quantity"] = int(d["quantity"])
        d["unit_cost"] = float(d["unit_cost"])
        out.append(d)
    return out


@router.get("/history")
def list_stock_lot_history(
    include_depleted: int = Query(0, ge=0, le=1),
    limit: int = Query(_HISTORY_DEFAULT_LIMIT, ge=1, le=_HISTORY_MAX_LIMIT),
    session=Depends(require_session),
):
    """Return batches with per-batch ledger movements.

    When `include_depleted=1` the response includes lots whose
    stock_lots.quantity = 0 OR whose cumulative ledger qty_delta sum is <= 0.
    Otherwise only active (quantity > 0) batches are returned.

    A batch is depleted when `sl.quantity = 0` OR the sum of its ledger
    qty_delta rows is <= 0 (D-043).
    """
    where_active = "WHERE sl.quantity > 0"
    where_all = ""  # include everything; depleted flag computed in SELECT

    sql = f"""
        WITH ledger_sums AS (
            SELECT stock_lot_id, COALESCE(SUM(qty_delta), 0) AS net_delta
            FROM stock_ledger_entries
            GROUP BY stock_lot_id
        )
        SELECT sl.id,
               p.ean,
               p.name AS product_name,
               sl.quantity       AS remaining_qty,
               sl.unit_cost,
               sl.received_at,
               COALESCE(ls.net_delta, 0) AS net_delta,
               (sl.quantity = 0) AS depleted
        FROM stock_lots sl
        JOIN products p ON p.id = sl.product_id
        LEFT JOIN ledger_sums ls ON ls.stock_lot_id = sl.id
        {where_all if include_depleted else where_active}
        ORDER BY sl.received_at DESC, sl.id DESC
        LIMIT %s
    """

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (limit,))
            lot_rows = cur.fetchall()
            lot_ids = [str(r["id"]) for r in lot_rows]

            movements_by_lot: dict[str, list[dict]] = {}
            if lot_ids:
                cur.execute(
                    """SELECT stock_lot_id, created_at AS ts, qty_delta,
                              transaction_id, unit_cost
                       FROM stock_ledger_entries
                       WHERE stock_lot_id = ANY(%s::uuid[])
                       ORDER BY created_at ASC, id ASC""",
                    (lot_ids,),
                )
                for m in cur.fetchall():
                    lot_id = str(m["stock_lot_id"])
                    movements_by_lot.setdefault(lot_id, []).append({
                        "ts": m["ts"],
                        "qty_delta": int(m["qty_delta"]),
                        "transaction_id": (
                            str(m["transaction_id"])
                            if m["transaction_id"] is not None else None
                        ),
                        "unit_cost": float(m["unit_cost"]),
                    })

    out = []
    for r in lot_rows:
        lot_id = str(r["id"])
        remaining = int(r["remaining_qty"])
        net_delta = int(r["net_delta"])
        # initial_qty = remaining - net_delta (net_delta is +purchase − sales)
        initial_qty = remaining - net_delta
        out.append({
            "id": lot_id,
            "ean": r["ean"],
            "product_name": r["product_name"],
            "initial_qty": initial_qty,
            "remaining_qty": remaining,
            "unit_cost": float(r["unit_cost"]),
            "received_at": r["received_at"],
            "depleted": bool(r["depleted"]),
            "movements": movements_by_lot.get(lot_id, []),
        })
    return out


@router.get("/by-product/{ean}")
def get_stock_lots_by_product(ean: str, session=Depends(require_session)):
    """Return stock lots for a product EAN, oldest first (FIFO order)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT sl.id, sl.quantity, sl.unit_cost, sl.marketplace,
                          sl.received_at, sl.created_at
                   FROM stock_lots sl
                   JOIN products p ON p.id = sl.product_id
                   WHERE p.ean = %s AND sl.quantity > 0
                   ORDER BY sl.received_at ASC""",
                (ean,)
            )
            rows = cur.fetchall()
    return [dict(r) for r in rows]


@router.post("/{lot_id}/consume")
def consume_lot(lot_id: str, body: ConsumeIn, session=Depends(require_session)):
    """Manual stock-out from a specific lot (handshake pick).

    NOTE: This is a non-sale manual adjustment, so no stock_ledger_entries
    row is written (the current schema requires transaction_id NOT NULL,
    type in ('purchase','sale'), and D-017 governs sale flows only). Sales
    still go through process_bom_sale on the ingestion path and continue
    to produce ledger rows. This endpoint only moves the lot quantity.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # D-020/D-021: lock the target lot; never SKIP LOCKED
            cur.execute(
                "SELECT id, product_id, quantity, unit_cost "
                "FROM stock_lots WHERE id = %s FOR UPDATE",
                (lot_id,),
            )
            lot = cur.fetchone()
            if lot is None:
                raise HTTPException(status_code=404, detail="lot not found")
            if body.qty > lot["quantity"]:
                raise HTTPException(
                    status_code=409,
                    detail=f"qty {body.qty} exceeds remaining {lot['quantity']}",
                )

            new_remaining = lot["quantity"] - body.qty
            cur.execute(
                "UPDATE stock_lots SET quantity = %s WHERE id = %s",
                (new_remaining, lot_id),
            )

    return {
        "lot_id": str(lot_id),
        "remaining": new_remaining,
        "qty_consumed": body.qty,
    }
