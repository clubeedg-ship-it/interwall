-- T-B02/T-B05: add attempt tracking + timestamps for ingestion worker retries

ALTER TABLE ingestion_events
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
