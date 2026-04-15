-- =============================================================================
-- 14_v_shelf_occupancy.sql -- T-C02b Per-shelf occupancy view
--
-- Single source of truth for wall grid + bin-info rendering.
-- One row per shelf (zone-col-level-bin) with aggregated stock.
-- Shelves with no active stock still appear (LEFT JOIN) with total_qty = 0.
--
-- Idempotent: CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE VIEW v_shelf_occupancy AS
SELECT
    s.id                                              AS shelf_id,
    s.label                                           AS shelf_label,
    z.name                                            AS zone_name,
    s.col,
    s.level,
    s.bin,
    s.capacity,
    COALESCE(SUM(sl.quantity), 0)                     AS total_qty,
    COALESCE(SUM(sl.quantity * sl.unit_cost), 0)      AS total_value,
    COUNT(sl.id) FILTER (WHERE sl.quantity > 0)       AS batch_count,
    (array_agg(DISTINCT p.name)
         FILTER (WHERE sl.quantity > 0))[1]           AS product_name,
    (array_agg(DISTINCT p.ean)
         FILTER (WHERE sl.quantity > 0))[1]           AS product_ean
FROM shelves s
JOIN zones z ON z.id = s.zone_id
LEFT JOIN stock_lots sl ON sl.shelf_id = s.id AND sl.quantity > 0
LEFT JOIN products  p  ON p.id = sl.product_id
WHERE z.is_active = TRUE
GROUP BY s.id, s.label, z.name, s.col, s.level, s.bin, s.capacity
ORDER BY z.name, s.col, s.level, s.bin NULLS FIRST;
