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
