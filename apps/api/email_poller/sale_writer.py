"""
Sale processing writer.
Resolves marketplace SKU to product EAN, then calls the process_sale() DB function.
"""

import logging
from db import get_conn
from email_poller.parsers.base import OrderData

logger = logging.getLogger("email_poller.sale_writer")


def resolve_ean(sku: str) -> str | None:
    """Resolve marketplace SKU to products.ean. Returns None if not found."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Try sku column first (marketplace internal ref)
            cur.execute("SELECT ean FROM products WHERE sku = %s", (sku,))
            row = cur.fetchone()
            if row:
                return row['ean']
            # Fallback: maybe the sku IS an EAN already
            cur.execute("SELECT ean FROM products WHERE ean = %s", (sku,))
            row = cur.fetchone()
            return row['ean'] if row else None


def write_sale(order: OrderData, email_id: str) -> str:
    """Call process_sale() DB function. Returns transaction UUID string.
    Raises ValueError if product EAN cannot be resolved.
    Raises Exception (re-raised) if process_sale() fails (insufficient stock, etc.)."""
    sku = order.get_sku()
    ean = resolve_ean(sku)
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
