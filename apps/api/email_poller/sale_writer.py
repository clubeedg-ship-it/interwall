"""
Sale processing writer.
Resolves marketplace SKU to product EAN, then calls the process_sale() DB function.
"""

import logging
from db import get_conn
from email_poller.parsers.base import OrderData

logger = logging.getLogger("email_poller.sale_writer")


def resolve_ean(identifier: str) -> str | None:
    """Resolve a product identifier to its EAN.
    Tries EAN first (primary key), then falls back to SKU (internal label)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Try as EAN first (the system is EAN-guided)
            cur.execute("SELECT ean FROM products WHERE ean = %s", (identifier,))
            row = cur.fetchone()
            if row:
                return row['ean']
            # Fallback: maybe it's a SKU (marketplace internal ref)
            cur.execute("SELECT ean FROM products WHERE sku = %s", (identifier,))
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
