-- ════════════════════════════════════════════════════════════════════════════
-- The database's "today" is the office's (2026-10-09)
--
-- The database keeps UTC, the office is UTC+8. Every function that asked
-- CURRENT_DATE, to_char(now(), …) or date_trunc('month', now()) for a DAY or a
-- MONTH answered in UTC — so between 00:00 and 08:00 in the office "today"
-- was yesterday, and on the 1st "this month" was last month. The portal side
-- was fixed in #237 (lib/office-time.ts); this is the same fix one floor down.
-- Seen in that window, e.g. at 00:30 on 1 Nov:
--   · approve_single_voucher / approve_voucher_batch(_partial) checked
--     October's period lock and dated fallbacks 31 Oct — the portal, fixed,
--     asks about November and the database refused it with its own message;
--   · claim / loan / payroll / invoice / dept-PV numbers were minted HV-…-202610;
--   · dept-pool expenses, cancels and invoice-paid credits filed in October;
--   · the dashboard's month and its 30-day maturity window, matured fund
--     sources, the base rate's quarter, a salary change's effective month,
--     the combos / catalogue "in force today", reversal dates, audit notes;
--   · parameter defaults: lookup_epf / _socso / _eis / _pcb, mint_credit_note_no,
--     get_current_base_rate, calculate_days_overdue, hr_dashboard_summary.
--
-- How: the 36 functions are rewritten FROM PRODUCTION'S OWN DEFINITIONS
-- (pg_get_functiondef), each first checked against the md5 of its body as
-- production ran it on 2026-10-09 — one changed since, and nothing is applied
-- (CLAUDE.md: never CREATE OR REPLACE from a stale copy). Three replacements,
-- nothing else, in the exact form 47 functions already use
-- ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date, as the payment_vouchers
-- and catalogue_combos column defaults do):
--   CURRENT_DATE                → (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
--   to_char(now(), …            → to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', …
--   date_trunc('month', now())  → date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur')
-- Every one of them sits in a DATE / text context (a date variable, ::date, a
-- date column, a number's YYYYMM); no instant comparison changes — now()
-- compared with a timestamptz (expiries, "last 30 days") is left as it is.
-- CREATE OR REPLACE keeps owners, grants, comments and triggers.
--
-- One DO block: all or nothing. It ends by refusing to commit if any public
-- function, or a parameter default, still reads the UTC calendar.
-- ════════════════════════════════════════════════════════════════════════════

DO $office_clock$
DECLARE
  v_expected constant jsonb := jsonb_build_object(
    'amend_issued_invoice', '4a3d825309903cdc4a07dcca438ea492',
    'amend_loan_repayment', '50880cbd1db094f8e3123b10ef31ed66',
    'approve_dept_payment_expense', '9ffd99f1fa4f968c83b4be180282f763',
    'approve_single_voucher', '5e42956a5b51e4e3cfa93b32e7850973',
    'approve_voucher_batch', '8f1186ccaa0a123c38f512e97496ad4a',
    'approve_voucher_batch_partial', 'e2409cec59d311b60c074c42b624269f',
    'calculate_days_overdue', '6c4343f2e1c78dc7294711b824579816',
    'cancel_dept_payment_request', 'da00e21f8f6d5aad1f1a87af07668050',
    'catalogue_apply_combos', '1d15a6e075ecdbcbb4fb7615524473cc',
    'claim_create_payment_voucher', '001979b278ec4d6ea50ef35d71be8db2',
    'create_loan_with_approval', '469b461c40763ac6f9cd051043eac149',
    'create_payroll_disbursement_vouchers', '187ebd80a3b7ce152b63a27d1cb23526',
    'create_payroll_statutory_batch', 'a071c565ee3e8b18f91994d5ee465fbe',
    'credit_dept_pool_on_invoice_paid', '6a84e1f0786ffa6e4ba9bc3eac7cbf4b',
    'dashboard_summary', 'c1c43dad58a7e59f664f1638482e207b',
    'execute_fund_source_cancel', 'a07b5bcc918bd78e523479f3377eac43',
    'execute_loan_cancel', 'a828aa7d0c64c78e9530af2dafc8dc10',
    'generate_invoices_from_request', '952ce4ace1754ae1d55a1d62136cf296',
    'generate_pv_for_dept_request', 'b9a4fcfb2f497ef0641ded93261aa265',
    'get_current_base_rate', 'c4e6fae39727951616a8f5cfecc1b031',
    'hr_dashboard_summary', 'f0d60436c2079797dba230b14e3e7925',
    'hr_staff_salary_history_on_update', 'f568eb5954c9c6dd4c1c03506bea105f',
    'ingest_erp_catalogue', '592758b421add1203bae7f1f0534b5e4',
    'jv_apply_bank_cache', '15949af15b7b5b1e9c394f0e12e0b666',
    'loans_default_disbursement_on_activate', '886ef6cb0b8ce990a927faa682b854bd',
    'lookup_eis', '991ba914da517cbeae2adf369ca04442',
    'lookup_epf', '4e207e1722d852794cb3cd1ce98d9530',
    'lookup_pcb', '53598bffaa4218093488b66a1213df65',
    'lookup_socso', '90fec513b975fd3e59de701fd8c77d05',
    'mark_matured_fund_sources', 'b33915bed2126609046bbf77fb3cc742',
    'member_catalogue', '6acf213df1ca36c27870a7ddbc5cf61b',
    'mint_credit_note_no', 'ac52c5f0a7992385fdb2efed0154181d',
    'reassign_invoice_gl_account', 'e211e87e45c9dea1eb0a99d92aa9a365',
    'reassign_voucher_gl_account', 'bd0300173d5de74f50382bf11192a2f8',
    'refresh_base_rate', 'aa0339001471a872cfb45d2790de02d5',
    'void_loan_repayment', '803959b493b6c5cf6a164416b01b96a2'
  );
  r record;
  v_def text;
  v_done int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, md5(p.prosrc) AS body_md5
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN (SELECT jsonb_object_keys(v_expected))
  LOOP
    IF r.body_md5 IS DISTINCT FROM v_expected ->> r.proname THEN
      RAISE EXCEPTION 'office clock: public.% changed on production since 2026-10-09 (md5 %) — re-derive this migration from its live definition',
        r.proname, r.body_md5;
    END IF;

    v_def := pg_get_functiondef(r.oid);
    v_def := regexp_replace(v_def, '\mcurrent_date\M',
      '(now() AT TIME ZONE ''Asia/Kuala_Lumpur'')::date', 'gi');
    v_def := regexp_replace(v_def, 'to_char\(\s*now\(\)\s*,',
      'to_char(now() AT TIME ZONE ''Asia/Kuala_Lumpur'',', 'gi');
    v_def := regexp_replace(v_def, 'date_trunc\(\s*''month''\s*,\s*now\(\)\s*\)',
      'date_trunc(''month'', now() AT TIME ZONE ''Asia/Kuala_Lumpur'')', 'gi');
    EXECUTE v_def;
    v_done := v_done + 1;
  END LOOP;

  IF v_done <> 36 THEN
    RAISE EXCEPTION 'office clock: expected 36 functions, found %', v_done;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.prokind IN ('f', 'p')
       AND (p.prosrc ~* '\mcurrent_date\M|to_char\(\s*now\(\)\s*,|date_trunc\(\s*''month''\s*,\s*now\(\)\s*\)'
            OR pg_get_function_arguments(p.oid) ~* '\mcurrent_date\M')
  ) THEN
    RAISE EXCEPTION 'office clock: a public function still reads the UTC calendar';
  END IF;
END
$office_clock$;

NOTIFY pgrst, 'reload schema';
