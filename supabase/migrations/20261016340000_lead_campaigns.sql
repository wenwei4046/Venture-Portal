-- ============================================================================
-- 20261016340000_lead_campaigns.sql
-- Lead View › Campaigns (2026-10-16 — the user's brief part 3, "Campaign Blasting 就是廣發資訊給客戶"; the design
-- canvas's "Campaigns" board; built as a framework first — the user: "先把整体框架做好"). Meta is not connected, so
-- a campaign's messages are RECORDED on each conversation (delivery 'recorded'), never sent.
-- ============================================================================
--
-- 1. Meta's rule, kept by the database: a customer who wrote in the last 24 hours may be messaged ('window');
--    past that, only one who agreed to promotional messages ('optin', Meta charges per message); one who
--    unsubscribed never. lead_contacts.opt_in: none · in · out. Until Meta is connected, a TEST conversation's
--    opt-in is set by hand on the customer card (lead_set_opt_in); a real one's will come from Meta.
-- 2. lead_campaigns: a brand's message (with {name}), up to 3 buttons, its audience (contacted within N days,
--    channel, interest, phone, handed over, ad or organic, test conversations), and its status
--    draft · scheduled · sent. lead_campaign_recipients: who got it, and on which basis.
-- 3. lead_campaign_audience counts before sending (who may get it, who is left out and why);
--    lead_send_campaign records the message on every eligible conversation now. Scheduled sending
--    (lead_campaign_send_due, the service role's) is not wired to a clock yet — that is decided when Meta is.
-- 4. lead_messages.sender learns 'campaign'; the flow runner ignores it (an 'out' message that is not CS's).
-- 5. /leads/campaigns joins the tab registry (mig 20261016340100): lead.campaigns — View, Edit = Lead View · Manage.

-- ── Opt-in on the conversation ───────────────────────────────────────────────

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS opt_in    text NOT NULL DEFAULT 'none' CHECK (opt_in IN ('none', 'in', 'out')),
  ADD COLUMN IF NOT EXISTS opt_in_at timestamptz;

-- The card shows it: production's lead_contact_json (mig 20261016310000's body) with two keys added at the end.
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.lead_contact_json(public.lead_contacts)'::regprocedure);
  v_old text := '''flowState'', c.flow_state, ''flowName'', f.name)';
  v_new text := '''flowState'', c.flow_state, ''flowName'', f.name, ''optIn'', c.opt_in, ''optInAt'', c.opt_in_at)';
BEGIN
  IF position(v_new IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF length(v_def) - length(replace(v_def, v_old, '')) <> length(v_old) THEN
    RAISE EXCEPTION 'lead_contact_json is not the body this migration expects';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;

-- ── A campaign's message on the conversation ─────────────────────────────────

ALTER TABLE public.lead_messages DROP CONSTRAINT IF EXISTS lead_messages_sender_check;
ALTER TABLE public.lead_messages
  ADD CONSTRAINT lead_messages_sender_check CHECK (sender IN ('customer', 'cs', 'ai', 'flow', 'campaign'));

-- ── Campaigns ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         uuid NOT NULL REFERENCES public.lead_brands(id),
  name             text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 60),
  channel          text NOT NULL DEFAULT 'all' CHECK (channel IN ('all', 'messenger', 'instagram')),
  -- { days, interest, phone: any|with|without, handed: any|yes|no, source: any|ad|organic, tests: bool }
  audience         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(audience) = 'object'),
  body             text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 1900),
  buttons          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(buttons) = 'array' AND jsonb_array_length(buttons) <= 3),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent')),
  scheduled_at     timestamptz,
  sent_at          timestamptz,
  sent_by_name     text NOT NULL DEFAULT '',
  updated_by_name  text NOT NULL DEFAULT '',
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_campaigns_scheduled CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lead_campaigns_due ON public.lead_campaigns (scheduled_at) WHERE status = 'scheduled' AND deleted_at IS NULL;
ALTER TABLE public.lead_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_campaigns FROM anon, authenticated;
SELECT public.audit_register('lead_campaigns', 'Lead View campaigns', 'Member services', '{leads}', 'all', p_labels => '{name}');

CREATE TABLE IF NOT EXISTS public.lead_campaign_recipients (
  campaign_id  uuid NOT NULL REFERENCES public.lead_campaigns(id),
  contact_id   uuid NOT NULL REFERENCES public.lead_contacts(id),
  -- window = wrote in the last 24 hours; optin = agreed to promotions (Meta charges).
  basis        text NOT NULL CHECK (basis IN ('window', 'optin')),
  message_id   bigint NOT NULL REFERENCES public.lead_messages(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS lead_campaign_recipients_contact ON public.lead_campaign_recipients (contact_id);
ALTER TABLE public.lead_campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_campaign_recipients FROM anon, authenticated;
SELECT public.audit_register('lead_campaign_recipients', 'Lead View campaign recipients', 'Member services', '{}', 'none',
  p_reason => 'Written once by the send, beside the campaign''s own audited change; each row is the message it records.');

-- ── Who a campaign reaches ───────────────────────────────────────────────────

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
$fn$;
REVOKE ALL ON FUNCTION public.lead_audience(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_audience(uuid, text, jsonb, timestamptz) TO service_role;

-- The editor's count before sending.
CREATE OR REPLACE FUNCTION public.lead_campaign_audience(p_brand uuid, p_channel text, p_audience jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN (
    SELECT jsonb_build_object(
      'matched', count(*),
      'window', count(*) FILTER (WHERE a.basis = 'window'),
      'optin', count(*) FILTER (WHERE a.basis = 'optin'),
      'notOptedIn', count(*) FILTER (WHERE a.basis = 'none'),
      'unsubscribed', count(*) FILTER (WHERE a.basis = 'out'),
      'sample', coalesce((SELECT jsonb_agg(x.name) FROM (SELECT b.name FROM public.lead_audience(p_brand, p_channel, coalesce(p_audience, '{}'::jsonb)) b
                           WHERE b.basis IN ('window', 'optin') AND b.name <> '' ORDER BY b.name LIMIT 5) x), '[]'::jsonb))
      FROM public.lead_audience(p_brand, p_channel, coalesce(p_audience, '{}'::jsonb)) a);
END
$fn$;

-- Every campaign, newest first, with what came of the sent ones: delivered, replied after it, phones got after it.
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
                  WHERE r.campaign_id = k.id AND c.phone_at > k.sent_at))
      ORDER BY coalesce(k.sent_at, k.scheduled_at, k.updated_at) DESC)
      FROM public.lead_campaigns k WHERE k.deleted_at IS NULL), '[]'::jsonb);
END
$fn$;

-- A draft or scheduled campaign: new (p_id NULL) or changed. Keys: brandId, name, channel, audience, body, buttons,
-- scheduledAt (null → draft; a time to come → scheduled).
CREATE OR REPLACE FUNCTION public.lead_save_campaign(p_id uuid, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_brand uuid := nullif(p_data->>'brandId', '')::uuid;
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_channel text := coalesce(p_data->>'channel', 'all');
  v_body text := btrim(coalesce(p_data->>'body', ''));
  v_buttons jsonb := coalesce(p_data->'buttons', '[]'::jsonb);
  v_audience jsonb := coalesce(p_data->'audience', '{}'::jsonb);
  v_at timestamptz := nullif(p_data->>'scheduledAt', '')::timestamptz;
  v_id uuid;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Campaigns need Lead View · Manage.');
  IF v_brand IS NULL OR NOT EXISTS (SELECT 1 FROM public.lead_brands WHERE id = v_brand AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pick a brand.' USING ERRCODE = '22023';
  END IF;
  IF v_name = '' OR length(v_name) > 60 THEN
    RAISE EXCEPTION 'A campaign needs a name (60 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF v_channel NOT IN ('all', 'messenger', 'instagram') THEN
    RAISE EXCEPTION 'Unknown channel.' USING ERRCODE = '22023';
  END IF;
  IF v_body = '' OR length(v_body) > 1900 THEN
    RAISE EXCEPTION 'Write the message (1,900 characters at most).' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_audience) <> 'object' THEN
    RAISE EXCEPTION 'The audience is not in the right shape.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_buttons) <> 'array' OR jsonb_array_length(v_buttons) > 3
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_buttons) b WHERE jsonb_typeof(b) <> 'string' OR btrim(b #>> '{}') = '' OR length(b #>> '{}') > 20) THEN
    RAISE EXCEPTION 'Up to 3 buttons, 20 characters each.' USING ERRCODE = '22023';
  END IF;
  IF v_at IS NOT NULL AND v_at <= now() THEN
    RAISE EXCEPTION 'Schedule it for a time still to come.' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lead_campaigns (brand_id, name, channel, audience, body, buttons, status, scheduled_at, updated_by_name)
    VALUES (v_brand, v_name, v_channel, v_audience, v_body, v_buttons, CASE WHEN v_at IS NULL THEN 'draft' ELSE 'scheduled' END, v_at,
            public.lead_actor_name())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  UPDATE public.lead_campaigns SET brand_id = v_brand, name = v_name, channel = v_channel, audience = v_audience, body = v_body,
         buttons = v_buttons, status = CASE WHEN v_at IS NULL THEN 'draft' ELSE 'scheduled' END, scheduled_at = v_at,
         updated_by_name = public.lead_actor_name(), updated_at = now()
   WHERE id = p_id AND deleted_at IS NULL AND status <> 'sent';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That campaign is gone or already sent.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END
$fn$;

-- Record the campaign on every eligible conversation now (service role and the send below). Answers how many.
CREATE OR REPLACE FUNCTION public.lead_campaign_dispatch(p_id uuid, p_by_name text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  k public.lead_campaigns;
  a record;
  v_text text;
  v_msg bigint;
  v_n integer := 0;
BEGIN
  SELECT * INTO k FROM public.lead_campaigns WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR k.status = 'sent' THEN
    RAISE EXCEPTION 'That campaign is gone or already sent.' USING ERRCODE = 'P0002';
  END IF;
  FOR a IN SELECT * FROM public.lead_audience(k.brand_id, k.channel, k.audience) WHERE basis IN ('window', 'optin') LOOP
    v_text := left(replace(k.body, '{name}', coalesce(nullif(btrim(a.name), ''), 'there')), 2000);
    INSERT INTO public.lead_messages (contact_id, direction, sender, by_user, by_name, body, buttons)
    VALUES (a.contact_id, 'out', 'campaign', auth.uid(), left(k.name, 60), v_text, CASE WHEN jsonb_array_length(k.buttons) > 0 THEN k.buttons END)
    RETURNING id INTO v_msg;
    UPDATE public.lead_contacts SET last_at = now(), last_dir = 'out', last_text = left(v_text, 200), updated_at = now() WHERE id = a.contact_id;
    INSERT INTO public.lead_campaign_recipients (campaign_id, contact_id, basis, message_id) VALUES (k.id, a.contact_id, a.basis, v_msg);
    INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user) VALUES (a.contact_id, left('Campaign: ' || k.name, 200), coalesce(p_by_name, ''), auth.uid());
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.lead_campaigns SET status = 'sent', sent_at = now(), sent_by_name = coalesce(p_by_name, ''), updated_at = now() WHERE id = k.id;
  RETURN v_n;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_campaign_dispatch(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_campaign_dispatch(uuid, text) TO service_role;

-- Send now (recorded only, until Meta is connected).
CREATE OR REPLACE FUNCTION public.lead_send_campaign(p_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Campaigns need Lead View · Manage.');
  RETURN public.lead_campaign_dispatch(p_id, public.lead_actor_name());
END
$fn$;

-- The scheduled campaigns whose time has come (the service role's; no clock calls it yet).
CREATE OR REPLACE FUNCTION public.lead_campaign_send_due()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.lead_campaigns WHERE status = 'scheduled' AND deleted_at IS NULL AND scheduled_at <= now() ORDER BY scheduled_at LOOP
    PERFORM public.lead_campaign_dispatch(r.id, 'Scheduled');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;
REVOKE ALL ON FUNCTION public.lead_campaign_send_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_campaign_send_due() TO service_role;

-- Take away a campaign not yet sent (a sent one stays: its messages are on the conversations).
CREATE OR REPLACE FUNCTION public.lead_remove_campaign(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Campaigns need Lead View · Manage.');
  UPDATE public.lead_campaigns SET deleted_at = now(), updated_at = now(), updated_by_name = public.lead_actor_name()
   WHERE id = p_id AND deleted_at IS NULL AND status <> 'sent';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That campaign is gone or already sent.' USING ERRCODE = 'P0002';
  END IF;
END
$fn$;

-- A TEST conversation's promotions consent, set by hand until Meta is connected (a real one's comes from Meta).
CREATE OR REPLACE FUNCTION public.lead_set_opt_in(p_contact uuid, p_state text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_test boolean;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.edit'], 'The card needs Lead View · Edit.');
  IF p_state NOT IN ('none', 'in', 'out') THEN
    RAISE EXCEPTION 'Agreed, not asked or unsubscribed.' USING ERRCODE = '22023';
  END IF;
  SELECT is_test INTO v_test FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_test THEN
    RAISE EXCEPTION 'A real customer agrees to promotions through Meta, not here.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.lead_contacts SET opt_in = p_state, opt_in_at = CASE WHEN p_state = 'none' THEN NULL ELSE now() END, updated_at = now()
   WHERE id = p_contact;
  INSERT INTO public.lead_events (contact_id, what, actor_name, actor_user)
  VALUES (p_contact, CASE p_state WHEN 'in' THEN 'Agreed to promotions (test)' WHEN 'out' THEN 'Unsubscribed from promotions (test)' ELSE 'Promotions consent cleared (test)' END,
          public.lead_actor_name(), auth.uid());
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_campaign_audience(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_campaigns() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_campaign(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_send_campaign(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_remove_campaign(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_set_opt_in(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_campaign_audience(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_campaigns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_campaign(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_send_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_remove_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_set_opt_in(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
