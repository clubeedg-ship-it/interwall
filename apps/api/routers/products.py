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
    is_composite: bool = False


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    category_id: str | None = None
    description: str | None = None
    minimum_stock: int | None = None
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
                           p.minimum_stock, p.category_id, p.description,
                           c.name AS category_name
                    FROM products p
                    LEFT JOIN categories c ON c.id = p.category_id
                    WHERE {where}
                    ORDER BY p.name LIMIT 500""",
                params,
            )
            return [dict(r) for r in cur.fetchall()]


@router.get("/{ean}")
def get_product(ean: str, session=Depends(require_session)):
    """Get a single product by EAN."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.id, p.ean, p.name, p.sku, p.is_composite,
                          p.minimum_stock, p.category_id, p.description,
                          c.name AS category_name
                   FROM products p
                   LEFT JOIN categories c ON c.id = p.category_id
                   WHERE p.ean = %s""",
                (ean,),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Product EAN '{ean}' not found")
    return dict(row)


@router.post("", status_code=201)
def create_product(product: ProductCreate, session=Depends(require_session)):
    """Create a new product."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    """INSERT INTO products (ean, name, sku, category_id, description,
                                            minimum_stock, is_composite)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       RETURNING id, ean, name""",
                    (product.ean, product.name, product.sku, product.category_id,
                     product.description, product.minimum_stock, product.is_composite),
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
