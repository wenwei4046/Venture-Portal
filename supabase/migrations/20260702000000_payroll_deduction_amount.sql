-- ─────────────────────────────────────────────────────────────────────────────
-- Payroll: add a monetary Deduction column (user request 2026-07-02).
--
-- Use case: a staff whose month's pay is withheld/deducted in RM (e.g. a
-- month-end joiner whose pro-rata salary is held to the next cycle — InfoTech
-- shows this in its "Ded" column with NettWgs 0). Deleting the row loses the
-- audit trail; instead HR keys the amount into the grid's Deduct column and
-- the row stays visible with gross/net reduced.
--
-- Semantics: deduction_amount behaves like a No-Pay deduction in RM —
-- it reduces the statutory wage base (floored at 0) AND gross, so EPF/SOCSO/
-- EIS/PCB and net all follow, and the payroll run's CTC total (gross + ER)
-- no longer funds the withheld amount.
--
-- Import note: the InfoTech import auto-detects this from the file's "Ded"
-- column. InfoTech's Gross is BEFORE Ded (NettWgs is after); our gross is
-- after-deduction, so the import writes gross = file Gross − Ded verbatim.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE hr_monthly_payroll
    ADD COLUMN IF NOT EXISTS deduction_amount DECIMAL(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN hr_monthly_payroll.deduction_amount IS
    'Monetary deduction (RM) — keyed by HR or auto-detected from the InfoTech "Ded" column on import. Reduces statutory wage base (floored at 0) and gross via the compute trigger — a No-Pay deduction in RM, not a net-only deduction.';

-- Recompute function: identical to the live version except the two
-- deduction_amount subtractions (statutory wage base + gross).
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
    -- JADUAL lookups never see a negative wage.
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
    -- non-stat allowance) less the RM deduction
    v_gross := v_prorated_basic + v_prorated_stat + v_prorated_ot
             + NEW.commission_amount + NEW.non_statutory_allowance
             - COALESCE(NEW.deduction_amount, 0);

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
$function$;

-- Re-arm the trigger with deduction_amount in the UPDATE OF list so keying a
-- deduction recomputes the row (statutory override columns stay excluded).
DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_compute ON hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_compute
    BEFORE INSERT OR UPDATE OF
        basic_salary, statutory_allowance, non_statutory_allowance,
        ot_hours, ot_amount, commission_amount, unpaid_leave_days,
        deduction_amount, period_month, staff_id
    ON hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION compute_hr_monthly_payroll();
