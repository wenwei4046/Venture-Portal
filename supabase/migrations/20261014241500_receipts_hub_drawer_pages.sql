-- Receipt's drawer writes from /receipts too (2026-10-14, the Finance revamp v2 — D09: Receipt's hub opens
-- the same drawer as Payments', with Void receipt, and for a receipt still in the flow Submit / Approve /
-- Return to draft / Void, and Add attachments). The app's gates behind those buttons now name /receipts
-- beside /payments and /payments/[id] (write-pages.test.ts), so the guards of the six DEFINER writes
-- behind them name it too (tab-write-guards.test.ts). /receipts opens from fin.receipt: an account whose
-- Receipt boxes are ticked may now take these steps from Receipt's drawer, as from its old page's rows.
--
-- From PRODUCTION's bodies (read here, at apply time): in each, its one guard statement is swapped for
-- the new one, exactly once; nothing else in the body, its settings or its grants moves.

CREATE OR REPLACE FUNCTION pg_temp.guard_swap(p_sig text, p_new text)
RETURNS void
LANGUAGE plpgsql
AS $g$
DECLARE
  v_oid oid := p_sig::regprocedure;
  v_src text;
  v_def text;
  v_old text;
  v_n   integer;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, 'PERFORM public\.tab_write_guard(_sites)?\([^;]*\);', 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '% asks % page guards, not one', p_sig, v_n;
  END IF;
  v_old := (regexp_match(v_src, '(PERFORM public\.tab_write_guard(?:_sites)?\([^;]*\);)'))[1];
  IF v_old = p_new THEN
    RETURN;
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF length(v_def) - length(replace(v_def, v_src, '')) <> length(v_src) THEN
    RAISE EXCEPTION '% — its body is not in its definition exactly once', p_sig;
  END IF;
  EXECUTE replace(v_def, v_src, replace(v_src, v_old, p_new));
  IF position(p_new IN (SELECT prosrc FROM pg_proc WHERE oid = v_oid)) = 0 THEN
    RAISE EXCEPTION '% — the new guard is not in place', p_sig;
  END IF;
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.guard_swap(p_sig, format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', ')));
END
$g$;

CREATE OR REPLACE FUNCTION pg_temp.tab_guard_sites(p_sig text, p_sites text[])
RETURNS void
LANGUAGE plpgsql
AS $g$
BEGIN
  PERFORM pg_temp.guard_swap(p_sig, format('PERFORM public.tab_write_guard_sites(ARRAY[%s]);',
    array_to_string(ARRAY(SELECT quote_literal(s) FROM unnest(p_sites) s), ', ')));
END
$g$;

SELECT pg_temp.tab_guard('public.approve_single_voucher(uuid, uuid, text, boolean)',
  $$ARRAY['/approvals', '/payments', '/payments/[id]', '/receipts']$$, ARRAY['approvals.approve', 'treasury.approve']);
SELECT pg_temp.tab_guard('public.close_approvals_for_voided_voucher(uuid)',
  $$ARRAY['/payments', '/payments/[id]', '/receipts']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard('public.return_voucher_to_draft(uuid)',
  $$ARRAY['/payments', '/payments/[id]', '/receipts']$$, ARRAY['treasury.edit']);
SELECT pg_temp.tab_guard('public.reverse_voucher_pool_rows(text)',
  $$ARRAY['/payments', '/payments/[id]', '/receipts']$$, ARRAY['treasury.void']);
SELECT pg_temp.tab_guard_sites('public.bump_bank_balance(uuid, numeric)',
  ARRAY['/approvals|approvals.approve,treasury.approve,hr_costing.approve,director_salary.approve',
        '/fund-out|treasury.create',
        '/payments,/payments/[id],/receipts|treasury.void']);
SELECT pg_temp.tab_guard_sites('public.mark_journal_entry_reversed(uuid, uuid)',
  ARRAY['/invoices/[id]|billing.void',
        '/payments,/payments/[id],/receipts|treasury.void']);

NOTIFY pgrst, 'reload schema';
