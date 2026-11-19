-- A visit marked Won carries its quotation and its bank slip (the owner, 2026-11-19: "close sell 的 won 除了输入金额之外，
-- 要可以附上 quotation & bank slip" — then: both required).
--
-- 1. crm_appointments gains the two files' paths in the private bucket crm-media (the customer's own folder, as the key
--    photos) and the names they were picked under.
-- 2. crm_set_won_files(appointment, quote path, quote name, slip path, slip name) — SECURITY DEFINER, asks crm_can_reply
--    as crm_set_key_photo does; only a visit still booked, only files in that customer's folder that arrived.
-- 3. crm_visit_outcome refuses Won until both are attached: ONE statement added after its amount check, into
--    PRODUCTION's body as it stands (pg_get_functiondef, replaced at an anchor; refused if the anchor is gone), so no
--    other line of it changes. Production's body when written: md5(prosrc) 6d662d807ca6ac4c4cb524cd9f615556.

alter table public.crm_appointments
  add column if not exists won_quote_path text,
  add column if not exists won_quote_name text,
  add column if not exists won_slip_path text,
  add column if not exists won_slip_name text;

create or replace function public.crm_set_won_files(p_appointment uuid, p_quote_path text, p_quote_name text, p_slip_path text, p_slip_name text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare a crm_appointments;
begin
  select * into a from crm_appointments where id = p_appointment;
  if a.id is null or not crm_can_reply(a.contact_id) then perform crm_deny('attach files to this visit'); end if;
  if a.state <> 'booked' then raise exception 'This visit is already marked.' using errcode = '22023'; end if;
  if p_quote_path is null or p_slip_path is null then
    raise exception 'Attach the quotation and the bank slip.' using errcode = '22023';
  end if;
  if p_quote_path !~ ('^' || a.contact_id::text || '/[A-Za-z0-9._-]{1,120}$')
     or p_slip_path !~ ('^' || a.contact_id::text || '/[A-Za-z0-9._-]{1,120}$') then
    raise exception 'That file is not in this customer''s folder.' using errcode = '22023';
  end if;
  if not exists (select 1 from file_objects f where f.bucket_id = 'crm-media' and f.name = p_quote_path)
     or not exists (select 1 from file_objects f where f.bucket_id = 'crm-media' and f.name = p_slip_path) then
    raise exception 'A file did not arrive. Try again.' using errcode = '22023';
  end if;
  update crm_appointments
     set won_quote_path = p_quote_path, won_quote_name = left(nullif(trim(coalesce(p_quote_name, '')), ''), 200),
         won_slip_path = p_slip_path, won_slip_name = left(nullif(trim(coalesce(p_slip_name, '')), ''), 200)
   where id = p_appointment returning * into a;
  return to_jsonb(a);
end $function$;

revoke all on function public.crm_set_won_files(uuid, text, text, text, text) from public, anon;
grant execute on function public.crm_set_won_files(uuid, text, text, text, text) to authenticated, service_role;

do $$
declare
  v_def text;
  v_new text;
  v_anchor constant text := E'  if p_outcome = ''won'' and coalesce(p_amount, 0) <= 0 then raise exception ''Enter the amount of the sale.'' using errcode = ''22023''; end if;\n';
  v_add constant text := E'  if p_outcome = ''won'' and (a.won_quote_path is null or a.won_slip_path is null) then raise exception ''Attach the quotation and the bank slip first.'' using errcode = ''22023''; end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'crm_visit_outcome'
     and pg_get_function_identity_arguments(p.oid) = 'p_appointment uuid, p_came boolean, p_outcome text, p_amount numeric, p_reason text, p_note text';
  if v_def is null then raise exception 'crm_visit_outcome is missing'; end if;
  if position(v_add in v_def) > 0 then return; end if;  -- already there
  v_new := replace(v_def, v_anchor, v_anchor || v_add);
  if v_new = v_def then raise exception 'crm_visit_outcome: the amount check this migration adds after is not there'; end if;
  execute v_new;
end $$;

-- 4. A Phone appointment type, right of Online (the owner, 2026-11-19: "增加多一个 Phone (Online 右边)，填写 日期 时间 &
--    remarks"): the date and time every type asks, and Remarks. Kept as the place-based types are (kind 'other', named
--    "Phone"), so crm_appt_values, crm_book_typed and the calendar take it as they are. Added to the types in force only
--    when none is called phone; the Control panel's Appointment types can rename, switch off or reorder it.
update public.crm_settings s
   set appt_types = (
     select jsonb_agg(x order by o) from (
       select x, case when x->>'id' = 'online' then 1 else 3 end * 1000 + n as o
         from jsonb_array_elements(s.appt_types) with ordinality as e(x, n)
       union all
       select '{"id":"phone","on":true,"base":"place","label":"Phone","fields":[{"id":"remarks","kind":"long","label":"Remarks"}]}'::jsonb, 2000
     ) t)
 where s.id = true and s.appt_types is not null and jsonb_typeof(s.appt_types) = 'array'
   and not exists (select 1 from jsonb_array_elements(s.appt_types) x where x->>'id' = 'phone');

-- 5. crm_save_appt_types lets the Phone type be a place type with no Place question (a call is at no place) — one condition
--    added to its Place check in PRODUCTION's body (md5(prosrc) 21bab3a6c20e55646a7d5775df46d4d9 when written); the editor's
--    twin is desk/vm/appt-types.ts › typesProblem.
do $$
declare
  v_def text;
  v_new text;
  v_old constant text := $q$if t->>'base' = 'place' and not exists$q$;
  v_rep constant text := $q$if t->>'base' = 'place' and t->>'id' is distinct from 'phone' and not exists$q$;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'crm_save_appt_types';
  if v_def is null then raise exception 'crm_save_appt_types is missing'; end if;
  if position(v_rep in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'crm_save_appt_types: its Place check is not there exactly once';
  end if;
  v_new := replace(v_def, v_old, v_rep);
  execute v_new;
end $$;
