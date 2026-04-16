"""
T-D05 — Sale routing audit.

Proves the current Python sale-ingestion entry points route new sales
through build-based processing only:
  - email/shared-worker path reaches process_bom_sale via write_sale
  - Bol.com poller path reaches process_bom_sale directly
  - there are no live Python call sites to legacy process_sale()

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_D05_sale_routing_audit.py -q
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from ingestion_worker import process_ingestion_event
from poller.bol_poller import _process_order_item, MARKETPLACE as BOL_MARKETPLACE


TAG = uuid.uuid4().hex[:6]
REPO_ROOT = Path("/app")


def _seed_build_stack(cur, suffix: str, marketplace: str, offer_ref: str | None = None) -> dict:
    ean = f"TEST-D05-{TAG}-{suffix}"
    cur.execute(
        "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
        (ean, f"T-D05 Product {suffix}"),
    )
    product_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
        (f"test_d05_{TAG}_{suffix}", f"T-D05 Group {suffix}"),
    )
    group_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO item_group_members (item_group_id, product_id) VALUES (%s, %s)",
        (group_id, product_id),
    )

    build_code = ean
    cur.execute(
        """INSERT INTO builds (build_code, name, is_auto_generated, is_active)
           VALUES (%s, %s, TRUE, TRUE) RETURNING id""",
        (build_code, f"T-D05 Build {suffix}"),
    )
    build_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO build_components (build_id, item_group_id, quantity) VALUES (%s, %s, 1)",
        (build_id, group_id),
    )

    cur.execute(
        """INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at)
           VALUES (%s, %s, %s, NOW() - INTERVAL '1 day') RETURNING id""",
        (product_id, 5, 75.0),
    )
    lot_id = str(cur.fetchone()["id"])

    if offer_ref:
        cur.execute(
            """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
               VALUES (%s, %s, %s)""",
            (marketplace, offer_ref, build_code),
        )

    return {
        "ean": ean,
        "product_id": product_id,
        "group_id": group_id,
        "build_id": build_id,
        "build_code": build_code,
        "lot_id": lot_id,
    }


def _fetch_sale_txn(cur, order_ref: str) -> dict:
    cur.execute(
        """SELECT id, type, product_ean, build_code, source, source_email_id, cogs, profit
           FROM transactions
           WHERE order_reference = %s""",
        (order_ref,),
    )
    row = cur.fetchone()
    assert row is not None, f"sale transaction not found for {order_ref}"
    return row


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
                "(SELECT id FROM transactions WHERE order_reference LIKE %s OR order_reference LIKE %s)",
                (f"ORD-D05-{TAG}%", f"bol-ORD-D05-{TAG}%"),
            )
            cur.execute(
                "DELETE FROM transactions WHERE order_reference LIKE %s OR order_reference LIKE %s",
                (f"ORD-D05-{TAG}%", f"bol-ORD-D05-{TAG}%"),
            )
            cur.execute(
                "DELETE FROM ingestion_events WHERE message_id LIKE %s OR external_id LIKE %s",
                (f"test-d05-{TAG}%", f"bol-ORD-D05-{TAG}%"),
            )
            cur.execute(
                "DELETE FROM stock_lots WHERE product_id IN "
                "(SELECT id FROM products WHERE ean LIKE %s)",
                (f"TEST-D05-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM external_item_xref WHERE build_code LIKE %s",
                (f"TEST-D05-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM build_components WHERE build_id IN "
                "(SELECT id FROM builds WHERE build_code LIKE %s)",
                (f"TEST-D05-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code LIKE %s",
                (f"TEST-D05-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_group_members WHERE item_group_id IN "
                "(SELECT id FROM item_groups WHERE code LIKE %s)",
                (f"test_d05_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_groups WHERE code LIKE %s",
                (f"test_d05_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM products WHERE ean LIKE %s",
                (f"TEST-D05-{TAG}%",),
            )


def test_email_inline_processing_writes_build_backed_sale():
    marketplace = "mediamarktsaturn"
    order_ref = f"ORD-D05-{TAG}-EMAIL"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_build_stack(cur, "EMAIL", marketplace)
            cur.execute(
                """INSERT INTO ingestion_events
                       (message_id, source, marketplace, parsed_type, parsed_data, confidence, status)
                   VALUES (%s, 'email', %s, 'sale', %s, 0.9, 'pending')
                   RETURNING id""",
                (
                    f"test-d05-{TAG}-email",
                    marketplace,
                    json.dumps(
                        {
                            "order_number": order_ref,
                            "sku": ids["ean"],
                            "price": 399.0,
                            "quantity": 1,
                        }
                    ),
                ),
            )
            event_id = str(cur.fetchone()["id"])

    assert process_ingestion_event(event_id) == "processed"

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM ingestion_events WHERE id = %s",
                (event_id,),
            )
            assert cur.fetchone()["status"] == "processed"
            txn = _fetch_sale_txn(cur, order_ref)
            assert txn["type"] == "sale"
            assert txn["product_ean"] == ids["build_code"]
            assert txn["build_code"] == ids["build_code"]
            assert str(txn["source_email_id"]) == event_id
            assert txn["cogs"] > 0
            assert txn["profit"] is not None

            cur.execute(
                "SELECT COUNT(*) AS n FROM stock_ledger_entries WHERE transaction_id = %s",
                (txn["id"],),
            )
            assert cur.fetchone()["n"] >= 1


def test_bol_poller_writes_build_backed_sale():
    order_id = f"ORD-D05-{TAG}-BOL"
    order_ref = f"bol-{order_id}-ITEM-D05"
    offer_ref = f"OFFER-D05-{TAG}"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_build_stack(cur, "BOL", BOL_MARKETPLACE, offer_ref=offer_ref)

    item = {
        "orderItemId": "ITEM-D05",
        "cancellationRequest": False,
        "fulfilment": {"method": "FBR", "distributionParty": "RETAILER"},
        "offer": {"offerId": "offer-item-d05", "reference": offer_ref},
        "product": {"ean": ids["ean"], "title": "T-D05 Product"},
        "quantity": 1,
        "unitPrice": 499.0,
        "totalPrice": 499.0,
        "commission": 5.0,
    }

    assert _process_order_item(item, order_id) == "new"

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            txn = _fetch_sale_txn(cur, order_ref)
            assert txn["type"] == "sale"
            assert txn["product_ean"] == ids["build_code"]
            assert txn["build_code"] == ids["build_code"]
            assert txn["source_email_id"] is not None
            assert txn["cogs"] > 0
            assert txn["profit"] is not None

            cur.execute(
                "SELECT COUNT(*) AS n FROM stock_ledger_entries WHERE transaction_id = %s",
                (txn["id"],),
            )
            assert cur.fetchone()["n"] >= 1


def test_no_python_runtime_callsite_uses_legacy_process_sale():
    offenders: list[str] = []
    for path in sorted((REPO_ROOT / "apps" / "api").rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if "process_sale(" in text:
            offenders.append(str(path.relative_to(REPO_ROOT)))

    assert offenders == [], f"legacy process_sale() callsites still present: {offenders}"
