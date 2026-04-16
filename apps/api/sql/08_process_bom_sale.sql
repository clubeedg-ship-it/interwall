-- =============================================================================
-- 08_process_bom_sale.sql — T-A05
-- PL/pgSQL function: atomic BOM-based sale processing.
--
-- Single-transaction atomic (D-022): any RAISE rolls back everything
-- including the transaction shell row.
--
-- Flow: resolve build → validate VAT → compute total → loop components
--       (filtered by valid_from/valid_to, D-087) → call exact-product or
--       pooled FIFO per line → write stock_ledger_entries per lot consumed (D-017)
--       → apply fixed_costs + VAT → store cogs + profit immutably (D-025).
--
-- VAT: RAISE if missing for marketplace (D-027, no silent 21% default).
-- Serialization: inherits SELECT FOR UPDATE from deduct_fifo_for_group /
-- deduct_fifo_for_product (D-021).
-- =============================================================================

-- Drop the old 6-param overload if it exists (T-B01 added p_commission_override).
-- Without this, PostgreSQL creates a second function instead of replacing.
DROP FUNCTION IF EXISTS process_bom_sale(TEXT, INTEGER, NUMERIC, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION process_bom_sale(
    p_build_code            TEXT,
    p_quantity              INTEGER,
    p_sale_price            NUMERIC,
    p_marketplace           TEXT,
    p_order_ref             TEXT     DEFAULT NULL,
    p_source_id             UUID     DEFAULT NULL,
    p_commission_override   NUMERIC  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_build_id    UUID;
    v_comp        RECORD;
    v_lot         RECORD;
    v_lots        JSONB := '[]'::jsonb;
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

    -- Pre-allocate transaction id so cogs/profit can be written once, immutably.
    v_txn_id := gen_random_uuid();

    -- Loop build components filtered by valid_from/valid_to (D-087)
    FOR v_comp IN
        SELECT bc.source_type, bc.item_group_id, bc.product_id, bc.quantity
        FROM build_components bc
        WHERE bc.build_id = v_build_id
          AND bc.valid_from <= NOW()
          AND bc.valid_to   > NOW()
    LOOP
        IF v_comp.source_type = 'item_group' THEN
            -- Pooled FIFO across the model pool for item_group lines.
            FOR v_lot IN
                SELECT stock_lot_id, product_id, qty_taken, unit_cost
                FROM deduct_fifo_for_group(
                    v_comp.item_group_id,
                    v_comp.quantity * p_quantity
                )
            LOOP
                v_cogs := v_cogs + (v_lot.qty_taken * v_lot.unit_cost);
                v_lots := v_lots || jsonb_build_array(
                    jsonb_build_object(
                        'stock_lot_id', v_lot.stock_lot_id,
                        'product_id', v_lot.product_id,
                        'qty_taken', v_lot.qty_taken,
                        'unit_cost', v_lot.unit_cost
                    )
                );
            END LOOP;
        ELSIF v_comp.source_type = 'product' THEN
            -- Exact-product FIFO for pinned part / EAN lines.
            FOR v_lot IN
                SELECT stock_lot_id, product_id, qty_taken, unit_cost
                FROM deduct_fifo_for_product(
                    v_comp.product_id,
                    v_comp.quantity * p_quantity
                )
            LOOP
                v_cogs := v_cogs + (v_lot.qty_taken * v_lot.unit_cost);
                v_lots := v_lots || jsonb_build_array(
                    jsonb_build_object(
                        'stock_lot_id', v_lot.stock_lot_id,
                        'product_id', v_lot.product_id,
                        'qty_taken', v_lot.qty_taken,
                        'unit_cost', v_lot.unit_cost
                    )
                );
            END LOOP;
        ELSE
            RAISE EXCEPTION 'process_bom_sale: unsupported build component source_type "%" for build "%"',
                v_comp.source_type, p_build_code;
        END IF;
    END LOOP;

    -- Compute fixed costs (D-098: use commission override when provided)
    IF p_commission_override IS NOT NULL THEN
        -- API provides exact commission; exclude DB commission, add override
        SELECT COALESCE(SUM(
            CASE WHEN is_percentage
                 THEN v_total_price * value / 100
                 ELSE value
            END
        ), 0)
        INTO v_fixed_cost
        FROM fixed_costs
        WHERE LOWER(name) != 'commission';
        v_fixed_cost := v_fixed_cost + p_commission_override;
    ELSE
        SELECT COALESCE(SUM(
            CASE WHEN is_percentage
                 THEN v_total_price * value / 100
                 ELSE value
            END
        ), 0)
        INTO v_fixed_cost
        FROM fixed_costs;
    END IF;

    -- Add marketplace-specific VAT (D-027: guaranteed to exist — checked above)
    v_fixed_cost := v_fixed_cost + (v_total_price * v_vat_rate / 100);

    -- Profit = revenue - COGS - fixed costs - VAT (D-025: stored immutably)
    v_profit := v_total_price - v_cogs - v_fixed_cost;

    -- Insert transaction once with final financials already computed.
    INSERT INTO transactions (
        id, type, product_ean, quantity, unit_price, total_price,
        marketplace, order_reference, build_code,
        source_email_id, cogs, profit
    ) VALUES (
        v_txn_id, 'sale', p_build_code, p_quantity, p_sale_price, v_total_price,
        p_marketplace, p_order_ref, p_build_code,
        p_source_id, v_cogs, v_profit
    );

    -- Write ledger rows after the parent transaction row exists.
    INSERT INTO stock_ledger_entries (
        transaction_id, stock_lot_id, product_id,
        qty_delta, unit_cost
    )
    SELECT
        v_txn_id,
        (lot->>'stock_lot_id')::UUID,
        (lot->>'product_id')::UUID,
        -((lot->>'qty_taken')::INTEGER),
        (lot->>'unit_cost')::NUMERIC(12,4)
    FROM jsonb_array_elements(v_lots) AS lot;

    RETURN v_txn_id;
END;
$$;
