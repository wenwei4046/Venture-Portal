-- Lead View: which reply rule a conversation follows (2026-11-02 — the user, at the chat header: "是否能显示目前这个对话是用
-- 什么回复规则呢？是根据reply rules").
--
-- `lead_rule_of(contact)` (Lead View · View; a read) says what `lead_rule_reply` decides for the conversation right now,
-- and why: its ad's own rule (that window's, else any time), else its brand and channel's row on Reply rules (working
-- or after hours, by Working hours), else none. The chat header's Rule chip draws it. No other function changes.

CREATE OR REPLACE FUNCTION public.lead_rule_of(p_contact uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.lead_contacts;
  v_open boolean;
  v_reply text;
  v_when text;
  v_source text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  SELECT * INTO c FROM public.lead_contacts WHERE id = p_contact;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  v_open := public.lead_hours_open(now());
  -- As lead_rule_reply: the ad's rule for this window (open / closed) before its any-time one, …
  IF c.ad_id IS NOT NULL THEN
    SELECT r.reply, r.at_when INTO v_reply, v_when FROM public.lead_reply_rules r
     WHERE r.ad_id = c.ad_id AND (r.at_when = 'any' OR (r.at_when = 'open') = v_open)
     ORDER BY (r.at_when = 'any'), r.sort_order LIMIT 1;
    IF v_reply IS NOT NULL THEN
      v_source := 'ad';
    END IF;
  END IF;
  -- … else the brand and channel's row.
  IF v_reply IS NULL THEN
    SELECT CASE WHEN v_open THEN p.work_reply ELSE p.after_reply END INTO v_reply
      FROM public.lead_reply_pages p WHERE p.brand_id = c.brand_id AND p.channel = c.channel;
    IF v_reply IS NOT NULL THEN
      v_source := 'page';
      v_when := CASE WHEN v_open THEN 'open' ELSE 'closed' END;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'source', v_source,
    'when', v_when,
    'open', v_open,
    'reply', v_reply,
    'templateName', (SELECT f.name FROM public.lead_flows f WHERE f.id::text = v_reply AND f.deleted_at IS NULL),
    'adId', c.ad_id,
    'adName', (SELECT a.name FROM public.lead_ads a WHERE a.ad_id = c.ad_id),
    'headline', c.source_ad,
    'brand', (SELECT b.name FROM public.lead_brands b WHERE b.id = c.brand_id),
    'channel', c.channel);
END
$$;
REVOKE ALL ON FUNCTION public.lead_rule_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_rule_of(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
