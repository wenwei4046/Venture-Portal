// Local PostgreSQL regression for 20261016190000 (2026-10-16 — the owner: permission is two layers, the title's
// template first, the cells changed for one person over it, and "Edit Permission 的优先级是高于 Title 和 Template 的";
// "如果我在 Permission 那边勾选允许她 View 和 Edit，那她 supposed to be 就可以去那个 Page 或者 App 查看"; then "2. yes
// can"). Production's permission readers are loaded from `personal-edits-production.sql` (each md5-checked), the
// permission tables stand in with production's shape, then the migration runs VERBATIM, twice. What is under test:
// one person's Salary / NRIC / Bank ticks win over their template's, either way, and only on a templated account;
// the eight kind-gated keys open for whoever's cells hold them, a template's or a person's own; the login record and
// the old per-key exceptions ask their own action beyond each person's own rows; the writer's refusals. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const refused = async (promise, pattern, what) => {
  await assert.rejects(promise, pattern, what)
  checks++
}

await db.exec(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE TYPE public.user_role AS ENUM ('principal', 'finance', 'hr', 'dept_manager', 'revenue_member', 'staff');

  CREATE TABLE public.users(id uuid PRIMARY KEY, role public.user_role, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.permission_templates(id uuid PRIMARY KEY, base_role public.user_role);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, template_id uuid);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title_id uuid);
  CREATE TABLE public.permission_template_grants(template_id uuid, function_key text, action text, scope text);
  CREATE TABLE public.user_permission_cells(user_id uuid, function_key text, action text, scope text);
  CREATE TABLE public.permission_template_sensitive(template_id uuid, field text);
  CREATE TABLE public.permission_cell_keys(function_key text, action text, legacy_key text, min_scope text, gate text);
  CREATE TABLE public.title_permissions(title_id uuid, permission_key text);
  CREATE TABLE public.role_default_permissions(role public.user_role, permission_key text);
  CREATE TABLE public.user_permissions(user_id uuid, permission_key text, granted boolean);
  CREATE TABLE public.permission_defs(key text PRIMARY KEY, scope text NOT NULL);
  CREATE TABLE public.permission_key_actions(legacy_key text, function_key text, action text);
  CREATE TABLE public.permission_table_reads(table_name text PRIMARY KEY, actions text[]);
  CREATE TABLE public.access_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, path text);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null)
  RETURNS text LANGUAGE sql AS $$ SELECT p_mode $$;
  CREATE FUNCTION public.permission_reads_guard(p_table text) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
`)

// ── Production's readers, and its two policies the migration narrows ───────────────────────────────────────────
await db.exec(await text(new URL('personal-edits-production.sql', import.meta.url)))
const md5Of = sig => one('SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure', [sig])
const production = {
  'public.current_permissions()': 'fc4662a36cfed0d84ecc98f94aafd478', 'public.current_actions()': '8efd652f9c5692587cba94cf0d5fe9a7',
  'public.current_sensitive_fields()': '91ccf7f933ebbdd865e715ff1056cd71', 'public.has_action(text,text,text)': 'f4466cc0a0d80f79bd0bcb3d751eda99',
  'public.has_any_action(text[])': '3b261bc9d13cac97f6bdd1debb2a6618', 'public.has_perm(text)': '2a720f7f844a1234bbda3da1be45de27',
  'public.has_scope(text[])': '58a0754281440abc45af67a7cd44c445', 'public.sees_sensitive(text)': '27bf9997c1acb4b450474c65e4ecc2c2',
}
for (const [sig, md5] of Object.entries(production)) check(await md5Of(sig), md5, `${sig} is production’s`)
await db.exec(`
  GRANT EXECUTE ON FUNCTION public.current_permissions(), public.current_actions(), public.current_sensitive_fields(), public.has_perm(text),
    public.has_scope(text[]), public.has_action(text, text, text), public.has_any_action(text[]), public.sees_sensitive(text) TO authenticated;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
  ALTER TABLE public.access_log ENABLE ROW LEVEL SECURITY;
  CREATE POLICY access_log_self_select ON public.access_log FOR SELECT USING (user_id = auth.uid());
  CREATE POLICY access_log_principal_select ON public.access_log FOR SELECT USING ((SELECT has_scope(ARRAY['admin'::text]) AS has_scope));
  ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY user_permissions_read ON public.user_permissions FOR SELECT USING ((user_id = auth.uid()) OR (SELECT has_scope(ARRAY['admin'::text]) AS has_scope));
`)

// ── The catalog, as production holds it for these functions ────────────────────────────────────────────────────
for (const [fn, action, key, min, gate] of [
  ['approvals', 'view', 'approvals', 'all', 'principal'], ['approvals', 'view', 'approvals_queue', 'all', null],
  ['audit_log', 'view', 'audit_log', 'all', 'principal'], ['accounts', 'create', 'team_invite', 'all', 'principal'],
  ['accounts', 'manage', 'permissions_manage', 'all', 'principal'], ['settings', 'view', 'settings', 'all', 'principal'],
  ['hr_costing', 'view', 'hr_costing', 'all', 'salary'], ['team', 'view', 'team', 'all', 'salary'], ['team', 'view', 'team_directory', 'own', null],
  ['treasury', 'view', 'treasury', 'all', 'treasury'], ['treasury', 'approve', 'override', 'all', 'principal'],
]) await q('INSERT INTO permission_cell_keys VALUES ($1, $2, $3, $4, $5)', [fn, action, key, min, gate])
for (const [key, fn, action] of [
  ['approvals', 'approvals', 'view'], ['approvals_queue', 'approvals', 'view'], ['audit_log', 'audit_log', 'view'],
  ['team_invite', 'accounts', 'view'], ['permissions_manage', 'accounts', 'view'], ['permissions_manage', 'accounts', 'manage'],
  ['settings', 'settings', 'view'], ['hr_costing', 'hr_costing', 'view'], ['team', 'team', 'view'], ['treasury', 'treasury', 'view'],
]) await q('INSERT INTO permission_key_actions VALUES ($1, $2, $3)', [key, fn, action])
for (const [key, scope] of [['approvals', 'admin'], ['audit_log', 'admin'], ['permissions_manage', 'admin'], ['settings', 'admin'],
  ['team_invite', 'none'], ['approvals_queue', 'none'], ['hr_costing', 'hr'], ['team', 'hr'], ['salary_individual', 'hr'],
  ['payroll_payouts', 'none'], ['team_directory', 'none'], ['treasury', 'treasury'], ['override', 'treasury']]) {
  await q('INSERT INTO permission_defs VALUES ($1, $2)', [key, scope])
}
await q(`INSERT INTO role_default_permissions VALUES ('hr', 'team'), ('hr', 'hr_costing'), ('hr', 'salary_individual'), ('principal', 'permissions_manage'), ('principal', 'team')`)

// Templates: the owner's (Principal kind, everything), an EA's staff one (People view, nothing sensitive), HR's (all three),
// and the Director's (staff kind) that ticks Approvals.
const T = { ultimate: id(1), staff: id(2), hr: id(3), director: id(4) }
await q(`INSERT INTO permission_templates VALUES ($1, 'principal'), ($2, 'staff'), ($3, 'hr'), ($4, 'staff')`, [T.ultimate, T.staff, T.hr, T.director])
const grant = (t, fn, action, scope = 'all') => q('INSERT INTO permission_template_grants VALUES ($1, $2, $3, $4)', [t, fn, action, scope])
for (const [fn, action] of [['approvals', 'view'], ['audit_log', 'view'], ['accounts', 'view'], ['accounts', 'manage'], ['team', 'view'], ['hr_costing', 'view']]) {
  await grant(T.ultimate, fn, action)
}
await grant(T.staff, 'team', 'view')
for (const [fn, action] of [['team', 'view'], ['hr_costing', 'view']]) await grant(T.hr, fn, action)
await grant(T.director, 'approvals', 'view')
for (const f of ['salary', 'nric', 'bank']) {
  await q('INSERT INTO permission_template_sensitive VALUES ($1, $2)', [T.ultimate, f])
  await q('INSERT INTO permission_template_sensitive VALUES ($1, $2)', [T.hr, f])
}

const U = { owner: id(11), ea: id(12), hr: id(13), director: id(14), hrShared: id(15) }
const person = async (u, role, template) => {
  await q('INSERT INTO users VALUES ($1, $2, true)', [u, role])
  if (!template) return
  const title = await one('INSERT INTO titles VALUES (gen_random_uuid(), $1) RETURNING id', [template])
  await q('INSERT INTO hr_staff_costs (user_id, title_id) VALUES ($1, $2)', [u, title])
}
await person(U.owner, 'principal', T.ultimate)
await person(U.ea, 'staff', T.staff)
await person(U.hr, 'hr', T.hr)
await person(U.director, 'staff', T.director)
await person(U.hrShared, 'hr', null) // hr@: no person, no template — its kind's defaults

const as = async (u, sql, params = []) => {
  await db.exec(`SET test.uid = '${u ?? ''}'; SET ROLE authenticated`)
  try { return await q(sql, params) } finally { await db.exec('RESET ROLE') }
}
const keys = async u => (await as(u, 'SELECT public.current_permissions() AS k'))[0].k.sort()
const fields = async u => (await as(u, 'SELECT public.current_sensitive_fields() AS f'))[0].f

// Before: the Director template's ticked Approvals opens nothing — its kind is not the Principal's.
check((await keys(U.director)).includes('approvals'), false, 'before: a staff-kind template’s Approvals tick opened nothing')

// ── The migration, verbatim — and again, which changes nothing ─────────────────────────────────────────────────
const sql = await text(new URL('20261016190000_personal_edits_win.sql', migrations))
await db.exec(sql)
const once = [await md5Of('public.current_permissions()'), await md5Of('public.current_sensitive_fields()')]
await db.exec(sql)
check([await md5Of('public.current_permissions()'), await md5Of('public.current_sensitive_fields()')], once, 'a second run swaps nothing more')
check(await one(`SELECT count(*)::int FROM permission_cell_keys WHERE gate = 'principal'`), 0, 'no key waits for the kind any more')
check(await one(`SELECT array_agg(gate ORDER BY gate) FROM permission_cell_keys WHERE gate IS NOT NULL`), ['salary', 'salary', 'treasury'], 'the Salary and Treasury gates stay')

// 1. Nothing moved for anybody with no tick of their own.
check(await keys(U.owner), ['approvals', 'approvals_queue', 'audit_log', 'hr_costing', 'payroll_payouts', 'permissions_manage', 'salary_individual', 'team', 'team_directory'],
  'the owner keeps everything')
check(await fields(U.owner), ['bank', 'nric', 'salary'], 'and every sensitive field')
check(await keys(U.ea), ['team_directory'], 'the EA: People through the directory, no pay')
check(await fields(U.ea), [], 'and nothing sensitive')
check(await fields(U.hr), ['bank', 'nric', 'salary'], 'HR sees all three, from the template')

// 2. A ticked cell opens its key whatever the template's kind: the Director template's Approvals, now.
check((await keys(U.director)).includes('approvals'), true, 'the Director template’s Approvals opens Approvals')
// …and so does a person's own cell (the EA raised to Settings · View for herself).
await q(`INSERT INTO user_permission_cells VALUES ($1, 'settings', 'view', 'all')`, [U.ea])
check((await keys(U.ea)).includes('settings'), true, 'a cell of her own opens Settings')

// 3. The writer: whoever manages permissions, a list of at most the three fields, each once.
const setFields = (who, target, list) => as(who, 'SELECT public.permission_user_sensitive_set($1, $2::jsonb)', [target, JSON.stringify(list)])
await refused(setFields(U.ea, U.ea, [{ field: 'salary', granted: true }]), /Only whoever manages permissions/, 'not hers to give herself')
await refused(setFields(U.owner, U.ea, [{ field: 'pin', granted: true }]), /is not a sensitive field/, 'a field that is not one')
await refused(setFields(U.owner, U.ea, [{ field: 'salary' }]), /is not a sensitive field/, 'on or off must be said')
await refused(setFields(U.owner, U.ea, [{ field: 'salary', granted: true }, { field: 'salary', granted: false }]), /is listed twice/, 'twice')
await refused(as(U.owner, `SELECT public.permission_user_sensitive_set($1, '{}'::jsonb)`, [U.ea]), /must be sent as a list/, 'not a list')
await refused(setFields(U.owner, id(99), []), /That account is gone/, 'an account that is not there')

// 4. Her own Salary tick wins: the pay keys open with her cells, and Salary is among her fields.
await setFields(U.owner, U.ea, [{ field: 'salary', granted: true }, { field: 'nric', granted: true }])
check((await keys(U.ea)).filter(k => ['team', 'salary_individual', 'payroll_payouts'].includes(k)), ['payroll_payouts', 'salary_individual', 'team'],
  'Salary amounts for her alone open People with pay and the salary keys')
check(await fields(U.ea), ['nric', 'salary'], 'and she sees Salary and NRIC — not Bank')
check(await as(U.ea, `SELECT public.sees_sensitive('nric') AS s`).then(r => r[0].s), true, 'the readers that ask sees_sensitive follow')

// 5. Held back for one person: HR without Salary loses the pay keys; without Bank, the bank field.
await setFields(U.owner, U.hr, [{ field: 'salary', granted: false }, { field: 'bank', granted: false }])
check((await keys(U.hr)).includes('hr_costing'), false, 'HR held back from Salary: HR Costing closes')
check(await fields(U.hr), ['nric'], 'and sees NRIC only')

// 6. The whole list replaces; an account with no template keeps its kind's fields whatever is stored.
await setFields(U.owner, U.hr, [])
check(await fields(U.hr), ['bank', 'nric', 'salary'], 'an empty list puts HR back on the template')
await setFields(U.owner, U.hrShared, [{ field: 'bank', granted: false }])
check(await fields(U.hrShared), ['bank', 'nric', 'salary'], 'hr@ (no template) keeps its kind’s fields — a tick needs a template under it')

// 7. What the admin domain opens on its own: the login record and the old exceptions ask their own action.
await q(`INSERT INTO access_log (user_id, path) VALUES ($1, '/a'), ($2, '/b')`, [U.owner, U.director])
await q(`INSERT INTO user_permissions VALUES ($1, 'reports', false), ($2, 'reports', true)`, [U.owner, U.director])
const seen = async (u, table) => (await as(u, `SELECT count(*)::int AS n FROM ${table}`))[0].n
check(await seen(U.director, 'access_log'), 1, 'the Director holds Approvals (the admin domain) but not Audit log: his own login rows only')
check(await seen(U.owner, 'access_log'), 2, 'Audit log · View reads them all')
check(await seen(U.director, 'user_permissions'), 1, 'his own old exceptions only, without Logins & invites')
check(await seen(U.owner, 'user_permissions'), 2, 'the owner reads them all')

check(await one(`SELECT actions FROM permission_table_reads WHERE table_name = 'user_permission_sensitive'`), ['accounts.manage', 'accounts.view', 'team.view:own'],
  'its rows are read as a person’s boxes are')
check(await one(`SELECT has_function_privilege('anon', 'public.permission_user_sensitive_set(uuid, jsonb)', 'execute')`), false, 'nothing for the publishable key')

console.log(`PASS: ${checks} personal-edits-win checks. Production's readers (md5-checked), then this migration twice; no live database.`)
