"""
Profit dashboard endpoints for Omiximo Inventory OS.
Aggregation queries: profit summary by period, stock valuation, transaction list.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_conn
from auth import require_session

router = APIRouter(prefix="/api/profit", tags=["profit"])

ALLOWED_PERIODS = {"day", "week", "month"}


@router.get("/summary")
def profit_summary(period: str = "day", session=Depends(require_session)):
    """Profit aggregated by period and marketplace.
    Period must be one of: day, week, month.
    """
    if period not in ALLOWED_PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period '{period}'. Must be one of: {', '.join(sorted(ALLOWED_PERIODS))}",
        )
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DATE_TRUNC(%s, created_at) AS period, "
                "       marketplace, "
                "       SUM(profit) AS total_profit, "
                "       SUM(total_price) AS total_revenue, "
                "       SUM(cogs) AS total_cogs, "
                "       COUNT(*) AS sale_count "
                "FROM transactions "
                "WHERE type = 'sale' "
                "GROUP BY 1, 2 "
                "ORDER BY 1 DESC",
                (period,),
            )
            return cur.fetchall()


@router.get("/valuation")
def stock_valuation(session=Depends(require_session)):
    """Total stock value per product (only lots with remaining quantity)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT p.ean, p.name, "
                "       SUM(sl.quantity) AS total_qty, "
                "       SUM(sl.quantity * sl.unit_cost) AS total_value "
                "FROM stock_lots sl "
                "JOIN products p ON p.id = sl.product_id "
                "WHERE sl.quantity > 0 "
                "GROUP BY p.ean, p.name "
                "ORDER BY total_value DESC"
            )
            return cur.fetchall()


@router.get("/transactions")
def list_transactions(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session=Depends(require_session),
):
    """List sale transactions for the profit dashboard, newest first."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, type, product_ean, quantity, unit_price, total_price, "
                "       marketplace, order_reference, cogs, profit, created_at "
                "FROM transactions "
                "WHERE type = 'sale' "
                "ORDER BY created_at DESC "
                "LIMIT %s OFFSET %s",
                (limit, offset),
            )
            return cur.fetchall()
