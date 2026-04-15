"""
T-C01 — Profit transaction immutability tests.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_C01_profit_immutability.py -v --tb=short
"""
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from auth import require_session
from main import app

app.dependency_overrides[require_session] = lambda: {"user_id": "test-user"}


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(scope="session")
def client(init_pool):
    from starlette.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def seeded_sale():
    tag = uuid.uuid4().hex[:8]
    order_ref = f"TC01-{tag}"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO transactions (
                    type, product_ean, quantity, unit_price, total_price,
                    marketplace, order_reference, cogs, profit
                ) VALUES (
                    'sale', %s, 1, 100.0, 100.0,
                    'BolCom', %s, 57.5, 42.5
                )
                RETURNING id
                """,
                (f"TC01-EAN-{tag}", order_ref),
            )
            txn_id = str(cur.fetchone()["id"])
    try:
        yield {"txn_id": txn_id}
    finally:
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM transactions WHERE id = %s", (txn_id,))


def _fetch_txn(txn_id: str) -> dict:
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT unit_price, total_price, marketplace, order_reference, cogs, profit
                FROM transactions
                WHERE id = %s
                """,
                (txn_id,),
            )
            return cur.fetchone()


def test_price_change_rejected_for_stored_sale_economics(client, seeded_sale):
    txn_id = seeded_sale["txn_id"]

    before = _fetch_txn(txn_id)
    r = client.patch(f"/api/profit/transactions/{txn_id}", json={"unit_price": 125.0})

    assert r.status_code == 409, r.text
    assert "D-025" in r.json()["detail"]

    after = _fetch_txn(txn_id)
    assert after["unit_price"] == before["unit_price"]
    assert after["total_price"] == before["total_price"]
    assert after["cogs"] == before["cogs"]
    assert after["profit"] == before["profit"]


def test_metadata_update_keeps_stored_financials_unchanged(client, seeded_sale):
    txn_id = seeded_sale["txn_id"]

    before = _fetch_txn(txn_id)
    r = client.patch(
        f"/api/profit/transactions/{txn_id}",
        json={"marketplace": "MediaMarktSaturn", "order_reference": "TC01-UPDATED"},
    )

    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}

    after = _fetch_txn(txn_id)
    assert after["marketplace"] == "MediaMarktSaturn"
    assert after["order_reference"] == "TC01-UPDATED"
    assert after["unit_price"] == before["unit_price"]
    assert after["total_price"] == before["total_price"]
    assert after["cogs"] == before["cogs"]
    assert after["profit"] == before["profit"]


if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    if exit_code == 0:
        print("\nT-C01 API TESTS PASSED")
    else:
        print("\nT-C01 API TESTS FAILED")
    raise SystemExit(exit_code)
