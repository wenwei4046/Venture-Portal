// Local PostgreSQL regression for 20261025161000 (2026-10-24 — Marketing ⑤-2: the PIC's own calendar, the handoff's
// `PIC Calendar.dc.html` and its "Calendar link (Carres · Kelvin)"). Marketing's migrations up to a task's dates run;
// then this one, twice. What is under test: who may call what; a PIC's calendar link made by the manager alone — once,
// the same again, a new one closing the old — and only for a PIC named with a WhatsApp number; the link open only while
// that PIC is the subsidiary's on the number it was made for (a number changed closes it, only its formatting does not,
// named again opens it); what the stranger holding it reads: the subsidiary's product projects sent to this PIC (either
// PIC, by the number), never another subsidiary's, another PIC's, one in its minutes or cancelled, a deliverable not
// planned or cancelled — each date marked for the PIC's calendar once filled, in the window; each stage with a PIC level
// ahead or waiting, never one they approved already on a level asking both; the minutes waiting for them; the
// campaigns; HR's holidays — every item with this PIC's own link; never a number, a staff id or a field's value. No
// live I/O.
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
const U = { josiah: id(1), mei: id(2), ali: id(3) }
const S = { josiah: id(11), mei: id(12), ali: id(13) }

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

  -- audit_register as recorded: which columns a change of alone is no record of, and which never reach one.
  CREATE TABLE public.audit_registered(t text PRIMARY KEY, area text, reads text[], mode text, reason text, ignore text[], omit text[]);
  CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
    p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
    p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
    p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
    INSERT INTO public.audit_registered VALUES (p_table, p_area, p_read, p_mode, p_reason, p_ignore, p_omit)
      ON CONFLICT (t) DO UPDATE SET area = excluded.area, reads = excluded.reads, mode = excluded.mode, reason = excluded.reason,
        ignore = excluded.ignore, omit = excluded.omit
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

  INSERT INTO public.users (id, name, email) VALUES ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active');
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
  '20261025039500_marketing_chat_review.sql', '20261025101000_marketing_subtasks.sql', '20261025113000_marketing_stage_files.sql',
  '20261025121000_marketing_billing.sql', '20261025131000_marketing_product_runs.sql', '20261025141000_marketing_campaigns.sql',
  '20261025151000_marketing_task_dates.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025161000_marketing_pic_calendar.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
check([await may('anon', 'mkt_pic_calendar(text)'), await may('authenticated', 'mkt_pic_calendar(text)')], [true, true],
  'the calendar: the stranger’s, by name')
check([await may('anon', 'mkt_sub_cal_link(uuid, integer, boolean)'), await may('authenticated', 'mkt_sub_cal_link(uuid, integer, boolean)')],
  [false, true], 'a calendar link: signed in only')
check([await may('anon', 'mkt_wa_key(text)'), await may('authenticated', 'mkt_wa_key(text)')], [false, false], 'the number’s key: nobody’s to call')
check(await peek(`SELECT ignore, omit FROM public.audit_registered WHERE t = 'mkt_subsidiaries'`),
  [{ ignore: ['cal_code', 'cal_wa', 'cal2_code', 'cal2_wa'], omit: ['cal_code', 'cal_wa', 'cal2_code', 'cal2_wa'] }],
  'the codes never reach the audit trail — a change of them alone is no record')

// ── A WhatsApp number as the PIC's key ────────────────────────────────────────────────────────────────────────
check(await peek(`SELECT public.mkt_wa_key('012-345 6789') AS a, public.mkt_wa_key('+60 12-345 6789') AS b, public.mkt_wa_key('6012 3456789') AS c,
                         public.mkt_wa_key('1234567') AS d, public.mkt_wa_key(NULL) AS e`),
  [{ a: '60123456789', b: '60123456789', c: '60123456789', d: null, e: null }], 'one phone however it is written; none under 8 digits')

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const plus = n => peek1(`SELECT (($1::date + $2::integer))::text`, [TODAY, n])
const FROM = await peek1(`SELECT ((date_trunc('month', $1::date) - interval '1 month')::date)::text`, [TODAY])
const TO = await peek1(`SELECT ((date_trunc('month', $1::date) + interval '4 months')::date - 1)::text`, [TODAY])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await asSystem()
const ACM = await one(`INSERT INTO public.mkt_subsidiaries (code, name) VALUES ('ACM', 'Acme Home') RETURNING id`)

// ── A PIC's calendar link: the manager's, for a PIC named with a number ────────────────────────────────────────
const link = (sub, slot, renew = false) => one(`SELECT public.mkt_sub_cal_link($1, $2, $3)`, [sub, slot, renew])
for (const [who, acts] of [['the team', STAFF], ['a viewer', VIEW], ['nobody from Marketing', []]]) {
  await as(who === 'nobody from Marketing' ? U.ali : U.mei, acts)
  await refuses(`SELECT public.mkt_sub_cal_link($1, 1)`, [CAR], /managers share/, `${who}: makes no calendar link`)
}
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_sub_cal_link($1, 1)`, [ACM], /Add its PIC first/, 'no PIC: no link')
await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [ACM, JSON.stringify({ pic: 'Kelvin Tan' })])
await refuses(`SELECT public.mkt_sub_cal_link($1, 1)`, [ACM], /Kelvin Tan's WhatsApp number first/, 'a PIC without a number: no link')
await refuses(`SELECT public.mkt_sub_cal_link($1, 2)`, [ACM], /Add its second PIC first/, 'no second PIC: no second link')
await refuses(`SELECT public.mkt_sub_cal_link($1, 3)`, [CAR], /first PIC or its second/, 'a third PIC is nobody')
await refuses(`SELECT public.mkt_sub_cal_link($1, 1)`, [id(999)], /not there/, 'no such subsidiary')
await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [ACM, JSON.stringify({ whatsapp: '0123456789' })])
await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [CAR, JSON.stringify({ pic: 'Kelvin Tan', whatsapp: '012-345 6789', pic2: 'Hana Lee', whatsapp2: '+60 19-876 5432' })])
const first = await link(CAR, 1)
check([/^[0-9a-f]{32}$/.test(first), await link(CAR, 1)], [true, first], 'made once — the same link again')
const kelvin = await link(CAR, 1, true)
check(kelvin !== first, true, 'a new link…')
const hana = await link(CAR, 2)
check(new Set([first, kelvin, hana]).size, 3, 'each PIC their own link')
const acme = await link(ACM, 1)

const cal = async code => {
  await as(null, [], 'anon')
  return one(`SELECT public.mkt_pic_calendar($1)`, [code])
}
check(await cal(first), null, '…and the old one closes')

// ── The projects: Carres's and Acme's, sent to Kelvin, Hana, Mary ──────────────────────────────────────────────
const KELVIN = '012-345 6789', HANA = '+60 19-876 5432', MARY = '011-1111 1111'
const code = n => `c0de${String(n).padStart(28, '0')}`
await asSystem()
async function product(n, sub, title, { status = 'active', pic = 'Kelvin Tan', wa = KELVIN, pic2 = null, wa2 = null, from = null, until = null, sent = null } = {}) {
  const pid = id(1000 + n)
  await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status, pic_name, pic_whatsapp, pic2_name, pic2_whatsapp,
             link_code, link2_code, link_sent_at, campaign_from, campaign_until)
           VALUES ($1, $2, 'product', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [pid, `MKT-CAR-2610-${String(n).padStart(3, '0')}`, sub, title, status, pic, wa, pic2, wa2, code(n), pic2 ? code(500 + n) : null, sent, from, until])
  return pid
}
async function deliverable(parent, n, title, status = 'active') {
  const did = id(2000 + Number(parent.slice(-4)) * 10 + n)
  await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status, parent_id)
           SELECT $1, track_id || '-D' || lpad($2::text, 2, '0'), 'deliverable', subsidiary_id, $3, $4, id FROM public.mkt_projects WHERE id = $5`,
    [did, n, title, status, parent])
  return did
}
async function stage(project, idx, name, { form = [], vals = {}, appr = [], status = 'planned', apprIdx = 0, ver = 0, due = null, picOk = null } = {}) {
  await q(`INSERT INTO public.mkt_stages (project_id, idx, name, spec, work, appr, status, appr_idx, ver, due_on, pic_ok)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11::jsonb)`,
    [project, idx, name, JSON.stringify({ form }), JSON.stringify({ vals }), JSON.stringify(appr), status, apprIdx, ver, due, picOk ? JSON.stringify(picOk) : null])
}
const FORM = [
  { label: 'Post day', type: 'Date', cal: { kind: 'post', pic: true } },
  { label: 'Shoot day', type: 'Date', cal: { kind: 'shoot', pic: false } },
  { label: 'Go live', type: 'Date', cal: { kind: 'ads_live', pic: true } },
  { label: 'Draft due', type: 'Date' },
]
const [D1, D2, D3, D5, D7, P] = [await plus(1), await plus(2), await plus(3), await plus(5), await plus(7), {}]
P.video = await product(1, CAR, 'Year-End Video', { pic2: 'Hana Lee', wa2: HANA, from: D2, until: await plus(9) })
P.content = await product(2, CAR, 'Nov content', { wa: '+6012 3456789', status: 'waiting_pic', sent: new Date(Date.now() - 86400000).toISOString(),
  from: await plus(300), until: await plus(310) })
P.mary = await product(3, CAR, 'Mary’s launch', { pic: 'Mary Ong', wa: MARY, from: D1, until: D3 })
P.draft = await product(4, CAR, 'Draft minutes', { status: 'minutes' })
P.off = await product(5, CAR, 'Called off', { status: 'cancelled' })
P.acme = await product(6, ACM, 'Acme sale')
P.weekends = await product(7, CAR, 'Showroom Weekends', { pic: 'Mary Ong', wa: MARY, pic2: 'Kelvin Tan', wa2: KELVIN })
const T = {
  teaser: await deliverable(P.video, 1, 'Teaser reel 1/2'),
  later: await deliverable(P.video, 2, 'Teaser reel 2/2', 'planning'),
  cut: await deliverable(P.video, 3, 'Director’s cut', 'cancelled'),
  maryPost: await deliverable(P.mary, 1, 'Launch post'),
  draftPost: await deliverable(P.draft, 1, 'Draft post'),
  offPost: await deliverable(P.off, 1, 'Off post'),
  acmePost: await deliverable(P.acme, 1, 'Acme post'),
  weekend: await deliverable(P.weekends, 1, 'Weekend post 1/1'),
}
const ALL_DATES = { 'Post day': D5, 'Shoot day': D3, 'Go live': D7, 'Draft due': D1 }
await stage(T.teaser, 0, 'Schedule', { form: FORM, vals: ALL_DATES })
await stage(T.teaser, 1, 'Client review', { appr: [{ kind: 'pic' }], due: await plus(12) })
for (const t of [T.later, T.cut, T.maryPost, T.draftPost, T.offPost, T.acmePost]) await stage(t, 0, 'Schedule', { form: FORM, vals: ALL_DATES })
await stage(T.weekend, 0, 'Schedule', { form: FORM, vals: { 'Post day': await plus(8) } })
await stage(T.weekend, 1, 'Far ahead', { form: FORM, vals: { 'Post day': await plus(200) } })
await q(`INSERT INTO public.att_holidays (day, name, states, deleted_at) VALUES ($1, 'Deepavali', 'All', NULL), ($1, 'Deepavali', 'Selangor', NULL),
           ($2, 'Sabah Day', 'Sabah', NULL), ($3, 'Gone', 'All', now()), ($4, 'Far away', 'All', NULL)`,
  [await plus(6), await plus(11), await plus(13), await plus(250)])

// ── A wrong code is nobody's ────────────────────────────────────────────────────────────────────────────────
for (const [bad, what] of [['', 'nothing'], [null, 'null'], ['abc', 'not a code'], [code(999), 'nobody’s code'], [code(1), 'a project’s own PIC link']]) {
  check(await cal(bad), null, `${what}: closed`)
}

// ── Kelvin's calendar: Carres's projects sent to him ────────────────────────────────────────────────────────
const k = await cal(kelvin.toUpperCase())
check([k.today, k.from, k.to, k.pic, k.sub], [TODAY, FROM, TO, 'Kelvin Tan', { name: 'Carres', dot: 'oklch(0.70 0.12 235)' }],
  'the subsidiary, its PIC, from the first of last month to the end of the third month ahead (the code in any case)')
const row = d => [d.day, d.kind, d.field, d.title, d.product, d.code, d.done, d.posted]
check(k.dates.map(row), [
  [D5, 'post', 'Post day', 'Teaser reel 1/2', 'Year-End Video', code(1), false, null],
  [D7, 'ads_live', 'Go live', 'Teaser reel 1/2', 'Year-End Video', code(1), false, null],
  [await plus(8), 'post', 'Post day', 'Weekend post 1/1', 'Showroom Weekends', code(507), false, null],
], 'each date marked for the PIC’s calendar, once filled, by day — his own link of each project (the second PIC on Showroom Weekends); never a date the PIC’s calendar is not asked for, one past the window, another PIC’s project, one in its minutes or cancelled, a deliverable not planned or cancelled, another subsidiary’s')
const hanaCal = await cal(hana)
check([hanaCal.pic, hanaCal.dates.map(d => [d.day, d.field, d.code])], ['Hana Lee', [[D5, 'Post day', code(501)], [D7, 'Go live', code(501)]]],
  'Hana’s: only what was sent to her, on her own link')
check((await cal(acme)).dates.map(d => [d.field, d.title, d.code]), [['Post day', 'Acme post', code(6)], ['Go live', 'Acme post', code(6)]],
  'his calendar of Acme Home: Acme’s alone')

// ── A post's mark, its task done ───────────────────────────────────────────────────────────────────────────
await asSystem()
await q(`UPDATE public.mkt_projects SET posted = $2::jsonb WHERE id = $1`,
  [T.teaser, JSON.stringify({ '0:Post day': { at: '2026-11-01T02:00:00Z', by: U.ali, name: 'Ali', link: 'https://instagram.com/p/teaser' } })])
check((await cal(kelvin)).dates[0].posted, { at: '2026-11-01T02:00:00Z', link: 'https://instagram.com/p/teaser' }, 'a post marked posted: when, its link — never who')

// ── Approvals: a stage with a PIC level ahead, waiting, both, done ────────────────────────────────────────────
const appr = async c => (await cal(c)).approvals.map(a => [a.day, a.title, a.product, a.stage, a.code, a.waiting])
check(await appr(kelvin), [[await plus(12), 'Teaser reel 1/2', 'Year-End Video', 'Client review', code(1), false]],
  'a stage the PIC approves, by its deadline — not yet waiting')
await asSystem()
await q(`UPDATE public.mkt_stages SET status = 'review', ver = 1 WHERE project_id = $1 AND idx = 1`, [T.teaser])
check((await appr(kelvin)).map(a => a[5]), [true], 'waiting for him now')
await asSystem()
await q(`UPDATE public.mkt_stages SET appr = '[{"kind":"pic","all":true}]', pic_ok = $2::jsonb WHERE project_id = $1 AND idx = 1`,
  [T.teaser, JSON.stringify({ ver: '1', lvl: '0', 1: { name: 'Kelvin Tan', at: '2026-11-02T01:00:00Z' } })])
check([await appr(kelvin), (await appr(hana)).map(a => [a[3], a[4], a[5]])], [[], [['Client review', code(501), true]]],
  'both PICs asked: his approval in — off his, still waiting on hers')
await asSystem()
await stage(T.weekend, 2, 'Review', { appr: [{ kind: 'person', staff: S.josiah }, { kind: 'pic' }], status: 'review', apprIdx: 0, ver: 1, due: await plus(15) })
check((await appr(kelvin)).map(a => [a[3], a[4], a[5]]), [['Review', code(507), false]], 'a manager first, then the PIC: ahead of him')
await asSystem()
await q(`UPDATE public.mkt_stages SET appr_idx = 1 WHERE project_id = $1 AND idx = 2`, [T.weekend])
check((await appr(kelvin)).map(a => a[5]), [true], '…his level now')
await asSystem()
await q(`UPDATE public.mkt_stages SET status = 'done' WHERE project_id = $1 AND idx = 2`, [T.weekend])
await stage(T.weekend, 3, 'Late review', { appr: [{ kind: 'pic' }], status: 'review', ver: 1, due: await peek1(`SELECT (($1::date - 10))::text`, [FROM]) })
await stage(T.weekend, 4, 'Old review', { appr: [{ kind: 'pic' }], due: await peek1(`SELECT (($1::date - 10))::text`, [FROM]) })
await stage(T.weekend, 5, 'No PIC', { appr: [{ kind: 'person', staff: S.josiah }], due: await plus(20) })
check((await appr(kelvin)).map(a => [a[3], a[5]]), [['Late review', true]],
  'a stage done: off it; one waiting long past its day: still on it; one not yet waiting before the window, or with no PIC level: never')
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'paused' WHERE id = $1`, [T.weekend])
check(await appr(kelvin), [], 'a deliverable paused: nothing to approve')

// ── The minutes waiting for him ───────────────────────────────────────────────────────────────────────────
const mins = async c => (await cal(c)).minutes.map(m => [m.title, m.code, typeof m.sentAt])
check([await mins(kelvin), await mins(hana)], [[['Nov content', code(2), 'string']], []], 'the minutes waiting for him — not for her, never sent to her')
await asSystem()
await q(`UPDATE public.mkt_projects SET pic_ok = jsonb_build_object('sent', (extract(epoch FROM link_sent_at))::text, '1', jsonb_build_object('name', 'Kelvin Tan'))
          WHERE id = $1`, [P.content])
check(await mins(kelvin), [], 'his approval of this sending in: no longer his to do')

// ── Campaigns and key dates ──────────────────────────────────────────────────────────────────────────────
check([(await cal(kelvin)).campaigns, (await cal(hana)).campaigns.map(c => c.code)],
  [[{ title: 'Year-End Video', from: D2, until: await plus(9), code: code(1) }], [code(501)]],
  'the campaigns running in the window — never one past it, never another PIC’s')
check((await cal(kelvin)).holidays, [{ day: await plus(6), name: 'Deepavali' }], 'HR’s holidays, once a day — never another state’s, a deleted one, one past the window')

// ── Never a number, a staff id, or a field's value ─────────────────────────────────────────────────────────
const words = JSON.stringify(await cal(kelvin))
check([/345 ?6789|3456789|8765432|1111111/.test(words), Object.values({ ...U, ...S }).some(v => words.includes(v)), /whatsapp/i.test(words), words.includes('Draft due'), words.includes(D1)],
  [false, false, false, false, false], 'no WhatsApp number, no staff id or name, never a date off the PIC’s calendar')

// ── The PIC changed: the link closes; only its formatting changed, it stays; named again, it opens ────────────
const edit = async patch => { await as(U.josiah, MANAGER); await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [CAR, JSON.stringify(patch)]) }
await edit({ whatsapp: '019-000 0000' })
check(await cal(kelvin), null, 'another number: closed')
await edit({ whatsapp: '+60 12-345 6789' })
check((await cal(kelvin))?.pic, 'Kelvin Tan', 'his number again, written another way: open')
await edit({ pic: 'Kelvin T.' })
check((await cal(kelvin))?.pic, 'Kelvin T.', 'his name corrected: open, under it')
await edit({ whatsapp: '019-000 0000' })
await as(U.josiah, MANAGER)
const newPic = await link(CAR, 1)
check([newPic !== kelvin, (await cal(newPic)).dates], [true, []], 'the new PIC’s link: a new one, showing nothing sent to the old one')
await edit({ whatsapp: KELVIN })
check([await cal(newPic), await cal(kelvin)], [null, null], 'the number back: the new PIC’s closes — and his old link was replaced')
await edit({ pic2: null, whatsapp2: null })
check(await cal(hana), null, 'the second PIC taken off: theirs closes')
await as(U.josiah, MANAGER)
const again = await link(CAR, 1)
check((await cal(again)).dates.length > 0, true, 'a link made for him again: his dates')
await asSystem()
await q(`UPDATE public.mkt_subsidiaries SET active = false WHERE id = $1`, [CAR])
check(await cal(again), null, 'a subsidiary no longer listed: closed')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_sub_cal_link($1, 1)`, [CAR], /not there/, '…and no link made for it')

console.log(`marketing PIC calendar: ${checks} checks passed`)
