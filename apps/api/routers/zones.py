"""Zone topology endpoints (D-040, D-045).

Single source of truth for the wall grid topology. The frontend used to
persist zones in localStorage; T-C03 hoists the list and the per-zone
column/level counts onto the backend. Column/level counts are derived
from the shelves that belong to the zone, so they cannot drift from the
actual rack geometry.

Routes:
  GET   /api/zones                 — list active zones + shelf-derived cols/levels
  POST  /api/zones                 — create a zone
  POST  /api/zones/{zone_id}/shelves — create a single shelf inside a zone
  PATCH /api/zones/{zone_id}       — rename / activate / deactivate a zone
  DELETE /api/zones/{zone_id}      — delete a zone when empty of live stock
"""
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from psycopg2.errors import UniqueViolation
from pydantic import BaseModel, Field, field_validator, model_validator

from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/zones", tags=["zones"])


class ZoneTemplateCreate(BaseModel):
    cols: int = Field(..., ge=1, le=26)
    levels: int = Field(..., ge=1, le=26)
    split_bins: bool
    single_bin_cols: list[int] = Field(default_factory=list)
    default_capacity: int | None = None

    @field_validator("default_capacity")
    @classmethod
    def capacity_positive(cls, v: int | None):
        if v is not None and v <= 0:
            raise ValueError("default_capacity must be > 0 or null")
        return v

    @model_validator(mode="after")
    def validate_template(self):
        if len(set(self.single_bin_cols)) != len(self.single_bin_cols):
            raise ValueError("single_bin_cols entries must be unique")
        if not self.split_bins and self.single_bin_cols:
            raise ValueError("single_bin_cols requires split_bins=true")
        for idx, col in enumerate(self.single_bin_cols):
            if not 1 <= col <= self.cols:
                raise ValueError(
                    f"single_bin_cols[{idx}]={col} exceeds cols={self.cols}"
                )
        return self


class ZoneCreate(BaseModel):
    name: str = Field(..., min_length=1)
    is_active: bool = True
    template: ZoneTemplateCreate | None = None


class ZonePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None


class ZoneShelfCreate(BaseModel):
    col: int = Field(..., ge=1, le=26)
    level: int = Field(..., ge=1, le=26)
    bin: str | None = None
    capacity: int | None = None
    split_fifo: bool = False
    single_bin: bool = False

    @field_validator("bin")
    @classmethod
    def validate_bin(cls, v: str | None):
        if v not in {None, "A", "B"}:
            raise ValueError("bin must be 'A', 'B', or null")
        return v

    @field_validator("capacity")
    @classmethod
    def capacity_positive(cls, v: int | None):
        if v is not None and v <= 0:
            raise ValueError("capacity must be a positive integer or null")
        return v

    @model_validator(mode="after")
    def validate_single_bin(self):
        if self.single_bin and self.bin is not None:
            raise ValueError("single_bin=true requires bin=null")
        return self


def _build_zone_response(
    zone_id: UUID,
    name: str,
    is_active: bool,
    template: ZoneTemplateCreate | None = None,
    shelves_count: int = 0,
) -> dict[str, Any]:
    payload = {
        "id": str(zone_id),
        "name": name,
        "cols": template.cols if template else 0,
        "levels": template.levels if template else 0,
        "shelves_count": shelves_count,
        "is_active": is_active,
    }
    if template:
        payload["template_applied"] = template.model_dump()
    return payload


def _shelf_label(zone_name: str, col: int, level: int, bin_code: str | None) -> str:
    return f"{zone_name}-{col:02d}-{level}{f'-{bin_code}' if bin_code else ''}"


def _materialized_shelves(
    zone_id: UUID,
    zone_name: str,
    template: ZoneTemplateCreate,
) -> list[tuple[str, UUID, int, int, str, str | None, int | None, bool, bool]]:
    shelves = []
    solid_cols = set(template.single_bin_cols)
    for col in range(1, template.cols + 1):
        for level in range(1, template.levels + 1):
            base_label = _shelf_label(zone_name, col, level, None)
            if col in solid_cols or not template.split_bins:
                shelves.append(
                    (
                        str(uuid4()),
                        zone_id,
                        col,
                        level,
                        base_label,
                        None,
                        template.default_capacity,
                        False,
                        col in solid_cols,
                    )
                )
                continue
            for bin_code in ("A", "B"):
                shelves.append(
                    (
                        str(uuid4()),
                        zone_id,
                        col,
                        level,
                        f"{base_label}-{bin_code}",
                        bin_code,
                        template.default_capacity,
                        False,
                        False,
                    )
                )
    return shelves


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
            shelves_count = 0
            if body.template is not None:
                shelf_rows = _materialized_shelves(
                    row["id"],
                    row["name"],
                    body.template,
                )
                shelves_count = len(shelf_rows)
                cur.executemany(
                    """INSERT INTO shelves
                         (id, zone_id, col, level, label, bin, capacity, split_fifo, single_bin)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    shelf_rows,
                )
    return _build_zone_response(
        row["id"],
        row["name"],
        row["is_active"],
        template=body.template,
        shelves_count=shelves_count,
    )


@router.post("/{zone_id}/shelves", status_code=201)
def create_zone_shelf(
    zone_id: UUID,
    body: ZoneShelfCreate,
    session=Depends(require_session),
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name FROM zones WHERE id = %s FOR UPDATE",
                (str(zone_id),),
            )
            zone = cur.fetchone()
            if zone is None:
                raise HTTPException(404, "zone not found")
            label = _shelf_label(zone["name"], body.col, body.level, body.bin)
            try:
                cur.execute(
                    """INSERT INTO shelves
                         (id, zone_id, col, level, label, bin, capacity, split_fifo, single_bin)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       RETURNING id, zone_id, col, level, label, bin, capacity, split_fifo, single_bin""",
                    (
                        str(uuid4()),
                        str(zone_id),
                        body.col,
                        body.level,
                        label,
                        body.bin,
                        body.capacity,
                        body.split_fifo,
                        body.single_bin,
                    ),
                )
            except UniqueViolation:
                raise HTTPException(409, f"shelf {label} already exists")
            row = cur.fetchone()
    return {
        "id": str(row["id"]),
        "zone_id": str(row["zone_id"]),
        "col": row["col"],
        "level": row["level"],
        "bin": row["bin"],
        "label": row["label"],
        "capacity": row["capacity"],
        "split_fifo": row["split_fifo"],
        "single_bin": row["single_bin"],
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


@router.delete("/{zone_id}")
def delete_zone(zone_id: UUID, session=Depends(require_session)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM zones WHERE id = %s FOR UPDATE",
                (str(zone_id),),
            )
            zone = cur.fetchone()
            if zone is None:
                raise HTTPException(404, "zone not found")

            cur.execute(
                """SELECT id, label
                   FROM shelves
                   WHERE zone_id = %s
                   ORDER BY col, level, bin NULLS FIRST
                   FOR UPDATE""",
                (str(zone_id),),
            )
            shelves = cur.fetchall()

            cur.execute(
                """SELECT DISTINCT s.label, s.col, s.level, s.bin
                   FROM shelves s
                   JOIN stock_lots sl ON sl.shelf_id = s.id
                   WHERE s.zone_id = %s
                     AND sl.quantity > 0
                   ORDER BY s.col, s.level, s.bin NULLS FIRST""",
                (str(zone_id),),
            )
            shelves_with_stock = [row["label"] for row in cur.fetchall()]
            if shelves_with_stock:
                return JSONResponse(
                    status_code=409,
                    content={
                        "detail": "zone has stock; drain first",
                        "shelves_with_stock": shelves_with_stock,
                    },
                )

            cur.execute("DELETE FROM zones WHERE id = %s", (str(zone_id),))
    return {"ok": True, "deleted_shelves": len(shelves)}
