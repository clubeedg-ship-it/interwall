"""
Fixed costs CRUD endpoints for Omiximo Inventory OS.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import get_conn
from auth import require_session

router = APIRouter(prefix="/api/fixed-costs", tags=["fixed-costs"])


class FixedCostUpdate(BaseModel):
    value: float
    is_percentage: bool


@router.get("")
def list_fixed_costs(session=Depends(require_session)):
    """List all fixed costs, ordered by name.
    Note: table starts empty; the frontend falls back to defaults if empty.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, value, is_percentage, updated_at "
                "FROM fixed_costs ORDER BY name"
            )
            return cur.fetchall()


@router.put("/{cost_id}")
def update_fixed_cost(cost_id: str, body: FixedCostUpdate, session=Depends(require_session)):
    """Update a fixed cost value and is_percentage flag."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE fixed_costs SET value = %s, is_percentage = %s, updated_at = NOW() "
                "WHERE id = %s RETURNING id",
                (body.value, body.is_percentage, cost_id),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Fixed cost '{cost_id}' not found")
    return {"ok": True}
