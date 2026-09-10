-- ============================================================================
-- ONE LINE (user, 2026-09-10)
--
-- "reporting line 跟 commission position 它是同样的 … 它本来应该是绑定的。
--  主要的东西是：你今天有什么 Rank？"
--
-- Inside a department the commission engine pays (`departments.payroll_source
-- = 'commission'`), who somebody reports to IS who earns the override on their
-- sales. There is no case where the two are different people. So the position
-- row the engine reads (`comm_hierarchy`) is no longer a second fact somebody
-- has to "place": it is DERIVED from the roster, here, by trigger —
--
--   upline  = hr_staff_costs.reports_to            always
--   rank    = the floor rung of the title they hold, when they are first
--             put on the ladder; raised (never lowered) when the title's
--             floor climbs above it; set by hand on the Team tab
--   scheme  = the department's sub-department's live scheme
--
-- — and kept effective-dated exactly as the app's writers kept it: a position
-- that started this month is edited in place, an older one is closed at the
-- end of last month and reopened, so a month already computed keeps the chart
-- it was computed against.
--
-- Two rules of the reporting line come with it, both refused BEFORE the write
-- (`hr_staff_costs_commission_line`), in sentences a person can act on:
--
--   boundary  a line may not cross a commission department's edge, in either
--             direction (the app has said this since 2026-09-08; now the
--             database does too, so an import or a form cannot slip past it);
--   recruit   inside a commission department you may only report to somebody
--             whose title may hold downlines (SRS and above on Fair's
--             ladder). A Revenue Specialist cannot lead anyone, so an RS
--             reporting to an RS is not a line that exists.
--
-- Backfill: every active person in a commission department gets their position
-- from this month, along the line they already report on, at their title's
-- floor rank. The three placed by hand keep the rank they were placed at.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- YYYY-MM-01 of today in Malaysian wall-clock time — the same month
-- `getPeriodMonth()` answers in the app. The server clock is UTC, and for the
-- first eight hours of the 1st it is still last month there; deciding the
-- period from UTC would edit a month already computed.
create or replace function public.comm_period_start()
returns date
language sql
stable
as $$
  select date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date
$$;

comment on function public.comm_period_start() is
  'The first day of the current commission period, in Malaysian time. Twin of getPeriodMonth() in lib/utils.ts.';

-- The live scheme a department''s people earn under. A department has one
-- sub-department today (Fair); when it grows a second, which one a person
-- belongs to needs a column of its own — until then the oldest active
-- sub-department is the answer, and a department with none has no scheme.
create or replace function public.comm_scheme_for_department(p_department_id uuid)
returns uuid
language sql
stable
as $$
  select sc.id
    from public.comm_sub_departments sd
    join public.comm_schemes sc on sc.sub_department_id = sd.id
   where sd.department_id = p_department_id
     and sd.is_active
     and sc.is_active
     and sc.effective_to is null
   order by sd.created_at, sc.effective_from desc
   limit 1
$$;

comment on function public.comm_scheme_for_department(uuid) is
  'The live scheme of the department''s (oldest active) sub-department, or null. A person → sub-department column is owed the day a department has two.';

-- The rung a title guarantees: its lowest on this scheme's ladder. Null when
-- the ladder does not carry the title — a person with no rung has no rank yet
-- and cannot hold a position (`rank_id` is NOT NULL).
create or replace function public.comm_floor_rank(p_scheme_id uuid, p_title_id uuid)
returns uuid
language sql
stable
as $$
  select r.id
    from public.comm_ranks r
   where r.scheme_id = p_scheme_id
     and r.title_id = p_title_id
   order by r.sort_order
   limit 1
$$;

-- May somebody holding this title hold downlines in this department? True when
-- any rung of the title may recruit, false when it has rungs and none may,
-- NULL when the department's ladders do not carry the title at all.
create or replace function public.comm_title_can_recruit(p_department_id uuid, p_title_id uuid)
returns boolean
language sql
stable
as $$
  select bool_or(r.can_recruit)
    from public.comm_ranks r
    join public.comm_schemes sc on sc.id = r.scheme_id
    join public.comm_sub_departments sd on sd.id = sc.sub_department_id
   where sd.department_id = p_department_id
     and r.title_id = p_title_id
$$;

-- ----------------------------------------------------------------------------
-- The sync: make one person's position match the roster.
-- ----------------------------------------------------------------------------

create or replace function public.comm_sync_position(p_staff_id uuid, p_actor uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status      text;
  v_reports_to  uuid;
  v_title       uuid;
  v_department  uuid;
  v_on_comm     boolean;
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

  -- Inactive people are on neither chart. Their position is left exactly as
  -- it is: closing it at the end of last month would drop the commission of
  -- the month they left in, and that is payroll's call, not a trigger's.
  if v_status <> 'active' then
    return;
  end if;

  select h.* into cur
    from public.comm_hierarchy h
   where h.staff_id = p_staff_id
     and h.effective_to is null
   order by h.effective_from desc
   limit 1;

  -- Not in a commission department: no reporting line there, so no position.
  if not v_on_comm then
    if cur.id is not null then
      if cur.effective_from >= v_from then
        delete from public.comm_hierarchy where id = cur.id;
      else
        update public.comm_hierarchy set effective_to = v_from - 1 where id = cur.id;
      end if;
    end if;
    return;
  end if;

  v_scheme := public.comm_scheme_for_department(v_department);
  -- A commission department with no live scheme yet has nothing to hold a
  -- position in. Whatever they hold is left alone; this is a setup gap, not a
  -- fact about the person.
  if v_scheme is null then
    return;
  end if;

  v_floor := public.comm_floor_rank(v_scheme, v_title);

  if cur.id is null or cur.scheme_id <> v_scheme then
    v_rank := v_floor;
  else
    v_rank := cur.rank_id;
    -- The ratchet (user 2026-09-02, 2026-09-07): a title whose floor stands
    -- above the rank raises the rank; nothing here ever lowers one, so a
    -- placement above the title survives a re-save of that title.
    if v_floor is not null and v_floor <> cur.rank_id
       and (select sort_order from public.comm_ranks where id = v_floor)
         > (select sort_order from public.comm_ranks where id = cur.rank_id) then
      v_rank := v_floor;
    end if;
  end if;

  -- No rung for their title: no rank yet, and `rank_id` is NOT NULL. The
  -- chart says so; a position they already hold is kept as it is.
  if v_rank is null then
    return;
  end if;

  -- Already the truth.
  if cur.id is not null
     and cur.scheme_id = v_scheme
     and cur.upline_staff_id is not distinct from v_reports_to
     and cur.rank_id = v_rank then
    return;
  end if;

  -- Started this month: nothing has been computed from it, edit in place.
  if cur.id is not null and cur.scheme_id = v_scheme and cur.effective_from >= v_from then
    update public.comm_hierarchy
       set upline_staff_id = v_reports_to,
           rank_id = v_rank
     where id = cur.id;
    return;
  end if;

  -- Older, or under another scheme: close it and open the replacement from
  -- this month. The ranges abut without overlapping, which is what
  -- `one_position_at_a_time` demands.
  if cur.id is not null then
    if cur.effective_from >= v_from then
      delete from public.comm_hierarchy where id = cur.id;
    else
      update public.comm_hierarchy set effective_to = v_from - 1 where id = cur.id;
    end if;
  end if;

  insert into public.comm_hierarchy
    (scheme_id, staff_id, upline_staff_id, rank_id, rate_mode, effective_from, created_by)
  values
    (v_scheme, p_staff_id, v_reports_to, v_rank, cur.rate_mode, v_from, p_actor);
end;
$$;

comment on function public.comm_sync_position(uuid, uuid) is
  'Derive one person''s open comm_hierarchy position from hr_staff_costs: upline = reports_to, rank = title floor (ratcheted up only), scheme = the department''s. Effective-dated like the app''s writers. Called by trigger; not for direct use.';

-- The trigger runs as the table owner (security definer); nobody needs to call
-- this themselves, and a stray RPC to it is a write nobody asked for.
revoke execute on function public.comm_sync_position(uuid, uuid) from public, anon, authenticated;

create or replace function public.hr_staff_one_line_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.comm_sync_position(new.id, auth.uid());
  return null;
end;
$$;

drop trigger if exists hr_staff_costs_one_line_sync on public.hr_staff_costs;
create trigger hr_staff_costs_one_line_sync
  after insert or update of reports_to, title_id, department_id, status on public.hr_staff_costs
  for each row execute function public.hr_staff_one_line_sync();

-- ----------------------------------------------------------------------------
-- The two rules of a reporting line in a commission department, refused
-- before the write. The app refuses the same lines before the round trip, in
-- the same words (`lib/hierarchy-boundary.ts`); this is the backstop, as with
-- the ladder and the cycle.
-- ----------------------------------------------------------------------------

create or replace function public.hr_staff_commission_line()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me_comm       boolean;
  v_me_dept       text;
  v_new_title     text;
  mgr             record;
  rep             record;
  v_can           boolean;
  v_dept_changed  boolean := tg_op = 'UPDATE' and new.department_id is distinct from old.department_id;
  v_line_changed  boolean := tg_op = 'INSERT' or new.reports_to is distinct from old.reports_to;
  v_title_changed boolean := tg_op = 'UPDATE' and new.title_id is distinct from old.title_id;
begin
  select coalesce(d.payroll_source = 'commission', false), d.name
    into v_me_comm, v_me_dept
    from public.departments d
   where d.id = new.department_id;
  v_me_comm := coalesce(v_me_comm, false);
  v_me_dept := coalesce(v_me_dept, 'no department');

  -- The line above them, when it is drawn or when they change department
  -- underneath it.
  if new.reports_to is not null and (v_line_changed or v_dept_changed) then
    select s.employee_name,
           s.title_id,
           t.name as title,
           coalesce(d.name, 'no department') as dept,
           coalesce(d.payroll_source = 'commission', false) as comm
      into mgr
      from public.hr_staff_costs s
      left join public.titles t on t.id = s.title_id
      left join public.departments d on d.id = s.department_id
     where s.id = new.reports_to;

    if found then
      if mgr.comm <> v_me_comm then
        if v_me_comm then
          raise exception '% is in % and % is not — % is in %. Inside a commission department the reporting line is also the commission upline, so this would put the override on somebody the Revenue chart cannot show. Pick a manager in %, or move % into it first.',
            new.employee_name, v_me_dept, mgr.employee_name, mgr.employee_name, mgr.dept, v_me_dept, mgr.employee_name
            using errcode = '23BND';
        else
          raise exception '% is in % and % is not — % is in %. The Revenue chart draws % and nothing else, so % would be a report that never appears on it. Move % into % first if they belong there.',
            mgr.employee_name, mgr.dept, new.employee_name, new.employee_name, v_me_dept, mgr.dept, new.employee_name, new.employee_name, mgr.dept
            using errcode = '23BND';
        end if;
      end if;

      if v_me_comm then
        v_can := public.comm_title_can_recruit(new.department_id, mgr.title_id);
        if v_can is distinct from true then
          if mgr.title is null then
            raise exception '% cannot report to %: % holds no title on the commission ladder, so nobody can earn under them. Give them a title first.',
              new.employee_name, mgr.employee_name, mgr.employee_name
              using errcode = '23REC';
          else
            raise exception '% cannot report to %: a % cannot hold downlines. Inside a commission department the reporting line is also the commission upline, so pick somebody whose title may recruit.',
              new.employee_name, mgr.employee_name, mgr.title
              using errcode = '23REC';
          end if;
        end if;
      end if;
    end if;
  end if;

  -- Leaving their reports behind on the other side of the edge.
  if v_dept_changed then
    select s.employee_name
      into rep
      from public.hr_staff_costs s
      left join public.departments d on d.id = s.department_id
     where s.reports_to = new.id
       and s.status = 'active'
       and coalesce(d.payroll_source = 'commission', false) <> v_me_comm
     limit 1;
    if found then
      raise exception '% cannot move to %: % still reports to them, and inside a commission department the reporting line is also the commission upline. Clear their line first.',
        new.employee_name, v_me_dept, rep.employee_name
        using errcode = '23BND';
    end if;
  end if;

  -- A title that may no longer hold downlines, while somebody still reports
  -- to them. (The ladder trigger already refuses a title that falls below a
  -- report's; this is the case the ladder allows — same level — and the
  -- commission rule does not.)
  if v_title_changed and v_me_comm then
    v_can := public.comm_title_can_recruit(new.department_id, new.title_id);
    if v_can is distinct from true then
      select s.employee_name
        into rep
        from public.hr_staff_costs s
       where s.reports_to = new.id
         and s.status = 'active'
       limit 1;
      if found then
        select name into v_new_title from public.titles where id = new.title_id;
        raise exception '% cannot become %: % reports to them, and that title cannot hold downlines. Move their reports first.',
          new.employee_name, coalesce(v_new_title, 'untitled'), rep.employee_name
          using errcode = '23REC';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists hr_staff_costs_commission_line on public.hr_staff_costs;
create trigger hr_staff_costs_commission_line
  before insert or update of reports_to, title_id, department_id on public.hr_staff_costs
  for each row execute function public.hr_staff_commission_line();

-- ----------------------------------------------------------------------------
-- Backfill: everybody active in a commission department, managers first so
-- the cycle trigger on comm_hierarchy always finds the line above already
-- drawn. Idempotent — a position that already tells the truth is left alone.
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select s.id
      from public.hr_staff_costs s
      join public.departments d on d.id = s.department_id and d.payroll_source = 'commission'
     where s.status = 'active'
     order by s.reports_to nulls first, s.employee_name
  loop
    perform public.comm_sync_position(r.id, null);
  end loop;
end
$$;

-- ----------------------------------------------------------------------------
-- Guard: the binding holds. Every active person in a commission department
-- whose title has a rung holds an open position, and no open position of an
-- active person points anywhere but along their reporting line.
-- ----------------------------------------------------------------------------

do $$
declare
  v_missing integer;
  v_drift   integer;
begin
  select count(*)
    into v_missing
    from public.hr_staff_costs s
    join public.departments d on d.id = s.department_id and d.payroll_source = 'commission'
   where s.status = 'active'
     and public.comm_floor_rank(public.comm_scheme_for_department(s.department_id), s.title_id) is not null
     and not exists (
       select 1 from public.comm_hierarchy h
        where h.staff_id = s.id and h.effective_to is null
     );

  select count(*)
    into v_drift
    from public.comm_hierarchy h
    join public.hr_staff_costs s on s.id = h.staff_id
   where h.effective_to is null
     and s.status = 'active'
     and h.upline_staff_id is distinct from s.reports_to;

  if v_missing > 0 or v_drift > 0 then
    raise exception 'one line: % active commission staff without a position, % open positions off their reporting line',
      v_missing, v_drift;
  end if;
end
$$;
