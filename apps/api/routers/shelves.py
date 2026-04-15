"""Shelf/bin endpoints — list shelves, occupancy, and per-shelf config."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/shelves", tags=["shelves"])


class ShelfPatch(BaseModel):
    capacity: int | None = None
    split_fifo: bool | None = None
    single_bin: bool | None = None

    @field_validator("capacity")
    @classmethod
    def capacity_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("capacity must be a positive integer or null")
        return v


@router.get("")
def list_shelves(session=Depends(require_session)):
    """Return all shelves with zone name, sorted naturally."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT s.id, s.label, s.col, s.level, s.bin, s.capacity,
                          z.name AS zone_name
                   FROM shelves s
                   JOIN zones z ON z.id = s.zone_id
                   WHERE z.is_active = TRUE
                   ORDER BY z.name, s.col, s.level, s.bin NULLS FIRST"""
            )
            return [dict(r) for r in cur.fetchall()]


@router.get("/occupancy")
def shelf_occupancy(session=Depends(require_session)):
    """Per-shelf occupancy from v_shelf_occupancy (T-C02b).

    Returns one row per shelf with aggregated stock qty/value and
    primary product info.  The wall grid and bin-info modal consume
    this as the single source of truth for shelf stock.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM v_shelf_occupancy")
            rows = cur.fetchall()
            # Convert Decimal to float for JSON serialisation
            out = []
            for r in rows:
                d = dict(r)
                d["total_qty"] = int(d["total_qty"])
                d["total_value"] = float(d["total_value"])
                d["batch_count"] = int(d["batch_count"])
                out.append(d)
            return out


@router.patch("/{shelf_id}")
def patch_shelf(shelf_id: UUID, body: ShelfPatch, session=Depends(require_session)):
    """Update per-shelf settings (capacity, split_fifo, single_bin)."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(422, "at least one field required")

    set_parts = []
    values = []
    for field in ("capacity", "split_fifo", "single_bin"):
        if field in updates:
            set_parts.append(f"{field} = %s")
            values.append(updates[field])

    values.append(str(shelf_id))
    sql = (
        f"UPDATE shelves SET {', '.join(set_parts)} WHERE id = %s "
        "RETURNING id, capacity, split_fifo, single_bin"
    )

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, values)
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "shelf not found")
    return {
        "shelf_id": str(row["id"]),
        "capacity": row["capacity"],
        "split_fifo": row["split_fifo"],
        "single_bin": row["single_bin"],
    }
