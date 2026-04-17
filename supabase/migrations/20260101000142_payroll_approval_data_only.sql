-- ============================================================================
-- 20260101000142_payroll_approval_data_only.sql
-- Refactor (user-approved 2026-04-17): payroll_run approval is DATA-ONLY
-- HOUZS Venture Portal
--
-- Why this change (full flow correction):
--   The old approve_payroll_run (migrations 129/131/137) did four things in
--   one Principal approval:
--     1. flip payroll_runs.status -> 'paid'
--     2. fan out one salary_payout payment_voucher per employee + director
--     3. insert salary_payout_out rows into alliance_bank_pool
--     4. flip all hr_monthly_payroll.status -> 'paid'
--
--   That conflated four distinct business stages into one click. The real
--   business flow is:
--     Stage A  HR costing → Principal approves DATA (← what this RPC now does)
--     Stage B  Finance invoices subsidiaries
--     Stage C  Subsidiaries pay → dept pools fill
--     Stage D  HR requests payroll payment → Finance
--     Stage E  Finance generates a PV auto-filled from the request
--     Stage F  Principal approves the PV → Hong Leong → alliance_bank_pool
--     Stage G  HR distributes to staff → per-employee salary_payout PVs
--
--   Stage A (this RPC) must NOT move money, create vouchers, or lock payroll
--   rows as 'paid'. It only confirms the numbers are correct so Finance can
--   proceed to Stage B.
--
-- What this migration does:
--   - Rewrites approve_payroll_run to be data-only:
--       * sets payroll_runs.status = 'approved', approved_by, approved_at
--       * approves the linked approval_requests row
--       * writes to access_log
--       * NO voucher fan-out, NO alliance_bank_pool write, NO hr_monthly_payroll flip
--   - reject_payroll_run stays as migration 131 (still correct — reject means
--     "numbers wrong, HR re-edits", which flips hr_monthly_payroll back to draft)
--
-- Precondition: test data has been wiped via
--   `node --env-file=.env.local scripts/wipe-payroll-test-data.mjs`
--   Otherwise the April 2026 submitted run from the old flow would need manual
--   handling; we prefer a clean slate per user directive ("全删").
-- ============================================================================

CREATE OR REPLACE FUNCTION approve_payroll_run(
    p_run_id UUID,
    p_approver UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_run           payroll_runs%ROWTYPE;
    v_approver_role user_role;
BEGIN
    -- Approver must exist, be active, and be Principal.
    SELECT role INTO v_approver_role
    FROM users
    WHERE id = p_approver AND is_active = TRUE;

    IF v_approver_role IS NULL THEN
        RAISE EXCEPTION 'approve_payroll_run: unknown or inactive user %', p_approver;
    END IF;
    IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'approve_payroll_run: only Principal may approve, got %',
            v_approver_role;
    END IF;

    -- Run must exist and be in submitted state.
    SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_payroll_run: run % not found', p_run_id;
    END IF;
    IF v_run.status <> 'submitted' THEN
        RAISE EXCEPTION
            'approve_payroll_run: run % status is %, must be submitted',
            p_run_id, v_run.status;
    END IF;

    -- Principal cannot approve their own submission.
    IF v_run.submitted_by = p_approver THEN
        RAISE EXCEPTION
            'approve_payroll_run: approver cannot also be the submitter';
    END IF;

    -- The only state change: data approval.
    -- No PV fan-out. No alliance_bank_pool write. No hr_monthly_payroll flip.
    -- Stages B-G happen via separate, explicit actions (invoices, payment
    -- requests, PVs) downstream of this approval.
    UPDATE payroll_runs
       SET status      = 'approved',
           approved_by = p_approver,
           approved_at = NOW()
     WHERE id = p_run_id;

    -- Also mark the linked approval_requests row as approved so Finance's
    -- Approvals queue clears this entry.
    UPDATE approval_requests
       SET status         = 'approved',
           workflow_state = 'approved',
           approved_by    = p_approver,
           approved_at    = NOW()
     WHERE id = v_run.approval_id;

    -- Audit trail.
    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_approver, 'payroll_run', p_run_id::TEXT, 'approve_data_only',
        jsonb_build_object(
            'period',         v_run.period_month,
            'total_amount',   v_run.total_amount,
            'semantics',      'data-only approval; no money movement'
        )
    );
END;
$$;

COMMENT ON FUNCTION approve_payroll_run(UUID, UUID) IS
    'Data-only approval of a payroll_run (Stage A of the HR payroll cycle). '
    'Refactored 2026-04-17 from the previous combined approve+fan-out behaviour. '
    'Money movement is handled by the Request-for-Payment flow (Stages D-F) '
    'and the subsequent staff payout flow (Stage G), not by this function.';
