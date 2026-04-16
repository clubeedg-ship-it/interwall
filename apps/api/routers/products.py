"""
Products CRUD endpoints for Interwall Inventory OS.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import get_conn
from auth import require_session

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductCreate(BaseModel):
    ean: str
    name: str
    sku: str | None = None
    category_id: str | None = None
    description: str | None = None
    minimum_stock: int = 0
    # JIT reorder inputs. Optional; v_product_reorder derives effective_reorder_point
    # as max(ceil(avg_delivery_days * avg_sold_per_day), minimum_stock).
    avg_delivery_days: float | None = None
    avg_sold_per_day: float | None = None
    is_composite: bool = False


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    category_id: str | None = None
    description: str | None = None
    minimum_stock: int | None = None
    avg_delivery_days: float | None = None
    avg_sold_per_day: float | None = None
    is_composite: bool | None = None


@router.get("")
def list_products(q: str = "", composite: str | None = None, session=Depends(require_session)):
    """List products, optionally filtered by search and composite flag."""
    conditions = ["(p.ean ILIKE %s OR p.name ILIKE %s)"]
    params = [f"%{q}%", f"%{q}%"]

    if composite == "true":
        conditions.append("p.is_composite = TRUE")
    elif composite == "false":
        conditions.append("p.is_composite = FALSE")

    where = " AND ".join(conditions)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT p.id, p.ean, p.name, p.sku, p.is_composite,
                           p.minimum_stock, p.avg_delivery_days, p.avg_sold_per_day,
                           p.category_id, p.description,
                           c.name AS category_name
                    FROM products p
                    LEFT JOIN categories c ON c.id = p.category_id
                    WHERE {where}
                    ORDER BY p.name LIMIT 500""",
                params,
            )
            rows = cur.fetchall()
    out = []
    for r in rows:
        d = dict(r)
        if d.get("avg_delivery_days") is not None:
            d["avg_delivery_days"] = float(d["avg_delivery_days"])
        if d.get("avg_sold_per_day") is not None:
            d["avg_sold_per_day"] = float(d["avg_sold_per_day"])
        out.append(d)
    return out


@router.get("/health")
def products_health(session=Depends(require_session)):
    """Shared health signal per product EAN.

    Joins v_part_stock (authoritative total_qty per EAN) with v_product_reorder
    (effective_reorder_point = max(ceil(avg_delivery_days*avg_sold_per_day), minimum_stock))
    and classifies into tiers the entire UI reads from:
      - empty:    total_qty == 0
      - critical: total_qty < reorder_point  (reorder_point > 0)
      - warning:  total_qty < reorder_point * 2  (reorder_point > 0)
      - healthy:  everything else

    When reorder_point is 0 (no JIT params and no minimum_stock), we fall back to
    absolute legacy thresholds (5/15) so parts without setup still signal.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT
                        p.ean,
                        COALESCE(vs.total_qty, 0)::INTEGER          AS total_qty,
                        COALESCE(vr.effective_reorder_point, 0)::INTEGER AS reorder_point,
                        vr.computed_reorder_point::INTEGER          AS computed_reorder_point,
                        COALESCE(p.minimum_stock, 0)::INTEGER       AS minimum_stock
                   FROM products p
                   LEFT JOIN v_part_stock vs ON vs.product_id = p.id
                   LEFT JOIN v_product_reorder vr ON vr.product_id = p.id
                   WHERE p.is_composite = FALSE"""
            )
            rows = cur.fetchall()

    out = []
    for r in rows:
        qty = int(r["total_qty"])
        rop = int(r["reorder_point"])
        if qty <= 0:
            health = "empty"
        elif rop > 0:
            if qty < rop:
                health = "critical"
            elif qty < rop * 2:
                health = "warning"
            else:
                health = "healthy"
        else:
            # Fallback absolute thresholds for parts with no JIT/min_stock set.
            if qty <= 5:
                health = "critical"
            elif qty <= 15:
                health = "warning"
            else:
                health = "healthy"
        out.append({
            "ean": r["ean"],
            "total_qty": qty,
            "reorder_point": rop,
            "computed_reorder_point": r["computed_reorder_point"],
            "minimum_stock": int(r["minimum_stock"]),
            "health": health,
        })
    return out


@router.get("/{ean}")
def get_product(ean: str, session=Depends(require_session)):
    """Get a single product by EAN."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.id, p.ean, p.name, p.sku, p.is_composite,
                          p.minimum_stock, p.avg_delivery_days, p.avg_sold_per_day,
                          p.category_id, p.description,
                          c.name AS category_name
                   FROM products p
                   LEFT JOIN categories c ON c.id = p.category_id
                   WHERE p.ean = %s""",
                (ean,),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Product EAN '{ean}' not found")
    d = dict(row)
    if d.get("avg_delivery_days") is not None:
        d["avg_delivery_days"] = float(d["avg_delivery_days"])
    if d.get("avg_sold_per_day") is not None:
        d["avg_sold_per_day"] = float(d["avg_sold_per_day"])
    return d


@router.post("", status_code=201)
def create_product(product: ProductCreate, session=Depends(require_session)):
    """Create a new product."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """INSERT INTO products (ean, name, sku, category_id, description,
                                            minimum_stock, avg_delivery_days,
                                            avg_sold_per_day, is_composite)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       RETURNING id, ean, name""",
                    (product.ean, product.name, product.sku, product.category_id,
                     product.description, product.minimum_stock,
                     product.avg_delivery_days, product.avg_sold_per_day,
                     product.is_composite),
                )
                row = cur.fetchone()
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(status_code=409, detail=f"Product EAN '{product.ean}' already exists")
                raise HTTPException(status_code=422, detail=str(e))
    return dict(row)


@router.patch("/{ean}")
def update_product(ean: str, body: ProductUpdate, session=Depends(require_session)):
    """Update a product by EAN. Only provided fields are changed."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [ean]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE products SET {set_clause}, updated_at = NOW() WHERE ean = %s RETURNING id, ean, name",
                values
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Product EAN '{ean}' not found")
    return dict(row)


@router.delete("/{ean}", status_code=204)
def delete_product(ean: str, session=Depends(require_session)):
    """Delete a product by EAN."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM products WHERE ean = %s RETURNING id", (ean,))
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Product EAN '{ean}' not found")
