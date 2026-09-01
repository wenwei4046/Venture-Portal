-- Team module, part 1: titles become rows, and a person can point at an account.
--
-- Two things the Team module needs that the schema had no room for:
--
--   1. A title was free text. `hr_staff_costs.designation` held 20 distinct
--      all-caps spellings typed into the staff form, owned by nobody. The
--      Role & Permission tab has to say which titles exist and which
--      department each one belongs under — and from the permission phase on,
--      a title is what carries permissions. That needs rows.
--
--   2. `hr_staff_costs` (23 people) and `users` (4 login accounts) had no way
--      to say "this person is that account", and today not one row of either
--      side can be matched to the other (no staff row carries an email). The
--      user settled the direction on 2026-09-01: the staff table is the master
--      list of people and an account hangs off it. People Management lists
--      both sides; Invite User will create the pairing.
--
-- `designation` stays, and the app keeps it mirroring the chosen title's name:
-- the InfoTech import writes it verbatim (import contract, 2026-06-05) and the
-- payroll export reads it. `title_id` is the authoritative one from here on.

create table if not exists public.titles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  department_id uuid references public.departments(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.titles is
  'Job titles as controlled rows. A title belongs to at most one department; '
  'the permission matrix hangs off it from the Role & Permission phase on.';

-- One title per name per department. NULLS NOT DISTINCT (PG15+, this database
-- is 17.6) so two department-less titles cannot share a name either.
create unique index if not exists titles_name_department_uniq
  on public.titles (lower(btrim(name)), department_id) nulls not distinct;

create index if not exists titles_department_idx
  on public.titles (department_id) where is_active;

drop trigger if exists titles_set_updated_at on public.titles;
create trigger titles_set_updated_at
  before update on public.titles
  for each row execute function public.set_updated_at();

alter table public.titles enable row level security;

-- Everyone signed in reads titles: the directory, the staff form and the
-- org chart all render them. HR writes them because HR runs the staff
-- directory and would otherwise be unable to file a new hire under a title
-- nobody had created yet. Deleting one is the Principal's, since a title is
-- about to carry permissions.
drop policy if exists titles_all_select on public.titles;
create policy titles_all_select on public.titles
  for select using (auth.uid() is not null);

drop policy if exists titles_staff_insert on public.titles;
create policy titles_staff_insert on public.titles
  for insert with check (
    current_user_role() = any (array['principal'::user_role, 'hr'::user_role])
  );

drop policy if exists titles_staff_update on public.titles;
create policy titles_staff_update on public.titles
  for update using (
    current_user_role() = any (array['principal'::user_role, 'hr'::user_role])
  );

drop policy if exists titles_principal_delete on public.titles;
create policy titles_principal_delete on public.titles
  for delete using (current_user_role() = 'principal'::user_role);

alter table public.hr_staff_costs
  add column if not exists title_id uuid references public.titles(id) on delete set null,
  add column if not exists user_id  uuid references public.users(id)  on delete set null;

comment on column public.hr_staff_costs.user_id is
  'The login account this person signs in with, once invited. Null means they '
  'are on the payroll but cannot sign in — the normal state for most staff.';

-- One account belongs to at most one person.
create unique index if not exists hr_staff_costs_user_id_uniq
  on public.hr_staff_costs (user_id) where user_id is not null;

-- ── Backfill ────────────────────────────────────────────────────────────
-- Every (designation, department) pair actually in use becomes a title, so
-- nobody loses the title they already had. min() picks one spelling when the
-- same title was typed with different capitalisation.
insert into public.titles (name, department_id)
select min(btrim(designation)), department_id
from public.hr_staff_costs
where designation is not null
  and btrim(designation) <> ''
group by upper(btrim(designation)), department_id
on conflict do nothing;

update public.hr_staff_costs s
set title_id = t.id
from public.titles t
where s.title_id is null
  and s.designation is not null
  and upper(btrim(t.name)) = upper(btrim(s.designation))
  and t.department_id is not distinct from s.department_id;
