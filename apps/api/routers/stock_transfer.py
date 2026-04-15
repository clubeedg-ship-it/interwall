"""
Stock transfer endpoint for Interwall Inventory OS.

Moves a stock lot (or part of one) from its current shelf to another shelf
— a pure relocation, no quantity change across the system. Used by the
handshake modal and the batch editor to rehome physical stock.

D-020/D-021: holds SELECT FOR UPDATE on the source lot.
D-022: atomic — the entire split + relocate happens in one transaction,
partial fulfilment is not possible.
No ledger rows are written: pure relocation has zero qty_delta (forbidden
by stock_ledger_entries_qty_delta_check), and splitting a lot does not
change total on-hand quantity either. D-017 governs sale-side ledger rows
on the ingestion path, which this endpoint does not touch.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/stock", tags=["stock-transfer"])


class TransferIn(BaseModel):
    lot_id: str
    to_shelf_id: str
    qty: int
    notes: str | None = None

    @field_validator("qty")
    @classmethod
    def qty_positive(cls, v):
        if v <= 0:
            raise ValueError("qty must be a positive integer")
        return v


@router.post("/transfer")
def transfer_stock(body: TransferIn, session=Depends(require_session)):
    """Move `qty` of a stock lot onto `to_shelf_id`.

    Full-quantity move: updates source lot's shelf_id in place.
    Partial-quantity move: splits the lot — source quantity decreases and
    a new lot row is inserted on the destination shelf, preserving
    product_id, unit_cost, received_at, and marketplace so FIFO order is
    stable.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, product_id, quantity, unit_cost, marketplace, "
                "received_at, shelf_id "
                "FROM stock_lots WHERE id = %s FOR UPDATE",
                (body.lot_id,),
            )
            lot = cur.fetchone()
            if lot is None:
                raise HTTPException(status_code=404, detail="lot not found")
            if body.qty > lot["quantity"]:
                raise HTTPException(
                    status_code=409,
                    detail=f"qty {body.qty} exceeds remaining {lot['quantity']}",
                )
            if str(lot["shelf_id"]) == str(body.to_shelf_id):
                raise HTTPException(
                    status_code=422,
                    detail="to_shelf_id matches current shelf",
                )

            cur.execute(
                "SELECT id FROM shelves WHERE id = %s",
                (body.to_shelf_id,),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="destination shelf not found")

            if body.qty == lot["quantity"]:
                cur.execute(
                    "UPDATE stock_lots SET shelf_id = %s WHERE id = %s",
                    (body.to_shelf_id, body.lot_id),
                )
                return {
                    "source_lot_id": str(body.lot_id),
                    "dest_lot_id": str(body.lot_id),
                    "qty": body.qty,
                }

            cur.execute(
                "UPDATE stock_lots SET quantity = quantity - %s WHERE id = %s",
                (body.qty, body.lot_id),
            )
            cur.execute(
                """INSERT INTO stock_lots
                       (product_id, shelf_id, quantity, unit_cost,
                        marketplace, received_at)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (
                    lot["product_id"],
                    body.to_shelf_id,
                    body.qty,
                    lot["unit_cost"],
                    lot["marketplace"],
                    lot["received_at"],
                ),
            )
            dest_id = cur.fetchone()["id"]

    return {
        "source_lot_id": str(body.lot_id),
        "dest_lot_id": str(dest_id),
        "qty": body.qty,
    }
