// Local PostgreSQL regression for 20261020190000 (People › Invite user for whoever holds Permissions · Create,
// 2026-10-20 — the user: HR "supposed to be 是要能够 invite user 的"). The login is made by ONE function,
// account_attach_login(p_staff, p_login, p_email): the portal user and the person's attachment together, under
// Permissions · Create. A full-access title (a Principal-kind template, or one that ticks
// Manage permissions) is given a login only by whoever manages permissions. hr_staff_permission_guard —
// production's body, md5-checked (`hr-staff-permission-guard-production.sql`) — lets that one attachment
// through and nothing else. The migration is applied VERBATIM, twice. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const here = new URL('./', import.meta.url)
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const refused = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

/** Signed in as `user`, holding `actions` (has_any_action) and `perms` (has_perm). */
async function as(user, { actions = [], perms = [] } = {}, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.actions', $1, false)", [actions.join(',')])
  await q("SELECT set_config('test.perms', $1, false)", [perms.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => db.exec('RESET ROLE')

const HR_ACTIONS = ['accounts.view', 'accounts.create', 'team.view', 'team.create', 'team.edit']
const MANAGER_ACTIONS = [...HR_ACTIONS, 'accounts.manage']

// People, titles and templates.
const T_ULTIMATE = id(101) // Principal kind
const T_HR = id(102) // HR · Payroll
const T_STAFF = id(103) // Staff · Basic
const T_GRANTER = id(104) // a staff-kind template that ticks Manage permissions
const TITLE_DIRECTOR = id(201)
const TITLE_HR = id(202)
const TITLE_CLERK = id(203)
const TITLE_GRANTER = id(204)
const TITLE_NONE = id(205) // a title with no template
const DEPT = id(301)
const HR_LOGIN = id(1) // LI SEAN's login: Permissions · Create
const BOSS_LOGIN = id(2) // the Principal: manages permissions too
const P_CLERK = id(401)
const P_DIRECTOR = id(402)
const P_GRANTER = id(403)
const P_INACTIVE = id(404)
const P_NO_TEMPLATE = id(405)
const P_HR_SELF = id(406)
const P_CLERK2 = id(407)
const NEW_LOGIN = n => id(900 + n)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now());
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

    CREATE TYPE public.user_role AS ENUM ('principal', 'finance', 'hr', 'staff', 'revenue_member');
    CREATE TABLE users(id uuid PRIMARY KEY, email text NOT NULL, name text NOT NULL, role public.user_role NOT NULL,
      department_id uuid, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE permission_templates(id uuid PRIMARY KEY, name text NOT NULL, base_role public.user_role NOT NULL);
    CREATE TABLE permission_template_grants(template_id uuid, function_key text, action text, scope text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, template_id uuid);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, user_id uuid REFERENCES users(id),
      status text NOT NULL DEFAULT 'active', department_id uuid, title_id uuid, email text);
    -- What a signed-in session may touch directly, as on production (RLS aside): reading, and HR's updates.
    GRANT SELECT ON users, permission_templates, permission_template_grants, titles, hr_staff_costs TO authenticated;
    GRANT UPDATE ON hr_staff_costs TO authenticated;

    -- The permission helpers as production answers them, for what the test hands the session.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      RETURN EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE w = ANY (string_to_array(nullif(current_setting('test.actions', true), ''), ',')));
    END $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      RETURN p_key = ANY (coalesce(string_to_array(nullif(current_setting('test.perms', true), ''), ','), '{}'));
    END $$;
  `)
  await db.exec((await readFile(new URL('hr-staff-permission-guard-production.sql', here), 'utf8')).replace(/\r\n/g, '\n'))
  await db.exec(`CREATE TRIGGER hr_staff_costs_permission_guard BEFORE INSERT OR UPDATE OF title_id, user_id ON hr_staff_costs
    FOR EACH ROW EXECUTE FUNCTION hr_staff_permission_guard()`)
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'hr_staff_permission_guard'"), '6738775be21620efcd392985b96c897f',
    'the guard as production runs it')

  await q(`INSERT INTO permission_templates VALUES
    ($1, 'Ultimate full access', 'principal'), ($2, 'HR · Payroll', 'hr'), ($3, 'Staff · Basic', 'staff'), ($4, 'People lead', 'staff')`,
  [T_ULTIMATE, T_HR, T_STAFF, T_GRANTER])
  await q(`INSERT INTO permission_template_grants VALUES
    ($1, 'accounts', 'manage', 'all'), ($1, 'accounts', 'create', 'all'), ($2, 'accounts', 'view', 'all'),
    ($3, 'dashboard', 'view', 'own'), ($4, 'accounts', 'manage', 'all')`, [T_ULTIMATE, T_HR, T_STAFF, T_GRANTER])
  await q(`INSERT INTO titles VALUES ($1, 'DIRECTOR', $2), ($3, 'HR EXECUTIVE', $4), ($5, 'CLERK', $6), ($7, 'PEOPLE LEAD', $8), ($9, 'INTERN', NULL)`,
    [TITLE_DIRECTOR, T_ULTIMATE, TITLE_HR, T_HR, TITLE_CLERK, T_STAFF, TITLE_GRANTER, T_GRANTER, TITLE_NONE])
  await q(`INSERT INTO auth.users(id, email) VALUES ($1, 'hr@example.com'), ($2, 'boss@example.com')`, [HR_LOGIN, BOSS_LOGIN])
  await q(`INSERT INTO users VALUES ($1, 'hr@example.com', 'LI SEAN', 'hr', $3, true), ($2, 'boss@example.com', 'BOSS', 'principal', $3, true)`,
    [HR_LOGIN, BOSS_LOGIN, DEPT])
  await q(`INSERT INTO hr_staff_costs(id, employee_name, user_id, status, department_id, title_id) VALUES
    ($1, 'CLERK ONE', NULL, 'active', $8, $9), ($2, 'NEW DIRECTOR', NULL, 'active', $8, $10),
    ($3, 'PEOPLE LEAD', NULL, 'active', $8, $11), ($4, 'GONE', NULL, 'inactive', $8, $9),
    ($5, 'INTERN', NULL, 'active', $8, $12), ($6, 'LI SEAN', $13, 'active', $8, $14), ($7, 'CLERK TWO', NULL, 'active', $8, $9)`,
  [P_CLERK, P_DIRECTOR, P_GRANTER, P_INACTIVE, P_NO_TEMPLATE, P_HR_SELF, P_CLERK2, DEPT, TITLE_CLERK, TITLE_DIRECTOR, TITLE_GRANTER, TITLE_NONE, HR_LOGIN, TITLE_HR])
  /** A Supabase login made `ago` before now, the way the invite makes one first. */
  const login = (n, email, ago = '1 minute') => q(`INSERT INTO auth.users(id, email, created_at) VALUES ($1, $2, now() - $3::interval)`, [NEW_LOGIN(n), email, ago])
  const attach = (staff, n, email) => q('SELECT public.account_attach_login($1, $2, $3)', [staff, NEW_LOGIN(n), email])

  // ── Before: HR holding Permissions · Create could not put a login on anybody ────────────────────
  await login(1, 'clerk.one@example.com')
  await asSystem()
  await q(`INSERT INTO users VALUES ($1, 'clerk.one@example.com', 'CLERK ONE', 'staff', $2, true)`, [NEW_LOGIN(1), DEPT])
  await as(HR_LOGIN, { actions: HR_ACTIONS })
  await refused('UPDATE hr_staff_costs SET user_id = $1 WHERE id = $2', [NEW_LOGIN(1), P_CLERK], /Ask whoever manages permissions/,
    'the hole the user met: the guard refuses HR putting a login on a person')
  await asSystem()
  await q('DELETE FROM users WHERE id = $1', [NEW_LOGIN(1)])

  // ── The migration, verbatim — twice: the second run changes nothing ───────────────────────────────
  const sql = (await readFile(new URL('20261020190000_invite_by_permissions_create.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  const guardAfter = await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'hr_staff_permission_guard'")
  await db.exec(sql)
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'hr_staff_permission_guard'"), guardAfter, 'applied again, the guard is not changed twice')
  const fn = "proname = 'account_attach_login'"
  check(await one(`SELECT prosecdef FROM pg_proc WHERE ${fn}`), true, 'it runs as its owner: the users row is nobody else’s to write')
  check(await one(`SELECT prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') FROM pg_proc WHERE ${fn}`), true, 'plpgsql')
  check(await one("SELECT has_function_privilege('authenticated', 'public.account_attach_login(uuid, uuid, text)', 'EXECUTE')"), true, 'a signed-in session calls it')
  check(await one("SELECT has_function_privilege('anon', 'public.account_attach_login(uuid, uuid, text)', 'EXECUTE')"), false, 'never the publishable key')

  // ── HR, holding Permissions · Create, gives a login ──────────────────────────────────────────────
  await as(HR_LOGIN, { actions: HR_ACTIONS })
  await attach(P_CLERK, 1, '  Clerk.One@Example.com ')
  await asSystem()
  check(await q('SELECT email, name, role::text, department_id FROM users WHERE id = $1', [NEW_LOGIN(1)]),
    [{ email: 'clerk.one@example.com', name: 'CLERK ONE', role: 'staff', department_id: DEPT }],
    'the portal user: their name and department, the email in lower case, the kind of their title’s template')
  check(await q('SELECT user_id, email FROM hr_staff_costs WHERE id = $1', [P_CLERK]), [{ user_id: NEW_LOGIN(1), email: 'clerk.one@example.com' }],
    'and the person carries the login')
  check(await one("SELECT coalesce(current_setting('app.login_attach', true), '')"), '', 'the pass is cleared straight after')

  // …and only through the function: the pass never reaches a direct write.
  await login(2, 'clerk.two@example.com')
  await asSystem()
  await q(`INSERT INTO users VALUES ($1, 'clerk.two@example.com', 'CLERK TWO', 'staff', $2, true)`, [NEW_LOGIN(2), DEPT])
  await as(HR_LOGIN, { actions: HR_ACTIONS })
  await refused('UPDATE hr_staff_costs SET user_id = $1 WHERE id = $2', [NEW_LOGIN(2), P_CLERK2], /Ask whoever manages permissions/,
    'a login put straight on a person is still refused for HR')
  await refused('UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2', [TITLE_DIRECTOR, P_CLERK], /Ask whoever manages permissions/,
    'and somebody who signs in still cannot be moved to a title on another template by HR')
  await asSystem()
  await q('DELETE FROM users WHERE id = $1', [NEW_LOGIN(2)])

  // ── A full-access title: only whoever manages permissions ────────────────────────────────────────
  await login(3, 'director@example.com')
  await login(4, 'lead@example.com')
  await as(HR_LOGIN, { actions: HR_ACTIONS })
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_DIRECTOR, NEW_LOGIN(3), 'director@example.com'],
    /DIRECTOR is a full-access title \(Ultimate full access\): only whoever manages permissions gives it a login/,
    'HR cannot give a Principal-kind title a login — it would be HR’s own full-access account')
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_GRANTER, NEW_LOGIN(4), 'lead@example.com'],
    /PEOPLE LEAD is a full-access title \(People lead\)/, 'nor a title whose template manages permissions')
  await asSystem()
  check(await q('SELECT count(*)::int AS n FROM users WHERE id IN ($1, $2)', [NEW_LOGIN(3), NEW_LOGIN(4)]), [{ n: 0 }], 'nothing written for either')
  await as(BOSS_LOGIN, { actions: MANAGER_ACTIONS, perms: ['permissions_manage'] })
  await attach(P_DIRECTOR, 3, 'director@example.com')
  await asSystem()
  check(await q('SELECT u.role::text, s.user_id FROM hr_staff_costs s JOIN users u ON u.id = s.user_id WHERE s.id = $1', [P_DIRECTOR]),
    [{ role: 'principal', user_id: NEW_LOGIN(3) }], 'whoever manages permissions does, as before')

  // ── Refusals, each before anything is written ────────────────────────────────────────────────────
  await login(5, 'clerk.two@example.com')
  await as(HR_LOGIN, { actions: ['accounts.view', 'team.view', 'team.edit'] })
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_CLERK2, NEW_LOGIN(5), 'clerk.two@example.com'],
    /needs Permissions · Create/, 'without Permissions · Create')
  await as(HR_LOGIN, { actions: HR_ACTIONS })
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_INACTIVE, NEW_LOGIN(5), 'clerk.two@example.com'],
    /GONE is no longer active/, 'somebody no longer active')
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_CLERK, NEW_LOGIN(5), 'clerk.two@example.com'],
    /CLERK ONE already has a login/, 'somebody who has one')
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_NO_TEMPLATE, NEW_LOGIN(5), 'clerk.two@example.com'],
    /INTERN has no permission template on their title yet/, 'a title with no template')
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_CLERK2, NEW_LOGIN(5), 'someone.else@example.com'],
    /The new login was not found/, 'a login under another email')
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_CLERK2, HR_LOGIN, 'hr@example.com'],
    /That email already has an account/, 'a login that is somebody’s already — HR’s own — is never put on somebody else')
  await asSystem()
  await login(6, 'old@example.com', '2 hours')
  await as(HR_LOGIN, { actions: HR_ACTIONS })
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_CLERK2, NEW_LOGIN(6), 'old@example.com'],
    /The new login was not found/, 'a login made more than an hour ago')
  await asSystem()
  await login(7, 'Clerk.One@example.com')
  await as(HR_LOGIN, { actions: HR_ACTIONS })
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_CLERK2, NEW_LOGIN(7), 'clerk.one@example.com'],
    /That email already has an account/, 'an email another portal user holds')
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_CLERK2, NEW_LOGIN(5), ''], /Reload the page/, 'no email')
  await asSystem()
  check(await q('SELECT user_id FROM hr_staff_costs WHERE id = $1', [P_CLERK2]), [{ user_id: null }], 'CLERK TWO still has none')
  check(await one('SELECT count(*)::int FROM users'), 4, 'and no users row was left by a refusal')

  // ── Then the same person, properly ───────────────────────────────────────────────────────────────
  await as(HR_LOGIN, { actions: HR_ACTIONS })
  await attach(P_CLERK2, 5, 'clerk.two@example.com')
  await asSystem()
  check(await one('SELECT user_id FROM hr_staff_costs WHERE id = $1', [P_CLERK2]), NEW_LOGIN(5), 'CLERK TWO signs in')

  // ── No sign-in at all ────────────────────────────────────────────────────────────────────────────
  await login(8, 'nobody@example.com')
  await as(null, {})
  await refused('SELECT public.account_attach_login($1, $2, $3)', [P_GRANTER, NEW_LOGIN(8), 'nobody@example.com'],
    /needs Permissions · Create/, 'a session with no sign-in is refused')

  console.log(`account_attach_login: ${checks} checks passed`)
} finally {
  await db.close()
}
