"""
T-B02 + T-B05 — unified ingestion worker and dead-letter flow tests.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_B02_B05_ingestion_worker.py -v --tb=short
"""

import json
import uuid
import pytest
import sys

sys.path.insert(0, "/app")

import db
from ingestion_worker import process_ingestion_event

TAG = uuid.uuid4().hex[:6]


def _seed_email_sale(cur, suffix: str) -> dict:
    ean = f"TEST-B02-{TAG}-{suffix}"
    cur.execute(
        "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
        (ean, f"Worker Product {suffix}"),
    )
    product_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
        (f"worker_group_{TAG}_{suffix}", f"Worker Group {suffix}"),
    )
    group_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO item_group_members (item_group_id, product_id) VALUES (%s, %s)",
        (group_id, product_id),
    )

    cur.execute(
        """INSERT INTO builds (build_code, name, is_auto_generated, is_active)
           VALUES (%s, %s, TRUE, TRUE) RETURNING id""",
        (ean, f"Worker Build {suffix}"),
    )
    build_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO build_components (build_id, item_group_id, quantity) VALUES (%s, %s, 1)",
        (build_id, group_id),
    )

    cur.execute(
        """INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at)
           VALUES (%s, 5, 40, NOW() - INTERVAL '1 day') RETURNING id""",
        (product_id,),
    )
    lot_id = str(cur.fetchone()["id"])

    return {
        "ean": ean,
        "product_id": product_id,
        "group_id": group_id,
        "build_id": build_id,
        "lot_id": lot_id,
    }


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            for path in [
                "/app/sql/03_avl_build_schema.sql",
                "/app/sql/07_deduct_fifo_for_group.sql",
                "/app/sql/08_process_bom_sale.sql",
                "/app/sql/11_ingestion_events_dedupe.sql",
                "/app/sql/12_ingestion_event_attempts.sql",
            ]:
                with open(path) as f:
                    cur.execute(f.read())
    yield


@pytest.fixture(autouse=True)
def cleanup():
    yield
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM stock_ledger_entries WHERE transaction_id IN "
                "(SELECT id FROM transactions WHERE order_reference LIKE %s)",
                (f"T-B02-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM transactions WHERE order_reference LIKE %s",
                (f"T-B02-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM ingestion_events WHERE message_id LIKE %s OR external_id LIKE %s",
                (f"T-B02-{TAG}%", f"T-B02-{TAG}%"),
            )
            cur.execute(
                "DELETE FROM stock_lots WHERE product_id IN "
                "(SELECT id FROM products WHERE ean LIKE %s)",
                (f"TEST-B02-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM build_components WHERE build_id IN "
                "(SELECT id FROM builds WHERE build_code LIKE %s)",
                (f"TEST-B02-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code LIKE %s",
                (f"TEST-B02-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_group_members WHERE item_group_id IN "
                "(SELECT id FROM item_groups WHERE code LIKE %s)",
                (f"worker_group_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_groups WHERE code LIKE %s",
                (f"worker_group_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM products WHERE ean LIKE %s",
                (f"TEST-B02-{TAG}%",),
            )


def test_email_event_processed_via_shared_worker():
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_email_sale(cur, "C1")
            cur.execute(
                """INSERT INTO ingestion_events (
                       message_id, source, sender, subject, marketplace, parsed_type,
                       raw_body, parsed_data, confidence, status
                   ) VALUES (
                       %s, 'email', 'marketplace@example.com', 'Order C1', 'MediaMarktSaturn',
                       'sale', %s, %s, 0.9, 'pending'
                   ) RETURNING id""",
                (
                    f"T-B02-{TAG}-EMAIL-C1",
                    "Interne referentie: TEST-B02-SKU-C1",
                    json.dumps(
                        {
                            "order_number": f"T-B02-{TAG}-EMAIL-C1",
                            "sku": ids["ean"],
                            "price": 100.0,
                            "quantity": 1,
                        }
                    ),
                ),
            )
            event_id = str(cur.fetchone()["id"])

    result = process_ingestion_event(event_id)
    assert result == "processed"

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status, attempt_count FROM ingestion_events WHERE id = %s", (event_id,))
            row = cur.fetchone()
            assert row["status"] == "processed"
            assert row["attempt_count"] == 1

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM transactions WHERE order_reference = %s",
                (f"T-B02-{TAG}-EMAIL-C1",),
            )
            assert cur.fetchone()["cnt"] == 1


def test_repeated_failure_moves_to_dead_letter():
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO ingestion_events (
                       message_id, source, external_id, marketplace, parsed_type,
                       parsed_data, confidence, status
                   ) VALUES (
                       %s, 'bolcom_api', %s, 'BolCom', 'sale', %s, 1.0, 'pending'
                   ) RETURNING id""",
                (
                    f"T-B02-{TAG}-BOL-C2",
                    f"T-B02-{TAG}-BOL-C2",
                    json.dumps(
                        {
                            "orderItemId": "ITEM-C2",
                            "offer": {},
                            "product": {"ean": f"TEST-B02-{TAG}-MISSING"},
                            "quantity": 1,
                            "totalPrice": 99.0,
                            "commission": 4.0,
                        }
                    ),
                ),
            )
            event_id = str(cur.fetchone()["id"])

    assert process_ingestion_event(event_id) == "failed"
    assert process_ingestion_event(event_id) == "failed"
    assert process_ingestion_event(event_id) == "dead_letter"

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT status, attempt_count, dead_letter_reason, error_message
                   FROM ingestion_events WHERE id = %s""",
                (event_id,),
            )
            row = cur.fetchone()
            assert row["status"] == "dead_letter"
            assert row["attempt_count"] == 3
            assert "Exceeded 3 attempts" in row["dead_letter_reason"]
            assert "D-033" in row["error_message"]
