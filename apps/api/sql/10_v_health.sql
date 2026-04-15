-- =============================================================================
-- 10_v_health.sql — T-A09 Health invariant views (D-047)
--
-- Read-only diagnostic views for the Health observability surface.
-- Detect orphan state and invariant violations.
-- No BEGIN/COMMIT — loaded standalone or via \i inside a transaction.
-- =============================================================================

-- v_health_sales_without_ledger (D-017)
-- Every sale transaction MUST have >= 1 stock_ledger_entries row.
-- Any row returned by this view represents a bug in sale processing.
CREATE OR REPLACE VIEW v_health_sales_without_ledger AS
SELECT t.id, t.product_ean, t.marketplace, t.order_reference, t.created_at
FROM transactions t
WHERE t.type = 'sale'
  AND NOT EXISTS (
    SELECT 1 FROM stock_ledger_entries sle
    WHERE sle.transaction_id = t.id
  );

-- v_health_parts_without_shelf
-- Products with no shelf-assigned stock_lots at all.
-- Operator action: assign shelf via Wall mini-wizard.
CREATE OR REPLACE VIEW v_health_parts_without_shelf AS
SELECT p.id AS product_id, p.ean, p.name
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM stock_lots sl
    WHERE sl.product_id = p.id AND sl.shelf_id IS NOT NULL
);

-- v_health_parts_without_reorder
-- Products with no reorder point configured: minimum_stock = 0
-- AND no JIT inputs (avg_delivery_days / avg_sold_per_day).
CREATE OR REPLACE VIEW v_health_parts_without_reorder AS
SELECT p.id AS product_id, p.ean, p.name
FROM products p
WHERE COALESCE(p.minimum_stock, 0) = 0
  AND (p.avg_delivery_days IS NULL OR p.avg_sold_per_day IS NULL);

-- v_health_builds_without_xref
-- Active non-trivial builds with no external_item_xref mapping.
-- Auto-generated trivial builds (D-018) are EXCLUDED because they are
-- resolved by EAN directly in the sale_writer routing (step 2b),
-- not through marketplace xref. Including them would flood this view
-- with noise that doesn't require operator action.
CREATE OR REPLACE VIEW v_health_builds_without_xref AS
SELECT b.id, b.build_code, b.name
FROM builds b
WHERE b.is_active = TRUE
  AND b.is_auto_generated = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM external_item_xref x
    WHERE x.build_code = b.build_code
  );
