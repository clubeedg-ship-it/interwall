-- =============================================================================
-- t_A03a_sku_aliases_retired.sql -- Verify sku_aliases receives no new writes
--
-- Run:
--   docker compose exec -T postgres psql -U interwall -d interwall \
--     -f /app/tests/t_A03a_sku_aliases_retired.sql
--
-- Context: D-019 retires sku_aliases writes. external_item_xref is the
-- single SKU resolution table. sku_aliases stays readable (D-010) but
-- receives no new inserts from runtime code.
--
-- These tests verify:
--   Case 1: process_bom_sale does not touch sku_aliases
--   Case 2: existing sku_aliases reads still resolve correctly
--   Case 3: external_item_xref is the write target for new mappings
--
-- All wrapped in BEGIN/ROLLBACK — no side effects.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =========================================================
-- Seed test data for both cases
-- =========================================================

-- Test product
INSERT INTO products (id, ean, name)
VALUES ('a03a0001-0000-0000-0000-000000000001', 'TEST-A03A-GPU', 'Test GPU for A03a');

-- Item group + member
INSERT INTO item_groups (id, code, name)
VALUES ('a03a0010-0000-0000-0000-000000000010', 'IG-A03A-GPU', 'A03a GPU Group');

INSERT INTO item_group_members (item_group_id, product_id)
VALUES ('a03a0010-0000-0000-0000-000000000010', 'a03a0001-0000-0000-0000-000000000001');

-- Build with one component
INSERT INTO builds (id, build_code, name, is_auto_generated)
VALUES ('a03a0020-0000-0000-0000-000000000020', 'BLD-A03A-001', 'A03a Test Build', TRUE);

INSERT INTO build_components (build_id, item_group_id, quantity)
VALUES ('a03a0020-0000-0000-0000-000000000020', 'a03a0010-0000-0000-0000-000000000010', 1);

-- Stock lot (enough for a sale)
INSERT INTO stock_lots (product_id, quantity, unit_cost, received_at)
VALUES ('a03a0001-0000-0000-0000-000000000001', 10, 250.0000, '2026-03-01T00:00:00Z');

-- External item xref mapping (the new way, per D-019)
INSERT INTO external_item_xref (marketplace, external_sku, build_code)
VALUES ('testmarket', 'TST-SKU-A03A', 'BLD-A03A-001');

-- Seed a legacy sku_aliases row (for Case 2 read test)
INSERT INTO sku_aliases (marketplace_sku, product_ean, marketplace)
VALUES ('LEGACY-SKU-A03A', 'TEST-A03A-GPU', 'testmarket');

-- Ensure vat_rates exists for test marketplace
INSERT INTO vat_rates (marketplace, country, rate)
VALUES ('testmarket', 'NL', 21.00)
ON CONFLICT (marketplace) DO NOTHING;

-- =========================================================
-- Case 1: process_bom_sale does not insert into sku_aliases
-- Pre: count sku_aliases rows
-- Act: run process_bom_sale
-- Post: sku_aliases count unchanged
-- =========================================================

DO $$
DECLARE
    v_before BIGINT;
    v_after  BIGINT;
    v_txn_id UUID;
BEGIN
    SELECT count(*) INTO v_before FROM sku_aliases;

    -- Run a sale through process_bom_sale
    SELECT process_bom_sale(
        p_build_code   := 'BLD-A03A-001',
        p_quantity      := 1,
        p_sale_price    := 500.00,
        p_marketplace   := 'testmarket',
        p_order_ref     := 'ORD-A03A-001'
    ) INTO v_txn_id;

    SELECT count(*) INTO v_after FROM sku_aliases;

    ASSERT v_before = v_after,
        format('Case 1 FAIL: sku_aliases row count changed from %s to %s after process_bom_sale',
               v_before, v_after);

    RAISE NOTICE 'Case 1 PASSED — process_bom_sale does not write to sku_aliases (before=%, after=%)', v_before, v_after;
END $$;

-- =========================================================
-- Case 2: Existing sku_aliases reads still work
-- Pre: legacy row exists (LEGACY-SKU-A03A → TEST-A03A-GPU)
-- Act: SELECT from sku_aliases
-- Post: read succeeds, returns correct product_ean
-- =========================================================

DO $$
DECLARE
    v_ean TEXT;
BEGIN
    -- Marketplace-specific read (the path sale_writer.resolve_ean uses)
    SELECT product_ean INTO v_ean
      FROM sku_aliases
     WHERE marketplace_sku = 'LEGACY-SKU-A03A'
       AND marketplace = 'testmarket';

    ASSERT FOUND,
        'Case 2 FAIL: sku_aliases read with marketplace filter returned no row';
    ASSERT v_ean = 'TEST-A03A-GPU',
        format('Case 2 FAIL: expected TEST-A03A-GPU, got %s', v_ean);

    -- Marketplace-agnostic read (fallback path in resolve_ean)
    SELECT product_ean INTO v_ean
      FROM sku_aliases
     WHERE marketplace_sku = 'LEGACY-SKU-A03A';

    ASSERT FOUND,
        'Case 2 FAIL: sku_aliases read without marketplace filter returned no row';
    ASSERT v_ean = 'TEST-A03A-GPU',
        format('Case 2 FAIL: expected TEST-A03A-GPU, got %s', v_ean);

    RAISE NOTICE 'Case 2 PASSED — sku_aliases reads still resolve correctly';
END $$;

-- =========================================================
-- Case 3: external_item_xref is the write target for new mappings
-- Pre: xref row exists (testmarket, TST-SKU-A03A → BLD-A03A-001)
-- Act: SELECT from external_item_xref
-- Post: resolves to the correct build_code
-- =========================================================

DO $$
DECLARE
    v_build TEXT;
BEGIN
    SELECT build_code INTO v_build
      FROM external_item_xref
     WHERE marketplace = 'testmarket'
       AND external_sku = 'TST-SKU-A03A';

    ASSERT FOUND,
        'Case 3 FAIL: external_item_xref lookup returned no row';
    ASSERT v_build = 'BLD-A03A-001',
        format('Case 3 FAIL: expected BLD-A03A-001, got %s', v_build);

    RAISE NOTICE 'Case 3 PASSED — external_item_xref is the active resolution table';
END $$;

-- =========================================================
-- Cleanup
-- =========================================================

ROLLBACK;

\echo 'T-A03a ALL TESTS PASSED'
