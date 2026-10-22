-- A payment's lines each say what they are for (2026-10-22 — the user, on
-- Create payment: "split pool 这个按钮我不想要，我想maintain之前的add
-- description/line" → "每行一个，GL override 拿掉").
--
-- payment_voucher_sources.description: the line's own words, NULL when it has
-- none. The three functions that post a payment voucher's journal —
-- approve_single_voucher, approve_voucher_batch, approve_voucher_batch_partial
-- — write a line's words on its debit line; a line without them keeps the
-- words it had ("expense - <payee> (<pool>)", or "… (<account>)" in the one
-- entry branch). The bank / Salary Payable side is untouched.
--
-- Production's bodies are kept: each swap is made in place (pg_get_functiondef
-- + replace, found whitespace-blind and refused unless it is there exactly as
-- often as expected — 20261009030000's way), so nothing else in them moves.
-- Per function: the two journal loops' SELECT lists gain pvs.description; the
-- two debit-line descriptions become COALESCE(the line's words, as before).

ALTER TABLE public.payment_voucher_sources ADD COLUMN IF NOT EXISTS description text;
COMMENT ON COLUMN public.payment_voucher_sources.description IS
  'The line''s own words (2026-10-22): what it is for. Written on its journal debit line at approval; NULL keeps the generic words.';

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
  -- The old text, every run of whitespace matching any run.
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

DO $do$
DECLARE
  v_sig regprocedure;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.approve_single_voucher(uuid,uuid,text,boolean)'::regprocedure,
    'public.approve_voucher_batch(uuid,uuid,text)'::regprocedure,
    'public.approve_voucher_batch_partial(uuid,uuid[],uuid[],uuid,text,text)'::regprocedure
  ] LOOP
    -- The two journal loops read the line's words.
    PERFORM pg_temp.swap_in(v_sig,
      $q$SELECT pvs.pool, pvs.amount, pvs.account_code,$q$,
      $q$SELECT pvs.pool, pvs.amount, pvs.account_code, pvs.description,$q$,
      2);
    -- One entry per pool (segment): the debit line says the line's words.
    PERFORM pg_temp.swap_in(v_sig,
      $q$format('%s - %s (%s)', v_voucher.voucher_type, v_voucher.payee_name, v_pvs_row.pool)$q$,
      $q$COALESCE(NULLIF(btrim(v_pvs_row.description), ''), format('%s - %s (%s)', v_voucher.voucher_type, v_voucher.payee_name, v_pvs_row.pool))$q$,
      1);
    -- One entry for the voucher: the same.
    PERFORM pg_temp.swap_in(v_sig,
      $q$format('%s - %s%s', v_voucher.voucher_type, v_voucher.payee_name, CASE WHEN v_pvs_row.account_code IS NOT NULL THEN ' (' || v_pvs_row.account_code || ')' ELSE '' END)$q$,
      $q$COALESCE(NULLIF(btrim(v_pvs_row.description), ''), format('%s - %s%s', v_voucher.voucher_type, v_voucher.payee_name, CASE WHEN v_pvs_row.account_code IS NOT NULL THEN ' (' || v_pvs_row.account_code || ')' ELSE '' END))$q$,
      1);
  END LOOP;
END
$do$;

-- Each of the three now reads the words twice and writes them twice.
DO $check$
DECLARE
  v_name text;
  v_src  text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['approve_single_voucher', 'approve_voucher_batch', 'approve_voucher_batch_partial'] LOOP
    SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = v_name;
    IF (SELECT count(*) FROM regexp_matches(v_src, 'pvs\.description', 'g')) <> 2
       OR (SELECT count(*) FROM regexp_matches(v_src, 'NULLIF\(btrim\(v_pvs_row\.description\), ''''\)', 'g')) <> 2 THEN
      RAISE EXCEPTION '%: the line''s words are not read and written twice', v_name;
    END IF;
  END LOOP;
END
$check$;
