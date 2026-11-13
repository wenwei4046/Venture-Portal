-- A Messenger ad customer's Ad row opens the ad (2026-11-13 — the owner, after 20261113054457: the link opened
-- Facebook's "This isn't available"; "你换成跟WA一样的不行吗？").
--
-- 20261113054457 gave each Messenger ad customer `facebook.com/<page>_<post>`. An ad's post is unpublished, and Facebook
-- does not open it there. Tried on the owner's phone (signed in): an image / carousel ad opens at
-- `facebook.com/<page>/posts/<post>` (Meta's own permalink for it, `/1022331100909318/posts/…`, does not), a video ad
-- at its reel (`permalink_url`, `/reel/<id>/`). The webhook now makes the first (`adPostUrl`) and asks Meta for the
-- second (`postPermalink` → `reelOf`). The four posts already in, as Meta answered on 2026-11-13:
--   102351059576534_1008213322321096 (carousel) → /102351059576534/posts/1008213322321096
--   102351059576534_1008213335654428 (video)    → /reel/1131026622809105/
--   102351059576534_1008213362321092 (video)    → /reel/1057234173995335/
--   102351059576534_1008213338987761 (video)    → /reel/1776116297019501/
-- Data only; a link not in this list is left as it is.

UPDATE public.crm_contacts c
   SET ad_source_url = v.opens
  FROM (VALUES
    ('https://www.facebook.com/102351059576534_1008213322321096', 'https://www.facebook.com/102351059576534/posts/1008213322321096'),
    ('https://www.facebook.com/102351059576534_1008213335654428', 'https://www.facebook.com/reel/1131026622809105/'),
    ('https://www.facebook.com/102351059576534_1008213362321092', 'https://www.facebook.com/reel/1057234173995335/'),
    ('https://www.facebook.com/102351059576534_1008213338987761', 'https://www.facebook.com/reel/1776116297019501/')
  ) AS v(stitched, opens)
 WHERE c.channel = 'messenger'
   AND c.ad_source_url = v.stitched;
