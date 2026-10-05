-- 20261006020000_act_only_as_yourself.sql
--
-- The second half of 20261006010000 (user 2026-10-06: "lock the signed-out
-- door now, then a separate PR for the rest"). That one made the portal's
-- unguarded SECURITY DEFINER functions need a login; this one stops a
-- signed-in user from using them as somebody else, or at all when they are
-- the database's own helpers.
--
-- 1. Approvals act only as the caller. approve_single_voucher,
--    approve_voucher_batch_partial, approve_payroll_run and reject_payroll_run
--    checked that the user id they are HANDED is an active Principal — never
--    that it is the caller's. Any signed-in Finance, HR or department account
--    that knew the Principal's id could approve as the Principal. Each now
--    refuses (42501) a JWT caller whose id is not the one handed in. The app
--    always hands in the signed-in user's own id, and a caller with no JWT
--    (the service role) is unchanged.
--
--    The repository's last full copies of these four had drifted from
--    production, so the guard is inserted INTO the live definition: read with
--    pg_get_functiondef, the guard added after the body's first BEGIN, and
--    the result checked — with the guard taken out again it must hash exactly
--    as the function did before, or the whole migration rolls back.
--
-- 2. get_payroll_breakdown_by_pool — Payroll Requests' pool lines — answers
--    only who may open that page: treasury, and payroll_payouts or hr_costing
--    (requirePayrollPayouts('treasury')). Same insertion, same check.
--
-- 3. post_journal_entry_as_caller — the one door the app posts journals
--    through (lib/journal.ts): the caller's own name, and a treasury, admin or
--    hr scope (every action that posts one — billing, payments, fund-out,
--    approvals, the payroll accruals — sits behind one of those). It hands on
--    to post_journal_entry, which 20261006030000 then closes to signed-in
--    callers once this code is live; the SECURITY DEFINER functions that post
--    journals for their own flows run as the owner and are unaffected.
--
-- 4. The database's own helpers, which no signed-in user calls — only other
--    SECURITY DEFINER functions (they run as the owner) or nobody, the retired
--    ones — are service role only: apply_pool_adjustment,
--    approve_voucher_batch, compute_commission, payroll_row_money,
--    payroll_row_settled_status, payroll_row_submitted_money,
--    payroll_statutory_entitlements (its INVOKER callers are themselves not
--    callable by authenticated), reopen_director_salary,
--    reverse_staff_payroll_accruals, submit_director_salary_to_finance,
--    submit_payroll_to_principal, voucher_party_refs.

-- ── 1 + 2. Guards inserted into the live definitions ─────────────────────────
DO $mig$
DECLARE
  r record;
  fn regprocedure;
  def text;
  head text;
  before_md5 text;
  after_src text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.approve_single_voucher(uuid,uuid,text,boolean)',
     E'\n -- Only as yourself (2026-10-06): the id handed in must be the caller''s own.\n IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN\n  RAISE EXCEPTION ''approve_single_voucher: you can only approve as yourself'' USING ERRCODE = ''42501'';\n END IF;'),
    ('public.approve_voucher_batch_partial(uuid,uuid[],uuid[],uuid,text,text)',
     E'\n -- Only as yourself (2026-10-06): the id handed in must be the caller''s own.\n IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN\n  RAISE EXCEPTION ''approve_voucher_batch_partial: you can only approve as yourself'' USING ERRCODE = ''42501'';\n END IF;'),
    ('public.approve_payroll_run(uuid,uuid)',
     E'\n -- Only as yourself (2026-10-06): the id handed in must be the caller''s own.\n IF auth.uid() IS NOT NULL AND p_approver IS DISTINCT FROM auth.uid() THEN\n  RAISE EXCEPTION ''approve_payroll_run: you can only approve as yourself'' USING ERRCODE = ''42501'';\n END IF;'),
    ('public.reject_payroll_run(uuid,uuid,text)',
     E'\n -- Only as yourself (2026-10-06): the id handed in must be the caller''s own.\n IF auth.uid() IS NOT NULL AND p_approver IS DISTINCT FROM auth.uid() THEN\n  RAISE EXCEPTION ''reject_payroll_run: you can only reject as yourself'' USING ERRCODE = ''42501'';\n END IF;'),
    ('public.get_payroll_breakdown_by_pool(uuid)',
     E'\n -- Payroll Requests'' own gate (2026-10-06): treasury, and payroll payouts or HR costing.\n IF auth.uid() IS NOT NULL AND NOT (public.has_perm(''treasury'') AND (public.has_perm(''payroll_payouts'') OR public.has_perm(''hr_costing''))) THEN\n  RAISE EXCEPTION ''get_payroll_breakdown_by_pool: payroll payouts are not yours to read'' USING ERRCODE = ''42501'';\n END IF;')
  ) AS t(sig, guard)
  LOOP
    fn := r.sig::regprocedure;
    SELECT md5(p.prosrc) INTO before_md5 FROM pg_proc p WHERE p.oid = fn;
    def := pg_get_functiondef(fn);
    IF strpos(def, r.guard) > 0 THEN CONTINUE; END IF;  -- already there: run twice, change nothing
    IF strpos(def, 'AS $function$') = 0 THEN RAISE EXCEPTION '%: unexpected definition shape', r.sig; END IF;
    head := substr(def, 1, strpos(def, 'AS $function$') + length('AS $function$') - 1);
    -- The body's first BEGIN opens its top-level block; the guard goes right after it.
    EXECUTE head || regexp_replace(substr(def, length(head) + 1), '\mBEGIN\M', 'BEGIN' || replace(r.guard, '\', '\\'));
    SELECT p.prosrc INTO after_src FROM pg_proc p WHERE p.oid = fn;
    IF strpos(after_src, r.guard) = 0 OR md5(replace(after_src, r.guard, '')) <> before_md5 THEN
      RAISE EXCEPTION '%: the guard did not land cleanly — nothing changed', r.sig;
    END IF;
  END LOOP;
END $mig$;

-- ── 3. The app's door to the general ledger ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_journal_entry_as_caller(
  p_transaction_date date,
  p_description text,
  p_reference_type text,
  p_reference_id uuid,
  p_created_by uuid,
  p_lines jsonb,
  p_segment gl_segment DEFAULT 'unallocated'::gl_segment
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 -- A journal is posted in your own name, by somebody whose work posts them.
 IF auth.uid() IS NULL OR p_created_by IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'post_journal_entry: a journal is posted in your own name' USING ERRCODE = '42501';
 END IF;
 IF NOT public.has_scope(ARRAY['treasury', 'admin', 'hr']) THEN
  RAISE EXCEPTION 'post_journal_entry: posting journals is not part of your work' USING ERRCODE = '42501';
 END IF;
 RETURN public.post_journal_entry(p_transaction_date, p_description, p_reference_type, p_reference_id,
  p_created_by, p_lines, p_segment);
END $function$;

COMMENT ON FUNCTION public.post_journal_entry_as_caller(date, text, text, uuid, uuid, jsonb, gl_segment) IS
  'The app''s door to post_journal_entry (lib/journal.ts): the caller''s own name and a treasury / admin / hr scope, then post_journal_entry as the owner. post_journal_entry itself is for the owner''s own flows and the service role (20261006030000).';

REVOKE ALL ON FUNCTION public.post_journal_entry_as_caller(date, text, text, uuid, uuid, jsonb, gl_segment) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry_as_caller(date, text, text, uuid, uuid, jsonb, gl_segment) TO authenticated, service_role;

-- ── 4. Helpers no signed-in user calls ──────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.apply_pool_adjustment(p_pool text, p_direction text, p_amount numeric, p_description text, p_user_id uuid, p_approval_id uuid, p_now timestamp with time zone, p_loan_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_voucher_batch(p_group_id uuid, p_user_id uuid, p_notes text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_commission(p_staff_id uuid, p_period date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_row_money(p_scope text, p_row_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_row_settled_status(p_scope text, p_row_id uuid, p_period date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_row_submitted_money(p_scope text, p_row_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.payroll_statutory_entitlements(p_period date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_director_salary(p_period date, p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_staff_payroll_accruals(p_period date, p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_director_salary_to_finance(p_period date, p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_payroll_to_principal(p_period date, p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.voucher_party_refs() FROM authenticated;

NOTIFY pgrst, 'reload schema';
