-- fund_source_outstanding counted only payment_type='principal', so the
-- L32 netting knock-off (HC 53,613.75, JV-000010 — a non-cash PRINCIPAL
-- reduction per the accountant's books and the GL 4052 balance) was excluded:
-- the app showed HOUZS Century outstanding 53,613.75 higher than GL/reality.
-- Fund-source side netting = principal-reducing. (Loans side is different by
-- design: loan netting posts to 7000 as interest-style gain — loan_outstanding
-- stays principal-only and is NOT touched here. See fund-out/actions.ts
-- recordRepayment comments.)
-- Found by the 2026-06-11 full finance-module verification (treasury agent).
-- (Applied via MCP apply_migration on 2026-06-11; file kept for repo parity.)
CREATE OR REPLACE VIEW fund_source_outstanding AS
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
    f.amount - COALESCE(sum(r.amount) FILTER (WHERE r.payment_type::text IN ('principal','netting')), 0::numeric) AS outstanding,
    COALESCE(sum(r.amount) FILTER (WHERE r.payment_type::text IN ('principal','netting')), 0::numeric) AS total_principal_paid,
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
