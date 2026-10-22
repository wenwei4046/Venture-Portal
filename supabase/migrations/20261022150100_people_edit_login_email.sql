-- ============================================================================
-- 20261022150100_people_edit_login_email.sql
-- HR edits a login's email on the person's page (2026-10-22 — the user, circling Contact › Email on CHEA HUAN's page,
-- locked behind its padlock and Login chip: "i want the email can be editable, for hr").
-- ============================================================================
--
-- Until today a login's email changed only by the person's own request, approved on Attendance › Requests
-- (mig 20261016190000). Now whoever edits the person (People · Edit, on their page) changes it where it stands, and
-- the login moves with it: the email IS the sign-in, so the People record, the login row and the auth server never
-- part. The portal moves the login in the auth server first (the service role — src/lib/account/login-email.ts),
-- between these two:
--
-- 1. person_login_email_move(staff, email) — STABLE: what the save must do first, asked under the editor's own
--    session: their login, and the email it moves from and to. People · Edit (with the HR scope the roster's update
--    asks); an email in the shape of one, kept in lower case; never another login's (a portal account's, or any
--    sign-in the auth server holds); and for a FULL-ACCESS title — a Principal-kind template, one that ticks Manage
--    permissions, or a Principal login on no template — only whoever manages permissions, as Invite user keeps it
--    (mig 20261020190000): the editor would choose where that login's mail goes. NULL for somebody with no login,
--    whose email is the record's own.
-- 2. person_login_email_set(staff, email) — writes it: the login row (`users.email`) and the People record, asking
--    all of the above again, and only once the login itself already signs in with it.
-- Both ask the page's box in the database (tab_write_guard), as updateStaff's gate does in the app
-- (requireActionOn('/team/people/[id]', 'team', 'edit')). Nothing else changes: the person's own request stays.
-- PGlite: tests/member-sql/validate-people-login-email.mjs.

CREATE OR REPLACE FUNCTION public.person_login_email_move(p_staff uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_user     uuid;
  v_title    text;
  v_template text;
  v_full     boolean;
BEGIN
  IF public.has_scope(ARRAY['hr']) IS NOT TRUE OR public.has_any_action(ARRAY['team.edit']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Changing somebody''s email needs People · Edit.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.tab_write_guard(ARRAY['/team/people/[id]'], ARRAY['team.edit']);
  SELECT s.user_id, t.name, p.name,
         coalesce(p.base_role = 'principal'
                  OR EXISTS (SELECT 1 FROM public.permission_template_grants g
                              WHERE g.template_id = p.id AND g.function_key = 'accounts' AND g.action = 'manage')
                  OR (p.id IS NULL AND u.role = 'principal'), false)
    INTO v_user, v_title, v_template, v_full
    FROM public.hr_staff_costs s
    LEFT JOIN public.titles t ON t.id = s.title_id
    LEFT JOIN public.permission_templates p ON p.id = t.template_id
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE s.id = p_staff;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is no longer on the roster.' USING ERRCODE = '22023';
  END IF;
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_full AND public.has_any_action(ARRAY['accounts.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION '% is a full-access title (%): only whoever manages permissions changes its login''s email.',
      coalesce(v_title, 'Their title'), coalesce(v_template, 'a Principal login') USING ERRCODE = '42501';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'Their login needs an email — name the new one.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Enter an email address like name@houzs.my.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = v_email AND u.id <> v_user)
     OR EXISTS (SELECT 1 FROM auth.users a WHERE lower(a.email) = v_email AND a.id <> v_user) THEN
    RAISE EXCEPTION 'That email already belongs to another login.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('user_id', v_user, 'from', (SELECT a.email FROM auth.users a WHERE a.id = v_user), 'to', v_email);
END
$fn$;

COMMENT ON FUNCTION public.person_login_email_move(uuid, text) IS
  'People › a person''s page (2026-10-22): before their login''s email is changed, who the login is and the email it moves from and to — People · Edit; a full-access title only by whoever manages permissions; never another login''s email. NULL when they have no login.';

CREATE OR REPLACE FUNCTION public.person_login_email_set(p_staff uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_move jsonb;
  v_user uuid;
  v_to   text;
BEGIN
  PERFORM public.tab_write_guard(ARRAY['/team/people/[id]'], ARRAY['team.edit']);
  v_move := public.person_login_email_move(p_staff, p_email);
  IF v_move IS NULL THEN
    RAISE EXCEPTION 'They have no login — their email is saved with the rest of their record.' USING ERRCODE = '22023';
  END IF;
  v_user := (v_move ->> 'user_id')::uuid;
  v_to := v_move ->> 'to';
  IF v_to IS DISTINCT FROM (SELECT lower(a.email) FROM auth.users a WHERE a.id = v_user) THEN
    RAISE EXCEPTION 'Their login does not sign in with % yet — save again.', v_to USING ERRCODE = '42501';
  END IF;
  UPDATE public.users SET email = v_to, updated_at = now() WHERE id = v_user;
  UPDATE public.hr_staff_costs SET email = v_to WHERE id = p_staff;
END
$fn$;

COMMENT ON FUNCTION public.person_login_email_set(uuid, text) IS
  'People › a person''s page (2026-10-22): their login row and People record take the email their login already signs in with (the portal moves it in the auth server first) — asking all person_login_email_move asks.';

-- The guard the scan reads (tab-write-guards.test.ts): the write asks the person's page in the database, as the app's
-- gate in front of it does. The body above carries it already; this only checks it is there.
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

SELECT pg_temp.tab_guard('public.person_login_email_set(uuid, text)',
  $$ARRAY['/team/people/[id]']$$, ARRAY['team.edit']);

-- Who may call them: a sign-in (each asks who the caller is); the publishable key never.
REVOKE ALL ON FUNCTION public.person_login_email_move(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_login_email_set(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_login_email_move(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.person_login_email_set(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
