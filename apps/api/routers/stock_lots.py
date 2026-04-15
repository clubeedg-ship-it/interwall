"""
Stock lots endpoints for Interwall Inventory OS.
Manual stock-IN via write_purchase from email_poller.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from auth import require_session
from db import get_conn
from email_poller.purchase_writer import write_purchase

router = APIRouter(prefix="/api/stock-lots", tags=["stock-lots"])


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
