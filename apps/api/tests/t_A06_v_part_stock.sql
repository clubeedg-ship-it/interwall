-- =============================================================================
-- t_A06_v_part_stock.sql -- Tests for v_part_stock canonical stock view (D-041)
--
-- Run:
--   docker compose exec -T postgres psql -U interwall -d interwall \
--     -f /app/tests/t_A06_v_part_stock.sql
--
-- All tests wrapped in BEGIN/ROLLBACK — no side effects on the DB.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =========================================================
-- Ensure the view exists (re-create from standalone file)
-- =========================================================
\i /app/sql/09_v_part_stock.sql

-- =========================================================
-- Seed isolated test products (UUIDs with 'a06' prefix)
-- =========================================================

-- Product A: will have a single lot
INSERT INTO products (id, ean, name)
VALUES ('a0600001-0000-0000-0000-000000000001', 'TEST-A06-SINGLE', 'Test Single Lot Product');

-- Product B: will have multiple lots
INSERT INTO products (id, ean, name)
VALUES ('a0600002-0000-0000-0000-000000000002', 'TEST-A06-MULTI', 'Test Multi Lot Product');

-- Product C: will have a depleted lot + an active lot
INSERT INTO products (id, ean, name)
VALUES ('a0600003-0000-0000-0000-000000000003', 'TEST-A06-MIXED', 'Test Mixed Lot Product');

-- Product D: no stock_lots at all
INSERT INTO products (id, ean, name)
VALUES ('a0600004-0000-0000-0000-000000000004', 'TEST-A06-NOLOTS', 'Test No Lots Product');

-- Product E: for invariant check (2 active lots)
INSERT INTO products (id, ean, name)
VALUES ('a0600005-0000-0000-0000-000000000005', 'TEST-A06-INV', 'Test Invariant Product');

-- =========================================================
-- Case 1: Single-lot product
-- Pre: 1 product, 1 stock_lot (qty=10, unit_cost=100.0000, received_at=2026-01-15)
-- Post: total_qty=10, total_value=1000.0000, last_received_at=2026-01-15
-- =========================================================

INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at)
VALUES ('a0600001-0000-0000-0000-000000000001', 10, 100.0000, '2026-01-15T00:00:00Z');

DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT total_qty, total_value, last_received_at
      INTO r
      FROM v_part_stock
     WHERE product_id = 'a0600001-0000-0000-0000-000000000001';

    ASSERT r.total_qty = 10,
        format('Case 1 FAIL: total_qty expected 10, got %s', r.total_qty);
    ASSERT r.total_value = 1000.0000,
        format('Case 1 FAIL: total_value expected 1000, got %s', r.total_value);
    ASSERT r.last_received_at = '2026-01-15T00:00:00Z'::TIMESTAMPTZ,
        format('Case 1 FAIL: last_received_at expected 2026-01-15, got %s', r.last_received_at);

    RAISE NOTICE 'Case 1 PASSED — single-lot product';
END $$;

-- =========================================================
-- Case 2: Multi-lot product (3 lots, different dates and costs)
-- Pre: product B, lots: (qty=5, cost=50, D1), (qty=3, cost=80, D2), (qty=7, cost=120, D3)
-- Post: total_qty=15, total_value=5*50+3*80+7*120 = 250+240+840 = 1330, last_received_at=D3
-- =========================================================

INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at) VALUES
    ('a0600002-0000-0000-0000-000000000002', 5,  50.0000, '2026-02-01T00:00:00Z'),
    ('a0600002-0000-0000-0000-000000000002', 3,  80.0000, '2026-02-10T00:00:00Z'),
    ('a0600002-0000-0000-0000-000000000002', 7, 120.0000, '2026-02-20T00:00:00Z');

DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT total_qty, total_value, last_received_at
      INTO r
      FROM v_part_stock
     WHERE product_id = 'a0600002-0000-0000-0000-000000000002';

    ASSERT r.total_qty = 15,
        format('Case 2 FAIL: total_qty expected 15, got %s', r.total_qty);
    ASSERT r.total_value = 1330.0000,
        format('Case 2 FAIL: total_value expected 1330, got %s', r.total_value);
    ASSERT r.last_received_at = '2026-02-20T00:00:00Z'::TIMESTAMPTZ,
        format('Case 2 FAIL: last_received_at expected 2026-02-20, got %s', r.last_received_at);

    RAISE NOTICE 'Case 2 PASSED — multi-lot product';
END $$;

-- =========================================================
-- Case 3: Zero-stock lot excluded
-- Pre: product C, lot1 qty=0 (depleted), lot2 qty=5 cost=60
-- Post: total_qty=5, total_value=300, depleted lot does NOT contribute
-- =========================================================

INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at) VALUES
    ('a0600003-0000-0000-0000-000000000003', 0,  40.0000, '2026-03-01T00:00:00Z'),  -- depleted
    ('a0600003-0000-0000-0000-000000000003', 5,  60.0000, '2026-03-10T00:00:00Z');   -- active

DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT total_qty, total_value, last_received_at
      INTO r
      FROM v_part_stock
     WHERE product_id = 'a0600003-0000-0000-0000-000000000003';

    ASSERT r.total_qty = 5,
        format('Case 3 FAIL: total_qty expected 5, got %s', r.total_qty);
    ASSERT r.total_value = 300.0000,
        format('Case 3 FAIL: total_value expected 300, got %s', r.total_value);
    -- last_received_at should be from the active lot only (qty > 0 filter on JOIN)
    ASSERT r.last_received_at = '2026-03-10T00:00:00Z'::TIMESTAMPTZ,
        format('Case 3 FAIL: last_received_at expected 2026-03-10, got %s', r.last_received_at);

    RAISE NOTICE 'Case 3 PASSED — zero-stock lot excluded';
END $$;

-- =========================================================
-- Case 4: Product with no lots
-- Pre: product D exists, no stock_lots rows
-- Post: row present with total_qty=0, total_value=0, last_received_at=NULL
-- Design choice: LEFT JOIN ensures every product appears. Callers never
-- need to distinguish "missing" from "zero stock".
-- =========================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    SELECT total_qty, total_value, last_received_at
      INTO r
      FROM v_part_stock
     WHERE product_id = 'a0600004-0000-0000-0000-000000000004';

    ASSERT FOUND,
        'Case 4 FAIL: product with no lots should still appear in v_part_stock';
    ASSERT r.total_qty = 0,
        format('Case 4 FAIL: total_qty expected 0, got %s', r.total_qty);
    ASSERT r.total_value = 0,
        format('Case 4 FAIL: total_value expected 0, got %s', r.total_value);
    ASSERT r.last_received_at IS NULL,
        format('Case 4 FAIL: last_received_at expected NULL, got %s', r.last_received_at);

    RAISE NOTICE 'Case 4 PASSED — product with no lots returns zero row';
END $$;

-- =========================================================
-- Case 5: Invariant — v_part_stock matches hand-rolled query
-- Pre: seed 5 test products with mixed states (some lots, some depleted, some none)
-- Post: row-for-row equality between view and hand-rolled aggregate
-- =========================================================

-- Product E already has no lots; add 2 active lots
INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at) VALUES
    ('a0600005-0000-0000-0000-000000000005', 12, 200.0000, '2026-04-01T00:00:00Z'),
    ('a0600005-0000-0000-0000-000000000005',  8, 150.0000, '2026-04-05T00:00:00Z');

DO $$
DECLARE
    v_mismatches INT;
BEGIN
    -- Compare view output against hand-rolled query for our 5 test products.
    -- Any difference in total_qty or total_value is a mismatch.
    SELECT count(*) INTO v_mismatches
    FROM (
        -- View output for test products
        SELECT product_id, total_qty, total_value
          FROM v_part_stock
         WHERE product_id IN (
            'a0600001-0000-0000-0000-000000000001',
            'a0600002-0000-0000-0000-000000000002',
            'a0600003-0000-0000-0000-000000000003',
            'a0600004-0000-0000-0000-000000000004',
            'a0600005-0000-0000-0000-000000000005'
         )
    ) v
    FULL OUTER JOIN (
        -- Hand-rolled aggregate
        SELECT
            p.id AS product_id,
            COALESCE(SUM(sl.quantity), 0) AS total_qty,
            COALESCE(SUM(sl.quantity * sl.unit_cost), 0) AS total_value
        FROM products p
        LEFT JOIN stock_lots sl ON sl.product_id = p.id AND sl.quantity > 0
        WHERE p.id IN (
            'a0600001-0000-0000-0000-000000000001',
            'a0600002-0000-0000-0000-000000000002',
            'a0600003-0000-0000-0000-000000000003',
            'a0600004-0000-0000-0000-000000000004',
            'a0600005-0000-0000-0000-000000000005'
        )
        GROUP BY p.id
    ) h ON v.product_id = h.product_id
    WHERE v.product_id IS DISTINCT FROM h.product_id
       OR v.total_qty IS DISTINCT FROM h.total_qty
       OR v.total_value IS DISTINCT FROM h.total_value;

    ASSERT v_mismatches = 0,
        format('Case 5 FAIL: %s mismatches between view and hand-rolled query', v_mismatches);

    RAISE NOTICE 'Case 5 PASSED — view matches hand-rolled aggregate for all 5 products';
END $$;

-- =========================================================
-- Cleanup: ROLLBACK undoes all test data
-- =========================================================

ROLLBACK;

\echo 'T-A06 ALL TESTS PASSED'
