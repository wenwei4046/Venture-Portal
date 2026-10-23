-- ============================================================================
-- 20261024005000_marketing_subsidiary_page.sql
-- Marketing ④-2 — a subsidiary's page (`Subsidiary Page.dc.html` of the Claude Design handoff "HOUZS Marketing Module
-- Setup"). Its projects, their stages and dates come from the board (mkt_board, read on the page's own session); this
-- adds its ⚡ Recent activity — the newest lines on its projects' trails — and the page in the database's copy of the
-- tab registry (the Projects tab, as Subsidiaries itself).
-- ============================================================================
--   mkt_sub_feed(sub, limit)   Marketing · View — the newest lines (1–50, 20 unless asked) of the trails of a
--                              subsidiary's projects, each with its project; not the Free space's (the task page hides
--                              them too)
-- PGlite: tests/member-sql/validate-marketing-subsidiary-feed.mjs.

CREATE OR REPLACE FUNCTION public.mkt_sub_feed(p_sub uuid, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.mkt_need(ARRAY['marketing.view'], 'Marketing is not open to your account.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', e.id, 'at', e.at, 'actor', e.actor_name, 'action', e.action, 'stage', e.stage_idx,
             'stageName', e.stage_name, 'fromTo', e.from_to, 'reason', e.reason, 'version', e.version, 'data', e.data,
             'project', jsonb_build_object('id', p.id, 'track', p.track_id, 'title', p.title, 'kind', p.kind))
           ORDER BY e.id DESC)
      FROM (SELECT ev.*
              FROM public.mkt_events ev
              JOIN public.mkt_projects pp ON pp.id = ev.project_id
             WHERE pp.subsidiary_id = p_sub AND ev.action <> 'free'
             ORDER BY ev.id DESC
             LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)) e
      JOIN public.mkt_projects p ON p.id = e.project_id), '[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.mkt_sub_feed(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_sub_feed(uuid, integer) TO authenticated;

-- ── The page in the database's copy of the tab registry ────────────────────────
INSERT INTO public.permission_page_tabs (page, tab_id) VALUES ('/marketing/subsidiaries/[code]', 'mkt.projects')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
