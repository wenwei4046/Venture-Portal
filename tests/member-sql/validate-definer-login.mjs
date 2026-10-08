// Local PostgreSQL regression for 20261009000100 (security, 2026-10-09): a
// SECURITY DEFINER function's role check must hold for somebody who has no
// role. Production's current_user_role() is built here byte for byte (the
// migration's md5 guard checks it), with Supabase's own default grants on the
// public schema, then a writer and a reader guarded the way ~60 production
// functions are (`IF v_role NOT IN (…)`, `IF current_user_role() <> …`), a row
// policy's helper, a trigger function and a service-only function. The hole is
// shown first, then the migration VERBATIM closes it. No live I/O.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
const asSystem = () => as(null, null)

const PRINCIPAL = id(1)
const FINANCE = id(2)
const LEFT = id(3)
const NOBODY = id(99)
const BANK = id(500)

// current_user_role() exactly as production ran it until this migration.
const LIVE_ROLE_BODY = '\n    SELECT role FROM users WHERE id = auth.uid() AND is_active = TRUE\n'

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    -- Supabase's own default: a function made in public is everybody's.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

    CREATE TYPE user_role AS ENUM ('principal', 'finance', 'hr', 'dept_manager', 'revenue_member');
    CREATE TABLE users(id uuid PRIMARY KEY, email text NOT NULL, role user_role NOT NULL, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE bank_accounts(id uuid PRIMARY KEY, balance numeric NOT NULL DEFAULT 0);
    ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON bank_accounts TO anon, authenticated;
  `)
  await db.exec(`CREATE FUNCTION public.current_user_role() RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public' AS $function$${LIVE_ROLE_BODY}$function$;`)
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'current_user_role'"),
    createHash('md5').update(LIVE_ROLE_BODY).digest('hex'), 'production’s body, byte for byte')

  await db.exec(`
    -- A row policy's helper: it runs as whoever queries, anon included.
    CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path = public AS $$ SELECT coalesce(current_user_role() IN ('finance', 'principal'), false) AND 'treasury' = ANY (p_scopes) $$;
    CREATE POLICY bank_read ON bank_accounts FOR SELECT USING ((SELECT has_scope(ARRAY['treasury'])));

    -- Guarded the way production's are — and open to a caller with no role.
    CREATE FUNCTION public.bump_bank(p_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    DECLARE v_role user_role;
    BEGIN
      v_role := current_user_role();
      IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'bump_bank: unauthorized role %', v_role USING ERRCODE = 'insufficient_privilege';
      END IF;
      UPDATE bank_accounts SET balance = balance + 1 WHERE id = p_id;
      RETURN 'bumped';
    END $$;
    CREATE FUNCTION public.payout_summary() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF current_user_role() <> 'principal' THEN
        RAISE EXCEPTION 'payout_summary: only the Principal' USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN 'what each director is paid';
    END $$;

    -- Never a remote call: a trigger, and a function only the server may use.
    CREATE FUNCTION public.touch_bank() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
    CREATE FUNCTION public.service_only() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'server' $$;
    REVOKE EXECUTE ON FUNCTION public.service_only() FROM PUBLIC, anon, authenticated;
  `)
  await q(`INSERT INTO users VALUES ($1, 'principal@venture.my', 'principal', true), ($2, 'finance@venture.my', 'finance', true),
    ($3, 'left@venture.my', 'finance', false)`, [PRINCIPAL, FINANCE, LEFT])
  await q('INSERT INTO bank_accounts VALUES ($1, 100)', [BANK])

  // ── The hole, as production had it ───────────────────────────────────────
  await as(null, 'anon')
  check(await one('SELECT bump_bank($1)', [BANK]), 'bumped', 'before: the publishable key moved a bank balance')
  check(await one('SELECT payout_summary()'), 'what each director is paid', 'before: and read what directors are paid')
  await as(NOBODY)
  check(await one('SELECT payout_summary()'), 'what each director is paid', 'before: so did a sign-in with no portal account')
  await as(LEFT)
  check(await one('SELECT bump_bank($1)', [BANK]), 'bumped', 'before: and an account switched off')
  await asSystem()
  await q('UPDATE bank_accounts SET balance = 100 WHERE id = $1', [BANK])

  // ── The migration, verbatim ───────────────────────────────────────────────
  const sql = (await readFile(new URL('20261009000100_definer_functions_need_a_login.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(sql)
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'current_user_role'"), 'a3dee7a8bcb88ec9f995b673ab3e88d9',
    'the new body is the one the guard names')

  // ── Nobody signed in: the publishable key ────────────────────────────────
  await as(null, 'anon')
  await refused('SELECT bump_bank(\'' + BANK + '\')', /permission denied for function bump_bank/, 'the publishable key moves no money')
  await refused('SELECT payout_summary()', /permission denied for function payout_summary/, 'nor reads what anybody is paid')
  check(await one('SELECT has_scope(ARRAY[\'treasury\'])'), false, 'a policy’s helper still answers, and answers no')
  check(await one('SELECT count(*)::int FROM bank_accounts'), 0, 'so a table behind it reads empty, not an error')

  // ── Signed in with no portal account, and switched off ────────────────────
  await as(NOBODY)
  await refused('SELECT payout_summary()', /no active portal account/, 'a sign-in with no portal account is refused')
  await refused('SELECT bump_bank(\'' + BANK + '\')', /no active portal account/, 'and moves no money')
  await as(LEFT)
  await refused('SELECT bump_bank(\'' + BANK + '\')', /no active portal account/, 'an account switched off is refused while its session lives')
  await refused('SELECT count(*) FROM bank_accounts', /no active portal account/, 'its reads too')

  // ── An active account notices nothing ─────────────────────────────────────
  await as(FINANCE)
  check(await one('SELECT bump_bank($1)', [BANK]), 'bumped', 'Finance still moves the balance it may')
  await refused('SELECT payout_summary()', /only the Principal/, 'and is still refused what it may not')
  check(await one('SELECT count(*)::int FROM bank_accounts'), 1, 'and reads its rows')
  await as(PRINCIPAL)
  check(await one('SELECT payout_summary()'), 'what each director is paid', 'the Principal reads it')
  check(await one('SELECT current_user_role()::text'), 'principal', 'an active account still has its role')

  // ── The server and the database itself ────────────────────────────────────
  await as(null, 'service_role')
  check(await one('SELECT current_user_role()'), null, 'no sign-in at all still has no role, refused by nobody')
  check(await one('SELECT service_only()'), 'server', 'the service role keeps what it had')
  await as(null, null)
  check(await one('SELECT bump_bank($1)', [BANK]) !== null, true, 'the database itself is untouched')
  check(await one("SELECT has_function_privilege('authenticated', 'public.service_only()', 'EXECUTE')"), false,
    'a server-only function is not handed to the signed-in')
  check(await one("SELECT has_function_privilege('anon', 'public.touch_bank()', 'EXECUTE')"), true,
    'a trigger is left as it was (it is never a remote call)')

  // ── Functions made from now on ────────────────────────────────────────────
  await db.exec('CREATE FUNCTION public.made_later() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$')
  check([
    await one("SELECT has_function_privilege('anon', 'public.made_later()', 'EXECUTE')"),
    await one("SELECT has_function_privilege('authenticated', 'public.made_later()', 'EXECUTE')"),
    await one("SELECT has_function_privilege('service_role', 'public.made_later()', 'EXECUTE')"),
  ], [false, true, true], 'a function made later is the signed-in’s and the server’s, never the publishable key’s')

  // ── Run twice, nothing moves ──────────────────────────────────────────────
  await db.exec(sql)
  check(await one("SELECT md5(prosrc) FROM pg_proc WHERE proname = 'current_user_role'"), 'a3dee7a8bcb88ec9f995b673ab3e88d9',
    'a second run is a no-op')

  console.log(`PASS: ${checks} definer-login checks. Production’s role helper; the migration verbatim; no live database.`)
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await db.close()
}
