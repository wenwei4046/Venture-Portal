-- ============================================================================
-- 20260831020000_withholding_tax.sql
-- Withholding Tax as an alternative to PCB
-- HOUZS Venture Portal
--
-- ⚠️  NOT YET APPLIED TO THE LIVE PROJECT.
--
-- User decision 2026-08-31: Revenue Department salespeople do not have PCB.
-- They pay **Withholding Tax at 2% of total salary** instead, and it is a
-- per-person choice — some are withheld, some are not.
--
-- This is the ONE place the commission work touches shared payroll machinery,
-- so it is deliberately a separate migration from the commission foundation
-- and deliberately conservative:
--
--   * hr_staff_costs.tax_mode defaults to 'pcb' — every existing employee is
--     unchanged, and the PCB branch below is byte-for-byte the 2026-07-03
--     logic.
--   * hr_monthly_payroll.withholding_tax defaults to 0, so the net formula is
--     arithmetically identical for everyone still on PCB.
--   * Gross, the statutory wage base and the run's CTC total are all
--     UNCHANGED. Withholding Tax is an employee-side deduction, exactly like
--     PCB, so payroll funding and the GL posting are untouched.
--
-- Remittance note: PCB is filed to LHDN through the statutory export. WHT is
-- also remitted to LHDN but on a different form, so the statutory route will
-- need its own WHT section before the first Revenue payroll is actually paid.
-- Tracked in the spec, not built here.
-- ============================================================================

CREATE TYPE hr_tax_mode AS ENUM ('pcb', 'withholding', 'none');

COMMENT ON TYPE hr_tax_mode IS
    'pcb: LHDN Jadual PCB lookup (the default, every existing employee). withholding: flat % of gross instead of PCB (Revenue Department salespeople). none: neither.';

ALTER TABLE hr_staff_costs
    ADD COLUMN IF NOT EXISTS tax_mode hr_tax_mode NOT NULL DEFAULT 'pcb';

ALTER TABLE hr_staff_costs
    ADD COLUMN IF NOT EXISTS withholding_rate DECIMAL(9, 6) NOT NULL DEFAULT 0.02
        CONSTRAINT withholding_rate_sane CHECK (withholding_rate >= 0 AND withholding_rate <= 1);

COMMENT ON COLUMN hr_staff_costs.tax_mode IS
    'Which tax deduction applies to this person. Per-person tick, defaulting to pcb so nothing existing changes.';
COMMENT ON COLUMN hr_staff_costs.withholding_rate IS
    'Rate used when tax_mode = withholding. 0.02 = 2% of gross (user 2026-08-31).';

ALTER TABLE hr_monthly_payroll
    ADD COLUMN IF NOT EXISTS withholding_tax DECIMAL(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN hr_monthly_payroll.withholding_tax IS
    'Withholding Tax deducted this month = gross x hr_staff_costs.withholding_rate, when tax_mode = withholding. Mutually exclusive with pcb: whichever applies, the other is 0.';

-- ----------------------------------------------------------------------------
-- Recompute function.
-- Identical to the 2026-07-03 (SKBBK) version except:
--   * the PCB block becomes a three-way branch on v_staff.tax_mode
--   * the net line subtracts withholding_tax
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_hr_monthly_payroll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    -- Statutory wages base = prorated basic + prorated statutory allowance,
    -- less the RM deduction (a No-Pay deduction in RM), floored at 0 so the
    -- JADUAL lookups never see a negative wage. (SKBBK does NOT reduce this —
    -- it is a net-only deduction.)
    --
    -- A Revenue salesperson has basic = 0 and statutory_allowance = 0, so this
    -- lands at 0 and every statutory lookup below returns 0 on its own. That
    -- is why "no basic, no statutory, full commission" needed no change here.
    v_statutory_wages := GREATEST(
        v_prorated_basic + v_prorated_stat - COALESCE(NEW.deduction_amount, 0),
        0
    );

    -- Zero statutory wages → zero contributions. Guard needed because the
    -- lookup_socso/lookup_eis fallback returns CEILING values when no bracket
    -- matches, and 0 sits below the schedules' first bracket.
    IF v_statutory_wages <= 0 THEN
        NEW.epf_er := 0; NEW.epf_ee := 0;
        NEW.socso_er := 0; NEW.socso_ee := 0;
        NEW.eis_er := 0; NEW.eis_ee := 0;
    ELSE
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
    END IF;

    -- Gross: all earnings (prorated basic/stat/ot + full commission + full
    -- non-stat allowance) less the RM deduction. SKBBK does NOT reduce gross.
    v_gross := v_prorated_basic + v_prorated_stat + v_prorated_ot
             + NEW.commission_amount + NEW.non_statutory_allowance
             - COALESCE(NEW.deduction_amount, 0);

    -- PCB uses taxable income (gross minus EPF EE, per LHDN rule) — SKBBK is
    -- not tax-deductible, so it does not enter this either.
    v_taxable_income := v_gross - NEW.epf_ee;

    -- Tax: exactly one of PCB / Withholding applies.
    IF v_staff.tax_mode = 'withholding' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := ROUND(
            GREATEST(v_gross, 0) * COALESCE(v_staff.withholding_rate, 0.02), 2);
    ELSIF v_staff.tax_mode = 'none' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := 0;
    ELSE
        NEW.pcb := COALESCE(
            lookup_pcb(v_taxable_income, v_staff.pcb_category, v_staff.children_count),
            0
        );
        NEW.withholding_tax := 0;
    END IF;

    NEW.gross := ROUND(v_gross, 2);
    NEW.net   := ROUND(
        v_gross - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb
                - NEW.withholding_tax - COALESCE(NEW.skbbk_amount, 0), 2);

    NEW.updated_at := NOW();

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.compute_hr_monthly_payroll IS
    'Computes pro-rata + statutory (EPF/SOCSO/EIS) + tax + gross/net. Tax is PCB by default; a staff on tax_mode = withholding gets a flat % of gross instead (Revenue Department, 2026-08-31). Statutory base is (prorated basic + statutory allowance) only, so a pure-commission salesperson contributes nothing.';

-- The UPDATE OF list is unchanged: withholding_tax is computed, not an input,
-- and stays out for the same reason pcb does — so a manual override sticks.
DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_compute ON hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_compute
    BEFORE INSERT OR UPDATE OF
        basic_salary, statutory_allowance, non_statutory_allowance,
        ot_hours, ot_amount, commission_amount, unpaid_leave_days,
        deduction_amount, skbbk_amount, period_month, staff_id
    ON hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION compute_hr_monthly_payroll();
