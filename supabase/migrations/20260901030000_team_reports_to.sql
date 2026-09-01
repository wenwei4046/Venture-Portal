-- Who reports to whom, for the whole company.
--
-- The portal already had a reporting line, but only one: `comm_hierarchy`,
-- which says who OVERRIDES whom in the Revenue Department. That one is money —
-- it drives the override differential, so it is effective-dated and a closed
-- month keeps the chart it was computed against.
--
-- This is not that. It is the org chart: one column, current state, no history,
-- covering every department. The two are deliberately separate (user, 2026-09-01:
-- the Team canvas may draw the commission line but must not edit it), because a
-- reorganisation on the HR side must never silently repay a commission run.
--
-- Enforced twice, like the commission side: the app refuses an illegal move
-- before the round trip so the refusal is instant and explains itself, and the
-- trigger below is the backstop. A cycle here would hang the layout walk rather
-- than corrupt money, but a cycle is still never right.

alter table public.hr_staff_costs
  add column if not exists reports_to uuid references public.hr_staff_costs(id) on delete set null;

comment on column public.hr_staff_costs.reports_to is
  'Line manager, company-wide. Current state only — no history, unlike comm_hierarchy. Null = top of a tree.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hr_staff_costs_reports_to_not_self'
  ) then
    alter table public.hr_staff_costs
      add constraint hr_staff_costs_reports_to_not_self
      check (reports_to is null or reports_to <> id);
  end if;
end $$;

create index if not exists hr_staff_costs_reports_to_idx
  on public.hr_staff_costs (reports_to) where reports_to is not null;

create or replace function public.hr_staff_reports_to_no_cycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cursor_id uuid;
  hops integer := 0;
begin
  if new.reports_to is null then
    return new;
  end if;

  -- Walk up from the proposed manager. Meeting this row means the line loops.
  -- The hop cap is a second seatbelt: a pre-existing loop elsewhere in the
  -- table would otherwise spin here forever.
  cursor_id := new.reports_to;
  while cursor_id is not null and hops < 100 loop
    if cursor_id = new.id then
      raise exception 'That would put % under their own report', new.employee_name
        using errcode = '23514';
    end if;
    select reports_to into cursor_id from public.hr_staff_costs where id = cursor_id;
    hops := hops + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists hr_staff_costs_reports_to_no_cycle on public.hr_staff_costs;
create trigger hr_staff_costs_reports_to_no_cycle
  before insert or update of reports_to on public.hr_staff_costs
  for each row execute function public.hr_staff_reports_to_no_cycle();
