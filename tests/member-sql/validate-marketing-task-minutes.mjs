// Local PostgreSQL regression for 20261025221000 (2026-10-25 — Marketing ②a-3: a quick or recurring task written with
// meeting minutes on New Project; the user's answers 52–55). Marketing's migrations up to New Project's drafts run; then this
// one, twice. What is under test: who may call what; the templates New Project picks (published, at their last version,
// Marketing · Create); a task made with its minutes — its intake, nothing written beside them, whoever starts it signing,
// complete at once or with the last signature (locked as the template says), the trail; refused before anything is written
// or numbered (a template not published or not there, a field not on it, a required one empty, somebody off the team, a
// value of the wrong kind, notes too long, a period backwards); a campaign period kept in the minutes, never a campaign; a
// recurring task's on its series, read by every run; written after by the task's owner or a manager — never somebody else,
// never once locked — a product project's still the manager's and never completed by a signature; an old call as before.
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
const mig = await sql('20261025221000_marketing_task_minutes.sql')
await asSystem()
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_task_create(uuid, text, text, text, text, jsonb, jsonb, uuid, jsonb)', 'mkt_minutes_picker()'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only`)
check(await peek1(`SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'mkt_task_create'`), 1,
  'one mkt_task_create — made again with its minutes, never a second beside the old')

const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const plus = n => peek1(`SELECT (($1::date + $2::integer))::text`, [TODAY, n])
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
const CREATOR = ['marketing.view', 'marketing.create', 'marketing.edit']
const STAGES = [{ name: 'Design', dept: 'GRAPHIC DESIGNER', who: S.ali, sla: 1, appr: [] }]

// The manager's templates: a kickoff every attendee signs and that locks; a quick brief nobody signs; a campaign's.
await as(U.josiah, MANAGER)
const BASE = [{ name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true }]
const publish = async (name, fields, rules) => {
  const t = await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name, fields, rules })])
  await one(`SELECT public.mkt_minutes_publish($1, $2)`, [t.id, t.rev])
  return t.id
}
const KICKOFF = await publish('Kickoff', [...BASE, { name: 'Agenda', type: 'Long text', req: true, pic: true }, { name: 'Budget', type: 'Number' },
  { name: 'Signatures', type: 'Signature' }], { sign: true, pic: false, project: true, file: true, lock: true })
const BRIEF = await publish('Quick brief', [...BASE, { name: 'Points', type: 'Long text', req: true }],
  { sign: false, pic: false, project: true, file: false, lock: false })
const RUN = await publish('Truck event', [...BASE, { name: 'Campaign period', type: 'Campaign period', req: true, pic: true }],
  { sign: false, pic: false, project: true, file: false, lock: false })
const DRAFT_ONLY = (await one(`SELECT public.mkt_minutes_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ name: 'Not yet', fields: BASE, rules: {} })])).id

// ── New Project's templates ──────────────────────────────────────────────────────────────────────────────
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_minutes_picker()`, [], /not open to your account/, 'the picker is New Project’s: Marketing · Create')
await as(U.mei, CREATOR)
const picks = await one(`SELECT public.mkt_minutes_picker()`)
check(picks.map(p => p.name), ['Kickoff', 'Quick brief', 'Truck event'], 'the templates published, by name — never one only drafted')
check([picks[0].id, picks[0].version, picks[0].fields.map(f => f.name), picks[0].rules.sign], [KICKOFF, 1, ['Project', 'Attendees', 'Agenda', 'Budget', 'Signatures'], true],
  '…each at its last version: its fields and its rules')

// ── A quick task with its minutes ─────────────────────────────────────────────────────────────────────────
const create = (title, minutes, kind = 'quick', extra = {}) => one(
  `SELECT public.mkt_task_create($1, $2, $3, 'social', $4, $5::jsonb, $6::jsonb, NULL, $7::jsonb)`,
  [CAR, kind, title, extra.brief ?? 'Written beside them', JSON.stringify(STAGES), extra.recur ? JSON.stringify(extra.recur) : null,
    minutes ? JSON.stringify(minutes) : null])
const minutesOf = pid => peek(`SELECT template_id, template_version, intake, title, vals, signed ? $2 AS mei_signed, notes, status, locked,
  completed_at IS NOT NULL AS completed FROM public.mkt_minutes WHERE project_id = $1`, [pid, S.mei])
const trail = pid => peek(`SELECT action, reason, data FROM public.mkt_events WHERE project_id = $1 ORDER BY id`, [pid])
const counts = () => peek1(`SELECT jsonb_build_object('projects', (SELECT count(*) FROM public.mkt_projects),
  'minutes', (SELECT count(*) FROM public.mkt_minutes), 'events', (SELECT count(*) FROM public.mkt_events))`)
const num = track => Number(track.slice(-3))

const A = await create('Raya push', { template: KICKOFF, vals: { Attendees: [S.mei, S.ali], Agenda: 'Raya visuals, budget', Budget: '1500' },
  notes: 'Ali to send drafts', sign: true })
const [mA] = await minutesOf(A.id)
check({ ...mA, completed: mA.completed },
  { template_id: KICKOFF, template_version: 1, intake: true, title: 'Kickoff', vals: { Attendees: [S.mei, S.ali], Agenda: 'Raya visuals, budget', Budget: '1500' },
    mei_signed: true, notes: 'Ali to send drafts', status: 'draft', locked: false, completed: false },
  'the task keeps its minutes as its intake — whoever started it signed; Ali still to sign, so not complete yet')
check(await peek1(`SELECT brief FROM public.mkt_projects WHERE id = $1`, [A.id]), null, 'nothing written beside the minutes: they are its requirements')
check((await trail(A.id)).map(e => [e.action, e.reason, e.data?.minutes ?? null]).slice(0, 2),
  [['created', null, 'Kickoff'], ['signed', 'Kickoff', null]], 'the trail: created with its minutes named, then Mei’s signature')
check((await trail(A.id)).some(e => e.action === 'minutes completed'), false, '…not completed while Ali has not signed')
check(await peek1(`SELECT status FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [A.id]), 'todo', 'the work starts at once')

// The task's page reads them.
const page = key => one(`SELECT public.mkt_project($1)`, [key])
const pA = await page(A.track)
check([pA.minutes.title, pA.minutes.status, pA.minutes.template.name, pA.minutes.template.version, pA.minutes.template.rules.sign,
  pA.minutes.template.fields.length, pA.minutes.vals.Agenda, Object.keys(pA.minutes.signed), pA.minutes.project],
  ['Kickoff', 'draft', 'Kickoff', 1, true, 5, 'Raya visuals, budget', [S.mei], A.id], 'its page: the minutes, their template, who signed')

// The last signature completes them.
await as(U.ali, STAFF)
const signed = await one(`SELECT public.mkt_minutes_sign($1)`, [pA.minutes.id])
check(signed.minutes, 'completed', 'Ali signs: the last signature completes them')
const [mA2] = await minutesOf(A.id)
check([mA2.status, mA2.locked, mA2.completed], ['completed', true, true], '…locked, as the template says')
check((await trail(A.id)).slice(-2).map(e => [e.action, e.reason]), [['signed', 'Kickoff'], ['minutes completed', 'Kickoff']], '…said on the trail')
await refuses(`SELECT public.mkt_minutes_sign($1)`, [pA.minutes.id], /complete/, 'complete: nobody signs again')

// ── Refused before anything is written or numbered ───────────────────────────────────────────────────────────
await as(U.mei, CREATOR)
const before = await counts()
const nextTrack = num(A.track) + 1
for (const [what, minutes, pattern] of [
  ['a template not published', { template: DRAFT_ONLY, vals: {} }, /not published/],
  ['a template that is not there', { template: id(999), vals: {} }, /not published/],
  ['no template', { vals: {} }, /Pick the meeting minutes/],
  ['a field not on it', { template: BRIEF, vals: { Points: 'x', Nope: 'y' } }, /"Nope" is not on these minutes/],
  ['a required field empty', { template: BRIEF, vals: { Attendees: [S.mei] } }, /Still to fill in: Points/],
  ['…or only spaces', { template: BRIEF, vals: { Attendees: [S.mei], Points: '   ' } }, /Still to fill in: Points/],
  ['the attendees empty', { template: BRIEF, vals: { Points: 'x' } }, /Still to fill in: Attendees/],
  ['somebody not on the team', { template: BRIEF, vals: { Attendees: [id(77)], Points: 'x' } }, /not on the team/],
  ['a number that is not one', { template: KICKOFF, vals: { Attendees: [S.mei], Agenda: 'x', Budget: 'lots' } }, /a number/],
  ['answers that are not a set', { template: BRIEF, vals: ['x'] }, /Not a set of answers/],
  ['notes too long', { template: BRIEF, vals: { Attendees: [S.mei], Points: 'x' }, notes: 'n'.repeat(4001) }, /at most 4000/],
  ['a period ending before it starts', { template: RUN, vals: { Attendees: [S.mei], 'Campaign period': { from: '2026-12-10', to: '2026-12-01' } } }, /ends on or after its start/],
]) await refuses(`SELECT public.mkt_task_create($1, 'quick', 'Refused', 'social', NULL, $2::jsonb, NULL, NULL, $3::jsonb)`,
  [CAR, JSON.stringify(STAGES), JSON.stringify(minutes)], pattern, `refused: ${what}`)
await refuses(`SELECT public.mkt_task_create($1, 'quick', 'Refused', 'social', NULL, $2::jsonb, NULL, NULL, '"minutes"'::jsonb)`,
  [CAR, JSON.stringify(STAGES)], /Pick the meeting minutes/, 'refused: minutes that are not a form')
check(await counts(), before, '…nothing written by any of them')
const B = await create('Banner', { template: BRIEF, vals: { Attendees: [S.mei], Points: 'New price on the banner' } })
check(num(B.track), nextTrack, '…and nothing numbered: the next task takes the next number')

// ── Nobody signs: complete at once — locked only when the template says ───────────────────────────────────────
const [mB] = await minutesOf(B.id)
check([mB.status, mB.completed, mB.locked, mB.mei_signed], ['completed', true, false, false], 'no signatures asked: complete at once, not locked')
check((await trail(B.id)).map(e => e.action).slice(0, 2), ['created', 'minutes completed'], '…said on the trail')
// Complete at once and the template locks them: locked at once.
await as(U.josiah, MANAGER)
const LOCKING = await publish('Locked brief', [...BASE, { name: 'Points', type: 'Long text', req: true }],
  { sign: false, pic: false, project: true, file: false, lock: true })
await as(U.mei, CREATOR)
const L = await create('Locked', { template: LOCKING, vals: { Attendees: [S.mei], Points: 'Fixed' } })
const [mL] = await minutesOf(L.id)
check([mL.status, mL.locked], ['completed', true], 'complete at once — locked at once, as the template says')
// Three to sign: the second signature completes nothing; the third does.
const T = await create('Three sign', { template: KICKOFF, vals: { Attendees: [S.mei, S.ali, S.josiah], Agenda: 'x' }, sign: true })
const mT = (await page(T.track)).minutes
await as(U.ali, STAFF)
check((await one(`SELECT public.mkt_minutes_sign($1)`, [mT.id])).minutes, 'draft', 'two of three signed: not complete yet')
await as(U.josiah, MANAGER)
check((await one(`SELECT public.mkt_minutes_sign($1)`, [mT.id])).minutes, 'completed', '…the third completes them')
await as(U.mei, CREATOR)
// Asked to sign where the minutes take no signatures, or by somebody who did not attend: no signature.
const C = await create('No sign', { template: KICKOFF, vals: { Attendees: [S.ali], Agenda: 'x' }, sign: true })
const [mC] = await minutesOf(C.id)
check([mC.mei_signed, mC.status], [false, 'draft'], 'Mei did not attend: her “sign” signs nothing, Ali’s is awaited')
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_minutes_sign($1)`, [(await page(C.track)).minutes.id], /Only those who attended sign/, '…nor may she sign them later')

// ── A campaign period: kept in the minutes — a campaign is a product project (answer 13) ─────────────────────────
await as(U.mei, CREATOR)
const from = await plus(3), to = await plus(10)
const D = await create('Truck day', { template: RUN, vals: { Attendees: [S.mei], 'Campaign period': { from, to } } })
check([(await minutesOf(D.id))[0].vals['Campaign period'], await peek1(`SELECT campaign_from FROM public.mkt_projects WHERE id = $1`, [D.id])],
  [{ from, to }, null], 'a campaign period in a task’s minutes stays in them: the task runs no campaign')
check((await trail(D.id)).some(e => e.action === 'campaign period'), false, '…and the trail says none')

// ── A recurring task: written once, on its series; every run reads them ─────────────────────────────────────
const R = await create('Weekly reel', { template: BRIEF, vals: { Attendees: [S.mei], Points: 'Every Monday, a reel' } }, 'recurring',
  { recur: { freq: 'daily', start: TODAY, endMode: 'count', count: 3 } })
const runs = await peek(`SELECT id, track_id, brief FROM public.mkt_projects WHERE series_id = $1 ORDER BY run_no`, [R.id])
check([(await minutesOf(R.id)).length, runs.length, runs.every(r => r.brief === null)], [1, 3, true], 'the series keeps the minutes, its runs nothing written')
check(await peek1(`SELECT count(*)::int FROM public.mkt_minutes WHERE project_id = ANY ($1::uuid[])`, [runs.map(r => r.id)]), 0, '…no run a copy of its own')
const pRun = await page(runs[1].track_id)
check([pRun.minutes.project, pRun.minutes.vals.Points], [R.id, 'Every Monday, a reel'], 'a run’s page reads its series’ minutes')

// ── Written after: the task's owner, or a manager — a product project's stay the manager's ──────────────────────
const fill = (m, rev, patch) => one(`SELECT public.mkt_minutes_fill($1, $2, $3::jsonb)`, [m, rev, JSON.stringify(patch)])
const mBp = (await page(B.track)).minutes
await as(U.mei, STAFF)
check((await fill(mBp.id, mBp.rev, { vals: { Points: 'New price, both banners' } })).rev, mBp.rev + 1, 'the task’s owner writes its minutes (Marketing · Edit)')
await as(U.ali, STAFF)
await refuses(`SELECT public.mkt_minutes_fill($1, $2, '{"vals": {"Points": "Mine"}}'::jsonb)`, [mBp.id, mBp.rev + 1], /manager's/,
  'somebody else on the team does not')
await as(U.mei, VIEW)
await refuses(`SELECT public.mkt_minutes_fill($1, $2, '{"vals": {"Points": "x"}}'::jsonb)`, [mBp.id, mBp.rev + 1], /manager's/, '…nor the owner with View alone')
await as(U.josiah, MANAGER)
check((await fill(mBp.id, mBp.rev + 1, { notes: 'Checked' })).rev, mBp.rev + 2, 'a manager does')
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_minutes_fill($1, $2, '{"vals": {"Agenda": "x"}}'::jsonb)`, [pA.minutes.id, pA.minutes.rev + 1], /locked/,
  'locked once complete, as the template says: the owner writes nothing more')
// A campaign period moved after: kept in the minutes, still no campaign (a product project's intake moves its run).
const mDp = (await page(D.track)).minutes
const to2 = await plus(12)
await fill(mDp.id, mDp.rev, { vals: { 'Campaign period': { from, to: to2 } } })
check([(await minutesOf(D.id))[0].vals['Campaign period'].to, await peek1(`SELECT campaign_from FROM public.mkt_projects WHERE id = $1`, [D.id])],
  [to2, null], 'its period moved in its minutes: still no campaign, nothing refused')

// A product project's minutes: still the manager's; never completed by a signature.
await as(U.josiah, MANAGER)
const prodWf = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Post', tname: 'Standard', stages: [
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'assign' }, sla: 1, appr: [], form: [] }] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [prodWf.id, prodWf.rev])
const prod = await one(`SELECT public.mkt_product_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ kind: 'one' })])
const prodSaved = await one(`SELECT public.mkt_product_save($1, 1, $2::jsonb)`, [prod.id, JSON.stringify({ name: 'Social pack', intake: KICKOFF, price: 500,
  effectiveFrom: TODAY, groups: [{ name: 'Posts', items: [{ name: 'Post', qty: 1, price: 500, workflow: prodWf.id }] }] })])
await one(`SELECT public.mkt_product_publish($1, $2)`, [prod.id, prodSaved.rev])
const P = await one(`SELECT public.mkt_product_start($1, $2)`, [CAR, prod.id])
const mP = (await peek(`SELECT id, rev FROM public.mkt_minutes WHERE project_id = $1`, [P.id]))[0]
await fill(mP.id, mP.rev, { vals: { Attendees: [S.josiah], Agenda: 'Kickoff' } })
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_minutes_fill($1, $2, '{"vals": {"Agenda": "x"}}'::jsonb)`, [mP.id, mP.rev + 1], /manager's/,
  'a product project’s minutes stay the manager’s')
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_minutes_sign($1)`, [mP.id])
check(await peek1(`SELECT status FROM public.mkt_minutes WHERE id = $1`, [mP.id]), 'draft', '…and the last signature never completes them — the manager does')

// ── An old call, never naming minutes ─────────────────────────────────────────────────────────────────────────
await as(U.mei, CREATOR)
const old = await one(`SELECT public.mkt_task_create($1, 'quick', 'An old call', 'social', 'Written here', $2::jsonb)`, [CAR, JSON.stringify(STAGES)])
check([await peek1(`SELECT brief FROM public.mkt_projects WHERE id = $1`, [old.id]), (await minutesOf(old.id)).length, (await page(old.track)).minutes],
  ['Written here', 0, null], 'a call that names no minutes: what is written, as before — no minutes')
check((await trail(old.id))[0].data, { kind: 'quick', stages: 1 }, '…its created record as it was')

console.log(`marketing task minutes: ${checks} checks passed`)
