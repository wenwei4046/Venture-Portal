// Local PostgreSQL regression for 20261014223000 (2026-10-14, the Revenue app's bell, live — the owner: "change to on
// live as well"). The tables are production's shapes, cut to the columns the triggers read; member_visible_memo and the
// two membership tests are production's logic over two small stand-in tables. Realtime is a stand-in too: realtime.send()
// writes down what it would broadcast, realtime.topic() is the channel a listener asks for, realtime.messages has its RLS
// on and production's grants.
//
// What is under test: whatever moves somebody's bell pings their own private channel `bell:<user id>` once a statement,
// saying which of the three moved — a notice (in, read, taken back; never the CRM's; the push bookkeeping is no news), a
// memo (published or changed for whoever sees it, a sub-department added to or taken off its audience, their receipt) or a
// request (sent, or HR moving it; never a draft, never HR's bookkeeping); a send that fails never stops the work; the
// trigger function is nobody's to call; and only a channel's owner may listen to it. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
// Logins, and their People records: Ann and Ben sell in Fair, Cat in IR, Dan directs Fair, Eve is HR, Fay has left.
const ANN = id(1), BEN = id(2), CAT = id(3), DAN = id(4), EVE = id(5), FAY = id(6)
const S = { ann: id(101), ben: id(102), cat: id(103), dan: id(104), eve: id(105), fay: id(106) }
const FAIR = id(201), IR = id(202)

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  create table public.hr_staff_costs (id uuid primary key, user_id uuid, status text not null);
  -- Production's app_notifications (mig 20261011180000 and after): closed to the browser.
  create table public.app_notifications (
    id uuid primary key default gen_random_uuid(), user_id uuid not null, kind text not null, title text not null default '',
    body text not null default '', ref_kind text, ref_id text, created_at timestamptz not null default now(),
    read_at timestamptz, push_taken_at timestamptz, pushed_at timestamptz, data jsonb);
  create table public.member_requests (
    id uuid primary key default gen_random_uuid(), created_by uuid, staff_id uuid, kind text not null default 'claim',
    status text not null, title text not null default '', note text, reviewed_by uuid, reviewed_at timestamptz);
  create table public.member_memos (
    id uuid primary key default gen_random_uuid(), title text not null default '', body text not null default '',
    published_at timestamptz, requires_ack boolean not null default true, withdrawn_at timestamptz, saved_to_records boolean not null default false);
  create table public.member_memo_audiences (memo_id uuid not null references public.member_memos on delete cascade, sub_department_id uuid not null);
  create table public.member_memo_recipients (memo_id uuid not null references public.member_memos on delete cascade, staff_id uuid not null);
  create table public.member_memo_receipts (memo_id uuid not null, user_id uuid not null, version integer not null default 1,
    read_at timestamptz, acknowledged_at timestamptz);
  alter table public.app_notifications enable row level security;
  alter table public.member_requests enable row level security;
  alter table public.member_memos enable row level security;

  -- Who belongs where: the two production tests, over a stand-in each (comm_hierarchy / comm_sub_department_directors).
  create table public.t_members (staff_id uuid, sub_department_id uuid);
  create table public.t_directors (staff_id uuid, sub_department_id uuid);
  create function public.member_has_membership(p_staff uuid, p_sub uuid) returns boolean language sql stable as $$
    select exists (select 1 from public.t_members where staff_id = p_staff and sub_department_id = p_sub) $$;
  create function public.member_director_scheme(p_staff uuid, p_sub uuid) returns uuid language sql stable as $$
    select p_sub from public.t_directors where staff_id = p_staff and sub_department_id = p_sub $$;
  -- Production's own (mig 20261012210000).
  create function public.member_visible_memo(p_memo uuid, p_staff uuid) returns boolean language sql stable security definer as $$
    select exists (select 1 from public.member_memos m join public.member_memo_audiences a on a.memo_id = m.id
      where m.id = p_memo and m.published_at <= now() and (public.member_has_membership(p_staff, a.sub_department_id) or public.member_director_scheme(p_staff, a.sub_department_id) is not null))
    or exists (select 1 from public.member_memos m join public.member_memo_recipients r on r.memo_id = m.id
      where m.id = p_memo and m.published_at <= now() and r.staff_id = p_staff) $$;

  -- Realtime, standing in: what send() would broadcast, the channel a listener asks for, and the messages table.
  create schema realtime;
  create table realtime.sent (n serial primary key, payload jsonb, event text, topic text, private boolean);
  create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language plpgsql as $$
  begin
    if current_setting('test.realtime_down', true) = 'yes' then raise exception 'realtime is down'; end if;
    insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private);
  end $$;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('test.topic', true) $$;
  grant usage on schema realtime to anon, authenticated;
  grant execute on function realtime.topic() to anon, authenticated;
  create table realtime.messages (id uuid primary key default gen_random_uuid(), topic text not null, extension text not null, payload jsonb, event text, private boolean);
  alter table realtime.messages enable row level security;
  -- Production's grants: the policies alone decide.
  grant select, insert, update on realtime.messages to anon, authenticated;
`)
await q(`insert into hr_staff_costs values ($1, $2, 'active'), ($3, $4, 'active'), ($5, $6, 'active'), ($7, $8, 'active'), ($9, $10, 'active'), ($11, $12, 'resigned')`,
  [S.ann, ANN, S.ben, BEN, S.cat, CAT, S.dan, DAN, S.eve, EVE, S.fay, FAY])
await q(`insert into t_members values ($1, $4), ($2, $4), ($3, $5), ($6, $4)`, [S.ann, S.ben, S.cat, FAIR, IR, S.fay])
await q(`insert into t_directors values ($1, $2)`, [S.dan, FAIR])

const MIGRATION = (await readFile(new URL('../../supabase/migrations/20261014223000_revenue_app_live_bell.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(MIGRATION)
// Twice: a migration run again changes nothing.
await db.exec(MIGRATION)

let seen = 0
/** The pings sent since the last look, as `<who> <event>`, sorted (one statement's order is the database's). */
const pings = async () => {
  const rows = await q(`select topic, event, private, payload from realtime.sent where n > $1 order by n`, [seen])
  seen = (await q(`select coalesce(max(n), 0) as n from realtime.sent`))[0].n
  const name = Object.fromEntries([[ANN, 'ann'], [BEN, 'ben'], [CAT, 'cat'], [DAN, 'dan'], [EVE, 'eve'], [FAY, 'fay']])
  return rows.map(r => {
    assert.equal(r.private, true, 'a private channel')
    assert.deepEqual(Object.keys(r.payload), ['at'], 'a ping carries only its moment')
    const [, user] = r.topic.match(/^bell:(.+)$/) ?? []
    return `${name[user] ?? r.topic} ${r.event}`
  }).sort()
}
const notice = (user, kind = 'rooms') => q(`insert into app_notifications (user_id, kind, title) values ($1, $2, 'A meeting for you') returning id`, [user, kind])

// ── 1. Notices: in, read, taken back — one ping a person a statement; never the CRM's ──
await notice(ANN)
check(await pings(), ['ann notice'], 'a meeting booked for Ann: her channel, once')
await q(`insert into app_notifications (user_id, kind, title) values ($1, 'hiring', 'a'), ($1, 'rooms', 'b'), ($1, 'memo', 'c'), ($2, 'rooms', 'd')`, [ANN, BEN])
check(await pings(), ['ann notice', 'ben notice'], 'four notices, two people: one ping each')
await notice(CAT, 'crm')
check(await pings(), [], "the CRM's own notices ring no bell")
await q(`update app_notifications set read_at = now() where user_id = $1 and read_at is null`, [ANN])
check(await pings(), ['ann notice'], 'all of Ann’s read at once: one ping (her other phone’s bell follows)')
await q(`update app_notifications set push_taken_at = now(), pushed_at = now() where user_id = $1`, [BEN])
check(await pings(), [], 'taken by the push outbox: nothing to tell')
await q(`update app_notifications set read_at = now() where user_id = $1 and kind = 'crm'`, [CAT])
check(await pings(), [], 'a CRM notice read: nothing')
await q(`update app_notifications set read_at = read_at where user_id = $1`, [ANN])
check(await pings(), [], 'read again, nothing changed: nothing')
await q(`delete from app_notifications where user_id = $1 and kind = 'rooms'`, [BEN])
check(await pings(), ['ben notice'], 'a notice taken back (a booking cancelled): his bell')
await q(`delete from app_notifications where user_id = $1`, [CAT])
check(await pings(), [], 'the CRM’s taken back: nothing')

// ── 2. Requests: theirs sent, or HR moving it ──
const [rq] = await q(`insert into member_requests (created_by, staff_id, status, title) values ($1, $2, 'draft', 'Fair claim') returning id`, [ANN, S.ann])
check(await pings(), [], 'a draft: nothing yet')
await q(`update member_requests set title = 'Fair claim · Penang' where id = $1`, [rq.id])
check(await pings(), [], 'a draft edited: nothing')
await q(`update member_requests set status = 'submitted' where id = $1`, [rq.id])
check(await pings(), ['ann request'], 'sent: her bell (her other phone)')
await q(`update member_requests set status = 'needs_info', note = 'Add the receipt', reviewed_by = $2, reviewed_at = now() where id = $1`, [rq.id, EVE])
check(await pings(), ['ann request'], 'HR returned it: the requester’s bell, not HR’s')
await q(`update member_requests set note = 'Add the hotel receipt' where id = $1`, [rq.id])
check(await pings(), ['ann request'], 'HR’s note changed: her bell')
await q(`update member_requests set reviewed_at = now() where id = $1`, [rq.id])
check(await pings(), [], 'HR’s bookkeeping alone: nothing')
await q(`insert into member_requests (created_by, staff_id, status, title) values ($1, $2, 'submitted', 'a'), ($1, $2, 'submitted', 'b'), ($3, $4, 'submitted', 'c')`, [BEN, S.ben, CAT, S.cat])
check(await pings(), ['ben request', 'cat request'], 'three sent at once by two people: one ping each')

// ── 3. Memos: whoever sees one ──
const [memo] = await q(`insert into member_memos (title, published_at) values ('Fair dress code', now()) returning id`)
check(await pings(), [], 'a memo with no audience yet: nobody to tell')
await q(`insert into member_memo_audiences values ($1, $2)`, [memo.id, FAIR])
check(await pings(), ['ann memo', 'ben memo', 'dan memo'], 'Fair added: its people and its director — not IR, not HR, not who left')
await q(`insert into member_memo_recipients values ($1, $2), ($1, $3)`, [memo.id, S.eve, S.fay])
check(await pings(), ['eve memo'], 'Eve added by name: her bell — not Fay’s, who left')
await q(`update member_memos set title = 'Fair dress code (v2)' where id = $1`, [memo.id])
check(await pings(), ['ann memo', 'ben memo', 'dan memo', 'eve memo'], 'changed: everybody who sees it, the people it is addressed to among them')
await q(`update member_memos set withdrawn_at = now() where id = $1`, [memo.id])
check(await pings(), ['ann memo', 'ben memo', 'dan memo', 'eve memo'], 'withdrawn: the same')
await q(`delete from member_memo_audiences where memo_id = $1 and sub_department_id = $2`, [memo.id, FAIR])
check(await pings(), ['ann memo', 'ben memo', 'dan memo'], 'Fair taken off: the people who lose it')
await q(`delete from member_memo_recipients where memo_id = $1`, [memo.id])
check(await pings(), ['eve memo'], 'Eve taken off: hers')
const [later] = await q(`insert into member_memos (title, published_at) values ('Next month', now() + interval '3 days') returning id`)
await q(`insert into member_memo_audiences values ($1, $2)`, [later.id, IR])
await pings()
await q(`update member_memos set body = 'Draft two' where id = $1`, [later.id])
check(await pings(), [], 'a memo not out yet, changed: nobody sees it, nobody is told')
await q(`insert into member_memo_receipts (memo_id, user_id, read_at) values ($1, $2, now())`, [memo.id, ANN])
check(await pings(), ['ann memo'], 'read on one phone: her other phones')
await q(`update member_memo_receipts set acknowledged_at = now() where memo_id = $1 and user_id = $2`, [memo.id, ANN])
check(await pings(), ['ann memo'], 'acknowledged: the same')

// ── 4. A failing send never stops the work ──
await db.exec(`set test.realtime_down = 'yes'`)
await notice(BEN)
await q(`update member_requests set status = 'approved' where id = $1`, [rq.id])
await db.exec(`reset test.realtime_down`)
check((await q(`select count(*)::int as n from app_notifications where user_id = $1 and read_at is null`, [BEN]))[0].n, 1, 'the notice is kept though Realtime was down')
check((await q(`select status from member_requests where id = $1`, [rq.id]))[0].status, 'approved', '…and HR’s approval')
check(await pings(), [], '…and nothing was sent')

// ── 5. The trigger function is nobody's to call ──
const fn = (await q(`select prosecdef, proacl::text as acl from pg_proc where proname = 'revenue_bell_ping'`))[0]
check(fn.prosecdef, true, 'it runs as its owner (realtime.send and the memo tests are not the caller’s)')
check(/(^|[{,])(anon|authenticated)?=X/.test(fn.acl ?? ''), false, 'not the publishable key’s, not a session’s, not PUBLIC’s')

// ── 6. Only a channel's owner listens ──
// Realtime's own check when somebody joins a private channel (supabase/realtime, Authorization): in a transaction it writes
// a broadcast and a presence message for that channel's topic, puts the topic in realtime.topic() and the listener's role and
// claims in place, reads the two back as the listener — what the policies let it read is what it may do — and rolls back.
// The same here.
const mayListen = async (who, topic, role = 'authenticated') => {
  await db.exec('begin')
  try {
    await q(`insert into realtime.messages (topic, extension) values ($1, 'broadcast'), ($1, 'presence')`, [topic])
    await db.exec(`set local test.uid = '${who}'; set local test.topic = '${topic}'; set local role ${role}`)
    return (await q(`select extension from realtime.messages order by extension`)).map(r => r.extension)
  } finally { await db.exec('rollback') }
}
check(await mayListen(ANN, `bell:${ANN}`), ['broadcast'], 'Ann on her own channel: its broadcasts')
check(await mayListen(ANN, `bell:${BEN}`), [], 'Ann on Ben’s channel: nothing')
check(await mayListen(BEN, `bell:${BEN}`), ['broadcast'], 'Ben on his own')
check(await mayListen(ANN, `bell:${ANN}:x`), [], 'a channel merely starting like hers: nothing')
check(await mayListen(ANN, 'room-1'), [], 'any other private channel: nothing (no other policy opens one)')
check(await mayListen('', `bell:${ANN}`, 'anon'), [], 'the publishable key, no sign-in: nothing')
check((await q(`select count(*)::int as n from pg_policies where schemaname = 'realtime' and tablename = 'messages'`))[0].n, 1, 'one policy, kept once though the migration ran twice')
check((await q(`select count(*)::int as n from pg_trigger where tgname like 'revenue_bell_%'`))[0].n, 13, 'thirteen triggers, each once')

console.log(`live bell: ${checks} checks passed`)
