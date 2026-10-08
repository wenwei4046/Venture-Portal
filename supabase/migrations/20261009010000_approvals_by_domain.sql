-- ============================================================================
-- 20261009010000_approvals_by_domain.sql
-- Approvals go by domain (PR2b of the People Management revamp).
-- ============================================================================
--
-- PR2 (20261008200000) made every write ask for its own cell — except the
-- approval queue: its functions still asked `role = 'principal'`, and its page
-- opened on the `approvals` key, which only an owner's template can hold (it
-- carries the admin scope). So a Director whose template says Approvals ·
-- Approve, or a Finance · Checker whose Treasury · Approve is meant to sign off
-- what makers raise, could decide nothing.
--
-- Now a request is decided by whoever holds the Approve of its DOMAIN, or the
-- queue's own Approve (everything in it):
--   treasury        payment vouchers, loans, fund sources and their
--                   cancellations (tier_change on a fund source), department
--                   expenses and payment requests, advances, withdrawals,
--                   escalations, base-rate changes
--   hr_costing      payroll runs, HR cost submissions
--   director_salary Invoice Pool releases
--   the queue only  contracts (Billing has no Approve)
-- and never by whoever raised it, unless their account is the owner kind
-- (the Principal approves their own — user 2026-08-06; a checker approving
-- their own submission is no check).
--
--   approval_domain(type)        the function whose Approve signs it off
--   approvable_types()           the request types the caller may decide
--   approver_may(user, types, submitters)
--   approver_may_request(user, approval_id) / approver_may_group(user, group_id)
--
-- With no sign-in (the service role, the database) the old rule stands: the
-- account handed in must be a Principal; nobody handed in is the system.
--
-- The queue itself: a new key, `approvals_queue` (no table scope), opened by
-- Approvals · View — so a Director or the Executive office reaches the page
-- without the admin-scope `approvals` key. Row policies let a decider read and
-- flip the requests they may decide, and a Treasury approver update the loans
-- and bank balances an approval moves (Treasury · Approve already means
-- amending a booked loan).
--
-- The ten functions keep production's bodies: each has its one role check
-- swapped in place (pg_get_functiondef + replace), refused unless that exact
-- statement is there once — nothing else in them moves.

-- ─── The queue's own key ────────────────────────────────────────────────────

INSERT INTO public.permission_defs (key, label, section, scope, description, sort_order)
VALUES ('approvals_queue', 'Approval queue', 'Daily', 'none',
        'Open the approval queue: see what waits, and decide what one''s own Approve reaches. No other power.', 21)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.permission_cell_keys (function_key, action, legacy_key, min_scope, gate)
VALUES ('approvals', 'view', 'approvals_queue', 'all', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_key_actions (legacy_key, function_key, action)
VALUES ('approvals_queue', 'approvals', 'view')
ON CONFLICT DO NOTHING;

-- Approve in HR Costing, Director Salary and Revenue now means deciding
-- somebody else's request in the queue (a payroll run, an Invoice Pool
-- release). Those keys never could — only the Principal decided — so they stop
-- saying so: the queue's own key, the Principal's, carries the three instead,
-- and nobody's access moves (hr@ approves no payroll run, as before).
UPDATE public.permission_key_actions SET legacy_key = 'approvals' WHERE legacy_key = 'hr_costing' AND function_key = 'hr_costing' AND action = 'approve';
UPDATE public.permission_key_actions SET legacy_key = 'approvals' WHERE legacy_key = 'director_salary' AND function_key = 'director_salary' AND action = 'approve';
UPDATE public.permission_key_actions SET legacy_key = 'approvals' WHERE legacy_key = 'revenue' AND function_key = 'revenue' AND action = 'approve';

-- ─── Who decides what ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approval_domain(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE p_type
    WHEN 'payment_voucher' THEN 'treasury'
    WHEN 'new_loan' THEN 'treasury'
    WHEN 'loan_cancel' THEN 'treasury'
    WHEN 'new_fund_source' THEN 'treasury'
    WHEN 'tier_change' THEN 'treasury'
    WHEN 'base_rate' THEN 'treasury'
    WHEN 'dept_expense' THEN 'treasury'
    WHEN 'dept_payment_request' THEN 'treasury'
    WHEN 'advance' THEN 'treasury'
    WHEN 'profit_withdrawal' THEN 'treasury'
    WHEN 'escalation' THEN 'treasury'
    WHEN 'payroll_run' THEN 'hr_costing'
    WHEN 'hr_costing' THEN 'hr_costing'
    WHEN 'invoice_pool_release' THEN 'director_salary'
  END;
$fn$;

COMMENT ON FUNCTION public.approval_domain(text) IS
  'The function whose Approve signs off a request type (NULL = only the queue''s own Approve: contracts). Twin: APPROVAL_DOMAIN in lib/approval-domains.ts.';

-- The request types the caller may decide: every one with Approvals · Approve,
-- else those whose domain's Approve they hold — at All, with the domain's
-- pages open to them (has_action's rule, read once).
CREATE OR REPLACE FUNCTION public.approvable_types()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT public.current_actions() AS acts, public.current_permissions() AS perms
  ), held AS (
    SELECT f.fn
      FROM me, unnest(ARRAY['approvals', 'treasury', 'hr_costing', 'director_salary']) AS f(fn)
     WHERE me.acts ->> (f.fn || '.approve') = 'all'
       AND (NOT EXISTS (SELECT 1 FROM public.permission_key_actions k
                         WHERE k.function_key = f.fn AND k.action = 'view')
            OR EXISTS (SELECT 1 FROM public.permission_key_actions k
                        WHERE k.function_key = f.fn AND k.action = 'view' AND k.legacy_key = ANY (me.perms)))
  )
  SELECT coalesce(array_agg(e.enumlabel::text ORDER BY e.enumsortorder), '{}')
    FROM pg_enum e
   WHERE e.enumtypid = 'public.approval_request_type'::regtype
     AND (EXISTS (SELECT 1 FROM held WHERE fn = 'approvals')
          OR public.approval_domain(e.enumlabel::text) IN (SELECT fn FROM held));
$fn$;

CREATE OR REPLACE FUNCTION public.approver_may(p_user uuid, p_types text[], p_submitters uuid[] DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- No sign-in (the service role, the database): the rule as it was — the
  -- account handed in must be a Principal; nobody handed in is the system.
  IF auth.uid() IS NULL THEN
    RETURN p_user IS NULL
        OR EXISTS (SELECT 1 FROM public.users WHERE id = p_user AND is_active AND role = 'principal');
  END IF;
  -- Signed in: only as yourself, and only what your cells reach …
  IF p_user IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;
  IF NOT (coalesce(p_types, '{}') <@ public.approvable_types()) THEN
    RETURN false;
  END IF;
  -- … and not your own request, unless your account is the owner kind.
  IF auth.uid() = ANY (coalesce(p_submitters, '{}'))
     AND public.current_user_role() IS DISTINCT FROM 'principal' THEN
    RETURN false;
  END IF;
  RETURN true;
END
$fn$;

-- One request (an unknown id is left to the caller's own "not found").
CREATE OR REPLACE FUNCTION public.approver_may_request(p_user uuid, p_approval_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(
    (SELECT public.approver_may(p_user, ARRAY[r.request_type::text], ARRAY[r.submitted_by])
       FROM public.approval_requests r WHERE r.id = p_approval_id),
    public.approver_may(p_user, '{}', NULL));
$fn$;

-- A combined approval: every request still pending in it.
CREATE OR REPLACE FUNCTION public.approver_may_group(p_user uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.approver_may(p_user,
           coalesce(array_agg(DISTINCT r.request_type::text), '{}'),
           coalesce(array_agg(DISTINCT r.submitted_by), '{}'))
    FROM public.approval_requests r
   WHERE r.group_id = p_group_id AND r.status = 'pending';
$fn$;

REVOKE ALL ON FUNCTION public.approval_domain(text), public.approvable_types(),
  public.approver_may(uuid, text[], uuid[]), public.approver_may_request(uuid, uuid),
  public.approver_may_group(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approval_domain(text), public.approvable_types(),
  public.approver_may(uuid, text[], uuid[]), public.approver_may_request(uuid, uuid),
  public.approver_may_group(uuid, uuid) TO authenticated, service_role;

-- ─── The approval functions: one role check each, swapped in place ───────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  IF (length(v_src) - length(replace(v_src, p_old, ''))) / length(p_old) <> 1 THEN
    RAISE EXCEPTION '%: its role check is not the statement this migration replaces', p_sig;
  END IF;
  EXECUTE replace(pg_get_functiondef(p_sig), p_old, p_new);
END
$fn$;

SELECT pg_temp.swap_check('public.approve_single_voucher(uuid,uuid,text,boolean)',
  $old$IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_single_voucher: only Principal may approve, got %', v_approver_role; END IF;$old$,
  $new$IF NOT public.approver_may_request(p_user_id, p_approval_id) THEN RAISE EXCEPTION 'approve_single_voucher: % may not decide this request', v_approver_role USING ERRCODE = '42501'; END IF;$new$);

SELECT pg_temp.swap_check('public.approve_voucher_batch(uuid,uuid,text)',
  $old$IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_voucher_batch: only Principal may approve, got %', v_approver_role; END IF;$old$,
  $new$IF NOT public.approver_may_group(p_user_id, p_group_id) THEN RAISE EXCEPTION 'approve_voucher_batch: % may not decide this group', v_approver_role USING ERRCODE = '42501'; END IF;$new$);

SELECT pg_temp.swap_check('public.approve_voucher_batch_partial(uuid,uuid[],uuid[],uuid,text,text)',
  $old$IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_voucher_batch_partial: only Principal may approve, got %', v_approver_role; END IF;$old$,
  $new$IF NOT public.approver_may_group(p_user_id, p_group_id) THEN RAISE EXCEPTION 'approve_voucher_batch_partial: % may not decide this group', v_approver_role USING ERRCODE = '42501'; END IF;$new$);

SELECT pg_temp.swap_check('public.approve_payroll_run(uuid,uuid)',
  $old$IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'approve_payroll_run: only Principal may approve, got %',
            v_approver_role;
    END IF;$old$,
  $new$IF NOT public.approver_may(p_approver, ARRAY['payroll_run'],
                                   ARRAY(SELECT submitted_by FROM payroll_runs WHERE id = p_run_id)) THEN
        RAISE EXCEPTION 'approve_payroll_run: % may not approve this run', v_approver_role USING ERRCODE = '42501';
    END IF;$new$);

SELECT pg_temp.swap_check('public.reject_payroll_run(uuid,uuid,text)',
  $old$IF v_approver_role <> 'principal' THEN
        RAISE EXCEPTION 'reject_payroll_run: only Principal may reject, got %', v_approver_role;
    END IF;$old$,
  $new$IF NOT public.approver_may(p_approver, ARRAY['payroll_run'],
                                   ARRAY(SELECT submitted_by FROM payroll_runs WHERE id = p_run_id)) THEN
        RAISE EXCEPTION 'reject_payroll_run: % may not reject this run', v_approver_role USING ERRCODE = '42501';
    END IF;$new$);

-- A booked loan or fund source is reversed only behind its approved
-- cancellation, and only by somebody who may decide one.
SELECT pg_temp.swap_check('public.execute_loan_cancel(uuid)',
  $old$IF v_role <> 'principal' THEN
        RAISE EXCEPTION 'execute_loan_cancel: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;$old$,
  $new$IF NOT public.approver_may(auth.uid(), ARRAY['loan_cancel'],
                                   ARRAY(SELECT submitted_by FROM approval_requests
                                          WHERE request_type = 'loan_cancel' AND reference_id = p_loan_id)) THEN
        RAISE EXCEPTION 'execute_loan_cancel: % may not cancel a booked loan', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM approval_requests
          WHERE request_type = 'loan_cancel' AND reference_id = p_loan_id AND status = 'approved') THEN
        RAISE EXCEPTION 'execute_loan_cancel: loan % has no approved cancellation', p_loan_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;$new$);

SELECT pg_temp.swap_check('public.execute_fund_source_cancel(uuid)',
  $old$IF v_role <> 'principal' THEN
        RAISE EXCEPTION 'execute_fund_source_cancel: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;$old$,
  $new$IF NOT public.approver_may(auth.uid(), ARRAY['tier_change'],
                                   ARRAY(SELECT submitted_by FROM approval_requests
                                          WHERE request_type = 'tier_change' AND reference_table = 'fund_sources'
                                            AND reference_id = p_fund_source_id)) THEN
        RAISE EXCEPTION 'execute_fund_source_cancel: % may not cancel a booked fund source', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM approval_requests
          WHERE request_type = 'tier_change' AND reference_table = 'fund_sources'
            AND reference_id = p_fund_source_id AND status = 'approved') THEN
        RAISE EXCEPTION 'execute_fund_source_cancel: fund source % has no approved cancellation', p_fund_source_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;$new$);

SELECT pg_temp.swap_check('public.approve_dept_payment_expense(uuid)',
  $old$IF current_user_role() <> 'principal' THEN
        RAISE EXCEPTION 'Only principal can approve'
            USING ERRCODE = 'insufficient_privilege';
    END IF;$old$,
  $new$IF NOT public.approver_may_request(auth.uid(), p_approval_id) THEN
        RAISE EXCEPTION 'You may not approve this department request'
            USING ERRCODE = 'insufficient_privilege';
    END IF;$new$);

SELECT pg_temp.swap_check('public.reject_dept_payment_request(uuid)',
  $old$IF current_user_role() <> 'principal' THEN
        RAISE EXCEPTION 'Only principal can reject' USING ERRCODE = 'insufficient_privilege';
    END IF;$old$,
  $new$IF NOT public.approver_may_request(auth.uid(), p_approval_id) THEN
        RAISE EXCEPTION 'You may not reject this department request' USING ERRCODE = 'insufficient_privilege';
    END IF;$new$);

-- Rejecting a payment voucher hands its department request back to Finance:
-- whoever may decide a voucher may do that too.
SELECT pg_temp.swap_check('public.dept_request_pv_rejected(uuid)',
  $old$IF current_user_role() NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;$old$,
  $new$IF NOT (current_user_role() IN ('finance', 'principal') OR 'payment_voucher' = ANY (public.approvable_types())) THEN
        RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;$new$);

-- ─── Row policies: a decider reads and decides; a Treasury approver moves ────

DO $policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'approval_requests' AND policyname = 'approvals_decider_select') THEN
    CREATE POLICY approvals_decider_select ON public.approval_requests FOR SELECT TO authenticated
      USING ((SELECT public.has_action('approvals', 'view'))
             OR request_type::text IN (SELECT unnest(public.approvable_types())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'approval_requests' AND policyname = 'approvals_decider_update') THEN
    CREATE POLICY approvals_decider_update ON public.approval_requests FOR UPDATE TO authenticated
      USING (request_type::text IN (SELECT unnest(public.approvable_types()))
             AND ((SELECT public.current_user_role()) = 'principal' OR submitted_by IS DISTINCT FROM (SELECT auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'loans' AND policyname = 'loans_treasury_approver_update') THEN
    CREATE POLICY loans_treasury_approver_update ON public.loans FOR UPDATE TO authenticated
      USING ((SELECT public.has_action('treasury', 'approve')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_accounts' AND policyname = 'bank_treasury_approver_update') THEN
    CREATE POLICY bank_treasury_approver_update ON public.bank_accounts FOR UPDATE TO authenticated
      USING ((SELECT public.has_action('treasury', 'approve')));
  END IF;
END
$policies$;

NOTIFY pgrst, 'reload schema';
