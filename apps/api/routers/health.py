"""
Health observability surface (D-047, T-A09).

Replaces the simple ping with a comprehensive health roll-up.

Endpoints:
  GET /api/health                              → roll-up (authed)
  GET /api/health/ping                         → DB reachability (unauthed)
  GET /api/health/orphans/parts-without-shelf   → list
  GET /api/health/orphans/parts-without-reorder → list
  GET /api/health/orphans/builds-without-xref   → list
  GET /api/health/invariants/sales-without-ledger → list (must be empty)
  GET /api/health/ingestion/status              → per-marketplace status
"""
from fastapi import APIRouter, Depends
from auth import require_session
from db import get_conn

router = APIRouter(prefix="/api/health", tags=["health"])


_INGESTION_STATUS_SQL = """
    SELECT
        marketplace,
        MAX(CASE WHEN status = 'processed' THEN created_at END) AS last_ok_at,
        MAX(CASE WHEN status IN ('failed', 'dead_letter')
                 THEN created_at END) AS last_fail_at,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'
                           AND status = 'processed') AS processed_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'
                           AND status = 'failed') AS failed_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'
                           AND status = 'pending') AS pending_7d
    FROM ingestion_events
    WHERE marketplace IS NOT NULL
    GROUP BY marketplace
    ORDER BY marketplace
"""


def _format_ingestion_row(r: dict) -> dict:
    return {
        "marketplace": r["marketplace"],
        "last_ok_at": r["last_ok_at"].isoformat() if r["last_ok_at"] else None,
        "last_fail_at": r["last_fail_at"].isoformat() if r["last_fail_at"] else None,
        "last_7d_counts": {
            "processed": r["processed_7d"],
            "failed": r["failed_7d"],
            "pending": r["pending_7d"],
        },
    }


@router.get("/ping")
def ping():
    """Unauthenticated DB reachability check. For monitoring / Docker healthchecks."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    return {"status": "ok"}


@router.get("")
def health_rollup(session=Depends(require_session)):
    """Aggregated health status: orphan counts, invariant checks, ingestion."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM v_health_parts_without_shelf")
            parts_no_shelf = cur.fetchone()["n"]

            cur.execute("SELECT COUNT(*) AS n FROM v_health_parts_without_reorder")
            parts_no_reorder = cur.fetchone()["n"]

            cur.execute("SELECT COUNT(*) AS n FROM v_health_builds_without_xref")
            builds_no_xref = cur.fetchone()["n"]

            cur.execute("SELECT COUNT(*) AS n FROM v_health_sales_without_ledger")
            sales_no_ledger = cur.fetchone()["n"]

            cur.execute(_INGESTION_STATUS_SQL)
            ingestion_rows = cur.fetchall()

    return {
        "status": "ok",
        "orphans": {
            "parts_without_shelf": parts_no_shelf,
            "parts_without_reorder": parts_no_reorder,
            "builds_without_xref": builds_no_xref,
        },
        "invariants": {
            "sales_without_ledger": sales_no_ledger,
        },
        "ingestion": [_format_ingestion_row(r) for r in ingestion_rows],
    }


@router.get("/orphans/parts-without-shelf")
def orphans_parts_no_shelf(session=Depends(require_session)):
    """Products with no shelf-assigned stock lots."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT product_id, ean, name FROM v_health_parts_without_shelf ORDER BY name"
            )
            return [dict(r) for r in cur.fetchall()]


@router.get("/orphans/parts-without-reorder")
def orphans_parts_no_reorder(session=Depends(require_session)):
    """Products with no reorder point configured."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT product_id, ean, name FROM v_health_parts_without_reorder ORDER BY name"
            )
            return [dict(r) for r in cur.fetchall()]


@router.get("/orphans/builds-without-xref")
def orphans_builds_no_xref(session=Depends(require_session)):
    """Active non-trivial builds with no marketplace SKU mapping."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, build_code, name FROM v_health_builds_without_xref ORDER BY build_code"
            )
            return [dict(r) for r in cur.fetchall()]


@router.get("/invariants/sales-without-ledger")
def invariant_sales_no_ledger(session=Depends(require_session)):
    """Sale transactions with zero stock_ledger_entries rows. Should always be empty."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, product_ean, marketplace, order_reference, created_at
                   FROM v_health_sales_without_ledger
                   ORDER BY created_at DESC"""
            )
            return [dict(r) for r in cur.fetchall()]


@router.get("/ingestion/status")
def ingestion_status(session=Depends(require_session)):
    """Ingestion status per marketplace over the last 7 days."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(_INGESTION_STATUS_SQL)
            return [_format_ingestion_row(r) for r in cur.fetchall()]


@router.get("/ingestion/failed")
def ingestion_failed(session=Depends(require_session)):
    """Retryable failed ingestion events (retry_count < MAX_RETRIES). T-B05."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, source, marketplace, external_id,
                          retry_count, error_message, created_at
                     FROM v_health_ingestion_failed
                    ORDER BY created_at DESC"""
            )
            return [dict(r) for r in cur.fetchall()]


@router.get("/ingestion/dead-letter")
def ingestion_dead_letter(session=Depends(require_session)):
    """Dead-lettered ingestion events requiring operator action. T-B05."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, source, marketplace, external_id,
                          retry_count, error_message, dead_letter_reason, created_at
                     FROM v_health_ingestion_dead_letter
                    ORDER BY created_at DESC"""
            )
            return [dict(r) for r in cur.fetchall()]


@router.get("/ingestion/backorders")
def ingestion_backorders(session=Depends(require_session)):
    """Sales blocked on insufficient stock — the minimal backorder stream.

    Source: ingestion_events rows the worker routed to status='review' with an
    error_message mentioning 'insufficient stock' (see ingestion/worker.py
    `_is_stock_blocker_message`). The Profit page surfaces these in a
    Backorder tab so the operator can see orders that will book the moment
    replenishment lands.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, source, marketplace, external_id,
                          parsed_data, error_message, retry_count, created_at
                     FROM ingestion_events
                    WHERE status = 'review'
                      AND error_message ILIKE %s
                    ORDER BY created_at DESC""",
                (f"%insufficient stock%",),
            )
            rows = cur.fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        pd = d.get("parsed_data") or {}
        product = pd.get("product") if isinstance(pd.get("product"), dict) else {}
        offer = pd.get("offer") if isinstance(pd.get("offer"), dict) else {}
        d["product_ean"] = product.get("ean") or pd.get("ean")
        d["product_description"] = (
            pd.get("product_description") or pd.get("description")
        )
        qty = pd.get("quantity")
        try:
            d["quantity"] = int(qty) if qty is not None else None
        except (TypeError, ValueError):
            d["quantity"] = None
        total = pd.get("totalPrice") or pd.get("total_price")
        if total is None:
            unit = pd.get("price") or pd.get("unit_price")
            if unit is not None and qty is not None:
                try:
                    total = float(unit) * int(qty)
                except (TypeError, ValueError):
                    total = None
        try:
            d["total_price"] = float(total) if total is not None else None
        except (TypeError, ValueError):
            d["total_price"] = None
        d["sku"] = (
            offer.get("reference")
            or pd.get("sku")
            or pd.get("generated_sku")
        )
        out.append(d)
    return out
