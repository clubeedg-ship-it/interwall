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
import re

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

    Each row is enriched with a `components` list: the build's parts (products
    or groups), each annotated with `needed_qty` (order qty × component qty),
    `on_hand_qty` (live v_part_stock roll-up; group stock = sum across its
    members), and `shortage`. Components with shortage > 0 are the "product
    lines for the zero-stock process" that the operator is waiting to
    replenish.
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

            _attach_backorder_components(cur, out)
    return out


def _attach_backorder_components(cur, rows: list[dict]) -> None:
    """Resolve each row's build and attach per-component needed/on_hand.

    Batched: one query to resolve marketplace+SKU → build_code via xref, one
    to fetch build_components for the resolved builds, one to compute on-hand
    per product, one to compute on-hand per group (sum across group members).
    """
    # 1) Build candidate (marketplace, external_sku) tuples per row.
    candidates_by_row: list[list[tuple[str, str]]] = []
    unique_pairs: set[tuple[str, str]] = set()
    for r in rows:
        mp = r.get("marketplace")
        pairs: list[tuple[str, str]] = []
        if mp:
            for key in (r.get("sku"), r.get("product_ean")):
                if key:
                    pair = (mp, key)
                    pairs.append(pair)
                    unique_pairs.add(pair)
        candidates_by_row.append(pairs)

    # 2) Resolve xref: (marketplace, external_sku) -> build_code
    xref_map: dict[tuple[str, str], str] = {}
    if unique_pairs:
        mps = [p[0] for p in unique_pairs]
        skus = [p[1] for p in unique_pairs]
        cur.execute(
            """SELECT marketplace, external_sku, build_code
                 FROM external_item_xref
                WHERE (marketplace, external_sku)
                      IN (SELECT UNNEST(%s::text[]), UNNEST(%s::text[]))""",
            (mps, skus),
        )
        for row in cur.fetchall():
            xref_map[(row["marketplace"], row["external_sku"])] = row["build_code"]

    # Attach build_code to each row (first candidate that resolves).
    for r, pairs in zip(rows, candidates_by_row):
        resolved = next((xref_map[p] for p in pairs if p in xref_map), None)
        r["build_code"] = resolved

    build_codes = [r["build_code"] for r in rows if r.get("build_code")]
    if not build_codes:
        for r in rows:
            r["components"] = []
        _attach_error_shortages(cur, rows)
        return

    # 3) Fetch build_components for all resolved builds.
    cur.execute(
        """SELECT b.build_code, bc.source_type, bc.quantity,
                  ig.id AS group_id, ig.name AS group_name, ig.code AS group_code,
                  p.id AS product_id, p.ean AS product_ean, p.name AS product_name
             FROM build_components bc
             JOIN builds b ON b.id = bc.build_id
             LEFT JOIN item_groups ig ON ig.id = bc.item_group_id
             LEFT JOIN products p ON p.id = bc.product_id
            WHERE b.build_code = ANY(%s)
              AND bc.valid_from <= NOW()
              AND bc.valid_to > NOW()""",
        (list(set(build_codes)),),
    )
    comps_by_build: dict[str, list[dict]] = {}
    product_ids: set[str] = set()
    group_ids: set[str] = set()
    for row in cur.fetchall():
        bc = dict(row)
        comps_by_build.setdefault(bc["build_code"], []).append(bc)
        if bc["source_type"] == "product" and bc["product_id"]:
            product_ids.add(str(bc["product_id"]))
        elif bc["source_type"] == "item_group" and bc["group_id"]:
            group_ids.add(str(bc["group_id"]))

    # 4) On-hand per product (v_part_stock.total_qty).
    on_hand_product: dict[str, int] = {}
    if product_ids:
        cur.execute(
            "SELECT product_id, total_qty FROM v_part_stock WHERE product_id = ANY(%s::uuid[])",
            (list(product_ids),),
        )
        for row in cur.fetchall():
            on_hand_product[str(row["product_id"])] = int(row["total_qty"] or 0)

    # 5) On-hand per group (sum across item_group_members).
    on_hand_group: dict[str, int] = {}
    if group_ids:
        cur.execute(
            """SELECT igm.item_group_id, COALESCE(SUM(ps.total_qty), 0) AS on_hand
                 FROM item_group_members igm
                 LEFT JOIN v_part_stock ps ON ps.product_id = igm.product_id
                WHERE igm.item_group_id = ANY(%s::uuid[])
                GROUP BY igm.item_group_id""",
            (list(group_ids),),
        )
        for row in cur.fetchall():
            on_hand_group[str(row["item_group_id"])] = int(row["on_hand"] or 0)

    # 6) Attach enriched component list per row.
    for r in rows:
        build_code = r.get("build_code")
        order_qty = r.get("quantity") or 1
        raw = comps_by_build.get(build_code, []) if build_code else []
        enriched = []
        for c in raw:
            component_qty = int(c["quantity"])
            needed = component_qty * order_qty
            if c["source_type"] == "product":
                pid = str(c["product_id"]) if c["product_id"] else None
                on_hand = on_hand_product.get(pid, 0) if pid else 0
                enriched.append({
                    "source_type": "product",
                    "id": pid,
                    "name": c["product_name"],
                    "code": c["product_ean"],
                    "component_qty": component_qty,
                    "needed_qty": needed,
                    "on_hand_qty": on_hand,
                    "shortage": max(0, needed - on_hand),
                })
            else:
                gid = str(c["group_id"]) if c["group_id"] else None
                on_hand = on_hand_group.get(gid, 0) if gid else 0
                enriched.append({
                    "source_type": "item_group",
                    "id": gid,
                    "name": c["group_name"],
                    "code": c["group_code"],
                    "component_qty": component_qty,
                    "needed_qty": needed,
                    "on_hand_qty": on_hand,
                    "shortage": max(0, needed - on_hand),
                })
        # Sort: shortages first (worst offenders top), then by name.
        enriched.sort(key=lambda x: (x["shortage"] == 0, (x["name"] or "").lower()))
        r["components"] = enriched

    # Fallback: any row whose components list is still empty (no xref match, or
    # build had zero components) gets shortage lines synthesized from the
    # error_message itself, so the UI always has at least one product line.
    _attach_error_shortages(cur, rows)


_SHORTAGE_RE = re.compile(
    r"insufficient stock for (group|product) ([0-9a-fA-F-]{36}), need (\d+), have (\d+)"
)


def _attach_error_shortages(cur, rows: list[dict]) -> None:
    """For rows with no resolved components, parse error_message for shortage
    lines and resolve the group/product name for display. Only touches rows
    where `components` is empty."""
    group_ids: set[str] = set()
    product_ids: set[str] = set()
    per_row: list[list[dict]] = []
    for r in rows:
        if r.get("components"):
            per_row.append([])
            continue
        msg = r.get("error_message") or ""
        hits = []
        for kind, uuid, need, have in _SHORTAGE_RE.findall(msg):
            entry = {
                "source_type": "item_group" if kind == "group" else "product",
                "id": uuid,
                "needed_qty": int(need),
                "on_hand_qty": int(have),
                "shortage": max(0, int(need) - int(have)),
            }
            if kind == "group":
                group_ids.add(uuid)
            else:
                product_ids.add(uuid)
            hits.append(entry)
        per_row.append(hits)

    name_by_group: dict[str, tuple[str, str]] = {}
    if group_ids:
        cur.execute(
            "SELECT id, name, code FROM item_groups WHERE id = ANY(%s::uuid[])",
            (list(group_ids),),
        )
        for row in cur.fetchall():
            name_by_group[str(row["id"])] = (row["name"], row["code"])

    name_by_product: dict[str, tuple[str, str]] = {}
    if product_ids:
        cur.execute(
            "SELECT id, name, ean FROM products WHERE id = ANY(%s::uuid[])",
            (list(product_ids),),
        )
        for row in cur.fetchall():
            name_by_product[str(row["id"])] = (row["name"], row["ean"])

    for r, hits in zip(rows, per_row):
        if r.get("components"):
            continue
        out = []
        for h in hits:
            if h["source_type"] == "item_group":
                nc = name_by_group.get(h["id"], (None, None))
            else:
                nc = name_by_product.get(h["id"], (None, None))
            out.append({
                **h,
                "name": nc[0],
                "code": nc[1],
                "component_qty": None,
            })
        r["components"] = out
