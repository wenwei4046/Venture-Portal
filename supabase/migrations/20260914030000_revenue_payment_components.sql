-- Salary components and immutable recipient-account snapshots. No existing
-- payroll amounts or historical bank details are backfilled.
BEGIN;
ALTER TABLE public.payroll_voucher_lines
    ADD COLUMN salary_component text NOT NULL DEFAULT 'net' CHECK (salary_component IN ('net','basic','commission')),
    ADD COLUMN recipient_account text CHECK (recipient_account IN ('account_1','account_2')),
    ADD COLUMN bank_name text,
    ADD COLUMN bank_account_no text;
ALTER TABLE public.payroll_voucher_lines DROP CONSTRAINT payroll_voucher_lines_voucher_id_payroll_row_id_key;
ALTER TABLE public.payroll_voucher_lines ADD CONSTRAINT payroll_voucher_lines_component_key UNIQUE (voucher_id,payroll_row_id,salary_component);

CREATE FUNCTION public.payroll_salary_components(p_period date)
RETURNS TABLE(scope text,row_id uuid,component text,amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $f$
    SELECT 'staff'::text,mp.id,c.component,c.amount FROM hr_monthly_payroll mp
    CROSS JOIN LATERAL (VALUES
        ('net'::text,CASE WHEN mp.source='commission' AND mp.payout_split_version=2 THEN NULL ELSE mp.net END),
        ('basic'::text,CASE WHEN mp.source='commission' AND mp.payout_split_version=2 THEN mp.basic_pay_net END),
        ('commission'::text,CASE WHEN mp.source='commission' AND mp.payout_split_version=2 THEN mp.commission_balance END)
    ) c(component,amount) WHERE mp.period_month=p_period AND c.amount IS NOT NULL
    UNION ALL SELECT 'directors',mp.id,'net',mp.net FROM director_monthly_payroll mp WHERE mp.period_month=p_period
$f$;

CREATE FUNCTION public.payroll_salary_coverage(p_period date)
RETURNS TABLE(scope text,row_id uuid,component text,amount numeric,voucher_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $f$
    SELECT c.scope,c.row_id,c.component,c.amount,pv.id FROM payroll_salary_components(p_period) c
    JOIN payment_vouchers pv ON pv.reference_type='payroll_disbursement' AND pv.status<>'voided'
        AND (EXISTS (SELECT 1 FROM payroll_voucher_lines l WHERE l.voucher_id=pv.id
            AND l.payroll_row_id=c.row_id AND l.scope=c.scope AND l.salary_component IN ('net',c.component))
        OR (pv.reference_id=c.row_id AND NOT EXISTS (SELECT 1 FROM payroll_voucher_lines l WHERE l.voucher_id=pv.id)))
$f$;
REVOKE ALL ON FUNCTION public.payroll_salary_components(date),public.payroll_salary_coverage(date) FROM public,anon,authenticated;
DROP FUNCTION public.create_payroll_disbursement_vouchers(date,text,date,text,uuid,uuid[]);
CREATE OR REPLACE FUNCTION public.create_payroll_disbursement_vouchers(
    p_period        date,
    p_scope         text,
    p_payment_date  date,
    p_granularity   text DEFAULT 'employee',
    p_department_id uuid DEFAULT NULL,
    p_payroll_row_ids uuid[] DEFAULT NULL,
    p_component_selections jsonb DEFAULT NULL
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

    -- Row/account locks freeze reviewed salary and recipient details for the PV.
    DROP TABLE IF EXISTS pg_temp.tmp_pv_rows;
    CREATE TEMP TABLE tmp_pv_rows (
        payroll_id uuid, net numeric(15,2), employee_name text, employee_code text,
        department_id uuid, dept_name text, salary_component text, recipient_account text,
        bank_name text, bank_account_no text, PRIMARY KEY (payroll_id,salary_component)
    ) ON COMMIT DROP;

    IF p_scope = 'staff' THEN
        -- Never hide an invalid split by skipping one negative or stale component.
        IF EXISTS (SELECT 1 FROM hr_monthly_payroll mp JOIN hr_staff_costs s ON s.id=mp.staff_id
            WHERE mp.period_month=p_period AND mp.source='commission' AND mp.payout_split_version=2
                AND (p_department_id IS NULL OR s.department_id=p_department_id)
                AND (p_payroll_row_ids IS NULL OR mp.id=ANY(p_payroll_row_ids))
                AND (p_component_selections IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_component_selections) x WHERE (x->>'payroll_row_id')::uuid=mp.id))
                AND (mp.basic_pay_net IS NULL OR mp.commission_balance IS NULL OR mp.basic_pay_net<0
                    OR mp.commission_balance<0 OR mp.basic_pay_net+mp.commission_balance<>mp.net)) THEN
            RAISE EXCEPTION 'Invalid Revenue payment split. Refresh the payroll calculation before generating PVs.';
        END IF;
        INSERT INTO pg_temp.tmp_pv_rows
        SELECT mp.id, c.amount, s.employee_name, s.employee_code, s.department_id, coalesce(d.name,'Unassigned'),
            c.component, coalesce(sel.account,'account_1'),
            nullif(trim(CASE WHEN sel.account='account_2' THEN s.bank_name_2 ELSE s.bank_name END),''),
            nullif(regexp_replace(CASE WHEN sel.account='account_2' THEN s.bank_account_no_2 ELSE s.bank_account_no END,'[[:space:]-]','','g'),'')
        FROM hr_monthly_payroll mp JOIN hr_staff_costs s ON s.id=mp.staff_id
        LEFT JOIN departments d ON d.id=s.department_id
        JOIN payroll_salary_components(p_period) c ON c.row_id=mp.id AND c.scope='staff'
        LEFT JOIN LATERAL (SELECT x->>'account' account FROM jsonb_array_elements(p_component_selections) x
            WHERE (x->>'payroll_row_id')::uuid=mp.id AND x->>'component'=c.component) sel ON true
        WHERE mp.period_month=p_period AND c.amount>0 AND mp.status IN ('submitted','paid')
            AND (p_department_id IS NULL OR s.department_id=p_department_id)
            AND (p_payroll_row_ids IS NULL OR mp.id=ANY(p_payroll_row_ids))
            AND (p_component_selections IS NULL OR sel.account IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM payroll_salary_coverage(p_period) cov WHERE cov.row_id=mp.id AND cov.scope='staff' AND cov.component=c.component)
        ORDER BY mp.id,c.component FOR UPDATE OF mp FOR SHARE OF s;
    ELSE
        INSERT INTO pg_temp.tmp_pv_rows
        SELECT dmp.id,c.amount,dmp.employee_name,dmp.employee_code,NULL,'Directors',c.component,'account_1',NULL,NULL
        FROM director_monthly_payroll dmp
        JOIN payroll_salary_components(p_period) c ON c.row_id=dmp.id AND c.scope='directors'
        WHERE dmp.period_month=p_period AND c.amount>0
            AND (p_payroll_row_ids IS NULL OR dmp.id=ANY(p_payroll_row_ids))
            AND (p_component_selections IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_component_selections) x
                WHERE (x->>'payroll_row_id')::uuid=dmp.id AND x->>'component'='net' AND x->>'account'='account_1'))
            AND NOT EXISTS (SELECT 1 FROM payroll_salary_coverage(p_period) cov WHERE cov.row_id=dmp.id AND cov.scope='directors' AND cov.component=c.component)
        ORDER BY dmp.id FOR UPDATE OF dmp;
    END IF;
    SELECT count(*) INTO v_selected FROM pg_temp.tmp_pv_rows;
    IF p_component_selections IS NOT NULL AND v_selected<>jsonb_array_length(p_component_selections) THEN
        RAISE EXCEPTION 'Salary component selection has changed or already has a PV. Refresh and select the remaining payments.';
    END IF;
    IF p_payroll_row_ids IS NOT NULL AND (SELECT count(DISTINCT payroll_id) FROM pg_temp.tmp_pv_rows)<>cardinality(p_payroll_row_ids) THEN
        RAISE EXCEPTION 'Employee selection has changed or is outside this payroll group. Refresh the remaining payments.';
    END IF;
    IF v_selected=0 THEN RAISE EXCEPTION 'No remaining positive salary payments for this selection.'; END IF;
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
                (voucher_id, scope, payroll_row_id, period_month, employee_name, employee_code, department_id, department_name, net, salary_component, recipient_account, bank_name, bank_account_no)
            VALUES
                (v_voucher_id, p_scope, v_row.payroll_id, p_period, v_row.employee_name, v_row.employee_code, v_row.department_id, v_row.dept_name, v_row.net, v_row.salary_component, v_row.recipient_account, v_row.bank_name, v_row.bank_account_no);

            v_count := v_count + 1;
            v_people := v_people + 1;
            v_total := v_total + v_row.net;
        END LOOP;
    ELSE
        -- One voucher per department (directors: one for the batch), the
        -- people as lines. reference_id = the department (NULL for directors).
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
        'group_id', v_group_id,
        'scope', p_scope,
        'granularity', p_granularity,
        'count', v_count,
        'people', (SELECT count(DISTINCT payroll_id) FROM pg_temp.tmp_pv_rows),
        'total', v_total
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_payroll_disbursement_vouchers(date,text,date,text,uuid,uuid[],jsonb) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.create_payroll_disbursement_vouchers(date,text,date,text,uuid,uuid[],jsonb) TO authenticated;

-- Keep the funding/statutory envelope; replace only the salary coverage read.
ALTER FUNCTION public.payment_cycle(date) RENAME TO payment_cycle_before_salary_components;
REVOKE ALL ON FUNCTION public.payment_cycle_before_salary_components(date) FROM public,anon,authenticated;
CREATE FUNCTION public.payment_cycle(p_period date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'),false) THEN
        RAISE EXCEPTION 'payment_cycle: not permitted' USING ERRCODE='insufficient_privilege';
    END IF;
    result:=payment_cycle_before_salary_components(p_period);
    RETURN result || jsonb_build_object('people', (
        SELECT coalesce(jsonb_agg(person || jsonb_build_object(
            'source',mp.source,'payout_split_version',mp.payout_split_version,
            'bank_name_2',s.bank_name_2,'bank_account_no_2',s.bank_account_no_2,
            'voucher',CASE WHEN mp.source='commission' AND mp.payout_split_version=2 THEN NULL ELSE person->'voucher' END,
            'components',(SELECT coalesce(jsonb_agg(jsonb_build_object(
                'component',c.component,'amount',c.amount,
                'recipient_account',covered.recipient_account,'bank_name',covered.bank_name,'bank_account_no',covered.bank_account_no,
                'voucher',covered.voucher) ORDER BY c.component),'[]'::jsonb)
                FROM payroll_salary_components(p_period) c
                LEFT JOIN LATERAL (
                    SELECT l.recipient_account,l.bank_name,l.bank_account_no,jsonb_build_object(
                        'id',pv.id,'no',pv.voucher_no,'status',pv.status,'payment_date',pv.payment_date,
                        'created_at',pv.created_at,'approved_at',pv.approved_at,
                        'granularity',CASE WHEN pv.reference_id=c.row_id THEN 'employee' ELSE 'department' END,
                        'group_id',(SELECT ar.group_id FROM approval_requests ar WHERE ar.reference_id=pv.id
                            AND ar.reference_table='payment_vouchers' LIMIT 1)) voucher
                    FROM payroll_salary_coverage(p_period) cov JOIN payment_vouchers pv ON pv.id=cov.voucher_id
                    LEFT JOIN payroll_voucher_lines l ON l.voucher_id=pv.id AND l.payroll_row_id=c.row_id AND l.scope=c.scope
                        AND l.salary_component IN ('net',c.component)
                    WHERE cov.row_id=c.row_id AND cov.scope=c.scope AND cov.component=c.component
                    ORDER BY pv.created_at DESC LIMIT 1
                ) covered ON true
                WHERE c.row_id=(person->>'row_id')::uuid AND c.scope=person->>'scope')
            ) ORDER BY person->>'dept_name',person->>'name'),'[]'::jsonb)
        FROM jsonb_array_elements(result->'people') person
        LEFT JOIN hr_monthly_payroll mp ON mp.id=(person->>'row_id')::uuid AND person->>'scope'='staff'
        LEFT JOIN hr_staff_costs s ON s.id=mp.staff_id
    ));
END $f$;
REVOKE ALL ON FUNCTION public.payment_cycle(date) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.payment_cycle(date) TO authenticated;

-- A Basic PV alone cannot mark a split salary paid. A void restores only its
-- component; old whole-net PVs still cover the entire row.
CREATE FUNCTION public.guard_payroll_salary_voucher() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $f$
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
        IF EXISTS (SELECT 1 FROM payroll_voucher_lines l
            JOIN LATERAL payroll_salary_coverage(l.period_month) cov ON cov.row_id=l.payroll_row_id AND cov.scope=l.scope
                AND (l.salary_component='net' OR cov.component=l.salary_component)
            WHERE l.voucher_id=OLD.id AND cov.voucher_id<>OLD.id) THEN
            RAISE EXCEPTION 'This salary component already has a replacement PV. The voided voucher cannot be restored.';
        END IF;
    END IF;
    RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.guard_payroll_salary_voucher() FROM public,anon,authenticated;
CREATE TRIGGER guard_payroll_salary_voucher BEFORE UPDATE OR DELETE ON public.payment_vouchers
    FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_salary_voucher();

CREATE FUNCTION public.guard_payroll_salary_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $f$
BEGIN
    IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    IF (TG_OP<>'INSERT' AND EXISTS (SELECT 1 FROM payroll_voucher_lines WHERE voucher_id=OLD.voucher_id))
        OR (TG_OP<>'DELETE' AND EXISTS (SELECT 1 FROM payroll_voucher_lines WHERE voucher_id=NEW.voucher_id)) THEN
        RAISE EXCEPTION 'Salary PV sources are fixed by the employee payment snapshots.';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $f$;
CREATE TRIGGER guard_payroll_salary_source BEFORE INSERT OR UPDATE OR DELETE ON public.payment_voucher_sources
    FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_salary_source();
CREATE FUNCTION public.guard_payroll_salary_line() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $f$
BEGIN
    RAISE EXCEPTION 'Salary payment lines are immutable employee and recipient account snapshots.';
END $f$;
CREATE TRIGGER guard_payroll_salary_line BEFORE UPDATE OR DELETE ON public.payroll_voucher_lines
    FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_salary_line();
REVOKE ALL ON FUNCTION public.guard_payroll_salary_source(),public.guard_payroll_salary_line() FROM public,anon,authenticated;

CREATE FUNCTION public.sync_payroll_salary_payment_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $f$
DECLARE affected record; complete boolean;
BEGIN
    IF NEW.reference_type IS DISTINCT FROM 'payroll_disbursement' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    -- Approval already holds the voucher tuple. Fail/retry instead of waiting
    -- behind a generator that holds the namespace lock and needs this tuple.
    IF NOT pg_try_advisory_xact_lock(hashtext('hv_voucher_no')) THEN
        RAISE EXCEPTION 'Salary payments are being updated; try again.';
    END IF;
    FOR affected IN SELECT DISTINCT l.scope,l.payroll_row_id row_id,l.period_month FROM payroll_voucher_lines l WHERE l.voucher_id=NEW.id
        UNION SELECT 'staff',mp.id,mp.period_month FROM hr_monthly_payroll mp WHERE mp.id=NEW.reference_id
            AND NOT EXISTS (SELECT 1 FROM payroll_voucher_lines l WHERE l.voucher_id=NEW.id)
        UNION SELECT 'directors',mp.id,mp.period_month FROM director_monthly_payroll mp WHERE mp.id=NEW.reference_id
            AND NOT EXISTS (SELECT 1 FROM payroll_voucher_lines l WHERE l.voucher_id=NEW.id)
    LOOP
        SELECT EXISTS (SELECT 1 FROM payroll_salary_components(affected.period_month) c WHERE c.row_id=affected.row_id AND c.scope=affected.scope AND c.amount>0)
            AND NOT EXISTS (SELECT 1 FROM payroll_salary_components(affected.period_month) c WHERE c.row_id=affected.row_id AND c.scope=affected.scope AND c.amount>0
                AND NOT EXISTS (SELECT 1 FROM payroll_salary_coverage(affected.period_month) cov JOIN payment_vouchers pv ON pv.id=cov.voucher_id
                    WHERE cov.row_id=c.row_id AND cov.scope=c.scope AND cov.component=c.component AND pv.status='paid')) INTO complete;
        IF affected.scope='staff' THEN
            IF complete THEN UPDATE hr_monthly_payroll SET status='paid' WHERE id=affected.row_id AND status='submitted';
            ELSE UPDATE hr_monthly_payroll SET status='submitted' WHERE id=affected.row_id AND status='paid'; END IF;
        END IF;
        -- Director payroll has its own submission lifecycle; its payment board
        -- uses the same exact coverage without changing that legacy lifecycle.
    END LOOP;
    RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.sync_payroll_salary_payment_status() FROM public,anon,authenticated;
CREATE TRIGGER sync_payroll_salary_payment_status AFTER UPDATE OF status ON public.payment_vouchers
    FOR EACH ROW EXECUTE FUNCTION public.sync_payroll_salary_payment_status();
NOTIFY pgrst,'reload schema';
COMMIT;
