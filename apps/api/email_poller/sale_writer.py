"""
Sale processing writer — BOM-first routing (T-A08).

Routing order (D-019, D-024, D-033):
  1. external_item_xref(marketplace, sku) → build_code
     Hit + active build → process_bom_sale
     Hit + inactive build → RAISE (D-033)
  2. sku_aliases / products.ean / products.sku → EAN
     EAN has active build (build_code = EAN from T-A03 backfill) → process_bom_sale
  3. No build reachable → process_sale (legacy fallback, WARNING)
"""

import logging
from db import get_conn
from email_poller.parsers.base import OrderData

logger = logging.getLogger("email_poller.sale_writer")


def _resolve_via_xref(marketplace: str, external_sku: str) -> str | None:
    """
    Look up external_item_xref for (marketplace, external_sku).
    Returns build_code if mapping exists and build is active.
    Raises RuntimeError if mapping exists but build is inactive (D-033).
    Returns None if no mapping exists.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT x.build_code, b.is_active
                   FROM external_item_xref x
                   JOIN builds b ON b.build_code = x.build_code
                   WHERE x.marketplace = %s AND x.external_sku = %s""",
                (marketplace, external_sku),
            )
            row = cur.fetchone()
    if row is None:
        return None
    if not row["is_active"]:
        raise RuntimeError(
            f"D-033: xref maps ({marketplace}, {external_sku}) to build "
            f"'{row['build_code']}' but build is inactive"
        )
    return row["build_code"]


def _find_build_for_ean(ean: str) -> str | None:
    """
    Find an active build whose build_code matches the product EAN.
    All backfill-generated builds use build_code = product EAN (T-A03).
    Returns build_code or None.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT build_code FROM builds WHERE build_code = %s AND is_active = TRUE",
                (ean,),
            )
            row = cur.fetchone()
    return row["build_code"] if row else None


def resolve_ean(identifier: str, marketplace: str = None) -> str | None:
    """Resolve a product identifier to its EAN.
    Order: 1) sku_aliases (marketplace SKU → EAN)
           2) products.ean (direct match)
           3) products.sku (internal label)
    sku_aliases is still readable during migration (D-019)."""
    with get_conn() as conn:
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


def _call_bom_sale(build_code: str, order: OrderData, email_id: str) -> str:
    """Execute process_bom_sale and return transaction UUID string."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT process_bom_sale(%s, %s, %s, %s, %s, %s) AS txn_id",
                (
                    build_code,
                    order.quantity,
                    order.price,
                    order.marketplace,
                    order.order_number,
                    email_id,
                ),
            )
            return str(cur.fetchone()["txn_id"])


def _call_legacy_sale(ean: str, order: OrderData, email_id: str) -> str:
    """Execute legacy process_sale and return transaction UUID string."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT process_sale(%s, %s, %s, %s, %s, %s) AS txn_id",
                (
                    ean,
                    order.quantity,
                    order.price,
                    order.marketplace,
                    order.order_number,
                    email_id,
                ),
            )
            return str(cur.fetchone()["txn_id"])


def write_sale(order: OrderData, email_id: str) -> str:
    """
    BOM-first sale processing (D-019, D-024, D-033).

    Routing:
      1. external_item_xref → process_bom_sale (or RAISE if build inactive)
      2. sku_aliases/EAN → find build by EAN → process_bom_sale
      3. No build → process_sale (legacy fallback, WARNING)

    Returns transaction UUID string.
    Raises RuntimeError on D-033 violation (xref → inactive build).
    Raises ValueError if product cannot be resolved at all.
    """
    sku = order.sku or order.get_sku()
    skus_to_try = [sku]
    if order.generated_sku and order.generated_sku != sku:
        skus_to_try.append(order.generated_sku)

    # Step 1: Try external_item_xref (D-019, authoritative)
    for s in skus_to_try:
        build_code = _resolve_via_xref(order.marketplace, s)
        if build_code is not None:
            logger.info(
                "BOM-routed via xref: marketplace=%s sku=%s build=%s",
                order.marketplace,
                s,
                build_code,
            )
            return _call_bom_sale(build_code, order, email_id)

    # Step 2: Resolve EAN via sku_aliases / direct match
    ean = None
    for s in skus_to_try:
        ean = resolve_ean(s, order.marketplace)
        if ean:
            break
    if not ean:
        raise ValueError(f"Product not found for SKU: {sku}")

    # Step 2b: Find build by EAN (backfill builds use build_code = EAN)
    build_code = _find_build_for_ean(ean)
    if build_code:
        logger.info(
            "BOM-routed via EAN build: marketplace=%s sku=%s ean=%s build=%s",
            order.marketplace,
            sku,
            ean,
            build_code,
        )
        return _call_bom_sale(build_code, order, email_id)

    # Step 3: Legacy fallback (D-024)
    logger.warning(
        "Legacy fallback path taken for marketplace=%s sku=%s ean=%s",
        order.marketplace,
        sku,
        ean,
    )
    return _call_legacy_sale(ean, order, email_id)
