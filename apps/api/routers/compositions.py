"""
EAN Composition CRUD endpoints for Interwall Inventory OS.
Full-replace PUT pattern: delete all rows for parent, insert new set atomically.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import get_conn
from auth import require_session

router = APIRouter(prefix="/api/compositions", tags=["compositions"])


class ComponentRow(BaseModel):
    component_ean: str
    quantity: int


@router.get("")
def list_all_compositions(session=Depends(require_session)):
    """Return all compositions grouped by parent product."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.ean AS parent_ean, p.name AS parent_name,
                          ec.component_ean, cp.name AS component_name, ec.quantity
                   FROM ean_compositions ec
                   JOIN products p ON p.ean = ec.parent_ean
                   JOIN products cp ON cp.ean = ec.component_ean
                   ORDER BY p.name, cp.name"""
            )
            rows = cur.fetchall()
    # Group by parent
    grouped = {}
    for r in rows:
        key = r['parent_ean']
        if key not in grouped:
            grouped[key] = {
                'parent_ean': r['parent_ean'],
                'parent_name': r['parent_name'],
                'components': []
            }
        grouped[key]['components'].append({
            'component_ean': r['component_ean'],
            'component_name': r['component_name'],
            'quantity': r['quantity']
        })
    return list(grouped.values())


@router.get("/{parent_ean}")
def get_composition(parent_ean: str, session=Depends(require_session)):
    """Return all component rows for a parent EAN, joined with component product name."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT ec.id, ec.component_ean, p.name AS component_name, ec.quantity "
                "FROM ean_compositions ec "
                "JOIN products p ON p.ean = ec.component_ean "
                "WHERE ec.parent_ean = %s "
                "ORDER BY p.name",
                (parent_ean,),
            )
            rows = cur.fetchall()
    return rows


@router.put("/{parent_ean}")
def replace_composition(
    parent_ean: str,
    components: list[ComponentRow],
    session=Depends(require_session),
):
    """
    Full-replace: atomically delete all existing rows for parent_ean,
    then insert the provided component list. Sends empty list to clear all.
    Also updates products.is_composite flag for the parent.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify parent product exists
            cur.execute("SELECT ean FROM products WHERE ean = %s", (parent_ean,))
            if cur.fetchone() is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Parent product EAN '{parent_ean}' not found in products table",
                )

            # Full-replace
            cur.execute(
                "DELETE FROM ean_compositions WHERE parent_ean = %s", (parent_ean,)
            )
            for c in components:
                try:
                    cur.execute(
                        "INSERT INTO ean_compositions (parent_ean, component_ean, quantity) "
                        "VALUES (%s, %s, %s)",
                        (parent_ean, c.component_ean, c.quantity),
                    )
                except Exception as e:
                    err = str(e).lower()
                    if "23503" in err or "foreign key" in err:
                        raise HTTPException(
                            status_code=422,
                            detail=f"Component EAN '{c.component_ean}' does not exist in products table",
                        )
                    if "23514" in err or "check" in err:
                        raise HTTPException(
                            status_code=422,
                            detail=f"Component EAN cannot equal parent EAN (circular reference)",
                        )
                    raise HTTPException(status_code=422, detail=str(e))

            # Update is_composite flag on parent
            cur.execute(
                "UPDATE products SET is_composite = %s WHERE ean = %s",
                (len(components) > 0, parent_ean),
            )
    return {"ok": True, "component_count": len(components)}
