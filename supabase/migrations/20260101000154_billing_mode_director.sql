-- ============================================================================
-- 20260101000154_billing_mode_director.sql
-- Task 4 — add director_office_attribution + director_attribution billing modes
-- HOUZS Venture Portal
--
-- New billing modes for the Statement > Invoice 5-OPEX rewrite:
--   - director_office_attribution: bills subsidiary for Director Office staff
--     OPEX. Routes to operating_pools.director_opex on knock-off (existing
--     pool type, existing routing pattern).
--   - director_attribution: bills subsidiary for Director OPEX. Routes to the
--     Director Department Pool (dept_pools) on knock-off. Handled via a
--     separate trigger branch since dept_pools is a different table than
--     operating_pools — can't squeeze into the routes_to_pool enum column.
--
-- ALTER TYPE ADD VALUE cannot appear inside a transaction block alongside
-- SQL that uses the new values. Migration 155 wires the routing triggers
-- to these new values; this file only declares them.
-- ============================================================================

ALTER TYPE billing_mode ADD VALUE IF NOT EXISTS 'director_office_attribution';
ALTER TYPE billing_mode ADD VALUE IF NOT EXISTS 'director_attribution';
