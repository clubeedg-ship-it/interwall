-- =============================================================================
-- 09_v_part_stock.sql -- T-A06 Canonical stock view (D-041)
--
-- Single source of truth for stock quantities per product.
-- Used by Parts page AND Profit/Valuation page.
-- Never compute stock counts any other way.
--
-- Design choices:
--   - LEFT JOIN: products with no stock_lots rows appear with total_qty = 0
--     (callers never need to handle "missing row" vs "zero stock" differently)
--   - quantity > 0 filter: depleted lots (qty=0) excluded from aggregates
--   - COALESCE: NULL-safe aggregation for no-lot products
--
-- Originally created in 03_avl_build_schema.sql (T-A01).
-- This file is the standalone evolution point.
-- =============================================================================

CREATE OR REPLACE VIEW v_part_stock AS
SELECT
    p.id   AS product_id,
    p.ean,
    p.name,
    COALESCE(SUM(sl.quantity), 0)                AS total_qty,
    COALESCE(SUM(sl.quantity * sl.unit_cost), 0)   AS total_value,
    MAX(sl.received_at)                            AS last_received_at
FROM products p
LEFT JOIN stock_lots sl ON sl.product_id = p.id AND sl.quantity > 0
GROUP BY p.id, p.ean, p.name;
