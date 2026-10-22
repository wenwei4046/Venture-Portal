// Local PostgreSQL regression for 20261024004000 (2026-10-23 — Marketing ④-1, Marketing's own clients: "+ Add subsidiary"
// of the Claude Design handoff "HOUZS Marketing Module Setup"). Marketing's migrations up to the PIC's link run, then this
// one, twice. What is under test: only the manager adds a client; its name tidied and refused when on the list already
// (a group company's too, whatever the case); the code the handoff makes — the first four letters and digits, OTH when
// fewer than two — and a number when taken; the client on the board and in a Track ID. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
/** Read as the database itself, whoever is signed in: the tables and helpers no client reaches. */
async function peek(sql, params = []) {
  const [{ cu, su }] = await q('SELECT current_user AS cu, session_user AS su')
  await db.exec('RESET ROLE')
  try {
    return await q(sql, params)
  } finally {
    if (cu !== su) await db.exec(`SET ROLE ${cu}`)
  }
}
const peek1 = async (sql, params = []) => Object.values((await peek(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const STAFF = ['marketing.view', 'marketing.create', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), outsider: id(4) }
const S = { josiah: id(11), mei: id(12) }

async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, [], null)

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.companies(id uuid PRIMARY KEY, name text NOT NULL, short_code text, is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL, segment_key text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, first_name text,
    user_id uuid, title_id uuid, department_id uuid, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.att_holidays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day date NOT NULL, name text NOT NULL,
    kind text, states text, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', ref_kind text NOT NULL, ref_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz, data jsonb);
  CREATE TABLE public.permission_page_tabs (page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));

  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, reads text[], mode text, reason text);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_read, p_mode, p_reason)
      ON CONFLICT (t) DO UPDATE SET area = excluded.area, reads = excluded.reads, mode = excluded.mode, reason = excluded.reason
  $$;

  INSERT INTO public.users (id, name, email) VALUES
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.outsider}', 'Outsider', 'out@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES
    ('${id(101)}', 'Carres', 'CAR', true), ('${id(102)}', '2990 Home', '2990', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261024004000_marketing_clients.sql')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may ───────────────────────────────────────────────────────────────────────
check(await one(`SELECT has_function_privilege('anon', 'public.mkt_sub_add(text,text)', 'EXECUTE')`), false, 'the publishable key cannot add a client')
check(await one(`SELECT has_function_privilege('authenticated', 'public.mkt_sub_add(text,text)', 'EXECUTE')`), true, 'a sign-in may call it')
const add = (name, pic = null) => one(`SELECT public.mkt_sub_add($1, $2)`, [name, pic])
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_sub_add('Acme', NULL)`, [], /Adding a client is the manager's/, 'the staff do not add clients (Manage — the manager tools)')
await as(U.outsider, [])
await refuses(`SELECT public.mkt_sub_add('Acme', NULL)`, [], /Adding a client is the manager's/, 'nor anybody outside Marketing')

// ── Added ─────────────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const acme = await add('  Acme   Furniture Sdn Bhd ', '  Mr   Tan ')
check([acme.code, acme.name, acme.pic, acme.client, acme.emoji, acme.dot], ['ACME', 'Acme Furniture Sdn Bhd', 'Mr Tan', true, null, 'oklch(0.62 0.02 60)'],
  'a client: its name and PIC tidied, the handoff’s code and grey dot, no emoji')
check((await peek(`SELECT company_id, sort_order, active, created_by FROM public.mkt_subsidiaries WHERE id = $1`, [acme.id]))[0],
  { company_id: null, sort_order: 100, active: true, created_by: U.josiah }, '…no company (Marketing’s own), after the group, by its maker')
check((await peek(`SELECT count(*)::int AS n FROM public.companies`))[0].n, 2, 'Finance’s companies untouched')

// ── Refused ───────────────────────────────────────────────────────────────────────
await refuses(`SELECT public.mkt_sub_add('acme furniture SDN BHD', NULL)`, [], /is on the list already/, 'a name on the list, whatever the case')
await refuses(`SELECT public.mkt_sub_add('CARRES', NULL)`, [], /CARRES is on the list already/, 'a group company’s name too')
await refuses(`SELECT public.mkt_sub_add('   ', NULL)`, [], /Name the company or client/, 'a name')
await refuses(`SELECT public.mkt_sub_add($1, NULL)`, ['x'.repeat(81)], /at most 80 characters/, '…of at most 80')
await refuses(`SELECT public.mkt_sub_add('Bolt Media', $1)`, ['x'.repeat(81)], /A PIC's name of at most 80 characters/, 'a PIC’s name of at most 80')

// ── The code: the handoff's, then numbered ────────────────────────────────────────
check((await add('ACME Trading')).code, 'ACME2', 'a code taken: numbered')
check((await add('Acme Outdoor')).code, 'ACME3', '…and the next')
check((await add('Q')).code, 'OTH', 'fewer than two letters or digits: OTH')
check((await add('!!! ???')).code, 'OTH2', '…numbered too')
check((await add('2990 Holdings')).code, '29902', 'a group company’s code is taken as well')
check((await add('Bolt Media', null)).pic, null, 'the PIC is optional')

// ── On the board, in a Track ID ───────────────────────────────────────────────────
const board = await one(`SELECT public.mkt_board()`)
check(board.subs.filter(s => s.client).map(s => s.code).sort(), ['29902', 'ACME', 'ACME2', 'ACME3', 'BOLT', 'OTH', 'OTH2'],
  'the clients on the board, beside the group')
check(board.subs.slice(0, 2).map(s => s.code), ['CAR', '2990'], '…the group first')
await asSystem()
check((await one(`SELECT public.mkt_next_track('TSK', 'ACME')`)).replace(/-\d{4}-/, '-YYMM-'), 'TSK-ACME-YYMM-001', 'a client’s Track ID')

console.log(`marketing clients: ${checks} checks passed`)
