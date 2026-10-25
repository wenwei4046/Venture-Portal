-- 20261026003000_marketing_ads_pdf.sql
-- 2026-10-25 — Marketing ⑤-3e: an Ads report's PDF. Asked whether an Ads report should give a PDF, the user: "can do" (the
-- handoff's PIC Link writes *PDF* at each report's right). The team's is drawn from the page's own read, which said
-- nothing of the project it is on:
--   mkt_ads_view — production's body (md5 14297cf5…, mig 20261026001000), one statement changed: + 'project' — its Track
--   ID, its title, its subsidiary's name, for the document's head. The PIC's PDF reads mkt_pic_page, which says them.

CREATE OR REPLACE FUNCTION public.mkt_ads_view(p_project uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p public.mkt_projects;
  v_a public.mkt_ads;
BEGIN
  SELECT * INTO v_p FROM public.mkt_projects WHERE id = p_project;
  SELECT * INTO v_a FROM public.mkt_ads WHERE project_id = p_project;
  RETURN jsonb_build_object(
    'today', (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    'link', v_p.link_code IS NOT NULL,
    'project', jsonb_build_object('track', v_p.track_id, 'title', v_p.title,
                                  'sub', (SELECT s.name FROM public.mkt_subsidiaries s WHERE s.id = v_p.subsidiary_id)),
    'setup', CASE WHEN v_a.project_id IS NULL THEN NULL ELSE jsonb_build_object(
      'ads', to_jsonb(v_a.ads), 'every', v_a.every, 'startsOn', v_a.starts_on, 'figures', to_jsonb(v_a.figures),
      'targets', v_a.targets, 'lastNo', v_a.last_no) END,
    'reports', coalesce((
      SELECT jsonb_agg(jsonb_build_object('no', r.no, 'from', r.from_day, 'until', r.until_day, 'values', r.vals,
                                          'targets', r.targets, 'note', r.note, 'by', r.by_name, 'at', r.published_at,
                                          'updatedAt', r.updated_at) ORDER BY r.no DESC)
        FROM public.mkt_ads_reports r WHERE r.project_id = p_project), '[]'::jsonb));
END
$fn$;

NOTIFY pgrst, 'reload schema';
