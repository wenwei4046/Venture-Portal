-- A commission department head has a company reporting line, not a commission
-- upline: heads hold no membership and receive no override. Allow that person
-- to report to a company manager outside Revenue. Ordinary members retain the
-- existing boundary/recruit rules; the separate ladder and cycle triggers are
-- unchanged. comm_sync_position continues to stop commission below each head.
create or replace function public.hr_staff_commission_line()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me_comm       boolean;
  v_me_dept       text;
  v_me_head       boolean;
  v_new_title     text;
  mgr            record;
  rep            record;
  v_can          boolean;
  v_dept_changed boolean := tg_op = 'UPDATE' and new.department_id is distinct from old.department_id;
  v_line_changed boolean := tg_op = 'INSERT' or new.reports_to is distinct from old.reports_to;
  v_title_changed boolean := tg_op = 'UPDATE' and new.title_id is distinct from old.title_id;
  v_lost_head    boolean := v_title_changed and public.title_is_department_head(old.title_id)
                            and not public.title_is_department_head(new.title_id);
begin
  select coalesce(d.payroll_source = 'commission', false), d.name
    into v_me_comm, v_me_dept
    from public.departments d
   where d.id = new.department_id;
  v_me_comm := coalesce(v_me_comm, false);
  v_me_dept := coalesce(v_me_dept, 'no department');
  v_me_head := v_me_comm and public.title_is_department_head(new.title_id);

  -- Home roots also report to every assigned director on the company chart.
  -- Those edges are derived, so the stored-reports_to cycle trigger alone
  -- cannot stop a director reporting back under their own root/descendant.
  -- Include all directors, not only the first one displayed on a tree. Rank
  -- cannot substitute for this check: a head may be unranked or share a level.
  if v_me_head and new.reports_to is not null
     and (v_line_changed or v_dept_changed or v_title_changed) then
    if exists (
      with recursive roster as (
        select s.id, s.reports_to, s.department_id, s.title_id, s.status
          from public.hr_staff_costs s where s.id <> new.id
        union all
        select new.id, new.reports_to, new.department_id, new.title_id, new.status
      ), lines as (
        select s.id as staff_id, s.reports_to as manager_id
          from roster s where s.reports_to is not null
        union
        select s.id, head.id
          from roster s
          join public.departments d on d.id = s.department_id and d.payroll_source = 'commission'
          join lateral (
            select sd.id from public.comm_sub_departments sd
             where sd.department_id = s.department_id and sd.is_active
             order by sd.created_at, sd.id limit 1
          ) home on true
          join public.comm_sub_department_directors assigned on assigned.sub_department_id = home.id
          join roster head on head.id = assigned.staff_id and head.status = 'active'
           and head.department_id = s.department_id and public.title_is_department_head(head.title_id)
         where s.status = 'active' and s.reports_to is null
           and not public.title_is_department_head(s.title_id)
      ), ancestors(staff_id) as (
        select new.reports_to
        union
        select line.manager_id from lines line join ancestors a on a.staff_id = line.staff_id
      )
      select 1 from ancestors where staff_id = new.id
    ) then
      raise exception 'That would put % under their own report', new.employee_name
        using errcode = '23514';
    end if;
  end if;

  -- Only the report's commission-head role makes this a company-only line.
  -- Recheck a retained line when its head title is removed, too: it will once
  -- again become a commission upline even though reports_to did not change.
  if not v_me_head and new.reports_to is not null
     and (v_line_changed or v_dept_changed or v_lost_head) then
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

  -- Moving a manager cannot strand ordinary reports across the commission
  -- boundary. A commission head's company-only line may cross that boundary.
  if v_dept_changed then
    select s.employee_name
      into rep
      from public.hr_staff_costs s
      left join public.departments d on d.id = s.department_id
     where s.reports_to = new.id
       and s.status = 'active'
       and coalesce(d.payroll_source = 'commission', false) <> v_me_comm
       and not (coalesce(d.payroll_source = 'commission', false)
                and public.title_is_department_head(s.title_id))
     limit 1;
    if found then
      raise exception '% cannot move to %: % still reports to them, and inside a commission department the reporting line is also the commission upline. Clear their line first.',
        new.employee_name, v_me_dept, rep.employee_name
        using errcode = '23BND';
    end if;
  end if;

  -- Only actual commission downlines require a recruiting title. A head who
  -- reports here holds no commission membership and therefore no downline.
  if v_title_changed and v_me_comm then
    v_can := public.comm_title_can_recruit(new.department_id, new.title_id);
    if v_can is distinct from true then
      select s.employee_name
        into rep
        from public.hr_staff_costs s
        left join public.departments d on d.id = s.department_id
       where s.reports_to = new.id
         and s.status = 'active'
         and not (coalesce(d.payroll_source = 'commission', false)
                  and public.title_is_department_head(s.title_id))
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

comment on function public.hr_staff_commission_line() is
  'Enforce commission boundary and recruiting rules for ordinary reporting lines. A commission department head has a company-only line, with no membership or override; ladder and cycle checks still apply.';
