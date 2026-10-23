-- CRM redesign v2 · frame 08 Customer form (2026-10-23; note 05 › several forms): the form in use is the first by
-- sort_order (every Customer info asks it). "Set as active" puts another form first; Delete refuses the form in use
-- ("Set another form as active first") — the database says so too, not only the screen.
-- crm_delete_form is rewritten from PRODUCTION's body (md5 46b9f850532e283ab1c0b514755a793f), one check added.

create or replace function public.crm_set_active_form(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.crm_manages() then perform crm_deny('change the forms'); end if;
  if not exists (select 1 from crm_forms where id = p_id) then raise exception 'That form is gone. Reload.' using errcode = 'P0002'; end if;
  update crm_forms set sort_order = coalesce((select min(sort_order) from crm_forms), 0) - 1, updated_by = crm_me(), updated_at = now() where id = p_id;
end $$;
revoke all on function public.crm_set_active_form(uuid) from public, anon;
grant execute on function public.crm_set_active_form(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.crm_delete_form(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.crm_manages() then perform crm_deny('delete forms'); end if;
  if p_id = (select id from crm_forms order by sort_order, created_at limit 1) then
    raise exception 'Set another form as active first.' using errcode = '22023';
  end if;
  delete from crm_forms where id = p_id;
end $function$;
