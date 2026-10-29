-- The questions that were "Always asked" are the owner's to set too (2026-10-29: "always ask 我也要自定义" — asked how far:
-- "必填开关 + 可删除", on both forms). Customer info needs nothing here (its Name and Phone were the app's lock). The booking
-- link's three — Your name, Customer name, Customer phone — follow the booking form like any question: required only when
-- marked so, gone when taken off. crm_save_form no longer insists on them; crm_partner_book asks them only while no booking
-- form is in use, and still checks a phone given. Both from production's bodies (md5: save_form(4) 9b396520…,
-- partner_book 50bd9dd2…, mig 20261030040000).

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
  -- With a booking form in use, its own required marks decide whether a name or a phone must be there (2026-10-29, the owner:
  -- "always ask 我也要自定义"); a phone given is still a phone. With none, the three are asked as before.
  if v_form is null then
    if length(btrim(coalesce(p_booker, ''))) < 1 then raise exception 'Type your name.' using errcode = '22023'; end if;
    if length(btrim(coalesce(p_customer, ''))) < 1 then raise exception 'Type the customer''s name.' using errcode = '22023'; end if;
    if length(btrim(coalesce(p_customer_phone, ''))) < 1 then raise exception 'Type the customer''s phone number.' using errcode = '22023'; end if;
  end if;
  if length(btrim(coalesce(p_booker, ''))) > 80 or length(btrim(coalesce(p_customer, ''))) > 80 then raise exception 'A name is too long.' using errcode = '22023'; end if;
  if btrim(coalesce(p_customer_phone, '')) <> '' and (length(btrim(p_customer_phone)) not between 6 and 30 or btrim(p_customer_phone) !~ '^[0-9 +()-]+$') then
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
    values (v_ref, p.id, trim(p_showroom), p_start, btrim(coalesce(p_booker, '')), btrim(coalesce(p_booker_phone, '')), btrim(coalesce(p_customer, '')), btrim(coalesce(p_customer_phone, '')),
      v_info, btrim(coalesce(p_remarks, '')), btrim(coalesce(p_note, '')))
    returning * into b;
  else
    update crm_partner_bookings set showroom = trim(p_showroom), start_at = p_start, booker_name = btrim(coalesce(p_booker, '')), booker_phone = btrim(coalesce(p_booker_phone, '')),
      customer_name = btrim(coalesce(p_customer, '')), customer_phone = btrim(coalesce(p_customer_phone, '')), info = v_info, remarks = btrim(coalesce(p_remarks, '')),
      booker_note = btrim(coalesce(p_note, '')), updated_at = now()
     where id = b.id returning * into b;
  end if;
  return crm_partner_booking_json(b);
end $function$;
