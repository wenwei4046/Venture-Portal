-- ============================================================================
-- 20260101000228_fund_source_freetext_column_and_constraint.sql
-- Item 4 — Part 2/2: add free-text payer column + recreate constraint.
--
-- Companion to mig 224 (which added the 'outsource' enum value in its own
-- committed migration so this CHECK can safely reference it).
--
-- Adds:
--   - from_freetext_name TEXT — used by director_loan + outsource source types
--   - Backfill from directors.name for legacy director_loan rows
--   - Recreate source_has_from CHECK with all 4 source_type branches
-- ============================================================================

ALTER TABLE fund_sources
    ADD COLUMN IF NOT EXISTS from_freetext_name TEXT;

COMMENT ON COLUMN fund_sources.from_freetext_name IS
    'Free-text payer name for director_loan / outsource. Set instead of (or alongside) from_director_id.';

UPDATE fund_sources fs
SET from_freetext_name = d.name
FROM directors d
WHERE fs.from_director_id = d.id
  AND fs.from_freetext_name IS NULL;

ALTER TABLE fund_sources DROP CONSTRAINT IF EXISTS source_has_from;

ALTER TABLE fund_sources
    ADD CONSTRAINT source_has_from CHECK (
        (source_type = 'subsidiary'
            AND from_company_id IS NOT NULL
            AND from_director_id IS NULL
            AND from_department_id IS NULL
            AND from_freetext_name IS NULL)
        OR (source_type = 'director_loan'
            AND from_company_id IS NULL
            AND from_department_id IS NULL
            AND (from_director_id IS NOT NULL OR from_freetext_name IS NOT NULL))
        OR (source_type = 'department_pool'
            AND from_department_id IS NOT NULL
            AND from_company_id IS NULL
            AND from_director_id IS NULL
            AND from_freetext_name IS NULL)
        OR (source_type = 'outsource'
            AND from_freetext_name IS NOT NULL
            AND from_company_id IS NULL
            AND from_director_id IS NULL
            AND from_department_id IS NULL)
    );
