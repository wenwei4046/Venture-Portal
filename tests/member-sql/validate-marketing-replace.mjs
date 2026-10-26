// Local PostgreSQL regression for 20261025036000 (2026-10-24 — Marketing ④-5, Replace Person; the user's answers 24–28:
// a template's new version published at once, anybody on the roster takes over, everything is replaced, the person
// replaced / the one taking over / the projects' owners told, no swap back after a leave). Marketing's migrations up to the
// two PICs and both PICs run, then this one, twice. What is under test: who may call what; where a person stands — the
// templates, a series' plan, stages not started, the work in their hands, approvals under way, the projects they own —
// and each person's count; what the swap refuses, before anything changes; what it does to each place (a new version and
// the draft, Accept again, a 🔓 candidate or an approver listed already, an approval waiting, a subtask, an owner); what
// stays; the record, the trail, who is told; places no longer theirs. No live I/O.
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
const U = { josiah: id(1), mei: id(2), ali: id(3), siti: id(4), hafiz: id(5) }
const S = { josiah: id(11), mei: id(12), ali: id(13), siti: id(14), hafiz: id(15), lee: id(16) }

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
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my'),
    ('${U.siti}', 'Siti', 'siti@x.my'), ('${U.hafiz}', 'Hafiz', 'hafiz@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES ('${id(101)}', 'Carres', 'CAR', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Finance', 'finance');
  INSERT INTO public.titles (id, name) VALUES ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER'),
    ('${id(304)}', 'ACCOUNTANT');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.siti}', 'SITI AMINAH', 'Siti', '${U.siti}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.hafiz}', 'HAFIZ RAHMAN', 'Hafiz', '${U.hafiz}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.lee}', 'LEE KOK WAI', 'Lee', NULL, '${id(304)}', '${id(202)}', 'active');
`)

const sql = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')
const MIGS = ['20261023214100_marketing_core.sql', '20261023234000_marketing_tasks.sql', '20261023235500_marketing_workflows.sql',
  '20261023235800_marketing_minutes.sql', '20261023235900_marketing_products.sql', '20261024001000_marketing_canvas.sql',
  '20261024002000_marketing_product_projects.sql', '20261024003000_marketing_pic_link.sql', '20261024004000_marketing_clients.sql',
  '20261025031000_marketing_groups_selangor.sql', '20261025032000_marketing_deliverables.sql', '20261025033000_marketing_pic_stages.sql',
  '20261025034000_marketing_two_pics.sql', '20261025035000_marketing_pic_both.sql']
for (const m of MIGS) await db.exec(await sql(m))
const mig = await sql('20261025036000_marketing_replace_person.sql')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ─────────────────────────────────────────────────────────────
for (const fn of ['mkt_replace_people()', 'mkt_replace_places(uuid)', 'mkt_replace_person(uuid,uuid,text[],text)']) {
  check([await peek1(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`),
    await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`)], [false, true], `${fn}: signed in only`)
}
for (const fn of ['mkt_replace_scan(uuid)', 'mkt_stage_people(jsonb)', 'mkt_people_swap(jsonb,uuid,uuid,boolean)', 'mkt_cands_swap(uuid[],uuid,uuid)',
  'mkt_stages_swap(jsonb,uuid,uuid)']) {
  check(await peek1(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn}: the functions' own`)
}
check(await peek1(`SELECT has_table_privilege('authenticated', 'public.mkt_replacements', 'SELECT')`), false, 'the record: read only through the functions')
check((await peek(`SELECT mode FROM public.audit_registered WHERE t = 'mkt_replacements'`)).map(r => r.mode), ['none'], 'the record is its own history')
check(await peek1(`SELECT tab_id FROM public.permission_page_tabs WHERE page = '/marketing/replace'`), 'mkt.tracking', 'the page sits on the Tracking tab')
await as(U.mei, STAFF)
await refuses(`SELECT public.mkt_replace_people()`, [], /Replace Person is the manager's/, 'staff cannot list who stands where')
await refuses(`SELECT public.mkt_replace_places($1)`, [S.siti], /Replace Person is the manager's/, '…nor read a person’s places')
await refuses(`SELECT public.mkt_replace_person($1, $2, ARRAY['x'], 'Resigned')`, [S.siti, S.hafiz], /Replace Person is the manager's/, '…nor replace anybody')

// ── Where Siti stands ───────────────────────────────────────────────────────────────
await as(U.josiah, MANAGER)
const TODAY = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
// A template: Siti approves its first stage and is one of the second's 🔓 candidates — with Hafiz.
const tpl = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Graphic post', tname: 'Standard', stages: [
  { name: 'Shoot', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 1, appr: [{ kind: 'person', staff: S.siti }] },
  { name: 'Design', dept: 'GRAPHIC DESIGNER', who: { mode: 'prev', cands: [S.siti, S.hafiz] }, sla: 2, appr: [] },
] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [tpl.id, tpl.rev])
// …another, published, then its draft edited and not published again.
const tpl2 = await one(`SELECT public.mkt_workflow_save(NULL, NULL, $1::jsonb)`, [JSON.stringify({ action: 'Reel', tname: 'Standard', stages: [
  { name: 'Edit', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 2, appr: [{ kind: 'person', staff: S.siti }] }] })])
await one(`SELECT public.mkt_workflow_publish($1, $2)`, [tpl2.id, tpl2.rev])
const tpl2b = await one(`SELECT public.mkt_workflow_save($1, $2, $3::jsonb)`, [tpl2.id, tpl2.rev, JSON.stringify({ stages: [
  { name: 'Edit', dept: 'VIDEOGRAPHER', who: { mode: 'assign' }, sla: 3, appr: [{ kind: 'person', staff: S.siti }] }] })])

const create = (kind, title, stages, recur = null) => one(`SELECT public.mkt_task_create($1, $2, $3, 'social', NULL, $4::jsonb, $5::jsonb)`,
  [CAR, kind, title, JSON.stringify(stages), recur ? JSON.stringify(recur) : null])
// A task in her hands (its first stage, accepted), with a stage after it she approves (not started).
const A = await create('quick', 'Price banner', [{ name: 'Draft', dept: 'x', who: S.siti, sla: 1 }, { name: 'Check', dept: 'x', who: S.mei, sla: 1, appr: [S.siti] }])
// A stage under way she approves, waiting for her now.
const B = await create('quick', 'Reels cover', [{ name: 'Cover', dept: 'x', who: S.ali, sla: 1, appr: [S.siti] }])
// A stage under way that Hafiz approves too (level 2): Siti → Hafiz there would make a level vanish.
const C = await create('quick', 'Story set', [{ name: 'Stories', dept: 'x', who: S.ali, sla: 2, appr: [S.siti, S.hafiz] }])
// A stage not started she does.
const D = await create('quick', 'Year-end video', [{ name: 'Script', dept: 'x', who: S.mei, sla: 1 }, { name: 'Shoot', dept: 'x', who: S.siti, sla: 2 }])
// A series whose plan has her doing its first stage.
const R = await create('recurring', 'Daily tip', [{ name: 'Post', dept: 'x', who: S.siti, sla: 1 }],
  { freq: 'daily', start: TODAY, endMode: 'count', count: 2 })
await as(U.siti, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [A.id])
await as(U.ali, STAFF)
await one(`SELECT public.mkt_stage_accept($1)`, [B.id])
await one(`SELECT public.mkt_stage_save($1, $2::jsonb)`, [B.id, JSON.stringify({ notes: 'Cover ready' })])
await one(`SELECT public.mkt_stage_submit($1)`, [B.id])
await asSystem()
// …and a subtask she works on, a project she owns (A), one Mei owns (B).
await q(`INSERT INTO public.mkt_subtasks (project_id, stage_idx, title, assignee, due_on) VALUES ($1, 0, 'Thumbnail', $2, $3::date)`, [D.id, S.siti, TODAY])
await q(`UPDATE public.mkt_projects SET owner_staff = $2 WHERE id = $1`, [A.id, S.siti])
await q(`UPDATE public.mkt_projects SET owner_staff = $2 WHERE id = $1`, [B.id, S.mei])
const runs = (await q(`SELECT id FROM public.mkt_projects WHERE series_id = $1 ORDER BY run_no`, [R.id])).map(r => r.id)

await as(U.josiah, MANAGER)
const people = await one(`SELECT public.mkt_replace_people()`)
const count = who => people.find(p => p.id === who)?.places ?? 0
const places = await one(`SELECT public.mkt_replace_places($1)`, [S.siti])
const by = grp => places.places.filter(p => p.grp === grp)
check(places.person, { id: S.siti, full: 'SITI AMINAH', first: 'Siti' }, 'whose places')
check(by('tpl').map(p => [p.action, p.version, p.drafted, p.at.map(a => `${a.n} ${a.stage} ${a.role}`).sort()]),
  [['Graphic post', 1, false, ['1 Shoot appr', '2 Design cand']], ['Reel', 1, true, ['1 Edit appr']]],
  'the templates — every stage that names her; a draft with edits of its own says so')
check(by('series').map(p => [p.track, p.at.map(a => `${a.n} ${a.stage} ${a.role}`)]), [[R.track, ['1 Post owner']]], 'the series’ plan: its runs to come')
check(by('up').map(p => [p.track, p.stage, p.role]).sort(), [[A.track, 'Check', 'appr'], [D.track, 'Shoot', 'owner']].sort(),
  'stages not started — doing them, approving them')
const runTracks = (await peek(`SELECT track_id FROM public.mkt_projects WHERE series_id = $1 ORDER BY run_no`, [R.id])).map(r => r.track_id)
check(by('hand').map(p => [p.track, p.role, p.status]).sort(),
  [[A.track, 'owner', 'accepted'], [D.track, 'subtask', 'working'], ...runTracks.map(t => [t, 'owner', 'todo'])].sort(),
  'the work in her hands — a stage she does now (the runs already made too), a subtask')
check(by('appr').map(p => [p.track, p.level, p.waiting]).sort(), [[B.track, 1, true], [C.track, 1, false]].sort(),
  'approval levels under way — waiting for her now, or to come')
check(by('own').map(p => p.track), [A.track], 'the projects she owns')
check(count(S.siti), places.places.length, 'her count is her places')
check([count(S.hafiz) > 0, count(S.lee)], [true, 0], 'anybody with a place is counted; nobody else')

// ── What the swap refuses — before anything changes ────────────────────────────────────
const key = (grp, track, role) => places.places.find(p => p.grp === grp && p.track === track && (!role || p.role === role))?.key
const replace = (to, keys, reason = 'Resigned', from = S.siti) => one(`SELECT public.mkt_replace_person($1, $2, $3, $4)`, [from, to, keys, reason])
await refuses(`SELECT public.mkt_replace_person($1, $1, ARRAY['x'], 'Resigned')`, [S.siti], /Pick somebody else to take over/, 'not the same person')
await refuses(`SELECT public.mkt_replace_person($1, $2, ARRAY[$3], 'Resigned')`, [S.siti, S.lee, key('own', A.track)], /Only somebody on Marketing's roster/,
  'only somebody on the roster takes over (answer 25)')
await refuses(`SELECT public.mkt_replace_person($1, $2, ARRAY[$3], 'no')`, [S.siti, S.hafiz, key('own', A.track)], /Say why/, 'a reason')
await refuses(`SELECT public.mkt_replace_person($1, $2, ARRAY[]::text[], 'Resigned')`, [S.siti, S.hafiz], /Tick at least one place/, 'at least one place')
await refuses(`SELECT public.mkt_replace_person($1, $2, ARRAY[$3, $4], 'Resigned')`, [S.siti, S.hafiz, key('own', A.track), key('appr', C.track)],
  /Hafiz already approves Stories on .* — untick it, or pick somebody else/, 'an approval under way the one taking over holds already')
check(await peek1(`SELECT count(*)::int FROM public.mkt_replacements`), 0, '…and nothing changed, nothing recorded')
check(await peek1(`SELECT owner_staff FROM public.mkt_projects WHERE id = $1`, [A.id]), S.siti, '…not even the places before it')

// ── The swap: everything but the one approval Hafiz holds already ─────────────────────────
const all = places.places.map(p => p.key).filter(k => k !== key('appr', C.track))
const before = await peek(`SELECT idx, entered_at FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [A.id])
const done = await replace(S.hafiz, all, '  Resigned  ')
check([done.rec, done.from, done.to, done.reason, done.done.length, done.kept.map(k => k.key), done.gone],
  [1, { id: S.siti, first: 'Siti' }, { id: S.hafiz, first: 'Hafiz' }, 'Resigned', all.length, [key('appr', C.track)], 0],
  'the record: R-0001, who, why, what changed, what stayed with her')

// The templates: a new version at once, the draft too.
const wf = await peek(`SELECT action, version, draft_rev, published_rev FROM public.mkt_workflows ORDER BY action`)
check(wf.map(w => [w.action, w.version]), [['Graphic post', 2], ['Reel', 2]], 'each template: a new version published at once (answer 24)')
const v2 = await peek1(`SELECT stages FROM public.mkt_workflow_versions WHERE workflow_id = $1 AND version = 2`, [tpl.id])
check([v2[0].appr, v2[1].who.cands], [[{ kind: 'person', staff: S.hafiz }], [S.hafiz]],
  'Hafiz approves; a 🔓 candidate already, Siti is only taken off')
check(await peek1(`SELECT stages FROM public.mkt_workflow_versions WHERE workflow_id = $1 AND version = 1`, [tpl.id]).then(s => s[0].appr),
  [{ kind: 'person', staff: S.siti }], 'the version before stays as it was published')
const g = wf.find(w => w.action === 'Graphic post'), r2 = wf.find(w => w.action === 'Reel')
check([g.published_rev === g.draft_rev, r2.published_rev === r2.draft_rev], [true, false],
  'a draft that was the version published stays it; one with edits of its own keeps them unpublished')
const r2draft = await peek1(`SELECT draft FROM public.mkt_workflows WHERE id = $1`, [tpl2.id])
check([r2draft[0].sla, r2draft[0].appr], [3, [{ kind: 'person', staff: S.hafiz }]], '…its draft swapped too, its own edit kept')
check((await peek1(`SELECT stages FROM public.mkt_workflow_versions WHERE workflow_id = $1 AND version = 2`, [tpl2.id]))[0].sla, 2,
  '…and the version published carries only the swap, not the draft’s edit')
check(tpl2b.rev + 1, r2.draft_rev, 'the draft’s count moves on — a builder open on it reloads before it saves')

// The series' plan, and its runs already made.
check(await peek1(`SELECT owner_staff FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [R.id]), S.hafiz, 'the series’ plan: its runs to come are Hafiz’s')
check((await peek(`SELECT status, owner_staff FROM public.mkt_stages WHERE project_id = ANY ($1) AND idx = 0 ORDER BY project_id`, [runs])).map(s => [s.status, s.owner_staff]),
  runs.map(() => ['todo', S.hafiz]), '…and the runs already made')

// The work in her hands: Accept again, its deadline unchanged.
const a0 = (await peek(`SELECT idx, status, owner_staff, accepted_at, entered_at, due_on::text AS due FROM public.mkt_stages WHERE project_id = $1 ORDER BY idx`, [A.id]))
check([a0[0].status, a0[0].owner_staff, a0[0].accepted_at, a0[0].entered_at > before[0].entered_at], ['todo', S.hafiz, null, true],
  'a stage she was doing: Hafiz’s to Accept again')
check(a0[1].appr ?? (await peek1(`SELECT appr FROM public.mkt_stages WHERE project_id = $1 AND idx = 1`, [A.id])), [{ kind: 'person', staff: S.hafiz }],
  'a stage not started she approved: Hafiz approves it')
check(await peek1(`SELECT owner_staff FROM public.mkt_stages WHERE project_id = $1 AND idx = 1`, [D.id]), S.hafiz, 'a stage not started she did: Hafiz’s')
check(await peek1(`SELECT assignee FROM public.mkt_subtasks WHERE project_id = $1`, [D.id]), S.hafiz, 'her subtask: Hafiz’s')
const b0 = (await peek(`SELECT status, appr, appr_idx FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [B.id]))[0]
check([b0.status, b0.appr, b0.appr_idx], ['review', [{ kind: 'person', staff: S.hafiz }], 0], 'an approval waiting for her: waits for Hafiz now')
check((await peek1(`SELECT appr FROM public.mkt_stages WHERE project_id = $1 AND idx = 0`, [C.id])).map(a => a.staff), [S.siti, S.hafiz],
  'the approval left unticked stays hers')
check(await peek1(`SELECT owner_staff FROM public.mkt_projects WHERE id = $1`, [A.id]), S.hafiz, 'the project she owned: Hafiz’s')

// The trail, a line a place; who is told — once a project each.
const trail = await peek(`SELECT p.track_id, e.stage_name, e.from_to, e.reason, e.data ->> 'role' AS role, (e.data ->> 'rec')::int AS rec, e.data ->> 'swap' AS swap
                            FROM public.mkt_events e JOIN public.mkt_projects p ON p.id = e.project_id
                           WHERE e.action = 'replaced' ORDER BY p.track_id, e.id`)
check(trail.filter(t => t.track_id === A.track).map(t => [t.stage_name, t.from_to, t.reason, t.role, t.rec]).sort(),
  [['Draft', 'Siti → Hafiz', 'Resigned', 'owner', 1], ['Check', 'Siti → Hafiz', 'Resigned', 'appr', 1], [null, 'Siti → Hafiz', 'Resigned', 'project', 1]].sort(),
  'each place its line in its project’s trail — with the record’s number')
check([...new Set(trail.map(t => t.swap))], ['Siti → Hafiz'], '…the swap kept in its data too (the product page’s trail reads no from → to)')
const told = await peek(`SELECT u.name, n.title, n.data ->> 'type' AS type, n.ref_id FROM public.app_notifications n JOIN public.users u ON u.id = n.user_id
                          WHERE n.title NOT LIKE 'You''re on%' AND n.title NOT LIKE '%submitted%' AND n.created_at > (SELECT at FROM public.mkt_replacements WHERE id = 1)
                          ORDER BY u.name, n.title`)
check(told.filter(t => t.name === 'Hafiz' && t.ref_id === A.id).map(t => [t.title, t.type]), [['Your turn: Draft', 'open']],
  'Hafiz: a stage of his now — his turn, once for the project')
check(told.filter(t => t.name === 'Hafiz' && t.ref_id === B.id).map(t => [t.title, t.type]), [['Cover v1 waits for your approval', 'review']],
  '…an approval waiting for him')
check(told.filter(t => t.name === 'Siti').length, new Set(done.done.filter(d => d.ref && d.grp !== 'tpl').map(d => d.ref)).size,
  'Siti: once for each project')
check(told.filter(t => t.name === 'Mei').map(t => t.title), ['Siti → Hafiz on "Reels cover"'], 'the project’s owner (Mei’s), told')

// ── Places no longer hers ───────────────────────────────────────────────────────────
await refuses(`SELECT public.mkt_replace_person($1, $2, $3, 'Resigned')`, [S.siti, S.mei, [key('own', A.track)]],
  /None of those places is Siti's any more — reload/, 'a place no longer hers: nothing to do')
const again = await replace(S.mei, [key('own', A.track), key('appr', C.track)])
check([again.rec, again.done.length, again.gone], [2, 1, 1], 'one still hers is replaced; the other counted as gone')
check((await one(`SELECT public.mkt_replace_places($1)`, [S.siti])).places, [], 'nothing left of hers')
check(await one(`SELECT public.mkt_replace_places($1)`, [id(999)]), null, 'nobody: no page')

console.log(`marketing replace person: ${checks} checks passed`)
