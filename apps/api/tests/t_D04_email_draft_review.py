"""
T-D04 — Generic unresolved email SKU becomes a draft build review item.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_D04_email_draft_review.py -q
"""

import json
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from ingestion_worker import process_ingestion_event


TAG = uuid.uuid4().hex[:6]
MARKETPLACE = f"draft_{TAG}_mp"
SKU = f"UNRES-SKU-{TAG}"
ORDER_NUMBER = f"ORD-{TAG}"


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
                "DELETE FROM external_item_xref WHERE marketplace = %s",
                (MARKETPLACE,),
            )
            cur.execute(
                "DELETE FROM build_components WHERE build_id IN (SELECT id FROM builds WHERE build_code IN (%s, %s))",
                (SKU, f"DRAFT-{MARKETPLACE}-{SKU}"),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code IN (%s, %s)",
                (SKU, f"DRAFT-{MARKETPLACE}-{SKU}"),
            )
            cur.execute(
                "DELETE FROM ingestion_events WHERE marketplace = %s AND message_id LIKE %s",
                (MARKETPLACE, f"draft-{TAG}-%"),
            )


def test_unresolved_email_sku_moves_to_review_and_creates_draft():
    with db.get_conn() as conn:
        with conn.cursor() as cur:
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
                    f"draft-{TAG}-msg",
                    "seller@test.invalid",
                    "Nieuwe bestelling: Test product",
                    MARKETPLACE,
                    "raw body",
                    json.dumps(
                        {
                            "order_number": ORDER_NUMBER,
                            "sku": SKU,
                            "generated_sku": SKU,
                            "product_description": "Draft Test Product",
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
            assert "Draft build pending" in (event["error_message"] or "")

            cur.execute(
                """SELECT build_code
                     FROM external_item_xref
                    WHERE marketplace = %s AND external_sku = %s""",
                (MARKETPLACE, SKU),
            )
            xref = cur.fetchone()
            assert xref is not None

            cur.execute(
                """SELECT id, build_code, is_active, description
                     FROM builds
                    WHERE build_code = %s""",
                (xref["build_code"],),
            )
            build = cur.fetchone()
            assert build is not None
            assert build["is_active"] is False
            assert "[DRAFT-UNRESOLVED-SKU]" in (build["description"] or "")

            cur.execute(
                "SELECT COUNT(*) AS n FROM build_components WHERE build_id = %s",
                (build["id"],),
            )
            assert cur.fetchone()["n"] == 0
