-- ============================================================================
-- 20260717100000_director_monthly_payroll.sql
-- Director actual payroll (InfoTech import) — mirrors hr_monthly_payroll but
-- for the 4 directors, fed by the director-only InfoTech PayrollSummary
-- export. Verbatim store: the file is the source of truth, no statutory
-- recompute. Rows are matched to directors by fuzzy name; unmatched rows
-- still import (director_id NULL) so nothing silently disappears.
--
-- Access: Principal + HR only (same visibility as director_payouts —
-- Finance must never see individual director salary detail).
-- ============================================================================

CREATE TABLE director_monthly_payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL,
    director_id UUID REFERENCES directors(id),
    employee_code TEXT NOT NULL DEFAULT '',
    employee_name TEXT NOT NULL,
    dept_name TEXT NOT NULL DEFAULT '',

    -- Input figures (verbatim from the file, editable inline afterwards)
    basic_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    statutory_allowance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    non_statutory_allowance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ot_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    commission_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    no_pay_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    deduction_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    skbbk_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- Statutory + result figures (verbatim, no recompute trigger)
    epf_er DECIMAL(15, 2) NOT NULL DEFAULT 0,
    epf_ee DECIMAL(15, 2) NOT NULL DEFAULT 0,
    socso_er DECIMAL(15, 2) NOT NULL DEFAULT 0,
    socso_ee DECIMAL(15, 2) NOT NULL DEFAULT 0,
    eis_er DECIMAL(15, 2) NOT NULL DEFAULT 0,
    eis_ee DECIMAL(15, 2) NOT NULL DEFAULT 0,
    pcb DECIMAL(15, 2) NOT NULL DEFAULT 0,
    gross DECIMAL(15, 2) NOT NULL DEFAULT 0,
    net DECIMAL(15, 2) NOT NULL DEFAULT 0,

    source TEXT NOT NULL DEFAULT 'imported' CHECK (source IN ('imported', 'manual')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT dmp_period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    -- Upsert key for re-imports: one row per person per month. Name (not code)
    -- because the director file may omit employee codes.
    CONSTRAINT uq_dmp_period_employee UNIQUE (period_month, employee_name)
);

COMMENT ON TABLE director_monthly_payroll IS
    'Director actual payroll imported verbatim from the director-only InfoTech PayrollSummary. Reconciled against director_payouts (engine calculation). Principal + HR only.';

CREATE INDEX idx_dmp_period ON director_monthly_payroll (period_month);
CREATE INDEX idx_dmp_director ON director_monthly_payroll (director_id);

-- ── RLS: Principal + HR only, full CRUD ─────────────────────────────────────
ALTER TABLE director_monthly_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY dmp_ph_select ON director_monthly_payroll
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY dmp_ph_insert ON director_monthly_payroll
    FOR INSERT WITH CHECK (current_user_role() IN ('principal', 'hr'));

CREATE POLICY dmp_ph_update ON director_monthly_payroll
    FOR UPDATE USING (current_user_role() IN ('principal', 'hr'));

CREATE POLICY dmp_ph_delete ON director_monthly_payroll
    FOR DELETE USING (current_user_role() IN ('principal', 'hr'));
