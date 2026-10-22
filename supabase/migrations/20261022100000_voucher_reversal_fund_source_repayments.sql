-- ============================================================================
-- 20261022120000_voucher_reversal_fund_source_repayments.sql
-- A reversed payment takes its fund-source repayments with it (2026-10-21 — the user, shown HV-PV-202608-0295's
-- Reverse payment leaving HOUZS Century's RM 98,000 fund source repaid: "A：一起删+重开").
-- ============================================================================
--
-- Approval writes a fund-source repayment voucher's principal / interest / penalty into fund_source_repayments, each
-- row carrying the voucher (payment_voucher_id), and check_fund_source_fully_repaid flips the source to repaid once
-- its principal covers it. Reverse payment (reversePaidPayment) put the bank, the GL and the pools back, then deleted
-- those rows through the session's client — and the table refuses every session's DELETE (fsr_no_delete USING
-- (false), the only DELETE policy), so nothing went and nothing said so: the source still read the instalment paid,
-- repaid, and the corrected voucher was refused ("Cannot repay fund source with status repaid"). On 2026-10-21: 39
-- paid vouchers carry 67 such rows; none has been reversed, so no data is wrong.
--
-- reverse_voucher_fund_source_repayments(voucher) — the database's own step, run once the voucher is voided (as
-- close_approvals_for_voided_voucher is): removes the rows the voucher wrote, and nothing else; a source that this
-- removes principal from and that its principal and netting left no longer cover goes back from repaid to active,
-- repaid_at / repaid_by cleared (every repaid source went active → repaid; nothing sets matured). Only a voided
-- voucher qualifies, so a live paid voucher's rows can never be stripped from its source; run again, it removes
-- nothing. Asks what the app's gate asks (Treasury · Void on Payments / a voucher's page / Receipt) and the tab
-- guard its sibling steps ask. fsr_no_delete stays: no session deletes a repayment row itself.
-- PGlite: tests/member-sql/validate-fund-source-reversal.mjs (this migration verbatim, over production's row policies
-- and its two trigger bodies — fund-source-reversal-production.sql, md5-checked).

CREATE OR REPLACE FUNCTION public.reverse_voucher_fund_source_repayments(p_voucher_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status    payment_voucher_status;
  v_removed   integer := 0;
  v_n         integer;
  v_principal integer;
  r           record;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/payments', '/payments/[id]', '/receipts'], ARRAY['treasury.void']);
  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_any_action(ARRAY['treasury.void']), false) THEN
    RAISE EXCEPTION 'reverse_voucher_fund_source_repayments: needs Treasury · Void' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status FROM payment_vouchers WHERE id = p_voucher_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'reverse_voucher_fund_source_repayments: voucher % not found', p_voucher_id;
  END IF;
  IF v_status <> 'voided' THEN
    RAISE EXCEPTION 'reverse_voucher_fund_source_repayments: voucher is %, only voided vouchers qualify', v_status;
  END IF;

  -- Each source the voucher's rows went to (one, as approval writes them), locked while its rows go and its
  -- status is read again.
  FOR r IN
    SELECT f.id, f.amount, f.status
      FROM fund_sources f
     WHERE f.id IN (SELECT x.fund_source_id FROM fund_source_repayments x WHERE x.payment_voucher_id = p_voucher_id)
     ORDER BY f.id
       FOR UPDATE OF f
  LOOP
    SELECT count(*) FILTER (WHERE x.payment_type = 'principal') INTO v_principal
      FROM fund_source_repayments x
     WHERE x.payment_voucher_id = p_voucher_id AND x.fund_source_id = r.id;
    DELETE FROM fund_source_repayments
     WHERE payment_voucher_id = p_voucher_id AND fund_source_id = r.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_removed := v_removed + v_n;

    -- Reopen what this voucher's principal closed: repaid, and the principal and netting left (fund_source_outstanding's
    -- measure) no longer cover it.
    IF r.status = 'repaid' AND v_principal > 0
       AND (SELECT coalesce(sum(x.amount), 0)
              FROM fund_source_repayments x
             WHERE x.fund_source_id = r.id AND x.payment_type IN ('principal', 'netting')) < r.amount THEN
      UPDATE fund_sources
         SET status = 'active', repaid_at = NULL, repaid_by = NULL
       WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN v_removed;
END
$fn$;

COMMENT ON FUNCTION public.reverse_voucher_fund_source_repayments(uuid) IS
  'A voided voucher''s fund-source repayment rows (payment_voucher_id) removed, and a source repaid by them that the rest no longer covers reopened (repaid → active). Reverse payment''s step after the void (mig 20261022120000); only a voided voucher qualifies.';

-- The guard the scan reads (tab-write-guards.test.ts): the step asks the pages the app's gate in front of it names
-- (requireActionOn(['/payments', '/payments/[id]', '/receipts'], 'treasury', 'void')), as its sibling steps do. The
-- body above carries it already; this only checks it is there.
CREATE OR REPLACE FUNCTION pg_temp.tab_guard(p_sig text, p_pages text, p_wants text[])
RETURNS void
LANGUAGE plpgsql AS $g$
DECLARE
  v_line text := format('PERFORM public.tab_write_guard(%s, ARRAY[%s]);', p_pages,
    array_to_string(ARRAY(SELECT quote_literal(w) FROM unnest(p_wants) w), ', '));
BEGIN
  IF position(v_line IN (SELECT prosrc FROM pg_proc WHERE oid = p_sig::regprocedure)) = 0 THEN
    RAISE EXCEPTION '% does not ask its page: % is not in its body', p_sig, v_line;
  END IF;
END
$g$;

SELECT pg_temp.tab_guard('public.reverse_voucher_fund_source_repayments(uuid)',
  $$ARRAY['/payments', '/payments/[id]', '/receipts']$$, ARRAY['treasury.void']);

REVOKE ALL ON FUNCTION public.reverse_voucher_fund_source_repayments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_voucher_fund_source_repayments(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
