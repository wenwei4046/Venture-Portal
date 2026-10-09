-- ============================================================================
-- 20261009050000_sensitive_fields_need_their_tick.sql
-- Salary amounts, NRIC / IC and bank account numbers show only where ticked
-- (PR4 of the People Management revamp, 2026-10-09).
-- ============================================================================
--
-- A permission template ticks which of the three its holders may see (the
-- design: "Hidden as •••• unless ticked, on every page this template can
-- open"), and `current_sensitive_fields()` answers it: the template's ticks,
-- or for an account with no template what its kind always saw (Principal and
-- HR: NRIC and bank accounts; Finance: bank accounts; salary with the
-- `salary_individual` key). Salary was already held to it — every key that
-- opens a pay page needs the Salary tick (PR1) — but nothing held NRIC and the
-- account numbers to theirs: any session that could read a staff row, a
-- director or a salary-PV line read them raw, the Director template (Salary
-- ticked, NRIC and Bank not) included, page or API.
--
-- 1. Those columns leave `authenticated`'s SELECT: hr_staff_costs.nric /
--    bank_account_no / bank_account_no_2, directors.nric,
--    payroll_voucher_lines.bank_account_no — and the per-person copies a
--    payroll submission keeps (hr_cost_submissions.staff_snapshot /
--    staff_allocation_snapshot), which the Treasury scope could read through
--    the API (nobody's page does; calculate_dept_np, as its owner, still does).
--    Every other column stays granted. INSERT and UPDATE are untouched.
-- 2. Three readers hand them out: the value to a holder of the tick, •••• to
--    anybody else, NULL as NULL — over exactly the rows the caller reads
--    under the table's own SELECT policies (checked below, so a policy that
--    changed under this migration stops it).
-- 3. payment_cycle (HR › Payment) masks the account numbers in its answer the
--    same way; production's body is kept, renamed, behind it.
-- 4. A salary PV carries the account numbers it was previewed with:
--    create_payroll_disbursement_vouchers asks for Bank accounts too.
-- 5. build_hr_cost_submission_payload stops copying NRIC and account numbers.
-- 6. employee_chart_lifecycle (INVOKER) read the whole staff row; it now names
--    the four fields it uses — `select *` is refused once (1) lands.
--
-- The two payroll files need the real numbers, so (the user's choice A) the
-- app refuses the bank file without Bank accounts and the statutory files
-- without NRIC / IC; the PV print shows ••••. lib/private-fields.ts.

-- ── 0. Production as this was written against ──────────────────────────────

DO $$
DECLARE
  v_norm text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.payment_cycle(date)'::regprocedure)
     IS DISTINCT FROM 'cf21b5c3c5580735dcf7af4112f3deb3' THEN
    RAISE EXCEPTION 'payment_cycle changed since this migration was written — compare production''s body first';
  END IF;

  -- The readers below repeat these row rules; if production's differ, stop.
  FOR v_norm IN
    SELECT tablename || ':' || string_agg(policyname || '=' ||
             regexp_replace(regexp_replace(lower(coalesce(qual, '')), '::text|\sas\s+[a-z_]+', '', 'g'), '[\s()]', '', 'g'),
             ' | ' ORDER BY policyname)
      FROM pg_policies
     WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL')
       AND tablename IN ('hr_staff_costs', 'directors', 'payroll_voucher_lines')
     GROUP BY tablename
  LOOP
    IF v_norm NOT IN (
      'directors:directors_pfh_select=selecthas_scopearray[''treasury'',''hr'']',
      'hr_staff_costs:hr_staff_costs_finance_own_dept_select=selecthas_scopearray[''treasury'']andselecthas_perm''payroll_payouts''andselectcurrent_user_department_idisnotnullanddepartment_id=selectcurrent_user_department_id | hr_staff_costs_ph_select=selecthas_scopearray[''hr'']',
      'payroll_voucher_lines:pvl_select=selecthas_scopearray[''hr'',''admin'']orselecthas_scopearray[''treasury'']andselecthas_perm''payroll_payouts'''
    ) THEN
      RAISE EXCEPTION 'A SELECT policy the readers repeat changed: %', v_norm;
    END IF;
  END LOOP;
END
$$;

-- ── The one question ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sees_sensitive(p_field text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_field = ANY (public.current_sensitive_fields())
$$;

COMMENT ON FUNCTION public.sees_sensitive(text) IS
  'Whether the caller may see salary / nric / bank (current_sensitive_fields). PR4, 2026-10-09.';

REVOKE ALL ON FUNCTION public.sees_sensitive(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sees_sensitive(text) TO authenticated, service_role;

-- A JSON answer with its account numbers / NRICs as •••• (any depth).
CREATE OR REPLACE FUNCTION public.mask_private_json(p jsonb, p_bank boolean, p_nric boolean)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  v jsonb;
  v_out jsonb;
BEGIN
  IF p IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p) = 'object' THEN
    v_out := '{}'::jsonb;
    FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
      IF jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') <> ''
         AND ((p_bank AND k IN ('bank_account_no', 'bank_account_no_2')) OR (p_nric AND k = 'nric')) THEN
        v_out := v_out || jsonb_build_object(k, '••••');
      ELSE
        v_out := v_out || jsonb_build_object(k, public.mask_private_json(v, p_bank, p_nric));
      END IF;
    END LOOP;
    RETURN v_out;
  ELSIF jsonb_typeof(p) = 'array' THEN
    RETURN (SELECT coalesce(jsonb_agg(public.mask_private_json(e, p_bank, p_nric) ORDER BY i), '[]'::jsonb)
              FROM jsonb_array_elements(p) WITH ORDINALITY AS x(e, i));
  END IF;
  RETURN p;
END
$$;

REVOKE ALL ON FUNCTION public.mask_private_json(jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mask_private_json(jsonb, boolean, boolean) TO authenticated, service_role;

-- ── 1. The columns leave the session's SELECT ───────────────────────────────

DO $$
DECLARE
  t record;
  v_cols text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('hr_staff_costs', ARRAY['nric', 'bank_account_no', 'bank_account_no_2']),
      ('directors', ARRAY['nric']),
      ('payroll_voucher_lines', ARRAY['bank_account_no']),
      ('hr_cost_submissions', ARRAY['staff_snapshot', 'staff_allocation_snapshot'])
    ) AS x(tbl, private)
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_cols
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.tbl AND column_name <> ALL (t.private);
    EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC, anon, authenticated', t.tbl);
    EXECUTE format('REVOKE SELECT (%s) ON public.%I FROM PUBLIC, anon, authenticated',
                   (SELECT string_agg(quote_ident(c), ', ') FROM unnest(t.private) c), t.tbl);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', v_cols, t.tbl);
  END LOOP;
END
$$;

-- ── 2. The readers ──────────────────────────────────────────────────────────

-- NRIC and the account numbers of these people (NULL: every row the caller
-- may read). The row rule is hr_staff_costs' own two SELECT policies.
CREATE OR REPLACE FUNCTION public.staff_private_fields(p_staff_ids uuid[] DEFAULT NULL)
RETURNS TABLE (id uuid, nric text, bank_account_no text, bank_account_no_2 text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS MATERIALIZED (
    SELECT public.sees_sensitive('nric') AS nric,
           public.sees_sensitive('bank') AS bank,
           public.has_scope(ARRAY['hr']) AS hr,
           public.has_scope(ARRAY['treasury']) AND public.has_perm('payroll_payouts') AS payouts,
           public.current_user_department_id() AS dept
  )
  SELECT s.id,
         CASE WHEN nullif(btrim(s.nric), '') IS NULL OR me.nric THEN s.nric ELSE '••••' END,
         CASE WHEN nullif(btrim(s.bank_account_no), '') IS NULL OR me.bank THEN s.bank_account_no ELSE '••••' END,
         CASE WHEN nullif(btrim(s.bank_account_no_2), '') IS NULL OR me.bank THEN s.bank_account_no_2 ELSE '••••' END
    FROM public.hr_staff_costs s, me
   WHERE (p_staff_ids IS NULL OR s.id = ANY (p_staff_ids))
     AND (me.hr OR (me.payouts AND me.dept IS NOT NULL AND s.department_id = me.dept))
$$;

-- Directors' NRIC (NULL: every director). The row rule is directors_pfh_select.
CREATE OR REPLACE FUNCTION public.director_private_fields(p_director_ids uuid[] DEFAULT NULL)
RETURNS TABLE (id uuid, nric text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS MATERIALIZED (
    SELECT public.sees_sensitive('nric') AS nric,
           public.has_scope(ARRAY['treasury', 'hr']) AS reads
  )
  SELECT d.id,
         CASE WHEN nullif(btrim(d.nric), '') IS NULL OR me.nric THEN d.nric ELSE '••••' END
    FROM public.directors d, me
   WHERE (p_director_ids IS NULL OR d.id = ANY (p_director_ids))
     AND me.reads
$$;

-- The account number each salary-PV line pays into. The row rule is pvl_select.
CREATE OR REPLACE FUNCTION public.payroll_line_accounts(p_line_ids uuid[])
RETURNS TABLE (id uuid, bank_account_no text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS MATERIALIZED (
    SELECT public.sees_sensitive('bank') AS bank,
           public.has_scope(ARRAY['hr', 'admin'])
             OR (public.has_scope(ARRAY['treasury']) AND public.has_perm('payroll_payouts')) AS reads
  )
  SELECT l.id,
         CASE WHEN nullif(btrim(l.bank_account_no), '') IS NULL OR me.bank THEN l.bank_account_no ELSE '••••' END
    FROM public.payroll_voucher_lines l, me
   WHERE l.id = ANY (p_line_ids)
     AND me.reads
$$;

REVOKE ALL ON FUNCTION public.staff_private_fields(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.director_private_fields(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payroll_line_accounts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_private_fields(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.director_private_fields(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payroll_line_accounts(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.staff_private_fields(uuid[]) IS
  'NRIC / account numbers of staff the caller may read: the value with the tick, •••• without. PR4, 2026-10-09.';
COMMENT ON FUNCTION public.director_private_fields(uuid[]) IS
  'Directors'' NRIC: the value with the NRIC tick, •••• without. PR4, 2026-10-09.';
COMMENT ON FUNCTION public.payroll_line_accounts(uuid[]) IS
  'The account number a salary-PV line pays into: the value with the Bank tick, •••• without. PR4, 2026-10-09.';

-- ── 3. payment_cycle: production's body, renamed, behind a mask ────────────

ALTER FUNCTION public.payment_cycle(date) RENAME TO payment_cycle_unmasked;
REVOKE ALL ON FUNCTION public.payment_cycle_unmasked(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_cycle_unmasked(date) TO service_role;

CREATE FUNCTION public.payment_cycle(p_period date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cycle jsonb;
BEGIN
  -- Its own check (HR Costing) runs inside, as the same signed-in person.
  v_cycle := public.payment_cycle_unmasked(p_period);
  IF public.sees_sensitive('bank') THEN
    RETURN v_cycle;
  END IF;
  RETURN public.mask_private_json(v_cycle, true, false);
END
$$;

REVOKE ALL ON FUNCTION public.payment_cycle(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_cycle(date) TO authenticated, service_role;

-- ── 4–6. Production's bodies, one statement swapped each ────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: the statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_check(
  'public.create_payroll_disbursement_vouchers(date,text,date,text,uuid,uuid[],jsonb)',
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.create']) THEN RAISE EXCEPTION 'create_payroll_disbursement_vouchers: needs HR Costing · Create' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.create']) THEN RAISE EXCEPTION 'create_payroll_disbursement_vouchers: needs HR Costing · Create' USING ERRCODE = '42501';
    END IF;
    -- A salary PV carries the account numbers it was previewed with (PR4).
    IF NOT public.sees_sensitive('bank') THEN RAISE EXCEPTION 'create_payroll_disbursement_vouchers: needs Bank accounts ticked — the PV carries the account numbers' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check(
  'public.build_hr_cost_submission_payload(date)',
  $q$SELECT COALESCE(jsonb_agg(to_jsonb(hsc) ORDER BY hsc.employee_name), '[]'::jsonb)$q$,
  $q$SELECT COALESCE(jsonb_agg(to_jsonb(hsc) - ARRAY['nric', 'bank_account_no', 'bank_account_no_2'] ORDER BY hsc.employee_name), '[]'::jsonb)$q$);

SELECT pg_temp.swap_check(
  'public.employee_chart_lifecycle(text,uuid,uuid,text,uuid,uuid,date)',
  $q$v_staff public.hr_staff_costs%rowtype;$q$,
  $q$v_staff record;  -- the four fields below; the row's NRIC / account numbers are not the session's to read (PR4)$q$);

SELECT pg_temp.swap_check(
  'public.employee_chart_lifecycle(text,uuid,uuid,text,uuid,uuid,date)',
  $q$select * into v_staff from public.hr_staff_costs where id = p_staff_id for update;$q$,
  $q$select id, employee_name, department_id, status, hire_date into v_staff from public.hr_staff_costs where id = p_staff_id for update;$q$);

-- ── Guards ──────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t record;
  c record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('hr_staff_costs', ARRAY['nric', 'bank_account_no', 'bank_account_no_2']),
      ('directors', ARRAY['nric']),
      ('payroll_voucher_lines', ARRAY['bank_account_no']),
      ('hr_cost_submissions', ARRAY['staff_snapshot', 'staff_allocation_snapshot'])
    ) AS x(tbl, private)
  LOOP
    FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.tbl LOOP
      IF has_column_privilege('authenticated', format('public.%I', t.tbl), c.column_name, 'SELECT')
         IS DISTINCT FROM (NOT (c.column_name = ANY (t.private))) THEN
        RAISE EXCEPTION '%.%: authenticated SELECT is not as planned', t.tbl, c.column_name;
      END IF;
      IF has_column_privilege('anon', format('public.%I', t.tbl), c.column_name, 'SELECT') THEN
        RAISE EXCEPTION '%.%: anon may still read it', t.tbl, c.column_name;
      END IF;
    END LOOP;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.payment_cycle_unmasked(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'payment_cycle_unmasked is callable by a session';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.employee_chart_lifecycle(text,uuid,uuid,text,uuid,uuid,date)'::regprocedure) ~* 'select\s+\*\s+into\s+v_staff' THEN
    RAISE EXCEPTION 'employee_chart_lifecycle still reads the whole staff row';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.build_hr_cost_submission_payload(date)'::regprocedure) !~ 'to_jsonb\(hsc\) - ARRAY' THEN
    RAISE EXCEPTION 'build_hr_cost_submission_payload still copies the NRIC and account numbers';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.create_payroll_disbursement_vouchers(date,text,date,text,uuid,uuid[],jsonb)'::regprocedure) !~ 'sees_sensitive\(''bank''\)' THEN
    RAISE EXCEPTION 'create_payroll_disbursement_vouchers does not ask for Bank accounts';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
