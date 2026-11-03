-- An appointment type's Place is required only where it is ticked so (the owner, 2026-10-29: "place, date, time 不要 default，
-- 让我勾选" — answered B: still asked, required by the tick). crm_appt_values (production's body, md5 0350b0e1…): a Place
-- question no longer counts as required by its kind, and a type at a place with no place given goes by its own name.
-- The date and time stay required: an appointment is a time on the calendar.

CREATE OR REPLACE FUNCTION public.crm_appt_values(p_type text, p_start timestamp with time zone, p_answers jsonb, OUT o_kind text, OUT o_name text, OUT o_link text, OUT o_place text, OUT o_remarks text, OUT o_answers jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t jsonb; f jsonb; v text;
begin
  select x into t from jsonb_array_elements(crm_appt_types_in_force()) x where x->>'id' = p_type and coalesce((x->>'on')::boolean, true);
  if t is null then raise exception 'That appointment type is not in use.' using errcode = '22023'; end if;
  if p_start is null then raise exception 'An appointment needs a date and a time.' using errcode = '22023'; end if;
  o_answers := '{}'::jsonb;
  for f in select * from jsonb_array_elements(t->'fields') loop
    v := left(btrim(coalesce(p_answers->>(f->>'id'), '')), 2000);
    if v = '' and coalesce((f->>'required')::boolean, false) then
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
  o_name := case when t->>'base' = 'online' then left(btrim(t->>'label'), 200) else coalesce(o_place, left(btrim(t->>'label'), 200)) end;
  if o_kind = 'online' then o_place := null; end if;
end $function$;
