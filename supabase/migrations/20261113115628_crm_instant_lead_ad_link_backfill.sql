-- The two Instant Form customers of 2026-11-13 get their ad's link and media, as Meta answered that day
-- (creative.effective_object_story_id; the video's reel from the Page's permalink_url). An existing link is kept.
update crm_contacts set ad_source_url = coalesce(ad_source_url, v.url), ad_media = coalesce(ad_media, v.media)
from (values
  ('52625304217664', 'https://www.facebook.com/reel/2448042485687291/', 'video'),
  ('52625308746464', 'https://www.facebook.com/102351059576534/posts/1022474350894993', 'image')
) as v(ad, url, media)
where crm_contacts.ad_source_id = v.ad and crm_contacts.lead_form->>'kind' = 'instant';

-- Ads Manager's name for the ad that had none (a name already kept, by hand or Meta, wins).
insert into crm_ad_names (ad_source_id, name, source)
values ('52625308746464', '[产品USP] 投资型装修 - 3-in-1 一站式装修到出租 (Skyline Embassy)', 'meta')
on conflict (ad_source_id) do nothing;
