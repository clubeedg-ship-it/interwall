"""
Item Groups (AVL substitute pools) endpoints for Interwall Inventory OS.

Schema (from 03_avl_build_schema.sql):
  item_groups(id UUID PK, code TEXT UNIQUE, name TEXT, description TEXT, created_at)
  item_group_members(id UUID PK, item_group_id UUID FK, product_id UUID FK,
                     priority INT DEFAULT 0, UNIQUE(item_group_id, product_id))

Decisions:
  D-012: item_groups / item_group_members is the AVL model.
  D-015: priority is schema-ready, unwired — accept writes, don't use for ordering.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/item-groups", tags=["item-groups"])


class ItemGroupCreate(BaseModel):
    name: str
    description: str | None = None


class ItemGroupUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class MemberAttach(BaseModel):
    product_id: str
    priority: int = 0


@router.get("")
def list_item_groups(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    session=Depends(require_session),
):
    offset = (page - 1) * per_page
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS total FROM item_groups",
            )
            total = cur.fetchone()["total"]
            cur.execute(
                """SELECT id, code, name, description, created_at
                   FROM item_groups
                   ORDER BY name
                   LIMIT %s OFFSET %s""",
                (per_page, offset),
            )
            rows = [dict(r) for r in cur.fetchall()]
    return {"items": rows, "total": total, "page": page, "per_page": per_page}


@router.post("", status_code=201)
def create_item_group(body: ItemGroupCreate, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Auto-generate code from name (slugified)
            code = body.name.strip().lower().replace(" ", "_")
            try:
                cur.execute(
                    """INSERT INTO item_groups (name, code, description)
                       VALUES (%s, %s, %s)
                       RETURNING id, code, name, description, created_at""",
                    (body.name, code, body.description),
                )
                row = cur.fetchone()
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(status_code=409, detail="Item group with this name/code already exists")
                raise
    return dict(row)


@router.get("/{group_id}")
def get_item_group(group_id: str, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, code, name, description, created_at
                   FROM item_groups WHERE id = %s""",
                (group_id,),
            )
            group = cur.fetchone()
            if group is None:
                raise HTTPException(status_code=404, detail="Item group not found")
            cur.execute(
                """SELECT igm.id, igm.product_id, igm.priority, igm.item_group_id,
                          p.ean, p.name AS product_name
                   FROM item_group_members igm
                   JOIN products p ON p.id = igm.product_id
                   WHERE igm.item_group_id = %s
                   ORDER BY igm.priority, p.name""",
                (group_id,),
            )
            members = [dict(r) for r in cur.fetchall()]
    result = dict(group)
    result["members"] = members
    return result


@router.patch("/{group_id}")
def update_item_group(group_id: str, body: ItemGroupUpdate, session=Depends(require_session)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [group_id]
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE item_groups SET {set_clause} WHERE id = %s RETURNING id, code, name, description",
                values,
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Item group not found")
    return dict(row)


@router.delete("/{group_id}", status_code=200)
def delete_item_group(group_id: str, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check if any build_components reference this group
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM build_components WHERE item_group_id = %s",
                (group_id,),
            )
            if cur.fetchone()["cnt"] > 0:
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete: item group is referenced by build components",
                )
            cur.execute(
                "DELETE FROM item_groups WHERE id = %s RETURNING id",
                (group_id,),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Item group not found")
    return {"ok": True}


@router.post("/{group_id}/members", status_code=201)
def attach_member(group_id: str, body: MemberAttach, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify group exists
            cur.execute("SELECT id FROM item_groups WHERE id = %s", (group_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Item group not found")
            # Verify product exists
            cur.execute("SELECT id FROM products WHERE id = %s", (body.product_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Product not found")
            try:
                cur.execute(
                    """INSERT INTO item_group_members (item_group_id, product_id, priority)
                       VALUES (%s, %s, %s)
                       RETURNING id, item_group_id, product_id, priority""",
                    (group_id, body.product_id, body.priority),
                )
                row = cur.fetchone()
            except Exception as e:
                if "unique" in str(e).lower():
                    raise HTTPException(status_code=409, detail="Product already in this group")
                raise
    return dict(row)


@router.delete("/{group_id}/members/{product_id}", status_code=200)
def detach_member(group_id: str, product_id: str, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check: would detaching leave an orphan?
            # If any build references this group AND this product has stock_lots,
            # detaching might leave builds unable to fulfil.
            cur.execute(
                """SELECT EXISTS (
                       SELECT 1 FROM build_components bc
                       JOIN builds b ON b.id = bc.build_id AND b.is_active = TRUE
                       WHERE bc.item_group_id = %s
                   ) AS has_builds""",
                (group_id,),
            )
            has_builds = cur.fetchone()["has_builds"]
            if has_builds:
                # Check if this is the last member
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM item_group_members WHERE item_group_id = %s",
                    (group_id,),
                )
                member_count = cur.fetchone()["cnt"]
                if member_count <= 1:
                    raise HTTPException(
                        status_code=409,
                        detail="Cannot detach: this is the last member and active builds reference this group",
                    )
            cur.execute(
                """DELETE FROM item_group_members
                   WHERE item_group_id = %s AND product_id = %s
                   RETURNING id""",
                (group_id, product_id),
            )
            row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Member not found in this group")
    return {"ok": True}
