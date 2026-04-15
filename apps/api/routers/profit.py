"""
Profit dashboard endpoints for Interwall Inventory OS.
Aggregation queries: profit summary by period, stock valuation, transaction list.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
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
    """List sale transactions with component breakdown, newest first."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Fetch transactions with product name
            cur.execute(
                "SELECT t.id, t.type, t.product_ean, p.name AS product_name, "
                "       t.quantity, t.unit_price, t.total_price, "
                "       t.marketplace, t.order_reference, t.cogs, t.profit, t.created_at "
                "FROM transactions t "
                "LEFT JOIN products p ON p.ean = t.product_ean "
                "WHERE t.type = 'sale' "
                "ORDER BY t.created_at DESC "
                "LIMIT %s OFFSET %s",
                (limit, offset),
            )
            txns = cur.fetchall()

            if not txns:
                return []

            # Collect unique product EANs and fetch their compositions
            eans = list({t["product_ean"] for t in txns})
            cur.execute(
                "SELECT ec.parent_ean, p.name AS component_name, "
                "       ec.component_ean, ec.quantity "
                "FROM ean_compositions ec "
                "JOIN products p ON p.ean = ec.component_ean "
                "WHERE ec.parent_ean = ANY(%s) "
                "ORDER BY ec.parent_ean, p.name",
                (eans,),
            )
            comp_rows = cur.fetchall()

            # Fetch current fixed costs for breakdown display
            cur.execute("SELECT name, value, is_percentage FROM fixed_costs")
            fixed_costs = cur.fetchall()

            # Fetch VAT rates per marketplace
            cur.execute("SELECT marketplace, country, rate FROM vat_rates")
            vat_rows = cur.fetchall()
            vat_by_marketplace = {r["marketplace"].lower(): r for r in vat_rows}

            # Group compositions by parent EAN
            compositions = {}
            comp_eans = set()
            for row in comp_rows:
                parent = row["parent_ean"]
                if parent not in compositions:
                    compositions[parent] = []
                compositions[parent].append({
                    "component_ean": row["component_ean"],
                    "component_name": row["component_name"],
                    "quantity": row["quantity"],
                })
                comp_eans.add(row["component_ean"])

            # Fetch average unit cost per component (from all lots, including depleted)
            avg_costs = {}
            if comp_eans:
                cur.execute(
                    "SELECT p.ean, AVG(sl.unit_cost) AS avg_cost "
                    "FROM stock_lots sl "
                    "JOIN products p ON p.id = sl.product_id "
                    "WHERE p.ean = ANY(%s) "
                    "GROUP BY p.ean",
                    (list(comp_eans),),
                )
                for row in cur.fetchall():
                    avg_costs[row["ean"]] = float(row["avg_cost"] or 0)

            # Attach components and fixed cost breakdown to each transaction
            for tx in txns:
                ean = tx["product_ean"]
                tx_qty = tx["quantity"]
                tx_cogs = float(tx["cogs"] or 0)
                comps = compositions.get(ean, [])

                # Estimate per-component cost, then normalize to match COGS
                raw_costs = []
                for c in comps:
                    qty = c["quantity"] * tx_qty
                    unit_cost = avg_costs.get(c["component_ean"], 0)
                    raw_costs.append(qty * unit_cost)
                raw_total = sum(raw_costs)

                tx["components"] = []
                for i, c in enumerate(comps):
                    qty = c["quantity"] * tx_qty
                    # Distribute actual COGS proportionally
                    if raw_total > 0:
                        comp_cost = round(tx_cogs * raw_costs[i] / raw_total, 2)
                    elif len(comps) > 0:
                        comp_cost = round(tx_cogs / len(comps), 2)
                    else:
                        comp_cost = 0
                    tx["components"].append({
                        "component_name": c["component_name"],
                        "component_ean": c["component_ean"],
                        "quantity": qty,
                        "cost": comp_cost,
                    })
                # Compute fixed cost breakdown for display
                total_price = float(tx["total_price"] or 0)
                marketplace = tx.get("marketplace") or ""
                tx["fixed_costs"] = []
                for fc in fixed_costs:
                    if fc["is_percentage"]:
                        amount = total_price * float(fc["value"]) / 100
                    else:
                        amount = float(fc["value"])
                    tx["fixed_costs"].append({
                        "name": fc["name"],
                        "value": float(fc["value"]),
                        "is_percentage": fc["is_percentage"],
                        "amount": round(amount, 2),
                    })
                # Add marketplace-specific VAT
                vat_info = vat_by_marketplace.get(marketplace.lower() if marketplace else "")
                vat_rate = float(vat_info["rate"]) if vat_info else 21.0
                vat_country = vat_info["country"] if vat_info else "NL"
                vat_amount = round(total_price * vat_rate / 100, 2)
                tx["fixed_costs"].append({
                    "name": "vat",
                    "value": vat_rate,
                    "is_percentage": True,
                    "amount": vat_amount,
                    "country": vat_country,
                })

            return txns


class TransactionUpdate(BaseModel):
    unit_price: Optional[float] = None
    marketplace: Optional[str] = None
    order_reference: Optional[str] = None


@router.patch("/transactions/{txn_id}")
def update_transaction(txn_id: str, body: TransactionUpdate, session=Depends(require_session)):
    """Update non-financial sale metadata without mutating stored economics."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, unit_price, marketplace, order_reference "
                "FROM transactions WHERE id = %s",
                (txn_id,),
            )
            tx = cur.fetchone()
            if not tx:
                raise HTTPException(404, "Transaction not found")

            current_price = float(tx["unit_price"] or 0)
            if body.unit_price is not None and float(body.unit_price) != current_price:
                raise HTTPException(
                    status_code=409,
                    detail="D-025: unit_price/profit are immutable after sale time",
                )

            new_marketplace = body.marketplace if body.marketplace is not None else tx["marketplace"]
            new_ref = body.order_reference if body.order_reference is not None else tx.get("order_reference")

            cur.execute(
                "UPDATE transactions SET marketplace = %s, order_reference = %s "
                "WHERE id = %s RETURNING id",
                (new_marketplace, new_ref, txn_id),
            )
            conn.commit()
            return {"ok": True}
