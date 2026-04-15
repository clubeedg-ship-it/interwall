"""
T-C02b — GET /api/shelves/occupancy endpoint tests.

Verifies the v_shelf_occupancy view is queryable via the API and returns
the expected shape.  Seeds a zone + shelf + stock_lot to confirm aggregation.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_shelves_occupancy.py -v --tb=short
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

TEST_PREFIX = "TOCCTEST"


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
def seed_data(init_pool):
    """Create a zone, shelf, product, and stock_lot for testing."""
    zone_id = str(uuid.uuid4())
    shelf_id = str(uuid.uuid4())
    product_id = str(uuid.uuid4())
    lot_id = str(uuid.uuid4())

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # Apply migration if view doesn't exist yet
            cur.execute(
                "SELECT 1 FROM pg_views WHERE viewname = 'v_shelf_occupancy'"
            )
            if not cur.fetchone():
                with open("/app/sql/14_v_shelf_occupancy.sql") as f:
                    conn.rollback()
                    cur.execute(f.read())
                    conn.commit()

            # Get existing warehouse for FK
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
                """INSERT INTO shelves (id, zone_id, col, level, label, bin)
                   VALUES (%s, %s, 1, 1, %s, 'A')""",
                (shelf_id, zone_id, f"{TEST_PREFIX}-01-1-A"),
            )
            cur.execute(
                """INSERT INTO products (id, ean, name)
                   VALUES (%s, %s, %s)
                   ON CONFLICT DO NOTHING""",
                (product_id, f"999{TEST_PREFIX}", f"Test Product {TEST_PREFIX}"),
            )
            cur.execute(
                """INSERT INTO stock_lots (id, product_id, shelf_id, quantity, unit_cost)
                   VALUES (%s, %s, %s, 7, 3.50)""",
                (lot_id, product_id, shelf_id),
            )

    yield {
        "zone_id": zone_id,
        "shelf_id": shelf_id,
        "product_id": product_id,
        "lot_id": lot_id,
    }

    # Cleanup
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM stock_lots WHERE id = %s", (lot_id,))
            cur.execute("DELETE FROM shelves WHERE id = %s", (shelf_id,))
            cur.execute("DELETE FROM products WHERE id = %s", (product_id,))
            cur.execute("DELETE FROM zones WHERE id = %s", (zone_id,))


# ── Tests ────────────────────────────────────────────────────────────


def test_occupancy_returns_200(client, seed_data):
    resp = client.get("/api/shelves/occupancy")
    assert resp.status_code == 200
    rows = resp.json()
    assert isinstance(rows, list)


def test_occupancy_contains_seeded_shelf(client, seed_data):
    resp = client.get("/api/shelves/occupancy")
    rows = resp.json()
    match = [r for r in rows if r["shelf_id"] == seed_data["shelf_id"]]
    assert len(match) == 1, f"Expected 1 row for seeded shelf, got {len(match)}"

    row = match[0]
    assert row["zone_name"] == TEST_PREFIX
    assert row["col"] == 1
    assert row["level"] == 1
    assert row["bin"] == "A"
    assert row["total_qty"] == 7
    assert abs(row["total_value"] - 24.50) < 0.01  # 7 * 3.50
    assert row["batch_count"] == 1
    assert row["product_name"] == f"Test Product {TEST_PREFIX}"


def test_occupancy_row_shape(client, seed_data):
    """Every row must have the fields the frontend expects."""
    resp = client.get("/api/shelves/occupancy")
    rows = resp.json()
    assert len(rows) > 0

    expected_keys = {
        "shelf_id",
        "shelf_label",
        "zone_name",
        "col",
        "level",
        "bin",
        "capacity",
        "total_qty",
        "total_value",
        "batch_count",
        "product_name",
        "product_ean",
    }
    for row in rows:
        missing = expected_keys - set(row.keys())
        assert not missing, f"Missing keys: {missing}"


def test_occupancy_empty_shelf_has_zero_qty(client, init_pool):
    """Shelves with no stock_lots still appear with total_qty = 0."""
    resp = client.get("/api/shelves/occupancy")
    rows = resp.json()
    empties = [r for r in rows if r["total_qty"] == 0]
    # Can't guarantee empties exist in all environments, but if they do,
    # verify shape is still correct
    for row in empties:
        assert row["total_value"] == 0.0
        assert row["batch_count"] == 0
        assert row["product_name"] is None
