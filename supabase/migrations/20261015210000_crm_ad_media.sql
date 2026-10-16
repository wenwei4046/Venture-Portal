-- The ad's kind — "video" or "image" — kept with the customer, so the CRM can say "Video ad · Chat with us" (2026-10-15;
-- the owner: "show channel, 最好表明是 video ads, 標題，這樣才知道如何去做"). Meta sends it with the customer's first
-- message from an ad: WhatsApp's referral.media_type, Messenger's ads_context_data (video_url / photo_url); the webhooks
-- pass it as m->'ad'->>'media' (src/lib/whatsapp/webhook.ts, src/lib/messenger/webhook.ts — Messenger also passes the ad's
-- post as its link now). Kept like the headline: the first one seen stays.
-- Both ingest functions are rebuilt from PRODUCTION's bodies (whatsapp md5 b5db8dab0ad5f9f26a861512f7e87940, messenger
-- 3a51446cdc06b0d431f3ea2d44aed91f): three anchors each, refused unless found exactly once.

alter table public.crm_contacts add column if not exists ad_media text
  check (ad_media is null or ad_media in ('video', 'image'));

-- The customers already in: an ad's kind is the ad's, so any delivery of that ad says it.
update public.crm_contacts c
   set ad_media = x.media
  from (select distinct on (m -> 'referral' ->> 'source_id') m -> 'referral' ->> 'source_id' as ad, m -> 'referral' ->> 'media_type' as media
          from public.crm_channel_events e,
               jsonb_array_elements(coalesce(e.payload #> '{entry,0,changes,0,value,messages}', '[]'::jsonb)) m
         where e.channel = 'whatsapp' and m -> 'referral' ->> 'media_type' in ('video', 'image')
         order by m -> 'referral' ->> 'source_id', e.received_at) x
 where c.ad_source_id = x.ad and c.ad_media is null;

do $migration$
declare
  v_fn text;
  v_def text;
  v_a1 constant text := $q$ad_headline, ad_source_url, last_customer_at)$q$;
  v_b1 constant text := $q$ad_headline, ad_source_url, ad_media, last_customer_at)$q$;
  v_a2 constant text := $q$m->'ad'->>'sourceUrl', (m->>'sentAt')::timestamptz)$q$;
  v_b2 constant text := $q$m->'ad'->>'sourceUrl', nullif(m->'ad'->>'media', ''), (m->>'sentAt')::timestamptz)$q$;
  v_a3 constant text := $q$ad_source_url    = coalesce(c.ad_source_url, excluded.ad_source_url),$q$;
  v_b3 constant text := $q$ad_source_url    = coalesce(c.ad_source_url, excluded.ad_source_url),
      ad_media         = coalesce(c.ad_media, excluded.ad_media),$q$;
  v_once text;
begin
  foreach v_fn in array array['public.crm_ingest_whatsapp(jsonb,jsonb,integer,jsonb)', 'public.crm_ingest_messenger(jsonb,jsonb,jsonb,integer,jsonb)'] loop
    select pg_get_functiondef(v_fn::regprocedure) into v_def;
    foreach v_once in array array[v_a1, v_a2, v_a3] loop
      if (length(v_def) - length(replace(v_def, v_once, ''))) / length(v_once) <> 1 then
        raise exception '%: % is not there exactly once', v_fn, left(v_once, 60);
      end if;
    end loop;
    execute replace(replace(replace(v_def, v_a1, v_b1), v_a2, v_b2), v_a3, v_b3);
  end loop;
end
$migration$;
