-- ============================================================================
-- 20260101000193_fix_source_has_from_department_pool.sql
-- Pre-existing bug surfaced by E2E Path 2 (2026-04-21):
--   fund_sources has no place to store the source department for
--   source_type='department_pool' transfers. The code was stuffing
--   department_id into from_company_id, but that column has an FK to
--   companies(id), so every insert 500'd with
--     violates foreign key constraint "fund_sources_from_company_id_fkey"
--   (and before mig 192 extended the CHECK, also source_has_from).
--
-- Fix: add a proper from_department_id column with an FK to departments,
-- rewrite the CHECK so each source_type uses exactly one "from_*" slot:
--   subsidiary      → from_company_id     (FK companies)
--   director_loan   → from_director_id    (FK directors)
--   department_pool → from_department_id  (FK departments)
--
-- Safe on existing data: the single live row (subsidiary, Dream Crafter) has
-- NULL in the new column, which satisfies the new CHECK.
-- ============================================================================

BEGIN;

ALTER TABLE fund_sources
  ADD COLUMN from_department_id UUID REFERENCES departments(id);

ALTER TABLE fund_sources DROP CONSTRAINT source_has_from;

ALTER TABLE fund_sources
  ADD CONSTRAINT source_has_from CHECK (
    (source_type = 'subsidiary'
      AND from_company_id    IS NOT NULL
      AND from_director_id   IS NULL
      AND from_department_id IS NULL)
 OR (source_type = 'director_loan'
      AND from_director_id   IS NOT NULL
      AND from_company_id    IS NULL
      AND from_department_id IS NULL)
 OR (source_type = 'department_pool'
      AND from_department_id IS NOT NULL
      AND from_company_id    IS NULL
      AND from_director_id   IS NULL)
  );

COMMENT ON COLUMN fund_sources.from_department_id IS
  'Mig 193: source department when source_type=department_pool (idle funds transferred into Venture Pool).';

COMMENT ON CONSTRAINT source_has_from ON fund_sources IS
  'Mig 193 (2026-04-21): extended to route department_pool transfers through from_department_id FK, leaving from_company_id/from_director_id NULL.';

COMMIT;
