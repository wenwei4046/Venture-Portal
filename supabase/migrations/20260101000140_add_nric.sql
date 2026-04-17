-- ============================================================================
-- 20260101000140_add_nric.sql
-- Spec 6 (HR Payroll Redesign) — NRIC on staff + directors
-- HOUZS Venture Portal
--
-- KWSP Form A, PERKESO Borang 2/3/4, and LHDN CP39 all require each
-- contributor's NRIC (national ID) as the primary identifier. The user
-- confirmed Q3 on 2026-04-17 that full NRIC data is available for a
-- one-shot backfill — HR enters the values via the Edit Staff form
-- (backfill step done in app, not in SQL, because we don't have the list
-- in the repo).
--
-- Nullable so rows stay valid until HR backfills; the download route
-- refuses to generate a file if any contributor is missing NRIC.
-- Same PDPA sensitivity as salary — RLS unchanged on hr_staff_costs
-- and directors.
-- ============================================================================

ALTER TABLE hr_staff_costs ADD COLUMN nric TEXT;
ALTER TABLE directors      ADD COLUMN nric TEXT;

COMMENT ON COLUMN hr_staff_costs.nric IS
    'Spec 6: 12-digit NRIC (no dashes). Required for KWSP / PERKESO / LHDN files.';

COMMENT ON COLUMN directors.nric IS
    'Spec 6: 12-digit NRIC for directors (included in statutory files alongside staff).';
