"""
Stock lots endpoints for Omiximo Inventory OS.
Manual stock-IN via write_purchase from email_poller.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import require_session
from email_poller.purchase_writer import write_purchase

router = APIRouter(prefix="/api/stock-lots", tags=["stock-lots"])


class StockLotIn(BaseModel):
    ean: str
    quantity: int
    unit_cost: float
    marketplace: str = "manual"


@router.post("", status_code=201)
def create_stock_lot(body: StockLotIn, session=Depends(require_session)):
    """Create a new stock lot (manual purchase stock-IN)."""
    try:
        lot_id = write_purchase(body.ean, body.quantity, body.unit_cost, body.marketplace)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"id": lot_id, "ok": True}
