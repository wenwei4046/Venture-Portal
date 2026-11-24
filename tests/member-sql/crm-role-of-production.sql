-- production's crm_role_of as of 2026-11-24 (md5(prosrc) 307b04cfefe547882cca7d5157bf54e8), read with pg_get_functiondef.
CREATE OR REPLACE FUNCTION public.crm_role_of(p_staff uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record;
begin
  if crm_scope() is null then
    return (select cm.crm_role from hr_staff_costs s join crm_role_map cm on cm.title_id = s.title_id where s.id = p_staff);
  end if;
  select * into m from crm_scope_member(p_staff);
  if m.is_member then
    return (select cm.crm_role from crm_role_map cm
             where cm.title_id = coalesce(m.title_id, (select title_id from hr_staff_costs where id = p_staff))
               and cm.crm_role in ('stl', 'tl', 'ta', 'rs'));
  end if;
  if exists (select 1 from comm_sub_department_directors d where d.sub_department_id = crm_scope() and d.staff_id = p_staff) then
    return 'hod';
  end if;
  return (select cm.crm_role from hr_staff_costs s join crm_role_map cm on cm.title_id = s.title_id
           where s.id = p_staff and cm.crm_role = 'boss');
end $function$;
