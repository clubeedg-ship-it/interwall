-- =============================================================================
-- 13_v_health_ingestion.sql — T-B05
-- Health views for ingestion pipeline monitoring (D-034, D-047).
-- No BEGIN/COMMIT: safe to \i inside a transaction.
-- MAX_RETRIES = 5 (matches ingestion/worker.py constant).
-- =============================================================================

-- v_health_ingestion_failed: retryable failed events (retry_count < MAX_RETRIES)
CREATE OR REPLACE VIEW v_health_ingestion_failed AS
SELECT
    id,
    source,
    marketplace,
    external_id,
    retry_count,
    error_message,
    created_at
FROM ingestion_events
WHERE status = 'failed'
  AND retry_count < 5;

COMMENT ON VIEW v_health_ingestion_failed IS
    'Retryable ingestion failures (status=failed, retry_count<5). '
    'Source: ingestion/worker.py MAX_RETRIES=5.';

-- v_health_ingestion_dead_letter: permanently failed events requiring operator action
-- Manual retry/resolve wired in T-C10.
CREATE OR REPLACE VIEW v_health_ingestion_dead_letter AS
SELECT
    id,
    source,
    marketplace,
    external_id,
    retry_count,
    error_message,
    dead_letter_reason,
    created_at
FROM ingestion_events
WHERE status = 'dead_letter';

COMMENT ON VIEW v_health_ingestion_dead_letter IS
    'Dead-lettered ingestion events (status=dead_letter). '
    'Manual retry in T-C10. Source: D-034.';
