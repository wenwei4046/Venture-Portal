-- ════════════════════════════════════════════════════════════════════════════
-- Pay lines: what HR adds to a salesperson's month on Comm Cal (2026-09-27)
--
-- The user, on the salary preview under a salesperson's ledger: an edit button
-- that adds LINES to the month — "他可能有一个 special claim，我就选 special
-- claim，然后 key in 金额。这个就是 edit 他的 payroll、add 他的 salary 的地方。"
--
-- A line is (person, month, kind, description, amount). The kind decides what
-- it does to the pay:
--
--   special_claim · allowance · incentive   EARNINGS. Added to gross in full —
--       never pro-rated and outside the statutory wage (no EPF / SOCSO / EIS),
--       the way the non-statutory allowance already is. Revenue PCB is read on
--       the basic alone, so they never move PCB; a withholding-tax salesperson
--       pays the rate on them with the rest of gross. Being gross, they are in
--       the CTC the payroll run asks Finance to fund.
--   deduction                               Taken off TAKE-HOME pay only, like
--       SKBBK: gross, the statutory wage and the tax are untouched.
--
-- WHERE THEY LAND. The lines are the fact; the payroll row carries only their
-- two totals, `pay_line_earnings` and `pay_line_deductions`, and both are
-- DERIVED: the two payroll triggers re-read them from this table whenever they
-- compute a Revenue row. Whatever a writer puts in those columns is replaced,
-- and a row created later (Create Period, the run's sync) picks up lines typed
-- before it existed. Saving lines touches the row, which fires the totals
-- trigger alone — gross, tax and net move; the saved statutory figures do not
-- (the path a reviewed commission adjustment already takes).
--
-- Only Revenue payroll rows (`source = 'commission'`) carry lines. Every other
-- row keeps both totals at 0, so imported and hand-keyed payroll compute
-- exactly as before — and a CHECK keeps it that way.
--
-- Writes go through `revenue_save_pay_lines` alone: Principal or HR; the
-- month's payroll still open (`assert_commission_payroll_open` — not
-- submitted, no funding or payment voucher, the period not locked); the
-- person's row, if there is one, a draft Revenue row; and the lines the editor
-- opened still the lines stored. Every save leaves its before and after in
-- `access_log`.
--
-- Rollback (nothing else reads the new objects):
--   restore compute_hr_monthly_payroll and recompute_revenue_payroll_totals to
--   the bodies below minus the pay-line terms, recreate
--   trg_hr_monthly_payroll_revenue_totals without the two columns, then
--   DROP FUNCTION revenue_save_pay_lines(uuid, date, jsonb, jsonb),
--     revenue_pay_lines_closed(date), revenue_pay_line_totals(uuid, date);
--   DROP TABLE revenue_pay_lines;
--   ALTER TABLE hr_monthly_payroll DROP CONSTRAINT pay_lines_only_on_revenue_rows,
--     DROP COLUMN pay_line_earnings, DROP COLUMN pay_line_deductions;
-- ════════════════════════════════════════════════════════════════════════════

-- ─── The lines ──────────────────────────────────────────────────────────────

CREATE TABLE public.revenue_pay_lines (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id     UUID NOT NULL REFERENCES public.hr_staff_costs(id) ON DELETE RESTRICT,
    period_month DATE NOT NULL CHECK (EXTRACT(DAY FROM period_month) = 1),
    kind         TEXT NOT NULL CHECK (kind IN ('special_claim', 'allowance', 'incentive', 'deduction')),
    description  TEXT CHECK (description IS NULL OR length(btrim(description)) BETWEEN 1 AND 200),
    amount       NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    sort_order   INTEGER NOT NULL DEFAULT 0,
    -- Bumped on every change: the editor sends back the (id, version) pairs it
    -- opened, and a save over somebody else's newer edit is refused.
    version      INTEGER NOT NULL DEFAULT 1,
    created_by   UUID NOT NULL REFERENCES public.users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   UUID NOT NULL REFERENCES public.users(id),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX revenue_pay_lines_staff_period ON public.revenue_pay_lines (staff_id, period_month);

COMMENT ON TABLE public.revenue_pay_lines IS
  'Lines HR adds to a Revenue salesperson''s month on Comm Cal (2026-09-27): special claim / allowance / incentive are earnings added to gross in full (no statutory, not pro-rated); deduction comes off take-home pay only. The payroll row carries their totals (pay_line_earnings / pay_line_deductions), derived by trigger. Written only by revenue_save_pay_lines.';

-- Individual pay: HR and the Principal, the same gate as revenue_pay_preview.
-- No write policy — revenue_save_pay_lines is the only writer.
ALTER TABLE public.revenue_pay_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_pay_lines_read ON public.revenue_pay_lines
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['admin'])) OR (SELECT has_scope(ARRAY['hr'])));
REVOKE ALL ON public.revenue_pay_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.revenue_pay_lines TO authenticated;

-- ─── Their totals on the payroll row ────────────────────────────────────────

ALTER TABLE public.hr_monthly_payroll
    ADD COLUMN pay_line_earnings   NUMERIC(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN pay_line_deductions NUMERIC(15,2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT pay_lines_only_on_revenue_rows CHECK (
        pay_line_earnings >= 0 AND pay_line_deductions >= 0
        AND (source = 'commission' OR (pay_line_earnings = 0 AND pay_line_deductions = 0))
    );

COMMENT ON COLUMN public.hr_monthly_payroll.pay_line_earnings IS
  'Sum of the month''s earning lines in revenue_pay_lines (special claim, allowance, incentive). Derived by the payroll triggers; added to gross in full. Revenue rows only.';
COMMENT ON COLUMN public.hr_monthly_payroll.pay_line_deductions IS
  'Sum of the month''s deduction lines in revenue_pay_lines. Derived by the payroll triggers; taken off net only. Revenue rows only.';

-- The one reading of a person's month: what the lines add, what they take off.
CREATE FUNCTION public.revenue_pay_line_totals(p_staff_id UUID, p_period DATE)
RETURNS TABLE (earnings NUMERIC, deductions NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
    SELECT COALESCE(SUM(l.amount) FILTER (WHERE l.kind <> 'deduction'), 0)::NUMERIC(15,2),
           COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'deduction'), 0)::NUMERIC(15,2)
      FROM public.revenue_pay_lines l
     WHERE l.staff_id = p_staff_id AND l.period_month = p_period;
$fn$;
REVOKE ALL ON FUNCTION public.revenue_pay_line_totals(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- ─── compute_hr_monthly_payroll: the live body, plus the pay lines ──────────
-- Two additions, both on Revenue rows only: the totals are re-read from the
-- lines (0 on every other row), gross adds the earnings, net takes off the
-- deductions. Nothing else changes.

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
    IF TG_OP = 'UPDATE' AND OLD.source = 'commission' AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Finalized Revenue payroll cannot be recalculated; reopen payroll first';
    END IF;
    -- A source-only adjustment/resync must retain saved manual statutory
    -- amounts. The later totals trigger updates gross, WHT and residual pay.
    IF TG_OP = 'UPDATE' AND OLD.source = 'commission' AND NEW.source = 'commission'
       AND OLD.payout_split_version = 2
       AND coalesce(current_setting('app.revenue_commission_write',true),'') IN ('adjust','sync')
       AND ROW(NEW.staff_id,NEW.period_month,NEW.basic_salary,NEW.statutory_allowance,
               NEW.non_statutory_allowance,NEW.ot_hours,NEW.ot_amount,
               NEW.unpaid_leave_days,NEW.deduction_amount,NEW.skbbk_amount)
           IS NOT DISTINCT FROM
           ROW(OLD.staff_id,OLD.period_month,OLD.basic_salary,OLD.statutory_allowance,
               OLD.non_statutory_allowance,OLD.ot_hours,OLD.ot_amount,
               OLD.unpaid_leave_days,OLD.deduction_amount,OLD.skbbk_amount) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.source = 'commission' THEN
        -- BEFORE INSERT runs before a conflicting payroll tuple is locked.
        -- This also serializes HR's newly-created zero-commission placeholders
        -- with a finance submission, not just inserts made by Revenue sync.
        PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || NEW.period_month::text));
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'New Revenue payroll must start as a draft';
        END IF;
        IF EXISTS (SELECT 1 FROM period_locks WHERE period_month = NEW.period_month AND is_locked) THEN
            RAISE EXCEPTION 'Revenue payroll accounting period % is locked', NEW.period_month;
        END IF;
        IF EXISTS (SELECT 1 FROM payroll_runs WHERE period_month = NEW.period_month
                   AND status IN ('submitted', 'approved', 'paid'))
           OR EXISTS (SELECT 1 FROM hr_monthly_payroll WHERE period_month = NEW.period_month
                      AND status IN ('submitted', 'paid')) THEN
            RAISE EXCEPTION 'Payroll for % has already been submitted. Reopen payroll before adding Revenue payroll.', NEW.period_month;
        END IF;
    END IF;

    -- Load master record
    SELECT * INTO v_staff FROM hr_staff_costs WHERE id = NEW.staff_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'hr_monthly_payroll: staff_id % not found in hr_staff_costs', NEW.staff_id;
    END IF;

    -- Pay lines (2026-09-27): what HR added to this person's month on Comm
    -- Cal. Always re-read, never trusted from the writer; Revenue rows only.
    IF NEW.source = 'commission' THEN
        SELECT t.earnings, t.deductions INTO NEW.pay_line_earnings, NEW.pay_line_deductions
          FROM revenue_pay_line_totals(NEW.staff_id, NEW.period_month) t;
    ELSE
        NEW.pay_line_earnings := 0;
        NEW.pay_line_deductions := 0;
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
    -- Does NOT apply to: commission_amount, non_statutory_allowance, pay lines
    v_prorated_basic := NEW.basic_salary * v_prorata_ratio;
    v_prorated_stat  := NEW.statutory_allowance * v_prorata_ratio;
    v_prorated_ot    := NEW.ot_amount * v_prorata_ratio;

    -- Statutory wages base = prorated basic + prorated statutory allowance,
    -- less the RM deduction (a No-Pay deduction in RM), floored at 0 so the
    -- JADUAL lookups never see a negative wage. (SKBBK does NOT reduce this —
    -- it is a net-only deduction. Neither do pay lines.)
    --
    -- Full-commission staff with no basic or statutory allowance keep a zero
    -- statutory base. A selected basic uses the same established schedules.
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

    -- All employer contributions are funded from upstream commission. Employee
    -- contributions and PCB remain in ordinary payroll net, exactly once.
    IF NEW.source = 'commission' THEN
        v_gross := NEW.commission_amount - NEW.epf_er - NEW.socso_er - NEW.eis_er
                 + v_prorated_stat + v_prorated_ot + NEW.non_statutory_allowance
                 + NEW.pay_line_earnings
                 - COALESCE(NEW.deduction_amount, 0);
    ELSE
        NEW.commission_balance := NULL;
        v_gross := v_prorated_basic + v_prorated_stat + v_prorated_ot
                 + NEW.commission_amount + NEW.non_statutory_allowance
                 - COALESCE(NEW.deduction_amount, 0);
    END IF;

    -- Imported payroll retains its existing tax base. Revenue uses only
    -- rounded actual gross basic less EPF EE; commission and other earnings
    -- do not increase this PCB lookup input.
    IF NEW.source = 'commission' THEN
        -- Revenue PCB is based only on actual gross basic less EPF EE.
        v_taxable_income := GREATEST(ROUND(NEW.basic_salary * v_prorata_ratio, 2) - NEW.epf_ee, 0);
    ELSE
        v_taxable_income := v_gross - NEW.epf_ee;
    END IF;

    -- Tax: exactly one of PCB / Withholding applies.
    IF v_staff.tax_mode = 'withholding' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := ROUND(
            GREATEST(v_gross, 0) * COALESCE(v_staff.withholding_rate, 0.02), 2);
    ELSIF v_staff.tax_mode = 'none' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := 0;
    ELSE
        IF NEW.source = 'commission' AND NEW.pcb_override_amount IS NOT NULL THEN
            NEW.pcb := NEW.pcb_override_amount;
        ELSE
            NEW.pcb := COALESCE(
                lookup_pcb(v_taxable_income, v_staff.pcb_category, v_staff.children_count), 0);
        END IF;
        NEW.withholding_tax := 0;
    END IF;

    NEW.gross := ROUND(v_gross, 2);
    -- pay_line_deductions is 0 on every row that is not a Revenue row.
    NEW.net   := ROUND(
        v_gross - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb
                - NEW.withholding_tax - COALESCE(NEW.skbbk_amount, 0)
                - NEW.pay_line_deductions, 2);

    IF NEW.source = 'commission' THEN
        NEW.payout_split_version := 2;
        NEW.basic_pay_net := ROUND(NEW.basic_salary * v_prorata_ratio, 2)
            - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb;
        NEW.commission_balance := NEW.net - NEW.basic_pay_net;
    ELSE
        NEW.payout_split_version := NULL;
        NEW.basic_pay_net := NULL;
    END IF;

    NEW.updated_at := NOW();

    RETURN NEW;
END;
$function$;

-- ─── recompute_revenue_payroll_totals: the live body, plus the pay lines ────

CREATE OR REPLACE FUNCTION public.recompute_revenue_payroll_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_staff hr_staff_costs%ROWTYPE;
    v_ratio numeric(10,6);
    v_basic numeric(15,2);
    v_stat numeric(15,4);
    v_ot numeric(15,4);
    v_gross numeric(15,4);
BEGIN
    IF NEW.source <> 'commission' THEN RETURN NEW; END IF;
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'Finalized Revenue payroll cannot be recalculated; reopen payroll first';
    END IF;
    SELECT * INTO STRICT v_staff FROM hr_staff_costs WHERE id = NEW.staff_id;
    v_ratio := CASE WHEN NEW.prorata_days_in_month > 0
        THEN NEW.prorata_days_worked::numeric / NEW.prorata_days_in_month ELSE 0 END;
    v_basic := ROUND(NEW.basic_salary * v_ratio, 2);
    v_stat := NEW.statutory_allowance * v_ratio;
    v_ot := NEW.ot_amount * v_ratio;

    -- Pay lines (2026-09-27): re-read, never trusted from the writer.
    SELECT t.earnings, t.deductions INTO NEW.pay_line_earnings, NEW.pay_line_deductions
      FROM revenue_pay_line_totals(NEW.staff_id, NEW.period_month) t;

    -- Explicit override_amount wins. A direct PCB-only edit on an existing v2
    -- row also becomes durable; input-trigger recalculation is not an override.
    IF NEW.pcb_override_amount IS NOT DISTINCT FROM OLD.pcb_override_amount
       AND NEW.pcb IS DISTINCT FROM OLD.pcb AND OLD.payout_split_version = 2
       AND ROW(NEW.staff_id,NEW.period_month,NEW.basic_salary,NEW.commission_amount,
               NEW.statutory_allowance,NEW.non_statutory_allowance,NEW.ot_amount,
               NEW.deduction_amount,NEW.unpaid_leave_days,NEW.epf_ee,
               NEW.prorata_days_worked,NEW.prorata_days_in_month)
           IS NOT DISTINCT FROM
           ROW(OLD.staff_id,OLD.period_month,OLD.basic_salary,OLD.commission_amount,
               OLD.statutory_allowance,OLD.non_statutory_allowance,OLD.ot_amount,
               OLD.deduction_amount,OLD.unpaid_leave_days,OLD.epf_ee,
               OLD.prorata_days_worked,OLD.prorata_days_in_month) THEN
        NEW.pcb_override_amount := NEW.pcb;
    END IF;

    v_gross := NEW.commission_amount - NEW.epf_er - NEW.socso_er - NEW.eis_er
        + v_stat + v_ot + NEW.non_statutory_allowance + NEW.pay_line_earnings
        - COALESCE(NEW.deduction_amount, 0);
    NEW.gross := ROUND(v_gross, 2);
    IF v_staff.tax_mode = 'withholding' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := ROUND(GREATEST(v_gross, 0)
            * COALESCE(v_staff.withholding_rate, 0.02), 2);
    ELSIF v_staff.tax_mode = 'none' THEN
        NEW.pcb := 0;
        NEW.withholding_tax := 0;
    ELSE
        NEW.pcb := COALESCE(NEW.pcb_override_amount,
            lookup_pcb(GREATEST(v_basic - NEW.epf_ee, 0),
                v_staff.pcb_category, v_staff.children_count), 0);
        NEW.withholding_tax := 0;
    END IF;

    NEW.net := ROUND(v_gross - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee
        - NEW.pcb - NEW.withholding_tax - COALESCE(NEW.skbbk_amount, 0)
        - NEW.pay_line_deductions, 2);
    NEW.basic_pay_net := v_basic - NEW.epf_ee - NEW.socso_ee - NEW.eis_ee - NEW.pcb;
    NEW.commission_balance := NEW.net - NEW.basic_pay_net;
    NEW.payout_split_version := 2;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$function$;

-- Saving lines writes only the two totals, so the totals trigger must listen
-- for them. (The compute trigger deliberately does not: a pay line never moves
-- the statutory wage, so the saved statutory figures stand.)
DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_revenue_totals ON public.hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_revenue_totals
    BEFORE UPDATE OF epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee,
        pcb, withholding_tax, gross, net, commission_balance,
        prorata_days_worked, prorata_days_in_month,
        pcb_override_amount, basic_pay_net, payout_split_version,
        commission_amount, commission_synced_amount, commission_adjustment_amount,
        pay_line_earnings, pay_line_deductions
    ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.recompute_revenue_payroll_totals();

-- ─── Can this month's pay lines still change? ───────────────────────────────
-- NULL = yes; otherwise the sentence assert_commission_payroll_open refuses
-- with. SECURITY DEFINER inside, so HR gets the true answer without reading
-- payroll_runs, period_locks or payment vouchers itself.

CREATE FUNCTION public.revenue_pay_lines_closed(p_period DATE)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
    PERFORM public.assert_commission_payroll_open(p_period);
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$fn$;
REVOKE ALL ON FUNCTION public.revenue_pay_lines_closed(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_pay_lines_closed(DATE) TO authenticated;

-- ─── The one writer ─────────────────────────────────────────────────────────
-- p_lines: the whole month for this person, in display order —
--   [{ "id": uuid | null, "kind": text, "description": text | null, "amount": number }]
--   A line with an id is kept (and updated if it changed), one without is
--   added, and a stored line missing from the list is deleted.
-- p_seen: the lines the editor opened, as "<id>:<version>" — a save made over
--   somebody else's newer edit is refused rather than overwriting it.

CREATE FUNCTION public.revenue_save_pay_lines(
    p_staff_id UUID, p_period DATE, p_lines JSONB, p_seen JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
    v_name      TEXT;
    v_source    TEXT;
    v_row       hr_monthly_payroll%ROWTYPE;
    v_has_row   BOOLEAN := FALSE;
    v_stored    TEXT[];
    v_seen      TEXT[];
    v_before    JSONB;
    v_after     JSONB;
    v_line      JSONB;
    v_id        UUID;
    v_kind      TEXT;
    v_desc      TEXT;
    v_amount    NUMERIC;
    v_keep      UUID[] := '{}';
    v_order     INTEGER := 0;
    v_changed   BOOLEAN := FALSE;
    v_earnings  NUMERIC(15,2);
    v_deductions NUMERIC(15,2);
BEGIN
    IF auth.uid() IS NULL OR NOT (has_scope(ARRAY['admin']) OR has_scope(ARRAY['hr'])) THEN
        RAISE EXCEPTION 'Only HR or the Principal may change a salesperson''s pay' USING ERRCODE = '42501';
    END IF;
    IF p_staff_id IS NULL OR p_period IS NULL OR EXTRACT(DAY FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'Pay lines belong to a person and the first day of a month';
    END IF;
    IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_typeof(p_seen) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Pay lines must be sent as a list';
    END IF;
    IF jsonb_array_length(p_lines) > 50 THEN
        RAISE EXCEPTION 'A month holds at most 50 pay lines';
    END IF;

    SELECT s.employee_name, d.payroll_source::TEXT INTO v_name, v_source
      FROM hr_staff_costs s LEFT JOIN departments d ON d.id = s.department_id
     WHERE s.id = p_staff_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Salesperson not found'; END IF;
    IF v_source IS DISTINCT FROM 'commission' THEN
        RAISE EXCEPTION '% is not paid through the Revenue payroll. Key their pay on HR Costing', v_name;
    END IF;

    -- The lock every Revenue payroll write takes, then the month's own guard:
    -- Principal or HR, the period open, payroll not submitted, no voucher.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    PERFORM assert_commission_payroll_open(p_period);

    SELECT * INTO v_row FROM hr_monthly_payroll
     WHERE staff_id = p_staff_id AND period_month = p_period FOR UPDATE;
    v_has_row := FOUND;
    IF v_has_row AND v_row.source <> 'commission' THEN
        RAISE EXCEPTION '%''s payroll for % is not a Revenue payroll row. Change it on HR Costing',
            v_name, to_char(p_period, 'FMMonth YYYY');
    END IF;
    IF v_has_row AND v_row.status <> 'draft' THEN
        RAISE EXCEPTION '%''s payroll for % is %. Reopen payroll before changing pay lines',
            v_name, to_char(p_period, 'FMMonth YYYY'), v_row.status;
    END IF;

    -- What the editor opened must still be what is stored.
    SELECT COALESCE(array_agg(l.id::TEXT || ':' || l.version ORDER BY l.id::TEXT || ':' || l.version), '{}'),
           COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'description', l.description,
               'amount', l.amount) ORDER BY l.sort_order, l.created_at), '[]'::JSONB)
      INTO v_stored, v_before
      FROM revenue_pay_lines l
     WHERE l.staff_id = p_staff_id AND l.period_month = p_period;
    SELECT COALESCE(array_agg(x ORDER BY x), '{}') INTO v_seen
      FROM jsonb_array_elements_text(p_seen) x;
    IF v_stored IS DISTINCT FROM v_seen THEN
        RAISE EXCEPTION 'Pay lines for % changed since you opened them. Reload and try again', v_name;
    END IF;

    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
        v_order := v_order + 1;
        IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'Line % is not a pay line', v_order;
        END IF;
        v_kind := v_line->>'kind';
        IF v_kind IS NULL OR v_kind NOT IN ('special_claim', 'allowance', 'incentive', 'deduction') THEN
            RAISE EXCEPTION 'Line %: choose what the line is', v_order;
        END IF;
        v_desc := NULLIF(btrim(COALESCE(v_line->>'description', '')), '');
        IF v_desc IS NOT NULL AND length(v_desc) > 200 THEN
            RAISE EXCEPTION 'Line %: keep the description under 200 characters', v_order;
        END IF;
        IF jsonb_typeof(v_line->'amount') IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Line %: enter an amount', v_order;
        END IF;
        v_amount := (v_line->>'amount')::NUMERIC;
        IF v_amount <= 0 OR v_amount <> round(v_amount, 2) OR v_amount > 9999999999999.99 THEN
            RAISE EXCEPTION 'Line %: the amount must be more than 0, to the sen', v_order;
        END IF;

        v_id := NULLIF(v_line->>'id', '')::UUID;
        IF v_id IS NULL THEN
            INSERT INTO revenue_pay_lines (staff_id, period_month, kind, description, amount, sort_order,
                                           created_by, updated_by)
            VALUES (p_staff_id, p_period, v_kind, v_desc, v_amount, v_order, auth.uid(), auth.uid())
            RETURNING id INTO v_id;
            v_changed := TRUE;
        ELSE
            IF v_id = ANY (v_keep) THEN
                RAISE EXCEPTION 'Line % is listed twice', v_order;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM revenue_pay_lines
                            WHERE id = v_id AND staff_id = p_staff_id AND period_month = p_period) THEN
                RAISE EXCEPTION 'Line % is not one of %''s lines for %', v_order, v_name, to_char(p_period, 'FMMonth YYYY');
            END IF;
            UPDATE revenue_pay_lines
               SET kind = v_kind, description = v_desc, amount = v_amount, sort_order = v_order,
                   version = version + 1, updated_by = auth.uid(), updated_at = now()
             WHERE id = v_id
               AND ROW(kind, description, amount, sort_order) IS DISTINCT FROM ROW(v_kind, v_desc, v_amount, v_order);
            IF FOUND THEN v_changed := TRUE; END IF;
        END IF;
        v_keep := v_keep || v_id;
    END LOOP;

    DELETE FROM revenue_pay_lines
     WHERE staff_id = p_staff_id AND period_month = p_period AND NOT (id = ANY (v_keep));
    IF FOUND THEN v_changed := TRUE; END IF;

    SELECT t.earnings, t.deductions INTO v_earnings, v_deductions
      FROM revenue_pay_line_totals(p_staff_id, p_period) t;

    -- The row, if the month has one, takes the new totals — the totals trigger
    -- re-reads them itself and recomputes gross, tax and net around them.
    IF v_has_row AND v_changed THEN
        UPDATE hr_monthly_payroll
           SET pay_line_earnings = v_earnings, pay_line_deductions = v_deductions
         WHERE id = v_row.id;
    END IF;

    IF v_changed THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'description', l.description,
                   'amount', l.amount) ORDER BY l.sort_order, l.created_at), '[]'::JSONB)
          INTO v_after
          FROM revenue_pay_lines l
         WHERE l.staff_id = p_staff_id AND l.period_month = p_period;
        INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
        VALUES (auth.uid(), 'revenue_pay_lines', p_staff_id::TEXT, 'save',
                jsonb_build_object('period', p_period, 'staff', v_name,
                                   'before', v_before, 'after', v_after,
                                   'payroll_row', CASE WHEN v_has_row THEN v_row.id END));
    END IF;

    RETURN jsonb_build_object('changed', v_changed, 'earnings', v_earnings, 'deductions', v_deductions,
                              'payroll_updated', v_has_row AND v_changed);
END;
$fn$;

COMMENT ON FUNCTION public.revenue_save_pay_lines(UUID, DATE, JSONB, JSONB) IS
  'The only writer of revenue_pay_lines (2026-09-27, Comm Cal''s salary preview): replaces one person''s month of pay lines, refuses a closed month, a non-draft or non-Revenue payroll row and a stale editor, moves the payroll row''s derived totals, and logs before/after to access_log.';

REVOKE ALL ON FUNCTION public.revenue_save_pay_lines(UUID, DATE, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_save_pay_lines(UUID, DATE, JSONB, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
