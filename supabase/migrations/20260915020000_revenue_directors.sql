-- ============================================================================
-- REVENUE DIRECTOR — the head above the ladder (user, 2026-09-11)
--
-- "Revenue Director 本身不会进入任何 Rank，也不会出现在该 Department 的 Title
--  Ladder 里面 … 会出现在 Hierarchy Chart 中，但该 Hierarchy 仅用于 reporting，
--  不用于 commission overriding … Team Leader 的 upline 直接就是 Revenue
--  Director … 整个 Department 都是直接 report to Revenue Director … 有些
--  department 会同时 report 给两位 Revenue Director（FAIR 报给 Chris 和 Peter）"
--
-- Three facts, each kept in one place:
--
--   1. `titles.is_department_head` — a title that HEADS its department. It
--      stands above the commission ladder: no rung may point at it, nobody
--      holding it may hold a membership (no rank, no override), and inside a
--      commission department it is the one title everybody may report to
--      without it being on the ladder.
--   2. `comm_sub_department_directors` — which head(s) a sub-department
--      reports to. Fair reports to Peter and Kris; IR to Peter. Everybody at
--      the top of a tree in that sub-department reports to them — DERIVED on
--      the charts, never written per person: two directors do not fit in one
--      `reports_to` column, and the fact belongs to the sub-department.
--   3. The commission line STOPS below a head. `comm_sync_position` copies
--      `reports_to` into the home membership's upline unless the manager
--      heads the department, in which case the upline is null: the leader is
--      the top of the engine's tree, and no override climbs past them.
--
-- The CEO above the directors is a later step (user: "CEO 部分后续再处理").
--
-- Idempotent on purpose: the live database receives this through MCP, which
-- records its own version, so a later `supabase db push` of this file must be
-- a no-op rather than a second creation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The title that heads its department.
-- ----------------------------------------------------------------------------

alter table public.titles
  add column if not exists is_department_head boolean not null default false;

comment on column public.titles.is_department_head is
  'Heads its department (2026-09-11). Above the commission ladder: no rung, no membership, no override; inside a commission department every reporting line may end at it. Revenue Director.';

-- The Revenue Department already has the title; it was filed as an ordinary
-- one with no rung, so its two holders stood on the Fair chart as "no rank yet".
update public.titles t
   set is_department_head = true
  from public.departments d
 where d.id = t.department_id
   and d.payroll_source = 'commission'
   and lower(btrim(t.name)) = 'revenue director'
   and not t.is_department_head;

create or replace function public.title_is_department_head(p_title_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce((select t.is_department_head from public.titles t where t.id = p_title_id), false)
$$;

comment on function public.title_is_department_head(uuid) is
  'Does this title head its department? False for null, and for a title that does not exist.';

-- ----------------------------------------------------------------------------
-- 2. Which head(s) a sub-department reports to.
-- ----------------------------------------------------------------------------

create table if not exists public.comm_sub_department_directors (
  sub_department_id uuid not null references public.comm_sub_departments(id) on delete cascade,
  staff_id          uuid not null references public.hr_staff_costs(id) on delete cascade,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  primary key (sub_department_id, staff_id)
);

comment on table public.comm_sub_department_directors is
  'Which department head(s) a sub-department reports to (2026-09-11). Everybody at the top of a tree there reports to them — derived on the charts, never written per person. Reporting only: no override reaches a director.';

create index if not exists idx_comm_sub_department_directors_staff
  on public.comm_sub_department_directors (staff_id);

alter table public.comm_sub_department_directors enable row level security;

drop policy if exists comm_sub_department_directors_hr_all on public.comm_sub_department_directors;
create policy comm_sub_department_directors_hr_all
  on public.comm_sub_department_directors
  for all
  using ((select has_scope(array['hr'])))
  with check ((select has_scope(array['hr'])));

drop policy if exists comm_sub_department_directors_principal_all on public.comm_sub_department_directors;
create policy comm_sub_department_directors_principal_all
  on public.comm_sub_department_directors
  for all
  using ((select has_scope(array['admin'])))
  with check ((select has_scope(array['admin'])));

-- A director must be on the roster, in the sub-department's own department,
-- and hold a title that heads it. Refused in a sentence (SQLSTATE 23DIR).
create or replace function public.comm_sub_department_directors_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  who record;
  sub record;
begin
  select s.employee_name, s.department_id, s.title_id, t.name as title
    into who
    from public.hr_staff_costs s
    left join public.titles t on t.id = s.title_id
   where s.id = new.staff_id;
  if not found then
    raise exception 'That person is not on the roster.' using errcode = '23DIR';
  end if;

  select sd.name, sd.department_id, coalesce(d.name, 'its department') as department
    into sub
    from public.comm_sub_departments sd
    left join public.departments d on d.id = sd.department_id
   where sd.id = new.sub_department_id;
  if not found then
    raise exception 'That sub-department does not exist.' using errcode = '23DIR';
  end if;

  if who.department_id is distinct from sub.department_id then
    raise exception '% is not in % — only a head of that department can direct %.',
      who.employee_name, sub.department, sub.name
      using errcode = '23DIR';
  end if;

  if not public.title_is_department_head(who.title_id) then
    raise exception '% holds % — a director must hold a title that heads the department. Tick "Heads the department" on the title under People › Roles first.',
      who.employee_name, coalesce(who.title, 'no title')
      using errcode = '23DIR';
  end if;

  return new;
end;
$$;

drop trigger if exists comm_sub_department_directors_guard on public.comm_sub_department_directors;
create trigger comm_sub_department_directors_guard
  before insert or update on public.comm_sub_department_directors
  for each row execute function public.comm_sub_department_directors_guard();

-- ----------------------------------------------------------------------------
-- 3. A head has no rung and no membership.
-- ----------------------------------------------------------------------------

create or replace function public.comm_ranks_no_department_head()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text;
begin
  if public.title_is_department_head(new.title_id) then
    select name into v_name from public.titles where id = new.title_id;
    raise exception '% heads the department and stands above the ladder — it cannot hold a rung or a rank.',
      coalesce(v_name, 'That title')
      using errcode = '23DIR';
  end if;
  return new;
end;
$$;

drop trigger if exists comm_ranks_no_department_head on public.comm_ranks;
create trigger comm_ranks_no_department_head
  before insert or update of title_id on public.comm_ranks
  for each row execute function public.comm_ranks_no_department_head();

create or replace function public.comm_hierarchy_no_department_head()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name          text;
  v_company_title uuid;
begin
  select s.employee_name, s.title_id
    into v_name, v_company_title
    from public.hr_staff_costs s
   where s.id = new.staff_id;

  if public.title_is_department_head(new.title_id)
     or public.title_is_department_head(v_company_title) then
    raise exception '% heads the department and holds no rank — the reporting line ends at them, and no override reaches them.',
      coalesce(v_name, 'A department head')
      using errcode = '23DIR';
  end if;
  return new;
end;
$$;

drop trigger if exists comm_hierarchy_no_department_head on public.comm_hierarchy;
create trigger comm_hierarchy_no_department_head
  before insert or update of staff_id, title_id on public.comm_hierarchy
  for each row execute function public.comm_hierarchy_no_department_head();

-- ----------------------------------------------------------------------------
-- 4. Everybody may report to a head. `comm_title_can_recruit` is what the
--    reporting-line trigger and the app's `loadLineFacts` ask; a head title
--    answers yes without a rung. NULL (not on the ladder) is kept for every
--    other title without one.
-- ----------------------------------------------------------------------------

create or replace function public.comm_title_can_recruit(p_department_id uuid, p_title_id uuid)
returns boolean
language sql
stable
as $$
  select case
    when public.title_is_department_head(p_title_id) then true
    else (
      select bool_or(r.can_recruit)
        from public.comm_ranks r
       where r.scheme_id = public.comm_scheme_for_department(p_department_id)
         and r.title_id = p_title_id
    )
  end
$$;

-- ----------------------------------------------------------------------------
-- 5. The home sync: a head holds no membership, and the commission line stops
--    below one. Otherwise identical to migration 20260910160000.
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
  -- A head holds no rank and takes no override (user, 2026-09-11), so every
  -- membership they held closes — outright when it started this month, at the
  -- end of last month otherwise — exactly as if they had left the department.
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

  -- The HOME sub-department: the one `reports_to` and the company title
  -- describe. Other sub-departments' memberships are their own charts'
  -- business and are never touched from here.
  v_scheme := public.comm_scheme_for_department(v_department);
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

  -- No rung for their title on the home ladder: no rank yet, and `rank_id` is
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
  -- without overlapping, which is what `one_position_per_scheme` demands.
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
  'Derive one person''s HOME sub-department membership from hr_staff_costs: upline = reports_to (null when that manager heads the department), title = the company title, rank = that title''s floor (ratcheted up only). A department head holds no membership. Other sub-departments'' memberships are never touched. Effective-dated. Called by trigger; not for direct use.';

-- Becoming a head, or ceasing to be one, moves where the commission line
-- stops for everybody who reports to that person, so their reports are
-- derived again in the same statement. A head who stops heading a department
-- directs none of its sub-departments any more.
create or replace function public.hr_staff_one_line_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r          record;
  v_is_head  boolean := public.title_is_department_head(new.title_id);
  v_was_head boolean := false;
begin
  perform public.comm_sync_position(new.id, auth.uid());

  if tg_op = 'UPDATE'
     and (new.title_id is distinct from old.title_id
          or new.department_id is distinct from old.department_id) then
    v_was_head := public.title_is_department_head(old.title_id);

    if v_is_head or v_was_head then
      for r in
        select s.id
          from public.hr_staff_costs s
         where s.reports_to = new.id
           and s.status = 'active'
      loop
        perform public.comm_sync_position(r.id, auth.uid());
      end loop;
    end if;

    delete from public.comm_sub_department_directors x
     using public.comm_sub_departments sd
     where x.staff_id = new.id
       and sd.id = x.sub_department_id
       and (not v_is_head or sd.department_id is distinct from new.department_id);
  end if;

  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Who directs what today (user, 2026-09-11): Fair reports to Peter and
--    Kris ("Chris"), IR to Peter. Looked up by name and skipped when absent,
--    so another installation applies cleanly.
-- ----------------------------------------------------------------------------

do $$
declare
  v_fair  uuid;
  v_ir    uuid;
  v_peter uuid;
  v_kris  uuid;
begin
  select sd.id into v_fair
    from public.comm_sub_departments sd
    join public.departments d on d.id = sd.department_id and d.payroll_source = 'commission'
   where lower(btrim(sd.name)) = 'fair'
   limit 1;
  select sd.id into v_ir
    from public.comm_sub_departments sd
    join public.departments d on d.id = sd.department_id and d.payroll_source = 'commission'
   where lower(btrim(sd.name)) = 'ir'
   limit 1;
  select s.id into v_peter
    from public.hr_staff_costs s
   where s.status = 'active'
     and public.title_is_department_head(s.title_id)
     and upper(btrim(s.employee_name)) = 'PETER'
   limit 1;
  select s.id into v_kris
    from public.hr_staff_costs s
   where s.status = 'active'
     and public.title_is_department_head(s.title_id)
     and upper(btrim(s.employee_name)) = 'KRIS'
   limit 1;

  if v_fair is not null and v_peter is not null then
    insert into public.comm_sub_department_directors (sub_department_id, staff_id)
    values (v_fair, v_peter) on conflict do nothing;
  end if;
  if v_fair is not null and v_kris is not null then
    insert into public.comm_sub_department_directors (sub_department_id, staff_id)
    values (v_fair, v_kris) on conflict do nothing;
  end if;
  if v_ir is not null and v_peter is not null then
    insert into public.comm_sub_department_directors (sub_department_id, staff_id)
    values (v_ir, v_peter) on conflict do nothing;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 7. Backfill: derive again everybody the new rule touches — heads (whose
--    memberships close) and anybody reporting to one (whose upline becomes
--    null). Idempotent: a membership already telling the truth is left alone.
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
       and (public.title_is_department_head(s.title_id)
            or exists (
              select 1 from public.hr_staff_costs m
               where m.id = s.reports_to
                 and public.title_is_department_head(m.title_id)))
     order by s.employee_name
  loop
    perform public.comm_sync_position(r.id, null);
  end loop;
end
$$;

-- ----------------------------------------------------------------------------
-- Guard: no head holds a membership, no rung points at a head title, and every
-- active person's home membership sits on the derived line.
-- ----------------------------------------------------------------------------

do $$
declare
  v_head_members integer;
  v_head_rungs   integer;
  v_drift        integer;
begin
  select count(*) into v_head_members
    from public.comm_hierarchy h
    join public.hr_staff_costs s on s.id = h.staff_id
   where h.effective_to is null
     and s.status = 'active'
     and (public.title_is_department_head(h.title_id)
          or public.title_is_department_head(s.title_id));

  select count(*) into v_head_rungs
    from public.comm_ranks r
   where public.title_is_department_head(r.title_id);

  select count(*) into v_drift
    from public.comm_hierarchy h
    join public.hr_staff_costs s on s.id = h.staff_id
   where h.effective_to is null
     and s.status = 'active'
     and h.scheme_id = public.comm_scheme_for_department(s.department_id)
     and h.upline_staff_id is distinct from (
       case
         when public.title_is_department_head((select m.title_id from public.hr_staff_costs m where m.id = s.reports_to))
         then null
         else s.reports_to
       end);

  if v_head_members > 0 or v_head_rungs > 0 or v_drift > 0 then
    raise exception 'revenue directors: % memberships held by a department head, % rungs on a head title, % home memberships off the derived line',
      v_head_members, v_head_rungs, v_drift;
  end if;
end
$$;
