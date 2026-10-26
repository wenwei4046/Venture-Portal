-- ============================================================================
-- 20261025171000_marketing_log_corrections.sql
-- Marketing ④-3b (2026-10-25) — the formal log's corrections: the user's answer 19, "corrections annotate a record,
-- never change the project; the manager's" (`Audit Trail.dc.html`: "Records are read-only. Mistakes are fixed by
-- adding a correction entry, never by editing." — the entry's *correction of #n*). The log's exports (answers 18 and
-- 21 — all of Marketing; a formal document and the table as on screen, and the handoff's CSV) are the app's: a GET
-- route over mkt_project_log, no SQL of their own.
-- ============================================================================
--
-- New (SECURITY DEFINER; PUBLIC and anon revoked, `authenticated` granted; Marketing · Manage):
--   mkt_log_correct(project, event, words)  a correction of one of the project's records — a record of its own on the
--                                           trail: action 'correction', its words (5–500) as its reason, `corrects`
--                                           the record (mkt_events has kept the column since 20261023214100), the
--                                           record's stage — and nothing else changes, the record corrected least of
--                                           all. Never a Free space line (the log never shows them). Answers the log.
-- Replaced from production's body (md5 equal — 20261024006000's):
--   mkt_project_log   + each record's `corrects`
-- PGlite: tests/member-sql/validate-marketing-log-corrections.mjs.

-- ── The log: each record's correction of another ────────────────────────────────────────────────────────────
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
               'stageName', e.stage_name, 'fromTo', e.from_to, 'reason', e.reason, 'version', e.version, 'data', e.data,
               -- A correction (④-3b): the record it corrects.
               'corrects', e.corrects)
             ORDER BY e.id)
        FROM public.mkt_events e
       WHERE e.project_id = v_p.id AND e.action <> 'free'), '[]'::jsonb));
END
$fn$;

-- ── A correction, the manager's ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_log_correct(p_project uuid, p_event bigint, p_text text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_text text := btrim(coalesce(p_text, ''));
  v_e    public.mkt_events;
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.manage'], 'Only Marketing''s managers correct a record.');
  IF NOT EXISTS (SELECT 1 FROM public.mkt_projects WHERE id = p_project) THEN
    RAISE EXCEPTION 'That project is not there.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_e FROM public.mkt_events WHERE id = p_event AND project_id = p_project AND action <> 'free';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That record is not on this project''s log.' USING ERRCODE = 'P0002';
  END IF;
  IF length(v_text) < 5 OR length(v_text) > 500 THEN
    RAISE EXCEPTION 'Say what was wrong and what is right — 5 to 500 characters.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.mkt_events (project_id, actor_user, actor_name, action, stage_idx, stage_name, reason, corrects)
  VALUES (p_project, auth.uid(), public.mkt_actor(), 'correction', v_e.stage_idx, v_e.stage_name, v_text, v_e.id);
  RETURN public.mkt_project_log(p_project);
END
$fn$;
REVOKE ALL ON FUNCTION public.mkt_log_correct(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_log_correct(uuid, bigint, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
