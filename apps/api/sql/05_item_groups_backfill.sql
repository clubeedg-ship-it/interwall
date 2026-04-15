-- =============================================================================
-- 05_item_groups_backfill.sql — T-A03
-- Idempotent: ON CONFLICT DO NOTHING + WHERE NOT EXISTS throughout.
-- Re-running is guaranteed to be a no-op.
--
-- build_code = product EAN for all backfill-generated builds (deterministic).
-- Future manually-created builds use the BLD-NNN sequence (D-014).
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Singleton item_groups for each distinct component_ean
-- code = EAN makes the group deterministic and findable.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_groups (code, name, description)
SELECT DISTINCT
    ec.component_ean,
    p.name,
    'Singleton group for ' || p.ean || ' — backfill from ean_compositions'
FROM ean_compositions ec
JOIN products p ON p.ean = ec.component_ean
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: item_group_members for each component product
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_group_members (item_group_id, product_id)
SELECT ig.id, p.id
FROM ean_compositions ec
JOIN products p ON p.ean = ec.component_ean
JOIN item_groups ig ON ig.code = ec.component_ean
ON CONFLICT (item_group_id, product_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Builds for each distinct parent_ean in ean_compositions
-- build_code = parent_ean (deterministic for idempotency)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO builds (build_code, name, description, is_auto_generated)
SELECT DISTINCT
    ec.parent_ean,
    p.name,
    'Auto-created from legacy ean_compositions for ' || ec.parent_ean,
    TRUE
FROM ean_compositions ec
JOIN products p ON p.ean = ec.parent_ean
ON CONFLICT (build_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: build_components for each ean_compositions row
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO build_components (build_id, item_group_id, quantity)
SELECT
    b.id,
    ig.id,
    ec.quantity
FROM ean_compositions ec
JOIN builds b ON b.build_code = ec.parent_ean
JOIN item_groups ig ON ig.code = ec.component_ean
ON CONFLICT (build_id, item_group_id, valid_from) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5a: Singleton item_groups for products that don't have one yet
-- Covers component-only products (already handled above) and direct-sale
-- products that never appeared in ean_compositions.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_groups (code, name, description)
SELECT
    p.ean,
    p.name,
    'Singleton group for ' || p.ean || ' — trivial build (D-018)'
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM item_groups ig WHERE ig.code = p.ean)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5b: item_group_members for all singleton groups
-- Safe to run unconditionally — ON CONFLICT skips existing rows.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO item_group_members (item_group_id, product_id)
SELECT ig.id, p.id
FROM products p
JOIN item_groups ig ON ig.code = p.ean
ON CONFLICT (item_group_id, product_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5c: Trivial builds for products without a build yet (D-018)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO builds (build_code, name, description, is_auto_generated)
SELECT
    p.ean,
    p.name,
    'Trivial build for direct-sale product ' || p.ean || ' (D-018)',
    TRUE
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM builds b WHERE b.build_code = p.ean)
ON CONFLICT (build_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5d: Single build_component for trivial builds with no components yet
-- Matches auto-generated builds that have no build_components rows.
-- Composite builds (step 3) already have components from step 4.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO build_components (build_id, item_group_id, quantity)
SELECT b.id, ig.id, 1
FROM builds b
JOIN item_groups ig ON ig.code = b.build_code
WHERE b.is_auto_generated = TRUE
  AND NOT EXISTS (SELECT 1 FROM build_components bc WHERE bc.build_id = b.id)
ON CONFLICT (build_id, item_group_id, valid_from) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Migrate sku_aliases → external_item_xref (D-019)
-- Every product_ean now has a build (build_code = EAN), so the JOIN succeeds.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO external_item_xref (marketplace, external_sku, build_code)
SELECT
    COALESCE(sa.marketplace, 'unknown'),
    sa.marketplace_sku,
    b.build_code
FROM sku_aliases sa
JOIN builds b ON b.build_code = sa.product_ean
ON CONFLICT (marketplace, external_sku) DO NOTHING;

COMMIT;
