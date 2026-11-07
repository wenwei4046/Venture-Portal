-- Approve all on a combined payment request failed (2026-11-01, the user on
-- HV-PV-202610-0621 · 34 vouchers): "Partial batch approval failed: column
-- reference "voucher_no" is ambiguous".
--
-- approve_voucher_batch_partial RETURNS TABLE(voucher_id, voucher_no, outcome),
-- so inside its body `voucher_no` is also an OUT variable. Its approve loop's
-- UPDATE payment_vouchers … RETURNING id, voucher_no, … names the column bare,
-- and plpgsql refuses it the moment any voucher is approved (rejecting alone
-- never reaches it). approve_voucher_batch had the same fault, fixed in
-- 20260101000189; this one never was.
--
-- Fix: the RETURNING names payment_vouchers.voucher_no. Production's body is
-- kept — the one swap is made in place, found whitespace-blind and refused
-- unless it is there exactly once (20261022183000's way).

CREATE OR REPLACE FUNCTION pg_temp.swap_in(p_sig regprocedure, p_old text, p_new text, p_times integer)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_def   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> p_times THEN
    RAISE EXCEPTION '%: found % times, not % — production changed since this migration was written', p_sig, v_n, p_times;
  END IF;
  v_def := pg_get_functiondef(p_sig);
  FOR v_found IN SELECT DISTINCT m[1] FROM regexp_matches(v_src, '(' || v_pat || ')', 'g') AS m LOOP
    v_def := replace(v_def, v_found, p_new);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

SELECT pg_temp.swap_in(
  'public.approve_voucher_batch_partial(uuid,uuid[],uuid[],uuid,text,text)'::regprocedure,
  $q$RETURNING id, voucher_no, voucher_type,$q$,
  $q$RETURNING id, payment_vouchers.voucher_no, voucher_type,$q$,
  1);

DO $check$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_voucher_batch_partial';
  IF v_src ~ 'RETURNING\s+id,\s+voucher_no' OR strpos(v_src, 'RETURNING id, payment_vouchers.voucher_no,') = 0 THEN
    RAISE EXCEPTION 'approve_voucher_batch_partial: RETURNING still names voucher_no bare';
  END IF;
END
$check$;
