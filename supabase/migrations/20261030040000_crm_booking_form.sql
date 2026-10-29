-- The booking link's form is a form of its own (the owner, 2026-10-29: "这里是2个form, 一个是给crm customer info, 一个是
-- internal sales booking form … 我要随时可以加form 和对已有的form 做调整 … 我从这边调整，使用者的画面也会更新").
-- crm_forms gains kind: 'customer' (Customer info, as before) or 'booking' (what /b/<code> asks). Each kind keeps its own
-- forms and its own one in use (the first by sort_order, as 20261024160000 made it for Customer info). The booking page reads
-- the booking form in use; crm_partner_book keeps the answers to its own questions in crm_partner_bookings.info (the six
-- questions the page asked until now are the default form's, under the same keys, so older bookings read as before).
-- Functions rewritten from production's bodies (md5: save_form 495571bc…, set_active 8db9f116…, delete d0fd7ea9…,
-- partner_page cb1c698b…, partner_book 72d22787…).

alter table public.crm_forms add column if not exists kind text not null default 'customer';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_forms_kind_check') then
    alter table public.crm_forms add constraint crm_forms_kind_check check (kind in ('customer', 'booking'));
  end if;
end $$;
grant select (kind) on public.crm_forms to authenticated;

-- The default booking form: the page's questions as they were.
insert into public.crm_forms (name, kind, sort_order, sections)
select 'Booking form', 'booking', 0, $j$[
  {"id": "you", "title": "You", "page": 0, "pageTitle": "Page 1", "fields": [
    {"id": "booker", "label": "Your name", "type": "Text", "req": 1, "locked": 1},
    {"id": "bookerPhone", "label": "Your phone", "type": "Phone", "req": 0}]},
  {"id": "customer", "title": "Customer", "page": 0, "pageTitle": "Page 1", "fields": [
    {"id": "customer", "label": "Customer name", "type": "Text", "req": 1, "locked": 1},
    {"id": "customerPhone", "label": "Customer phone", "type": "Phone", "req": 1, "locked": 1},
    {"id": "project", "label": "Project / unit location", "type": "Text", "req": 0},
    {"id": "unit", "label": "Unit no.", "type": "Text", "req": 0},
    {"id": "type", "label": "Property type", "type": "Text", "req": 0},
    {"id": "size", "label": "Unit size", "type": "Text", "req": 0},
    {"id": "pax", "label": "No. of people coming", "type": "Number", "req": 0},
    {"id": "budget", "label": "Budget", "type": "Text", "req": 0}]},
  {"id": "notes", "title": "Notes", "page": 0, "pageTitle": "Page 1", "fields": [
    {"id": "remarks", "label": "Remarks for the showroom", "type": "Long text", "req": 0},
    {"id": "note", "label": "Your own note", "type": "Long text", "req": 0}]}
]$j$::jsonb
where not exists (select 1 from public.crm_forms where kind = 'booking');

-- Saving a form names its kind on a new one; a booking form keeps the three answers a booking cannot do without.
create or replace function public.crm_save_form(p_id uuid, p_name text, p_sections jsonb, p_kind text)
 returns crm_forms language plpgsql security definer set search_path to 'public'
as $function$
declare f crm_forms; v_kind text := coalesce(nullif(trim(p_kind), ''), 'customer');
begin
  if not public.crm_manages() then perform crm_deny('change the forms'); end if;
  if v_kind not in ('customer', 'booking') then raise exception 'That kind of form is not known.' using errcode = '22023'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the form a name.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_sections, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_sections) = 0 then
    raise exception 'A form needs at least one section.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_sections) s, jsonb_array_elements(coalesce(s -> 'fields', '[]'::jsonb)) x
              where coalesce(trim(x ->> 'label'), '') = '' or coalesce(x ->> 'id', '') = ''
                 or (x ->> 'type') not in ('Text', 'Long text', 'Choice', 'Number', 'Phone', 'Date', 'Range')) then
    raise exception 'Every question needs a name and a type.' using errcode = '22023';
  end if;
  if length(p_sections::text) > 50000 then raise exception 'That form is too long.' using errcode = '22023'; end if;
  if p_id is not null then select kind into v_kind from crm_forms where id = p_id; v_kind := coalesce(v_kind, 'customer'); end if;
  if v_kind = 'booking' and (select count(distinct x ->> 'id') from jsonb_array_elements(p_sections) s, jsonb_array_elements(coalesce(s -> 'fields', '[]'::jsonb)) x
                              where x ->> 'id' in ('booker', 'customer', 'customerPhone')) < 3 then
    raise exception 'A booking form keeps Your name, Customer name and Customer phone.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into crm_forms (name, kind, sections, sort_order, created_by, updated_by)
    values (trim(p_name), v_kind, p_sections, coalesce((select max(sort_order) from crm_forms where kind = v_kind), 0) + 1, crm_me(), crm_me()) returning * into f;
  else
    update crm_forms set name = trim(p_name), sections = p_sections, updated_by = crm_me(), updated_at = now()
     where id = p_id returning * into f;
    if f.id is null then raise exception 'That form is gone. Reload.' using errcode = 'P0002'; end if;
  end if;
  return f;
end $function$;
revoke all on function public.crm_save_form(uuid, text, jsonb, text) from public, anon;
grant execute on function public.crm_save_form(uuid, text, jsonb, text) to authenticated;

-- The three-argument save (pages opened before the release) saves a Customer info form.
create or replace function public.crm_save_form(p_id uuid, p_name text, p_sections jsonb)
 returns crm_forms language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.crm_manages() then perform crm_deny('change the forms'); end if;
  return public.crm_save_form(p_id, p_name, p_sections, 'customer');
end $function$;

create or replace function public.crm_set_active_form(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_kind text;
begin
  if not public.crm_manages() then perform crm_deny('change the forms'); end if;
  select kind into v_kind from crm_forms where id = p_id;
  if v_kind is null then raise exception 'That form is gone. Reload.' using errcode = 'P0002'; end if;
  update crm_forms set sort_order = coalesce((select min(sort_order) from crm_forms where kind = v_kind), 0) - 1, updated_by = crm_me(), updated_at = now() where id = p_id;
end $function$;

create or replace function public.crm_delete_form(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_kind text;
begin
  if not public.crm_manages() then perform crm_deny('delete forms'); end if;
  select kind into v_kind from crm_forms where id = p_id;
  if p_id = (select id from crm_forms where kind = v_kind order by sort_order, created_at limit 1) then
    raise exception 'Set another form as active first.' using errcode = '22023';
  end if;
  delete from crm_forms where id = p_id;
end $function$;

-- The booking form in use (none: the page asks its built-in questions). Only other DEFINER functions call it.
create or replace function public.crm_booking_form()
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select sections from crm_forms where kind = 'booking' order by sort_order, created_at limit 1
$function$;
revoke all on function public.crm_booking_form() from public, anon, authenticated;
grant execute on function public.crm_booking_form() to service_role;

create or replace function public.crm_partner_page(p_code text)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare p crm_partner_links := crm_partner_of(p_code);
begin
  if p.id is null then return jsonb_build_object('on', false); end if;
  return jsonb_build_object('on', true, 'name', p.name, 'today', to_char((now() at time zone 'Asia/Kuala_Lumpur')::date, 'YYYY-MM-DD'),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'address', coalesce(r.address, ''), 'slots', to_jsonb(r.slots),
        'cap', r.cap, 'weekly', to_jsonb(r.weekly), 'blocks', coalesce(r.blocks, '[]'::jsonb)) order by r.sort_order)
      from crm_showrooms r where r.active and r.deleted_at is null), '[]'::jsonb),
    'form', crm_booking_form());
end $function$;

create or replace function public.crm_partner_book(p_code text, p_ref text, p_showroom text, p_start timestamp with time zone, p_booker text, p_booker_phone text, p_customer text, p_customer_phone text, p_info jsonb, p_remarks text, p_note text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare p crm_partner_links := crm_partner_of(p_code); b crm_partner_bookings; v_ref text; v_info jsonb := '{}'::jsonb; k text; v_same boolean := false;
  v_form jsonb := crm_booking_form(); x jsonb; v text;
begin
  if p.id is null then raise exception 'This link is closed.' using errcode = '42501'; end if;
  if (select count(*) from crm_partner_bookings where updated_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many bookings through the link just now. Try again later.';
  end if;
  if length(btrim(coalesce(p_booker, ''))) not between 1 and 80 then raise exception 'Type your name.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_customer, ''))) not between 1 and 80 then raise exception 'Type the customer''s name.' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_customer_phone, ''))) not between 6 and 30 or btrim(p_customer_phone) !~ '^[0-9 +()-]+$' then
    raise exception 'Type the customer''s phone number.' using errcode = '22023';
  end if;
  if length(coalesce(p_booker_phone, '')) > 30 or length(coalesce(p_remarks, '')) > 1000 or length(coalesce(p_note, '')) > 1000 then
    raise exception 'A field is too long.' using errcode = '22023';
  end if;
  -- The customer's info: the booking form's own questions (the built-in six when there is no booking form), up to 120
  -- characters, a long answer up to 1,000; a question the form marks required must be answered (2026-10-29).
  if v_form is null then
    if jsonb_typeof(p_info) = 'object' then
      for k in select unnest(array['project', 'unit', 'type', 'size', 'pax', 'budget']) loop
        if coalesce(p_info ->> k, '') <> '' then v_info := v_info || jsonb_build_object(k, left(btrim(p_info ->> k), 120)); end if;
      end loop;
    end if;
  else
    for x in select f from jsonb_array_elements(v_form) s, jsonb_array_elements(coalesce(s -> 'fields', '[]'::jsonb)) f loop
      k := x ->> 'id';
      v := case k when 'booker' then p_booker when 'bookerPhone' then p_booker_phone when 'customer' then p_customer
                  when 'customerPhone' then p_customer_phone when 'remarks' then p_remarks when 'note' then p_note
                  else case when jsonb_typeof(p_info) = 'object' then p_info ->> k end end;
      if coalesce((x ->> 'req')::int, 0) = 1 and coalesce(btrim(v), '') = '' then
        raise exception 'Fill in %.', x ->> 'label' using errcode = '22023';
      end if;
      if k not in ('booker', 'bookerPhone', 'customer', 'customerPhone', 'remarks', 'note') and coalesce(btrim(v), '') <> '' then
        v_info := v_info || jsonb_build_object(k, left(btrim(v), case when x ->> 'type' = 'Long text' then 1000 else 120 end));
      end if;
    end loop;
  end if;
  if p_ref is not null then
    select * into b from crm_partner_bookings where ref = upper(btrim(p_ref)) and partner = p.id for update;
    if b.id is null or b.state <> 'booked' then raise exception 'This booking is no longer there.' using errcode = '42501'; end if;
    -- Its own slot kept: only the details change (2026-10-29).
    v_same := b.showroom = trim(coalesce(p_showroom, '')) and b.start_at = p_start;
    if not v_same and b.start_at <= now() then raise exception 'This visit has already started; its time cannot be changed here.' using errcode = '22023'; end if;
  end if;
  if not v_same then
    if p_start is null or p_start <= now() then raise exception 'Pick a time still to come.' using errcode = '22023'; end if;
    if p_start > now() + interval '120 days' then raise exception 'Book within the next 120 days.' using errcode = '22023'; end if;
    perform pg_advisory_xact_lock(hashtext('crm-slot:' || coalesce(trim(p_showroom), '') || ':' || p_start::text));
    perform crm_slot_check(p_showroom, p_start, b.id);
  end if;
  if b.id is null then
    loop
      v_ref := 'TC-' || crm_partner_token(6);
      exit when not exists (select 1 from crm_partner_bookings where ref = v_ref);
    end loop;
    insert into crm_partner_bookings (ref, partner, showroom, start_at, booker_name, booker_phone, customer_name, customer_phone, info, remarks, booker_note)
    values (v_ref, p.id, trim(p_showroom), p_start, btrim(p_booker), btrim(coalesce(p_booker_phone, '')), btrim(p_customer), btrim(p_customer_phone),
      v_info, btrim(coalesce(p_remarks, '')), btrim(coalesce(p_note, '')))
    returning * into b;
  else
    update crm_partner_bookings set showroom = trim(p_showroom), start_at = p_start, booker_name = btrim(p_booker), booker_phone = btrim(coalesce(p_booker_phone, '')),
      customer_name = btrim(p_customer), customer_phone = btrim(p_customer_phone), info = v_info, remarks = btrim(coalesce(p_remarks, '')),
      booker_note = btrim(coalesce(p_note, '')), updated_at = now()
     where id = b.id returning * into b;
  end if;
  return crm_partner_booking_json(b);
end $function$;
