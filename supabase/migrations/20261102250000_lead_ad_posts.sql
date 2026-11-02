-- Lead View: each ad's own post and picture, as Meta sent them (2026-11-02 — the user, on Reply rules › Ads: "点小箭头就导入
-- 到看该广告，让客服了解后就可以设计他要的template").
--
-- Lead View has no Ads Manager link for its ads (the system user cannot read those ad accounts, so `lead_ads` holds
-- none), but every click-to-Messenger chat Meta delivers carries the ad's `ads_context_data` — its post id and its
-- picture or video — and the delivery log keeps every payload (`crm_channel_events`, since 2026-10-02). `lead_ad_posts()`
-- (Lead View · View; a read) gives each ad its latest: the post as a Facebook address (`<page>_<post>`), the picture,
-- the video. Reply rules › Ads draws an arrow that opens the post.

CREATE OR REPLACE FUNCTION public.lead_ad_posts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.lead_need(ARRAY['leads.view'], 'Lead View needs Lead View · View.');
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'adId', p.ad_id,
             'postUrl', CASE WHEN p.post_id ~ '^[0-9]{5,30}$' AND p.page_id ~ '^[0-9]{5,30}$'
                             THEN 'https://www.facebook.com/' || p.page_id || '_' || p.post_id END,
             'picture', CASE WHEN p.photo ~ '^https://' THEN left(p.photo, 2000) END,
             'video', CASE WHEN p.video ~ '^https://' THEN left(p.video, 2000) END))
      FROM (
        SELECT DISTINCT ON (r->>'ad_id') r->>'ad_id' AS ad_id, ent->>'id' AS page_id, r->'ads_context_data'->>'post_id' AS post_id,
               r->'ads_context_data'->>'photo_url' AS photo, r->'ads_context_data'->>'video_url' AS video
          FROM public.crm_channel_events e
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.payload->'entry') = 'array' THEN e.payload->'entry' ELSE '[]'::jsonb END) ent
          CROSS JOIN LATERAL jsonb_array_elements(
            (CASE WHEN jsonb_typeof(ent->'messaging') = 'array' THEN ent->'messaging' ELSE '[]'::jsonb END)
            || (CASE WHEN jsonb_typeof(ent->'standby') = 'array' THEN ent->'standby' ELSE '[]'::jsonb END)) m
          CROSS JOIN LATERAL (SELECT coalesce(m->'referral', m->'message'->'referral', m->'postback'->'referral') AS r) x
         WHERE e.received_at > now() - interval '180 days'
           AND e.payload::text LIKE '%ads_context_data%'
           AND r ? 'ads_context_data' AND r->>'ad_id' IS NOT NULL
           AND r->>'ad_id' IN (SELECT c.ad_id FROM public.lead_contacts c WHERE c.ad_id IS NOT NULL)
         ORDER BY r->>'ad_id', e.received_at DESC
      ) p), '[]'::jsonb);
END
$$;
REVOKE ALL ON FUNCTION public.lead_ad_posts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_ad_posts() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
