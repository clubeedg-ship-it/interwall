"""
Builds (finished-product recipes) endpoints for Interwall Inventory OS.

Schema (from 03_avl_build_schema.sql):
  builds(id UUID PK, build_code TEXT UNIQUE, name TEXT, description TEXT,
         is_auto_generated BOOL, is_active BOOL, created_at, updated_at)
  build_components(id UUID PK, build_id UUID FK→builds, item_group_id UUID FK→item_groups,
                   quantity INT >0, valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ,
                   UNIQUE(build_id, item_group_id, valid_from))

Decisions:
  D-013: builds / build_components, keyed by build_code.
  D-014: auto-assign BLD-NNN if no code given; code permanent after creation.
  D-015: valid_from/valid_to accept writes, unwired for filtering here.
  D-018: auto-generated builds — reject mutation/deletion with 409.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/builds", tags=["builds"])


class ComponentIn(BaseModel):
    item_group_id: str
    quantity: int
    valid_from: str | None = None
    valid_to: str | None = None


class BuildCreate(BaseModel):
    build_code: str | None = None
    name: str | None = None
    description: str | None = None
    components: list[ComponentIn] = []


class BuildUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


@router.get("")
def list_builds(
    include_auto: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    session=Depends(require_session),
):
    offset = (page - 1) * per_page
    where = "" if include_auto else "WHERE b.is_auto_generated = FALSE"
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS total FROM builds b {where}")
            total = cur.fetchone()["total"]
            cur.execute(
                f"""SELECT b.id, b.build_code, b.name, b.description,
                           b.is_auto_generated, b.is_active, b.created_at,
                           (SELECT COUNT(*) FROM build_components bc WHERE bc.build_id = b.id) AS component_count
                    FROM builds b
                    {where}
                    ORDER BY b.build_code
                    LIMIT %s OFFSET %s""",
                (per_page, offset),
            )
            rows = [dict(r) for r in cur.fetchall()]
    return {"items": rows, "total": total, "page": page, "per_page": per_page}


@router.post("", status_code=201)
def create_build(body: BuildCreate, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Auto-assign BLD-NNN if no code provided (D-014)
            build_code = body.build_code
            if not build_code:
                cur.execute("SELECT nextval('builds_code_seq') AS seq")
                seq = cur.fetchone()["seq"]
                build_code = f"BLD-{seq:03d}"
            try:
                cur.execute(
                    """INSERT INTO builds (build_code, name, description)
                       VALUES (%s, %s, %s)
                       RETURNING id, build_code, name, description,
                                 is_auto_generated, is_active, created_at""",
                    (build_code, body.name, body.description),
                )
                build_row = cur.fetchone()
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(status_code=409, detail=f"Build code '{build_code}' already exists")
                raise

            build_id = build_row["id"]
            # Insert components
            components = []
            for comp in body.components:
                # Verify item_group exists
                cur.execute("SELECT id FROM item_groups WHERE id = %s", (comp.item_group_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail=f"Item group '{comp.item_group_id}' not found")
                cur.execute(
                    """INSERT INTO build_components (build_id, item_group_id, quantity, valid_from, valid_to)
                       VALUES (%s, %s, %s,
                               COALESCE(%s::timestamptz, '-infinity'),
                               COALESCE(%s::timestamptz, 'infinity'))
                       RETURNING id, build_id, item_group_id, quantity, valid_from, valid_to""",
                    (build_id, comp.item_group_id, comp.quantity,
                     comp.valid_from, comp.valid_to),
                )
                components.append(dict(cur.fetchone()))

    result = dict(build_row)
    result["components"] = components
    return result


@router.get("/{build_code}")
def get_build(build_code: str, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, build_code, name, description,
                          is_auto_generated, is_active, created_at, updated_at
                   FROM builds WHERE build_code = %s""",
                (build_code,),
            )
            build = cur.fetchone()
            if build is None:
                raise HTTPException(status_code=404, detail=f"Build '{build_code}' not found")
            cur.execute(
                """SELECT bc.id, bc.item_group_id, bc.quantity, bc.valid_from, bc.valid_to,
                          ig.name AS item_group_name, ig.code AS item_group_code
                   FROM build_components bc
                   JOIN item_groups ig ON ig.id = bc.item_group_id
                   WHERE bc.build_id = %s
                   ORDER BY ig.name""",
                (build["id"],),
            )
            components = [dict(r) for r in cur.fetchall()]
    result = dict(build)
    result["components"] = components
    return result


@router.put("/{build_code}")
def replace_components(build_code: str, body: BuildCreate, session=Depends(require_session)):
    """Full-replace of components for a build. Atomic."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, is_auto_generated FROM builds WHERE build_code = %s",
                (build_code,),
            )
            build = cur.fetchone()
            if build is None:
                raise HTTPException(status_code=404, detail=f"Build '{build_code}' not found")
            if build["is_auto_generated"]:
                raise HTTPException(status_code=409, detail="Cannot modify auto-generated build")

            build_id = build["id"]
            # Delete existing components and replace
            cur.execute("DELETE FROM build_components WHERE build_id = %s", (build_id,))
            components = []
            for comp in body.components:
                cur.execute("SELECT id FROM item_groups WHERE id = %s", (comp.item_group_id,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail=f"Item group '{comp.item_group_id}' not found")
                cur.execute(
                    """INSERT INTO build_components (build_id, item_group_id, quantity, valid_from, valid_to)
                       VALUES (%s, %s, %s,
                               COALESCE(%s::timestamptz, '-infinity'),
                               COALESCE(%s::timestamptz, 'infinity'))
                       RETURNING id, build_id, item_group_id, quantity, valid_from, valid_to""",
                    (build_id, comp.item_group_id, comp.quantity,
                     comp.valid_from, comp.valid_to),
                )
                components.append(dict(cur.fetchone()))
            cur.execute(
                "UPDATE builds SET updated_at = NOW() WHERE id = %s", (build_id,),
            )
    return {"build_code": build_code, "components": components}


@router.patch("/{build_code}")
def update_build(build_code: str, body: BuildUpdate, session=Depends(require_session)):
    """Update name/description only. Rejects auto-generated builds."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, is_auto_generated FROM builds WHERE build_code = %s",
                (build_code,),
            )
            build = cur.fetchone()
            if build is None:
                raise HTTPException(status_code=404, detail=f"Build '{build_code}' not found")
            if build["is_auto_generated"]:
                raise HTTPException(status_code=409, detail="Cannot modify auto-generated build")

            updates = {k: v for k, v in body.model_dump().items() if v is not None}
            if not updates:
                raise HTTPException(status_code=400, detail="No fields to update")
            set_clause = ", ".join(f"{k} = %s" for k in updates)
            values = list(updates.values()) + [build_code]
            cur.execute(
                f"""UPDATE builds SET {set_clause}, updated_at = NOW()
                    WHERE build_code = %s
                    RETURNING id, build_code, name, description, is_auto_generated, is_active""",
                values,
            )
            row = cur.fetchone()
    return dict(row)


@router.delete("/{build_code}", status_code=200)
def delete_build(build_code: str, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, is_auto_generated FROM builds WHERE build_code = %s",
                (build_code,),
            )
            build = cur.fetchone()
            if build is None:
                raise HTTPException(status_code=404, detail=f"Build '{build_code}' not found")
            if build["is_auto_generated"]:
                raise HTTPException(status_code=409, detail="Cannot delete auto-generated build")
            # Check references from external_item_xref
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM external_item_xref WHERE build_code = %s",
                (build_code,),
            )
            if cur.fetchone()["cnt"] > 0:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: build is referenced by external SKU mappings",
                )
            # Check references from transactions
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM transactions WHERE build_code = %s",
                (build_code,),
            )
            if cur.fetchone()["cnt"] > 0:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: build is referenced by transactions",
                )
            cur.execute(
                "DELETE FROM builds WHERE build_code = %s RETURNING id",
                (build_code,),
            )
    return {"ok": True}
