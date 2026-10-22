-- ============================================================================
-- 20261022231500_email_approval_full_access.sql
-- Approving a full-access login's email change is whoever manages permissions' (2026-10-22 — after #619, asked whether
-- to close the same door on Attendance › Requests, the user: "1 and 2 both do").
-- ============================================================================
--
-- #619 (mig 20261022150000) lets HR change a login's email on the person's page, except a FULL-ACCESS title's — a
-- Principal-kind template, one that ticks Manage permissions, or a Principal login on no template — which only
-- whoever manages permissions changes: the editor chooses where that login's mail goes. The Request to change email
-- (mig 20261016190000) still let HR do exactly that in two steps — file a request on the CEO's behalf (Requests' New
-- request), then approve it — because att_login_email_change asked only Attendance · Approve and not one's own.
--
-- 1. login_email_held(staff) — the refusal's words for a person whose login is full-access, NULL for anybody else.
--    The definition person_login_email_move keeps; only DEFINER functions call it (PUBLIC, anon and authenticated
--    revoked).
-- 2. att_login_email_change — production's body (md5 312fb9d6…, the same as 20261016190000's), one statement added
--    before its answer: a full-access login's change is refused in those words unless the approver manages
--    permissions. HR's Approve then moves nothing and decides nothing (src/lib/attendance/actions.ts › decideRequest
--    shows the words); att_profile_apply still writes a login's email only once the login signs in with it, so no
--    other way round it exists.
-- PGlite: tests/member-sql/validate-email-approval-full-access.mjs.

CREATE OR REPLACE FUNCTION public.login_email_held(p_staff uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_title    text;
  v_template text;
  v_full     boolean;
BEGIN
  SELECT t.name, p.name,
         coalesce(p.base_role = 'principal'
                  OR EXISTS (SELECT 1 FROM public.permission_template_grants g
                              WHERE g.template_id = p.id AND g.function_key = 'accounts' AND g.action = 'manage')
                  OR (p.id IS NULL AND u.role = 'principal'), false)
    INTO v_title, v_template, v_full
    FROM public.hr_staff_costs s
    LEFT JOIN public.titles t ON t.id = s.title_id
    LEFT JOIN public.permission_templates p ON p.id = t.template_id
    LEFT JOIN public.users u ON u.id = s.user_id
   WHERE s.id = p_staff;
  IF NOT coalesce(v_full, false) THEN
    RETURN NULL;
  END IF;
  RETURN format('%s is a full-access title (%s): only whoever manages permissions changes its login''s email.',
    coalesce(v_title, 'Their title'), coalesce(v_template, 'a Principal login'));
END
$fn$;

COMMENT ON FUNCTION public.login_email_held(uuid) IS
  'Why a person''s login email is held from whoever does not manage permissions (2026-10-22): their login is full-access — a Principal-kind template, one ticking Manage permissions, or a Principal login on no template. NULL for anybody else. Called by DEFINER functions only.';

REVOKE ALL ON FUNCTION public.login_email_held(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_email_held(uuid) TO service_role;

-- att_login_email_change: production's body, one statement added in front of its answer.
DO $swap$
DECLARE
  v_oid    oid  := 'public.att_login_email_change(uuid)'::regprocedure;
  v_was    text := '312fb9d6164b3c965187c0e29f9d59f1';
  v_src    text;
  v_anchor text := E'  RETURN jsonb_build_object(''user_id'', v_user, ''from'', (SELECT a.email FROM auth.users a WHERE a.id = v_user), ''to'', v_to);\n';
  v_new    text := E'  IF public.has_any_action(ARRAY[''accounts.manage'']) IS NOT TRUE AND public.login_email_held(v_r.staff_id) IS NOT NULL THEN\n'
                || E'    RAISE EXCEPTION ''%'', public.login_email_held(v_r.staff_id) USING ERRCODE = ''42501'';\n'
                || E'  END IF;\n';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(v_new IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) <> v_was THEN
    RAISE EXCEPTION 'att_login_email_change is not the body this was written against (md5 %)', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'att_login_email_change: its answer is not in it exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_oid), v_src, replace(v_src, v_anchor, v_new || v_anchor));
  IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid = v_oid), v_new, '')) <> v_was THEN
    RAISE EXCEPTION 'att_login_email_change: more changed than the one statement';
  END IF;
END
$swap$;

NOTIFY pgrst, 'reload schema';
