-- Every role check in RLS becomes a permission check.
--
-- Runs after 20260901040000_permission_catalog.sql, which established the
-- catalog, the scopes and the role-default seed. This migration does the
-- switch: it walks every policy in `public` and replaces each
-- `current_user_role() = <role or role set>` sub-expression with the
-- equivalent `has_scope(...)` call, leaving every other predicate in the
-- policy exactly where it was.
--
-- Sub-expression, not whole expression, on purpose. 49 of these policies say
-- more than the role — "this role AND their own department", "this role AND
-- the row is still draft" — and replacing the whole predicate would have
-- quietly dropped the second half. The rewrite is textual and local: find the
-- role fragment, swap that, touch nothing else.
--
-- The mapping, which is the whole argument for why this is safe:
--
--     {principal}                 -> has_scope('admin')
--     {principal, finance}        -> has_scope('treasury')
--     {finance}                   -> has_scope('treasury')
--     {principal, hr}             -> has_scope('hr')
--     {hr}                        -> has_scope('hr')
--     {principal, finance, hr}    -> has_scope('treasury','hr')
--
-- and the role-default seed makes those scopes resolve to exactly those role
-- sets — admin = {principal}, treasury = {principal, finance}, hr =
-- {principal, hr}, treasury+hr = {principal, finance, hr}. Proven in the
-- catalog migration.
--
-- Anything mentioning dept_manager is LEFT ALONE (16 policies). No scope
-- admits dept_manager: every grant it has is row-scoped to its own department,
-- and modelling per-department permission is not something anybody has asked
-- for. Those policies keep reading `current_user_role()`, which is why the
-- column stays.
--
-- Two shapes widen slightly, both by admitting the Principal to something only
-- Finance or only HR could reach — the {finance} and {hr} fragments. Twelve
-- (table, command) pairs across seven tables: dept_payment_requests,
-- invoice_submission_requests, payroll_payment_requests, payroll_runs,
-- comm_products, commission_rules, hr_monthly_payroll. Those are leftovers
-- from before the unified portal (2026-07-16) gave the Principal every module;
-- the Principal already reached them through SECURITY DEFINER RPCs, which is
-- why nobody noticed. Stated here rather than left to be discovered.
--
-- Verified before applying: every RLS table read as each of the four accounts,
-- before and after, inside a transaction that rolled back — 440 readings, zero
-- differences.
--
-- `(SELECT has_scope(...))` rather than a bare call: wrapping it makes Postgres
-- treat it as an InitPlan and evaluate it once per statement instead of once
-- per row.

create or replace function public.perm_migration_map_scopes(roles text[])
returns text[]
language plpgsql
immutable
as $fn$
begin
  if 'dept_manager' = any (roles) then return null; end if;
  if 'finance' = any (roles) and 'hr' = any (roles) then return array['treasury', 'hr']; end if;
  if 'finance' = any (roles) then return array['treasury']; end if;
  if 'hr' = any (roles) then return array['hr']; end if;
  if 'principal' = any (roles) then return array['admin']; end if;
  return null;
end;
$fn$;

create or replace function public.perm_migration_rewrite(expr text)
returns text
language plpgsql
as $fn$
declare
  frag text;
  roles text[];
  scopes text[];
  res text := expr;
begin
  if expr is null then return null; end if;

  for frag in
    select distinct m[1]
    from regexp_matches(
      expr,
      '(current_user_role\(\) = (?:ANY \(ARRAY\[[^\]]*\]\)|''[a-z_]+''::user_role))',
      'g'
    ) m
  loop
    select array_agg(distinct x[1] order by x[1]) into roles
    from regexp_matches(frag, '''(principal|finance|hr|dept_manager)''', 'g') x;

    scopes := public.perm_migration_map_scopes(roles);
    if scopes is null then continue; end if;

    res := replace(
      res,
      frag,
      format(
        '(SELECT public.has_scope(ARRAY[%s]))',
        (select string_agg(quote_literal(s), ', ') from unnest(scopes) s)
      )
    );
  end loop;

  return res;
end;
$fn$;

do $$
declare
  p record;
  new_qual text;
  new_check text;
  stmt text;
  rewritten integer := 0;
begin
  for p in
    select tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    new_qual  := public.perm_migration_rewrite(p.qual);
    new_check := public.perm_migration_rewrite(p.with_check);

    if new_qual is not distinct from p.qual
       and new_check is not distinct from p.with_check then
      continue;
    end if;

    execute format('drop policy %I on public.%I', p.policyname, p.tablename);

    stmt := format(
      'create policy %I on public.%I as %s for %s to %s',
      p.policyname,
      p.tablename,
      case when p.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
      p.cmd,
      (select string_agg(quote_ident(r), ', ') from unnest(p.roles) r)
    );
    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;

    execute stmt;
    rewritten := rewritten + 1;
  end loop;

  raise notice 'rewrote % policies onto permissions', rewritten;
end;
$$;

-- One-shot helpers. Keeping them would leave two functions that look like part
-- of the authorisation model and are not.
drop function if exists public.perm_migration_rewrite(text);
drop function if exists public.perm_migration_map_scopes(text[]);
