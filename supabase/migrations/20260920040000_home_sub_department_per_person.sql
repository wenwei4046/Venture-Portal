-- THE HOME SUB-DEPARTMENT BECOMES A PERSON'S OWN FACT (2026-09-20)
--
-- Until now a commission department had exactly one home sub-department — its
-- OLDEST (comm_scheme_for_department, pickHomeSubDepartments) — and every
-- employee of that department was on its chart whether or not they ever
-- worked there. Nobody chose it; created_at did. Revenue's oldest is Fair, so
-- a salesperson who only ever works IR events still had to be drawn on Fair,
-- could not be removed from it, and could not be filed under IR when they
-- were hired.
--
-- hr_staff_costs.home_sub_department_id is the choice. NULL keeps exactly
-- today's answer (the department's oldest), so nothing moves on this
-- migration; setting it moves one person, and one person only.
--
-- WHAT "HOME" STILL MEANS is unchanged: it is the one sub-department whose
-- membership the company roster describes — upline = reports_to, title = the
-- company title, rank = that title's floor, ratcheted up. Every OTHER
-- sub-department stays a world of its own, edited on its own chart.
--
-- THE LINE FOLLOWS THE PERSON, NOT THE OTHER WAY AROUND. When somebody's home
-- moves to a sub-department they already work in, that chart already has them
-- under an upline a human placed them under. So employee_chart_lifecycle
-- copies THAT upline into reports_to rather than letting the roster overwrite
-- the receiving chart — otherwise moving TENG YIK's home to IR would silently
-- pull him out from under STANLEY there.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------
alter table public.hr_staff_costs
  add column if not exists home_sub_department_id uuid references public.comm_sub_departments(id);

comment on column public.hr_staff_costs.home_sub_department_id is
  'The sub-department this person is BASED in: the one whose commission membership the company roster (reports_to, the company title) describes. NULL means the department''s oldest, which is what everybody had before 2026-09-20. Must belong to their own department; cleared automatically when they move to another one.';

create index if not exists hr_staff_costs_home_sub_department_idx
  on public.hr_staff_costs(home_sub_department_id)
  where home_sub_department_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Resolving one person's home
--
-- SECURITY DEFINER because these answer with an id and nothing else, and are
-- called from both the definer triggers and the invoker RPC: the answer must
-- not depend on whether the caller may read the roster row.
-- ---------------------------------------------------------------------------
create or replace function public.comm_home_sub_department(p_staff_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    -- Their own choice, while it still belongs to their own department.
    (select s.home_sub_department_id
       from public.hr_staff_costs s
       join public.comm_sub_departments sd on sd.id = s.home_sub_department_id
      where s.id = p_staff_id
        and sd.is_active
        and sd.department_id = s.department_id),
    -- The department's oldest: the same rule as comm_scheme_for_department
    -- and pickHomeSubDepartments, and the answer everybody had before.
    (select sd.id
       from public.hr_staff_costs s
       join public.comm_sub_departments sd
         on sd.department_id = s.department_id and sd.is_active
      where s.id = p_staff_id
      order by sd.created_at, sd.id
      limit 1))
$$;

create or replace function public.comm_home_scheme_for_staff(p_staff_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select sc.id
    from public.comm_schemes sc
   where sc.sub_department_id = public.comm_home_sub_department(p_staff_id)
     and sc.is_active
     and sc.effective_to is null
   order by sc.effective_from desc
   limit 1
$$;

revoke all on function public.comm_home_sub_department(uuid) from public, anon;
revoke all on function public.comm_home_scheme_for_staff(uuid) from public, anon;
grant execute on function public.comm_home_sub_department(uuid) to authenticated;
grant execute on function public.comm_home_scheme_for_staff(uuid) to authenticated;

comment on function public.comm_home_sub_department(uuid) is
  'The sub-department one person is based in: their own home_sub_department_id while it belongs to their department, else the department''s oldest. The per-person twin of comm_scheme_for_department.';
comment on function public.comm_home_scheme_for_staff(uuid) is
  'The live scheme of one person''s home sub-department. What comm_sync_position derives a membership for.';

-- ---------------------------------------------------------------------------
-- 3. A home choice that cannot be nonsense
-- ---------------------------------------------------------------------------
create or replace function public.hr_staff_home_sub_department()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub    record;
  v_scheme uuid;
  v_title  text;
begin
  -- Moving to another main department takes the choice with it: the receiving
  -- department has its own sub-departments, and its default home is where
  -- they land. Choosing one explicitly in the same statement wins.
  if tg_op = 'UPDATE'
     and new.department_id is distinct from old.department_id
     and new.home_sub_department_id is not distinct from old.home_sub_department_id then
    new.home_sub_department_id := null;
  end if;

  if new.home_sub_department_id is null then
    return new;
  end if;

  select sd.id, sd.name, sd.department_id, sd.is_active
    into v_sub
    from public.comm_sub_departments sd
   where sd.id = new.home_sub_department_id;
  if not found or not v_sub.is_active or v_sub.department_id is distinct from new.department_id then
    raise exception 'That sub-department is not one of %''s own.',
      coalesce((select d.name from public.departments d where d.id = new.department_id), 'this department')
      using errcode = '23HOM';
  end if;

  select sc.id into v_scheme
    from public.comm_schemes sc
   where sc.sub_department_id = new.home_sub_department_id
     and sc.is_active and sc.effective_to is null
   order by sc.effective_from desc
   limit 1;
  if v_scheme is null then
    raise exception '% has no active scheme yet, so nobody can be based there.', v_sub.name
      using errcode = '23HOM';
  end if;

  -- The home membership carries the COMPANY title, so that title needs a rung
  -- on this ladder. Checked only when the CHOICE itself is made: a later
  -- promotion is People's business, and comm_sync_position already leaves a
  -- membership alone when the new title has no rung — the same leniency the
  -- department default has always had.
  if (tg_op = 'INSERT' or new.home_sub_department_id is distinct from old.home_sub_department_id)
     and new.title_id is not null
     and not public.title_is_department_head(new.title_id)
     and public.comm_floor_rank(v_scheme, new.title_id) is null then
    select name into v_title from public.titles where id = new.title_id;
    raise exception '%''s ladder has no rung for %. Give that title a rank under Rules > Title ladder first.',
      v_sub.name, coalesce(v_title, 'that title')
      using errcode = '23HOM';
  end if;

  return new;
end;
$$;

drop trigger if exists hr_staff_costs_home_sub_department on public.hr_staff_costs;
create trigger hr_staff_costs_home_sub_department
  before insert or update of home_sub_department_id, department_id, title_id
  on public.hr_staff_costs
  for each row execute function public.hr_staff_home_sub_department();

comment on function public.hr_staff_home_sub_department() is
  'Keeps home_sub_department_id honest: an active sub-department of the person''s own department, with a live scheme, and — when the choice is first made — a rung for their company title. A department move clears it.';

-- ---------------------------------------------------------------------------
-- 4. Everything that asked the DEPARTMENT now asks the PERSON
-- ---------------------------------------------------------------------------

-- The derivation itself. Body unchanged apart from the home lookup; see
-- migration 20260915020000 for the reasoning it carries.
create or replace function public.comm_sync_position(p_staff_id uuid, p_actor uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status      text;
  v_reports_to  uuid;
  v_upline      uuid;
  v_title       uuid;
  v_department  uuid;
  v_on_comm     boolean;
  v_is_head     boolean;
  cur           public.comm_hierarchy%rowtype;
  v_scheme      uuid;
  v_floor       uuid;
  v_rank        uuid;
  v_from        date := public.comm_period_start();
begin
  select s.status, s.reports_to, s.title_id, s.department_id,
         coalesce(d.payroll_source = 'commission', false)
    into v_status, v_reports_to, v_title, v_department, v_on_comm
    from public.hr_staff_costs s
    left join public.departments d on d.id = s.department_id
   where s.id = p_staff_id;
  if not found then
    return;
  end if;

  -- Inactive people are on neither chart. Their positions are left exactly as
  -- they are: closing them at the end of last month would drop the commission
  -- of the month they left in, and that is payroll's call, not a trigger's.
  if v_status <> 'active' then
    return;
  end if;

  v_is_head := public.title_is_department_head(v_title);

  -- Not in a commission department, or heading one: no membership anywhere.
  if not v_on_comm or v_is_head then
    for cur in
      select h.* from public.comm_hierarchy h
       where h.staff_id = p_staff_id and h.effective_to is null
    loop
      if cur.effective_from >= v_from then
        delete from public.comm_hierarchy where id = cur.id;
      else
        update public.comm_hierarchy set effective_to = v_from - 1 where id = cur.id;
      end if;
    end loop;
    return;
  end if;

  -- THEIR home sub-department (2026-09-20), not the department's: the one
  -- reports_to and the company title describe FOR THEM. Every other
  -- sub-department's membership is its own chart's business, untouched here.
  v_scheme := public.comm_home_scheme_for_staff(p_staff_id);
  if v_scheme is null then
    return;
  end if;

  -- The commission line stops below a department head: reporting to one makes
  -- somebody the top of the engine's tree, and no override climbs past them.
  v_upline := v_reports_to;
  if v_upline is not null
     and public.title_is_department_head((select s.title_id from public.hr_staff_costs s where s.id = v_upline)) then
    v_upline := null;
  end if;

  select h.* into cur
    from public.comm_hierarchy h
   where h.staff_id = p_staff_id
     and h.scheme_id = v_scheme
     and h.effective_to is null
   order by h.effective_from desc
   limit 1;

  v_floor := public.comm_floor_rank(v_scheme, v_title);

  if cur.id is null then
    v_rank := v_floor;
  else
    v_rank := cur.rank_id;
    -- The ratchet: a title whose floor stands above the rank raises the rank;
    -- nothing here ever lowers one.
    if v_floor is not null and v_floor <> cur.rank_id
       and (select sort_order from public.comm_ranks where id = v_floor)
         > (select sort_order from public.comm_ranks where id = cur.rank_id) then
      v_rank := v_floor;
    end if;
  end if;

  -- No rung for their title on the home ladder: no rank yet, and rank_id is
  -- NOT NULL. The chart says so; a membership they already hold is kept.
  if v_rank is null then
    return;
  end if;

  -- Already the truth.
  if cur.id is not null
     and cur.upline_staff_id is not distinct from v_upline
     and cur.rank_id = v_rank
     and cur.title_id is not distinct from v_title then
    return;
  end if;

  -- Started this month: nothing has been computed from it, edit in place.
  if cur.id is not null and cur.effective_from >= v_from then
    update public.comm_hierarchy
       set upline_staff_id = v_upline,
           rank_id = v_rank,
           title_id = v_title
     where id = cur.id;
    return;
  end if;

  -- Older: close it and open the replacement from this month. The ranges abut
  -- without overlapping, which is what one_position_per_scheme demands.
  if cur.id is not null then
    update public.comm_hierarchy set effective_to = v_from - 1 where id = cur.id;
  end if;

  insert into public.comm_hierarchy
    (scheme_id, staff_id, title_id, upline_staff_id, rank_id, rate_mode, effective_from, created_by)
  values
    (v_scheme, p_staff_id, v_title, v_upline, v_rank, cur.rate_mode, v_from, p_actor);
end;
$$;

comment on function public.comm_sync_position(uuid, uuid) is
  'Derive one person''s HOME sub-department membership from hr_staff_costs: home = comm_home_scheme_for_staff (their own choice, else the department''s oldest), upline = reports_to (null when that manager heads the department), title = the company title, rank = that title''s floor (ratcheted up only). A department head holds no membership. Other sub-departments'' memberships are never touched. Effective-dated. Called by trigger; not for direct use.';

-- A choice of home changes the membership the roster describes, so the
-- derivation has to run when it is made.
drop trigger if exists hr_staff_costs_one_line_sync on public.hr_staff_costs;
create trigger hr_staff_costs_one_line_sync
  after insert or update of reports_to, title_id, department_id, status, home_sub_department_id
  on public.hr_staff_costs
  for each row execute function public.hr_staff_one_line_sync();

-- Who may hold downlines is a fact of the ladder somebody is ON, and Fair and
-- IR disagree about it (a Revenue Specialist may lead in IR and may not in
-- Fair, PR #140). So the company line asks the MANAGER's own home ladder.
create or replace function public.comm_staff_can_recruit(p_staff_id uuid, p_title_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when public.title_is_department_head(p_title_id) then true
    else (
      select bool_or(r.can_recruit)
        from public.comm_ranks r
       where r.scheme_id = public.comm_home_scheme_for_staff(p_staff_id)
         and r.title_id = p_title_id
    )
  end
$$;

revoke all on function public.comm_staff_can_recruit(uuid, uuid) from public, anon;
grant execute on function public.comm_staff_can_recruit(uuid, uuid) to authenticated;
comment on function public.comm_staff_can_recruit(uuid, uuid) is
  'May a title hold downlines on THIS person''s home ladder? The per-person twin of comm_title_can_recruit, which answers for the department''s default home.';

-- hr_staff_commission_line and apply_commission_run are long and almost
-- entirely unrelated to this change; each asks the department exactly where it
-- should now ask the person. Patch those calls in place rather than restating
-- three hundred lines that would then have to be diffed by eye, and fail the
-- migration loudly if the text they are patched from ever moves.
do $patch$
declare
  v_def text;
  v_out text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_staff_commission_line';

  v_out := replace(v_def,
    'public.comm_title_can_recruit(new.department_id, mgr.title_id)',
    'public.comm_staff_can_recruit(new.reports_to, mgr.title_id)');
  v_out := replace(v_out,
    'public.comm_title_can_recruit(new.department_id, new.title_id)',
    'public.comm_staff_can_recruit(new.id, new.title_id)');
  if v_out = v_def or v_out like '%comm_title_can_recruit(new.%' then
    raise exception 'hr_staff_commission_line no longer contains the recruit checks this migration patches';
  end if;
  execute v_out;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'apply_commission_run';
  v_out := replace(v_def,
    'comm_scheme_for_department(v_p.department_id)',
    'comm_home_scheme_for_staff(v_p.staff_id)');
  if v_out = v_def then
    raise exception 'apply_commission_run no longer contains the home-scheme lookup this migration patches';
  end if;
  execute v_out;
end
$patch$;

-- ---------------------------------------------------------------------------
-- 5. Leaving home
-- ---------------------------------------------------------------------------
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
  v_leaves_home boolean := false;
  v_new_home_scheme uuid;
  v_new_home_sub uuid;
  v_new_home_upline uuid;
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
  v_home := public.comm_home_scheme_for_staff(p_staff_id);
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
        raise exception 'Set up the receiving department''s home scheme and a ladder rung for this title first.' using errcode = '23EMP';
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
    -- home_sub_department_id goes back to the receiving department's default:
    -- a choice made inside Revenue means nothing in Marketing.
    update public.hr_staff_costs set department_id = p_destination_id, title_id = p_title_id,
      designation = v_title.name, reports_to = null, home_sub_department_id = null where id = p_staff_id;
    if not found then raise exception 'This employee is not writable by this account.' using errcode = '42501'; end if;
    if v_target.payroll_source = 'commission' and not exists (
      select 1 from public.comm_hierarchy where staff_id = p_staff_id and scheme_id = v_target_home and effective_to is null
    ) then
      raise exception 'The receiving membership could not be created. No department changes were saved.' using errcode = '23EMP';
    end if;
    return;
  end if;

  -- LEAVING HOME (2026-09-20). The home sub-department is the person's own
  -- fact, so leaving it is allowed while they still work somewhere else in the
  -- department: home simply moves there. Their ONLY membership is a different
  -- thing — that is leaving the company, and Terminate employee records it.
  v_leaves_home := p_source_scheme_id = v_home;
  if v_leaves_home then
    -- Their company reports would be left pointing at somebody who is no
    -- longer drawn on the chart those reports are drawn on.
    if exists (select 1 from public.hr_staff_costs where reports_to = p_staff_id and status = 'active') then
      raise exception 'People still report to % on the company chart. Move those reporting lines first.', v_staff.employee_name
        using errcode = '23EMP';
    end if;
    if p_action = 'move' then
      v_new_home_scheme := p_destination_id;
    else
      select h.scheme_id into v_new_home_scheme
        from public.comm_hierarchy h
        join public.comm_schemes sc on sc.id = h.scheme_id and sc.is_active and sc.effective_to is null
        join public.comm_sub_departments sd on sd.id = sc.sub_department_id and sd.is_active
       where h.staff_id = p_staff_id and h.effective_to is null
         and h.scheme_id <> p_source_scheme_id
         and sd.department_id = v_staff.department_id
       order by sd.created_at, sd.id
       limit 1;
      if v_new_home_scheme is null then
        raise exception 'This is the only department % works in. Use Terminate employee to record that they have left the company.', v_staff.employee_name
          using errcode = '23EMP';
      end if;
    end if;
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
      if v_rank is null then raise exception 'That title has no rung on the receiving sub-department''s ladder.' using errcode = '23EMP'; end if;
      insert into public.comm_hierarchy(scheme_id, staff_id, title_id, upline_staff_id, rank_id, rate_mode, effective_from, created_by)
        values(p_destination_id, p_staff_id, p_title_id, null, v_rank, null, v_from, auth.uid());
    end if;
    -- If already present (including home), their destination rank, title,
    -- upline and rate mode are deliberately untouched.
  end if;

  if v_leaves_home then
    select sc.sub_department_id into v_new_home_sub
      from public.comm_schemes sc where sc.id = v_new_home_scheme;
    -- The company line follows them. Whoever they already earn under on the
    -- receiving chart becomes their reports_to, so the roster starts by
    -- AGREEING with that chart instead of flattening it: comm_sync_position
    -- would otherwise write their old line over an upline a human set there.
    select h.upline_staff_id into v_new_home_upline
      from public.comm_hierarchy h
     where h.staff_id = p_staff_id and h.scheme_id = v_new_home_scheme and h.effective_to is null;
    update public.hr_staff_costs
       set home_sub_department_id = v_new_home_sub, reports_to = v_new_home_upline
     where id = p_staff_id;
    if not found then raise exception 'This employee is not writable by this account.' using errcode = '42501'; end if;
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
  'Atomically remove a sub-department membership, move an employee, or record completed employment. Requires revenue; company moves and termination also require team. Leaving the HOME sub-department moves the person''s home to the sub-department they keep working in and carries their company reporting line to the upline they already have there; it is refused when it is their only one. Keeps payroll history and never reassigns downlines.';
