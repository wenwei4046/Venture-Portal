-- Appointment types the Control panel sets, as the Customer form (the owner, 2026-10-24: "在電腦端有個控制面板，可以放在
-- showroom 那邊 … 做成類似customer form 一樣的，我可以加任何需要的東西，就不用一直跑程式").
--
-- crm_settings.appt_types: [{id, label, on, base: 'online' | 'place', fields: [{id, label, kind, required, options}]}],
-- kind text · long · link · number · choice · place. NULL = the two built in (Online, Other — as mig 20261025020000 drew
-- them). An Online-like type sends its first Link field to the customer as the meeting link; a place type sends its Place
-- field as the location. Every other answer is staff-only. Date and time are always asked and required.
-- crm_appointments.type_id / answers keep which type and what was typed; kind, showroom, meeting_link, place and
-- remarks are filled from them, so everything that reads an appointment today reads it unchanged.

alter table public.crm_settings add column if not exists appt_types jsonb;
alter table public.crm_appointments add column if not exists type_id text, add column if not exists answers jsonb;

-- The types in force: the saved ones, else the two built in.
create or replace function public.crm_appt_types_in_force()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((select appt_types from crm_settings where id = true), $j$[
    {"id":"online","label":"Online","on":true,"base":"online","fields":[
      {"id":"link","label":"Meeting link","kind":"link","required":false},
      {"id":"remarks","label":"Remarks","kind":"long","required":false}]},
    {"id":"other","label":"Other","on":true,"base":"place","fields":[
      {"id":"place","label":"Place","kind":"place","required":true},
      {"id":"remarks","label":"Remarks","kind":"long","required":false}]}
  ]$j$::jsonb)
$$;
revoke all on function public.crm_appt_types_in_force() from public, anon, authenticated;
grant execute on function public.crm_appt_types_in_force() to service_role;

-- Read by anybody the CRM places.
create or replace function public.crm_appt_types_read()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if crm_my_role() is null then return null; end if;
  return crm_appt_types_in_force();
end $$;
revoke all on function public.crm_appt_types_read() from public, anon;
grant execute on function public.crm_appt_types_read() to authenticated;

-- Saved only by CRM · Manage; the shape is checked here, not trusted from the screen.
create or replace function public.crm_save_appt_types(p_types jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare t jsonb; f jsonb; ids text[] := '{}'; fids text[];
begin
  if not crm_manages() then perform crm_deny('change the appointment types'); end if;
  if jsonb_typeof(p_types) is distinct from 'array' or jsonb_array_length(p_types) > 12 then
    raise exception 'Up to 12 appointment types.' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(p_types) loop
    if coalesce(t->>'id', '') !~ '^[a-z0-9_-]{1,40}$' or t->>'id' = 'showroom' or t->>'id' = any(ids) then
      raise exception 'Each appointment type needs its own id.' using errcode = '22023';
    end if;
    ids := ids || (t->>'id');
    if length(btrim(coalesce(t->>'label', ''))) not between 1 and 40 then raise exception 'Name each appointment type (up to 40 characters).' using errcode = '22023'; end if;
    if (t->>'base') is distinct from 'online' and (t->>'base') is distinct from 'place' then raise exception 'A type is online or at a place.' using errcode = '22023'; end if;
    if jsonb_typeof(t->'fields') is distinct from 'array' or jsonb_array_length(t->'fields') > 20 then raise exception 'Up to 20 questions a type.' using errcode = '22023'; end if;
    fids := '{}';
    for f in select * from jsonb_array_elements(t->'fields') loop
      if coalesce(f->>'id', '') !~ '^[a-z0-9_-]{1,40}$' or f->>'id' = any(fids) then raise exception 'Each question needs its own id.' using errcode = '22023'; end if;
      fids := fids || (f->>'id');
      if length(btrim(coalesce(f->>'label', ''))) not between 1 and 60 then raise exception 'Name each question (up to 60 characters).' using errcode = '22023'; end if;
      if coalesce(f->>'kind', '') not in ('text', 'long', 'link', 'number', 'choice', 'place') then raise exception 'A question''s kind is not known.' using errcode = '22023'; end if;
      if f->>'kind' = 'choice' and (jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options') not between 1 and 30) then
        raise exception 'A choice question needs 1 to 30 choices.' using errcode = '22023';
      end if;
    end loop;
    if t->>'base' = 'place' and not exists (select 1 from jsonb_array_elements(t->'fields') x where x->>'kind' = 'place') then
      raise exception '"%" is at a place: give it a Place question.', t->>'label' using errcode = '22023';
    end if;
  end loop;
  update crm_settings set appt_types = p_types, updated_by = crm_me(), updated_at = now() where id = true;
end $$;
revoke all on function public.crm_save_appt_types(jsonb) from public, anon;
grant execute on function public.crm_save_appt_types(jsonb) to authenticated;

-- What a typed appointment stores: its kind, the name it goes by, the link, the place, the remarks and the answers kept.
create or replace function public.crm_appt_values(p_type text, p_start timestamptz, p_answers jsonb,
  out o_kind text, out o_name text, out o_link text, out o_place text, out o_remarks text, out o_answers jsonb)
language plpgsql stable security definer set search_path to 'public' as $$
declare t jsonb; f jsonb; v text;
begin
  select x into t from jsonb_array_elements(crm_appt_types_in_force()) x where x->>'id' = p_type and coalesce((x->>'on')::boolean, true);
  if t is null then raise exception 'That appointment type is not in use.' using errcode = '22023'; end if;
  if p_start is null then raise exception 'An appointment needs a date and a time.' using errcode = '22023'; end if;
  o_answers := '{}'::jsonb;
  for f in select * from jsonb_array_elements(t->'fields') loop
    v := left(btrim(coalesce(p_answers->>(f->>'id'), '')), 2000);
    if v = '' and (coalesce((f->>'required')::boolean, false) or f->>'kind' = 'place') then
      raise exception '%: fill this in.', f->>'label' using errcode = '22023';
    end if;
    if v <> '' and f->>'kind' = 'link' and v !~* '^https?://\S+$' then raise exception '%: the link must start with https://', f->>'label' using errcode = '22023'; end if;
    if v <> '' and f->>'kind' = 'choice' and not (f->'options' ? v) then raise exception '%: pick one of the choices.', f->>'label' using errcode = '22023'; end if;
    if v <> '' then
      o_answers := o_answers || jsonb_build_object(f->>'id', v);
      if f->>'kind' = 'link' and o_link is null and t->>'base' = 'online' then o_link := left(v, 1000); end if;
      if f->>'kind' = 'place' and o_place is null then o_place := left(v, 200); end if;
      if f->>'id' = 'remarks' then o_remarks := v; end if;
    end if;
  end loop;
  o_kind := case when t->>'base' = 'online' then 'online' else 'other' end;
  o_name := case when t->>'base' = 'online' then left(btrim(t->>'label'), 200) else o_place end;
  if o_kind = 'online' then o_place := null; end if;
end $$;
revoke all on function public.crm_appt_values(text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.crm_appt_values(text, timestamptz, jsonb) to service_role;

create or replace function public.crm_book_typed(p_contact uuid, p_type text, p_start timestamptz, p_answers jsonb, p_minutes integer default 60)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a crm_appointments; v record;
begin
  if not crm_can_reply(p_contact) then perform crm_deny('book for this customer'); end if;
  if coalesce(p_minutes, 0) <= 0 then raise exception 'An appointment needs a length.' using errcode = '22023'; end if;
  select * into v from crm_appt_values(p_type, p_start, coalesce(p_answers, '{}'::jsonb));
  insert into crm_appointments (contact_id, showroom, start_at, minutes, created_by, kind, meeting_link, place, remarks, type_id, answers)
  values (p_contact, v.o_name, p_start, p_minutes, crm_me(), v.o_kind, v.o_link, v.o_place, v.o_remarks, p_type, v.o_answers)
  returning * into a;
  update crm_contacts set status = 'appointment', lost_reason = null, lost_note = null, previous_status = null where id = p_contact;
  return to_jsonb(a);
end $$;
revoke all on function public.crm_book_typed(uuid, text, timestamptz, jsonb, integer) from public, anon;
grant execute on function public.crm_book_typed(uuid, text, timestamptz, jsonb, integer) to authenticated;

create or replace function public.crm_move_typed(p_appointment uuid, p_type text, p_start timestamptz, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare a crm_appointments; v record;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('change this appointment'); end if;
  if a.state <> 'booked' then raise exception 'Only a booked appointment can be changed.' using errcode = '22023'; end if;
  select * into v from crm_appt_values(p_type, p_start, coalesce(p_answers, '{}'::jsonb));
  update crm_appointments set start_at = p_start, kind = v.o_kind, showroom = v.o_name, meeting_link = v.o_link, place = v.o_place,
         remarks = v.o_remarks, type_id = p_type, answers = v.o_answers
   where id = p_appointment returning * into a;
  return to_jsonb(a);
end $$;
revoke all on function public.crm_move_typed(uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.crm_move_typed(uuid, text, timestamptz, jsonb) to authenticated;
