-- ============================================================================
-- 20260101000164_wipe_operating_pools.sql
-- Stage 6a: wipe operating_pools data + drop invoice routing column.
-- HOUZS Venture Portal — 5-pool unification refactor (prep).
--
-- User directive 2026-04-19: "其实已经不需要所谓的 cost to cost 了. 全部都跟
-- director 的那种, marketing 也是." → unify all 5 department pools under
-- dept_pools (Marketing, Director, plus HR / Finance / Director Office which
-- currently live in operating_pools). Wipe the test data and drop the routing
-- column so the downstream rewrite migrations (165) and table drop (166) can
-- run cleanly.
--
-- What this migration does:
--   1. DELETE all operating_pools rows (confirmed test data only)
--   2. DROP invoices.routes_to_pool column + its derive trigger.
--      New credit function in 165 maps billing_mode → department directly,
--      no stored column needed.
--
-- Safety: user confirmed 2026-04-19 in current conversation that this is OK
-- and all operating_pools rows are test data.
-- ============================================================================

-- ── 1. Wipe test data ──────────────────────────────────────────────────────

DELETE FROM operating_pools;

-- ── 2. Drop invoice routing column + derivation trigger ────────────────────
-- The new credit function (created in 165) derives the target dept pool from
-- invoices.billing_mode inline, so routes_to_pool becomes dead state.

DROP TRIGGER IF EXISTS trg_invoices_route_to_pool ON invoices;
DROP FUNCTION IF EXISTS derive_invoice_routes_to_pool();

ALTER TABLE invoices DROP COLUMN IF EXISTS routes_to_pool;
