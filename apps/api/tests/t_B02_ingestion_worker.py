"""
T-B02 — Unified ingestion worker tests (8 cases).

Real DB (cleaned up per-test). Worker called directly (no mock transport).
Seed data with UUID TAG suffix for concurrent-run isolation.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_B02_ingestion_worker.py -v --tb=short
"""

import json
import uuid
import pytest
import sys
from decimal import Decimal

sys.path.insert(0, "/app")

import db
from ingestion.worker import process_pending_events, MAX_RETRIES, WORKER_BATCH_SIZE
from poller.bol_poller import MARKETPLACE as BOL_MARKETPLACE

TAG = uuid.uuid4().hex[:6]


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _seed_full_stack(cur, suffix, marketplace=None, stock_qty=10, unit_cost=50.0,
                     offer_ref=None):
    """Create product + item_group + build + component + stock_lot.
    Mirrors t_B01_bol_poller._seed_full_stack pattern.
    Returns dict with ids and ean."""
    ean = f"TEST-B02-{TAG}-{suffix}"
    mp = marketplace or BOL_MARKETPLACE

    cur.execute(
        "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
        (ean, f"Test B02 Product {suffix}"),
    )
    product_id = str(cur.fetchone()["id"])

    group_code = f"test_b02_{TAG}_{suffix}"
    cur.execute(
        "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
        (group_code, f"Group {suffix}"),
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
        (build_code, f"Build {suffix}"),
    )
    build_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO build_components (build_id, item_group_id, quantity) VALUES (%s, %s, 1)",
        (build_id, group_id),
    )

    lot_id = None
    if stock_qty > 0:
        cur.execute(
            """INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at)
               VALUES (%s, %s, %s, NOW() - INTERVAL '1 day') RETURNING id""",
            (product_id, stock_qty, unit_cost),
        )
        lot_id = str(cur.fetchone()["id"])

    if offer_ref:
        cur.execute(
            "INSERT INTO external_item_xref (marketplace, external_sku, build_code) VALUES (%s, %s, %s)",
            (mp, offer_ref, build_code),
        )

    return {
        "ean": ean, "product_id": product_id, "group_id": group_id,
        "build_id": build_id, "build_code": build_code, "lot_id": lot_id,
    }


def _insert_bolcom_event(cur, suffix, ean, offer_ref=None, status="pending",
                         retry_count=0, marketplace=None):
    """Insert a bolcom_api ingestion_events row. Returns event id string."""
    mp = marketplace or BOL_MARKETPLACE
    ext_id = f"test-b02-{TAG}-{suffix}"
    parsed = {
        "orderItemId": f"ITEM-{TAG}-{suffix}",
        "offer": {"reference": offer_ref} if offer_ref else {},
        "product": {"ean": ean},
        "quantity": 1,
        "unitPrice": 500.0,
        "totalPrice": 500.0,
        "commission": 5.0,
        "fulfilment": {"method": "FBR"},
    }
    cur.execute(
        """INSERT INTO ingestion_events
               (message_id, source, external_id, marketplace, parsed_type,
                parsed_data, confidence, status, retry_count)
           VALUES (%s, 'bolcom_api', %s, %s, 'sale', %s, 1.00, %s, %s)
           RETURNING id""",
        (ext_id, ext_id, mp, json.dumps(parsed), status, retry_count),
    )
    return str(cur.fetchone()["id"])


def _insert_email_event(cur, suffix, sku, marketplace, price=500.0, qty=1,
                        status="pending", retry_count=0):
    """Insert an email ingestion_events row. Returns event id string."""
    msg_id = f"test-b02-{TAG}-email-{suffix}"
    parsed = {"order_number": f"ORD-B02-{TAG}-{suffix}", "sku": sku,
              "price": price, "quantity": qty}
    cur.execute(
        """INSERT INTO ingestion_events
               (message_id, source, marketplace, parsed_type,
                parsed_data, confidence, status, retry_count)
           VALUES (%s, 'email', %s, 'sale', %s, 0.9, %s, %s)
           RETURNING id""",
        (msg_id, marketplace, json.dumps(parsed), status, retry_count),
    )
    return str(cur.fetchone()["id"])


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(scope="session", autouse=True)
def apply_migrations(init_pool):
    """Ensure retry_count column and health views exist (idempotent)."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "ALTER TABLE ingestion_events "
                "ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0"
            )
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """CREATE OR REPLACE VIEW v_health_ingestion_failed AS
                   SELECT id, source, marketplace, external_id,
                          retry_count, error_message, created_at
                   FROM ingestion_events
                   WHERE status = 'failed' AND retry_count < 5"""
            )
            cur.execute(
                """CREATE OR REPLACE VIEW v_health_ingestion_dead_letter AS
                   SELECT id, source, marketplace, external_id,
                          retry_count, error_message, dead_letter_reason, created_at
                   FROM ingestion_events
                   WHERE status = 'dead_letter'"""
            )


@pytest.fixture(autouse=True)
def cleanup_test_data():
    yield
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # FK-safe deletion order
            cur.execute(
                "DELETE FROM stock_ledger_entries WHERE transaction_id IN "
                "(SELECT id FROM transactions WHERE product_ean LIKE %s "
                "   OR order_reference LIKE %s)",
                (f"TEST-B02-{TAG}%", f"test-b02-{TAG}%"),
            )
            cur.execute(
                "DELETE FROM transactions WHERE product_ean LIKE %s OR order_reference LIKE %s",
                (f"TEST-B02-{TAG}%", f"test-b02-{TAG}%"),
            )
            cur.execute(
                "DELETE FROM ingestion_events WHERE external_id LIKE %s "
                "   OR message_id LIKE %s",
                (f"test-b02-{TAG}%", f"test-b02-{TAG}%"),
            )
            cur.execute(
                "DELETE FROM stock_lots WHERE product_id IN "
                "(SELECT id FROM products WHERE ean LIKE %s)",
                (f"TEST-B02-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM external_item_xref WHERE build_code LIKE %s",
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
                (f"test_b02_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_groups WHERE code LIKE %s",
                (f"test_b02_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM products WHERE ean LIKE %s",
                (f"TEST-B02-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM vat_rates WHERE marketplace LIKE %s",
                (f"test_b02_{TAG}%",),
            )


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

def test_case1_happy_path_bolcom_api():
    """Case 1 — Happy path bolcom_api: pending event → processed, D-017, D-025."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_full_stack(cur, "C1", offer_ref=f"OFFER-B02-{TAG}-C1")
            event_id = _insert_bolcom_event(
                cur, "C1", ids["ean"], offer_ref=f"OFFER-B02-{TAG}-C1"
            )

    process_pending_events()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, processed_at, retry_count FROM ingestion_events WHERE id = %s",
                (event_id,),
            )
            ie = cur.fetchone()
            assert ie["status"] == "processed", f"Expected processed, got {ie['status']}"
            assert ie["processed_at"] is not None
            assert ie["retry_count"] == 0

            cur.execute(
                "SELECT COUNT(*) AS n FROM transactions WHERE product_ean = %s AND type = 'sale'",
                (ids["ean"],),
            )
            assert cur.fetchone()["n"] == 1

            cur.execute(
                "SELECT COUNT(*) AS n FROM stock_ledger_entries sle "
                "JOIN transactions t ON sle.transaction_id = t.id "
                "WHERE t.product_ean = %s",
                (ids["ean"],),
            )
            assert cur.fetchone()["n"] >= 1  # D-017

            cur.execute(
                "SELECT cogs, profit FROM transactions WHERE product_ean = %s",
                (ids["ean"],),
            )
            txn = cur.fetchone()
            assert txn["cogs"] is not None and txn["cogs"] > 0  # D-025
            assert txn["profit"] is not None


def test_case2_happy_path_email():
    """Case 2 — Happy path email: pending event → processed, same D-017/D-025 invariants."""
    mp = "mediamarktsaturn"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_full_stack(cur, "C2", marketplace=mp)
            # Add xref so write_sale resolves via external_item_xref path
            cur.execute(
                "INSERT INTO external_item_xref (marketplace, external_sku, build_code) VALUES (%s, %s, %s)",
                (mp, ids["ean"], ids["build_code"]),
            )
            event_id = _insert_email_event(cur, "C2", ids["ean"], mp)

    process_pending_events()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, retry_count FROM ingestion_events WHERE id = %s",
                (event_id,),
            )
            ie = cur.fetchone()
            assert ie["status"] == "processed"
            assert ie["retry_count"] == 0

            cur.execute(
                "SELECT COUNT(*) AS n FROM transactions WHERE product_ean = %s AND type = 'sale'",
                (ids["ean"],),
            )
            assert cur.fetchone()["n"] == 1

            cur.execute(
                "SELECT COUNT(*) AS n FROM stock_ledger_entries sle "
                "JOIN transactions t ON sle.transaction_id = t.id "
                "WHERE t.product_ean = %s",
                (ids["ean"],),
            )
            assert cur.fetchone()["n"] >= 1  # D-017

            cur.execute(
                "SELECT cogs, profit FROM transactions WHERE product_ean = %s",
                (ids["ean"],),
            )
            txn = cur.fetchone()
            assert txn["cogs"] is not None and txn["cogs"] > 0
            assert txn["profit"] is not None


def test_case3_transient_failure_retry_recovers():
    """Case 3 — Transient failure, retry recovers. retry_count carries through on success."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # No stock → process_bom_sale will raise (deduct_fifo_for_group: insufficient)
            ids = _seed_full_stack(cur, "C3", offer_ref=f"OFFER-B02-{TAG}-C3", stock_qty=0)
            event_id = _insert_bolcom_event(
                cur, "C3", ids["ean"], offer_ref=f"OFFER-B02-{TAG}-C3"
            )

    # First run: no stock → failure
    process_pending_events()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, retry_count FROM ingestion_events WHERE id = %s",
                (event_id,),
            )
            ie = cur.fetchone()
            assert ie["status"] == "failed", f"Expected failed, got {ie['status']}"
            assert ie["retry_count"] == 1

    # Seed stock
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at) "
                "VALUES (%s, 10, 50.0, NOW() - INTERVAL '1 day')",
                (ids["product_id"],),
            )

    # Second run: stock available → success, retry_count stays at 1
    process_pending_events()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, retry_count FROM ingestion_events WHERE id = %s",
                (event_id,),
            )
            ie = cur.fetchone()
            assert ie["status"] == "processed"
            assert ie["retry_count"] == 1  # carry-through, not reset


def test_case4_hard_failure_dead_letter():
    """Case 4 — Hard failure → dead_letter after MAX_RETRIES. D-022 rollback holds."""
    # EAN with no build and no xref → _resolve_build_code always raises
    no_build_ean = f"TEST-B02-{TAG}-C4-NOBLD"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            event_id = _insert_bolcom_event(
                cur, "C4", no_build_ean,  # no offer_ref, no xref, no build
            )

    for i in range(1, MAX_RETRIES):
        process_pending_events()
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, retry_count FROM ingestion_events WHERE id = %s",
                    (event_id,),
                )
                ie = cur.fetchone()
                assert ie["status"] == "failed", f"iter {i}: expected failed, got {ie['status']}"
                assert ie["retry_count"] == i, f"iter {i}: expected retry_count={i}"

    # Final run → dead_letter
    process_pending_events()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, retry_count, dead_letter_reason FROM ingestion_events WHERE id = %s",
                (event_id,),
            )
            ie = cur.fetchone()
            assert ie["status"] == "dead_letter"
            assert ie["retry_count"] == MAX_RETRIES
            assert ie["dead_letter_reason"] is not None

            # No transactions row (D-022 rollback held)
            cur.execute(
                "SELECT COUNT(*) AS n FROM transactions WHERE product_ean = %s",
                (no_build_ean,),
            )
            assert cur.fetchone()["n"] == 0


def test_case5_unknown_source_review():
    """Case 5 — Unknown source → review, retry_count unchanged."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ext_id = f"test-b02-{TAG}-C5-mystery"
            cur.execute(
                """INSERT INTO ingestion_events
                       (message_id, source, external_id, marketplace, parsed_type,
                        parsed_data, confidence, status, retry_count)
                   VALUES (%s, 'mystery', %s, 'bolcom', 'sale', '{}', 1.0, 'pending', 0)
                   RETURNING id""",
                (ext_id, ext_id),
            )
            event_id = str(cur.fetchone()["id"])

    process_pending_events()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, retry_count, dead_letter_reason FROM ingestion_events WHERE id = %s",
                (event_id,),
            )
            ie = cur.fetchone()
            assert ie["status"] == "review"
            assert ie["retry_count"] == 0  # unchanged
            assert "unknown source" in (ie["dead_letter_reason"] or "")


def test_case6_batch_size_respected():
    """Case 6 — Insert 30 events; assert at most WORKER_BATCH_SIZE flip state per tick."""
    event_ids = []
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            for i in range(30):
                ext_id = f"test-b02-{TAG}-C6-{i:03d}"
                cur.execute(
                    """INSERT INTO ingestion_events
                           (message_id, source, external_id, marketplace,
                            parsed_type, parsed_data, confidence, status, retry_count)
                       VALUES (%s, 'mystery', %s, 'bolcom', 'sale', '{}', 1.0, 'pending', 0)
                       RETURNING id""",
                    (ext_id, ext_id),
                )
                event_ids.append(str(cur.fetchone()["id"]))

    process_pending_events()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            placeholders = ",".join(["%s"] * len(event_ids))
            cur.execute(
                f"SELECT COUNT(*) AS n FROM ingestion_events "
                f"WHERE id IN ({placeholders}) AND status = 'pending'",
                event_ids,
            )
            remaining_pending = cur.fetchone()["n"]

    assert remaining_pending == 30 - WORKER_BATCH_SIZE, (
        f"Expected {30 - WORKER_BATCH_SIZE} pending, got {remaining_pending}"
    )


def test_case7_terminal_states_untouched():
    """Case 7 — processed, dead_letter, review events are never picked up."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            rows = []
            for status, rc in [("processed", 0), ("dead_letter", 5), ("review", 0)]:
                ext_id = f"test-b02-{TAG}-C7-{status}"
                cur.execute(
                    """INSERT INTO ingestion_events
                           (message_id, source, external_id, marketplace,
                            parsed_type, parsed_data, confidence, status, retry_count)
                       VALUES (%s, 'bolcom_api', %s, 'bolcom', 'sale', '{}', 1.0, %s, %s)
                       RETURNING id""",
                    (ext_id, ext_id, status, rc),
                )
                rows.append((str(cur.fetchone()["id"]), status, rc))

    process_pending_events()

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            for event_id, expected_status, expected_rc in rows:
                cur.execute(
                    "SELECT status, retry_count FROM ingestion_events WHERE id = %s",
                    (event_id,),
                )
                ie = cur.fetchone()
                assert ie["status"] == expected_status, (
                    f"Terminal state {expected_status} was changed to {ie['status']}"
                )
                assert ie["retry_count"] == expected_rc


def test_case8_d022_atomicity_vat_missing():
    """Case 8 — D-022 atomicity: VAT missing → no transactions, no ledger, no stock change."""
    mp = f"test_b02_{TAG}_atomic"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # Seed vat_rates (will be deleted before worker runs)
            cur.execute(
                "INSERT INTO vat_rates (marketplace, country, rate) VALUES (%s, 'NL', 21.00) "
                "ON CONFLICT (marketplace) DO NOTHING",
                (mp,),
            )
            ids = _seed_full_stack(cur, "C8", marketplace=mp)
            # xref for the email reprocessor
            cur.execute(
                "INSERT INTO external_item_xref (marketplace, external_sku, build_code) VALUES (%s, %s, %s)",
                (mp, ids["ean"], ids["build_code"]),
            )
            event_id = _insert_email_event(cur, "C8", ids["ean"], mp)

    # Capture initial stock quantity
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT quantity FROM stock_lots WHERE id = %s",
                (ids["lot_id"],),
            )
            initial_qty = cur.fetchone()["quantity"]

    # Delete vat_rates so process_bom_sale raises (D-027)
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM vat_rates WHERE marketplace = %s", (mp,))

    try:
        process_pending_events()

        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, error_message FROM ingestion_events WHERE id = %s",
                    (event_id,),
                )
                ie = cur.fetchone()
                assert ie["status"] == "failed", f"Expected failed, got {ie['status']}"
                assert ie["error_message"] is not None

                # No transactions row (D-022 rolled back)
                cur.execute(
                    "SELECT COUNT(*) AS n FROM transactions WHERE product_ean = %s",
                    (ids["ean"],),
                )
                assert cur.fetchone()["n"] == 0, "D-022: transaction row must not exist on failure"

                # Stock qty unchanged
                cur.execute(
                    "SELECT quantity FROM stock_lots WHERE id = %s",
                    (ids["lot_id"],),
                )
                assert cur.fetchone()["quantity"] == initial_qty, "D-022: stock must not be deducted"
    finally:
        # Restore vat_rates (cleanup_test_data handles it via LIKE pattern,
        # but explicit restore for clarity)
        try:
            with db.get_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "DELETE FROM vat_rates WHERE marketplace = %s", (mp,)
                    )
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Final pass/fail line
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    if exit_code == 0:
        print("\nT-B02 ALL TESTS PASSED")
    else:
        print("\nT-B02 TESTS FAILED")
    raise SystemExit(exit_code)
