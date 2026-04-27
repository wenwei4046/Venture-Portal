-- ============================================================================
-- 20260101000216_backfill_journal_segment.sql
-- Backfill journal_entries.segment for all historical rows.
--
-- Strategy
-- --------
-- Cascade from most-specific to least-specific. Each UPDATE only touches rows
-- still tagged 'unallocated' (the default from mig 215), so the order matters:
--
--   1. Treasury — reference_type IN ('loan', 'fund_source', 'repayment')
--      and entries that touch interest accounts (4010, 4020, 5010)
--   2. Invoice-driven — reference_type='invoice' or 'invoice_paid_credit',
--      lookup invoices.billing_mode
--   3. Director-related — salary fan-out, payroll disbursement, director payout
--   4. Dept-driven — dept_expense_request, dept_payment_request, dept_transfer,
--      lookup dept_pools.department_id → departments.name
--   5. Claim — reference_type='claim', lookup claims.department_id
--   6. PV-driven — reference_type='payment_voucher', match voucher_type & context
--   7. Account-code fallback — entries that touch dept-specific GL accounts
--      (4040/5040 → marketing, 5020 → hr, 5030 → finance)
--   8. Anything left stays 'unallocated' (will surface in /reports/segment-pnl
--      reconciliation row as a non-zero unallocated bucket — visible alert)
--
-- Idempotent: re-running this migration produces no further changes because
-- every UPDATE filters by `segment = 'unallocated'`.
-- ============================================================================

BEGIN;

-- ── 1) TREASURY: explicit reference_types + interest-account-touching JEs ──
UPDATE journal_entries
SET segment = 'treasury'
WHERE segment = 'unallocated'
  AND reference_type IN ('loan', 'fund_source', 'repayment');

UPDATE journal_entries je
SET segment = 'treasury'
WHERE je.segment = 'unallocated'
  AND EXISTS (
      SELECT 1 FROM journal_lines jl
       WHERE jl.entry_id = je.id
         AND jl.account_code IN ('4010', '4020', '5010')
  );

-- ── 2) INVOICE-DRIVEN: derive from billing_mode ──────────────────────────
-- Direct invoice JEs (AR accrual at issue, P1-6a)
UPDATE journal_entries je
SET segment = CASE inv.billing_mode
    WHEN 'marketing_project'           THEN 'marketing'::gl_segment
    WHEN 'hr_attribution'              THEN 'hr'::gl_segment
    WHEN 'finance_attribution'         THEN 'finance'::gl_segment
    WHEN 'director_office_attribution' THEN 'director_office'::gl_segment
    WHEN 'director_attribution'        THEN 'director_office'::gl_segment
    ELSE 'corporate'::gl_segment
END
FROM invoices inv
WHERE je.segment = 'unallocated'
  AND je.reference_type = 'invoice'
  AND je.reference_id = inv.id;

-- invoice_paid_credit JEs (mig 202) reference the PV that paid the invoice;
-- look through the PV to the invoice to derive billing_mode.
UPDATE journal_entries je
SET segment = CASE inv.billing_mode
    WHEN 'marketing_project'           THEN 'marketing'::gl_segment
    WHEN 'hr_attribution'              THEN 'hr'::gl_segment
    WHEN 'finance_attribution'         THEN 'finance'::gl_segment
    WHEN 'director_office_attribution' THEN 'director_office'::gl_segment
    WHEN 'director_attribution'        THEN 'director_office'::gl_segment
    ELSE 'corporate'::gl_segment
END
FROM payment_vouchers pv
JOIN invoices inv ON inv.id = pv.reference_id
WHERE je.segment = 'unallocated'
  AND je.reference_type = 'invoice_paid_credit'
  AND je.reference_id = pv.id
  AND pv.reference_type = 'invoice';

-- ── 3) DIRECTOR-RELATED: salary, payouts, payroll disbursement ──────────
UPDATE journal_entries
SET segment = 'director_office'
WHERE segment = 'unallocated'
  AND reference_type IN (
      'salary', 'director_payout', 'payroll_disbursement', 'hr_monthly_payroll'
  );

-- ── 4) DEPT-DRIVEN: derive from department on dept_pools / dept_request ──
-- dept_expense_request JEs (mig 198): reference_id → dept_payment_requests
UPDATE journal_entries je
SET segment = CASE LOWER(d.name)
    WHEN 'marketing'         THEN 'marketing'::gl_segment
    WHEN 'hr'                THEN 'hr'::gl_segment
    WHEN 'finance'           THEN 'finance'::gl_segment
    WHEN 'director office'   THEN 'director_office'::gl_segment
    ELSE 'corporate'::gl_segment
END
FROM dept_payment_requests dpr
JOIN departments d ON d.id = dpr.department_id
WHERE je.segment = 'unallocated'
  AND je.reference_type IN ('dept_expense_request', 'dept_payment_request')
  AND je.reference_id = dpr.id;

-- dept_transfer JEs (mig 200, payroll fan-out): reference_id → dept_pools
UPDATE journal_entries je
SET segment = CASE LOWER(d.name)
    WHEN 'marketing'         THEN 'marketing'::gl_segment
    WHEN 'hr'                THEN 'hr'::gl_segment
    WHEN 'finance'           THEN 'finance'::gl_segment
    WHEN 'director office'   THEN 'director_office'::gl_segment
    ELSE 'corporate'::gl_segment
END
FROM dept_pools dp
JOIN departments d ON d.id = dp.department_id
WHERE je.segment = 'unallocated'
  AND je.reference_type = 'dept_transfer'
  AND je.reference_id = dp.id;

-- ── 5) CLAIM: derive from claims.department_id ──────────────────────────
UPDATE journal_entries je
SET segment = CASE LOWER(d.name)
    WHEN 'marketing'         THEN 'marketing'::gl_segment
    WHEN 'hr'                THEN 'hr'::gl_segment
    WHEN 'finance'           THEN 'finance'::gl_segment
    WHEN 'director office'   THEN 'director_office'::gl_segment
    ELSE 'corporate'::gl_segment
END
FROM claims c
LEFT JOIN departments d ON d.id = c.department_id
WHERE je.segment = 'unallocated'
  AND je.reference_type = 'claim'
  AND je.reference_id = c.id;

-- ── 6) PAYMENT VOUCHER: derive from voucher_type + linked invoice ───────
-- billing_payment vouchers settling an invoice → use invoice billing_mode
UPDATE journal_entries je
SET segment = CASE inv.billing_mode
    WHEN 'marketing_project'           THEN 'marketing'::gl_segment
    WHEN 'hr_attribution'              THEN 'hr'::gl_segment
    WHEN 'finance_attribution'         THEN 'finance'::gl_segment
    WHEN 'director_office_attribution' THEN 'director_office'::gl_segment
    WHEN 'director_attribution'        THEN 'director_office'::gl_segment
    ELSE 'corporate'::gl_segment
END
FROM payment_vouchers pv
JOIN invoices inv ON inv.id = pv.reference_id
WHERE je.segment = 'unallocated'
  AND je.reference_type = 'payment_voucher'
  AND je.reference_id = pv.id
  AND pv.voucher_type = 'billing_payment'
  AND pv.reference_type = 'invoice';

-- loan_repayment vouchers → treasury
UPDATE journal_entries je
SET segment = 'treasury'
FROM payment_vouchers pv
WHERE je.segment = 'unallocated'
  AND je.reference_type = 'payment_voucher'
  AND je.reference_id = pv.id
  AND pv.voucher_type = 'loan_repayment';

-- salary_payout vouchers → director_office
UPDATE journal_entries je
SET segment = 'director_office'
FROM payment_vouchers pv
WHERE je.segment = 'unallocated'
  AND je.reference_type = 'payment_voucher'
  AND je.reference_id = pv.id
  AND pv.voucher_type = 'salary_payout';

-- ── 7) ACCOUNT-CODE FALLBACK: dept-specific GL hits ─────────────────────
UPDATE journal_entries je
SET segment = 'marketing'
WHERE je.segment = 'unallocated'
  AND EXISTS (
      SELECT 1 FROM journal_lines jl
       WHERE jl.entry_id = je.id
         AND jl.account_code IN ('4040', '5040')
  );

UPDATE journal_entries je
SET segment = 'hr'
WHERE je.segment = 'unallocated'
  AND EXISTS (
      SELECT 1 FROM journal_lines jl
       WHERE jl.entry_id = je.id
         AND jl.account_code = '5020'
  );

UPDATE journal_entries je
SET segment = 'finance'
WHERE je.segment = 'unallocated'
  AND EXISTS (
      SELECT 1 FROM journal_lines jl
       WHERE jl.entry_id = je.id
         AND jl.account_code = '5030'
  );

-- ── 8) FINAL SAFETY: convert anything still 'unallocated' that reaches
--    only equity / corporate accounts to 'corporate' (HV-level reclass) ─
UPDATE journal_entries je
SET segment = 'corporate'
WHERE je.segment = 'unallocated'
  AND EXISTS (
      SELECT 1 FROM journal_lines jl
       WHERE jl.entry_id = je.id
         AND jl.account_code = '3010'  -- HV Operating Fund
  );

-- Anything still 'unallocated' is surfaced in the segment-pnl reconciliation
-- row — that's intentional. User audits and re-tags via Settings if needed.

COMMIT;
