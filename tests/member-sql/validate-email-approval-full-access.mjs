// Local PostgreSQL regression for 20261022230000 (2026-10-22, after #619 — the user: "1 and 2 both do"): approving a
// Request to change email for a FULL-ACCESS login is whoever manages permissions'. att_login_email_change is loaded as
// production runs it (20261016190000's body, md5-checked), over stand-ins for the tables it reads; the migration is
// applied VERBATIM, twice. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
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

/** Signed in as `user`, holding `actions` (has_any_action). */
async function as(user, actions = []) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.actions', $1, false)", [actions.join(',')])
  await db.exec('SET ROLE authenticated')
}

const HR = ['attendance.view', 'attendance.create', 'attendance.approve']
const MANAGER = [...HR, 'accounts.manage']

const T_ULTIMATE = id(101)
const T_STAFF = id(102)
const T_GRANTER = id(103)
const TITLE_CEO = id(201)
const TITLE_CLERK = id(202)
const TITLE_GRANTER = id(203)
const TITLE_NONE = id(204)
const HR_LOGIN = id(1)
const BOSS_LOGIN = id(2)
const CEO_LOGIN = id(3)
const CLERK_LOGIN = id(4)
const LEAD_LOGIN = id(5)
const OLD_LOGIN = id(6)
const P_HR = id(401)
const P_CEO = id(402)
const P_CLERK = id(403)
const P_LEAD = id(404)
const P_OLD = id(405)
const P_NO_LOGIN = id(406)
const R = n => id(900 + n)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

    CREATE TYPE public.user_role AS ENUM ('principal', 'finance', 'hr', 'staff', 'revenue_member');
    CREATE TABLE users(id uuid PRIMARY KEY, email text NOT NULL, name text NOT NULL, role public.user_role NOT NULL);
    CREATE TABLE permission_templates(id uuid PRIMARY KEY, name text NOT NULL, base_role public.user_role NOT NULL);
    CREATE TABLE permission_template_grants(template_id uuid, function_key text, action text, scope text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, template_id uuid);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, user_id uuid, title_id uuid, email text);
    CREATE TABLE att_requests(id uuid PRIMARY KEY, staff_id uuid, kind text, status text, detail jsonb);
    CREATE TABLE att_request_steps(request_id uuid, seq int, role text, state text);

    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ','))) $$;
    CREATE FUNCTION public.att_my_staff_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
      $$ SELECT s.id FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() LIMIT 1 $$;
  `)

  // att_login_email_change as production runs it: 20261016190000's statement, whose body md5 production reports.
  const original = (await readFile(new URL('20261016190000_login_email_change.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  const fn = /CREATE OR REPLACE FUNCTION public\.att_login_email_change\(p_request uuid\)[\s\S]*?\$function\$;\n/.exec(original)
  assert.ok(fn, '20261016190000 holds att_login_email_change')
  await db.exec(fn[0])
  const PRODUCTION = '312fb9d6164b3c965187c0e29f9d59f1'
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'att_login_email_change'"), PRODUCTION, 'the function as production runs it')
  await db.exec('REVOKE ALL ON FUNCTION public.att_login_email_change(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.att_login_email_change(uuid) TO authenticated;')

  await q(`INSERT INTO permission_templates VALUES ($1, 'Ultimate full access', 'principal'), ($2, 'Staff · Basic', 'staff'), ($3, 'People lead', 'staff')`,
    [T_ULTIMATE, T_STAFF, T_GRANTER])
  await q(`INSERT INTO permission_template_grants VALUES ($1, 'accounts', 'manage', 'all'), ($2, 'dashboard', 'view', 'own'), ($3, 'accounts', 'manage', 'all')`,
    [T_ULTIMATE, T_STAFF, T_GRANTER])
  await q(`INSERT INTO titles VALUES ($1, 'CHIEF EXECUTIVE OFFICER', $2), ($3, 'CLERK', $4), ($5, 'PEOPLE LEAD', $6), ($7, 'ADVISOR', NULL)`,
    [TITLE_CEO, T_ULTIMATE, TITLE_CLERK, T_STAFF, TITLE_GRANTER, T_GRANTER, TITLE_NONE])
  await q(`INSERT INTO auth.users VALUES ($1, 'hr@x.my'), ($2, 'boss@x.my'), ($3, 'ceo@x.my'), ($4, 'clerk@x.my'), ($5, 'lead@x.my'), ($6, 'old@x.my')`,
    [HR_LOGIN, BOSS_LOGIN, CEO_LOGIN, CLERK_LOGIN, LEAD_LOGIN, OLD_LOGIN])
  await q(`INSERT INTO users VALUES ($1, 'hr@x.my', 'LI SEAN', 'hr'), ($2, 'boss@x.my', 'BOSS', 'principal'), ($3, 'ceo@x.my', 'CEO', 'principal'),
    ($4, 'clerk@x.my', 'CLERK', 'staff'), ($5, 'lead@x.my', 'LEAD', 'staff'), ($6, 'old@x.my', 'OLD', 'principal')`,
  [HR_LOGIN, BOSS_LOGIN, CEO_LOGIN, CLERK_LOGIN, LEAD_LOGIN, OLD_LOGIN])
  await q(`INSERT INTO hr_staff_costs VALUES ($1, 'LI SEAN', $2, $3, 'hr@x.my'), ($4, 'LOO WEN WEI', $5, $6, 'ceo@x.my'),
    ($7, 'CHEA HUAN', $8, $3, 'clerk@x.my'), ($9, 'PEOPLE LEAD', $10, $11, 'lead@x.my'), ($12, 'OLD BOSS', $13, $14, 'old@x.my'),
    ($15, 'NO LOGIN', NULL, $3, 'nologin@x.my')`,
  [P_HR, HR_LOGIN, TITLE_CLERK, P_CEO, CEO_LOGIN, TITLE_CEO, P_CLERK, CLERK_LOGIN, P_LEAD, LEAD_LOGIN, TITLE_GRANTER, P_OLD, OLD_LOGIN, TITLE_NONE, P_NO_LOGIN])

  /** A pending profile change of the email, waiting on HR's last step. */
  const request = async (n, staff, to, { kind = 'profile', steps = [['hr', 'waiting']], status = 'pending' } = {}) => {
    await db.exec('RESET ROLE')
    await q('INSERT INTO att_requests VALUES ($1, $2, $3, $4, $5)',
      [R(n), staff, kind, status, JSON.stringify({ changes: [{ key: 'email', to }] })])
    for (const [i, [role, state]] of steps.entries()) await q('INSERT INTO att_request_steps VALUES ($1, $2, $3, $4)', [R(n), i + 1, role, state])
  }
  const facts = r => one('SELECT public.att_login_email_change($1)', [r])

  await request(1, P_CLERK, 'CheaHuan.New@x.my')
  await request(2, P_CEO, 'hr.own@x.my')
  await request(3, P_LEAD, 'hr.own@x.my')
  await request(4, P_OLD, 'hr.own@x.my')
  await request(5, P_HR, 'li.sean@x.my')
  await request(6, P_CEO, 'hr.own@x.my', { steps: [['upline', 'waiting'], ['hr', 'queued']] })
  await request(7, P_NO_LOGIN, 'someone@x.my')

  // ── Before: HR could approve the CEO's change — the hole ──────────────────────────────────────────
  await as(HR_LOGIN, HR)
  check((await facts(R(2))).to, 'hr.own@x.my', 'before the migration, HR’s Approve would move the CEO’s login to HR’s own mailbox')

  // ── The migration, verbatim — twice: the second run changes nothing ───────────────────────────────
  await db.exec('RESET ROLE')
  const sql = (await readFile(new URL('20261022230000_email_approval_full_access.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  const after = await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'att_login_email_change'")
  await db.exec(sql)
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'att_login_email_change'"), after, 'applied again, the function is not changed twice')
  const added = '  IF public.has_any_action(ARRAY[\'accounts.manage\']) IS NOT TRUE AND public.login_email_held(v_r.staff_id) IS NOT NULL THEN\n'
    + "    RAISE EXCEPTION '%', public.login_email_held(v_r.staff_id) USING ERRCODE = '42501';\n"
    + '  END IF;\n'
  check(await one("SELECT md5(replace(prosrc, $1, '')) FROM pg_proc WHERE proname = 'att_login_email_change'", [added]), PRODUCTION,
    'production’s body with exactly one statement added')
  check(after, '614a68ea28bac0fc018f43fea4873330', 'the body production runs since the migration was applied (2026-10-22)')
  check(await q("SELECT prosecdef, provolatile FROM pg_proc WHERE proname = 'att_login_email_change'"), [{ prosecdef: true, provolatile: 's' }],
    'still STABLE and its owner’s')
  check(await one("SELECT has_function_privilege('authenticated', 'public.att_login_email_change(uuid)', 'EXECUTE')"), true, 'a sign-in still calls it')
  check(await one("SELECT has_function_privilege('anon', 'public.att_login_email_change(uuid)', 'EXECUTE')"), false, 'never the publishable key')
  check(await q("SELECT prosecdef, provolatile FROM pg_proc WHERE proname = 'login_email_held'"), [{ prosecdef: true, provolatile: 's' }],
    'the helper: its owner’s, STABLE')
  for (const role of ['authenticated', 'anon']) {
    check(await one(`SELECT has_function_privilege('${role}', 'public.login_email_held(uuid)', 'EXECUTE')`), false, `the helper is not ${role}’s to call`)
  }
  check(await one("SELECT has_function_privilege('service_role', 'public.login_email_held(uuid)', 'EXECUTE')"), true, 'only the DEFINER functions’ (and the service role’s)')

  // ── HR: an ordinary login's change moves as before; a full-access login's is refused in words ──────
  await as(HR_LOGIN, HR)
  check(await facts(R(1)), { user_id: CLERK_LOGIN, from: 'clerk@x.my', to: 'cheahuan.new@x.my' }, 'CHEA HUAN’s change: the move, as before')
  await refused('SELECT public.att_login_email_change($1)', [R(2)],
    /CHIEF EXECUTIVE OFFICER is a full-access title \(Ultimate full access\): only whoever manages permissions changes its login's email/,
    'the CEO’s change is refused for HR — the People page’s own words')
  await refused('SELECT public.att_login_email_change($1)', [R(3)], /PEOPLE LEAD is a full-access title \(People lead\)/,
    'so is a title whose template manages permissions')
  await refused('SELECT public.att_login_email_change($1)', [R(4)], /ADVISOR is a full-access title \(a Principal login\)/,
    'and a Principal login on a title with no template')
  await refused('SELECT public.att_login_email_change($1)', [R(5)], /Nobody decides their own request/, 'one’s own request: refused first, as before')
  check(await facts(R(6)), null, 'a step that is not HR’s last: nothing to move, nothing refused')
  check(await facts(R(7)), null, 'somebody with no login: nothing to move')

  // ── Whoever manages permissions approves it ───────────────────────────────────────────────────────
  await as(BOSS_LOGIN, MANAGER)
  check(await facts(R(2)), { user_id: CEO_LOGIN, from: 'ceo@x.my', to: 'hr.own@x.my' }, 'the CEO’s change moves for whoever manages permissions')
  check((await facts(R(3))).user_id, LEAD_LOGIN, 'and the People lead’s')
  check((await facts(R(4))).user_id, OLD_LOGIN, 'and the Principal login’s')

  // ── Without Attendance · Approve: refused as before, whoever the person ───────────────────────────
  await as(HR_LOGIN, ['attendance.view'])
  await refused('SELECT public.att_login_email_change($1)', [R(1)], /needs Attendance · Approve/, 'an ordinary login’s, without Approve')

  // ── The helper's answers ──────────────────────────────────────────────────────────────────────────
  await db.exec('RESET ROLE')
  check(await one('SELECT public.login_email_held($1)', [P_CLERK]), null, 'an ordinary login: nothing held')
  check(await one('SELECT public.login_email_held($1)', [P_NO_LOGIN]), null, 'no login: nothing held')
  check(await one('SELECT public.login_email_held($1)', [id(999)]), null, 'nobody: nothing held')

  console.log(`email approval full access: ${checks} checks passed`)
} finally {
  await db.close()
}
