"""Zone topology endpoints (D-040, D-045).

Single source of truth for the wall grid topology. The frontend used to
persist zones in localStorage; T-C03 hoists the list and the per-zone
column/level counts onto the backend. Column/level counts are derived
from the shelves that belong to the zone, so they cannot drift from the
actual rack geometry.

Routes:
  GET   /api/zones                 — list active zones + shelf-derived cols/levels
  POST  /api/zones                 — create a zone
  PATCH /api/zones/{zone_id}       — rename / activate / deactivate a zone

No DELETE route in this packet — zone removal cascades into shelves and
needs a separate design pass.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2.errors import UniqueViolation
from pydantic import BaseModel, Field

from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/zones", tags=["zones"])


class ZoneCreate(BaseModel):
    name: str = Field(..., min_length=1)
    is_active: bool = True


class ZonePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None


@router.get("")
def list_zones(session=Depends(require_session)):
    """Active zones with shelf-derived column/level counts."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT z.id,
                          z.name,
                          COALESCE(MAX(s.col), 0)   AS cols,
                          COALESCE(MAX(s.level), 0) AS levels,
                          COUNT(s.id)               AS shelves_count
                   FROM zones z
                   LEFT JOIN shelves s ON s.zone_id = z.id
                   WHERE z.is_active = TRUE
                   GROUP BY z.id, z.name
                   ORDER BY z.name"""
            )
            return [
                {
                    "id": str(r["id"]),
                    "name": r["name"],
                    "cols": int(r["cols"]),
                    "levels": int(r["levels"]),
                    "shelves_count": int(r["shelves_count"]),
                }
                for r in cur.fetchall()
            ]


@router.post("", status_code=201)
def create_zone(body: ZoneCreate, session=Depends(require_session)):
    """Create a zone in the primary warehouse. 409 on duplicate name."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM warehouses ORDER BY id LIMIT 1 FOR UPDATE")
            wh = cur.fetchone()
            if not wh:
                raise HTTPException(500, "no warehouse configured")
            # zones.columns / zones.levels are NOT NULL with CHECK > 0 in the
            # legacy schema. T-C03 derives the live grid from shelf rows, so
            # these legacy fields are placeholders — 1 satisfies the check.
            try:
                cur.execute(
                    """INSERT INTO zones
                         (warehouse_id, name, columns, levels, is_active)
                       VALUES (%s, %s, 1, 1, %s)
                       RETURNING id, name, is_active""",
                    (wh["id"], body.name, body.is_active),
                )
            except UniqueViolation:
                raise HTTPException(409, f"zone {body.name!r} already exists")
            row = cur.fetchone()
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "cols": 0,
        "levels": 0,
        "shelves_count": 0,
        "is_active": row["is_active"],
    }


@router.patch("/{zone_id}")
def patch_zone(zone_id: UUID, body: ZonePatch, session=Depends(require_session)):
    """Rename or toggle is_active. 404 on missing, 422 on empty body."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(422, "at least one of name, is_active is required")

    set_parts = []
    values: list = []
    for field in ("name", "is_active"):
        if field in updates:
            set_parts.append(f"{field} = %s")
            values.append(updates[field])
    values.append(str(zone_id))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM zones WHERE id = %s FOR UPDATE",
                (str(zone_id),),
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "zone not found")
            try:
                cur.execute(
                    f"UPDATE zones SET {', '.join(set_parts)} WHERE id = %s "
                    "RETURNING id, name, is_active",
                    values,
                )
            except UniqueViolation:
                raise HTTPException(409, "zone name already exists")
            row = cur.fetchone()
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "is_active": row["is_active"],
    }
