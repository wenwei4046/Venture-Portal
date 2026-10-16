// Local PostgreSQL regression for 20261016170000 (People › Invite user, 2026-10-16 — the user's two
// choices: Send Invite Link, or set the password now). `account_invite_states()` tells People which
// logins were sent an invite link not used yet: Supabase Auth's own fact (auth.users — invited_at,
// email_confirmed_at), which no signed-in reader may select. It answers whoever may invite or see the
// logins (Logins & invites · View or Create) and refuses everyone else, never the publishable key.
// The migration is applied VERBATIM over a stand-in for has_any_action(). No live I/O.
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

/** Signed in as `user`, holding `actions` (what has_any_action() answers for them). */
async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await q("SELECT set_config('test.actions', $1, false)", [actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}

const INVITED = id(1) // sent a link, not used yet
const ACCEPTED = id(2) // sent a link and chose their password
const SET_BY_HR = id(3) // HR set the password (createUser, confirmed at once)
const PRINCIPAL = id(10)
const MEMBER = id(11)

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, invited_at timestamptz, email_confirmed_at timestamptz);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    -- Supabase's own default: a function made in public is everybody's — the migration takes it back.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated, service_role;

    CREATE TABLE users(id uuid PRIMARY KEY, email text NOT NULL);
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON users TO authenticated;

    -- has_any_action() as production's answers it, for the actions the test hands the session.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      RETURN EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE w = ANY (string_to_array(nullif(current_setting('test.actions', true), ''), ',')));
    END $$;
  `)
  await q(`INSERT INTO auth.users VALUES
    ($1, 'kaiyee@example.com', '2026-10-16 01:00+00', NULL),
    ($2, 'peter@example.com', '2026-10-15 01:00+00', '2026-10-15 02:00+00'),
    ($3, 'carrie@example.com', NULL, '2026-10-01 00:00+00'),
    ($4, 'principal@example.com', NULL, '2026-04-09 00:00+00'),
    ($5, 'member@example.com', NULL, '2026-04-09 00:00+00')`, [INVITED, ACCEPTED, SET_BY_HR, PRINCIPAL, MEMBER])
  await q(`INSERT INTO users SELECT id, email FROM auth.users`)

  // ── The migration, verbatim ───────────────────────────────────────────────
  const sql = (await readFile(new URL('20261016170000_account_invite_states.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  const fn = "proname = 'account_invite_states'"
  check(await one(`SELECT prosecdef FROM pg_proc WHERE ${fn}`), true, 'it runs as its owner — auth.users is nobody else’s to read')
  check(await one(`SELECT provolatile FROM pg_proc WHERE ${fn}`), 's', 'STABLE: it writes nothing')
  check(await one(`SELECT prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql') FROM pg_proc WHERE ${fn}`), true, 'plpgsql')

  // ── What it answers ───────────────────────────────────────────────────────
  await as(PRINCIPAL, ['accounts.view', 'accounts.create'])
  const states = await q('SELECT user_id, pending FROM account_invite_states() ORDER BY user_id')
  check(states.map(r => [r.user_id, r.pending]), [
    [INVITED, true], [ACCEPTED, false], [SET_BY_HR, false], [PRINCIPAL, false], [MEMBER, false],
  ], 'pending = sent a link and no password chosen; a link used, or a password HR set, is not')
  check(await q('SELECT user_id FROM account_invite_states($1::uuid[])', [[INVITED, SET_BY_HR]]).then(r => r.map(x => x.user_id).sort()),
    [INVITED, SET_BY_HR], 'only the logins asked about, when some are named')
  check((await q('SELECT invited_at FROM account_invite_states($1::uuid[])', [[INVITED]]))[0].invited_at instanceof Date, true, 'and when the link went')
  await as(MEMBER, ['accounts.create'])
  check(await one('SELECT count(*)::int FROM account_invite_states()'), 5, 'Logins & invites · Create alone may ask (whoever invites)')

  // ── Who may ask ───────────────────────────────────────────────────────────
  await as(MEMBER, ['revenue_app.view', 'team.view'])
  await refused('SELECT * FROM account_invite_states()', /needs Logins & invites · View/, 'a signed-in reader without the logins is refused')
  await as(null, [])
  await refused('SELECT * FROM account_invite_states()', /needs Logins & invites · View/, 'no sign-in is refused, not answered')
  await as(null, ['accounts.view'], 'anon')
  await refused('SELECT * FROM account_invite_states()', /permission denied for function account_invite_states/, 'never the publishable key')
  await db.exec('RESET ROLE')
  check(await one("SELECT has_function_privilege('authenticated', 'public.account_invite_states(uuid[])', 'EXECUTE')"), true, 'a signed-in session calls it')
  check(await one("SELECT has_function_privilege('anon', 'public.account_invite_states(uuid[])', 'EXECUTE')"), false, 'the publishable key does not')
  check(await one("SELECT has_function_privilege('service_role', 'public.account_invite_states(uuid[])', 'EXECUTE')"), true, 'the service role does')

  console.log(`account_invite_states: ${checks} checks passed`)
} finally {
  await db.close()
}
