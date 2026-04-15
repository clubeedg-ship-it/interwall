-- =============================================================================
-- t_B05_dead_letter.sql — Tests for ingestion health views (T-B05, D-034, D-047)
--
-- Run:
--   docker compose exec -T postgres psql -U interwall -d interwall \
--     -f /app/tests/t_B05_dead_letter.sql
--
-- Migrations applied outside BEGIN/ROLLBACK so they persist.
-- Test data seeded inside BEGIN/ROLLBACK — no side effects.
-- =============================================================================

\set ON_ERROR_STOP on

-- Apply migrations (idempotent; outside transaction so they persist)
\i /app/sql/12_ingestion_events_retry_count.sql
\i /app/sql/13_v_health_ingestion.sql

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- Case 1: v_health_ingestion_failed returns failed row (retry_count=2)
--         Does NOT return dead_letter row
-- ═══════════════════════════════════════════════════════════════
DO $case1$
DECLARE
    v_failed_id     UUID;
    v_dl_id         UUID;
    v_found         BOOLEAN;
BEGIN
    INSERT INTO ingestion_events
        (message_id, source, marketplace, parsed_type, parsed_data,
         confidence, status, retry_count, error_message)
    VALUES
        ('T-B05-C1-failed', 'bolcom_api', 'bolcom', 'sale', '{}',
         1.0, 'failed', 2, 'some transient error')
    RETURNING id INTO v_failed_id;

    INSERT INTO ingestion_events
        (message_id, source, marketplace, parsed_type, parsed_data,
         confidence, status, retry_count, dead_letter_reason)
    VALUES
        ('T-B05-C1-dl', 'email', 'mediamarktsaturn', 'sale', '{}',
         0.9, 'dead_letter', 5, 'final error after 5 attempts')
    RETURNING id INTO v_dl_id;

    -- Failed row (retry_count=2 < 5) → should appear
    SELECT EXISTS (
        SELECT 1 FROM v_health_ingestion_failed WHERE id = v_failed_id
    ) INTO v_found;
    ASSERT v_found = TRUE,
        'Case 1a FAIL: failed row with retry_count=2 should appear in v_health_ingestion_failed';

    -- Dead_letter row → must NOT appear in failed view
    SELECT EXISTS (
        SELECT 1 FROM v_health_ingestion_failed WHERE id = v_dl_id
    ) INTO v_found;
    ASSERT v_found = FALSE,
        'Case 1b FAIL: dead_letter row must NOT appear in v_health_ingestion_failed';

    RAISE NOTICE 'Case 1 PASSED — v_health_ingestion_failed: failed row shown, dead_letter excluded';
END $case1$;

-- ═══════════════════════════════════════════════════════════════
-- Case 2: v_health_ingestion_failed does NOT return retry_count >= MAX_RETRIES
--         (defensive: such a row should be dead_letter but guarded)
-- ═══════════════════════════════════════════════════════════════
DO $case2$
DECLARE
    v_id    UUID;
    v_found BOOLEAN;
BEGIN
    -- Seed a row with status='failed' but retry_count=5 (should never exist in practice)
    INSERT INTO ingestion_events
        (message_id, source, marketplace, parsed_type, parsed_data,
         confidence, status, retry_count)
    VALUES
        ('T-B05-C2-stale', 'bolcom_api', 'bolcom', 'sale', '{}',
         1.0, 'failed', 5)
    RETURNING id INTO v_id;

    SELECT EXISTS (
        SELECT 1 FROM v_health_ingestion_failed WHERE id = v_id
    ) INTO v_found;
    ASSERT v_found = FALSE,
        'Case 2 FAIL: failed row with retry_count=5 must NOT appear in v_health_ingestion_failed';

    RAISE NOTICE 'Case 2 PASSED — retry_count >= MAX_RETRIES excluded from failed view';
END $case2$;

-- ═══════════════════════════════════════════════════════════════
-- Case 3: v_health_ingestion_dead_letter returns dead_letter row
--         Does NOT return failed or processed rows
-- ═══════════════════════════════════════════════════════════════
DO $case3$
DECLARE
    v_dl_id         UUID;
    v_failed_id     UUID;
    v_processed_id  UUID;
    v_found         BOOLEAN;
BEGIN
    INSERT INTO ingestion_events
        (message_id, source, marketplace, parsed_type, parsed_data,
         confidence, status, retry_count, dead_letter_reason)
    VALUES
        ('T-B05-C3-dl', 'email', 'boulanger', 'sale', '{}',
         0.9, 'dead_letter', 5, 'D-033: no build resolved')
    RETURNING id INTO v_dl_id;

    INSERT INTO ingestion_events
        (message_id, source, marketplace, parsed_type, parsed_data,
         confidence, status, retry_count)
    VALUES
        ('T-B05-C3-failed', 'bolcom_api', 'bolcom', 'sale', '{}',
         1.0, 'failed', 3)
    RETURNING id INTO v_failed_id;

    INSERT INTO ingestion_events
        (message_id, source, marketplace, parsed_type, parsed_data,
         confidence, status, retry_count)
    VALUES
        ('T-B05-C3-proc', 'bolcom_api', 'bolcom', 'sale', '{}',
         1.0, 'processed', 0)
    RETURNING id INTO v_processed_id;

    -- Dead_letter row → must appear
    SELECT EXISTS (
        SELECT 1 FROM v_health_ingestion_dead_letter WHERE id = v_dl_id
    ) INTO v_found;
    ASSERT v_found = TRUE,
        'Case 3a FAIL: dead_letter row must appear in v_health_ingestion_dead_letter';

    -- Failed row → must NOT appear
    SELECT EXISTS (
        SELECT 1 FROM v_health_ingestion_dead_letter WHERE id = v_failed_id
    ) INTO v_found;
    ASSERT v_found = FALSE,
        'Case 3b FAIL: failed row must NOT appear in v_health_ingestion_dead_letter';

    -- Processed row → must NOT appear
    SELECT EXISTS (
        SELECT 1 FROM v_health_ingestion_dead_letter WHERE id = v_processed_id
    ) INTO v_found;
    ASSERT v_found = FALSE,
        'Case 3c FAIL: processed row must NOT appear in v_health_ingestion_dead_letter';

    RAISE NOTICE 'Case 3 PASSED — v_health_ingestion_dead_letter: correct filter';
END $case3$;

-- ═══════════════════════════════════════════════════════════════
-- Case 4: Both views expose source and marketplace columns
-- ═══════════════════════════════════════════════════════════════
DO $case4$
DECLARE
    v_failed_id UUID;
    v_dl_id     UUID;
    v_source    TEXT;
    v_mp        TEXT;
BEGIN
    INSERT INTO ingestion_events
        (message_id, source, marketplace, parsed_type, parsed_data,
         confidence, status, retry_count)
    VALUES
        ('T-B05-C4-failed', 'email', 'mediamarktsaturn', 'sale', '{}',
         0.9, 'failed', 1)
    RETURNING id INTO v_failed_id;

    INSERT INTO ingestion_events
        (message_id, source, marketplace, parsed_type, parsed_data,
         confidence, status, retry_count, dead_letter_reason)
    VALUES
        ('T-B05-C4-dl', 'bolcom_api', 'bolcom', 'sale', '{}',
         1.0, 'dead_letter', 5, 'test reason')
    RETURNING id INTO v_dl_id;

    SELECT source, marketplace INTO v_source, v_mp
    FROM v_health_ingestion_failed WHERE id = v_failed_id;
    ASSERT v_source = 'email',
        'Case 4a FAIL: v_health_ingestion_failed.source incorrect';
    ASSERT v_mp = 'mediamarktsaturn',
        'Case 4b FAIL: v_health_ingestion_failed.marketplace incorrect';

    SELECT source, marketplace INTO v_source, v_mp
    FROM v_health_ingestion_dead_letter WHERE id = v_dl_id;
    ASSERT v_source = 'bolcom_api',
        'Case 4c FAIL: v_health_ingestion_dead_letter.source incorrect';
    ASSERT v_mp = 'bolcom',
        'Case 4d FAIL: v_health_ingestion_dead_letter.marketplace incorrect';

    RAISE NOTICE 'Case 4 PASSED — both views expose source and marketplace';
END $case4$;

-- ═══════════════════════════════════════════════════════════════
-- Cleanup and final pass line
-- ═══════════════════════════════════════════════════════════════

ROLLBACK;

\echo 'T-B05 ALL TESTS PASSED'
