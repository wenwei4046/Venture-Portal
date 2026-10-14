// Local PostgreSQL regression for 20261014251500 (2026-10-14, the chat composer handoff: "Persist … recent emoji per user
// on the server"). Every CRM migration runs VERBATIM (as the CRM's own checks load them — this one is among them). What is
// under test: crm_save_recent_emoji keeps the caller's own Recents — most recent first, each once, 24 at most, a long or
// empty string left out — in their own crm_staff_prefs row (made if they had none, the notification columns untouched); a
// second save replaces the first; the row is read back under the caller's own session and nobody else's; somebody with no
// CRM · View, a switched-off login and the publishable key are refused. No live I/O.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { CRM_PERMISSION_STANDIN } from './crm-permission-standin.mjs'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema if not exists auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.users (id uuid primary key, is_active boolean not null default true, role text);
  create table public.titles (id uuid primary key, name text, template_id uuid);
  create table public.hr_staff_costs (
    id uuid primary key, employee_name text, user_id uuid references public.users(id),
    title_id uuid references public.titles(id), reports_to uuid references public.hr_staff_costs(id), status text not null default 'active');
  grant usage on schema public to anon, authenticated, service_role;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text default 'all',
    p_keys text[] default '{}', p_labels text[] default '{}', p_ignore text[] default '{}', p_omit text[] default '{}',
    p_diff boolean default false, p_salary text[] default '{}', p_nric text[] default '{}', p_bank text[] default '{}',
    p_needs text default null, p_actor_column text default null, p_reason text default null)
  returns text language sql as $$ select p_mode $$;
`)
await db.exec(CRM_PERMISSION_STANDIN)
const dir = new URL('../../supabase/migrations/', import.meta.url)
const files = (await readdir(dir)).filter(f => /^20261(00[2-9]|01\d)\d+_crm_.*\.sql$/.test(f)).sort()
check(files.includes('20261014251500_crm_recent_emoji.sql'), true, 'the CRM checks load this migration with the rest')
for (const file of files) await db.exec((await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n'))

const id = (prefix, who) => {
  const hex = Buffer.from(`${prefix}-${who}`).toString('hex').padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
for (const role of ['boss', 'hod', 'tl', 'rs']) {
  await q(`insert into titles (id, name) values ($1, $2)`, [id('t', role), role])
  await q(`insert into crm_role_map (title_id, crm_role) values ($1, $2)`, [id('t', role), role])
}
for (const [who, role, upline] of [['BOSS', 'boss', null], ['PETER', 'hod', 'BOSS'], ['TLA', 'tl', 'PETER'], ['ANN', 'rs', 'TLA'], ['AMIR', 'rs', 'TLA'], ['ZED', 'rs', 'TLA']]) {
  await q(`insert into users values ($1, true, $2)`, [id('u', who), who === 'BOSS' ? 'principal' : null])
  await q(`insert into hr_staff_costs (id, employee_name, user_id, title_id, reports_to) values ($1, $2, $3, $4, $5)`,
    [id('s', who), who, id('u', who), id('t', role), upline ? id('s', upline) : null])
}
// ZED holds a CRM cell but not View.
await q(`insert into test_crm_cells (uid, action, scope) values ($1, 'manage', 'all')`, [id('u', 'ZED')])
const S = who => id('s', who)
const U = who => id('u', who)
const as = async (who, sql, params = []) => {
  await db.exec(`set test.uid = '${U(who)}'; set role authenticated`)
  try { return await q(sql, params) } finally { await db.exec(`reset role; set test.uid = ''`) }
}
const save = (who, list) => as(who, `select public.crm_save_recent_emoji($1)`, [list])
const stored = async who => (await q(`select recent_emoji from crm_staff_prefs where staff_id = $1`, [S(who)]))[0]?.recent_emoji ?? null

// ── 1. The column ──
check(await q(`select data_type, is_nullable, column_default from information_schema.columns where table_name = 'crm_staff_prefs' and column_name = 'recent_emoji'`),
  [{ data_type: 'ARRAY', is_nullable: 'NO', column_default: "'{}'::text[]" }], 'crm_staff_prefs.recent_emoji: text[], never null, empty to begin with')

// ── 2. One's own Recents: most recent first, each once, 24 at most, nothing long or empty ──
check(await stored('ANN'), null, 'Ann has no row yet')
await save('ANN', ['😀', '👍', '😀', '🛋️', '👨‍👩‍👧‍👦', '🇲🇾'])
check(await stored('ANN'), ['😀', '👍', '🛋️', '👨‍👩‍👧‍👦', '🇲🇾'], 'kept in her order, the second 😀 dropped; a family and a flag are one emoji each')
await save('ANN', ['🙏', '😀'])
check(await stored('ANN'), ['🙏', '😀'], 'a second save replaces the first (the composer sends the whole list)')
const many = Array.from({ length: 30 }, (_, i) => String.fromCodePoint(0x1F600 + i))
await save('ANN', many)
check(await stored('ANN'), many.slice(0, 24), '24 at most, the most recent first')
await save('ANN', ['', 'x'.repeat(17), null, '🔥'])
check(await stored('ANN'), ['🔥'], 'an empty string, a long one and a null are left out')
await save('ANN', null)
check(await stored('ANN'), [], 'nothing sent: Recents empties')

// ── 3. The row is one's own: written as the caller, read under the caller's session alone ──
await q(`insert into crm_staff_prefs (staff_id, notif_read, notif_deleted) values ($1, '{n1}', '{d1}')`, [S('AMIR')])
await save('AMIR', ['🚚'])
check(await q(`select recent_emoji, notif_read, notif_deleted from crm_staff_prefs where staff_id = $1`, [S('AMIR')]),
  [{ recent_emoji: ['🚚'], notif_read: ['n1'], notif_deleted: ['d1'] }], 'Amir’s existing row: his notification reads untouched')
check(await as('ANN', `select staff_id, recent_emoji from crm_staff_prefs`), [{ staff_id: S('ANN'), recent_emoji: [] }], 'Ann reads her own row, not Amir’s')
check(await as('AMIR', `select recent_emoji from crm_staff_prefs`), [{ recent_emoji: ['🚚'] }], 'Amir reads his')
await save('BOSS', ['👌'])
check(await stored('BOSS'), ['👌'], 'the Principal keeps their own Recents too')

// ── 4. Who may not ──
await assert.rejects(save('ZED', ['😀']), /You may not keep recent emoji/, 'no CRM · View: refused'); checks++
check(await stored('ZED'), null, '…and nothing written for him')
await q(`update users set is_active = false where id = $1`, [U('AMIR')])
await assert.rejects(save('AMIR', ['😀']), /You may not keep recent emoji/, 'a switched-off login: refused'); checks++
await q(`update users set is_active = true where id = $1`, [U('AMIR')])
check(await as('ANN', `select count(*)::int as n from crm_staff_prefs where staff_id = $1`, [S('AMIR')]), [{ n: 0 }], 'nobody reads another’s Recents')
const fn = (await q(`select prosecdef, proacl::text as acl from pg_proc where proname = 'crm_save_recent_emoji'`))[0]
check(fn.prosecdef, true, 'SECURITY DEFINER: it writes the caller’s row, the table takes no direct write')
check(/(^|[{,])anon=/.test(fn.acl) || /(^|[{,])=X/.test(fn.acl), false, 'not the publishable key’s, nor PUBLIC’s')
check(/authenticated=X/.test(fn.acl), true, 'a signed-in member may call it')
await db.exec(`set role anon`)
await assert.rejects(db.query(`select public.crm_save_recent_emoji('{x}')`), /permission denied/, 'the publishable key is refused'); checks++
await db.exec(`reset role`)
await db.exec(`set test.uid = '${U('ANN')}'; set role authenticated`)
await assert.rejects(db.query(`update crm_staff_prefs set recent_emoji = '{x}'`), /permission denied/, 'no direct write to the table, even of one’s own row'); checks++
await db.exec(`reset role; set test.uid = ''`)

console.log(`crm recent emoji: ${checks} checks passed`)
