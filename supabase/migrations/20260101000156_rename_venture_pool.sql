-- ============================================================================
-- 20260101000156_rename_venture_pool.sql
-- Stage 1b: Rename hv_operating_fund → venture_pool across the whole schema
-- HOUZS Venture Portal
--
-- Why: user consolidating the pool model. The 6 pools he wants to keep are
--   Venture Pool, HR Dept Pool, Finance Dept Pool, Director Dept Pool,
--   Director Office Dept Pool, Marketing Dept Pool. Everything currently
--   labelled "HV Operating Fund" in the DB should become "Venture Pool"
--   so naming is consistent everywhere (code, UI, audit trail).
--
-- What this does:
--   1. ALTER TABLE hv_operating_fund RENAME TO venture_pool
--   2. ALTER VIEW hv_operating_fund_balance RENAME TO venture_pool_balance
--   3. Rewrite every plpgsql function whose body contains 'hv_operating_fund'.
--      Postgres does NOT auto-rewrite function bodies on table rename —
--      indexes/constraints/triggers follow by OID, but plpgsql bodies are
--      stored as text and need manual recreation.
--   4. UPDATE string-valued columns that hold pool identifiers
--      (payment_vouchers.target_pool/source_pool, payment_voucher_sources.pool,
--      claims.source_pool).
--
-- Safety: user confirmed 2026-04-18 that all current DB rows are test data,
-- portal is not live, no backup needed.
-- ============================================================================

-- ── 1. Rename the base table + balance view ────────────────────────────────

ALTER TABLE hv_operating_fund RENAME TO venture_pool;
ALTER VIEW hv_operating_fund_balance RENAME TO venture_pool_balance;

-- ── 2. Rewrite plpgsql functions that reference the old name ───────────────
-- pg_get_functiondef returns the full CREATE OR REPLACE FUNCTION statement
-- including signature, language, security definer flags, search_path. We
-- substring-replace 'hv_operating_fund' with 'venture_pool' and EXECUTE it.
-- Works for both table refs (FROM/INTO/UPDATE) and string literals that
-- previously held the pool identifier — both need to match the new name.

DO $$
DECLARE
    fn      RECORD;
    old_def TEXT;
    new_def TEXT;
BEGIN
    FOR fn IN
        SELECT p.oid, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
    LOOP
        old_def := pg_get_functiondef(fn.oid);
        IF old_def LIKE '%hv_operating_fund%' THEN
            new_def := replace(old_def, 'hv_operating_fund', 'venture_pool');
            EXECUTE new_def;
        END IF;
    END LOOP;
END
$$;

-- ── 3. Update pool-identifier string values stored in data columns ─────────

UPDATE payment_vouchers
   SET target_pool = 'venture_pool'
 WHERE target_pool = 'hv_operating_fund';

UPDATE payment_vouchers
   SET source_pool = 'venture_pool'
 WHERE source_pool = 'hv_operating_fund';

UPDATE payment_voucher_sources
   SET pool = 'venture_pool'
 WHERE pool = 'hv_operating_fund';

UPDATE claims
   SET source_pool = 'venture_pool'
 WHERE source_pool = 'hv_operating_fund';

-- ── 4. Refresh comment on the renamed table ────────────────────────────────

COMMENT ON TABLE venture_pool IS
    'Venture Pool ledger (renamed from hv_operating_fund on 2026-04-18). '
    'Group-level running balance for HV. Credited by surplus / saving / '
    'profit inflows, debited by non-billable expenses and group costs.';
