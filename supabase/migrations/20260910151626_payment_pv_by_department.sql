-- Mig 20260910150000: salary PVs compiled BY DEPARTMENT (or per employee),
-- and one read for the whole payment cycle.
--
-- User (2026-09-10): "只要 submission done for 那个月的 payroll 时, supposed to
-- be 是有一个 button 可以让我 compile generate PV by department … 也能够选择
-- by department / department 里面 by employee". Chosen shape: proposal B
-- (department board + window).
--
-- ── What changes ────────────────────────────────────────────────────────────
--
-- 1. payroll_voucher_lines — which PEOPLE a payroll_disbursement voucher
--    pays. Written for BOTH granularities, so the page always knows who is
--    covered by which PV, and the dedupe checks lines instead of guessing
--    from reference_id. Backfilled for every existing voucher (Jun–Aug 2026).
--
-- 2. create_payroll_disbursement_vouchers(period, scope, payment_date,
--    granularity, department_id) — 'employee' keeps today's one PV per
--    person; 'department' writes ONE voucher per department (or one for all
--    directors) with the people as lines. department_id lets one department
--    go alone. GL and pool are unchanged: Dr 4070 / Cr Alliance 3010, drawn
--    from the HR custody pool, one approval group per call.
--
-- 3. derive_journal_segment — a department voucher's reference_id is a
--    department, not a payroll row, so the segment now comes from the lines.
--
-- 4. payment_cycle(period) — one RPC for the HR Payment page: run, funding,
--    every person with their voucher, statutory vouchers, HR pool balance,
--    and last month's net per person (the "vs July" column).

BEGIN;

-- ── 1. Lines ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payroll_voucher_lines (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id      uuid NOT NULL REFERENCES public.payment_vouchers(id) ON DELETE CASCADE,
    scope           text NOT NULL CHECK (scope IN ('staff', 'directors')),
    -- hr_monthly_payroll.id (staff) or director_monthly_payroll.id (directors)
    payroll_row_id  uuid NOT NULL,
    period_month    date NOT NULL,
    employee_name   text NOT NULL,
    employee_code   text,
    department_id   uuid REFERENCES public.departments(id),
    department_name text,
    net             numeric(15, 2) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (voucher_id, payroll_row_id)
);
CREATE INDEX IF NOT EXISTS payroll_voucher_lines_row_idx    ON public.payroll_voucher_lines (payroll_row_id);
CREATE INDEX IF NOT EXISTS payroll_voucher_lines_period_idx ON public.payroll_voucher_lines (period_month, scope);

COMMENT ON TABLE public.payroll_voucher_lines IS
    'Mig 20260910150000: the people a payroll_disbursement voucher pays. One row '
    'per person per voucher, for per-employee AND per-department vouchers alike. '
    'Written only by create_payroll_disbursement_vouchers.';

ALTER TABLE public.payroll_voucher_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pvl_select ON public.payroll_voucher_lines;
CREATE POLICY pvl_select ON public.payroll_voucher_lines
    FOR SELECT
    USING ((SELECT has_scope(ARRAY['hr', 'treasury', 'admin'])));
-- No INSERT / UPDATE / DELETE policies: writes go through the SECURITY DEFINER RPC.

-- Backfill: every non-voided disbursement voucher so far is one person each,
-- reference_id = the payroll row.
INSERT INTO public.payroll_voucher_lines
    (voucher_id, scope, payroll_row_id, period_month, employee_name, employee_code, department_id, department_name, net)
SELECT pv.id, 'staff', mp.id, mp.period_month, s.employee_name, s.employee_code, s.department_id, d.name, pv.amount
  FROM public.payment_vouchers pv
  JOIN public.hr_monthly_payroll mp ON mp.id = pv.reference_id
  JOIN public.hr_staff_costs s ON s.id = mp.staff_id
  LEFT JOIN public.departments d ON d.id = s.department_id
 WHERE pv.reference_type = 'payroll_disbursement'
ON CONFLICT (voucher_id, payroll_row_id) DO NOTHING;

INSERT INTO public.payroll_voucher_lines
    (voucher_id, scope, payroll_row_id, period_month, employee_name, employee_code, department_id, department_name, net)
SELECT pv.id, 'directors', dmp.id, dmp.period_month, dmp.employee_name, dmp.employee_code, NULL, 'Directors', pv.amount
  FROM public.payment_vouchers pv
  JOIN public.director_monthly_payroll dmp ON dmp.id = pv.reference_id
 WHERE pv.reference_type = 'payroll_disbursement'
ON CONFLICT (voucher_id, payroll_row_id) DO NOTHING;

-- ── 2. The generator ────────────────────────────────────────────────────────

-- PostgREST cannot pick between a 3-arg and a 5-arg-with-defaults overload
-- for a 3-arg call, so the old signature goes.
DROP FUNCTION IF EXISTS public.create_payroll_disbursement_vouchers(date, text, date);

CREATE OR REPLACE FUNCTION public.create_payroll_disbursement_vouchers(
    p_period        date,
    p_scope         text,
    p_payment_date  date,
    p_granularity   text DEFAULT 'employee',
    p_department_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_caller         uuid;
    v_group_id       uuid;
    v_run_id         uuid;
    v_run_status     text;
    v_request_status text;
    v_payout_bank_id uuid;
    v_voucher_period text;
    v_seq            integer;
    v_voucher_no     text;
    v_voucher_id     uuid;
    v_count          integer := 0;
    v_people         integer := 0;
    v_total          numeric(15, 2) := 0;
    v_existing       integer;
    v_row            record;
    v_dept           record;
    v_label          text;
    v_period_label   text;
BEGIN
    IF NOT has_scope(ARRAY['hr']) THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: not permitted'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    IF p_scope NOT IN ('staff', 'directors') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: scope must be staff or directors, got %', p_scope;
    END IF;
    IF p_granularity NOT IN ('employee', 'department') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: granularity must be employee or department, got %', p_granularity;
    END IF;
    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: payment date is required (the day the bank file goes out)';
    END IF;
    IF p_scope = 'directors' AND p_department_id IS NOT NULL THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: directors are one batch — no department filter';
    END IF;

    -- Funding gates are PER SCOPE (mig 20260727100000): staff key off their
    -- payroll_run's request, directors off the run-less director request.
    IF p_scope = 'staff' THEN
        SELECT id, status INTO v_run_id, v_run_status
          FROM payroll_runs
         WHERE period_month = p_period AND status <> 'rejected';
        IF v_run_status IS NULL THEN
            RAISE EXCEPTION 'No payroll run exists for period %. Submit the payroll first.', p_period;
        END IF;
        IF v_run_status NOT IN ('approved', 'paid') THEN
            RAISE EXCEPTION 'Payroll run is in state %. Submit the payroll before paying.', v_run_status;
        END IF;
        SELECT status INTO v_request_status
          FROM payroll_payment_requests
         WHERE payroll_run_id = v_run_id AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1;
        IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
            RAISE EXCEPTION 'Payroll funding for period % is not completed. Wait for all funding PVs to be approved.', p_period;
        END IF;
    ELSE
        SELECT status INTO v_request_status
          FROM payroll_payment_requests
         WHERE payroll_run_id IS NULL AND period_month = p_period AND status = 'completed'
         ORDER BY created_at DESC LIMIT 1;
        IF v_request_status IS NULL THEN
            RAISE EXCEPTION 'Director salary funding for period % is not completed. Submit director salary to Finance and wait for the funding PV to be approved.', p_period;
        END IF;
    END IF;

    -- The people this call would pay.
    DROP TABLE IF EXISTS tmp_pv_rows;
    CREATE TEMP TABLE tmp_pv_rows ON COMMIT DROP AS
    SELECT * FROM (
        SELECT mp.id            AS payroll_id,
               mp.net           AS net,
               s.employee_name  AS employee_name,
               s.employee_code  AS employee_code,
               s.department_id  AS department_id,
               COALESCE(d.name, 'Unassigned') AS dept_name
          FROM hr_monthly_payroll mp
          JOIN hr_staff_costs s ON s.id = mp.staff_id
          LEFT JOIN departments d ON d.id = s.department_id
         WHERE p_scope = 'staff'
           AND mp.period_month = p_period
           AND mp.net > 0
           AND (p_department_id IS NULL OR s.department_id = p_department_id)
        UNION ALL
        SELECT dmp.id, dmp.net, dmp.employee_name, dmp.employee_code, NULL::uuid, 'Directors'
          FROM director_monthly_payroll dmp
         WHERE p_scope = 'directors'
           AND dmp.period_month = p_period
           AND dmp.net > 0
    ) t;

    IF (SELECT COUNT(*) FROM tmp_pv_rows) = 0 THEN
        RAISE EXCEPTION 'No % rows with net > 0 found for %.', p_scope,
            to_char(p_period, 'Mon YYYY') || CASE WHEN p_department_id IS NULL THEN '' ELSE ' in that department' END;
    END IF;

    -- Dedupe through the lines: anybody already on a live voucher blocks the call.
    SELECT COUNT(*) INTO v_existing
      FROM tmp_pv_rows t
     WHERE EXISTS (
        SELECT 1 FROM payroll_voucher_lines l
        JOIN payment_vouchers pv ON pv.id = l.voucher_id
        WHERE l.payroll_row_id = t.payroll_id AND pv.status <> 'voided');
    IF v_existing > 0 THEN
        RAISE EXCEPTION '% of these people already have a payment voucher for % (not voided). Void those first to regenerate.',
            v_existing, to_char(p_period, 'Mon YYYY');
    END IF;

    -- Payroll cash sits in the Alliance account (GL 3010); primary fallback.
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
        -- One voucher per person (the shape every month so far had).
        FOR v_row IN SELECT * FROM tmp_pv_rows ORDER BY dept_name, employee_name LOOP
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
                     ELSE 'Payroll disbursement ' || v_period_label || ' — ' || v_row.employee_name || ' (' || v_row.dept_name || ')' END,
                'bank_transfer', p_payment_date,
                'dept_pool_hr', v_payout_bank_id,
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
                (voucher_id, scope, payroll_row_id, period_month, employee_name, employee_code, department_id, department_name, net)
            VALUES
                (v_voucher_id, p_scope, v_row.payroll_id, p_period, v_row.employee_name, v_row.employee_code, v_row.department_id, v_row.dept_name, v_row.net);

            v_count := v_count + 1;
            v_people := v_people + 1;
            v_total := v_total + v_row.net;
        END LOOP;
    ELSE
        -- One voucher per department (directors: one for the batch), the
        -- people as lines. reference_id = the department (NULL for directors).
        FOR v_dept IN
            SELECT department_id, dept_name, COUNT(*) AS n, SUM(net) AS total
              FROM tmp_pv_rows
             GROUP BY department_id, dept_name
             ORDER BY dept_name
        LOOP
            SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
            v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');
            v_label := v_dept.dept_name || ' · ' || v_dept.n ||
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
                'bank_transfer', p_payment_date,
                'dept_pool_hr', v_payout_bank_id,
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
                (voucher_id, scope, payroll_row_id, period_month, employee_name, employee_code, department_id, department_name, net)
            SELECT v_voucher_id, p_scope, t.payroll_id, p_period, t.employee_name, t.employee_code, t.department_id, t.dept_name, t.net
              FROM tmp_pv_rows t
             WHERE t.dept_name = v_dept.dept_name
               AND t.department_id IS NOT DISTINCT FROM v_dept.department_id;

            v_count := v_count + 1;
            v_people := v_people + v_dept.n;
            v_total := v_total + v_dept.total;
        END LOOP;
    END IF;

    RETURN json_build_object(
        'group_id', v_group_id,
        'scope', p_scope,
        'granularity', p_granularity,
        'count', v_count,
        'people', v_people,
        'total', v_total
    );
END;
$function$;

COMMENT ON FUNCTION public.create_payroll_disbursement_vouchers(date, text, date, text, uuid) IS
    'Mig 20260910150000: salary PVs per employee (granularity employee) or one '
    'per department (granularity department, directors = one batch), optionally '
    'for a single department. People are recorded in payroll_voucher_lines; the '
    'dedupe reads the lines. Dr 4070 / Cr Alliance, drains dept_pool_hr.';

-- ── 3. Segment for department vouchers ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.derive_journal_segment(p_reference_type text, p_reference_id uuid)
 RETURNS gl_segment
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_billing_mode TEXT;
    v_dept_name    TEXT;
    v_voucher_type TEXT;
    v_pv_ref_type  TEXT;
    v_pv_ref_id    UUID;
    v_line_scope   TEXT;
BEGIN
    IF p_reference_type IS NULL THEN
        RETURN 'unallocated'::gl_segment;
    END IF;

    IF p_reference_type IN ('loan', 'fund_source', 'repayment') THEN
        RETURN 'treasury'::gl_segment;
    END IF;

    IF p_reference_type IN (
        'salary', 'director_payout', 'payroll_disbursement', 'hr_monthly_payroll'
    ) THEN
        RETURN 'director_office'::gl_segment;
    END IF;

    IF p_reference_type = 'invoice' AND p_reference_id IS NOT NULL THEN
        SELECT billing_mode INTO v_billing_mode
          FROM invoices WHERE id = p_reference_id;
        IF v_billing_mode IS NOT NULL THEN
            RETURN billing_mode_to_segment(v_billing_mode);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    IF p_reference_type = 'invoice_paid_credit' AND p_reference_id IS NOT NULL THEN
        SELECT inv.billing_mode INTO v_billing_mode
          FROM payment_vouchers pv
          JOIN invoices inv ON inv.id = pv.reference_id
         WHERE pv.id = p_reference_id
           AND pv.reference_type = 'invoice';
        IF v_billing_mode IS NOT NULL THEN
            RETURN billing_mode_to_segment(v_billing_mode);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    IF p_reference_type IN ('dept_expense_request', 'dept_payment_request')
       AND p_reference_id IS NOT NULL THEN
        SELECT d.name INTO v_dept_name
          FROM dept_payment_requests dpr
          JOIN departments d ON d.id = dpr.department_id
         WHERE dpr.id = p_reference_id;
        IF v_dept_name IS NOT NULL THEN
            RETURN dept_to_segment(v_dept_name);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    IF p_reference_type = 'dept_transfer' THEN
        RETURN 'hr'::gl_segment;
    END IF;

    IF p_reference_type = 'claim' AND p_reference_id IS NOT NULL THEN
        SELECT d.name INTO v_dept_name
          FROM claims c
          LEFT JOIN departments d ON d.id = c.department_id
         WHERE c.id = p_reference_id;
        IF v_dept_name IS NOT NULL THEN
            RETURN dept_to_segment(v_dept_name);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    IF p_reference_type = 'payment_voucher' AND p_reference_id IS NOT NULL THEN
        SELECT voucher_type, reference_type, reference_id
          INTO v_voucher_type, v_pv_ref_type, v_pv_ref_id
          FROM payment_vouchers WHERE id = p_reference_id;

        IF v_voucher_type = 'loan_repayment' THEN
            RETURN 'treasury'::gl_segment;
        END IF;

        IF v_voucher_type = 'salary_payout' THEN
            RETURN 'director_office'::gl_segment;
        END IF;

        IF v_voucher_type = 'billing_payment'
           AND v_pv_ref_type = 'invoice' AND v_pv_ref_id IS NOT NULL THEN
            SELECT billing_mode INTO v_billing_mode
              FROM invoices WHERE id = v_pv_ref_id;
            IF v_billing_mode IS NOT NULL THEN
                RETURN billing_mode_to_segment(v_billing_mode);
            END IF;
        END IF;

        IF v_pv_ref_type = 'payroll_disbursement' THEN
            -- Mig 20260910150000: the lines say who the voucher pays, for
            -- per-employee and per-department vouchers alike (custody model,
            -- mig 20260720140000: staff → hr, directors → director).
            SELECT l.scope INTO v_line_scope
              FROM payroll_voucher_lines l
             WHERE l.voucher_id = p_reference_id
             LIMIT 1;
            IF v_line_scope = 'staff' THEN
                RETURN 'hr'::gl_segment;
            ELSIF v_line_scope = 'directors' THEN
                RETURN 'director'::gl_segment;
            END IF;
        END IF;

        IF v_pv_ref_type = 'payroll_disbursement' AND v_pv_ref_id IS NOT NULL THEN
            -- Pre-lines vouchers (Jun–Aug 2026 are backfilled, this is belt and braces).
            IF EXISTS (SELECT 1 FROM hr_monthly_payroll mp WHERE mp.id = v_pv_ref_id) THEN
                RETURN 'hr'::gl_segment;
            END IF;
            IF EXISTS (SELECT 1 FROM director_monthly_payroll dmp WHERE dmp.id = v_pv_ref_id) THEN
                RETURN 'director'::gl_segment;
            END IF;
            IF EXISTS (SELECT 1 FROM director_payouts dp WHERE dp.id = v_pv_ref_id) THEN
                RETURN 'director'::gl_segment;
            END IF;
        END IF;

        IF v_pv_ref_type = 'dept_payment_request' AND v_pv_ref_id IS NOT NULL THEN
            SELECT d.name INTO v_dept_name
              FROM dept_payment_requests dpr
              JOIN departments d ON d.id = dpr.department_id
             WHERE dpr.id = v_pv_ref_id;
            IF v_dept_name IS NOT NULL THEN
                RETURN dept_to_segment(v_dept_name);
            END IF;
        END IF;

        RETURN 'corporate'::gl_segment;
    END IF;

    RETURN 'unallocated'::gl_segment;
END;
$function$;

-- ── 4. One read for the page ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.payment_cycle(p_period date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_run     record;
    v_prev    date := (p_period - interval '1 month')::date;
    v_hr_dept uuid;
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

    RETURN jsonb_build_object(
        'period', p_period,
        'run', CASE WHEN v_run.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', v_run.id, 'status', v_run.status, 'total_amount', v_run.total_amount,
            'submitted_at', v_run.submitted_at, 'approved_at', v_run.approved_at) END,
        'latest_run_period', (SELECT max(period_month) FROM payroll_runs WHERE status <> 'rejected'),
        'pool_balance', COALESCE((SELECT balance FROM dept_pool_balances WHERE department_id = v_hr_dept), 0),
        -- The account the salary PVs and the bank file draw on (GL 3010 = Alliance).
        'payout_bank', (SELECT jsonb_build_object('name', b.bank_name, 'last4', right(b.account_number, 4))
                          FROM bank_accounts b WHERE b.status = 'active' AND b.gl_account_code = '3010' LIMIT 1),
        'funding', jsonb_build_object(
            'staff', (
                SELECT jsonb_build_object(
                    'id', r.id, 'status', r.status, 'amount', r.amount, 'requested_at', r.requested_at,
                    'pv_id', r.pv_id, 'pv_no', pv.voucher_no, 'pv_status', pv.status, 'pv_date', pv.payment_date,
                    'paid_amount', CASE WHEN r.status = 'pv_generated' THEN get_payroll_funding_paid(r.id) ELSE NULL END)
                  FROM payroll_payment_requests r
                  LEFT JOIN payment_vouchers pv ON pv.id = r.pv_id
                 WHERE r.payroll_run_id = v_run.id
                   AND r.status IN ('submitted', 'pv_generated', 'completed')
                 ORDER BY r.created_at DESC LIMIT 1),
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
            SELECT COALESCE(jsonb_agg(p ORDER BY p->>'dept_name', p->>'name'), '[]'::jsonb) FROM (
                SELECT jsonb_build_object(
                    'row_id', mp.id, 'scope', 'staff', 'staff_id', mp.staff_id,
                    'code', s.employee_code, 'name', s.employee_name,
                    'dept_id', s.department_id, 'dept_name', COALESCE(d.name, 'Unassigned'),
                    'bank_name', s.bank_name, 'bank_account_no', s.bank_account_no,
                    'gross', mp.gross, 'net', mp.net,
                    'epf_er', mp.epf_er, 'epf_ee', mp.epf_ee,
                    'socso_er', mp.socso_er, 'socso_ee', mp.socso_ee,
                    'eis_er', mp.eis_er, 'eis_ee', mp.eis_ee,
                    'pcb', mp.pcb, 'skbbk', mp.skbbk_amount,
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
                  JOIN hr_staff_costs s ON s.id = mp.staff_id
                  LEFT JOIN departments d ON d.id = s.department_id
                 WHERE mp.period_month = p_period
                UNION ALL
                SELECT jsonb_build_object(
                    'row_id', dmp.id, 'scope', 'directors', 'staff_id', NULL,
                    'code', dmp.employee_code, 'name', dmp.employee_name,
                    'dept_id', NULL, 'dept_name', 'Directors',
                    'bank_name', NULL, 'bank_account_no', NULL,
                    'gross', dmp.gross, 'net', dmp.net,
                    'epf_er', dmp.epf_er, 'epf_ee', dmp.epf_ee,
                    'socso_er', dmp.socso_er, 'socso_ee', dmp.socso_ee,
                    'eis_er', dmp.eis_er, 'eis_ee', dmp.eis_ee,
                    'pcb', dmp.pcb, 'skbbk', dmp.skbbk_amount,
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
                 WHERE dmp.period_month = p_period
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

COMMENT ON FUNCTION public.payment_cycle(date) IS
    'Mig 20260910150000: everything the HR Payment page shows for one month in '
    'one round trip — run, funding requests, every person with their voucher '
    '(via payroll_voucher_lines) and last month''s net, statutory vouchers, HR pool.';

REVOKE ALL ON FUNCTION public.payment_cycle(date) FROM public;
GRANT EXECUTE ON FUNCTION public.payment_cycle(date) TO authenticated;
REVOKE ALL ON FUNCTION public.create_payroll_disbursement_vouchers(date, text, date, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_payroll_disbursement_vouchers(date, text, date, text, uuid) TO authenticated;

COMMIT;
