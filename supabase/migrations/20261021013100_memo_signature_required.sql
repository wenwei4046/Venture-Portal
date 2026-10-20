-- ============================================================================
-- 20261021013100_memo_signature_required.sql
-- No acknowledgement without a signature, by any way in (2026-10-20 — the user:
-- "签完之后再来点那个 Acknowledge button").
-- ============================================================================
--
-- 20261021013000 gave the receipt's two writers a third argument, the signature,
-- and the app sends it. Applied once that app is live (so nobody pressing
-- Acknowledge on the old one was refused in between): the old two-argument
-- `my_memo_mark(memo, ack)` and `member_acknowledge_memo(memo, ack)` still mark
-- a memo opened — through the new ones, so there is one body for each — and
-- refuse to acknowledge it: an old page, or a call made straight to the
-- database, cannot acknowledge unsigned. Their grants stay as they were.
--
-- Comments stay outside the function bodies.

CREATE OR REPLACE FUNCTION pg_temp.expect_body(p_sig regprocedure, p_md5 text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v text := (SELECT md5(regexp_replace(prosrc, '\s+', ' ', 'g')) FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF v IS DISTINCT FROM p_md5 THEN
    RAISE EXCEPTION '%: its body reads % here, not % as read off production on 2026-10-20 — production changed since this migration was written',
      p_sig, v, p_md5;
  END IF;
END
$fn$;

DO $guard$
BEGIN
  IF to_regprocedure('public.my_memo_mark(uuid,boolean,text)') IS NULL OR to_regprocedure('public.member_acknowledge_memo(uuid,boolean,text)') IS NULL THEN
    RAISE EXCEPTION '20261021013000 (the writers that take a signature) has to run first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.my_memo_mark(uuid,boolean)'::regprocedure AND strpos(prosrc, 'refresh the app') > 0) THEN
    PERFORM pg_temp.expect_body('public.my_memo_mark(uuid,boolean)', 'e58967962ff66c2fbf6aca311fd87744');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.member_acknowledge_memo(uuid,boolean)'::regprocedure AND strpos(prosrc, 'refresh the app') > 0) THEN
    PERFORM pg_temp.expect_body('public.member_acknowledge_memo(uuid,boolean)', 'eb0354d8bcbcec5fc60945fb53536a6c');
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.my_memo_mark(p_memo uuid, p_ack boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF coalesce(p_ack, false) THEN
    RAISE EXCEPTION 'Acknowledging needs your signature — refresh the app to sign.' USING ERRCODE = '22023';
  END IF;
  RETURN public.my_memo_mark(p_memo, false, NULL::text);
END
$fn$;

CREATE OR REPLACE FUNCTION public.member_acknowledge_memo(p_memo uuid, p_ack boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF coalesce(p_ack, false) THEN
    RAISE EXCEPTION 'Acknowledging needs your signature — refresh the app to sign.' USING ERRCODE = '22023';
  END IF;
  RETURN public.member_acknowledge_memo(p_memo, false, NULL::text);
END
$fn$;
