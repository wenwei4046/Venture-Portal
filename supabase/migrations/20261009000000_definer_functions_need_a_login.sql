-- ============================================================================
-- 20261009000000_definer_functions_need_a_login.sql
-- A role check must hold for somebody who has no role (security, 2026-10-09).
-- ============================================================================
--
-- current_user_role() is `role FROM users WHERE id = auth.uid() AND is_active`,
-- so it answers NULL for three kinds of caller:
--   * the publishable key every browser holds (anon — no sign-in at all);
--   * a sign-in with no portal account (Supabase Auth still accepts sign-ups
--     through its API; the portal never asks for one — invites make accounts);
--   * a portal account switched off (is_active = false) whose session is still
--     alive — its refresh token keeps minting access tokens.
-- About sixty SECURITY DEFINER functions guard themselves with
-- `IF v_role NOT IN ('finance', 'principal')` or `IF current_user_role() <>
-- 'principal'`. `NULL NOT IN (…)` is NULL, not true, so the guard never fires
-- for any of the three — and the function runs as its owner, with RLS off.
-- Checked on production inside a rolled-back transaction: the publishable key
-- read get_director_payout_summary (1 row) and get_staff_billing_allocation
-- (16 rows), and execute_loan_cancel ran past its role check. The 2026-10-06
-- sweep (20261006010000) closed the functions that checked nobody; these do
-- check, only not for nobody.
--
-- Two changes; an active account notices neither:
--   1. current_user_role() refuses (42501) a sign-in that has no active portal
--      account instead of answering NULL. With no sign-in at all (anon, the
--      service role, the database itself) it still answers NULL, so every
--      service-role path behaves exactly as before.
--   2. No SECURITY DEFINER function is the publishable key's. EXECUTE is
--      revoked from PUBLIC and anon on every one that is not a trigger and is
--      not called by a row policy (a policy runs as the querying role, anon
--      included — those five helpers answer "nobody" for anon). Whoever could
--      call one signed in, or as the service role, still can. Functions made
--      from now on follow: the schema's default no longer grants anon EXECUTE,
--      and PUBLIC no longer gets it by default.

-- ─── 1. A sign-in without a portal account has no role — it is refused ──────

DO $guard$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.current_user_role()'::regprocedure)
       NOT IN ('144070341e10379e0f0f475f01416c50', 'a3dee7a8bcb88ec9f995b673ab3e88d9') THEN
    RAISE EXCEPTION 'current_user_role() is not the copy this migration was written against';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_role public.user_role;
BEGIN
  -- No sign-in: the publishable key, the service role, the database itself.
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid() AND is_active = TRUE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'This sign-in has no active portal account' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END
$fn$;

COMMENT ON FUNCTION public.current_user_role() IS
  'The signed-in account''s role. NULL with no sign-in (anon, service role); refuses (42501) a sign-in that has no active portal account, so a `v_role NOT IN (…)` guard can never be passed by having no role (2026-10-09).';

-- ─── 2. SECURITY DEFINER functions are not the publishable key's ────────────

DO $close$
DECLARE
  r record;
  v_auth boolean;
  v_service boolean;
  v_closed int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prokind = 'f'
       AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT EXISTS (
             SELECT 1 FROM pg_policies pol
              WHERE coalesce(pol.qual, '') ~ ('\m' || p.proname || '\(')
                 OR coalesce(pol.with_check, '') ~ ('\m' || p.proname || '\('))
     ORDER BY p.proname
  LOOP
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_service := has_function_privilege('service_role', r.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF v_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    IF v_service THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
    v_closed := v_closed + 1;
  END LOOP;
  RAISE NOTICE '% SECURITY DEFINER functions closed to the publishable key', v_closed;
END
$close$;

-- New functions: no EXECUTE for anon (Supabase's schema default) or PUBLIC
-- (Postgres's own default) unless a migration grants it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ─── The rule, checked ───────────────────────────────────────────────────────

DO $check$
DECLARE
  v_open text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_open
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND p.prokind = 'f'
     AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (
           SELECT 1 FROM pg_policies pol
            WHERE coalesce(pol.qual, '') ~ ('\m' || p.proname || '\(')
               OR coalesce(pol.with_check, '') ~ ('\m' || p.proname || '\('));
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER functions the publishable key can still call: %', v_open;
  END IF;
END
$check$;

NOTIFY pgrst, 'reload schema';
