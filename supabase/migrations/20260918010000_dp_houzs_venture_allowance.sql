-- ============================================================================
-- 20260918010000_dp_houzs_venture_allowance.sql
-- Director Pool: Houzs Venture pays its own allowance into the pool on the
-- 15th, AFTER the month's main payout has gone out (user ruling 2026-09-18).
--
-- That transfer is pooled, saved and split 75/25 like any other allowance, but
-- it must NOT feed Total Pay: the month's advance was already settled by the
-- first payout, and this second transfer is never used to repay it — neither
-- its 75% payout nor its 25% billing invoice.
--
--   dp_companies.exclude_from_pay     → marks a company that transfers on its own
--   dp_months.allow_excl_full_payout  → that transfer pays 100% of the balance
--                                       and bills nothing, independently of the
--                                       month's own full_payout flag
--
-- Both default FALSE, so every existing company and month keeps its current
-- behaviour to the cent.
-- ============================================================================

ALTER TABLE dp_companies
    ADD COLUMN exclude_from_pay BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN dp_companies.exclude_from_pay IS
    'Allowance is transferred separately, after the main payout — pooled and '
    'split as usual but held out of Total Pay / Vr KPI / advance.';

ALTER TABLE dp_months
    ADD COLUMN allow_excl_full_payout BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN dp_months.allow_excl_full_payout IS
    'The separately-transferred allowance pays out 100% of its balance this '
    'month and bills nothing. Independent of full_payout.';

INSERT INTO dp_companies (name, sort, exclude_from_pay)
VALUES ('Houzs Venture', 7, TRUE)
ON CONFLICT (name) DO UPDATE SET sort = EXCLUDED.sort, exclude_from_pay = TRUE;
