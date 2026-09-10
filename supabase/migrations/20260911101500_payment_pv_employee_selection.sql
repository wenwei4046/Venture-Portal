-- Select some employees now and generate the remaining department later.
-- Existing three/five-argument callers keep working through defaults; remove
-- the old overload so PostgREST always resolves to this six-argument function.
-- This migration changes only the generator, never existing payroll/PV data.
BEGIN;

DROP FUNCTION IF EXISTS public.create_payroll_disbursement_vouchers(date, text, date, text, uuid);

CREATE OR REPLACE FUNCTION public.create_payroll_disbursement_vouchers(
    p_period        date,
    p_scope         text,
    p_payment_date  date,
    p_granularity   text DEFAULT 'employee',
    p_department_id uuid DEFAULT NULL,
    p_payroll_row_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
           OR cardinality(p_payroll_row_ids) <> (
               SELECT count(DISTINCT id) FROM unnest(p_payroll_row_ids) AS selected(id)
           ) THEN
            RAISE EXCEPTION 'Invalid employee selection. Select each employee once.';
        END IF;
    END IF;

    -- A second salary generation waits before reading eligibility. This is
    -- also the existing voucher-number namespace used by other PV generators.
    -- Held through commit: overlapping selections cannot both pass dedupe.
    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));

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

    -- NULL means all REMAINING eligible people in this scope/department.
    -- An explicit selection is exact: any missing, stale, out-of-scope,
    -- non-positive or already-vouchered row fails the whole call below.
    -- Materialise and lock in the SAME query: imports cannot change the
    -- payroll amounts or staff department membership while PVs are written.
    DROP TABLE IF EXISTS pg_temp.tmp_pv_rows;
    CREATE TEMP TABLE tmp_pv_rows (
        payroll_id uuid PRIMARY KEY,
        net numeric(15, 2),
        employee_name text,
        employee_code text,
        department_id uuid,
        dept_name text
    ) ON COMMIT DROP;

    IF p_scope = 'staff' THEN
        INSERT INTO pg_temp.tmp_pv_rows
        SELECT mp.id, mp.net, s.employee_name, s.employee_code,
               s.department_id, coalesce(d.name, 'Unassigned')
          FROM hr_monthly_payroll mp
          JOIN hr_staff_costs s ON s.id = mp.staff_id
          LEFT JOIN departments d ON d.id = s.department_id
         WHERE mp.period_month = p_period
           AND mp.net > 0
           AND (p_department_id IS NULL OR s.department_id = p_department_id)
           AND (p_payroll_row_ids IS NULL OR mp.id = ANY(p_payroll_row_ids))
           AND NOT EXISTS (
               SELECT 1 FROM payroll_voucher_lines l
               JOIN payment_vouchers pv ON pv.id = l.voucher_id
               WHERE l.payroll_row_id = mp.id AND l.scope = p_scope
                 AND pv.status <> 'voided'
           )
           -- Keep old employee PVs safe even if their line backfill was missing.
           AND NOT EXISTS (
               SELECT 1 FROM payment_vouchers pv
               WHERE pv.reference_type = 'payroll_disbursement'
                 AND pv.reference_id = mp.id AND pv.status <> 'voided'
           )
         ORDER BY mp.id
         FOR UPDATE OF mp FOR SHARE OF s;
    ELSE
        INSERT INTO pg_temp.tmp_pv_rows
        SELECT dmp.id, dmp.net, dmp.employee_name, dmp.employee_code,
               NULL::uuid, 'Directors'
          FROM director_monthly_payroll dmp
         WHERE dmp.period_month = p_period
           AND dmp.net > 0
           AND (p_payroll_row_ids IS NULL OR dmp.id = ANY(p_payroll_row_ids))
           AND NOT EXISTS (
               SELECT 1 FROM payroll_voucher_lines l
               JOIN payment_vouchers pv ON pv.id = l.voucher_id
               WHERE l.payroll_row_id = dmp.id AND l.scope = p_scope
                 AND pv.status <> 'voided'
           )
           AND NOT EXISTS (
               SELECT 1 FROM payment_vouchers pv
               WHERE pv.reference_type = 'payroll_disbursement'
                 AND pv.reference_id = dmp.id AND pv.status <> 'voided'
           )
         ORDER BY dmp.id
         FOR UPDATE OF dmp;
    END IF;

    SELECT count(*) INTO v_selected FROM pg_temp.tmp_pv_rows;
    IF p_payroll_row_ids IS NOT NULL AND v_selected <> cardinality(p_payroll_row_ids) THEN
        RAISE EXCEPTION 'Employee selection has changed or includes people outside this payroll group, with no net pay, or with an existing PV. Refresh and select the remaining employees again.';
    END IF;
    IF v_selected = 0 THEN
        RAISE EXCEPTION 'No employees without a PV and with net pay above zero remain for %.',
            to_char(p_period, 'Mon YYYY') || CASE WHEN p_department_id IS NULL THEN '' ELSE ' in that department' END;
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
        FOR v_row IN SELECT * FROM pg_temp.tmp_pv_rows ORDER BY dept_name, employee_name LOOP
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
              FROM pg_temp.tmp_pv_rows
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
              FROM pg_temp.tmp_pv_rows t
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

COMMENT ON FUNCTION public.create_payroll_disbursement_vouchers(date, text, date, text, uuid, uuid[]) IS
    'Salary PVs for an exact payroll-row selection or all remaining eligible '
    'people. Department mode groups the selected people; employee mode raises '
    'one voucher each. Subsequent batches cannot duplicate live voucher lines. '
    'Funding gates, approval groups and HR custody accounting are unchanged.';

REVOKE ALL ON FUNCTION public.create_payroll_disbursement_vouchers(date, text, date, text, uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_payroll_disbursement_vouchers(date, text, date, text, uuid, uuid[]) TO authenticated;

COMMIT;
