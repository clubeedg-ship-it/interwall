"""
POST /api/zones template-materialization tests.

Runner:
  docker compose exec -T api python -m pytest \
    /app/tests/t_zones_template_create.py -v --tb=short
"""
import sys
import uuid

import pytest

sys.path.insert(0, "/app")

import db
from auth import require_session
from main import app
from routers import zones as zones_router

app.dependency_overrides[require_session] = lambda: {"user_id": "test-user"}

TEST_PREFIX = "TZTC"


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(scope="session")
def client(init_pool):
    from starlette.testclient import TestClient

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def _delete_zone_by_name(name: str) -> None:
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM shelves WHERE zone_id IN "
                "(SELECT id FROM zones WHERE name = %s)",
                (name,),
            )
            cur.execute("DELETE FROM zones WHERE name = %s", (name,))


def _fetch_zone_and_shelves(name: str):
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name FROM zones WHERE name = %s",
                (name,),
            )
            zone = cur.fetchone()
            shelves = []
            if zone:
                cur.execute(
                    """SELECT col, level, bin, label, capacity, split_fifo, single_bin
                       FROM shelves
                       WHERE zone_id = %s
                       ORDER BY col, level, bin NULLS FIRST""",
                    (zone["id"],),
                )
                shelves = cur.fetchall()
            return zone, shelves


def test_create_zone_name_only_stays_legacy(client):
    name = f"{TEST_PREFIX}-LEGACY"
    _delete_zone_by_name(name)
    try:
        resp = client.post("/api/zones", json={"name": name})
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data == {
            "id": data["id"],
            "name": name,
            "cols": 0,
            "levels": 0,
            "shelves_count": 0,
            "is_active": True,
        }
        assert "template_applied" not in data
        _, shelves = _fetch_zone_and_shelves(name)
        assert shelves == []
    finally:
        _delete_zone_by_name(name)


def test_create_zone_template_split_bins(client):
    name = f"{TEST_PREFIX}-SPLIT"
    _delete_zone_by_name(name)
    try:
        resp = client.post(
            "/api/zones",
            json={
                "name": name,
                "template": {
                    "cols": 2,
                    "levels": 3,
                    "split_bins": True,
                    "single_bin_cols": [],
                    "default_capacity": None,
                },
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["cols"] == 2
        assert data["levels"] == 3
        assert data["shelves_count"] == 12
        assert data["template_applied"] == {
            "cols": 2,
            "levels": 3,
            "split_bins": True,
            "single_bin_cols": [],
            "default_capacity": None,
        }

        _, shelves = _fetch_zone_and_shelves(name)
        assert len(shelves) == 12
        assert {s["bin"] for s in shelves} == {"A", "B"}
        assert all(s["single_bin"] is False for s in shelves)
        assert {s["label"] for s in shelves} == {
            f"{name}-01-1-A",
            f"{name}-01-1-B",
            f"{name}-01-2-A",
            f"{name}-01-2-B",
            f"{name}-01-3-A",
            f"{name}-01-3-B",
            f"{name}-02-1-A",
            f"{name}-02-1-B",
            f"{name}-02-2-A",
            f"{name}-02-2-B",
            f"{name}-02-3-A",
            f"{name}-02-3-B",
        }
    finally:
        _delete_zone_by_name(name)


def test_create_zone_template_single_bin_columns(client):
    name = f"{TEST_PREFIX}-MIXED"
    _delete_zone_by_name(name)
    try:
        resp = client.post(
            "/api/zones",
            json={
                "name": name,
                "template": {
                    "cols": 4,
                    "levels": 3,
                    "split_bins": True,
                    "single_bin_cols": [4],
                    "default_capacity": None,
                },
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["shelves_count"] == 21

        _, shelves = _fetch_zone_and_shelves(name)
        assert len(shelves) == 21
        split_shelves = [s for s in shelves if s["col"] in (1, 2, 3)]
        solid_shelves = [s for s in shelves if s["col"] == 4]
        assert len(split_shelves) == 18
        assert {s["bin"] for s in split_shelves} == {"A", "B"}
        assert all(s["single_bin"] is False for s in split_shelves)
        assert len(solid_shelves) == 3
        assert all(s["bin"] is None for s in solid_shelves)
        assert all(s["single_bin"] is True for s in solid_shelves)
    finally:
        _delete_zone_by_name(name)


def test_create_zone_template_unsplit(client):
    name = f"{TEST_PREFIX}-UNSPLIT"
    _delete_zone_by_name(name)
    try:
        resp = client.post(
            "/api/zones",
            json={
                "name": name,
                "template": {
                    "cols": 3,
                    "levels": 2,
                    "split_bins": False,
                    "single_bin_cols": [],
                    "default_capacity": None,
                },
            },
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["shelves_count"] == 6

        _, shelves = _fetch_zone_and_shelves(name)
        assert len(shelves) == 6
        assert all(s["bin"] is None for s in shelves)
        assert all(s["single_bin"] is False for s in shelves)
    finally:
        _delete_zone_by_name(name)


def test_create_zone_template_capacity(client):
    name = f"{TEST_PREFIX}-CAP"
    _delete_zone_by_name(name)
    try:
        resp = client.post(
            "/api/zones",
            json={
                "name": name,
                "template": {
                    "cols": 2,
                    "levels": 2,
                    "split_bins": True,
                    "single_bin_cols": [],
                    "default_capacity": 100,
                },
            },
        )
        assert resp.status_code == 201, resp.text
        _, shelves = _fetch_zone_and_shelves(name)
        assert shelves
        assert all(s["capacity"] == 100 for s in shelves)
    finally:
        _delete_zone_by_name(name)


def test_create_zone_duplicate_name_leaves_no_extra_shelves(client):
    name = f"{TEST_PREFIX}-DUP"
    _delete_zone_by_name(name)
    try:
        first = client.post(
            "/api/zones",
            json={
                "name": name,
                "template": {
                    "cols": 1,
                    "levels": 1,
                    "split_bins": True,
                    "single_bin_cols": [],
                    "default_capacity": None,
                },
            },
        )
        assert first.status_code == 201, first.text

        second = client.post("/api/zones", json={"name": name})
        assert second.status_code == 409, second.text

        zone, shelves = _fetch_zone_and_shelves(name)
        assert zone is not None
        assert len(shelves) == 2
    finally:
        _delete_zone_by_name(name)


def test_create_zone_rejects_single_bin_col_out_of_range(client):
    resp = client.post(
        "/api/zones",
        json={
            "name": f"{TEST_PREFIX}-BADCOL",
            "template": {
                "cols": 4,
                "levels": 2,
                "split_bins": True,
                "single_bin_cols": [9],
                "default_capacity": None,
            },
        },
    )
    assert resp.status_code == 422, resp.text
    assert "single_bin_cols[0]=9 exceeds cols=4" in resp.text


def test_create_zone_rejects_single_bin_cols_when_unsplit(client):
    resp = client.post(
        "/api/zones",
        json={
            "name": f"{TEST_PREFIX}-BADFLAG",
            "template": {
                "cols": 4,
                "levels": 2,
                "split_bins": False,
                "single_bin_cols": [1],
                "default_capacity": None,
            },
        },
    )
    assert resp.status_code == 422, resp.text
    assert "single_bin_cols requires split_bins=true" in resp.text


def test_create_zone_rolls_back_when_shelf_insert_fails(client, monkeypatch):
    name = f"{TEST_PREFIX}-ROLLBACK"
    _delete_zone_by_name(name)
    original = zones_router._materialized_shelves

    def broken_rows(zone_id, zone_name, template):
        rows = original(zone_id, zone_name, template)
        duplicate = list(rows[0])
        duplicate[0] = str(uuid.uuid4())
        return [rows[0], tuple(duplicate)]

    monkeypatch.setattr(zones_router, "_materialized_shelves", broken_rows)
    try:
        resp = client.post(
            "/api/zones",
            json={
                "name": name,
                "template": {
                    "cols": 1,
                    "levels": 1,
                    "split_bins": True,
                    "single_bin_cols": [],
                    "default_capacity": None,
                },
            },
        )
        assert resp.status_code == 500, resp.text
        zone, shelves = _fetch_zone_and_shelves(name)
        assert zone is None
        assert shelves == []
    finally:
        _delete_zone_by_name(name)
