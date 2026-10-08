-- ============================================================================
-- 20261009030000_functions_ask_for_the_action.sql
-- The database's own functions ask for the action too (PR3b of the People
-- Management revamp).
-- ============================================================================
--
-- PR3a (20261009020000) made every direct write ask for its cell. Writes inside
-- SECURITY DEFINER functions meet no row policy — they run as their owner — and
-- 70 of the app's write functions still asked who the caller WAS, not what
-- they may DO:
--
--   * by role — `IF v_role NOT IN ('finance', 'principal')`. A template's
--     hidden kind decides it: a Finance · Checker (kind finance) could book a
--     loan through the API although Treasury · Create is not theirs, and a
--     Director (kind staff) whose template HAS Treasury · Create was refused
--     the loan the app had just let them fill in;
--   * by key — `has_perm('hr_costing')`, `has_scope(ARRAY['hr'])`: a View cell
--     opens the key, so somebody who only reads payroll could submit it.
--
-- Each now asks for the action its app gate asks (requireAction … in the
-- server action that calls it), through PR3a's `has_any_action`. A function
-- that also runs INSIDE another one, as the same signed-in person, asks for
-- the outer path's actions too (mark_journal_entry_reversed,
-- assert_commission_payroll_open, payroll_send_back_batch). With no sign-in
-- (the service role, the database) each keeps what it did before: a check
-- that let a missing role through still does, one that refused it still does.
--
-- Production's bodies are kept: each function has its one check statement
-- swapped in place (pg_get_functiondef + replace), found whitespace-blind and
-- refused unless it is there exactly once — nothing else in them moves. Left
-- alone on purpose: the approvals (PR2b — by the request's domain; only
-- dept_request_pv_rejected's Finance half moves here), the permission
-- functions (`permissions_manage`), Department mode (`department_mode`),
-- reopening a closed payroll month (the Principal's, user's rule), the member
-- app's own keys, two helpers only the service role may call
-- (reopen_director_salary, reverse_staff_payroll_accruals), the commission-run
-- functions no page calls any more (apply / save / reopen_commission_run —
-- INVOKER, their writes meet PR3a's row rules), and every READ function —
-- whose reach (own / dept / all) is the next step.

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
    RAISE EXCEPTION '%: its check is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

SELECT pg_temp.swap_check('public.amend_fund_source(uuid,jsonb)',
  $q$if v_role <> 'principal' then raise exception 'amend_fund_source: unauthorized role %', v_role using errcode = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_fund_source: needs Treasury · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.amend_fund_source_from(uuid,date,numeric,integer,boolean,text,boolean)',
  $q$if v_role <> 'principal' then raise exception 'amend_fund_source_from: unauthorized role %', v_role using errcode = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_fund_source_from: needs Treasury · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.amend_loan(uuid,jsonb)',
  $q$if v_role <> 'principal' then raise exception 'amend_loan: unauthorized role %', v_role using errcode = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_loan: needs Treasury · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.amend_loan_from(uuid,date,numeric,integer,boolean,text,boolean)',
  $q$if v_role <> 'principal' then raise exception 'amend_loan_from: unauthorized role %', v_role using errcode = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'amend_loan_from: needs Treasury · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.revert_terms_change(text,uuid)',
  $q$if v_role <> 'principal' then raise exception 'revert_terms_change: unauthorized role %', v_role using errcode = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.approve']) THEN RAISE EXCEPTION 'revert_terms_change: needs Treasury · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.refresh_base_rate(numeric)',
  $q$IF v_role <> 'principal' THEN RAISE EXCEPTION 'refresh_base_rate: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['settings.manage']) THEN RAISE EXCEPTION 'refresh_base_rate: needs Settings · Manage' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.create_loan_with_approval(uuid,numeric,numeric,numeric,numeric,integer,text,text,date,text,uuid)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'create_loan_with_approval: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.create']) THEN RAISE EXCEPTION 'create_loan_with_approval: needs Treasury · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.cancel_loan_and_approval(uuid,text)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'cancel_loan_and_approval: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'cancel_loan_and_approval: needs Treasury · Void' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.request_loan_cancel(uuid,text)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'request_loan_cancel: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'request_loan_cancel: needs Treasury · Void' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.amend_loan_repayment(uuid,numeric,text)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'amend_loan_repayment: role % may not amend', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'amend_loan_repayment: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.amend_loan_repayment_date(uuid,date,text)',
  $q$IF v_role IS NULL OR v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'amend_loan_repayment_date: role % may not amend', COALESCE(v_role::text, '(none)') USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'amend_loan_repayment_date: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.void_loan_repayment(uuid)',
  $q$IF current_user_role() NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'void_loan_repayment: only Finance/Principal may void repayments' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'void_loan_repayment: needs Treasury · Void' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.set_loan_funding_source(uuid,text)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'set_loan_funding_source: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_loan_funding_source: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.set_loan_min_pay_interest(uuid,boolean)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'set_loan_min_pay_interest: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_loan_min_pay_interest: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.set_loan_repayment_start(uuid,date)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'set_loan_repayment_start: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_loan_repayment_start: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.set_fund_source_min_pay_interest(uuid,boolean)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'set_fund_source_min_pay_interest: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_fund_source_min_pay_interest: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.set_fund_source_notes(uuid,text)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'set_fund_source_notes: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_fund_source_notes: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.set_fund_source_repayment_start(uuid,date)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'set_fund_source_repayment_start: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'set_fund_source_repayment_start: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.withdraw_pending_fund_source(uuid)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'withdraw_pending_fund_source: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'withdraw_pending_fund_source: needs Treasury · Void' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.amend_voucher_date(uuid,date,text)',
  $q$IF v_role IS NULL OR v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'amend_voucher_date: role % may not amend', COALESCE(v_role::text, '(none)') USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'amend_voucher_date: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.reassign_voucher_gl_account(uuid,text,text,text)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'reassign_voucher_gl_account: role % may not reassign', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'reassign_voucher_gl_account: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.return_voucher_to_draft(uuid)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'return_voucher_to_draft: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'return_voucher_to_draft: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.delete_voucher_attachment(uuid)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'delete_voucher_attachment: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.edit']) THEN RAISE EXCEPTION 'delete_voucher_attachment: needs Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.close_approvals_for_voided_voucher(uuid)',
  $q$IF v_role NOT IN ('hr', 'finance', 'principal') THEN RAISE EXCEPTION 'close_approvals_for_voided_voucher: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'close_approvals_for_voided_voucher: needs Treasury · Void' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.reverse_voucher_pool_rows(text)',
  $q$IF current_user_role() NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'reverse_voucher_pool_rows: only finance/principal may reverse pool rows';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'reverse_voucher_pool_rows: needs Treasury · Void' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.bump_bank_balance(uuid,numeric)',
  $q$if v_role is null or v_role not in ('finance', 'principal') then raise exception 'bump_bank_balance: unauthorized role %', coalesce(v_role::text, 'none') using errcode = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve']) THEN RAISE EXCEPTION 'bump_bank_balance: needs Treasury · Create or Treasury · Edit or Treasury · Void or Treasury · Approve or Approvals · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.bump_bank_for_paid_credit(uuid)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'bump_bank_for_paid_credit: role % is not allowed', v_role;$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.create', 'treasury.create']) THEN RAISE EXCEPTION 'bump_bank_for_paid_credit: needs Billing · Create or Treasury · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.generate_pv_for_dept_request(uuid,uuid,text)',
  $q$IF current_user_role() NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'Only finance can generate PV' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.create']) THEN RAISE EXCEPTION 'generate_pv_for_dept_request: needs Treasury · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.cancel_dept_payment_request(uuid,text)',
  $q$IF current_user_role() NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'Only finance/principal can cancel a dept payment request' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['treasury.void']) THEN RAISE EXCEPTION 'cancel_dept_payment_request: needs Treasury · Void' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.claim_create_payment_voucher(uuid,uuid,text)',
  $q$IF auth.uid() IS NULL OR NOT public.has_perm('treasury') THEN RAISE EXCEPTION 'Only Finance may raise a payment voucher' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.create']) THEN RAISE EXCEPTION 'claim_create_payment_voucher: needs Treasury · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.generate_monthly_invoices(date,text[])',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'generate_monthly_invoices: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.create']) THEN RAISE EXCEPTION 'generate_monthly_invoices: needs Billing · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.generate_invoices_from_request(uuid)',
  $q$IF current_user_role() NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'Only finance can generate invoices' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.create']) THEN RAISE EXCEPTION 'generate_invoices_from_request: needs Billing · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.reject_invoice_request(uuid,text)',
  $q$IF current_user_role() NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'Only finance can reject' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.edit']) THEN RAISE EXCEPTION 'reject_invoice_request: needs Billing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.amend_issued_invoice(uuid,jsonb,jsonb,jsonb,text)',
  $q$IF v_role IS NULL OR v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'amend_issued_invoice: role % may not amend an invoice', COALESCE(v_role::text, 'none') USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['billing.edit']) THEN RAISE EXCEPTION 'amend_issued_invoice: needs Billing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.reassign_invoice_gl_account(uuid,text,text,text)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'reassign_invoice_gl_account: role % may not reassign', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.edit']) THEN RAISE EXCEPTION 'reassign_invoice_gl_account: needs Billing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.void_issued_invoice(uuid,text)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'void_issued_invoice: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.void']) THEN RAISE EXCEPTION 'void_issued_invoice: needs Billing · Void' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.mint_credit_note_no(date)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'mint_credit_note_no: only finance/principal may mint, got %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.create']) THEN RAISE EXCEPTION 'mint_credit_note_no: needs Billing · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.mint_invoice_no(date)',
  $q$IF v_role NOT IN ('finance', 'principal', 'dept_manager') THEN RAISE EXCEPTION 'mint_invoice_no: only finance/principal/dept_manager may mint, got %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.create', 'my_billing.create:dept']) THEN RAISE EXCEPTION 'mint_invoice_no: needs Billing · Create or My Billing · Create (Dept)' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.submit_invoice_request(date,date,date,text,text,jsonb)',
  $q$IF current_user_role() <> 'dept_manager' THEN RAISE EXCEPTION 'Only dept_manager can submit invoice requests' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['my_billing.create:dept']) THEN RAISE EXCEPTION 'submit_invoice_request: needs My Billing · Create (Dept)' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.submit_dept_payment_request(uuid,text,numeric,text,text)',
  $q$IF current_user_role() <> 'dept_manager' THEN RAISE EXCEPTION 'Only dept_manager can submit dept payment requests' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['my_billing.create:dept']) THEN RAISE EXCEPTION 'submit_dept_payment_request: needs My Billing · Create (Dept)' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.change_account_type(text,text)',
  $q$IF current_user_role() NOT IN ('principal', 'finance') THEN RAISE EXCEPTION 'change_account_type: only Finance/Principal may change account types' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['categories.manage']) THEN RAISE EXCEPTION 'change_account_type: needs Chart of Account · Manage' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.rename_account_code(text,text)',
  $q$IF current_user_role() NOT IN ('principal', 'finance') THEN RAISE EXCEPTION 'rename_account_code: only Finance/Principal may rename accounts' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['categories.manage']) THEN RAISE EXCEPTION 'rename_account_code: needs Chart of Account · Manage' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.provision_full_department(uuid,text)',
  $q$IF current_user_role() NOT IN ('principal', 'finance') THEN RAISE EXCEPTION 'provision_full_department: only Principal/Finance may provision' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['categories.manage']) THEN RAISE EXCEPTION 'provision_full_department: needs Chart of Account · Manage' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.create_manual_journal_voucher(date,text,jsonb,text)',
  $q$IF v_role NOT IN ('principal','finance') THEN RAISE EXCEPTION 'Access denied: only Finance/Principal can post journal vouchers';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['reconciliation.create']) THEN RAISE EXCEPTION 'create_manual_journal_voucher: needs Reconciliation · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.update_manual_journal_voucher(uuid,date,text,jsonb,text)',
  $q$IF v_role NOT IN ('principal','finance') THEN RAISE EXCEPTION 'Access denied';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['reconciliation.edit']) THEN RAISE EXCEPTION 'update_manual_journal_voucher: needs Reconciliation · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.delete_manual_journal_voucher(uuid)',
  $q$IF v_role NOT IN ('principal','finance') THEN RAISE EXCEPTION 'Access denied';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['reconciliation.edit']) THEN RAISE EXCEPTION 'delete_manual_journal_voucher: needs Reconciliation · Edit' USING ERRCODE = '42501';$q$);

-- Also run INSIDE the loan and fund-source cancel executors, as whoever approved
-- the cancellation (Treasury · Approve or Approvals · Approve) — so those too.
SELECT pg_temp.swap_check('public.mark_journal_entry_reversed(uuid,uuid)',
  $q$IF v_role NOT IN ('finance', 'principal') THEN RAISE EXCEPTION 'mark_journal_entry_reversed: unauthorized role %', v_role USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['billing.void', 'treasury.void', 'treasury.approve', 'approvals.approve']) THEN RAISE EXCEPTION 'mark_journal_entry_reversed: needs Billing · Void or Treasury · Void or Treasury · Approve or Approvals · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.post_journal_entry_as_caller(date,text,text,uuid,uuid,jsonb,gl_segment)',
  $q$IF NOT public.has_scope(ARRAY['treasury', 'admin', 'hr']) THEN RAISE EXCEPTION 'post_journal_entry: posting journals is not part of your work' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['billing.create', 'billing.edit', 'billing.void', 'hr_costing.create', 'hr_costing.edit', 'treasury.create', 'treasury.edit', 'treasury.void', 'treasury.approve', 'approvals.approve', 'hr_costing.approve', 'director_salary.approve']) THEN RAISE EXCEPTION 'post_journal_entry_as_caller: needs Billing · Create or Billing · Edit or Billing · Void or HR Costing · Create or HR Costing · Edit or Treasury · Create or Treasury · Edit or Treasury · Void or Treasury · Approve or Approvals · Approve or HR Costing · Approve or Director Salary · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.build_hr_cost_submission_payload(date)',
  $q$IF v_role NOT IN ('hr', 'principal') THEN RAISE EXCEPTION 'build_hr_cost_submission_payload: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['hr_costing.create']) THEN RAISE EXCEPTION 'build_hr_cost_submission_payload: needs HR Costing · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.set_payroll_pv_payment_date(uuid,date)',
  $q$IF v_role NOT IN ('hr', 'finance', 'principal') THEN RAISE EXCEPTION 'set_payroll_pv_payment_date: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['hr_costing.edit', 'treasury.edit']) THEN RAISE EXCEPTION 'set_payroll_pv_payment_date: needs HR Costing · Edit or Treasury · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.create_payroll_disbursement_vouchers(date,text,date,text,uuid,uuid[],jsonb)',
  $q$IF v_caller IS NULL OR NOT coalesce(has_scope(ARRAY['hr']), false) THEN RAISE EXCEPTION 'create_payroll_disbursement_vouchers: not permitted' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.create']) THEN RAISE EXCEPTION 'create_payroll_disbursement_vouchers: needs HR Costing · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.create_payroll_statutory_selection(date,text[],text,text,uuid,uuid[],date,numeric,integer)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'),false) THEN RAISE EXCEPTION 'Statutory selection is not permitted' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.create']) THEN RAISE EXCEPTION 'create_payroll_statutory_selection: needs HR Costing · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.create_payroll_statutory_director_topup(date,text,date,uuid)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing') OR has_perm('treasury'),false) THEN RAISE EXCEPTION 'Statutory generation is not permitted' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.create', 'treasury.create']) THEN RAISE EXCEPTION 'create_payroll_statutory_director_topup: needs HR Costing · Create or Treasury · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.payroll_open_topup(text,uuid,text)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN RAISE EXCEPTION 'Only HR or the Principal may resubmit payroll' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.create']) THEN RAISE EXCEPTION 'payroll_open_topup: needs HR Costing · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.payroll_cancel_topup(text,uuid)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN RAISE EXCEPTION 'Only HR or the Principal may change payroll' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.edit']) THEN RAISE EXCEPTION 'payroll_cancel_topup: needs HR Costing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.payroll_complete_rows(date,uuid[])',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN RAISE EXCEPTION 'Only HR or the Principal may complete payroll' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.edit']) THEN RAISE EXCEPTION 'payroll_complete_rows: needs HR Costing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.payroll_uncomplete_rows(date,uuid[])',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN RAISE EXCEPTION 'Only HR or the Principal may unlock payroll' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.edit']) THEN RAISE EXCEPTION 'payroll_uncomplete_rows: needs HR Costing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.payroll_close_month(date)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN RAISE EXCEPTION 'Only HR or the Principal may close a payroll month' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.edit']) THEN RAISE EXCEPTION 'payroll_close_month: needs HR Costing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.payroll_submit_batch(date,integer,numeric)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('hr_costing'), false) THEN RAISE EXCEPTION 'Only HR or the Principal may submit payroll to Finance' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.create']) THEN RAISE EXCEPTION 'payroll_submit_batch: needs HR Costing · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.payroll_send_back_batch(uuid,text)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('treasury'), false) THEN RAISE EXCEPTION 'Only Finance or the Principal may send a payroll batch back to HR' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['treasury.void', 'treasury.approve']) THEN RAISE EXCEPTION 'payroll_send_back_batch: needs Treasury · Void or Treasury · Approve' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.assert_commission_payroll_open(date)',
  $q$IF current_user_role() IS NULL OR current_user_role() NOT IN ('principal', 'hr') THEN RAISE EXCEPTION 'Only Principal or HR may change Revenue payroll' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['revenue.edit', 'hr_costing.edit']) THEN RAISE EXCEPTION 'assert_commission_payroll_open: needs Revenue · Edit or HR Costing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.revenue_save_pay_lines(uuid,date,jsonb,jsonb)',
  $q$IF auth.uid() IS NULL OR NOT (has_scope(ARRAY['admin']) OR has_scope(ARRAY['hr'])) THEN RAISE EXCEPTION 'Only HR or the Principal may change a salesperson''s pay' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['revenue.edit']) THEN RAISE EXCEPTION 'revenue_save_pay_lines: needs Revenue · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.save_director_salary_results(jsonb)',
  $q$IF v_role NOT IN ('hr', 'principal') THEN RAISE EXCEPTION 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['director_salary.edit']) THEN RAISE EXCEPTION 'save_director_salary_results: needs Director Salary · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.director_payroll_complete(date)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('director_salary'), false) THEN RAISE EXCEPTION 'Only HR or the Principal may complete director salary' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['director_salary.edit']) THEN RAISE EXCEPTION 'director_payroll_complete: needs Director Salary · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.director_payroll_uncomplete(date)',
  $q$IF auth.uid() IS NULL OR NOT coalesce(has_perm('director_salary'), false) THEN RAISE EXCEPTION 'Only HR or the Principal may reopen director salary' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['director_salary.edit']) THEN RAISE EXCEPTION 'director_payroll_uncomplete: needs Director Salary · Edit' USING ERRCODE = '42501';$q$);

-- ── Revenue payroll's writers that asked for the role another way ──────────
-- HR's adjustment and save of a Revenue payroll row (HR Costing · Edit), the
-- file import's commit (Revenue · Create), and the trigger every commission
-- change on a payroll row passes — reached by those two writers only: HR's
-- adjustment ('adjust') and a salesperson's close ('sync', Revenue · Edit).
SELECT pg_temp.swap_check('public.adjust_revenue_payroll_commission(uuid,numeric,numeric,numeric,text)',
  $q$IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role IN ('principal','hr')) THEN RAISE EXCEPTION 'Only active Principal or HR may adjust Revenue payroll' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.edit']) THEN RAISE EXCEPTION 'adjust_revenue_payroll_commission: needs HR Costing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.save_revenue_payroll_row(uuid,numeric,numeric,numeric,text,jsonb)',
  $q$IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_active AND role IN ('principal','hr')) THEN RAISE EXCEPTION 'Only active Principal or HR may save Revenue payroll' USING ERRCODE = '42501';$q$,
  $q$IF auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['hr_costing.edit']) THEN RAISE EXCEPTION 'save_revenue_payroll_row: needs HR Costing · Edit' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.commit_sales_import_batch(uuid,boolean)',
  $q$IF current_user_role() NOT IN ('principal', 'hr') THEN RAISE EXCEPTION 'Only Principal or HR may commit a sales import';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['revenue.create']) THEN RAISE EXCEPTION 'commit_sales_import_batch: needs Revenue · Create' USING ERRCODE = '42501';$q$);

SELECT pg_temp.swap_check('public.guard_revenue_commission_adjustment()',
  $q$IF v_context NOT IN ('adjust','sync') OR auth.uid() IS NULL OR current_user_role() IS NULL OR current_user_role() NOT IN ('principal','hr') THEN RAISE EXCEPTION 'Revenue Gross Commission must be changed through its reviewed adjustment or source sync' USING ERRCODE = '42501';$q$,
  $q$IF v_context NOT IN ('adjust','sync') OR auth.uid() IS NULL OR NOT public.has_any_action(ARRAY['revenue.edit', 'hr_costing.edit']) THEN RAISE EXCEPTION 'Revenue Gross Commission must be changed through its reviewed adjustment or source sync' USING ERRCODE = '42501';$q$);

-- ── A rejected department request's voucher: Finance's half was its kind ────
-- PR2b let a payment voucher's approver through; the other half — the people
-- who void a voucher — asked for the kind. Now Treasury · Void.
SELECT pg_temp.swap_check('public.dept_request_pv_rejected(uuid)',
  $q$IF NOT (current_user_role() IN ('finance', 'principal') OR 'payment_voucher' = ANY (public.approvable_types())) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';$q$,
  $q$IF auth.uid() IS NOT NULL AND NOT (public.has_any_action(ARRAY['treasury.void']) OR 'payment_voucher' = ANY (public.approvable_types())) THEN RAISE EXCEPTION 'dept_request_pv_rejected: needs Treasury · Void, or to approve payment vouchers' USING ERRCODE = '42501';$q$);

NOTIFY pgrst, 'reload schema';
