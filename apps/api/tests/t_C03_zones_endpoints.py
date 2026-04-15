"""
T-C03 — zone topology endpoint tests (D-040, D-045).

Covers:
  a) list_zones_happy        — seeded zone returns with shelf-derived cols/levels
  b) create_zone_happy       — 201 + returned id, cols=levels=0 pre-shelves
  c) create_zone_conflict    — 409 on duplicate name
  d) patch_zone_rename       — 200 + new name persisted
  e) patch_zone_activate     — 200 + is_active flip persisted both ways
  f) patch_zone_missing      — 404 for unknown id
  g) patch_zone_empty_body   — 422 when neither field supplied

Runner:
  docker compose exec -T api python -m pytest \
    /app/tests/t_C03_zones_endpoints.py -v --tb=short
"""
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from auth import require_session
from main import app

app.dependency_overrides[require_session] = lambda: {"user_id": "test-user"}

TEST_PREFIX = "TC03Z"


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(scope="session")
def client(init_pool):
    from starlette.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="session")
def warehouse_id(init_pool):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM warehouses LIMIT 1")
            row = cur.fetchone()
            assert row, "no warehouse configured — tests require a seeded warehouse"
            return row["id"]


def _insert_zone(warehouse_id, name):
    zone_id = str(uuid.uuid4())
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO zones (id, warehouse_id, name, columns, levels, is_active)
                   VALUES (%s, %s, %s, 1, 1, TRUE)""",
                (zone_id, warehouse_id, name),
            )
    return zone_id


def _delete_zone_by_id(zone_id):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM shelves WHERE zone_id = %s", (zone_id,))
            cur.execute("DELETE FROM zones WHERE id = %s", (zone_id,))


def _delete_zone_by_name(name):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM shelves WHERE zone_id IN "
                "(SELECT id FROM zones WHERE name = %s)",
                (name,),
            )
            cur.execute("DELETE FROM zones WHERE name = %s", (name,))


@pytest.fixture()
def seeded_zone(warehouse_id):
    """Zone with a 2×2 shelf grid → MAX(col)=2, MAX(level)=2, shelves_count=4."""
    name = f"{TEST_PREFIX}A"
    zone_id = str(uuid.uuid4())
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO zones (id, warehouse_id, name, columns, levels, is_active)
                   VALUES (%s, %s, %s, 3, 4, TRUE)""",
                (zone_id, warehouse_id, name),
            )
            for col in (1, 2):
                for level in (1, 2):
                    cur.execute(
                        """INSERT INTO shelves (id, zone_id, col, level, label)
                           VALUES (%s, %s, %s, %s, %s)""",
                        (
                            str(uuid.uuid4()),
                            zone_id,
                            col,
                            level,
                            f"{name}-{col}-{level}",
                        ),
                    )
    yield {"zone_id": zone_id, "name": name}
    _delete_zone_by_id(zone_id)


def test_list_zones_happy(client, seeded_zone):
    resp = client.get("/api/zones")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert isinstance(data, list)
    match = [z for z in data if z["name"] == seeded_zone["name"]]
    assert match, f"seeded zone missing from list: {data}"
    z = match[0]
    assert uuid.UUID(z["id"]) == uuid.UUID(seeded_zone["zone_id"])
    assert z["cols"] == 2, f"expected cols=2, got {z}"
    assert z["levels"] == 2, f"expected levels=2, got {z}"
    assert z["shelves_count"] == 4, f"expected shelves_count=4, got {z}"


def test_create_zone_happy(client):
    name = f"{TEST_PREFIX}NEW"
    _delete_zone_by_name(name)  # defensive: clean any leftover from a prior run
    try:
        resp = client.post("/api/zones", json={"name": name})
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == name
        uuid.UUID(data["id"])  # must parse
        assert data["cols"] == 0 and data["levels"] == 0
        assert data["shelves_count"] == 0
        assert data["is_active"] is True
    finally:
        _delete_zone_by_name(name)


def test_create_zone_conflict(client, seeded_zone):
    resp = client.post("/api/zones", json={"name": seeded_zone["name"]})
    assert resp.status_code == 409, resp.text


def test_patch_zone_rename(client, warehouse_id):
    name_before = f"{TEST_PREFIX}R1"
    name_after = f"{TEST_PREFIX}R2"
    _delete_zone_by_name(name_before)
    _delete_zone_by_name(name_after)
    zone_id = _insert_zone(warehouse_id, name_before)
    try:
        resp = client.patch(f"/api/zones/{zone_id}", json={"name": name_after})
        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == name_after
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT name FROM zones WHERE id = %s", (zone_id,))
                assert cur.fetchone()["name"] == name_after
    finally:
        _delete_zone_by_id(zone_id)


def test_patch_zone_activate_deactivate(client, warehouse_id):
    name = f"{TEST_PREFIX}TOG"
    _delete_zone_by_name(name)
    zone_id = _insert_zone(warehouse_id, name)
    try:
        resp = client.patch(f"/api/zones/{zone_id}", json={"is_active": False})
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_active"] is False
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT is_active FROM zones WHERE id = %s", (zone_id,))
                assert cur.fetchone()["is_active"] is False

        resp = client.patch(f"/api/zones/{zone_id}", json={"is_active": True})
        assert resp.status_code == 200, resp.text
        assert resp.json()["is_active"] is True
    finally:
        _delete_zone_by_id(zone_id)


def test_patch_zone_missing(client):
    missing = "00000000-0000-0000-0000-000000000000"
    resp = client.patch(f"/api/zones/{missing}", json={"name": "WHATEVER"})
    assert resp.status_code == 404, resp.text


def test_patch_zone_empty_body(client, warehouse_id):
    name = f"{TEST_PREFIX}E"
    _delete_zone_by_name(name)
    zone_id = _insert_zone(warehouse_id, name)
    try:
        resp = client.patch(f"/api/zones/{zone_id}", json={})
        assert resp.status_code == 422, resp.text
    finally:
        _delete_zone_by_id(zone_id)
