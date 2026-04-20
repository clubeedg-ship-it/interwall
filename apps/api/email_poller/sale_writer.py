"""
Sale processing writer — Build-only routing for new sales (T-A08, T-D05).

Routing order (D-019, D-033):
  1. external_item_xref(marketplace, sku) → build_code
     Hit + active build → process_bom_sale
     Hit + inactive build → RAISE (D-033)
  2. sku_aliases / products.ean / products.sku → EAN
     EAN has active build (build_code = EAN from T-A03 backfill) → process_bom_sale
  3. No build reachable → RAISE
"""

import logging
import re
from contextlib import nullcontext
from db import get_conn
from email_poller.parsers.base import OrderData

logger = logging.getLogger("email_poller.sale_writer")

_DRAFT_MARKER = "[DRAFT-UNRESOLVED-SKU]"


class DraftBuildPendingError(RuntimeError):
    """Unresolved email SKU captured as a draft build awaiting operator completion."""

    def __init__(self, marketplace: str, sku: str, build_code: str):
        self.marketplace = marketplace
        self.sku = sku
        self.build_code = build_code
        super().__init__(
            f"Draft build pending for marketplace={marketplace}, sku={sku}, build={build_code}"
        )


def _normalize_description(value: str) -> str:
    value = (value or "").strip().lower()
    if not value:
        return ""
    value = value.replace("™", "")
    value = value.replace("®", "")
    value = value.replace("–", "-")
    value = value.replace("—", "-")
    value = value.replace("win11 pro", "windows 11 pro")
    value = value.replace("win 11 pro", "windows 11 pro")
    value = value.replace(" go ", " gb ")
    value = value.replace(" to ", " tb ")
    value = re.sub(r"\s+", " ", value)
    return value


def _normalize_catalog_name(value: str) -> str:
    value = _normalize_description(value)
    value = re.sub(r"[^\w\s]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _extract_description_signature(value: str) -> tuple[str, str, str, int, int, str]:
    text = _normalize_description(value).upper()

    cpu_family = ""
    cpu_tier = ""
    cpu_model = ""
    ram_gb = 0
    storage_gb = 0
    gpu = ""

    cpu_match = re.search(r"RYZEN\s*([3579])(?:[- ]?(\d{4}[A-Z]*))?", text)
    if cpu_match:
        cpu_family = "R"
        cpu_tier = cpu_match.group(1)
        cpu_model = cpu_match.group(2) or ""
    else:
        intel_match = re.search(r"INTEL(?:\s*CORE)?\s*I([3579])(?:[- ]?(\d{4,5}[A-Z]*))?", text)
        if intel_match:
            cpu_family = "I"
            cpu_tier = intel_match.group(1)
            cpu_model = intel_match.group(2) or ""
        elif "INTEL N" in text or "N-SERIES" in text or re.search(r"\bN95\b", text):
            cpu_family = "N"
            cpu_model = "N95" if "N95" in text else ""

    for pattern in (
        r"RAM\s*(\d+)\s*GB",
        r"(\d+)\s*GB\s*(?:DDR4|DDR5|RAM)",
        r"-\s*(\d+)\s*GB\s*-",
    ):
        ram_match = re.search(pattern, text)
        if ram_match:
            ram_gb = int(ram_match.group(1))
            break

    tb_match = re.search(r"(\d+)\s*TB\b", text)
    if tb_match:
        storage_gb = int(tb_match.group(1)) * 1000
    else:
        ssd_match = re.search(r"(\d+)\s*GB\s*SSD", text)
        if ssd_match:
            storage_gb = int(ssd_match.group(1))
        else:
            for value_match in re.findall(r"(\d+)\s*GB\b", text):
                candidate = int(value_match)
                if candidate not in {8, 12, 16, 24, 32, 64}:
                    storage_gb = candidate
                    break

    for gpu_pattern, gpu_prefix in ((r"RTX\s*(\d{4})", "RTX"), (r"GTX\s*(\d{3,4})", "GTX")):
        gpu_match = re.search(gpu_pattern, text)
        if gpu_match:
            gpu = f"{gpu_prefix}{gpu_match.group(1)}"
            break
    if not gpu:
        if "RX VEGA 11" in text:
            gpu = "VEGA11"
        elif "RX VEGA 8" in text:
            gpu = "VEGA8"
        elif "RX VEGA 7" in text:
            gpu = "VEGA7"
        elif "UHD GRAPHICS" in text:
            gpu = "UHD"

    return (cpu_family, cpu_tier, cpu_model, ram_gb, storage_gb, gpu)


def _relax_signature(
    signature: tuple[str, str, str, int, int, str],
) -> tuple[str, str, int, int, str]:
    cpu_family, cpu_tier, _cpu_model, ram_gb, storage_gb, gpu = signature
    storage_gb = {250: 256, 500: 512}.get(storage_gb, storage_gb)
    if gpu in {"VEGA7", "VEGA8", "VEGA11"}:
        gpu = "VEGA"
    return (cpu_family, cpu_tier, ram_gb, storage_gb, gpu)


def _is_real_catalog_code(value: str) -> bool:
    value = (value or "").strip().upper()
    return not (
        value.startswith("TEST-")
        or value.startswith("999TOCCTEST")
    )


def _choose_preferred_build(build_rows: list[dict]) -> str | None:
    if not build_rows:
        return None
    preferred = [
        row for row in build_rows
        if "(setup)" not in (row["name"] or "").lower()
    ]
    candidate_rows = preferred or build_rows
    candidate_rows = sorted(candidate_rows, key=lambda row: str(row["build_code"]))
    return candidate_rows[0]["build_code"]


def _resolve_via_xref(conn, marketplace: str, external_sku: str) -> str | None:
    """
    Look up external_item_xref for (marketplace, external_sku).
    Returns build_code if mapping exists and build is active.
    Raises RuntimeError if mapping exists but build is inactive (D-033).
    Returns None if no mapping exists.
    """
    with conn.cursor() as cur:
        cur.execute(
            """SELECT x.build_code, b.is_active, b.description,
                      (SELECT COUNT(*) FROM build_components bc WHERE bc.build_id = b.id) AS component_count
               FROM external_item_xref x
               JOIN builds b ON b.build_code = x.build_code
               WHERE x.marketplace = %s AND x.external_sku = %s""",
            (marketplace, external_sku),
        )
        row = cur.fetchone()
    if row is None:
        return None
    if not row["is_active"]:
        if (
            row["component_count"] == 0
            and _DRAFT_MARKER in (row["description"] or "")
        ):
            raise DraftBuildPendingError(marketplace, external_sku, row["build_code"])
        raise RuntimeError(
            f"D-033: xref maps ({marketplace}, {external_sku}) to build "
            f"'{row['build_code']}' but build is inactive"
        )
    return row["build_code"]


def _find_build_for_ean(conn, ean: str) -> str | None:
    """
    Find an active build whose build_code matches the product EAN.
    All backfill-generated builds use build_code = product EAN (T-A03).
    Returns build_code or None.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT build_code FROM builds WHERE build_code = %s AND is_active = TRUE",
            (ean,),
        )
        row = cur.fetchone()
    return row["build_code"] if row else None


def _build_component_signature(conn, build_code: str) -> tuple[tuple[str, int], ...]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT coalesce(ig.code, p.ean) AS component_code, bc.quantity
              FROM builds b
              JOIN build_components bc ON bc.build_id = b.id
              LEFT JOIN item_groups ig ON ig.id = bc.item_group_id
              LEFT JOIN products p ON p.id = bc.product_id
             WHERE b.build_code = %s
             ORDER BY 1, 2
            """,
            (build_code,),
        )
        return tuple(
            (row["component_code"], row["quantity"])
            for row in cur.fetchall()
        )


def _resolve_bol_description(conn, description: str) -> str | None:
    """
    Deterministic Bol-only fallback: resolve an exact active build/product title.

    This is intentionally strict. It only accepts a unique normalized match so
    the fallback does not guess across similar catalog entries.
    """
    normalized = _normalize_description(description)
    if not normalized:
        return None

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT build_code
              FROM builds
             WHERE is_active = TRUE
               AND lower(regexp_replace(name, '[[:space:]]+', ' ', 'g')) = %s
            """,
            (normalized,),
        )
        build_rows = cur.fetchall()
        build_rows = [
            row for row in build_rows
            if _is_real_catalog_code(row["build_code"])
        ]
        if len(build_rows) == 1:
            return build_rows[0]["build_code"]

        cur.execute(
            """
            SELECT ean
              FROM products
             WHERE lower(regexp_replace(name, '[[:space:]]+', ' ', 'g')) = %s
            """,
            (normalized,),
        )
        product_rows = cur.fetchall()
        product_rows = [
            row for row in product_rows
            if _is_real_catalog_code(row["ean"])
        ]
        if len(product_rows) == 1:
            return _find_build_for_ean(conn, product_rows[0]["ean"])

    return None


def _resolve_build_from_description(conn, description: str) -> str | None:
    normalized = _normalize_catalog_name(description)
    if not normalized:
        return None

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT b.build_code, b.name
              FROM builds b
             WHERE b.is_active = TRUE
               AND EXISTS (
                   SELECT 1 FROM build_components bc WHERE bc.build_id = b.id
               )
               AND lower(regexp_replace(coalesce(b.name, ''), '[[:space:]]+', ' ', 'g')) = %s
            """,
            (normalized,),
        )
        exact_builds = [dict(row) for row in cur.fetchall()]
        chosen = _choose_preferred_build(exact_builds)
        if chosen:
            return chosen

        cur.execute(
            """
            SELECT p.ean
              FROM products p
             WHERE lower(regexp_replace(coalesce(p.name, ''), '[[:space:]]+', ' ', 'g')) = %s
            """,
            (normalized,),
        )
        product_rows = cur.fetchall()
        if len(product_rows) == 1:
            build_code = _find_build_for_ean(conn, product_rows[0]["ean"])
            if build_code:
                return build_code

        wanted_sig = _extract_description_signature(description)
        if wanted_sig == ("", "", "", 0, 0, ""):
            return None
        cur.execute(
            """
            SELECT b.build_code, b.name
              FROM builds b
              JOIN products p ON p.ean = b.build_code
             WHERE b.is_active = TRUE
               AND EXISTS (
                   SELECT 1 FROM build_components bc WHERE bc.build_id = b.id
               )
            """
        )
        candidates = [dict(row) for row in cur.fetchall()]
        candidates = [
            row for row in candidates
            if _is_real_catalog_code(row["build_code"])
        ]
        signature_matches = [
            row for row in candidates
            if _extract_description_signature(row["name"]) == wanted_sig
        ]
        chosen = _choose_preferred_build(signature_matches)
        if chosen:
            return chosen

        relaxed_signature = _relax_signature(wanted_sig)
        if relaxed_signature == ("", "", 0, 0, ""):
            return None
        relaxed_matches = [
            row for row in candidates
            if _relax_signature(_extract_description_signature(row["name"]))
            == relaxed_signature
        ]
        if not relaxed_matches:
            return None

        component_signatures = {
            _build_component_signature(conn, row["build_code"])
            for row in relaxed_matches
        }
        if len(component_signatures) != 1:
            return None

        return _choose_preferred_build(relaxed_matches)


def _ensure_draft_build_for_unresolved_sku(order: OrderData, sku: str) -> str:
    """
    Create or reuse an inactive draft build keyed off an unresolved email SKU.

    Drafts are operator work only. They never process sales until a human adds
    components and explicitly activates/replays them. No `external_item_xref`
    row is created at draft time — the xref is written only when the operator
    saves/approves the build from the UI. That keeps xref semantics clean:
    "xref exists" <=> "approved mapping".

    Dedup is done by scanning the draft marker in `builds.description` for a
    matching (marketplace, external_sku) pair instead of the xref.
    """
    marker_mp = f"\nmarketplace={order.marketplace}\n"
    marker_sku = f"\nexternal_sku={sku}\n"
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT build_code
                     FROM builds
                    WHERE is_active = FALSE
                      AND description LIKE %s
                      AND position(%s IN description) > 0
                      AND position(%s IN description) > 0
                    ORDER BY created_at
                    LIMIT 1""",
                (f"{_DRAFT_MARKER}%", marker_mp, marker_sku),
            )
            existing = cur.fetchone()
            if existing:
                return existing["build_code"]

            # build_code is an INTERNAL identifier; NEVER equal to the raw marketplace SKU.
            build_code = f"DRAFT-{order.marketplace}-{sku}"
            cur.execute("SELECT build_code FROM builds WHERE build_code = %s", (build_code,))
            if cur.fetchone() is not None:
                import uuid as _uuid
                build_code = f"DRAFT-{order.marketplace}-{sku}-{_uuid.uuid4().hex[:6]}"

            draft_name = order.product_description or f"Draft mapping for {order.marketplace} {sku}"
            draft_description = (
                f"{_DRAFT_MARKER}\n"
                f"marketplace={order.marketplace}\n"
                f"external_sku={sku}\n"
                f"order_number={order.order_number}\n"
                "Draft created automatically from unresolved email SKU. "
                "Add components and activate before replaying the ingestion event."
            )
            cur.execute(
                """INSERT INTO builds (build_code, name, description, is_active)
                   VALUES (%s, %s, %s, FALSE)
                   ON CONFLICT (build_code) DO NOTHING
                   RETURNING build_code""",
                (build_code, draft_name, draft_description),
            )
            row = cur.fetchone()
            if row:
                return row["build_code"]
            # Lost a race with a concurrent writer; the other session already
            # inserted the draft. Fall through to the same lookup we did above.
            cur.execute(
                """SELECT build_code
                     FROM builds
                    WHERE is_active = FALSE
                      AND description LIKE %s
                      AND position(%s IN description) > 0
                      AND position(%s IN description) > 0
                    ORDER BY created_at
                    LIMIT 1""",
                (f"{_DRAFT_MARKER}%", marker_mp, marker_sku),
            )
            row = cur.fetchone()
    return row["build_code"]


def _upsert_external_xref(conn, marketplace: str, external_sku: str, build_code: str) -> None:
    if not marketplace or not external_sku or not build_code:
        return
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
               VALUES (%s, %s, %s)
               ON CONFLICT (marketplace, external_sku) DO NOTHING""",
            (marketplace, external_sku, build_code),
        )


def resolve_ean(conn, identifier: str, marketplace: str = None) -> str | None:
    """Resolve a product identifier to its EAN.
    Order: 1) sku_aliases (marketplace SKU → EAN)
           2) products.ean (direct match)
           3) products.sku (internal label)
    sku_aliases is still readable during migration (D-019)."""
    with conn.cursor() as cur:
        # 1. Check sku_aliases first (marketplace-specific mapping)
        if marketplace:
            cur.execute(
                "SELECT product_ean FROM sku_aliases WHERE marketplace_sku = %s AND marketplace = %s",
                (identifier, marketplace),
            )
            row = cur.fetchone()
            if row:
                return row["product_ean"]
        # Also try without marketplace filter
        cur.execute(
            "SELECT product_ean FROM sku_aliases WHERE marketplace_sku = %s",
            (identifier,),
        )
        row = cur.fetchone()
        if row:
            return row["product_ean"]

        # 2. Try as EAN directly
        cur.execute("SELECT ean FROM products WHERE ean = %s", (identifier,))
        row = cur.fetchone()
        if row:
            return row["ean"]

        # 3. Fallback: products.sku
        cur.execute("SELECT ean FROM products WHERE sku = %s", (identifier,))
        row = cur.fetchone()
        return row["ean"] if row else None


def _call_bom_sale(
    conn,
    build_code: str,
    order: OrderData,
    email_id: str,
    sold_at=None,
) -> str:
    """Execute process_bom_sale and return transaction UUID string.

    sold_at (TIMESTAMPTZ): when the sale actually happened. When None,
    process_bom_sale falls back to NOW() so legacy callers keep working.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT process_bom_sale(%s, %s, %s, %s, %s, %s, %s, %s) AS txn_id",
            (
                build_code,
                order.quantity,
                order.price,
                order.marketplace,
                order.order_number,
                email_id,
                None,  # p_commission_override — unused on email path
                sold_at,
            ),
        )
        return str(cur.fetchone()["txn_id"])


def write_sale(order: OrderData, email_id: str, conn=None, sold_at=None) -> str:
    """
    Build-only sale processing for current ingestion (D-019, D-033, D-105).

    Routing:
      1. external_item_xref → process_bom_sale (or RAISE if build inactive)
      2. sku_aliases/EAN → find build by EAN → process_bom_sale
      3. No build → RAISE

    Returns transaction UUID string.
    Raises RuntimeError on D-033 violation (xref → inactive build).
    Raises ValueError if product cannot be resolved at all.
    Raises RuntimeError if a product resolves but no active build exists.
    """
    sku = order.sku or order.get_sku()
    skus_to_try = [sku]
    if order.generated_sku and order.generated_sku != sku:
        skus_to_try.append(order.generated_sku)

    # Step 1: Try external_item_xref (D-019, authoritative)
    conn_ctx = nullcontext(conn) if conn is not None else get_conn()
    with conn_ctx as active_conn:
        # Step 1: Try external_item_xref (D-019, authoritative)
        for s in skus_to_try:
            build_code = _resolve_via_xref(active_conn, order.marketplace, s)
            if build_code is not None:
                logger.info(
                    "BOM-routed via xref: marketplace=%s sku=%s build=%s",
                    order.marketplace,
                    s,
                    build_code,
                )
                return _call_bom_sale(active_conn, build_code, order, email_id, sold_at=sold_at)

        # Step 2: Resolve EAN via sku_aliases / direct match
        ean = None
        for s in skus_to_try:
            ean = resolve_ean(active_conn, s, order.marketplace)
            if ean:
                break
        if not ean:
            if order.marketplace == "BolCom" and getattr(order, "product_description", ""):
                build_code = _resolve_bol_description(active_conn, order.product_description)
                if build_code:
                    logger.info(
                        "BOM-routed via Bol description: marketplace=%s sku=%s build=%s",
                        order.marketplace,
                        sku,
                        build_code,
                    )
                    return _call_bom_sale(active_conn, build_code, order, email_id, sold_at=sold_at)
            if getattr(order, "product_description", ""):
                build_code = _resolve_build_from_description(active_conn, order.product_description)
                if build_code:
                    _upsert_external_xref(active_conn, order.marketplace, sku, build_code)
                    logger.info(
                        "BOM-routed via description without EAN: marketplace=%s sku=%s build=%s",
                        order.marketplace,
                        sku,
                        build_code,
                    )
                    return _call_bom_sale(active_conn, build_code, order, email_id, sold_at=sold_at)
            if sku:
                draft_build_code = _ensure_draft_build_for_unresolved_sku(order, sku)
                raise DraftBuildPendingError(order.marketplace, sku, draft_build_code)
            raise ValueError(f"Product not found for SKU: {sku}")

        # Step 2b: Find build by EAN (backfill builds use build_code = EAN)
        build_code = _find_build_for_ean(active_conn, ean)
        if build_code:
            _upsert_external_xref(active_conn, order.marketplace, sku, build_code)
            logger.info(
                "BOM-routed via EAN build: marketplace=%s sku=%s ean=%s build=%s",
                order.marketplace,
                sku,
                ean,
                build_code,
            )
            return _call_bom_sale(active_conn, build_code, order, email_id, sold_at=sold_at)

        if getattr(order, "product_description", ""):
            build_code = _resolve_build_from_description(active_conn, order.product_description)
            if build_code:
                _upsert_external_xref(active_conn, order.marketplace, sku, build_code)
                logger.info(
                    "BOM-routed via description: marketplace=%s sku=%s build=%s",
                    order.marketplace,
                    sku,
                    build_code,
                )
                return _call_bom_sale(active_conn, build_code, order, email_id, sold_at=sold_at)

        raise RuntimeError(
            f"D-033: no active build reachable for marketplace={order.marketplace}, "
            f"sku={sku}, ean={ean}"
        )
