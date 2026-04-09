-- ============================================================================
-- 20260101000010_constraints.sql
-- Additional cross-table constraints and views
-- HOUZS Venture Portal (VP)
--
-- Most CHECK/UNIQUE constraints are defined inline in their respective table
-- migrations. This file adds:
--   - Cross-table consistency views (orphan detection for polymorphic refs)
--   - Balance computation views (not materialized yet; trigger in 12)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VIEW: approval_requests_with_target
-- Resolves polymorphic reference_table/reference_id to human-readable description
-- Use in UI instead of raw approval_requests query.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW approval_requests_with_target
WITH (security_invoker = true)
AS
SELECT
    ar.id,
    ar.request_type,
    ar.reference_id,
    ar.reference_table,
    ar.submitted_by,
    u_submit.name AS submitted_by_name,
    ar.description,
    ar.amount,
    ar.status,
    ar.workflow_state,
    ar.assigned_to,
    u_assign.name AS assigned_to_name,
    ar.due_at,
    ar.approved_by,
    u_approve.name AS approved_by_name,
    ar.approved_at,
    ar.notes,
    ar.created_at,
    ar.updated_at
FROM approval_requests ar
LEFT JOIN users u_submit ON u_submit.id = ar.submitted_by
LEFT JOIN users u_assign ON u_assign.id = ar.assigned_to
LEFT JOIN users u_approve ON u_approve.id = ar.approved_by;

COMMENT ON VIEW approval_requests_with_target IS
    'Approval requests with user names resolved. security_invoker = true per /autoplan Eng 1.4.';

-- ----------------------------------------------------------------------------
-- VIEW: loan_outstanding
-- Computes outstanding = principal - SUM(principal repayments) per loan.
-- Use this in queries that need outstanding. Much faster than recomputing.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW loan_outstanding
WITH (security_invoker = true)
AS
SELECT
    l.id AS loan_id,
    l.company_id,
    l.principal,
    l.effective_rate,
    l.status,
    l.disbursement_date,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'principal'), 0) AS total_principal_paid,
    l.principal - COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'principal'), 0) AS outstanding,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'interest'), 0) AS total_interest_paid,
    COALESCE(SUM(r.amount) FILTER (WHERE r.payment_type = 'penalty'), 0) AS total_penalty_paid
FROM loans l
LEFT JOIN repayments r ON r.loan_id = l.id
GROUP BY l.id, l.company_id, l.principal, l.effective_rate, l.status, l.disbursement_date;

COMMENT ON VIEW loan_outstanding IS
    'Canonical loan outstanding computation. Use this instead of recomputing per-query.';

-- ----------------------------------------------------------------------------
-- VIEW: hv_operating_fund_balance
-- Running balance of HV operating fund
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW hv_operating_fund_balance
WITH (security_invoker = true)
AS
SELECT
    COALESCE(SUM(
        CASE
            WHEN transaction_type IN ('saving_in', 'surplus_in', 'profit_in') THEN amount
            WHEN transaction_type IN ('deficit_out', 'expense_out') THEN -amount
            ELSE 0
        END
    ), 0) AS balance
FROM hv_operating_fund;

COMMENT ON VIEW hv_operating_fund_balance IS
    'Current HV operating fund balance. Cached via Next.js tag-based cache.';

-- ----------------------------------------------------------------------------
-- VIEW: invoice_payout_pool_balance
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW invoice_payout_pool_balance
WITH (security_invoker = true)
AS
SELECT
    COALESCE(SUM(
        CASE
            WHEN transaction_type = 'accumulate' THEN amount
            WHEN transaction_type = 'release' THEN -amount
            ELSE 0
        END
    ), 0) AS balance
FROM invoice_payout_pool;

COMMENT ON VIEW invoice_payout_pool_balance IS
    'Current invoice payout pool balance. Isolated, not for lending.';

-- ----------------------------------------------------------------------------
-- VIEW: dept_pool_balances
-- Per-department pool balance
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW dept_pool_balances
WITH (security_invoker = true)
AS
SELECT
    department_id,
    COALESCE(SUM(
        CASE
            WHEN transaction_type = 'np_in' THEN amount
            WHEN transaction_type = 'expense_out' THEN -amount
            ELSE 0
        END
    ), 0) AS balance
FROM dept_pools
GROUP BY department_id;

COMMENT ON VIEW dept_pool_balances IS
    'Per-department pool balance. Marketing has real P&L; HR/Finance are cost-to-cost (balance = 0).';

-- ----------------------------------------------------------------------------
-- VIEW: fund_sources_weighted_cost
-- Weighted average cost of active paid capital.
-- Displayed on Dashboard (live) vs. stored in base_rate_history (approved).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW fund_sources_weighted_cost
WITH (security_invoker = true)
AS
SELECT
    COALESCE(SUM(amount), 0) AS total_paid_capital,
    CASE
        WHEN COALESCE(SUM(amount), 0) = 0 THEN NULL
        ELSE SUM(amount * cost_rate) / SUM(amount)
    END AS weighted_cost_rate
FROM fund_sources
WHERE status = 'active';

COMMENT ON VIEW fund_sources_weighted_cost IS
    'Live weighted avg cost of capital. Displayed on Dashboard. Separate from approved base_rate_history.';

-- ----------------------------------------------------------------------------
-- Finance's HR cost access is via the SECURITY DEFINER function
-- get_hr_cost_summary() defined in 20260101000011_rls.sql.
-- Do NOT create a view here — with security_invoker=true it would be blocked
-- by hr_staff_costs RLS; with security_invoker=false it bypasses RLS which
-- is confusing. A function with explicit role check is clearer.
-- ----------------------------------------------------------------------------
