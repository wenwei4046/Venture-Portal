-- ============================================================================
-- 20261024006000_marketing_project_log.sql
-- Marketing ④-3 — a project's formal log (`Audit Trail.dc.html` of the Claude Design handoff "HOUZS Marketing Module
-- Setup"): every record of its trail, oldest first, each with all it holds. The task page reads every event already;
-- a product project's page only its newest 40, and not their stages, hand-overs or versions — the log reads its own.
-- ============================================================================
--   mkt_project_log(project)   Marketing · View — the project's Track ID, title and kind, and every line of its trail
--                              but the Free space's (the trail hides them too); NULL for no such project
-- Read-only: nothing writes here. PGlite: tests/member-sql/validate-marketing-project-log.mjs.

CREATE OR REPLACE FUNCTION public.mkt_project_log(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'track', v_p.track_id, 'title', v_p.title, 'kind', v_p.kind,
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', e.id, 'at', e.at, 'actor', e.actor_name, 'action', e.action, 'stage', e.stage_idx,
               'stageName', e.stage_name, 'fromTo', e.from_to, 'reason', e.reason, 'version', e.version, 'data', e.data)
             ORDER BY e.id)
        FROM public.mkt_events e
       WHERE e.project_id = v_p.id AND e.action <> 'free'), '[]'::jsonb));
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_project_log(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_project_log(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
