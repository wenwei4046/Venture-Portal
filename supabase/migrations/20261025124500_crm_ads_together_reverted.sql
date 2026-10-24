-- Ads counted together, taken back (2026-10-24; the owner, the same evening it went live: "wait, revert this function
-- first, back to previous"). Undoes 20261025121500 on the dealer, exactly to production's bodies before it:
--   crm_campaign_given  — each ad's own leads since its rule's start again (md5 dc3345f4… → f485e7e4…)
--   crm_assign_contact  — a full By max team's waiting leads are the ad's own again; Kaiyee's Full time evenly block
--                         (20261025060000, put in over 20261025121500 the same evening) is kept (0324fccd… → the
--                         same body with only that count put back)
--   crm_save_ad_assign  — Save no longer touches `together` (492ba60a… → 107965ab…)
-- and every ad apart again, each counting from its own rule's start as before the switch (the seven ads' started_at put
-- back where the switch had set them to 13:17:39 UTC). The column, crm_save_ads_together and crm_counted_leads go once
-- the screens no longer call them (20261025125000).

do $mig$
declare
  d text;
  f record;
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_campaign_given(text, timestamptz)'::regprocedure) <> 'dc3345f46681864d61423fad44818dfd' then
    raise exception 'crm_ads_together_reverted: crm_campaign_given is not the body 20261025121500 left';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure) <> '492ba60af30b27d8484d3677a76bb511' then
    raise exception 'crm_ads_together_reverted: crm_save_ad_assign is not the body 20261025121500 left';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_assign_contact(uuid)'::regprocedure) not in ('2e8a3f1b3d7613a134f186e7b11971da', '0324fccd74b7bae8275e90a500202dc8') then
    raise exception 'crm_ads_together_reverted: crm_assign_contact is neither the body 20261025121500 left nor that with Full time evenly';
  end if;

  d := pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure);
  for f in select * from (values
    ($a$(select count(*) from crm_contacts x join crm_counted_leads(r.ad_source_id, r.started_at) k on k.ad = x.ad_source_id and x.created_at >= k.since
                   where x.team_id = key::uuid and x.held_reason = 'limit')$a$,
     $a$(select count(*) from crm_contacts x where x.ad_source_id = r.ad_source_id and x.team_id = key::uuid and x.held_reason = 'limit' and x.created_at >= r.started_at)$a$)
  ) as v(old, new) loop
    if position(f.old in d) = 0 then raise exception 'crm_ads_together_reverted: crm_assign_contact no longer has: %', f.old; end if;
    if position(f.old in substr(d, position(f.old in d) + 1)) > 0 then raise exception 'crm_ads_together_reverted: more than once: %', f.old; end if;
    d := replace(d, f.old, f.new);
  end loop;
  execute d;

  d := pg_get_functiondef('public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure);
  for f in select * from (values
    ($a$    team_modes = excluded.team_modes,
    -- Saved on its own with anything changed, an ad leaves the ads counted together (Save and apply to all, 2026-10-24).
    together = x.together and x.mode = excluded.mode and x.team_split = excluded.team_split and x.people_mode = excluded.people_mode
               and x.people = excluded.people and x.team_modes = excluded.team_modes,
    -- A new mode starts a new count; so does leaving the together ads (it counts alone from now).
    started_at = case when x.mode <> excluded.mode
                        or (x.together and not (x.team_split = excluded.team_split and x.people_mode = excluded.people_mode
                                                and x.people = excluded.people and x.team_modes = excluded.team_modes))
                      then now() else x.started_at end,$a$,
     $a$    team_modes = excluded.team_modes,
    -- A new mode starts a new count.
    started_at = case when x.mode <> excluded.mode then now() else x.started_at end,$a$)
  ) as v(old, new) loop
    if position(f.old in d) = 0 then raise exception 'crm_ads_together_reverted: crm_save_ad_assign no longer has: %', f.old; end if;
    if position(f.old in substr(d, position(f.old in d) + 1)) > 0 then raise exception 'crm_ads_together_reverted: more than once: %', f.old; end if;
    d := replace(d, f.old, f.new);
  end loop;
  execute d;
end $mig$;

create or replace function public.crm_campaign_given(p_ad text, p_since timestamp with time zone)
 returns table(staff uuid, team uuid, n integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select assigned_to, team_id, count(*)::int from crm_contacts
   where ad_source_id = p_ad and created_at >= p_since and assigned_to is not null
   group by assigned_to, team_id
$function$;

do $mig$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_campaign_given(text, timestamptz)'::regprocedure) <> 'f485e7e495108e723c593a906f880252' then
    raise exception 'crm_ads_together_reverted: crm_campaign_given did not come back to production''s body';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure) <> '107965abc3eb0cb0cf2ca4d3196f9c29' then
    raise exception 'crm_ads_together_reverted: crm_save_ad_assign did not come back to production''s body';
  end if;
  if (select prosrc from pg_proc where oid = 'public.crm_assign_contact(uuid)'::regprocedure) like '%crm_counted_leads%' then
    raise exception 'crm_ads_together_reverted: crm_assign_contact still counts through crm_counted_leads';
  end if;
end $mig$;

-- Every ad apart again, counting from where it did before the switch.
update public.crm_ad_assign a set together = false,
       started_at = coalesce(p.started_at, a.started_at)
  from (values ('120251332896640103', timestamptz '2026-10-16 03:42:41.31676+00'),
               ('52618699278264', timestamptz '2026-10-22 09:41:14.48297+00'),
               ('52618699278464', timestamptz '2026-10-22 04:44:24.417414+00'),
               ('52618699278664', timestamptz '2026-10-22 09:41:13.905603+00'),
               ('52618704268864', timestamptz '2026-10-22 09:41:14.276918+00'),
               ('52618704269064', timestamptz '2026-10-22 09:27:00.678952+00'),
               ('52618704270064', timestamptz '2026-10-22 08:27:36.530599+00')) as p(ad, started_at)
 where a.ad_source_id = p.ad and a.started_at = timestamptz '2026-10-24 13:17:39.915072+00';
update public.crm_ad_assign set together = false where together;
