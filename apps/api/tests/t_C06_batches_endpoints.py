"""
T-C06 — Batches endpoints (D-043, D-045).

Covers:
  a) list_active_batches_happy
  b) list_history_includes_depleted
  c) list_history_respects_limit
  d) list_active_only_returns_nonzero_quantity

Runner:
  docker compose exec -T api python -m pytest \
    /app/tests/t_C06_batches_endpoints.py -v --tb=short
"""
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from auth import require_session
from main import app

app.dependency_overrides[require_session] = lambda: {"user_id": "test-user"}

TAG = uuid.uuid4().hex[:8]


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(scope="session")
def client(init_pool):
    from starlette.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture()
def seeded_batches():
    """Seed one active batch (qty>0) and one depleted batch (qty=0)."""
    product_id = str(uuid.uuid4())
    ean = f"TC06-EAN-{TAG}-{uuid.uuid4().hex[:4]}"
    active_lot_id = str(uuid.uuid4())
    depleted_lot_id = str(uuid.uuid4())
    txn_id = str(uuid.uuid4())

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO products (id, ean, name, minimum_stock) "
                "VALUES (%s, %s, %s, 0)",
                (product_id, ean, f"TC06 Product {TAG}"),
            )
            cur.execute(
                """INSERT INTO stock_lots (id, product_id, quantity, unit_cost,
                                           marketplace, received_at)
                   VALUES (%s, %s, 25, 10.0000, 'test', NOW() - INTERVAL '1 day')""",
                (active_lot_id, product_id),
            )
            cur.execute(
                """INSERT INTO stock_lots (id, product_id, quantity, unit_cost,
                                           marketplace, received_at)
                   VALUES (%s, %s, 0, 12.0000, 'test', NOW() - INTERVAL '2 days')""",
                (depleted_lot_id, product_id),
            )
            # Sale transaction + ledger row draining the depleted lot
            cur.execute(
                """INSERT INTO transactions (id, type, product_ean, quantity,
                                             unit_price, total_price, marketplace,
                                             order_reference, cogs, profit)
                   VALUES (%s, 'sale', %s, 5, 20.0000, 100.0000, 'test',
                           %s, 60.0000, 40.0000)""",
                (txn_id, ean, f"TC06-ORD-{TAG}"),
            )
            cur.execute(
                """INSERT INTO stock_ledger_entries (transaction_id, stock_lot_id,
                                                    product_id, qty_delta,
                                                    unit_cost)
                   VALUES (%s, %s, %s, -5, 12.0000)""",
                (txn_id, depleted_lot_id, product_id),
            )

    ctx = {
        "product_id": product_id,
        "ean": ean,
        "active_lot_id": active_lot_id,
        "depleted_lot_id": depleted_lot_id,
        "txn_id": txn_id,
    }
    try:
        yield ctx
    finally:
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM stock_ledger_entries WHERE transaction_id = %s",
                    (txn_id,),
                )
                cur.execute("DELETE FROM transactions WHERE id = %s", (txn_id,))
                cur.execute(
                    "DELETE FROM stock_lots WHERE id IN (%s, %s)",
                    (active_lot_id, depleted_lot_id),
                )
                cur.execute("DELETE FROM products WHERE id = %s", (product_id,))


def test_list_active_batches_happy(client, seeded_batches):
    resp = client.get("/api/stock-lots")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert isinstance(rows, list)
    match = [r for r in rows if r["id"] == seeded_batches["active_lot_id"]]
    assert match, "seeded active lot missing"
    r = match[0]
    assert r["ean"] == seeded_batches["ean"]
    assert r["product_name"].startswith("TC06 Product")
    assert r["quantity"] == 25
    assert r["unit_cost"] == 10.0
    assert "received_at" in r
    assert "shelf_label" in r and "zone_name" in r


def test_list_history_includes_depleted(client, seeded_batches):
    resp = client.get("/api/stock-lots/history?include_depleted=1")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    by_id = {r["id"]: r for r in rows}

    active = by_id.get(seeded_batches["active_lot_id"])
    depleted = by_id.get(seeded_batches["depleted_lot_id"])
    assert active is not None, "active lot missing from history"
    assert depleted is not None, "depleted lot missing from history"

    assert active["depleted"] is False
    assert active["remaining_qty"] == 25
    assert active["initial_qty"] == 25
    assert active["movements"] == []

    assert depleted["depleted"] is True
    assert depleted["remaining_qty"] == 0
    # 0 remaining + 5 sold → initial = 5
    assert depleted["initial_qty"] == 5
    assert len(depleted["movements"]) == 1
    mv = depleted["movements"][0]
    assert mv["qty_delta"] == -5
    assert mv["transaction_id"] == seeded_batches["txn_id"]
    assert mv["unit_cost"] == 12.0


def test_list_history_respects_limit(client, seeded_batches):
    resp = client.get("/api/stock-lots/history?include_depleted=1&limit=1")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 1


def test_list_active_only_returns_nonzero_quantity(client, seeded_batches):
    resp = client.get("/api/stock-lots")
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    for r in rows:
        assert r["quantity"] > 0, f"active list contains zero-qty lot: {r}"
    ids = {r["id"] for r in rows}
    assert seeded_batches["active_lot_id"] in ids
    assert seeded_batches["depleted_lot_id"] not in ids
