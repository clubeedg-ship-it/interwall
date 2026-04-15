-- =============================================================================
-- 11_ingestion_events_dedupe.sql — T-B01
-- Add external_id column and dedup index for API-based ingestion (D-097).
-- Also add error_message for failed event details (D-034).
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- external_id: dedupe key for API-sourced events (e.g. "bol-{orderId}-{orderItemId}")
-- Nullable: email-sourced events use message_id for dedup instead.
ALTER TABLE ingestion_events ADD COLUMN IF NOT EXISTS external_id TEXT;

-- error_message: detail text when status='failed'.
-- Distinct from dead_letter_reason (used for dead_letter state only).
ALTER TABLE ingestion_events ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Unique index for API dedup: (source, external_id).
-- NULL external_id rows (email events) don't participate in uniqueness checks
-- because NULL != NULL in PostgreSQL unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_events_source_external_id
    ON ingestion_events (source, external_id);

COMMIT;
