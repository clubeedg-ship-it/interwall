-- =============================================================================
-- 07_deduct_fifo_for_group.sql — T-A04
-- PL/pgSQL function: FIFO deduction pooled across an item group.
--
-- Pools across all item_group_members for the given group (D-020).
-- SELECT FOR UPDATE, ordered by received_at ASC, id ASC (D-021, D-023).
-- Raises on insufficient stock — no partial deduction.
-- Does NOT write stock_ledger_entries (that is process_bom_sale's job, T-A05).
-- =============================================================================

CREATE OR REPLACE FUNCTION deduct_fifo_for_group(
    p_item_group_id UUID,
    p_qty           INTEGER
)
RETURNS TABLE (
    stock_lot_id UUID,
    product_id   UUID,
    qty_taken    INTEGER,
    unit_cost    NUMERIC(12,4)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_lot       RECORD;
    v_remaining INTEGER := p_qty;
    v_take      INTEGER;
    v_total     INTEGER;
BEGIN
    IF p_qty <= 0 THEN
        RAISE EXCEPTION 'deduct_fifo_for_group: qty must be > 0, got %', p_qty;
    END IF;

    -- Verify the group exists and has members
    IF NOT EXISTS (
        SELECT 1 FROM item_group_members WHERE item_group_id = p_item_group_id
    ) THEN
        RAISE EXCEPTION 'deduct_fifo_for_group: item_group % has no members',
            p_item_group_id;
    END IF;

    -- Check total available stock before locking rows
    SELECT COALESCE(SUM(sl.quantity), 0) INTO v_total
    FROM stock_lots sl
    JOIN item_group_members igm ON igm.product_id = sl.product_id
    WHERE igm.item_group_id = p_item_group_id
      AND sl.quantity > 0;

    IF v_total < p_qty THEN
        RAISE EXCEPTION 'deduct_fifo_for_group: insufficient stock for group %, need %, have %',
            p_item_group_id, p_qty, v_total;
    END IF;

    -- FIFO deduction: oldest lot first across all products in the group
    FOR v_lot IN
        SELECT sl.id        AS lot_id,
               sl.product_id,
               sl.quantity,
               sl.unit_cost
        FROM stock_lots sl
        JOIN item_group_members igm ON igm.product_id = sl.product_id
        WHERE igm.item_group_id = p_item_group_id
          AND sl.quantity > 0
        ORDER BY sl.received_at ASC, sl.id ASC
        FOR UPDATE OF sl
    LOOP
        EXIT WHEN v_remaining <= 0;

        v_take := LEAST(v_remaining, v_lot.quantity);

        UPDATE stock_lots
           SET quantity = quantity - v_take
         WHERE id = v_lot.lot_id;

        v_remaining := v_remaining - v_take;

        -- Append to result set
        stock_lot_id := v_lot.lot_id;
        product_id   := v_lot.product_id;
        qty_taken    := v_take;
        unit_cost    := v_lot.unit_cost;
        RETURN NEXT;
    END LOOP;
END;
$$;
