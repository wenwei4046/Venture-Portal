-- Plan C, the database side (2026-10-11), part 2: each DEFINER write a narrowing
-- gate stands in front of asks the same pages first.
--
-- `pg_temp.tab_guard(sig, pages, wants)` puts one statement at the top of the
-- function's body, built from PRODUCTION's body (pg_get_functiondef), changing
-- nothing else:
--     PERFORM public.tab_write_guard(<pages>, ARRAY[<wants>]);
-- <pages> are the pages the app's gates in front of it name (compared by tabs — a
-- page may stand for its [id] page), or a choice by what the write is about (a
-- loan's terms are Fund OUT's, a fund source's Fund IN's; a talent's file Talent
-- Bank's, a candidate's Hiring's). <wants> are the actions the function's own check
-- asks (an approval: the queue's own Approve and its domain's). A write reached
-- through gates that ask different things — the bank bumped by an approval, a
-- repayment and a reversal — names each gate instead, 'pages|actions'
-- (`pg_temp.tab_guard_sites`), and is open while any of them would let it through.
-- Doing it twice changes nothing; a function already asking is refused (change
-- that guard with swap_check).
--
-- Which functions: every DEFINER write whose gate NARROWS — a box for its cell on
-- each of its pages, and another box for that cell elsewhere (only then can the cell
-- be held while the page's boxes are all closed). src/lib/tab-write-guards.test.ts
-- holds this list to the app's gates both ways: each guard's pages are its callers'
-- and narrow something, and a DEFINER write behind a narrowing gate is guarded or
-- named there with why not (reads; a number minted for any of five pages).
-- Writes made straight to a table are asked by its row policies, cell by cell: a
-- table knows no page, so it narrows only when the cell is closed everywhere.

CREATE OR REPLACE FUNCTION pg_temp.tab_guard_put(p_sig text, p_guard text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_at  integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(p_guard IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF position('tab_write_guard' IN v_src) > 0 THEN
    RAISE EXCEPTION '% already asks other pages — change that guard with swap_check', p_sig;
  END IF;
  v_at := regexp_instr(v_src, '\mBEGIN\M', 1, 1, 1, 'i');
  IF v_at = 0 THEN
    RAISE EXCEPTION '% has no BEGIN', p_sig;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, left(v_src, v_at - 1) || E'\n  ' || p_guard || substr(v_src, v_at));
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.tab_guard_put(p_sig, format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', ')));
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard_sites(p_sig text, p_sites text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.tab_guard_put(p_sig, format('PERFORM public.tab_write_guard_sites(ARRAY[%s]);',
    array_to_string(ARRAY(SELECT quote_literal(s) FROM unnest(p_sites) s), ', ')));
END
$g$;

SELECT pg_temp.tab_guard('public.amend_fund_source(uuid, jsonb)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.amend_fund_source_from(uuid, date, numeric, integer, boolean, text, boolean)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.amend_loan(uuid, jsonb)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.amend_loan_from(uuid, date, numeric, integer, boolean, text, boolean)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.amend_loan_repayment(uuid, numeric, text)',
  $$ARRAY['/payments', '/receipts']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.amend_loan_repayment_date(uuid, date, text)',
  $$ARRAY['/payments', '/payments/[id]', '/receipts']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.amend_voucher_date(uuid, date, text)',
  $$ARRAY['/payments', '/payments/[id]', '/receipts']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.cancel_dept_payment_request(uuid, text)',
  $$ARRAY['/payments/dept-requests']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard('public.cancel_loan_and_approval(uuid, text)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard('public.claim_create_payment_voucher(uuid, uuid, text)',
  $$ARRAY['/payments/claim-requests']$$, ARRAY['treasury.create']);
SELECT pg_temp.tab_guard('public.close_approvals_for_voided_voucher(uuid)',
  $$ARRAY['/payments/[id]']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard('public.create_loan_with_approval(uuid, numeric, numeric, numeric, numeric, integer, text, text, date, text, uuid)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.create']);
SELECT pg_temp.tab_guard('public.delete_voucher_attachment(uuid)',
  $$ARRAY['/approvals', '/payments/[id]']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.dept_request_pv_rejected(uuid)',
  $$ARRAY['/approvals']$$, ARRAY['treasury.void', 'approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.generate_pv_for_dept_request(uuid, uuid, text)',
  $$ARRAY['/payments/dept-requests']$$, ARRAY['treasury.create']);
SELECT pg_temp.tab_guard('public.reassign_voucher_gl_account(uuid, text, text, text)',
  $$ARRAY['/payments/[id]']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.request_loan_cancel(uuid, text)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard('public.return_voucher_to_draft(uuid)',
  $$ARRAY['/payments/[id]']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.reverse_voucher_pool_rows(text)',
  $$ARRAY['/payments/[id]']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard('public.revert_terms_change(text, uuid)',
  $$CASE WHEN p_record_kind = 'loan' THEN ARRAY['/fund-out'] ELSE ARRAY['/fund-in'] END$$, ARRAY['treasury.approve']);
SELECT pg_temp.tab_guard('public.set_fund_source_min_pay_interest(uuid, boolean)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.set_fund_source_notes(uuid, text)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.set_fund_source_repayment_start(uuid, date)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.set_loan_funding_source(uuid, text)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.set_loan_min_pay_interest(uuid, boolean)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.set_loan_repayment_start(uuid, date)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.void_loan_repayment(uuid)',
  $$ARRAY['/fund-out']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard('public.withdraw_pending_fund_source(uuid)',
  $$ARRAY['/fund-in']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard('public.payroll_send_back_batch(uuid, text)',
  $$ARRAY['/payments/payroll-requests']$$, ARRAY['treasury.void', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.reopen_payroll_run(date, uuid)',
  $$ARRAY['/payments/payroll-requests']$$, ARRAY['treasury.void', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.approve_single_voucher(uuid, uuid, text, boolean)',
  $$ARRAY['/approvals', '/payments/[id]']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.approve_voucher_batch(uuid, uuid, text)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.approve_voucher_batch_partial(uuid, uuid[], uuid[], uuid, text, text)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.approve_dept_payment_expense(uuid)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.reject_dept_payment_request(uuid)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.execute_loan_cancel(uuid)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.execute_fund_source_cancel(uuid)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.approve_payroll_run(uuid, uuid)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'hr_costing.approve']);
SELECT pg_temp.tab_guard('public.reject_payroll_run(uuid, uuid, text)',
  $$ARRAY['/approvals']$$, ARRAY['approvals.approve', 'hr_costing.approve']);
SELECT pg_temp.tab_guard('public.adjust_revenue_payroll_commission(uuid, numeric, numeric, numeric, text)',
  $$ARRAY['/hr-costing/payroll']$$, ARRAY['hr_costing.edit']);
SELECT pg_temp.tab_guard('public.save_revenue_payroll_row(uuid, numeric, numeric, numeric, text, jsonb)',
  $$ARRAY['/hr-costing/payroll']$$, ARRAY['hr_costing.edit']);
SELECT pg_temp.tab_guard('public.payroll_cancel_topup(text, uuid)',
  $$ARRAY['/hr-costing/payroll']$$, ARRAY['hr_costing.edit']);
SELECT pg_temp.tab_guard('public.payroll_close_month(date)',
  $$ARRAY['/hr-costing/payroll']$$, ARRAY['hr_costing.edit']);
SELECT pg_temp.tab_guard('public.payroll_complete_rows(date, uuid[])',
  $$ARRAY['/hr-costing/payroll']$$, ARRAY['hr_costing.edit']);
SELECT pg_temp.tab_guard('public.payroll_open_topup(text, uuid, text)',
  $$ARRAY['/hr-costing/payroll']$$, ARRAY['hr_costing.create']);
SELECT pg_temp.tab_guard('public.payroll_submit_batch(date, integer, numeric)',
  $$ARRAY['/hr-costing/payroll']$$, ARRAY['hr_costing.create']);
SELECT pg_temp.tab_guard('public.payroll_uncomplete_rows(date, uuid[])',
  $$ARRAY['/hr-costing/payroll']$$, ARRAY['hr_costing.edit']);
SELECT pg_temp.tab_guard('public.create_payroll_disbursement_vouchers(date, text, date, text, uuid, uuid[], jsonb)',
  $$ARRAY['/hr-costing/payment']$$, ARRAY['hr_costing.create']);
SELECT pg_temp.tab_guard('public.create_payroll_statutory_selection(date, text[], text, text, uuid, uuid[], date, numeric, integer)',
  $$ARRAY['/hr-costing/payment']$$, ARRAY['hr_costing.create']);
SELECT pg_temp.tab_guard('public.create_payroll_statutory_director_topup(date, text, date, uuid)',
  $$ARRAY['/hr-costing/payment']$$, ARRAY['hr_costing.create', 'treasury.create']);
SELECT pg_temp.tab_guard('public.set_payroll_pv_payment_date(uuid, date)',
  $$ARRAY['/hr-costing/payment']$$, ARRAY['hr_costing.edit', 'treasury.edit']);
SELECT pg_temp.tab_guard('public.amend_issued_invoice(uuid, jsonb, jsonb, jsonb, text)',
  $$ARRAY['/invoices/[id]']$$, ARRAY['billing.edit']);
SELECT pg_temp.tab_guard('public.generate_monthly_invoices(date, text[])',
  $$ARRAY['/invoices/[id]']$$, ARRAY['billing.create']);
SELECT pg_temp.tab_guard('public.mint_credit_note_no(date)',
  $$ARRAY['/invoices/[id]']$$, ARRAY['billing.create']);
SELECT pg_temp.tab_guard('public.reassign_invoice_gl_account(uuid, text, text, text)',
  $$ARRAY['/invoices/[id]']$$, ARRAY['billing.edit']);
SELECT pg_temp.tab_guard('public.void_issued_invoice(uuid, text)',
  $$ARRAY['/invoices/[id]']$$, ARRAY['billing.void']);
SELECT pg_temp.tab_guard('public.create_manual_journal_voucher(date, text, jsonb, text)',
  $$ARRAY['/reconciliation/journal-entries']$$, ARRAY['reconciliation.create']);
SELECT pg_temp.tab_guard('public.update_manual_journal_voucher(uuid, date, text, jsonb, text)',
  $$ARRAY['/reconciliation/journal-entries']$$, ARRAY['reconciliation.edit']);
SELECT pg_temp.tab_guard('public.delete_manual_journal_voucher(uuid)',
  $$ARRAY['/reconciliation/journal-entries']$$, ARRAY['reconciliation.edit']);
SELECT pg_temp.tab_guard('public.revenue_save_pay_lines(uuid, date, jsonb, jsonb)',
  $$ARRAY['/revenue/[sub]/[period]']$$, ARRAY['revenue.edit']);
SELECT pg_temp.tab_guard('public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.create']);
SELECT pg_temp.tab_guard('public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[])',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_candidate_stage(uuid, text)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_file_remove(uuid)',
  $$CASE WHEN EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.id = p_file AND f.talent_id IS NOT NULL) THEN ARRAY['/hiring/talent'] ELSE ARRAY['/hiring/requests'] END$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_file_replace(uuid, text, text)',
  $$CASE WHEN EXISTS (SELECT 1 FROM public.hiring_files f WHERE f.id = p_file AND f.talent_id IS NOT NULL) THEN ARRAY['/hiring/talent'] ELSE ARRAY['/hiring/requests'] END$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_file_type_rename(uuid, text)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_file_type_set_active(uuid, boolean)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_files_add(text, uuid, jsonb)',
  $$CASE WHEN p_kind = 'talent' THEN ARRAY['/hiring/talent'] ELSE ARRAY['/hiring/requests'] END$$, ARRAY['hiring.create', 'hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_save_candidate_fields(jsonb)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_save_form_fields(jsonb)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_set_assist(text, uuid)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit', 'hiring.approve']);
SELECT pg_temp.tab_guard('public.hiring_source_add(text)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_source_remove(uuid)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_source_set_active(uuid, boolean)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_submit(uuid, jsonb)',
  $$ARRAY['/hiring/requests']$$, ARRAY['hiring.create']);
SELECT pg_temp.tab_guard('public.hiring_talent_remove(uuid)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);
SELECT pg_temp.tab_guard('public.hiring_talent_update(uuid, text, text, text)',
  $$ARRAY['/hiring/talent']$$, ARRAY['hiring.edit']);

-- Reached through gates that ask different things: each gate, 'pages|actions'.
SELECT pg_temp.tab_guard_sites('public.bump_bank_balance(uuid, numeric)',
  ARRAY['/approvals|approvals.approve,treasury.approve,hr_costing.approve,director_salary.approve',
        '/fund-out|treasury.create',
        '/payments/[id]|treasury.void']);
SELECT pg_temp.tab_guard_sites('public.bump_bank_for_paid_credit(uuid)',
  ARRAY['/invoices/[id]|billing.create',
        '/payments|treasury.create']);
SELECT pg_temp.tab_guard_sites('public.mark_journal_entry_reversed(uuid, uuid)',
  ARRAY['/invoices/[id]|billing.void',
        '/payments/[id]|treasury.void']);
