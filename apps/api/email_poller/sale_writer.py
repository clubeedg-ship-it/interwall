"""
Sale processing writer.
Resolves marketplace SKU to product EAN, then calls the process_sale() DB function.
"""

import logging
from db import get_conn
from email_poller.parsers.base import OrderData

logger = logging.getLogger("email_poller.sale_writer")


def resolve_ean(identifier: str, marketplace: str = None) -> str | None:
    """Resolve a product identifier to its EAN.
    Order: 1) sku_aliases (marketplace SKU → EAN)
           2) products.ean (direct match)
           3) products.sku (internal label)"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Check sku_aliases first (marketplace-specific mapping)
            if marketplace:
                cur.execute(
                    "SELECT product_ean FROM sku_aliases WHERE marketplace_sku = %s AND marketplace = %s",
                    (identifier, marketplace)
                )
                row = cur.fetchone()
                if row:
                    return row['product_ean']
            # Also try without marketplace filter
            cur.execute(
                "SELECT product_ean FROM sku_aliases WHERE marketplace_sku = %s",
                (identifier,)
            )
            row = cur.fetchone()
            if row:
                return row['product_ean']

            # 2. Try as EAN directly
            cur.execute("SELECT ean FROM products WHERE ean = %s", (identifier,))
            row = cur.fetchone()
            if row:
                return row['ean']

            # 3. Fallback: products.sku
            cur.execute("SELECT ean FROM products WHERE sku = %s", (identifier,))
            row = cur.fetchone()
            return row['ean'] if row else None


def write_sale(order: OrderData, email_id: str) -> str:
    """Call process_sale() DB function. Returns transaction UUID string.
    Raises ValueError if product EAN cannot be resolved.
    Raises Exception (re-raised) if process_sale() fails (insufficient stock, etc.)."""
    # Try original marketplace SKU first (matches sku_aliases), then generated
    sku = order.sku or order.get_sku()
    ean = resolve_ean(sku, order.marketplace)
    if not ean and order.generated_sku and order.generated_sku != sku:
        ean = resolve_ean(order.generated_sku, order.marketplace)
    if not ean:
        raise ValueError(f"Product EAN not found for SKU: {sku}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT process_sale(%s, %s, %s, %s, %s, %s) AS txn_id",
                (ean, order.quantity, order.price,
                 order.marketplace, order.order_number, email_id)
            )
            return str(cur.fetchone()['txn_id'])
