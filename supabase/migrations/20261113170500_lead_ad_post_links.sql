-- Lead View's ad arrow opens the ad (2026-11-13 — the owner, "一起修", after the CRM's Ad row: an ad's post is
-- unpublished, and Facebook answers "This isn't available" at `facebook.com/<page>_<post>`; on the owner's phone,
-- signed in, it opens at `facebook.com/<page>/posts/<post>`).
--
-- `lead_ad_posts()` (mig 20261102250000) is made again from PRODUCTION's body (md5 1030d95b…, checked first) with its
-- one address swapped: `<page>_<post>` → `<page>/posts/<post>`. Nothing else in it changes. A read; Lead View · View.

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.lead_ad_posts()'::regprocedure) <> '1030d95b3f505bbd86a065f1c16ba1c2' THEN
    RAISE EXCEPTION 'lead_ad_posts is not the body this migration expects — compare it with production first';
  END IF;
END $$;

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
                             THEN 'https://www.facebook.com/' || p.page_id || '/posts/' || p.post_id END,
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
