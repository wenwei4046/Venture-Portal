// Local PostgreSQL regression for 20261127170000 (each CRM view's teams follow its own Staff Hierarchy — the owner,
// 2026-11-27: "need follow by dc heirachy"; "ir = the conts. DC = dream crafter"). Production's 40 bodies, as dumped
// from production that day (crm-lines-production.sql, md5-checked here), are loaded, then the migration runs VERBATIM,
// twice. The charts are production's that day, cut to what tells them apart: in IR's, CHEA HUAN is a Team Assistant with
// CYRUS and LIM YAU WEI under him; in DC's he is a Revenue Specialist with LIM YAU WEI alone, CYRUS under LUCAS. Under
// test: each chart's roles, uplines and downlines; the old names in IR's chart unless a line is set; a leader reads a
// customer by the chart of its brand (a Dream Crafter customer of CYRUS is no longer CHEA HUAN's to read or answer);
// crm_people hands each person's line in each chart and keeps the top-level fields production's; writes and the dealer
// follow the customer's / ad's / person's chart; the dealer puts the line back; somebody in DC's chart alone is not the
// Boss; with the CRM tied to no sub-department, everything answers by title and reports_to as before. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0] ?? { v: null })[0]
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

const FAIR = id(10), IR = id(11), DC = id(12)
const S_IR = id(21), S_DC = id(22), S_FAIR = id(23)
const T_CEO = id(31), T_DIR = id(32), T_TL = id(33), T_TA = id(34), T_RS = id(35)
const CONTS_WA = '1438056256053876', DC_WA = '1422533724269131', DC_PAGE = '478652958664343'

// [staff, user, name, People title, IR membership [title, upline], DC membership [title, upline]]
const P = {
  boss: [id(100), id(200), 'CHIEF', T_CEO, null, null],
  peter: [id(101), id(201), 'PETER', T_DIR, null, null],
  kris: [id(102), id(202), 'KRIS', T_DIR, null, null],
  stanley: [id(103), id(203), 'STANLEY', T_TL, [T_TL, null], [T_TL, null]],
  lucas: [id(104), id(204), 'LUCAS', T_TA, [T_TA, 'stanley'], [T_TA, 'stanley']],
  chea: [id(105), id(205), 'CHEA HUAN', T_TA, [T_TA, 'lucas'], [T_RS, 'lucas']],
  cyrus: [id(106), id(206), 'CYRUS', T_RS, [T_RS, 'chea'], [T_RS, 'lucas']],
  yauwei: [id(107), id(207), 'LIM YAU WEI', T_RS, [T_RS, 'chea'], [T_RS, 'chea']],
  hector: [id(108), id(208), 'HECTOR', T_RS, [T_RS, null], [T_RS, null]],
  shawn: [id(109), id(209), 'SHAWN', T_TL, [T_TL, null], null],
  weipin: [id(110), id(210), 'WEI PIN', T_RS, [T_RS, 'shawn'], null],
  both: [id(111), id(211), 'TWO LINES', T_RS, [T_RS, 'shawn'], [T_RS, 'lucas']],
  dconly: [id(112), id(212), 'DC ONLY', T_RS, null, [T_RS, 'stanley']],
}
const S = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v[0]]))
const U = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v[1]]))

await db.exec('set check_function_bodies = off')
await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.users (id uuid primary key, is_active boolean not null default true, role text);
  create table public.titles (id uuid primary key, name text, template_id uuid);
  create table public.hr_staff_costs (id uuid primary key, employee_name text, user_id uuid, title_id uuid, reports_to uuid, status text not null default 'active');
  create table public.crm_role_map (title_id uuid primary key, crm_role text);
  create table public.crm_settings (id boolean primary key default true, sub_department_id uuid);
  create table public.crm_sub_settings (sub_department_id uuid primary key, crm_director uuid);
  create table public.comm_sub_departments (id uuid primary key, name text, code text, is_active boolean not null default true, created_at timestamptz not null default now());
  create table public.comm_schemes (id uuid primary key, sub_department_id uuid, is_active boolean not null default true);
  create table public.comm_hierarchy (scheme_id uuid, staff_id uuid, title_id uuid, upline_staff_id uuid, effective_from date not null, effective_to date);
  create table public.comm_sub_department_directors (sub_department_id uuid, staff_id uuid);
  create table public.crm_contacts (id uuid primary key, channel text not null default 'whatsapp', account_id text, external_id text, name text, phone text,
    ad_source_id text, status text, assigned_to uuid, team_id uuid, last_customer_at timestamptz, created_at timestamptz not null default now(),
    held_reason text, assigned_at timestamptz, assigned_by uuid);
  create table public.crm_contact_shares (contact_id uuid, staff_id uuid, invited_by uuid, primary key (contact_id, staff_id));
  create table public.crm_staff (staff_id uuid primary key, full_time boolean, paused boolean, locked boolean, up_next boolean, updated_by uuid, updated_at timestamptz);
  create table public.crm_fulltime_rules (tl_id uuid primary key, mode text, days int[], vals jsonb, updated_by uuid, updated_at timestamptz);
  create table public.crm_team_settings (tl_id uuid primary key);
  create table public.crm_assign_rules (ad_source_id text primary key, tl_ids uuid[], shares jsonb);
  create table public.crm_invites (id uuid primary key default gen_random_uuid(), kind text, contact_id uuid, contact_name text, from_staff uuid, to_staff uuid,
    state text default 'pending', created_at timestamptz default now(), decided_at timestamptz);
  create table public.crm_events (id bigserial primary key, kind text, contact_id uuid, actor uuid, owner uuid, data jsonb, at timestamptz default now());
  create table public.crm_ad_names (ad_source_id text primary key, page_id text);
  -- Row types the rewritten bodies declare (their columns are not reached here).
  create table public.crm_staff_leave (id uuid primary key, staff_id uuid, from_at timestamptz, to_at timestamptz, reason text, note text);
  create table public.crm_ad_assign (ad_source_id text primary key);
  create table public.crm_deal_overrides (id uuid primary key);
  create table public.permission_template_grants (template_id uuid, function_key text, action text, scope text);
  create table public.user_permission_cells (user_id uuid, function_key text, action text, scope text);
  -- Stand-ins for what decides permission (the cells) and what the tested paths do not reach.
  create function public.crm_me() returns uuid language sql stable as $$
    select s.id from hr_staff_costs s join users u on u.id = s.user_id where u.id = auth.uid() and u.is_active and s.status = 'active' limit 1 $$;
  create function public.crm_can(p_action text, p_reach text) returns boolean language sql stable as $$
    select case when p_reach = 'own' then true else coalesce(current_setting('test.all', true), '') = 'on' end $$;
  create function public.crm_sees_all() returns boolean language sql stable as $$ select coalesce(crm_my_role() is not null and public.crm_can('view', 'all'), false) $$;
  create function public.crm_manages() returns boolean language sql stable as $$ select crm_my_role() is not null and public.crm_can('manage', 'all') $$;
  create function public.crm_deny(p_what text) returns void language plpgsql as $$ begin raise exception 'You may not %.', p_what using errcode = '42501'; end $$;
  create function public.crm_brands_of_user(p_user uuid) returns text[] language sql stable as $$ select array['conts', 'dc'] $$;
  create function public.crm_my_brands() returns text[] language sql stable as $$ select array['conts', 'dc'] $$;
  create function public.my_sub_departments(p_area text) returns uuid[] language sql stable as $$ select array(select id from comm_sub_departments where is_active) $$;
  create function public.sub_department_reach_in(p_user uuid, p_area text) returns uuid[] language sql stable as $$ select array(select id from comm_sub_departments where is_active) $$;
  create function public.crm_staff_locked(p_staff uuid) returns boolean language sql stable as $$ select false $$;
`)

await db.exec(`
  insert into comm_sub_departments (id, name, code, created_at) values ('${FAIR}', 'Fair', 'FAIR', now() - interval '3 days'),
    ('${IR}', 'IR', null, now() - interval '2 days'), ('${DC}', 'DC', 'DC', now() - interval '1 day');
  insert into comm_schemes values ('${S_IR}', '${IR}', true), ('${S_DC}', '${DC}', true), ('${S_FAIR}', '${FAIR}', true);
  insert into titles (id, name) values ('${T_CEO}', 'CHIEF EXECUTIVE OFFICER'), ('${T_DIR}', 'Revenue Director'), ('${T_TL}', 'Team Leader'),
    ('${T_TA}', 'Team Assistant'), ('${T_RS}', 'Revenue Specialist');
  insert into crm_role_map values ('${T_CEO}', 'boss'), ('${T_TL}', 'tl'), ('${T_TA}', 'ta'), ('${T_RS}', 'rs');
  insert into crm_settings values (true, '${IR}');
  insert into crm_sub_settings values ('${IR}', null), ('${DC}', '${S.kris}'), ('${FAIR}', null);
  insert into comm_sub_department_directors values ('${FAIR}', '${S.peter}'), ('${IR}', '${S.peter}'), ('${FAIR}', '${S.kris}'), ('${DC}', '${S.kris}');
`)
for (const [k, [staff, user, name, title, ir, dc]] of Object.entries(P)) {
  await q(`insert into users (id, role) values ($1, $2)`, [user, k === 'boss' ? 'principal' : 'revenue_member'])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id) values ($1, $2, $3, $4)`, [staff, name, user, title])
  for (const [scheme, m] of [[S_IR, ir], [S_DC, dc]]) {
    if (m) await q(`insert into comm_hierarchy values ($1, $2, $3, $4, '2026-09-01', null)`, [scheme, staff, m[0], m[1] ? S[m[1]] : null])
  }
}
// People's own reports_to (read only while the CRM is tied to no sub-department).
for (const [k, up] of [['lucas', 'stanley'], ['chea', 'lucas'], ['cyrus', 'chea'], ['yauwei', 'chea'], ['weipin', 'shawn']]) {
  await q(`update hr_staff_costs set reports_to = $1 where id = $2`, [S[up], S[k]])
}
// The customers.
const C = { irCyrus: id(501), dcCyrus: id(502), dcYauwei: id(503), irYauwei: id(504), dcBoth: id(505), dcTeamStanley: id(506), dcLoose: id(507), oddCyrus: id(508), dcLoose2: id(509) }
await db.exec(`
  insert into crm_contacts (id, account_id, external_id, ad_source_id, assigned_to, team_id) values
    ('${C.irCyrus}', '${CONTS_WA}', '1', 'AD-C', '${S.cyrus}', '${S.stanley}'),
    ('${C.dcCyrus}', '${DC_WA}', '2', 'AD-D', '${S.cyrus}', '${S.stanley}'),
    ('${C.dcYauwei}', '${DC_WA}', '3', 'AD-D', '${S.yauwei}', '${S.stanley}'),
    ('${C.irYauwei}', '${CONTS_WA}', '4', 'AD-C', '${S.yauwei}', '${S.stanley}'),
    ('${C.dcBoth}', '${DC_WA}', '5', 'AD-D', '${S.both}', '${S.stanley}'),
    ('${C.dcTeamStanley}', '${DC_WA}', '6', 'AD-D', null, '${S.stanley}'),
    ('${C.dcLoose}', '${DC_WA}', '7', null, null, null),
    ('${C.oddCyrus}', 'someone-else', '8', null, '${S.cyrus}', null),
    ('${C.dcLoose2}', '${DC_WA}', '9', null, null, null);
  insert into crm_ad_names values ('AD-PAGE', '${DC_PAGE}');
`)

// Production's bodies, then the six read policies as production holds them.
await db.exec('set check_function_bodies = off')
await db.exec((await readFile(new URL('./crm-lines-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
const policies = JSON.parse(await readFile(new URL('./crm-lines-production.policies.json', import.meta.url), 'utf8'))
for (const p of policies) {
  await db.exec(`alter table public.${p.tablename} enable row level security;
    grant select on public.${p.tablename} to authenticated;
    create policy ${p.policyname} on public.${p.tablename} for select to authenticated using (${p.qual});`)
}
await db.exec(`grant usage on schema public to authenticated; grant select on crm_contact_shares to authenticated;`)

const BEFORE = {
  'crm_scope_member(uuid)': 'e319a4f1a3d623daa5e109b5f5c9156c', 'crm_scope_director()': '9d12205feb18921ad71b7ea87405d145',
  'crm_role_of(uuid)': '2ca8661a549e8676382627239ee7c468', 'crm_upline_of(uuid)': '728f36db9849d17c0a87e57c7de32161',
  'crm_downline(uuid)': '6d5a7d7cbd33fb8825b484e8bf7a07e9', 'crm_people()': '99b31da7423229e340060dcf4e168cc7',
  'crm_assign_contact(uuid)': '3454d09ca95fc96fd96a8fa33086af8c', 'crm_my_role()': '250f66921f2182df197e1bf289c3b110',
  'crm_can_reply(uuid)': '3b7ee64b42bc94af00f65332e739c981', 'crm_cross_viewers()': '7cef066d63db76f5bf9a25976211eec7',
  'crm_send_to(uuid,uuid)': 'e04e848e9ea66994c38cf1df25ed3089', 'crm_up_next(text,text[],integer,uuid)': '2b83640593ece6704c263dd906cbee84',
}
const md5 = sig => one(`select md5(prosrc) from pg_proc where oid = $1::regprocedure`, [`public.${sig}`])
for (const [sig, m] of Object.entries(BEFORE)) check(await md5(sig), m, `the fixture is production's ${sig}`)
// Every body in the fixture is production's to the character (the dump's own header names production's md5 of each).
const fixtureHead = (await readFile(new URL('./crm-lines-production.sql', import.meta.url), 'utf8')).match(/^--   \S.*$/gm)
check(fixtureHead.length, 40, 'the fixture holds the 40 bodies it names')
for (const line of fixtureHead) {
  const [, sig, m] = line.match(/^--   (.+?)  ([0-9a-f]{32})$/)
  check(await md5(sig), m, `the fixture's ${sig} is production's`)
}

const as = async who => { await q(`select set_config('test.uid', $1, false)`, [who ? U[who] : '']) }
const sees = async who => {
  await as(who)
  await db.exec('set role authenticated')
  try { return (await q(`select id from crm_contacts order by id`)).map(r => r.id) } finally { await db.exec('reset role') }
}
const replies = async (who, contact) => { await as(who); return one(`select crm_can_reply($1)`, [contact]) }
const peopleOf = async who => { await as(who); return one(`select crm_people()`) }
const name = Object.fromEntries(Object.entries(S).map(([k, v]) => [v, k]))
const names = ids => ids.map(i => name[i] ?? Object.entries(C).find(([, v]) => v === i)?.[0] ?? i).sort()

// ── Before: Dream Crafter's customers read by IR's chart ────────────────────────────────────────────────────────
check(names(await sees('chea')), ['dcCyrus', 'dcYauwei', 'irCyrus', 'irYauwei', 'oddCyrus'], "before: CHEA HUAN reads CYRUS's Dream Crafter customer by IR's chart")
check(names(await sees('shawn')), ['dcBoth'], "before: SHAWN reads a Dream Crafter customer of somebody under him in IR's chart only")
check(await replies('chea', C.dcCyrus), true, "before: and may answer it")
await q(`select set_config('test.all', 'on', false)`)
const peopleBefore = { boss: await peopleOf('boss') }
await q(`select set_config('test.all', '', false)`)
peopleBefore.chea = await peopleOf('chea')
check(peopleBefore.boss.people.length, 12, 'before: the Boss lists everybody with a role in IR\'s chart, and themselves')
await as('dconly')
check(await one(`select crm_my_role()`), 'boss', 'before: somebody in DC\'s chart alone is read as the Boss')
await as('boss')
await q(`select set_config('test.all', 'on', false)`)
check(await one(`select (crm_send_to($1, $2)) ->> 'team_id'`, [C.dcLoose, S.both]), S.shawn, "before: a Dream Crafter customer sent to TWO LINES joins IR's team (SHAWN's)")
await q(`select set_config('test.all', '', false)`)
await q(`update crm_contacts set assigned_to = null, team_id = null where id = $1`, [C.dcLoose])
await q(`delete from crm_events`)

// ── The migration, twice ───────────────────────────────────────────────────────────────────────────────────────
const migration = (await readFile(new URL('../../supabase/migrations/20261127170000_lines_follow_each_view.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await as(null)
await db.exec('set check_function_bodies = on')
await db.exec(migration)
const afterOnce = {}
for (const sig of Object.keys(BEFORE)) afterOnce[sig] = await md5(sig)
await db.exec(migration)
for (const sig of Object.keys(BEFORE)) check(await md5(sig), afterOnce[sig], `run again, ${sig} is as it was`)
check(await md5('crm_deal_in_line(uuid)'), BEFORE['crm_assign_contact(uuid)'], "the dealer's body is production's, not one character changed")
if (process.env.PRINT_MD5) {
  const sigs = (await q(`select p.oid::regprocedure::text as sig, md5(p.prosrc) as m from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'crm\\_%' order by 1`))
  console.log(sigs.map(r => `      ('public.${r.sig}', '${r.m}'),`).join('\n'))
}
check(await one(`select count(*)::int from pg_policies where policyname = 'crm_contacts_read' and qual like '%crm_my_lines%'`), 1, "crm_contacts' read policy asks the lines")

// ── Each chart ─────────────────────────────────────────────────────────────────────────────────────────────────
const fn = (sql, ...args) => one(sql, args)
check(await fn(`select crm_role_in($1, $2)`, S.chea, IR), 'ta', "CHEA HUAN is a Team Assistant in IR's chart")
check(await fn(`select crm_role_in($1, $2)`, S.chea, DC), 'rs', "and a Revenue Specialist in DC's")
check(await fn(`select crm_role_of($1)`, S.chea), 'ta', 'the old name, with no line set, answers IR\'s')
check(await fn(`select crm_role_in($1, $2)`, S.peter, DC), 'hod', "PETER (IR's director) is a Revenue Director in DC's chart too")
check(await fn(`select crm_role_in($1, $2)`, S.kris, DC), 'hod', "KRIS directs DC")
check(await fn(`select crm_role_in($1, $2)`, S.kris, IR), 'hod', "and is a Revenue Director in IR's, as since 2026-11-24")
check(await fn(`select crm_role_in($1, $2)`, S.weipin, DC), null, "WEI PIN is in no line of DC's chart")
check(await fn(`select crm_role_in($1, $2)`, S.boss, DC), 'boss', 'the CEO is the Boss in every chart')
check(await fn(`select crm_role_in($1, $2)`, S.dconly, IR), null, "DC ONLY has no role in IR's chart")
check(await fn(`select crm_upline_in($1, $2)`, S.hector, DC), S.kris, "HECTOR's top in DC's chart reports to DC's director")
check(await fn(`select crm_upline_in($1, $2)`, S.hector, IR), S.peter, "and in IR's to IR's")
check(await fn(`select crm_upline_in($1, $2)`, S.cyrus, DC), S.lucas, "CYRUS is under LUCAS in DC's chart")
check(await fn(`select crm_upline_in($1, $2)`, S.cyrus, IR), S.chea, "and under CHEA HUAN in IR's")
check(names((await q(`select crm_downline_in($1, $2) as d`, [S.chea, IR])).map(r => r.d)), ['chea', 'cyrus', 'yauwei'], "CHEA HUAN's line in IR's chart")
check(names((await q(`select crm_downline_in($1, $2) as d`, [S.chea, DC])).map(r => r.d)), ['chea', 'yauwei'], "and in DC's")
check(names((await q(`select crm_downline_in($1, $2) as d`, [S.lucas, DC])).map(r => r.d)), ['both', 'chea', 'cyrus', 'lucas', 'yauwei'], "LUCAS's line in DC's chart")
check(await fn(`select crm_scope_director_in($1)`, DC), S.kris, "DC's chart's director")

// The old names follow a line set for the work in hand.
const inLine = async (sub, sql, ...args) => {
  const [r] = await q(`select set_config('crm.line', $1, false), (${sql}) as v`, [sub ?? '', ...args])
  await q(`select set_config('crm.line', '', false)`)
  return r.v
}
check(await inLine(DC, `select crm_role_of($2)`, S.chea), 'rs', "with DC's line set, crm_role_of answers DC's chart")
check(await inLine(DC, `select crm_team_of($2)`, S.both), S.stanley, "TWO LINES is in STANLEY's team in DC's chart")
check(await inLine(IR, `select crm_team_of($2)`, S.both), S.shawn, "and in SHAWN's in IR's")
check(await inLine(DC, `select crm_is_team_top($2)`, S.hector), true, "HECTOR tops a team of his own in DC's chart")
check(await inLine(DC, `select crm_is_team_top($2)`, S.shawn), false, 'SHAWN tops no team in DC\'s chart')
await q(`select set_config('crm.line', $1, false)`, [DC])
check(names((await q(`select h from crm_team_handlers($1) h`, [S.stanley])).map(r => r.h)),
  ['both', 'chea', 'cyrus', 'dconly', 'lucas', 'stanley', 'yauwei'], "STANLEY's team's handlers in DC's chart")
await q(`select set_config('crm.line', '', false)`)

// ── Reading: a customer by its own brand's chart ───────────────────────────────────────────────────────────────
check(names(await sees('chea')), ['dcYauwei', 'irCyrus', 'irYauwei', 'oddCyrus'], "CHEA HUAN no longer reads CYRUS's Dream Crafter customer — The Conts' and one of no brand still by IR's chart")
check(names(await sees('lucas')), ['dcBoth', 'dcCyrus', 'dcYauwei', 'irCyrus', 'irYauwei', 'oddCyrus'], "LUCAS reads TWO LINES' Dream Crafter customer: under him in DC's chart")
check(names(await sees('shawn')), [], "SHAWN, in no line of DC's chart, no longer reads it")
check(names(await sees('stanley')), ['dcBoth', 'dcCyrus', 'dcTeamStanley', 'dcYauwei', 'irCyrus', 'irYauwei', 'oddCyrus'], "STANLEY reads his DC team's waiting customer too")
check(await replies('chea', C.dcCyrus), false, "CHEA HUAN may no longer answer CYRUS's Dream Crafter customer")
check(await replies('chea', C.dcYauwei), true, "but may LIM YAU WEI's — under him in DC's chart")
check(await replies('chea', C.irCyrus), true, "and CYRUS's The Conts customer")
check(await replies('lucas', C.dcBoth), true, "LUCAS may answer TWO LINES' Dream Crafter customer")
check(await replies('shawn', C.dcBoth), false, 'SHAWN may not')
await as('chea')
check((await q(`select brand, staff from crm_my_lines() order by brand, staff`)).map(r => `${r.brand}:${name[r.staff]}`),
  ['conts:chea', 'conts:cyrus', 'conts:yauwei', 'dc:chea', 'dc:yauwei'], "CHEA HUAN's lines")
await as('dconly')
check(await one(`select crm_my_role()`), 'rs', "somebody in DC's chart alone is their DC role, not the Boss")
await as('chea')
check(await one(`select crm_my_role_in($1)`, [DC]), 'rs', "CHEA HUAN's own role in DC's chart")

// ── crm_people: each person's lines; the top level as production's ─────────────────────────────────────────────
await q(`select set_config('test.all', 'on', false)`)
const peopleAfterBoss = await peopleOf('boss')
const top = p => { const { lines, ...rest } = p; return rest }
for (const p of peopleBefore.boss.people) {
  check(top(peopleAfterBoss.people.find(x => x.id === p.id)), p, `the Boss's crm_people: ${p.name}'s top level as production's`)
}
check(peopleAfterBoss.people.filter(p => !peopleBefore.boss.people.some(x => x.id === p.id)).map(p => p.name), ['DC ONLY'], 'and one more: DC ONLY, in DC\'s chart alone')
const lineOf = (pp, who, brand) => { const p = pp.people.find(x => x.id === S[who]); return p?.lines?.[brand] ? { ...p.lines[brand], uplineId: name[p.lines[brand].uplineId] ?? p.lines[brand].uplineId } : null }
check(lineOf(peopleAfterBoss, 'chea', 'conts'), { role: 'ta', uplineId: 'lucas', title: 'Team Assistant' }, "CHEA HUAN's line in IR's chart")
check(lineOf(peopleAfterBoss, 'chea', 'dc'), { role: 'rs', uplineId: 'lucas', title: 'Revenue Specialist' }, "and in DC's")
check(lineOf(peopleAfterBoss, 'cyrus', 'dc'), { role: 'rs', uplineId: 'lucas', title: 'Revenue Specialist' }, "CYRUS under LUCAS in DC's chart")
check(lineOf(peopleAfterBoss, 'hector', 'dc'), { role: 'rs', uplineId: 'kris', title: 'Revenue Specialist' }, "HECTOR's DC top reports to KRIS")
check(lineOf(peopleAfterBoss, 'weipin', 'dc'), null, 'WEI PIN has no DC line')
check(lineOf(peopleAfterBoss, 'peter', 'dc'), { role: 'hod', uplineId: null, title: 'Revenue Director' }, "PETER is a Revenue Director in DC's chart")
check(lineOf(peopleAfterBoss, 'kris', 'dc'), { role: 'hod', uplineId: null, title: 'Revenue Director' }, 'KRIS too')
check(lineOf(peopleAfterBoss, 'dconly', 'conts'), null, 'DC ONLY has no IR line')
check(peopleAfterBoss.people.find(p => p.id === S.dconly).role, 'rs', "DC ONLY's top level is their DC line (an old page lists them so)")
await q(`select set_config('test.all', '', false)`)
const peopleAfterChea = await peopleOf('chea')
for (const p of peopleBefore.chea.people) check(top(peopleAfterChea.people.find(x => x.id === p.id)), p, `CHEA HUAN's crm_people: ${p.name}'s top level as production's`)
check(peopleAfterChea.people.length, peopleBefore.chea.people.length, 'and nobody more')
check(lineOf(peopleAfterChea, 'cyrus', 'dc'), null, "CHEA HUAN is not handed CYRUS's DC line: not his in DC's chart")
check(lineOf(peopleAfterChea, 'yauwei', 'dc'), { role: 'rs', uplineId: 'chea', title: 'Revenue Specialist' }, "but LIM YAU WEI's")

// ── Writes follow the chart of what they are about ─────────────────────────────────────────────────────────────
await q(`select set_config('test.all', 'on', false)`)
await as('boss')
check(await one(`select (crm_send_to($1, $2)) ->> 'team_id'`, [C.dcLoose, S.both]), S.stanley, "a Dream Crafter customer sent to TWO LINES joins their DC team (STANLEY's)")
check(await one(`select (crm_send_to($1, $2)) ->> 'team_id'`, [C.irCyrus, S.both]), S.shawn, "a The Conts customer sent to them joins their IR team (SHAWN's)")
await q(`update crm_contacts set assigned_to = $1, team_id = $2 where id = $3`, [S.cyrus, S.stanley, C.irCyrus])
// A line lasts as long as its transaction.
const lineAfter = async (sql, params = []) => {
  await db.exec('begin')
  try { await q(sql, params); return await one(`select coalesce(current_setting('crm.line', true), '') as v`) } finally { await db.exec('rollback') }
}
check(await lineAfter(`select crm_send_to($1, $2)`, [C.irCyrus, S.both]), IR, "inside the write's transaction, the customer's chart")
check(await one(`select coalesce(current_setting('crm.line', true), '')`), '', 'and none after it')
let refused = null
try { await q(`select crm_send_to($1, $2)`, [C.dcLoose2, S.weipin]) } catch (e) { refused = e.message }
check(refused, 'Choose someone who takes enquiries.', "a Dream Crafter customer is not sent to WEI PIN, in no line of DC's chart")
await as('lucas')
check(await lineAfter(`select crm_follow_staff_line($1)`, [S.both]), DC, "LUCAS's work on TWO LINES' settings: DC's chart, where TWO LINES is in his line")
await as('boss')
check(await lineAfter(`select crm_follow_staff_line($1)`, [S.both]), IR, "for whoever has nobody in a line: the chart they have a role in, IR's first")
check(await lineAfter(`select crm_follow_staff_line($1)`, [S.dconly]), DC, "DC ONLY: DC's chart")
check(await one(`select crm_ad_brand('AD-D')`), 'dc', "an ad's brand: its leads'")
check(await one(`select crm_ad_brand('AD-PAGE')`), 'dc', "else its Page's")
check(await one(`select crm_ad_brand('AD-NONE')`), null, 'else none')
check(await lineAfter(`select crm_follow_ads_line(array['AD-D', 'AD-PAGE'])`), DC, "Up next over a view's ads, all Dream Crafter's: DC's chart")
check(await lineAfter(`select crm_follow_ads_line(array['AD-D', 'AD-C'])`), '', 'ads of two brands: as before')
check(await lineAfter(`select crm_follow_ad_line('AD-PAGE')`), DC, "an ad's split: the ad's chart")

// The dealer deals in the customer's chart and puts the line back (the body is production's; a probe stands in).
await db.exec(`create or replace function public.crm_deal_in_line(p_contact uuid) returns jsonb language plpgsql as $$
  begin return jsonb_build_object('line', crm_line_sub(), 'role', crm_role_of('${S.chea}')); end $$`)
check(await one(`select crm_assign_contact($1)`, [C.dcCyrus]), { line: DC, role: 'rs' }, "a Dream Crafter lead is dealt in DC's chart")
check(await one(`select crm_assign_contact($1)`, [C.irCyrus]), { line: IR, role: 'ta' }, "a The Conts lead in IR's")
await db.exec('begin')
await q(`select set_config('crm.line', $1, true)`, [IR])
check(await one(`select crm_assign_contact($1)`, [C.dcCyrus]), { line: DC, role: 'rs' }, 'a webhook dealing a Dream Crafter lead after a The Conts one')
check(await one(`select current_setting('crm.line', true)`), IR, 'puts the line back after it')
await db.exec('rollback')
await q(`insert into crm_contacts (id, account_id, external_id, ad_source_id) values ($1, 'up-next-preview', 'p', 'AD-D')`, [id(599)])
check(await one(`select crm_assign_contact($1)`, [id(599)]), { line: DC, role: 'rs' }, "Up next's preview of a Dream Crafter ad, which has no number: the ad's chart")

// ── With the CRM tied to no sub-department: titles and reports_to, as before ───────────────────────────────────
await q(`update crm_settings set sub_department_id = null`)
await q(`select set_config('test.all', '', false)`)
check(await fn(`select crm_line_sub()`), null, 'no chart in hand')
check(await fn(`select crm_role_of($1)`, S.chea), 'ta', 'by title')
await as('chea')
check((await q(`select brand, staff from crm_my_lines() order by brand, staff`)).map(r => `${r.brand}:${name[r.staff]}`),
  ['conts:chea', 'conts:cyrus', 'conts:yauwei', 'dc:chea', 'dc:cyrus', 'dc:yauwei'], 'both brands by reports_to')
check(names(await sees('chea')), ['dcCyrus', 'dcYauwei', 'irCyrus', 'irYauwei', 'oddCyrus'], 'and read so')

console.log(`validate-crm-lines-follow-view: ${checks} checks passed`)
