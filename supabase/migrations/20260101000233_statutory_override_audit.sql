-- ============================================================================
-- 20260101000233_statutory_override_audit.sql
-- Phase 11.2: track manual EPF/SOCSO/EIS overrides on director_payouts
-- and hr_monthly_payroll.
--
-- Why: HR (and Principal) can now override the JADUAL-lookup statutory values
-- per payout. We don't keep a full audit trail this round (Phase 11.3 backlog),
-- but we stamp WHO last overrode and WHEN so /director-salary and /hr-costing
-- can show a "Manually overridden by X on Y" hint and offer "Reset to lookup".
--
-- NULL on both columns = lookup-driven (auto-computed).
-- Non-NULL = at least one statutory field was manually edited via the
-- updateStatutory server actions.
-- ============================================================================

ALTER TABLE director_payouts
    ADD COLUMN statutory_overridden_at TIMESTAMPTZ,
    ADD COLUMN statutory_overridden_by UUID REFERENCES users(id);

COMMENT ON COLUMN director_payouts.statutory_overridden_at IS
    'Phase 11.2: timestamp of the last manual override on payroll_*_ee/er or invoice_*_er. NULL = pristine lookup.';
COMMENT ON COLUMN director_payouts.statutory_overridden_by IS
    'Phase 11.2: user id of the last person who manually overrode any statutory field.';

ALTER TABLE hr_monthly_payroll
    ADD COLUMN statutory_overridden_at TIMESTAMPTZ,
    ADD COLUMN statutory_overridden_by UUID REFERENCES users(id);

COMMENT ON COLUMN hr_monthly_payroll.statutory_overridden_at IS
    'Phase 11.2: timestamp of the last manual override on epf_*/socso_*/eis_*. NULL = lookup-driven.';
COMMENT ON COLUMN hr_monthly_payroll.statutory_overridden_by IS
    'Phase 11.2: user id of the last person who manually overrode any statutory field.';
