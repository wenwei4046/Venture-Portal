// Local PostgreSQL regression for 20261009060000 (Q7 of the People Management
// revamp, 2026-10-09): the Overview's two summaries ask for the cell, not the
// account's kind. Stand-ins carry production's exact checks; has_any_action is
// answered from a persona table. Before: a Director's title (kind staff) with
// Treasury · View is turned away by dashboard_summary, and an HR title on a
// custom kind by hr_dashboard_summary. After: each answers whoever holds the
// cell, and refuses whoever does not — exactly the kinds' lists for the five
// accounts that sign in. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}

const PRINCIPAL = id(1)
const FINANCE = id(2)
const HR = id(3)
const MARKETING = id(4)
const DIRECTOR = id(5) // kind staff, Treasury · View
const HR_TITLE = id(6) // a custom HR template on kind staff, HR Costing · View

async function as(user) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
  await db.exec('SET ROLE authenticated')
}
async function answers(user) {
  await as(user)
  const dash = (await q('SELECT public.dashboard_summary() AS x'))[0].x
  const hr = (await q("SELECT public.hr_dashboard_summary('2026-10-01') AS x"))[0].x
  await db.exec('RESET ROLE')
  return { dashboard: dash.error ?? 'ok', hr: hr.error ?? 'ok' }
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

    CREATE TYPE user_role AS ENUM ('principal', 'finance', 'hr', 'dept_manager', 'revenue_member', 'staff');
    CREATE TABLE persona(uid uuid PRIMARY KEY, kind user_role NOT NULL, actions text[] NOT NULL);
    CREATE FUNCTION public.current_user_role() RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT kind FROM persona WHERE uid = auth.uid() $$;
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$ SELECT coalesce((SELECT actions && p_wants FROM persona WHERE uid = auth.uid()), false) $$;
    GRANT EXECUTE ON FUNCTION public.current_user_role(), public.has_any_action(text[]) TO authenticated;

    -- Production's two summaries, reduced to their checks (verbatim) and an answer.
    CREATE FUNCTION public.dashboard_summary() RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
    DECLARE
        v_role user_role;
    BEGIN
        v_role := current_user_role();
        IF v_role NOT IN ('principal', 'finance') THEN
            RETURN jsonb_build_object('error', 'Access denied');
        END IF;
        RETURN jsonb_build_object('role', v_role, 'total_pool', 0);
    END $$;
    CREATE FUNCTION public.hr_dashboard_summary(p_period date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    begin
      if coalesce(current_user_role()::text, '') not in ('hr', 'principal') then
        return jsonb_build_object('error', 'Access denied');
      end if;
      return jsonb_build_object('period', p_period);
    end $$;
    GRANT EXECUTE ON FUNCTION public.dashboard_summary(), public.hr_dashboard_summary(date) TO authenticated;
  `)
  // The five logins' kinds and the actions current_actions() gives them; two template wearers.
  const people = [
    [PRINCIPAL, 'principal', ['treasury.view', 'hr_costing.view', 'approvals.approve']],
    [FINANCE, 'finance', ['treasury.view', 'treasury.create']],
    [HR, 'hr', ['hr_costing.view', 'claims.approve']],
    [MARKETING, 'dept_manager', ['dept_pool.view']],
    [DIRECTOR, 'staff', ['treasury.view', 'approvals.approve', 'reports.view']],
    [HR_TITLE, 'staff', ['hr_costing.view']],
  ]
  for (const [uid, kind, actions] of people) await q('INSERT INTO persona VALUES ($1, $2, $3)', [uid, kind, actions])

  // ── Before: the kind decides ──────────────────────────────────────────────
  check(await answers(DIRECTOR), { dashboard: 'Access denied', hr: 'Access denied' }, 'before: a Director title is turned away')
  check(await answers(HR_TITLE), { dashboard: 'Access denied', hr: 'Access denied' }, 'before: an HR title on another kind is turned away')
  const before = {}
  for (const [uid] of people.slice(0, 4)) before[uid] = await answers(uid)

  await db.exec(await migrationText('20261009060000_overview_asks_the_cells'))

  // ── After: the cell decides ───────────────────────────────────────────────
  for (const [uid] of people.slice(0, 4)) check(await answers(uid), before[uid], `the five logins: ${uid} as before`)
  check(await answers(PRINCIPAL), { dashboard: 'ok', hr: 'ok' }, 'principal: both')
  check(await answers(FINANCE), { dashboard: 'ok', hr: 'Access denied' }, 'finance: treasury only')
  check(await answers(HR), { dashboard: 'Access denied', hr: 'ok' }, 'hr: HR only')
  check(await answers(MARKETING), { dashboard: 'Access denied', hr: 'Access denied' }, 'a department: neither')
  check(await answers(DIRECTOR), { dashboard: 'ok', hr: 'Access denied' }, 'a Director title: the treasury summary its Overview asks for')
  check(await answers(HR_TITLE), { dashboard: 'Access denied', hr: 'ok' }, 'an HR title on any kind: HR’s summary')

  // ── Running it twice changes nothing ──────────────────────────────────────
  const hash = async () => (await q("SELECT md5(string_agg(prosrc, '' ORDER BY proname)) AS m FROM pg_proc WHERE proname IN ('dashboard_summary', 'hr_dashboard_summary')"))[0].m
  const once = await hash()
  await db.exec(await migrationText('20261009060000_overview_asks_the_cells'))
  check(await hash(), once, 'idempotent')

  await db.close()
  console.log(`validate-overview-actions: ${checks} checks passed`)
} catch (error) {
  console.error(error)
  process.exit(1)
}
