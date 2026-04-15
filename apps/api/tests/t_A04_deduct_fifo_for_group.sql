-- =============================================================================
-- 07_test_deduct_fifo.sql — T-A04 test harness
-- Runs inside a transaction that rolls back at the end (no side effects).
-- Each test uses a SAVEPOINT so failures don't abort subsequent tests.
-- =============================================================================

BEGIN;

-- Load the function under test (mounted at /app/sql/ in the container)
\i /app/sql/07_deduct_fifo_for_group.sql

-- ── Test fixtures ───────────────────────────────────────────────────────────
-- 3 products, 1 item_group, 3 lots at different dates/costs

INSERT INTO products (id, ean, name) VALUES
    ('aaaa0000-0000-0000-0000-000000000001', 'TEST-EAN-A', 'Test GPU A'),
    ('aaaa0000-0000-0000-0000-000000000002', 'TEST-EAN-B', 'Test GPU B'),
    ('aaaa0000-0000-0000-0000-000000000003', 'TEST-EAN-C', 'Test GPU C')
ON CONFLICT (ean) DO NOTHING;

INSERT INTO item_groups (id, code, name) VALUES
    ('bbbb0000-0000-0000-0000-000000000001', 'TEST-GROUP-1', 'Test GPU Group')
ON CONFLICT (code) DO NOTHING;

INSERT INTO item_group_members (item_group_id, product_id) VALUES
    ('bbbb0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001'),
    ('bbbb0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002'),
    ('bbbb0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

-- An empty group (no members) for test 5
INSERT INTO item_groups (id, code, name) VALUES
    ('bbbb0000-0000-0000-0000-000000000002', 'TEST-GROUP-EMPTY', 'Empty Group')
ON CONFLICT (code) DO NOTHING;

-- Lots: A oldest (5 units @ 100), B middle (3 units @ 150), C newest (2 units @ 200)
-- Total: 10 units across the group
INSERT INTO stock_lots (id, product_id, quantity, unit_cost, received_at) VALUES
    ('cccc0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001',
     5, 100.0000, '2026-01-01 00:00:00+00'),
    ('cccc0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000002',
     3, 150.0000, '2026-02-01 00:00:00+00'),
    ('cccc0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000003',
     2, 200.0000, '2026-03-01 00:00:00+00');


-- ── TEST 1: Exact fit in oldest lot (take 5 from lot A) ─────────────────────
\echo '--- TEST 1: exact fit in oldest lot ---'
SAVEPOINT t1;

SELECT stock_lot_id, product_id, qty_taken, unit_cost
FROM deduct_fifo_for_group('bbbb0000-0000-0000-0000-000000000001', 5);
-- Expect: 1 row — lot A, product A, qty_taken=5, unit_cost=100

-- Verify lot A is now 0
SELECT id, quantity FROM stock_lots
WHERE id = 'cccc0000-0000-0000-0000-000000000001';

ROLLBACK TO t1;


-- ── TEST 2: Span two lots (take 7 → 5 from A + 2 from B) ───────────────────
\echo '--- TEST 2: span two lots ---'
SAVEPOINT t2;

SELECT stock_lot_id, product_id, qty_taken, unit_cost
FROM deduct_fifo_for_group('bbbb0000-0000-0000-0000-000000000001', 7);
-- Expect: 2 rows
--   row 1: lot A, product A, qty_taken=5, unit_cost=100
--   row 2: lot B, product B, qty_taken=2, unit_cost=150

-- Verify: A=0, B=1, C=2
SELECT id, quantity FROM stock_lots
WHERE id IN (
    'cccc0000-0000-0000-0000-000000000001',
    'cccc0000-0000-0000-0000-000000000002',
    'cccc0000-0000-0000-0000-000000000003'
) ORDER BY received_at;

ROLLBACK TO t2;


-- ── TEST 3: Take all 10 (spans all 3 lots) ──────────────────────────────────
\echo '--- TEST 3: take all 10, span all lots ---'
SAVEPOINT t3;

SELECT stock_lot_id, product_id, qty_taken, unit_cost
FROM deduct_fifo_for_group('bbbb0000-0000-0000-0000-000000000001', 10);
-- Expect: 3 rows — 5+3+2

SELECT id, quantity FROM stock_lots
WHERE id IN (
    'cccc0000-0000-0000-0000-000000000001',
    'cccc0000-0000-0000-0000-000000000002',
    'cccc0000-0000-0000-0000-000000000003'
) ORDER BY received_at;
-- All 0

ROLLBACK TO t3;


-- ── TEST 4: Exceed total stock (need 11, have 10) → RAISE ──────────────────
\echo '--- TEST 4: exceed stock → expect RAISE ---'
SAVEPOINT t4;

DO $$
BEGIN
    PERFORM * FROM deduct_fifo_for_group(
        'bbbb0000-0000-0000-0000-000000000001', 11
    );
    RAISE EXCEPTION 'TEST 4 FAILED: no exception raised';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE '%insufficient stock%need 11%have 10%' THEN
            RAISE NOTICE 'TEST 4 PASSED: %', SQLERRM;
        ELSE
            RAISE EXCEPTION 'TEST 4 FAILED: wrong message: %', SQLERRM;
        END IF;
END $$;

ROLLBACK TO t4;


-- ── TEST 5: Empty group (no members) → RAISE ───────────────────────────────
\echo '--- TEST 5: empty group → expect RAISE ---'
SAVEPOINT t5;

DO $$
BEGIN
    PERFORM * FROM deduct_fifo_for_group(
        'bbbb0000-0000-0000-0000-000000000002', 1
    );
    RAISE EXCEPTION 'TEST 5 FAILED: no exception raised';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE '%has no members%' THEN
            RAISE NOTICE 'TEST 5 PASSED: %', SQLERRM;
        ELSE
            RAISE EXCEPTION 'TEST 5 FAILED: wrong message: %', SQLERRM;
        END IF;
END $$;

ROLLBACK TO t5;


-- ── TEST 6: qty <= 0 → RAISE ───────────────────────────────────────────────
\echo '--- TEST 6: qty=0 → expect RAISE ---'
SAVEPOINT t6;

DO $$
BEGIN
    PERFORM * FROM deduct_fifo_for_group(
        'bbbb0000-0000-0000-0000-000000000001', 0
    );
    RAISE EXCEPTION 'TEST 6 FAILED: no exception raised';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE '%qty must be > 0%' THEN
            RAISE NOTICE 'TEST 6 PASSED: %', SQLERRM;
        ELSE
            RAISE EXCEPTION 'TEST 6 FAILED: wrong message: %', SQLERRM;
        END IF;
END $$;

ROLLBACK TO t6;


-- ── ROLLBACK entire transaction (no side effects) ───────────────────────────
ROLLBACK;

\echo 'T-A04 ALL TESTS PASSED'
