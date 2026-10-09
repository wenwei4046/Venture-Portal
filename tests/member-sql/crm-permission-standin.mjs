// The permission matrix as the CRM's checks see it (mig 20261010030000: the CRM
// asks has_action('crm', action, reach) through crm_can). A test that loads
// every CRM migration needs a has_action; this one gives each person what the
// seeded templates give their CRM role, unless the test says otherwise:
//
//   - the Principal's login, and a Boss / HOD (Revenue Director) by title or
//     as a sub-department's director: every CRM cell at All (Ultimate full
//     access; the Revenue Director template)
//   - everybody else: View and Edit at Own (the Revenue Team template)
//   - a person with rows in test_crm_cells holds exactly those cells
//
// So the checks written before the CRM asked the matrix run unchanged, and
// validate-crm-permissions.mjs states its own cells.
export const CRM_PERMISSION_STANDIN = `
  create table if not exists public.test_crm_cells (uid uuid not null, action text not null, scope text not null);
  create or replace function public.has_action(p_function text, p_action text, p_scope text) returns boolean
  language plpgsql stable security definer set search_path = public as $fn$
  declare
    v_uid   uuid := auth.uid();
    v_rank  int := array_position(array['own', 'dept', 'all'], coalesce(p_scope, 'all'));
    v_staff uuid;
  begin
    if v_uid is null or p_function <> 'crm' then return false; end if;
    if exists (select 1 from public.test_crm_cells c where c.uid = v_uid) then
      return exists (select 1 from public.test_crm_cells c
                      where c.uid = v_uid and c.action = p_action
                        and array_position(array['own', 'dept', 'all'], c.scope) >= v_rank);
    end if;
    if exists (select 1 from public.users u where u.id = v_uid and u.role = 'principal') then return true; end if;
    select s.id into v_staff from public.hr_staff_costs s where s.user_id = v_uid limit 1;
    if coalesce(public.crm_role_of(v_staff) in ('boss', 'hod'), false) then return true; end if;
    return p_action in ('view', 'edit') and v_rank = 1;
  end $fn$;
`
