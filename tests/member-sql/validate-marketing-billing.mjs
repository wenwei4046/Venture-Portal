// Local PostgreSQL regression for 20261025121000 (2026-10-24 — Marketing ②b-2b: billing drafts, Marketing's side; the
// user's answers 43–48, 50, 51). Marketing's migrations up to the stage files run; then this one, twice. What is under
// test: an outside client's billing details (added, edited, checked; never a group company's); a product project's
// amount — typed when it is made, the list price offered, changed by the manager, never shown to the staff nor its figure
// written in the trail; what is billed in which month — a one-time project once it is done, a recurring one every month
// from the month its work started until the manager stops it; the manager confirming a month's lines, withdrawing one,
// confirming it again; a stopped recurring project closing once nothing of it is under way. No live I/O.
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

const mig = await sql('20261025121000_marketing_billing.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
for (const [fn, signedIn] of [['mkt_bill_party(jsonb)', false], ['mkt_bill_due(date, date)', false], ['mkt_sub_add(text, text, jsonb)', true],
  ['mkt_product_start(uuid, uuid, numeric)', true], ['mkt_client_bill(uuid)', true], ['mkt_billing(date)', true],
  ['mkt_bill_confirm(date, uuid[])', true], ['mkt_bill_withdraw(uuid)', true], ['mkt_project_bill_set(uuid, numeric)', true],
  ['mkt_product_stop(uuid)', true]]) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, signedIn], `${fn}: who calls it`)
}
check(await peek1(`SELECT count(*)::int FROM pg_proc WHERE proname IN ('mkt_sub_add', 'mkt_product_start')`), 2,
  'mkt_sub_add and mkt_product_start re-made, the old two-argument ones gone')
check(await peek1(`SELECT count(*)::int FROM public.permission_page_tabs WHERE page = '/marketing/billing' AND tab_id = 'mkt.tracking'`), 1,
  'the page in the database’s copy of the tab registry')
check(await peek1(`SELECT mode FROM public.audit_registered WHERE t = 'mkt_bills'`), 'none', 'mkt_bills: its own record, registered')
await as(U.josiah, MANAGER)
await refuses(`SELECT * FROM public.mkt_bills`, [], /permission denied/, 'mkt_bills: read only through the functions')
await refuses(`SELECT * FROM public.mkt_bill_due(now()::date, now()::date)`, [], /permission denied/, 'mkt_bill_due: nobody’s to call')

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const MONTH = `${TODAY.slice(0, 7)}-01`
const monthsBack = async n => peek1(`SELECT (($1::date - make_interval(months => $2))::date)::text`, [MONTH, n])
const LAST = await monthsBack(1)
const TWO_AGO = await monthsBack(2)
const NEXT = await peek1(`SELECT (($1::date + interval '1 month')::date)::text`, [MONTH])
const mon = await peek1(`SELECT to_char($1::date, 'Mon') || '''' || to_char($1::date, 'YY')`, [MONTH])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)

// ── An outside client's billing details: given when it is added ───────────────────────────────────────────
const ADDR = { line1: '  No 8,  Jalan Kenari 5 ', line2: '', postcode: '47100', city: 'Puchong', state: 'Selangor', country: '' }
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_sub_add('Red Truck', 'Kelvin', '{}'::jsonb)`, [], /manager/, 'Marketing · Edit adds no client')
await as(U.josiah, MANAGER)
const RT = await one(`SELECT public.mkt_sub_add($1, $2, $3::jsonb)`, ['Red Truck', 'Kelvin', JSON.stringify({
  name: ' Red  Truck Sdn Bhd ', address: ADDR, phone: '+60 12-345 6789', email: 'accounts@redtruck.my' })])
check(RT.bill, { name: 'Red Truck Sdn Bhd', address: { line1: 'No 8, Jalan Kenari 5', line2: '', postcode: '47100', city: 'Puchong', state: 'Selangor',
  country: 'Malaysia' }, phone: '+60 12-345 6789', email: 'accounts@redtruck.my' }, 'added with its billing details, tidied — the country Malaysia when blank')
check(await peek1(`SELECT bill_name FROM public.mkt_subsidiaries WHERE id = $1`, [RT.id]), 'Red Truck Sdn Bhd', '…kept on the client')
const OLD = await one(`SELECT public.mkt_sub_add('Blue Van', 'Hana')`)
check(OLD.bill, { name: null, address: null, phone: null, email: null }, 'the old call, with no billing details, still adds a client')
for (const [bill, pattern, what] of [
  [{ email: 'accounts' }, /email address/, 'an email that is not one'],
  [{ phone: '012-ABC' }, /phone number/, 'a phone number of letters'],
  [{ address: { ...ADDR, line1: '' } }, /address line 1/, 'an address without its first line'],
  [{ address: 'No 8, Jalan Kenari 5' }, /in its parts/, 'an address in one box'],
  [{ name: 'x'.repeat(121) }, /120 characters/, 'a billing name too long'],
  [{ bank: '123' }, /not a billing detail/, 'something else'],
]) await refuses(`SELECT public.mkt_sub_add($1, NULL, $2::jsonb)`, [`Client ${checks}`, JSON.stringify(bill)], pattern, `refused: ${what}`)

// ── …and edited on its page: only what changed; a group company keeps Finance's ────────────────────────────
const edited = await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [OLD.id, JSON.stringify({ billName: 'Blue Van Trading', billPhone: '03-8888 1234' })])
check(edited.bill, { name: 'Blue Van Trading', address: null, phone: '03-8888 1234', email: null }, 'the details given, the others left as they were')
const moved = await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [OLD.id, JSON.stringify({ billAddress: ADDR, billPhone: null })])
check([moved.bill.name, moved.bill.address?.city, moved.bill.phone], ['Blue Van Trading', 'Puchong', null], 'an address picked, a phone cleared')
const cleared = await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [OLD.id, JSON.stringify({ billAddress: { ...ADDR, line1: '', postcode: '', city: '', state: '' } })])
check(cleared.bill.address, null, 'an address emptied (the country alone) is none')
await refuses(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [CAR, JSON.stringify({ billName: 'Carres Sdn Bhd' })], /group company is billed as Finance keeps it/,
  'a group company’s billing details are Finance’s')
check((await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [CAR, JSON.stringify({ billName: null, pic: 'Kelvin' })])).bill, null,
  'a group company: an empty billing key is nothing, the rest saved')
check(await one(`SELECT public.mkt_client_bill($1)`, [OLD.id]), { name: 'Blue Van Trading', address: null, phone: null, email: null },
  'its page reads them, for the manager')
check(await one(`SELECT public.mkt_client_bill($1)`, [CAR]), null, 'a group company has none of Marketing’s')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_client_bill($1)`, [OLD.id], /manager/, 'Marketing · Edit reads no billing details')

// ── Products: a one-time post pack (RM 500), a recurring social media plan (RM 3,000 a month) ─────────────
await as(U.josiah, MANAGER)
const minutes = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff',
  fields: [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }],
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [minutes.id, minutes.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'person', staff: S.josiah }], form: [{ label: 'Final image', type: 'File' }] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
async function product(kind, name, price) {
  const p = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind })])
  const saved = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [p.id, JSON.stringify({ name, intake: minutes.id, price,
    effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 2, price: price / 2, workflow: wf.id }] }] })])
  await one(`SELECT public.mkt_product_publish($1, $2)`, [p.id, saved.rev])
  return p.id
}
const PACK = await product('one', 'Post pack', 500)
const PLAN = await product('recurring', 'Social Media Management', 3000)
check((await one(`SELECT public.mkt_product_picker()`)).map(p => [p.name, Number(p.price)]).sort(),
  [['Post pack', 500], ['Social Media Management', 3000]], 'New Project offers each product’s list price')

// ── The amount: typed when the project is made (the list price unless another), the manager's alone ────────
const P1 = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, PACK])).id
const P2 = (await one(`SELECT public.mkt_product_start($1, $2, $3)`, [CAR, PACK, 450.5])).id
const R1 = (await one(`SELECT public.mkt_product_start($1, $2, $3)`, [OLD.id, PLAN, 2800])).id
check(Object.fromEntries((await peek(`SELECT id, bill_amount::text AS amount FROM public.mkt_projects WHERE id IN ($1, $2, $3)`, [P1, P2, R1]))
  .map(x => [x.id, x.amount])), { [P1]: '500.00', [P2]: '450.50', [R1]: '2800.00' }, 'the list price when none is typed; the quote when it is')
for (const bad of [0, -5, 12.345]) {
  await refuses(`SELECT public.mkt_product_start($1, $2, $3)`, [CAR, PACK, bad], /amount in ringgit/, `no project made on an amount of ${bad}`)
}
check((await one(`SELECT public.mkt_product_project($1)`, [P2])).bill, { amount: 450.5, from: null, until: null, confirmed: 0, last: null },
  'its page shows the manager its amount')
await as(U.ali, STAFF)
check((await one(`SELECT public.mkt_product_project($1)`, [P2])).bill, null, '…and the staff nothing of it')
await refuses(`SELECT public.mkt_project_bill_set($1, 600)`, [P2], /manager/, 'Marketing · Edit changes no amount')
await as(U.josiah, MANAGER)
const P2page = await one(`SELECT public.mkt_project_bill_set($1, 480)`, [P2])
check(P2page.bill.amount, 480, 'the manager changes it on the project’s page')
check(P2page.trail.filter(e => e.action === 'amount set').map(e => e.data), [null], '…the trail says it changed, never the figure')
await one(`SELECT public.mkt_project_bill_set($1, 480)`, [P2])
check(await peek1(`SELECT count(*)::int FROM public.mkt_events WHERE project_id = $1 AND action = 'amount set'`, [P2]), 1, 'the same amount again writes nothing')
await refuses(`SELECT public.mkt_project_bill_set($1, 0)`, [P2], /amount in ringgit/, 'an amount of nothing refused')

// ── What is billed when: a one-time project once it is done ────────────────────────────────────────────────
const billing = (month = null) => one(`SELECT public.mkt_billing($1)`, [month])
let page = await billing()
check([page.month, page.lines.length, page.open], [MONTH, 0, []], 'nothing billed while nothing is done or running')
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2, pic_name = 'Kelvin' WHERE id = $1`, [P1, 'a'.repeat(32)])
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [P1])
check(await peek1(`SELECT bill_from FROM public.mkt_projects WHERE id = $1`, [P1]), null, 'a one-time project keeps no months')
check((await billing()).lines.length, 0, 'under way, it is not billed yet')
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [P1])
await q(`SELECT public.mkt_product_settle($1)`, [P1])
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [P1]), 'done', 'its deliverables done, it closes')
await as(U.josiah, MANAGER)
page = await billing()
const line1 = page.lines.find(l => l.project === P1)
check([page.lines.length, line1.kind, line1.amount, line1.bill, line1.product], [1, 'one', 500, null, 'Post pack'], 'done: billed this month, to confirm')
check(page.subs.map(s => [s.code, s.client, s.company, s.bill]), [['CAR', false, 'Carres', null]], '…for its client — a group company, billed as Finance keeps it')

// ── Confirmed by the manager, withdrawn, confirmed again ───────────────────────────────────────────────────
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_billing()`, [], /manager/, 'Billing is the manager’s to read')
await refuses(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P1]], /manager/, '…and to confirm')
await as(U.josiah, MANAGER)
const actor = await peek1(`SELECT public.mkt_actor()`)
page = await one(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P1]])
const bill1 = page.lines.find(l => l.project === P1).bill
check([page.confirmed, bill1.amount, bill1.words, bill1.by], [1, 500, `Post pack - ${mon}`, actor], 'confirmed: its amount and words kept, and who')
check((await one(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P1]])).confirmed, 0, 'confirmed again: nothing new')
check(await peek1(`SELECT count(*)::int FROM public.mkt_bills WHERE project_id = $1`, [P1]), 1, '…one record')
await refuses(`SELECT public.mkt_project_bill_set($1, 520)`, [P1], /withdraw it on Billing first/, 'a one-time project’s amount stays once its billing is confirmed')
await refuses(`SELECT public.mkt_bill_confirm($1, $2)`, [LAST, [P1]], /is not billed in/, 'a month it is not billed in refused')
await refuses(`SELECT public.mkt_bill_confirm($1, $2)`, [NEXT, [P1]], /still to come/, 'a month still to come refused')
await refuses(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P2]], /is not billed in/, 'a project not done refused')
await refuses(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, []], /Pick what to confirm/, 'nothing picked')
check((await billing(NEXT)).month, MONTH, 'a month still to come reads as this one')
await asSystem()
await refuses(`INSERT INTO public.mkt_bills (project_id, month, subsidiary_id, amount, words, confirmed_name) VALUES ($1, $2, $3, 500, 'x', 'x')`,
  [P1, MONTH, CAR], /duplicate key|unique/, 'one standing confirmation a project and month, whoever writes it')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_bill_withdraw($1)`, [bill1.id], /manager/, 'Marketing · Edit withdraws nothing')
await as(U.josiah, MANAGER)
page = await one(`SELECT public.mkt_bill_withdraw($1)`, [bill1.id])
check(page.lines.find(l => l.project === P1).bill, null, 'withdrawn: the line is the month’s to confirm again')
await refuses(`SELECT public.mkt_bill_withdraw($1)`, [bill1.id], /withdrawn already/, 'withdrawn once only')
check((await one(`SELECT public.mkt_project_bill_set($1, 520)`, [P1])).bill.amount, 520, 'withdrawn, its amount changes again')
page = await one(`SELECT public.mkt_bill_confirm($1, $2)`, [MONTH, [P1]])
check(page.lines.find(l => l.project === P1).bill.amount, 520, 'confirmed again at the amount now')
check(await peek(`SELECT status, amount::text AS amount FROM public.mkt_bills WHERE project_id = $1 ORDER BY confirmed_at, status DESC`, [P1]),
  [{ status: 'withdrawn', amount: '500.00' }, { status: 'confirmed', amount: '520.00' }], 'the withdrawn record kept as it was, beside the new one')
check(await peek(`SELECT action, data FROM public.mkt_events WHERE project_id = $1 AND action LIKE 'billing %' ORDER BY id`, [P1]),
  [{ action: 'billing confirmed', data: { month: MONTH.slice(0, 7) } }, { action: 'billing withdrawn', data: { month: MONTH.slice(0, 7) } },
    { action: 'billing confirmed', data: { month: MONTH.slice(0, 7) } }], 'the trail: each confirmation and withdrawal, its month — never its figure')

// ── A recurring project: every month from the one its work started, until the manager stops it ─────────────
await refuses(`SELECT public.mkt_product_stop($1)`, [R1], /work has not started/, 'stopped before its work started: nothing to stop')
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2, pic_name = 'Hana' WHERE id = $1`, [R1, 'b'.repeat(32)])
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [R1])
check(await peek1(`SELECT bill_from::text FROM public.mkt_projects WHERE id = $1`, [R1]), MONTH, 'its work started: billed from this month')
page = await billing()
const r = page.lines.find(l => l.project === R1)
check([r.kind, r.amount, r.from, r.until], ['recurring', 2800, MONTH, null], 'billed this month, monthly')
check(page.subs.find(s => s.id === OLD.id).bill, { name: 'Blue Van Trading', address: null, phone: null, email: null }, '…for an outside client, with its billing details')
await asSystem()
await q(`UPDATE public.mkt_projects SET bill_from = $2 WHERE id = $1`, [R1, TWO_AGO])
await as(U.josiah, MANAGER)
page = await billing()
check(page.open, [{ month: LAST, due: 1 }, { month: TWO_AGO, due: 1 }], 'begun two months ago: each month since still to confirm, none lost')
await one(`SELECT public.mkt_bill_confirm($1, $2)`, [LAST, [R1]])
check((await billing()).open, [{ month: TWO_AGO, due: 1 }], 'last month confirmed')
check((await billing(LAST)).lines.map(l => [l.project, l.bill?.amount]), [[R1, 2800]], 'last month reads its line, confirmed')
check((await one(`SELECT public.mkt_project_bill_set($1, 3200)`, [R1])).bill.amount, 3200, 'a recurring project’s fee changes for the months to come…')
check((await billing(LAST)).lines[0].bill.amount, 2800, '…a month confirmed keeps its figure')
check((await billing()).lines.find(l => l.project === R1).amount, 3200, '…this month takes the new one')

// ── Not closed by its deliverables; stopped, it closes once nothing of it is under way ─────────────────────
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [R1])
await q(`SELECT public.mkt_product_settle($1)`, [R1])
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [R1]), 'active', 'a recurring project runs on when its deliverables are done')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_product_stop($1)`, [R1], /manager/, 'Marketing · Edit stops nothing')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_product_stop($1)`, [P2], /Only a recurring project is stopped/, 'a one-time project is not stopped')
const stopped = await one(`SELECT public.mkt_product_stop($1)`, [R1])
check([stopped.project.status, stopped.bill.from, stopped.bill.until], ['done', TWO_AGO, MONTH], 'stopped: this month its last billed — closed, nothing under way')
check(stopped.trail.find(e => e.action === 'stopped').data, { until: MONTH.slice(0, 7) }, 'the trail: stopped, its last month')
await refuses(`SELECT public.mkt_product_stop($1)`, [R1], /stopped already/, 'stopped once')
check((await billing()).lines.some(l => l.project === R1), true, 'its last month still billed')
await asSystem()
await q(`UPDATE public.mkt_projects SET bill_until = $2 WHERE id = $1`, [R1, LAST])
await as(U.josiah, MANAGER)
check([(await billing()).lines.some(l => l.project === R1), (await billing()).open], [false, [{ month: TWO_AGO, due: 1 }]],
  'a month after the one it stopped is not billed')

// Stopped while work is under way: it stays open until the last deliverable is done.
const R2 = (await one(`SELECT public.mkt_product_start($1, $2)`, [RT.id, PLAN])).id
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2, pic_name = 'Kelvin' WHERE id = $1`, [R2, 'c'.repeat(32)])
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [R2])
check((await one(`SELECT public.mkt_product_stop($1)`, [R2])).project.status, 'active', 'stopped with its work under way: open still')
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'done', done_at = now() WHERE parent_id = $1`, [R2])
await q(`SELECT public.mkt_product_settle($1)`, [R2])
check(await peek1(`SELECT status FROM public.mkt_projects WHERE id = $1`, [R2]), 'done', '…closed once its last deliverable is done')

// ── Nothing a staff member reads carries a figure ───────────────────────────────────────────────────────
check(await peek1(`SELECT count(*)::int FROM public.mkt_events WHERE data::text ~ '(amount|price|2800|3200|520)'`), 0,
  'no trail line holds an amount')

console.log(`marketing billing: ${checks} checks passed`)
