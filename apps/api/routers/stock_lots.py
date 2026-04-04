"""
Stock lots endpoints for Omiximo Inventory OS.
Manual stock-IN via write_purchase from email_poller.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
