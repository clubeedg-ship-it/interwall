#!/usr/bin/env python3
"""
Generate a controlled local T-B03 dataset for Bol.com email vs API comparison.

This script:
  1. Ensures the local DB has the required schema/functions for unified ingestion.
  2. Seeds one minimal Bol.com build/xref/stock setup.
  3. Drives both existing ingestion paths for 50 matching logical orders:
       - API path via poller.bol_poller._process_order_item
       - Email path via email_poller.poller._process_one
  4. Rewrites ingestion-event timestamps to create a stable comparison window
     with mixed email-first, API-first, and same-minute examples.

Run via stdin in the api container:
  docker compose exec -T api python - < apps/api/scripts/bol_reliability_local_run.py
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import db
from email_poller.poller import _process_one
from poller.bol_poller import _process_order_item, MARKETPLACE


TAG = "B03LOCAL"
ORDER_COUNT = 50
SKU = "OMX-B03-LOCAL"
OFFER_REFERENCE = "B03-OFFER-LOCAL"
EAN = "TEST-B03-LOCAL-EAN"
PRICE_BASE = Decimal("199.00")


def _apply_sql(cur) -> None:
    for path in [
        "/app/sql/03_avl_build_schema.sql",
        "/app/sql/07_deduct_fifo_for_group.sql",
        "/app/sql/08_process_bom_sale.sql",
        "/app/sql/11_ingestion_events_dedupe.sql",
        "/app/sql/12_ingestion_event_attempts.sql",
    ]:
        with open(path, encoding="utf-8") as f:
            cur.execute(f.read())


def _ensure_supporting_rows(cur) -> None:
    cur.execute(
        """INSERT INTO fixed_costs (name, value, is_percentage)
           VALUES ('commission', 6.20, TRUE)
           ON CONFLICT (name) DO NOTHING"""
    )
    cur.execute(
        """INSERT INTO fixed_costs (name, value, is_percentage)
           VALUES ('overhead', 95.00, FALSE)
           ON CONFLICT (name) DO NOTHING"""
    )
    cur.execute(
        """INSERT INTO vat_rates (marketplace, country, rate)
           VALUES ('bolcom', 'NL', 21.00)
           ON CONFLICT (marketplace) DO NOTHING"""
    )


def _cleanup(cur) -> None:
    cur.execute(
        "DELETE FROM stock_ledger_entries WHERE transaction_id IN "
        "(SELECT id FROM transactions WHERE order_reference LIKE %s OR order_reference LIKE %s)",
        (f"{TAG}%", f"bol-{TAG}%"),
    )
    cur.execute(
        "DELETE FROM transactions WHERE order_reference LIKE %s OR order_reference LIKE %s",
        (f"{TAG}%", f"bol-{TAG}%"),
    )
    cur.execute(
        "DELETE FROM ingestion_events WHERE message_id LIKE %s OR external_id LIKE %s",
        (f"{TAG}%", f"bol-{TAG}%"),
    )
    cur.execute(
        "DELETE FROM stock_lots WHERE product_id IN "
        "(SELECT id FROM products WHERE ean = %s)",
        (EAN,),
    )
    cur.execute(
        "DELETE FROM external_item_xref WHERE marketplace = %s AND external_sku IN (%s, %s)",
        (MARKETPLACE, SKU, OFFER_REFERENCE),
    )
    cur.execute(
        "DELETE FROM build_components WHERE build_id IN "
        "(SELECT id FROM builds WHERE build_code = %s)",
        (EAN,),
    )
    cur.execute("DELETE FROM builds WHERE build_code = %s", (EAN,))
    cur.execute(
        "DELETE FROM item_group_members WHERE item_group_id IN "
        "(SELECT id FROM item_groups WHERE code = %s)",
        (f"{TAG}-GROUP",),
    )
    cur.execute("DELETE FROM item_groups WHERE code = %s", (f"{TAG}-GROUP",))
    cur.execute("DELETE FROM products WHERE ean = %s", (EAN,))


def _seed_stack(cur) -> None:
    cur.execute(
        "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
        (EAN, "T-B03 Local Reliability Product"),
    )
    product_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
        (f"{TAG}-GROUP", "T-B03 Local Reliability Group"),
    )
    group_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO item_group_members (item_group_id, product_id) VALUES (%s, %s)",
        (group_id, product_id),
    )

    cur.execute(
        """INSERT INTO builds (build_code, name, is_auto_generated, is_active)
           VALUES (%s, %s, TRUE, TRUE) RETURNING id""",
        (EAN, "T-B03 Local Reliability Build"),
    )
    build_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO build_components (build_id, item_group_id, quantity) VALUES (%s, %s, 1)",
        (build_id, group_id),
    )

    cur.execute(
        """INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at)
           VALUES (%s, %s, %s, NOW() - INTERVAL '2 days')""",
        (product_id, ORDER_COUNT * 3, Decimal("120.00")),
    )

    cur.execute(
        """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
           VALUES (%s, %s, %s)""",
        (MARKETPLACE, SKU, EAN),
    )
    cur.execute(
        """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
           VALUES (%s, %s, %s)""",
        (MARKETPLACE, OFFER_REFERENCE, EAN),
    )


def _email_body(price: Decimal, quantity: int) -> str:
    euros = f"{price:.2f}".replace(".", ",")
    return (
        f"Interne referentie: {SKU}\n"
        f"EUR {euros}\n"
        f"aantal: {quantity}\n"
        "15 april 2026\n"
    )


def _timestamp_pair(index: int, base_start: datetime) -> tuple[datetime, datetime]:
    base = base_start + timedelta(minutes=index * 10)
    n = index + 1
    if n % 10 == 0:
        return base, base
    if n % 2 == 0:
        return base + timedelta(minutes=3), base
    return base, base + timedelta(minutes=2)


def _stamp_event_times(cur, message_id: str, external_id: str, email_ts: datetime, api_ts: datetime) -> None:
    cur.execute(
        """UPDATE ingestion_events
              SET created_at = %s,
                  processed_at = %s
            WHERE message_id = %s""",
        (email_ts, email_ts + timedelta(seconds=20), message_id),
    )
    cur.execute(
        """UPDATE ingestion_events
              SET created_at = %s,
                  processed_at = %s
            WHERE external_id = %s""",
        (api_ts, api_ts + timedelta(seconds=20), external_id),
    )


def run() -> None:
    db.init_pool()
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            _apply_sql(cur)
            _ensure_supporting_rows(cur)
            _cleanup(cur)
            _seed_stack(cur)

    base_start = datetime.now(timezone.utc) - timedelta(hours=12)

    for index in range(ORDER_COUNT):
        n = index + 1
        order_id = f"{TAG}{n:03d}"
        order_item_id = f"ITEM{n:03d}"
        message_id = f"{TAG}-MSG-{n:03d}"
        external_id = f"bol-{order_id}-{order_item_id}"
        quantity = 1
        price = PRICE_BASE + Decimal(n)

        api_item = {
            "orderItemId": order_item_id,
            "cancellationRequest": False,
            "fulfilment": {"method": "FBR", "distributionParty": "RETAILER"},
            "offer": {"offerId": f"offer-{order_item_id}", "reference": OFFER_REFERENCE},
            "product": {"ean": EAN, "title": f"{SKU} Local Run Product"},
            "quantity": quantity,
            "unitPrice": float(price),
            "totalPrice": float(price * quantity),
            "commission": 5.0,
        }
        api_result = _process_order_item(api_item, order_id)
        if api_result != "new":
            raise RuntimeError(f"API path failed for {order_id}: {api_result}")

        _process_one(
            {
                "message_id": message_id,
                "from": "automail@bol.com",
                "subject": f"Nieuwe bestelling: {SKU} Local Run (bestelnummer: {order_id})",
                "body": _email_body(price, quantity),
            }
        )

        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status FROM ingestion_events WHERE message_id = %s",
                    (message_id,),
                )
                email_row = cur.fetchone()
                if email_row is None or email_row["status"] != "processed":
                    raise RuntimeError(f"Email path failed for {order_id}: {email_row}")

                email_ts, api_ts = _timestamp_pair(index, base_start)
                _stamp_event_times(cur, message_id, external_id, email_ts, api_ts)

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT source, COUNT(*) AS n
                   FROM ingestion_events
                   WHERE marketplace = %s
                     AND (message_id LIKE %s OR external_id LIKE %s)
                   GROUP BY source
                   ORDER BY source""",
                (MARKETPLACE, f"{TAG}%", f"bol-{TAG}%"),
            )
            rows = cur.fetchall()
            counts = {row["source"]: row["n"] for row in rows}

    print(
        "Generated controlled local T-B03 dataset: "
        f"{counts.get('email', 0)} email events, {counts.get('bolcom_api', 0)} API events."
    )


if __name__ == "__main__":
    run()
