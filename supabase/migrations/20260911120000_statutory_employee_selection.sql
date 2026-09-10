-- Exact contribution coverage for department / manually selected statutory PVs.
-- Existing vouchers, approvals and accounting entries are never rewritten.
-- All generation routes share one transaction lock and the same coverage read.
BEGIN;

CREATE TABLE public.payroll_statutory_voucher_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id uuid NOT NULL REFERENCES public.payment_vouchers(id) ON DELETE CASCADE,
    scope text NOT NULL CHECK (scope IN ('staff', 'directors')),
    payroll_row_id uuid NOT NULL,
    period_month date NOT NULL CHECK (extract(day FROM period_month) = 1),
    scheme text NOT NULL CHECK (scheme IN ('KWSP','SOCSO','EIS','PCB','SKBBK')),
    employee_name text NOT NULL,
    employee_code text,
    department_id uuid REFERENCES public.departments(id),
    department_name text NOT NULL,
    amount numeric(15,2) NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(voucher_id, scope, payroll_row_id, scheme)
);
CREATE INDEX ON public.payroll_statutory_voucher_lines(period_month, scope, payroll_row_id, scheme);
ALTER TABLE public.payroll_statutory_voucher_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY psvl_select ON public.payroll_statutory_voucher_lines FOR SELECT
    USING ((SELECT coalesce(has_perm('hr_costing') OR has_perm('treasury'),false)));
REVOKE ALL ON public.payroll_statutory_voucher_lines FROM public, anon, authenticated;
GRANT SELECT ON public.payroll_statutory_voucher_lines TO authenticated;

-- Private read shared by the RPC and eligibility check. Includes deductions
-- even for zero-net payroll rows: net pay does not decide statutory liability.
CREATE FUNCTION public.payroll_statutory_people(p_period date)
RETURNS TABLE(row_id uuid, scope text, employee_name text, employee_code text,
    department_id uuid, department_name text, scheme text, amount numeric)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $f$
    SELECT p.row_id, p.scope, p.employee_name, p.employee_code,
           p.department_id, p.department_name, s.scheme, s.amount
    FROM (
        SELECT mp.id AS row_id, 'staff'::text AS scope, h.employee_name, h.employee_code,
               h.department_id, coalesce(d.name,'Unassigned') AS department_name,
               mp.epf_er, mp.epf_ee, mp.socso_er, mp.socso_ee, mp.eis_er, mp.eis_ee, mp.pcb, mp.skbbk_amount
        FROM hr_monthly_payroll mp JOIN hr_staff_costs h ON h.id = mp.staff_id
        LEFT JOIN departments d ON d.id = h.department_id WHERE mp.period_month = p_period
        UNION ALL
        SELECT dp.id, 'directors', dp.employee_name, dp.employee_code, NULL::uuid, 'Directors',
               dp.epf_er, dp.epf_ee, dp.socso_er, dp.socso_ee, dp.eis_er, dp.eis_ee, dp.pcb, dp.skbbk_amount
        FROM director_monthly_payroll dp WHERE dp.period_month = p_period
    ) p CROSS JOIN LATERAL (VALUES
        ('KWSP',coalesce(p.epf_er,0)+coalesce(p.epf_ee,0)),
        ('SOCSO',coalesce(p.socso_er,0)+coalesce(p.socso_ee,0)),
        ('EIS',coalesce(p.eis_er,0)+coalesce(p.eis_ee,0)),
        ('PCB',coalesce(p.pcb,0)),('SKBBK',coalesce(p.skbbk_amount,0))
    ) s(scheme,amount)
$f$;
REVOKE ALL ON FUNCTION public.payroll_statutory_people(date) FROM public, anon, authenticated;

-- Since 20260818110128 both shares use HR custody. Source pool alone cannot
-- tell a combined voucher from a staff-only or director-only voucher.
-- The repaired historical labels are authoritative; old unlabeled records
-- fall back to distinct director sources or an unambiguous amount match.
CREATE FUNCTION public.payroll_statutory_legacy_scopes(p_voucher_id uuid,p_period date,p_scheme text)
RETURNS text[] LANGUAGE plpgsql STABLE SET search_path = public,pg_temp AS $f$
DECLARE v record; v_staff numeric; v_directors numeric;
BEGIN
    -- SQL may evaluate this function before the caller's NOT EXISTS filter.
    IF EXISTS(SELECT 1 FROM payroll_statutory_voucher_lines WHERE voucher_id=p_voucher_id) THEN
        RETURN ARRAY(SELECT DISTINCT scope FROM payroll_statutory_voucher_lines WHERE voucher_id=p_voucher_id);
    END IF;
    SELECT description,amount,voucher_no,status,payee_name INTO v FROM payment_vouchers WHERE id=p_voucher_id;
    IF v.status='voided' OR v.payee_name IS DISTINCT FROM (CASE p_scheme WHEN 'KWSP' THEN 'KWSP'
        WHEN 'SOCSO' THEN 'PERKESO (SOCSO)' WHEN 'EIS' THEN 'PERKESO (EIS)' WHEN 'PCB' THEN 'LHDN' WHEN 'SKBBK' THEN 'SKBBK' END) THEN
        RETURN ARRAY[]::text[];
    END IF;
    IF coalesce(v.description,'') ~ '\(staff \+ directors\)\s*$' THEN RETURN ARRAY['staff','directors']; END IF;
    IF coalesce(v.description,'') ~ '\(directors\)\s*$' THEN RETURN ARRAY['directors']; END IF;
    IF coalesce(v.description,'') ~ '\(staff\)\s*$' THEN RETURN ARRAY['staff']; END IF;
    IF EXISTS(SELECT 1 FROM payment_voucher_sources WHERE voucher_id=p_voucher_id AND pool='dept_pool_director' AND amount>0) THEN
        IF EXISTS(SELECT 1 FROM payment_voucher_sources WHERE voucher_id=p_voucher_id AND pool='dept_pool_hr' AND amount>0) THEN RETURN ARRAY['staff','directors']; END IF;
        RETURN ARRAY['directors'];
    END IF;
    SELECT coalesce(sum(amount) FILTER(WHERE scope='staff'),0),coalesce(sum(amount) FILTER(WHERE scope='directors'),0)
      INTO v_staff,v_directors FROM payroll_statutory_people(p_period) WHERE scheme=p_scheme;
    IF v.amount=v_staff+v_directors THEN RETURN ARRAY['staff','directors']; END IF;
    IF v.amount=v_staff AND v.amount<>v_directors THEN RETURN ARRAY['staff']; END IF;
    IF v.amount=v_directors AND v.amount<>v_staff THEN RETURN ARRAY['directors']; END IF;
    RAISE EXCEPTION 'Legacy statutory PV % has ambiguous employee coverage; review its scope before generating further PVs',v.voucher_no;
END
$f$;
REVOKE ALL ON FUNCTION public.payroll_statutory_legacy_scopes(uuid,date,text) FROM public,anon,authenticated;

CREATE FUNCTION public.payroll_statutory_coverage(p_period date)
RETURNS TABLE(row_id uuid, scope text, scheme text, voucher_id uuid, amount numeric)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $f$
    SELECT l.payroll_row_id, l.scope, l.scheme, l.voucher_id, l.amount
    FROM payroll_statutory_voucher_lines l JOIN payment_vouchers pv ON pv.id = l.voucher_id
    WHERE l.period_month = p_period AND pv.status <> 'voided'
    UNION ALL
    -- Legacy vouchers have no lines. Read their historical scope correctly
    -- before and after both shares moved to the same HR custody pool.
    SELECT p.row_id, p.scope, p.scheme, pv.id, p.amount
    FROM payroll_statutory_people(p_period) p
    JOIN payroll_runs r ON r.period_month = p_period AND r.status <> 'rejected'
    JOIN payment_vouchers pv ON pv.reference_type = 'payroll_statutory' AND pv.reference_id = r.id
    WHERE pv.status <> 'voided' AND p.amount > 0
      AND pv.payee_name = CASE p.scheme WHEN 'KWSP' THEN 'KWSP' WHEN 'SOCSO' THEN 'PERKESO (SOCSO)'
          WHEN 'EIS' THEN 'PERKESO (EIS)' WHEN 'PCB' THEN 'LHDN' ELSE 'SKBBK' END
      AND NOT EXISTS (SELECT 1 FROM payroll_statutory_voucher_lines l WHERE l.voucher_id = pv.id)
      AND p.scope = ANY(payroll_statutory_legacy_scopes(pv.id,p_period,p.scheme))
$f$;
REVOKE ALL ON FUNCTION public.payroll_statutory_coverage(date) FROM public, anon, authenticated;

-- A compiled PV is a snapshot, not an editable free-form expense. Without
-- these guards the generic Finance editor could pay RM 1 while the original
-- contribution lines still claimed that the whole employee was covered.
CREATE FUNCTION public.guard_statutory_voucher_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $f$
DECLARE v_total numeric; v_scheme text;
BEGIN
    SELECT sum(amount),min(scheme) INTO v_total,v_scheme FROM payroll_statutory_voucher_lines WHERE voucher_id=OLD.id;
    IF v_total IS NULL THEN
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Compiled statutory PVs retain their contribution audit; void the voucher instead'; END IF;
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.payee_name IS DISTINCT FROM OLD.payee_name
       OR NEW.reference_type IS DISTINCT FROM OLD.reference_type OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
       OR NEW.source_pool IS DISTINCT FROM OLD.source_pool OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
       OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.direction IS DISTINCT FROM OLD.direction
       OR NEW.voucher_type IS DISTINCT FROM OLD.voucher_type THEN
        RAISE EXCEPTION 'Compiled statutory PV financial fields are fixed by its contribution lines; void and regenerate to change the selection';
    END IF;
    IF OLD.status='voided' AND NEW.status<>'voided' THEN RAISE EXCEPTION 'A voided statutory PV cannot be restored; generate remaining contributions instead'; END IF;
    IF NEW.status IN ('approved','paid') AND (
        NEW.amount IS DISTINCT FROM v_total OR NEW.amount IS DISTINCT FROM (SELECT sum(amount) FROM payment_voucher_sources WHERE voucher_id=OLD.id)
        OR EXISTS(SELECT 1 FROM payment_voucher_sources WHERE voucher_id=OLD.id AND (pool IS DISTINCT FROM 'dept_pool_hr'
            OR account_code IS DISTINCT FROM CASE v_scheme WHEN 'KWSP' THEN '4071' WHEN 'EIS' THEN '4073' WHEN 'PCB' THEN '4074' ELSE '4072' END))) THEN
        RAISE EXCEPTION 'Statutory contribution lines and custody sources must reconcile before approval';
    END IF;
    RETURN NEW;
END
$f$;
CREATE TRIGGER statutory_voucher_snapshot BEFORE UPDATE OR DELETE ON public.payment_vouchers
    FOR EACH ROW EXECUTE FUNCTION public.guard_statutory_voucher_snapshot();

CREATE FUNCTION public.guard_statutory_source_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $f$
BEGIN
    IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    IF (TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM payroll_statutory_voucher_lines WHERE voucher_id=OLD.voucher_id))
       OR (TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM payroll_statutory_voucher_lines WHERE voucher_id=NEW.voucher_id)) THEN
        RAISE EXCEPTION 'Compiled statutory PV sources are fixed by its contribution lines';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$f$;
CREATE TRIGGER statutory_source_snapshot BEFORE INSERT OR UPDATE OR DELETE ON public.payment_voucher_sources
    FOR EACH ROW EXECUTE FUNCTION public.guard_statutory_source_snapshot();

CREATE FUNCTION public.guard_statutory_line_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = public,pg_temp AS $f$
BEGIN
    RAISE EXCEPTION 'Statutory contribution lines are an immutable voucher snapshot';
END
$f$;
CREATE TRIGGER statutory_line_snapshot BEFORE UPDATE OR DELETE ON public.payroll_statutory_voucher_lines
    FOR EACH ROW EXECUTE FUNCTION public.guard_statutory_line_snapshot();
REVOKE ALL ON FUNCTION public.guard_statutory_voucher_snapshot(),public.guard_statutory_source_snapshot(),public.guard_statutory_line_snapshot() FROM public,anon,authenticated;

-- Private common writer. 'scheme' / 'all' are compatibility modes used only
-- by the old RPC wrappers. The new public entry point exposes two choices.
CREATE FUNCTION public.create_payroll_statutory_batch(
    p_period date, p_schemes text[], p_scope text, p_granularity text,
    p_department_id uuid, p_payroll_row_ids uuid[], p_payment_date date, p_bank_account_id uuid,
    p_expected_total numeric DEFAULT NULL, p_expected_count integer DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE
    v_caller uuid := auth.uid();
    v_run_id uuid; v_run_status text; v_bank_id uuid;
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

    -- Same namespace as salary PVs. Held to commit, before eligibility or
    -- numbering, so old/new statutory calls and overlapping selections agree.
    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));
    SELECT id, status INTO v_run_id, v_run_status FROM payroll_runs
        WHERE period_month = p_period AND status <> 'rejected' FOR UPDATE;
    IF v_run_id IS NULL THEN RAISE EXCEPTION 'No payroll run exists for period %', p_period; END IF;
    IF v_run_status NOT IN ('approved','paid') THEN RAISE EXCEPTION 'Statutory vouchers need an approved payroll run'; END IF;
    IF v_run_status <> 'paid' AND NOT EXISTS(SELECT 1 FROM payroll_payment_requests
        WHERE payroll_run_id = v_run_id AND status = 'completed') THEN
        RAISE EXCEPTION 'Payroll funding for period % is not completed yet', p_period;
    END IF;

    -- Lock amounts and staff department membership before materializing.
    -- There is no client-supplied amount, name, payee or account code.
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
    IF EXISTS (SELECT 1 FROM payroll_statutory_people(p_period) p WHERE p.amount < 0
        AND p.scheme = ANY(p_schemes) AND (p_scope = 'all' OR p.scope = p_scope)
        AND (p_department_id IS NULL OR p.department_id = p_department_id)
        AND (p_payroll_row_ids IS NULL OR p.row_id = ANY(p_payroll_row_ids))) THEN
        RAISE EXCEPTION 'Negative statutory contributions need payroll review before generating these PVs';
    END IF;
    DROP TABLE IF EXISTS pg_temp.tmp_statutory_rows;
    CREATE TEMP TABLE tmp_statutory_rows ON COMMIT DROP AS
        SELECT p.*, CASE p_granularity
            WHEN 'employee' THEN p.scope || ':' || p.row_id::text
            WHEN 'department' THEN p.scope || ':' || coalesce(p.department_id::text,'unassigned')
            ELSE 'scheme' END AS batch_key
        FROM payroll_statutory_people(p_period) p
        WHERE p.amount > 0 AND p.scheme = ANY(p_schemes) AND (p_scope = 'all' OR p.scope = p_scope)
          AND (p_department_id IS NULL OR p.department_id = p_department_id)
          AND (p_payroll_row_ids IS NULL OR p.row_id = ANY(p_payroll_row_ids))
          AND NOT EXISTS (SELECT 1 FROM payroll_statutory_coverage(p_period) c
              WHERE c.scope = p.scope AND c.row_id = p.row_id AND c.scheme = p.scheme);
    SELECT count(DISTINCT (scope,row_id)) INTO v_people FROM pg_temp.tmp_statutory_rows;
    IF p_payroll_row_ids IS NOT NULL AND v_people <> cardinality(p_payroll_row_ids) THEN
        RAISE EXCEPTION 'Employee selection has changed, is outside this department, has no contributions, or is already covered. Refresh and select remaining employees';
    END IF;
    IF v_people = 0 THEN RAISE EXCEPTION 'No uncovered statutory contributions remain for this selection'; END IF;
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
            'bank_transfer',p_payment_date,
            'dept_pool_hr',
            v_bank_id,'payroll_statutory',v_run_id,v_caller) RETURNING id INTO v_id;
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
$f$;
REVOKE ALL ON FUNCTION public.create_payroll_statutory_batch(date,text[],text,text,uuid,uuid[],date,uuid,numeric,integer) FROM public,anon,authenticated;

CREATE FUNCTION public.create_payroll_statutory_selection(p_period date,p_schemes text[],p_scope text,p_granularity text,
    p_department_id uuid DEFAULT NULL,p_payroll_row_ids uuid[] DEFAULT NULL,p_payment_date date DEFAULT NULL,
    p_expected_total numeric DEFAULT NULL,p_expected_count integer DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $f$
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'),false) THEN
        RAISE EXCEPTION 'Statutory selection is not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_scope IS NULL OR p_scope NOT IN ('staff','directors') OR p_granularity IS NULL OR p_granularity NOT IN ('employee','department') THEN
        RAISE EXCEPTION 'Choose a department or employees';
    END IF;
    IF p_granularity = 'employee' AND p_payroll_row_ids IS NULL THEN RAISE EXCEPTION 'Select at least one employee'; END IF;
    RETURN create_payroll_statutory_batch(p_period,p_schemes,p_scope,p_granularity,p_department_id,p_payroll_row_ids,p_payment_date,NULL,p_expected_total,p_expected_count);
END
$f$;
REVOKE ALL ON FUNCTION public.create_payroll_statutory_selection(date,text[],text,text,uuid,uuid[],date,numeric,integer) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.create_payroll_statutory_selection(date,text[],text,text,uuid,uuid[],date,numeric,integer) TO authenticated;

-- Older Finance clients retain their signature and response shape. They now
-- generate only remaining coverage and cannot duplicate a new manual batch.
CREATE OR REPLACE FUNCTION public.create_payroll_statutory_vouchers(p_period date,p_scheme text,p_payment_date date DEFAULT NULL,p_bank_account_id uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $f$
DECLARE result json;
BEGIN
    result := create_payroll_statutory_batch(p_period,ARRAY[p_scheme],'all','scheme',NULL,NULL,p_payment_date,p_bank_account_id);
    RETURN (result::jsonb->'vouchers'->0)::json;
END
$f$;
CREATE OR REPLACE FUNCTION public.create_payroll_statutory_director_topup(p_period date,p_scheme text,p_payment_date date DEFAULT NULL,p_bank_account_id uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $f$
DECLARE result json;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing') OR has_perm('treasury'),false) THEN
        RAISE EXCEPTION 'Statutory generation is not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('hv_voucher_no'));
    IF NOT EXISTS (SELECT 1 FROM payment_vouchers pv JOIN payroll_runs r ON r.id = pv.reference_id
        WHERE r.period_month = p_period AND r.status <> 'rejected' AND pv.reference_type = 'payroll_statutory'
          AND pv.status <> 'voided' AND pv.payee_name = CASE p_scheme WHEN 'KWSP' THEN 'KWSP'
            WHEN 'SOCSO' THEN 'PERKESO (SOCSO)' WHEN 'EIS' THEN 'PERKESO (EIS)' WHEN 'PCB' THEN 'LHDN' WHEN 'SKBBK' THEN 'SKBBK' END) THEN
        RAISE EXCEPTION 'No scheme voucher exists yet; generate the department or selected employees instead';
    END IF;
    result := create_payroll_statutory_batch(p_period,ARRAY[p_scheme],'directors','scheme',NULL,NULL,p_payment_date,p_bank_account_id);
    RETURN (result::jsonb->'vouchers'->0)::json;
END
$f$;
REVOKE ALL ON FUNCTION public.create_payroll_statutory_vouchers(date,text,date,uuid), public.create_payroll_statutory_director_topup(date,text,date,uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.create_payroll_statutory_vouchers(date,text,date,uuid), public.create_payroll_statutory_director_topup(date,text,date,uuid) TO authenticated;

-- Add an exact-coverage read without copying the existing cycle RPC. Rename
-- the prior implementation as a private helper and keep the public contract.
ALTER FUNCTION public.payment_cycle(date) RENAME TO payment_cycle_before_statutory_selection;
REVOKE ALL ON FUNCTION public.payment_cycle_before_statutory_selection(date) FROM public,anon,authenticated;
CREATE FUNCTION public.payment_cycle(p_period date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $f$
DECLARE cycle jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'),false) THEN
        RAISE EXCEPTION 'payment_cycle: not permitted' USING ERRCODE = 'insufficient_privilege';
    END IF;
    cycle := payment_cycle_before_statutory_selection(p_period);
    RETURN cycle || jsonb_build_object('statutory_coverage',
        (SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM payroll_statutory_coverage(p_period) c),
        'statutory_completion', (SELECT coalesce(jsonb_agg(jsonb_build_object('period',r.period_month,'complete',
            EXISTS (SELECT 1 FROM payroll_statutory_people(r.period_month) p WHERE p.amount > 0)
            AND NOT EXISTS (SELECT 1 FROM payroll_statutory_people(r.period_month) p WHERE p.amount < 0)
            AND NOT EXISTS (SELECT 1 FROM payroll_statutory_people(r.period_month) p WHERE p.amount > 0
                AND NOT EXISTS (SELECT 1 FROM payroll_statutory_coverage(r.period_month) c
                    JOIN payment_vouchers pv ON pv.id=c.voucher_id AND pv.status='paid'
                    WHERE c.row_id=p.row_id AND c.scope=p.scope AND c.scheme=p.scheme))
            AND NOT EXISTS (SELECT 1 FROM payment_vouchers pv WHERE pv.reference_type='payroll_statutory'
                AND pv.reference_id=r.id AND pv.status NOT IN ('paid','voided')))), '[]'::jsonb)
            FROM payroll_runs r WHERE r.status <> 'rejected'
                AND r.period_month BETWEEN (p_period - interval '4 months')::date AND (p_period + interval '1 month')::date));
END
$f$;
REVOKE ALL ON FUNCTION public.payment_cycle(date) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.payment_cycle(date) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
