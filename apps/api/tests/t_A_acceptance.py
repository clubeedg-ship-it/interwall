"""
Stream A Tier 3 Acceptance Test -- Full AVL + BOM + FIFO + ledger + COGS pipeline.

Exercises the complete sale_writer.write_sale path: xref resolution ->
process_bom_sale -> deduct_fifo_for_group -> stock_ledger_entries ->
COGS + profit computation.

No mocks. Real DB. Real stock deductions. Real profit math.

7-step scenario:
  1-3. Seed: item_group with 3 EANs, 3 stock_lots at different dates/costs,
       build with 1 component, xref mapping, vat_rates row.
  4-5. Sale 1: qty=1, FIFO picks oldest lot, 1 ledger row, correct COGS/profit.
  6.   Sale 2: qty=2 spanning 2 lots, 2 ledger rows, aggregated COGS correct.
  7.   Sale 3: qty=5 insufficient stock -> RAISE, full rollback, stock unchanged.

Runner:
  docker compose exec -T api python -m pytest /app/tests/t_A_acceptance.py -v --tb=short
"""
import uuid
import pytest
import sys
from decimal import Decimal

sys.path.insert(0, "/app")

import db
from email_poller.sale_writer import write_sale
from email_poller.parsers.base import OrderData

# Unique tag for full test isolation
TAG = uuid.uuid4().hex[:6]
MARKETPLACE = f"test_bol_{TAG}"
SALE_PRICE = Decimal("599.99")

# Identifiers
EAN_A = f"TEST-ACC-{TAG}-A"
EAN_B = f"TEST-ACC-{TAG}-B"
EAN_C = f"TEST-ACC-{TAG}-C"
GROUP_CODE = f"test_acc_{TAG}_rtx3050"
BUILD_CODE = f"TEST-ACC-{TAG}-BLD"
EXTERNAL_SKU = f"TEST-RTX-3050-{TAG}"


# -- Fixtures ----------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def init_pool():
    db.init_pool()
    yield


@pytest.fixture(scope="session")
def seed(init_pool):
    """Seed all test data once. Cleanup after the session regardless of outcome."""
    ids = {}
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # -- Location hierarchy: warehouse -> zone -> 2 shelves
            cur.execute(
                "INSERT INTO warehouses (name) VALUES (%s) RETURNING id",
                (f"TEST-ACC-{TAG}-WH",),
            )
            ids["wh"] = str(cur.fetchone()["id"])

            cur.execute(
                "INSERT INTO zones (warehouse_id, name, columns, levels) "
                "VALUES (%s, %s, 3, 3) RETURNING id",
                (ids["wh"], f"TEST-ACC-{TAG}-Z"),
            )
            ids["zone"] = str(cur.fetchone()["id"])

            cur.execute(
                "INSERT INTO shelves (zone_id, col, level, label) "
                "VALUES (%s, 1, 1, %s) RETURNING id",
                (ids["zone"], f"TEST-ACC-{TAG}-S1"),
            )
            ids["shelf1"] = str(cur.fetchone()["id"])

            cur.execute(
                "INSERT INTO shelves (zone_id, col, level, label) "
                "VALUES (%s, 1, 2, %s) RETURNING id",
                (ids["zone"], f"TEST-ACC-{TAG}-S2"),
            )
            ids["shelf2"] = str(cur.fetchone()["id"])

            # -- 3 products (Step 1 partial)
            for suffix, ean in [("A", EAN_A), ("B", EAN_B), ("C", EAN_C)]:
                cur.execute(
                    "INSERT INTO products (ean, name) VALUES (%s, %s) RETURNING id",
                    (ean, f"Test RTX 3050 variant {suffix}"),
                )
                ids[f"prod_{suffix}"] = str(cur.fetchone()["id"])

            # -- Step 1: item_group "Test RTX 3050" with 3 member products
            cur.execute(
                "INSERT INTO item_groups (code, name) VALUES (%s, %s) RETURNING id",
                (GROUP_CODE, "Test RTX 3050"),
            )
            ids["group"] = str(cur.fetchone()["id"])

            for suffix in ("A", "B", "C"):
                cur.execute(
                    "INSERT INTO item_group_members (item_group_id, product_id) "
                    "VALUES (%s, %s)",
                    (ids["group"], ids[f"prod_{suffix}"]),
                )

            # -- Step 2: 3 stock lots at different dates/costs/shelves
            # Lot 1 (oldest): EAN-A, qty=2, cost=150, shelf 1
            cur.execute(
                "INSERT INTO stock_lots "
                "(product_id, shelf_id, quantity, unit_cost, received_at) "
                "VALUES (%s, %s, 2, 150.00, NOW() - INTERVAL '3 days') RETURNING id",
                (ids["prod_A"], ids["shelf1"]),
            )
            ids["lot1"] = str(cur.fetchone()["id"])

            # Lot 2 (middle): EAN-B, qty=3, cost=160, shelf 1 (same shelf)
            cur.execute(
                "INSERT INTO stock_lots "
                "(product_id, shelf_id, quantity, unit_cost, received_at) "
                "VALUES (%s, %s, 3, 160.00, NOW() - INTERVAL '2 days') RETURNING id",
                (ids["prod_B"], ids["shelf1"]),
            )
            ids["lot2"] = str(cur.fetchone()["id"])

            # Lot 3 (newest): EAN-C, qty=1, cost=170, shelf 2
            cur.execute(
                "INSERT INTO stock_lots "
                "(product_id, shelf_id, quantity, unit_cost, received_at) "
                "VALUES (%s, %s, 1, 170.00, NOW() - INTERVAL '1 day') RETURNING id",
                (ids["prod_C"], ids["shelf2"]),
            )
            ids["lot3"] = str(cur.fetchone()["id"])

            # -- Step 3: build + component + xref
            cur.execute(
                "INSERT INTO builds (build_code, name, is_auto_generated, is_active) "
                "VALUES (%s, %s, FALSE, TRUE) RETURNING id",
                (BUILD_CODE, "Test RTX 3050 Build"),
            )
            ids["build"] = str(cur.fetchone()["id"])

            cur.execute(
                "INSERT INTO build_components (build_id, item_group_id, quantity) "
                "VALUES (%s, %s, 1)",
                (ids["build"], ids["group"]),
            )

            cur.execute(
                "INSERT INTO external_item_xref (marketplace, external_sku, build_code) "
                "VALUES (%s, %s, %s)",
                (MARKETPLACE, EXTERNAL_SKU, BUILD_CODE),
            )

            # -- VAT rate for the test marketplace
            cur.execute(
                "INSERT INTO vat_rates (marketplace, country, rate) "
                "VALUES (%s, 'NL', 21.00)",
                (MARKETPLACE,),
            )

    yield ids

    # -- Cleanup (FK-safe order) --
    with db.get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM stock_ledger_entries WHERE transaction_id IN "
                "(SELECT id FROM transactions WHERE marketplace = %s)",
                (MARKETPLACE,),
            )
            cur.execute(
                "DELETE FROM transactions WHERE marketplace = %s", (MARKETPLACE,)
            )
            cur.execute(
                "DELETE FROM stock_lots WHERE product_id IN "
                "(SELECT id FROM products WHERE ean LIKE %s)",
                (f"TEST-ACC-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM external_item_xref WHERE marketplace = %s",
                (MARKETPLACE,),
            )
            cur.execute(
                "DELETE FROM build_components WHERE build_id IN "
                "(SELECT id FROM builds WHERE build_code LIKE %s)",
                (f"TEST-ACC-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM builds WHERE build_code LIKE %s",
                (f"TEST-ACC-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_group_members WHERE item_group_id IN "
                "(SELECT id FROM item_groups WHERE code LIKE %s)",
                (f"test_acc_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM item_groups WHERE code LIKE %s",
                (f"test_acc_{TAG}%",),
            )
            cur.execute(
                "DELETE FROM products WHERE ean LIKE %s",
                (f"TEST-ACC-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM shelves WHERE zone_id IN "
                "(SELECT id FROM zones WHERE name LIKE %s)",
                (f"TEST-ACC-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM zones WHERE name LIKE %s", (f"TEST-ACC-{TAG}%",)
            )
            cur.execute(
                "DELETE FROM warehouses WHERE name LIKE %s",
                (f"TEST-ACC-{TAG}%",),
            )
            cur.execute(
                "DELETE FROM vat_rates WHERE marketplace = %s", (MARKETPLACE,)
            )


# -- Helpers -----------------------------------------------------------------


def _make_order(order_suffix, quantity):
    o = OrderData()
    o.marketplace = MARKETPLACE
    o.sku = EXTERNAL_SKU
    o.quantity = quantity
    o.price = float(SALE_PRICE)
    o.order_number = f"ORD-ACC-{TAG}-{order_suffix}"
    return o


def _assert_stock(cur, expected_a, expected_b, expected_c):
    """Assert v_part_stock totals for the 3 test EANs."""
    for ean, expected in [(EAN_A, expected_a), (EAN_B, expected_b), (EAN_C, expected_c)]:
        cur.execute("SELECT total_qty FROM v_part_stock WHERE ean = %s", (ean,))
        row = cur.fetchone()
        actual = int(row["total_qty"]) if row else 0
        assert actual == expected, f"{ean}: expected {expected}, got {actual}"


# -- Acceptance test ---------------------------------------------------------


def test_stream_a_e2e_acceptance(seed):
    """
    Full pipeline: sale_writer.write_sale -> xref resolution ->
    process_bom_sale -> deduct_fifo_for_group -> ledger + COGS + profit.
    """
    ids = seed

    # Pre-flight: read fixed_costs to compute expected profits in SQL later
    # (avoids Python/Postgres rounding discrepancy).

    # ================================================================
    # Steps 4-5: Sale 1 — qty=1, FIFO picks oldest lot (EAN-A, lot 1)
    # ================================================================
    order1 = _make_order("001", quantity=1)
    txn1_id = write_sale(order1, None)
    assert txn1_id is not None

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # 5a. v_part_stock: oldest EAN (A) decremented by 1
            _assert_stock(cur, expected_a=1, expected_b=3, expected_c=1)

            # 5b. Exactly 1 ledger row for this transaction
            cur.execute(
                "SELECT sle.qty_delta, sle.unit_cost, sle.stock_lot_id, sle.product_id "
                "FROM stock_ledger_entries sle "
                "WHERE sle.transaction_id = %s::uuid",
                (txn1_id,),
            )
            rows = cur.fetchall()
            assert len(rows) == 1, f"Expected 1 ledger row, got {len(rows)}"

            sle = rows[0]
            assert sle["qty_delta"] == -1
            assert sle["unit_cost"] == Decimal("150.0000")
            assert str(sle["stock_lot_id"]) == ids["lot1"]
            assert str(sle["product_id"]) == ids["prod_A"]

            # 5c. Transaction row: non-null cogs/profit, cogs = 150
            cur.execute(
                "SELECT cogs, profit, build_code, quantity, total_price "
                "FROM transactions WHERE id = %s::uuid",
                (txn1_id,),
            )
            txn1 = cur.fetchone()
            assert txn1["cogs"] == Decimal("150.0000")
            assert txn1["build_code"] == BUILD_CODE
            assert txn1["quantity"] == 1
            assert txn1["total_price"] == Decimal("599.9900")

            # 5c (cont). Verify profit formula in SQL (same arithmetic as
            # process_bom_sale) to avoid Python/Postgres rounding mismatch.
            cur.execute(
                """
                SELECT t.profit,
                       (t.total_price - t.cogs - (
                           (SELECT COALESCE(SUM(
                               CASE WHEN is_percentage
                                    THEN t.total_price * value / 100
                                    ELSE value
                               END
                           ), 0) FROM fixed_costs)::NUMERIC(12,4)
                           + (t.total_price * vr.rate / 100)
                       )::NUMERIC(12,4)) AS expected_profit
                FROM transactions t
                JOIN vat_rates vr ON LOWER(vr.marketplace) = LOWER(t.marketplace)
                WHERE t.id = %s::uuid
                """,
                (txn1_id,),
            )
            prow = cur.fetchone()
            assert prow["profit"] is not None
            assert prow["profit"] == prow["expected_profit"], (
                f"profit {prow['profit']} != expected {prow['expected_profit']}"
            )

            # 5c (cont). COGS invariant: SUM(ledger) = -cogs
            cur.execute(
                "SELECT SUM(qty_delta * unit_cost) AS ledger_cogs "
                "FROM stock_ledger_entries WHERE transaction_id = %s::uuid",
                (txn1_id,),
            )
            assert cur.fetchone()["ledger_cogs"] == -txn1["cogs"]

            # 5d. Not in v_health_sales_without_ledger
            cur.execute(
                "SELECT 1 FROM v_health_sales_without_ledger WHERE id = %s::uuid",
                (txn1_id,),
            )
            assert cur.fetchone() is None, "Sale 1 appears in sales-without-ledger"

    # ================================================================
    # Step 6: Sale 2 — qty=2, spans 2 lots (remainder of lot 1 + lot 2)
    # ================================================================
    # Stock before: lot1=1, lot2=3, lot3=1.
    # FIFO order: lot1 (oldest, 1 unit left) then lot2.
    # Deduction: 1 from lot1 @150 + 1 from lot2 @160. COGS = 310.
    order2 = _make_order("002", quantity=2)
    txn2_id = write_sale(order2, None)
    assert txn2_id is not None

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # Stock after: lot1=0, lot2=2, lot3=1
            _assert_stock(cur, expected_a=0, expected_b=2, expected_c=1)

            # 2 ledger rows
            cur.execute(
                "SELECT sle.qty_delta, sle.unit_cost, sle.stock_lot_id "
                "FROM stock_ledger_entries sle "
                "WHERE sle.transaction_id = %s::uuid "
                "ORDER BY sle.unit_cost ASC",
                (txn2_id,),
            )
            rows = cur.fetchall()
            assert len(rows) == 2, f"Expected 2 ledger rows, got {len(rows)}"

            # Lot 1 remainder (1 unit at 150)
            assert rows[0]["qty_delta"] == -1
            assert rows[0]["unit_cost"] == Decimal("150.0000")
            assert str(rows[0]["stock_lot_id"]) == ids["lot1"]

            # Lot 2 (1 unit at 160)
            assert rows[1]["qty_delta"] == -1
            assert rows[1]["unit_cost"] == Decimal("160.0000")
            assert str(rows[1]["stock_lot_id"]) == ids["lot2"]

            # COGS = 150 + 160 = 310
            cur.execute(
                "SELECT cogs, profit, total_price FROM transactions WHERE id = %s::uuid",
                (txn2_id,),
            )
            txn2 = cur.fetchone()
            assert txn2["cogs"] == Decimal("310.0000")
            assert txn2["total_price"] == Decimal("1199.9800")  # 599.99 * 2

            # COGS invariant
            cur.execute(
                "SELECT SUM(qty_delta * unit_cost) AS ledger_cogs "
                "FROM stock_ledger_entries WHERE transaction_id = %s::uuid",
                (txn2_id,),
            )
            assert cur.fetchone()["ledger_cogs"] == -txn2["cogs"]

            # Profit formula check (same SQL as sale 1)
            cur.execute(
                """
                SELECT t.profit,
                       (t.total_price - t.cogs - (
                           (SELECT COALESCE(SUM(
                               CASE WHEN is_percentage
                                    THEN t.total_price * value / 100
                                    ELSE value
                               END
                           ), 0) FROM fixed_costs)::NUMERIC(12,4)
                           + (t.total_price * vr.rate / 100)
                       )::NUMERIC(12,4)) AS expected_profit
                FROM transactions t
                JOIN vat_rates vr ON LOWER(vr.marketplace) = LOWER(t.marketplace)
                WHERE t.id = %s::uuid
                """,
                (txn2_id,),
            )
            prow2 = cur.fetchone()
            assert prow2["profit"] is not None
            assert prow2["profit"] == prow2["expected_profit"]

            # Not in health view
            cur.execute(
                "SELECT 1 FROM v_health_sales_without_ledger WHERE id = %s::uuid",
                (txn2_id,),
            )
            assert cur.fetchone() is None, "Sale 2 appears in sales-without-ledger"

    # ================================================================
    # Step 7: Sale 3 — qty=5, insufficient stock -> RAISE + rollback
    # ================================================================
    # Stock before: lot1=0, lot2=2, lot3=1. Total = 3. Need 5.
    order3 = _make_order("003", quantity=5)

    with pytest.raises(Exception, match="insufficient stock"):
        write_sale(order3, None)

    with db.get_conn() as conn:
        with conn.cursor() as cur:
            # No transaction created
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM transactions "
                "WHERE order_reference = %s",
                (order3.order_number,),
            )
            assert cur.fetchone()["cnt"] == 0, "Sale 3 left a transaction row"

            # Stock unchanged from step 6
            _assert_stock(cur, expected_a=0, expected_b=2, expected_c=1)


# -- Final pass/fail line ---------------------------------------------------
if __name__ == "__main__":
    exit_code = pytest.main([__file__, "-v", "--tb=short"])
    if exit_code == 0:
        print("\nSTREAM-A ACCEPTANCE ALL TESTS PASSED")
    else:
        print("\nSTREAM-A ACCEPTANCE TESTS FAILED")
    raise SystemExit(exit_code)
