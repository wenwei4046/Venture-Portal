-- Confirmed IR rules, 2026-09-11. This fills the existing, empty IR title
-- ladder only. It does not copy Fair's item groups or change payroll/staff.
-- Existing IR catalogue inspected before preparation: 3%, 3.5%, 4%; no rungs.
do $ir$
declare
  v_scheme uuid := 'caeaf2eb-3931-40be-b3bd-b033814f8046';
  v_department uuid;
  v_package uuid;
  v_title uuid;
  v_def uuid;
  v_rule record;
begin
  select d.department_id into v_department
    from public.comm_schemes s
    join public.comm_sub_departments d on d.id = s.sub_department_id
   where s.id = v_scheme
   for update of s;
  -- Other installations need not have this company's IR sub-department.
  if not found then return; end if;

  if exists (select 1 from public.comm_ranks where scheme_id = v_scheme) then
    raise exception 'IR title ladder has changed since this checkpoint. Review its existing rungs before applying the initial IR rules.';
  end if;
  if (select count(*) from public.comm_rank_defs where scheme_id = v_scheme) <> 3
     or exists (select 1 from public.comm_rank_defs where scheme_id = v_scheme
       and (product_rate not in (0.03, 0.035, 0.04) or group_incentive_amount <> 0 or group_subsidy_cap <> 0)) then
    raise exception 'IR rank catalogue has changed since this checkpoint. Review the rates before applying the initial IR rules.';
  end if;

  insert into public.comm_rank_defs
    (scheme_id, product_rate, group_incentive_amount, group_subsidy_cap, label, sort_order)
  values (v_scheme, 0, 6000, 2000, 'Rank SS', 40)
  returning id into v_package;

  update public.comm_rank_defs set label = case product_rate
    when 0.03 then 'Rank C' when 0.035 then 'Rank B' when 0.04 then 'Rank A' end
   where scheme_id = v_scheme and group_incentive_amount = 0;

  for v_rule in select * from (values
    ('Revenue Specialist', 'rs_3', 0.03::numeric, false, null::numeric, null::numeric, null::integer),
    ('Team Assistant', 'ta_3_5', 0.035::numeric, true, null::numeric, 200000::numeric, 2),
    ('Team Leader', 'tl_4', 0.04::numeric, true, 800000::numeric, null::numeric, null::integer),
    ('Senior Team Leader', 'stl_group', 0::numeric, true, 1000000::numeric, null::numeric, null::integer)
  ) as rules(title_name, rank_key, product_rate, can_recruit, group_target, personal_target, months)
  loop
    select id into strict v_title from public.titles
     where department_id = v_department and name = v_rule.title_name and is_active;
    select id into strict v_def from public.comm_rank_defs
     where scheme_id = v_scheme and product_rate = v_rule.product_rate;
    insert into public.comm_ranks
      (scheme_id, title_id, rank_def_id, rank_key, label, product_rate, sort_order,
       can_recruit, group_sales_threshold, personal_sales_threshold, consecutive_months)
    select v_scheme, v_title, id, v_rule.rank_key, label, product_rate, sort_order,
      v_rule.can_recruit, v_rule.group_target, v_rule.personal_target, v_rule.months
      from public.comm_rank_defs where id = v_def;
  end loop;

  update public.comm_schemes set
    enable_product_revenue = true, enable_override = true, enable_group_incentive = true,
    group_sales_depth = 2, override_depth = 2, direct_line_limit = 3,
    enable_kpi = false, enable_open_bill = false,
    enable_margin_penalty = false, enable_margin_incentive = false,
    override_includes_kpi = false, default_rate_mode = 'variable', updated_at = now()
   where id = v_scheme;
  -- The existing deposit setting is preserved. IR's sales API/item groups and
  -- recurring Claims registration are separate work, not guessed from Fair.
end;
$ir$;
