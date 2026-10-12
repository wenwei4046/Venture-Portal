-- The CRM on a computer, rev 1 (CRM Desktop rev 1, 2026-10-13; docs/design/crm-desktop-rev1/PROPOSALS.md, the user
-- approved B1–B6 and B9 the same day). Every write here asks the CRM's own checks: settings and reminders CRM · Manage
-- (crm_manages), a note or a customer's details whoever may work that customer (crm_can_reply). What the Principal or
-- the Director set here is what every RS / TL / TA's phone reads (user 2026-10-13: the control panel's settings reach
-- everybody's CRM; the phone's look does not change).
--
--   B1  crm_events learns a customer's journey (assigned, first reply, visit booked / changed / cancelled, came or not,
--       status) — recorded by triggers, so no writer changes; the past filled from what the rows already say.
--   B2  crm_remind: CRM · Manage reminds the owner to reply (a 'reminded' event — their bell, the chat's grey line).
--   B3  crm_staff_prefs.notif_deleted: each person's deleted notifications (their own only), crm_delete_notifs.
--   B4  crm_showrooms.photo_path / map_google / map_waze + the private bucket crm-showrooms; crm_save_showroom_extras.
--   B5  crm_forms (the Customer info form, the first one is the one in use) + crm_contacts.extra (answers to the form's
--       own questions) + the nine-argument crm_save_details (p_extra).
--   B6  crm_notes: a note on a customer, crm_add_note.
--   B8  History: the CRM's settings tables are readable in audit_changes() by CRM · Manage (key crm_manage).
--   B9  crm_slot_check: a closure may be times of a day ({f, t} ranges), not only the whole day.
--
-- crm_slot_check and crm_save_details are rewritten from PRODUCTION's bodies (md5 5542256434ad30ae2dc26207258e95e3,
-- 1bf0058aa0ae8ae31931facb110587ba on 2026-10-13); the permission guard crm_keeps_its_permission_checks from its own
-- (78f41bdce1ac7a74ae402d9c197bc5e2), learning the new writers.

-- ── The guard learns the new writers ───────────────────────────────────────
create or replace function public.crm_keeps_its_permission_checks()
 returns event_trigger
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  r       record;
  v_name  text;
  v_src   text;
  v_needs text;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands()
            WHERE object_type IN ('function', 'procedure') AND schema_name = 'public' LOOP
    SELECT p.proname, p.prosrc INTO v_name, v_src FROM pg_proc p WHERE p.oid = r.objid;
    v_needs := CASE
      WHEN v_name = 'crm_can' THEN 'has_action('
      WHEN v_name IN ('crm_me', 'crm_sees_all', 'crm_can_reply', 'crm_manages', 'crm_my_can',
                      'crm_invite', 'crm_assign_member', 'crm_answer_invite') THEN 'crm_can('
      WHEN v_name = 'crm_people' THEN 'crm_sees_all('
      WHEN v_name IN ('crm_save_ad_assign', 'crm_save_ad_rule', 'crm_save_fulltime', 'crm_save_team_shares',
                      'crm_send_to', 'crm_send_to_team', 'crm_give_to_hod', 'crm_set_full_time',
                      'crm_save_showroom', 'crm_save_showroom_full', 'crm_save_team_settings',
                      'crm_remind', 'crm_save_showroom_extras', 'crm_save_form', 'crm_delete_form') THEN 'crm_manages('
      WHEN v_name IN ('crm_save_details', 'crm_add_note') THEN 'crm_can_reply('
    END;
    IF v_needs IS NOT NULL AND strpos(coalesce(v_src, ''), v_needs) = 0 THEN
      RAISE EXCEPTION '% must keep its CRM permission check — it no longer calls %. Rewrite it from production''s current body, not an older copy (CLAUDE.md › THE CRM ASKS THE PERMISSION MATRIX, mig 20261010030000).',
        r.object_identity, v_needs
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END
$function$;

-- Who is acting, for a trigger: nobody (the ingest, the service role) rather than an error.
create or replace function public.crm_actor()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  return crm_me();
exception when others then
  return null;
end $$;
revoke all on function public.crm_actor() from public, anon, authenticated;
grant execute on function public.crm_actor() to service_role;

-- ── B1 · The journey ──────────────────────────────────────────────────────
alter table public.crm_events drop constraint if exists crm_events_kind_check;
alter table public.crm_events add constraint crm_events_kind_check check (kind = any (array[
  'won', 'lost', 'moved', 'shared', 'share_declined', 'move_declined',
  'assigned', 'first_reply', 'appt_booked', 'appt_changed', 'appt_cancelled', 'visit', 'status', 'reminded']));
create index if not exists crm_events_contact_at on public.crm_events (contact_id, at desc);

create or replace function public.crm_journey_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('assigned', new.id, crm_actor(), new.assigned_to,
            jsonb_build_object('to', new.assigned_to, 'from', case when tg_op = 'UPDATE' then old.assigned_to end));
  end if;
  -- Won and Lost are crm_contacts_status_event's.
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status not in ('won', 'lost') then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('status', new.id, crm_actor(), new.assigned_to, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create or replace trigger crm_contacts_journey after insert or update of assigned_to, status on public.crm_contacts
  for each row execute function public.crm_journey_contact();

create or replace function public.crm_journey_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'out' and not coalesce(new.auto, false)
     and not exists (select 1 from crm_events where contact_id = new.contact_id and kind = 'first_reply') then
    insert into crm_events (kind, contact_id, actor, owner, data, at)
    select 'first_reply', new.contact_id, new.sent_by, c.assigned_to, '{}'::jsonb, coalesce(new.sent_at, now())
      from crm_contacts c where c.id = new.contact_id;
  end if;
  return new;
end $$;
create or replace trigger crm_messages_journey after insert on public.crm_messages
  for each row execute function public.crm_journey_message();

create or replace function public.crm_journey_visit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid := (select assigned_to from crm_contacts where id = new.contact_id);
begin
  if tg_op = 'INSERT' then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('appt_booked', new.contact_id, crm_actor(), v_owner, jsonb_build_object('visit', new.id, 'showroom', new.showroom, 'start', new.start_at));
  elsif new.state is distinct from old.state and new.state = 'cancelled' then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('appt_cancelled', new.contact_id, crm_actor(), v_owner, jsonb_build_object('visit', new.id, 'showroom', new.showroom, 'start', new.start_at));
  elsif new.state is distinct from old.state and new.state in ('attended', 'no_show') then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('visit', new.contact_id, crm_actor(), v_owner, jsonb_build_object('visit', new.id, 'state', new.state, 'showroom', new.showroom, 'start', new.start_at));
  elsif new.start_at is distinct from old.start_at or new.showroom is distinct from old.showroom then
    insert into crm_events (kind, contact_id, actor, owner, data)
    values ('appt_changed', new.contact_id, crm_actor(), v_owner, jsonb_build_object('visit', new.id, 'showroom', new.showroom, 'start', new.start_at,
            'fromShowroom', old.showroom, 'fromStart', old.start_at));
  end if;
  return new;
end $$;
create or replace trigger crm_appointments_journey after insert or update of state, start_at, showroom on public.crm_appointments
  for each row execute function public.crm_journey_visit();

revoke all on function public.crm_journey_contact() from public, anon, authenticated;
revoke all on function public.crm_journey_message() from public, anon, authenticated;
revoke all on function public.crm_journey_visit() from public, anon, authenticated;

-- The past, from what the rows already say (marked, so nothing reads them as news).
insert into public.crm_events (kind, contact_id, actor, owner, data, at)
select 'assigned', c.id, c.assigned_by, c.assigned_to, jsonb_build_object('to', c.assigned_to, 'backfill', true), coalesce(c.assigned_at, c.created_at)
  from public.crm_contacts c
 where c.assigned_to is not null and not exists (select 1 from public.crm_events e where e.contact_id = c.id and e.kind = 'assigned');
insert into public.crm_events (kind, contact_id, actor, owner, data, at)
select distinct on (m.contact_id) 'first_reply', m.contact_id, m.sent_by, c.assigned_to, jsonb_build_object('backfill', true), m.sent_at
  from public.crm_messages m join public.crm_contacts c on c.id = m.contact_id
 where m.direction = 'out' and not coalesce(m.auto, false)
   and not exists (select 1 from public.crm_events e where e.contact_id = m.contact_id and e.kind = 'first_reply')
 order by m.contact_id, m.sent_at;
insert into public.crm_events (kind, contact_id, actor, owner, data, at)
select 'appt_booked', a.contact_id, null, c.assigned_to, jsonb_build_object('visit', a.id, 'showroom', a.showroom, 'start', a.start_at, 'backfill', true), coalesce(a.created_at, a.start_at)
  from public.crm_appointments a join public.crm_contacts c on c.id = a.contact_id
 where not exists (select 1 from public.crm_events e where e.contact_id = a.contact_id and e.kind = 'appt_booked' and e.data ->> 'visit' = a.id::text);

-- ── B2 · Remind the owner to reply ────────────────────────────────────────
create or replace function public.crm_remind(p_contact uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c crm_contacts; v_at timestamptz := now();
begin
  if not public.crm_manages() then perform crm_deny('send reminders'); end if;
  select * into c from crm_contacts where id = p_contact;
  if c.id is null then raise exception 'That customer is not in the CRM.' using errcode = 'P0002'; end if;
  if c.assigned_to is null then raise exception 'Nobody has this customer yet — send it to somebody first.' using errcode = '22023'; end if;
  insert into crm_events (kind, contact_id, actor, owner, data, at)
  values ('reminded', c.id, crm_me(), c.assigned_to, jsonb_build_object('to', c.assigned_to), v_at);
  return jsonb_build_object('at', v_at, 'to', c.assigned_to);
end $$;

-- ── B3 · Delete notifications (one's own) ─────────────────────────────────
alter table public.crm_staff_prefs add column if not exists notif_deleted text[] not null default '{}';

create or replace function public.crm_delete_notifs(p_keys text[], p_restore boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := crm_me();
begin
  if v_me is null then perform crm_deny('delete notifications'); end if;
  insert into crm_staff_prefs (staff_id, notif_deleted)
  values (v_me, case when coalesce(p_restore, false) then '{}' else coalesce(p_keys, '{}') end)
  on conflict (staff_id) do update set notif_deleted = case
    when coalesce(p_restore, false) then array(select k from unnest(crm_staff_prefs.notif_deleted) k where not (k = any (coalesce(p_keys, '{}'))))
    -- The last 1,000 are enough: older notifications have left the list (14 days) anyway.
    else (select array_agg(k order by o) from (select k, max(o) as o from unnest(crm_staff_prefs.notif_deleted || coalesce(p_keys, '{}')) with ordinality as t(k, o) group by k order by max(o) desc limit 1000) x) end;
end $$;

-- ── B4 · A showroom's photo and map links ─────────────────────────────────
alter table public.crm_showrooms add column if not exists photo_path text;
alter table public.crm_showrooms add column if not exists map_google text;
alter table public.crm_showrooms add column if not exists map_waze text;

create or replace function public.crm_save_showroom_extras(p_id text, p_photo_path text, p_map_google text, p_map_waze text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r crm_showrooms; g text := nullif(trim(coalesce(p_map_google, '')), ''); w text := nullif(trim(coalesce(p_map_waze, '')), '');
begin
  if not public.crm_manages() then perform crm_deny('change the showrooms'); end if;
  if (g is not null and g !~* '^https://') or (w is not null and w !~* '^https://') then
    raise exception 'A map link starts with https://.' using errcode = '22023';
  end if;
  if p_photo_path is not null and p_photo_path !~ ('^' || p_id || '/[A-Za-z0-9._-]+$') then
    raise exception 'That photo is not this showroom''s.' using errcode = '22023';
  end if;
  update crm_showrooms set photo_path = nullif(p_photo_path, ''), map_google = left(g, 500), map_waze = left(w, 500)
   where id = p_id returning * into r;
  if r.id is null then raise exception 'That showroom is not on the list.' using errcode = '22023'; end if;
  return to_jsonb(r);
end $$;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('crm-showrooms', 'crm-showrooms', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  -- Anybody in the CRM sees a showroom's photo; only CRM · Manage puts one there or takes it away.
  execute $p$drop policy if exists "crm showroom photos: read" on storage.objects$p$;
  execute $p$create policy "crm showroom photos: read" on storage.objects for select to authenticated
    using (bucket_id = 'crm-showrooms' and (select public.crm_me()) is not null)$p$;
  execute $p$drop policy if exists "crm showroom photos: in" on storage.objects$p$;
  execute $p$create policy "crm showroom photos: in" on storage.objects for insert to authenticated
    with check (bucket_id = 'crm-showrooms' and (select public.crm_manages()))$p$;
  execute $p$drop policy if exists "crm showroom photos: out" on storage.objects$p$;
  execute $p$create policy "crm showroom photos: out" on storage.objects for delete to authenticated
    using (bucket_id = 'crm-showrooms' and (select public.crm_manages()))$p$;
end $$;

-- ── B5 · Forms: Customer info's questions ─────────────────────────────────
create table if not exists public.crm_forms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  -- [{ id, title, fields: [{ id, label, type, req, locked?, ph?, opts? }] }] — the desktop's Forms editor.
  sections    jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  sort_order  integer not null default 0,
  created_by  uuid references public.hr_staff_costs(id),
  updated_by  uuid references public.hr_staff_costs(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.crm_forms enable row level security;
revoke all on public.crm_forms from public, anon, authenticated;
grant select on public.crm_forms to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_forms' and policyname = 'crm_forms_read') then
    -- Everybody in the CRM fills Customer info in, so everybody reads its questions.
    create policy crm_forms_read on public.crm_forms for select to authenticated using ((select crm_me()) is not null);
  end if;
end $$;
SELECT public.audit_register('crm_forms', 'CRM forms', 'Member services', '{revenue,crm_manage}', 'people',
  p_keys => '{id}', p_labels => '{name}');

create or replace function public.crm_save_form(p_id uuid, p_name text, p_sections jsonb)
returns public.crm_forms language plpgsql security definer set search_path = public as $$
declare f crm_forms;
begin
  if not public.crm_manages() then perform crm_deny('change the forms'); end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the form a name.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_sections, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'A form needs at least one section.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_sections) s, jsonb_array_elements(coalesce(s -> 'fields', '[]'::jsonb)) x
              where coalesce(trim(x ->> 'label'), '') = '' or coalesce(x ->> 'id', '') = ''
                 or (x ->> 'type') not in ('Text', 'Long text', 'Choice', 'Number', 'Phone', 'Date')) then
    raise exception 'Every question needs a name and a type.' using errcode = '22023';
  end if;
  if length(p_sections::text) > 50000 then raise exception 'That form is too long.' using errcode = '22023'; end if;
  if p_id is null then
    insert into crm_forms (name, sections, sort_order, created_by, updated_by)
    values (trim(p_name), p_sections, coalesce((select max(sort_order) from crm_forms), 0) + 1, crm_me(), crm_me()) returning * into f;
  else
    update crm_forms set name = trim(p_name), sections = p_sections, updated_by = crm_me(), updated_at = now()
     where id = p_id returning * into f;
    if f.id is null then raise exception 'That form is gone. Reload.' using errcode = 'P0002'; end if;
  end if;
  return f;
end $$;

create or replace function public.crm_delete_form(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.crm_manages() then perform crm_deny('delete forms'); end if;
  delete from crm_forms where id = p_id;
end $$;

-- Answers to the form's own questions (the built-in ones keep their columns).
alter table public.crm_contacts add column if not exists extra jsonb not null default '{}'::jsonb;
grant select (extra) on public.crm_contacts to authenticated;

-- crm_save_details, production's body with p_extra: the answers to the form's own questions, merged in.
create or replace function public.crm_save_details(p_contact uuid, p_name text, p_phone text, p_type text, p_size text, p_location text, p_requirement text, p_budget text, p_extra jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c crm_contacts;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('change this customer'); end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'The customer needs a name.' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_type, '')), '') is not null and trim(p_type) not in ('Condo', 'Landed') then
    raise exception 'Property type is Condo or Landed.' using errcode = '22023';
  end if;
  if p_extra is not null and (jsonb_typeof(p_extra) <> 'object' or length(p_extra::text) > 20000
      or exists (select 1 from jsonb_each(p_extra) e where jsonb_typeof(e.value) not in ('string', 'null'))) then
    raise exception 'Those answers could not be read.' using errcode = '22023';
  end if;
  update crm_contacts set
    name = left(trim(p_name), 120),
    phone = coalesce(nullif(left(trim(coalesce(p_phone, '')), 40), ''), phone),
    property_type = nullif(trim(coalesce(p_type, '')), ''),
    unit_size = nullif(left(trim(coalesce(p_size, '')), 20), ''),
    unit_location = nullif(left(trim(coalesce(p_location, '')), 200), ''),
    requirement = nullif(left(trim(coalesce(p_requirement, '')), 1000), ''),
    budget = nullif(left(trim(coalesce(p_budget, '')), 40), ''),
    extra = case when p_extra is null then extra else jsonb_strip_nulls(extra || p_extra) end,
    details_by = crm_me(), details_at = now()
   where id = p_contact returning * into c;
  return jsonb_build_object('name', c.name, 'phone', c.phone, 'property_type', c.property_type, 'unit_size', c.unit_size,
    'unit_location', c.unit_location, 'requirement', c.requirement, 'budget', c.budget, 'extra', c.extra);
end $function$;

-- ── B6 · Notes ────────────────────────────────────────────────────────────
create table if not exists public.crm_notes (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.crm_contacts(id) on delete cascade,
  body        text not null check (length(trim(body)) between 1 and 2000),
  author      uuid references public.hr_staff_costs(id),
  created_at  timestamptz not null default now()
);
create index if not exists crm_notes_contact on public.crm_notes (contact_id, created_at desc);
alter table public.crm_notes enable row level security;
revoke all on public.crm_notes from public, anon, authenticated;
grant select on public.crm_notes to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_notes' and policyname = 'crm_notes_read') then
    -- Whoever reads the customer reads its notes (as crm_events).
    create policy crm_notes_read on public.crm_notes for select to authenticated
      using (contact_id in (select crm_contacts.id from crm_contacts));
  end if;
end $$;
SELECT public.audit_register('crm_notes', 'CRM notes', 'Member services', '{}', 'none',
  p_reason => 'A note is a record already: who wrote it and when, never edited.');

create or replace function public.crm_add_note(p_contact uuid, p_body text)
returns public.crm_notes language plpgsql security definer set search_path = public as $$
declare n crm_notes;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('add a note to this customer'); end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write the note first.' using errcode = '22023'; end if;
  if length(trim(p_body)) > 2000 then raise exception 'A note can be up to 2,000 characters.' using errcode = '22023'; end if;
  insert into crm_notes (contact_id, body, author) values (p_contact, trim(p_body), crm_me()) returning * into n;
  return n;
end $$;

-- ── B8 · History: CRM · Manage reads the settings' changes ────────────────
do $$ begin
  if to_regclass('public.audit_tables') is null then return; end if; -- the PGlite checks have no audit
  update public.audit_tables set read_keys = array(select distinct k from unnest(read_keys || '{crm_manage}'::text[]) k order by k)
   where table_name in ('crm_showrooms', 'crm_ad_assign', 'crm_fulltime_rules', 'crm_staff', 'crm_templates', 'crm_settings')
     and not ('crm_manage' = any (read_keys));
end $$;

-- ── B9 · A closure for some hours of a day ────────────────────────────────
-- Production's body; the closure test now reads a block's ranges: with none it closes the day, with some only them.
create or replace function public.crm_slot_check(p_showroom text, p_start timestamp with time zone, p_except uuid default null::uuid)
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  r       crm_showrooms;
  v_local timestamp := p_start at time zone 'Asia/Kuala_Lumpur';
  v_date  text := to_char(v_local, 'YYYY-MM-DD');
  v_hhmm  text := to_char(v_local, 'HH24:MI');
  v_mon0  text := ((extract(isodow from v_local)::int + 6) % 7)::text; -- 0 = Monday
  v_taken integer;
begin
  select * into r from crm_showrooms where id = trim(p_showroom);
  if r.id is null or not r.active then raise exception 'Choose a showroom that is open.' using errcode = '22023'; end if;
  if extract(dow from v_local)::int = any (r.weekly)
     or exists (select 1 from jsonb_array_elements(r.blocks) b where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a')
                  and coalesce(jsonb_array_length(case when jsonb_typeof(b -> 'ranges') = 'array' then b -> 'ranges' end), 0) = 0) then
    raise exception '% is closed that day.', r.name using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(r.blocks) b, jsonb_array_elements(case when jsonb_typeof(b -> 'ranges') = 'array' then b -> 'ranges' else '[]'::jsonb end) g
              where v_date between b ->> 'a' and coalesce(b ->> 'b', b ->> 'a') and v_hhmm >= g ->> 'f' and v_hhmm < g ->> 't') then
    raise exception '% is closed at that time.', r.name using errcode = '22023';
  end if;
  if not exists (select 1 from unnest(r.slots) s
                  where split_part(s, '@', 1) = v_hhmm
                    and (position('@' in s) = 0 or position(v_mon0 in split_part(s, '@', 2)) > 0)) then
    raise exception '% does not take bookings at that time.', r.name using errcode = '22023';
  end if;
  select count(*) into v_taken from crm_appointments
   where showroom = r.id and start_at = p_start and state = 'booked' and id is distinct from p_except;
  if v_taken >= r.cap then raise exception 'That time is full at %. Choose another.', r.name using errcode = '22023'; end if;
end $function$;

-- ── Who may call them ─────────────────────────────────────────────────────
revoke all on function public.crm_remind(uuid) from public, anon;
revoke all on function public.crm_delete_notifs(text[], boolean) from public, anon;
revoke all on function public.crm_save_showroom_extras(text, text, text, text) from public, anon;
revoke all on function public.crm_save_form(uuid, text, jsonb) from public, anon;
revoke all on function public.crm_delete_form(uuid) from public, anon;
revoke all on function public.crm_save_details(uuid, text, text, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.crm_add_note(uuid, text) from public, anon;
grant execute on function public.crm_remind(uuid) to authenticated;
grant execute on function public.crm_delete_notifs(text[], boolean) to authenticated;
grant execute on function public.crm_save_showroom_extras(text, text, text, text) to authenticated;
grant execute on function public.crm_save_form(uuid, text, jsonb) to authenticated;
grant execute on function public.crm_delete_form(uuid) to authenticated;
grant execute on function public.crm_save_details(uuid, text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.crm_add_note(uuid, text) to authenticated;
