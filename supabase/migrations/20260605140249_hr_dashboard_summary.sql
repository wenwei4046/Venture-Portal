-- HR Overview dashboard RPC — one round-trip returning all HR data for a
-- period. Replaces the dashboard's 8-query fan-out that drove the old
-- 8-step Monthly Cycle board (removed: under the post-mig-278 flow HR's job
-- is just Import Employment List · Import Payroll · Calculate Director
-- Salary). Aggregate-only payload; role-gated to hr + principal.

create or replace function public.hr_dashboard_summary(
  p_period date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  -- coalesce: current_user_role() is NULL for unmatched/anon callers and
  -- NULL NOT IN (...) is NULL (falsy) — without it the gate never fires.
  if coalesce(current_user_role()::text, '') not in ('hr', 'principal') then
    return jsonb_build_object('error', 'Access denied');
  end if;

  return jsonb_build_object(
    'period', p_period,

    -- Staff master (Employment List) — active staff per department
    'staff', (
      select jsonb_build_object(
        'total_count', coalesce(sum(s.cnt), 0),
        'departments', coalesce(
          jsonb_agg(
            jsonb_build_object(
              'department_id', s.did,
              'department_name', s.dname,
              'staff_count', s.cnt,
              'total_basic', s.basic
            ) order by s.dname
          ),
          '[]'::jsonb
        )
      )
      from (
        select d.id as did, d.name as dname,
               count(*) as cnt, sum(hsc.basic_salary) as basic
        from hr_staff_costs hsc
        join departments d on d.id = hsc.department_id
        where hsc.status = 'active'
        group by d.id, d.name
      ) s
    ),

    -- This month's payroll — run state + per-department aggregates
    'payroll', jsonb_build_object(
      'run', (
        select to_jsonb(r) from (
          select pr.status, pr.total_amount, pr.submitted_at, pr.approved_at
          from payroll_runs pr
          where pr.period_month = p_period and pr.status <> 'rejected'
          order by pr.created_at desc
          limit 1
        ) r
      ),
      'rows_count', (
        select count(*) from hr_monthly_payroll mp
        where mp.period_month = p_period
      ),
      'draft_count', (
        select count(*) from hr_monthly_payroll mp
        where mp.period_month = p_period and mp.status = 'draft'
      ),
      'by_department', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'department_name', b.dname,
              'staff_count', b.cnt,
              'basic', b.basic,
              'statutory_er', b.statutory_er,
              'statutory_ee', b.statutory_ee,
              'gross', b.gross,
              'net', b.net
            ) order by b.dname
          ),
          '[]'::jsonb
        )
        from (
          select d.name as dname,
                 count(*) as cnt,
                 sum(mp.basic_salary) as basic,
                 sum(coalesce(mp.epf_er, 0) + coalesce(mp.socso_er, 0) + coalesce(mp.eis_er, 0)) as statutory_er,
                 sum(coalesce(mp.epf_ee, 0) + coalesce(mp.socso_ee, 0) + coalesce(mp.eis_ee, 0) + coalesce(mp.pcb, 0)) as statutory_ee,
                 sum(mp.gross) as gross,
                 sum(mp.net) as net
          from hr_monthly_payroll mp
          join hr_staff_costs hsc on hsc.id = mp.staff_id
          join departments d on d.id = hsc.department_id
          where mp.period_month = p_period
          group by d.name
        ) b
      )
    ),

    -- Director salary — period status + aggregate totals + submission snapshot
    'director', (
      select jsonb_build_object(
        'payout_count', count(*),
        'status', case
          when count(*) = 0 then 'not_calculated'
          when bool_and(dp.status = 'confirmed') then 'confirmed'
          else 'draft'
        end,
        'payout_mode', max(dp.payout_mode),
        'total_gross', coalesce(sum(dp.gross_amount), 0),
        'total_saving', coalesce(sum(dp.saving_amount), 0),
        'total_payroll_net', coalesce(sum(dp.payroll_net), 0),
        'total_invoice', coalesce(sum(dp.invoice_total), 0),
        'submission', (
          select to_jsonb(s) from (
            select dss.submitted_at, dss.total_gross, dss.director_count
            from director_salary_submissions dss
            where dss.period_month = p_period
            order by dss.submitted_at desc
            limit 1
          ) s
        )
      )
      from director_payouts dp
      where dp.period_month = p_period
    ),

    -- HR department pool balance (funds payroll disbursement)
    'hr_pool_balance', (
      select coalesce(b.balance, 0)
      from departments d
      left join dept_pool_balances b on b.department_id = d.id
      where d.name = 'HR'
      limit 1
    )
  );
end;
$$;
