-- CRM › Insight › Up next (the owner's design handoff docs/design_handoff_crm_up_next, 2026-11-08): who THE DEALER gives the
-- next ad lead to, and Skip · Pause · Give to… · leave with a time and a reason. Why each piece:
--
--   crm_staff.paused        Pause / Resume is one lasting switch per person, apart from Locked (Active members' own setting).
--   crm_staff_leave         from_at / to_at / reason: leave now has a time and a reason. starts_on / ends_on stay, kept in
--                           step by a trigger, because the sweep and the old function read them. Same table, so Assignment's
--                           leave and Up next's are one record.
--   crm_deal_overrides      Give to… and Skip must reach the REAL dealing, so they cannot live on a screen: each waits here
--                           until the lead it is about is dealt (used_at), or it is undone (cleared_at).
--   crm_staff_locked        the one place every dealing path already asks: it now also says paused, and "skipped for the
--                           lead being dealt" (crm.deal_skip, this transaction only).
--   crm_assign_contact      production's body with three checked insertions: a pin first, a leader's pin inside their team,
--                           a skip (deal again without that person). Nothing else of the dealer changes.
--   crm_up_next             the queue. NOT a second dealer: inside a sub-transaction it inserts throwaway contacts, calls the
--                           real crm_assign_contact for each, reads who it picked, and rolls all of it back. So the screen
--                           and the dealing cannot disagree, whatever the dealer does now or later.
--   crm_events              contact_id optional and kind 'up_next': the owner asked for every action in crm_events with who,
--                           when, before and after, and these actions are about a person, not a customer.

-- ── Pause ────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_staff add column if not exists paused boolean not null default false;

-- ── Leave with a time and a reason ───────────────────────────────────────────────────────────────────────────────────
alter table public.crm_staff_leave
  add column if not exists from_at timestamptz,
  add column if not exists to_at timestamptz,
  add column if not exists reason text not null default 'Other';
alter table public.crm_staff_leave drop constraint if exists crm_staff_leave_reason_check;
alter table public.crm_staff_leave add constraint crm_staff_leave_reason_check check (reason in ('Annual', 'Sick', 'Training', 'Other'));

update public.crm_staff_leave set
  from_at = starts_on::timestamp at time zone 'Asia/Kuala_Lumpur',
  to_at = ((ends_on + 1)::timestamp at time zone 'Asia/Kuala_Lumpur') - interval '1 second'
 where from_at is null;

-- Dates written alone (crm_save_leave, a page open across the release) give whole days; times written give the dates.
create or replace function public.crm_staff_leave_sync() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.from_at is null then
    new.from_at := new.starts_on::timestamp at time zone 'Asia/Kuala_Lumpur';
    new.to_at := ((new.ends_on + 1)::timestamp at time zone 'Asia/Kuala_Lumpur') - interval '1 second';
  elsif tg_op = 'UPDATE' and new.from_at is not distinct from old.from_at and new.to_at is not distinct from old.to_at
        and (new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on) then
    new.from_at := new.starts_on::timestamp at time zone 'Asia/Kuala_Lumpur';
    new.to_at := ((new.ends_on + 1)::timestamp at time zone 'Asia/Kuala_Lumpur') - interval '1 second';
  end if;
  new.starts_on := (new.from_at at time zone 'Asia/Kuala_Lumpur')::date;
  new.ends_on := (new.to_at at time zone 'Asia/Kuala_Lumpur')::date;
  return new;
end $$;
drop trigger if exists crm_staff_leave_sync on public.crm_staff_leave;
create trigger crm_staff_leave_sync before insert or update on public.crm_staff_leave
  for each row execute function public.crm_staff_leave_sync();

alter table public.crm_staff_leave alter column from_at set not null, alter column to_at set not null;
alter table public.crm_staff_leave drop constraint if exists crm_staff_leave_at_check;
alter table public.crm_staff_leave add constraint crm_staff_leave_at_check check (to_at >= from_at);

-- Out when NOW is inside the range, to the half hour (was: the whole office day).
create or replace function public.crm_on_leave(p_staff uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from crm_staff_leave l where l.staff_id = p_staff and now() between l.from_at and l.to_at);
end $$;

-- The upline is told once it has really started: a leave from 14:00 is not announced at 09:00.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.crm_notify_leave_starts()'::regprocedure) into v_src;
  v_new := replace(v_src, 'where l.told_at is null and v_today between l.starts_on and l.ends_on',
                          'where l.told_at is null and now() between l.from_at and l.to_at');
  if v_new = v_src then raise exception 'crm_up_next: crm_notify_leave_starts has changed; look before replacing.'; end if;
  execute v_new;
end $$;

-- ── Give to… and Skip, waiting for their lead ────────────────────────────────────────────────────────────────────────
create table if not exists public.crm_deal_overrides (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pin', 'skip')),
  -- 'all' = the next ad lead of any ad; otherwise that ad's id.
  scope text not null,
  staff_id uuid not null references public.hr_staff_costs(id) on delete cascade,
  -- A leader's pin stays inside their team: it never moves a lead from another team's share.
  team_only boolean not null default false,
  created_by uuid references public.hr_staff_costs(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_contact uuid references public.crm_contacts(id) on delete set null,
  cleared_at timestamptz
);
create index if not exists crm_deal_overrides_open on public.crm_deal_overrides (kind, scope) where used_at is null and cleared_at is null;
alter table public.crm_deal_overrides enable row level security;
revoke all on public.crm_deal_overrides from anon, authenticated;
-- No policy: read through crm_up_next, written only through the functions below and the dealer.
SELECT public.audit_register('crm_deal_overrides', 'CRM next lead pins and skips', 'Member services', '{revenue,crm_manage}', 'people');

-- ── The dealer ───────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_staff_locked(p_staff uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select s.locked or s.paused from crm_staff s where s.staff_id = p_staff), false)
      -- On leave now: out of the dealing as a locked member (mig 20261029220000; to the half hour since 20261108120000).
      or crm_on_leave(p_staff)
      -- Skipped for the lead being dealt, this transaction only (crm_assign_contact, mig 20261108120000).
      or p_staff::text = any (string_to_array(coalesce(current_setting('crm.deal_skip', true), ''), ','))
$function$;

do $$
declare v_src text; v_new text;
  a1 text := '  v_ftok  boolean;';
  a2 text := '  select * into c from crm_contacts where id = p_contact for update;';
  a3 text := '  select * into r from crm_ad_assign where ad_source_id = c.ad_source_id;';
  a4 text := '  update crm_contacts set team_id = v_team, assigned_to = v_who, held_reason = null where id = p_contact;';
begin
  select pg_get_functiondef('public.crm_assign_contact(uuid)'::regprocedure) into v_src;
  if position(a1 in v_src) = 0 or position(a2 in v_src) = 0 or position(a3 in v_src) = 0 or position(a4 in v_src) = 0 then
    raise exception 'crm_up_next: crm_assign_contact has changed; look before replacing.';
  end if;
  v_new := replace(v_src, a1, a1 || '
  v_over  crm_deal_overrides;
  v_res   jsonb;');
  v_new := replace(v_new, a2, '  -- A new lead starts with nobody skipped (a skip below deals the same lead again, one person fewer).
  if current_setting(''crm.deal_contact'', true) is distinct from p_contact::text then
    perform set_config(''crm.deal_contact'', p_contact::text, true);
    perform set_config(''crm.deal_skip'', '''', true);
  end if;
' || a2);
  v_new := replace(v_new, a3, '  -- Up next › Give to… (mig 20261108120000): the next ad lead goes to the pinned person, once; then the split carries on.
  select o.* into v_over from crm_deal_overrides o
   where o.kind = ''pin'' and o.used_at is null and o.cleared_at is null and not o.team_only
     and o.scope in (c.ad_source_id, ''all'') and not crm_staff_locked(o.staff_id)
   order by (o.scope = c.ad_source_id) desc, o.created_at desc limit 1 for update;
  if v_over.id is not null then
    update crm_deal_overrides set used_at = now(), used_contact = p_contact where id = v_over.id;
    v_who := v_over.staff_id;
    v_team := crm_team_of(v_who);
    update crm_contacts set team_id = v_team, assigned_to = v_who, held_reason = null where id = p_contact;
    return jsonb_build_object(''assigned'', true, ''team'', v_team, ''member'', v_who, ''member_by'', ''pinned'', ''pin_by'', v_over.created_by);
  end if;
' || a3);
  v_new := replace(v_new, a4, '  if c.ad_source_id is not null then
    -- A leader''s Give to…: once the split has given their team this lead, it goes to the person they named.
    select o.* into v_over from crm_deal_overrides o
     where o.kind = ''pin'' and o.used_at is null and o.cleared_at is null and o.team_only
       and o.scope in (c.ad_source_id, ''all'') and not crm_staff_locked(o.staff_id)
       and crm_team_of(o.staff_id) is not distinct from v_team
     order by (o.scope = c.ad_source_id) desc, o.created_at desc limit 1 for update;
    if v_over.id is not null then
      update crm_deal_overrides set used_at = now(), used_contact = p_contact where id = v_over.id;
      update crm_contacts set team_id = v_team, assigned_to = v_over.staff_id, held_reason = null where id = p_contact;
      return jsonb_build_object(''assigned'', true, ''team'', v_team, ''member'', v_over.staff_id, ''member_by'', ''pinned'', ''pin_by'', v_over.created_by);
    end if;
    -- Up next › Skip: this one lead goes to the next person; the skipped person keeps their place for later turns.
    select o.* into v_over from crm_deal_overrides o
     where o.kind = ''skip'' and o.used_at is null and o.cleared_at is null and o.staff_id = v_who
       and o.scope in (c.ad_source_id, ''all'')
     order by o.created_at limit 1 for update;
    if v_over.id is not null then
      update crm_deal_overrides set used_at = now(), used_contact = p_contact where id = v_over.id;
      perform set_config(''crm.deal_skip'', concat_ws('','', nullif(current_setting(''crm.deal_skip'', true), ''''), v_who::text), true);
      v_res := crm_assign_contact(p_contact);
      if coalesce((v_res ->> ''assigned'')::boolean, false) or v_res ->> ''waits'' = ''limit'' then return v_res; end if;
      -- Nobody else can take it: a lead never stalls because of a skip.
      perform set_config(''crm.deal_skip'', '''', true);
    end if;
  end if;
' || a4);
  execute v_new;
end $$;

-- ── The audit trail ──────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_events alter column contact_id drop not null;
alter table public.crm_events drop constraint if exists crm_events_kind_check;
alter table public.crm_events add constraint crm_events_kind_check check (kind = any (array['won','lost','moved','shared','share_declined','move_declined','assigned','first_reply','appt_booked','appt_changed','appt_cancelled','visit','status','reminded','up_next']));
drop policy if exists crm_events_up_next_read on public.crm_events;
create policy crm_events_up_next_read on public.crm_events for select to authenticated
  using (kind = 'up_next' and (select crm_sees_all()));

-- Who (crm_me), when (at), what, about whom, before and after.
create or replace function public.crm_up_next_log(p_action text, p_staff uuid, p_ad text, p_before jsonb, p_after jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  if auth.uid() is not null then v_me := crm_me(); end if;
  insert into crm_events (kind, contact_id, actor, owner, data)
  values ('up_next', null, v_me, p_staff, jsonb_build_object('action', p_action, 'staff', p_staff, 'ad', p_ad, 'before', p_before, 'after', p_after));
end $$;
revoke execute on function public.crm_up_next_log(text, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.crm_up_next_log(text, uuid, text, jsonb, jsonb) to service_role;

-- A leave saved, changed or removed from either screen, by any function, is on the record.
create or replace function public.crm_staff_leave_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else jsonb_build_object('from', old.from_at, 'to', old.to_at, 'reason', old.reason, 'note', old.note) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else jsonb_build_object('from', new.from_at, 'to', new.to_at, 'reason', new.reason, 'note', new.note) end;
begin
  if v_old is distinct from v_new then
    perform crm_up_next_log(case tg_op when 'INSERT' then 'leave_added' when 'DELETE' then 'leave_removed' else 'leave_changed' end,
      case when tg_op = 'DELETE' then old.staff_id else new.staff_id end, null, v_old, v_new);
  end if;
  return null;
end $$;
drop trigger if exists crm_staff_leave_log on public.crm_staff_leave;
create trigger crm_staff_leave_log after insert or update or delete on public.crm_staff_leave
  for each row execute function public.crm_staff_leave_log();

-- ── The writes ───────────────────────────────────────────────────────────────────────────────────────────────────────
-- ── Who else may act: CRM › Settings › Up next ─────────────────────────────────────────────────────────────────────────
-- The owner (2026-11-08): the Principal switches a TL / STL / TA on in the CRM's own management pages, and that leader may
-- Skip, Pause, Give to… and fill in leave for the people under them. Kept on the person's CRM record, beside Locked.
alter table public.crm_staff add column if not exists up_next boolean not null default false;

create or replace function public.crm_up_next_ticked(p_staff uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.up_next from crm_staff s where s.staff_id = p_staff), false)
$$;
revoke execute on function public.crm_up_next_ticked(uuid) from public, anon, authenticated;
grant execute on function public.crm_up_next_ticked(uuid) to service_role;

-- CRM · Manage switches it, on the record like every Up next change.
create or replace function public.crm_set_up_next(p_staff uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_was boolean;
begin
  if not crm_manages() then perform crm_deny('let somebody act in Up next'); end if;
  if p_staff is null or not exists (select 1 from hr_staff_costs where id = p_staff) then raise exception 'Pick a member.' using errcode = '22023'; end if;
  select up_next into v_was from crm_staff where staff_id = p_staff;
  insert into crm_staff (staff_id, up_next, updated_by, updated_at) values (p_staff, coalesce(p_on, false), auth.uid(), now())
  on conflict (staff_id) do update set up_next = excluded.up_next, updated_by = excluded.updated_by, updated_at = now();
  if coalesce(v_was, false) is distinct from coalesce(p_on, false) then
    perform crm_up_next_log('access', p_staff, null, jsonb_build_object('mayAct', coalesce(v_was, false)), jsonb_build_object('mayAct', coalesce(p_on, false)));
  end if;
end $$;

-- CRM · Manage may act on anybody; a leader ticked for CRM · Up next on the people under them (never themselves).
create or replace function public.crm_up_next_may(p_staff uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_staff is null then return false; end if;
  if crm_manages() then return true; end if;
  return crm_up_next_ticked(crm_me()) and crm_can('view', 'own')
     and p_staff is distinct from crm_me() and p_staff in (select crm_my_downline());
end $$;
revoke execute on function public.crm_up_next_may(uuid) from public, anon, authenticated;
grant execute on function public.crm_up_next_may(uuid) to service_role;

create or replace function public.crm_up_next_skip(p_ad text, p_staff uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('skip this person'); end if;
  update crm_deal_overrides set cleared_at = now()
   where kind = 'pin' and staff_id = p_staff and scope = p_ad and used_at is null and cleared_at is null;
  insert into crm_deal_overrides (kind, scope, staff_id, created_by) values ('skip', p_ad, p_staff, crm_me());
  perform crm_up_next_log('skip', p_staff, p_ad, null, jsonb_build_object('skipped', true));
end $$;

create or replace function public.crm_up_next_pause(p_staff uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_was boolean;
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('pause this person'); end if;
  select paused into v_was from crm_staff where staff_id = p_staff;
  insert into crm_staff (staff_id, paused, updated_by, updated_at) values (p_staff, p_on, auth.uid(), now())
  on conflict (staff_id) do update set paused = excluded.paused, updated_by = excluded.updated_by, updated_at = now();
  if p_on then
    update crm_deal_overrides set cleared_at = now() where kind = 'pin' and staff_id = p_staff and used_at is null and cleared_at is null;
  end if;
  if coalesce(v_was, false) is distinct from p_on then
    perform crm_up_next_log(case when p_on then 'pause' else 'resume' end, p_staff, null, jsonb_build_object('paused', coalesce(v_was, false)), jsonb_build_object('paused', p_on));
  end if;
end $$;

create or replace function public.crm_up_next_give(p_ad text, p_staff uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_was uuid; v_me uuid := crm_me(); v_all boolean := crm_manages();
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('give the next lead to this person'); end if;
  if crm_staff_locked(p_staff) then raise exception 'They are locked, paused or on leave.' using errcode = '22023'; end if;
  select staff_id into v_was from crm_deal_overrides
   where kind = 'pin' and scope = p_ad and used_at is null and cleared_at is null and team_only = not v_all
     and (v_all or created_by = v_me) order by created_at desc limit 1;
  update crm_deal_overrides set cleared_at = now()
   where kind = 'pin' and scope = p_ad and used_at is null and cleared_at is null and team_only = not v_all and (v_all or created_by = v_me);
  insert into crm_deal_overrides (kind, scope, staff_id, team_only, created_by) values ('pin', p_ad, p_staff, not v_all, v_me);
  perform crm_up_next_log('give', p_staff, p_ad, jsonb_build_object('pinned', v_was), jsonb_build_object('pinned', p_staff));
end $$;

create or replace function public.crm_up_next_undo(p_ad text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := crm_me(); v_all boolean := crm_manages(); v_was uuid;
begin
  if v_me is null or not (v_all or (crm_up_next_ticked(v_me) and crm_can('view', 'own'))) then perform crm_deny('undo the next lead''s pin'); end if;
  select staff_id into v_was from crm_deal_overrides
   where kind = 'pin' and (p_ad = 'all' or scope in (p_ad, 'all')) and used_at is null and cleared_at is null and (v_all or created_by = v_me) order by created_at desc limit 1;
  update crm_deal_overrides set cleared_at = now()
   where kind = 'pin' and (p_ad = 'all' or scope in (p_ad, 'all')) and used_at is null and cleared_at is null and (v_all or created_by = v_me);
  if v_was is not null then perform crm_up_next_log('undo', v_was, p_ad, jsonb_build_object('pinned', v_was), jsonb_build_object('pinned', null)); end if;
end $$;

create or replace function public.crm_up_next_save_leave(p_id uuid, p_staff uuid, p_from timestamptz, p_to timestamptz, p_reason text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_note text := btrim(coalesce(p_note, ''));
begin
  if not crm_up_next_may(p_staff) then perform crm_deny('set this person''s leave'); end if;
  if p_from is null or p_to is null then raise exception 'Pick when it starts and ends.' using errcode = '22023'; end if;
  if p_to < p_from then raise exception 'To can''t be before From.' using errcode = '22023'; end if;
  if p_to - p_from > interval '367 days' then raise exception 'A leave is a year at most.' using errcode = '22023'; end if;
  if p_reason is null or p_reason not in ('Annual', 'Sick', 'Training', 'Other') then raise exception 'Pick a reason.' using errcode = '22023'; end if;
  if p_reason = 'Other' and v_note = '' then raise exception 'Write the reason.' using errcode = '22023'; end if;
  if length(v_note) > 200 then raise exception 'A note is up to 200 characters.' using errcode = '22023'; end if;
  if exists (select 1 from crm_staff_leave l where l.staff_id = p_staff and l.id is distinct from p_id and l.from_at <= p_to and l.to_at >= p_from) then
    raise exception 'That overlaps another leave of theirs.' using errcode = '22023';
  end if;
  if p_id is not null and exists (select 1 from crm_staff_leave where id = p_id) then
    update crm_staff_leave set staff_id = p_staff, from_at = p_from, to_at = p_to, reason = p_reason, note = v_note,
      told_at = case when p_from > from_at then null else told_at end
     where id = p_id returning id into v_id;
  else
    insert into crm_staff_leave (staff_id, starts_on, ends_on, from_at, to_at, reason, note, created_by)
    values (p_staff, (p_from at time zone 'Asia/Kuala_Lumpur')::date, (p_to at time zone 'Asia/Kuala_Lumpur')::date, p_from, p_to, p_reason, v_note, auth.uid())
    returning id into v_id;
  end if;
  -- Out now: a pin on them is over.
  if now() between p_from and p_to then
    update crm_deal_overrides set cleared_at = now() where kind = 'pin' and staff_id = p_staff and used_at is null and cleared_at is null;
  end if;
  return v_id;
end $$;

-- End leave: it ended now, and stays on the record. Cancel leave (not started yet): gone, the trail keeps it.
create or replace function public.crm_up_next_end_leave(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l crm_staff_leave;
begin
  select * into l from crm_staff_leave where id = p_id;
  if l.id is null then return; end if;
  if not crm_up_next_may(l.staff_id) then perform crm_deny('end this person''s leave'); end if;
  if l.from_at > now() then delete from crm_staff_leave where id = p_id;
  else update crm_staff_leave set to_at = now() where id = p_id; end if;
end $$;

-- ── The read ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Why a person is not in turn for one ad, as the dealer would decide it right now; null = in turn. The dealer's own
-- questions (crm_staff_locked, crm_deal_handlers, crm_fulltime_teams), asked without dealing.
create or replace function public.crm_up_next_why(p_staff uuid, p_team uuid, p_ad text, p_at timestamptz)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  r crm_ad_assign; v_day int := (extract(isodow from (p_at at time zone 'Asia/Kuala_Lumpur'))::int + 6) % 7;
  v_ftday boolean; v_ftok boolean; v_ft boolean; v_mode text; v_any boolean; v_given numeric;
begin
  select * into r from crm_ad_assign where ad_source_id = p_ad;
  if r.ad_source_id is null then
    return case when p_team = crm_director_key() then null else 'not_on_ad' end;
  end if;
  v_ftday := exists (select 1 from crm_fulltime_teams(p_at));
  v_ft := p_team in (select crm_fulltime_teams(p_at));
  if r.mode = 'even' then
    if v_ftday and not v_ft then return 'not_full_time'; end if;
  else
    if coalesce((r.team_split ->> p_team::text)::numeric, 0) <= 0 then return 'not_on_ad'; end if;
    v_ftok := v_ftday and exists (select 1 from jsonb_each_text(r.team_split) s(key, val)
      where val ~ '^\d+(\.\d+)?$' and val::numeric > 0 and key::uuid in (select crm_fulltime_teams(p_at)));
    if v_ftok and not v_ft then return 'not_full_time'; end if;
  end if;
  if v_ft then
    if not exists (select 1 from crm_fulltime_rules f join crm_staff cs on cs.staff_id = p_staff and cs.full_time
                    where f.tl_id = p_team and coalesce((f.vals -> p_staff::text ->> v_day::text)::numeric, 0) > 0) then
      return 'not_full_time';
    end if;
    return null;
  end if;
  if r.mode <> 'even' then
    v_mode := coalesce(r.team_modes ->> p_team::text, 'pct');
    if v_mode = 'cnt' then
      if coalesce((r.people ->> p_staff::text)::numeric, 0) <= 0 then return 'no_share'; end if;
      select coalesce(sum(g.n), 0) into v_given from crm_campaign_given(r.ad_source_id, r.started_at) g where g.staff = p_staff;
      if v_given >= (r.people ->> p_staff::text)::numeric then return 'at_limit'; end if;
    elsif v_mode = 'pct' then
      select exists (select 1 from crm_deal_handlers(p_team) h where coalesce((r.people ->> h::text)::numeric, 0) > 0) into v_any;
      if v_any and coalesce((r.people ->> p_staff::text)::numeric, 0) <= 0 then return 'no_share'; end if;
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.crm_up_next_why(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_up_next_why(uuid, uuid, text, timestamptz) to service_role;

-- p_ad = an ad's id, or 'all' with p_ads = the ads taking leads now: the leads go round them, each dealt by its own split,
-- so the queue adds their splits together. p_line = View as: that person's line (only for who may read everybody).
create or replace function public.crm_up_next(p_ad text, p_ads text[] default null, p_n int default 10, p_line uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_me uuid := crm_me(); v_all boolean := crm_sees_all(); v_line uuid[]; v_at timestamptz := now();
  v_ads text[]; v_i int := 0; v_max int; v_contact uuid; v_res jsonb; v_who uuid;
  v_queue jsonb := '[]'; v_people jsonb := '[]'; v_shares jsonb := '{}'; v_last jsonb; v_lastby jsonb; v_up jsonb;
  v_n int := least(greatest(coalesce(p_n, 10), 1), 30); v_got int := 0; v_ad text; v_scoped boolean;
  p record; v_why text; w text; v_paused boolean; v_locked boolean; v_lv crm_staff_leave; v_ticked boolean;
begin
  if v_me is null then perform crm_deny('read who is next'); end if;
  if v_all then
    v_scoped := p_line is not null;
    if v_scoped then v_line := array(select crm_downline(p_line)) || p_line; end if;
  else
    v_scoped := true;
    v_line := array(select crm_my_downline());
    if not exists (select 1 from unnest(v_line) x where x <> v_me) then perform crm_deny('read who is next'); end if;
  end if;

  v_ads := case when p_ad = 'all' then coalesce(p_ads, array(select a.ad_source_id from crm_ad_assign a order by a.ad_source_id)) else array[p_ad] end;
  v_max := case when v_scoped then 40 else v_n * 2 end;

  -- The real dealer, on throwaway leads, all rolled back.
  if coalesce(array_length(v_ads, 1), 0) > 0 then
    begin
      while v_i < v_max and v_got < v_n loop
        v_ad := v_ads[(v_i % array_length(v_ads, 1)) + 1];
        v_i := v_i + 1;
        insert into crm_contacts (channel, account_id, external_id, ad_source_id, last_customer_at)
        values ('whatsapp', 'up-next-preview', gen_random_uuid()::text, v_ad, v_at) returning id into v_contact;
        v_res := crm_assign_contact(v_contact);
        v_who := nullif(v_res ->> 'member', '')::uuid;
        if v_who is not null then
          -- One after another, so "least recently" holds among these leads too.
          update crm_contacts set assigned_at = clock_timestamp() where id = v_contact;
          if not v_scoped or v_who = any (v_line) then
            v_queue := v_queue || jsonb_build_object('staff', v_who, 'team', coalesce((v_res ->> 'team')::uuid, crm_director_key()), 'how', v_res ->> 'member_by', 'pinBy', v_res -> 'pin_by', 'ad', v_ad);
            v_got := v_got + 1;
          end if;
        end if;
      end loop;
      raise exception 'rolled back' using errcode = 'VPUPN';
    exception when sqlstate 'VPUPN' then null;
    end;
  end if;

  -- Everybody the dealer knows: in turn, or why not.
  for p in
    select h.staff, coalesce(crm_team_of(h.staff), case when crm_role_of(h.staff) = 'hod' then crm_director_key() end) as team
      from (select a as staff from crm_all_handlers() a union select d from crm_team_handlers(crm_director_key()) d) h
  loop
    continue when p.team is null;
    continue when v_scoped and not (p.staff = any (v_line));
    select coalesce(s.paused, false), coalesce(s.locked, false) into v_paused, v_locked from crm_staff s where s.staff_id = p.staff;
    v_paused := coalesce(v_paused, false); v_locked := coalesce(v_locked, false);
    select * into v_lv from crm_staff_leave l where l.staff_id = p.staff and v_at between l.from_at and l.to_at limit 1;
    v_why := case when v_lv.id is not null then 'leave' when v_paused then 'paused' end;
    if v_why is null then
      -- In turn on any of the ads counted; otherwise the first reason.
      v_why := case when coalesce(array_length(v_ads, 1), 0) = 0 then 'not_on_ad' end;
      for w in select crm_up_next_why(p.staff, p.team, a, v_at) from unnest(v_ads) a loop
        if w is null then v_why := null; exit; end if;
        if v_why is null then v_why := w; end if;
      end loop;
      -- Not on this ad says more than locked; otherwise locked comes before the rest, as the prototype's order.
      if v_locked and v_why is distinct from 'not_on_ad' then v_why := 'locked'; end if;
    end if;
    -- Give to… lists nobody not ticked on a Full time day.
    v_ticked := not exists (select 1 from crm_fulltime_teams(v_at)) or exists (
      select 1 from crm_fulltime_rules f join crm_staff cs on cs.staff_id = p.staff and cs.full_time
       where f.tl_id = p.team and (extract(isodow from (v_at at time zone 'Asia/Kuala_Lumpur'))::int + 6) % 7 = any (f.days)
         and coalesce((f.vals -> p.staff::text ->> ((extract(isodow from (v_at at time zone 'Asia/Kuala_Lumpur'))::int + 6) % 7)::text)::numeric, 0) > 0);
    v_people := v_people || jsonb_build_object('staff', p.staff, 'team', p.team, 'why', v_why,
      'pickable', v_lv.id is null and not v_paused and not v_locked and v_ticked,
      'leave', case when v_lv.id is null then null else jsonb_build_object('id', v_lv.id,
        'from', to_char(v_lv.from_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
        'to', to_char(v_lv.to_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'), 'reason', v_lv.reason, 'note', v_lv.note) end);
  end loop;

  -- The split on screen: this ad's, or each ad's added together (each ad weighing the same).
  select coalesce(jsonb_object_agg(team, round(share / greatest(coalesce(array_length(v_ads, 1), 1), 1), 2)), '{}') into v_shares from (
    select s.key as team, sum(s.val::numeric * 100 / nullif(t.total, 0)) as share
      from crm_ad_assign a
      cross join lateral jsonb_each_text(a.team_split) s(key, val)
      cross join lateral (select sum(x.val::numeric) as total from jsonb_each_text(a.team_split) x(key, val) where x.val ~ '^\d+(\.\d+)?$') t
     where a.ad_source_id = any (v_ads) and a.mode <> 'even' and s.val ~ '^\d+(\.\d+)?$' and s.val::numeric > 0
     group by s.key) q;

  -- The last lead dealt, and each person's last lead, in this scope.
  select jsonb_build_object('staff', c.assigned_to, 'at', c.assigned_at, 'ad', c.ad_source_id) into v_last
    from crm_contacts c
   where c.ad_source_id is not null and c.assigned_to is not null and c.assigned_at is not null
     and (p_ad = 'all' or c.ad_source_id = p_ad)
     and (not v_scoped or c.assigned_to = any (v_line))
   order by c.assigned_at desc limit 1;
  select coalesce(jsonb_object_agg(q.who, q.at), '{}') into v_lastby from (
    select c.assigned_to as who, max(c.assigned_at) as at from crm_contacts c
     where c.ad_source_id is not null and c.assigned_to is not null and c.assigned_at is not null
       and (p_ad = 'all' or c.ad_source_id = p_ad)
     group by c.assigned_to) q;

  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'staff', l.staff_id,
      'from', to_char(l.from_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
      'to', to_char(l.to_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'), 'reason', l.reason, 'note', l.note) order by l.from_at), '[]') into v_up
    from crm_staff_leave l where l.from_at > v_at and (not v_scoped or l.staff_id = any (v_line));

  return jsonb_build_object('me', v_me, 'now', to_char(v_at at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI'),
    'manage', crm_manages(),
    -- May the viewer act here at all (CRM · Manage, or ticked for CRM · Up next on their own line)?
    'canAct', crm_manages() or (crm_up_next_ticked(v_me) and crm_can('view', 'own')),
    'fullTimeDay', exists (select 1 from crm_fulltime_teams(v_at)),
    -- Every ad counted is in the together group with one split (Save and apply to all › Count together): one pool.
    'together', coalesce(array_length(v_ads, 1), 0) > 1 and not exists (select 1 from unnest(v_ads) x left join crm_ad_assign a on a.ad_source_id = x where a.together is not true)
      and (select count(distinct a.team_split) from crm_ad_assign a where a.ad_source_id = any (v_ads)) = 1,
    'queue', v_queue, 'people', v_people, 'shares', v_shares, 'last', v_last, 'lastBy', v_lastby, 'upcoming', v_up);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'crm_up_next_skip(text, uuid)', 'crm_up_next_pause(uuid, boolean)', 'crm_up_next_give(text, uuid)', 'crm_up_next_undo(text)', 'crm_set_up_next(uuid, boolean)',
    'crm_up_next_save_leave(uuid, uuid, timestamptz, timestamptz, text, text)', 'crm_up_next_end_leave(uuid)', 'crm_up_next(text, text[], int, uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
