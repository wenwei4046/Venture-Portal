-- Save and apply to all, as the owner arranged it (2026-10-24; counting together was taken back first, 20261025124500, then:
-- "因为它现在有 Save 和 Save and Apply to All，Save 就是普通的 Save。但如果按 Save and Apply to All 的话，它会跳出来一个 floating
-- window：1. 可以在里面勾选广告，决定哪一个要、哪一个不要 2. 选了之后，再选择是 standard 的 apply to all，还是全部总和起来算 …
-- 所以其实不是要 delete 掉那个 function，只是要把排法做好").
--
-- Save and apply to all opens a window: the ads are ticked there, and the open ad's setting is saved on each of them either
--   · Standard — each ad counting only its own leads, as Save and apply to all did before 20261025121500; or
--   · Count together — and the ads ticked ARE the together ads: the next lead of any of them goes by all of their leads this
--     month (the office's), as 20261025121500 counted them. An ad that was together and is not ticked leaves them.
-- An ad joining the together ads or leaving them starts its count now, as a new mode does.
--
--   crm_save_ads()          — the window's save: p_ads {ad id: its name}, p_together, the setting (CRM · Manage)
--   crm_campaign_given()    — counts through crm_counted_leads again (20261025121500's body)
--   crm_assign_contact()    — a full By max team's waiting leads too (20261025121500's replacement, put back on production's
--                             body: Kaiyee's Full time evenly, 20261025060000, stays)
--   crm_save_ad_assign()    — Save: with anything changed, an ad leaves the together ads (20261025121500's replacement)
--   crm_save_ads_together() — goes: the window replaces it. Until these screens deploy, the old ones' Save and apply to all
--                             fails (a toast) rather than putting every ad together.
-- Every ad is apart (20261025124500), so the dealing changes only when the window counts ads together.
-- Production's bodies, md5 checked 2026-10-24: campaign_given f485e7e4…, assign_contact 802442b9…, save_ad_assign 107965ab….

do $mig$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_campaign_given(text, timestamptz)'::regprocedure) <> 'f485e7e495108e723c593a906f880252' then
    raise exception 'crm_ads_apply_window: crm_campaign_given is no longer the body this was written from';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_assign_contact(uuid)'::regprocedure) <> '802442b943a5d3fe293c6692b3886b89' then
    raise exception 'crm_ads_apply_window: crm_assign_contact is no longer the body this was written from';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure) <> '107965abc3eb0cb0cf2ca4d3196f9c29' then
    raise exception 'crm_ads_apply_window: crm_save_ad_assign is no longer the body this was written from';
  end if;
  if to_regprocedure('public.crm_counted_leads(text, timestamptz)') is null then
    raise exception 'crm_ads_apply_window: crm_counted_leads (20261025121500) is not there';
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
  -- By team: the leads a full By max team holds count as the ad's leads do — together, all the together ads' this month.
  d := pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure);
  for f in select * from (values
    ($a$(select count(*) from crm_contacts x where x.ad_source_id = r.ad_source_id and x.team_id = key::uuid and x.held_reason = 'limit' and x.created_at >= r.started_at)$a$,
     $a$(select count(*) from crm_contacts x join crm_counted_leads(r.ad_source_id, r.started_at) k on k.ad = x.ad_source_id and x.created_at >= k.since
                   where x.team_id = key::uuid and x.held_reason = 'limit')$a$)
  ) as v(old, new) loop
    if position(f.old in d) = 0 then raise exception 'crm_ads_apply_window: crm_assign_contact no longer has: %', f.old; end if;
    if position(f.old in substr(d, position(f.old in d) + 1)) > 0 then raise exception 'crm_ads_apply_window: more than once: %', f.old; end if;
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
    if position(f.old in d) = 0 then raise exception 'crm_ads_apply_window: crm_save_ad_assign no longer has: %', f.old; end if;
    if position(f.old in substr(d, position(f.old in d) + 1)) > 0 then raise exception 'crm_ads_apply_window: more than once: %', f.old; end if;
    d := replace(d, f.old, f.new);
  end loop;
  execute d;
end $mig$;

-- The window's save: the setting on every ad ticked ({ad id: its name}), each counted on its own (p_together false) or all of
-- them together (true) — then they are the together ads, and an ad together before and not ticked leaves them. The setting
-- is checked once, as crm_save_ad_assign checks it; each ad's waiting leads (a full By max team's) are dealt as its save deals
-- them. A new mode starts a new count, and so does joining the together ads or leaving them; a new split keeps it.
create or replace function public.crm_save_ads(p_ads jsonb, p_together boolean, p_mode text, p_team_split jsonb, p_people_mode text, p_people jsonb, p_team_modes jsonb)
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
  v_left  int := 0;
begin
  if not public.crm_manages() then perform crm_deny('assign ads'); end if;
  if jsonb_typeof(p_ads) is distinct from 'object' or not exists (select 1 from jsonb_each_text(p_ads) e where coalesce(trim(e.key), '') <> '') then
    raise exception 'Choose the ads.' using errcode = '22023';
  end if;
  if p_together is null then raise exception 'Choose Standard or Count together.' using errcode = '22023'; end if;
  if p_together and (select count(*) from jsonb_each_text(p_ads) e where coalesce(trim(e.key), '') <> '') < 2 then
    raise exception 'Tick at least two ads to count them together.' using errcode = '22023';
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
  -- Counted together, the ads ticked are the together ads: one together before and not ticked counts alone from now.
  if p_together then
    update crm_ad_assign x set together = false, started_at = now(), updated_by = crm_me(), updated_at = now()
     where x.together and not (p_ads ? x.ad_source_id);
    get diagnostics v_left = row_count;
  end if;
  for a in
    select e.key as ad, nullif(trim(coalesce(e.value, '')), '') as label from jsonb_each_text(p_ads) e where coalesce(trim(e.key), '') <> ''
  loop
    insert into crm_ad_assign as x (ad_source_id, ad_label, mode, team_split, people_mode, people, team_modes, updated_by, together)
    values (a.ad, a.label, p_mode, coalesce(p_team_split, '{}'::jsonb), coalesce(p_people_mode, 'pct'), coalesce(p_people, '{}'::jsonb),
            coalesce(p_team_modes, '{}'::jsonb), crm_me(), p_together)
    on conflict (ad_source_id) do update set
      ad_label = coalesce(excluded.ad_label, x.ad_label), team_split = excluded.team_split, people_mode = excluded.people_mode,
      people = excluded.people, team_modes = excluded.team_modes, together = excluded.together,
      started_at = case when x.mode <> excluded.mode or x.together <> excluded.together then now() else x.started_at end,
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
  return jsonb_build_object('saved', v_saved, 'dealt', v_dealt, 'left', v_left);
end $$;
revoke execute on function public.crm_save_ads(jsonb, boolean, text, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function public.crm_save_ads(jsonb, boolean, text, jsonb, text, jsonb, jsonb) to authenticated, service_role;

drop function if exists public.crm_save_ads_together(jsonb, text, jsonb, text, jsonb, jsonb);

do $mig$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_campaign_given(text, timestamptz)'::regprocedure) <> 'dc3345f46681864d61423fad44818dfd' then
    raise exception 'crm_ads_apply_window: crm_campaign_given is not 20261025121500''s body';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_save_ad_assign(text, text, text, jsonb, text, jsonb, jsonb)'::regprocedure) <> '492ba60af30b27d8484d3677a76bb511' then
    raise exception 'crm_ads_apply_window: crm_save_ad_assign is not 20261025121500''s body';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_assign_contact(uuid)'::regprocedure) <> '0324fccd74b7bae8275e90a500202dc8' then
    raise exception 'crm_ads_apply_window: crm_assign_contact is not the body with both (counted together, Full time evenly)';
  end if;
end $mig$;
