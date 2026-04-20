"""
Builds (finished-product recipes) endpoints for Interwall Inventory OS.

Schema (from 03_avl_build_schema.sql):
  builds(id UUID PK, build_code TEXT UNIQUE, name TEXT, description TEXT,
         is_auto_generated BOOL, is_active BOOL, created_at, updated_at)
  build_components(id UUID PK, build_id UUID FK→builds,
                   source_type TEXT(item_group|product),
                   item_group_id UUID NULL, product_id UUID NULL,
                   quantity INT >0, valid_from TIMESTAMPTZ, valid_to TIMESTAMPTZ)

Decisions:
  D-013: builds / build_components, keyed by build_code.
  D-014: auto-assign BLD-NNN if no code given; code permanent after creation.
  D-015: valid_from/valid_to accept writes, unwired for filtering here.
  D-018: auto-generated builds — reject mutation/deletion with 409.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/builds", tags=["builds"])

DRAFT_MARKER = "[DRAFT-UNRESOLVED-SKU]"


class ComponentIn(BaseModel):
    source_type: str = Field(default="item_group")
    item_group_id: str | None = None
    product_id: str | None = None
    quantity: int = Field(gt=0)
    valid_from: str | None = None
    valid_to: str | None = None

    @model_validator(mode="after")
    def validate_source(self):
        if self.source_type not in {"item_group", "product"}:
            raise ValueError("source_type must be 'item_group' or 'product'")
        if self.source_type == "item_group":
            if not self.item_group_id or self.product_id is not None:
                raise ValueError("item_group source requires item_group_id and forbids product_id")
        if self.source_type == "product":
            if not self.product_id or self.item_group_id is not None:
                raise ValueError("product source requires product_id and forbids item_group_id")
        return self


class BuildCreate(BaseModel):
    build_code: str | None = None
    name: str | None = None
    description: str | None = None
    components: list[ComponentIn] = Field(default_factory=list)


class BuildUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


def _validate_component_reference(cur, comp: ComponentIn) -> None:
    if comp.source_type == "item_group":
        cur.execute("SELECT id FROM item_groups WHERE id = %s", (comp.item_group_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail=f"Item group '{comp.item_group_id}' not found")
        return

    cur.execute("SELECT id FROM products WHERE id = %s", (comp.product_id,))
    if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail=f"Product '{comp.product_id}' not found")


def _insert_component(cur, build_id: str, comp: ComponentIn) -> dict:
    _validate_component_reference(cur, comp)
    cur.execute(
        """INSERT INTO build_components (
               build_id, source_type, item_group_id, product_id, quantity, valid_from, valid_to
           ) VALUES (
               %s, %s, %s, %s, %s,
               COALESCE(%s::timestamptz, '-infinity'),
               COALESCE(%s::timestamptz, 'infinity')
           )
           RETURNING id, build_id, source_type, item_group_id, product_id,
                     quantity, valid_from, valid_to""",
        (
            build_id,
            comp.source_type,
            comp.item_group_id,
            comp.product_id,
            comp.quantity,
            comp.valid_from,
            comp.valid_to,
        ),
    )
    return dict(cur.fetchone())


@router.get("")
def list_builds(
    include_auto: bool = Query(False),
    draft_only: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    session=Depends(require_session),
):
    offset = (page - 1) * per_page
    conditions: list[str] = []
    params: list = []
    if not include_auto:
        conditions.append("b.is_auto_generated = FALSE")
    if draft_only:
        conditions.append("b.is_active = FALSE")
        conditions.append("b.description LIKE %s")
        params.append(f"{DRAFT_MARKER}%")
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) AS total FROM builds b {where}",
                params,
            )
            total = cur.fetchone()["total"]
            cur.execute(
                f"""SELECT b.id, b.build_code, b.name, b.description,
                           b.is_auto_generated, b.is_active, b.created_at,
                           (SELECT COUNT(*) FROM build_components bc WHERE bc.build_id = b.id) AS component_count,
                           (SELECT COUNT(*) FROM build_components bc
                             WHERE bc.build_id = b.id AND bc.source_type = 'item_group') AS item_group_component_count,
                           (SELECT COUNT(*) FROM build_components bc
                             WHERE bc.build_id = b.id AND bc.source_type = 'product') AS product_component_count,
                           (b.is_active = FALSE AND b.description LIKE %s) AS is_draft,
                           (SELECT x.marketplace
                              FROM external_item_xref x
                             WHERE x.build_code = b.build_code
                             ORDER BY x.created_at
                             LIMIT 1) AS draft_marketplace,
                           (SELECT x.external_sku
                              FROM external_item_xref x
                             WHERE x.build_code = b.build_code
                             ORDER BY x.created_at
                             LIMIT 1) AS draft_external_sku
                    FROM builds b
                    {where}
                    ORDER BY b.build_code
                    LIMIT %s OFFSET %s""",
                [f"{DRAFT_MARKER}%", *params, per_page, offset],
            )
            rows = [dict(r) for r in cur.fetchall()]
            cur.execute(
                """SELECT COUNT(*) AS draft_count
                     FROM builds b
                    WHERE b.is_active = FALSE
                      AND b.is_auto_generated = FALSE
                      AND b.description LIKE %s""",
                (f"{DRAFT_MARKER}%",),
            )
            draft_count = cur.fetchone()["draft_count"]
    return {
        "items": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
        "draft_count": draft_count,
    }


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
            components = []
            for comp in body.components:
                components.append(_insert_component(cur, build_id, comp))

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
                """SELECT bc.id, bc.source_type, bc.item_group_id, bc.product_id,
                          bc.quantity, bc.valid_from, bc.valid_to,
                          ig.name AS item_group_name, ig.code AS item_group_code,
                          p.ean AS product_ean, p.name AS product_name, p.sku AS product_sku
                   FROM build_components bc
                   LEFT JOIN item_groups ig ON ig.id = bc.item_group_id
                   LEFT JOIN products p ON p.id = bc.product_id
                   WHERE bc.build_id = %s
                   ORDER BY bc.valid_from, COALESCE(ig.name, p.name), bc.id""",
                (build["id"],),
            )
            components = [dict(r) for r in cur.fetchall()]
            draft_metadata = _load_draft_metadata(cur, build)
    result = dict(build)
    result["components"] = components
    result["draft_metadata"] = draft_metadata
    return result


def _load_draft_metadata(cur, build: dict) -> dict | None:
    """Return draft context (linked xref, sample parsed descriptions, pending review count)."""
    description = build.get("description") or ""
    if build.get("is_active") or not description.startswith(DRAFT_MARKER):
        return None
    marketplace = None
    external_sku = None
    for line in description.splitlines():
        if line.startswith("marketplace="):
            marketplace = line.split("=", 1)[1].strip() or None
        elif line.startswith("external_sku="):
            external_sku = line.split("=", 1)[1].strip() or None
    parsed_descriptions: list[str] = []
    pending_review_count = 0
    if marketplace and external_sku:
        cur.execute(
            """SELECT COUNT(*) AS cnt
                 FROM ingestion_events
                WHERE status = 'review'
                  AND marketplace = %s
                  AND (
                      parsed_data->>'sku' = %s
                      OR parsed_data->>'generated_sku' = %s
                      OR parsed_data->'offer'->>'reference' = %s
                      OR parsed_data->'product'->>'ean' = %s
                  )""",
            (marketplace, external_sku, external_sku, external_sku, external_sku),
        )
        pending_review_count = cur.fetchone()["cnt"]
        cur.execute(
            """SELECT DISTINCT parsed_data->>'product_description' AS description
                 FROM ingestion_events
                WHERE marketplace = %s
                  AND (
                      parsed_data->>'sku' = %s
                      OR parsed_data->>'generated_sku' = %s
                      OR parsed_data->'offer'->>'reference' = %s
                      OR parsed_data->'product'->>'ean' = %s
                  )
                  AND parsed_data->>'product_description' IS NOT NULL
                  AND parsed_data->>'product_description' <> ''
                ORDER BY description
                LIMIT 5""",
            (marketplace, external_sku, external_sku, external_sku, external_sku),
        )
        parsed_descriptions = [row["description"] for row in cur.fetchall() if row["description"]]
    return {
        "marketplace": marketplace,
        "external_sku": external_sku,
        "parsed_descriptions": parsed_descriptions,
        "pending_review_count": pending_review_count,
    }


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
            cur.execute("DELETE FROM build_components WHERE build_id = %s", (build_id,))
            components = []
            for comp in body.components:
                components.append(_insert_component(cur, build_id, comp))
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


class DraftCompleteBody(BaseModel):
    name: str | None = None
    description: str | None = None
    components: list[ComponentIn] = Field(default_factory=list)
    replay: bool = True


@router.post("/{build_code}/complete-draft")
def complete_draft(
    build_code: str,
    body: DraftCompleteBody,
    session=Depends(require_session),
):
    """Complete an unresolved-SKU draft Build: replace components, activate, replay
    linked review-status ingestion events for the xref's (marketplace, external_sku)."""
    if not body.components:
        raise HTTPException(status_code=400, detail="A completed Build needs at least one component")

    xrefs: list[dict] = []
    final_description: str | None = None
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, build_code, name, description, is_auto_generated, is_active
                     FROM builds WHERE build_code = %s
                     FOR UPDATE""",
                (build_code,),
            )
            build = cur.fetchone()
            if build is None:
                raise HTTPException(status_code=404, detail=f"Build '{build_code}' not found")
            if build["is_auto_generated"]:
                raise HTTPException(status_code=409, detail="Cannot complete an auto-generated build")
            current_description = build["description"] or ""
            if not current_description.startswith(DRAFT_MARKER):
                raise HTTPException(
                    status_code=409,
                    detail="Build is not a draft (missing draft marker)",
                )

            build_id = build["id"]
            cur.execute("DELETE FROM build_components WHERE build_id = %s", (build_id,))
            for comp in body.components:
                _insert_component(cur, build_id, comp)

            new_name = body.name if body.name is not None else build["name"]
            if body.description is not None:
                final_description = body.description
            else:
                lines = current_description.splitlines()
                stripped = [
                    ln for ln in lines
                    if not ln.startswith(DRAFT_MARKER)
                    and not ln.startswith("marketplace=")
                    and not ln.startswith("external_sku=")
                    and not ln.startswith("order_number=")
                    and "Add components and activate before replaying" not in ln
                    and "Draft created automatically from unresolved" not in ln
                ]
                final_description = "\n".join(stripped).strip() or None

            cur.execute(
                """UPDATE builds
                      SET name = %s,
                          description = %s,
                          is_active = TRUE,
                          updated_at = NOW()
                    WHERE id = %s""",
                (new_name, final_description, build_id),
            )

            cur.execute(
                """SELECT marketplace, external_sku
                     FROM external_item_xref
                    WHERE build_code = %s""",
                (build_code,),
            )
            xrefs = [dict(r) for r in cur.fetchall()]

    replay_summary = {
        "candidates": 0,
        "processed": 0,
        "review": 0,
        "failed": 0,
        "dead_letter": 0,
        "skipped": 0,
    }
    if body.replay and xrefs:
        replay_summary = _replay_review_events_for_xrefs(xrefs)

    return {
        "build_code": build_code,
        "name": new_name,
        "description": final_description,
        "is_active": True,
        "replay": replay_summary,
    }


def _replay_review_events_for_xrefs(xrefs: list[dict]) -> dict:
    """Reset review-status ingestion events linked to these xrefs, then re-run them."""
    from ingestion_worker import process_ingestion_event

    summary = {
        "candidates": 0,
        "processed": 0,
        "review": 0,
        "failed": 0,
        "dead_letter": 0,
        "skipped": 0,
    }
    event_ids: list[str] = []
    with get_conn() as conn:
        with conn.cursor() as cur:
            for x in xrefs:
                cur.execute(
                    """SELECT id
                         FROM ingestion_events
                        WHERE status = 'review'
                          AND marketplace = %s
                          AND (
                              parsed_data->>'sku' = %s
                              OR parsed_data->>'generated_sku' = %s
                              OR parsed_data->'offer'->>'reference' = %s
                              OR parsed_data->'product'->>'ean' = %s
                          )
                        FOR UPDATE SKIP LOCKED""",
                    (
                        x["marketplace"],
                        x["external_sku"],
                        x["external_sku"],
                        x["external_sku"],
                        x["external_sku"],
                    ),
                )
                ids = [str(r["id"]) for r in cur.fetchall()]
                event_ids.extend(ids)
            if event_ids:
                cur.execute(
                    """UPDATE ingestion_events
                          SET status = 'failed',
                              attempt_count = 0,
                              error_message = NULL,
                              dead_letter_reason = NULL
                        WHERE id = ANY(%s::uuid[])""",
                    (event_ids,),
                )

    summary["candidates"] = len(event_ids)
    for eid in event_ids:
        try:
            outcome = process_ingestion_event(eid)
        except Exception:
            summary["failed"] += 1
            continue
        if outcome in summary:
            summary[outcome] += 1
        else:
            summary["skipped"] += 1
    return summary


@router.delete("/{build_code}", status_code=200)
def delete_build(build_code: str, session=Depends(require_session)):
    """Cascade-delete a build: its components, SKU mappings, and sales/ledger
    routed through it. Parts catalog (products, item_groups, stock_lots) is
    NOT touched."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM builds WHERE build_code = %s",
                (build_code,),
            )
            build = cur.fetchone()
            if build is None:
                raise HTTPException(status_code=404, detail=f"Build '{build_code}' not found")
            cur.execute(
                """DELETE FROM stock_ledger_entries
                    WHERE transaction_id IN (
                        SELECT id FROM transactions WHERE build_code = %s
                    )""",
                (build_code,),
            )
            deleted_ledger = cur.rowcount
            cur.execute("DELETE FROM transactions WHERE build_code = %s", (build_code,))
            deleted_txns = cur.rowcount
            cur.execute("DELETE FROM external_item_xref WHERE build_code = %s", (build_code,))
            deleted_xrefs = cur.rowcount
            cur.execute("DELETE FROM build_components WHERE build_id = %s", (build["id"],))
            cur.execute("DELETE FROM builds WHERE build_code = %s", (build_code,))
    return {"ok": True, "cascaded": {"xrefs": deleted_xrefs, "transactions": deleted_txns, "ledger_entries": deleted_ledger}}
