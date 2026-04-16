-- =============================================================================
-- 03_avl_build_schema.sql — T-A01 Additive Schema Migration
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS throughout)
--
-- Adds the AVL + Build layer alongside the existing schema.
-- Does NOT touch ean_compositions, process_sale(), or deduct_fifo_stock() (D-010).
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: Rename emails → ingestion_events (D-035)
-- =============================================================================

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'emails') THEN
        ALTER TABLE emails RENAME TO ingestion_events;
    END IF;
END $$;

-- Rename the index to match new table name
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_emails_message_id') THEN
        ALTER INDEX idx_emails_message_id RENAME TO idx_ingestion_events_message_id;
    END IF;
END $$;

-- Rename the status CHECK constraint
-- (Postgres names auto-generated CHECKs as <table>_<col>_check)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_status_check') THEN
        ALTER TABLE ingestion_events RENAME CONSTRAINT emails_status_check TO ingestion_events_status_check;
    END IF;
END $$;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_parsed_type_check') THEN
        ALTER TABLE ingestion_events RENAME CONSTRAINT emails_parsed_type_check TO ingestion_events_parsed_type_check;
    END IF;
END $$;

-- Add source column for unified ingestion (D-032)
ALTER TABLE ingestion_events ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'email';

-- Add dead_letter_reason for failed events (D-034)
ALTER TABLE ingestion_events ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;

-- Expand status CHECK to include 'dead_letter' (D-034)
-- Drop old constraint, add new one — idempotent via IF EXISTS
ALTER TABLE ingestion_events DROP CONSTRAINT IF EXISTS ingestion_events_status_check;
ALTER TABLE ingestion_events ADD CONSTRAINT ingestion_events_status_check
    CHECK (status IN ('pending', 'processed', 'failed', 'review', 'dead_letter'));

-- NOTE: source_email_id columns on stock_lots and transactions are NOT renamed.
-- The FK auto-follows the table rename. Column rename deferred until
-- process_sale() retires (it references source_email_id by name).

-- =============================================================================
-- SECTION 2: products — rename + add JIT columns (D-094)
-- =============================================================================

-- Rename default_reorder_point → minimum_stock
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'default_reorder_point'
    ) THEN
        ALTER TABLE products RENAME COLUMN default_reorder_point TO minimum_stock;
    END IF;
END $$;

-- JIT reorder inputs (D-094)
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_delivery_days NUMERIC(5,1);
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_sold_per_day  NUMERIC(8,2);

-- =============================================================================
-- SECTION 3: New tables — AVL + Build layer
-- =============================================================================

-- item_groups: substitute pools ("any RTX 3050") (D-012)
CREATE TABLE IF NOT EXISTS item_groups (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT        NOT NULL UNIQUE,  -- stable identifier (e.g. component EAN for singletons)
    name        TEXT        NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- item_group_members: which products belong to which group (D-012, D-086)
CREATE TABLE IF NOT EXISTS item_group_members (
    id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    item_group_id UUID    NOT NULL REFERENCES item_groups(id) ON DELETE CASCADE,
    product_id    UUID    NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    priority      INTEGER NOT NULL DEFAULT 0,  -- D-086: schema-ready, unwired
    UNIQUE (item_group_id, product_id)
);

-- builds: finished-product recipes (D-013, D-014, D-018)
CREATE TABLE IF NOT EXISTS builds (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    build_code        TEXT        NOT NULL UNIQUE,
    name              TEXT,
    description       TEXT,
    is_auto_generated BOOLEAN     NOT NULL DEFAULT FALSE,  -- D-018: trivial builds
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequence for auto-generated build codes BLD-NNN (D-014)
CREATE SEQUENCE IF NOT EXISTS builds_code_seq START 1;

-- build_components: recipe lines (D-013, D-087)
CREATE TABLE IF NOT EXISTS build_components (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    build_id      UUID        NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    source_type   TEXT        NOT NULL DEFAULT 'item_group',
    item_group_id UUID        REFERENCES item_groups(id) ON DELETE RESTRICT,
    product_id    UUID        REFERENCES products(id) ON DELETE RESTRICT,
    quantity      INTEGER     NOT NULL CHECK (quantity > 0),
    valid_from    TIMESTAMPTZ NOT NULL DEFAULT '-infinity',  -- D-087: unwired
    valid_to      TIMESTAMPTZ NOT NULL DEFAULT 'infinity',   -- D-087: unwired
    UNIQUE (build_id, item_group_id, valid_from)
);

-- external_item_xref: marketplace SKU → build_code (D-019)
CREATE TABLE IF NOT EXISTS external_item_xref (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace  TEXT        NOT NULL,
    external_sku TEXT        NOT NULL,
    build_code   TEXT        NOT NULL REFERENCES builds(build_code) ON DELETE RESTRICT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (marketplace, external_sku)
);

-- stock_ledger_entries: per-movement audit trail (D-017)
CREATE TABLE IF NOT EXISTS stock_ledger_entries (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID          NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    stock_lot_id   UUID          NOT NULL REFERENCES stock_lots(id) ON DELETE RESTRICT,
    product_id     UUID          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty_delta      INTEGER       NOT NULL CHECK (qty_delta != 0),  -- negative = deduction, positive = receipt
    unit_cost      NUMERIC(12,4) NOT NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- jit_bands: JIT health colour bands (D-049, D-089)
CREATE TABLE IF NOT EXISTS jit_bands (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT          NOT NULL UNIQUE,
    min_pct    NUMERIC(6,2)  NOT NULL,
    max_pct    NUMERIC(6,2)  NOT NULL,
    hex_colour TEXT          NOT NULL CHECK (hex_colour ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order INTEGER       NOT NULL
);

-- =============================================================================
-- SECTION 4: Alter existing tables — additive columns
-- =============================================================================

-- build_components mixed-source line support
ALTER TABLE build_components
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE RESTRICT;

UPDATE build_components
   SET source_type = 'item_group'
 WHERE source_type IS NULL;

ALTER TABLE build_components
    ALTER COLUMN source_type SET DEFAULT 'item_group',
    ALTER COLUMN source_type SET NOT NULL;

ALTER TABLE build_components
    ALTER COLUMN item_group_id DROP NOT NULL;

ALTER TABLE build_components DROP CONSTRAINT IF EXISTS build_components_source_type_check;
ALTER TABLE build_components ADD CONSTRAINT build_components_source_type_check
    CHECK (source_type IN ('item_group', 'product'));

ALTER TABLE build_components DROP CONSTRAINT IF EXISTS build_components_source_xor_check;
ALTER TABLE build_components ADD CONSTRAINT build_components_source_xor_check CHECK (
    (source_type = 'item_group' AND item_group_id IS NOT NULL AND product_id IS NULL) OR
    (source_type = 'product' AND product_id IS NOT NULL AND item_group_id IS NULL)
);

-- shelves: nullable bin for sub-divisions (D-052)
-- D-053: split_fifo and single_bin are deprecated but NOT dropped
ALTER TABLE shelves ADD COLUMN IF NOT EXISTS bin TEXT;

-- stock_lots: serial number tracking (D-085, schema-ready, unwired)
ALTER TABLE stock_lots ADD COLUMN IF NOT EXISTS serial_number TEXT;

-- transactions: build routing info (D-026) + ingestion source
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS build_code TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'email';

-- FK: transactions.build_code → builds.build_code
-- Deferred because builds table must exist first (created in Section 3)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_transactions_build_code'
    ) THEN
        ALTER TABLE transactions ADD CONSTRAINT fk_transactions_build_code
            FOREIGN KEY (build_code) REFERENCES builds(build_code) ON DELETE RESTRICT;
    END IF;
END $$;

-- =============================================================================
-- SECTION 5: New constraints
-- =============================================================================

-- Prevent duplicate zone names within a warehouse
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_zones_warehouse_name'
    ) THEN
        ALTER TABLE zones ADD CONSTRAINT uq_zones_warehouse_name
            UNIQUE (warehouse_id, name);
    END IF;
END $$;

-- =============================================================================
-- SECTION 6: Indexes
-- =============================================================================

-- products
CREATE INDEX IF NOT EXISTS idx_products_category
    ON products(category_id);

-- transactions
CREATE INDEX IF NOT EXISTS idx_transactions_marketplace
    ON transactions(marketplace);

-- stock_ledger_entries
CREATE INDEX IF NOT EXISTS idx_stock_ledger_transaction
    ON stock_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_lot
    ON stock_ledger_entries(stock_lot_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_product
    ON stock_ledger_entries(product_id);

-- item_group_members (reverse lookup: "which groups is this product in?")
CREATE INDEX IF NOT EXISTS idx_item_group_members_product
    ON item_group_members(product_id);

-- builds
CREATE INDEX IF NOT EXISTS idx_builds_active
    ON builds(is_active) WHERE is_active = TRUE;

-- build_components
CREATE INDEX IF NOT EXISTS idx_build_components_build
    ON build_components(build_id);
CREATE INDEX IF NOT EXISTS idx_build_components_group
    ON build_components(item_group_id);
CREATE INDEX IF NOT EXISTS idx_build_components_product
    ON build_components(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_build_components_product_valid_from
    ON build_components(build_id, product_id, valid_from)
    WHERE source_type = 'product';

-- external_item_xref (lookup by build_code for "which SKUs map to this build?")
CREATE INDEX IF NOT EXISTS idx_external_xref_build_code
    ON external_item_xref(build_code);

-- =============================================================================
-- SECTION 7: Views
-- =============================================================================

-- v_part_stock: canonical stock count per product (D-041)
-- Single source of truth for stock quantities. Used by Parts page AND
-- Profit/Valuation page. Never compute stock counts any other way.
CREATE OR REPLACE VIEW v_part_stock AS
SELECT
    p.id   AS product_id,
    p.ean,
    p.name,
    COALESCE(SUM(sl.quantity), 0)              AS total_qty,
    COALESCE(SUM(sl.quantity * sl.unit_cost), 0) AS total_value,
    MAX(sl.received_at)                        AS last_received_at
FROM products p
LEFT JOIN stock_lots sl ON sl.product_id = p.id AND sl.quantity > 0
GROUP BY p.id, p.ean, p.name;

-- v_product_reorder: computed reorder point from JIT inputs (D-094)
CREATE OR REPLACE VIEW v_product_reorder AS
SELECT
    p.id AS product_id,
    CASE
        WHEN p.avg_delivery_days IS NOT NULL AND p.avg_sold_per_day IS NOT NULL
        THEN CEIL(p.avg_delivery_days * p.avg_sold_per_day)::INTEGER
        ELSE NULL
    END AS computed_reorder_point,
    p.minimum_stock,
    GREATEST(
        COALESCE(
            CASE
                WHEN p.avg_delivery_days IS NOT NULL AND p.avg_sold_per_day IS NOT NULL
                THEN CEIL(p.avg_delivery_days * p.avg_sold_per_day)::INTEGER
                ELSE NULL
            END,
            0
        ),
        COALESCE(p.minimum_stock, 0)
    ) AS effective_reorder_point
FROM products p;

-- v_product_setup_status: computed setup completeness (D-048)
-- setup_complete is TRUE when: reorder config exists AND category set AND
-- at least one shelf-assigned stock lot exists.
CREATE OR REPLACE VIEW v_product_setup_status AS
SELECT
    p.id AS product_id,
    (
        (COALESCE(p.minimum_stock, 0) > 0
         OR (p.avg_delivery_days IS NOT NULL AND p.avg_sold_per_day IS NOT NULL))
        AND p.category_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM stock_lots sl
            WHERE sl.product_id = p.id AND sl.shelf_id IS NOT NULL
        )
    ) AS setup_complete,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN NOT (COALESCE(p.minimum_stock, 0) > 0
                       OR (p.avg_delivery_days IS NOT NULL
                           AND p.avg_sold_per_day IS NOT NULL))
             THEN 'reorder_point' END,
        CASE WHEN p.category_id IS NULL
             THEN 'category' END,
        CASE WHEN NOT EXISTS (
            SELECT 1 FROM stock_lots sl
            WHERE sl.product_id = p.id AND sl.shelf_id IS NOT NULL
        ) THEN 'shelf_assignment' END
    ], NULL) AS missing_fields
FROM products p;

-- =============================================================================
-- SECTION 8: Seed data
-- =============================================================================

-- JIT bands — 5 bands as fraction of effective reorder point (D-089)
INSERT INTO jit_bands (name, min_pct, max_pct, hex_colour, sort_order) VALUES
    ('critical',   0.00,  25.00, '#DC2626', 1),
    ('low',       25.00,  75.00, '#F97316', 2),
    ('at',        75.00, 125.00, '#EAB308', 3),
    ('healthy',  125.00, 200.00, '#16A34A', 4),
    ('over',     200.00, 999.99, '#2563EB', 5)
ON CONFLICT (name) DO NOTHING;

COMMIT;
