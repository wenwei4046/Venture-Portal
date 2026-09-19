-- Employee exits from the chart. Every operation is one transaction and keeps
-- payroll/statement records. No generic membership or reporting rules change.
create or replace function public.employee_chart_lifecycle(
  p_action text,
  p_staff_id uuid,
  p_source_scheme_id uuid,
  p_destination_kind text default null,
  p_destination_id uuid default null,
  p_title_id uuid default null,
  p_resignation_date date default null
) returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_staff public.hr_staff_costs%rowtype;
  v_source record;
  v_target record;
  v_title public.titles%rowtype;
  v_position public.comm_hierarchy%rowtype;
  v_home uuid;
  v_target_home uuid;
  v_rank uuid;
  v_from date := public.comm_period_start();
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_count integer;
begin
  if auth.uid() is null or not coalesce(public.has_perm('revenue'), false) then
    raise exception 'Revenue access is required.' using errcode = '42501';
  end if;
  if p_action not in ('move', 'remove', 'terminate') or p_action is null then
    raise exception 'Choose a valid employee action.' using errcode = '23EMP';
  end if;
  if (p_action = 'terminate' or (p_action = 'move' and p_destination_kind = 'department'))
     and not coalesce(public.has_perm('team'), false) then
    raise exception 'People Management access is required for this employee change.' using errcode = '42501';
  end if;

  -- Existing company writers and membership writers do not share an employee
  -- advisory lock. Infrequent exit operations therefore serialize writes to
  -- these two tables while validating downlines and changing both surfaces.
  -- Keep this ordering: roster triggers can themselves write memberships.
  lock table public.hr_staff_costs in share row exclusive mode;
  lock table public.comm_hierarchy in share row exclusive mode;
  select * into v_staff from public.hr_staff_costs where id = p_staff_id for update;
  if not found or v_staff.status <> 'active' then
    raise exception 'This employee is no longer active or visible. Refresh the chart and try again.' using errcode = '23EMP';
  end if;
  select sc.id, sd.department_id into v_source
    from public.comm_schemes sc join public.comm_sub_departments sd on sd.id = sc.sub_department_id
   where sc.id = p_source_scheme_id and sc.is_active and sc.effective_to is null and sd.is_active
   for share of sc, sd;
  if not found or v_source.department_id is distinct from v_staff.department_id then
    raise exception 'Their department changed after this chart opened. Refresh and try again.' using errcode = '23EMP';
  end if;
  v_home := public.comm_scheme_for_department(v_staff.department_id);
  select * into v_position from public.comm_hierarchy
   where scheme_id = p_source_scheme_id and staff_id = p_staff_id and effective_to is null for update;
  -- The home chart also draws roster employees whose title has no rung yet.
  if v_position.id is null and p_source_scheme_id is distinct from v_home then
    raise exception 'They are no longer a member of this sub-department. Refresh the chart.' using errcode = '23EMP';
  end if;

  if p_action = 'terminate' then
    if p_resignation_date is null or p_resignation_date > v_today
       or (v_staff.hire_date is not null and p_resignation_date < v_staff.hire_date) then
      raise exception 'The last working day must be between their hire date and today.' using errcode = '23EMP';
    end if;
    if exists (select 1 from public.hr_staff_costs where reports_to = p_staff_id and status = 'active')
       or exists (
         select 1 from public.comm_hierarchy h
         join public.hr_staff_costs s on s.id = h.staff_id and s.status = 'active'
         where h.upline_staff_id = p_staff_id and h.effective_to is null
       ) then
      raise exception 'This employee still has reports or commission downlines. Reassign them before terminating employment.' using errcode = '23EMP';
    end if;
    -- A former employee's open commission position is retained for their
    -- final pay period. It is history, not an active report that must be
    -- reassigned before their manager can also finish employment.
    -- A director's top-level reports are derived, not stored in reports_to.
    if exists (select 1 from public.comm_sub_department_directors where staff_id = p_staff_id) then
      raise exception 'Remove their sub-department director assignments before terminating employment.' using errcode = '23EMP';
    end if;
    update public.hr_staff_costs set status = 'inactive', resignation_date = p_resignation_date where id = p_staff_id;
    if not found then raise exception 'This employee is not writable by this account.' using errcode = '42501'; end if;
    -- comm_sync_position intentionally leaves an inactive employee's positions
    -- intact. The commission engine reads the month-end chart; closing at a
    -- mid-month resignation date would erase their final month's commission.
    -- Member access checks active employment separately; login account state
    -- retains the existing People Management semantics.
    return;
  end if;

  if p_action = 'move' and p_destination_kind = 'department' then
    -- Department rows are readable to People operators, but their UPDATE RLS
    -- policy belongs to Settings administrators. FOR SHARE would also apply
    -- that UPDATE policy and hide an otherwise valid destination. Stabilize
    -- the small department catalog with a table lock, then use SELECT RLS.
    lock table public.departments in share mode;
    select id, payroll_source into v_target from public.departments where id = p_destination_id;
    if not found or p_destination_id = v_staff.department_id then
      raise exception 'Choose another main department.' using errcode = '23EMP';
    end if;
    select * into v_title from public.titles where id = p_title_id and is_active and not is_department_head
      and (department_id is null or department_id = p_destination_id) for share;
    if not found then
      raise exception 'Choose an active employee title in the receiving department.' using errcode = '23EMP';
    end if;
    if exists (select 1 from public.hr_staff_costs where reports_to = p_staff_id and status = 'active')
       or exists (select 1 from public.comm_hierarchy where upline_staff_id = p_staff_id and effective_to is null) then
      raise exception 'This employee still has reports or commission downlines. Reassign them before moving departments.' using errcode = '23EMP';
    end if;
    if exists (select 1 from public.comm_sub_department_directors where staff_id = p_staff_id) then
      raise exception 'Remove their sub-department director assignments before moving departments.' using errcode = '23EMP';
    end if;
    if v_target.payroll_source = 'commission' then
      v_target_home := public.comm_scheme_for_department(p_destination_id);
      if v_target_home is null or public.comm_floor_rank(v_target_home, p_title_id) is null then
        raise exception 'Set up the receiving department’s home scheme and a ladder rung for this title first.' using errcode = '23EMP';
      end if;
    end if;
    -- Close every old membership, including sibling sub-departments. A move
    -- between two commission parents does NOT do this in comm_sync_position.
    for v_position in select * from public.comm_hierarchy where staff_id = p_staff_id and effective_to is null for update loop
      if v_position.effective_from >= v_from then
        delete from public.comm_hierarchy where id = v_position.id;
      else
        update public.comm_hierarchy set effective_to = v_from - 1 where id = v_position.id;
      end if;
      if not found then raise exception 'An old membership is not writable by this account.' using errcode = '42501'; end if;
    end loop;
    -- FOR UPDATE applies UPDATE policies as well as SELECT policies. A sibling
    -- visible to this account can therefore be absent from the writable loop.
    -- Never change the roster while any readable old membership remains open.
    if exists (select 1 from public.comm_hierarchy where staff_id = p_staff_id and effective_to is null) then
      raise exception 'An old membership could not be closed. No department changes were saved.' using errcode = '23EMP';
    end if;
    -- The existing one-line trigger creates the receiving home membership in
    -- this same transaction. Salary, tax, bank details and identity stay intact.
    update public.hr_staff_costs set department_id = p_destination_id, title_id = p_title_id,
      designation = v_title.name, reports_to = null where id = p_staff_id;
    if not found then raise exception 'This employee is not writable by this account.' using errcode = '42501'; end if;
    if v_target.payroll_source = 'commission' and not exists (
      select 1 from public.comm_hierarchy where staff_id = p_staff_id and scheme_id = v_target_home and effective_to is null
    ) then
      raise exception 'The receiving membership could not be created. No department changes were saved.' using errcode = '23EMP';
    end if;
    return;
  end if;

  if p_source_scheme_id = v_home then
    raise exception 'Home membership follows the company roster. Move to another main department or terminate employment instead.' using errcode = '23EMP';
  end if;
  select count(*) into v_count from public.comm_hierarchy
   where scheme_id = p_source_scheme_id and upline_staff_id = p_staff_id and effective_to is null;
  if v_count > 0 then
    raise exception '% members still report to this employee here. Reassign them before removing this membership.', v_count using errcode = '23EMP';
  end if;

  if p_action = 'move' then
    if p_destination_kind is distinct from 'subdepartment' or p_destination_id is null or p_destination_id = p_source_scheme_id then
      raise exception 'Choose a different sub-department.' using errcode = '23EMP';
    end if;
    select sc.id, sd.department_id into v_target
      from public.comm_schemes sc join public.comm_sub_departments sd on sd.id = sc.sub_department_id
     where sc.id = p_destination_id and sc.is_active and sc.effective_to is null and sd.is_active
     for share of sc, sd;
    if not found or v_target.department_id is distinct from v_staff.department_id then
      raise exception 'Choose a sub-department in their current main department, or use Move to another main department.' using errcode = '23EMP';
    end if;
    if not exists (select 1 from public.comm_hierarchy where staff_id = p_staff_id and scheme_id = p_destination_id and effective_to is null) then
      if p_destination_id = v_home then
        raise exception 'Their home membership has no ladder position yet. Set their company title under People Management first.' using errcode = '23EMP';
      end if;
      select * into v_title from public.titles where id = p_title_id and is_active and not is_department_head for share;
      if not found then raise exception 'Choose an active title in the receiving sub-department.' using errcode = '23EMP'; end if;
      v_rank := public.comm_floor_rank(p_destination_id, p_title_id);
      if v_rank is null then raise exception 'That title has no rung on the receiving sub-department’s ladder.' using errcode = '23EMP'; end if;
      insert into public.comm_hierarchy(scheme_id, staff_id, title_id, upline_staff_id, rank_id, rate_mode, effective_from, created_by)
        values(p_destination_id, p_staff_id, p_title_id, null, v_rank, null, v_from, auth.uid());
    end if;
    -- If already present (including home), their destination rank, title,
    -- upline and rate mode are deliberately untouched.
  end if;
  if v_position.effective_from >= v_from then
    delete from public.comm_hierarchy where id = v_position.id;
  else
    update public.comm_hierarchy set effective_to = v_from - 1 where id = v_position.id;
  end if;
  if not found then raise exception 'This membership is not writable by this account.' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.employee_chart_lifecycle(text, uuid, uuid, text, uuid, uuid, date) from public, anon;
grant execute on function public.employee_chart_lifecycle(text, uuid, uuid, text, uuid, uuid, date) to authenticated;
comment on function public.employee_chart_lifecycle(text, uuid, uuid, text, uuid, uuid, date) is
  'Atomically remove a sub-department membership, move an employee, or record completed employment. Requires revenue; company moves and termination also require team. Keeps payroll history and never reassigns downlines.';
