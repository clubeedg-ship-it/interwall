"""
T-C02d — PATCH /api/shelves/{shelf_id} capacity tests.

Verifies capacity update: valid int, null, zero rejection, negative
rejection, and unknown UUID → 404.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_shelves_capacity_patch.py -v --tb=short
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

TEST_PREFIX = "TCAPTEST"


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
    zone_name = f"{TEST_PREFIX}-{uuid.uuid4().hex[:8]}"
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
                   VALUES (%s, %s, %s, 2, 3, TRUE)""",
                (zone_id, wh_id, zone_name),
            )
            cur.execute(
                """INSERT INTO shelves (id, zone_id, col, level, label)
                   VALUES (%s, %s, 1, 1, %s)""",
                (shelf_id, zone_id, f"{zone_name}-01-1"),
            )

    yield {"zone_id": zone_id, "shelf_id": shelf_id}

    # Cleanup
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM shelves WHERE id = %s", (shelf_id,))
            cur.execute("DELETE FROM zones WHERE id = %s", (zone_id,))


# ── Tests ────────────────────────────────────────────────────────────


def test_patch_valid_capacity(client, seed_shelf):
    """PATCH with a positive integer → 200, body matches, DB updated."""
    resp = client.patch(
        f"/api/shelves/{seed_shelf['shelf_id']}",
        json={"capacity": 42},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["shelf_id"] == seed_shelf["shelf_id"]
    assert data["capacity"] == 42

    # Verify DB
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT capacity FROM shelves WHERE id = %s",
                (seed_shelf["shelf_id"],),
            )
            assert cur.fetchone()["capacity"] == 42


def test_patch_null_capacity(client, seed_shelf):
    """PATCH with null → 200, capacity becomes NULL (unlimited)."""
    resp = client.patch(
        f"/api/shelves/{seed_shelf['shelf_id']}",
        json={"capacity": None},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["capacity"] is None


def test_patch_zero_rejected(client, seed_shelf):
    """PATCH with 0 → 422 validation error."""
    resp = client.patch(
        f"/api/shelves/{seed_shelf['shelf_id']}",
        json={"capacity": 0},
    )
    assert resp.status_code == 422


def test_patch_negative_rejected(client, seed_shelf):
    """PATCH with negative → 422 validation error."""
    resp = client.patch(
        f"/api/shelves/{seed_shelf['shelf_id']}",
        json={"capacity": -5},
    )
    assert resp.status_code == 422


def test_patch_unknown_uuid_404(client, seed_shelf):
    """PATCH with unknown UUID → 404."""
    fake_id = str(uuid.uuid4())
    resp = client.patch(
        f"/api/shelves/{fake_id}",
        json={"capacity": 10},
    )
    assert resp.status_code == 404
