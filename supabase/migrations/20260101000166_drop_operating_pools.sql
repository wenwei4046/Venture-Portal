-- ============================================================================
-- 20260101000166_drop_operating_pools.sql
-- Stage 6c: finally drop operating_pools + its view + 2 enums.
-- HOUZS Venture Portal — 5-pool unification refactor (completion).
--
-- By this point:
--   - operating_pools rows were wiped in migration 164
--   - invoices.routes_to_pool column + its derive trigger dropped in 164
--   - every function that wrote to operating_pools was rewritten in 165 to
--     target dept_pools
--   - the operating_pools sufficient-balance trigger was dropped in 165
--
-- Nothing in the schema references operating_pools / operating_pool_type /
-- operating_pool_txn_type anymore. Safe to drop.
--
-- User confirmed DROP TABLE in current conversation 2026-04-19.
-- ============================================================================

DROP VIEW  IF EXISTS operating_pool_balance;
DROP TABLE IF EXISTS operating_pools;
DROP TYPE  IF EXISTS operating_pool_txn_type;
DROP TYPE  IF EXISTS operating_pool_type;
