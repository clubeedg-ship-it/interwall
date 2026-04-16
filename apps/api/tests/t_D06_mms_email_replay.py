"""
T-D06 — MediaMarktSaturn historical email replay recovers explicit SKU.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_D06_mms_email_replay.py -q
"""

from __future__ import annotations

import json
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from ingestion_worker import process_ingestion_event


TAG = uuid.uuid4().hex[:6]
MARKETPLACE = "MediaMarktSaturn"
EXPLICIT_SKU = f"MMS-TEST-{TAG}"
GENERATED_SKU = f"OMX-MMS-UNK-16-1T-{TAG[:3]}"


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(autouse=True)
def cleanup():
    yield
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM stock_ledger_entries WHERE transaction_id IN "
                "(SELECT id FROM transactions WHERE order_reference LIKE %s)",
                (f"ORD-D06-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM transactions WHERE order_reference LIKE %s",
                (f"ORD-D06-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM ingestion_events WHERE message_id LIKE %s",
                (f"test-d06-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM stock_lots WHERE product_id IN "
                "(SELECT id FROM products WHERE ean LIKE %s)",
                (f"TEST-D06-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM external_item_xref WHERE marketplace = %s AND external_sku IN (%s, %s)",
                (MARKETPLACE, EXPLICIT_SKU, GENERATED_SKU),
            )
            cur.execute(
                "DELETE FROM sku_aliases WHERE marketplace = %s AND marketplace_sku = %s",
                (MARKETPLACE, EXPLICIT_SKU),
            )
            cur.execute(
                "DELETE FROM build_components WHERE build_id IN "
                "(SELECT id FROM builds WHERE build_code LIKE %s)",
                (f"TEST-D06-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code LIKE %s",
                (f"TEST-D06-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_group_members WHERE item_group_id IN "
                "(SELECT id FROM item_groups WHERE code LIKE %s)",
                (f"test_d06_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_groups WHERE code LIKE %s",
                (f"test_d06_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM products WHERE ean LIKE %s",
                (f"TEST-D06-{TAG}%",),
            )


def test_mms_replay_reparses_explicit_sku_and_backfills_xref():
    order_ref = f"ORD-D06-{TAG}"
    description = "Gaming PC Ryzen 5-4500 RTX 5060 16GB/1TB Windows 11 Pro"

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ean = f"TEST-D06-{TAG}"
            cur.execute(
                "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
                (ean, description),
            )
            product_id = str(cur.fetchone()["id"])

            cur.execute(
                "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
                (f"test_d06_{TAG}", f"D06 Group {TAG}"),
            )
            group_id = str(cur.fetchone()["id"])
            cur.execute(
                "INSERT INTO item_group_members (item_group_id, product_id) VALUES (%s, %s)",
                (group_id, product_id),
            )
            cur.execute(
                """INSERT INTO builds (build_code, name, is_auto_generated, is_active)
                   VALUES (%s, %s, TRUE, TRUE) RETURNING id""",
                (ean, description),
            )
            build_id = str(cur.fetchone()["id"])
            cur.execute(
                "INSERT INTO build_components (build_id, item_group_id, quantity) VALUES (%s, %s, 1)",
                (build_id, group_id),
            )
            cur.execute(
                """INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at)
                   VALUES (%s, 3, 100.0, NOW() - INTERVAL '1 day')""",
                (product_id,),
            )
            cur.execute(
                """INSERT INTO sku_aliases (marketplace_sku, product_ean, marketplace)
                   VALUES (%s, %s, %s)""",
                (EXPLICIT_SKU, ean, MARKETPLACE),
            )
            cur.execute(
                """
                INSERT INTO ingestion_events (
                    message_id, sender, subject, marketplace, parsed_type,
                    raw_body, parsed_data, confidence, status, source
                ) VALUES (
                    %s, %s, %s, %s, 'sale',
                    %s, %s, 0.9, 'pending', 'email'
                )
                RETURNING id
                """,
                (
                    f"test-d06-{TAG}-mms",
                    "noreply@mmsmarketplace.mediamarktsaturn.com",
                    f"Bestelling {order_ref} zal worden verzonden",
                    MARKETPLACE,
                    (
                        f"Bestelnummer: {order_ref}\n"
                        f"Beschrijving: {description}\n"
                        "Prijs: EUR 899,00\n"
                        "Aantal: 1\n"
                        f"Interne referentie: {EXPLICIT_SKU}\n"
                    ),
                    json.dumps(
                        {
                            "order_number": order_ref,
                            "sku": GENERATED_SKU,
                            "generated_sku": GENERATED_SKU,
                            "price": 899.0,
                            "quantity": 1,
                        }
                    ),
                ),
            )
            event_id = str(cur.fetchone()["id"])

    assert process_ingestion_event(event_id) == "processed"

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM ingestion_events WHERE id = %s", (event_id,))
            assert cur.fetchone()["status"] == "processed"

            cur.execute(
                """SELECT build_code
                     FROM external_item_xref
                    WHERE marketplace = %s AND external_sku = %s""",
                (MARKETPLACE, EXPLICIT_SKU),
            )
            xref = cur.fetchone()
            assert xref is not None
            assert xref["build_code"] == ean
