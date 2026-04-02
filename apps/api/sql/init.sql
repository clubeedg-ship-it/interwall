-- Omiximo Inventory OS — Database Schema
-- Loaded automatically by postgres:15-alpine on first container start
-- via /docker-entrypoint-initdb.d/01_init.sql

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- =============================================================================
-- TABLE: warehouses
-- Physical warehouse locations that contain zones
-- =============================================================================
CREATE TABLE warehouses (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

-- =============================================================================
-- TABLE: products
-- Master product catalog keyed by EAN barcode
-- =============================================================================
CREATE TABLE products (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ean                   TEXT        NOT NULL UNIQUE,
    name                  TEXT        NOT NULL,
    sku                   TEXT,
    default_reorder_point INTEGER     NOT NULL DEFAULT 0,
    is_composite          BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: ean_compositions
-- Defines how composite products (assembled PCs) break down into components
-- Example: Gaming PC (EAN1) = CPU (EAN2) x1 + RAM (EAN3) x2 + GPU (EAN4) x1
-- =============================================================================
CREATE TABLE ean_compositions (
    id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_ean    TEXT    NOT NULL REFERENCES products(ean) ON DELETE CASCADE,
    component_ean TEXT    NOT NULL REFERENCES products(ean) ON DELETE RESTRICT,
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (parent_ean, component_ean),
    CHECK (parent_ean <> component_ean)
);

-- =============================================================================
-- TABLE: zones
-- Named warehouse zones (A, B, C...) within a warehouse, with a grid layout
-- =============================================================================
CREATE TABLE zones (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID    NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    columns      INTEGER NOT NULL CHECK (columns > 0),
    levels       INTEGER NOT NULL CHECK (levels > 0),
    layout_row   INTEGER NOT NULL DEFAULT 0,
    layout_col   INTEGER NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- =============================================================================
-- TABLE: shelves
-- Individual shelf positions within a zone (identified by col + level)
-- =============================================================================
CREATE TABLE shelves (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id     UUID    NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    col         INTEGER NOT NULL,
    level       INTEGER NOT NULL,
    label       TEXT    NOT NULL,
    capacity    INTEGER,
    split_fifo  BOOLEAN NOT NULL DEFAULT FALSE,
    single_bin  BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (zone_id, col, level)
);

-- =============================================================================
-- TABLE: emails
-- Log of all processed marketplace emails (purchase and sale confirmations)
-- message_id is the dedup key to prevent double-processing
-- =============================================================================
CREATE TABLE emails (
    id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id   TEXT           NOT NULL UNIQUE,
    sender       TEXT,
    subject      TEXT,
    marketplace  TEXT,
    parsed_type  TEXT           CHECK (parsed_type IN ('purchase', 'sale')),
    raw_body     TEXT,
    parsed_data  JSONB,
    confidence   NUMERIC(3,2),
    status       TEXT           NOT NULL DEFAULT 'processed'
                                CHECK (status IN ('processed', 'failed', 'review')),
    processed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: stock_lots
-- FIFO stock tracking — each lot represents a purchase batch at a specific cost
-- received_at is the FIFO sort key (oldest lots consumed first)
-- quantity >= 0 enforced by CHECK constraint (DB-05)
-- =============================================================================
CREATE TABLE stock_lots (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID           NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    shelf_id        UUID           REFERENCES shelves(id) ON DELETE SET NULL,
    quantity        INTEGER        NOT NULL DEFAULT 0
                                   CHECK (quantity >= 0),
    unit_cost       NUMERIC(12,4)  NOT NULL DEFAULT 0,
    marketplace     TEXT,
    received_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    source_email_id UUID           REFERENCES emails(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: transactions
-- Immutable ledger of all purchase and sale events
-- Includes computed COGS and profit for sale transactions
-- =============================================================================
CREATE TABLE transactions (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    type            TEXT           NOT NULL CHECK (type IN ('purchase', 'sale')),
    product_ean     TEXT           NOT NULL,
    quantity        INTEGER        NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(12,4)  NOT NULL,
    total_price     NUMERIC(12,4)  NOT NULL,
    marketplace     TEXT,
    order_reference TEXT,
    cogs            NUMERIC(12,4),
    profit          NUMERIC(12,4),
    source_email_id UUID           REFERENCES emails(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: fixed_costs
-- Global fixed costs applied to profit calculation
-- Examples: VAT (21%, is_percentage=true), commission (6.2%, is_percentage=true),
--           overhead (~95 EUR, is_percentage=false)
-- =============================================================================
CREATE TABLE fixed_costs (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT          NOT NULL UNIQUE,
    value         NUMERIC(12,4) NOT NULL,
    is_percentage BOOLEAN       NOT NULL DEFAULT TRUE,
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: users
-- Single-user auth table (username/password, hashed, session cookie auth)
-- =============================================================================
CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT        NOT NULL UNIQUE,
    password_hash   TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- Optimized for FIFO queries and common access patterns
-- =============================================================================

-- Primary FIFO query: oldest lots for a product first
CREATE INDEX idx_stock_lots_product_received ON stock_lots(product_id, received_at ASC);

-- Filter stock lots by shelf (non-null shelves only)
CREATE INDEX idx_stock_lots_shelf ON stock_lots(shelf_id) WHERE shelf_id IS NOT NULL;

-- Profit dashboard: transactions ordered by date
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- Profit dashboard: transactions by product EAN
CREATE INDEX idx_transactions_product_ean ON transactions(product_ean);

-- EAN composition lookup by parent
CREATE INDEX idx_ean_compositions_parent ON ean_compositions(parent_ean);

-- Email dedup: fast lookup by message_id
CREATE INDEX idx_emails_message_id ON emails(message_id);

-- =============================================================================
-- SEED DATA
-- Default warehouse so zones can be created immediately after first start
-- =============================================================================

INSERT INTO warehouses (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Main Warehouse');

-- =============================================================================
-- Business Logic Functions
-- =============================================================================

-- DB-02: FIFO stock deduction
-- Deducts p_quantity units from p_product_id using FIFO (oldest lot first).
-- Uses plain FOR UPDATE (not SKIP LOCKED) so concurrent callers serialize,
-- maintaining strict FIFO order. Single-threaded email poller means this
-- contention path is rare in practice.
-- Returns: integer count actually deducted (may be < p_quantity if insufficient stock)
CREATE OR REPLACE FUNCTION deduct_fifo_stock(
    p_product_id  UUID,
    p_quantity    INTEGER,
    p_order_ref   TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_lot       RECORD;
    v_remaining INTEGER := p_quantity;
    v_take      INTEGER;
    v_deducted  INTEGER := 0;
BEGIN
    IF p_quantity <= 0 THEN
        RETURN 0;
    END IF;

    FOR v_lot IN
        SELECT id, quantity
          FROM stock_lots
         WHERE product_id = p_product_id
           AND quantity > 0
         ORDER BY received_at ASC
         FOR UPDATE
    LOOP
        EXIT WHEN v_remaining <= 0;

        v_take      := LEAST(v_remaining, v_lot.quantity);

        UPDATE stock_lots
           SET quantity = quantity - v_take
         WHERE id = v_lot.id;

        v_remaining := v_remaining - v_take;
        v_deducted  := v_deducted  + v_take;
    END LOOP;

    RETURN v_deducted;
END;
$$;

-- DB-03: EAN composition resolution
-- Returns all components (with names and quantities) for a given parent EAN.
-- Returns 0 rows if no compositions exist (not an error).
CREATE OR REPLACE FUNCTION resolve_composition(p_parent_ean TEXT)
RETURNS TABLE(component_ean TEXT, component_name TEXT, quantity INTEGER)
LANGUAGE sql STABLE
AS $$
    SELECT ec.component_ean,
           p.name        AS component_name,
           ec.quantity
      FROM ean_compositions ec
      JOIN products p ON p.ean = ec.component_ean
     WHERE ec.parent_ean = p_parent_ean;
$$;

-- DB-04: Sale processing workflow
-- Atomically: resolve composition -> deduct each component FIFO -> compute COGS -> record transaction.
-- Raises an exception (and rolls back) if any component has insufficient stock.
-- Returns: UUID of the created transaction record
CREATE OR REPLACE FUNCTION process_sale(
    p_parent_ean  TEXT,
    p_quantity    INTEGER,
    p_sale_price  NUMERIC,
    p_marketplace TEXT,
    p_order_ref   TEXT    DEFAULT NULL,
    p_email_id    UUID    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_comp        RECORD;
    v_product_id  UUID;
    v_cogs        NUMERIC(12,4) := 0;
    v_deducted    INTEGER;
    v_need        INTEGER;
    v_comp_cost   NUMERIC(12,4);
    v_lot         RECORD;
    v_take        INTEGER;
    v_remain_cost INTEGER;
    v_txn_id      UUID;
    v_fixed_cost  NUMERIC(12,4);
    v_total_price NUMERIC(12,4);
    v_profit      NUMERIC(12,4);
BEGIN
    -- Validate parent product exists
    SELECT id INTO v_product_id FROM products WHERE ean = p_parent_ean;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found: %', p_parent_ean;
    END IF;

    v_total_price := p_sale_price * p_quantity;

    -- For each component in the composition
    FOR v_comp IN
        SELECT ec.component_ean,
               p.id   AS comp_product_id,
               ec.quantity * p_quantity AS total_need
          FROM ean_compositions ec
          JOIN products p ON p.ean = ec.component_ean
         WHERE ec.parent_ean = p_parent_ean
    LOOP
        -- Compute cost of lots that WILL be consumed (FIFO order, accurate COGS)
        v_comp_cost := 0;
        v_remain_cost := v_comp.total_need;

        FOR v_lot IN
            SELECT id, quantity, unit_cost
              FROM stock_lots
             WHERE product_id = v_comp.comp_product_id
               AND quantity > 0
             ORDER BY received_at ASC
             FOR UPDATE
        LOOP
            EXIT WHEN v_remain_cost <= 0;
            v_take        := LEAST(v_remain_cost, v_lot.quantity);
            v_comp_cost   := v_comp_cost + (v_take * v_lot.unit_cost);
            v_remain_cost := v_remain_cost - v_take;
        END LOOP;

        -- Validate sufficient stock
        IF v_remain_cost > 0 THEN
            RAISE EXCEPTION 'Insufficient stock for component: %', v_comp.component_ean;
        END IF;

        -- Deduct stock (reuses the locked rows above; same transaction)
        v_deducted := deduct_fifo_stock(
            v_comp.comp_product_id,
            v_comp.total_need,
            p_order_ref
        );

        v_cogs := v_cogs + v_comp_cost;
    END LOOP;

    -- Compute fixed costs
    SELECT COALESCE(SUM(
        CASE WHEN is_percentage
             THEN v_total_price * value / 100
             ELSE value
        END
    ), 0)
      INTO v_fixed_cost
      FROM fixed_costs;

    v_profit := v_total_price - v_cogs - v_fixed_cost;

    -- Insert immutable transaction record
    INSERT INTO transactions (
        type, product_ean, quantity, unit_price, total_price,
        marketplace, order_reference, cogs, profit, source_email_id
    ) VALUES (
        'sale', p_parent_ean, p_quantity, p_sale_price, v_total_price,
        p_marketplace, p_order_ref, v_cogs, v_profit, p_email_id
    ) RETURNING id INTO v_txn_id;

    RETURN v_txn_id;
END;
$$;

COMMIT;
