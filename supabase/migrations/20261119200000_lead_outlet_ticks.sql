-- ════════════════════════════════════════════════════════════════════════════
-- Lead View's outlets per person, ticked in People › Permissions (2026-11-19)
-- ════════════════════════════════════════════════════════════════════════════
-- The owner: "还是我们可以在people permission 做这个功能，去设置那个staff 能看到哪个outlet 的讯息，和他们的广告成效",
-- then "好，照你建议的做" to the plan: outlet pills in a person's permission window under Lead View's rows; none
-- ticked = every outlet (nobody moves today); ticked = only those outlets' chats, leads, Insight and showroom visits;
-- the chats with no outlet are no longer an outlet person's; Lead View · Manage always sees every outlet; Settings ›
-- Team keeps who is in and their role, and shows the outlets People › Permissions ticked.
--
--   user_lead_outlets                            one person's outlets (no row = every outlet)
--   person_lead_outlets(user)                    a person's window: every live outlet by brand, and their ticks
--   permission_user_lead_outlets_set(user, ids)  their ticks, by whoever manages permissions (the whole list)
--   lead_my_outlets()                            reads the ticks now, not the Team's outlets
--   lead_outlet_ok(…)                            a chat with no outlet is no longer inside a scope
--   lead_team()                                  'outlets' = the person's ticks (Settings › Team, Preview as)
--
-- Every Lead View reader that narrows by outlet already asks lead_my_outlets() / lead_outlet_ok() (lead_inbox,
-- lead_thread, lead_leads, lead_list, lead_insight_more, lead_visits, lead_overview, lead_save_visit), so they follow
-- with no change. Production's Team is empty on 2026-11-19 and nobody has a tick, so nothing anybody reads moves.
-- lead_team_outlets stays (still written by lead_team_save, read by nothing).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_lead_outlets (
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  outlet_id  uuid NOT NULL REFERENCES public.lead_outlets(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, outlet_id)
);
ALTER TABLE public.user_lead_outlets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_lead_outlets_read ON public.user_lead_outlets;
-- Read as a person's boxes are (user_crm_brands); written only through permission_user_lead_outlets_set().
CREATE POLICY user_lead_outlets_read ON public.user_lead_outlets FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_perm('team')) OR (SELECT public.has_perm('permissions_manage')));
COMMENT ON TABLE public.user_lead_outlets IS
  'One person''s Lead View outlets (2026-11-19): none = every outlet. Written by permission_user_lead_outlets_set().';

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('user_lead_outlets', ARRAY['accounts.manage', 'accounts.view', 'team.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('user_lead_outlets');

SELECT public.audit_register('user_lead_outlets', 'Personal Lead View outlets', 'People', '{permissions_manage}', 'all',
  p_keys => '{user_id,outlet_id}', p_labels => '{user_id,outlet_id}');

-- The Team's outlets so far become the person's ticks (none on production on 2026-11-19).
INSERT INTO public.user_lead_outlets (user_id, outlet_id)
SELECT DISTINCT s.user_id, o.outlet_id
  FROM public.lead_team t
  JOIN public.hr_staff_costs s ON s.id = t.staff_id AND s.user_id IS NOT NULL
  JOIN public.lead_team_outlets o ON o.staff_id = t.staff_id
 WHERE t.role = 'outlet'
ON CONFLICT DO NOTHING;

-- ── Whose outlets ──────────────────────────────────────────────────────────

-- The signed-in person's outlets; NULL = every outlet (no tick, Lead View · Manage, or no sign-in). Ticks on outlets
-- since removed leave the live ones — none left, no chat at all, never every outlet.
CREATE OR REPLACE FUNCTION public.lead_my_outlets()
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_lead_outlets u WHERE u.user_id = v_me)
     OR public.has_any_action(ARRAY['leads.manage']) THEN
    RETURN NULL;
  END IF;
  RETURN ARRAY(SELECT u.outlet_id FROM public.user_lead_outlets u
                 JOIN public.lead_outlets lo ON lo.id = u.outlet_id AND lo.deleted_at IS NULL
                WHERE u.user_id = v_me ORDER BY u.outlet_id);
END
$$;

-- Is a customer inside a scope (lead_my_outlets())? Their outlet is CS's pick, else their ad's; one with no outlet is not.
CREATE OR REPLACE FUNCTION public.lead_outlet_ok(p_scope uuid[], p_by text, p_outlet uuid, p_ad text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v uuid;
BEGIN
  IF p_scope IS NULL THEN RETURN true; END IF;
  v := CASE WHEN p_by = 'cs' THEN p_outlet ELSE (SELECT a.outlet_id FROM public.lead_ad_outlets a WHERE a.ad_id = p_ad) END;
  RETURN v IS NOT NULL AND v = ANY (p_scope);
END
$$;

REVOKE ALL ON FUNCTION public.lead_my_outlets(), public.lead_outlet_ok(uuid[], text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_my_outlets(), public.lead_outlet_ok(uuid[], text, uuid, text) TO service_role;

-- ── A person's window, and their ticks ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.person_lead_outlets(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Read as their boxes are: their own, or People's / Permissions' readers, who also hold the action.
  IF auth.uid() IS NULL
     OR NOT (p_user = auth.uid() OR public.has_perm('team') OR public.has_perm('permissions_manage'))
     OR NOT public.has_any_action(ARRAY['accounts.manage', 'accounts.view', 'team.view:own']) THEN
    RAISE EXCEPTION 'Only whoever reads people''s permissions sees their Lead View outlets' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'outlets', coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'brandId', o.brand_id,
                                                             'brand', coalesce(b.name, '')) ORDER BY b.name, o.name)
                           FROM public.lead_outlets o LEFT JOIN public.lead_brands b ON b.id = o.brand_id
                          WHERE o.deleted_at IS NULL), '[]'::jsonb),
    'ticked', coalesce((SELECT jsonb_agg(u.outlet_id ORDER BY u.outlet_id) FROM public.user_lead_outlets u
                          JOIN public.lead_outlets o ON o.id = u.outlet_id AND o.deleted_at IS NULL
                         WHERE u.user_id = p_user), '[]'::jsonb));
END
$fn$;

-- The person's whole list: what is not in it goes, what is, is kept. [] = every outlet again.
CREATE OR REPLACE FUNCTION public.permission_user_lead_outlets_set(p_user uuid, p_outlets uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a person''s own permissions' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user) THEN RAISE EXCEPTION 'That account is gone'; END IF;
  p_outlets := coalesce(p_outlets, '{}');
  IF cardinality(p_outlets) > 200 THEN RAISE EXCEPTION 'Too many outlets'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_outlets) x WHERE x IS NULL
                OR NOT EXISTS (SELECT 1 FROM public.lead_outlets o WHERE o.id = x AND o.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'An outlet that is not there' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.user_lead_outlets u WHERE u.user_id = p_user AND NOT (u.outlet_id = ANY (p_outlets));
  INSERT INTO public.user_lead_outlets (user_id, outlet_id, updated_by)
  SELECT DISTINCT p_user, x, auth.uid() FROM unnest(p_outlets) x
  ON CONFLICT (user_id, outlet_id) DO NOTHING;
END
$fn$;

REVOKE ALL ON FUNCTION public.person_lead_outlets(uuid), public.permission_user_lead_outlets_set(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_lead_outlets(uuid), public.permission_user_lead_outlets_set(uuid, uuid[]) TO authenticated, service_role;

-- ── Settings › Team shows the person's ticks ───────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.swap_once(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_def   text := pg_get_functiondef(p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: the statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  FOR v_found IN SELECT DISTINCT m[1] FROM regexp_matches(v_src, '(' || v_pat || ')', 'g') AS m LOOP
    v_def := replace(v_def, v_found, p_new);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

SELECT pg_temp.swap_once('public.lead_team()',
  $q$'outlets', coalesce((SELECT jsonb_agg(o.outlet_id) FROM public.lead_team_outlets o
                                   JOIN public.lead_outlets lo ON lo.id = o.outlet_id AND lo.deleted_at IS NULL WHERE o.staff_id = s.id), '[]'::jsonb),$q$,
  $q$'outlets', coalesce((SELECT jsonb_agg(o.outlet_id) FROM public.user_lead_outlets o
                                   JOIN public.lead_outlets lo ON lo.id = o.outlet_id AND lo.deleted_at IS NULL WHERE o.user_id = s.user_id), '[]'::jsonb),$q$);

NOTIFY pgrst, 'reload schema';
