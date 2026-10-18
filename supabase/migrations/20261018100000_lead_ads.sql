-- ============================================================================
-- 20261018100000_lead_ads.sql
-- Lead View › an ad's name, where it ran and its link (2026-10-18 — the user: "我要看到廣告名稱，來源，鏈接", then
-- "這邊先做 lead view"). Meta's message from a click-to-Messenger / Instagram ad carries the ad's id and its
-- HEADLINE ("Chat with us"), never the name it has in Ads Manager, its campaign or ad set; those need the system
-- user's token with ads_read on the brands' ad accounts (the CRM met the same wall, mig 20261016120000).
-- ============================================================================
--
-- 1. lead_contacts.ad_id: the ad a conversation came from (source_ad stays its headline — what the flows' ad
--    trigger matches). Until Meta is connected a TEST conversation gets one from Settings › Test (lead_test_ad).
-- 2. lead_ads: per ad id — its name, campaign, ad set, ad account, status and post link; `source` manual (named
--    by hand on Settings › Ads, lead_name_ad) or meta (fetched with ads_read, lead_save_meta_ads). A name given by
--    hand wins over Meta's; Meta still fills what the hand left empty.
-- 3. The card (lead_contact_json, production's body with keys added) carries adId, adName, adCampaign, adSet,
--    adAccount, adLink — every screen shows the name where there is one, else the headline.
-- 4. lead_ads(): every ad conversations came from, with what came of them (conversations, phones, handed).
-- 5. The writes ask Settings (/leads/settings) in mig 20261018100100: naming and fetching are Lead View · Manage,
--    the test ad Lead View · Create.

-- ── The ad on the conversation ───────────────────────────────────────────────

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS ad_id text CHECK (ad_id ~ '^[0-9]{5,30}$');
CREATE INDEX IF NOT EXISTS lead_contacts_ad ON public.lead_contacts (ad_id) WHERE ad_id IS NOT NULL;

-- ── What is known of an ad ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lead_ads (
  ad_id            text PRIMARY KEY CHECK (ad_id ~ '^[0-9]{5,30}$'),
  name             text NOT NULL DEFAULT '' CHECK (length(name) <= 200),
  campaign         text NOT NULL DEFAULT '' CHECK (length(campaign) <= 200),
  adset            text NOT NULL DEFAULT '' CHECK (length(adset) <= 200),
  account_id       text NOT NULL DEFAULT '' CHECK (account_id = '' OR account_id ~ '^[0-9]{3,30}$'),
  status           text NOT NULL DEFAULT '' CHECK (length(status) <= 40),
  -- The ad's post (Facebook) or Instagram permalink, https only.
  link             text NOT NULL DEFAULT '' CHECK (link = '' OR link ~ '^https://'),
  -- manual = named by hand on Settings › Ads; meta = fetched from Ads Manager.
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'meta')),
  fetched_at       timestamptz,
  updated_by_name  text NOT NULL DEFAULT '',
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_ads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_ads FROM anon, authenticated;
SELECT public.audit_register('lead_ads', 'Lead View ads', 'Member services', '{leads}', 'all', p_labels => '{name}');

-- The card: production's lead_contact_json (mig 20261016340000's) with the ad's keys and its lead_ads row joined.
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.lead_contact_json(public.lead_contacts)'::regprocedure);
  v_keys_old text := '''optIn'', c.opt_in, ''optInAt'', c.opt_in_at)';
  v_keys_new text := '''optIn'', c.opt_in, ''optInAt'', c.opt_in_at, ''adId'', c.ad_id, ''adName'', coalesce(a.name, ''''), '
    || '''adCampaign'', coalesce(a.campaign, ''''), ''adSet'', coalesce(a.adset, ''''), ''adAccount'', coalesce(a.account_id, ''''), '
    || '''adLink'', coalesce(a.link, ''''))';
  v_join_old text := 'LEFT JOIN public.lead_flows f ON f.id = c.flow_id';
  v_join_new text := 'LEFT JOIN public.lead_flows f ON f.id = c.flow_id' || E'\n    ' || 'LEFT JOIN public.lead_ads a ON a.ad_id = c.ad_id';
BEGIN
  IF position('''adId''' IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF length(v_def) - length(replace(v_def, v_keys_old, '')) <> length(v_keys_old)
     OR length(v_def) - length(replace(v_def, v_join_old, '')) <> length(v_join_old) THEN
    RAISE EXCEPTION 'lead_contact_json is not the body this migration expects';
  END IF;
  EXECUTE replace(replace(v_def, v_keys_old, v_keys_new), v_join_old, v_join_new);
END
$do$;

-- ── Readers and writers ──────────────────────────────────────────────────────

-- Every ad conversations came from: what is known of it, its latest headline, and what came of it.
CREATE OR REPLACE FUNCTION public.lead_ads()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'adId', x.ad_id, 'headline', x.headline, 'brandIds', x.brand_ids, 'channels', x.channels,
      'conversations', x.n, 'phones', x.phones, 'handed', x.handed, 'tests', x.tests, 'lastAt', x.last_at,
      'name', coalesce(a.name, ''), 'campaign', coalesce(a.campaign, ''), 'adset', coalesce(a.adset, ''),
      'accountId', coalesce(a.account_id, ''), 'status', coalesce(a.status, ''), 'link', coalesce(a.link, ''),
      'source', a.source, 'fetchedAt', a.fetched_at, 'updatedByName', coalesce(a.updated_by_name, ''))
      ORDER BY x.last_at DESC)
      FROM (SELECT c.ad_id,
                   (array_agg(c.source_ad ORDER BY c.created_at DESC) FILTER (WHERE c.source_ad <> ''))[1] AS headline,
                   jsonb_agg(DISTINCT c.brand_id) AS brand_ids, jsonb_agg(DISTINCT c.channel) AS channels,
                   count(*) AS n, count(*) FILTER (WHERE c.phone IS NOT NULL) AS phones,
                   count(*) FILTER (WHERE c.handed_at IS NOT NULL) AS handed, count(*) FILTER (WHERE c.is_test) AS tests,
                   max(c.last_at) AS last_at
              FROM public.lead_contacts c WHERE c.ad_id IS NOT NULL GROUP BY c.ad_id) x
      LEFT JOIN public.lead_ads a ON a.ad_id = x.ad_id), '[]'::jsonb);
END
$fn$;

-- Name an ad by hand (Settings › Ads). Keys: name, campaign, adset, link. All empty takes the hand's row away.
CREATE OR REPLACE FUNCTION public.lead_name_ad(p_ad_id text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_data->>'name', ''));
  v_campaign text := btrim(coalesce(p_data->>'campaign', ''));
  v_adset text := btrim(coalesce(p_data->>'adset', ''));
  v_link text := btrim(coalesce(p_data->>'link', ''));
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Naming an ad needs Lead View · Manage.');
  IF p_ad_id IS NULL OR p_ad_id !~ '^[0-9]{5,30}$' THEN
    RAISE EXCEPTION 'That is not an ad id.' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) > 200 OR length(v_campaign) > 200 OR length(v_adset) > 200 THEN
    RAISE EXCEPTION 'A name is 200 characters at most.' USING ERRCODE = '22023';
  END IF;
  IF v_link <> '' AND v_link !~ '^https://' THEN
    RAISE EXCEPTION 'A link starts with https://' USING ERRCODE = '22023';
  END IF;
  IF v_name = '' AND v_campaign = '' AND v_adset = '' AND v_link = '' THEN
    DELETE FROM public.lead_ads WHERE ad_id = p_ad_id AND source = 'manual';
    UPDATE public.lead_ads SET name = '', updated_by_name = public.lead_actor_name(), updated_at = now() WHERE ad_id = p_ad_id;
    RETURN;
  END IF;
  INSERT INTO public.lead_ads (ad_id, name, campaign, adset, link, source, updated_by_name)
  VALUES (p_ad_id, v_name, v_campaign, v_adset, v_link, 'manual', public.lead_actor_name())
  ON CONFLICT (ad_id) DO UPDATE SET name = EXCLUDED.name, campaign = EXCLUDED.campaign, adset = EXCLUDED.adset,
         link = EXCLUDED.link, source = 'manual', updated_by_name = EXCLUDED.updated_by_name, updated_at = now();
END
$fn$;

-- What Ads Manager says of ads (fetched by the app with ads_read): [{ adId, name, campaign, adset, accountId,
-- status, link }]. A name given by hand stays; Meta fills what is empty. Answers how many it kept.
CREATE OR REPLACE FUNCTION public.lead_save_meta_ads(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r jsonb;
  v_n integer := 0;
  v_id text;
  v_link text;
  v_acc text;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.manage'], 'Fetching ad names needs Lead View · Manage.');
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 200 THEN
    RAISE EXCEPTION 'Up to 200 ads at a time.' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_id := r->>'adId';
    CONTINUE WHEN v_id IS NULL OR v_id !~ '^[0-9]{5,30}$';
    v_link := coalesce(r->>'link', '');
    IF v_link !~ '^https://' THEN v_link := ''; END IF;
    v_acc := coalesce(r->>'accountId', '');
    IF v_acc !~ '^[0-9]{3,30}$' THEN v_acc := ''; END IF;
    INSERT INTO public.lead_ads (ad_id, name, campaign, adset, account_id, status, link, source, fetched_at, updated_by_name)
    VALUES (v_id, left(coalesce(r->>'name', ''), 200), left(coalesce(r->>'campaign', ''), 200), left(coalesce(r->>'adset', ''), 200),
            v_acc, left(coalesce(r->>'status', ''), 40), v_link, 'meta', now(), public.lead_actor_name())
    ON CONFLICT (ad_id) DO UPDATE SET
      name = CASE WHEN lead_ads.source = 'manual' AND lead_ads.name <> '' THEN lead_ads.name ELSE EXCLUDED.name END,
      campaign = CASE WHEN lead_ads.source = 'manual' AND lead_ads.campaign <> '' THEN lead_ads.campaign ELSE EXCLUDED.campaign END,
      adset = CASE WHEN lead_ads.source = 'manual' AND lead_ads.adset <> '' THEN lead_ads.adset ELSE EXCLUDED.adset END,
      link = CASE WHEN lead_ads.source = 'manual' AND lead_ads.link <> '' THEN lead_ads.link ELSE EXCLUDED.link END,
      account_id = EXCLUDED.account_id, status = EXCLUDED.status, fetched_at = now(),
      updated_by_name = EXCLUDED.updated_by_name, updated_at = now();
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
$fn$;

-- Settings › Test: put an ad id on a TEST conversation (a real one's comes from Meta's message).
CREATE OR REPLACE FUNCTION public.lead_test_ad(p_contact uuid, p_ad_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_test boolean;
BEGIN
  PERFORM public.lead_need(ARRAY['leads.create'], 'A test enquiry needs Lead View · Create.');
  IF p_ad_id IS NOT NULL AND p_ad_id !~ '^[0-9]{5,30}$' THEN
    RAISE EXCEPTION 'An ad id is digits only (5 to 30).' USING ERRCODE = '22023';
  END IF;
  SELECT is_test INTO v_test FROM public.lead_contacts WHERE id = p_contact FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation is gone.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_test THEN
    RAISE EXCEPTION 'A real conversation''s ad comes from Meta.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.lead_contacts SET ad_id = p_ad_id, updated_at = now() WHERE id = p_contact;
END
$fn$;

REVOKE ALL ON FUNCTION public.lead_ads() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_name_ad(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_save_meta_ads(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lead_test_ad(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_ads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_name_ad(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_save_meta_ads(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_test_ad(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
