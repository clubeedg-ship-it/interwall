-- =============================================================================
-- 16_transactions_sold_at.sql
-- Adds sold_at (event-date) to transactions so the profit graph is bucketed
-- by when the customer actually bought, not when the row was written.
--
-- Backfills existing rows with created_at (best available proxy on legacy data)
-- so the column can be NOT NULL.
--
-- Idempotent: safe to re-apply at startup via db.apply_runtime_sql_files.
-- =============================================================================

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

UPDATE transactions
   SET sold_at = created_at
 WHERE sold_at IS NULL;

ALTER TABLE transactions
    ALTER COLUMN sold_at SET NOT NULL;

ALTER TABLE transactions
    ALTER COLUMN sold_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_transactions_sold_at
    ON transactions (sold_at DESC);
