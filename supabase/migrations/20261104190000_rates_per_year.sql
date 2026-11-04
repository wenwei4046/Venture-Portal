-- A deal's rate may be set per year (2026-11-04 — the user: "我现在的利息都是算monthly 了， 有没有办法我也可以set annual的？",
-- then A — annual ÷ 12, charged and compounded monthly — and, for Fund OUT, method 1: the annual rate typed directly,
-- not the base rate plus a premium). The worry was the rounding: "类似10% per annum" — 10% ÷ 12 stored at six decimals
-- is 0.8333%, so 120,000 a month bore 999.96 instead of 1,000.00. So:
--   1. Every deal rate is kept to ten decimals (it was six): loans' effective / base / premium, a fund source's cost,
--      and the terms over time and the requests to change them. Every rate on production is unchanged — six decimals
--      fit in ten. The three views over them are dropped and put back exactly as they were (security_invoker, grants).
--   2. A deal remembers how its rate was set — `rate_basis` 'month' (every deal so far) or 'year' — for the pages to
--      say it the way it was agreed ("10.000% /yr · 0.833% /mo"). The maths never reads it: the stored rate is always
--      the month's.
--      A loan's is written with its other creation flags (createLoanInner's update of the pending loan); a fund
--      source's with its insert. Amending keeps it: a new rate is typed in the deal's own basis.

-- ─── 1. Ten decimals ─────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.fund_sources_weighted_cost;
DROP VIEW IF EXISTS public.fund_source_outstanding;
DROP VIEW IF EXISTS public.loan_outstanding;

ALTER TABLE public.loans
    ALTER COLUMN effective_rate TYPE NUMERIC(14, 10),
    ALTER COLUMN base_rate TYPE NUMERIC(14, 10),
    ALTER COLUMN risk_premium TYPE NUMERIC(14, 10);
ALTER TABLE public.fund_sources ALTER COLUMN cost_rate TYPE NUMERIC(14, 10);
ALTER TABLE public.treasury_terms_history ALTER COLUMN rate TYPE NUMERIC(16, 10);
ALTER TABLE public.treasury_terms_requests ALTER COLUMN rate TYPE NUMERIC(16, 10);

-- The views, word for word as production holds them (pg_get_viewdef, 2026-11-04).
CREATE VIEW public.loan_outstanding WITH (security_invoker = true) AS
 SELECT l.id AS loan_id,
    l.company_id,
    l.principal,
    l.effective_rate,
    l.status,
    l.disbursement_date,
    COALESCE(sum(r.amount) FILTER (WHERE r.payment_type = 'principal'::repayment_type), 0::numeric) AS total_principal_paid,
    l.principal - COALESCE(sum(r.amount) FILTER (WHERE r.payment_type = 'principal'::repayment_type), 0::numeric) AS outstanding,
    COALESCE(sum(r.amount) FILTER (WHERE r.payment_type = 'interest'::repayment_type), 0::numeric) AS total_interest_paid,
    COALESCE(sum(r.amount) FILTER (WHERE r.payment_type = 'penalty'::repayment_type), 0::numeric) AS total_penalty_paid
   FROM loans l
     LEFT JOIN repayments r ON r.loan_id = l.id
  GROUP BY l.id, l.company_id, l.principal, l.effective_rate, l.status, l.disbursement_date;

CREATE VIEW public.fund_source_outstanding WITH (security_invoker = true) AS
 SELECT f.id AS fund_source_id,
    f.source_type,
    f.from_company_id,
    f.from_director_id,
    f.amount AS original_amount,
    f.cost_rate,
    f.lock_in_months,
    f.effective_date,
    f.maturity_date,
    f.status,
    f.amount - COALESCE(sum(r.amount) FILTER (WHERE r.payment_type::text = ANY (ARRAY['principal'::text, 'netting'::text])), 0::numeric) AS outstanding,
    COALESCE(sum(r.amount) FILTER (WHERE r.payment_type::text = ANY (ARRAY['principal'::text, 'netting'::text])), 0::numeric) AS total_principal_paid,
    COALESCE(sum(r.amount) FILTER (WHERE r.payment_type = 'interest'::repayment_type), 0::numeric) AS total_interest_paid,
    COALESCE(sum(r.amount) FILTER (WHERE r.payment_type = 'penalty'::repayment_type), 0::numeric) AS total_penalty_paid,
        CASE
            WHEN f.lock_in_months IS NOT NULL AND f.lock_in_months > 0 THEN round(f.amount * f.cost_rate * f.lock_in_months::numeric, 2)
            ELSE round(f.amount * f.cost_rate, 2)
        END AS total_interest_due,
        CASE
            WHEN f.lock_in_months IS NOT NULL AND f.lock_in_months > 0 THEN round((f.amount + f.amount * f.cost_rate * f.lock_in_months::numeric) / f.lock_in_months::numeric, 2)
            ELSE round(f.amount + f.amount * f.cost_rate, 2)
        END AS monthly_payment,
    f.from_department_id
   FROM fund_sources f
     LEFT JOIN fund_source_repayments r ON r.fund_source_id = f.id
  GROUP BY f.id, f.source_type, f.from_company_id, f.from_director_id, f.from_department_id, f.amount, f.cost_rate, f.lock_in_months, f.effective_date, f.maturity_date, f.status;

CREATE VIEW public.fund_sources_weighted_cost WITH (security_invoker = true) AS
 SELECT COALESCE(sum(amount), 0::numeric) AS total_paid_capital,
        CASE
            WHEN COALESCE(sum(amount), 0::numeric) = 0::numeric THEN NULL::numeric
            ELSE sum(amount * cost_rate) / sum(amount)
        END AS weighted_cost_rate
   FROM fund_sources
  WHERE status = 'active'::fund_source_status;

-- Their grants as production held them.
GRANT ALL ON public.loan_outstanding TO authenticated, anon, service_role;
GRANT ALL ON public.fund_source_outstanding TO authenticated, service_role;
-- The default privileges grant anon on a new view; production's never had it.
REVOKE ALL ON public.fund_source_outstanding FROM anon;
GRANT ALL ON public.fund_sources_weighted_cost TO authenticated, anon, service_role;

-- ─── 2. How a deal's rate was set ────────────────────────────────────────────
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS rate_basis TEXT NOT NULL DEFAULT 'month'
    CONSTRAINT loans_rate_basis_valid CHECK (rate_basis IN ('month', 'year'));
ALTER TABLE public.fund_sources ADD COLUMN IF NOT EXISTS rate_basis TEXT NOT NULL DEFAULT 'month'
    CONSTRAINT fund_sources_rate_basis_valid CHECK (rate_basis IN ('month', 'year'));
COMMENT ON COLUMN public.loans.rate_basis IS
    'How the rate was agreed (2026-11-04): month, or year — effective_rate is still the month''s (the year''s ÷ 12); the pages say it per year. Read only for the words.';
COMMENT ON COLUMN public.fund_sources.rate_basis IS
    'How the rate was agreed (2026-11-04): month, or year — cost_rate is still the month''s (the year''s ÷ 12); the pages say it per year. Read only for the words.';
