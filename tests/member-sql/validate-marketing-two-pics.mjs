// Local PostgreSQL regression for 20261025034000 (2026-10-24 — Marketing ②b-2d-2a, the user's answer 29: "Clients may
// be renamed, their PIC changed; a company may carry one or two PICs; one PIC's approval is enough"). Marketing's
// migrations up to the PIC stages run, then this one, twice. What is under test: a client's details edited by the
// manager — only what the patch names, a group company's name never — both PICs on the subsidiary, carried into a
// product project and its deliverables; each PIC their own link, the second's made with the minutes sent and closed when
// they are taken off; either PIC's answer counts, the reply and the trail saying whose; only a change of the first PIC
// sends approved minutes back. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
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

const STAFF = ['marketing.view', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), ali: id(3) }
const S = { josiah: id(11), mei: id(12), ali: id(13) }

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
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true), ('${id(104)}', 'Hookka', 'HK', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261024004000_marketing_clients.sql',
  '20261025031000_marketing_groups_selangor.sql', '20261025032000_marketing_deliverables.sql', '20261025033000_marketing_pic_stages.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025034000_marketing_two_pics.sql')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
check(await one(`SELECT has_function_privilege('anon', 'public.mkt_sub_edit(uuid,jsonb)', 'EXECUTE')`), false, 'a stranger never edits a client')
check(await one(`SELECT has_function_privilege('authenticated', 'public.mkt_sub_edit(uuid,jsonb)', 'EXECUTE')`), true, '…a signed-in caller may ask')
for (const fn of ['mkt_pic_page(text)', 'mkt_pic_answer(text,text,text,text)', 'mkt_pic_stage_answer(text,uuid,integer,text,text,text)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), true, `the publishable key still calls ${fn} — by name`)
}

// ── A client's details edited ─────────────────────────────────────────────────────
const edit = (sub, patch) => one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [sub, JSON.stringify(patch)])
const badEdit = (sub, patch, pattern, what) => refuses(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [sub, JSON.stringify(patch)], pattern, what)
await as(U.josiah, MANAGER)
const ACME = (await one(`SELECT public.mkt_sub_add('Acme Sdn Bhd', 'Kelvin')`)).id
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await as(U.mei, STAFF)
await badEdit(ACME, { pic: 'Hana' }, /Editing a client is the manager's/, 'editing a client is the manager’s')
await as(U.josiah, MANAGER)
let sub = await edit(ACME, { name: '  Acme   Holdings ', whatsapp: '+60 12-345 6789', pic2: 'Hana Lee', whatsapp2: '+60 13-222 1111' })
check([sub.name, sub.code, sub.client, sub.pic, sub.whatsapp, sub.pic2, sub.whatsapp2],
  ['Acme Holdings', 'ACME', true, 'Kelvin', '+60 12-345 6789', 'Hana Lee', '+60 13-222 1111'],
  'a client renamed (its code never changes), its PIC’s WhatsApp, its second PIC — only what the patch names')
sub = await edit(ACME, { whatsapp2: null })
check([sub.pic, sub.whatsapp, sub.pic2, sub.whatsapp2], ['Kelvin', '+60 12-345 6789', 'Hana Lee', null], 'a patch of one field changes that one')
await badEdit(ACME, { name: 'carres' }, /Carres is on the list already|carres is on the list already/, 'a name on the list already — a group company’s too, whatever the case')
await badEdit(CAR, { name: 'Carres Home' }, /A group company keeps its own name/, 'a group company’s name is never Marketing’s to change')
sub = await edit(CAR, { name: 'Carres', pic: 'Wong', whatsapp: '0123456789' })
check([sub.name, sub.pic, sub.client], ['Carres', 'Wong', false], '…its PIC is: the same name sent back is no change')
await badEdit(ACME, { pic: '' }, /Name the first PIC before a second/, 'a second PIC needs a first')
await badEdit(ACME, { pic2: 'kelvin' }, /The second PIC is somebody else/, 'the second PIC is not the first again')
await badEdit(ACME, { whatsapp: 'call me' }, /A WhatsApp number, digits only/, 'a WhatsApp number, digits only')
await badEdit(ACME, { emoji: '🎉' }, /"emoji" is not a client's to change/, 'only a client’s name and PICs')
await badEdit(ACME, { pic: 7 }, /Not words: pic/, 'words, or nothing')
await badEdit(id(999), { pic: 'X' }, /That client is not there/, 'a client that is not there')
const board = await one(`SELECT public.mkt_board(NULL, NULL)`)
const onBoard = board.subs.find(x => x.id === ACME)
check([onBoard.pic, onBoard.whatsapp, onBoard.pic2, onBoard.whatsapp2], ['Kelvin', '+60 12-345 6789', 'Hana Lee', null], 'the board lists both PICs')

// ── A product project: both PICs from its client ─────────────────────────────────
const TODAY = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const tpl = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [tpl.id, tpl.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }], form: [{ label: 'Final image', type: 'File' }] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"one"}'::jsonb)`)
const ps = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Post pack', intake: tpl.id, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 1, price: 500, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, ps.rev])
const started = await one(`SELECT public.mkt_product_start($1, $2)`, [ACME, prod.id])
const P = started.id, M = started.minutes
const projectRow = () => peek(`SELECT status, pic_name, pic_whatsapp, pic2_name, pic2_whatsapp, link_code, link2_code, pic_reply FROM public.mkt_projects WHERE id = $1`, [P]).then(r => r[0])
let row = await projectRow()
check([row.pic_name, row.pic_whatsapp, row.pic2_name, row.pic2_whatsapp, row.link2_code],
  ['Kelvin', '+60 12-345 6789', 'Hana Lee', null, null], 'a project starts with its client’s two PICs')
let pp = await one(`SELECT public.mkt_product_project($1)`, [P])
check([pp.project.pic, pp.project.pic2, pp.project.whatsapp2, pp.project.link2], ['Kelvin', 'Hana Lee', null, null], 'its page names the second PIC')

// ── The minutes sent: each PIC their own link ─────────────────────────────────────
const rev = () => peek1(`SELECT rev FROM public.mkt_minutes WHERE id = $1`, [M])
const fill = async patch => one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [M, await rev(), JSON.stringify(patch)])
await fill({ vals: { Attendees: [S.josiah] } })
await refuses(`SELECT public.mkt_minutes_send($1, $2)`, [M, await rev()], /Add the second PIC's WhatsApp/, 'the second PIC named: their WhatsApp too, when the PIC signs off')
await refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [M, await rev(), '{"whatsapp2":"soon"}'], /A WhatsApp number, digits only/, 'the second WhatsApp, digits only')
await fill({ whatsapp2: '+60 13-222 1111' })
const sent = await one(`SELECT public.mkt_minutes_send($1, $2)`, [M, await rev()])
row = await projectRow()
check([sent.status, /^[0-9a-f]{32}$/.test(sent.link), /^[0-9a-f]{32}$/.test(sent.link2), sent.link !== sent.link2, row.link2_code === sent.link2],
  ['waiting_pic', true, true, true, true], 'sent: a link for each PIC')
const L1 = sent.link, L2 = sent.link2
check(await peek1(`SELECT reason FROM public.mkt_events WHERE project_id = $1 AND action = 'link sent'`, [P]), 'Kelvin and Hana Lee', 'the trail names both')

// ── What each PIC reads ──────────────────────────────────────────────────────────
await asStranger()
let page1 = await one(`SELECT public.mkt_pic_page($1)`, [L1])
let page2 = await one(`SELECT public.mkt_pic_page($1)`, [L2])
check([page1.you, page1.pic, page1.other, page2.you, page2.pic, page2.other], [1, 'Kelvin', 'Hana Lee', 2, 'Hana Lee', 'Kelvin'],
  'each PIC’s link knows whose it is, and names the other')
check([JSON.stringify(page2).includes('+60'), page2.status], [false, 'waiting_pic'], 'never a WhatsApp number; both read the same project')

// ── Either PIC's answer counts; the reply says whose ─────────────────────────────
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Ha', NULL)`, [L2], /Type your full name to sign off/, 'a full name, as the first PIC’s')
page2 = await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Hana Lee', NULL)`, [L2])
check([page2.status, page2.reply.decision, page2.reply.name, page2.reply.pic], ['approved', 'approved', 'Hana Lee', 2], 'the second PIC approves: approved')
page1 = await one(`SELECT public.mkt_pic_page($1)`, [L1])
check([page1.status, page1.reply.pic, page1.reply.name], ['approved', 2, 'Hana Lee'], '…the first PIC’s page says who approved')
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [L1], /Nothing is waiting for your approval now/, 'one answer settles it — either PIC’s')
check((await peek(`SELECT actor_name, data FROM public.mkt_events WHERE project_id = $1 AND action = 'pic approved'`, [P]))[0],
  { actor_name: 'Hana Lee (PIC)', data: { pic: 2 } }, 'the trail says which PIC')

// ── After approval: the second PIC changes, nothing goes back; the first does ─────
await as(U.josiah, MANAGER)
await fill({ pic2: 'Hana Lee-Tan' })
check((await projectRow()).status, 'approved', 'a change of the second PIC sends nothing back — either PIC’s approval counts')
await fill({ pic: 'Kelvin Tan' })
check((await projectRow()).status, 'waiting_pic', 'a change of the first, as before: back to the PIC')

// ── Taken off: their link closes; named again: a new link ─────────────────────────
await fill({ pic2: '', whatsapp2: '' })
row = await projectRow()
check([row.pic2_name, row.link2_code], [null, null], 'the second PIC taken off: their link gone')
await asStranger()
check(await one(`SELECT public.mkt_pic_page($1)`, [L2]), null, 'a link handed to somebody no longer a PIC is closed')
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Hana Lee', NULL)`, [L2], /This link is closed/, '…and takes no answer')
page1 = await one(`SELECT public.mkt_pic_page($1)`, [L1])
check([page1.you, page1.other], [1, null], 'one PIC again')
await as(U.josiah, MANAGER)
await fill({ pic2: 'Aisyah', whatsapp2: '0191234567' })
row = await projectRow()
check([/^[0-9a-f]{32}$/.test(row.link2_code), row.link2_code !== L2], [true, true], 'a second PIC named after the link went out: their own new link')
const L2b = row.link2_code
await asStranger()
check((await one(`SELECT public.mkt_pic_page($1)`, [L2b])).pic, 'Aisyah', '…which opens for them')

// ── Changes from either PIC; resent to both ───────────────────────────────────────
page2 = await one(`SELECT public.mkt_pic_answer($1, 'changes', '', 'Add the Raya dates')`, [L2b])
check([page2.status, page2.reply.name, page2.reply.pic], ['changes', 'Aisyah', 2], 'their changes, named after them when they type no name')
check((await peek(`SELECT actor_name, data FROM public.mkt_events WHERE project_id = $1 AND action = 'pic changes'`, [P]))[0],
  { actor_name: 'Aisyah (PIC)', data: { pic: 2 } }, '…the trail says which PIC')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_project_resend($1)`, [P])
check(await peek1(`SELECT reason FROM public.mkt_events WHERE project_id = $1 AND action = 'resent'`, [P]), 'Kelvin Tan and Aisyah', 'resent: the trail names both')
await asStranger()
await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [L1])

// ── The work: its deliverables carry both PICs; either decides a stage ────────────
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [P])
const D = await peek1(`SELECT id FROM public.mkt_projects WHERE parent_id = $1`, [P])
let d = (await peek(`SELECT pic_name, pic2_name, pic2_whatsapp FROM public.mkt_projects WHERE id = $1`, [D]))[0]
check(d, { pic_name: 'Kelvin Tan', pic2_name: 'Aisyah', pic2_whatsapp: '0191234567' }, 'a deliverable carries both PICs')
await fill({ pic2: 'Aisyah Rahman' })
d = (await peek(`SELECT pic_name, pic2_name FROM public.mkt_projects WHERE id = $1`, [D]))[0]
check(d, { pic_name: 'Kelvin Tan', pic2_name: 'Aisyah Rahman' }, '…and follows its product’s PICs')
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D, JSON.stringify({ start: TODAY, stages: [{ owner: S.ali, appr: [{ kind: 'pic' }], sla: 2 }] })])
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [D])
await one(`SELECT public.mkt_stage_save($1, '{"vals":{"Final image":"https://canva.com/final"}}'::jsonb)`, [D])
await one(`SELECT public.mkt_stage_submit($1)`, [D])
await asStranger()
page2 = await one(`SELECT public.mkt_pic_stage_answer($1, $2, 1, 'changes', '', 'Brighter, please')`, [L2b, D])
check([page2.work[0].stage.status, page2.work[0].last.action, page2.work[0].last.name, page2.work[0].last.pic],
  ['changes', 'pic changes', 'Aisyah Rahman (PIC)', 2], 'the second PIC asks for changes on a stage — named, and whose')
page1 = await one(`SELECT public.mkt_pic_page($1)`, [L1])
check([page1.work[0].last.pic, page1.work[0].last.name], [2, 'Aisyah Rahman (PIC)'], '…the first PIC’s page says who asked')
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_submit($1)`, [D])
await asStranger()
page1 = await one(`SELECT public.mkt_pic_stage_answer($1, $2, 2, 'approve', 'Kelvin Tan', NULL)`, [L1, D])
check([page1.work[0].status, page1.work[0].last.action, page1.work[0].last.pic], ['done', 'pic approved', 1], 'the first PIC approves: either one decides the stage')
check((await peek(`SELECT data FROM public.mkt_events WHERE project_id = $1 AND action = 'pic approved'`, [D]))[0].data, { pic: 1 }, '…the trail says which PIC')

// ── One PIC: as before ──────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const solo = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])
const soloRev = await peek1(`SELECT rev FROM public.mkt_minutes WHERE id = $1`, [solo.minutes])
await one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [solo.minutes, soloRev, JSON.stringify({ vals: { Attendees: [S.josiah] } })])
const soloSent = await one(`SELECT public.mkt_minutes_send($1, $2)`, [solo.minutes, soloRev + 1])
check([soloSent.status, soloSent.link2], ['waiting_pic', null], 'one PIC: one link')
await asStranger()
const soloPage = await one(`SELECT public.mkt_pic_page($1)`, [soloSent.link])
check([soloPage.you, soloPage.pic, soloPage.other], [1, 'Wong', null], '…theirs, naming nobody else')

console.log(`marketing two PICs: ${checks} checks passed`)
