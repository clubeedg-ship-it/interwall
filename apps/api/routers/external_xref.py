"""
External Item Xref (marketplace SKU → build_code) endpoints for Interwall Inventory OS.

Schema (from 03_avl_build_schema.sql):
  external_item_xref(id UUID PK, marketplace TEXT, external_sku TEXT,
                     build_code TEXT FK→builds.build_code,
                     created_at TIMESTAMPTZ,
                     UNIQUE(marketplace, external_sku))

Decisions:
  D-019: external_item_xref is THE single SKU resolution table.
  D-033: authoritative — if build inactive/missing, /resolve returns 404.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/external-xref", tags=["external-xref"])


class XrefCreate(BaseModel):
    marketplace: str
    external_sku: str
    build_code: str


@router.get("")
def list_xrefs(
    marketplace: str | None = None,
    build_code: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    session=Depends(require_session),
):
    conditions = []
    params: list = []
    if marketplace:
        conditions.append("x.marketplace = %s")
        params.append(marketplace)
    if build_code:
        conditions.append("x.build_code = %s")
        params.append(build_code)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * per_page

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) AS total FROM external_item_xref x {where}",
                params,
            )
            total = cur.fetchone()["total"]
            cur.execute(
                f"""SELECT x.id, x.marketplace, x.external_sku, x.build_code, x.created_at,
                           b.name AS build_name, b.is_auto_generated
                    FROM external_item_xref x
                    JOIN builds b ON b.build_code = x.build_code
                    {where}
                    ORDER BY x.marketplace, x.external_sku
                    LIMIT %s OFFSET %s""",
                params + [per_page, offset],
            )
            rows = [dict(r) for r in cur.fetchall()]
    return {"items": rows, "total": total, "page": page, "per_page": per_page}


@router.post("", status_code=201)
def create_xref(body: XrefCreate, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify build exists
            cur.execute(
                "SELECT id FROM builds WHERE build_code = %s",
                (body.build_code,),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail=f"Build '{body.build_code}' not found")
            try:
                cur.execute(
                    """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
                       VALUES (%s, %s, %s)
                       RETURNING id, marketplace, external_sku, build_code, created_at""",
                    (body.marketplace, body.external_sku, body.build_code),
                )
                row = cur.fetchone()
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(
                        status_code=409,
                        detail=f"Mapping already exists for ({body.marketplace}, {body.external_sku})",
                    )
                raise
    return dict(row)


@router.delete("/{xref_id}", status_code=200)
def delete_xref(xref_id: str, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM external_item_xref WHERE id = %s RETURNING id",
                (xref_id,),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Xref mapping not found")
    return {"ok": True}


@router.get("/resolve")
def resolve_xref(
    marketplace: str = Query(...),
    sku: str = Query(...),
    session=Depends(require_session),
):
    """Resolve marketplace SKU to build_code. 404 if unmapped or build inactive (D-033)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT x.build_code, b.id AS build_id, b.is_active
                   FROM external_item_xref x
                   JOIN builds b ON b.build_code = x.build_code
                   WHERE x.marketplace = %s AND x.external_sku = %s""",
                (marketplace, sku),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No mapping found for this marketplace/SKU")
    if not row["is_active"]:
        raise HTTPException(status_code=404, detail="Build is inactive")
    return {"build_code": row["build_code"], "build_id": str(row["build_id"])}
