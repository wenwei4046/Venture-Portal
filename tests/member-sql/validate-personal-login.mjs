// Local PostgreSQL regression for 20261012000000 (Change password, 2026-10-12 — the user: "just for
// that personal acc"). `my_login_is_personal()` tells a person's own login — one a People record
// names (`hr_staff_costs.user_id`) — from a shared account nobody's record names (principal@,
// finance@, hr@, marketing@), for the caller only. The roster is closed to the caller here as it
// is on production to a Finance or Revenue member login (RLS on, no policy for them), and the
// function still answers: it is SECURITY DEFINER. The migration is applied VERBATIM. No live I/O.
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
const refused = async (sql, pattern, what) => {
  await assert.rejects(() => q(sql), pattern, what)
  checks++
}

async function as(user, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  if (role) await db.exec(`SET ROLE ${role}`)
}

const PERSONAL = id(1) // a person's own login (People › Invite user)
const SHARED = id(2) // finance@ — several people sign in with it
const LEFT = id(3) // a person who left keeps their record, and their login stays theirs
const STRANGER = id(99) // signed in, with no portal account at all

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    -- Supabase's own default: a function made in public is everybody's — the migration takes it back.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

    CREATE TABLE users(id uuid PRIMARY KEY, email text NOT NULL);
    CREATE TABLE hr_staff_costs(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_name text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      user_id uuid REFERENCES users(id) ON DELETE SET NULL
    );
    -- Closed to them, as production's roster is to a Finance or Revenue member login.
    ALTER TABLE hr_staff_costs ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON hr_staff_costs TO authenticated;
  `)
  await q(`INSERT INTO users VALUES ($1, 'carrie@example.com'), ($2, 'finance@venture.my'), ($3, 'left@example.com')`,
    [PERSONAL, SHARED, LEFT])
  await q(`INSERT INTO hr_staff_costs (employee_name, status, user_id) VALUES
    ('ONG MEI SHUANG', 'active', $1), ('SOMEBODY WHO LEFT', 'inactive', $2), ('NO LOGIN YET', 'active', NULL)`, [PERSONAL, LEFT])

  // ── The migration, verbatim ───────────────────────────────────────────────
  const sql = (await readFile(new URL('20261012000000_my_login_is_personal.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  check(await one("SELECT prosecdef FROM pg_proc WHERE proname = 'my_login_is_personal'"), true, 'it runs as its owner')
  check(await one("SELECT provolatile FROM pg_proc WHERE proname = 'my_login_is_personal'"), 's', 'and is STABLE — it writes nothing')
  check(await one("SELECT prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') FROM pg_proc WHERE proname = 'my_login_is_personal'"),
    true, 'plpgsql, as every helper here')

  // ── Who asks ──────────────────────────────────────────────────────────────
  await as(PERSONAL)
  check(await one('SELECT count(*)::int FROM hr_staff_costs'), 0, 'the roster is closed to them …')
  check(await one('SELECT my_login_is_personal()'), true, '… and their own login is still known to be theirs')
  await as(SHARED)
  check(await one('SELECT my_login_is_personal()'), false, 'a shared account is no person’s')
  await as(LEFT)
  check(await one('SELECT my_login_is_personal()'), true, 'a person who left: the login is still theirs while it signs in')
  await as(STRANGER)
  check(await one('SELECT my_login_is_personal()'), false, 'a sign-in with no portal account is nobody’s')
  await as(null)
  check(await one('SELECT my_login_is_personal()'), false, 'no sign-in answers no, not an error')

  // ── Who may call it ───────────────────────────────────────────────────────
  await as(null, 'anon')
  await refused('SELECT my_login_is_personal()', /permission denied for function my_login_is_personal/, 'never the publishable key')
  await db.exec('RESET ROLE')
  check(await one("SELECT has_function_privilege('authenticated', 'public.my_login_is_personal()', 'EXECUTE')"), true, 'a signed-in session calls it')
  check(await one("SELECT has_function_privilege('service_role', 'public.my_login_is_personal()', 'EXECUTE')"), true, 'and the server')
  check(await one(`SELECT count(*)::int FROM information_schema.routine_privileges
    WHERE routine_name = 'my_login_is_personal' AND grantee = 'PUBLIC'`), 0, 'PUBLIC holds nothing')

  // ── A login detached from its record, and run twice ───────────────────────
  await q('UPDATE hr_staff_costs SET user_id = NULL WHERE user_id = $1', [PERSONAL])
  await as(PERSONAL)
  check(await one('SELECT my_login_is_personal()'), false, 'a login no record names any more is shared again')
  await db.exec('RESET ROLE')
  await db.exec(sql)
  await as(LEFT)
  check(await one('SELECT my_login_is_personal()'), true, 'a second run changes nothing')

  console.log(`PASS: ${checks} personal-login checks. The migration verbatim; no live database.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}
