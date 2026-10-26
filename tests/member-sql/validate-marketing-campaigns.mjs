// Local PostgreSQL regression for 20261025141000 (2026-10-24 — Marketing ④-2b: campaigns; the user's answer 13 — a
// campaign is a product project with a run period — and the handoff's intake field *Campaign period*). Marketing's
// migrations up to the months run; then this one, twice. What is under test: the field's kind (one a template); its value
// (from and to, half typed kept, the end on or after the start within a year); the intake's period on its project, the
// trail keeping each change; read on the board, the product page and the PIC's link; moved after the PIC approved, back
// to them; emptied; a template without one; the board keeping a campaign while it runs and 60 days after; the column's
// own check. No live I/O.
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

const VIEW = ['marketing.view']
const STAFF = ['marketing.view', 'marketing.edit']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), ali: id(3), lee: id(4), siti: id(5) }
const S = { josiah: id(11), mei: id(12), ali: id(13), lee: id(14), siti: id(15), kai: id(16) }

async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false),
                  set_config('test.actions', $3, false), set_config('test.flags', '{}', false)`, [user ?? '', role ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, [], null)

await db.exec(`
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
  CREATE SCHEMA storage;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
    $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  GRANT USAGE ON SCHEMA auth, storage, public TO authenticated, anon, service_role;

  CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE w = ANY (string_to_array(current_setting('test.actions', true), ',')))
  $$;
  -- The other buckets' policy helpers (20261023150000 carries every storage.objects policy): none is under test here.
  CREATE FUNCTION public.test_flag(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_scope(p_scopes text[]) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_is_manager(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_is_revenue_account() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.crm_me() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.crm_can_reply(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.crm_my_can() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION public.guest_link_may_upload(p_code text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hiring_file_in_use(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_doc_file_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_doc_readable_by_hr(p text, p_owner text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.hr_file_readable_by_member(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.it_request_object_readable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.it_request_object_removable(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.member_form_template_unused(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE TYPE public.payment_voucher_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid');
  CREATE TABLE public.payment_vouchers (id uuid PRIMARY KEY, status public.payment_voucher_status NOT NULL);
  CREATE TABLE public.payment_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), storage_path text NOT NULL);
  CREATE TABLE public.crm_contacts (id uuid PRIMARY KEY);
  CREATE TABLE public.member_requests (id uuid PRIMARY KEY, created_by uuid, status text, kind text);
  CREATE TABLE public.member_request_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid, object_path text);
  GRANT SELECT ON public.payment_vouchers, public.payment_attachments, public.crm_contacts, public.member_requests,
    public.member_request_attachments TO authenticated, anon;

  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, reads text[], mode text, reason text);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_read, p_mode, p_reason)
      ON CONFLICT (t) DO UPDATE SET area = excluded.area, reads = excluded.reads, mode = excluded.mode, reason = excluded.reason
  $$;

  CREATE TABLE public.users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
  CREATE TABLE public.companies(id uuid PRIMARY KEY, name text NOT NULL, short_code text, is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.departments(id uuid PRIMARY KEY, name text NOT NULL, segment_key text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.permission_templates(id uuid PRIMARY KEY, name text NOT NULL, base_role text);
  CREATE TABLE public.permission_template_grants(template_id uuid NOT NULL, function_key text NOT NULL, action text NOT NULL);
  CREATE TABLE public.titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true, template_id uuid);
  CREATE TABLE public.hr_staff_costs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), employee_name text NOT NULL, first_name text,
    user_id uuid, title_id uuid, department_id uuid, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.att_holidays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), day date NOT NULL, name text NOT NULL,
    kind text, states text, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', ref_kind text NOT NULL, ref_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz, data jsonb);
  CREATE TABLE public.permission_page_tabs (page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));

  INSERT INTO public.users (id, name, email) VALUES
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my'), ('${U.lee}', 'Lee', 'lee@x.my'), ('${U.siti}', 'Siti', 'siti@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Finance', 'finance');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER'),
    ('${id(304)}', 'ACCOUNTANT');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.lee}', 'LEE KOK WAI', 'Lee', '${U.lee}', '${id(304)}', '${id(202)}', 'active'),
    ('${S.siti}', 'SITI AMINAH', 'Siti', '${U.siti}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.kai}', 'KAI MING', 'Kai', NULL, '${id(302)}', '${id(201)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(await sql('20261023150000_file_storage_r2.sql'))
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261024004000_marketing_clients.sql',
  '20261024005000_marketing_subsidiary_page.sql', '20261024006000_marketing_project_log.sql', '20261024007000_marketing_library.sql',
  '20261024007100_marketing_library_bigger_uploads.sql', '20261024007200_marketing_brand_profiles.sql', '20261024007300_marketing_library_shares.sql',
  '20261024007400_marketing_task_library.sql', '20261024007500_marketing_spaces.sql', '20261024007600_marketing_space_private_photo.sql',
  '20261024007700_marketing_space_room_pet.sql', '20261025004000_marketing_library_answers.sql', '20261025004100_marketing_builder_deletes.sql',
  '20261025031000_marketing_groups_selangor.sql', '20261025032000_marketing_deliverables.sql', '20261025033000_marketing_pic_stages.sql',
  '20261025034000_marketing_two_pics.sql', '20261025035000_marketing_pic_both.sql', '20261025036000_marketing_replace_person.sql',
  '20261025037000_marketing_pet_levels.sql', '20261025038000_marketing_lobby_visit.sql', '20261025039000_marketing_chat.sql',
  '20261025039500_marketing_chat_review.sql', '20261025101000_marketing_subtasks.sql', '20261025113000_marketing_stage_files.sql']
for (const m of MIGS) await db.exec(await sql(m))


await db.exec(await sql('20261025121000_marketing_billing.sql'))
await db.exec(await sql('20261025131000_marketing_product_runs.sql'))
const mig = await sql('20261025141000_marketing_campaigns.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const plus = n => peek1(`SELECT (($1::date + $2::integer))::text`, [TODAY, n])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const PERIOD = 'Campaign period'

// ── The kind: a minutes field of its own, one a template ──────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const fields = [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true },
  { name: PERIOD, type: 'Campaign period', req: true, pic: true }, { name: 'Venue', type: 'Short text', pic: true }]
const rules = { sign: false, pic: true, project: true, file: true, lock: false }
await refuses(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Two periods',
  fields: [...fields, { name: 'Another period', type: 'Campaign period' }], rules })], /one campaign period/, 'a template keeps one campaign period')
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Truck event intake', fields, rules })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
check(await peek1(`SELECT fields -> 2 FROM public.mkt_minutes_versions WHERE template_id = $1`, [minutes.id]),
  { name: PERIOD, type: 'Campaign period', req: true, pic: true, lock: false }, 'published: the field keeps its kind')

const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Truck event', tname: 'Standard', stages: [
  { name: 'Script', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 2, appr: [], form: [] }] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind: 'one' })])
const saved = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Truck event', intake: minutes.id, price: 8000,
  effectiveFrom: TODAY, groups: [{ name: 'Event', items: [{ name: 'Truck event', qty: 1, price: 8000, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, saved.rev])
const P = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])).id
const doc = () => peek(`SELECT id, rev, vals, status FROM public.mkt_minutes WHERE project_id = $1 AND intake`, [P]).then(r => r[0])
const fill = async (vals, extra = {}) => { const m = await doc(); return one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [m.id, m.rev, JSON.stringify({ vals, ...extra })]) }
const camp = id => peek(`SELECT campaign_from::text AS from, campaign_until::text AS until FROM public.mkt_projects WHERE id = $1`, [id]).then(r => r[0])
const missing = async () => {
  const m = await doc()
  return peek1(`SELECT public.mkt_minutes_missing(mv.fields, $2::jsonb) FROM public.mkt_minutes mm
                  JOIN public.mkt_minutes_versions mv ON mv.template_id = mm.template_id AND mv.version = mm.template_version WHERE mm.id = $1`, [m.id, JSON.stringify(m.vals)])
}

// ── Its value: from and to ────────────────────────────────────────────────────────────────────────────────
const START = await plus(16), END = await plus(19)
await refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [(await doc()).id, (await doc()).rev, JSON.stringify({ vals: { [PERIOD]: '2026-11-09' } })],
  /a start and an end/, 'one date is not a period')
await refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [(await doc()).id, (await doc()).rev, JSON.stringify({ vals: { [PERIOD]: { from: '9 Nov', to: '' } } })],
  /dates/, 'not a date refused')
await refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [(await doc()).id, (await doc()).rev, JSON.stringify({ vals: { [PERIOD]: { from: '2026-02-30', to: '' } } })],
  /dates/, 'no such day refused')
await refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [(await doc()).id, (await doc()).rev, JSON.stringify({ vals: { [PERIOD]: { from: END, to: START } } })],
  /ends on or after its start/, 'an end before its start refused')
await refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [(await doc()).id, (await doc()).rev, JSON.stringify({ vals: { [PERIOD]: { from: START, to: await plus(16 + 366) } } })],
  /within a year/, 'longer than a year refused')

await fill({ [PERIOD]: { from: START, to: '' } })
check((await doc()).vals[PERIOD], { from: START, to: null }, 'half typed: kept as typed')
check(await camp(P), { from: null, until: null }, '…no period on the project yet')
check((await missing()).includes(PERIOD), true, '…and it is still missing')

await fill({ [PERIOD]: { from: START, to: END } })
check((await doc()).vals[PERIOD], { from: START, to: END }, 'both days: kept')
check(await camp(P), { from: START, until: END }, '…the project runs then')
check((await missing()).includes(PERIOD), false, '…no longer missing')
check(await peek(`SELECT data FROM public.mkt_events WHERE project_id = $1 AND action = 'campaign period' ORDER BY id`, [P]).then(r => r.map(x => x.data)),
  [{ from: START, until: END }], 'the trail keeps it')
await fill({ Venue: 'Puchong' })
check(await peek1(`SELECT count(*)::int FROM public.mkt_events WHERE project_id = $1 AND action = 'campaign period'`, [P]), 1, 'another field written: no new line')

// ── Read: the board, the product page, the PIC's link ──────────────────────────────────────────────────────
const boardOf = async id => (await one(`SELECT public.mkt_board()`)).projects.find(p => p.id === id)
check((await boardOf(P)).campaign, { from: START, until: END }, 'the board: its run period')
check((await one(`SELECT public.mkt_product_project($1)`, [P])).project.campaign, { from: START, until: END }, 'the product page: its run period')
await as(U.ali, STAFF)
check((await one(`SELECT public.mkt_product_project($1)`, [P])).project.campaign, { from: START, until: END }, 'the staff see it too')
await as(U.josiah, MANAGER)
const send = await doc()
await one(`SELECT public.mkt_minutes_send($1, $2)`, [send.id, send.rev]).catch(async () => {
  // Sending asks the PIC's name and WhatsApp first.
  await fill({}, { pic: 'Kelvin', whatsapp: '+60 12-345 6789' })
  const again = await doc()
  return one(`SELECT public.mkt_minutes_send($1, $2)`, [again.id, again.rev])
})
const code = await peek1(`SELECT link_code FROM public.mkt_projects WHERE id = $1`, [P])
await as(null, [], 'anon')
const picPage = await one(`SELECT public.mkt_pic_page($1)`, [code])
check(picPage.minutes.fields.find(f => f.name === PERIOD), { name: PERIOD, type: 'Campaign period', value: { from: START, to: END } }, 'the PIC reads it on the link')

// ── Approved, then moved: back to the PIC ──────────────────────────────────────────────────────────────────
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'approved' WHERE id = $1`, [P])
await as(U.josiah, MANAGER)
const moved = await fill({ [PERIOD]: { from: await plus(20), to: await plus(23) } })
check([moved.reapproval, moved.status], [true, 'waiting_pic'], 'moved after the PIC approved: they approve again')
check(await peek1(`SELECT data -> 'fields' FROM public.mkt_events WHERE project_id = $1 AND action = 'edited after approval' ORDER BY id DESC LIMIT 1`, [P]),
  [PERIOD], '…the trail names the period')
check(await camp(P), { from: await plus(20), until: await plus(23) }, '…the project runs on the new days')

// ── Emptied: no period ────────────────────────────────────────────────────────────────────────────────────
await fill({ [PERIOD]: { from: '', to: '' } })
check((await doc()).vals[PERIOD], undefined, 'both emptied: the field is empty')
check(await camp(P), { from: null, until: null }, '…and the project runs no more')
check((await peek(`SELECT data FROM public.mkt_events WHERE project_id = $1 AND action = 'campaign period' ORDER BY id DESC LIMIT 1`, [P]))[0].data,
  { from: null, until: null }, '…the trail says so')
await fill({ [PERIOD]: { from: START, to: END } })

// ── A template without one: nothing set ───────────────────────────────────────────────────────────────────
const plain = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff', fields: fields.filter(f => f.type !== 'Campaign period'), rules })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [plain.id, plain.rev])
const prod2 = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind: 'one' })])
const saved2 = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod2.id, JSON.stringify({ name: 'Post pack', intake: plain.id, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Event', items: [{ name: 'Post', qty: 1, price: 500, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod2.id, saved2.rev])
const P2 = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod2.id])).id
const doc2 = (await peek(`SELECT id, rev FROM public.mkt_minutes WHERE project_id = $1 AND intake`, [P2]))[0]
await refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [doc2.id, doc2.rev, JSON.stringify({ vals: { [PERIOD]: { from: START, to: END } } })],
  /is not on these minutes/, 'no such field: refused')
check((await one(`SELECT public.mkt_product_project($1)`, [P2])).project.campaign, null, 'no period: not a campaign')

// ── The board: a campaign while it runs, and 60 days after ─────────────────────────────────────────────────
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() - interval '90 days', updated_at = now() - interval '90 days',
                campaign_from = $2::date - 70, campaign_until = $2::date - 59 WHERE id = $1`, [P, TODAY])
await as(U.josiah, MANAGER)
check(!!(await boardOf(P)), true, 'done long ago, its run ended 59 days ago: still on the board')
await asSystem()
await q(`UPDATE public.mkt_projects SET campaign_from = $2::date - 70, campaign_until = $2::date - 61, updated_at = now() - interval '90 days' WHERE id = $1`, [P, TODAY])
await as(U.josiah, MANAGER)
check(!!(await boardOf(P)), false, 'ended 61 days ago: off the board')
check(!!(await one(`SELECT public.mkt_board($1::date, $2::date)`, [await plus(-75), await plus(-60)])).projects.find(p => p.id === P), true,
  '…but on it for the range it ran in')

// ── The column: a product project's, both days or none, the end on or after the start ───────────────────
await asSystem()
await refuses(`UPDATE public.mkt_projects SET campaign_from = $2::date, campaign_until = NULL WHERE id = $1`, [P, TODAY], /mkt_projects_campaign_check/, 'one day alone refused')
await refuses(`UPDATE public.mkt_projects SET campaign_from = $2::date, campaign_until = $2::date - 1 WHERE id = $1`, [P, TODAY], /mkt_projects_campaign_check/, 'an end before its start refused')
await as(U.josiah, MANAGER)
const quick = (await one(`SELECT public.mkt_task_create($1, 'quick', 'Price update', 'social', NULL, $2::jsonb)`, [CAR,
  JSON.stringify([{ name: 'Do it', dept: 'GRAPHIC DESIGNER', who: S.ali, sla: 1, appr: [], form: [] }])])).id
await asSystem()
await refuses(`UPDATE public.mkt_projects SET campaign_from = $2::date, campaign_until = $2::date WHERE id = $1`, [quick, TODAY], /mkt_projects_campaign_check/, 'a task is no campaign')

console.log(`marketing campaigns: ${checks} checks passed`)
