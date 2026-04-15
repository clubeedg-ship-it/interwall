"""
T-B01 — Bol.com order poller tests.
10 cases testing the full poll -> ingest -> process pipeline.

Real DB (cleaned up per-test). Mocked Bol.com API via httpx.MockTransport.
Seed data with UUID prefix for concurrent-run isolation.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_B01_bol_poller.py -v --tb=short
"""

import json
import uuid
import time
import pytest
import sys
from decimal import Decimal

import httpx

sys.path.insert(0, "/app")

import db
from poller.bol_client import BolClient
from poller.bol_poller import poll_bol_once, MARKETPLACE

TAG = uuid.uuid4().hex[:6]


# -- Mock helpers -------------------------------------------------------------


def _make_mock_transport(
    orders_list=None,
    order_details=None,
    token_handler=None,
    orders_handler=None,
):
    """Create a MockTransport for Bol.com API calls."""

    def handler(request: httpx.Request) -> httpx.Response:
        path = str(request.url.path)

        # Token endpoint
        if path == "/token":
            if token_handler:
                return token_handler(request)
            return httpx.Response(
                200,
                json={
                    "access_token": "mock-token",
                    "token_type": "Bearer",
                    "expires_in": 299,
                },
            )

        # Orders list
        if path == "/retailer/orders":
            if orders_handler:
                return orders_handler(request)
            return httpx.Response(200, json={"orders": orders_list or []})

        # Order detail
        if path.startswith("/retailer/orders/"):
            order_id = path.split("/")[-1]
            if order_details and order_id in order_details:
                return httpx.Response(200, json=order_details[order_id])
            return httpx.Response(404, json={"status": 404})

        return httpx.Response(404)

    return httpx.MockTransport(handler)


def _make_client(transport: httpx.MockTransport) -> BolClient:
    return BolClient(
        client_id="test-id",
        client_secret="test-secret",
        http_client=httpx.Client(transport=transport),
    )


def _make_order_list_item(order_id: str) -> dict:
    return {"orderId": order_id, "orderPlacedDateTime": "2026-04-15T10:00:00+02:00"}


def _make_order_detail(order_id: str, items: list) -> dict:
    return {
        "orderId": order_id,
        "pickupPoint": False,
        "orderPlacedDateTime": "2026-04-15T10:00:00+02:00",
        "orderItems": items,
    }


def _make_order_item(
    order_item_id: str,
    ean: str,
    offer_reference=None,
    quantity: int = 1,
    unit_price: float = 100.0,
    total_price: float = 100.0,
    commission: float = 5.0,
    fulfilment_method: str = "FBR",
    cancellation_request: bool = False,
) -> dict:
    item = {
        "orderItemId": order_item_id,
        "cancellationRequest": cancellation_request,
        "fulfilment": {
            "method": fulfilment_method,
            "distributionParty": "RETAILER" if fulfilment_method == "FBR" else "BOL",
        },
        "offer": {"offerId": f"offer-{order_item_id}"},
        "product": {"ean": ean, "title": f"Test Product {ean}"},
        "quantity": quantity,
        "unitPrice": unit_price,
        "totalPrice": total_price,
        "commission": commission,
    }
    if offer_reference is not None:
        item["offer"]["reference"] = offer_reference
    return item


# -- DB helpers ---------------------------------------------------------------


def _seed_full_stack(cur, suffix, offer_ref=None, stock_qty=10, unit_cost=50.0):
    """Create product + item_group + build + component + stock_lot + xref.

    Returns dict with IDs and ean.
    """
    ean = f"TEST-B01-{TAG}-{suffix}"
    ids = {"ean": ean}

    cur.execute(
        "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
        (ean, f"Test Product {suffix}"),
    )
    ids["product_id"] = str(cur.fetchone()["id"])

    group_code = f"test_b01_{TAG}_{suffix}"
    cur.execute(
        "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
        (group_code, f"Group {suffix}"),
    )
    ids["group_id"] = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO item_group_members (item_group_id, product_id) VALUES (%s, %s)",
        (ids["group_id"], ids["product_id"]),
    )

    build_code = ean  # backfill convention: build_code = EAN
    cur.execute(
        """INSERT INTO builds (build_code, name, is_auto_generated, is_active)
           VALUES (%s, %s, TRUE, TRUE) RETURNING id""",
        (build_code, f"Build {suffix}"),
    )
    ids["build_id"] = str(cur.fetchone()["id"])
    ids["build_code"] = build_code

    cur.execute(
        "INSERT INTO build_components (build_id, item_group_id, quantity) VALUES (%s, %s, 1)",
        (ids["build_id"], ids["group_id"]),
    )

    cur.execute(
        """INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at)
           VALUES (%s, %s, %s, NOW() - INTERVAL '1 day') RETURNING id""",
        (ids["product_id"], stock_qty, unit_cost),
    )
    ids["lot_id"] = str(cur.fetchone()["id"])

    if offer_ref:
        cur.execute(
            """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
               VALUES (%s, %s, %s)""",
            (MARKETPLACE, offer_ref, build_code),
        )

    return ids


# -- Fixtures -----------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(autouse=True)
def cleanup_test_data():
    yield
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # FK-safe deletion order
            cur.execute(
                "DELETE FROM stock_ledger_entries WHERE transaction_id IN "
                "(SELECT id FROM transactions WHERE order_reference LIKE %s)",
                (f"bol-TEST-B01-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM transactions WHERE order_reference LIKE %s",
                (f"bol-TEST-B01-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM ingestion_events WHERE external_id LIKE %s",
                (f"bol-TEST-B01-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM stock_lots WHERE product_id IN "
                "(SELECT id FROM products WHERE ean LIKE %s)",
                (f"TEST-B01-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM external_item_xref WHERE build_code LIKE %s",
                (f"TEST-B01-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM build_components WHERE build_id IN "
                "(SELECT id FROM builds WHERE build_code LIKE %s)",
                (f"TEST-B01-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code LIKE %s",
                (f"TEST-B01-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_group_members WHERE item_group_id IN "
                "(SELECT id FROM item_groups WHERE code LIKE %s)",
                (f"test_b01_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_groups WHERE code LIKE %s",
                (f"test_b01_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM products WHERE ean LIKE %s",
                (f"TEST-B01-{TAG}%",),
            )


# -- Test Cases ---------------------------------------------------------------


def test_case1_happy_path_single_item():
    """Case 1 -- Happy path: single FBR order item, processed end-to-end."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_full_stack(cur, "C1", offer_ref="OFFER-C1")

    order_id = f"TEST-B01-{TAG}-C1"
    item = _make_order_item("ITEM-C1", ids["ean"], offer_reference="OFFER-C1",
                            quantity=1, unit_price=500.0, total_price=500.0,
                            commission=5.0)
    detail = _make_order_detail(order_id, [item])

    transport = _make_mock_transport(
        orders_list=[_make_order_list_item(order_id)],
        order_details={order_id: detail},
    )
    poll_bol_once(client=_make_client(transport))

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # Ingestion event recorded and processed
            cur.execute(
                "SELECT status, source, marketplace FROM ingestion_events "
                "WHERE external_id = %s",
                (f"bol-{order_id}-ITEM-C1",),
            )
            ie = cur.fetchone()
            assert ie is not None, "No ingestion_events row"
            assert ie["status"] == "processed"
            assert ie["source"] == "bolcom_api"
            assert ie["marketplace"] == MARKETPLACE

            # Transaction created with correct values
            cur.execute(
                "SELECT unit_price, total_price, cogs, profit, build_code "
                "FROM transactions WHERE order_reference = %s",
                (f"bol-{order_id}-ITEM-C1",),
            )
            txn = cur.fetchone()
            assert txn is not None, "No transactions row"
            assert txn["unit_price"] == Decimal("500.0000")
            assert txn["total_price"] == Decimal("500.0000")
            assert txn["cogs"] == Decimal("50.0000")  # 1 unit at cost 50
            assert txn["build_code"] == ids["build_code"]

            # Ledger row exists
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM stock_ledger_entries sle "
                "JOIN transactions t ON sle.transaction_id = t.id "
                "WHERE t.order_reference = %s",
                (f"bol-{order_id}-ITEM-C1",),
            )
            assert cur.fetchone()["cnt"] >= 1

            # Stock decremented
            cur.execute(
                "SELECT quantity FROM stock_lots WHERE id = %s",
                (ids["lot_id"],),
            )
            assert cur.fetchone()["quantity"] == 9


def test_case2_duplicate_poll_skipped():
    """Case 2 -- At-least-once: duplicate poll is skipped."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_full_stack(cur, "C2", offer_ref="OFFER-C2")

    order_id = f"TEST-B01-{TAG}-C2"
    item = _make_order_item("ITEM-C2", ids["ean"], offer_reference="OFFER-C2",
                            quantity=1, unit_price=500.0, total_price=500.0)
    detail = _make_order_detail(order_id, [item])

    transport = _make_mock_transport(
        orders_list=[_make_order_list_item(order_id)],
        order_details={order_id: detail},
    )
    client = _make_client(transport)

    poll_bol_once(client=client)
    poll_bol_once(client=client)

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # Exactly 1 ingestion_events row
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM ingestion_events "
                "WHERE external_id = %s",
                (f"bol-{order_id}-ITEM-C2",),
            )
            assert cur.fetchone()["cnt"] == 1

            # Exactly 1 transaction
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM transactions "
                "WHERE order_reference = %s",
                (f"bol-{order_id}-ITEM-C2",),
            )
            assert cur.fetchone()["cnt"] == 1


def test_case3_discount_absorbed():
    """Case 3 -- Discount absorbed into sale_price (D-099)."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_full_stack(cur, "C3", offer_ref="OFFER-C3")

    order_id = f"TEST-B01-{TAG}-C3"
    # unitPrice=100, quantity=2, totalPrice=180 (10% discount)
    item = _make_order_item("ITEM-C3", ids["ean"], offer_reference="OFFER-C3",
                            quantity=2, unit_price=100.0, total_price=180.0,
                            commission=5.0)
    detail = _make_order_detail(order_id, [item])

    transport = _make_mock_transport(
        orders_list=[_make_order_list_item(order_id)],
        order_details={order_id: detail},
    )
    poll_bol_once(client=_make_client(transport))

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT unit_price, total_price, quantity FROM transactions "
                "WHERE order_reference = %s",
                (f"bol-{order_id}-ITEM-C3",),
            )
            txn = cur.fetchone()
            assert txn is not None
            # sale_price = totalPrice/quantity = 180/2 = 90, not unitPrice (100)
            assert txn["unit_price"] == Decimal("90.0000")
            assert txn["total_price"] == Decimal("180.0000")
            assert txn["quantity"] == 2


def test_case4_commission_override():
    """Case 4 -- Commission override (D-098)."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_full_stack(cur, "C4", offer_ref="OFFER-C4",
                                   unit_cost=50.0)

    order_id = f"TEST-B01-{TAG}-C4"
    api_commission = 12.00  # exact amount from API
    item = _make_order_item("ITEM-C4", ids["ean"], offer_reference="OFFER-C4",
                            quantity=1, unit_price=500.0, total_price=500.0,
                            commission=api_commission)
    detail = _make_order_detail(order_id, [item])

    transport = _make_mock_transport(
        orders_list=[_make_order_list_item(order_id)],
        order_details={order_id: detail},
    )
    poll_bol_once(client=_make_client(transport))

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT cogs, profit, total_price FROM transactions "
                "WHERE order_reference = %s",
                (f"bol-{order_id}-ITEM-C4",),
            )
            txn = cur.fetchone()
            assert txn is not None
            total = txn["total_price"]  # 500
            cogs = txn["cogs"]  # 50

            # Compute expected profit with commission override:
            # overhead (non-commission fixed_costs) + commission_override + VAT
            cur.execute(
                """SELECT COALESCE(SUM(
                       CASE WHEN is_percentage
                            THEN %s * value / 100
                            ELSE value
                       END
                   ), 0) AS non_commission_costs
                   FROM fixed_costs
                   WHERE LOWER(name) != 'commission'""",
                (total,),
            )
            non_commission = cur.fetchone()["non_commission_costs"]

            cur.execute(
                "SELECT rate FROM vat_rates WHERE LOWER(marketplace) = LOWER(%s)",
                (MARKETPLACE,),
            )
            vat_rate = cur.fetchone()["rate"]
            vat = total * vat_rate / 100

            expected_profit = total - cogs - non_commission - Decimal(str(api_commission)) - vat
            assert txn["profit"] == expected_profit, (
                f"profit {txn['profit']} != expected {expected_profit}"
            )

            # Also verify it's NOT the percentage-based commission
            cur.execute(
                "SELECT value FROM fixed_costs WHERE LOWER(name) = 'commission'"
            )
            pct_commission = cur.fetchone()["value"]
            pct_commission_amount = total * pct_commission / 100
            if pct_commission_amount != Decimal(str(api_commission)):
                # If they differ, profit must NOT match what pct would give
                pct_profit = total - cogs - non_commission - pct_commission_amount - vat
                assert txn["profit"] != pct_profit, "Override was ignored"


def test_case5_offer_reference_null_ean_fallback():
    """Case 5 -- offer.reference null -> EAN fallback (Q2)."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # Create build with xref on EAN (not offer_reference)
            ids = _seed_full_stack(cur, "C5")
            # Add xref using EAN as the external_sku
            cur.execute(
                """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
                   VALUES (%s, %s, %s)""",
                (MARKETPLACE, ids["ean"], ids["build_code"]),
            )

    order_id = f"TEST-B01-{TAG}-C5"
    # offer.reference is None (not in the item dict)
    item = _make_order_item("ITEM-C5", ids["ean"], offer_reference=None,
                            quantity=1, unit_price=500.0, total_price=500.0)
    detail = _make_order_detail(order_id, [item])

    transport = _make_mock_transport(
        orders_list=[_make_order_list_item(order_id)],
        order_details={order_id: detail},
    )
    poll_bol_once(client=_make_client(transport))

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM ingestion_events WHERE external_id = %s",
                (f"bol-{order_id}-ITEM-C5",),
            )
            ie = cur.fetchone()
            assert ie is not None
            assert ie["status"] == "processed"

            cur.execute(
                "SELECT build_code FROM transactions WHERE order_reference = %s",
                (f"bol-{order_id}-ITEM-C5",),
            )
            txn = cur.fetchone()
            assert txn is not None
            assert txn["build_code"] == ids["build_code"]


def test_case6_fbb_filtered():
    """Case 6 -- FBB item filtered out (P-14)."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids_fbr = _seed_full_stack(cur, "C6F", offer_ref="OFFER-C6F")
            ids_fbb = _seed_full_stack(cur, "C6B", offer_ref="OFFER-C6B")

    order_id = f"TEST-B01-{TAG}-C6"
    fbr_item = _make_order_item("ITEM-C6F", ids_fbr["ean"],
                                offer_reference="OFFER-C6F",
                                fulfilment_method="FBR")
    fbb_item = _make_order_item("ITEM-C6B", ids_fbb["ean"],
                                offer_reference="OFFER-C6B",
                                fulfilment_method="FBB")
    detail = _make_order_detail(order_id, [fbr_item, fbb_item])

    transport = _make_mock_transport(
        orders_list=[_make_order_list_item(order_id)],
        order_details={order_id: detail},
    )
    poll_bol_once(client=_make_client(transport))

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # FBR item processed
            cur.execute(
                "SELECT status FROM ingestion_events WHERE external_id = %s",
                (f"bol-{order_id}-ITEM-C6F",),
            )
            ie = cur.fetchone()
            assert ie is not None
            assert ie["status"] == "processed"

            # FBB item NOT in ingestion_events at all
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM ingestion_events "
                "WHERE external_id = %s",
                (f"bol-{order_id}-ITEM-C6B",),
            )
            assert cur.fetchone()["cnt"] == 0


def test_case7_cancellation_skipped():
    """Case 7 -- cancellationRequest=true skipped."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_full_stack(cur, "C7", offer_ref="OFFER-C7")

    order_id = f"TEST-B01-{TAG}-C7"
    item = _make_order_item("ITEM-C7", ids["ean"], offer_reference="OFFER-C7",
                            cancellation_request=True)
    detail = _make_order_detail(order_id, [item])

    transport = _make_mock_transport(
        orders_list=[_make_order_list_item(order_id)],
        order_details={order_id: detail},
    )
    poll_bol_once(client=_make_client(transport))

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM ingestion_events "
                "WHERE external_id = %s",
                (f"bol-{order_id}-ITEM-C7",),
            )
            assert cur.fetchone()["cnt"] == 0

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM transactions "
                "WHERE order_reference = %s",
                (f"bol-{order_id}-ITEM-C7",),
            )
            assert cur.fetchone()["cnt"] == 0


def test_case8_xref_missing_ean_no_build():
    """Case 8 -- No xref, no build for EAN -> RAISE (D-033)."""
    # Product exists but has no build, no xref
    unknown_ean = f"TEST-B01-{TAG}-C8"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO products (ean, name) VALUES (%s, %s)",
                (unknown_ean, "Unknown Product C8"),
            )

    order_id = f"TEST-B01-{TAG}-C8"
    item = _make_order_item("ITEM-C8", unknown_ean, offer_reference=None)
    detail = _make_order_detail(order_id, [item])

    transport = _make_mock_transport(
        orders_list=[_make_order_list_item(order_id)],
        order_details={order_id: detail},
    )
    poll_bol_once(client=_make_client(transport))

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, error_message FROM ingestion_events "
                "WHERE external_id = %s",
                (f"bol-{order_id}-ITEM-C8",),
            )
            ie = cur.fetchone()
            assert ie is not None
            assert ie["status"] == "failed"
            assert "D-033" in ie["error_message"]

            # No transaction created
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM transactions "
                "WHERE order_reference = %s",
                (f"bol-{order_id}-ITEM-C8",),
            )
            assert cur.fetchone()["cnt"] == 0


def test_case9_oauth_401_retry():
    """Case 9 -- OAuth 401 mid-run -> refresh + retry succeeds."""
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            ids = _seed_full_stack(cur, "C9", offer_ref="OFFER-C9")

    order_id = f"TEST-B01-{TAG}-C9"
    item = _make_order_item("ITEM-C9", ids["ean"], offer_reference="OFFER-C9",
                            quantity=1, unit_price=500.0, total_price=500.0)
    detail = _make_order_detail(order_id, [item])

    call_count = {"orders": 0}

    def orders_handler(request):
        call_count["orders"] += 1
        if call_count["orders"] == 1:
            return httpx.Response(401)
        return httpx.Response(
            200, json={"orders": [_make_order_list_item(order_id)]}
        )

    transport = _make_mock_transport(
        order_details={order_id: detail},
        orders_handler=orders_handler,
    )
    poll_bol_once(client=_make_client(transport))

    # The retry succeeded: order was processed
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM ingestion_events WHERE external_id = %s",
                (f"bol-{order_id}-ITEM-C9",),
            )
            ie = cur.fetchone()
            assert ie is not None
            assert ie["status"] == "processed"

    # Verify: 2 calls to orders endpoint (1 failed + 1 retry)
    assert call_count["orders"] == 2


def test_case10_token_ttl_caching():
    """Case 10 -- Token TTL caching: only 1 POST to /token for 3 calls."""
    token_calls = {"count": 0}

    def token_handler(request):
        token_calls["count"] += 1
        return httpx.Response(
            200,
            json={
                "access_token": "cached-token",
                "token_type": "Bearer",
                "expires_in": 299,
            },
        )

    transport = _make_mock_transport(token_handler=token_handler)
    client = _make_client(transport)

    t1 = client.get_token()
    t2 = client.get_token()
    t3 = client.get_token()

    assert t1 == t2 == t3 == "cached-token"
    assert token_calls["count"] == 1, (
        f"Expected 1 token request, got {token_calls['count']}"
    )


# -- Final pass/fail line ----------------------------------------------------
if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    if exit_code == 0:
        print("\nT-B01 ALL TESTS PASSED")
    else:
        print("\nT-B01 TESTS FAILED")
    raise SystemExit(exit_code)
