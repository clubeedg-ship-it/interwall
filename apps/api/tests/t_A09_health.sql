-- =============================================================================
-- t_A09_health.sql — Tests for health invariant views (D-047)
--
-- Run:
--   docker compose exec -T postgres psql -U interwall -d interwall \
--     -f /app/tests/t_A09_health.sql
--
-- All tests wrapped in BEGIN/ROLLBACK — no side effects on the DB.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Load prerequisites (idempotent CREATE OR REPLACE)
\i /app/sql/07_deduct_fifo_for_group.sql
\i /app/sql/08_process_bom_sale.sql
\i /app/sql/10_v_health.sql

-- ═══════════════════════════════════════════════════════════════
-- Case 1: sales-without-ledger is empty after process_bom_sale
-- ═══════════════════════════════════════════════════════════════
DO $case1$
DECLARE
    v_count  INTEGER;
    v_prod_id UUID;
    v_ig_id   UUID;
    v_build_id UUID;
    v_txn_id  UUID;
BEGIN
    -- Seed: product + item_group + member + build + component + stock + vat
    INSERT INTO products (ean, name) VALUES ('TEST-H09-C1', 'Health C1 Product')
    RETURNING id INTO v_prod_id;

    INSERT INTO item_groups (code, name) VALUES ('test_h09_c1_grp', 'Health C1 Group')
    RETURNING id INTO v_ig_id;

    INSERT INTO item_group_members (item_group_id, product_id) VALUES (v_ig_id, v_prod_id);

    INSERT INTO builds (build_code, name, is_auto_generated)
    VALUES ('TEST-H09-C1', 'Health C1 Build', TRUE)
    RETURNING id INTO v_build_id;

    INSERT INTO build_components (build_id, item_group_id, quantity)
    VALUES (v_build_id, v_ig_id, 1);

    INSERT INTO stock_lots (product_id, quantity, unit_cost)
    VALUES (v_prod_id, 10, 50.0000);

    INSERT INTO vat_rates (marketplace, country, rate)
    VALUES ('test_h09', 'NL', 21.00)
    ON CONFLICT (marketplace) DO NOTHING;

    -- Process a sale via process_bom_sale
    SELECT process_bom_sale('TEST-H09-C1', 1, 200.00, 'test_h09', 'ORD-H09-C1')
    INTO v_txn_id;

    -- Verify: sale should NOT appear in sales-without-ledger
    SELECT COUNT(*) INTO v_count
    FROM v_health_sales_without_ledger
    WHERE id = v_txn_id;

    ASSERT v_count = 0,
        'Case 1 FAIL: sale via process_bom_sale should have ledger rows';
    RAISE NOTICE 'Case 1 PASSED — sales-without-ledger clean after process_bom_sale';
END $case1$;

-- ═══════════════════════════════════════════════════════════════
-- Case 2: intentionally broken invariant detected
-- ═══════════════════════════════════════════════════════════════
DO $case2$
DECLARE
    v_fake_txn UUID;
    v_count    INTEGER;
BEGIN
    -- Insert a sale transaction directly (bypassing process_bom_sale).
    -- This has NO stock_ledger_entries rows — intentional invariant violation.
    -- This is exactly the scenario D-017 is designed to catch.
    INSERT INTO transactions (type, product_ean, quantity, unit_price, total_price,
                              marketplace, order_reference)
    VALUES ('sale', 'FAKE-BROKEN', 1, 100.00, 100.00, 'test_broken', 'ORD-BROKEN')
    RETURNING id INTO v_fake_txn;

    SELECT COUNT(*) INTO v_count
    FROM v_health_sales_without_ledger
    WHERE id = v_fake_txn;

    ASSERT v_count = 1,
        'Case 2 FAIL: view should detect sale without ledger rows';
    RAISE NOTICE 'Case 2 PASSED — invariant violation detected';
END $case2$;

-- ═══════════════════════════════════════════════════════════════
-- Case 3: orphan parts views
-- ═══════════════════════════════════════════════════════════════
DO $case3$
DECLARE
    v_orphan_id UUID;
    v_homed_id  UUID;
    v_shelf_id  UUID;
    v_found     BOOLEAN;
BEGIN
    -- Product with no stock_lots at all → should appear in parts-without-shelf
    INSERT INTO products (ean, name) VALUES ('TEST-H09-ORPHAN', 'Orphan Part')
    RETURNING id INTO v_orphan_id;

    -- Product with a shelf-assigned stock_lot → should NOT appear
    INSERT INTO products (ean, name) VALUES ('TEST-H09-HOMED', 'Homed Part')
    RETURNING id INTO v_homed_id;

    SELECT id INTO v_shelf_id FROM shelves LIMIT 1;

    INSERT INTO stock_lots (product_id, quantity, unit_cost, shelf_id)
    VALUES (v_homed_id, 5, 10.00, v_shelf_id);

    -- Orphan should appear
    SELECT EXISTS (
        SELECT 1 FROM v_health_parts_without_shelf WHERE product_id = v_orphan_id
    ) INTO v_found;
    ASSERT v_found = TRUE,
        'Case 3a FAIL: orphan product should be in parts-without-shelf';

    -- Homed product should NOT appear
    SELECT EXISTS (
        SELECT 1 FROM v_health_parts_without_shelf WHERE product_id = v_homed_id
    ) INTO v_found;
    ASSERT v_found = FALSE,
        'Case 3b FAIL: homed product should NOT be in parts-without-shelf';

    -- parts-without-reorder: orphan has no JIT config → should appear
    SELECT EXISTS (
        SELECT 1 FROM v_health_parts_without_reorder WHERE product_id = v_orphan_id
    ) INTO v_found;
    ASSERT v_found = TRUE,
        'Case 3c FAIL: product without reorder config should appear';

    -- Set minimum_stock > 0 → should disappear from parts-without-reorder
    UPDATE products SET minimum_stock = 5 WHERE id = v_orphan_id;

    SELECT EXISTS (
        SELECT 1 FROM v_health_parts_without_reorder WHERE product_id = v_orphan_id
    ) INTO v_found;
    ASSERT v_found = FALSE,
        'Case 3d FAIL: product with minimum_stock > 0 should NOT appear';

    RAISE NOTICE 'Case 3 PASSED — orphan parts views correct';
END $case3$;

-- ═══════════════════════════════════════════════════════════════
-- Case 4: builds-without-xref view
-- ═══════════════════════════════════════════════════════════════
DO $case4$
DECLARE
    v_build_id UUID;
    v_ig_id    UUID;
    v_found    BOOLEAN;
BEGIN
    -- Create a non-auto-generated build with no xref
    INSERT INTO item_groups (code, name) VALUES ('test_h09_c4_grp', 'Health C4 Group')
    RETURNING id INTO v_ig_id;

    INSERT INTO builds (build_code, name, is_auto_generated, is_active)
    VALUES ('TEST-H09-C4-BLD', 'Manual Build No Xref', FALSE, TRUE)
    RETURNING id INTO v_build_id;

    INSERT INTO build_components (build_id, item_group_id, quantity)
    VALUES (v_build_id, v_ig_id, 2);

    -- Should appear in builds-without-xref
    SELECT EXISTS (
        SELECT 1 FROM v_health_builds_without_xref WHERE build_code = 'TEST-H09-C4-BLD'
    ) INTO v_found;
    ASSERT v_found = TRUE,
        'Case 4a FAIL: manual build without xref should appear';

    -- Auto-generated builds should NOT appear (excluded per D-018)
    SELECT EXISTS (
        SELECT 1 FROM v_health_builds_without_xref
        WHERE build_code = 'TEST-H09-C1'  -- from case 1, is_auto_generated = TRUE
    ) INTO v_found;
    ASSERT v_found = FALSE,
        'Case 4b FAIL: auto-generated builds should be excluded';

    -- Add an xref → should disappear
    INSERT INTO external_item_xref (marketplace, external_sku, build_code)
    VALUES ('test_h09_mp', 'H09-SKU', 'TEST-H09-C4-BLD');

    SELECT EXISTS (
        SELECT 1 FROM v_health_builds_without_xref WHERE build_code = 'TEST-H09-C4-BLD'
    ) INTO v_found;
    ASSERT v_found = FALSE,
        'Case 4c FAIL: build with xref should NOT appear';

    RAISE NOTICE 'Case 4 PASSED — builds-without-xref view correct';
END $case4$;

-- ═══════════════════════════════════════════════════════════════
-- Cleanup and final pass line
-- ═══════════════════════════════════════════════════════════════

ROLLBACK;

\echo 'T-A09 ALL TESTS PASSED'
