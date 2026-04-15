"""
T-A08 — Email poller BOM-first routing tests.
5 cases testing the routing logic in sale_writer.py.

Real DB for resolution queries (xref, sku_aliases, builds).
Mocked _call_bom_sale / _call_legacy_sale to isolate routing from
stock-level concerns (those are tested in T-A04 / T-A05).

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_A08_poller_routing.py -v --tb=short
"""
import uuid
import pytest
import sys

sys.path.insert(0, "/app")

import db
from unittest.mock import patch
from email_poller.sale_writer import write_sale
from email_poller.parsers.base import OrderData


TAG = uuid.uuid4().hex[:6]


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(autouse=True)
def clean_test_data():
    yield
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM external_item_xref WHERE marketplace LIKE %s",
                (f"test_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM sku_aliases WHERE marketplace LIKE %s",
                (f"test_{TAG}%",),
            )
            cur.execute(
                """DELETE FROM build_components WHERE build_id IN (
                    SELECT id FROM builds WHERE build_code LIKE %s
                )""",
                (f"TEST-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code LIKE %s", (f"TEST-{TAG}%",)
            )
            cur.execute(
                """DELETE FROM item_group_members WHERE item_group_id IN (
                    SELECT id FROM item_groups WHERE code LIKE %s
                )""",
                (f"test_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_groups WHERE code LIKE %s", (f"test_{TAG}%",)
            )
            cur.execute(
                "DELETE FROM products WHERE ean LIKE %s", (f"TEST-{TAG}%",)
            )


# ── Helpers ──────────────────────────────────────────────────────────


def _make_order(marketplace, sku, quantity=1, price=100.0, generated_sku=""):
    o = OrderData()
    o.marketplace = marketplace
    o.sku = sku
    o.generated_sku = generated_sku
    o.quantity = quantity
    o.price = price
    o.order_number = f"ORD-{uuid.uuid4().hex[:8]}"
    o.raw_email_body = "test"
    return o


def _seed_product(cur, suffix):
    """Create a test product. Returns (product_id, ean)."""
    ean = f"TEST-{TAG}-{suffix}"
    cur.execute(
        "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
        (ean, f"Test Product {suffix}"),
    )
    return str(cur.fetchone()["id"]), ean


def _seed_trivial_build(cur, ean, product_id, active=True):
    """Create a trivial auto-generated build for a product. Returns build_code."""
    build_code = ean  # backfill convention: build_code = EAN
    cur.execute(
        """INSERT INTO builds (build_code, name, is_auto_generated, is_active)
           VALUES (%s, %s, TRUE, %s) RETURNING id""",
        (build_code, f"Trivial build for {ean}", active),
    )
    build_id = str(cur.fetchone()["id"])

    group_code = f"test_{TAG}_{ean}"
    cur.execute(
        "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
        (group_code, f"Group for {ean}"),
    )
    group_id = str(cur.fetchone()["id"])

    cur.execute(
        "INSERT INTO item_group_members (item_group_id, product_id) VALUES (%s, %s)",
        (group_id, product_id),
    )

    cur.execute(
        "INSERT INTO build_components (build_id, item_group_id, quantity) VALUES (%s, %s, 1)",
        (build_id, group_id),
    )

    return build_code


# ── Test Cases ───────────────────────────────────────────────────────


class TestCase1_XrefHitBomSale:
    """Case 1 — xref hit → process_bom_sale called."""

    @patch("email_poller.sale_writer._call_bom_sale", return_value="fake-txn-c1")
    @patch("email_poller.sale_writer._call_legacy_sale")
    def test_xref_hit(self, mock_legacy, mock_bom):
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                pid, ean = _seed_product(cur, "C1")
                build_code = _seed_trivial_build(cur, ean, pid)
                cur.execute(
                    """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
                       VALUES (%s, %s, %s)""",
                    (f"test_{TAG}_mp_c1", "TST-SKU-C1", build_code),
                )

        order = _make_order(f"test_{TAG}_mp_c1", "TST-SKU-C1")
        result = write_sale(order, str(uuid.uuid4()))

        assert result == "fake-txn-c1"
        mock_bom.assert_called_once()
        assert mock_bom.call_args[0][0] == build_code
        mock_legacy.assert_not_called()


class TestCase2_XrefInactiveBuild:
    """Case 2 — xref hit but build inactive → RuntimeError (D-033)."""

    def test_xref_inactive_raises(self):
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                pid, ean = _seed_product(cur, "C2")
                build_code = _seed_trivial_build(cur, ean, pid, active=False)
                cur.execute(
                    """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
                       VALUES (%s, %s, %s)""",
                    (f"test_{TAG}_mp_c2", "TST-SKU-C2", build_code),
                )

        order = _make_order(f"test_{TAG}_mp_c2", "TST-SKU-C2")
        with pytest.raises(RuntimeError, match="D-033"):
            write_sale(order, str(uuid.uuid4()))


class TestCase3_NoXrefEanBuildBomPath:
    """Case 3 — no xref, EAN maps to trivial build (D-018) → BOM path."""

    @patch("email_poller.sale_writer._call_bom_sale", return_value="fake-txn-c3")
    @patch("email_poller.sale_writer._call_legacy_sale")
    def test_ean_build_bom_path(self, mock_legacy, mock_bom):
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                pid, ean = _seed_product(cur, "C3")
                build_code = _seed_trivial_build(cur, ean, pid)
                # sku_aliases row, NOT xref
                cur.execute(
                    """INSERT INTO sku_aliases (marketplace_sku, product_ean, marketplace)
                       VALUES (%s, %s, %s)""",
                    ("TST-SKU-C3", ean, f"test_{TAG}_mp_c3"),
                )

        order = _make_order(f"test_{TAG}_mp_c3", "TST-SKU-C3")
        result = write_sale(order, str(uuid.uuid4()))

        assert result == "fake-txn-c3"
        mock_bom.assert_called_once()
        assert mock_bom.call_args[0][0] == build_code
        mock_legacy.assert_not_called()


class TestCase4_LegacyFallback:
    """Case 4 — no xref, no build reachable → legacy process_sale fallback."""

    @patch("email_poller.sale_writer._call_bom_sale")
    @patch("email_poller.sale_writer._call_legacy_sale", return_value="fake-txn-c4")
    def test_legacy_fallback(self, mock_legacy, mock_bom):
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                pid, ean = _seed_product(cur, "C4")
                # NO build, NO item_group — just sku_aliases
                cur.execute(
                    """INSERT INTO sku_aliases (marketplace_sku, product_ean, marketplace)
                       VALUES (%s, %s, %s)""",
                    ("TST-SKU-C4", ean, f"test_{TAG}_mp_c4"),
                )

        order = _make_order(f"test_{TAG}_mp_c4", "TST-SKU-C4")
        result = write_sale(order, str(uuid.uuid4()))

        assert result == "fake-txn-c4"
        mock_legacy.assert_called_once()
        assert mock_legacy.call_args[0][0] == ean  # first arg = EAN
        mock_bom.assert_not_called()


class TestCase5_RegressionGuard:
    """Case 5 — xref exists and build healthy → legacy does NOT trigger
    (regression guard for D-033 misinterpretation)."""

    @patch("email_poller.sale_writer._call_bom_sale", return_value="fake-txn-c5")
    @patch("email_poller.sale_writer._call_legacy_sale")
    def test_no_legacy_when_xref_healthy(self, mock_legacy, mock_bom):
        with db.get_conn() as conn:
            with conn.cursor() as cur:
                pid, ean = _seed_product(cur, "C5")
                build_code = _seed_trivial_build(cur, ean, pid)
                cur.execute(
                    """INSERT INTO external_item_xref (marketplace, external_sku, build_code)
                       VALUES (%s, %s, %s)""",
                    (f"test_{TAG}_mp_c5", "TST-SKU-C5", build_code),
                )

        order = _make_order(f"test_{TAG}_mp_c5", "TST-SKU-C5")
        result = write_sale(order, str(uuid.uuid4()))

        assert result == "fake-txn-c5"
        mock_bom.assert_called_once()
        mock_legacy.assert_not_called()


# ── Final pass/fail line ─────────────────────────────────────────────
if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    if exit_code == 0:
        print("\nT-A08 ALL TESTS PASSED")
    else:
        print("\nT-A08 TESTS FAILED")
    raise SystemExit(exit_code)
