-- The CRM's Management apart by sub-department (2026-11-23 — the owner: "Management 这边也不是统一的，IR 是 IR，DC 是 DC，包括
-- setting 等等都要分开"; "每个 segment 分开就对了"; of Fair, an empty CRM whose own settings, forms and showrooms can be set up
-- before its number is connected). Step 2 after mig 20261124200000 (the screens follow the Revenue app's view).
--
-- What each sub-department now has of its own: Settings › General (reply targets, the template button, auto-assign, push,
-- reminders, team alerts, auto-reply), the appointment types, the showrooms, the forms (Customer info and the booking
-- link's), the cold lead templates and the booking link. A customer is the sub-department of its brand (crm_sub_of: The
-- Conts' numbers and Page IR's, Dream Crafter's DC's), and everything the database does for a customer reads that
-- sub-department's settings: the dealer's Auto-assign, the auto-reply's switch, the push of a message, the hourly
-- reminders and their reply targets, an appointment's types.
--
-- How a write names its sub-department: crm_cur_sub() — the transaction's crm.sub, set by the "…_in(p_sub, …)" functions
-- below (crm_set_sub asks CRM · Manage and that the sub-department is in the caller's CRM reach), else the CRM's own (IR,
-- crm_scope()). The functions as they were keep working, on IR's — nothing written before the app sends a sub-department
-- lands anywhere else. A new showroom, form or template takes crm_cur_sub() by its column's default.
--
-- Every sub-department starts as the CRM is today: its settings and appointment types copied from crm_settings (which is
-- kept, frozen, for crm_scope()'s sub_department_id), IR's forms copied to each other sub-department, IR's templates to
-- Dream Crafter's (one WhatsApp Business account sends from both numbers). The showrooms and the booking link stay IR's.

CREATE OR REPLACE FUNCTION pg_temp.swap_once(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_def   text := pg_get_functiondef(p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: the statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  FOR v_found IN SELECT DISTINCT m[1] FROM regexp_matches(v_src, '(' || v_pat || ')', 'g') AS m LOOP
    v_def := replace(v_def, v_found, p_new);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

-- ── 0. Which sub-department ─────────────────────────────────────────────────
create or replace function public.crm_cur_sub()
 returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  -- The sub-department this transaction's CRM writes are for: what crm_set_sub set, else the CRM's own (IR).
  return coalesce(nullif(current_setting('crm.sub', true), '')::uuid, crm_scope());
end $function$;

create or replace function public.crm_sub_of(p_account text)
 returns uuid language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  -- A customer's sub-department: its number's or Page's brand's (The Conts IR, Dream Crafter DC), else the CRM's own.
  return coalesce(crm_brand_sub(crm_brand_of(p_account)), crm_scope());
end $function$;

create or replace function public.crm_set_sub(p_sub uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not crm_manages() then perform crm_deny('change the CRM''s settings'); end if;
  if p_sub is null or not exists (select 1 from comm_sub_departments where id = p_sub and is_active) then
    raise exception 'That sub-department is not known.' using errcode = '22023';
  end if;
  if not (p_sub = any (my_sub_departments('crm'))) then perform crm_deny('change another sub-department''s CRM'); end if;
  perform set_config('crm.sub', p_sub::text, true);
end $function$;

revoke all on function public.crm_cur_sub() from public, anon, authenticated;
revoke all on function public.crm_sub_of(text) from public, anon;
revoke all on function public.crm_set_sub(uuid) from public, anon, authenticated;
grant execute on function public.crm_cur_sub() to service_role;
-- The app asks it too: which sub-department's templates a customer is sent (sendCrmTemplate) — a number's or Page's
-- sub-department, nothing more.
grant execute on function public.crm_sub_of(text) to authenticated, service_role;
grant execute on function public.crm_set_sub(uuid) to service_role;

-- ── 1. Settings › General and the appointment types, each sub-department's ──
create table if not exists public.crm_sub_settings (
  sub_department_id uuid primary key references public.comm_sub_departments(id) on delete cascade,
  reply_soon_h integer not null default 3,
  reply_urgent_h integer not null default 6,
  reply_overdue_h integer not null default 9,
  suggest_template boolean not null default true,
  auto_assign boolean not null default true,
  push_messages boolean not null default true,
  reminders boolean not null default true,
  team_alerts boolean not null default false,
  send_auto_reply boolean not null default true,
  ft_even boolean not null default false,
  appt_types jsonb,
  updated_by uuid references public.hr_staff_costs(id),
  updated_at timestamptz not null default now(),
  constraint crm_sub_settings_reply_lines check (reply_soon_h between 1 and 23 and reply_urgent_h > reply_soon_h
    and reply_overdue_h > reply_urgent_h and reply_overdue_h <= 24)
);
-- RLS on and no policy: read through crm_settings_read() and written through crm_save_settings / crm_save_appt_types.
alter table public.crm_sub_settings enable row level security;
revoke all on public.crm_sub_settings from anon, authenticated;

insert into public.crm_sub_settings (sub_department_id, reply_soon_h, reply_urgent_h, reply_overdue_h, suggest_template, auto_assign,
  push_messages, reminders, team_alerts, send_auto_reply, ft_even, appt_types, updated_by, updated_at)
select sd.id, coalesce(s.reply_soon_h, 3), coalesce(s.reply_urgent_h, 6), coalesce(s.reply_overdue_h, 9), coalesce(s.suggest_template, true),
       coalesce(s.auto_assign, true), coalesce(s.push_messages, true), coalesce(s.reminders, true), coalesce(s.team_alerts, false),
       coalesce(s.send_auto_reply, true), coalesce(s.ft_even, false), s.appt_types, s.updated_by, now()
  from public.comm_sub_departments sd
  left join public.crm_settings s on s.id
 where sd.is_active
on conflict (sub_department_id) do nothing;

SELECT public.audit_register('crm_sub_settings', 'CRM settings by sub-department', 'Member services', '{crm_manage,revenue}', 'people',
  p_keys => '{sub_department_id}', p_reason => 'Settings › General and the appointment types, one set a sub-department (2026-11-23).');

create or replace function public.crm_settings_of_sub(p_sub uuid)
 returns public.crm_sub_settings language plpgsql stable security definer set search_path to 'public'
as $function$
declare r crm_sub_settings;
begin
  -- A sub-department's settings, else the CRM's own (IR's) — a sub-department made after this has none until it is saved.
  select * into r from crm_sub_settings where sub_department_id = coalesce(p_sub, crm_scope());
  if r.sub_department_id is null then select * into r from crm_sub_settings where sub_department_id = crm_scope(); end if;
  return r;
end $function$;

create or replace function public.crm_settings_of(p_account text)
 returns public.crm_sub_settings language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  -- A customer's settings: those of its number's or Page's sub-department.
  return crm_settings_of_sub(crm_sub_of(p_account));
end $function$;

create or replace function public.crm_sub_settings_json()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  return coalesce((select jsonb_object_agg(s.sub_department_id::text, jsonb_build_object(
      'replySoonH', s.reply_soon_h, 'replyUrgentH', s.reply_urgent_h, 'replyOverdueH', s.reply_overdue_h,
      'suggestTemplate', s.suggest_template, 'autoAssign', s.auto_assign, 'pushMessages', s.push_messages, 'reminders', s.reminders,
      'teamAlerts', s.team_alerts, 'sendAutoReply', s.send_auto_reply, 'ftEven', s.ft_even, 'apptTypes', s.appt_types))
    from crm_sub_settings s), '{}'::jsonb);
end $function$;

create or replace function public.crm_sub_settings_ensure(p_sub uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare f crm_sub_settings := crm_settings_of_sub(crm_scope());
begin
  -- A sub-department's own row, made the first time it is written as a copy of the CRM's own (IR's) — so saving one part
  -- (the reply lines, the appointment types) leaves the rest as it read before.
  insert into crm_sub_settings (sub_department_id, reply_soon_h, reply_urgent_h, reply_overdue_h, suggest_template, auto_assign,
    push_messages, reminders, team_alerts, send_auto_reply, ft_even, appt_types, updated_by, updated_at)
  values (p_sub, coalesce(f.reply_soon_h, 3), coalesce(f.reply_urgent_h, 6), coalesce(f.reply_overdue_h, 9), coalesce(f.suggest_template, true),
    coalesce(f.auto_assign, true), coalesce(f.push_messages, true), coalesce(f.reminders, true), coalesce(f.team_alerts, false),
    coalesce(f.send_auto_reply, true), coalesce(f.ft_even, false), f.appt_types, crm_me(), now())
  on conflict (sub_department_id) do nothing;
end $function$;

revoke all on function public.crm_settings_of_sub(uuid) from public, anon, authenticated;
revoke all on function public.crm_settings_of(text) from public, anon, authenticated;
revoke all on function public.crm_sub_settings_json() from public, anon, authenticated;
revoke all on function public.crm_sub_settings_ensure(uuid) from public, anon, authenticated;
grant execute on function public.crm_settings_of_sub(uuid) to service_role;
grant execute on function public.crm_settings_of(text) to service_role;
grant execute on function public.crm_sub_settings_json() to service_role;
grant execute on function public.crm_sub_settings_ensure(uuid) to service_role;

-- Read: the current sub-department's (IR's unless a write set another), and every sub-department's, by id.
SELECT pg_temp.swap_once('public.crm_settings_read()', $q$declare s crm_settings;$q$, $q$declare s crm_sub_settings;$q$);
SELECT pg_temp.swap_once('public.crm_settings_read()', $q$select * into s from crm_settings where id;$q$,
  $q$s := public.crm_settings_of_sub(public.crm_cur_sub());$q$);
SELECT pg_temp.swap_once('public.crm_settings_read()', $q$'ftEven', coalesce(s.ft_even, false));$q$,
  $q$'ftEven', coalesce(s.ft_even, false), 'scope', crm_scope(), 'bySub', public.crm_sub_settings_json());$q$);

-- Write: the current sub-department's row (crm_settings stays as it was).
SELECT pg_temp.swap_once('public.crm_save_settings(integer, integer, integer, boolean, boolean, boolean, boolean, boolean, boolean)',
  $q$insert into crm_settings (id, reply_soon_h, reply_urgent_h, reply_overdue_h, suggest_template, auto_assign, push_messages, reminders, team_alerts, send_auto_reply, updated_by, updated_at)
  values (true, p_soon, p_urgent, p_overdue, p_suggest, p_auto, p_push, p_reminders, p_team_alerts, p_send_auto, crm_me(), now())
  on conflict (id) do update set reply_soon_h = excluded.reply_soon_h, reply_urgent_h = excluded.reply_urgent_h,
    reply_overdue_h = excluded.reply_overdue_h, suggest_template = excluded.suggest_template, auto_assign = excluded.auto_assign,
    push_messages = excluded.push_messages, reminders = excluded.reminders, team_alerts = excluded.team_alerts, send_auto_reply = excluded.send_auto_reply,
    updated_by = excluded.updated_by, updated_at = now();$q$,
  $q$-- The sub-department's own (2026-11-23, mig 20261124210000): crm_cur_sub(), IR's unless crm_save_settings_in named another.
  perform public.crm_sub_settings_ensure(public.crm_cur_sub());
  update crm_sub_settings set reply_soon_h = p_soon, reply_urgent_h = p_urgent, reply_overdue_h = p_overdue, suggest_template = p_suggest,
    auto_assign = p_auto, push_messages = p_push, reminders = p_reminders, team_alerts = p_team_alerts, send_auto_reply = p_send_auto,
    updated_by = crm_me(), updated_at = now()
   where sub_department_id = public.crm_cur_sub();$q$);
SELECT pg_temp.swap_once('public.crm_save_settings(integer, integer, integer, boolean, boolean, boolean, boolean)',
  $q$insert into crm_settings (id, reply_soon_h, reply_urgent_h, reply_overdue_h, suggest_template, auto_assign, push_messages, reminders, updated_by, updated_at)
  values (true, p_soon, p_urgent, p_overdue, p_suggest, p_auto, p_push, p_reminders, crm_me(), now())
  on conflict (id) do update set reply_soon_h = excluded.reply_soon_h, reply_urgent_h = excluded.reply_urgent_h,
    reply_overdue_h = excluded.reply_overdue_h, suggest_template = excluded.suggest_template, auto_assign = excluded.auto_assign,
    push_messages = excluded.push_messages, reminders = excluded.reminders,
    updated_by = excluded.updated_by, updated_at = now();$q$,
  $q$-- The sub-department's own (2026-11-23, mig 20261124210000).
  perform public.crm_sub_settings_ensure(public.crm_cur_sub());
  update crm_sub_settings set reply_soon_h = p_soon, reply_urgent_h = p_urgent, reply_overdue_h = p_overdue, suggest_template = p_suggest,
    auto_assign = p_auto, push_messages = p_push, reminders = p_reminders, updated_by = crm_me(), updated_at = now()
   where sub_department_id = public.crm_cur_sub();$q$);
SELECT pg_temp.swap_once('public.crm_save_appt_types(jsonb)',
  $q$update crm_settings set appt_types = p_types, updated_by = crm_me(), updated_at = now() where id = true;$q$,
  $q$perform public.crm_sub_settings_ensure(public.crm_cur_sub());
  update crm_sub_settings set appt_types = p_types, updated_by = crm_me(), updated_at = now() where sub_department_id = public.crm_cur_sub();$q$);
SELECT pg_temp.swap_once('public.crm_set_ft_even(boolean)',
  $q$update crm_settings set ft_even = coalesce(p_on, false), updated_by = crm_me(), updated_at = now() where id = true;$q$,
  $q$perform public.crm_sub_settings_ensure(public.crm_cur_sub());
  update crm_sub_settings set ft_even = coalesce(p_on, false), updated_by = crm_me(), updated_at = now() where sub_department_id = public.crm_cur_sub();$q$);

-- The appointment types in force: the current sub-department's — a booking sets it from its customer (below).
SELECT pg_temp.swap_once('public.crm_appt_types_in_force()',
  $q$(select appt_types from crm_settings where id = true)$q$,
  $q$(public.crm_settings_of_sub(public.crm_cur_sub())).appt_types$q$);
SELECT pg_temp.swap_once('public.crm_book_typed(uuid, text, timestamp with time zone, jsonb, integer)',
  $q$select * into v from crm_appt_values(p_type, p_start, coalesce(p_answers, '{}'::jsonb));$q$,
  $q$perform set_config('crm.sub', coalesce(public.crm_sub_of((select c.account_id from crm_contacts c where c.id = p_contact))::text, ''), true);
  select * into v from crm_appt_values(p_type, p_start, coalesce(p_answers, '{}'::jsonb));$q$);
SELECT pg_temp.swap_once('public.crm_move_typed(uuid, text, timestamp with time zone, jsonb)',
  $q$select * into v from crm_appt_values(p_type, p_start, coalesce(p_answers, '{}'::jsonb));$q$,
  $q$perform set_config('crm.sub', coalesce(public.crm_sub_of((select c.account_id from crm_contacts c where c.id = a.contact_id))::text, ''), true);
  select * into v from crm_appt_values(p_type, p_start, coalesce(p_answers, '{}'::jsonb));$q$);

-- What the database does for a customer follows the customer's sub-department.
SELECT pg_temp.swap_once('public.crm_assign_contact(uuid)',
  $q$if not coalesce((select s.auto_assign from crm_settings s where s.id), true) then$q$,
  $q$if not coalesce((public.crm_settings_of(c.account_id)).auto_assign, true) then$q$);
SELECT pg_temp.swap_once('public.crm_auto_reply_due(text, text[])',
  $q$and coalesce((select s.send_auto_reply from crm_settings s where s.id), true)$q$,
  $q$and coalesce((public.crm_settings_of(c.account_id)).send_auto_reply, true)$q$);
SELECT pg_temp.swap_once('public.notify_crm_message()',
  $q$IF NOT coalesce((SELECT s.push_messages FROM public.crm_settings s WHERE s.id), true) THEN$q$,
  $q$IF NOT coalesce((public.crm_settings_of(c.account_id)).push_messages, true) THEN$q$);
-- The hourly sweep: each customer's sub-department's Reminders and reply targets.
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$IF NOT coalesce((SELECT s.reminders FROM public.crm_settings s WHERE s.id), true) THEN RETURN 0; END IF;$q$,
  $q$-- Reminders off is each sub-department's own (2026-11-23): asked of every customer below (crm_settings_of).$q$);
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$AND (a.start_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = v_local::date + 1$q$,
  $q$AND (a.start_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date = v_local::date + 1
         AND coalesce((public.crm_settings_of(c.account_id)).reminders, true)$q$);
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$SELECT c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to, m.id AS msg_id, m.kind, m.body,$q$,
  $q$SELECT c.id AS contact_id, c.name, c.phone, c.channel, c.assigned_to, m.id AS msg_id, m.kind, m.body,
           st.reply_soon_h AS s1, st.reply_urgent_h AS s2, st.reply_overdue_h AS s3,$q$);
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$ORDER BY coalesce(x.sent_at, x.created_at) DESC
         LIMIT 1) m$q$,
  $q$ORDER BY coalesce(x.sent_at, x.created_at) DESC
         LIMIT 1) m
      CROSS JOIN LATERAL public.crm_settings_of(c.account_id) st$q$);
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$WHERE c.assigned_to IS NOT NULL AND c.status NOT IN ('won', 'lost') AND m.direction = 'in'
       AND coalesce(m.sent_at, m.created_at) <= v_now - make_interval(hours => v_s1)$q$,
  $q$WHERE c.assigned_to IS NOT NULL AND c.status NOT IN ('won', 'lost') AND m.direction = 'in' AND coalesce(st.reminders, true)
       AND coalesce(m.sent_at, m.created_at) <= v_now - make_interval(hours => coalesce(st.reply_soon_h, 3))$q$);
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$v_h := CASE WHEN r.at <= v_now - make_interval(hours => v_s3)$q$,
  $q$v_s1 := coalesce(r.s1, 3); v_s2 := coalesce(r.s2, 6); v_s3 := coalesce(r.s3, 9);
    v_h := CASE WHEN r.at <= v_now - make_interval(hours => v_s3)$q$);
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$AND a.start_at > v_now AND a.start_at <= v_now + interval '2 hours'$q$,
  $q$AND a.start_at > v_now AND a.start_at <= v_now + interval '2 hours'
       AND coalesce((public.crm_settings_of(c.account_id)).reminders, true)$q$);
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$AND a.start_at <= v_now - interval '1 hour' AND a.start_at > v_now - interval '3 days'$q$,
  $q$AND a.start_at <= v_now - interval '1 hour' AND a.start_at > v_now - interval '3 days'
       AND coalesce((public.crm_settings_of(c.account_id)).reminders, true)$q$);
SELECT pg_temp.swap_once('public.notify_crm_due()',
  $q$AND c.channel <> 'messenger' AND c.last_customer_at <= v_now - interval '21 hours' AND c.last_customer_at > v_now - interval '24 hours'$q$,
  $q$AND c.channel <> 'messenger' AND c.last_customer_at <= v_now - interval '21 hours' AND c.last_customer_at > v_now - interval '24 hours'
       AND coalesce((public.crm_settings_of(c.account_id)).reminders, true)$q$);

-- ── 2. Showrooms, forms, templates and the booking link carry their sub-department ──
alter table public.crm_showrooms add column if not exists sub_department_id uuid references public.comm_sub_departments(id);
alter table public.crm_forms add column if not exists sub_department_id uuid references public.comm_sub_departments(id);
alter table public.crm_templates add column if not exists sub_department_id uuid references public.comm_sub_departments(id);
alter table public.crm_partner_links add column if not exists sub_department_id uuid references public.comm_sub_departments(id);
update public.crm_showrooms set sub_department_id = public.crm_scope() where sub_department_id is null;
update public.crm_forms set sub_department_id = public.crm_scope() where sub_department_id is null;
update public.crm_templates set sub_department_id = public.crm_scope() where sub_department_id is null;
update public.crm_partner_links set sub_department_id = public.crm_scope() where sub_department_id is null;
alter table public.crm_showrooms alter column sub_department_id set default public.crm_cur_sub();
alter table public.crm_forms alter column sub_department_id set default public.crm_cur_sub();
alter table public.crm_templates alter column sub_department_id set default public.crm_cur_sub();
alter table public.crm_partner_links alter column sub_department_id set default public.crm_cur_sub();

-- A Meta template may be on more than one sub-department's list (one WhatsApp Business account sends from every number): its
-- name is unique within a sub-department. Meta's review answers reach every copy (crm_template_statuses and the webhook's hook
-- update by name).
drop index if exists public.crm_templates_meta_name;
create unique index crm_templates_meta_name on public.crm_templates (sub_department_id, meta_name) nulls not distinct where meta_name is not null;
-- A showroom's name is one sub-department's (DC may list a show unit IR lists too), as the save's own check below.
drop index if exists public.crm_showrooms_name_key;
create unique index crm_showrooms_name_key on public.crm_showrooms (sub_department_id, lower(trim(name))) nulls not distinct;

-- Every other sub-department starts with IR's forms; Dream Crafter keeps the templates it can send today.
insert into public.crm_forms (name, kind, sections, sort_order, created_by, updated_by, sub_department_id)
select f.name, f.kind, f.sections, f.sort_order, f.created_by, f.updated_by, sd.id
  from public.crm_forms f
  cross join public.comm_sub_departments sd
 where f.sub_department_id = public.crm_scope() and sd.is_active and sd.id <> public.crm_scope()
   and not exists (select 1 from public.crm_forms g where g.sub_department_id = sd.id);
-- A template's picture / video / PDF is kept under its own id (crm_template_header): a copy starts with none — and Off, if
-- its original had one (today none has).
insert into public.crm_templates (name, channel, body, status, is_on, meta_name, meta_id, language, category, reject_reason,
  created_by, updated_by, source, parts, header_path, header_mime, header_name, sub_department_id)
select t.name, t.channel, t.body, t.status, t.is_on and t.header_path is null, t.meta_name, t.meta_id, t.language, t.category, t.reject_reason,
       t.created_by, t.updated_by, t.source, t.parts, null, null, null, sd.id
  from public.crm_templates t
  cross join public.comm_sub_departments sd
 where t.sub_department_id = public.crm_scope() and sd.is_active and sd.id = public.crm_brand_sub('dc')
   and not exists (select 1 from public.crm_templates u where u.sub_department_id = sd.id);

-- Forms: a kind's "in use" (the first by sort order) is its sub-department's.
create or replace function public.crm_booking_form_of(p_sub uuid)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select sections from crm_forms
   where kind = 'booking' and coalesce(sub_department_id, crm_scope()) = coalesce(p_sub, crm_scope())
   order by sort_order, created_at limit 1
$function$;
revoke all on function public.crm_booking_form_of(uuid) from public, anon, authenticated;
grant execute on function public.crm_booking_form_of(uuid) to service_role;
SELECT pg_temp.swap_once('public.crm_booking_form()',
  $q$select sections from crm_forms where kind = 'booking' order by sort_order, created_at limit 1$q$,
  $q$select public.crm_booking_form_of(public.crm_cur_sub())$q$);
SELECT pg_temp.swap_once('public.crm_save_form(uuid, text, jsonb, text)',
  $q$coalesce((select max(sort_order) from crm_forms where kind = v_kind), 0) + 1$q$,
  $q$coalesce((select max(sort_order) from crm_forms where kind = v_kind and coalesce(sub_department_id, crm_scope()) = public.crm_cur_sub()), 0) + 1$q$);
SELECT pg_temp.swap_once('public.crm_set_active_form(uuid)',
  $q$coalesce((select min(sort_order) from crm_forms where kind = v_kind), 0) - 1$q$,
  $q$coalesce((select min(sort_order) from crm_forms where kind = v_kind
      and coalesce(sub_department_id, crm_scope()) = (select coalesce(f.sub_department_id, crm_scope()) from crm_forms f where f.id = p_id)), 0) - 1$q$);
SELECT pg_temp.swap_once('public.crm_delete_form(uuid)',
  $q$(select id from crm_forms where kind = v_kind order by sort_order, created_at limit 1)$q$,
  $q$(select id from crm_forms where kind = v_kind
      and coalesce(sub_department_id, crm_scope()) = (select coalesce(f.sub_department_id, crm_scope()) from crm_forms f where f.id = p_id)
      order by sort_order, created_at limit 1)$q$);

-- Showrooms: a name is one sub-department's (Dream Crafter may list a show unit The Conts lists too); a new showroom's
-- unsaved draft is its sub-department's — 'new' IR's as before, 'new:<sub-department>' another's.
SELECT pg_temp.swap_once('public.crm_save_showroom_full(text, text, text, text[], integer, integer[], jsonb, boolean)',
  $q$if exists (select 1 from crm_showrooms where lower(trim(name)) = lower(trim(p_name)) and id is distinct from p_id and active) then$q$,
  $q$if exists (select 1 from crm_showrooms where lower(trim(name)) = lower(trim(p_name)) and id is distinct from p_id and active
       and coalesce(sub_department_id, crm_scope()) = coalesce((select x.sub_department_id from crm_showrooms x where x.id = p_id), public.crm_cur_sub())) then$q$);
SELECT pg_temp.swap_once('public.crm_save_showroom_draft(text, jsonb)',
  $q$if p_room is null or (p_room <> 'new' and not exists (select 1 from crm_showrooms where id = p_room and deleted_at is null)) then$q$,
  $q$if p_room is null or (p_room <> 'new' and p_room !~ '^new:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (select 1 from crm_showrooms where id = p_room and deleted_at is null)) then$q$);

-- Templates: one imported from Meta is the sub-department's own (another sub-department may hold the same Meta template).
SELECT pg_temp.swap_once('public.crm_import_templates(jsonb)',
  $q$select * into t from crm_templates where meta_name = r ->> 'name';$q$,
  $q$select * into t from crm_templates where meta_name = r ->> 'name' and coalesce(sub_department_id, crm_scope()) = public.crm_cur_sub();$q$);

-- The booking link: its own sub-department's showrooms and booking form; a showroom of another refused.
SELECT pg_temp.swap_once('public.crm_partner_links_read()',
  $q$jsonb_build_object('id', id, 'name', name, 'code', code, 'on', is_on)$q$,
  $q$jsonb_build_object('id', id, 'name', name, 'code', code, 'on', is_on, 'sub', coalesce(sub_department_id, crm_scope()))$q$);
SELECT pg_temp.swap_once('public.crm_partner_page(text)',
  $q$from crm_showrooms r where r.active and r.deleted_at is null), '[]'::jsonb),$q$,
  $q$from crm_showrooms r where r.active and r.deleted_at is null
        and coalesce(r.sub_department_id, crm_scope()) = coalesce(p.sub_department_id, crm_scope())), '[]'::jsonb),$q$);
SELECT pg_temp.swap_once('public.crm_partner_page(text)',
  $q$'form', crm_booking_form());$q$,
  $q$'form', public.crm_booking_form_of(coalesce(p.sub_department_id, crm_scope())));$q$);
SELECT pg_temp.swap_once('public.crm_partner_book(text, text, text, timestamp with time zone, text, text, text, text, jsonb, text, text)',
  $q$v_form jsonb := crm_booking_form();$q$,
  $q$v_form jsonb := public.crm_booking_form_of(coalesce(p.sub_department_id, crm_scope()));$q$);
SELECT pg_temp.swap_once('public.crm_partner_book(text, text, text, timestamp with time zone, text, text, text, text, jsonb, text, text)',
  $q$if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;$q$,
  $q$if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;
  if not exists (select 1 from crm_showrooms r where r.id = trim(coalesce(p_showroom, ''))
                    and coalesce(r.sub_department_id, crm_scope()) = coalesce(p.sub_department_id, crm_scope())) then
    raise exception 'That showroom is not on this link.' using errcode = '22023';
  end if;$q$);

-- ── 3. The app's writes, for a sub-department ──────────────────────────────
create or replace function public.crm_save_settings_in(p_sub uuid, p_soon integer, p_urgent integer, p_overdue integer, p_suggest boolean,
  p_auto boolean, p_push boolean, p_reminders boolean, p_team_alerts boolean, p_send_auto boolean)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform crm_set_sub(p_sub);
  return crm_save_settings(p_soon, p_urgent, p_overdue, p_suggest, p_auto, p_push, p_reminders, p_team_alerts, p_send_auto);
end $function$;

create or replace function public.crm_save_appt_types_in(p_sub uuid, p_types jsonb)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform crm_set_sub(p_sub);
  perform crm_save_appt_types(p_types);
end $function$;

create or replace function public.crm_save_showroom_full_in(p_sub uuid, p_id text, p_name text, p_address text, p_slots text[], p_cap integer,
  p_weekly integer[], p_blocks jsonb, p_active boolean)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform crm_set_sub(p_sub);
  -- A showroom stays where it was made: one of another sub-department is not changed from here.
  if p_id is not null and not exists (select 1 from crm_showrooms where id = p_id and coalesce(sub_department_id, crm_scope()) = p_sub) then
    raise exception 'That showroom is not on this list.' using errcode = '22023';
  end if;
  return crm_save_showroom_full(p_id, p_name, p_address, p_slots, p_cap, p_weekly, p_blocks, p_active);
end $function$;

create or replace function public.crm_save_form_in(p_sub uuid, p_id uuid, p_name text, p_sections jsonb, p_kind text)
 returns public.crm_forms language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform crm_set_sub(p_sub);
  if p_id is not null and not exists (select 1 from crm_forms where id = p_id and coalesce(sub_department_id, crm_scope()) = p_sub) then
    raise exception 'That form is not on this list.' using errcode = '22023';
  end if;
  return crm_save_form(p_id, p_name, p_sections, p_kind);
end $function$;

create or replace function public.crm_save_template_in(p_sub uuid, p_id uuid, p_name text, p_channel text, p_body text, p_language text, p_category text)
 returns public.crm_templates language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform crm_set_sub(p_sub);
  if p_id is not null and not exists (select 1 from crm_templates where id = p_id and coalesce(sub_department_id, crm_scope()) = p_sub) then
    raise exception 'That template is not on this list.' using errcode = '22023';
  end if;
  return crm_save_template(p_id, p_name, p_channel, p_body, p_language, p_category);
end $function$;

create or replace function public.crm_import_templates_in(p_sub uuid, p_rows jsonb)
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
begin
  perform crm_set_sub(p_sub);
  return crm_import_templates(p_rows);
end $function$;

revoke all on function public.crm_save_settings_in(uuid, integer, integer, integer, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.crm_save_appt_types_in(uuid, jsonb) from public, anon;
revoke all on function public.crm_save_showroom_full_in(uuid, text, text, text, text[], integer, integer[], jsonb, boolean) from public, anon;
revoke all on function public.crm_save_form_in(uuid, uuid, text, jsonb, text) from public, anon;
revoke all on function public.crm_save_template_in(uuid, uuid, text, text, text, text, text) from public, anon;
revoke all on function public.crm_import_templates_in(uuid, jsonb) from public, anon;
grant execute on function public.crm_save_settings_in(uuid, integer, integer, integer, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated, service_role;
grant execute on function public.crm_save_appt_types_in(uuid, jsonb) to authenticated, service_role;
grant execute on function public.crm_save_showroom_full_in(uuid, text, text, text, text[], integer, integer[], jsonb, boolean) to authenticated, service_role;
grant execute on function public.crm_save_form_in(uuid, uuid, text, jsonb, text) to authenticated, service_role;
grant execute on function public.crm_save_template_in(uuid, uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.crm_import_templates_in(uuid, jsonb) to authenticated, service_role;
