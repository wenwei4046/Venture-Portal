-- ============================================================================
-- 20261011050000_view_as_person.sql
-- View as a person, read-only (2026-10-11 — the user: "can set a function is
-- view as a user, same like in revenue app, i can view as a member").
-- ============================================================================
--
-- HR's and Finance's views became lenses over the account's own power (PR
-- #270), so the portal lost its way to see what somebody else sees. View as a
-- person brings it back, for one named account: the portal drawn with THEIR
-- keys, actions, tabs and sensitive fields — the database's own answers, asked
-- as them — and nothing saved while it is on (the app's server client reads
-- only; lib/supabase/server.ts).
--
-- view_as_person(p_user) answers, for whoever may switch views (view_switch),
-- what current_permissions(), current_actions(), current_sensitive_fields()
-- and current_tabs() answer for p_user: it points auth.uid() at them for those
-- four calls (auth.uid() reads request.jwt.claim.sub first) and puts the
-- caller back before it returns, on success and on failure alike. Nothing is
-- written. A Revenue member is viewed in the Revenue app, never here.

CREATE OR REPLACE FUNCTION public.view_as_person(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_target public.users%ROWTYPE;
  v_out jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('view_switch') THEN
    RAISE EXCEPTION 'Only whoever may switch views can view as somebody else' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_target FROM public.users WHERE id = p_user AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That account is gone or switched off' USING ERRCODE = 'P0002'; END IF;
  IF v_target.role::text = 'revenue_member' THEN
    RAISE EXCEPTION 'A Revenue member is viewed in the Revenue app' USING ERRCODE = '22023';
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
    v_out := jsonb_build_object(
      'id', v_target.id,
      'name', v_target.name,
      'email', v_target.email,
      'role', v_target.role,
      'department_id', v_target.department_id,
      'permissions', to_jsonb(public.current_permissions()),
      'actions', public.current_actions(),
      'sensitive', to_jsonb(public.current_sensitive_fields()),
      'tabs', public.current_tabs());
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    RAISE;
  END;
  RETURN v_out;
END
$fn$;

REVOKE ALL ON FUNCTION public.view_as_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.view_as_person(uuid) TO authenticated;

-- Who may be viewed: everybody who signs in to the portal, by name, title and
-- department — for whoever may switch views.
CREATE OR REPLACE FUNCTION public.view_as_people()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('view_switch') THEN
    RAISE EXCEPTION 'Only whoever may switch views can view as somebody else' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', u.id, 'name', coalesce(s.employee_name, u.name), 'email', u.email,
             'title', t.name, 'department', d.name)
           ORDER BY d.name NULLS LAST, coalesce(s.employee_name, u.name))
      FROM public.users u
      LEFT JOIN LATERAL (SELECT x.employee_name, x.title_id, x.department_id FROM public.hr_staff_costs x WHERE x.user_id = u.id LIMIT 1) s ON true
      LEFT JOIN public.titles t ON t.id = s.title_id
      LEFT JOIN public.departments d ON d.id = coalesce(s.department_id, u.department_id)
     WHERE u.is_active AND u.role::text <> 'revenue_member' AND u.id <> auth.uid()
  ), '[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.view_as_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.view_as_people() TO authenticated;
