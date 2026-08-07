-- Same-bank funding clobbered the bank cache (found 2026-08-07: HL cache
-- 149.01 vs GL 165,214.03 — short by exactly the two same-bank HL→HL funding
-- PVs, 99,755.35 + 65,309.67).
--
-- Root cause: the approvers read current_balance early, then flip the voucher
-- to paid — which fires credit_dest_bank_on_bank_transfer (+amount on the
-- DEST row) — and then write an ABSOLUTE balance computed from the stale
-- read. With source = dest both writes hit the SAME row, so the absolute
-- write erases the trigger's credit and the cache silently drains by the
-- full amount. Different banks never collided (two rows), which is why this
-- only surfaced after same-bank funding was allowed (mig 20260804010000).
--
-- Fix: make every approver's cache write RELATIVE
--   (current_balance = current_balance ± amount)
-- so ordering doesn't matter — same-bank nets to zero and read-modify-write
-- races disappear. Then re-sync every active bank's cache to its GL truth.
-- Anchored replaces, idempotent.

DO $mig$
DECLARE
  v_fn text; v_def text; v_new text;
  v_anchor text := 'UPDATE bank_accounts SET current_balance=v_new_balance WHERE id=v_voucher.bank_account_id;';
  v_repl text := 'UPDATE bank_accounts SET current_balance = current_balance + CASE WHEN v_voucher.direction=''credit'' THEN v_voucher.amount ELSE -v_voucher.amount END WHERE id=v_voucher.bank_account_id; -- relative: the paid-status trigger may already have bumped this row (same-bank clobber fix 2026-08-07)';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['approve_single_voucher','approve_voucher_batch','approve_voucher_batch_partial'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    IF v_def IS NULL THEN RAISE EXCEPTION '% not found', v_fn; END IF;
    IF v_def LIKE '%same-bank clobber fix 2026-08-07%' THEN CONTINUE; END IF; -- already patched
    v_new := replace(v_def, v_anchor, v_repl);
    IF v_new = v_def THEN RAISE EXCEPTION 'cache-write anchor missing in %', v_fn; END IF;
    EXECUTE v_new;
  END LOOP;
END $mig$;

-- One-time repair: re-sync every active bank's cache to the GL balance.
UPDATE bank_accounts b
   SET current_balance = COALESCE((
     SELECT sum(COALESCE(jl.debit, 0) - COALESCE(jl.credit, 0))
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id AND NOT je.is_reversed
      WHERE jl.account_code = b.gl_account_code), 0)
 WHERE b.status = 'active' AND b.gl_account_code IS NOT NULL;
