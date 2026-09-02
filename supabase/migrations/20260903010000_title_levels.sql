-- Levels: where each title sits on the ladder.
--
-- Titles said what somebody is called and which department that is; nothing
-- said which title is ABOVE which. Two things wanted that answer (user,
-- 2026-09-03):
--
--   1. Promotion. "Up one level" should be a button, not a re-typed title:
--      Accounts Assistant → Accounts Executive → Senior Account Executive →
--      Assistant Finance Manager, each rung being the next one up in the
--      person's own department.
--
--   2. The org chart. The Hierarchy page lets anybody be dragged under
--      anybody, and it should not: an Assistant Manager may not end up ABOVE a
--      Manager. The user was explicit that this is a RULE the chart obeys, and
--      not the chart itself — moving somebody between departments (a Revenue
--      salesperson from one team to another) stays a chart gesture; the ladder
--      only says how high each title stands.
--
-- The shape is a set of named rungs shared by the whole company — Assistant,
-- Executive, …, Head of Department — and a title is pinned to one rung. Shared,
-- not per department, because the chart compares ACROSS departments: an IT
-- executive reporting to the Marketing manager is a comparison of two
-- departments' titles, and only a common scale can make it. Several titles may
-- share a rung within one department (Marketing has three kinds of Executive);
-- promotion then offers the choice rather than guessing.
--
-- A title not yet placed is outside the rule entirely: the chart lets it go
-- anywhere and promotion has nothing to offer. The ladder starts empty of
-- titles, so nothing changes on the day this lands.

create table if not exists public.title_levels (
  id          uuid primary key default gen_random_uuid(),
  -- 1 is the bottom rung. Higher is more senior.
  rank        smallint not null check (rank >= 1),
  name        text not null check (btrim(name) <> ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Deferred so a rung can be inserted in the middle: shifting every rank
  -- above it up by one collides row by row and is only unique again at the end.
  constraint title_levels_rank_uniq unique (rank) deferrable initially deferred
);

comment on table public.title_levels is
  'The rungs of the company ladder, shared by every department. A title is '
  'pinned to one rung (titles.level_id); promotion climbs to the next rung in '
  'the same department, and the org chart will not put a person under somebody '
  'whose title stands lower.';

drop trigger if exists title_levels_set_updated_at on public.title_levels;
create trigger title_levels_set_updated_at
  before update on public.title_levels
  for each row execute function public.set_updated_at();

alter table public.titles
  add column if not exists level_id uuid references public.title_levels(id) on delete set null;

comment on column public.titles.level_id is
  'The rung this title stands on. Null = not placed on the ladder yet; the '
  'ladder rule does not apply to its holders.';

create index if not exists titles_level_idx
  on public.titles (level_id) where level_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Read by anyone signed in, like titles. Written by whoever holds the hr
-- scope, like titles: HR builds the ladder because HR runs promotions and the
-- org chart. A rung carries no permissions, so deleting one is not the
-- Principal's alone the way deleting a title is.
alter table public.title_levels enable row level security;

drop policy if exists title_levels_read on public.title_levels;
create policy title_levels_read on public.title_levels
  for select using (auth.uid() is not null);

drop policy if exists title_levels_write on public.title_levels;
create policy title_levels_write on public.title_levels
  for all
  using ((select has_scope(array['hr'::text])))
  with check ((select has_scope(array['hr'::text])));

-- ── The starting ladder ─────────────────────────────────────────────────
-- Seven rungs, so the board is a ladder and not a blank page on first open.
-- Renamed, added to or removed from on the page; only seeded when empty.
insert into public.title_levels (rank, name)
select v.rank, v.name
from (values
  (1, 'Assistant'),
  (2, 'Executive'),
  (3, 'Senior Executive'),
  (4, 'Assistant Manager'),
  (5, 'Manager'),
  (6, 'Senior Manager'),
  (7, 'Head of Department')
) as v(rank, name)
where not exists (select 1 from public.title_levels);

-- ── Editing the rungs ───────────────────────────────────────────────────
-- Both shift the ranks around the change, which is why they are functions
-- and not two statements from the app: half a shift is a ladder with a hole
-- in it. SECURITY INVOKER — the table's own policy decides who may.

-- A new, empty rung at p_rank. Everything at or above moves up one.
create or replace function public.ladder_insert_level(p_rank smallint, p_name text)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_max smallint;
  v_id  uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'A level needs a name';
  end if;

  select coalesce(max(rank), 0) into v_max from public.title_levels;
  if p_rank is null or p_rank < 1 or p_rank > v_max + 1 then
    raise exception 'A level can go anywhere from 1 to %', v_max + 1;
  end if;

  update public.title_levels set rank = rank + 1 where rank >= p_rank;

  insert into public.title_levels (rank, name)
  values (p_rank, btrim(p_name))
  returning id into v_id;

  return v_id;
end;
$$;

-- Remove an EMPTY rung and close the gap above it.
create or replace function public.ladder_delete_level(p_id uuid)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_rank   smallint;
  v_titles integer;
begin
  select rank into v_rank from public.title_levels where id = p_id;
  if v_rank is null then
    raise exception 'That level is already gone';
  end if;

  select count(*) into v_titles from public.titles where level_id = p_id;
  if v_titles > 0 then
    raise exception '% % on this level — move them off it first',
      v_titles, case when v_titles = 1 then 'title sits' else 'titles sit' end;
  end if;

  delete from public.title_levels where id = p_id;
  update public.title_levels set rank = rank - 1 where rank > v_rank;
end;
$$;

-- ── The rule, enforced on the org chart ─────────────────────────────────
-- Nobody reports to somebody whose title stands LOWER on the ladder. Equal is
-- allowed — a senior executive can lead other senior executives.
--
-- Checked in the direction the change moves, and only there:
--
--   reports_to changes     → the new line above is checked.
--   title rises            → the line above is checked (they may now outrank
--                            their manager).
--   title falls            → the lines below are checked (a report may now
--                            outrank them).
--
-- Not re-checked: the lines a change leaves alone. A ladder edited after the
-- chart was drawn can leave lines that break it; the Hierarchy page marks
-- those, and a change that does not make one worse is not refused because of
-- it — otherwise promoting somebody would be blocked by a stale line three
-- cards away. Inactive people are outside the chart and outside this check.
--
-- The app refuses the same moves before the round trip, with the same words;
-- this is the backstop, as with the cycle trigger.
create or replace function public.hr_staff_respects_ladder()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me   record;
  was  record;
  mgr  record;
  rep  record;
  rose boolean := false;
  fell boolean := false;
begin
  select t.name as title, l.rank, l.name as level
    into me
    from public.titles t
    left join public.title_levels l on l.id = t.level_id
   where t.id = new.title_id;

  -- No title, or a title not on the ladder: the rule has nothing to say.
  if me.rank is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.title_id is distinct from new.title_id then
    select l.rank
      into was
      from public.titles t
      left join public.title_levels l on l.id = t.level_id
     where t.id = old.title_id;
    rose := was.rank is null or was.rank < me.rank;
    fell := was.rank is null or was.rank > me.rank;
  end if;

  if new.reports_to is not null
     and (tg_op = 'INSERT' or new.reports_to is distinct from old.reports_to or rose) then
    select s.employee_name, t.name as title, l.rank, l.name as level
      into mgr
      from public.hr_staff_costs s
      left join public.titles t on t.id = s.title_id
      left join public.title_levels l on l.id = t.level_id
     where s.id = new.reports_to
       and s.status = 'active';

    if mgr.rank is not null and mgr.rank < me.rank then
      raise exception '% cannot report to %: % (%) stands above % (%) on the ladder',
        new.employee_name, mgr.employee_name, me.title, me.level, mgr.title, mgr.level
        using errcode = '23LAD';
    end if;
  end if;

  if fell then
    select s.employee_name, t.name as title, l.name as level
      into rep
      from public.hr_staff_costs s
      join public.titles t on t.id = s.title_id
      join public.title_levels l on l.id = t.level_id
     where s.reports_to = new.id
       and s.status = 'active'
       and l.rank > me.rank
     order by l.rank desc
     limit 1;

    if found then
      raise exception '% cannot become % (%): % reports to them as % (%), which stands higher on the ladder',
        new.employee_name, me.title, me.level, rep.employee_name, rep.title, rep.level
        using errcode = '23LAD';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists hr_staff_costs_respects_ladder on public.hr_staff_costs;
create trigger hr_staff_costs_respects_ladder
  before insert or update of reports_to, title_id on public.hr_staff_costs
  for each row execute function public.hr_staff_respects_ladder();
