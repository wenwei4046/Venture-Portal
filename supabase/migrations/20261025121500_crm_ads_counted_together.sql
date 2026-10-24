-- Ads counted together (2026-10-24; the owner, shown that every ad counted only its own leads: "我要它从现在就开始变成合下来的
-- 算法。以后这个合下来的算法是这样的：你现在看到当我调广告的 split 的时候，它会有 'save and apply to all seven ads' 嘛。其实我只是要
-- 把这个 button 变成 'save and apply to all'，它的意思就是 calculate together。这就代表说，他 set 了这个，是选择其他的 7 个广告都是
-- 直接合起来算，而不是只是抄他的 split 方案").
--
-- Until now every ad counted only its own leads since its rule started (crm_campaign_given): each ad began at nothing, so
-- its first leads went the same way every time (the biggest share first, equal shares by staff id) and a small share —
-- HECTOR's 10 %, the Revenue Director's 4.6 % — waited for an ad's 7th, 9th or 20th lead, which few ads reach.
-- Now the ads saved by "Save and apply to all" are counted TOGETHER: the next lead of any of them goes by all of their leads
-- this month (the office's), each ad's counted from when its own rule started; the count starts again on the 1st. An ad
-- saved on its own with anything changed leaves them and counts alone, from then, as every ad did before.
--
--   crm_ad_assign.together  — counted with the others; set by crm_save_ads_together, cleared by crm_save_ad_assign
--   crm_counted_leads()     — which ads' leads, from when, the next pick for an ad balances against (the service role's)
--   crm_campaign_given()    — counts through it (production's body, its FROM and WHERE swapped)
--   crm_assign_contact()    — a full By max team's waiting leads are counted through it too (one replacement)
--   crm_save_ad_assign()    — Save: an ad saved with anything changed leaves the together ads (one replacement)
--   crm_save_ads_together() — Save and apply to all: every ad listed, and every ad already together, one setting
--
-- The seven ads on production hold one setting (STANLEY 44 · ANTHONY 20.71 · SHAWN 20.69 · Harm Hao Hong HECTOR 10 ·
-- Revenue Director 4.6 · Tan Jin Yang 0), so they are counted together from this migration on ("从现在就开始"): every ad with
-- the latest saved setting, its count starting now.
-- Production's bodies, md5 checked 2026-10-24: campaign_given f485e7e4…, assign_contact b7f7ac54…, save_ad_assign 107965ab….

alter table public.crm_ad_assign add column if not exists together boolean not null default false;

create or replace function public.crm_counted_leads(p_ad text, p_since timestamptz)
returns table(ad text, since timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from crm_ad_assign a where a.ad_source_id = p_ad and a.together) then
    -- Counted together: every together ad's leads this month (the office's), each from when its own rule started.
    return query
      select a.ad_source_id,
             greatest(a.started_at, date_trunc('month', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')
        from crm_ad_assign a where a.together;
  else
    -- Any other ad: its own leads since p_since (its rule's start; 30 days for an ad nobody set), as before.
    return query select p_ad, p_since;
  end if;
end $$;
revoke execute on function public.crm_counted_leads(text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_counted_leads(text, timestamptz) to service_role;

do $mig$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_campaign_given(text, timestamptz)'::regprocedure) <> 'f485e7e495108e723c593a906f880252' then
    raise exception 'crm_ads_counted_together: crm_campaign_given is no longer the body this was written from';
  end if;
end $mig$;

create or replace function public.crm_campaign_given(p_ad text, p_since timestamptz)
returns table(staff uuid, team uuid, n integer)
language sql stable security definer set search_path = public as $function$
  -- The leads the next pick for this ad balances against: its own since p_since, or — counted together — every together
  -- ad's this month (crm_counted_leads, 2026-10-24).
  select c.assigned_to, c.team_id, count(*)::int from crm_contacts c
    join crm_counted_leads(p_ad, p_since) k on k.ad = c.ad_source_id and c.created_at >= k.since
   where c.assigned_to is not null
   group by c.assigned_to, c.team_id
$function$;

do $mig$
declare
  d text;
  f record;
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_assign_contact(uuid)'::regprocedure) <> 'b7f7ac547b456e774fac2e48e510c196' then
    raise exception 'crm_ads_counted_together: crm_assign_contact is no longer the body this was written from';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure) <> '107965abc3eb0cb0cf2ca4d3196f9c29' then
    raise exception 'crm_ads_counted_together: crm_save_ad_assign is no longer the body this was written from';
  end if;

  -- By team: the leads a full By max team holds count as the ad's leads do — together, all the together ads' this month.
  d := pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure);
  for f in select * from (values
    ($a$(select count(*) from crm_contacts x where x.ad_source_id = r.ad_source_id and x.team_id = key::uuid and x.held_reason = 'limit' and x.created_at >= r.started_at)$a$,
     $a$(select count(*) from crm_contacts x join crm_counted_leads(r.ad_source_id, r.started_at) k on k.ad = x.ad_source_id and x.created_at >= k.since
                   where x.team_id = key::uuid and x.held_reason = 'limit')$a$)
  ) as v(old, new) loop
    if position(f.old in d) = 0 then raise exception 'crm_ads_counted_together: crm_assign_contact no longer has: %', f.old; end if;
    if position(f.old in substr(d, position(f.old in d) + 1)) > 0 then raise exception 'crm_ads_counted_together: more than once: %', f.old; end if;
    d := replace(d, f.old, f.new);
  end loop;
  execute d;

  -- Save (this ad only): with anything changed, an ad leaves the together ads and counts alone from now.
  d := pg_get_functiondef('public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure);
  for f in select * from (values
    ($a$    team_modes = excluded.team_modes,
    -- A new mode starts a new count.
    started_at = case when x.mode <> excluded.mode then now() else x.started_at end,$a$,
     $a$    team_modes = excluded.team_modes,
    -- Saved on its own with anything changed, an ad leaves the ads counted together (Save and apply to all, 2026-10-24).
    together = x.together and x.mode = excluded.mode and x.team_split = excluded.team_split and x.people_mode = excluded.people_mode
               and x.people = excluded.people and x.team_modes = excluded.team_modes,
    -- A new mode starts a new count; so does leaving the together ads (it counts alone from now).
    started_at = case when x.mode <> excluded.mode
                        or (x.together and not (x.team_split = excluded.team_split and x.people_mode = excluded.people_mode
                                                and x.people = excluded.people and x.team_modes = excluded.team_modes))
                      then now() else x.started_at end,$a$)
  ) as v(old, new) loop
    if position(f.old in d) = 0 then raise exception 'crm_ads_counted_together: crm_save_ad_assign no longer has: %', f.old; end if;
    if position(f.old in substr(d, position(f.old in d) + 1)) > 0 then raise exception 'crm_ads_counted_together: more than once: %', f.old; end if;
    d := replace(d, f.old, f.new);
  end loop;
  execute d;
end $mig$;

-- Save and apply to all: one setting for every ad listed ({ad id: its name}) and every ad already counted together, all of
-- them counted together. The setting is checked once, as crm_save_ad_assign checks it; each ad's waiting leads (a full By max
-- team's) are dealt as its save deals them. A new mode starts a new count; a new split keeps it (the together ads carry on).
create or replace function public.crm_save_ads_together(p_ads jsonb, p_mode text, p_team_split jsonb, p_people_mode text, p_people jsonb, p_team_modes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a       record;
  r       crm_ad_assign;
  t       record;
  h       record;
  pick    record;
  v_sum   numeric;
  v_mode  text;
  v_saved int := 0;
  v_dealt int := 0;
begin
  if not public.crm_manages() then perform crm_deny('assign ads'); end if;
  if jsonb_typeof(p_ads) is distinct from 'object' or not exists (select 1 from jsonb_each_text(p_ads) e where coalesce(trim(e.key), '') <> '') then
    raise exception 'Choose the ads.' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('even', 'split') then raise exception 'Unknown assignment.' using errcode = '22023'; end if;
  if p_mode = 'split' then
    select coalesce(sum(value::numeric), 0) into v_sum from jsonb_each_text(coalesce(p_team_split, '{}'::jsonb));
    if v_sum <> 100 then raise exception 'The teams'' %% must add up to 100%%.' using errcode = '22023'; end if;
    -- Inside every team with a share: By % adds up to 100, By max gives somebody a maximum.
    for t in select key::uuid as team from jsonb_each_text(coalesce(p_team_split, '{}'::jsonb)) where value ~ '^\d+(\.\d+)?$' and value::numeric > 0 loop
      v_mode := coalesce(p_team_modes ->> t.team::text, 'pct');
      if v_mode not in ('even', 'pct', 'cnt') then raise exception 'Unknown inside-team mode.' using errcode = '22023'; end if;
      select coalesce(sum((p_people ->> m::text)::numeric), 0) into v_sum from crm_deal_handlers(t.team) m where (p_people ->> m::text) ~ '^\d+(\.\d+)?$';
      if v_mode = 'pct' and v_sum <> 100 then raise exception 'Every By %% team must add up to 100%%.' using errcode = '22023'; end if;
      if v_mode = 'cnt' and v_sum <= 0 then raise exception 'Give at least one person a maximum in every By max team.' using errcode = '22023'; end if;
    end loop;
  end if;
  for a in
    select e.key as ad, nullif(trim(coalesce(e.value, '')), '') as label from jsonb_each_text(p_ads) e where coalesce(trim(e.key), '') <> ''
    union
    select x.ad_source_id, null::text from crm_ad_assign x where x.together and not (p_ads ? x.ad_source_id)
  loop
    insert into crm_ad_assign as x (ad_source_id, ad_label, mode, team_split, people_mode, people, team_modes, updated_by, together)
    values (a.ad, a.label, p_mode, coalesce(p_team_split, '{}'::jsonb), coalesce(p_people_mode, 'pct'), coalesce(p_people, '{}'::jsonb),
            coalesce(p_team_modes, '{}'::jsonb), crm_me(), true)
    on conflict (ad_source_id) do update set
      ad_label = coalesce(excluded.ad_label, x.ad_label), team_split = excluded.team_split, people_mode = excluded.people_mode,
      people = excluded.people, team_modes = excluded.team_modes, together = true,
      started_at = case when x.mode <> excluded.mode then now() else x.started_at end,
      mode = excluded.mode, updated_by = excluded.updated_by, updated_at = now()
    returning * into r;
    v_saved := v_saved + 1;
    -- What waited Over the limit for this ad is dealt first, oldest first, only inside the team it waits for.
    for h in select id, team_id from crm_contacts where ad_source_id = r.ad_source_id and held_reason = 'limit' and assigned_to is null order by created_at, id loop
      select * into pick from crm_pick_inside(h.team_id, r.ad_source_id, r.started_at, coalesce(r.team_modes ->> h.team_id::text, 'pct'), r.people, now());
      exit when pick.hold or pick.member is null;
      update crm_contacts set assigned_to = pick.member, held_reason = null where id = h.id;
      v_dealt := v_dealt + 1;
    end loop;
  end loop;
  return jsonb_build_object('saved', v_saved, 'dealt', v_dealt);
end $$;
revoke execute on function public.crm_save_ads_together(jsonb, text, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function public.crm_save_ads_together(jsonb, text, jsonb, text, jsonb, jsonb) to authenticated, service_role;

-- From now: every ad holding the latest saved setting is counted together, its count starting now.
with latest as (
  select mode, team_split, people_mode, people, team_modes from public.crm_ad_assign order by updated_at desc, ad_source_id limit 1
)
update public.crm_ad_assign a set together = true, started_at = now()
  from latest l
 where a.mode = l.mode and a.team_split = l.team_split and a.people_mode = l.people_mode and a.people = l.people
   and a.team_modes = l.team_modes;
