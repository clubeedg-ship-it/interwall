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

DRAFT_MARKER = "[DRAFT-UNRESOLVED-SKU]"


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
    """Create a (marketplace, external_sku) → build_code mapping.

    Upsert with draft cleanup: if the (marketplace, external_sku) pair already
    points at a draft Build (inactive + draft marker + zero components),
    that draft and its xref are atomically displaced and the mapping is
    repointed at body.build_code. If the existing mapping points at a
    non-draft Build, returns 409.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify target build exists
            cur.execute(
                "SELECT id FROM builds WHERE build_code = %s",
                (body.build_code,),
            )
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail=f"Build '{body.build_code}' not found")

            cur.execute(
                """SELECT x.id AS xref_id, x.build_code AS existing_code,
                          b.id AS existing_build_id, b.is_active, b.is_auto_generated,
                          b.description,
                          (SELECT COUNT(*) FROM build_components bc
                            WHERE bc.build_id = b.id) AS component_count
                     FROM external_item_xref x
                     JOIN builds b ON b.build_code = x.build_code
                    WHERE x.marketplace = %s AND x.external_sku = %s
                    FOR UPDATE""",
                (body.marketplace, body.external_sku),
            )
            existing = cur.fetchone()

            if existing and existing["existing_code"] != body.build_code:
                is_draft = (
                    existing["is_active"] is False
                    and existing["is_auto_generated"] is False
                    and existing["component_count"] == 0
                    and (existing["description"] or "").startswith(DRAFT_MARKER)
                )
                if not is_draft:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Mapping already exists for ({body.marketplace}, "
                            f"{body.external_sku}) → {existing['existing_code']}"
                        ),
                    )
                cur.execute(
                    "DELETE FROM external_item_xref WHERE id = %s",
                    (existing["xref_id"],),
                )
                cur.execute(
                    "DELETE FROM builds WHERE id = %s",
                    (existing["existing_build_id"],),
                )
            elif existing and existing["existing_code"] == body.build_code:
                cur.execute(
                    """SELECT id, marketplace, external_sku, build_code, created_at
                         FROM external_item_xref WHERE id = %s""",
                    (existing["xref_id"],),
                )
                return dict(cur.fetchone())

            cur.execute(
                """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
                   VALUES (%s, %s, %s)
                   RETURNING id, marketplace, external_sku, build_code, created_at""",
                (body.marketplace, body.external_sku, body.build_code),
            )
            row = cur.fetchone()
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
