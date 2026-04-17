-- ============================================================================
-- 20260101000122_hr_monthly_payroll.sql
-- Spec 1 (HR Payroll Redesign) — monthly payroll snapshot per employee
-- HOUZS Venture Portal
--
-- Core problem: hr_staff_costs is static (one row per employee). Monthly
-- basic/OT/commission/leave vary but today are lost because editing master
-- data overwrites in place.
--
-- Solution: hr_monthly_payroll = one row per (staff × month). BEFORE trigger
-- computes pro-rata (hire / resignation dates), statutory (EPF/SOCSO/EIS via
-- category-aware lookups), and PCB (using taxable income after EPF EE).
-- Commission_amount is accepted as an input here; compute_commission RPC
-- arrives in migration 123 and HR will call it before finalising the row.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE hr_monthly_payroll_status AS ENUM ('draft', 'submitted', 'paid');

CREATE TYPE hr_monthly_payroll_source AS ENUM ('imported', 'manual', 'carried_forward');

COMMENT ON TYPE hr_monthly_payroll_status IS
    'draft: HR editing freely. submitted: awaiting Principal approval (read-only to HR). paid: locked forever.';

-- ----------------------------------------------------------------------------
-- TABLE: hr_monthly_payroll
-- ----------------------------------------------------------------------------

CREATE TABLE hr_monthly_payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,
    period_month DATE NOT NULL,

    -- Inputs (HR-editable while status='draft')
    basic_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
    statutory_allowance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    non_statutory_allowance DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ot_hours DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ot_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    commission_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    unpaid_leave_days DECIMAL(10, 2) NOT NULL DEFAULT 0,

    -- Trigger-computed pro-rata bookkeeping
    prorata_days_worked INTEGER NOT NULL DEFAULT 0,
    prorata_days_in_month INTEGER NOT NULL DEFAULT 0,

    -- Trigger-computed statutory (ER = employer, EE = employee)
    epf_er DECIMAL(15, 2) NOT NULL DEFAULT 0,
    epf_ee DECIMAL(15, 2) NOT NULL DEFAULT 0,
    socso_er DECIMAL(15, 2) NOT NULL DEFAULT 0,
    socso_ee DECIMAL(15, 2) NOT NULL DEFAULT 0,
    eis_er DECIMAL(15, 2) NOT NULL DEFAULT 0,
    eis_ee DECIMAL(15, 2) NOT NULL DEFAULT 0,
    pcb DECIMAL(15, 2) NOT NULL DEFAULT 0,

    -- Trigger-computed totals
    gross DECIMAL(15, 2) NOT NULL DEFAULT 0,
    net DECIMAL(15, 2) NOT NULL DEFAULT 0,

    source hr_monthly_payroll_source NOT NULL DEFAULT 'manual',
    status hr_monthly_payroll_status NOT NULL DEFAULT 'draft',

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT period_is_first_of_month CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT uq_monthly_payroll_staff_period UNIQUE (staff_id, period_month),
    CONSTRAINT amounts_non_negative CHECK (
        basic_salary >= 0 AND statutory_allowance >= 0 AND non_statutory_allowance >= 0
        AND ot_hours >= 0 AND ot_amount >= 0 AND commission_amount >= 0
        AND unpaid_leave_days >= 0
    )
);

COMMENT ON TABLE hr_monthly_payroll IS
    'Spec 1: monthly payroll snapshot. One row per (staff × month). Trigger computes pro-rata + statutory. HR edits while draft; Principal approves via Spec 2; status=paid is terminal.';

CREATE INDEX idx_hmp_period_status ON hr_monthly_payroll (period_month, status);
CREATE INDEX idx_hmp_staff_period ON hr_monthly_payroll (staff_id, period_month);
CREATE INDEX idx_hmp_submitted_by_period ON hr_monthly_payroll (period_month)
    WHERE status = 'submitted';

-- ----------------------------------------------------------------------------
-- TRIGGER FUNCTION: compute_hr_monthly_payroll
-- Computes pro-rata days, statutory (EPF/SOCSO/EIS), PCB, gross, net.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION compute_hr_monthly_payroll()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff            hr_staff_costs%ROWTYPE;
    v_period_start     DATE;
    v_period_end       DATE;
    v_days_in_month    INTEGER;
    v_effective_start  DATE;
    v_effective_end    DATE;
    v_days_worked      INTEGER;
    v_prorata_ratio    NUMERIC(10, 6);

    v_prorated_basic   NUMERIC(15, 4);
    v_prorated_stat    NUMERIC(15, 4);
    v_prorated_ot      NUMERIC(15, 4);
    v_statutory_wages  NUMERIC(15, 4);
    v_gross            NUMERIC(15, 4);
    v_taxable_income   NUMERIC(15, 4);
BEGIN
    -- Load master record
    SELECT * INTO v_staff FROM hr_staff_costs WHERE id = NEW.staff_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'hr_monthly_payroll: staff_id % not found in hr_staff_costs', NEW.staff_id;
    END IF;

    -- Period window
    v_period_start := NEW.period_month;
    v_period_end   := (NEW.period_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_days_in_month := EXTRACT(DAY FROM v_period_end)::INTEGER;

    -- Effective employment window within the period
    -- NULL hire_date = "employed before period starts" (full month)
    v_effective_start := GREATEST(COALESCE(v_staff.hire_date, v_period_start), v_period_start);
    v_effective_end   := LEAST(COALESCE(v_staff.resignation_date, v_period_end), v_period_end);

    IF v_effective_start > v_effective_end THEN
        -- Employee was not employed at all during this period (hired after, or resigned before)
        v_days_worked := 0;
    ELSE
        v_days_worked := (v_effective_end - v_effective_start + 1);
    END IF;

    -- Unpaid leave reduces worked days (floor at 0)
    v_days_worked := GREATEST(v_days_worked - COALESCE(NEW.unpaid_leave_days, 0)::INTEGER, 0);

    IF v_days_in_month = 0 THEN
        v_prorata_ratio := 0;
    ELSE
        v_prorata_ratio := v_days_worked::NUMERIC / v_days_in_month::NUMERIC;
    END IF;

    NEW.prorata_days_worked   := v_days_worked;
    NEW.prorata_days_in_month := v_days_in_month;

    -- Pro-rata applies to: basic, statutory_allowance, ot_amount
    -- Does NOT apply to: commission_amount, non_statutory_allowance
    v_prorated_basic := NEW.basic_salary * v_prorata_ratio;
    v_prorated_stat  := NEW.statutory_allowance * v_prorata_ratio;
    v_prorated_ot    := NEW.ot_amount * v_prorata_ratio;

    -- Statutory wages base = prorated basic + prorated statutory allowance
    v_statutory_wages := v_prorated_basic + v_prorated_stat;

    -- EPF
    IF v_staff.is_epf_exempt THEN
        NEW.epf_er := 0;
        NEW.epf_ee := 0;
    ELSE
        SELECT employer, employee INTO NEW.epf_er, NEW.epf_ee
        FROM lookup_epf(v_statutory_wages, v_staff.epf_category);
        NEW.epf_er := COALESCE(NEW.epf_er, 0);
        NEW.epf_ee := COALESCE(NEW.epf_ee, 0);
    END IF;

    -- SOCSO (category-aware)
    SELECT employer, employee INTO NEW.socso_er, NEW.socso_ee
    FROM lookup_socso(v_statutory_wages, v_staff.socso_category);
    NEW.socso_er := COALESCE(NEW.socso_er, 0);
    NEW.socso_ee := COALESCE(NEW.socso_ee, 0);

    -- EIS (uniform)
    SELECT employer, employee INTO NEW.eis_er, NEW.eis_ee
    FROM lookup_eis(v_statutory_wages);
    NEW.eis_er := COALESCE(NEW.eis_er, 0);
    NEW.eis_ee := COALESCE(NEW.eis_ee, 0);

    -- Gross: all earnings (prorated basic/stat/ot + full commission + full non-stat allowance)
    v_gross := v_prorated_basic + v_prorated_stat + v_prorated_ot
             + NEW.commission_amount + NEW.non_statutory_allowance;

    -- PCB uses taxable income (gross minus EPF EE, per LHDN rule)
    v_taxable_income := v_gross - NEW.epf_ee;

    NEW.pcb := COALESCE(
        lookup_pcb(v_taxable_income, v_staff.pcb_category, v_staff.children_count),
        0
    );

    NEW.gross := ROUND(v_gross, 2);
    NEW.net   := ROUND(v_gross - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb, 2);

    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION compute_hr_monthly_payroll IS
    'Spec 1: computes pro-rata days + statutory (EPF/SOCSO/EIS) + PCB + gross/net for hr_monthly_payroll rows. Pro-rata rule: calendar days, applied to basic + statutory_allowance + ot_amount only (per user decision 2026-04-17).';

CREATE TRIGGER trg_hr_monthly_payroll_compute
    BEFORE INSERT OR UPDATE OF
        basic_salary, statutory_allowance, non_statutory_allowance,
        ot_hours, ot_amount, commission_amount, unpaid_leave_days,
        period_month, staff_id
    ON hr_monthly_payroll
    FOR EACH ROW
    EXECUTE FUNCTION compute_hr_monthly_payroll();

-- ----------------------------------------------------------------------------
-- RLS POLICIES
--
-- Access matrix (Q2 decision locked 2026-04-17):
--   principal      — full R/W on all statuses
--   hr             — R all statuses; INSERT/UPDATE/DELETE only while draft
--   finance        — SELECT only for rows where staff.department_id = Finance
--                    user's own department_id (divergence from current
--                    access-matrix.md — docs updated in a follow-up commit)
--   dept_manager   — DENY
--
-- Uses current_user_role() and current_user_department_id() helpers from
-- migration 000011 for consistency with the rest of the codebase.
-- ----------------------------------------------------------------------------

ALTER TABLE hr_monthly_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_monthly_payroll_principal_all
    ON hr_monthly_payroll FOR ALL
    USING (current_user_role() = 'principal')
    WITH CHECK (current_user_role() = 'principal');

CREATE POLICY hr_monthly_payroll_hr_select
    ON hr_monthly_payroll FOR SELECT
    USING (current_user_role() = 'hr');

CREATE POLICY hr_monthly_payroll_hr_insert
    ON hr_monthly_payroll FOR INSERT
    WITH CHECK (current_user_role() = 'hr' AND status = 'draft');

CREATE POLICY hr_monthly_payroll_hr_update
    ON hr_monthly_payroll FOR UPDATE
    USING (current_user_role() = 'hr' AND status = 'draft')
    WITH CHECK (current_user_role() = 'hr' AND status = 'draft');

CREATE POLICY hr_monthly_payroll_hr_delete
    ON hr_monthly_payroll FOR DELETE
    USING (current_user_role() = 'hr' AND status = 'draft');

CREATE POLICY hr_monthly_payroll_finance_own_dept_select
    ON hr_monthly_payroll FOR SELECT
    USING (
        current_user_role() = 'finance'
        AND current_user_department_id() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM hr_staff_costs s
            WHERE s.id = hr_monthly_payroll.staff_id
              AND s.department_id = current_user_department_id()
        )
    );

-- dept_manager: no policy → DENY ALL

-- ----------------------------------------------------------------------------
-- Additive RLS on hr_staff_costs — Finance own-dept SELECT
-- Needed so the Finance policy above can JOIN hr_staff_costs. Existing
-- hr_staff_costs_ph_select (principal+hr) remains. This policy is OR'd
-- with it because PostgreSQL combines multiple PERMISSIVE policies with
-- OR, so Finance users get own-dept visibility without widening principal/hr.
-- ----------------------------------------------------------------------------

CREATE POLICY hr_staff_costs_finance_own_dept_select
    ON hr_staff_costs FOR SELECT
    USING (
        current_user_role() = 'finance'
        AND current_user_department_id() IS NOT NULL
        AND department_id = current_user_department_id()
    );
