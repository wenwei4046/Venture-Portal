// Local PostgreSQL regression for 20261025231000 (2026-10-25 — Marketing ②a-4: the PIC approves a task's meeting minutes;
// the user's answers 52 — chosen on the task — and 53 — its first stage waits, as a product project's work does, the
// manager may start before approval). Marketing's migrations up to ②a-3 run; then this one, twice. What is under test: who
// may call what; a task whose minutes go to the PIC — its PIC kept, waiting with every stage planned and undated, nobody's
// turn, its minutes never complete at once nor with a signature; refused before anything is written or numbered (no PIC,
// a WhatsApp too short, a second PIC without one, a PIC that is not a form); sent by its owner — never somebody else —
// once every attendee signed; the PIC's page and answer as a product project's: changes, resent, approved — the work
// starting that day, its stages dated from it, the first one's person told; started before approval by the manager only;
// both PICs, and an edit they see taking an approval back; a task's PIC set only when the PIC approves; the task's page
// saying where it stands; a recurring task's series making no run while it waits, then its runs from that day; the files
// of the work the PIC follows; a product project's path as before; never a product project's choice or a run's. No live I/O.
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
  '20261025151000_marketing_task_dates.sql', '20261025161000_marketing_pic_calendar.sql', '20261025171000_marketing_log_corrections.sql',
  '20261025181000_marketing_product_pause.sql', '20261025191000_marketing_option_lists.sql', '20261025201000_marketing_opened_from.sql']
for (const m of MIGS) await db.exec(await sql(m))
await db.exec(await sql('20261025211000_marketing_new_drafts.sql'))
await db.exec(await sql('20261025221000_marketing_task_minutes.sql'))
const mig = await sql('20261025231000_marketing_task_pic.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks
const asStranger = () => as(null, [], 'anon')

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_task_begin(uuid, text)', 'mkt_pic_work(uuid)'])
  check([await may('anon', fn), await may('authenticated', fn), await may('service_role', fn)], [false, false, true], `${fn}: called by other functions only`)
for (const fn of ['mkt_pic_page(text)', 'mkt_pic_answer(text, text, text, text)'])
  check([await may('anon', fn), await may('authenticated', fn)], [true, true], `${fn}: still the stranger’s, by name`)
for (const fn of ['mkt_minutes_send(uuid, integer)', 'mkt_project_resend(uuid)', 'mkt_project_override(uuid, text)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only`)

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const plus = n => peek1(`SELECT (($1::date + $2::integer))::text`, [TODAY, n])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const CREATOR = ['marketing.view', 'marketing.create', 'marketing.edit']
const STAGES = [{ name: 'Design', dept: 'GRAPHIC DESIGNER', who: S.ali, sla: 2, appr: [] }, { name: 'Caption', dept: 'VIDEOGRAPHER', who: S.mei, sla: 1, appr: [] }]
const PIC = { name: 'Kelvin Tan', whatsapp: '+60 12-345 6789' }
const PIC2 = { name2: 'Hana Lee', whatsapp2: '+60 13-999 8888' }

// The manager's templates: a kickoff every attendee signs, the PIC signs off, locked once complete; a quick brief nobody
// signs; one both PICs sign off.
await as(U.josiah, MANAGER)
const BASE = [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }]
const publish = async (name, fields, rules) => {
  const t = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name, fields, rules })])
  await one(`SELECT public.mkt_minutes_publish($1, $2)`, [t.id, t.rev])
  return t.id
}
const KICKOFF = await publish('Kickoff', [...BASE, { name: 'Agenda', type: 'Long text', req: true, pic: true }, { name: 'Budget', type: 'Number' },
  { name: 'Signatures', type: 'Signature' }], { sign: true, pic: true, project: true, file: true, lock: true })
const BRIEF = await publish('Quick brief', [...BASE, { name: 'Points', type: 'Long text', req: true, pic: true }],
  { sign: false, pic: false, project: true, file: false, lock: false })
const BOTH = await publish('Both sign', [...BASE, { name: 'Points', type: 'Long text', req: true, pic: true }],
  { sign: false, pic: true, picAll: true, project: true, file: false, lock: false })

const create = (title, minutes, kind = 'quick', extra = {}) => one(
  `SELECT public.mkt_task_create($1, $2, $3, 'social', NULL, $4::jsonb, $5::jsonb, NULL, $6::jsonb)`,
  [CAR, kind, title, JSON.stringify(extra.stages ?? STAGES), extra.recur ? JSON.stringify(extra.recur) : null, minutes ? JSON.stringify(minutes) : null])
const proj = async pid => (await peek(`SELECT status, pic_minutes, pic_name, pic_whatsapp, pic2_name, pic2_whatsapp, starts_on::text, due_on::text, cur,
  link_code IS NOT NULL AS linked, override IS NOT NULL AS overridden FROM public.mkt_projects WHERE id = $1`, [pid]))[0]
const stagesOf = pid => peek(`SELECT idx, status, starts_on::text, due_on::text, entered_at IS NOT NULL AS entered, accepted_at IS NOT NULL AS accepted
  FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [pid])
const minutesOf = async pid => (await peek(`SELECT id, status, locked, completed_by, rev FROM public.mkt_minutes WHERE project_id = $1`, [pid]))[0]
const trail = pid => peek(`SELECT action, actor_name AS actor, stage_idx AS stage, from_to, reason, data FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [pid])
const notices = user => peek(`SELECT title, body FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at, id`, [user])
const counts = () => peek1(`SELECT jsonb_build_object('projects', (SELECT count(*) FROM public.mkt_projects),
  'minutes', (SELECT count(*) FROM public.mkt_minutes), 'events', (SELECT count(*) FROM public.mkt_events))`)
const num = track => Number(track.slice(-3))
const dates = slas => peek(`SELECT idx, starts_on::text, due_on::text FROM public.mkt_stage_dates($1::date, $2::integer[]) ORDER BY idx`, [TODAY, slas])
const page = key => one(`SELECT public.mkt_project($1)`, [key])

// ── A quick task whose minutes the PIC approves: it waits ─────────────────────────────────────────────────────────
await as(U.mei, CREATOR)
const A = await create('Raya push', { template: KICKOFF, vals: { Attendees: [S.mei, S.ali], Agenda: 'Raya visuals' }, notes: 'internal', sign: true, pic: PIC })
check(await proj(A.id), { status: 'minutes', pic_minutes: true, pic_name: 'Kelvin Tan', pic_whatsapp: '+60 12-345 6789', pic2_name: null, pic2_whatsapp: null,
  starts_on: null, due_on: null, cur: 0, linked: false, overridden: false }, 'its minutes go to the PIC: the task waits — its PIC kept, no start day, no deadline')
const UNDATED = { status: 'planned', starts_on: null, due_on: null, entered: false, accepted: false }
check(await stagesOf(A.id), [{ idx: 0, ...UNDATED }, { idx: 1, ...UNDATED }], '…every stage planned and undated: nobody’s turn yet')
check([(await minutesOf(A.id)).status, (await minutesOf(A.id)).locked], ['draft', false], '…its minutes a draft: they complete with the PIC’s approval')
check((await trail(A.id)).map(e => [e.action, e.data?.pic ?? null]), [['created', 'Kelvin Tan'], ['signed', null]],
  '…the trail: created for Kelvin to approve, Mei’s signature — no stage opened')
check((await notices(U.ali)).at(-1), { title: `You're on quick task "Raya push"`, body: 'Stage 1 · Design · starts once the PIC approves the minutes' },
  '…Ali hears he is on it, and that it waits')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_stage_accept($1)`, [A.id], /not open \(minutes\)/, 'nothing to accept while it waits')

// ── Refused before anything is written or numbered ────────────────────────────────────────────────────────────
await as(U.mei, CREATOR)
const before = await counts()
for (const [what, pic, pattern] of [
  ['no name', { whatsapp: PIC.whatsapp }, /Name the PIC/],
  ['a name of spaces', { name: '   ', whatsapp: PIC.whatsapp }, /Name the PIC/],
  ['a name too long', { name: 'K'.repeat(81), whatsapp: PIC.whatsapp }, /Name the PIC/],
  ['no WhatsApp', { name: 'Kelvin' }, /PIC's WhatsApp/],
  ['a WhatsApp too short', { name: 'Kelvin', whatsapp: '012-345' }, /PIC's WhatsApp/],
  ['a WhatsApp of words', { name: 'Kelvin', whatsapp: 'call me on 0123456789' }, /PIC's WhatsApp/],
  ['a second PIC without a WhatsApp', { ...PIC, name2: 'Hana Lee' }, /second PIC's WhatsApp/],
  ['a second PIC’s name too long', { ...PIC, name2: 'H'.repeat(81), whatsapp2: PIC2.whatsapp2 }, /at most 80/],
  ['a PIC that is not a form', 'Kelvin', /leave the PIC out/],
]) await refuses(`SELECT public.mkt_task_create($1, 'quick', 'Refused', 'social', NULL, $2::jsonb, NULL, NULL, $3::jsonb)`,
  [CAR, JSON.stringify(STAGES), JSON.stringify({ template: BRIEF, vals: { Attendees: [S.mei], Points: 'x' }, pic })], pattern, `refused: ${what}`)
check(await counts(), before, '…nothing written by any of them')
const N = await create('No PIC', { template: BRIEF, vals: { Attendees: [S.mei], Points: 'x' }, pic: null })
check(num(N.track), num(A.track) + 1, '…nor numbered: the next task takes the next number')
check([(await proj(N.id)).status, (await proj(N.id)).pic_minutes, (await proj(N.id)).pic_name], ['active', false, null],
  'no PIC asked: the work starts at once, as before ②a-4')
check((await minutesOf(N.id)).status, 'completed', '…nobody to sign: its minutes complete at once, as before')

// Nothing to sign, the PIC asked: still a draft until the PIC approves. Two PICs, each their own link.
const B = await create('Banner', { template: BRIEF, vals: { Attendees: [S.mei], Points: 'New price on the banner' }, pic: { ...PIC, ...PIC2 } })
check([(await minutesOf(B.id)).status, (await proj(B.id)).pic2_name, (await proj(B.id)).pic2_whatsapp], ['draft', 'Hana Lee', '+60 13-999 8888'],
  'nothing to sign and the PIC asked: a draft till the PIC approves; the second PIC kept')
check((await trail(B.id)).map(e => e.action), ['created'], '…not completed on the trail')

// ── Sent by its owner, once every attendee signed ─────────────────────────────────────────────────────────────
const mA = await minutesOf(A.id)
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_minutes_send($1, $2)`, [mA.id, mA.rev], /manager/, 'sending is the task’s owner’s — or the manager’s — never Ali’s')
await as(U.mei, CREATOR)
await refuses(`SELECT public.mkt_minutes_send($1, $2)`, [mA.id, mA.rev], /Waiting for signatures: Ali/, 'every attendee signs first, as the template asks')
await as(U.ali, STAFF)
check((await one(`SELECT public.mkt_minutes_sign($1)`, [mA.id])).minutes, 'draft', 'Ali signs — the last signature — and they stay a draft: the PIC completes them')
check((await trail(A.id)).some(e => e.action === 'minutes completed'), false, '…never completed by a signature')
await as(U.mei, CREATOR)
const mA2 = await minutesOf(A.id)
await refuses(`SELECT public.mkt_minutes_send($1, $2)`, [mA2.id, mA2.rev + 5], /since you opened them/, 'on minutes that moved on: refused')
const sent = await one(`SELECT public.mkt_minutes_send($1, $2)`, [mA2.id, mA2.rev])
check([sent.status, sent.minutes, /^[0-9a-f]{32}$/.test(sent.link), sent.link2], ['waiting_pic', 'sent', true, null], 'Mei sends them: waiting for the PIC, the link made')
const CODE_A = sent.link
check((await trail(A.id)).at(-1), { action: 'link sent', actor: 'Mei', stage: null, from_to: null, reason: 'Kelvin Tan', data: null }, '…on the trail')
await refuses(`SELECT public.mkt_minutes_send($1, $2)`, [mA2.id, sent.rev], /sent already/, 'sent once')
const mN = await minutesOf(N.id)
await refuses(`SELECT public.mkt_minutes_send($1, $2)`, [mN.id, mN.rev], /a task's the PIC approves/, 'a task’s minutes the PIC does not approve are never sent')
check((await stagesOf(A.id))[0].status, 'planned', 'sent: its first stage still waits')

// ── The PIC's page and answer ────────────────────────────────────────────────────────────────────────────────
await asStranger()
const pg = await one(`SELECT public.mkt_pic_page($1)`, [CODE_A])
check([pg.kind, pg.product, pg.title, pg.track, pg.status, pg.pic, pg.you, pg.work], ['quick', null, 'Raya push', A.track, 'waiting_pic', 'Kelvin Tan', 1, []],
  'the PIC’s page: a quick task waiting for them — no work yet')
check(pg.minutes.fields.map(f => [f.name, f.value]), [['Agenda', 'Raya visuals']], '…the minutes’ fields they see, never the rest')
check(await one(`SELECT public.mkt_pic_page($1)`, ['0'.repeat(32)]), null, 'a wrong code: the link is closed')
await refuses(`SELECT public.mkt_pic_answer($1, 'changes', NULL, $2)`, [CODE_A, 'no'], /5 to 500/, 'changes ask what should change')
const ch = await one(`SELECT public.mkt_pic_answer($1, 'changes', NULL, $2)`, [CODE_A, 'Use the green banner please'])
check([ch.status, ch.reply.decision, ch.reply.name], ['changes', 'changes', 'Kelvin Tan'], 'Kelvin asks for changes')
check([(await proj(A.id)).status, (await stagesOf(A.id))[0].status], ['changes', 'planned'], '…the task waits on')
check((await notices(U.mei)).at(-1).title, 'Kelvin Tan asked for changes', '…its owner is told')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_project_resend($1)`, [A.id], /manager/, 'resending is the owner’s or the manager’s')
await as(U.mei, CREATOR)
check((await one(`SELECT public.mkt_project_resend($1)`, [A.id])).status, 'waiting_pic', 'Mei resends')
check((await trail(A.id)).at(-1).action, 'resent', '…on the trail')

// Approved: the work starts that day.
await asStranger()
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Ke', NULL)`, [CODE_A], /full name/, 'approving asks a full name')
const ap = await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [CODE_A])
check([ap.status, ap.reply.decision], ['active', 'approved'], 'Kelvin approves: the task’s work starts')
const mA3 = await minutesOf(A.id)
check([mA3.status, mA3.locked, mA3.completed_by], ['completed', true, 'Kelvin Tan (PIC)'], '…its minutes completed by the PIC — locked, as the template says')
const want = await dates([2, 1])
check(await stagesOf(A.id), [
  { idx: 0, status: 'todo', starts_on: want[0].starts_on, due_on: want[0].due_on, entered: true, accepted: false },
  { idx: 1, status: 'planned', starts_on: want[1].starts_on, due_on: want[1].due_on, entered: false, accepted: false }],
'…its stages dated from today — Ali’s turn, to accept')
const pA = await proj(A.id)
check([pA.starts_on, pA.due_on, pA.cur], [TODAY, want[1].due_on, 0], '…the task starts today, due on its last stage’s day')
check((await trail(A.id)).slice(-3).map(e => [e.action, e.actor, e.stage, e.from_to]),
  [['pic approved', 'Kelvin Tan (PIC)', null, null], ['work started', 'Kelvin Tan (PIC)', null, null], ['opened', 'Kelvin Tan (PIC)', 0, 'Ali']],
  '…the trail: approved on the link, the work started, Design opened for Ali')
check((await notices(U.ali)).at(-1), { title: 'Your turn: Design', body: `${A.track} · Raya push` }, '…Ali is told it is his turn')
check((await notices(U.mei)).at(-1).title, 'Kelvin Tan approved the minutes', '…Mei, that Kelvin approved')
const pg2 = await one(`SELECT public.mkt_pic_page($1)`, [CODE_A])
check([pg2.status, pg2.work.length, pg2.work[0].title, pg2.work[0].stages, pg2.work[0].done, pg2.work[0].stage.name, pg2.work[0].stage.status, pg2.work[0].stage.waiting],
  ['active', 1, 'Raya push', 2, 0, 'Design', 'todo', false], 'the PIC’s page: the work under way — the task and its stage now')
check(pg2.work[0].last, null, '…its minutes’ approval is not an answer on its work — only a stage’s is')
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [CODE_A], /Nothing is waiting/, 'one answer per sending')
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [A.id])
check((await stagesOf(A.id))[0].status, 'accepted', 'Ali accepts: the work goes on as any task’s')
// Begun once: a task under way is never begun again — its dates, its stage and its trail as they are.
const was = [await stagesOf(A.id), (await trail(A.id)).length]
await asSystem()
await q(`SELECT public.mkt_task_begin($1, 'Somebody')`, [A.id])
check([await stagesOf(A.id), (await trail(A.id)).length], was, 'begun once: a task under way is left as it is')

// ── Started before approval: the manager's, once it was sent ──────────────────────────────────────────────────
await as(U.mei, CREATOR)
const C = await create('Story', { template: BRIEF, vals: { Attendees: [S.mei], Points: 'A story' }, pic: PIC }, 'quick',
  { stages: [{ name: 'Shoot', dept: 'VIDEOGRAPHER', who: S.mei, sla: 1, appr: [] }] })
await refuses(`SELECT public.mkt_project_override($1, $2)`, [C.id, 'Kelvin said yes'], /manager/, 'starting before approval is the manager’s')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_project_override($1, $2)`, [C.id, 'Kelvin said yes'], /waiting for the PIC/, 'not sent yet: nothing to start before')
await as(U.mei, CREATOR)
const mC = await minutesOf(C.id)
const sC = await one(`SELECT public.mkt_minutes_send($1, $2)`, [mC.id, mC.rev])
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_project_override($1, $2)`, [C.id, 'ok'], /5 to 300/, 'a reason of 5 to 300 characters')
const ov = await one(`SELECT public.mkt_project_override($1, $2)`, [C.id, 'Kelvin confirmed by phone'])
check([ov.status, ov.override.reason, ov.override.by], ['active', 'Kelvin confirmed by phone', 'SIA'], 'the manager starts it before approval: the work starts at once')
check(await stagesOf(C.id), [{ idx: 0, status: 'accepted', starts_on: TODAY, due_on: (await dates([1]))[0].due_on, entered: true, accepted: true }],
  '…dated from today — the owner’s own first stage, accepted for her')
check((await trail(C.id)).slice(-3).map(e => [e.action, e.actor]), [['started before approval', 'SIA'], ['work started', 'SIA'], ['opened', 'SIA']],
  '…said on the trail')
check((await minutesOf(C.id)).status, 'sent', '…its minutes still the PIC’s to approve: not completed by the override')
await asStranger()
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [sC.link], /Nothing is waiting/, 'started before approval: the link takes no answer — as a product project’s once its work began')
check((await one(`SELECT public.mkt_pic_page($1)`, [sC.link])).status, 'active', '…it shows the work under way')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_project_override($1, $2)`, [C.id, 'again please'], /waiting for the PIC/, 'once')

// ── Both PICs sign off; an edit they see takes an approval back ───────────────────────────────────────────────
await as(U.mei, CREATOR)
const D = await create('Pair', { template: BOTH, vals: { Attendees: [S.mei], Points: 'Two to approve' }, pic: { ...PIC, ...PIC2 } })
const mD = await minutesOf(D.id)
const sD = await one(`SELECT public.mkt_minutes_send($1, $2)`, [mD.id, mD.rev])
check([/^[0-9a-f]{32}$/.test(sD.link2), sD.link2 !== sD.link], [true, true], 'two PICs: each their own link')
await asStranger()
const h1 = await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [sD.link])
check([h1.status, Object.keys(h1.ok ?? {})], ['waiting_pic', ['1']], 'both sign off: Kelvin’s in — the minutes wait for Hana')
check((await stagesOf(D.id))[0].status, 'planned', '…and so does the work')
await as(U.mei, CREATOR)
const mD2 = await minutesOf(D.id)
const fD = await one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [mD2.id, mD2.rev, JSON.stringify({ vals: { Points: 'Two to approve — and a banner' } })])
check([fD.reapproval, fD.status], [true, 'waiting_pic'], 'Mei changes what they see after Kelvin approved: back to both')
check((await trail(D.id)).at(-1).data, { fields: ['Points'], took: [{ pic: 1, name: 'Kelvin Tan' }] }, '…whose approval it took back')
check((await page(D.track)).project.picMinutes.edited, 'Points', 'the task’s page says what sent it back')
await asStranger()
await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Hana Lee', NULL)`, [sD.link2])
check((await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [sD.link])).status, 'active', 'both approve again: the work starts')

// ── A task's PIC is set only when the PIC approves its minutes ────────────────────────────────────────────────
await as(U.mei, CREATOR)
const mN2 = await minutesOf(N.id)
await refuses(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [mN2.id, mN2.rev, JSON.stringify({ pic: 'Kelvin' })], /do not go to the PIC/,
  'a task the PIC does not approve takes no PIC')
const mB = await minutesOf(B.id)
await one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [mB.id, mB.rev, JSON.stringify({ whatsapp: '+60 12-000 1111' })])
check((await proj(B.id)).pic_whatsapp, '+60 12-000 1111', 'a task the PIC approves: its owner changes the WhatsApp')

// ── Its page says where it stands ─────────────────────────────────────────────────────────────────────────────
await as(U.ali, VIEW)
const vB = (await page(B.track)).project.picMinutes
check([vB.status, vB.pic, vB.whatsapp, vB.pic2, vB.whatsapp2, vB.link, vB.sentAt, vB.reply, vB.override, vB.edited],
  ['minutes', 'Kelvin Tan', '+60 12-000 1111', 'Hana Lee', '+60 13-999 8888', null, null, null, null, null], 'a task’s page: where the PIC’s approval stands — not sent yet')
check((await page(N.track)).project.picMinutes, null, '…none on a task the PIC does not approve')
const vA = (await page(A.track)).project.picMinutes
check([vA.status, vA.reply.decision, vA.reply.name, vA.link === CODE_A, vA.override], ['active', 'approved', 'Kelvin Tan', true, null], '…approved')
check((await page(C.track)).project.picMinutes.override.reason, 'Kelvin confirmed by phone', '…started before approval, and why')

// ── A recurring task: its series makes no run while it waits ──────────────────────────────────────────────────
await as(U.mei, CREATOR)
const R = await create('Daily reel', { template: BRIEF, vals: { Attendees: [S.mei], Points: 'Every day' }, pic: PIC }, 'recurring',
  { recur: { freq: 'daily', start: TODAY, endMode: 'count', count: 6 } })
const runCount = () => peek1(`SELECT count(*)::int FROM public.mkt_projects WHERE series_id = $1`, [R.id])
check([R.open, await runCount(), (await proj(R.id)).status], [R.id, 0, 'minutes'], 'a recurring task waiting for the PIC: no run made — it opens on its series')
await asSystem()
await q(`SELECT public.mkt_top_up_due()`)
check(await runCount(), 0, '…nor by the daily top-up')
// It waited three days: its first runs' days went by.
await q(`UPDATE public.mkt_projects SET recur = jsonb_set(recur, '{rule,start}', to_jsonb(($1::date - 3)::text)) WHERE id = $2`, [TODAY, R.id])
await as(U.mei, CREATOR)
const mR = await minutesOf(R.id)
const sR = await one(`SELECT public.mkt_minutes_send($1, $2)`, [mR.id, mR.rev])
await asStranger()
check((await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [sR.link])).status, 'active', 'Kelvin approves: the series runs')
const runs = await peek(`SELECT run_no, track_id, starts_on::text FROM public.mkt_projects WHERE series_id = $1 ORDER BY run_no`, [R.id])
check(runs.map(r => [r.run_no, r.starts_on]), [[1, TODAY], [2, TODAY], [3, TODAY], [4, TODAY], [5, await plus(1)], [6, await plus(2)]],
  '…the runs whose days went by while it waited open today; the rest on their own days')
check((await trail(R.id)).at(-1), { action: 'work started', actor: 'Kelvin Tan (PIC)', stage: null, from_to: null, reason: null, data: { runs: 6 } },
  '…said on the series’ trail')
check((await one(`SELECT public.mkt_pic_page($1)`, [sR.link])).work.map(w => w.title), Array(6).fill('Daily reel'), 'the PIC follows its runs')
await as(U.ali, VIEW)
const vR = (await page(runs[0].track_id)).project.picMinutes
check([vR.status, vR.reply.name], ['active', 'Kelvin Tan'], 'a run’s page: its series’ PIC approval')

// ── The files of the work the PIC follows ──────────────────────────────────────────────────────────────────────
await asSystem()
const KEY = id(555)
await q(`UPDATE public.mkt_stages SET work = jsonb_set(work, '{files}', $2::jsonb) WHERE project_id = $1 AND idx = 0`,
  [A.id, JSON.stringify([{ path: `stage/${KEY}/draft.png`, name: 'draft.png', size: 10, mime: 'image/png', field: null }])])
await asStranger()
check(await one(`SELECT public.mkt_pic_file($1, $2::uuid)`, [CODE_A, KEY]), { path: `stage/${KEY}/draft.png`, name: 'draft.png', mime: 'image/png' },
  'the PIC opens a file of the task’s stage now')
check((await one(`SELECT public.mkt_pic_page($1)`, [CODE_A])).work[0].stage.files.map(f => f.key), [KEY], '…listed on their page')
check(await one(`SELECT public.mkt_pic_file($1, $2::uuid)`, [sC.link, KEY]), null, '…never through another task’s link')

// ── A product project's path as before ─────────────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const intake = await publish('Intake', [...BASE, { name: 'Brief', type: 'Long text', req: true, pic: true }], { sign: false, pic: true, project: true, file: true, lock: false })
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [], form: [] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const draft = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind: 'one' })])
const saved = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [draft.id, JSON.stringify({ name: 'Post pack', intake, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 1, price: 500, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [draft.id, saved.rev])
const productSent = async () => {
  const P = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, draft.id])
  const m = await minutesOf(P.id)
  const f = await one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [m.id, m.rev,
    JSON.stringify({ vals: { Attendees: [S.josiah], Brief: 'A post pack for Raya' }, pic: 'Kelvin Tan', whatsapp: PIC.whatsapp })])
  return { P, s: await one(`SELECT public.mkt_minutes_send($1, $2)`, [m.id, f.rev]) }
}
const { P, s: sP } = await productSent()
check(sP.status, 'waiting_pic', 'a product project’s intake goes to the PIC as before')
await as(U.mei, CREATOR)
await refuses(`SELECT public.mkt_project_resend($1)`, [P.id], /manager/, '…its resending still the manager’s')
await asStranger()
const aP = await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [sP.link])
check([aP.status, aP.kind, aP.work], ['approved', 'product', []], 'approved: a product project waits for its Plan assignments')
check((await trail(P.id)).some(e => e.action === 'work started'), false, '…no work started by the approval')
await as(U.josiah, MANAGER)
const { P: P2 } = await productSent()
const oP = await one(`SELECT public.mkt_project_override($1, $2)`, [P2.id, 'Kelvin confirmed by phone'])
check([oP.status, (await trail(P2.id)).some(e => e.action === 'work started')], ['waiting_pic', false],
  'started before approval: a product project still waits for its Plan assignments — and the PIC still approves')
await one(`SELECT public.mkt_product_begin($1)`, [P2.id])
check((await proj(P2.id)).status, 'active', '…which then starts its work, as before')
// A product whose intake asks no PIC sign-off: complete at once, approved — never sent, whatever a task does.
const noPic = await publish('Intake, no PIC', [...BASE, { name: 'Brief', type: 'Long text', req: true }], { sign: false, pic: false, project: true, file: false, lock: false })
const draft2 = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind: 'one' })])
const saved2 = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [draft2.id, JSON.stringify({ name: 'Quick pack', intake: noPic, price: 300,
  effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 1, price: 300, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [draft2.id, saved2.rev])
const Q = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, draft2.id])
const mQ = await minutesOf(Q.id)
const fQ = await one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [mQ.id, mQ.rev, JSON.stringify({ vals: { Attendees: [S.josiah], Brief: 'Three posts' }, pic: 'Kelvin Tan' })])
const sQ = await one(`SELECT public.mkt_minutes_send($1, $2)`, [mQ.id, fQ.rev])
check([sQ.status, sQ.minutes], ['approved', 'completed'], 'a product project whose minutes ask no PIC sign-off: complete and approved at once, as before')

// ── Never a product project's choice, nor a run's ──────────────────────────────────────────────────────────────
await asSystem()
const RUN1 = await peek1(`SELECT id FROM public.mkt_projects WHERE series_id = $1 AND run_no = 1`, [R.id])
await refuses(`UPDATE public.mkt_projects SET pic_minutes = true WHERE id = $1`, [P.id], /mkt_projects_pic_minutes_check/, 'never a product project’s')
await refuses(`UPDATE public.mkt_projects SET pic_minutes = true WHERE id = $1`, [RUN1], /mkt_projects_pic_minutes_check/,
  '…nor a run’s: its series holds the minutes')

console.log(`marketing task pic: ${checks} checks passed`)
