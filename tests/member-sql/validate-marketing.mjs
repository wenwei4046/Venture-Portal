// Local PostgreSQL regression for 20261023214100 (2026-10-23 — Marketing's own view, the Claude Design handoff "HOUZS
// Marketing Module Setup"). The migration runs VERBATIM, twice, over stand-ins for the sign-in, the companies, the
// departments, titles and People, HR's holidays, the notices, the permission check and the audit register. What is
// under test: the tables take nothing from a client; the readers ask Marketing · View and refuse anybody else; the
// roster is the Marketing department's People with Marketing's own word over it; the sidebar counts what is on the
// caller's plate as My Space draws it (src/lib/marketing/my-space.ts) — a series' pattern, a paused project and a stage
// not yet open never; the board answers its window; the search and the notices are the caller's. The next migration
// (20261023234000, the tasks) runs after it and replaces the board and the sidebar: everything here still holds over
// its versions (validate-marketing-tasks.mjs tests what it adds). No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const VIEW = ['marketing.view']
const MANAGER = ['marketing.view', 'marketing.create', 'marketing.edit', 'marketing.approve', 'marketing.manage']
const U = { josiah: id(1), mei: id(2), ali: id(3), outsider: id(4), principal: id(5) }
const S = { josiah: id(11), mei: id(12), ali: id(13), outsider: id(14), edwin: id(15), loaned: id(16) }

/** Signed in as somebody holding these actions (the stand-in has_any_action reads them), as the database role. */
async function as(user, actions = [], role = 'authenticated') {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asSystem = () => as(null, [], null)
const shell = async () => one(`SELECT public.mkt_shell()`)

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
    kind text, states text[], deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.app_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
    kind text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '', ref_kind text NOT NULL, ref_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz, data jsonb);
  CREATE TABLE public.permission_page_tabs (page text NOT NULL, tab_id text NOT NULL, PRIMARY KEY (page, tab_id));

  -- The permission check: any wanted 'fn.action' among the actions handed in.
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
`)

// The group's companies as production keeps them (2026-10-23), one switched off, and the departments, titles, People.
await db.exec(`
  INSERT INTO public.users (id, name, email) VALUES
    ('${U.josiah}', 'Sia Josiah', 'josiah@x.my'), ('${U.mei}', 'Mei', 'mei@x.my'), ('${U.ali}', 'Ali', 'ali@x.my'),
    ('${U.outsider}', 'Outsider', 'out@x.my'), ('${U.principal}', 'Principal', 'principal@x.my');
  INSERT INTO public.companies (id, name, short_code, is_active) VALUES
    ('${id(101)}', 'Carres', 'CAR', true), ('${id(102)}', '2990', '2990', true), ('${id(103)}', 'HOUZS Century', 'HC', true),
    ('${id(104)}', 'Hookka', 'HK', true), ('${id(105)}', 'Ohana', 'OHN', true), ('${id(106)}', 'Dream Crafter', 'DC', true),
    ('${id(107)}', 'CMI', 'CMI', true), ('${id(108)}', 'The Cont', 'CONTS', true), ('${id(109)}', 'Old Co', 'OLD', false),
    ('${id(110)}', 'HOUZS Venture', 'HV', true);
  INSERT INTO public.departments (id, name, segment_key) VALUES ('${id(201)}', 'Marketing', 'marketing'), ('${id(202)}', 'Sales', 'fair');
  INSERT INTO public.titles (id, name) VALUES
    ('${id(301)}', 'MARKETING MANAGER'), ('${id(302)}', 'VIDEOGRAPHER'), ('${id(303)}', 'GRAPHIC DESIGNER'),
    ('${id(304)}', 'SOCIAL MEDIA EXECUTIVE'), ('${id(305)}', 'SENIOR MARKETING EXECUTIVE'), ('${id(306)}', 'EVENT EXECUTIVE'),
    ('${id(307)}', 'SALES ADVISOR');
  INSERT INTO public.hr_staff_costs (id, employee_name, first_name, user_id, title_id, department_id, status) VALUES
    ('${S.josiah}', 'SIA JOSIAH', NULL, '${U.josiah}', '${id(301)}', '${id(201)}', 'active'),
    ('${S.mei}', 'MEI LING TAN', 'Mei', '${U.mei}', '${id(302)}', '${id(201)}', 'active'),
    ('${S.ali}', 'ALI HASSAN', 'Ali', '${U.ali}', '${id(303)}', '${id(201)}', 'active'),
    ('${S.outsider}', 'OUT SIDER', NULL, '${U.outsider}', '${id(307)}', '${id(202)}', 'active'),
    ('${S.edwin}', 'EDWIN GONE', NULL, NULL, '${id(304)}', '${id(201)}', 'inactive'),
    ('${S.loaned}', 'LOANED PERSON', NULL, NULL, '${id(305)}', '${id(202)}', 'active');
  INSERT INTO public.att_holidays (day, name) VALUES ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date + 3, 'Deepavali');
  INSERT INTO public.att_holidays (day, name, deleted_at) VALUES ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date + 4, 'Taken back', now());
`)

const file = (await readFile(new URL('20261023214100_marketing_core.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(file)
await db.exec(file) // twice: nothing changes, nothing breaks
await db.exec((await readFile(new URL('20261023234000_marketing_tasks.sql', migrations), 'utf8')).replace(/\r\n/g, '\n'))

// ── The tables and who reaches them ─────────────────────────────────────────────
check(await q(`SELECT code, name FROM public.mkt_subsidiaries ORDER BY sort_order`), [
  { code: 'CAR', name: 'Carres' }, { code: '2990', name: '2990' }, { code: 'HC', name: 'HOUZS Century' }, { code: 'HK', name: 'Hookka' },
  { code: 'OHN', name: 'Ohana' }, { code: 'DC', name: 'Dream Crafter' }, { code: 'CMI', name: 'CMI' }, { code: 'CONTS', name: 'The Cont' },
], 'the eight companies, in the handoff’s order — the switched-off one and the holding company not among them, the second run adding nothing')
for (const t of ['mkt_subsidiaries', 'mkt_team', 'mkt_projects', 'mkt_stages', 'mkt_subtasks', 'mkt_events']) {
  check(await one(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${t}'::regclass`), true, `${t}: row security on`)
  for (const role of ['authenticated', 'anon']) check(await one(`SELECT has_table_privilege('${role}', 'public.${t}', 'SELECT')`), false, `${t}: nothing for ${role}`)
}
check(await q(`SELECT t, area, mode FROM public.audit_registered ORDER BY t`), [
  { t: 'mkt_events', area: 'Marketing', mode: 'none' }, { t: 'mkt_projects', area: 'Marketing', mode: 'none' },
  { t: 'mkt_stages', area: 'Marketing', mode: 'none' }, { t: 'mkt_subsidiaries', area: 'Marketing', mode: 'all' },
  { t: 'mkt_subtasks', area: 'Marketing', mode: 'none' }, { t: 'mkt_team', area: 'Marketing', mode: 'all' },
], 'every table has its line in the audit register')
for (const fn of ['mkt_board(date,date)', 'mkt_shell()', 'mkt_search(text)', 'mkt_notices(integer)']) {
  check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a sign-in may call ${fn}`)
}
for (const fn of ['mkt_me_staff()', 'mkt_need(text[],text)', 'mkt_title_team(text)', 'mkt_roster()']) {
  check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions’ own`)
  check(await one(`SELECT has_function_privilege('service_role', 'public.${fn}', 'EXECUTE')`), true, `${fn}: the service role keeps it`)
}
await refuses(`INSERT INTO public.mkt_projects (track_id, kind, subsidiary_id, title) SELECT 'MKT-CAR-26-1', 'product', id, 'Bad' FROM public.mkt_subsidiaries LIMIT 1`, [],
  /mkt_projects_track_id_check|check constraint/, 'a Track ID keeps its shape')

// ── The readers ask Marketing · View ────────────────────────────────────────────
for (const sql of [`SELECT public.mkt_board()`, `SELECT public.mkt_shell()`, `SELECT public.mkt_search('car')`]) {
  await as(U.outsider, [])
  await refuses(sql, [], /Marketing is not open to your account/, `${sql}: refused without Marketing · View`)
  await as(null, VIEW)
  await refuses(sql, [], /Marketing is not open to your account/, `${sql}: refused without a sign-in`)
}

// ── The roster: Marketing's People, Marketing's word over them ──────────────────
await as(U.mei, VIEW)
let board = await one(`SELECT public.mkt_board()`)
check(board.team.map(p => [p.first, p.team]), [['Ali', 'design'], ['Mei', 'content'], ['SIA', 'manager']],
  'the department’s active People by first name, each with the team their title says — the inactive one and other departments out')
check(board.me, S.mei, 'the caller’s People record')
check(Object.keys(board).sort(), ['holidays', 'me', 'projects', 'stages', 'subs', 'subtasks', 'team', 'today'], 'the board’s parts')
check(board.holidays.map(h => h.name), ['Deepavali'], 'HR’s holidays — a deleted one not among them')
await asSystem()
await db.exec(`
  INSERT INTO public.mkt_team (staff_id, team, role_label, in_roster) VALUES
    ('${S.ali}', 'social', 'Social & design', true), ('${S.loaned}', 'ads', 'Ads (from Sales)', true), ('${S.josiah}', NULL, NULL, false);
`)
await as(U.mei, VIEW)
board = await one(`SELECT public.mkt_board()`)
check(board.team.map(p => [p.first, p.team, p.role]), [['Ali', 'social', 'Social & design'], ['LOANED', 'ads', 'Ads (from Sales)'], ['Mei', 'content', null]],
  'Marketing’s own word: a team changed, somebody from another department put on, somebody taken off')
await asSystem()
await db.exec(`DELETE FROM public.mkt_team WHERE staff_id = '${S.josiah}'`)

// ── The sidebar counts what is on the caller's plate ─────────────────────────────
const sub = async code => one(`SELECT id FROM public.mkt_subsidiaries WHERE code = $1`, [code])
const CAR = await sub('CAR')
const HK = await sub('HK')
const today = await one(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
let n = 0
async function project({ code = 'CAR', kind = 'product', status = 'active', cur = 0, series = null, run = null, title = null, at = null }, stages) {
  n += 1
  const pid = id(1000 + n)
  const prefix = kind === 'product' ? 'MKT' : kind === 'quick' ? 'TSK' : 'RCR'
  await q(`INSERT INTO public.mkt_projects (id, track_id, kind, subsidiary_id, title, status, cur, series_id, run_no, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::timestamptz, now()))`,
    [pid, `${prefix}-${code}-2610-${String(n).padStart(3, '0')}${run ? `-R${String(run).padStart(2, '0')}` : ''}`, kind, code === 'CAR' ? CAR : HK,
      title ?? `Project ${n}`, status, cur, series, run, at])
  for (const [idx, s] of stages.entries()) {
    await q(`INSERT INTO public.mkt_stages (project_id, idx, name, owner_staff, status, appr, appr_idx, due_on)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [pid, idx, s.name ?? `Stage ${idx + 1}`, s.owner ?? null, s.status ?? 'planned', JSON.stringify(s.appr ?? []), s.apprIdx ?? 0, s.due ?? null])
  }
  return pid
}
await asSystem()
await project({}, [{ owner: S.mei, status: 'todo', due: today }]) // 1 — Mei to accept, due today
await project({ code: 'HK' }, [{ owner: S.mei, status: 'changes' }]) // 2 — changes back to Mei (Hookka)
await project({}, [{ owner: S.ali, status: 'review', appr: [{ kind: 'person', staff: S.mei }] }]) // 3 — waiting for Mei's approval
const withSub = await project({}, [{ owner: S.mei, status: 'accepted' }]) // 4 — Mei's, with a delivery to review
await q(`INSERT INTO public.mkt_subtasks (project_id, stage_idx, title, assignee, status) VALUES ($1, 0, 'Storyboard', $2, 'ready')`, [withSub, S.ali])
await project({ status: 'paused' }, [{ owner: S.mei, status: 'todo' }]) // paused — not counted
await project({ kind: 'recurring' }, [{ owner: S.mei, status: 'todo' }]) // a series' pattern — not counted
await project({}, [{ owner: S.ali, status: 'accepted' }, { owner: S.mei, status: 'planned' }]) // Mei's stage not open yet
await project({}, [{ owner: S.ali, status: 'review', appr: [{ kind: 'pic' }], due: '2026-01-02' }]) // the PIC's, and late

await as(U.mei, VIEW)
let sh = await shell()
check(sh.me.first, 'Mei', 'the sidebar knows who is signed in')
check(sh.counts, { myspace: 5, calendar: 1, projects: 0, tracking: 0 },
  'My Space: to accept, to fix, to approve, one in hand, a delivery to review; the Calendar: what is due by today; a viewer manages nothing')
check(sh.subs.filter(x => x.count).map(x => [x.code, x.count]), [['CAR', 4], ['HK', 1]], 'each subsidiary carries the caller’s own count')
check(sh.subs.length, 8, 'every subsidiary listed')
await as(U.ali, VIEW)
sh = await shell()
check(sh.counts.myspace, 1, 'Ali: the stage in his hands — not the two he waits on, not the delivery that is Mei’s to review')
await as(U.josiah, MANAGER)
sh = await shell()
check([sh.counts.tracking, sh.counts.projects], [1, 0], 'the manager: one stage past its date; no product project waiting before its plan')
await asSystem()
await project({ status: 'minutes' }, [])
await project({ status: 'changes' }, [])
await as(U.josiah, MANAGER)
check((await shell()).counts.projects, 2, 'product projects waiting for their manager: minutes to finish, the PIC’s changes')
await as(U.principal, MANAGER)
sh = await shell()
check([sh.me, sh.counts.myspace], [null, 0], 'the Principal has no People record: nothing on their plate, the rest still answers')

// ── The board's window ───────────────────────────────────────────────────────────
await asSystem()
const old = await project({ status: 'done', at: '2025-01-01T00:00:00Z', title: 'Old one' }, [{ owner: S.mei, status: 'done', due: '2025-01-03' }])
await as(U.mei, VIEW)
check((await one(`SELECT public.mkt_board()`)).projects.some(p => p.id === old), false, 'done long ago: not on the board')
check((await one(`SELECT public.mkt_board('2025-01-01', '2025-01-31')`)).projects.some(p => p.id === old), true, '…unless a stage was due in the window asked for')
await refuses(`SELECT public.mkt_board('2025-01-01', '2026-06-01')`, [], /at most 400 days/, 'a window of at most 400 days')
await refuses(`SELECT public.mkt_board('2025-02-01', '2025-01-01')`, [], /at most 400 days/, 'a window that ends before it starts')

// ── The search and the notices ───────────────────────────────────────────────────
check(await one(`SELECT public.mkt_search('x')`), { projects: [], people: [] }, 'one letter finds nothing')
const found = await one(`SELECT public.mkt_search('project 4')`)
check(found.projects.map(p => p.title), ['Project 4'], 'a title found')
check((await one(`SELECT public.mkt_search('MKT-CAR-2610-001')`)).projects.map(p => p.trackId), ['MKT-CAR-2610-001'], 'a Track ID found')
check((await one(`SELECT public.mkt_search('ali')`)).people.map(p => p.first), ['Ali'], 'a person found')
check((await one(`SELECT public.mkt_search('%')`)).projects.length <= 8, true, 'at most eight projects')

await asSystem()
await db.exec(`
  INSERT INTO public.app_notifications (user_id, kind, title, ref_kind, ref_id, data) VALUES
    ('${U.mei}', 'marketing', 'You''re on the plan for "Project 4"', 'mkt_project', '${withSub}', '{"type":"plan"}'),
    ('${U.mei}', 'memo', 'A memo', 'memo', 'x', NULL),
    ('${U.ali}', 'marketing', 'Ali''s own', 'mkt_project', '${withSub}', NULL);
`)
await as(U.mei, VIEW)
const mine = await one(`SELECT public.mkt_notices(10)`)
check(mine.map(x => [x.title, x.read, x.data?.type ?? null]), [['You\'re on the plan for "Project 4"', false, 'plan']], 'one’s own Marketing notices only')
check((await shell()).notices, 1, 'the bell’s count')
await as(null, [])
await refuses(`SELECT public.mkt_notices(10)`, [], /Sign in/, 'the notices need a sign-in')

console.log(`marketing: ${checks} checks passed`)
