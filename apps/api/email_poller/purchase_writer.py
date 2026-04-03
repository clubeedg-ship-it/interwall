"""
Purchase stock-IN writer.
Inserts stock_lot rows for manual purchase inventory, resolved by EAN.
"""

import logging
from db import get_conn

logger = logging.getLogger("email_poller.purchase_writer")


def write_purchase(ean: str, quantity: int, unit_cost: float,
                   marketplace: str, email_id: str | None = None) -> str:
    """Insert a stock_lot row for a manual purchase stock-IN.
    Returns stock_lot UUID string. Raises ValueError if EAN not found."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM products WHERE ean = %s", (ean,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Product EAN not found: {ean}")
            product_id = row['id']
            cur.execute(
                """INSERT INTO stock_lots
                   (product_id, quantity, unit_cost, marketplace, received_at, source_email_id)
                   VALUES (%s, %s, %s, %s, NOW(), %s)
                   RETURNING id""",
                (product_id, quantity, unit_cost, marketplace, email_id)
            )
            return str(cur.fetchone()['id'])
