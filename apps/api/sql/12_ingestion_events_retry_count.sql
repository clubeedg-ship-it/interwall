-- =============================================================================
-- 12_ingestion_events_retry_count.sql — T-B05
-- Add retry_count column for dead-letter tracking (D-034).
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS).
-- No BEGIN/COMMIT: safe to \i inside a transaction.
-- =============================================================================

ALTER TABLE ingestion_events
    ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
