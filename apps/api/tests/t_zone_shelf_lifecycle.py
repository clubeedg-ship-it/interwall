"""
Zone and shelf lifecycle endpoint tests.

Runner:
  docker compose exec -T api python -m pytest \
    /app/tests/t_zone_shelf_lifecycle.py -v --tb=short
"""
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from auth import require_session
from main import app

app.dependency_overrides[require_session] = lambda: {"user_id": "test-user"}

TEST_PREFIX = "TZSL"


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(scope="session")
def client(init_pool):
    from starlette.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def _create_zone(client, name: str, template: dict | None = None) -> dict:
    payload = {"name": name}
    if template is not None:
        payload["template"] = template
    resp = client.post("/api/zones", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _delete_zone_artifacts(zone_name: str, product_id: str | None = None, lot_ids: list[str] | None = None):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            if lot_ids:
                cur.execute("DELETE FROM stock_lots WHERE id = ANY(%s::uuid[])", (lot_ids,))
            cur.execute(
                "DELETE FROM shelves WHERE zone_id IN (SELECT id FROM zones WHERE name = %s)",
                (zone_name,),
            )
            cur.execute("DELETE FROM zones WHERE name = %s", (zone_name,))
            if product_id is not None:
                cur.execute("DELETE FROM item_group_members WHERE product_id = %s", (product_id,))
                cur.execute("DELETE FROM build_components WHERE product_id = %s", (product_id,))
                cur.execute("DELETE FROM products WHERE id = %s", (product_id,))


def _lookup_shelves(zone_id: str):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, col, level, bin, label, capacity, split_fifo, single_bin
                   FROM shelves
                   WHERE zone_id = %s
                   ORDER BY col, level, bin NULLS FIRST""",
                (zone_id,),
            )
            return cur.fetchall()


def _lookup_zone(zone_id: str):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM zones WHERE id = %s", (zone_id,))
            return cur.fetchone()


def _insert_product_and_lot(shelf_id: str, qty: int) -> tuple[str, str]:
    product_id = str(uuid.uuid4())
    lot_id = str(uuid.uuid4())
    ean = f"999{product_id.replace('-', '')[:10]}"
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO products (id, ean, name) VALUES (%s, %s, %s)",
                (product_id, ean, f"{TEST_PREFIX}-PART-{ean}"),
            )
            cur.execute(
                """INSERT INTO stock_lots (id, product_id, shelf_id, quantity, unit_cost)
                   VALUES (%s, %s, %s, %s, 1.25)""",
                (lot_id, product_id, shelf_id, qty),
            )
    return product_id, lot_id


def test_delete_zone_cascades_empty_shelves(client):
    name = f"{TEST_PREFIX}-DEL-{uuid.uuid4().hex[:6]}"
    zone = _create_zone(
        client,
        name,
        {
            "cols": 2,
            "levels": 2,
            "split_bins": True,
            "single_bin_cols": [],
            "default_capacity": None,
        },
    )
    zone_id = zone["id"]
    resp = client.delete(f"/api/zones/{zone_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"ok": True, "deleted_shelves": 8}
    assert _lookup_zone(zone_id) is None
    assert _lookup_shelves(zone_id) == []


def test_delete_zone_rejects_live_stock(client):
    name = f"{TEST_PREFIX}-ZSTOCK-{uuid.uuid4().hex[:6]}"
    product_id = None
    lot_id = None
    try:
        zone = _create_zone(
            client,
            name,
            {
                "cols": 1,
                "levels": 1,
                "split_bins": False,
                "single_bin_cols": [],
                "default_capacity": None,
            },
        )
        shelves = _lookup_shelves(zone["id"])
        product_id, lot_id = _insert_product_and_lot(shelves[0]["id"], 3)

        resp = client.delete(f"/api/zones/{zone['id']}")
        assert resp.status_code == 409, resp.text
        assert resp.json() == {
            "detail": "zone has stock; drain first",
            "shelves_with_stock": [f"{name}-01-1"],
        }
        assert _lookup_zone(zone["id"]) is not None
        assert len(_lookup_shelves(zone["id"])) == 1
    finally:
        _delete_zone_artifacts(name, product_id=product_id, lot_ids=[lot_id] if lot_id else None)


def test_delete_zone_unknown_404(client):
    resp = client.delete("/api/zones/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404, resp.text


def test_create_zone_shelf_derives_labels(client):
    name = f"{TEST_PREFIX}-ADD-{uuid.uuid4().hex[:6]}"
    try:
        zone = _create_zone(client, name)
        resp = client.post(
            f"/api/zones/{zone['id']}/shelves",
            json={"col": 5, "level": 3, "bin": "A"},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["label"] == f"{name}-05-3-A"

        solid = client.post(
            f"/api/zones/{zone['id']}/shelves",
            json={"col": 5, "level": 4, "bin": None, "single_bin": True},
        )
        assert solid.status_code == 201, solid.text
        assert solid.json()["label"] == f"{name}-05-4"
        assert solid.json()["single_bin"] is True
    finally:
        _delete_zone_artifacts(name)


def test_create_zone_shelf_replay_conflicts(client):
    name = f"{TEST_PREFIX}-CONFLICT-{uuid.uuid4().hex[:6]}"
    try:
        zone = _create_zone(client, name)
        payload = {"col": 5, "level": 3, "bin": "A"}
        first = client.post(f"/api/zones/{zone['id']}/shelves", json=payload)
        assert first.status_code == 201, first.text
        second = client.post(f"/api/zones/{zone['id']}/shelves", json=payload)
        assert second.status_code == 409, second.text
        assert second.json() == {"detail": f"shelf {name}-05-3-A already exists"}
    finally:
        _delete_zone_artifacts(name)


def test_create_zone_shelf_rejects_single_bin_with_bin(client):
    name = f"{TEST_PREFIX}-422-{uuid.uuid4().hex[:6]}"
    try:
        zone = _create_zone(client, name)
        resp = client.post(
            f"/api/zones/{zone['id']}/shelves",
            json={"col": 5, "level": 3, "bin": "A", "single_bin": True},
        )
        assert resp.status_code == 422, resp.text
    finally:
        _delete_zone_artifacts(name)


def test_create_zone_shelf_unknown_zone_404(client):
    resp = client.post(
        "/api/zones/00000000-0000-0000-0000-000000000000/shelves",
        json={"col": 5, "level": 3, "bin": "A"},
    )
    assert resp.status_code == 404, resp.text


def test_delete_shelf_empty_success(client):
    name = f"{TEST_PREFIX}-SDEL-{uuid.uuid4().hex[:6]}"
    try:
        zone = _create_zone(client, name)
        create = client.post(
            f"/api/zones/{zone['id']}/shelves",
            json={"col": 2, "level": 1, "bin": "B"},
        )
        shelf_id = create.json()["id"]
        resp = client.delete(f"/api/shelves/{shelf_id}")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"ok": True}
        assert [s for s in _lookup_shelves(zone["id"]) if s["id"] == shelf_id] == []
    finally:
        _delete_zone_artifacts(name)


def test_delete_shelf_rejects_live_stock(client):
    name = f"{TEST_PREFIX}-SLIVE-{uuid.uuid4().hex[:6]}"
    product_id = None
    lot_id = None
    try:
        zone = _create_zone(client, name)
        create = client.post(
            f"/api/zones/{zone['id']}/shelves",
            json={"col": 2, "level": 1, "bin": None},
        )
        shelf_id = create.json()["id"]
        product_id, lot_id = _insert_product_and_lot(shelf_id, 4)
        resp = client.delete(f"/api/shelves/{shelf_id}")
        assert resp.status_code == 409, resp.text
        assert resp.json() == {"detail": "shelf has stock; drain first"}
    finally:
        _delete_zone_artifacts(name, product_id=product_id, lot_ids=[lot_id] if lot_id else None)


def test_delete_shelf_allows_zero_qty_history(client):
    name = f"{TEST_PREFIX}-SZERO-{uuid.uuid4().hex[:6]}"
    product_id = None
    lot_id = None
    try:
        zone = _create_zone(client, name)
        create = client.post(
            f"/api/zones/{zone['id']}/shelves",
            json={"col": 2, "level": 1, "bin": None},
        )
        shelf_id = create.json()["id"]
        product_id, lot_id = _insert_product_and_lot(shelf_id, 0)
        resp = client.delete(f"/api/shelves/{shelf_id}")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"ok": True}
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT shelf_id FROM stock_lots WHERE id = %s", (lot_id,))
                assert cur.fetchone()["shelf_id"] is None
    finally:
        _delete_zone_artifacts(name, product_id=product_id, lot_ids=[lot_id] if lot_id else None)


def test_delete_shelf_unknown_404(client):
    resp = client.delete("/api/shelves/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404, resp.text
