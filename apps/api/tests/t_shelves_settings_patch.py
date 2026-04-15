"""
T-C02e — PATCH /api/shelves/{shelf_id} settings tests (split_fifo, single_bin).

Cases:
  a) PATCH {split_fifo: true}               → 200, DB updated
  b) PATCH {single_bin: true}               → 200, DB updated
  c) PATCH {capacity: 50, split_fifo: true} → 200, both updated
  d) PATCH {}                               → 422
  e) v_shelf_occupancy returns split_fifo + single_bin columns

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_shelves_settings_patch.py -v --tb=short
"""
import uuid
import pytest
import sys

sys.path.insert(0, "/app")

import db
from main import app
from auth import require_session

# Override auth: always return a fake session
app.dependency_overrides[require_session] = lambda: {"user_id": "test-user"}

# ── Fixtures ─────────────────────────────────────────────────────────

TEST_PREFIX = "TC02ESET"


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
def seed_shelf(init_pool):
    """Create a zone + shelf for PATCH tests."""
    zone_id = str(uuid.uuid4())
    shelf_id = str(uuid.uuid4())

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM warehouses LIMIT 1")
            wh_row = cur.fetchone()
            wh_id = wh_row["id"] if wh_row else None
            assert wh_id, "No warehouse found — cannot seed test zone"

            cur.execute(
                """INSERT INTO zones (id, warehouse_id, name, columns, levels, is_active)
                   VALUES (%s, %s, %s, 2, 3, TRUE)
                   ON CONFLICT DO NOTHING""",
                (zone_id, wh_id, TEST_PREFIX),
            )
            cur.execute(
                """INSERT INTO shelves (id, zone_id, col, level, label)
                   VALUES (%s, %s, 1, 1, %s)""",
                (shelf_id, zone_id, f"{TEST_PREFIX}-01-1"),
            )

    yield {"zone_id": zone_id, "shelf_id": shelf_id}

    # Cleanup
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM shelves WHERE id = %s", (shelf_id,))
            cur.execute("DELETE FROM zones WHERE id = %s", (zone_id,))


# ── Tests ────────────────────────────────────────────────────────────


def test_patch_split_fifo(client, seed_shelf):
    """(a) PATCH {split_fifo: true} → 200, DB updated."""
    resp = client.patch(
        f"/api/shelves/{seed_shelf['shelf_id']}",
        json={"split_fifo": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["split_fifo"] is True

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT split_fifo FROM shelves WHERE id = %s",
                (seed_shelf["shelf_id"],),
            )
            assert cur.fetchone()["split_fifo"] is True


def test_patch_single_bin(client, seed_shelf):
    """(b) PATCH {single_bin: true} → 200, DB updated."""
    resp = client.patch(
        f"/api/shelves/{seed_shelf['shelf_id']}",
        json={"single_bin": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["single_bin"] is True

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT single_bin FROM shelves WHERE id = %s",
                (seed_shelf["shelf_id"],),
            )
            assert cur.fetchone()["single_bin"] is True


def test_patch_capacity_and_split_fifo(client, seed_shelf):
    """(c) PATCH {capacity: 50, split_fifo: true} → 200, both updated."""
    resp = client.patch(
        f"/api/shelves/{seed_shelf['shelf_id']}",
        json={"capacity": 50, "split_fifo": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["capacity"] == 50
    assert data["split_fifo"] is True

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT capacity, split_fifo FROM shelves WHERE id = %s",
                (seed_shelf["shelf_id"],),
            )
            row = cur.fetchone()
            assert row["capacity"] == 50
            assert row["split_fifo"] is True


def test_patch_empty_body_422(client, seed_shelf):
    """(d) PATCH {} → 422."""
    resp = client.patch(
        f"/api/shelves/{seed_shelf['shelf_id']}",
        json={},
    )
    assert resp.status_code == 422


def test_occupancy_has_settings_columns(client, seed_shelf):
    """(e) v_shelf_occupancy returns split_fifo + single_bin columns."""
    resp = client.get("/api/shelves/occupancy")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0, "occupancy endpoint returned empty list"
    row = data[0]
    assert "split_fifo" in row, "split_fifo missing from occupancy row"
    assert "single_bin" in row, "single_bin missing from occupancy row"
