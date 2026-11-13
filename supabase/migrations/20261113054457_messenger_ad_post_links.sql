-- A Messenger ad customer's Ad row opens the ad again (2026-11-13 — the owner: "为什么点customer info 的广告来源不能导入广告了？").
--
-- Customer info's Ad links `crm_contacts.ad_source_url` (shared/AdLink.tsx). For Messenger the webhook made it from
-- `ads_context_data.post_id` only when that read `<page>_<post>` — but Meta sends the post alone ("122209887110789684"),
-- so no Messenger ad customer ever had a link, and since 2026-10-29 every new ad lead has come through Messenger. The
-- webhook now joins the post to its Page (`adPostUrl`, src/lib/messenger/webhook.ts), as Lead View's `lead_ad_posts()`
-- does; `crm_ingest_messenger` keeps the first link a customer gets (`coalesce`), so the ones already in fill only here.
--
-- Data only, no function changed: each Messenger customer from an ad with no link gets that ad's post, as the delivery
-- log (`crm_channel_events`) last carried it for their Page. On 2026-11-13: 105 customers, every one found.

WITH posts AS (
  SELECT DISTINCT ON (r->>'ad_id', ent->>'id')
         r->>'ad_id' AS ad_id, ent->>'id' AS page_id, r->'ads_context_data'->>'post_id' AS post_id
    FROM public.crm_channel_events e
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.payload->'entry') = 'array' THEN e.payload->'entry' ELSE '[]'::jsonb END) ent
    CROSS JOIN LATERAL jsonb_array_elements(
      (CASE WHEN jsonb_typeof(ent->'messaging') = 'array' THEN ent->'messaging' ELSE '[]'::jsonb END)
      || (CASE WHEN jsonb_typeof(ent->'standby') = 'array' THEN ent->'standby' ELSE '[]'::jsonb END)) m
    CROSS JOIN LATERAL (SELECT coalesce(m->'referral', m->'message'->'referral', m->'postback'->'referral') AS r) x
   WHERE e.channel = 'messenger'
     AND e.payload::text LIKE '%ads_context_data%'
     AND r ? 'ads_context_data' AND r->>'ad_id' IS NOT NULL
   ORDER BY r->>'ad_id', ent->>'id', e.received_at DESC
)
UPDATE public.crm_contacts c
   SET ad_source_url = CASE
         WHEN p.post_id ~ '^[0-9]{5,30}_[0-9]{1,30}$' THEN 'https://www.facebook.com/' || p.post_id
         ELSE 'https://www.facebook.com/' || c.account_id || '_' || p.post_id END
  FROM posts p
 WHERE c.channel = 'messenger'
   AND c.ad_source_id IS NOT NULL
   AND c.ad_source_url IS NULL
   AND p.ad_id = c.ad_source_id
   AND p.page_id = c.account_id
   AND c.account_id ~ '^[0-9]{5,30}$'
   AND (p.post_id ~ '^[0-9]{1,30}$' OR p.post_id ~ '^[0-9]{5,30}_[0-9]{1,30}$');
