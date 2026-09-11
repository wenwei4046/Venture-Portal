-- ============================================================================
-- EMPLOYEE CODES — HV001 from the top of the ladder, then max + 1 (user, 2026-09-12)
--
-- "这个 code 帮我重新排过，从最高职位到最低职位，HV 抬头 001。以后只要加新的
--  person，那个 code 就会自动按最大的数值递增再加 1。"
--
-- Two things, in the order they happen:
--
--   1. The renumbering, once. The codes on the roster were InfoTech's
--      join-order numbers (HV007–HV032, one HVI001); the Revenue Department
--      and the four directors carried none at all. Every active person, and
--      every inactive one who already held an HV number, is renumbered here
--      from the highest position to the lowest — HV001 is the CEO.
--
--      The order is the roster's own (`compareByLadder`, lib/ladder.ts: the
--      ladder top down, a rung's titles A→Z, names A→Z, an unplaced title
--      after every placed one, no title last) with two things put in front
--      of it. The Director department, which stands above the ladder — CEO,
--      then the directors A→Z, the order the roster already shows the group
--      in. And employment: everybody active before anybody who has left, so
--      the roster reads HV001 … HV058 straight down without a gap. The three
--      who have left keep a number of their own after the last active one
--      (no two people ever share a code); the TEST-SEP26 rows and an
--      inactive row with no code are left alone.
--
--   2. The sequence, from now on. A person filed without a code — the Add
--      Staff form has no code field, an invite creates a row, an import may
--      leave one blank — is given the next one by trigger: the largest HV
--      number on the table plus one, INACTIVE ROWS INCLUDED, so a number once
--      used is never handed out again. A code, once held, is never cleared: a
--      blank on the Edit form keeps the one they have. `next_staff_code()` is
--      an RPC as well, so the Add Staff form can say which number the person
--      will get.
--
-- The partial unique index (`idx_hr_staff_employee_code_active`, active rows
-- only) stays as it is; the sequence never repeats a number, so it holds
-- without help.
--
-- Idempotent on purpose: the live database receives this through MCP, which
-- records its own version, so a later `supabase db push` of this file must
-- be a no-op. The functions are `create or replace`, the trigger is dropped
-- before it is created — and the renumbering runs only the first time, which
-- it tells by the trigger not existing yet.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reading and writing the format
-- ----------------------------------------------------------------------------

-- The number inside an HV code, or null for anything else — 'HVI001', a
-- 'TEST-SEP26-…' row, a blank. Whitespace either side is tolerated and the
-- prefix is case-insensitive; nine digits is the ceiling so the cast cannot
-- overflow.
create or replace function public.staff_code_number(p_code text)
returns integer
language sql
immutable
strict
parallel safe
set search_path to 'public'
as $$
  select case
    when p_code ~ '^\s*[Hh][Vv]\s*\d{1,9}\s*$'
    then substring(p_code from '^\s*[Hh][Vv]\s*(\d{1,9})\s*$')::integer
  end
$$;

comment on function public.staff_code_number(text) is
  'The number inside an HV employee code (HV007 → 7); null for any other code.';

-- HV + at least three digits. lpad TRUNCATES past its length, so the width
-- grows with the number rather than cutting it: HV1000, not HV100.
create or replace function public.format_staff_code(p_n integer)
returns text
language sql
immutable
strict
parallel safe
set search_path to 'public'
as $$
  select 'HV' || lpad(p_n::text, greatest(3, length(p_n::text)), '0')
$$;

comment on function public.format_staff_code(integer) is
  'An employee code from its number: 7 → HV007, 1000 → HV1000.';

-- The next code: max + 1 over EVERY row, inactive included — somebody who has
-- left keeps their number and nobody inherits it. Security definer so the max
-- is taken over the whole table and not over the rows the caller's RLS
-- happens to show; how many people the company has numbered is all it gives
-- away, so any signed-in user may ask (the Add Staff form does).
create or replace function public.next_staff_code()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.format_staff_code(
    coalesce((select max(public.staff_code_number(employee_code)) from public.hr_staff_costs), 0) + 1
  )
$$;

comment on function public.next_staff_code() is
  'The employee code the next person filed will get: the largest HV number on hr_staff_costs (any status) plus one.';

revoke all on function public.next_staff_code() from public, anon;
grant execute on function public.next_staff_code() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. The renumbering — first time only
-- ----------------------------------------------------------------------------

do $$
declare
  v_first_time boolean;
begin
  select not exists (
    select 1
      from pg_trigger
     where tgname = 'hr_staff_costs_assign_code'
       and tgrelid = 'public.hr_staff_costs'::regclass
  ) into v_first_time;

  if not v_first_time then
    raise notice 'staff_code_sequence: codes already numbered, renumbering skipped';
    return;
  end if;

  create temp table staff_code_plan as
  select s.id,
         -- row_number() is a bigint; the formatter takes the integer a code holds.
         row_number() over (
           order by (s.status = 'active') desc,               -- everybody still here first
                    (d.segment_key = 'director') desc nulls last, -- the board, above the ladder
                    tl.rank desc nulls last,                   -- the ladder, top down
                    (t.name is null),                          -- no title last of all
                    lower(t.name),                             -- one rung: the same title together
                    lower(s.employee_name),                    -- then names
                    s.created_at,
                    s.id
         )::integer as n
    from public.hr_staff_costs s
    left join public.departments d on d.id = s.department_id
    left join public.titles t on t.id = s.title_id
    left join public.title_levels tl on tl.id = t.level_id
   where s.status = 'active'
      or public.staff_code_number(s.employee_code) is not null;

  -- Two passes. The partial unique index on active rows is checked row by
  -- row, and somebody's new number is nearly always somebody else's old one.
  update public.hr_staff_costs
     set employee_code = null
   where id in (select id from staff_code_plan);

  update public.hr_staff_costs h
     set employee_code = public.format_staff_code(p.n)
    from staff_code_plan p
   where p.id = h.id;

  raise notice 'staff_code_sequence: % people renumbered', (select count(*) from staff_code_plan);

  drop table staff_code_plan;
end $$;

-- ----------------------------------------------------------------------------
-- 3. The sequence — every row from here on
-- ----------------------------------------------------------------------------

create or replace function public.hr_staff_assign_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- A code that was given is kept as given: the InfoTech import writes the
  -- file's code verbatim, and a hand-typed one on the Edit form stands.
  if new.employee_code is not null and btrim(new.employee_code) <> '' then
    return new;
  end if;

  -- A code is never cleared. Blank on the Edit form keeps the one they have.
  if tg_op = 'UPDATE' and old.employee_code is not null and btrim(old.employee_code) <> '' then
    new.employee_code := old.employee_code;
    return new;
  end if;

  -- One at a time. The lock lasts to the end of the transaction, so a second
  -- person filed in the same instant waits for the first to commit, and the
  -- max they then read includes them.
  perform pg_advisory_xact_lock(hashtext('hr_staff_costs.employee_code'));
  new.employee_code := public.next_staff_code();
  return new;
end;
$$;

-- The trigger runs as the table owner (security definer); nobody needs to
-- call this by hand.
revoke execute on function public.hr_staff_assign_code() from public, anon, authenticated;

drop trigger if exists hr_staff_costs_assign_code on public.hr_staff_costs;
create trigger hr_staff_costs_assign_code
  before insert or update of employee_code on public.hr_staff_costs
  for each row execute function public.hr_staff_assign_code();

comment on trigger hr_staff_costs_assign_code on public.hr_staff_costs is
  'A person filed without an employee code gets HV(max + 1); a code once held is never cleared.';
