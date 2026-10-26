// Local PostgreSQL regression for 20261025235000 (2026-10-25 — Marketing ②a-5: the PIC approves a quick task's stage —
// 🔗 PIC via link in New Project's builder; the user's answer 52: both, each chosen on the task). Marketing's migrations up
// to ②a-4 run; then this one, twice. What is under test: who may call what — mkt_task_create one longer, its old signature
// gone; a stage's PIC level — either PIC or both, once a stage, what the PIC reads of it — and the PIC named once, needed by
// a level and refused without one, all before anything is written or numbered; the task's links made at Create; the task's
// page (its PICs and links, a run's its series'); the PIC's page for the task — no minutes they do not approve, its work —
// and their answer on a stage: changes, a newer version, approved, both PICs, never another link's work, never a team
// approver's, never the minutes; the files of its stage; a series' runs — one waiting for the PIC however far back; the
// PIC's calendar; a task whose minutes the PIC approves too — sent, then started before approval or approved, its stage
// on the link the minutes made; a product project's deliverable answered as before, on its own link only.
// No live I/O.
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
await db.exec(await sql('20261025231000_marketing_task_pic.sql'))
const mig = await sql('20261025235000_marketing_task_pic_stage.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks
const asStranger = () => as(null, [], 'anon')

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
const CREATE_FN = 'mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid, jsonb, jsonb)'
check([await may('anon', CREATE_FN), await may('authenticated', CREATE_FN), await may('service_role', CREATE_FN)], [false, true, true],
  'mkt_task_create, one longer: signed in only, as before')
check(await peek1(`SELECT to_regprocedure('public.mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid, jsonb)') IS NULL`), true,
  '…its old signature gone — never two to choose between')
for (const fn of ['mkt_pic_page(text)', 'mkt_pic_stage_answer(text, uuid, integer, text, text, text)', 'mkt_pic_calendar(text)'])
  check([await may('anon', fn), await may('authenticated', fn)], [true, true], `${fn}: still the stranger’s, by its code`)
for (const fn of ['mkt_task_begin(uuid, text)', 'mkt_pic_work(uuid)', 'mkt_pic_stage_file(text, text)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, false], `${fn}: called by other functions only`)

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const CREATOR = ['marketing.view', 'marketing.create', 'marketing.edit']
const PIC = { name: 'Kelvin Tan', whatsapp: '+60 12-345 6789' }
const PIC2 = { name2: 'Hana Lee', whatsapp2: '+60 13-999 8888' }
const st = (name, who, appr = [], more = {}) => ({ name, dept: '', who, sla: 1, appr, form: [], ...more })
const CREATE = `SELECT public.mkt_task_create($1, $2, $3, 'social', NULL, $4::jsonb, $5::jsonb, NULL, $6::jsonb, $7::jsonb)`
const args = (title, { stages, pic = null, minutes = null, kind = 'quick', recur = null, raw } = {}) =>
  [CAR, kind, title, JSON.stringify(stages), recur ? JSON.stringify(recur) : null, minutes ? JSON.stringify(minutes) : null,
    raw !== undefined ? raw : pic ? JSON.stringify(pic) : null]
const create = (title, opts) => one(CREATE, args(title, opts))
const proj = async pid => (await peek(`SELECT status, pic_minutes, pic_name, pic_whatsapp, pic2_name, pic2_whatsapp, link_code AS link,
  link2_code AS link2, cur FROM public.mkt_projects WHERE id = $1`, [pid]))[0]
const stagesOf = pid => peek(`SELECT idx, status, appr, spec, ver, appr_idx, pic_ok FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [pid])
const trail = pid => peek(`SELECT action, actor_name AS actor, stage_idx AS stage, from_to, reason, version, data FROM public.mkt_events
  WHERE project_id = $1 ORDER BY id`, [pid])
const notices = user => peek(`SELECT title, body FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at, id`, [user])
const counts = () => peek1(`SELECT jsonb_build_object('projects', (SELECT count(*) FROM public.mkt_projects),
  'stages', (SELECT count(*) FROM public.mkt_stages), 'events', (SELECT count(*) FROM public.mkt_events))`)
const num = track => Number(track.slice(-3))
const pageOf = async code => {
  await asStranger()
  return one(`SELECT public.mkt_pic_page($1)`, [code])
}
const ANSWER = `SELECT public.mkt_pic_stage_answer($1, $2, $3, $4, $5, $6)`
const answer = async (code, project, ver, decision, name, reason = null) => {
  await asStranger()
  return one(ANSWER, [code, project, ver, decision, name, reason])
}
const noAnswer = async (argv, pattern, what) => {
  await asStranger()
  await refuses(ANSWER, argv, pattern, what)
}
// The stage now worked by its person: accepted, a link added (its fields filled in), submitted.
const work = async (user, pid, vals = {}) => {
  await as(user, STAFF)
  const status = await peek1(`SELECT s.status FROM public.mkt_stages s JOIN public.mkt_projects p ON p.id = s.project_id AND s.idx = p.cur
    WHERE p.id = $1`, [pid])
  if (status === 'todo') await one(`SELECT public.mkt_stage_accept($1)`, [pid])
  await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [pid, JSON.stringify({ notes: 'team-only: the client is fussy',
    links: [{ url: 'https://canva.com/draft-1', label: 'Draft' }], vals })])
  await one(`SELECT public.mkt_stage_submit($1)`, [pid])
}

// ── Refused before anything is written or numbered ─────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const BASE = [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }]
const tpl = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Brief',
  fields: [...BASE, { name: 'Points', type: 'Long text', req: true, pic: true }], rules: { sign: false, pic: false, project: true, file: false, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [tpl.id, tpl.rev])
const MIN = pic => ({ template: tpl.id, vals: { Attendees: [S.mei], Points: 'Raya: one visual, one caption' }, notes: '', sign: false, pic })
const DESIGN = st('Design', S.ali, ['pic'], { picText: 'Check the logo size' })
const CAPTION = st('Caption', S.mei)
const plain = await create('Plain one', { stages: [CAPTION] })
const n0 = await counts()
const bad = (opts, pattern, what) => refuses(CREATE, args('Refused', opts), pattern, `refused: ${what}`)
await bad({ stages: [DESIGN, CAPTION] }, /Name the PIC who approves on the link/, 'a stage the PIC approves, nobody named')
await bad({ stages: [CAPTION], pic: PIC }, /No stage asks the PIC — leave the PIC out/, 'the PIC named, nothing of theirs to approve')
await bad({ stages: [st('Design', S.ali, ['pic', 'pic'])], pic: PIC }, /Stage 1: the PIC twice/, 'the PIC twice on a stage')
await bad({ stages: [st('Design', S.ali, ['pic', S.josiah, 'pic:all'])], pic: PIC }, /Stage 1: the PIC twice/, '…either and both')
await bad({ stages: [DESIGN], raw: '"Kelvin Tan"' }, /Name the PIC, or leave the PIC out/, 'a PIC that is not a form')
await bad({ stages: [DESIGN], pic: { name: 'Kelvin Tan', whatsapp: '12345' } }, /Add the PIC's WhatsApp/, 'a WhatsApp too short — the link goes to it')
await bad({ stages: [DESIGN], pic: { name: '  ', whatsapp: PIC.whatsapp } }, /Name the PIC \(at most 80/, 'a PIC with no name')
await bad({ stages: [DESIGN], pic: { ...PIC, name2: 'Hana Lee' } }, /Add the second PIC's WhatsApp/, 'a second PIC without theirs')
await bad({ stages: [st('Design', S.ali, ['pic'], { picText: 'x'.repeat(121) })], pic: PIC }, /Stage 1: what the PIC reads — at most 120/,
  'what the PIC reads, past 120')
await bad({ stages: [st('Design', S.ali, ['pic', S.josiah, S.mei, S.ali])], pic: PIC }, /Stage 1: at most 3 approvals/, 'four levels, the PIC one')
await bad({ stages: [st('Design', S.ali, ['PIC'])], pic: PIC }, /an approver is not on Marketing/, 'a level is the PIC by its own word, or somebody on the team')
await bad({ stages: [DESIGN], minutes: MIN(PIC), pic: PIC }, /Name the PIC once — with the minutes they approve/, 'the PIC named twice')
await bad({ stages: [CAPTION], minutes: MIN('Kelvin Tan') }, /Name the PIC, or leave the PIC out/, 'the minutes’ PIC that is not a form')
check(await counts(), n0, 'nothing written')

// ── A quick task with a stage the PIC approves ─────────────────────────────────────────────────────────────────
const A = await create('Raya visual', { stages: [DESIGN, st('Caption', S.mei, [S.josiah], { picText: 'not theirs' })], pic: PIC })
check(num(A.track), num(plain.track) + 1, '…and nothing numbered: the next task takes the next number')
const pA = await proj(A.id)
check([pA.status, pA.pic_minutes, pA.pic_name, pA.pic_whatsapp, pA.pic2_name, /^[0-9a-f]{32}$/.test(pA.link ?? ''), pA.link2],
  ['active', false, 'Kelvin Tan', '+60 12-345 6789', null, true, null], 'under way at once — its PIC kept, their link made at Create, no second PIC')
check((await stagesOf(A.id)).map(s => [s.idx, s.status, s.appr, s.spec.picText ?? null]),
  [[0, 'todo', [{ kind: 'pic' }], 'Check the logo size'], [1, 'planned', [{ kind: 'person', staff: S.josiah }], null]],
  '🔗 the PIC on stage 1 with what they read; a stage they do not approve keeps no words for them')
const createdA = (await trail(A.id)).find(e => e.action === 'created')
check([createdA.data.picStages, 'pic' in createdA.data], [{ n: 1, pic: 'Kelvin Tan' }, false], 'the trail: one stage for Kelvin to approve — no minutes of theirs')

const B = await create('Both look', { stages: [st('Design', S.ali, ['pic:all'])], pic: { ...PIC, ...PIC2 } })
const pB = await proj(B.id)
check([(await stagesOf(B.id))[0].appr, pB.pic2_name, /^[0-9a-f]{32}$/.test(pB.link2 ?? ''), pB.link !== pB.link2],
  [[{ kind: 'pic', all: true }], 'Hana Lee', true, true], 'both PICs on a stage: two PICs named, each their own link')
const C = await create('One look', { stages: [st('Design', S.ali, ['pic:all'])], pic: PIC })
const pC = await proj(C.id)
check((await stagesOf(C.id))[0].appr, [{ kind: 'pic' }], '…both asked with one PIC named: that one’s approval')

// ── The task's page ───────────────────────────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
let tp = await one(`SELECT public.mkt_project($1)`, [A.id])
check([tp.project.pic, tp.project.pic2, tp.project.picMinutes, tp.project.picLink],
  ['Kelvin Tan', null, null, { pic: 'Kelvin Tan', whatsapp: '+60 12-345 6789', pic2: null, whatsapp2: null, link: pA.link, link2: null }],
  'its PIC and their link on the task’s page')
check((await one(`SELECT public.mkt_project($1)`, [plain.id])).project.picLink, null, 'a task nobody outside approves: no link')

// ── The PIC's page for the task ───────────────────────────────────────────────────────────────────────────────
let pg = await pageOf(pA.link)
check([pg.kind, pg.title, pg.status, pg.pic, pg.minutes, pg.sentAt], ['quick', 'Raya visual', 'active', 'Kelvin Tan', null, null],
  'the task’s link: its PIC, no minutes of theirs')
check(pg.work.map(w => [w.id, w.title, w.stages, w.done, w.stage.name, w.stage.status, w.stage.waiting, w.stage.note]),
  [[A.id, 'Raya visual', 2, 0, 'Design', 'todo', false, 'Check the logo size']], 'its work: the task itself, its stage now — not waiting for them yet')

// ── Worked, submitted to the PIC, answered ──────────────────────────────────────────────────────────────────
await work(U.ali, A.id)
pg = await pageOf(pA.link)
check([pg.work[0].stage.status, pg.work[0].stage.waiting, pg.work[0].stage.ver, pg.work[0].stage.links],
  ['review', true, 1, [{ url: 'https://canva.com/draft-1', label: 'Draft' }]], 'submitted: waiting for Kelvin, version 1, its links')
check(JSON.stringify(pg).includes('fussy'), false, 'never the team’s notes')
await as(U.josiah, MANAGER)
await refuses(`SELECT public.mkt_stage_decide($1, true)`, [A.id], /not yours/, 'the PIC’s level is never a team approver’s')
await noAnswer([pA.link, A.id, 2, 'approve', 'Kelvin Tan', null], /newer version/, 'only the version they read')
await noAnswer([pB.link, A.id, 1, 'approve', 'Kelvin Tan', null], /Nothing is waiting/, 'another task’s link answers nothing of this one')
await noAnswer([pA.link, A.id, 1, 'approve', 'Ke', null], /full name/, 'approving asks a full name')
await asStranger()
await refuses(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [pA.link], /This link is closed/, 'no minutes on it to answer')

pg = await answer(pA.link, A.id, 1, 'changes', null, 'Make the logo bigger')
let sA = await stagesOf(A.id)
check([sA[0].status, sA[0].ver, (await proj(A.id)).cur], ['changes', 1, 0], 'changes: back to Ali on the same stage')
check((await notices(U.ali)).at(-1), { title: 'Changes requested on Design', body: '"Make the logo bigger"' }, 'Ali is told what to change')
check((await notices(U.josiah)).at(-1), { title: 'Kelvin Tan (PIC) asked for changes on Design', body: `${A.track} · Raya visual` },
  '…and the task’s owner')
check([pg.work[0].stage.waiting, pg.work[0].last.action, pg.work[0].last.reason], [false, 'pic changes', 'Make the logo bigger'],
  'their page: the team is on it, their words kept')
await work(U.ali, A.id)
pg = await answer(pA.link, A.id, 2, 'approve', 'Kelvin Tan')
sA = await stagesOf(A.id)
check([sA[0].status, sA[1].status, (await proj(A.id)).cur], ['done', 'todo', 1], 'approved, version 2: Design done, Caption Mei’s now')
check((await trail(A.id)).filter(e => e.action === 'pic approved').map(e => [e.actor, e.stage, e.version]), [['Kelvin Tan (PIC)', 0, 'v2']],
  'the trail: Kelvin approved v2 on the link')
check([(await notices(U.ali)).at(-1).title, (await notices(U.josiah)).at(-1).title, (await notices(U.mei)).at(-1).title],
  ['Kelvin Tan (PIC) approved Design', 'Kelvin Tan (PIC) approved Design', 'Your turn: Caption'], 'Ali and the owner told; Mei’s turn')
check([pg.work[0].stage.name, pg.work[0].stage.waiting, pg.work[0].last.action, pg.work[0].last.version], ['Caption', false, 'pic approved', 'v2'],
  'their page: the next stage — not theirs — and their approval kept')

// ── Both PICs on a stage ──────────────────────────────────────────────────────────────────────────────────────
await work(U.ali, B.id)
await answer(pB.link, B.id, 1, 'approve', 'Kelvin Tan')
const sB = await stagesOf(B.id)
check([sB[0].status, sB[0].pic_ok?.['1']?.name], ['review', 'Kelvin Tan'], 'both PICs asked: Kelvin’s approval kept — it waits for Hana')
check((await notices(U.ali)).at(-1).title, 'Kelvin Tan (PIC) approved Design — waiting for Hana Lee', 'Ali is told it waits for Hana')
await noAnswer([pB.link, B.id, 1, 'approve', 'Kelvin Tan', null], /approved this version already — it waits for Hana Lee/, 'once each')
const pgB2 = await pageOf(pB.link2)
check([pgB2.you, pgB2.pic, pgB2.work[0].stage.waiting, pgB2.work[0].stage.both], [2, 'Hana Lee', true, true], 'Hana’s own link: it waits for her')
await answer(pB.link2, B.id, 1, 'approve', 'Hana Lee')
check([(await stagesOf(B.id))[0].status, (await proj(B.id)).status], ['done', 'done'], 'Hana approves too: the stage done — the task with it')

// ── The files of its stage now, on its link ──────────────────────────────────────────────────────────────────
const KEY = id(7001)
await asSystem()
await q(`UPDATE public.mkt_stages SET work = jsonb_build_object('notes', '', 'links', '[]'::jsonb, 'vals', '{}'::jsonb,
  'files', jsonb_build_array(jsonb_build_object('path', 'stage/' || $2 || '/brief.pdf', 'name', 'brief.pdf', 'size', 12, 'mime', 'application/pdf')))
  WHERE project_id = $1 AND idx = 1`, [A.id, KEY])
check(await peek1(`SELECT public.mkt_pic_stage_file($1, $2) ->> 'name'`, [pA.link, KEY]), 'brief.pdf', 'a file of the task’s stage now, on its link')
check(await peek1(`SELECT public.mkt_pic_stage_file($1, $2)`, [pC.link, KEY]), null, '…never on another task’s')

// ── The PIC's calendar: a task with a link is theirs as a product project is ──────────────────────────────────
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [CAR, JSON.stringify({ pic: 'Kelvin Tan', whatsapp: '012-345 6789' })])
const CAL = await one(`SELECT public.mkt_sub_cal_link($1, 1, false)`, [CAR])
await work(U.ali, C.id)
await asStranger()
const calv = await one(`SELECT public.mkt_pic_calendar($1)`, [CAL])
check(calv.approvals.filter(a => a.title === 'One look').map(a => [a.stage, a.code, a.waiting]), [['Design', pC.link, true]],
  'a task’s stage waiting for them, on its own link')
check([calv.approvals.some(a => a.title === 'Raya visual'), calv.approvals.some(a => a.title === 'Both look')], [false, false],
  '…never a stage they approved, one not theirs, a task done')

// ── A series whose stage the PIC approves ────────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const DAILY = { freq: 'daily', start: TODAY, endMode: 'count', count: 30 }
const R = await create('Daily story', { kind: 'recurring', stages: [st('Story', S.ali, ['pic'], { picText: 'Today’s story' })], pic: { ...PIC, ...PIC2 },
  recur: DAILY })
const pR = await proj(R.id)
const runs = await peek(`SELECT id::text AS id, run_no FROM public.mkt_projects WHERE series_id = $1 ORDER BY run_no`, [R.id])
const RUN1 = runs[0].id
const sR1 = (await stagesOf(RUN1))[0]
check([/^[0-9a-f]{32}$/.test(pR.link ?? ''), runs.length, sR1.appr, sR1.spec.picText], [true, 30, [{ kind: 'pic' }], 'Today’s story'],
  'a series: its link made, every run’s stage the PIC’s, with its words')
check((await trail(R.id)).find(e => e.action === 'created').data.picStages, { n: 1, pic: 'Kelvin Tan' }, '…its trail saying so')
await as(U.mei, STAFF)
tp = await one(`SELECT public.mkt_project($1)`, [RUN1])
check([tp.project.pic, tp.project.pic2, tp.project.picLink?.link], ['Kelvin Tan', 'Hana Lee', pR.link], 'a run’s PICs and link: its series’')
await work(U.ali, RUN1)
const pgR = await pageOf(pR.link)
check([pgR.kind, pgR.minutes, pgR.work.find(w => w.id === RUN1)?.stage.waiting], ['recurring', null, true], 'the series’ link: run 1 waits for Kelvin')
await asStranger()
check((await one(`SELECT public.mkt_pic_calendar($1)`, [CAL])).approvals.filter(a => a.title === 'Daily story' && a.waiting).map(a => a.code),
  [pR.link], 'the PIC’s calendar: the run waiting for them, on its series’ link')
// Every other run brought into the two weeks ahead — twenty newer than run 1: it stays on the link while it waits.
await asSystem()
await q(`UPDATE public.mkt_projects SET starts_on = $2::date WHERE series_id = $1 AND run_no > 1`, [R.id, TODAY])
const followed = async sid => (await peek(`SELECT w::text AS w FROM public.mkt_pic_work($1) w`, [sid])).map(r => r.w)
let fl = await followed(R.id)
check([fl.length, fl.includes(RUN1)], [21, true], 'the latest twenty — and run 1, waiting for the PIC however far back')
await answer(pR.link, RUN1, 1, 'approve', 'Kelvin Tan')
fl = await followed(R.id)
check([(await proj(RUN1)).status, fl.length, fl.includes(RUN1)], ['done', 20, false], 'approved on the series’ link: run 1 done — and off it')
// A run waiting for a team approver is no more the PIC's than before.
await as(U.josiah, MANAGER)
const R2 = await create('Daily check', { kind: 'recurring', stages: [st('Check', S.ali, [S.josiah])], recur: DAILY })
const R2RUN1 = await peek1(`SELECT id::text FROM public.mkt_projects WHERE series_id = $1 AND run_no = 1`, [R2.id])
await work(U.ali, R2RUN1)
await asSystem()
await q(`UPDATE public.mkt_projects SET starts_on = $2::date WHERE series_id = $1 AND run_no > 1`, [R2.id, TODAY])
check((await followed(R2.id)).includes(R2RUN1), false, '…a run waiting for a team approver: the latest twenty only')

// ── Its minutes the PIC's too ─────────────────────────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const G = await create('Override look', { stages: [st('Design', S.ali, ['pic'])], minutes: MIN(PIC) })
check([(await proj(G.id)).status, (await proj(G.id)).link], ['minutes', null], 'its minutes the PIC’s too: it waits, no link yet — the minutes bring it')
const mG = (await peek(`SELECT id, rev FROM public.mkt_minutes WHERE project_id = $1`, [G.id]))[0]
const sentG = await one(`SELECT public.mkt_minutes_send($1, $2)`, [mG.id, mG.rev])
await one(`SELECT public.mkt_project_override($1, $2)`, [G.id, 'The client agreed on the phone'])
const pG = await proj(G.id)
check([pG.status, pG.link], ['active', sentG.link], 'started before approval: under way — on the link the minutes made')
await work(U.ali, G.id)
pg = await pageOf(pG.link)
check([pg.minutes?.title, pg.work[0].stage.waiting], ['Brief', true], '…its minutes on the link (theirs), its stage waiting for them')
await answer(pG.link, G.id, 1, 'approve', 'Kelvin Tan')
check((await proj(G.id)).status, 'done', 'its stage approved on the link — the start before approval never answers for the PIC')

await as(U.josiah, MANAGER)
const H = await create('Sent look', { stages: [st('Design', S.ali, ['pic'])], minutes: MIN(PIC) })
const mH = (await peek(`SELECT id, rev FROM public.mkt_minutes WHERE project_id = $1`, [H.id]))[0]
const sentH = await one(`SELECT public.mkt_minutes_send($1, $2)`, [mH.id, mH.rev])
await asStranger()
await one(`SELECT public.mkt_pic_answer($1, 'approve', 'Kelvin Tan', NULL)`, [sentH.link])
const pH = await proj(H.id)
check([pH.status, pH.link], ['active', sentH.link], 'sent and approved: the work started — on the link the minutes made')
await as(U.mei, STAFF)
check((await one(`SELECT public.mkt_project($1)`, [H.id])).project.picLink, null, 'its links are on its minutes’ card — never twice')
await work(U.ali, H.id)
await answer(sentH.link, H.id, 1, 'approve', 'Kelvin Tan')
check((await proj(H.id)).status, 'done', '…and its stage approved on the same link')

// ── A product project's deliverable, as before — on its own link only ─────────────────────────────────────────
await as(U.josiah, MANAGER)
const kick = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Kickoff', fields: BASE,
  rules: { sign: false, pic: true, project: true, file: true, lock: false } })])
await one(`SELECT public.mkt_minutes_publish($1, $2)`, [kick.id, kick.rev])
const wf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Image post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'pic' }], form: [{ label: 'Final image', type: 'Text' }] }] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [wf.id, wf.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, '{"kind":"one"}'::jsonb)`)
const ps = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Post pack', intake: kick.id, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Graphic design', items: [{ name: 'Image post', qty: 1, price: 500, workflow: wf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, ps.rev])
const P = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])).id
const P2 = (await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])).id
const CODE_P = 'a'.repeat(32), CODE_P2 = 'b'.repeat(32)
await asSystem()
await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2, pic_name = 'Kelvin' WHERE id = $1`, [P, CODE_P])
await q(`UPDATE public.mkt_projects SET status = 'approved', link_code = $2, pic_name = 'Kelvin' WHERE id = $1`, [P2, CODE_P2])
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_product_begin($1)`, [P])
await one(`SELECT public.mkt_product_begin($1)`, [P2])
const D = await peek1(`SELECT id FROM public.mkt_projects WHERE parent_id = $1`, [P])
const D2 = await peek1(`SELECT id FROM public.mkt_projects WHERE parent_id = $1`, [P2])
const plan = JSON.stringify({ start: TODAY, stages: [{ owner: S.ali, appr: [{ kind: 'pic' }], sla: 2 }] })
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D, plan])
await one(`SELECT public.mkt_deliverable_plan($1, $2::jsonb)`, [D2, plan])
await work(U.ali, D, { 'Final image': 'https://canva.com/final-1' })
await work(U.ali, D2, { 'Final image': 'https://canva.com/final-2' })
await noAnswer([CODE_P, D2, 1, 'approve', 'Kelvin Tan', null], /Nothing is waiting/, 'a product project’s link answers its own deliverables only')
await noAnswer([pA.link, D, 1, 'approve', 'Kelvin Tan', null], /Nothing is waiting/, '…a task’s link none of them')
await answer(CODE_P, D, 1, 'approve', 'Kelvin Tan')
check([(await proj(D)).status, (await proj(D2)).status], ['done', 'active'], 'a deliverable approved on its product’s link, as before — the other waits')
pg = await pageOf(CODE_P)
check([pg.kind, pg.minutes?.title, pg.work.map(w => w.id)], ['product', 'Kickoff', [D]], 'the product project’s page: its minutes, its own deliverable')

// ── The app's call from before, by name: still taken ─────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const old = await one(`SELECT public.mkt_task_create(p_subsidiary => $1, p_kind => 'quick', p_title => 'Named call', p_q_type => 'social',
  p_brief => 'x', p_stages => $2::jsonb, p_recur => NULL, p_source => NULL, p_minutes => NULL)`, [CAR, JSON.stringify([CAPTION])])
check([(await proj(old.id)).status, (await proj(old.id)).link], ['active', null], 'a call without p_pic, by name, as the app’s before it: taken')

console.log(`marketing task pic stage: ${checks} checks passed`)
