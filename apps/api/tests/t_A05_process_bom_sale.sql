-- =============================================================================
-- t_A05_process_bom_sale.sql — T-A05 test harness
--
-- Tests for process_bom_sale() PL/pgSQL function.
-- Wraps in BEGIN/ROLLBACK — leaves no side effects on the dev DB.
-- Abort on first failure via ON_ERROR_STOP.
--
-- Run:
--   docker compose exec -T postgres psql -U interwall -d interwall \
--     -f /app/tests/t_A05_process_bom_sale.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Load latest function definitions from source files
\i /app/sql/07_deduct_fifo_for_group.sql
\i /app/sql/08_process_bom_sale.sql

-- ── Deterministic fixed_costs ───────────────────────────────────────────────
-- Replace with known values so profit math is predictable.
-- commission = 6.20% (percentage), overhead = 95.00 (flat)
DELETE FROM fixed_costs;
INSERT INTO fixed_costs (name, value, is_percentage) VALUES
    ('commission',  6.20, TRUE),
    ('overhead',   95.00, FALSE);

-- Test marketplace VAT rate (21%)
INSERT INTO vat_rates (marketplace, country, rate) VALUES
    ('test_mp', 'NL', 21.00)
ON CONFLICT (marketplace) DO NOTHING;


-- ── Shared fixtures ─────────────────────────────────────────────────────────

-- Products
INSERT INTO products (id, ean, name) VALUES
    ('ee010000-0000-0000-0000-000000000001', 'T-BMS-P1', 'Test Part 1'),
    ('ee010000-0000-0000-0000-000000000002', 'T-BMS-P2', 'Test Part 2'),
    ('ee010000-0000-0000-0000-000000000003', 'T-BMS-P3', 'Test Part 3'),
    ('ee010000-0000-0000-0000-000000000004', 'T-BMS-P4', 'Test Part 4'),
    ('ee010000-0000-0000-0000-000000000005', 'T-BMS-P5', 'Test Part 5'),
    ('ee010000-0000-0000-0000-000000000006', 'T-BMS-P6', 'Test Part 6')
ON CONFLICT (ean) DO NOTHING;

-- Item groups (one per product — singleton groups)
INSERT INTO item_groups (id, code, name) VALUES
    ('ee020000-0000-0000-0000-000000000001', 'T-BMS-G1', 'Test Group 1'),
    ('ee020000-0000-0000-0000-000000000002', 'T-BMS-G2', 'Test Group 2'),
    ('ee020000-0000-0000-0000-000000000003', 'T-BMS-G3', 'Test Group 3'),
    ('ee020000-0000-0000-0000-000000000004', 'T-BMS-G4', 'Test Group 4'),
    ('ee020000-0000-0000-0000-000000000005', 'T-BMS-G5', 'Test Group 5'),
    ('ee020000-0000-0000-0000-000000000006', 'T-BMS-G6', 'Test Group 6')
ON CONFLICT (code) DO NOTHING;

INSERT INTO item_group_members (item_group_id, product_id) VALUES
    ('ee020000-0000-0000-0000-000000000001', 'ee010000-0000-0000-0000-000000000001'),
    ('ee020000-0000-0000-0000-000000000002', 'ee010000-0000-0000-0000-000000000002'),
    ('ee020000-0000-0000-0000-000000000003', 'ee010000-0000-0000-0000-000000000003'),
    ('ee020000-0000-0000-0000-000000000004', 'ee010000-0000-0000-0000-000000000004'),
    ('ee020000-0000-0000-0000-000000000005', 'ee010000-0000-0000-0000-000000000005'),
    ('ee020000-0000-0000-0000-000000000006', 'ee010000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;

-- Build 1: 2-component (happy path + stock-out tests)
--   G1 x1 + G2 x2
INSERT INTO builds (id, build_code, name) VALUES
    ('ee030000-0000-0000-0000-000000000001', 'T-BLD-HP', 'Happy Path Build')
ON CONFLICT (build_code) DO NOTHING;
INSERT INTO build_components (build_id, item_group_id, quantity) VALUES
    ('ee030000-0000-0000-0000-000000000001', 'ee020000-0000-0000-0000-000000000001', 1),
    ('ee030000-0000-0000-0000-000000000001', 'ee020000-0000-0000-0000-000000000002', 2)
ON CONFLICT DO NOTHING;

-- Build 2: single component needing 5 (multi-lot test)
--   G3 x5
INSERT INTO builds (id, build_code, name) VALUES
    ('ee030000-0000-0000-0000-000000000002', 'T-BLD-ML', 'Multi-Lot Build')
ON CONFLICT (build_code) DO NOTHING;
INSERT INTO build_components (build_id, item_group_id, quantity) VALUES
    ('ee030000-0000-0000-0000-000000000002', 'ee020000-0000-0000-0000-000000000003', 5)
ON CONFLICT DO NOTHING;

-- Build 3: trivial auto-generated build (D-018)
--   G4 x1, is_auto_generated=TRUE
INSERT INTO builds (id, build_code, name, is_auto_generated) VALUES
    ('ee030000-0000-0000-0000-000000000003', 'T-BLD-AUTO', 'Auto Build', TRUE)
ON CONFLICT (build_code) DO NOTHING;
INSERT INTO build_components (build_id, item_group_id, quantity) VALUES
    ('ee030000-0000-0000-0000-000000000003', 'ee020000-0000-0000-0000-000000000004', 1)
ON CONFLICT DO NOTHING;

-- Build 4: inactive build (test 6)
INSERT INTO builds (id, build_code, name, is_active) VALUES
    ('ee030000-0000-0000-0000-000000000004', 'T-BLD-INACTIVE', 'Inactive Build', FALSE)
ON CONFLICT (build_code) DO NOTHING;
INSERT INTO build_components (build_id, item_group_id, quantity) VALUES
    ('ee030000-0000-0000-0000-000000000004', 'ee020000-0000-0000-0000-000000000001', 1)
ON CONFLICT DO NOTHING;

-- Build 5: validity filter test
--   G5 x1 (valid: -inf to +inf) + G6 x1 (expired: valid_to = 2020-01-01)
INSERT INTO builds (id, build_code, name) VALUES
    ('ee030000-0000-0000-0000-000000000005', 'T-BLD-VF', 'Validity Filter Build')
ON CONFLICT (build_code) DO NOTHING;
INSERT INTO build_components (build_id, item_group_id, quantity, valid_from, valid_to) VALUES
    ('ee030000-0000-0000-0000-000000000005', 'ee020000-0000-0000-0000-000000000005', 1,
     '-infinity', 'infinity'),
    ('ee030000-0000-0000-0000-000000000005', 'ee020000-0000-0000-0000-000000000006', 1,
     '-infinity', '2020-01-01 00:00:00+00')
ON CONFLICT DO NOTHING;

-- Stock lots
INSERT INTO stock_lots (id, product_id, quantity, unit_cost, received_at) VALUES
    ('ee040000-0000-0000-0000-000000000001', 'ee010000-0000-0000-0000-000000000001',
      5,  50.0000, '2026-01-01 00:00:00+00'),   -- P1: 5 @ 50
    ('ee040000-0000-0000-0000-000000000002', 'ee010000-0000-0000-0000-000000000002',
     10,  30.0000, '2026-01-01 00:00:00+00'),   -- P2: 10 @ 30
    ('ee040000-0000-0000-0000-000000000003', 'ee010000-0000-0000-0000-000000000003',
      3,  80.0000, '2026-01-01 00:00:00+00'),   -- P3 lot1: 3 @ 80
    ('ee040000-0000-0000-0000-000000000004', 'ee010000-0000-0000-0000-000000000003',
      5,  90.0000, '2026-02-01 00:00:00+00'),   -- P3 lot2: 5 @ 90
    ('ee040000-0000-0000-0000-000000000005', 'ee010000-0000-0000-0000-000000000004',
      3, 120.0000, '2026-01-01 00:00:00+00'),   -- P4: 3 @ 120
    ('ee040000-0000-0000-0000-000000000006', 'ee010000-0000-0000-0000-000000000005',
      5, 200.0000, '2026-01-01 00:00:00+00'),   -- P5: 5 @ 200
    ('ee040000-0000-0000-0000-000000000007', 'ee010000-0000-0000-0000-000000000006',
      5, 100.0000, '2026-01-01 00:00:00+00');   -- P6: 5 @ 100


-- =============================================================================
-- TEST 1: Happy path — 2-component build
-- Build T-BLD-HP: G1 x1 + G2 x2
-- Sale: qty=1, price=500, marketplace=test_mp
-- COGS: 1*50 + 2*30 = 110
-- Fixed: 500*0.062 + 95 = 126.  VAT: 500*0.21 = 105.  Total deductions: 231
-- Profit: 500 - 110 - 231 = 159
-- Ledger: 2 rows.  Stock: P1 5→4, P2 10→8.
-- =============================================================================
\echo '--- TEST 1: happy path (2-component build) ---'
SAVEPOINT t1;

DO $$
DECLARE
    v_txn_id       UUID;
    v_cogs         NUMERIC(12,4);
    v_profit       NUMERIC(12,4);
    v_build_code   TEXT;
    v_product_ean  TEXT;
    v_type         TEXT;
    v_total_price  NUMERIC(12,4);
    v_ledger_count INTEGER;
    v_p1_qty       INTEGER;
    v_p2_qty       INTEGER;
BEGIN
    SELECT process_bom_sale('T-BLD-HP', 1, 500.00, 'test_mp') INTO v_txn_id;

    SELECT cogs, profit, build_code, product_ean, type, total_price
    INTO STRICT v_cogs, v_profit, v_build_code, v_product_ean, v_type, v_total_price
    FROM transactions WHERE id = v_txn_id;

    IF v_type != 'sale' THEN
        RAISE EXCEPTION 'TEST 1 FAILED: type expected sale, got %', v_type;
    END IF;
    IF v_build_code != 'T-BLD-HP' THEN
        RAISE EXCEPTION 'TEST 1 FAILED: build_code expected T-BLD-HP, got %', v_build_code;
    END IF;
    IF v_total_price != 500.0000 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: total_price expected 500, got %', v_total_price;
    END IF;
    IF v_cogs != 110.0000 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: cogs expected 110.0000, got %', v_cogs;
    END IF;
    IF v_profit != 159.0000 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: profit expected 159.0000, got %', v_profit;
    END IF;

    -- Verify ledger rows
    SELECT count(*) INTO v_ledger_count
    FROM stock_ledger_entries WHERE transaction_id = v_txn_id;
    IF v_ledger_count != 2 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: ledger rows expected 2, got %', v_ledger_count;
    END IF;

    -- Verify stock decrements
    SELECT quantity INTO STRICT v_p1_qty
    FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000001';
    IF v_p1_qty != 4 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: P1 qty expected 4, got %', v_p1_qty;
    END IF;

    SELECT quantity INTO STRICT v_p2_qty
    FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000002';
    IF v_p2_qty != 8 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: P2 qty expected 8, got %', v_p2_qty;
    END IF;

    RAISE NOTICE 'TEST 1 PASSED: cogs=%, profit=%, ledger=%, P1=%, P2=%',
        v_cogs, v_profit, v_ledger_count, v_p1_qty, v_p2_qty;
END $$;

ROLLBACK TO t1;


-- =============================================================================
-- TEST 2: Stock-out on component 2 → full rollback (D-022)
-- Reduce P2 to 1 unit (need 2). Expect RAISE from deduct_fifo_for_group.
-- Everything rolls back: no txn shell, no ledger rows, P1 stock unchanged.
-- =============================================================================
\echo '--- TEST 2: stock-out on component 2 → full rollback ---'
SAVEPOINT t2;

UPDATE stock_lots SET quantity = 1
WHERE id = 'ee040000-0000-0000-0000-000000000002';

DO $$
DECLARE
    v_txn_id     UUID;
    v_txn_count  INTEGER;
    v_sle_count  INTEGER;
    v_p1_qty     INTEGER;
    v_p2_qty     INTEGER;
BEGIN
    SELECT process_bom_sale('T-BLD-HP', 1, 500.00, 'test_mp') INTO v_txn_id;
    RAISE EXCEPTION 'TEST 2 FAILED: no exception raised';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'TEST 2 FAILED%' THEN
            RAISE EXCEPTION '%', SQLERRM;
        END IF;

        IF SQLERRM NOT LIKE '%insufficient stock%' THEN
            RAISE EXCEPTION 'TEST 2 FAILED: wrong exception: %', SQLERRM;
        END IF;

        -- Verify nothing persisted (subtransaction rolled back)
        SELECT count(*) INTO v_txn_count
        FROM transactions WHERE build_code = 'T-BLD-HP';
        IF v_txn_count != 0 THEN
            RAISE EXCEPTION 'TEST 2 FAILED: expected 0 txn rows, got %', v_txn_count;
        END IF;

        SELECT count(*) INTO v_sle_count
        FROM stock_ledger_entries sle
        JOIN transactions t ON t.id = sle.transaction_id
        WHERE t.build_code = 'T-BLD-HP';
        IF v_sle_count != 0 THEN
            RAISE EXCEPTION 'TEST 2 FAILED: expected 0 ledger rows, got %', v_sle_count;
        END IF;

        -- P1 unchanged (G1 deduction rolled back with the subtransaction)
        SELECT quantity INTO STRICT v_p1_qty
        FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000001';
        IF v_p1_qty != 5 THEN
            RAISE EXCEPTION 'TEST 2 FAILED: P1 qty expected 5 (unchanged), got %', v_p1_qty;
        END IF;

        -- P2 still 1 (our pre-test UPDATE, no change from failed sale)
        SELECT quantity INTO STRICT v_p2_qty
        FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000002';
        IF v_p2_qty != 1 THEN
            RAISE EXCEPTION 'TEST 2 FAILED: P2 qty expected 1 (unchanged), got %', v_p2_qty;
        END IF;

        RAISE NOTICE 'TEST 2 PASSED: stock-out raised, full rollback confirmed (P1=%, P2=%)',
            v_p1_qty, v_p2_qty;
END $$;

ROLLBACK TO t2;


-- =============================================================================
-- TEST 3: Missing VAT rate → RAISE (D-027)
-- Marketplace 'no_vat_marketplace' has no vat_rates row.
-- Must fail loudly — no silent 21% default.
-- =============================================================================
\echo '--- TEST 3: missing VAT rate → RAISE ---'
SAVEPOINT t3;

DO $$
DECLARE
    v_txn_id UUID;
BEGIN
    SELECT process_bom_sale('T-BLD-HP', 1, 500.00, 'no_vat_marketplace')
    INTO v_txn_id;
    RAISE EXCEPTION 'TEST 3 FAILED: no exception raised';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'TEST 3 FAILED%' THEN
            RAISE EXCEPTION '%', SQLERRM;
        END IF;
        IF SQLERRM LIKE '%no vat_rates row%no_vat_marketplace%' THEN
            RAISE NOTICE 'TEST 3 PASSED: %', SQLERRM;
        ELSE
            RAISE EXCEPTION 'TEST 3 FAILED: wrong message: %', SQLERRM;
        END IF;
END $$;

ROLLBACK TO t3;


-- =============================================================================
-- TEST 4: Multi-lot consumption — single component spans 2 lots
-- Build T-BLD-ML: G3 x5
-- P3 lots: lot1 3 @ 80 (oldest), lot2 5 @ 90 (newer)
-- Sale: qty=1, price=800, marketplace=test_mp
-- COGS: 3*80 + 2*90 = 240 + 180 = 420
-- Fixed: 800*0.062 + 95 = 144.60.  VAT: 800*0.21 = 168.  Total: 312.60
-- Profit: 800 - 420 - 312.60 = 67.40
-- Ledger: 2 rows (one per lot).  Stock: lot1 3→0, lot2 5→3.
-- =============================================================================
\echo '--- TEST 4: multi-lot consumption ---'
SAVEPOINT t4;

DO $$
DECLARE
    v_txn_id       UUID;
    v_cogs         NUMERIC(12,4);
    v_profit       NUMERIC(12,4);
    v_ledger_count INTEGER;
    v_lot1_qty     INTEGER;
    v_lot2_qty     INTEGER;
    v_sle_rec      RECORD;
BEGIN
    SELECT process_bom_sale('T-BLD-ML', 1, 800.00, 'test_mp') INTO v_txn_id;

    SELECT cogs, profit INTO STRICT v_cogs, v_profit
    FROM transactions WHERE id = v_txn_id;

    IF v_cogs != 420.0000 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: cogs expected 420.0000, got %', v_cogs;
    END IF;
    IF v_profit != 67.4000 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: profit expected 67.4000, got %', v_profit;
    END IF;

    -- 2 ledger rows (one per lot consumed)
    SELECT count(*) INTO v_ledger_count
    FROM stock_ledger_entries WHERE transaction_id = v_txn_id;
    IF v_ledger_count != 2 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: ledger rows expected 2, got %', v_ledger_count;
    END IF;

    -- Ledger row for lot1: qty_delta = -3, unit_cost = 80
    SELECT qty_delta, unit_cost INTO STRICT v_sle_rec
    FROM stock_ledger_entries
    WHERE transaction_id = v_txn_id
      AND stock_lot_id = 'ee040000-0000-0000-0000-000000000003';
    IF v_sle_rec.qty_delta != -3 OR v_sle_rec.unit_cost != 80.0000 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: lot1 ledger expected (-3, 80), got (%, %)',
            v_sle_rec.qty_delta, v_sle_rec.unit_cost;
    END IF;

    -- Ledger row for lot2: qty_delta = -2, unit_cost = 90
    SELECT qty_delta, unit_cost INTO STRICT v_sle_rec
    FROM stock_ledger_entries
    WHERE transaction_id = v_txn_id
      AND stock_lot_id = 'ee040000-0000-0000-0000-000000000004';
    IF v_sle_rec.qty_delta != -2 OR v_sle_rec.unit_cost != 90.0000 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: lot2 ledger expected (-2, 90), got (%, %)',
            v_sle_rec.qty_delta, v_sle_rec.unit_cost;
    END IF;

    -- Stock: lot1=0, lot2=3
    SELECT quantity INTO STRICT v_lot1_qty
    FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000003';
    SELECT quantity INTO STRICT v_lot2_qty
    FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000004';
    IF v_lot1_qty != 0 OR v_lot2_qty != 3 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: stock expected (0, 3), got (%, %)',
            v_lot1_qty, v_lot2_qty;
    END IF;

    RAISE NOTICE 'TEST 4 PASSED: cogs=%, profit=%, lot1=%, lot2=%, ledger=%',
        v_cogs, v_profit, v_lot1_qty, v_lot2_qty, v_ledger_count;
END $$;

ROLLBACK TO t4;


-- =============================================================================
-- TEST 5: Trivial auto-generated build (D-018)
-- Build T-BLD-AUTO: G4 x1, is_auto_generated=TRUE
-- P4: 3 @ 120.  Sale: qty=1, price=300, marketplace=test_mp
-- COGS: 1*120 = 120
-- Fixed: 300*0.062 + 95 = 113.60.  VAT: 300*0.21 = 63.  Total: 176.60
-- Profit: 300 - 120 - 176.60 = 3.40
-- Ledger: 1 row.  Stock: P4 3→2.
-- =============================================================================
\echo '--- TEST 5: trivial auto-generated build ---'
SAVEPOINT t5;

DO $$
DECLARE
    v_txn_id       UUID;
    v_cogs         NUMERIC(12,4);
    v_profit       NUMERIC(12,4);
    v_ledger_count INTEGER;
    v_p4_qty       INTEGER;
BEGIN
    SELECT process_bom_sale('T-BLD-AUTO', 1, 300.00, 'test_mp') INTO v_txn_id;

    SELECT cogs, profit INTO STRICT v_cogs, v_profit
    FROM transactions WHERE id = v_txn_id;

    IF v_cogs != 120.0000 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: cogs expected 120.0000, got %', v_cogs;
    END IF;
    IF v_profit != 3.4000 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: profit expected 3.4000, got %', v_profit;
    END IF;

    SELECT count(*) INTO v_ledger_count
    FROM stock_ledger_entries WHERE transaction_id = v_txn_id;
    IF v_ledger_count != 1 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: ledger rows expected 1, got %', v_ledger_count;
    END IF;

    SELECT quantity INTO STRICT v_p4_qty
    FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000005';
    IF v_p4_qty != 2 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: P4 qty expected 2, got %', v_p4_qty;
    END IF;

    RAISE NOTICE 'TEST 5 PASSED: cogs=%, profit=%, ledger=%, P4=%',
        v_cogs, v_profit, v_ledger_count, v_p4_qty;
END $$;

ROLLBACK TO t5;


-- =============================================================================
-- TEST 6: Inactive build → RAISE
-- Build T-BLD-INACTIVE has is_active=FALSE.
-- Must reject before touching stock or creating a transaction.
-- =============================================================================
\echo '--- TEST 6: inactive build → RAISE ---'
SAVEPOINT t6;

DO $$
DECLARE
    v_txn_id UUID;
BEGIN
    SELECT process_bom_sale('T-BLD-INACTIVE', 1, 500.00, 'test_mp')
    INTO v_txn_id;
    RAISE EXCEPTION 'TEST 6 FAILED: no exception raised';
EXCEPTION
    WHEN raise_exception THEN
        IF SQLERRM LIKE 'TEST 6 FAILED%' THEN
            RAISE EXCEPTION '%', SQLERRM;
        END IF;
        IF SQLERRM LIKE '%active build not found%T-BLD-INACTIVE%' THEN
            RAISE NOTICE 'TEST 6 PASSED: %', SQLERRM;
        ELSE
            RAISE EXCEPTION 'TEST 6 FAILED: wrong message: %', SQLERRM;
        END IF;
END $$;

ROLLBACK TO t6;


-- =============================================================================
-- TEST 7: valid_from/valid_to filter — expired component skipped (D-087)
-- Build T-BLD-VF: G5 x1 (valid, -inf to +inf) + G6 x1 (expired, to 2020)
-- Only G5 processed. P6 stock untouched.
-- P5: 5 @ 200 → deduct 1.  P6: 5 @ 100 → unchanged.
-- COGS: 1*200 = 200
-- Fixed: 600*0.062 + 95 = 132.20.  VAT: 600*0.21 = 126.  Total: 258.20
-- Profit: 600 - 200 - 258.20 = 141.80
-- Ledger: 1 row (G5 only).
-- =============================================================================
\echo '--- TEST 7: valid_from/valid_to filter ---'
SAVEPOINT t7;

DO $$
DECLARE
    v_txn_id       UUID;
    v_cogs         NUMERIC(12,4);
    v_profit       NUMERIC(12,4);
    v_ledger_count INTEGER;
    v_p5_qty       INTEGER;
    v_p6_qty       INTEGER;
BEGIN
    SELECT process_bom_sale('T-BLD-VF', 1, 600.00, 'test_mp') INTO v_txn_id;

    SELECT cogs, profit INTO STRICT v_cogs, v_profit
    FROM transactions WHERE id = v_txn_id;

    IF v_cogs != 200.0000 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: cogs expected 200.0000, got %', v_cogs;
    END IF;
    IF v_profit != 141.8000 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: profit expected 141.8000, got %', v_profit;
    END IF;

    SELECT count(*) INTO v_ledger_count
    FROM stock_ledger_entries WHERE transaction_id = v_txn_id;
    IF v_ledger_count != 1 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: ledger rows expected 1, got %', v_ledger_count;
    END IF;

    -- P5 decremented
    SELECT quantity INTO STRICT v_p5_qty
    FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000006';
    IF v_p5_qty != 4 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: P5 qty expected 4, got %', v_p5_qty;
    END IF;

    -- P6 untouched (expired component skipped)
    SELECT quantity INTO STRICT v_p6_qty
    FROM stock_lots WHERE id = 'ee040000-0000-0000-0000-000000000007';
    IF v_p6_qty != 5 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: P6 qty expected 5 (untouched), got %', v_p6_qty;
    END IF;

    RAISE NOTICE 'TEST 7 PASSED: cogs=%, profit=%, ledger=%, P5=%, P6=%',
        v_cogs, v_profit, v_ledger_count, v_p5_qty, v_p6_qty;
END $$;

ROLLBACK TO t7;


-- ── Clean up ────────────────────────────────────────────────────────────────
ROLLBACK;

\echo 'T-A05 ALL TESTS PASSED'
