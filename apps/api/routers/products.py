"""
Products CRUD endpoints for Omiximo Inventory OS.
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
    default_reorder_point: int = 0
    is_composite: bool = False


@router.get("")
def list_products(q: str = "", session=Depends(require_session)):
    """List products, optionally filtered by EAN or name search."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ean, name, sku, is_composite, default_reorder_point "
                "FROM products "
                "WHERE ean ILIKE %s OR name ILIKE %s "
                "ORDER BY name LIMIT 100",
                (f"%{q}%", f"%{q}%"),
            )
            rows = cur.fetchall()
    return rows


@router.get("/{ean}")
def get_product(ean: str, session=Depends(require_session)):
    """Get a single product by EAN."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ean, name, sku, is_composite, default_reorder_point "
                "FROM products WHERE ean = %s",
                (ean,),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Product EAN '{ean}' not found")
    return row


@router.post("", status_code=201)
def create_product(product: ProductCreate, session=Depends(require_session)):
    """Create a new product."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO products (ean, name, sku, default_reorder_point, is_composite) "
                    "VALUES (%s, %s, %s, %s, %s) RETURNING id, ean, name",
                    (product.ean, product.name, product.sku,
                     product.default_reorder_point, product.is_composite),
                )
                row = cur.fetchone()
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(status_code=409, detail=f"Product EAN '{product.ean}' already exists")
                raise HTTPException(status_code=422, detail=str(e))
    return row
