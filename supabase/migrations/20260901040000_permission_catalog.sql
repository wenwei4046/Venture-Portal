-- Permissions hang off a title, and the four roles become a fallback.
--
-- Until now every gate in the portal — 235 RLS policies and ~500 call sites —
-- read one of four hard-coded roles. The user asked on 2026-09-01 for the
-- Role & Permission tab to decide what each TITLE may do, and chose the full
-- rewrite over layering a matrix on top of the roles.
--
-- What made that tractable is that the database's 235 role-only policies
-- collapse to exactly FOUR effective role sets:
--
--     {principal}                  admin
--     {principal, finance}         treasury
--     {principal, hr}              hr
--     {principal, finance, hr}     treasury OR hr
--
-- dept_manager never appears in a pure-role policy — every grant it has is
-- row-scoped (their own department), and those policies are left exactly as
-- they are.
--
-- So there are two levels, and they are not the same thing:
--
--   permission   what a person may DO. Module-shaped, because that is what the
--                sidebar shows and what `lib/roles.ts` already distinguishes.
--                This is what the matrix ticks.
--   scope        what a person may READ AND WRITE at the table level. Derived
--                from the permissions — a scope is held when any permission
--                mapped to it is held. This is what RLS asks about.
--
-- Deriving the second from the first is what stops the two drifting: you
-- cannot tick "Payments" for a title and have their queries come back empty.
--
-- The seed reproduces `lib/roles.ts` exactly, so the day this lands nobody's
-- access changes. It only starts to differ when somebody ticks a box.

create table if not exists public.permission_defs (
  key text primary key,
  label text not null,
  section text not null,
  -- Which table-level scope holding this permission implies. 'none' for
  -- permissions that gate app behaviour only (they carry no data of their own).
  scope text not null check (scope in ('admin', 'treasury', 'hr', 'shared', 'none')),
  description text,
  sort_order integer not null default 0
);

comment on table public.permission_defs is
  'The catalog the Role & Permission matrix renders. One row per thing a title can be allowed to do.';

create table if not exists public.role_default_permissions (
  role user_role not null,
  permission_key text not null references public.permission_defs(key) on delete cascade,
  primary key (role, permission_key)
);

comment on table public.role_default_permissions is
  'What each of the four legacy roles could do. The fallback for an account whose title says nothing yet — and the reason this migration changes nobody''s access on the day it lands.';

create table if not exists public.title_permissions (
  title_id uuid not null references public.titles(id) on delete cascade,
  permission_key text not null references public.permission_defs(key) on delete cascade,
  primary key (title_id, permission_key)
);

comment on table public.title_permissions is
  'What a title may do. A title with NO rows here inherits its holder''s role defaults; the first tick makes the title authoritative.';

create table if not exists public.user_permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  permission_key text not null references public.permission_defs(key) on delete cascade,
  -- False is an explicit denial, which is why this is not just row presence:
  -- one person can be held back from something their title allows.
  granted boolean not null,
  primary key (user_id, permission_key)
);

comment on table public.user_permissions is
  'Per-person exception to their title. granted=false denies something the title allows.';

-- ── The catalog ─────────────────────────────────────────────────────────
insert into public.permission_defs (key, label, section, scope, description, sort_order) values
  ('dashboard',         'Overview',            'Daily',       'shared',   'The landing dashboard.', 10),
  ('approvals',         'Approvals',           'Daily',       'admin',    'The Principal queue: approve or reject what others submit.', 20),
  ('treasury',          'Treasury',            'Daily',       'treasury', 'Payments, receipts, invoices, fund in and out, overdue, statements.', 30),
  ('billing',           'Billing',             'Daily',       'treasury', 'Service contracts, invoice generation, the billing allocator.', 40),
  ('categories',        'Chart of Account',    'Daily',       'treasury', 'GL categories that route every voucher.', 50),
  ('hr_costing',        'HR Costing',          'People',      'hr',       'Monthly payroll runs, staff costs, HR payments.', 60),
  ('revenue',           'Revenue Department',  'People',      'hr',       'Commission runs, rules and the sales hierarchy.', 70),
  ('product_list',      'Product list',        'People',      'admin',    'What a product costs — the margin a commission run is judged against.', 80),
  ('director_salary',   'Director Salary',     'People',      'hr',       'The director salary engine.', 90),
  ('director_pool',     'Director Pool',       'People',      'hr',       'The director pool calculator.', 100),
  ('team',              'Team',                'People',      'hr',       'The roster, the org chart and the titles.', 110),
  ('team_invite',       'Invite users',        'People',      'none',     'Create a login. Access to the portal itself.', 120),
  ('salary_individual', 'Individual salaries', 'People',      'hr',       'See what one named person is paid, not just a department total.', 130),
  ('dept_pool',         'Dept Pool',           'Departments', 'none',     'Department pool balances and P&L.', 140),
  ('venture_pool',      'Venture Pool',        'Departments', 'treasury', 'The HV holding-company cash ledger.', 150),
  ('opex',              'OPEX',                'Departments', 'none',     'A department''s payroll breakdown.', 160),
  ('my_billing',        'My Billing',          'Departments', 'none',     'A department manager''s own invoices.', 170),
  ('claims',            'Claims',              'Departments', 'shared',   'Expense claims.', 180),
  ('reports',           'Reports',             'Reports',     'treasury', 'Whole-company reports: balance sheet, trial balance, ledger.', 190),
  ('dept_reports',      'Department reports',  'Reports',     'none',     'P&L, cash flow and debtor aging for one department.', 200),
  ('reconciliation',    'Reconciliation',      'Reports',     'treasury', 'Bank reconciliation and journal entries.', 210),
  ('audit_log',         'Audit log',           'Admin',       'admin',    'Who read and changed what.', 220),
  ('settings',          'Settings',            'Admin',       'admin',    'Treasury config, companies, banks, periods, directors.', 230)
on conflict (key) do update
  set label = excluded.label,
      section = excluded.section,
      scope = excluded.scope,
      description = excluded.description,
      sort_order = excluded.sort_order;

-- ── The seed: lib/roles.ts, transcribed ─────────────────────────────────
-- Read alongside src/lib/roles.ts. Every line here is one of its functions.
delete from public.role_default_permissions;
insert into public.role_default_permissions (role, permission_key)
select r.role, k.key from (values
  -- Principal sees everything (unified portal, 2026-07-16).
  ('principal'::user_role, 'dashboard'), ('principal', 'approvals'), ('principal', 'treasury'),
  ('principal', 'billing'), ('principal', 'categories'), ('principal', 'hr_costing'),
  ('principal', 'revenue'), ('principal', 'product_list'), ('principal', 'director_salary'),
  ('principal', 'director_pool'), ('principal', 'team'), ('principal', 'team_invite'),
  ('principal', 'salary_individual'), ('principal', 'dept_pool'), ('principal', 'venture_pool'),
  ('principal', 'opex'), ('principal', 'claims'), ('principal', 'reports'),
  ('principal', 'dept_reports'), ('principal', 'reconciliation'), ('principal', 'audit_log'),
  ('principal', 'settings'),

  -- Finance: treasury, billing and reports. No payroll surface at all.
  ('finance'::user_role, 'dashboard'), ('finance', 'treasury'), ('finance', 'billing'),
  ('finance', 'categories'), ('finance', 'dept_pool'), ('finance', 'venture_pool'),
  ('finance', 'claims'), ('finance', 'reports'), ('finance', 'dept_reports'),
  ('finance', 'reconciliation'),

  -- HR: the payroll surfaces, and nothing that touches the bank.
  ('hr'::user_role, 'dashboard'), ('hr', 'hr_costing'), ('hr', 'revenue'),
  ('hr', 'director_salary'), ('hr', 'director_pool'), ('hr', 'team'),
  ('hr', 'salary_individual'), ('hr', 'claims'),

  -- Dept Manager: their own department, and only ever their own rows.
  ('dept_manager'::user_role, 'dashboard'), ('dept_manager', 'dept_pool'),
  ('dept_manager', 'opex'), ('dept_manager', 'my_billing'), ('dept_manager', 'claims'),
  ('dept_manager', 'dept_reports')
) as r(role, key)
join public.permission_defs k on k.key = r.key;

-- ── Resolution ──────────────────────────────────────────────────────────
--
-- Precedence, most specific first:
--   1. an explicit row on the person (allow or deny)
--   2. their title, but only once the title has been configured at all
--   3. their role's defaults
--
-- The "configured at all" test is what keeps this migration a no-op: today no
-- title has a single row, so every account still resolves through step 3.

create or replace function public.current_permissions()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  with me as (
    select id, role from users where id = auth.uid() and is_active
  ),
  my_title as (
    select s.title_id
    from hr_staff_costs s
    where s.user_id = (select id from me) and s.title_id is not null
    limit 1
  ),
  title_is_configured as (
    select exists (
      select 1 from title_permissions tp
      where tp.title_id = (select title_id from my_title)
    ) as yes
  ),
  inherited as (
    select tp.permission_key as key
    from title_permissions tp
    where tp.title_id = (select title_id from my_title)
      and (select yes from title_is_configured)
    union
    select rdp.permission_key
    from role_default_permissions rdp
    where rdp.role = (select role from me)
      and not (select yes from title_is_configured)
  ),
  overrides as (
    select permission_key as key, granted
    from user_permissions
    where user_id = (select id from me)
  )
  select coalesce(array_agg(key), '{}'::text[]) from (
    select i.key from inherited i
    where not exists (
      select 1 from overrides o where o.key = i.key and o.granted = false
    )
    union
    select o.key from overrides o where o.granted
  ) resolved;
$$;

comment on function public.current_permissions() is
  'Every permission key the signed-in account holds, after title and per-person overrides. Stable, so RLS evaluates it once per statement rather than once per row.';

create or replace function public.has_perm(p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_key = any (public.current_permissions());
$$;

/**
 * Does this account hold any permission mapped to any of these scopes?
 *
 * Policies ask in scope terms rather than permission terms because a table
 * belongs to an area of the business, not to a sidebar entry. Passing several
 * scopes means OR: 'treasury' + 'hr' is the old {principal, finance, hr} set.
 */
create or replace function public.has_scope(p_scopes text[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from permission_defs d
    where d.scope = any (p_scopes)
      and d.key = any (public.current_permissions())
  );
$$;

-- ── RLS on the new tables ───────────────────────────────────────────────
alter table public.permission_defs enable row level security;
alter table public.role_default_permissions enable row level security;
alter table public.title_permissions enable row level security;
alter table public.user_permissions enable row level security;

-- The catalog and the role defaults are readable by anyone signed in: the
-- matrix has to render for whoever can open it, and current_permissions()
-- reads them through SECURITY DEFINER anyway.
drop policy if exists permission_defs_read on public.permission_defs;
create policy permission_defs_read on public.permission_defs
  for select using (auth.uid() is not null);

drop policy if exists role_defaults_read on public.role_default_permissions;
create policy role_defaults_read on public.role_default_permissions
  for select using (auth.uid() is not null);

-- Granting is the Principal's. Both of these decide who can reach the money.
drop policy if exists title_permissions_read on public.title_permissions;
create policy title_permissions_read on public.title_permissions
  for select using (auth.uid() is not null);

drop policy if exists title_permissions_write on public.title_permissions;
create policy title_permissions_write on public.title_permissions
  for all using (current_user_role() = 'principal'::user_role)
  with check (current_user_role() = 'principal'::user_role);

drop policy if exists user_permissions_read on public.user_permissions;
create policy user_permissions_read on public.user_permissions
  for select using (
    user_id = auth.uid() or current_user_role() = 'principal'::user_role
  );

drop policy if exists user_permissions_write on public.user_permissions;
create policy user_permissions_write on public.user_permissions
  for all using (current_user_role() = 'principal'::user_role)
  with check (current_user_role() = 'principal'::user_role);
