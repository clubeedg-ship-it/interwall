"""
T-D07 — Email stock blockers move to review instead of retry churn.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_D07_email_stock_review.py -q
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
MARKETPLACE = f"stock_{TAG}_mp"
SKU = f"STOCK-SKU-{TAG}"
ORDER_NUMBER = f"ORD-STOCK-{TAG}"


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(autouse=True)
def clean_test_data():
    yield
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM stock_ledger_entries WHERE transaction_id IN "
                "(SELECT id FROM transactions WHERE order_reference = %s)",
                (ORDER_NUMBER,),
            )
            cur.execute(
                "DELETE FROM transactions WHERE order_reference = %s",
                (ORDER_NUMBER,),
            )
            cur.execute(
                "DELETE FROM external_item_xref WHERE marketplace = %s",
                (MARKETPLACE,),
            )
            cur.execute(
                "DELETE FROM ingestion_events WHERE marketplace = %s AND message_id LIKE %s",
                (MARKETPLACE, f"stock-{TAG}-%"),
            )
            cur.execute(
                "DELETE FROM build_components WHERE build_id IN (SELECT id FROM builds WHERE build_code = %s)",
                (f"STOCK-BUILD-{TAG}",),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code = %s",
                (f"STOCK-BUILD-{TAG}",),
            )
            cur.execute(
                "DELETE FROM item_group_members WHERE item_group_id IN "
                "(SELECT id FROM item_groups WHERE code = %s)",
                (f"stock_group_{TAG}",),
            )
            cur.execute(
                "DELETE FROM item_groups WHERE code = %s",
                (f"stock_group_{TAG}",),
            )
            cur.execute(
                "DELETE FROM products WHERE ean = %s",
                (f"STOCK-PROD-{TAG}",),
            )
            cur.execute(
                "DELETE FROM vat_rates WHERE marketplace = %s",
                (MARKETPLACE,),
            )


def test_email_stock_blocker_moves_to_review():
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
                (f"STOCK-PROD-{TAG}", f"Stock Product {TAG}"),
            )
            product_id = str(cur.fetchone()["id"])
            cur.execute(
                "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
                (f"stock_group_{TAG}", f"Stock Group {TAG}"),
            )
            group_id = str(cur.fetchone()["id"])
            cur.execute(
                "INSERT INTO item_group_members (item_group_id, product_id) VALUES (%s, %s)",
                (group_id, product_id),
            )
            cur.execute(
                """INSERT INTO builds (build_code, name, is_auto_generated, is_active)
                   VALUES (%s, %s, TRUE, TRUE) RETURNING id""",
                (f"STOCK-BUILD-{TAG}", f"Stock Build {TAG}"),
            )
            build_id = str(cur.fetchone()["id"])
            cur.execute(
                "INSERT INTO build_components (build_id, item_group_id, quantity) VALUES (%s, %s, 1)",
                (build_id, group_id),
            )
            cur.execute(
                """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
                   VALUES (%s, %s, %s)""",
                (MARKETPLACE, SKU, f"STOCK-BUILD-{TAG}"),
            )
            cur.execute(
                "INSERT INTO vat_rates (marketplace, country, rate) VALUES (%s, %s, %s)",
                (MARKETPLACE, "NL", 21.0),
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
                    f"stock-{TAG}-msg",
                    "seller@test.invalid",
                    "Nieuwe bestelling: Stock product",
                    MARKETPLACE,
                    "raw body",
                    json.dumps(
                        {
                            "order_number": ORDER_NUMBER,
                            "sku": SKU,
                            "generated_sku": SKU,
                            "product_description": f"Stock Product {TAG}",
                            "price": 123.45,
                            "quantity": 1,
                        }
                    ),
                ),
            )
            event_id = str(cur.fetchone()["id"])

    result = process_ingestion_event(event_id)

    assert result == "review"

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, error_message FROM ingestion_events WHERE id = %s",
                (event_id,),
            )
            event = cur.fetchone()
            assert event["status"] == "review"
            assert "insufficient stock" in (event["error_message"] or "").lower()
