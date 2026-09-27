-- ════════════════════════════════════════════════════════════════════════════
-- The unified Payroll: person by person, in batches, topped up, closed (2026-09-27)
--
-- User 2026-09-27, on HR › Payroll: one page for everybody's pay — staff keyed
-- here, Directors worked out on Director Salary, the Revenue team worked out on
-- Comm Cal — and four rules for it:
--
--   1. Directors and salespeople are finished where they are worked out: press
--      Complete on Director Salary, close them on Comm Cal, and they show up
--      here as Completed, with the date and their pay.
--   2. Everybody else is ticked here and Completed, a few at a time or all at
--      once. Submit to Finance sends the people Completed since the last
--      submit — Finance's three today, HR's five next week — and stays
--      pressable; what each batch is waiting on is shown beside it.
--   3. Right-click somebody already submitted: Resubmit. They unlock, their
--      amounts can only go UP, they are Completed and submitted again, and the
--      second batch asks Finance for — and pays out — only the difference.
--   4. Total Close ends the month: nothing can change after it. Only the
--      Principal can open it again (user's choice, 2026-09-27).
--
-- Until now a month moved as one piece: submit_payroll_to_principal flipped
-- every row of every department at once, built one run and one funding
-- request, and could never be pressed twice.
--
-- THE MODEL
--   A row lives   draft → completed → submitted → paid.
--   A BATCH is one press of Submit to Finance (`payroll_batches`), with a LINE
--   per person (`payroll_batch_lines`) holding what that batch sends for them:
--   the whole row the first time, the rise on a resubmit. What a person has
--   been submitted for is the sum of their lines in batches still standing, so
--   "only up" and "only the difference" are one subtraction.
--   The month keeps ONE payroll_run (as it always had): its department totals
--   are the sum of its standing batches, so billing and the dashboards read
--   the month exactly as before. Each batch files its own funding request.
--   The Payment side pays what has been submitted AND funded, minus what is
--   already paid — never the live row, which may be unlocked for a top-up.
--
-- DIRECTORS (user's choice): Director Salary's Submit to Finance becomes
--   Complete — it still writes the billing snapshot — and the money goes with
--   the batches, funded from the Director pool as before.
-- REVENUE (user's choice): a salesperson closed on Comm Cal
--   (`comm_salesperson_closes`) IS their Complete. The close sets the payroll
--   row's commission and completes it; reopening sets it back to draft; the
--   bills the close pays are recorded as released so next month cannot pay
--   them again. The whole-month "Send to payroll" is retired.
--
-- June–August, submitted the old way, become batch #1 of their month (their
-- run totals match their rows to the sen, checked 2026-09-27), so every month
-- reads the same.
--
-- Guards raise with sentences a person can act on; the lifecycle moves only
-- through the functions below (they set app.payroll_lifecycle).
--
-- Rollback: this migration replaces live function bodies (listed at the end).
-- Restoring them means re-running their previous migrations; then DROP the
-- functions, triggers and tables created here and the added columns.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. The row's own lifecycle ─────────────────────────────────────────────

ALTER TABLE public.hr_monthly_payroll
    ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS topup_opened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS topup_opened_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hr_monthly_payroll.completed_at IS
    'When the row was last Completed (HR ticked it, or the salesperson was closed on Comm Cal). Unified Payroll, 2026-09-27.';
COMMENT ON COLUMN public.hr_monthly_payroll.topup_opened_at IS
    'Set while the row is unlocked for a Resubmit (a top-up): amounts may only go up; the next batch sends the difference. Cleared when it is submitted again.';

ALTER TABLE public.director_monthly_payroll
    ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS topup_opened_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS topup_opened_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.director_monthly_payroll DROP CONSTRAINT IF EXISTS dmp_status_valid;
ALTER TABLE public.director_monthly_payroll ADD CONSTRAINT dmp_status_valid
    CHECK (status IN ('draft', 'completed', 'submitted', 'paid'));

COMMENT ON COLUMN public.director_monthly_payroll.status IS
    'draft → completed (Complete on Director Salary) → submitted (a Payroll batch) → paid. Unified Payroll, 2026-09-27.';


-- ─── 2. Batches, their lines, the month's close ─────────────────────────────

CREATE TABLE public.payroll_batches (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE RESTRICT,
    period_month          DATE NOT NULL CHECK (EXTRACT(DAY FROM period_month) = 1),
    batch_no              INTEGER NOT NULL CHECK (batch_no >= 1),
    status                TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'sent_back')),
    people                INTEGER NOT NULL DEFAULT 0,
    topups                INTEGER NOT NULL DEFAULT 0,
    -- The month's run carries the same seven buckets; a batch adds to them.
    marketing_total       NUMERIC(15,2) NOT NULL DEFAULT 0,
    hr_total              NUMERIC(15,2) NOT NULL DEFAULT 0,
    finance_total         NUMERIC(15,2) NOT NULL DEFAULT 0,
    director_office_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    it_total              NUMERIC(15,2) NOT NULL DEFAULT 0,
    revenue_total         NUMERIC(15,2) NOT NULL DEFAULT 0,
    director_total        NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_amount          NUMERIC(15,2) GENERATED ALWAYS AS (
        marketing_total + hr_total + finance_total + director_office_total
        + it_total + revenue_total + director_total) STORED,
    -- Headcount per department — names of departments, never of people.
    departments           JSONB NOT NULL DEFAULT '[]'::JSONB,
    legacy                BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
    submitted_by_name     TEXT,
    sent_back_at          TIMESTAMPTZ,
    sent_back_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
    sent_back_by_name     TEXT,
    sent_back_reason      TEXT,
    CONSTRAINT payroll_batches_no_per_month UNIQUE (period_month, batch_no)
);

CREATE INDEX IF NOT EXISTS idx_payroll_batches_run ON public.payroll_batches (run_id);

COMMENT ON TABLE public.payroll_batches IS
    'One press of Submit to Finance on HR › Payroll (2026-09-27): the people Completed since the last press, with the CTC it asks Finance to fund (the whole row the first time, the difference on a resubmit). Department totals only — the people are in payroll_batch_lines. June–August 2026 are batch #1 (legacy) of their month.';

CREATE TABLE public.payroll_batch_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id                UUID NOT NULL REFERENCES public.payroll_batches(id) ON DELETE CASCADE,
    period_month            DATE NOT NULL,
    scope                   TEXT NOT NULL CHECK (scope IN ('staff', 'directors')),
    row_id                  UUID NOT NULL,
    staff_id                UUID REFERENCES public.hr_staff_costs(id) ON DELETE RESTRICT,
    director_id             UUID REFERENCES public.directors(id) ON DELETE RESTRICT,
    employee_name           TEXT NOT NULL,
    employee_code           TEXT,
    department_id           UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    department_name         TEXT NOT NULL,
    bucket                  TEXT NOT NULL CHECK (bucket IN
        ('marketing', 'hr', 'finance', 'director_office', 'it', 'revenue', 'director')),
    segment_key             TEXT NOT NULL,
    is_topup                BOOLEAN NOT NULL DEFAULT FALSE,
    -- What THIS batch sends for the row.
    gross                   NUMERIC(15,2) NOT NULL DEFAULT 0,
    net                     NUMERIC(15,2) NOT NULL DEFAULT 0,
    epf_er                  NUMERIC(15,2) NOT NULL DEFAULT 0,
    epf_ee                  NUMERIC(15,2) NOT NULL DEFAULT 0,
    socso_er                NUMERIC(15,2) NOT NULL DEFAULT 0,
    socso_ee                NUMERIC(15,2) NOT NULL DEFAULT 0,
    eis_er                  NUMERIC(15,2) NOT NULL DEFAULT 0,
    eis_ee                  NUMERIC(15,2) NOT NULL DEFAULT 0,
    pcb                     NUMERIC(15,2) NOT NULL DEFAULT 0,
    withholding_tax         NUMERIC(15,2) NOT NULL DEFAULT 0,
    skbbk                   NUMERIC(15,2) NOT NULL DEFAULT 0,
    non_statutory_allowance NUMERIC(15,2) NOT NULL DEFAULT 0,
    basic_pay_net           NUMERIC(15,2) NOT NULL DEFAULT 0,
    commission_balance      NUMERIC(15,2) NOT NULL DEFAULT 0,
    -- 2 = a Revenue row paid as net basic + commission balance.
    split_version           SMALLINT,
    ctc                     NUMERIC(15,2) GENERATED ALWAYS AS (gross + epf_er + socso_er + eis_er) STORED,
    -- The row as it stood when the batch left.
    snapshot                JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payroll_batch_lines_once UNIQUE (batch_id, scope, row_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_batch_lines_row    ON public.payroll_batch_lines (scope, row_id);
CREATE INDEX IF NOT EXISTS idx_payroll_batch_lines_period ON public.payroll_batch_lines (period_month);

COMMENT ON TABLE public.payroll_batch_lines IS
    'A person in a payroll batch (2026-09-27): what that batch sends for them — the whole row the first time, the rise on a resubmit. What a row has been submitted for = the sum of its lines in standing batches. Individual pay: HR and the Principal only.';

CREATE TABLE public.payroll_month_closes (
    period_month   DATE PRIMARY KEY CHECK (EXTRACT(DAY FROM period_month) = 1),
    closed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
    closed_by_name TEXT
);

COMMENT ON TABLE public.payroll_month_closes IS
    'Total Close on HR › Payroll (2026-09-27): while a month has a row here nothing in its payroll can change — no Complete, Resubmit, edit, import or batch. Only the Principal reopens it (payroll_reopen_month).';

ALTER TABLE public.payroll_payment_requests
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.payroll_batches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_ppr_batch ON public.payroll_payment_requests (batch_id);

-- One live request per batch now (a month has several); the old one-per-run
-- rule stays for any request that predates batches.
DROP INDEX IF EXISTS public.uq_ppr_one_active_per_run;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppr_one_active_per_batch
    ON public.payroll_payment_requests (batch_id)
    WHERE batch_id IS NOT NULL AND status IN ('submitted', 'pv_generated');
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppr_one_active_per_run_legacy
    ON public.payroll_payment_requests (payroll_run_id)
    WHERE batch_id IS NULL AND payroll_run_id IS NOT NULL AND status IN ('submitted', 'pv_generated');

-- RLS. Batches and closes are department totals and dates: HR, Finance and the
-- Principal read them. Lines are individual pay: HR and the Principal only
-- (Finance never sees an individual salary). Nobody writes them directly.
ALTER TABLE public.payroll_batches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_batch_lines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_month_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_batches_read ON public.payroll_batches
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr', 'treasury', 'admin'])));
CREATE POLICY payroll_batch_lines_read ON public.payroll_batch_lines
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr', 'admin'])));
CREATE POLICY payroll_month_closes_read ON public.payroll_month_closes
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr', 'treasury', 'admin'])));

REVOKE ALL ON public.payroll_batches, public.payroll_batch_lines, public.payroll_month_closes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payroll_batches, public.payroll_batch_lines,
    public.payroll_month_closes FROM authenticated;
GRANT SELECT ON public.payroll_batches, public.payroll_batch_lines, public.payroll_month_closes TO authenticated;


-- ─── 3. Small facts the rest asks ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.payroll_month_closed(p_period DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT EXISTS (SELECT 1 FROM payroll_month_closes WHERE period_month = p_period);
$fn$;
GRANT EXECUTE ON FUNCTION public.payroll_month_closed(DATE) TO authenticated;

-- Which of the month run's seven buckets a department pays into. NULL = none
-- (a batch refuses the person rather than leave their cost out of the run —
-- the way IT's was, until 2026-09-04).
CREATE OR REPLACE FUNCTION public.payroll_bucket(p_segment_key TEXT, p_payroll_source TEXT, p_row_source TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $fn$
    SELECT CASE
        WHEN p_segment_key = 'marketing'       THEN 'marketing'
        WHEN p_segment_key = 'hr'              THEN 'hr'
        WHEN p_segment_key = 'finance'         THEN 'finance'
        WHEN p_segment_key = 'director_office' THEN 'director_office'
        WHEN p_segment_key = 'it'              THEN 'it'
        WHEN p_payroll_source = 'commission' OR p_row_source = 'commission' THEN 'revenue'
        ELSE NULL
    END;
$fn$;

-- A row's money, as the batch lines keep it.
CREATE OR REPLACE FUNCTION public.payroll_row_money(p_scope TEXT, p_row_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT jsonb_build_object(
        'gross', mp.gross, 'net', mp.net,
        'epf_er', mp.epf_er, 'epf_ee', mp.epf_ee,
        'socso_er', mp.socso_er, 'socso_ee', mp.socso_ee,
        'eis_er', mp.eis_er, 'eis_ee', mp.eis_ee,
        'pcb', mp.pcb, 'withholding_tax', mp.withholding_tax,
        'skbbk', mp.skbbk_amount, 'non_statutory_allowance', mp.non_statutory_allowance,
        'basic_pay_net', CASE WHEN mp.source = 'commission' AND mp.payout_split_version = 2
                              THEN mp.basic_pay_net ELSE 0 END,
        'commission_balance', CASE WHEN mp.source = 'commission' AND mp.payout_split_version = 2
                                   THEN mp.commission_balance ELSE 0 END,
        'split_version', CASE WHEN mp.source = 'commission' AND mp.payout_split_version = 2 THEN 2 END)
      FROM hr_monthly_payroll mp
     WHERE p_scope = 'staff' AND mp.id = p_row_id
    UNION ALL
    SELECT jsonb_build_object(
        'gross', d.gross, 'net', d.net,
        'epf_er', d.epf_er, 'epf_ee', d.epf_ee,
        'socso_er', d.socso_er, 'socso_ee', d.socso_ee,
        'eis_er', d.eis_er, 'eis_ee', d.eis_ee,
        'pcb', d.pcb, 'withholding_tax', 0,
        'skbbk', d.skbbk_amount, 'non_statutory_allowance', d.non_statutory_allowance,
        'basic_pay_net', 0, 'commission_balance', 0, 'split_version', NULL)
      FROM director_monthly_payroll d
     WHERE p_scope = 'directors' AND d.id = p_row_id;
$fn$;

-- What a row has been submitted for: its lines in batches still standing.
CREATE OR REPLACE FUNCTION public.payroll_row_submitted_money(p_scope TEXT, p_row_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT jsonb_build_object(
        'lines', count(l.id),
        'gross', coalesce(sum(l.gross), 0), 'net', coalesce(sum(l.net), 0),
        'epf_er', coalesce(sum(l.epf_er), 0), 'epf_ee', coalesce(sum(l.epf_ee), 0),
        'socso_er', coalesce(sum(l.socso_er), 0), 'socso_ee', coalesce(sum(l.socso_ee), 0),
        'eis_er', coalesce(sum(l.eis_er), 0), 'eis_ee', coalesce(sum(l.eis_ee), 0),
        'pcb', coalesce(sum(l.pcb), 0), 'withholding_tax', coalesce(sum(l.withholding_tax), 0),
        'skbbk', coalesce(sum(l.skbbk), 0), 'non_statutory_allowance', coalesce(sum(l.non_statutory_allowance), 0),
        'basic_pay_net', coalesce(sum(l.basic_pay_net), 0),
        'commission_balance', coalesce(sum(l.commission_balance), 0))
      FROM payroll_batch_lines l
      JOIN payroll_batches b ON b.id = l.batch_id AND b.status = 'submitted'
     WHERE l.scope = p_scope AND l.row_id = p_row_id;
$fn$;

-- Now minus submitted, component by component, and which went down.
--   {"lines": n, "gross": Δ, …, "falls": ["net", …], "rises": bool}
CREATE OR REPLACE FUNCTION public.payroll_row_delta(p_scope TEXT, p_row_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_now   JSONB := payroll_row_money(p_scope, p_row_id);
    v_sent  JSONB := payroll_row_submitted_money(p_scope, p_row_id);
    v_out   JSONB;
    v_key   TEXT;
    v_d     NUMERIC;
    v_falls TEXT[] := '{}';
    v_rises BOOLEAN := FALSE;
BEGIN
    IF v_now IS NULL THEN
        RETURN NULL;
    END IF;
    v_out := jsonb_build_object('lines', (v_sent->>'lines')::INT, 'split_version', v_now->'split_version');
    FOREACH v_key IN ARRAY ARRAY['gross', 'net', 'epf_er', 'epf_ee', 'socso_er', 'socso_ee',
        'eis_er', 'eis_ee', 'pcb', 'withholding_tax', 'skbbk', 'non_statutory_allowance',
        'basic_pay_net', 'commission_balance'] LOOP
        v_d := round(coalesce((v_now->>v_key)::NUMERIC, 0) - coalesce((v_sent->>v_key)::NUMERIC, 0), 2);
        v_out := v_out || jsonb_build_object(v_key, v_d);
        IF v_d < 0 THEN
            v_falls := v_falls || v_key;
        ELSIF v_d > 0 THEN
            v_rises := TRUE;
        END IF;
    END LOOP;
    RETURN v_out || jsonb_build_object('falls', to_jsonb(v_falls), 'rises', v_rises);
END;
$fn$;

-- The words for a component that went down.
CREATE OR REPLACE FUNCTION public.payroll_money_label(p_key TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $fn$
    SELECT CASE p_key
        WHEN 'gross' THEN 'gross' WHEN 'net' THEN 'net pay'
        WHEN 'epf_er' THEN 'EPF (employer)' WHEN 'epf_ee' THEN 'EPF (employee)'
        WHEN 'socso_er' THEN 'SOCSO (employer)' WHEN 'socso_ee' THEN 'SOCSO (employee)'
        WHEN 'eis_er' THEN 'EIS (employer)' WHEN 'eis_ee' THEN 'EIS (employee)'
        WHEN 'pcb' THEN 'PCB' WHEN 'withholding_tax' THEN 'withholding tax'
        WHEN 'skbbk' THEN 'SKBBK' WHEN 'non_statutory_allowance' THEN 'non-statutory allowance'
        WHEN 'basic_pay_net' THEN 'net basic' WHEN 'commission_balance' THEN 'commission balance'
        ELSE p_key END;
$fn$;

-- Standing Comm Cal closes for a person's month, summed across sub-departments.
CREATE OR REPLACE FUNCTION public.comm_standing_close_total(p_staff_id UUID, p_period DATE)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT coalesce(sum(total_commission), 0)
      FROM comm_salesperson_closes
     WHERE staff_id = p_staff_id AND period_month = p_period AND reopened_at IS NULL;
$fn$;

CREATE OR REPLACE FUNCTION public.payroll_actor_name()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT name FROM users WHERE id = auth.uid();
$fn$;


-- ─── 4. The lifecycle guard ─────────────────────────────────────────────────
-- Status moves only inside the functions below (app.payroll_lifecycle). A row
-- past draft cannot change at all; a month closed for good takes nothing.
-- Named 000_ so it runs before the compute triggers.

CREATE OR REPLACE FUNCTION public.guard_payroll_row_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_moving TEXT := coalesce(current_setting('app.payroll_lifecycle', true), '');
    v_name   TEXT;
    v_period DATE;
BEGIN
    v_period := CASE WHEN TG_OP = 'DELETE' THEN OLD.period_month ELSE NEW.period_month END;
    IF v_moving <> '' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'hr_monthly_payroll' THEN
        SELECT employee_name INTO v_name FROM hr_staff_costs
         WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.staff_id ELSE NEW.staff_id END;
    ELSE
        v_name := CASE WHEN TG_OP = 'DELETE' THEN OLD.employee_name ELSE NEW.employee_name END;
    END IF;
    v_name := coalesce(v_name, 'This person');

    IF payroll_month_closed(v_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good — nothing in it can change',
            to_char(v_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status::TEXT <> 'draft' THEN
            RAISE EXCEPTION 'A payroll row starts as a draft' USING ERRCODE = '23PAY';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status::TEXT <> 'draft' THEN
            RAISE EXCEPTION '%''s % pay is %. Only a draft row can be removed',
                v_name, to_char(OLD.period_month, 'FMMonth YYYY'), OLD.status USING ERRCODE = '23PAY';
        END IF;
        IF EXISTS (SELECT 1 FROM payroll_batch_lines l JOIN payroll_batches b ON b.id = l.batch_id
                    WHERE b.status = 'submitted' AND l.row_id = OLD.id
                      AND l.scope = CASE WHEN TG_TABLE_NAME = 'hr_monthly_payroll' THEN 'staff' ELSE 'directors' END) THEN
            RAISE EXCEPTION '%''s % pay has already gone to Finance — it cannot be removed',
                v_name, to_char(OLD.period_month, 'FMMonth YYYY') USING ERRCODE = '23PAY';
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE
    IF NEW.status::TEXT IS DISTINCT FROM OLD.status::TEXT THEN
        RAISE EXCEPTION 'Payroll status changes only through Complete, Submit to Finance or Resubmit'
            USING ERRCODE = '23PAY';
    END IF;
    IF OLD.status::TEXT <> 'draft'
       AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        RAISE EXCEPTION '%''s % pay is %. Unlock it before changing anything',
            v_name, to_char(OLD.period_month, 'FMMonth YYYY'), OLD.status USING ERRCODE = '23PAY';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_hr_monthly_payroll_000_lifecycle ON public.hr_monthly_payroll;
CREATE TRIGGER trg_hr_monthly_payroll_000_lifecycle
    BEFORE INSERT OR UPDATE OR DELETE ON public.hr_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_row_lifecycle();

DROP TRIGGER IF EXISTS trg_director_monthly_payroll_000_lifecycle ON public.director_monthly_payroll;
CREATE TRIGGER trg_director_monthly_payroll_000_lifecycle
    BEFORE INSERT OR UPDATE OR DELETE ON public.director_monthly_payroll
    FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_row_lifecycle();


-- ─── 5. Backfill: directors' state, June–August as batch #1 ─────────────────

SELECT set_config('app.payroll_lifecycle', 'backfill', true);

-- Directors submitted the old way (Director Salary's own Submit) are submitted.
UPDATE public.director_monthly_payroll d
   SET status = 'submitted'
 WHERE EXISTS (SELECT 1 FROM director_salary_submissions s WHERE s.period_month = d.period_month);

-- …and paid once every salary voucher over them is paid.
UPDATE public.director_monthly_payroll d
   SET status = 'paid'
 WHERE d.status = 'submitted' AND d.net > 0
   AND EXISTS (SELECT 1 FROM payroll_salary_coverage(d.period_month) c
                 JOIN payment_vouchers pv ON pv.id = c.voucher_id AND pv.status = 'paid'
                WHERE c.scope = 'directors' AND c.row_id = d.id);

-- Every live run becomes batch #1 of its month, its lines the rows it paid.
INSERT INTO public.payroll_batches (run_id, period_month, batch_no, status, people,
    marketing_total, hr_total, finance_total, director_office_total, it_total, revenue_total,
    director_total, departments, legacy, submitted_at, submitted_by, submitted_by_name)
SELECT r.id, r.period_month, 1, 'submitted',
       (SELECT count(*) FROM hr_monthly_payroll mp
         WHERE mp.period_month = r.period_month AND mp.status IN ('submitted', 'paid')),
       r.marketing_opex_total, r.hr_opex_total, r.finance_opex_total, r.director_office_total,
       r.it_opex_total, r.revenue_opex_total, r.director_salary_total,
       coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.dept, 'people', x.n) ORDER BY x.dept)
                   FROM (SELECT coalesce(d.name, 'Unassigned') dept, count(*) n
                           FROM hr_monthly_payroll mp
                           JOIN hr_staff_costs s ON s.id = mp.staff_id
                           LEFT JOIN departments d ON d.id = s.department_id
                          WHERE mp.period_month = r.period_month AND mp.status IN ('submitted', 'paid')
                          GROUP BY 1) x), '[]'::JSONB),
       TRUE, coalesce(r.submitted_at, r.created_at), r.submitted_by,
       (SELECT u.name FROM users u WHERE u.id = r.submitted_by)
  FROM public.payroll_runs r
 WHERE r.status <> 'rejected';

INSERT INTO public.payroll_batch_lines (batch_id, period_month, scope, row_id, staff_id,
    employee_name, employee_code, department_id, department_name, bucket, segment_key,
    gross, net, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, withholding_tax, skbbk,
    non_statutory_allowance, basic_pay_net, commission_balance, split_version, snapshot, created_at)
SELECT b.id, mp.period_month, 'staff', mp.id, mp.staff_id,
       s.employee_name, s.employee_code, s.department_id, coalesce(d.name, 'Unassigned'),
       payroll_bucket(d.segment_key, d.payroll_source::TEXT, mp.source::TEXT),
       coalesce(d.segment_key, 'unassigned'),
       mp.gross, mp.net, mp.epf_er, mp.epf_ee, mp.socso_er, mp.socso_ee, mp.eis_er, mp.eis_ee,
       mp.pcb, mp.withholding_tax, mp.skbbk_amount, mp.non_statutory_allowance,
       CASE WHEN mp.source = 'commission' AND mp.payout_split_version = 2 THEN mp.basic_pay_net ELSE 0 END,
       CASE WHEN mp.source = 'commission' AND mp.payout_split_version = 2 THEN mp.commission_balance ELSE 0 END,
       CASE WHEN mp.source = 'commission' AND mp.payout_split_version = 2 THEN 2 END,
       to_jsonb(mp), b.submitted_at
  FROM public.payroll_batches b
  JOIN public.hr_monthly_payroll mp ON mp.period_month = b.period_month AND mp.status IN ('submitted', 'paid')
  JOIN public.hr_staff_costs s ON s.id = mp.staff_id
  LEFT JOIN public.departments d ON d.id = s.department_id
 WHERE b.legacy;

UPDATE public.payroll_payment_requests q
   SET batch_id = b.id
  FROM public.payroll_batches b
 WHERE b.legacy AND q.payroll_run_id = b.run_id AND q.batch_id IS NULL;

-- The backfill must reconcile with what each run asked Finance for.
DO $check$
DECLARE v_bad TEXT;
BEGIN
    SELECT string_agg(to_char(b.period_month, 'Mon YYYY'), ', ') INTO v_bad
      FROM payroll_batches b
     WHERE b.legacy
       AND abs(b.total_amount - coalesce((SELECT sum(l.ctc) FROM payroll_batch_lines l WHERE l.batch_id = b.id), 0)) > 0.01;
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'Backfill does not reconcile with the run totals for %', v_bad;
    END IF;
    IF EXISTS (SELECT 1 FROM payroll_batch_lines WHERE bucket IS NULL) THEN
        RAISE EXCEPTION 'Backfill found a payroll row outside every payroll bucket';
    END IF;
END
$check$;

SELECT set_config('app.payroll_lifecycle', '', true);


-- ─── 6. Complete / unlock (staff keyed on HR › Payroll) ─────────────────────

-- Put a row back where it stood after its last batch: paid when everything it
-- was submitted for is paid, else submitted. (payroll_salary_outstanding is
-- defined in section 12; plpgsql resolves it when this runs.)
CREATE OR REPLACE FUNCTION public.payroll_row_settled_status(p_scope TEXT, p_row_id UUID, p_period DATE)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF EXISTS (SELECT 1 FROM payroll_salary_entitlements(p_period) e
                WHERE e.scope = p_scope AND e.row_id = p_row_id AND e.submitted > 0)
       AND NOT EXISTS (SELECT 1 FROM payroll_salary_entitlements(p_period) e
                        WHERE e.scope = p_scope AND e.row_id = p_row_id AND e.submitted > 0
                          AND e.paid + 0.005 < e.submitted) THEN
        RETURN 'paid';
    END IF;
    RETURN 'submitted';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.payroll_complete_rows(p_period DATE, p_row_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_row        RECORD;
    v_delta      JSONB;
    v_falls      TEXT;
    v_completed  INTEGER := 0;
    v_unchanged  INTEGER := 0;
    v_found      INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may complete payroll' USING ERRCODE = '42501';
    END IF;
    IF p_period IS NULL OR EXTRACT(DAY FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'A payroll month is its first day, e.g. 2026-09-01';
    END IF;
    IF p_row_ids IS NULL OR cardinality(p_row_ids) = 0 THEN
        RAISE EXCEPTION 'Tick somebody to complete';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    IF payroll_month_closed(p_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(p_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;
    IF is_period_locked(p_period) THEN
        RAISE EXCEPTION 'The accounting period % is locked', to_char(p_period, 'FMMonth YYYY');
    END IF;

    PERFORM set_config('app.payroll_lifecycle', 'complete', true);
    FOR v_row IN
        SELECT mp.id, mp.status::TEXT AS status, mp.source::TEXT AS source, mp.net,
               s.employee_name, d.payroll_source::TEXT AS payroll_source
          FROM hr_monthly_payroll mp
          JOIN hr_staff_costs s ON s.id = mp.staff_id
          LEFT JOIN departments d ON d.id = s.department_id
         WHERE mp.id = ANY (p_row_ids) AND mp.period_month = p_period
         ORDER BY mp.id
           FOR UPDATE OF mp
    LOOP
        v_found := v_found + 1;
        IF v_row.status <> 'draft' THEN
            RAISE EXCEPTION '% is already %', v_row.employee_name, v_row.status USING ERRCODE = '23PAY';
        END IF;
        IF v_row.source = 'commission' OR v_row.payroll_source = 'commission' THEN
            RAISE EXCEPTION '% is paid through the Revenue team — close them on Comm Cal and they complete here',
                v_row.employee_name USING ERRCODE = '23PAY';
        END IF;
        IF v_row.net < 0 THEN
            RAISE EXCEPTION '%''s net pay is below zero — correct the row first', v_row.employee_name USING ERRCODE = '23PAY';
        END IF;

        v_delta := payroll_row_delta('staff', v_row.id);
        IF (v_delta->>'lines')::INT > 0 THEN
            -- A resubmit: amounts only go up.
            SELECT string_agg(payroll_money_label(k), ', ') INTO v_falls
              FROM jsonb_array_elements_text(v_delta->'falls') k;
            IF v_falls IS NOT NULL THEN
                RAISE EXCEPTION '%''s resubmit can only add to what was sent — % went down', v_row.employee_name, v_falls
                    USING ERRCODE = '23PAY';
            END IF;
            IF NOT (v_delta->>'rises')::BOOLEAN THEN
                -- Nothing changed: back to where it stood.
                UPDATE hr_monthly_payroll
                   SET status = payroll_row_settled_status('staff', v_row.id, p_period)::hr_monthly_payroll_status,
                       topup_opened_at = NULL, topup_opened_by = NULL
                 WHERE id = v_row.id;
                v_unchanged := v_unchanged + 1;
                CONTINUE;
            END IF;
        END IF;

        UPDATE hr_monthly_payroll
           SET status = 'completed', completed_at = now(), completed_by = auth.uid()
         WHERE id = v_row.id;
        v_completed := v_completed + 1;
    END LOOP;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    IF v_found <> cardinality(p_row_ids) THEN
        RAISE EXCEPTION 'Somebody ticked is not on % payroll any more — refresh the page', to_char(p_period, 'FMMonth YYYY');
    END IF;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_month', p_period::TEXT, 'complete',
            jsonb_build_object('rows', p_row_ids, 'completed', v_completed, 'unchanged_resubmits', v_unchanged));

    RETURN jsonb_build_object('completed', v_completed, 'unchanged', v_unchanged);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.payroll_uncomplete_rows(p_period DATE, p_row_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_row   RECORD;
    v_found INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may unlock payroll' USING ERRCODE = '42501';
    END IF;
    IF p_row_ids IS NULL OR cardinality(p_row_ids) = 0 THEN
        RAISE EXCEPTION 'Tick somebody to unlock';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    IF payroll_month_closed(p_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(p_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;

    PERFORM set_config('app.payroll_lifecycle', 'unlock', true);
    FOR v_row IN
        SELECT mp.id, mp.status::TEXT AS status, mp.source::TEXT AS source, s.employee_name,
               d.payroll_source::TEXT AS payroll_source
          FROM hr_monthly_payroll mp
          JOIN hr_staff_costs s ON s.id = mp.staff_id
          LEFT JOIN departments d ON d.id = s.department_id
         WHERE mp.id = ANY (p_row_ids) AND mp.period_month = p_period
         ORDER BY mp.id
           FOR UPDATE OF mp
    LOOP
        v_found := v_found + 1;
        IF v_row.status <> 'completed' THEN
            RAISE EXCEPTION '% is %, not completed', v_row.employee_name, v_row.status USING ERRCODE = '23PAY';
        END IF;
        IF v_row.source = 'commission' OR v_row.payroll_source = 'commission' THEN
            RAISE EXCEPTION '% was completed on Comm Cal — reopen them there', v_row.employee_name USING ERRCODE = '23PAY';
        END IF;
        UPDATE hr_monthly_payroll SET status = 'draft', completed_at = NULL, completed_by = NULL
         WHERE id = v_row.id;
    END LOOP;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    IF v_found <> cardinality(p_row_ids) THEN
        RAISE EXCEPTION 'Somebody ticked is not on this month''s payroll any more — refresh the page';
    END IF;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_month', p_period::TEXT, 'unlock', jsonb_build_object('rows', p_row_ids));
    RETURN v_found;
END;
$fn$;


-- ─── 7. Directors: Complete on Director Salary ───────────────────────────────

CREATE OR REPLACE FUNCTION public.director_payroll_write_snapshot(p_period DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    -- The billing snapshot Finance invoices the subsidiaries from — the same
    -- figures the old Submit wrote, without a funding request of its own.
    DELETE FROM director_salary_submissions WHERE period_month = p_period;
    INSERT INTO director_salary_submissions (
        period_month, total_gross, total_payroll_gross, total_payroll_net, total_statutory_er,
        total_invoice, total_saving, director_count, by_company, submitted_by)
    SELECT p_period,
           coalesce(sum(dmp.gross), 0), coalesce(sum(dmp.gross), 0), coalesce(sum(dmp.net), 0),
           coalesce(sum(dmp.epf_er + dmp.socso_er + dmp.eis_er), 0), 0, 0, count(*),
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'company_id', t.company_id, 'company_name', t.company_name,
                        'company_short_code', t.company_short_code,
                        'basic', t.basic, 'kpi', t.kpi, 'allowance', t.allowance,
                        'epf_er', t.epf_er, 'socso_er', t.socso_er, 'eis_er', t.eis_er,
                        'total_ctc', t.total_ctc) ORDER BY t.company_short_code), '[]'::JSONB)
              FROM (SELECT c.id AS company_id, c.name AS company_name, c.short_code AS company_short_code,
                           coalesce(sum(dc.basic), 0)::NUMERIC(15,2) AS basic,
                           coalesce(sum(dc.kpi), 0)::NUMERIC(15,2) AS kpi,
                           coalesce(sum(dc.allowance), 0)::NUMERIC(15,2) AS allowance,
                           coalesce(sum(dc.employer_epf), 0)::NUMERIC(15,2) AS epf_er,
                           coalesce(sum(dc.employer_socso), 0)::NUMERIC(15,2) AS socso_er,
                           coalesce(sum(dc.employer_eis), 0)::NUMERIC(15,2) AS eis_er,
                           coalesce(sum(dc.total_ctc), 0)::NUMERIC(15,2) AS total_ctc
                      FROM companies c JOIN director_ctc dc ON dc.company_id = c.id
                     WHERE dc.period_month = p_period
                     GROUP BY c.id, c.name, c.short_code
                    HAVING coalesce(sum(dc.total_ctc), 0) > 0) t),
           auth.uid()
      FROM director_monthly_payroll dmp
     WHERE dmp.period_month = p_period;
END;
$fn$;
REVOKE ALL ON FUNCTION public.director_payroll_write_snapshot(DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.director_payroll_complete(p_period DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_row       RECORD;
    v_delta     JSONB;
    v_falls     TEXT;
    v_completed INTEGER := 0;
    v_unchanged INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('director_salary'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may complete director salary' USING ERRCODE = '42501';
    END IF;
    IF p_period IS NULL OR EXTRACT(DAY FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'A payroll month is its first day, e.g. 2026-09-01';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    IF payroll_month_closed(p_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(p_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;
    IF is_period_locked(p_period) THEN
        RAISE EXCEPTION 'The accounting period % is locked', to_char(p_period, 'FMMonth YYYY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM director_monthly_payroll WHERE period_month = p_period) THEN
        RAISE EXCEPTION 'Import the InfoTech director payroll for % first', to_char(p_period, 'FMMonth YYYY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM director_ctc WHERE period_month = p_period) THEN
        RAISE EXCEPTION 'Save the Pool Breakdown (Billing) for % first', to_char(p_period, 'FMMonth YYYY');
    END IF;

    PERFORM set_config('app.payroll_lifecycle', 'complete', true);
    FOR v_row IN
        SELECT id, employee_name, net FROM director_monthly_payroll
         WHERE period_month = p_period AND status = 'draft'
         ORDER BY id FOR UPDATE
    LOOP
        IF v_row.net < 0 THEN
            RAISE EXCEPTION '%''s net pay is below zero — correct the InfoTech row first', v_row.employee_name;
        END IF;
        v_delta := payroll_row_delta('directors', v_row.id);
        IF (v_delta->>'lines')::INT > 0 THEN
            SELECT string_agg(payroll_money_label(k), ', ') INTO v_falls
              FROM jsonb_array_elements_text(v_delta->'falls') k;
            IF v_falls IS NOT NULL THEN
                RAISE EXCEPTION '%''s resubmit can only add to what was sent — % went down', v_row.employee_name, v_falls
                    USING ERRCODE = '23PAY';
            END IF;
            IF NOT (v_delta->>'rises')::BOOLEAN THEN
                UPDATE director_monthly_payroll
                   SET status = payroll_row_settled_status('directors', v_row.id, p_period),
                       topup_opened_at = NULL, topup_opened_by = NULL
                 WHERE id = v_row.id;
                v_unchanged := v_unchanged + 1;
                CONTINUE;
            END IF;
        END IF;
        UPDATE director_monthly_payroll
           SET status = 'completed', completed_at = now(), completed_by = auth.uid()
         WHERE id = v_row.id;
        v_completed := v_completed + 1;
    END LOOP;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    IF v_completed = 0 AND v_unchanged = 0 THEN
        RAISE EXCEPTION 'Every director for % is already completed or submitted', to_char(p_period, 'FMMonth YYYY');
    END IF;

    PERFORM director_payroll_write_snapshot(p_period);

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'director_salary_submission', p_period::TEXT, 'complete',
            jsonb_build_object('period', p_period, 'completed', v_completed, 'unchanged_resubmits', v_unchanged));
    RETURN jsonb_build_object('completed', v_completed, 'unchanged', v_unchanged);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.director_payroll_uncomplete(p_period DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_count INTEGER;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('director_salary'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may reopen director salary' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    IF payroll_month_closed(p_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(p_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;

    PERFORM set_config('app.payroll_lifecycle', 'unlock', true);
    UPDATE director_monthly_payroll SET status = 'draft', completed_at = NULL, completed_by = NULL
     WHERE period_month = p_period AND status = 'completed';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No director is waiting to be submitted for % — anybody already sent to Finance is resubmitted from HR › Payroll',
            to_char(p_period, 'FMMonth YYYY');
    END IF;

    -- The billing snapshot goes with them unless somebody is already with Finance.
    IF NOT EXISTS (SELECT 1 FROM director_monthly_payroll
                    WHERE period_month = p_period AND status IN ('submitted', 'paid')) THEN
        DELETE FROM director_salary_submissions WHERE period_month = p_period;
    END IF;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'director_salary_submission', p_period::TEXT, 'uncomplete',
            jsonb_build_object('period', p_period, 'directors', v_count));
    RETURN v_count;
END;
$fn$;


-- ─── 8. Submit to Finance: one batch ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.payroll_submit_batch(p_period DATE, p_expected_people INTEGER, p_expected_total NUMERIC)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_run      payroll_runs%ROWTYPE;
    v_batch_id UUID;
    v_batch_no INTEGER;
    v_people   INTEGER;
    v_topups   INTEGER;
    v_total    NUMERIC(15,2);
    v_problem  TEXT;
    v_rec      RECORD;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may submit payroll to Finance' USING ERRCODE = '42501';
    END IF;
    IF p_period IS NULL OR EXTRACT(DAY FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'A payroll month is its first day, e.g. 2026-09-01';
    END IF;
    -- The lock every Revenue payroll write and every batch takes.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    IF payroll_month_closed(p_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(p_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;
    IF is_period_locked(p_period) THEN
        RAISE EXCEPTION 'The accounting period % is locked', to_char(p_period, 'FMMonth YYYY');
    END IF;

    PERFORM 1 FROM hr_monthly_payroll WHERE period_month = p_period AND status = 'completed' ORDER BY id FOR UPDATE;
    PERFORM 1 FROM director_monthly_payroll WHERE period_month = p_period AND status = 'completed' ORDER BY id FOR UPDATE;

    DROP TABLE IF EXISTS pg_temp.tmp_payroll_batch;
    CREATE TEMP TABLE tmp_payroll_batch ON COMMIT DROP AS
    SELECT 'staff'::TEXT AS scope, mp.id AS row_id, mp.staff_id, NULL::UUID AS director_id,
           s.employee_name, s.employee_code, s.department_id, coalesce(d.name, 'Unassigned') AS department_name,
           payroll_bucket(d.segment_key, d.payroll_source::TEXT, mp.source::TEXT) AS bucket,
           coalesce(d.segment_key, 'unassigned') AS segment_key,
           mp.source::TEXT AS source, mp.commission_synced_amount, mp.basic_pay_net AS row_basic_pay_net,
           mp.commission_balance AS row_commission_balance, mp.net AS row_net,
           payroll_row_delta('staff', mp.id) AS delta, to_jsonb(mp) AS snapshot
      FROM hr_monthly_payroll mp
      JOIN hr_staff_costs s ON s.id = mp.staff_id
      LEFT JOIN departments d ON d.id = s.department_id
     WHERE mp.period_month = p_period AND mp.status = 'completed'
    UNION ALL
    SELECT 'directors', dmp.id, NULL, dmp.director_id, dmp.employee_name, dmp.employee_code,
           (SELECT id FROM departments WHERE segment_key = 'director' LIMIT 1), 'Director', 'director', 'director',
           'director', NULL, NULL, NULL, dmp.net,
           payroll_row_delta('directors', dmp.id), to_jsonb(dmp)
      FROM director_monthly_payroll dmp
     WHERE dmp.period_month = p_period AND dmp.status = 'completed';

    SELECT count(*), count(*) FILTER (WHERE (delta->>'lines')::INT > 0),
           coalesce(sum((delta->>'gross')::NUMERIC + (delta->>'epf_er')::NUMERIC
                      + (delta->>'socso_er')::NUMERIC + (delta->>'eis_er')::NUMERIC), 0)
      INTO v_people, v_topups, v_total
      FROM pg_temp.tmp_payroll_batch;

    IF v_people = 0 THEN
        RAISE EXCEPTION 'Nobody is completed and waiting — tick people and press Complete first';
    END IF;

    SELECT employee_name || ' (' || department_name || ')' INTO v_problem
      FROM pg_temp.tmp_payroll_batch WHERE bucket IS NULL LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% is in a department that has no payroll bucket — move them to a paying department first', v_problem;
    END IF;

    SELECT employee_name INTO v_problem FROM pg_temp.tmp_payroll_batch WHERE row_net < 0 LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '%''s net pay is below zero — unlock and correct the row', v_problem;
    END IF;

    -- A resubmit only ever adds.
    FOR v_rec IN SELECT employee_name, delta FROM pg_temp.tmp_payroll_batch
                  WHERE (delta->>'lines')::INT > 0 AND jsonb_array_length(delta->'falls') > 0 LOOP
        RAISE EXCEPTION '%''s resubmit can only add to what was sent — % went down', v_rec.employee_name,
            (SELECT string_agg(payroll_money_label(k), ', ') FROM jsonb_array_elements_text(v_rec.delta->'falls') k);
    END LOOP;

    -- Revenue: the commission is the one closed on Comm Cal, split cleanly.
    SELECT t.employee_name INTO v_problem
      FROM pg_temp.tmp_payroll_batch t
     WHERE t.scope = 'staff' AND t.source = 'commission'
       AND t.commission_synced_amount IS DISTINCT FROM comm_standing_close_total(t.staff_id, p_period)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '%''s commission no longer matches their close on Comm Cal — close them again there', v_problem;
    END IF;
    SELECT t.employee_name INTO v_problem FROM pg_temp.tmp_payroll_batch t
     WHERE t.scope = 'staff' AND t.source = 'commission' AND t.row_basic_pay_net < 0 LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Revenue net basic for % is negative after employee statutory and PCB. Resolve it before submitting.', v_problem;
    END IF;
    SELECT t.employee_name INTO v_problem FROM pg_temp.tmp_payroll_batch t
     WHERE t.scope = 'staff' AND t.source = 'commission' AND t.row_commission_balance < 0 LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Revenue commission for % cannot fund the selected gross basic and employer statutory contributions. Resolve the negative commission balance before submitting.', v_problem;
    END IF;

    -- What the page showed is what goes.
    IF p_expected_people IS DISTINCT FROM v_people OR abs(coalesce(p_expected_total, -1) - v_total) > 0.005 THEN
        RAISE EXCEPTION 'The page is out of date — % people and RM % are waiting now. Refresh and check again',
            v_people, to_char(v_total, 'FM999,999,990.00');
    END IF;

    -- The month's run: one per month, as ever.
    SELECT * INTO v_run FROM payroll_runs WHERE period_month = p_period AND status <> 'rejected' FOR UPDATE;
    IF NOT FOUND THEN
        INSERT INTO payroll_runs (period_month, status, submitted_by, submitted_at, approved_at)
        VALUES (p_period, 'approved', auth.uid(), now(), now())
        RETURNING * INTO v_run;
    ELSIF v_run.status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'The % payroll run is % — it cannot take a batch', to_char(p_period, 'Mon YYYY'), v_run.status;
    END IF;

    SELECT coalesce(max(batch_no), 0) + 1 INTO v_batch_no FROM payroll_batches WHERE period_month = p_period;

    INSERT INTO payroll_batches (run_id, period_month, batch_no, status, people, topups,
        marketing_total, hr_total, finance_total, director_office_total, it_total, revenue_total, director_total,
        departments, submitted_by, submitted_by_name)
    SELECT v_run.id, p_period, v_batch_no, 'submitted', v_people, v_topups,
           coalesce(sum(ctc) FILTER (WHERE bucket = 'marketing'), 0),
           coalesce(sum(ctc) FILTER (WHERE bucket = 'hr'), 0),
           coalesce(sum(ctc) FILTER (WHERE bucket = 'finance'), 0),
           coalesce(sum(ctc) FILTER (WHERE bucket = 'director_office'), 0),
           coalesce(sum(ctc) FILTER (WHERE bucket = 'it'), 0),
           coalesce(sum(ctc) FILTER (WHERE bucket = 'revenue'), 0),
           coalesce(sum(ctc) FILTER (WHERE bucket = 'director'), 0),
           (SELECT coalesce(jsonb_agg(jsonb_build_object('name', x.department_name, 'people', x.n) ORDER BY x.department_name), '[]'::JSONB)
              FROM (SELECT department_name, count(*) n FROM pg_temp.tmp_payroll_batch GROUP BY 1) x),
           auth.uid(), payroll_actor_name()
      FROM (SELECT bucket, (delta->>'gross')::NUMERIC + (delta->>'epf_er')::NUMERIC
                   + (delta->>'socso_er')::NUMERIC + (delta->>'eis_er')::NUMERIC AS ctc
              FROM pg_temp.tmp_payroll_batch) t
    RETURNING id INTO v_batch_id;

    INSERT INTO payroll_batch_lines (batch_id, period_month, scope, row_id, staff_id, director_id,
        employee_name, employee_code, department_id, department_name, bucket, segment_key, is_topup,
        gross, net, epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, withholding_tax, skbbk,
        non_statutory_allowance, basic_pay_net, commission_balance, split_version, snapshot)
    SELECT v_batch_id, p_period, t.scope, t.row_id, t.staff_id, t.director_id,
           t.employee_name, t.employee_code, t.department_id, t.department_name, t.bucket, t.segment_key,
           (t.delta->>'lines')::INT > 0,
           (t.delta->>'gross')::NUMERIC, (t.delta->>'net')::NUMERIC,
           (t.delta->>'epf_er')::NUMERIC, (t.delta->>'epf_ee')::NUMERIC,
           (t.delta->>'socso_er')::NUMERIC, (t.delta->>'socso_ee')::NUMERIC,
           (t.delta->>'eis_er')::NUMERIC, (t.delta->>'eis_ee')::NUMERIC,
           (t.delta->>'pcb')::NUMERIC, (t.delta->>'withholding_tax')::NUMERIC, (t.delta->>'skbbk')::NUMERIC,
           (t.delta->>'non_statutory_allowance')::NUMERIC,
           (t.delta->>'basic_pay_net')::NUMERIC, (t.delta->>'commission_balance')::NUMERIC,
           (t.delta->>'split_version')::SMALLINT, t.snapshot
      FROM pg_temp.tmp_payroll_batch t;

    -- The month's run carries the sum of its standing batches.
    UPDATE payroll_runs r
       SET marketing_opex_total  = r.marketing_opex_total  + b.marketing_total,
           hr_opex_total         = r.hr_opex_total         + b.hr_total,
           finance_opex_total    = r.finance_opex_total    + b.finance_total,
           director_office_total = r.director_office_total + b.director_office_total,
           it_opex_total         = r.it_opex_total         + b.it_total,
           revenue_opex_total    = r.revenue_opex_total    + b.revenue_total,
           director_salary_total = r.director_salary_total + b.director_total
      FROM payroll_batches b
     WHERE b.id = v_batch_id AND r.id = v_run.id;

    PERFORM set_config('app.payroll_lifecycle', 'submit', true);
    UPDATE hr_monthly_payroll SET status = 'submitted', topup_opened_at = NULL, topup_opened_by = NULL
     WHERE id IN (SELECT row_id FROM pg_temp.tmp_payroll_batch WHERE scope = 'staff');
    UPDATE director_monthly_payroll SET status = 'submitted', topup_opened_at = NULL, topup_opened_by = NULL
     WHERE id IN (SELECT row_id FROM pg_temp.tmp_payroll_batch WHERE scope = 'directors');
    PERFORM set_config('app.payroll_lifecycle', '', true);

    SELECT total_amount INTO v_total FROM payroll_batches WHERE id = v_batch_id;
    IF v_total > 0 THEN
        INSERT INTO payroll_payment_requests (payroll_run_id, batch_id, period_month, requested_by,
                                              amount, target_pool, status)
        VALUES (v_run.id, v_batch_id, p_period, auth.uid(), v_total, 'dept_pool_hr', 'submitted');
    END IF;

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_batch', v_batch_id::TEXT, 'submit_to_finance',
            jsonb_build_object('period', p_period, 'batch_no', v_batch_no, 'people', v_people,
                               'topups', v_topups, 'total', v_total, 'run_id', v_run.id));

    RETURN v_batch_id;
END;
$fn$;


-- ─── 9. Resubmit: unlock for a top-up ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.payroll_open_topup(p_scope TEXT, p_row_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_period DATE;
    v_status TEXT;
    v_name   TEXT;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may resubmit payroll' USING ERRCODE = '42501';
    END IF;
    IF p_scope = 'staff' THEN
        SELECT mp.period_month, mp.status::TEXT, s.employee_name INTO v_period, v_status, v_name
          FROM hr_monthly_payroll mp JOIN hr_staff_costs s ON s.id = mp.staff_id WHERE mp.id = p_row_id;
    ELSIF p_scope = 'directors' THEN
        SELECT period_month, status, employee_name INTO v_period, v_status, v_name
          FROM director_monthly_payroll WHERE id = p_row_id;
    ELSE
        RAISE EXCEPTION 'Resubmit staff or directors';
    END IF;
    IF v_period IS NULL THEN
        RAISE EXCEPTION 'That payroll row no longer exists — refresh the page';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_period::TEXT));
    IF payroll_month_closed(v_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good — nobody can be resubmitted',
            to_char(v_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;
    IF is_period_locked(v_period) THEN
        RAISE EXCEPTION 'The accounting period % is locked', to_char(v_period, 'FMMonth YYYY');
    END IF;
    IF v_status NOT IN ('submitted', 'paid') THEN
        RAISE EXCEPTION '% is %, not submitted — there is nothing to resubmit yet', v_name, v_status USING ERRCODE = '23PAY';
    END IF;
    IF (payroll_row_submitted_money(p_scope, p_row_id)->>'lines')::INT = 0 THEN
        RAISE EXCEPTION '%''s % pay went to Finance before batches existed and cannot be resubmitted here',
            v_name, to_char(v_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;

    PERFORM set_config('app.payroll_lifecycle', 'topup', true);
    IF p_scope = 'staff' THEN
        UPDATE hr_monthly_payroll
           SET status = 'draft', completed_at = NULL, completed_by = NULL,
               topup_opened_at = now(), topup_opened_by = auth.uid()
         WHERE id = p_row_id;
    ELSE
        UPDATE director_monthly_payroll
           SET status = 'draft', completed_at = NULL, completed_by = NULL,
               topup_opened_at = now(), topup_opened_by = auth.uid()
         WHERE id = p_row_id;
    END IF;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_row', p_row_id::TEXT, 'open_topup',
            jsonb_build_object('scope', p_scope, 'period', v_period, 'name', v_name, 'was', v_status));
END;
$fn$;

-- Put an unlocked row back untouched (nothing changed since it was sent).
CREATE OR REPLACE FUNCTION public.payroll_cancel_topup(p_scope TEXT, p_row_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_period DATE;
    v_status TEXT;
    v_name   TEXT;
    v_topup  TIMESTAMPTZ;
    v_delta  JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may change payroll' USING ERRCODE = '42501';
    END IF;
    IF p_scope = 'staff' THEN
        SELECT mp.period_month, mp.status::TEXT, s.employee_name, mp.topup_opened_at INTO v_period, v_status, v_name, v_topup
          FROM hr_monthly_payroll mp JOIN hr_staff_costs s ON s.id = mp.staff_id WHERE mp.id = p_row_id;
    ELSE
        SELECT period_month, status, employee_name, topup_opened_at INTO v_period, v_status, v_name, v_topup
          FROM director_monthly_payroll WHERE id = p_row_id;
    END IF;
    IF v_period IS NULL OR v_topup IS NULL OR v_status NOT IN ('draft', 'completed') THEN
        RAISE EXCEPTION 'That row is not open for a resubmit — refresh the page';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_period::TEXT));
    IF payroll_month_closed(v_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(v_period, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;
    v_delta := payroll_row_delta(p_scope, p_row_id);
    IF (v_delta->>'rises')::BOOLEAN OR jsonb_array_length(v_delta->'falls') > 0 THEN
        RAISE EXCEPTION '% has changed since it was sent — Complete and submit the change, or put the figures back first', v_name
            USING ERRCODE = '23PAY';
    END IF;

    PERFORM set_config('app.payroll_lifecycle', 'topup', true);
    IF p_scope = 'staff' THEN
        UPDATE hr_monthly_payroll
           SET status = payroll_row_settled_status('staff', p_row_id, v_period)::hr_monthly_payroll_status,
               topup_opened_at = NULL, topup_opened_by = NULL
         WHERE id = p_row_id;
    ELSE
        UPDATE director_monthly_payroll
           SET status = payroll_row_settled_status('directors', p_row_id, v_period),
               topup_opened_at = NULL, topup_opened_by = NULL
         WHERE id = p_row_id;
    END IF;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_row', p_row_id::TEXT, 'cancel_topup',
            jsonb_build_object('scope', p_scope, 'period', v_period, 'name', v_name));
END;
$fn$;


-- ─── 10. Finance sends a batch back ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reverse_payroll_accrual_entries(p_reference_ids UUID[], p_user_id UUID, p_why TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_je     RECORD;
    v_lines  JSONB;
    v_new_id UUID;
    v_net    NUMERIC;
    v_count  INTEGER := 0;
BEGIN
    FOR v_je IN
        SELECT id, entry_no, segment, transaction_date
          FROM journal_entries
         WHERE reference_type = 'payroll_accrual'
           AND reference_id = ANY (p_reference_ids)
           AND is_reversed = false
         ORDER BY entry_no
    LOOP
        SELECT jsonb_agg(jsonb_build_object(
                 'account_code', jl.account_code,
                 'debit',  jl.credit,
                 'credit', jl.debit,
                 'description', 'Reversal - ' || coalesce(jl.description, '')) ORDER BY jl.id)
          INTO v_lines
          FROM journal_lines jl
         WHERE jl.entry_id = v_je.id;
        IF v_lines IS NULL THEN
            RAISE EXCEPTION 'Accrual % has no lines', v_je.entry_no;
        END IF;
        v_new_id := post_journal_entry(v_je.transaction_date,
            'Reversal of ' || v_je.entry_no || ' - ' || p_why,
            'payroll_accrual', v_je.id, p_user_id, v_lines, v_je.segment);
        SELECT round(sum(coalesce(debit, 0)) - sum(coalesce(credit, 0)), 2) INTO v_net
          FROM journal_lines WHERE entry_id IN (v_je.id, v_new_id);
        IF v_net IS NULL OR v_net <> 0 THEN
            RAISE EXCEPTION 'Reversal of % does not net to zero (net %)', v_je.entry_no, v_net;
        END IF;
        UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_new_id WHERE id = v_je.id;
        UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_je.id WHERE id = v_new_id;
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$fn$;
REVOKE ALL ON FUNCTION public.reverse_payroll_accrual_entries(UUID[], UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.payroll_send_back_batch(p_batch_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_batch    payroll_batches%ROWTYPE;
    v_blocking TEXT;
    v_reversed INTEGER;
    v_line     RECORD;
    v_standing INTEGER;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('treasury'), false) THEN
        RAISE EXCEPTION 'Only Finance or the Principal may send a payroll batch back to HR' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_batch FROM payroll_batches WHERE id = p_batch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That payroll batch no longer exists — refresh the page';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_batch.period_month::TEXT));
    SELECT * INTO v_batch FROM payroll_batches WHERE id = p_batch_id FOR UPDATE;
    IF v_batch.status <> 'submitted' THEN
        RAISE EXCEPTION 'Batch #% of % was already sent back', v_batch.batch_no, to_char(v_batch.period_month, 'Mon YYYY');
    END IF;
    IF payroll_month_closed(v_batch.period_month) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(v_batch.period_month, 'FMMonth YYYY') USING ERRCODE = '23PAY';
    END IF;

    SELECT string_agg(status::TEXT, ', ') INTO v_blocking FROM payroll_payment_requests
     WHERE batch_id = p_batch_id AND status IN ('pv_generated', 'completed');
    IF v_blocking IS NOT NULL THEN
        RAISE EXCEPTION 'Finance has already raised a funding PV for batch #% — void it first; if it completed, the money has moved',
            v_batch.batch_no;
    END IF;

    -- Every person in it must be where the batch left them, with nothing newer.
    SELECT l.employee_name INTO v_blocking
      FROM payroll_batch_lines l
     WHERE l.batch_id = p_batch_id
       AND (EXISTS (SELECT 1 FROM payroll_batch_lines l2 JOIN payroll_batches b2 ON b2.id = l2.batch_id
                     WHERE b2.status = 'submitted' AND b2.batch_no > v_batch.batch_no
                       AND b2.period_month = v_batch.period_month
                       AND l2.scope = l.scope AND l2.row_id = l.row_id)
            OR (l.scope = 'staff' AND NOT EXISTS (SELECT 1 FROM hr_monthly_payroll mp WHERE mp.id = l.row_id AND mp.status = 'submitted'))
            OR (l.scope = 'directors' AND NOT EXISTS (SELECT 1 FROM director_monthly_payroll d WHERE d.id = l.row_id AND d.status = 'submitted')))
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% has moved on since batch #% (resubmitted or paid) — this batch can no longer be sent back',
            v_blocking, v_batch.batch_no;
    END IF;

    UPDATE payroll_payment_requests
       SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
           cancellation_reason = coalesce('Sent back by Finance: ' || nullif(btrim(p_reason), ''), 'Sent back by Finance')
     WHERE batch_id = p_batch_id AND status = 'submitted';

    UPDATE payroll_batches
       SET status = 'sent_back', sent_back_at = now(), sent_back_by = auth.uid(),
           sent_back_by_name = payroll_actor_name(), sent_back_reason = nullif(btrim(p_reason), '')
     WHERE id = p_batch_id;

    UPDATE payroll_runs r
       SET marketing_opex_total  = r.marketing_opex_total  - v_batch.marketing_total,
           hr_opex_total         = r.hr_opex_total         - v_batch.hr_total,
           finance_opex_total    = r.finance_opex_total    - v_batch.finance_total,
           director_office_total = r.director_office_total - v_batch.director_office_total,
           it_opex_total         = r.it_opex_total         - v_batch.it_total,
           revenue_opex_total    = r.revenue_opex_total    - v_batch.revenue_total,
           director_salary_total = r.director_salary_total - v_batch.director_total
     WHERE r.id = v_batch.run_id;

    SELECT count(*) INTO v_standing FROM payroll_batches WHERE run_id = v_batch.run_id AND status = 'submitted';
    IF v_standing = 0 THEN
        UPDATE payroll_runs
           SET status = 'rejected', rejected_at = now(), rejection_reason = 'Sent back by Finance for HR edits'
         WHERE id = v_batch.run_id;
    END IF;

    -- Its people wait again as Completed (still a top-up if they had an
    -- earlier standing batch); HR unlocks whoever needs a change.
    PERFORM set_config('app.payroll_lifecycle', 'send_back', true);
    FOR v_line IN SELECT scope, row_id, is_topup FROM payroll_batch_lines WHERE batch_id = p_batch_id LOOP
        IF v_line.scope = 'staff' THEN
            UPDATE hr_monthly_payroll
               SET status = 'completed',
                   topup_opened_at = CASE WHEN v_line.is_topup THEN coalesce(topup_opened_at, now()) END
             WHERE id = v_line.row_id;
        ELSE
            UPDATE director_monthly_payroll
               SET status = 'completed',
                   topup_opened_at = CASE WHEN v_line.is_topup THEN coalesce(topup_opened_at, now()) END
             WHERE id = v_line.row_id;
        END IF;
    END LOOP;
    PERFORM set_config('app.payroll_lifecycle', '', true);

    v_reversed := reverse_payroll_accrual_entries(
        ARRAY[p_batch_id] || CASE WHEN v_batch.legacy THEN ARRAY[v_batch.run_id] ELSE '{}'::UUID[] END,
        auth.uid(), 'payroll batch #' || v_batch.batch_no || ' sent back');

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_batch', p_batch_id::TEXT, 'send_back',
            jsonb_build_object('period', v_batch.period_month, 'batch_no', v_batch.batch_no,
                               'total', v_batch.total_amount, 'reason', p_reason, 'accruals_reversed', v_reversed));
END;
$fn$;


-- ─── 11. Total Close, and the Principal's way back ──────────────────────────

CREATE OR REPLACE FUNCTION public.payroll_close_month(p_period DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_open TEXT;
    v_n    INTEGER;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'Only HR or the Principal may close a payroll month' USING ERRCODE = '42501';
    END IF;
    IF p_period IS NULL OR EXTRACT(DAY FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'A payroll month is its first day, e.g. 2026-09-01';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    IF payroll_month_closed(p_period) THEN
        RAISE EXCEPTION 'Payroll for % is already closed', to_char(p_period, 'FMMonth YYYY');
    END IF;

    SELECT count(*) INTO v_n FROM hr_monthly_payroll WHERE period_month = p_period;
    v_n := v_n + (SELECT count(*) FROM director_monthly_payroll WHERE period_month = p_period);
    IF v_n = 0 THEN
        RAISE EXCEPTION 'There is no payroll for % to close', to_char(p_period, 'FMMonth YYYY');
    END IF;

    SELECT string_agg(x.name, ', ' ORDER BY x.name), count(*) INTO v_open, v_n
      FROM (SELECT s.employee_name AS name FROM hr_monthly_payroll mp JOIN hr_staff_costs s ON s.id = mp.staff_id
             WHERE mp.period_month = p_period AND mp.status NOT IN ('submitted', 'paid')
            UNION ALL
            SELECT employee_name FROM director_monthly_payroll
             WHERE period_month = p_period AND status NOT IN ('submitted', 'paid')) x;
    IF v_n > 0 THEN
        RAISE EXCEPTION '% % not been submitted to Finance yet (%). Submit them, or remove who will not be paid, before Total Close',
            v_n, CASE WHEN v_n = 1 THEN 'person has' ELSE 'people have' END, left(v_open, 300);
    END IF;

    INSERT INTO payroll_month_closes (period_month, closed_by, closed_by_name)
    VALUES (p_period, auth.uid(), payroll_actor_name());

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_month', p_period::TEXT, 'total_close', jsonb_build_object('period', p_period));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.payroll_reopen_month(p_period DATE, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_close payroll_month_closes%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR current_user_role() IS DISTINCT FROM 'principal' THEN
        RAISE EXCEPTION 'Only the Principal may reopen a closed payroll month' USING ERRCODE = '42501';
    END IF;
    IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Say why the month is being reopened';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period::TEXT));
    DELETE FROM payroll_month_closes WHERE period_month = p_period RETURNING * INTO v_close;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payroll for % is not closed', to_char(p_period, 'FMMonth YYYY');
    END IF;
    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (auth.uid(), 'payroll_month', p_period::TEXT, 'reopen_month',
            jsonb_build_object('period', p_period, 'reason', btrim(p_reason),
                               'closed_at', v_close.closed_at, 'closed_by', v_close.closed_by_name));
END;
$fn$;


-- ─── 12. What the Payment side pays: submitted, funded, paid ────────────────
-- A row is paid what its batches submitted and FUNDED, minus what vouchers
-- already cover — never the live row, which may be unlocked for a top-up.
-- Directors paid before batches (Director Salary's own funding request) keep
-- their live figure, funded when that request completed.

CREATE OR REPLACE FUNCTION public.payroll_salary_entitlements(p_period DATE)
RETURNS TABLE(scope TEXT, row_id UUID, component TEXT, submitted NUMERIC, funded NUMERIC,
              covered NUMERIC, paid NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    WITH standing AS (
        SELECT l.scope, l.row_id, l.split_version, l.net, l.basic_pay_net, l.commission_balance,
               (b.total_amount <= 0
                OR (b.legacy AND r.status = 'paid')
                OR EXISTS (SELECT 1 FROM payroll_payment_requests q
                            WHERE q.batch_id = b.id AND q.status = 'completed')) AS is_funded
          FROM payroll_batch_lines l
          JOIN payroll_batches b ON b.id = l.batch_id AND b.status = 'submitted'
          JOIN payroll_runs r ON r.id = b.run_id
         WHERE l.period_month = p_period
    ), owed AS (
        SELECT s.scope, s.row_id, c.component, sum(c.amount) AS submitted,
               coalesce(sum(c.amount) FILTER (WHERE s.is_funded), 0) AS funded
          FROM standing s
          CROSS JOIN LATERAL (VALUES
              ('net',        CASE WHEN s.split_version = 2 THEN NULL ELSE s.net END),
              ('basic',      CASE WHEN s.split_version = 2 THEN s.basic_pay_net END),
              ('commission', CASE WHEN s.split_version = 2 THEN s.commission_balance END)) c(component, amount)
         WHERE c.amount IS NOT NULL
         GROUP BY 1, 2, 3
        UNION ALL
        SELECT 'directors', d.id, 'net', d.net,
               CASE WHEN EXISTS (SELECT 1 FROM payroll_payment_requests q
                                  WHERE q.payroll_run_id IS NULL AND q.period_month = p_period
                                    AND q.status = 'completed') THEN d.net ELSE 0 END
          FROM director_monthly_payroll d
         WHERE d.period_month = p_period AND d.status IN ('submitted', 'paid')
           AND NOT EXISTS (SELECT 1 FROM payroll_batch_lines l WHERE l.scope = 'directors' AND l.row_id = d.id)
    ), vouchered AS (
        -- A line covers its own component; a 'net' line (or a legacy voucher
        -- with no lines) covers every component of its row, as it always did.
        SELECT l.scope, l.payroll_row_id AS row_id, l.salary_component AS component, l.net AS amount, pv.status
          FROM payroll_voucher_lines l
          JOIN payment_vouchers pv ON pv.id = l.voucher_id AND pv.status <> 'voided'
         WHERE l.period_month = p_period
        UNION ALL
        SELECT CASE WHEN EXISTS (SELECT 1 FROM hr_monthly_payroll mp WHERE mp.id = pv.reference_id)
                    THEN 'staff' ELSE 'directors' END,
               pv.reference_id, 'net', pv.amount, pv.status
          FROM payment_vouchers pv
         WHERE pv.reference_type = 'payroll_disbursement' AND pv.status <> 'voided'
           AND NOT EXISTS (SELECT 1 FROM payroll_voucher_lines l WHERE l.voucher_id = pv.id)
           AND (EXISTS (SELECT 1 FROM hr_monthly_payroll mp WHERE mp.id = pv.reference_id AND mp.period_month = p_period)
                OR EXISTS (SELECT 1 FROM director_monthly_payroll dp WHERE dp.id = pv.reference_id AND dp.period_month = p_period))
    )
    SELECT o.scope, o.row_id, o.component, round(o.submitted, 2), round(o.funded, 2),
           round(coalesce(CASE WHEN EXISTS (SELECT 1 FROM vouchered v WHERE v.scope = o.scope AND v.row_id = o.row_id
                                                AND v.component = 'net' AND o.component <> 'net')
                               THEN o.submitted END,
                          (SELECT sum(v.amount) FROM vouchered v
                            WHERE v.scope = o.scope AND v.row_id = o.row_id AND v.component = o.component), 0), 2),
           round(coalesce(CASE WHEN EXISTS (SELECT 1 FROM vouchered v WHERE v.scope = o.scope AND v.row_id = o.row_id
                                                AND v.component = 'net' AND o.component <> 'net' AND v.status = 'paid')
                               THEN o.submitted END,
                          (SELECT sum(v.amount) FROM vouchered v
                            WHERE v.scope = o.scope AND v.row_id = o.row_id AND v.component = o.component
                              AND v.status = 'paid'), 0), 2)
      FROM owed o;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_salary_entitlements(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_salary_entitlements(DATE) TO authenticated;

-- What each row is OWED per component: what its batches submitted. (Same
-- signature as before; it read the live row, which a top-up may now unlock.)
CREATE OR REPLACE FUNCTION public.payroll_salary_components(p_period DATE)
RETURNS TABLE(scope TEXT, row_id UUID, component TEXT, amount NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT e.scope, e.row_id, e.component, e.submitted FROM payroll_salary_entitlements(p_period) e;
$fn$;

-- Which voucher covers which component, and for how much of it.
CREATE OR REPLACE FUNCTION public.payroll_salary_coverage(p_period DATE)
RETURNS TABLE(scope TEXT, row_id UUID, component TEXT, amount NUMERIC, voucher_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    SELECT c.scope, c.row_id, c.component,
           coalesce(l.net, pv.amount), pv.id
      FROM payroll_salary_components(p_period) c
      JOIN payment_vouchers pv ON pv.reference_type = 'payroll_disbursement' AND pv.status <> 'voided'
      LEFT JOIN payroll_voucher_lines l ON l.voucher_id = pv.id AND l.payroll_row_id = c.row_id
            AND l.scope = c.scope AND l.salary_component IN ('net', c.component)
     WHERE l.id IS NOT NULL
        OR (pv.reference_id = c.row_id AND NOT EXISTS (SELECT 1 FROM payroll_voucher_lines x WHERE x.voucher_id = pv.id));
$fn$;


-- Salary PVs: pay what is funded and not yet covered.
CREATE OR REPLACE FUNCTION public.create_payroll_disbursement_vouchers(p_period date, p_scope text, p_payment_date date, p_granularity text DEFAULT 'employee'::text, p_department_id uuid DEFAULT NULL::uuid, p_payroll_row_ids uuid[] DEFAULT NULL::uuid[], p_component_selections jsonb DEFAULT NULL::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller         uuid;
    v_group_id       uuid;
    v_payout_bank_id uuid;
    v_voucher_period text;
    v_seq            integer;
    v_voucher_no     text;
    v_voucher_id     uuid;
    v_count          integer := 0;
    v_people         integer := 0;
    v_total          numeric(15, 2) := 0;
    v_selected       integer;
    v_row            record;
    v_dept           record;
    v_label          text;
    v_period_label   text;
BEGIN
    v_caller := auth.uid();
    IF v_caller IS NULL OR NOT coalesce(has_scope(ARRAY['hr']), false) THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: not permitted'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_scope IS NULL OR p_scope NOT IN ('staff', 'directors') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: scope must be staff or directors, got %', p_scope;
    END IF;
    IF p_granularity IS NULL OR p_granularity NOT IN ('employee', 'department') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: granularity must be employee or department, got %', p_granularity;
    END IF;
    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: payment date is required (the day the bank file goes out)';
    END IF;
    IF p_scope = 'directors' AND p_department_id IS NOT NULL THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: directors are one batch — no department filter';
    END IF;
    IF p_period IS NULL OR extract(day FROM p_period) <> 1 THEN
        RAISE EXCEPTION 'Choose a payroll month (the first day of the month).';
    END IF;
    IF p_payroll_row_ids IS NOT NULL THEN
        IF cardinality(p_payroll_row_ids) = 0 THEN
            RAISE EXCEPTION 'Select at least one employee to generate a payment voucher.';
        END IF;
        IF array_ndims(p_payroll_row_ids) <> 1
           OR array_position(p_payroll_row_ids, NULL) IS NOT NULL
           OR cardinality(p_payroll_row_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_payroll_row_ids) AS selected(id)) THEN
            RAISE EXCEPTION 'Invalid employee selection. Select each employee once.';
        END IF;
    END IF;
    IF p_component_selections IS NOT NULL THEN
        IF jsonb_typeof(p_component_selections) <> 'array' OR jsonb_array_length(p_component_selections) = 0 THEN
            RAISE EXCEPTION 'Select at least one salary component.';
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_component_selections) x
            WHERE jsonb_typeof(x) <> 'object' OR coalesce(x->>'component','') NOT IN ('net','basic','commission')
               OR coalesce(x->>'account','') NOT IN ('account_1','account_2')
               OR coalesce(x->>'payroll_row_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
            OR (SELECT count(*) FROM jsonb_array_elements(p_component_selections)) <>
               (SELECT count(DISTINCT ((x->>'payroll_row_id')::uuid, x->>'component')) FROM jsonb_array_elements(p_component_selections) x) THEN
            RAISE EXCEPTION 'Invalid salary component selection. Select each component once.';
        END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));

    -- What is payable: funded by the row's batches (or the legacy director
    -- request) and not yet covered by a voucher. Funding is checked per
    -- person, so a funded batch pays while a later one waits.
    DROP TABLE IF EXISTS pg_temp.tmp_payable;
    CREATE TEMP TABLE tmp_payable ON COMMIT DROP AS
        SELECT e.scope, e.row_id, e.component, round(e.funded - e.covered, 2) AS amount
          FROM payroll_salary_entitlements(p_period) e
         WHERE e.scope = p_scope AND e.funded - e.covered > 0.005;

    DROP TABLE IF EXISTS pg_temp.tmp_pv_rows;
    CREATE TEMP TABLE tmp_pv_rows (
        payroll_id uuid, net numeric(15,2), employee_name text, employee_code text,
        department_id uuid, dept_name text, salary_component text, recipient_account text,
        bank_name text, bank_account_no text, PRIMARY KEY (payroll_id,salary_component)
    ) ON COMMIT DROP;

    IF p_scope = 'staff' THEN
        INSERT INTO pg_temp.tmp_pv_rows
        SELECT mp.id, p.amount, s.employee_name, s.employee_code, s.department_id, coalesce(d.name,'Unassigned'),
            p.component, coalesce(sel.account,'account_1'),
            nullif(trim(CASE WHEN sel.account='account_2' THEN s.bank_name_2 ELSE s.bank_name END),''),
            nullif(regexp_replace(CASE WHEN sel.account='account_2' THEN s.bank_account_no_2 ELSE s.bank_account_no END,'[[:space:]-]','','g'),'')
        FROM pg_temp.tmp_payable p
        JOIN hr_monthly_payroll mp ON mp.id = p.row_id
        JOIN hr_staff_costs s ON s.id=mp.staff_id
        LEFT JOIN departments d ON d.id=s.department_id
        LEFT JOIN LATERAL (SELECT x->>'account' account FROM jsonb_array_elements(p_component_selections) x
            WHERE (x->>'payroll_row_id')::uuid=mp.id AND x->>'component'=p.component) sel ON true
        WHERE mp.period_month=p_period
            AND (p_department_id IS NULL OR s.department_id=p_department_id)
            AND (p_payroll_row_ids IS NULL OR mp.id=ANY(p_payroll_row_ids))
            AND (p_component_selections IS NULL OR sel.account IS NOT NULL)
        ORDER BY mp.id,p.component FOR UPDATE OF mp FOR SHARE OF s;
    ELSE
        INSERT INTO pg_temp.tmp_pv_rows
        SELECT dmp.id,p.amount,dmp.employee_name,dmp.employee_code,NULL,'Directors',p.component,'account_1',NULL,NULL
        FROM pg_temp.tmp_payable p
        JOIN director_monthly_payroll dmp ON dmp.id = p.row_id
        WHERE dmp.period_month=p_period
            AND (p_payroll_row_ids IS NULL OR dmp.id=ANY(p_payroll_row_ids))
            AND (p_component_selections IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_component_selections) x
                WHERE (x->>'payroll_row_id')::uuid=dmp.id AND x->>'component'=p.component AND x->>'account'='account_1'))
        ORDER BY dmp.id FOR UPDATE OF dmp;
    END IF;
    SELECT count(*) INTO v_selected FROM pg_temp.tmp_pv_rows;
    IF p_component_selections IS NOT NULL AND v_selected<>jsonb_array_length(p_component_selections) THEN
        RAISE EXCEPTION 'Salary component selection has changed, is not funded yet, or already has a PV. Refresh and select the remaining payments.';
    END IF;
    IF p_payroll_row_ids IS NOT NULL AND (SELECT count(DISTINCT payroll_id) FROM pg_temp.tmp_pv_rows)<>cardinality(p_payroll_row_ids) THEN
        RAISE EXCEPTION 'Employee selection has changed, is not funded yet, or is outside this payroll group. Refresh the remaining payments.';
    END IF;
    IF v_selected=0 THEN RAISE EXCEPTION 'No funded salary payments remain for this selection — a batch is paid once Finance''s funding PV is approved.'; END IF;
    IF p_component_selections IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_temp.tmp_pv_rows t JOIN jsonb_array_elements(p_component_selections) x
            ON (x->>'payroll_row_id')::uuid=t.payroll_id AND x->>'component'=t.salary_component
        WHERE (x ? 'expected_amount' AND (x->>'expected_amount')::numeric IS DISTINCT FROM t.net)
           OR (x ? 'expected_bank_name' AND x->>'expected_bank_name' IS DISTINCT FROM t.bank_name)
           OR (x ? 'expected_bank_account_no' AND x->>'expected_bank_account_no' IS DISTINCT FROM t.bank_account_no)
    ) THEN RAISE EXCEPTION 'Salary amount or bank details changed after preview. Refresh and review the payment again.'; END IF;
    IF p_scope='staff' AND EXISTS (SELECT 1 FROM pg_temp.tmp_pv_rows WHERE nullif(trim(bank_name),'') IS NULL
        OR trim(bank_name) ~ '^[0-9]+$' OR coalesce(bank_account_no,'') !~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'The selected recipient account is missing or invalid. Update the staff bank details or choose another account.';
    END IF;

    SELECT id INTO v_payout_bank_id FROM bank_accounts WHERE status = 'active' AND gl_account_code = '3010' LIMIT 1;
    IF v_payout_bank_id IS NULL THEN
        SELECT id INTO v_payout_bank_id FROM bank_accounts WHERE status = 'active' AND is_primary = true LIMIT 1;
    END IF;
    IF v_payout_bank_id IS NULL THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: no active payout bank (GL 3010 or primary) found';
    END IF;

    v_group_id := gen_random_uuid();
    v_voucher_period := to_char(now(), 'YYYYMM');
    v_period_label := to_char(p_period, 'Mon YYYY');

    IF p_granularity = 'employee' THEN
        FOR v_row IN SELECT * FROM pg_temp.tmp_pv_rows ORDER BY dept_name, employee_name, salary_component LOOP
            SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
            v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');
            INSERT INTO payment_vouchers (
                voucher_no, voucher_type, direction, status, amount, currency,
                payee_name, description, payment_method, payment_date,
                source_pool, bank_account_id, reference_type, reference_id, created_by
            ) VALUES (
                v_voucher_no, 'other', 'debit', 'pending_approval', v_row.net, 'MYR',
                v_row.employee_name,
                CASE WHEN p_scope = 'directors'
                     THEN 'Director salary ' || v_period_label || ' — ' || v_row.employee_name
                     ELSE 'Payroll ' || v_row.salary_component || ' ' || v_period_label || ' — ' || v_row.employee_name || ' (' || v_row.dept_name || ')' END,
                'bank_transfer', p_payment_date, 'dept_pool_hr', v_payout_bank_id,
                'payroll_disbursement', v_row.payroll_id, v_caller
            ) RETURNING id INTO v_voucher_id;
            INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
            VALUES (v_voucher_id, 'dept_pool_hr', v_row.net, '4070');
            INSERT INTO approval_requests (
                request_type, reference_id, reference_table, submitted_by, description, amount,
                status, workflow_state, group_id
            ) VALUES (
                'payment_voucher', v_voucher_id, 'payment_vouchers', v_caller,
                v_voucher_no || ': ' || v_row.employee_name || ' — RM ' || to_char(v_row.net, 'FM999,999,999.00'),
                v_row.net, 'pending', 'submitted', v_group_id
            );
            INSERT INTO payroll_voucher_lines
                (voucher_id, scope, payroll_row_id, period_month, employee_name, employee_code, department_id, department_name, net, salary_component, recipient_account, bank_name, bank_account_no)
            VALUES
                (v_voucher_id, p_scope, v_row.payroll_id, p_period, v_row.employee_name, v_row.employee_code, v_row.department_id, v_row.dept_name, v_row.net, v_row.salary_component, v_row.recipient_account, v_row.bank_name, v_row.bank_account_no);
            v_count := v_count + 1;
            v_people := v_people + 1;
            v_total := v_total + v_row.net;
        END LOOP;
    ELSE
        FOR v_dept IN
            SELECT department_id, dept_name, salary_component, COUNT(*) AS n, SUM(net) AS total
              FROM pg_temp.tmp_pv_rows
             GROUP BY department_id, dept_name, salary_component
             ORDER BY dept_name, salary_component
        LOOP
            SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
            v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');
            v_label := v_dept.dept_name || ' · ' || v_dept.salary_component || ' · ' || v_dept.n ||
                       CASE WHEN p_scope = 'directors' THEN ' directors' ELSE ' staff' END;
            INSERT INTO payment_vouchers (
                voucher_no, voucher_type, direction, status, amount, currency,
                payee_name, description, payment_method, payment_date,
                source_pool, bank_account_id, reference_type, reference_id, created_by
            ) VALUES (
                v_voucher_no, 'other', 'debit', 'pending_approval', v_dept.total, 'MYR',
                CASE WHEN p_scope = 'directors' THEN 'Directors salary batch' ELSE v_dept.dept_name || ' payroll' END,
                CASE WHEN p_scope = 'directors'
                     THEN 'Director salaries ' || v_period_label || ' — ' || v_label
                     ELSE 'Payroll disbursement ' || v_period_label || ' — ' || v_label END,
                'bank_transfer', p_payment_date, 'dept_pool_hr', v_payout_bank_id,
                'payroll_disbursement', v_dept.department_id, v_caller
            ) RETURNING id INTO v_voucher_id;
            INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
            VALUES (v_voucher_id, 'dept_pool_hr', v_dept.total, '4070');
            INSERT INTO approval_requests (
                request_type, reference_id, reference_table, submitted_by, description, amount,
                status, workflow_state, group_id
            ) VALUES (
                'payment_voucher', v_voucher_id, 'payment_vouchers', v_caller,
                v_voucher_no || ': ' || v_label || ' — RM ' || to_char(v_dept.total, 'FM999,999,999.00'),
                v_dept.total, 'pending', 'submitted', v_group_id
            );
            INSERT INTO payroll_voucher_lines
                (voucher_id, scope, payroll_row_id, period_month, employee_name, employee_code, department_id, department_name, net, salary_component, recipient_account, bank_name, bank_account_no)
            SELECT v_voucher_id, p_scope, t.payroll_id, p_period, t.employee_name, t.employee_code, t.department_id, t.dept_name, t.net, t.salary_component, t.recipient_account, t.bank_name, t.bank_account_no
              FROM pg_temp.tmp_pv_rows t
             WHERE t.salary_component = v_dept.salary_component AND t.dept_name = v_dept.dept_name
               AND t.department_id IS NOT DISTINCT FROM v_dept.department_id;
            v_count := v_count + 1;
            v_people := v_people + v_dept.n;
            v_total := v_total + v_dept.total;
        END LOOP;
    END IF;

    RETURN json_build_object(
        'group_id', v_group_id, 'scope', p_scope, 'granularity', p_granularity,
        'count', v_count, 'people', (SELECT count(DISTINCT payroll_id) FROM pg_temp.tmp_pv_rows), 'total', v_total);
END;
$function$;

-- A row is paid when everything its batches submitted is covered by paid
-- vouchers; directors now move with it too.
CREATE OR REPLACE FUNCTION public.sync_payroll_salary_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE affected record; complete boolean; v_period date;
BEGIN
    IF NEW.reference_type IS DISTINCT FROM 'payroll_disbursement' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NOT pg_try_advisory_xact_lock(hashtext('hv_voucher_no')) THEN
        RAISE EXCEPTION 'Salary payments are being updated; try again.';
    END IF;
    PERFORM set_config('app.payroll_lifecycle', 'payment', true);
    -- The month's entitlements once per month touched, not once per person.
    DROP TABLE IF EXISTS pg_temp.tmp_sync_affected;
    CREATE TEMP TABLE tmp_sync_affected ON COMMIT DROP AS
        SELECT DISTINCT l.scope,l.payroll_row_id row_id,l.period_month FROM payroll_voucher_lines l WHERE l.voucher_id=NEW.id
        UNION SELECT 'staff',mp.id,mp.period_month FROM hr_monthly_payroll mp WHERE mp.id=NEW.reference_id
            AND NOT EXISTS (SELECT 1 FROM payroll_voucher_lines l WHERE l.voucher_id=NEW.id)
        UNION SELECT 'directors',mp.id,mp.period_month FROM director_monthly_payroll mp WHERE mp.id=NEW.reference_id
            AND NOT EXISTS (SELECT 1 FROM payroll_voucher_lines l WHERE l.voucher_id=NEW.id);
    DROP TABLE IF EXISTS pg_temp.tmp_sync_entitlements;
    CREATE TEMP TABLE tmp_sync_entitlements (scope text, row_id uuid, component text, submitted numeric,
        funded numeric, covered numeric, paid numeric) ON COMMIT DROP;
    FOR v_period IN SELECT DISTINCT period_month FROM pg_temp.tmp_sync_affected LOOP
        INSERT INTO pg_temp.tmp_sync_entitlements SELECT * FROM payroll_salary_entitlements(v_period);
    END LOOP;
    FOR affected IN SELECT * FROM pg_temp.tmp_sync_affected
    LOOP
        SELECT EXISTS (SELECT 1 FROM pg_temp.tmp_sync_entitlements e
                        WHERE e.row_id=affected.row_id AND e.scope=affected.scope AND e.submitted>0)
           AND NOT EXISTS (SELECT 1 FROM pg_temp.tmp_sync_entitlements e
                            WHERE e.row_id=affected.row_id AND e.scope=affected.scope AND e.submitted>0
                              AND e.paid + 0.005 < e.submitted)
          INTO complete;
        IF affected.scope='staff' THEN
            IF complete THEN UPDATE hr_monthly_payroll SET status='paid' WHERE id=affected.row_id AND status='submitted';
            ELSE UPDATE hr_monthly_payroll SET status='submitted' WHERE id=affected.row_id AND status='paid'; END IF;
        ELSE
            IF complete THEN UPDATE director_monthly_payroll SET status='paid' WHERE id=affected.row_id AND status='submitted';
            ELSE UPDATE director_monthly_payroll SET status='submitted' WHERE id=affected.row_id AND status='paid'; END IF;
        END IF;
    END LOOP;
    PERFORM set_config('app.payroll_lifecycle', '', true);
    RETURN NEW;
END $function$;

-- A voided salary PV comes back only if its components still have room.
CREATE OR REPLACE FUNCTION public.guard_payroll_salary_voucher()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE recorded numeric;
BEGIN
    SELECT sum(net) INTO recorded FROM payroll_voucher_lines WHERE voucher_id=OLD.id;
    IF recorded IS NULL THEN
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Salary PVs retain their employee payment audit; void the voucher instead.'; END IF;
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
        OR NEW.reference_id IS DISTINCT FROM OLD.reference_id OR NEW.payee_name IS DISTINCT FROM OLD.payee_name
        OR NEW.payee_company_id IS DISTINCT FROM OLD.payee_company_id OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
        OR NEW.source_pool IS DISTINCT FROM OLD.source_pool OR NEW.target_pool IS DISTINCT FROM OLD.target_pool
        OR NEW.voucher_type IS DISTINCT FROM OLD.voucher_type OR NEW.direction IS DISTINCT FROM OLD.direction
        OR NEW.payment_method IS DISTINCT FROM OLD.payment_method OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION 'Salary PV amounts and employee coverage are fixed. Void and regenerate the selected payments.';
    END IF;
    IF NEW.status IN ('approved','paid') AND (NEW.amount IS DISTINCT FROM recorded
        OR NEW.amount IS DISTINCT FROM (SELECT sum(amount) FROM payment_voucher_sources WHERE voucher_id=OLD.id)) THEN
        RAISE EXCEPTION 'Salary payment lines and custody sources must reconcile before approval.';
    END IF;
    IF OLD.status='voided' AND NEW.status<>'voided' THEN
        IF NOT pg_try_advisory_xact_lock(hashtext('hv_voucher_no')) THEN
            RAISE EXCEPTION 'Salary payments are being updated; try again.';
        END IF;
        -- Restoring it must not pay a component past what was submitted.
        IF EXISTS (SELECT 1 FROM payroll_voucher_lines l
            JOIN LATERAL payroll_salary_entitlements(l.period_month) e
                ON e.row_id=l.payroll_row_id AND e.scope=l.scope
               AND (l.salary_component='net' OR e.component=l.salary_component)
            WHERE l.voucher_id=OLD.id AND e.covered + l.net > e.submitted + 0.005) THEN
            RAISE EXCEPTION 'This salary component already has a replacement PV. The voided voucher cannot be restored.';
        END IF;
    END IF;
    RETURN NEW;
END $function$;


-- Statutory: owed per scheme = what the batches submitted; payable = funded
-- minus what statutory vouchers already cover.
CREATE OR REPLACE FUNCTION public.payroll_statutory_entitlements(p_period DATE)
RETURNS TABLE(row_id UUID, scope TEXT, scheme TEXT, submitted NUMERIC, funded NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
    WITH standing AS (
        SELECT l.scope, l.row_id, l.epf_er, l.epf_ee, l.socso_er, l.socso_ee, l.eis_er, l.eis_ee, l.pcb, l.skbbk,
               (b.total_amount <= 0
                OR (b.legacy AND r.status = 'paid')
                OR EXISTS (SELECT 1 FROM payroll_payment_requests q
                            WHERE q.batch_id = b.id AND q.status = 'completed')) AS is_funded
          FROM payroll_batch_lines l
          JOIN payroll_batches b ON b.id = l.batch_id AND b.status = 'submitted'
          JOIN payroll_runs r ON r.id = b.run_id
         WHERE l.period_month = p_period
    )
    SELECT s.row_id, s.scope, x.scheme, sum(x.amount), coalesce(sum(x.amount) FILTER (WHERE s.is_funded), 0)
      FROM standing s
      CROSS JOIN LATERAL (VALUES
          ('KWSP', s.epf_er + s.epf_ee), ('SOCSO', s.socso_er + s.socso_ee),
          ('EIS', s.eis_er + s.eis_ee), ('PCB', s.pcb), ('SKBBK', s.skbbk)) x(scheme, amount)
     GROUP BY 1, 2, 3
    UNION ALL
    SELECT d.id, 'directors', x.scheme, x.amount,
           CASE WHEN EXISTS (SELECT 1 FROM payroll_payment_requests q
                              WHERE q.payroll_run_id IS NULL AND q.period_month = p_period
                                AND q.status = 'completed') THEN x.amount ELSE 0 END
      FROM director_monthly_payroll d
      CROSS JOIN LATERAL (VALUES
          ('KWSP', d.epf_er + d.epf_ee), ('SOCSO', d.socso_er + d.socso_ee),
          ('EIS', d.eis_er + d.eis_ee), ('PCB', d.pcb), ('SKBBK', d.skbbk_amount)) x(scheme, amount)
     WHERE d.period_month = p_period AND d.status IN ('submitted', 'paid')
       AND NOT EXISTS (SELECT 1 FROM payroll_batch_lines l WHERE l.scope = 'directors' AND l.row_id = d.id);
$fn$;

-- Who owes which scheme (same signature): the submitted amounts, for the
-- people who have gone to Finance.
CREATE OR REPLACE FUNCTION public.payroll_statutory_people(p_period date)
 RETURNS TABLE(row_id uuid, scope text, employee_name text, employee_code text, department_id uuid, department_name text, scheme text, amount numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT e.row_id, e.scope, p.employee_name, p.employee_code, p.department_id, p.department_name,
           e.scheme, e.submitted
      FROM payroll_statutory_entitlements(p_period) e
      JOIN (SELECT mp.id AS row_id, 'staff'::text AS scope, h.employee_name, h.employee_code,
                   h.department_id, coalesce(d.name,'Unassigned') AS department_name
              FROM hr_monthly_payroll mp JOIN hr_staff_costs h ON h.id = mp.staff_id
              LEFT JOIN departments d ON d.id = h.department_id
             WHERE mp.period_month = p_period
            UNION ALL
            SELECT dp.id, 'directors', dp.employee_name, dp.employee_code, NULL::uuid, 'Directors'
              FROM director_monthly_payroll dp WHERE dp.period_month = p_period) p
        ON p.row_id = e.row_id AND p.scope = e.scope
$function$;

CREATE OR REPLACE FUNCTION public.create_payroll_statutory_batch(p_period date, p_schemes text[], p_scope text, p_granularity text, p_department_id uuid, p_payroll_row_ids uuid[], p_payment_date date, p_bank_account_id uuid, p_expected_total numeric DEFAULT NULL::numeric, p_expected_count integer DEFAULT NULL::integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller uuid := auth.uid();
    v_run_id uuid; v_bank_id uuid;
    v_group_id uuid := gen_random_uuid(); v_count integer := 0; v_people integer; v_total numeric(15,2) := 0;
    v_group record; v_id uuid; v_no text; v_payee text; v_acct text; v_label text;
    v_vouchers jsonb := '[]'::jsonb;
BEGIN
    IF v_caller IS NULL OR NOT coalesce(has_perm('hr_costing') OR has_perm('treasury'),false) THEN
        RAISE EXCEPTION 'Statutory generation is not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_period IS NULL OR extract(day FROM p_period) <> 1 THEN RAISE EXCEPTION 'Choose a payroll month'; END IF;
    IF p_scope IS NULL OR p_scope NOT IN ('staff','directors','all') OR p_granularity IS NULL OR p_granularity NOT IN ('employee','department','scheme') THEN
        RAISE EXCEPTION 'Choose a valid statutory generation mode';
    END IF;
    IF p_scope <> 'staff' AND p_department_id IS NOT NULL THEN RAISE EXCEPTION 'Department filter is for staff only'; END IF;
    IF p_schemes IS NULL OR cardinality(p_schemes) = 0 OR array_ndims(p_schemes) <> 1
       OR array_position(p_schemes,NULL) IS NOT NULL
       OR EXISTS(SELECT 1 FROM unnest(p_schemes) s WHERE s NOT IN ('KWSP','SOCSO','EIS','PCB','SKBBK'))
       OR cardinality(p_schemes) <> (SELECT count(DISTINCT s) FROM unnest(p_schemes) s) THEN
        RAISE EXCEPTION 'Choose valid contribution schemes';
    END IF;
    IF p_payroll_row_ids IS NOT NULL AND (cardinality(p_payroll_row_ids) = 0 OR array_ndims(p_payroll_row_ids) <> 1
       OR array_position(p_payroll_row_ids,NULL) IS NOT NULL
       OR cardinality(p_payroll_row_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_payroll_row_ids) id)) THEN
        RAISE EXCEPTION 'Select each employee once';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));
    -- The month's run is what statutory PVs hang from (one per month, as ever).
    SELECT id INTO v_run_id FROM payroll_runs
        WHERE period_month = p_period AND status <> 'rejected' FOR UPDATE;

    IF p_scope IN ('staff','all') THEN
        PERFORM mp.id FROM hr_monthly_payroll mp JOIN hr_staff_costs s ON s.id = mp.staff_id
        WHERE mp.period_month = p_period AND (p_department_id IS NULL OR s.department_id = p_department_id)
          AND (p_payroll_row_ids IS NULL OR mp.id = ANY(p_payroll_row_ids))
        ORDER BY mp.id FOR UPDATE OF mp FOR SHARE OF s;
    END IF;
    IF p_scope IN ('directors','all') THEN
        PERFORM d.id FROM director_monthly_payroll d WHERE d.period_month = p_period
          AND (p_payroll_row_ids IS NULL OR d.id = ANY(p_payroll_row_ids)) ORDER BY d.id FOR UPDATE;
    END IF;
    IF EXISTS (SELECT 1 FROM payroll_statutory_entitlements(p_period) e WHERE e.submitted < 0
        AND e.scheme = ANY(p_schemes) AND (p_scope = 'all' OR e.scope = p_scope)
        AND (p_payroll_row_ids IS NULL OR e.row_id = ANY(p_payroll_row_ids))) THEN
        RAISE EXCEPTION 'Negative statutory contributions need payroll review before generating these PVs';
    END IF;

    -- Payable = funded, minus what statutory vouchers already cover.
    DROP TABLE IF EXISTS pg_temp.tmp_statutory_rows;
    CREATE TEMP TABLE tmp_statutory_rows ON COMMIT DROP AS
        WITH cov AS MATERIALIZED (
            SELECT c.scope, c.row_id, c.scheme, sum(c.amount) AS amount
              FROM payroll_statutory_coverage(p_period) c GROUP BY 1, 2, 3
        ), ent AS MATERIALIZED (
            SELECT * FROM payroll_statutory_entitlements(p_period)
        )
        SELECT p.row_id, p.scope, p.employee_name, p.employee_code, p.department_id, p.department_name, p.scheme,
               round(e.funded - coalesce(c.amount, 0), 2) AS amount,
               CASE p_granularity
                   WHEN 'employee' THEN p.scope || ':' || p.row_id::text
                   WHEN 'department' THEN p.scope || ':' || coalesce(p.department_id::text,'unassigned')
                   ELSE 'scheme' END AS batch_key
          FROM payroll_statutory_people(p_period) p
          JOIN ent e ON e.row_id = p.row_id AND e.scope = p.scope AND e.scheme = p.scheme
          LEFT JOIN cov c ON c.row_id = p.row_id AND c.scope = p.scope AND c.scheme = p.scheme
         WHERE p.scheme = ANY(p_schemes) AND (p_scope = 'all' OR p.scope = p_scope)
           AND (p_department_id IS NULL OR p.department_id = p_department_id)
           AND (p_payroll_row_ids IS NULL OR p.row_id = ANY(p_payroll_row_ids));
    DELETE FROM pg_temp.tmp_statutory_rows WHERE amount <= 0.005;

    SELECT count(DISTINCT (scope,row_id)) INTO v_people FROM pg_temp.tmp_statutory_rows;
    IF p_payroll_row_ids IS NOT NULL AND v_people <> cardinality(p_payroll_row_ids) THEN
        RAISE EXCEPTION 'Employee selection has changed, is outside this department, has no funded contributions, or is already covered. Refresh and select remaining employees';
    END IF;
    IF v_people = 0 THEN RAISE EXCEPTION 'No funded, uncovered statutory contributions remain for this selection'; END IF;
    IF v_run_id IS NULL THEN RAISE EXCEPTION 'No payroll run exists for period %', p_period; END IF;
    IF (p_expected_total IS NOT NULL AND p_expected_total IS DISTINCT FROM (SELECT sum(amount) FROM pg_temp.tmp_statutory_rows))
       OR (p_expected_count IS NOT NULL AND p_expected_count IS DISTINCT FROM (SELECT count(DISTINCT (scheme,batch_key)) FROM pg_temp.tmp_statutory_rows)) THEN
        RAISE EXCEPTION 'The contribution amounts or voucher coverage changed. Refresh and review the payment preview again';
    END IF;

    IF p_bank_account_id IS NOT NULL THEN
        SELECT id INTO v_bank_id FROM bank_accounts WHERE id = p_bank_account_id AND status = 'active';
    ELSE
        SELECT id INTO v_bank_id FROM bank_accounts WHERE status = 'active'
          AND (gl_account_code = '3010' OR is_primary = true)
          ORDER BY (gl_account_code = '3010') DESC NULLS LAST, id LIMIT 1;
    END IF;
    IF v_bank_id IS NULL THEN RAISE EXCEPTION 'No active payout bank (Alliance 3010 or primary) found'; END IF;

    FOR v_group IN SELECT scheme, batch_key, sum(amount) AS total,
        sum(CASE WHEN scope = 'staff' THEN amount ELSE 0 END) AS staff,
        sum(CASE WHEN scope = 'directors' THEN amount ELSE 0 END) AS directors,
        min(employee_name) AS employee_name, min(department_name) AS department_name, count(*) AS people
        FROM pg_temp.tmp_statutory_rows GROUP BY scheme,batch_key ORDER BY scheme,batch_key
    LOOP
        SELECT payee,acct INTO v_payee,v_acct FROM (VALUES
            ('KWSP','KWSP','4071'),('SOCSO','PERKESO (SOCSO)','4072'),('EIS','PERKESO (EIS)','4073'),
            ('PCB','LHDN','4074'),('SKBBK','SKBBK','4072')) m(scheme,payee,acct) WHERE m.scheme = v_group.scheme;
        v_label := CASE p_granularity WHEN 'employee' THEN v_group.employee_name || ' (' || v_group.department_name || ')'
            WHEN 'department' THEN v_group.department_name || ' · ' || v_group.people || ' people'
            ELSE CASE WHEN v_group.staff > 0 AND v_group.directors > 0 THEN 'staff + directors'
                      WHEN v_group.directors > 0 THEN 'directors' ELSE 'staff' END END;
        SELECT 'HV-PV-' || to_char(now(),'YYYYMM') || '-' || lpad((count(*) + 1)::text,4,'0') INTO v_no FROM payment_vouchers;
        INSERT INTO payment_vouchers(voucher_no,voucher_type,direction,status,amount,currency,payee_name,description,
            payment_method,payment_date,source_pool,bank_account_id,reference_type,reference_id,created_by)
        VALUES(v_no,'expense','debit','pending_approval',v_group.total,'MYR',v_payee,
            v_group.scheme || ' — ' || to_char(p_period,'Mon YYYY') || ' payroll (' || v_label || ')',
            'bank_transfer',p_payment_date,'dept_pool_hr',v_bank_id,'payroll_statutory',v_run_id,v_caller) RETURNING id INTO v_id;
        IF v_group.staff > 0 THEN
            INSERT INTO payment_voucher_sources(voucher_id,pool,amount,account_code) VALUES(v_id,'dept_pool_hr',v_group.staff,v_acct);
        END IF;
        IF v_group.directors > 0 THEN
            INSERT INTO payment_voucher_sources(voucher_id,pool,amount,account_code) VALUES(v_id,'dept_pool_hr',v_group.directors,v_acct);
        END IF;
        INSERT INTO approval_requests(request_type,reference_id,reference_table,submitted_by,description,amount,status,workflow_state,group_id)
        VALUES('payment_voucher',v_id,'payment_vouchers',v_caller,v_no || ': ' || v_payee || ' — ' || v_label || ' — RM ' || to_char(v_group.total,'FM999,999,999.00'),v_group.total,'pending','submitted',v_group_id);
        INSERT INTO payroll_statutory_voucher_lines(voucher_id,scope,payroll_row_id,period_month,scheme,
            employee_name,employee_code,department_id,department_name,amount)
        SELECT v_id,scope,row_id,p_period,scheme,employee_name,employee_code,department_id,department_name,amount
        FROM pg_temp.tmp_statutory_rows WHERE scheme = v_group.scheme AND batch_key = v_group.batch_key;
        v_count := v_count + 1; v_total := v_total + v_group.total;
        v_vouchers := v_vouchers || jsonb_build_object('id',v_id,'voucher_no',v_no,'payee',v_payee,'amount',v_group.total,'staff',v_group.staff,'directors',v_group.directors);
    END LOOP;
    RETURN json_build_object('group_id',v_group_id,'scope',p_scope,'granularity',p_granularity,
        'count',v_count,'people',v_people,'total',v_total,'vouchers',v_vouchers);
END
$function$;


-- ─── 13. Revenue: a Comm Cal close is the salesperson's Complete ────────────

-- The bills a close pays are released under the month's run, so the month's
-- own calculation (which replays that run) still counts them and next month's
-- does not carry them again.
CREATE OR REPLACE FUNCTION public.comm_month_run_for_releases(p_sub_department_id UUID, p_period DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_run    UUID;
    v_scheme UUID;
    v_batch  UUID;
BEGIN
    SELECT id INTO v_run FROM comm_runs
     WHERE sub_department_id = p_sub_department_id AND period_month = p_period FOR UPDATE;
    IF FOUND THEN
        RETURN v_run;
    END IF;
    SELECT id INTO v_scheme FROM comm_schemes
     WHERE sub_department_id = p_sub_department_id AND is_active
       AND effective_from <= (p_period + INTERVAL '1 month - 1 day')::DATE
       AND (effective_to IS NULL OR effective_to >= p_period)
     ORDER BY effective_from DESC LIMIT 1;
    IF v_scheme IS NULL THEN
        RAISE EXCEPTION 'The sub-department has no commission scheme for %', to_char(p_period, 'FMMonth YYYY');
    END IF;
    SELECT id INTO v_batch FROM sales_import_batches
     WHERE sub_department_id = p_sub_department_id AND period_month = p_period AND status = 'committed'
     LIMIT 1;
    INSERT INTO comm_runs (sub_department_id, period_month, scheme_id, batch_id, status)
    VALUES (p_sub_department_id, p_period, v_scheme, v_batch, 'draft')
    RETURNING id INTO v_run;
    RETURN v_run;
END;
$fn$;
REVOKE ALL ON FUNCTION public.comm_month_run_for_releases(UUID, DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.comm_close_sync_payroll()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_close    comm_salesperson_closes%ROWTYPE := NEW;
    v_row      hr_monthly_payroll%ROWTYPE;
    v_has_row  BOOLEAN;
    v_name     TEXT;
    v_total    NUMERIC(15,2);
    v_standing INTEGER;
    v_run      UUID;
    v_delta    JSONB;
    v_falls    TEXT;
    v_context  TEXT := coalesce(current_setting('app.revenue_commission_write', true), '');
    v_clash    TEXT;
BEGIN
    -- Only a new standing close, or its reopening.
    IF TG_OP = 'UPDATE' AND NOT (OLD.reopened_at IS NULL AND NEW.reopened_at IS NOT NULL) THEN
        RETURN NULL;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || v_close.period_month::TEXT));
    SELECT employee_name INTO v_name FROM hr_staff_costs WHERE id = v_close.staff_id;
    v_name := coalesce(v_name, 'This salesperson');

    IF payroll_month_closed(v_close.period_month) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good — % cannot be % there',
            to_char(v_close.period_month, 'FMMonth YYYY'), v_name,
            CASE WHEN TG_OP = 'INSERT' THEN 'closed' ELSE 'reopened' END USING ERRCODE = '23CLS';
    END IF;

    SELECT * INTO v_row FROM hr_monthly_payroll
     WHERE staff_id = v_close.staff_id AND period_month = v_close.period_month FOR UPDATE;
    v_has_row := FOUND;

    IF v_has_row AND v_row.status IN ('submitted', 'paid') THEN
        RAISE EXCEPTION '%''s % pay is already with Finance. Resubmit them on HR › Payroll first, then % them here',
            v_name, to_char(v_close.period_month, 'FMMonth YYYY'),
            CASE WHEN TG_OP = 'INSERT' THEN 'close' ELSE 'reopen' END USING ERRCODE = '23CLS';
    END IF;
    IF v_has_row AND v_row.source = 'imported' THEN
        RAISE EXCEPTION '%''s % payroll was imported from InfoTech — resolve that row on HR › Payroll before closing them here',
            v_name, to_char(v_close.period_month, 'FMMonth YYYY') USING ERRCODE = '23CLS';
    END IF;

    -- The bills this close pays.
    IF TG_OP = 'INSERT' THEN
        IF jsonb_array_length(v_close.released_orders) > 0 THEN
            SELECT r.order_no INTO v_clash
              FROM jsonb_array_elements(v_close.released_orders) o
              JOIN comm_order_releases r ON r.order_no = o->>'order_no'
               AND r.sub_department_id = v_close.sub_department_id
             LIMIT 1;
            IF v_clash IS NOT NULL THEN
                RAISE EXCEPTION 'Bill % was already paid in an earlier month — refresh Comm Cal and close % again',
                    v_clash, v_name USING ERRCODE = '23CLS';
            END IF;
            v_run := comm_month_run_for_releases(v_close.sub_department_id, v_close.period_month);
            INSERT INTO comm_order_releases (sub_department_id, order_no, run_id, staff_id, period_month,
                                             order_period_month, product_revenue)
            SELECT v_close.sub_department_id, o->>'order_no', v_run, (o->>'staff_id')::UUID,
                   v_close.period_month, (o->>'order_period_month')::DATE,
                   coalesce((o->>'product_revenue')::NUMERIC, 0)
              FROM jsonb_array_elements(v_close.released_orders) o;
        END IF;
    ELSE
        DELETE FROM comm_order_releases r
         USING jsonb_array_elements(OLD.released_orders) o
         WHERE r.sub_department_id = OLD.sub_department_id
           AND r.order_no = o->>'order_no'
           AND r.period_month = OLD.period_month
           AND r.staff_id = (o->>'staff_id')::UUID;
    END IF;

    v_total := comm_standing_close_total(v_close.staff_id, v_close.period_month);
    SELECT count(*) INTO v_standing FROM comm_salesperson_closes
     WHERE staff_id = v_close.staff_id AND period_month = v_close.period_month AND reopened_at IS NULL;

    PERFORM set_config('app.payroll_lifecycle', 'revenue_close', true);
    IF NOT v_has_row THEN
        IF TG_OP = 'UPDATE' THEN
            PERFORM set_config('app.payroll_lifecycle', '', true);
            RETURN NULL;
        END IF;
        PERFORM set_config('app.revenue_commission_write', 'sync', true);
        INSERT INTO hr_monthly_payroll (staff_id, period_month, basic_salary, commission_synced_amount,
                                        source, status, created_by)
        SELECT v_close.staff_id, v_close.period_month, s.basic_salary, v_total, 'commission', 'draft', auth.uid()
          FROM hr_staff_costs s WHERE s.id = v_close.staff_id
        RETURNING * INTO v_row;
        PERFORM set_config('app.revenue_commission_write', v_context, true);
    ELSE
        -- The commission moves only on a draft row.
        IF v_row.status = 'completed' THEN
            UPDATE hr_monthly_payroll SET status = 'draft', completed_at = NULL, completed_by = NULL
             WHERE id = v_row.id;
        END IF;
        IF v_row.commission_synced_amount IS DISTINCT FROM v_total OR v_row.source <> 'commission' THEN
            PERFORM set_config('app.revenue_commission_write', 'sync', true);
            UPDATE hr_monthly_payroll
               SET commission_synced_amount = v_total, source = 'commission'
             WHERE id = v_row.id;
            PERFORM set_config('app.revenue_commission_write', v_context, true);
        END IF;
    END IF;

    -- A new close completes the person; a reopen leaves them a draft.
    IF TG_OP = 'INSERT' AND v_standing > 0 THEN
        v_delta := payroll_row_delta('staff', v_row.id);
        IF (v_delta->>'lines')::INT > 0 THEN
            SELECT string_agg(payroll_money_label(k), ', ') INTO v_falls
              FROM jsonb_array_elements_text(v_delta->'falls') k;
            IF v_falls IS NOT NULL THEN
                RAISE EXCEPTION '%''s resubmit can only add to what was sent — % went down', v_name, v_falls
                    USING ERRCODE = '23CLS';
            END IF;
            IF NOT (v_delta->>'rises')::BOOLEAN THEN
                UPDATE hr_monthly_payroll
                   SET status = payroll_row_settled_status('staff', v_row.id, v_close.period_month)::hr_monthly_payroll_status,
                       topup_opened_at = NULL, topup_opened_by = NULL
                 WHERE id = v_row.id;
                PERFORM set_config('app.payroll_lifecycle', '', true);
                RETURN NULL;
            END IF;
        END IF;
        UPDATE hr_monthly_payroll
           SET status = 'completed', completed_at = v_close.closed_at, completed_by = v_close.closed_by
         WHERE id = v_row.id;
    END IF;
    PERFORM set_config('app.payroll_lifecycle', '', true);
    RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS comm_salesperson_closes_payroll ON public.comm_salesperson_closes;
CREATE TRIGGER comm_salesperson_closes_payroll
    AFTER INSERT OR UPDATE OF reopened_at ON public.comm_salesperson_closes
    FOR EACH ROW EXECUTE FUNCTION public.comm_close_sync_payroll();

COMMENT ON FUNCTION public.comm_close_sync_payroll() IS
    'Unified Payroll (2026-09-27): a salesperson closed on Comm Cal is Completed on HR › Payroll with the close''s commission (summed across sub-departments), and the bills it pays are released under the month''s run; a reopen sets them back to draft and un-releases. Refused while their pay is with Finance (Resubmit it first) or the month is Total Closed.';


-- ─── 14. The guards that assumed a month moved as one ───────────────────────

-- Revenue writes: the month is open unless it is closed for good or its
-- accounting period is locked. Whether ONE person's pay can still change is
-- their row's own status now (draft / completed / submitted).
CREATE OR REPLACE FUNCTION public.assert_commission_payroll_open(p_period date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF current_user_role() IS NULL OR current_user_role() NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may change Revenue payroll' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM period_locks WHERE period_month = p_period AND is_locked) THEN
        RAISE EXCEPTION 'Period % is closed. Reopen the accounting period before changing commission', to_char(p_period, 'Mon YYYY');
    END IF;
    IF payroll_month_closed(p_period) THEN
        RAISE EXCEPTION 'Payroll for % is closed for good', to_char(p_period, 'FMMonth YYYY');
    END IF;
END;
$function$;

-- The payroll compute trigger, as live (pay lines included), with the insert
-- guard moved from "any row of the month submitted" to "the month closed".
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
        PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || NEW.period_month::text));
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'New Revenue payroll must start as a draft';
        END IF;
        IF EXISTS (SELECT 1 FROM period_locks WHERE period_month = NEW.period_month AND is_locked) THEN
            RAISE EXCEPTION 'Revenue payroll accounting period % is locked', NEW.period_month;
        END IF;
        IF payroll_month_closed(NEW.period_month) THEN
            RAISE EXCEPTION 'Payroll for % is closed for good', to_char(NEW.period_month, 'FMMonth YYYY');
        END IF;
    END IF;

    SELECT * INTO v_staff FROM hr_staff_costs WHERE id = NEW.staff_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'hr_monthly_payroll: staff_id % not found in hr_staff_costs', NEW.staff_id;
    END IF;

    IF NEW.source = 'commission' THEN
        SELECT t.earnings, t.deductions INTO NEW.pay_line_earnings, NEW.pay_line_deductions
          FROM revenue_pay_line_totals(NEW.staff_id, NEW.period_month) t;
    ELSE
        NEW.pay_line_earnings := 0;
        NEW.pay_line_deductions := 0;
    END IF;

    v_period_start := NEW.period_month;
    v_period_end   := (NEW.period_month + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_days_in_month := EXTRACT(DAY FROM v_period_end)::INTEGER;

    v_effective_start := GREATEST(COALESCE(v_staff.hire_date, v_period_start), v_period_start);
    v_effective_end   := LEAST(COALESCE(v_staff.resignation_date, v_period_end), v_period_end);

    IF v_effective_start > v_effective_end THEN
        v_days_worked := 0;
    ELSE
        v_days_worked := (v_effective_end - v_effective_start + 1);
    END IF;

    v_days_worked := GREATEST(v_days_worked - COALESCE(NEW.unpaid_leave_days, 0)::INTEGER, 0);

    IF v_days_in_month = 0 THEN
        v_prorata_ratio := 0;
    ELSE
        v_prorata_ratio := v_days_worked::NUMERIC / v_days_in_month::NUMERIC;
    END IF;

    NEW.prorata_days_worked   := v_days_worked;
    NEW.prorata_days_in_month := v_days_in_month;

    v_prorated_basic := NEW.basic_salary * v_prorata_ratio;
    v_prorated_stat  := NEW.statutory_allowance * v_prorata_ratio;
    v_prorated_ot    := NEW.ot_amount * v_prorata_ratio;

    v_statutory_wages := GREATEST(
        v_prorated_basic + v_prorated_stat - COALESCE(NEW.deduction_amount, 0),
        0
    );

    IF v_statutory_wages <= 0 THEN
        NEW.epf_er := 0; NEW.epf_ee := 0;
        NEW.socso_er := 0; NEW.socso_ee := 0;
        NEW.eis_er := 0; NEW.eis_ee := 0;
    ELSE
        IF v_staff.is_epf_exempt THEN
            NEW.epf_er := 0;
            NEW.epf_ee := 0;
        ELSE
            SELECT employer, employee INTO NEW.epf_er, NEW.epf_ee
            FROM lookup_epf(v_statutory_wages, v_staff.epf_category);
            NEW.epf_er := COALESCE(NEW.epf_er, 0);
            NEW.epf_ee := COALESCE(NEW.epf_ee, 0);
        END IF;

        SELECT employer, employee INTO NEW.socso_er, NEW.socso_ee
        FROM lookup_socso(v_statutory_wages, v_staff.socso_category);
        NEW.socso_er := COALESCE(NEW.socso_er, 0);
        NEW.socso_ee := COALESCE(NEW.socso_ee, 0);

        SELECT employer, employee INTO NEW.eis_er, NEW.eis_ee
        FROM lookup_eis(v_statutory_wages);
        NEW.eis_er := COALESCE(NEW.eis_er, 0);
        NEW.eis_ee := COALESCE(NEW.eis_ee, 0);
    END IF;

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

    IF NEW.source = 'commission' THEN
        v_taxable_income := GREATEST(ROUND(NEW.basic_salary * v_prorata_ratio, 2) - NEW.epf_ee, 0);
    ELSE
        v_taxable_income := v_gross - NEW.epf_ee;
    END IF;

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

-- A commission run may still be applied (the old month path), but only into
-- rows that are drafts; the month's run being "approved" is no longer a lock.
-- (Body as live, with the payroll_runs check dropped.)
DO $apply$
DECLARE v_src TEXT;
BEGIN
    SELECT pg_get_functiondef('public.apply_commission_run(uuid)'::regprocedure) INTO v_src;
    v_src := replace(v_src, E'\r', '');
    v_src := replace(v_src,
$old$    SELECT status::TEXT INTO v_payroll_run
      FROM payroll_runs
     WHERE period_month = v_run.period_month
       AND status IN ('submitted', 'approved', 'paid')
     ORDER BY CASE status WHEN 'paid' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END
     LIMIT 1;
    IF v_payroll_run IS NOT NULL THEN
        RAISE EXCEPTION 'The % payroll run is % — reopen it before changing commission',
            to_char(v_run.period_month, 'Mon YYYY'), v_payroll_run;
    END IF;$old$,
$new$    -- Unified Payroll (2026-09-27): a month takes batches; only the rows
    -- themselves (checked next) decide whether commission can still move.
    v_payroll_run := NULL;$new$);
    IF position('v_payroll_run := NULL;' IN v_src) = 0 THEN
        RAISE EXCEPTION 'apply_commission_run body changed — update 20260927061000 before applying';
    END IF;
    EXECUTE v_src;
END
$apply$;

-- The whole-month send is retired (user 2026-09-27): a salesperson goes to
-- payroll when they are closed on Comm Cal.
CREATE OR REPLACE FUNCTION public.send_commission_to_payroll(p_period_month date, p_sub_department_id uuid, p_scheme_id uuid, p_batch_id uuid, p_total_commission numeric, p_warnings jsonb, p_statements jsonb, p_released_orders jsonb, p_deferred_orders jsonb, p_penalised_orders jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    RAISE EXCEPTION 'Revenue goes to payroll one salesperson at a time now: close each person on Comm Cal and they complete on HR › Payroll'
        USING ERRCODE = '23PAY';
END;
$function$;

-- The old whole-month submit and the Director page's own submit are retired.
CREATE OR REPLACE FUNCTION public.submit_payroll_to_principal(p_period date, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RAISE EXCEPTION 'Payroll goes to Finance in batches now: Complete people on HR › Payroll, then Submit to Finance'
        USING ERRCODE = '23PAY';
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_director_salary_to_finance(p_period date, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RAISE EXCEPTION 'Directors are Completed on Director Salary and go to Finance with HR › Payroll''s Submit to Finance'
        USING ERRCODE = '23PAY';
END;
$function$;

-- Finance's old "send the month back": every batch of the month still waiting
-- on Finance goes back, newest first.
CREATE OR REPLACE FUNCTION public.reopen_payroll_run(p_period date, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_batch RECORD;
    v_run   UUID;
    v_n     INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'reopen_payroll_run: the caller must be the user named' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_run FROM payroll_runs WHERE period_month = p_period AND status <> 'rejected';
    FOR v_batch IN SELECT id FROM payroll_batches
                    WHERE period_month = p_period AND status = 'submitted'
                    ORDER BY batch_no DESC LOOP
        PERFORM payroll_send_back_batch(v_batch.id, 'Sent back by Finance for HR edits');
        v_n := v_n + 1;
    END LOOP;
    IF v_n = 0 THEN
        RAISE EXCEPTION 'reopen_payroll_run: nothing of % is with Finance', p_period;
    END IF;
    RETURN v_run;
END;
$function$;

-- A funding request of a batch asks for exactly that batch.
CREATE OR REPLACE FUNCTION public.validate_payroll_payment_request_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_run_status payroll_run_status;
    v_run_total  DECIMAL(15, 2);
    v_dir_total  DECIMAL(15, 2);
    v_batch      payroll_batches%ROWTYPE;
BEGIN
    IF NEW.batch_id IS NOT NULL THEN
        SELECT * INTO v_batch FROM payroll_batches WHERE id = NEW.batch_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'payroll_payment_request: batch % not found', NEW.batch_id;
        END IF;
        IF v_batch.status <> 'submitted' THEN
            RAISE EXCEPTION 'payroll_payment_request: batch #% was sent back — submit the people again', v_batch.batch_no;
        END IF;
        IF NEW.payroll_run_id IS DISTINCT FROM v_batch.run_id THEN
            RAISE EXCEPTION 'payroll_payment_request: batch and run do not match';
        END IF;
        IF NEW.amount <> v_batch.total_amount THEN
            RAISE EXCEPTION 'payroll_payment_request: amount % must match batch #% total %',
                NEW.amount, v_batch.batch_no, v_batch.total_amount;
        END IF;
        NEW.period_month := v_batch.period_month;
        RETURN NEW;
    END IF;

    IF NEW.payroll_run_id IS NOT NULL THEN
        SELECT status, total_amount INTO v_run_status, v_run_total
          FROM payroll_runs WHERE id = NEW.payroll_run_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'payroll_payment_request: payroll_run % not found', NEW.payroll_run_id;
        END IF;
        IF EXISTS (SELECT 1 FROM payroll_batches WHERE run_id = NEW.payroll_run_id) THEN
            RAISE EXCEPTION 'payroll_payment_request: this month is paid in batches — request funding for a batch';
        END IF;
        IF v_run_status <> 'approved' THEN
            RAISE EXCEPTION 'payroll_payment_request: payroll_run % status is %, must be approved',
                NEW.payroll_run_id, v_run_status;
        END IF;
        IF NEW.amount <> v_run_total THEN
            RAISE EXCEPTION 'payroll_payment_request: amount % must match payroll_run total %',
                NEW.amount, v_run_total;
        END IF;
    ELSE
        IF NEW.period_month IS NULL THEN
            RAISE EXCEPTION 'payroll_payment_request: period_month is required when payroll_run_id is NULL';
        END IF;
        IF NEW.target_pool <> 'dept_pool_hr' THEN
            RAISE EXCEPTION 'payroll_payment_request: run-less requests are director salary fundings — target_pool must be dept_pool_hr (custody), got %',
                NEW.target_pool;
        END IF;
        IF EXISTS (SELECT 1 FROM director_monthly_payroll d JOIN payroll_batch_lines l
                     ON l.scope = 'directors' AND l.row_id = d.id WHERE d.period_month = NEW.period_month) THEN
            RAISE EXCEPTION 'payroll_payment_request: directors of % go to Finance in payroll batches', NEW.period_month;
        END IF;
        SELECT total_gross + total_statutory_er INTO v_dir_total
          FROM director_salary_submissions WHERE period_month = NEW.period_month;
        IF v_dir_total IS NULL THEN
            RAISE EXCEPTION 'payroll_payment_request: no director salary submission for % — submit it first', NEW.period_month;
        END IF;
        IF NEW.amount <> v_dir_total THEN
            RAISE EXCEPTION 'payroll_payment_request: amount % must match the director submission employer cost %',
                NEW.amount, v_dir_total;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

-- Finance's breakdown of a request by department pool: a batch's own lines.
CREATE OR REPLACE FUNCTION public.get_payroll_breakdown_by_pool(p_request_id uuid)
 RETURNS TABLE(pool_key text, dept_name text, required_amount numeric, pool_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_period DATE;
    v_run_id UUID;
    v_amount DECIMAL(15, 2);
    v_batch  payroll_batches%ROWTYPE;
BEGIN
    SELECT COALESCE(pr.period_month, ppr.period_month), ppr.payroll_run_id, ppr.amount
      INTO v_period, v_run_id, v_amount
      FROM payroll_payment_requests ppr
      LEFT JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id
     WHERE ppr.id = p_request_id;
    IF v_period IS NULL THEN
        RAISE EXCEPTION 'get_payroll_breakdown_by_pool: request % not found or has no period', p_request_id;
    END IF;

    SELECT b.* INTO v_batch FROM payroll_batches b
      JOIN payroll_payment_requests q ON q.batch_id = b.id WHERE q.id = p_request_id;

    IF FOUND AND NOT v_batch.legacy THEN
        RETURN QUERY
        SELECT CASE WHEN l.bucket = 'director' THEN 'dept_pool_director'
                    ELSE 'dept_pool_' || coalesce(d.segment_key, l.segment_key) END::TEXT,
               CASE WHEN l.bucket = 'director' THEN 'Director' ELSE coalesce(d.name, l.department_name) END::TEXT,
               sum(l.ctc)::DECIMAL(15, 2),
               coalesce((SELECT dpb.balance FROM dept_pool_balances dpb
                          WHERE dpb.department_id = CASE WHEN l.bucket = 'director'
                                THEN (SELECT id FROM departments WHERE segment_key = 'director' LIMIT 1)
                                ELSE l.department_id END), 0)::DECIMAL(15, 2)
          FROM payroll_batch_lines l
          LEFT JOIN departments d ON d.id = l.department_id
         WHERE l.batch_id = v_batch.id
         GROUP BY 1, 2, l.bucket, l.department_id
        HAVING sum(l.ctc) <> 0
         ORDER BY 2;
        RETURN;
    END IF;

    IF v_run_id IS NULL THEN
        RETURN QUERY
        SELECT 'dept_pool_director'::TEXT, 'Director'::TEXT, v_amount,
               COALESCE((SELECT dpb.balance FROM dept_pool_balances dpb
                          JOIN departments d ON d.id = dpb.department_id WHERE d.name = 'Director'), 0)::DECIMAL(15, 2);
        RETURN;
    END IF;

    RETURN QUERY
    WITH hr_payroll_totals AS (
        SELECT d.segment_key AS seg, d.name AS d_name, d.id AS d_id,
               COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)::DECIMAL(15, 2) AS total
          FROM departments d
          LEFT JOIN hr_staff_costs hsc ON hsc.department_id = d.id
          LEFT JOIN hr_monthly_payroll hmp ON hmp.staff_id = hsc.id AND hmp.period_month = v_period
         WHERE d.segment_key IS NOT NULL AND d.is_internal = false AND d.segment_key <> 'director'
         GROUP BY d.id, d.name, d.segment_key
    )
    SELECT ('dept_pool_' || hpt.seg)::TEXT, hpt.d_name, hpt.total,
           COALESCE((SELECT balance FROM dept_pool_balances WHERE department_id = hpt.d_id), 0)::DECIMAL(15, 2)
      FROM hr_payroll_totals hpt
     WHERE hpt.total > 0 OR hpt.seg IN ('hr', 'finance', 'director_office', 'marketing')
     ORDER BY CASE hpt.seg WHEN 'hr' THEN 1 WHEN 'finance' THEN 2 WHEN 'director_office' THEN 3
                           WHEN 'marketing' THEN 4 ELSE 5 END, hpt.d_name;
END;
$function$;


-- ─── 15. What HR › Payroll reads about the month ────────────────────────────
-- HR reads only the runs and requests it filed itself (RLS), so the page asks
-- here: the close, every batch, and where each batch's funding stands.

CREATE OR REPLACE FUNCTION public.payroll_month_status(p_period DATE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF auth.uid() IS NULL OR NOT (coalesce(has_perm('hr_costing'), false) OR coalesce(has_perm('director_salary'), false)) THEN
        RAISE EXCEPTION 'payroll_month_status: not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'period', p_period,
        'closed', (SELECT jsonb_build_object('at', c.closed_at, 'by', c.closed_by_name)
                     FROM payroll_month_closes c WHERE c.period_month = p_period),
        'batches', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'no', b.batch_no, 'status', b.status, 'legacy', b.legacy,
                'submitted_at', b.submitted_at, 'submitted_by', b.submitted_by_name,
                'people', b.people, 'topups', b.topups, 'total', b.total_amount,
                'departments', b.departments,
                'sent_back_at', b.sent_back_at, 'sent_back_by', b.sent_back_by_name,
                'sent_back_reason', b.sent_back_reason,
                'request', (SELECT jsonb_build_object(
                                'id', q.id, 'status', q.status, 'amount', q.amount,
                                'requested_at', q.requested_at, 'cancelled_at', q.cancelled_at,
                                'cancellation_reason', q.cancellation_reason,
                                'paid_amount', (SELECT coalesce(sum(pv.amount), 0) FROM payment_vouchers pv
                                                 WHERE pv.reference_type = 'payroll_payment_request'
                                                   AND pv.reference_id = q.id AND pv.status = 'paid'),
                                'pv_count', (SELECT count(*) FROM payment_vouchers pv
                                              WHERE pv.reference_type = 'payroll_payment_request'
                                                AND pv.reference_id = q.id AND pv.status <> 'voided'))
                              FROM payroll_payment_requests q
                             WHERE q.batch_id = b.id
                             ORDER BY (q.status IN ('submitted', 'pv_generated', 'completed')) DESC, q.created_at DESC
                             LIMIT 1))
                ORDER BY b.batch_no)
              FROM payroll_batches b WHERE b.period_month = p_period), '[]'::JSONB),
        -- Directors of a month before batches were funded on their own.
        'director_legacy_request', (
            SELECT jsonb_build_object('status', q.status, 'amount', q.amount, 'requested_at', q.requested_at)
              FROM payroll_payment_requests q
             WHERE q.payroll_run_id IS NULL AND q.period_month = p_period
               AND q.status IN ('submitted', 'pv_generated', 'completed')
             ORDER BY q.requested_at DESC LIMIT 1),
        'director_submission', (
            SELECT jsonb_build_object('submitted_at', s.submitted_at) FROM director_salary_submissions s
             WHERE s.period_month = p_period));
END;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_month_status(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_month_status(DATE) TO authenticated;

-- A batch's lines summed per accrual segment, for its accrual JVs.
CREATE OR REPLACE FUNCTION public.payroll_batch_accrual_sums(p_batch_id UUID)
RETURNS TABLE(segment TEXT, gross NUMERIC, non_statutory_allowance NUMERIC, epf_er NUMERIC, epf_ee NUMERIC,
              socso_er NUMERIC, socso_ee NUMERIC, eis_er NUMERIC, eis_ee NUMERIC, pcb NUMERIC,
              withholding_tax NUMERIC, net NUMERIC, skbbk NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN
        RAISE EXCEPTION 'payroll_batch_accrual_sums: not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT CASE WHEN l.bucket = 'director' THEN 'director' ELSE l.segment_key END,
           sum(l.gross), sum(l.non_statutory_allowance), sum(l.epf_er), sum(l.epf_ee),
           sum(l.socso_er), sum(l.socso_ee), sum(l.eis_er), sum(l.eis_ee), sum(l.pcb),
           sum(l.withholding_tax), sum(l.net), sum(l.skbbk)
      FROM payroll_batch_lines l
     WHERE l.batch_id = p_batch_id
     GROUP BY 1;
END;
$fn$;
REVOKE ALL ON FUNCTION public.payroll_batch_accrual_sums(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_batch_accrual_sums(UUID) TO authenticated;

-- Accrual JVs already posted for one reference (a batch), per segment.
CREATE OR REPLACE FUNCTION public.get_payroll_accrual_totals_for(p_reference_id UUID)
RETURNS TABLE(segment TEXT, total_amount NUMERIC)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    IF current_user_role() NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'get_payroll_accrual_totals_for: unauthorized' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT je.segment::TEXT, je.total_amount
      FROM journal_entries je
     WHERE je.reference_type = 'payroll_accrual' AND je.reference_id = p_reference_id AND je.is_reversed = false;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_payroll_accrual_totals_for(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_accrual_totals_for(UUID) TO authenticated;


-- ─── 16. HR › Payment reads what was submitted ──────────────────────────────
-- The statement lists the people who have gone to Finance, at the amounts
-- their batches sent; a salary component partly covered (a top-up after the
-- first PV) shows as the remainder still to pay, with what went before.

CREATE OR REPLACE FUNCTION public.payment_cycle_before_statutory_selection(p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_run     record;
    v_prev    date := (p_period - interval '1 month')::date;
    v_hr_dept uuid;
    v_funding jsonb;
BEGIN
    IF NOT has_scope(ARRAY['hr']) THEN
        RAISE EXCEPTION 'payment_cycle: not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT id, status::text AS status, total_amount, submitted_at, approved_at
      INTO v_run
      FROM payroll_runs
     WHERE period_month = p_period AND status <> 'rejected'
     LIMIT 1;

    SELECT id INTO v_hr_dept FROM departments WHERE name = 'HR' LIMIT 1;

    -- The month's funding, over every standing batch that asks for money: the
    -- slowest batch decides the word, the amounts add up.
    WITH asks AS (
        SELECT b.id AS batch_id, b.total_amount,
               (SELECT to_jsonb(q) || jsonb_build_object('pv_no', pv.voucher_no, 'pv_status', pv.status, 'pv_date', pv.payment_date)
                  FROM payroll_payment_requests q LEFT JOIN payment_vouchers pv ON pv.id = q.pv_id
                 WHERE q.batch_id = b.id AND q.status IN ('submitted', 'pv_generated', 'completed')
                 ORDER BY q.created_at DESC LIMIT 1) AS req
          FROM payroll_batches b
         WHERE b.period_month = p_period AND b.status = 'submitted' AND b.total_amount > 0
    )
    SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
               'id', (SELECT a2.req->>'id' FROM asks a2 WHERE a2.req IS NOT NULL
                       ORDER BY a2.req->>'created_at' DESC LIMIT 1),
               'status', CASE WHEN bool_and(req->>'status' = 'completed') THEN 'completed'
                              WHEN bool_or(req->>'status' = 'pv_generated') THEN 'pv_generated'
                              WHEN bool_or(req->>'status' = 'submitted') THEN 'submitted'
                              ELSE NULL END,
               'amount', sum(total_amount),
               'requested_at', min(req->>'requested_at'),
               'pv_id', (SELECT a2.req->>'pv_id' FROM asks a2 WHERE a2.req->>'status' = 'completed'
                          ORDER BY a2.req->>'created_at' DESC LIMIT 1),
               'pv_no', (SELECT a2.req->>'pv_no' FROM asks a2 WHERE a2.req->>'status' = 'completed'
                          ORDER BY a2.req->>'created_at' DESC LIMIT 1),
               'pv_status', NULL,
               'pv_date', (SELECT max(a2.req->>'pv_date') FROM asks a2 WHERE a2.req->>'status' = 'completed'),
               'paid_amount', sum(CASE WHEN req->>'status' = 'pv_generated'
                                       THEN get_payroll_funding_paid((req->>'id')::uuid)
                                       WHEN req->>'status' = 'completed' THEN total_amount ELSE 0 END),
               'batches', count(*),
               'batches_funded', count(*) FILTER (WHERE req->>'status' = 'completed')) END
      INTO v_funding
      FROM asks;
    IF v_funding IS NOT NULL AND v_funding->>'status' IS NULL THEN
        v_funding := NULL;
    END IF;

    RETURN jsonb_build_object(
        'period', p_period,
        'run', CASE WHEN v_run.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', v_run.id, 'status', v_run.status, 'total_amount', v_run.total_amount,
            'submitted_at', v_run.submitted_at, 'approved_at', v_run.approved_at) END,
        'latest_run_period', (SELECT max(period_month) FROM payroll_runs WHERE status <> 'rejected'),
        'pool_balance', COALESCE((SELECT balance FROM dept_pool_balances WHERE department_id = v_hr_dept), 0),
        'payout_bank', (SELECT jsonb_build_object('name', b.bank_name, 'last4', right(b.account_number, 4))
                          FROM bank_accounts b WHERE b.status = 'active' AND b.gl_account_code = '3010' LIMIT 1),
        'funding', jsonb_build_object(
            'staff', v_funding,
            'directors', (
                SELECT jsonb_build_object(
                    'id', r.id, 'status', r.status, 'amount', r.amount, 'requested_at', r.requested_at,
                    'target_pool', r.target_pool,
                    'pv_id', r.pv_id, 'pv_no', pv.voucher_no, 'pv_status', pv.status, 'pv_date', pv.payment_date)
                  FROM payroll_payment_requests r
                  LEFT JOIN payment_vouchers pv ON pv.id = r.pv_id
                 WHERE r.payroll_run_id IS NULL
                   AND r.period_month = p_period
                   AND r.status IN ('submitted', 'pv_generated', 'completed')
                 ORDER BY r.requested_at DESC LIMIT 1)
        ),
        'people', (
            WITH sent AS (
                SELECT l.scope, l.row_id,
                       sum(l.gross) gross, sum(l.net) net, sum(l.epf_er) epf_er, sum(l.epf_ee) epf_ee,
                       sum(l.socso_er) socso_er, sum(l.socso_ee) socso_ee, sum(l.eis_er) eis_er, sum(l.eis_ee) eis_ee,
                       sum(l.pcb) pcb, sum(l.skbbk) skbbk
                  FROM payroll_batch_lines l
                  JOIN payroll_batches b ON b.id = l.batch_id AND b.status = 'submitted'
                 WHERE l.period_month = p_period
                 GROUP BY 1, 2
            ), stat AS MATERIALIZED (
                -- What of each scheme is FUNDED: statutory PVs pay that, less what is covered.
                SELECT e.scope, e.row_id, jsonb_object_agg(e.scheme, e.funded) AS funded
                  FROM payroll_statutory_entitlements(p_period) e
                 GROUP BY 1, 2
            )
            SELECT COALESCE(jsonb_agg(p ORDER BY p->>'dept_name', p->>'name'), '[]'::jsonb) FROM (
                SELECT jsonb_build_object(
                    'row_id', mp.id, 'scope', 'staff', 'staff_id', mp.staff_id,
                    'code', s.employee_code, 'name', s.employee_name,
                    'dept_id', s.department_id, 'dept_name', COALESCE(d.name, 'Unassigned'),
                    'bank_name', s.bank_name, 'bank_account_no', s.bank_account_no,
                    'gross', t.gross, 'net', t.net,
                    'epf_er', t.epf_er, 'epf_ee', t.epf_ee,
                    'socso_er', t.socso_er, 'socso_ee', t.socso_ee,
                    'eis_er', t.eis_er, 'eis_ee', t.eis_ee,
                    'pcb', t.pcb, 'skbbk', t.skbbk,
                    'statutory_funded', (SELECT st.funded FROM stat st WHERE st.scope = 'staff' AND st.row_id = mp.id),
                    'prev_net', (SELECT pm.net FROM hr_monthly_payroll pm
                                  WHERE pm.staff_id = mp.staff_id AND pm.period_month = v_prev LIMIT 1),
                    'voucher', (
                        SELECT jsonb_build_object(
                            'id', pv.id, 'no', pv.voucher_no, 'status', pv.status,
                            'payment_date', pv.payment_date, 'created_at', pv.created_at, 'approved_at', pv.approved_at,
                            'granularity', CASE WHEN pv.reference_id = mp.id THEN 'employee' ELSE 'department' END,
                            'group_id', (SELECT ar.group_id FROM approval_requests ar
                                          WHERE ar.reference_id = pv.id AND ar.reference_table = 'payment_vouchers' LIMIT 1))
                          FROM payroll_voucher_lines l
                          JOIN payment_vouchers pv ON pv.id = l.voucher_id
                         WHERE l.payroll_row_id = mp.id AND pv.status <> 'voided'
                         ORDER BY pv.created_at DESC LIMIT 1)
                ) AS p
                  FROM hr_monthly_payroll mp
                  JOIN sent t ON t.scope = 'staff' AND t.row_id = mp.id
                  JOIN hr_staff_costs s ON s.id = mp.staff_id
                  LEFT JOIN departments d ON d.id = s.department_id
                 WHERE mp.period_month = p_period
                UNION ALL
                SELECT jsonb_build_object(
                    'row_id', dmp.id, 'scope', 'directors', 'staff_id', NULL,
                    'code', dmp.employee_code, 'name', dmp.employee_name,
                    'dept_id', NULL, 'dept_name', 'Directors',
                    'bank_name', NULL, 'bank_account_no', NULL,
                    'gross', coalesce(t.gross, dmp.gross), 'net', coalesce(t.net, dmp.net),
                    'epf_er', coalesce(t.epf_er, dmp.epf_er), 'epf_ee', coalesce(t.epf_ee, dmp.epf_ee),
                    'socso_er', coalesce(t.socso_er, dmp.socso_er), 'socso_ee', coalesce(t.socso_ee, dmp.socso_ee),
                    'eis_er', coalesce(t.eis_er, dmp.eis_er), 'eis_ee', coalesce(t.eis_ee, dmp.eis_ee),
                    'pcb', coalesce(t.pcb, dmp.pcb), 'skbbk', coalesce(t.skbbk, dmp.skbbk_amount),
                    'statutory_funded', (SELECT st.funded FROM stat st WHERE st.scope = 'directors' AND st.row_id = dmp.id),
                    'prev_net', (SELECT pd.net FROM director_monthly_payroll pd
                                  WHERE pd.director_id = dmp.director_id AND pd.period_month = v_prev LIMIT 1),
                    'voucher', (
                        SELECT jsonb_build_object(
                            'id', pv.id, 'no', pv.voucher_no, 'status', pv.status,
                            'payment_date', pv.payment_date, 'created_at', pv.created_at, 'approved_at', pv.approved_at,
                            'granularity', CASE WHEN pv.reference_id = dmp.id THEN 'employee' ELSE 'department' END,
                            'group_id', (SELECT ar.group_id FROM approval_requests ar
                                          WHERE ar.reference_id = pv.id AND ar.reference_table = 'payment_vouchers' LIMIT 1))
                          FROM payroll_voucher_lines l
                          JOIN payment_vouchers pv ON pv.id = l.voucher_id
                         WHERE l.payroll_row_id = dmp.id AND pv.status <> 'voided'
                         ORDER BY pv.created_at DESC LIMIT 1)
                ) AS p
                  FROM director_monthly_payroll dmp
                  LEFT JOIN sent t ON t.scope = 'directors' AND t.row_id = dmp.id
                 WHERE dmp.period_month = p_period
                   AND (t.row_id IS NOT NULL OR dmp.status IN ('submitted', 'paid'))
            ) x(p)
        ),
        'statutory_vouchers', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', pv.id, 'no', pv.voucher_no, 'payee', pv.payee_name, 'status', pv.status,
                'amount', pv.amount, 'payment_date', pv.payment_date, 'description', pv.description,
                'created_at', pv.created_at, 'approved_at', pv.approved_at) ORDER BY pv.created_at), '[]'::jsonb)
              FROM payment_vouchers pv
             WHERE pv.reference_type = 'payroll_statutory'
               AND pv.reference_id = v_run.id
               AND pv.status <> 'voided')
    );
END;
$function$;

-- Statutory is complete when every scheme's submitted amount is paid.
CREATE OR REPLACE FUNCTION public.payment_cycle_before_salary_components(p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE cycle jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'),false) THEN
        RAISE EXCEPTION 'payment_cycle: not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    cycle := payment_cycle_before_statutory_selection(p_period);
    RETURN cycle || jsonb_build_object('statutory_coverage',
        (SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM payroll_statutory_coverage(p_period) c),
        'statutory_completion', (SELECT coalesce(jsonb_agg(jsonb_build_object('period', r.period_month, 'complete', s.complete)), '[]'::jsonb)
            FROM payroll_runs r
            CROSS JOIN LATERAL (
                WITH ent AS MATERIALIZED (SELECT * FROM payroll_statutory_entitlements(r.period_month)),
                     paid_cov AS MATERIALIZED (
                         SELECT c.scope, c.row_id, c.scheme, sum(c.amount) AS amount
                           FROM payroll_statutory_coverage(r.period_month) c
                           JOIN payment_vouchers pv ON pv.id = c.voucher_id AND pv.status = 'paid'
                          GROUP BY 1, 2, 3)
                SELECT (EXISTS (SELECT 1 FROM ent WHERE ent.submitted > 0)
                    AND NOT EXISTS (SELECT 1 FROM ent WHERE ent.submitted < 0)
                    AND NOT EXISTS (SELECT 1 FROM ent e
                                      LEFT JOIN paid_cov p ON p.scope = e.scope AND p.row_id = e.row_id AND p.scheme = e.scheme
                                     WHERE e.submitted > 0 AND e.submitted > coalesce(p.amount, 0) + 0.005)
                    AND NOT EXISTS (SELECT 1 FROM payment_vouchers pv WHERE pv.reference_type = 'payroll_statutory'
                                      AND pv.reference_id = r.id AND pv.status NOT IN ('paid', 'voided'))) AS complete
            ) s
            WHERE r.status <> 'rejected'
              AND r.period_month BETWEEN (p_period - interval '4 months')::date AND (p_period + interval '1 month')::date));
END
$function$;

CREATE OR REPLACE FUNCTION public.payment_cycle(p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'),false) THEN
        RAISE EXCEPTION 'payment_cycle: not permitted' USING ERRCODE='insufficient_privilege';
    END IF;
    result:=payment_cycle_before_salary_components(p_period);
    RETURN result || jsonb_build_object('people', (
        WITH ent AS MATERIALIZED (SELECT * FROM payroll_salary_entitlements(p_period)),
             cov AS MATERIALIZED (SELECT * FROM payroll_salary_coverage(p_period))
        SELECT coalesce(jsonb_agg(person || jsonb_build_object(
            'source',mp.source,'payout_split_version',mp.payout_split_version,
            'bank_name_2',s.bank_name_2,'bank_account_no_2',s.bank_account_no_2,
            'voucher',CASE WHEN mp.source='commission' AND mp.payout_split_version=2 THEN NULL ELSE person->'voucher' END,
            'components',(SELECT coalesce(jsonb_agg(
                CASE WHEN e.covered + 0.005 >= e.submitted THEN jsonb_build_object(
                    'component',e.component,'amount',e.submitted,
                    'recipient_account',covered.recipient_account,'bank_name',covered.bank_name,'bank_account_no',covered.bank_account_no,
                    'voucher',covered.voucher,'funded',true,'covered_before',0,'paid_before',0)
                ELSE jsonb_build_object(
                    -- The part not yet on a voucher; what went before rides along.
                    'component',e.component,'amount',round(e.submitted - e.covered, 2),
                    'recipient_account',NULL,'bank_name',NULL,'bank_account_no',NULL,
                    'voucher',NULL,'funded',e.funded + 0.005 >= e.submitted,
                    'covered_before',e.covered,'paid_before',e.paid) END
                ORDER BY e.component),'[]'::jsonb)
                FROM ent e
                LEFT JOIN LATERAL (
                    SELECT l.recipient_account,l.bank_name,l.bank_account_no,jsonb_build_object(
                        'id',pv.id,'no',pv.voucher_no,'status',pv.status,'payment_date',pv.payment_date,
                        'created_at',pv.created_at,'approved_at',pv.approved_at,
                        'granularity',CASE WHEN pv.reference_id=e.row_id THEN 'employee' ELSE 'department' END,
                        'group_id',(SELECT ar.group_id FROM approval_requests ar WHERE ar.reference_id=pv.id
                            AND ar.reference_table='payment_vouchers' LIMIT 1)) voucher
                    FROM cov JOIN payment_vouchers pv ON pv.id=cov.voucher_id
                    LEFT JOIN payroll_voucher_lines l ON l.voucher_id=pv.id AND l.payroll_row_id=e.row_id AND l.scope=e.scope
                        AND l.salary_component IN ('net',e.component)
                    WHERE cov.row_id=e.row_id AND cov.scope=e.scope AND cov.component=e.component
                    ORDER BY pv.created_at DESC LIMIT 1
                ) covered ON true
                WHERE e.row_id=(person->>'row_id')::uuid AND e.scope=person->>'scope')
            ) ORDER BY person->>'dept_name',person->>'name'),'[]'::jsonb)
        FROM jsonb_array_elements(result->'people') person
        LEFT JOIN hr_monthly_payroll mp ON mp.id=(person->>'row_id')::uuid AND person->>'scope'='staff'
        LEFT JOIN hr_staff_costs s ON s.id=mp.staff_id
    ));
END $function$;


-- ─── 17. Grants ─────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.payroll_complete_rows(DATE, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_uncomplete_rows(DATE, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_submit_batch(DATE, INTEGER, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_open_topup(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_cancel_topup(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_send_back_batch(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_close_month(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_reopen_month(DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.director_payroll_complete(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.director_payroll_uncomplete(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_complete_rows(DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_uncomplete_rows(DATE, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_submit_batch(DATE, INTEGER, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_open_topup(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_cancel_topup(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_send_back_batch(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_close_month(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_reopen_month(DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.director_payroll_complete(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.director_payroll_uncomplete(DATE) TO authenticated;
REVOKE ALL ON FUNCTION public.payroll_row_delta(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_row_delta(TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Function bodies replaced here (restore from their previous migrations to
-- roll back): assert_commission_payroll_open, compute_hr_monthly_payroll,
-- apply_commission_run, send_commission_to_payroll, submit_payroll_to_principal,
-- submit_director_salary_to_finance, reopen_payroll_run,
-- validate_payroll_payment_request_insert, get_payroll_breakdown_by_pool,
-- payroll_salary_components, payroll_salary_coverage,
-- create_payroll_disbursement_vouchers, sync_payroll_salary_payment_status,
-- guard_payroll_salary_voucher, payroll_statutory_people,
-- create_payroll_statutory_batch.
