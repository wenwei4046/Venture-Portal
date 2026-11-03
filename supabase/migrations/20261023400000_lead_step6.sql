-- Lead View › Campaigns v2, Insight v2 and the Audit log page (2026-10-23, the redesign v2 handoff `Campaigns.dc.html`,
-- `Insight.dc.html`, `Audit Log.dc.html` — the user: "Start step 6: Campaigns, Audit log, Insight"; step 6).
--
-- CAMPAIGNS: the audience learns the handoff's two filters — "Did not buy yet" (notBought: never closed) and "Came to
-- the showroom but did not buy" (cameNotBought) — beside the days and the interest it had. A sent campaign's results
-- add BOUGHT: recipients closed (Leads' Closed, set by CS) after it went. The page's header counts promotions consent
-- (lead_consent: agreed · not asked · unsubscribed, per brand). Meta's rule is unchanged (lead_audience's basis).
--
-- INSIGHT: lead_insight_more(from, to) — for the conversations started in those office days: who answered first
-- (Customer Service, a template, or the AI Agent — CS sending an AI draft) and how fast; and how far each template's
-- steps got (a step counts a conversation once the template sent its message there).
--
-- AUDIT LOG: a page of its own, /leads/audit (lead.audit: View = Lead View · View), reading the portal's audit_changes()
-- for the lead_* tables. Its registry rows go in by name. Nothing here writes.

-- Production's bodies are checked first (md5 of prosrc = mig 20261016340000's): these replace them whole.
DO $do$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_audience(uuid, text, jsonb, timestamptz)'::regprocedure) <> '744edee1fcacf9e574bc986b78644668'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_campaigns()'::regprocedure) <> '71994195ec3c11a4dbd2800ec4539a1f' THEN
    RAISE EXCEPTION 'The campaign functions are not the bodies this migration expects — compare them with production first';
  END IF;
END
$do$;

-- Every conversation of the brand the audience matches, and its basis: window · optin · none (outside 24 hours,
-- not opted in) · out (unsubscribed). Twin of the rule: basisOf() in src/lib/leads/campaign.ts.
CREATE OR REPLACE FUNCTION public.lead_audience(p_brand uuid, p_channel text, p_audience jsonb, p_at timestamptz DEFAULT now())
RETURNS TABLE (contact_id uuid, name text, basis text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT c.id, c.name,
         CASE WHEN c.opt_in = 'out' THEN 'out'
              WHEN li.at > p_at - interval '24 hours' THEN 'window'
              WHEN c.opt_in = 'in' THEN 'optin'
              ELSE 'none' END
    FROM public.lead_contacts c
    LEFT JOIN LATERAL (SELECT max(m.created_at) AS at FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'in') li ON true
   WHERE c.brand_id = p_brand
     AND (coalesce(p_channel, 'all') = 'all' OR c.channel = p_channel)
     AND (c.is_test = false OR coalesce((p_audience->>'tests')::boolean, false))
     AND c.last_at > p_at - make_interval(days => greatest(1, least(coalesce((p_audience->>'days')::integer, 90), 3650)))
     AND (btrim(coalesce(p_audience->>'interest', '')) = '' OR c.interest ILIKE '%' || btrim(p_audience->>'interest') || '%')
     AND CASE coalesce(p_audience->>'phone', 'any') WHEN 'with' THEN c.phone IS NOT NULL WHEN 'without' THEN c.phone IS NULL ELSE true END
     AND CASE coalesce(p_audience->>'handed', 'any') WHEN 'yes' THEN c.handed_at IS NOT NULL WHEN 'no' THEN c.handed_at IS NULL ELSE true END
     AND CASE coalesce(p_audience->>'source', 'any') WHEN 'ad' THEN c.source_ad <> '' WHEN 'organic' THEN c.source_ad = '' ELSE true END
     AND (NOT coalesce((p_audience->>'notBought')::boolean, false) OR c.closed_at IS NULL)
     AND (NOT coalesce((p_audience->>'cameNotBought')::boolean, false) OR ((c.came_at IS NOT NULL OR c.shown = 'came') AND c.closed_at IS NULL))
$fn$;
REVOKE ALL ON FUNCTION public.lead_audience(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_audience(uuid, text, jsonb, timestamptz) TO service_role;

-- Every campaign, newest first, with what came of the sent ones: delivered, replied after it, phones got after it,
-- and bought after it (closed on Leads).
CREATE OR REPLACE FUNCTION public.lead_campaigns()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', k.id, 'brandId', k.brand_id, 'name', k.name, 'channel', k.channel, 'audience', k.audience, 'body', k.body,
      'buttons', k.buttons, 'status', k.status, 'scheduledAt', k.scheduled_at, 'sentAt', k.sent_at, 'sentByName', k.sent_by_name,
      'updatedByName', k.updated_by_name, 'updatedAt', k.updated_at,
      'sent', (SELECT count(*) FROM public.lead_campaign_recipients r WHERE r.campaign_id = k.id),
      'paid', (SELECT count(*) FROM public.lead_campaign_recipients r WHERE r.campaign_id = k.id AND r.basis = 'optin'),
      'replied', (SELECT count(*) FROM public.lead_campaign_recipients r
                   WHERE r.campaign_id = k.id AND EXISTS (SELECT 1 FROM public.lead_messages m
                     WHERE m.contact_id = r.contact_id AND m.direction = 'in' AND m.id > r.message_id)),
      'phones', (SELECT count(*) FROM public.lead_campaign_recipients r JOIN public.lead_contacts c ON c.id = r.contact_id
                  WHERE r.campaign_id = k.id AND c.phone_at > k.sent_at),
      'bought', (SELECT count(*) FROM public.lead_campaign_recipients r JOIN public.lead_contacts c ON c.id = r.contact_id
                  WHERE r.campaign_id = k.id AND c.closed_at > k.sent_at))
      ORDER BY coalesce(k.sent_at, k.scheduled_at, k.updated_at) DESC)
      FROM public.lead_campaigns k WHERE k.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- Promotions consent, per brand and test or real: agreed (in), not asked (none), unsubscribed (out).
CREATE OR REPLACE FUNCTION public.lead_consent()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('brandId', x.brand_id, 'test', x.is_test, 'optIn', x.opt_in, 'n', x.n))
                     FROM (SELECT c.brand_id, c.is_test, coalesce(c.opt_in, 'none') AS opt_in, count(*) AS n
                             FROM public.lead_contacts c GROUP BY 1, 2, 3) x), '[]'::jsonb);
END
$fn$;

-- Insight beyond the funnel, for the conversations started from p_from to p_to (office days; NULL = no bound):
--   replies — one per conversation: its brand, test or not, a phone or not, who answered first (cs · template · ai —
--             CS sending an AI draft — or null, nobody yet) and after how many seconds;
--   steps   — per template, brand and step: how many conversations the template's message reached there.
CREATE OR REPLACE FUNCTION public.lead_insight_more(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN (
    WITH cs AS (
      SELECT c.id, c.brand_id, c.is_test, c.phone
        FROM public.lead_contacts c
       WHERE (p_from IS NULL OR (c.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date >= p_from)
         AND (p_to IS NULL OR (c.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= p_to)
       LIMIT 5000)
    SELECT jsonb_build_object(
      'replies', coalesce((
        SELECT jsonb_agg(jsonb_build_object('brandId', c.brand_id, 'test', c.is_test, 'phone', c.phone IS NOT NULL, 'by', fo.by, 'secs', fo.secs))
          FROM cs c
          LEFT JOIN LATERAL (SELECT min(m.created_at) AS at FROM public.lead_messages m WHERE m.contact_id = c.id AND m.direction = 'in') fi ON true
          LEFT JOIN LATERAL (
            SELECT CASE WHEN o.sender = 'flow' THEN 'template'
                        WHEN o.sender = 'cs' AND EXISTS (SELECT 1 FROM public.lead_ai_drafts d WHERE d.contact_id = c.id
                               AND d.outcome IN ('sent', 'edited') AND d.decided_at BETWEEN o.created_at - interval '1 minute' AND o.created_at + interval '1 minute') THEN 'ai'
                        WHEN o.sender = 'cs' THEN 'cs' END AS by,
                   extract(epoch FROM o.created_at - fi.at)::integer AS secs
              FROM public.lead_messages o
             WHERE o.contact_id = c.id AND o.direction = 'out' AND o.sender IN ('cs', 'flow') AND fi.at IS NOT NULL AND o.created_at >= fi.at
             ORDER BY o.created_at, o.id LIMIT 1) fo ON true), '[]'::jsonb),
      'steps', coalesce((
        SELECT jsonb_agg(jsonb_build_object('flowId', x.flow_id, 'brandId', x.brand_id, 'test', x.is_test, 'stepId', x.step_id, 'n', x.n))
          FROM (SELECT f.id AS flow_id, c.brand_id, c.is_test, s->>'id' AS step_id, count(DISTINCT c.id) AS n
                  FROM cs c
                  JOIN public.lead_messages m ON m.contact_id = c.id AND m.sender = 'flow'
                  JOIN public.lead_flows f ON f.name = m.by_name AND f.deleted_at IS NULL
                  CROSS JOIN LATERAL jsonb_array_elements(f.steps) s
                 WHERE btrim(coalesce(s->>'text', '')) <> '' AND m.body = left(s->>'text', 2000)
                 GROUP BY 1, 2, 3, 4) x), '[]'::jsonb)));
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_consent() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_insight_more(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_consent() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_insight_more(date, date) TO authenticated;

-- ── The Audit log page, by name ─────────────────────────────────────────────

INSERT INTO public.permission_page_tabs (page, tab_id) VALUES
  ('/leads/audit', 'lead.audit')
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_tab_cells (tab_id, action, cell) VALUES
  ('lead.audit', 'view', 'leads.view')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
