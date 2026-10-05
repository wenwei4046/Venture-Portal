-- 20261006010000_unguarded_functions_need_a_login.sql
--
-- Nobody may reach the portal's money from a browser without signing in
-- (user 2026-10-06, after the member app's cost-ratio leak: "make sure this
-- doesn't happen").
--
-- These 21 functions are SECURITY DEFINER — they run as their owner, so RLS
-- never asks who is calling — and not one of them checks the caller itself
-- (no auth.uid(), has_perm, has_scope, current_user_role …). Postgres grants
-- EXECUTE to PUBLIC by default, so the anon role could call every one of them
-- with nothing but the publishable key every browser has:
--   * writers: apply_pool_adjustment (a pool's money), post_journal_entry (the
--     general ledger);
--   * approvals that only check the user id they are HANDED is a Principal:
--     approve_payroll_run, reject_payroll_run, approve_single_voucher,
--     approve_voucher_batch, approve_voucher_batch_partial — and the retired
--     submit_payroll_to_principal, submit_director_salary_to_finance,
--     reopen_director_salary, reverse_staff_payroll_accruals;
--   * readers of pay and money: payroll_row_money, payroll_row_submitted_money,
--     payroll_row_settled_status, payroll_statutory_entitlements,
--     compute_commission, get_payroll_breakdown_by_pool, payroll_month_closed,
--     voucher_party_refs, bridge_ref_flags, bank_gl_codes.
--
-- The app only ever calls them signed in (approvals, payments, payroll-run
-- actions, lib/journal.ts, HR › Allocation, payroll requests, cash flow) or
-- from other SECURITY DEFINER functions, which run as the owner — so EXECUTE
-- goes to authenticated and service_role only, and nothing a signed-in user
-- does changes.
--
-- NOT closed here (its own change): a signed-in user can still call them, and
-- the approvals trust the user id they are given. That needs each approval to
-- match the id to auth.uid() and the internal helpers to be service role only.

REVOKE EXECUTE ON FUNCTION public.apply_pool_adjustment(p_pool text, p_direction text, p_amount numeric, p_description text, p_user_id uuid, p_approval_id uuid, p_now timestamp with time zone, p_loan_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_pool_adjustment(p_pool text, p_direction text, p_amount numeric, p_description text, p_user_id uuid, p_approval_id uuid, p_now timestamp with time zone, p_loan_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_payroll_run(p_run_id uuid, p_approver uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payroll_run(p_run_id uuid, p_approver uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_single_voucher(p_approval_id uuid, p_user_id uuid, p_notes text, p_allow_overdraw boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_single_voucher(p_approval_id uuid, p_user_id uuid, p_notes text, p_allow_overdraw boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_voucher_batch(p_group_id uuid, p_user_id uuid, p_notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_voucher_batch(p_group_id uuid, p_user_id uuid, p_notes text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_voucher_batch_partial(p_group_id uuid, p_approve_ids uuid[], p_reject_ids uuid[], p_user_id uuid, p_approve_notes text, p_reject_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_voucher_batch_partial(p_group_id uuid, p_approve_ids uuid[], p_reject_ids uuid[], p_user_id uuid, p_approve_notes text, p_reject_reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bank_gl_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_gl_codes() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.bridge_ref_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bridge_ref_flags() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.compute_commission(p_staff_id uuid, p_period date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_commission(p_staff_id uuid, p_period date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_payroll_breakdown_by_pool(p_request_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payroll_breakdown_by_pool(p_request_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.payroll_month_closed(p_period date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_month_closed(p_period date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.payroll_row_money(p_scope text, p_row_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_row_money(p_scope text, p_row_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.payroll_row_settled_status(p_scope text, p_row_id uuid, p_period date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_row_settled_status(p_scope text, p_row_id uuid, p_period date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.payroll_row_submitted_money(p_scope text, p_row_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_row_submitted_money(p_scope text, p_row_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.payroll_statutory_entitlements(p_period date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_statutory_entitlements(p_period date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.post_journal_entry(p_transaction_date date, p_description text, p_reference_type text, p_reference_id uuid, p_created_by uuid, p_lines jsonb, p_segment gl_segment) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(p_transaction_date date, p_description text, p_reference_type text, p_reference_id uuid, p_created_by uuid, p_lines jsonb, p_segment gl_segment) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reject_payroll_run(p_run_id uuid, p_approver uuid, p_reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_payroll_run(p_run_id uuid, p_approver uuid, p_reason text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reopen_director_salary(p_period date, p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_director_salary(p_period date, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reverse_staff_payroll_accruals(p_period date, p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_staff_payroll_accruals(p_period date, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_director_salary_to_finance(p_period date, p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_director_salary_to_finance(p_period date, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_payroll_to_principal(p_period date, p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_payroll_to_principal(p_period date, p_user_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.voucher_party_refs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.voucher_party_refs() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
