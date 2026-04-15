"""
T-C02c — Handshake consume and stock transfer endpoint tests.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_C02c_handshake_endpoints.py -v --tb=short
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


def _ensure_product(cur, ean: str) -> str:
    cur.execute(
        "INSERT INTO products (ean, name, sku) VALUES (%s, %s, %s) "
        "ON CONFLICT (ean) DO UPDATE SET name = EXCLUDED.name "
        "RETURNING id",
        (ean, f"T-C02c Part {ean}", f"SKU-{ean}"),
    )
    return str(cur.fetchone()["id"])


def _pick_two_shelves(cur) -> tuple[str, str]:
    cur.execute("SELECT id FROM shelves LIMIT 2")
    rows = cur.fetchall()
    if len(rows) < 2:
        pytest.skip("need at least two shelves seeded for transfer tests")
    return str(rows[0]["id"]), str(rows[1]["id"])


def _create_lot(cur, product_id: str, qty: int, unit_cost: float, shelf_id: str | None) -> str:
    cur.execute(
        "INSERT INTO stock_lots (product_id, shelf_id, quantity, unit_cost, marketplace) "
        "VALUES (%s, %s, %s, %s, 'test') RETURNING id",
        (product_id, shelf_id, qty, unit_cost),
    )
    return str(cur.fetchone()["id"])


@pytest.fixture
def seeded_lot():
    tag = uuid.uuid4().hex[:8]
    ean = f"TC02c-{tag}"
    created: list[tuple[str, str]] = []  # [(kind, id), ...] for cleanup

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            product_id = _ensure_product(cur, ean)
            created.append(("product", product_id))

    def _make(qty: int, unit_cost: float = 5.0, shelf_id: str | None = None) -> str:
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                lot_id = _create_lot(cur, product_id, qty, unit_cost, shelf_id)
                created.append(("lot", lot_id))
                return lot_id

    yield {"ean": ean, "product_id": product_id, "make_lot": _make}

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM stock_lots WHERE product_id = %s::uuid",
                (product_id,),
            )
            cur.execute("DELETE FROM products WHERE id = %s::uuid", (product_id,))


def _fetch_lot(lot_id: str) -> dict | None:
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, product_id, shelf_id, quantity, unit_cost "
                "FROM stock_lots WHERE id = %s",
                (lot_id,),
            )
            return cur.fetchone()


# ---------------------------------------------------------------------------
# consume_lot
# ---------------------------------------------------------------------------
def test_consume_lot_happy_path(client, seeded_lot):
    lot_id = seeded_lot["make_lot"](qty=10, unit_cost=4.25)

    r = client.post(f"/api/stock-lots/{lot_id}/consume", json={"qty": 3})
    assert r.status_code == 200, r.text

    body = r.json()
    assert body["lot_id"] == lot_id
    assert body["qty_consumed"] == 3
    assert body["remaining"] == 7

    lot = _fetch_lot(lot_id)
    assert lot["quantity"] == 7


def test_consume_lot_over_qty(client, seeded_lot):
    lot_id = seeded_lot["make_lot"](qty=2)

    r = client.post(f"/api/stock-lots/{lot_id}/consume", json={"qty": 5})
    assert r.status_code == 409, r.text

    lot = _fetch_lot(lot_id)
    assert lot["quantity"] == 2  # untouched


def test_consume_lot_missing(client):
    fake = str(uuid.uuid4())
    r = client.post(f"/api/stock-lots/{fake}/consume", json={"qty": 1})
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# transfer_stock
# ---------------------------------------------------------------------------
def test_transfer_full_qty(client, seeded_lot):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            src_shelf, dst_shelf = _pick_two_shelves(cur)

    lot_id = seeded_lot["make_lot"](qty=4, unit_cost=7.0, shelf_id=src_shelf)

    r = client.post(
        "/api/stock/transfer",
        json={"lot_id": lot_id, "to_shelf_id": dst_shelf, "qty": 4},
    )
    assert r.status_code == 200, r.text

    body = r.json()
    assert body["source_lot_id"] == lot_id
    assert body["dest_lot_id"] == lot_id  # full move keeps lot id
    assert body["qty"] == 4

    lot = _fetch_lot(lot_id)
    assert str(lot["shelf_id"]) == dst_shelf
    assert lot["quantity"] == 4


def test_transfer_partial_qty(client, seeded_lot):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            src_shelf, dst_shelf = _pick_two_shelves(cur)

    lot_id = seeded_lot["make_lot"](qty=10, unit_cost=3.5, shelf_id=src_shelf)

    r = client.post(
        "/api/stock/transfer",
        json={"lot_id": lot_id, "to_shelf_id": dst_shelf, "qty": 4},
    )
    assert r.status_code == 200, r.text

    body = r.json()
    assert body["source_lot_id"] == lot_id
    assert body["dest_lot_id"] != lot_id
    assert body["qty"] == 4

    src = _fetch_lot(lot_id)
    dst = _fetch_lot(body["dest_lot_id"])

    assert src["quantity"] == 6
    assert str(src["shelf_id"]) == src_shelf

    assert dst["quantity"] == 4
    assert str(dst["shelf_id"]) == dst_shelf
    assert str(dst["product_id"]) == str(src["product_id"])
    assert float(dst["unit_cost"]) == float(src["unit_cost"])

    # Total on-hand unchanged
    assert src["quantity"] + dst["quantity"] == 10


def test_transfer_over_qty(client, seeded_lot):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            src_shelf, dst_shelf = _pick_two_shelves(cur)

    lot_id = seeded_lot["make_lot"](qty=3, shelf_id=src_shelf)

    r = client.post(
        "/api/stock/transfer",
        json={"lot_id": lot_id, "to_shelf_id": dst_shelf, "qty": 10},
    )
    assert r.status_code == 409, r.text

    lot = _fetch_lot(lot_id)
    assert lot["quantity"] == 3
    assert str(lot["shelf_id"]) == src_shelf


def test_transfer_same_shelf(client, seeded_lot):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            src_shelf, _ = _pick_two_shelves(cur)

    lot_id = seeded_lot["make_lot"](qty=5, shelf_id=src_shelf)

    r = client.post(
        "/api/stock/transfer",
        json={"lot_id": lot_id, "to_shelf_id": src_shelf, "qty": 2},
    )
    assert r.status_code == 422, r.text

    lot = _fetch_lot(lot_id)
    assert lot["quantity"] == 5
    assert str(lot["shelf_id"]) == src_shelf


if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    raise SystemExit(exit_code)
