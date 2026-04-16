"""Category CRUD endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryIn(BaseModel):
    name: str
    description: str = ""
    parent_id: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    parent_id: str | None = None


@router.get("")
def list_categories(session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, description, parent_id FROM categories ORDER BY name")
            return [dict(r) for r in cur.fetchall()]


@router.post("", status_code=201)
def create_category(body: CategoryIn, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO categories (name, description, parent_id)
                   VALUES (%s, %s, %s) RETURNING id, name""",
                (body.name, body.description, body.parent_id)
            )
            row = cur.fetchone()
            return dict(row)


@router.patch("/{category_id}")
def update_category(category_id: str, body: CategoryUpdate, session=Depends(require_session)):
    """Partial update — only provided fields change. Follows products.py pattern."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [category_id]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE categories SET {set_clause} WHERE id = %s "
                f"RETURNING id, name, description, parent_id",
                values,
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="category not found")
    return dict(row)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: str, session=Depends(require_session)):
    """Hard-delete a category. Returns 409 if products still reference it."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*)::int AS n FROM products WHERE category_id = %s",
                (category_id,),
            )
            n = cur.fetchone()["n"]
            if n > 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"category is in use by {n} part(s)",
                )
            cur.execute(
                "DELETE FROM categories WHERE id = %s RETURNING id",
                (category_id,),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="category not found")
