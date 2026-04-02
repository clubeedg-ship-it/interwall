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

COMMIT;
