-- ============================================================================
-- 20261011020000_permission_tabs_people.sql
-- A person's own boxes follow their template (HR revamp 8a, 2026-10-11).
-- ============================================================================
--
-- One person's boxes are kept as what was changed for them OVER their title's
-- template, and the cells the database asks for are worked out from both
-- (20261011010000). So when what lies under the boxes changes — the template's
-- ticks are saved, or their title is pointed at another template — their cells
-- must be worked out again, or the database grants other than their window
-- shows: a box held back from one page would go on holding back what the
-- template later gives through another, a cell given with an old tick would
-- outlive it. The app works the cells out (the catalog is
-- src/lib/permission-tabs.ts) and hands them in with the change, which writes
-- the template or the title AND every holder's boxes and cells in ONE
-- transaction, each person through permission_user_tabs_set (its checks, its
-- audit trail).
--
--   permission_template_tabs_save(…, p_people)   p_reset gives way to p_people
--                                                 (no app has called it yet)
--   permission_title_move(p_title, p_template, p_people)
--                                                 the title's template, its holders' cells with it
--   permission_people_reapply(p_template, p_people)
--                                                 the shared loop; only the two above call it

-- ── The holders, one by one ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.permission_people_reapply(p_template uuid, p_people jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_person record;
  v_n integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions sets a person''s own permissions' USING ERRCODE = '42501';
  END IF;
  IF p_people IS NULL OR jsonb_typeof(p_people) IS DISTINCT FROM 'array' OR jsonb_array_length(p_people) > 500 THEN
    RAISE EXCEPTION 'The people must be sent as a list';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_people) AS x(user_id uuid)
              GROUP BY x.user_id HAVING count(*) > 1 OR x.user_id IS NULL) THEN
    RAISE EXCEPTION 'Each person once, by their account';
  END IF;
  FOR v_person IN SELECT * FROM jsonb_to_recordset(p_people) AS x(user_id uuid, tabs jsonb, cells jsonb) LOOP
    -- Only somebody whose title points at this template: their boxes lie over it.
    IF NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s JOIN public.titles ti ON ti.id = s.title_id
                    WHERE s.user_id = v_person.user_id AND ti.template_id = p_template) THEN
      RAISE EXCEPTION 'Somebody listed is not on this template. Reload and try again';
    END IF;
    PERFORM public.permission_user_tabs_set(v_person.user_id, coalesce(v_person.tabs, '[]'::jsonb), coalesce(v_person.cells, '[]'::jsonb));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- ── A template's save: its ticks, their cells, and its holders' own cells ────

DROP FUNCTION IF EXISTS public.permission_template_tabs_save(uuid, integer, text[], jsonb, text[], jsonb);
CREATE FUNCTION public.permission_template_tabs_save(
  p_template uuid, p_version integer, p_tabs text[], p_grants jsonb, p_sensitive text[], p_people jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_bad text;
  v_people integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions changes a template' USING ERRCODE = '42501';
  END IF;
  IF p_tabs IS NULL OR cardinality(p_tabs) > 400 THEN RAISE EXCEPTION 'The boxes must be sent as a list'; END IF;
  SELECT coalesce(t, 'An empty box') INTO v_bad FROM unnest(p_tabs) t
   WHERE t IS NULL OR t !~ '^(hr|fin|pri|dept|rev)\.[a-z_]{2,40}\.(view|create|edit|approve)$' LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION '% is not a box of the matrix', v_bad; END IF;

  -- The cells first: their checks (the version, each cell valid, nothing past its View) refuse the whole save.
  PERFORM public.permission_template_save(p_template, p_version, p_grants, p_sensitive, '[]'::jsonb);

  DELETE FROM public.permission_template_tabs t
   WHERE t.template_id = p_template
     AND NOT (t.tab_id || '.' || t.action = ANY (p_tabs));
  INSERT INTO public.permission_template_tabs (template_id, tab_id, action)
  SELECT DISTINCT p_template, regexp_replace(t, '\.[a-z]+$', ''), substring(t FROM '\.([a-z]+)$')
    FROM unnest(p_tabs) t
  ON CONFLICT DO NOTHING;

  -- Then whoever on it has boxes of their own, over the new ticks.
  v_people := public.permission_people_reapply(p_template, coalesce(p_people, '[]'::jsonb));

  RETURN jsonb_build_object('version', (SELECT version FROM public.permission_templates WHERE id = p_template),
                            'titles', (SELECT count(*) FROM public.titles WHERE template_id = p_template),
                            'people', v_people);
END
$fn$;

-- ── A title onto another template, its holders' own cells with it ────────────

CREATE OR REPLACE FUNCTION public.permission_title_move(p_title uuid, p_template uuid, p_people jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('permissions_manage') THEN
    RAISE EXCEPTION 'Only whoever manages permissions points a title at a template' USING ERRCODE = '42501';
  END IF;
  IF p_people IS NULL OR jsonb_typeof(p_people) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'The people must be sent as a list';
  END IF;
  IF p_template IS NULL AND jsonb_array_length(p_people) > 0 THEN
    RAISE EXCEPTION 'A title with no template has no boxes to carry';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_people) AS x(user_id uuid)
              WHERE NOT EXISTS (SELECT 1 FROM public.hr_staff_costs s WHERE s.user_id = x.user_id AND s.title_id = p_title)) THEN
    RAISE EXCEPTION 'Somebody listed does not hold this title. Reload and try again';
  END IF;

  PERFORM public.permission_title_set_template(p_title, p_template);
  IF p_template IS NULL THEN RETURN 0; END IF;
  RETURN public.permission_people_reapply(p_template, p_people);
END
$fn$;

REVOKE ALL ON FUNCTION public.permission_people_reapply(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.permission_people_reapply(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.permission_template_tabs_save(uuid, integer, text[], jsonb, text[], jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permission_title_move(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_template_tabs_save(uuid, integer, text[], jsonb, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_title_move(uuid, uuid, jsonb) TO authenticated;
