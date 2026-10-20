-- Invite user, for whoever holds Permissions · Create (2026-10-20 — the user: "我发现 HR 的权限有些问题，为什么他不能
-- invite user？他 supposed to be 是要能够 invite user 的。现在只有我的 principal account 能够 invite user，帮我改一下。
-- 确保在 permission 那边也可以做到这个 setting，就是 HR 可以 allow for invite user").
--
-- People › Invite user asks HR view › Permissions · Create (accounts.create) in the app, but two things in the
-- database still kept a login for whoever manages permissions: `users`' INSERT policy asks an admin key
-- (users_principal_write), and `hr_staff_permission_guard` refuses a login put on a person by anybody without
-- Manage permissions. A template ticking the box showed Invite user, and Create login failed.
--
-- 1. account_attach_login(p_staff, p_login, p_email) makes the portal user and puts it on the person in ONE
--    transaction, under the caller's Permissions · Create: an active person with no login, a title on a
--    template, a Supabase login made within the hour under that very email that no portal user holds. Its kind
--    is the template's (`base_role`), as the app wrote it before. users' policies are untouched: nobody without
--    an admin key writes a users row any other way. No page guard: accounts.create is Permissions · Create's
--    alone, so a box held back takes the cell itself away (tab-write-guards.test.ts › narrows).
-- 2. A FULL-ACCESS title — a Principal-kind template, or one that ticks Manage permissions — is given a login
--    only by whoever manages permissions (a side agent's note the user passed on, the same day: the inviter
--    types the email and may set the password, so a login on such a title would be the inviter's own).
-- 3. hr_staff_permission_guard lets exactly that attachment through (`app.login_attach` = the person and the
--    login, set only by the function, cleared straight after) — production's body, one statement added.

CREATE OR REPLACE FUNCTION public.account_attach_login(p_staff uuid, p_login uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text;
  v_user uuid;
  v_status text;
  v_department uuid;
  v_title text;
  v_template uuid;
  v_template_name text;
  v_kind public.user_role;
  v_full boolean;
BEGIN
  IF public.has_any_action(ARRAY['accounts.create']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Giving somebody a login needs Permissions · Create' USING ERRCODE = '42501';
  END IF;
  IF p_staff IS NULL OR p_login IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Reload the page and try again.';
  END IF;
  SELECT s.employee_name, s.user_id, s.status, s.department_id, t.name, t.template_id
    INTO v_name, v_user, v_status, v_department, v_title, v_template
    FROM public.hr_staff_costs s
    LEFT JOIN public.titles t ON t.id = s.title_id
   WHERE s.id = p_staff
     FOR UPDATE OF s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That person is no longer on the roster.';
  END IF;
  IF v_status = 'inactive' THEN
    RAISE EXCEPTION '% is no longer active — only active people get a login.', v_name;
  END IF;
  IF v_user IS NOT NULL THEN
    RAISE EXCEPTION '% already has a login.', v_name;
  END IF;
  SELECT p.name, p.base_role,
         p.base_role = 'principal'
           OR EXISTS (SELECT 1 FROM public.permission_template_grants g
                       WHERE g.template_id = p.id AND g.function_key = 'accounts' AND g.action = 'manage')
    INTO v_template_name, v_kind, v_full
    FROM public.permission_templates p
   WHERE p.id = v_template;
  IF NOT FOUND THEN
    RAISE EXCEPTION '% has no permission template on their title yet.', v_name;
  END IF;
  IF v_full AND public.has_any_action(ARRAY['accounts.manage']) IS NOT TRUE THEN
    RAISE EXCEPTION '% is a full-access title (%): only whoever manages permissions gives it a login.', v_title, v_template_name
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users a
                  WHERE a.id = p_login AND lower(a.email) = v_email AND a.created_at >= now() - interval '1 hour') THEN
    RAISE EXCEPTION 'The new login was not found. Try again.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_login OR lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'That email already has an account.';
  END IF;
  INSERT INTO public.users (id, email, name, role, department_id)
  VALUES (p_login, v_email, v_name, v_kind, v_department);
  PERFORM set_config('app.login_attach', p_staff::text || ':' || p_login::text, true);
  UPDATE public.hr_staff_costs SET user_id = p_login, email = v_email WHERE id = p_staff;
  PERFORM set_config('app.login_attach', '', true);
END
$fn$;

COMMENT ON FUNCTION public.account_attach_login(uuid, uuid, text) IS
  'People › Invite user (2026-10-20): the portal user for a Supabase login made moments ago, put on an active person with no login — one transaction, under Permissions · Create. A full-access title (a Principal-kind template, or one ticking Manage permissions) is given a login only by whoever manages permissions.';

REVOKE ALL ON FUNCTION public.account_attach_login(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_attach_login(uuid, uuid, text) TO authenticated, service_role;

-- hr_staff_permission_guard: production's body (md5 6738775b…, the same as 20261008120000's), one statement
-- added in front of its UPDATE branch — the attachment account_attach_login is making, and no other.
DO $swap$
DECLARE
  v_oid    oid  := 'public.hr_staff_permission_guard()'::regprocedure;
  v_was    text := '6738775be21620efcd392985b96c897f';
  v_src    text;
  v_anchor text := E'  IF TG_OP = ''UPDATE'' THEN\n';
  v_new    text := E'  IF TG_OP = ''UPDATE'' AND OLD.user_id IS NULL AND NEW.title_id IS NOT DISTINCT FROM OLD.title_id\n'
                || E'     AND current_setting(''app.login_attach'', true) = NEW.id::text || '':'' || NEW.user_id::text THEN\n'
                || E'    RETURN NEW;\n'
                || E'  END IF;\n';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(v_new IN v_src) > 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) <> v_was THEN
    RAISE EXCEPTION 'hr_staff_permission_guard is not the body this was written against (md5 %)', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'hr_staff_permission_guard: its UPDATE branch is not in it exactly once';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_oid), v_src, replace(v_src, v_anchor, v_new || v_anchor));
  IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid = v_oid), v_new, '')) <> v_was THEN
    RAISE EXCEPTION 'hr_staff_permission_guard: more changed than the one statement';
  END IF;
END
$swap$;

NOTIFY pgrst, 'reload schema';
