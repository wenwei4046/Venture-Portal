-- ─────────────────────────────────────────────────────────────────────────────
-- Mig 20260725010000 — HR can SEE payroll-scoped payment vouchers
--
-- pv_select is finance/principal-only, so the HR Payment page was blind to
-- the vouchers HR itself generates: after creating the staff disbursement
-- batch the card still offered "Create 18 vouchers" (clicking again only
-- bounced off the server-side dedupe), statutory voucher rows never showed
-- their status, and batch approved/paid state was invisible.
--
-- HR is allowed to see individual salary detail per the access matrix, and
-- payroll vouchers are HR's own workflow — so grant HR SELECT on exactly the
-- payroll-scoped reference types, nothing else in the treasury.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY pv_select_hr_payroll ON payment_vouchers
    FOR SELECT
    USING (
        current_user_role() = 'hr'::user_role
        AND reference_type IN (
            'payroll_disbursement',
            'payroll_statutory',
            'payroll_payment_request'
        )
    );
