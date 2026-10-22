// Local PostgreSQL regression for 20261024003000 (2026-10-24 — Marketing ⑤-1, the PIC's link for a product project's
// intake minutes: `PIC Link.dc.html` of the Claude Design handoff "HOUZS Marketing Module Setup"). Marketing's migrations
// up to the product projects run, then this one, twice. What is under test, as the stranger the page is (anon, no
// session): only a real code opens a page, and only a sent product project's; the page carries only what the PIC sees
// (no WhatsApp, notes, internal field, staff id or project id); approve (a full name) completes and locks the minutes
// and approves the project; changes (5–500 characters) send it back with their words; one answer per sending; the
// resent and the changed-after-approval pages say why it waits again; the trail names the PIC; the owner — or with
// none, the managers — is told. No live I/O.
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

const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), principal: id(5) }
const S = { josiah: id(11), mei: id(12) }

async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, [], null)
const asStranger = () => as(null, [], 'anon')

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
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.principal}', 'Principal', 'principal@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql']
for (const m of MIGS) await db.exec(await sql(m))
const pic = await sql('20261024003000_marketing_pic_link.sql')
await db.exec(pic)
await db.exec(pic) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_pic_page(text)', 'mkt_pic_answer(text,text,text,text)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), true, `the publishable key calls ${fn} — by name`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `…and a sign-in, as the same stranger`)
}
for (const fn of ['mkt_product_project(text)', 'mkt_minutes_fill(uuid,integer,jsonb)', 'mkt_project_resend(uuid)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `…never the manager's ${fn}`)
}

// ── What the projects start from ─────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const TODAY = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const FIELDS = [
  { name: 'Project', type: 'Project link', lock: true, pic: true },
  { name: 'Meeting date', type: 'Date', req: true, pic: true },
  { name: 'Attendees', type: 'People', lock: true, pic: true },
  { name: 'Objective', type: 'Long text', req: true, pic: true },
  { name: 'Budget note', type: 'Short text' },
  { name: 'Posts', type: 'Number', pic: true },
  { name: 'Shots', type: 'Table', pic: true, cols: [{ name: 'Shot', type: 'Text' }, { name: 'Due', type: 'Date' }] },
  { name: 'Ideas', type: 'Free space', pic: true },
  { name: 'Signatures', type: 'Signature', pic: true },
]
const mkTemplate = async (name, rules) => {
  const t = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name, fields: FIELDS, rules })])
  await one(`SELECT public.mkt_minutes_publish($1, $2)`, [t.id, t.rev])
  return t.id
}
const LOCKS = await mkTemplate('Kickoff', { sign: false, pic: true, project: true, file: true, lock: true })
const OPEN = await mkTemplate('Open kickoff', { sign: false, pic: true, project: true, file: true, lock: false })
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard',
  stages: [{ name: 'Design', dept: 'design', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }] }] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const mkProduct = async (name, intake) => {
  const p = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"recurring"}'::jsonb)`)
  const s = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [p.id, JSON.stringify({ name, intake, price: 4800, effectiveFrom: TODAY,
    groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 4, price: 1200, workflow: wf.id }] }] })])
  await one(`SELECT public.mkt_product_publish($1, $2)`, [p.id, s.rev])
  return p.id
}
const LOCKED_P = await mkProduct('Social Media Package A', LOCKS)
const OPEN_P = await mkProduct('Open package', OPEN)
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await asSystem()
await db.exec(`UPDATE public.mkt_subsidiaries SET pic_name = 'Kelvin', pic_whatsapp = '+60 12-345 6789' WHERE code = 'CAR'`)

/** A product project started, written in and sent — as the manager — answering its link's code. */
async function sent(product, who = U.josiah) {
  await as(who, MANAGER)
  const st = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, product])
  const m = (await peek(`SELECT id, rev FROM public.mkt_minutes WHERE project_id = $1`, [st.id]))[0]
  const f = await one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [m.id, m.rev, JSON.stringify({
    vals: { 'Meeting date': TODAY, Attendees: [S.josiah, S.mei], Objective: 'Year-end walk-ins', 'Budget note': 'RM 300 boost (secret)',
      Posts: '6', Shots: { rows: [['Opening', TODAY]] }, Ideas: { cols: ['Item', 'Owner'], rows: [['Props', 'Mei']] } },
    notes: 'Kelvin is price-sensitive (internal)' })])
  const s = await one(`SELECT public.mkt_minutes_send($1, $2)`, [m.id, f.rev])
  return { ...st, minutes: m.id, rev: f.rev + 1, code: s.link }
}
const page = code => one(`SELECT public.mkt_pic_page($1)`, [code])
const answer = (code, decision, name = null, reason = null) => one(`SELECT public.mkt_pic_answer($1, $2, $3, $4)`, [code, decision, name, reason])
const notices = async user => (await peek(`SELECT title, body, data ->> 'type' AS type FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at`, [user]))

// ── Only a real code, of a sent product project, opens a page ─────────────────────
const a = await sent(LOCKED_P)
await asStranger()
check(await page('nope'), null, 'a code that is not one: closed')
check(await page('0123456789abcdef0123456789abcdef'), null, 'a code that is nobody’s: closed')
check(await page(null), null, 'no code: closed')
check((await page(a.code.toUpperCase())).track, a.track, 'the code, however it is typed')
await refuses(`SELECT id FROM public.mkt_projects LIMIT 1`, [], /permission denied/, 'the stranger reads no table itself')

// ── Only what the PIC sees ────────────────────────────────────────────────────────
const p1 = await page(a.code)
check([p1.sub, p1.product, p1.status, p1.owner, p1.reply, p1.updated, p1.asked], ['Carres', 'Social Media Package A', 'waiting_pic', 'SIA', null, null, null],
  'for whom, on what, where it stands, whose it is')
check(p1.sentAt !== null && p1.startedAt !== null, true, '…when it started and when it went')
check(p1.minutes.title, 'Kickoff', 'the minutes by their template')
check(p1.minutes.fields.map(f => f.name), ['Meeting date', 'Attendees', 'Objective', 'Posts', 'Shots', 'Ideas', 'Signatures'],
  'the fields the PIC sees, in order — not the project link (the page says it), not an internal field')
const byName = Object.fromEntries(p1.minutes.fields.map(f => [f.name, f.value]))
check(byName.Attendees, ['SIA', 'Mei'], 'people by their first names')
check(byName.Shots, { cols: ['Shot', 'Due'], rows: [['Opening', TODAY]] }, 'a table: its columns and rows')
check(byName.Ideas, { cols: ['Item', 'Owner'], rows: [['Props', 'Mei']] }, 'the Free space as written')
check([byName.Objective, byName.Posts, byName.Signatures], ['Year-end walk-ins', '6', []], 'text as written; nobody signed yet')
const text = JSON.stringify(p1)
for (const [secret, what] of [['+60 12-345 6789', 'the WhatsApp'], ['price-sensitive', 'the meeting notes'], ['RM 300 boost', 'an internal field'],
  [S.josiah, 'a staff id'], [S.mei, 'a staff id'], [a.id, 'the project’s id'], ['Budget note', 'an internal field’s name']]) {
  check(text.includes(secret), false, `the page never carries ${what}`)
}

// ── Answers: what each asks ───────────────────────────────────────────────────────
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Ke', NULL)`, [a.code], /Type your full name to sign off/, 'approving asks a full name')
await refuses(`SELECT public.mkt_pic_answer($1, 'changes', NULL, 'abc')`, [a.code], /Say what should change — 5 to 500 characters/, 'changes ask words')
await refuses(`SELECT public.mkt_pic_answer($1, 'changes', NULL, $2)`, [a.code, 'x'.repeat(501)], /5 to 500 characters/, '…not an essay')
await refuses(`SELECT public.mkt_pic_answer($1, 'maybe', 'Kelvin Tan', NULL)`, [a.code], /Approve, or say what should change/, 'approve or changes')
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, ['0123456789abcdef0123456789abcdef'], /This link is closed/, 'nobody’s code')

// ── Approved ──────────────────────────────────────────────────────────────────────
const ok = await answer(a.code, 'approve', '  Kelvin Tan ')
check([ok.status, ok.reply.decision, ok.reply.name], ['approved', 'approved', 'Kelvin Tan'], 'approved: the page as it now stands')
check((await peek(`SELECT status, locked, completed_by FROM public.mkt_minutes WHERE id = $1`, [a.minutes]))[0],
  { status: 'completed', locked: true, completed_by: 'Kelvin Tan (PIC)' }, 'the minutes completed by the PIC, locked as the template says')
check((await peek(`SELECT actor_user, actor_name, action, reason FROM public.mkt_events WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, [a.id]))[0],
  { actor_user: null, actor_name: 'Kelvin Tan (PIC)', action: 'pic approved', reason: 'Kickoff' }, 'the trail names the PIC')
check((await notices(U.josiah)).at(-1), { title: 'Kelvin Tan approved the minutes', body: a.title ?? (await peek1(`SELECT title FROM public.mkt_projects WHERE id = $1`, [a.id])), type: 'pic_approved' },
  'the owner is told')
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [a.code], /Nothing is waiting for your approval now/, 'one answer per sending')
await refuses(`SELECT public.mkt_pic_answer($1, 'changes', NULL, 'Add Penang please')`, [a.code], /Nothing is waiting/, '…either way')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_minutes_fill($1, $2, '{"notes":"x"}'::jsonb)`, [a.minutes, a.rev + 1], /These minutes are locked/, 'locked minutes stay as approved')

// ── Changes, resent, approved ─────────────────────────────────────────────────────
const b = await sent(LOCKED_P)
await asStranger()
const ch = await answer(b.code, 'changes', null, ' Add Penang, and start on 5 Nov. ')
check([ch.status, ch.reply.decision, ch.reply.name, ch.reply.reason], ['changes', 'changes', 'Kelvin', 'Add Penang, and start on 5 Nov.'],
  'changes: sent back with their words, under the PIC’s name')
check((await peek(`SELECT status FROM public.mkt_minutes WHERE id = $1`, [b.minutes]))[0].status, 'sent', 'the minutes stay sent')
check((await notices(U.josiah)).at(-1), { title: 'Kelvin asked for changes', body: 'Add Penang, and start on 5 Nov.', type: 'pic_changes' }, 'the owner is told what')
check((await peek(`SELECT actor_name, action, reason FROM public.mkt_events WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, [b.id]))[0],
  { actor_name: 'Kelvin (PIC)', action: 'pic changes', reason: 'Add Penang, and start on 5 Nov.' }, '…and the trail')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_minutes_fill($1, $2, '{"vals":{"Objective":"Year-end walk-ins, Penang too"}}'::jsonb)`, [b.minutes, b.rev])
await one(`SELECT public.mkt_project_resend($1)`, [b.id])
await asStranger()
const again = await page(b.code)
check([again.status, again.asked?.reason, again.updated], ['waiting_pic', 'Add Penang, and start on 5 Nov.', null], 'resent: the page says what they asked')
check(again.minutes.fields.find(f => f.name === 'Objective').value, 'Year-end walk-ins, Penang too', '…and shows the minutes as they now are')
check((await answer(b.code, 'approve', 'Kelvin')).status, 'approved', 'then approved')

// ── Changed after approval: back to the PIC, who reads what changed ──────────────
const c = await sent(OPEN_P)
await asStranger()
await answer(c.code, 'approve', 'Kelvin Tan')
check((await peek(`SELECT locked FROM public.mkt_minutes WHERE id = $1`, [c.minutes]))[0].locked, false, 'a template that does not lock: open after approval')
await as(U.josiah, MANAGER)
const rev = await peek1(`SELECT rev FROM public.mkt_minutes WHERE id = $1`, [c.minutes])
check((await one(`SELECT public.mkt_minutes_fill($1, $2, '{"vals":{"Posts":"8"}}'::jsonb)`, [c.minutes, rev])).reapproval, true, 'a change the PIC sees')
await asStranger()
const upd = await page(c.code)
check([upd.status, upd.updated?.fields, upd.reply, upd.asked], ['waiting_pic', 'Posts', null, null], 'the page says what changed after they approved')
check((await answer(c.code, 'approve', 'Kelvin Tan')).status, 'approved', 'approved again')

// ── Nobody owns it: Marketing's managers are told ─────────────────────────────────
const d = await sent(OPEN_P, U.principal)
check(await peek1(`SELECT owner_staff FROM public.mkt_projects WHERE id = $1`, [d.id]), null, 'started by somebody not on the roster: no owner')
const before = (await notices(U.josiah)).length
await asStranger()
check((await page(d.code)).owner, null, 'the page names no owner')
await answer(d.code, 'changes', 'Kelvin Tan', 'Please add Threads')
check((await notices(U.josiah)).length, before + 1, 'the managers are told instead')
check((await notices(U.mei)).filter(n => n.type === 'pic_changes').length, 0, '…not the staff')

// ── A cancelled project's link is closed ──────────────────────────────────────────
await asSystem()
await db.exec(`UPDATE public.mkt_projects SET status = 'cancelled' WHERE id = '${d.id}'`)
await asStranger()
check(await page(d.code), null, 'cancelled: closed')
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [d.code], /This link is closed/, '…and takes no answer')

console.log(`marketing pic link: ${checks} checks passed`)
