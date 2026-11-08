-- CRM › Assignment › People, Calendar's leave layer and Team activity (the owner's handoff docs/design_handoff_crm,
-- 2026-11-08: "确保那些规则是 link 在一起的"). One data model for the three screens and the dealer:
--
--   crm_people              each person now says whether they can sign in (login) and whether they are paused, so People,
--                           Calendar and Team activity show "No CRM login" and "Paused" from the same answer. Production's
--                           body (md5 bf9d58eb63a6aaa868fff0428bedd849), two fields added to each of its two selects.
--   crm_set_person_days     a person's Full time days (Mon–Sun) from People's toggles. Kept where the dealer already reads
--                           them — their team's crm_fulltime_rules row (vals[staff][day] = 1) — so THE DEALER needs no
--                           change: the team's days become the days some member is ticked for (the 2026-10-23 rule "只算有
--                           人勾的那几天"), and a person with no days is part time (Member work type, crm_staff.full_time),
--                           as crm_set_full_time already clears the days of a part-timer. Who: CRM · Manage, or a leader
--                           Settings › Up next switched on, for their own line (crm_up_next_may — Pause's own check).
--                           Logged in crm_events (kind up_next, action days) with before → after.
--   crm_set_locked          production's body (md5 82de2ad5e…) with the change logged the same way (action lock), so every
--                           change People makes is in the Audit log under Assignment.

-- ── crm_people: login + paused ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.crm_people()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me   uuid := crm_me();
  v_role text := crm_my_role();
  v_out  jsonb;
begin
  if crm_scope() is null then
    select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', coalesce(crm_role_of(s.id), case when s.id = v_me then v_role end),
               'uplineId', s.reports_to, 'fullTime', coalesce(cs.full_time, false), 'title', t.name,
               'login', s.user_id is not null, 'paused', coalesce(cs.paused, false)) order by s.employee_name)
        from hr_staff_costs s left join crm_staff cs on cs.staff_id = s.id left join titles t on t.id = s.title_id
       where v_role is not null and s.status = 'active' and (crm_role_of(s.id) is not null or s.id = v_me)
         and (s.id in (select crm_downline(v_me)) or crm_sees_all())), '[]'::jsonb))
      into v_out;
    return v_out;
  end if;
  select jsonb_build_object('me', v_me, 'role', v_role, 'people', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.employee_name, 'role', coalesce(x.role, case when s.id = v_me then v_role end),
             'uplineId', crm_upline_of(s.id), 'fullTime', coalesce(cs.full_time, false),
             'title', coalesce(mt.name, t.name),
             'login', s.user_id is not null, 'paused', coalesce(cs.paused, false)) order by s.employee_name)
      from hr_staff_costs s
      cross join lateral (select crm_role_of(s.id) as role) x
      cross join lateral crm_scope_member(s.id) m
      left join titles mt on mt.id = m.title_id
      left join titles t on t.id = s.title_id
      left join crm_staff cs on cs.staff_id = s.id
     where v_role is not null and s.status = 'active' and (x.role is not null or s.id = v_me)
       and (s.id in (select crm_downline(v_me)) or crm_sees_all())), '[]'::jsonb))
    into v_out;
  return v_out;
end $$;

-- ── A person's Full time days ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.crm_set_person_days(p_staff uuid, p_days integer[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tl     uuid;
  v_days   int[] := (select coalesce(array_agg(distinct d order by d), '{}') from unnest(coalesce(p_days, '{}')) d where d between 0 and 6);
  v_before int[];
  v_vals   jsonb;
  v_all    int[];
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('set this person''s Full time days'); end if;
  v_tl := crm_team_of(p_staff);
  if v_tl is null then raise exception 'This person is not in a team.' using errcode = '22023'; end if;

  select vals into v_vals from crm_fulltime_rules where tl_id = v_tl for update;
  v_vals := coalesce(v_vals, '{}'::jsonb);
  v_before := (select coalesce(array_agg(k::int order by k::int), '{}') from jsonb_each_text(coalesce(v_vals -> p_staff::text, '{}'::jsonb)) e(k, v) where v::numeric > 0);

  v_vals := v_vals - p_staff::text;
  if cardinality(v_days) > 0 then
    v_vals := v_vals || jsonb_build_object(p_staff::text, (select jsonb_object_agg(d::text, 1) from unnest(v_days) d));
  end if;
  -- The team's days are the days somebody in it is ticked for.
  v_all := (select coalesce(array_agg(distinct k::int order by k::int), '{}') from jsonb_each(v_vals) p(staff, m), jsonb_each_text(m) e(k, v) where v::numeric > 0);

  insert into crm_fulltime_rules as x (tl_id, mode, days, vals, updated_by)
  values (v_tl, 'turns', v_all, v_vals, crm_me())
  on conflict (tl_id) do update set days = excluded.days, vals = excluded.vals, updated_by = excluded.updated_by, updated_at = now();

  -- Days ⇔ full time (Member work type): ticked days make them full time, none makes them part time.
  insert into crm_staff (staff_id, full_time, updated_by, updated_at) values (p_staff, cardinality(v_days) > 0, auth.uid(), now())
  on conflict (staff_id) do update set full_time = excluded.full_time, updated_by = excluded.updated_by, updated_at = now();

  if v_before is distinct from v_days then
    perform crm_up_next_log('days', p_staff, null, jsonb_build_object('days', to_jsonb(v_before)), jsonb_build_object('days', to_jsonb(v_days)));
  end if;
  return jsonb_build_object('staff', p_staff, 'days', to_jsonb(v_days));
end $$;
revoke all on function public.crm_set_person_days(uuid, integer[]) from public, anon;
grant execute on function public.crm_set_person_days(uuid, integer[]) to authenticated;

-- ── Lock, logged ───────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.crm_set_locked(p_staff uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_was boolean;
begin
  if not public.crm_manages() then perform crm_deny('lock a member'); end if;
  if coalesce(crm_role_of(p_staff), '') not in ('tl', 'ta', 'rs', 'hod') then
    raise exception 'Only a team member or a Revenue Director can be locked.' using errcode = '22023';
  end if;
  select locked into v_was from crm_staff where staff_id = p_staff;
  insert into crm_staff (staff_id, full_time, locked, updated_by, updated_at) values (p_staff, false, coalesce(p_locked, false), auth.uid(), now())
  on conflict (staff_id) do update set locked = excluded.locked, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  if coalesce(v_was, false) is distinct from coalesce(p_locked, false) then
    perform crm_up_next_log(case when p_locked then 'lock' else 'unlock' end, p_staff, null, jsonb_build_object('locked', coalesce(v_was, false)), jsonb_build_object('locked', coalesce(p_locked, false)));
  end if;
end $$;
