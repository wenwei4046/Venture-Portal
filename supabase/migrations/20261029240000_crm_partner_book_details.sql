-- Saving a booking's details keeps its slot (the owner, 2026-10-29, a change of the customer's phone refused "Pick a time
-- still to come": "save change, 不一定是换时间 & 地点"). crm_partner_book from production's body (md5 44e916aa…, mig
-- 20261029190000): with a reference, the same showroom and the same start, it saves the booker, the customer and the notes
-- only — no time or slot check, so a visit already started or gone by can still have its details put right. A new booking,
-- or a change of time or showroom, is checked exactly as before.

create or replace function public.crm_partner_book(p_code text, p_ref text, p_showroom text, p_start timestamptz,
  p_booker text, p_booker_phone text, p_customer text, p_customer_phone text, p_info jsonb, p_remarks text, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p crm_partner_links := crm_partner_of(p_code); b crm_partner_bookings; v_ref text; v_info jsonb := '{}'::jsonb; k text; v_same boolean := false;
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
  -- The customer's info: the page's own keys, short text only.
  if jsonb_typeof(p_info) = 'object' then
    for k in select unnest(array['project', 'unit', 'type', 'size', 'pax', 'budget']) loop
      if coalesce(p_info ->> k, '') <> '' then v_info := v_info || jsonb_build_object(k, left(btrim(p_info ->> k), 120)); end if;
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
    -- One booking at a time for a slot, so two at once cannot both take its last place.
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
end $$;
