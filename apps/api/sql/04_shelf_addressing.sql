-- =============================================================================
-- 04_shelf_addressing.sql — T-A02 Shelf Addressing Normalization
-- Idempotent: safe to re-run
--
-- Re-pads shelf labels to D-051 format (A-01-3, not A-1-3).
-- Updates UNIQUE constraint to include bin column (D-052).
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: Re-pad shelf labels to Zone-XX-L[-Bin] format (D-051)
-- Column zero-padded to 2 digits. Level stays unpadded (single digit).
-- =============================================================================

UPDATE shelves s
SET label = z.name || '-' || LPAD(s.col::TEXT, 2, '0') || '-' || s.level
            || COALESCE('-' || s.bin, '')
FROM zones z
WHERE z.id = s.zone_id
  AND s.label IS DISTINCT FROM (
      z.name || '-' || LPAD(s.col::TEXT, 2, '0') || '-' || s.level
      || COALESCE('-' || s.bin, '')
  );

-- =============================================================================
-- SECTION 2: Update UNIQUE constraint to include bin (D-052)
-- NULLS NOT DISTINCT prevents duplicate unsplit shelves at same position.
-- =============================================================================

-- Drop old constraint (named from CREATE TABLE definition)
ALTER TABLE shelves DROP CONSTRAINT IF EXISTS shelves_zone_id_col_level_key;

-- Add new constraint including bin
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_shelves_zone_col_level_bin'
    ) THEN
        ALTER TABLE shelves ADD CONSTRAINT uq_shelves_zone_col_level_bin
            UNIQUE NULLS NOT DISTINCT (zone_id, col, level, bin);
    END IF;
END $$;

COMMIT;
