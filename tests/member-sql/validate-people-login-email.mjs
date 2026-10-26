// Local PostgreSQL regression for 20261022150000 (HR edits a login's email on the person's page, 2026-10-22 — the user:
// "i want the email can be editable, for hr"). The portal asks person_login_email_move(staff, email) under the
// editor's session, moves the login in the auth server (the service role — not here), then person_login_email_set
// writes the login row and the People record, only once the login already signs in with the new email. Both ask
// People · Edit with the HR scope and the person's page's box (tab_write_guard — production's body, md5-checked);
// a full-access title is only whoever manages permissions'. The migration is applied VERBATIM, twice. No live I/O.
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

/** Signed in as `user`, holding `actions` (has_any_action) and `scopes` (has_scope); `shut` closes the page's box. */
async function as(user, { actions = [], scopes = [], shut = false } = {}) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.actions', $1, false)", [actions.join(',')])
  await q("SELECT set_config('test.scopes', $1, false)", [scopes.join(',')])
  await q("SELECT set_config('test.tab_shut', $1, false)", [shut ? 'yes' : 'no'])
  await db.exec('SET ROLE authenticated')
}
const asSystem = () => db.exec('RESET ROLE')

const HR = { actions: ['team.view', 'team.create', 'team.edit', 'accounts.view', 'accounts.create'], scopes: ['hr'] }
const MANAGER = { actions: [...HR.actions, 'accounts.manage'], scopes: ['hr', 'admin'] }

const T_ULTIMATE = id(101) // Principal kind
const T_STAFF = id(102) // Staff · Basic
const T_GRANTER = id(103) // a staff-kind template that ticks Manage permissions
const TITLE_DIRECTOR = id(201)
const TITLE_CLERK = id(202)
const TITLE_GRANTER = id(203)
const TITLE_NONE = id(204) // a title with no template
const HR_LOGIN = id(1)
const BOSS_LOGIN = id(2)
const CLERK_LOGIN = id(3)
const DIRECTOR_LOGIN = id(4)
const GRANTER_LOGIN = id(5)
const OLD_PRINCIPAL_LOGIN = id(6) // a Principal login whose title has no template
const STRANGER_LOGIN = id(7) // a sign-in the auth server holds and the portal does not
const P_CLERK = id(401)
const P_DIRECTOR = id(402)
const P_GRANTER = id(403)
const P_OLD_PRINCIPAL = id(404)
const P_NO_LOGIN = id(405)

const move = (staff, email) => one('SELECT public.person_login_email_move($1, $2)', [staff, email])
const set = (staff, email) => q('SELECT public.person_login_email_set($1, $2)', [staff, email])
/** What the auth server does at the service role's word — the step between the two. */
const authMoves = async (login, email) => {
  await asSystem()
  await q('UPDATE auth.users SET email = $2 WHERE id = $1', [login, email])
}
const emails = async staff => {
  await asSystem()
  return (await q(`SELECT s.email AS record, u.email AS login, a.email AS auth FROM hr_staff_costs s
    LEFT JOIN users u ON u.id = s.user_id LEFT JOIN auth.users a ON a.id = s.user_id WHERE s.id = $1`, [staff]))[0]
}

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
    CREATE TABLE users(id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, role public.user_role NOT NULL,
      is_active boolean NOT NULL DEFAULT true, updated_at timestamptz);
    CREATE TABLE permission_templates(id uuid PRIMARY KEY, name text NOT NULL, base_role public.user_role NOT NULL);
    CREATE TABLE permission_template_grants(template_id uuid, function_key text, action text, scope text);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, template_id uuid);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, user_id uuid REFERENCES users(id),
      title_id uuid, email text);
    -- A signed-in session reads; it writes neither table straight (the row policies are not this test's).
    GRANT SELECT ON users, hr_staff_costs TO authenticated;

    -- The permission helpers as production answers them, for what the test hands the session.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ','))) $$;
    CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM unnest(p_scopes) s WHERE s = ANY (string_to_array(current_setting('test.scopes', true), ','))) $$;
    CREATE FUNCTION public.tab_write_open(p_pages text[], p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.tab_shut', true) IS DISTINCT FROM 'yes' $$;

    -- tab_write_guard(p_pages text[], p_wants text[]) — production body md5 bc874286994bf99cc0d07257b6131fb4
    CREATE OR REPLACE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[])
     RETURNS void
     LANGUAGE plpgsql
     STABLE SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
DECLARE
  v_stack text;
BEGIN
  -- The functions on the stack: this one, the write it guards, and whatever called that. A DO
  -- block is nobody's caller (only the database's own scripts run one).
  GET DIAGNOSTICS v_stack = PG_CONTEXT;
  IF (SELECT count(*) FROM regexp_matches(v_stack, '(^|\\n)(PL/pgSQL|SQL) function (?!inline_code_block)', 'g')) > 2 THEN
    RETURN;
  END IF;
  IF NOT public.tab_write_open(p_pages, p_wants) THEN
    RAISE EXCEPTION 'Not open to you on this page — a box in your permissions is unticked'
      USING ERRCODE = '42501';
  END IF;
END
$function$;
  `)
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'tab_write_guard'"), 'bc874286994bf99cc0d07257b6131fb4',
    'the page guard as production runs it')

  await q(`INSERT INTO permission_templates VALUES ($1, 'Ultimate full access', 'principal'), ($2, 'Staff · Basic', 'staff'),
    ($3, 'People lead', 'staff')`, [T_ULTIMATE, T_STAFF, T_GRANTER])
  await q(`INSERT INTO permission_template_grants VALUES ($1, 'accounts', 'manage', 'all'), ($2, 'dashboard', 'view', 'own'),
    ($3, 'accounts', 'manage', 'all')`, [T_ULTIMATE, T_STAFF, T_GRANTER])
  await q(`INSERT INTO titles VALUES ($1, 'DIRECTOR', $2), ($3, 'CLERK', $4), ($5, 'PEOPLE LEAD', $6), ($7, 'ADVISOR', NULL)`,
    [TITLE_DIRECTOR, T_ULTIMATE, TITLE_CLERK, T_STAFF, TITLE_GRANTER, T_GRANTER, TITLE_NONE])
  await q(`INSERT INTO auth.users VALUES ($1, 'hr@example.com'), ($2, 'boss@example.com'), ($3, 'clerk@example.com'),
    ($4, 'director@example.com'), ($5, 'lead@example.com'), ($6, 'old.boss@example.com'), ($7, 'stranger@example.com')`,
  [HR_LOGIN, BOSS_LOGIN, CLERK_LOGIN, DIRECTOR_LOGIN, GRANTER_LOGIN, OLD_PRINCIPAL_LOGIN, STRANGER_LOGIN])
  await q(`INSERT INTO users(id, email, name, role) VALUES ($1, 'hr@example.com', 'LI SEAN', 'hr'), ($2, 'boss@example.com', 'BOSS', 'principal'),
    ($3, 'clerk@example.com', 'CLERK', 'staff'), ($4, 'director@example.com', 'DIRECTOR', 'principal'),
    ($5, 'lead@example.com', 'LEAD', 'staff'), ($6, 'old.boss@example.com', 'OLD BOSS', 'principal')`,
  [HR_LOGIN, BOSS_LOGIN, CLERK_LOGIN, DIRECTOR_LOGIN, GRANTER_LOGIN, OLD_PRINCIPAL_LOGIN])
  await q(`INSERT INTO hr_staff_costs VALUES ($1, 'CHEA HUAN', $2, $3, 'clerk@example.com'), ($4, 'THE DIRECTOR', $5, $6, 'director@example.com'),
    ($7, 'PEOPLE LEAD', $8, $9, 'lead@example.com'), ($10, 'OLD BOSS', $11, $12, 'old.boss@example.com'), ($13, 'NO LOGIN', NULL, $3, 'nologin@example.com')`,
  [P_CLERK, CLERK_LOGIN, TITLE_CLERK, P_DIRECTOR, DIRECTOR_LOGIN, TITLE_DIRECTOR, P_GRANTER, GRANTER_LOGIN, TITLE_GRANTER,
    P_OLD_PRINCIPAL, OLD_PRINCIPAL_LOGIN, TITLE_NONE, P_NO_LOGIN])

  // ── The migration, verbatim — twice: the second run changes nothing ───────────────────────────────
  const sql = (await readFile(new URL('20261022150000_people_edit_login_email.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  const bodies = async () => q("SELECT proname, md5(prosrc) FROM pg_proc WHERE proname LIKE 'person_login_email_%' ORDER BY 1")
  const first = await bodies()
  await db.exec(sql)
  check(await bodies(), first, 'applied again, the same two functions')
  for (const [fn, volatile] of [['person_login_email_move', 's'], ['person_login_email_set', 'v']]) {
    check(await q(`SELECT prosecdef, provolatile, prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') AS plpgsql FROM pg_proc WHERE proname = $1`, [fn]),
      [{ prosecdef: true, provolatile: volatile, plpgsql: true }], `${fn}: runs as its owner, plpgsql${volatile === 's' ? ', STABLE (it only reads)' : ''}`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}(uuid, text)', 'EXECUTE')`), true, `${fn}: a signed-in session calls it`)
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}(uuid, text)', 'EXECUTE')`), false, `${fn}: never the publishable key`)
  }

  // ── HR changes CHEA HUAN's email: asked first, the login moved, then written ────────────────────────
  await as(HR_LOGIN, HR)
  check(await move(P_CLERK, '  CheaHuan.New@Example.com '), { user_id: CLERK_LOGIN, from: 'clerk@example.com', to: 'cheahuan.new@example.com' },
    'the move: their login, from the email it signs in with, to the new one in lower case')
  check(await emails(P_CLERK), { record: 'clerk@example.com', login: 'clerk@example.com', auth: 'clerk@example.com' }, 'asking writes nothing')
  await as(HR_LOGIN, HR)
  await refused('SELECT public.person_login_email_set($1, $2)', [P_CLERK, 'cheahuan.new@example.com'],
    /Their login does not sign in with cheahuan\.new@example\.com yet/, 'the record never takes an email its login does not sign in with')
  check(await emails(P_CLERK), { record: 'clerk@example.com', login: 'clerk@example.com', auth: 'clerk@example.com' }, 'so nothing parts')
  await authMoves(CLERK_LOGIN, 'cheahuan.new@example.com')
  await as(HR_LOGIN, HR)
  await set(P_CLERK, 'CheaHuan.New@example.com')
  check(await emails(P_CLERK), { record: 'cheahuan.new@example.com', login: 'cheahuan.new@example.com', auth: 'cheahuan.new@example.com' },
    'the People record and the login row take it — all three read the same')
  check(await one('SELECT updated_at IS NOT NULL FROM users WHERE id = $1', [CLERK_LOGIN]), true, 'the login row says when')
  await as(HR_LOGIN, HR)
  check(await move(P_CLERK, 'cheahuan.new@example.com'), { user_id: CLERK_LOGIN, from: 'cheahuan.new@example.com', to: 'cheahuan.new@example.com' },
    'asked again for the email it has: nothing to move, and nothing refused')
  await set(P_CLERK, 'cheahuan.new@example.com')
  check((await emails(P_CLERK)).record, 'cheahuan.new@example.com', 'and written again, the same')

  // ── Somebody with no login: the record's own email, not these functions' ───────────────────────────
  await as(HR_LOGIN, HR)
  check(await move(P_NO_LOGIN, 'other@example.com'), null, 'no login: nothing to move')
  await refused('SELECT public.person_login_email_set($1, $2)', [P_NO_LOGIN, 'other@example.com'], /They have no login/,
    'and nothing written here — the record saves it')
  await refused('SELECT public.person_login_email_move($1, $2)', [id(999), 'x@example.com'], /no longer on the roster/, 'a person who is not there')

  // ── A full-access title: only whoever manages permissions ──────────────────────────────────────────
  await as(HR_LOGIN, HR)
  await refused('SELECT public.person_login_email_move($1, $2)', [P_DIRECTOR, 'hr.own@example.com'],
    /DIRECTOR is a full-access title \(Ultimate full access\): only whoever manages permissions changes its login's email/,
    'HR cannot send a Principal-kind login’s mail elsewhere — it would be HR’s own full-access account')
  await refused('SELECT public.person_login_email_move($1, $2)', [P_GRANTER, 'hr.own@example.com'],
    /PEOPLE LEAD is a full-access title \(People lead\)/, 'nor a title whose template manages permissions')
  await refused('SELECT public.person_login_email_move($1, $2)', [P_OLD_PRINCIPAL, 'hr.own@example.com'],
    /ADVISOR is a full-access title \(a Principal login\)/, 'nor a Principal login on a title with no template')
  await authMoves(DIRECTOR_LOGIN, 'hr.own@example.com')
  await as(HR_LOGIN, HR)
  await refused('SELECT public.person_login_email_set($1, $2)', [P_DIRECTOR, 'hr.own@example.com'], /full-access title/,
    'the write asks it again, even with the login moved')
  check((await emails(P_DIRECTOR)).login, 'director@example.com', 'nothing written for the Director')
  await as(BOSS_LOGIN, MANAGER)
  check((await move(P_DIRECTOR, 'hr.own@example.com')).to, 'hr.own@example.com', 'whoever manages permissions may')
  await set(P_DIRECTOR, 'hr.own@example.com')
  check(await emails(P_DIRECTOR), { record: 'hr.own@example.com', login: 'hr.own@example.com', auth: 'hr.own@example.com' }, 'and it is written')
  await authMoves(DIRECTOR_LOGIN, 'director@example.com')
  await as(BOSS_LOGIN, MANAGER)
  await set(P_DIRECTOR, 'director@example.com')
  check((await emails(P_DIRECTOR)).record, 'director@example.com', 'and back')

  // ── Emails that are not theirs to take ────────────────────────────────────────────────────────────
  await as(HR_LOGIN, HR)
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, 'HR@example.com'], /already belongs to another login/,
    'a portal account’s email')
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, 'stranger@example.com'], /already belongs to another login/,
    'a sign-in the auth server holds with no portal account')
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, '   '], /Their login needs an email/, 'none at all — a login needs one')
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, 'not-an-email'], /Enter an email address like name@houzs\.my/, 'not an email')
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, `${'a'.repeat(250)}@example.com`], /Enter an email address/, 'too long for one')

  // ── Who may ask at all ────────────────────────────────────────────────────────────────────────────
  await as(HR_LOGIN, { actions: ['team.view'], scopes: ['hr'] })
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, 'a@example.com'], /needs People · Edit/, 'without People · Edit')
  await refused('SELECT public.person_login_email_set($1, $2)', [P_CLERK, 'cheahuan.new@example.com'], /needs People · Edit/, 'the write too')
  await as(HR_LOGIN, { actions: HR.actions, scopes: ['treasury'] })
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, 'a@example.com'], /needs People · Edit/,
    'People · Edit without the HR scope the roster’s own update asks')
  await as(HR_LOGIN, { ...HR, shut: true })
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, 'a@example.com'], /Not open to you on this page/,
    'the person page’s Edit box unticked: refused before the login is moved')
  await refused('SELECT public.person_login_email_set($1, $2)', [P_CLERK, 'cheahuan.new@example.com'], /Not open to you on this page/,
    'and the write')
  await as(null, {})
  await refused('SELECT public.person_login_email_move($1, $2)', [P_CLERK, 'a@example.com'], /needs People · Edit/, 'no sign-in')
  check(await emails(P_CLERK), { record: 'cheahuan.new@example.com', login: 'cheahuan.new@example.com', auth: 'cheahuan.new@example.com' },
    'no refusal wrote anything')

  console.log(`people login email: ${checks} checks passed`)
} finally {
  await db.close()
}
