"""Shelf/bin endpoints — list shelves for dropdown population."""
from fastapi import APIRouter, Depends
from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/shelves", tags=["shelves"])


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
