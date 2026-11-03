// Local PostgreSQL regression for 20261103230000 (2026-11-03): Settings › Departments' *Bill back salary* tick
// silently did nothing for a Finance-kind login. The app's gate (Settings · Manage — `categories.manage`) let the
// finance kind through, but the table's UPDATE policy was still January's `current_user_role() = 'principal'`, so the
// UPDATE matched no row, raised nothing, and the tick sprang back. The policy now asks the cell the app asks; and,
// since January kept UPDATE principal-only on purpose (a rename re-segments the books; `cost_model` is Department
// mode's, `department_set_cost_model`), a session's own UPDATE may change the bill-back alone — every other column
// changes through its own DEFINER step. Production's policies are stood in for, the migration runs VERBATIM. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const affected = async (sql, params = []) => (await db.query(sql, params)).affectedRows ?? 0
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const lf = text => text.replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(db.query(sql, params), pattern, what)
  checks++
}

const PRINCIPAL = id(1), FINANCE = id(2), HR_USER = id(3)
const HR = id(11), MKT = id(12)

async function as(user, actions) {
  await db.exec('RESET ROLE')
  await q("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)", [user ?? '', actions ?? ''])
  if (user) await db.exec('SET ROLE authenticated')
}

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE TYPE user_role AS ENUM ('principal', 'finance', 'hr', 'staff');
  CREATE TABLE users (id uuid PRIMARY KEY, role user_role NOT NULL);
  CREATE FUNCTION public.current_user_role() RETURNS user_role LANGUAGE sql STABLE SECURITY DEFINER AS
    $$ SELECT role FROM users WHERE id = auth.uid() $$;
  -- The caller's actions as the test sets them ('fn.action' or 'fn.action:reach').
  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                    WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  CREATE TABLE departments (
    id uuid PRIMARY KEY, name text NOT NULL UNIQUE, segment_key text, is_internal boolean NOT NULL DEFAULT false,
    pool_gl_code text, billing_mode_key text, cost_model text NOT NULL DEFAULT 'cost_center',
    own_share_billback boolean NOT NULL DEFAULT false);
  ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
  -- Production's policies on 2026-11-03 (20260101000011, 20260824010000).
  CREATE POLICY departments_all_select ON departments FOR SELECT USING (auth.uid() IS NOT NULL);
  CREATE POLICY departments_pf_insert ON departments FOR INSERT
    WITH CHECK (current_user_role() = ANY (ARRAY['principal'::user_role, 'finance'::user_role]));
  CREATE POLICY departments_principal_update ON departments FOR UPDATE USING (current_user_role() = 'principal');
  CREATE POLICY departments_no_delete ON departments FOR DELETE USING (FALSE);
  GRANT USAGE ON SCHEMA auth TO authenticated;
  GRANT SELECT, INSERT, UPDATE ON departments TO authenticated;
  GRANT SELECT ON users TO authenticated;
`)
await q('INSERT INTO users VALUES ($1, $2), ($3, $4), ($5, $6)', [PRINCIPAL, 'principal', FINANCE, 'finance', HR_USER, 'hr'])
await q(`INSERT INTO departments (id, name, segment_key, pool_gl_code, cost_model, own_share_billback) VALUES
  ($1, 'HR', 'hr', '1050', 'cost_center', false), ($2, 'Marketing', 'marketing', '1030', 'centralized', false)`, [HR, MKT])

const TICK = `UPDATE departments SET own_share_billback = true WHERE id = '${HR}'`
const billback = () => one(`SELECT own_share_billback FROM departments WHERE id = '${HR}'`)

// ── The hole: Finance holds Settings · Manage, the app lets it in, the table matches nothing and says nothing ──
await as(FINANCE, 'categories.manage,treasury.view')
check(await affected(TICK), 0, 'before: a Finance login with Settings · Manage updates no row')
await as(null)
check(await billback(), false, '…and the bill-back is unchanged, with no error raised')

// ── The migration, verbatim ──
await db.exec(lf(await readFile(new URL('20261103230000_departments_billback_asks_the_cell.sql', migrations), 'utf8')))

await as(FINANCE, 'categories.manage,treasury.view')
check(await affected(TICK), 1, 'a Finance login with Settings · Manage now ticks Bill back salary')
await as(null)
check(await billback(), true, '…and it stays ticked')

await as(PRINCIPAL, 'settings.manage')
check(await affected(`UPDATE departments SET own_share_billback = false WHERE id = '${HR}'`), 1, 'Settings · Manage (the Principal\'s) unticks it')

await as(HR_USER, 'hr_costing.view,hr_costing.edit')
check(await affected(TICK), 0, 'a login without the cell still changes nothing (the action refuses it in words first)')
await as(PRINCIPAL, '')
check(await affected(TICK), 0, 'nor does the Principal KIND without the cell — the cell decides, not the kind')

// ── A session's own UPDATE changes the bill-back alone ──
await as(FINANCE, 'categories.manage')
await reject(`UPDATE departments SET name = 'People' WHERE id = '${HR}'`, [], /Only Bill back salary changes here/,
  'a rename is refused — it would re-segment the books')
await reject(`UPDATE departments SET cost_model = 'cost_center' WHERE id = '${MKT}'`, [], /Only Bill back salary changes here/,
  'the mode is Department mode\'s, not Settings\'')
await reject(`UPDATE departments SET segment_key = 'people', own_share_billback = true WHERE id = '${HR}'`, [], /Only Bill back salary changes here/,
  'a bill-back sent with another column is refused whole')
check(await affected(`UPDATE departments SET own_share_billback = own_share_billback WHERE id = '${HR}'`), 1, 'an update that moves nothing goes through')

// ── The DEFINER steps (provision, Department mode) run as the owner and are not this guard's ──
await as(null)
check(await affected(`UPDATE departments SET cost_model = 'cost_center', segment_key = 'marketing' WHERE id = '${MKT}'`), 1,
  'the owner (a DEFINER step, a migration) still changes any column')

// ── Inserting a department is untouched ──
await as(FINANCE, 'categories.manage')
check(await affected(`INSERT INTO departments (id, name) VALUES ('${id(13)}', 'Logistics')`), 1, 'Finance still adds a department')
await as(null)

console.log(`departments bill-back: ${checks} checks passed`)
