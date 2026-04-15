-- =============================================================================
-- 08_process_bom_sale.sql — T-A05
-- PL/pgSQL function: atomic BOM-based sale processing.
--
-- Single-transaction atomic (D-022): any RAISE rolls back everything
-- including the transaction shell row.
--
-- Flow: resolve build → validate VAT → insert txn shell → loop components
--       (filtered by valid_from/valid_to, D-087) → call deduct_fifo_for_group
--       per line (D-020) → write stock_ledger_entries per lot consumed (D-017)
--       → apply fixed_costs + VAT → store cogs + profit immutably (D-025).
--
-- VAT: RAISE if missing for marketplace (D-027, no silent 21% default).
-- Serialization: inherits SELECT FOR UPDATE from deduct_fifo_for_group (D-021).
-- =============================================================================

CREATE OR REPLACE FUNCTION process_bom_sale(
    p_build_code   TEXT,
    p_quantity     INTEGER,
    p_sale_price   NUMERIC,
    p_marketplace  TEXT,
    p_order_ref    TEXT    DEFAULT NULL,
    p_source_id    UUID    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_build_id    UUID;
    v_comp        RECORD;
    v_lot         RECORD;
    v_txn_id      UUID;
    v_total_price NUMERIC(12,4);
    v_cogs        NUMERIC(12,4) := 0;
    v_vat_rate    NUMERIC(5,2);
    v_fixed_cost  NUMERIC(12,4);
    v_profit      NUMERIC(12,4);
BEGIN
    -- Validate quantity
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'process_bom_sale: quantity must be > 0, got %', p_quantity;
    END IF;

    -- Resolve build — must exist and be active
    SELECT id INTO v_build_id
    FROM builds
    WHERE build_code = p_build_code AND is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'process_bom_sale: active build not found for code "%"', p_build_code;
    END IF;

    -- Look up VAT rate — RAISE if missing (D-027)
    SELECT rate INTO v_vat_rate
    FROM vat_rates
    WHERE LOWER(marketplace) = LOWER(p_marketplace);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'process_bom_sale: no vat_rates row for marketplace "%" — add one before processing sales', p_marketplace;
    END IF;

    -- Verify build has at least one active component at current time
    IF NOT EXISTS (
        SELECT 1 FROM build_components bc
        WHERE bc.build_id = v_build_id
          AND bc.valid_from <= NOW()
          AND bc.valid_to   > NOW()
    ) THEN
        RAISE EXCEPTION 'process_bom_sale: build "%" has no active components at current time', p_build_code;
    END IF;

    v_total_price := p_sale_price * p_quantity;

    -- Insert transaction shell row (D-022, D-026)
    -- cogs + profit start at 0; updated at the end with real values
    INSERT INTO transactions (
        type, product_ean, quantity, unit_price, total_price,
        marketplace, order_reference, build_code,
        source_email_id, cogs, profit
    ) VALUES (
        'sale', p_build_code, p_quantity, p_sale_price, v_total_price,
        p_marketplace, p_order_ref, p_build_code,
        p_source_id, 0, 0
    ) RETURNING id INTO v_txn_id;

    -- Loop build components filtered by valid_from/valid_to (D-087)
    FOR v_comp IN
        SELECT bc.item_group_id, bc.quantity
        FROM build_components bc
        WHERE bc.build_id = v_build_id
          AND bc.valid_from <= NOW()
          AND bc.valid_to   > NOW()
    LOOP
        -- Deduct FIFO across item group (D-020)
        -- deduct_fifo_for_group raises on insufficient stock — propagates
        -- up and rolls back the entire transaction (D-022)
        FOR v_lot IN
            SELECT stock_lot_id, product_id, qty_taken, unit_cost
            FROM deduct_fifo_for_group(
                v_comp.item_group_id,
                v_comp.quantity * p_quantity
            )
        LOOP
            -- Write ledger row per lot consumed (D-017)
            INSERT INTO stock_ledger_entries (
                transaction_id, stock_lot_id, product_id,
                qty_delta, unit_cost
            ) VALUES (
                v_txn_id, v_lot.stock_lot_id, v_lot.product_id,
                -(v_lot.qty_taken), v_lot.unit_cost
            );

            -- Accumulate COGS from actual lot costs
            v_cogs := v_cogs + (v_lot.qty_taken * v_lot.unit_cost);
        END LOOP;
    END LOOP;

    -- Compute fixed costs (commission + overhead from fixed_costs table)
    SELECT COALESCE(SUM(
        CASE WHEN is_percentage
             THEN v_total_price * value / 100
             ELSE value
        END
    ), 0)
    INTO v_fixed_cost
    FROM fixed_costs;

    -- Add marketplace-specific VAT (D-027: guaranteed to exist — checked above)
    v_fixed_cost := v_fixed_cost + (v_total_price * v_vat_rate / 100);

    -- Profit = revenue - COGS - fixed costs - VAT (D-025: stored immutably)
    v_profit := v_total_price - v_cogs - v_fixed_cost;

    -- Finalize transaction with real cogs/profit
    UPDATE transactions
       SET cogs   = v_cogs,
           profit = v_profit
     WHERE id = v_txn_id;

    RETURN v_txn_id;
END;
$$;
