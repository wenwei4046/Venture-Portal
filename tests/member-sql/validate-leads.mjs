// Local PostgreSQL regression for 20261016300100 / 300200 (2026-10-16, Lead View). The tables the module reads from
// outside itself are production's shapes cut to the columns it reads; has_any_action and audit_register are stand-ins
// (a test setting holds the caller's cells). What is under test: the migration loads and seeds the three brands; the
// readers refuse a caller without Lead View · View and each write its own cell; a phone is found in the ways customers
// type it and never in a price; a test enquiry makes one conversation per name and finds its phone; a reply is
// recorded with who wrote it; the card confirms a typed phone and refuses a wrong one; a lead is handed only with a
// phone and only to its own brand's salesperson; the outcome needs a hand-over; salespeople need a mobile number.
// No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const q = async (sql, params = []) => (await db.query(sql, params)).rows
let checks = 0
const check = (actual, expected, what) => { assert.deepEqual(actual, expected, what); checks++ }
const refuses = async (sql, params, pattern, what) => {
  await assert.rejects(q(sql, params), err => pattern.test(String(err.message)), what)
  checks++
}
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const CS_USER = id(1), OTHER = id(2)
const ALL = ['leads.view', 'leads.create', 'leads.edit', 'leads.manage']
const as = async (uid, cells) => {
  await db.exec(`select set_config('test.uid', '${uid ?? ''}', false), set_config('test.cells', '${(cells ?? []).join(',')}', false)`)
}

await db.exec(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create table public.users (id uuid primary key, email text, name text);
  create table public.hr_staff_costs (id uuid primary key, employee_name text, user_id uuid,
    status text not null default 'active', created_at timestamptz default now());
  create function public.has_any_action(p_wants text[]) returns boolean language sql stable as $$
    select coalesce(string_to_array(nullif(current_setting('test.cells', true), ''), ',') && p_wants, false) $$;
  create function public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text,
    p_keys text[] default null, p_labels text[] default null, p_ignore text[] default null, p_omit text[] default null,
    p_diff boolean default null, p_salary text[] default null, p_nric text[] default null, p_bank text[] default null,
    p_needs text default null, p_actor_column text default null, p_reason text default null) returns void language sql as $$ select $$;
`)
await db.exec(`
  insert into public.users values ('${CS_USER}', 'cs@x', 'cs login'), ('${OTHER}', 'other@x', 'Other');
  insert into public.hr_staff_costs (id, employee_name, user_id) values ('${id(101)}', 'Mei Ling', '${CS_USER}');
`)
for (const file of ['20261016300100_leads.sql', '20261016300200_leads_functions.sql'])
  await db.exec(await readFile(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'))
// The writes ask their pages (mig 20261016300500): the guard goes in after lead_need, once. A stand-in guard lets all through.
await db.exec(`create function public.tab_write_guard(p_pages text[], p_wants text[]) returns void language plpgsql as $g$ begin end $g$`)
await db.exec(await readFile(new URL('../../supabase/migrations/20261016300500_leads_writes_ask_their_pages.sql', import.meta.url), 'utf8'))
for (const [fn, page] of [['lead_reply', '/leads'], ['lead_simulate', '/leads/settings']]) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY['${page}'], ARRAY['leads.create']);`), true, `${fn} asks ${page}`)
}
// Applying twice changes nothing (the seed asks first).
await db.exec(await readFile(new URL('../../supabase/migrations/20261016300100_leads.sql', import.meta.url), 'utf8'))

// The phone, as customers type it.
const phone = async text => (await q('select public.lead_find_phone($1) p', [text]))[0].p
check(await phone('我的號碼 012-338 4721，週六可以去看'), '0123384721', 'dashes and spaces')
check(await phone('0175520193'), '0175520193', 'digits only')
check(await phone('call me +60 12-338 4721 ok'), '0123384721', 'with +60')
check(await phone('6012-3384721'), '0123384721', 'with 60, no plus')
check(await phone('011-2093 4471'), '01120934471', 'an 011 number has 11 digits')
check(await phone('budget RM 1,500 to 3000'), null, 'a price is not a phone')
check(await phone('order 2026101612345678'), null, 'a long number is not a phone')
check(await phone('03-7890 1234'), null, 'a landline is not a mobile')

// Readers ask Lead View · View.
await as(OTHER, [])
await refuses('select public.lead_config()', [], /Lead View · View/, 'config refuses without View')
await refuses('select public.lead_inbox()', [], /Lead View · View/, 'inbox refuses without View')
await as(CS_USER, ['leads.view'])
const config = (await q('select public.lead_config() c'))[0].c
check(config.brands.map(b => b.name), ['2990s', '2990s mini', 'Carress'], 'the three brands, once, in order')
const [b2990, bMini, bCarress] = config.brands.map(b => b.id)

// Writes ask their own cells.
await refuses(`select public.lead_simulate($1, 'messenger', 'Aisyah', '', 'hi')`, [b2990], /Lead View · Create/, 'a test enquiry needs Create')
await refuses(`select public.lead_save_sales(null, $1, '{"name":"Daniel","phone":"0120001101"}')`, [b2990], /Lead View · Manage/, 'salespeople need Manage')

await as(CS_USER, ALL)
// Salespeople: a mobile number, kept as digits.
await refuses(`select public.lead_save_sales(null, $1, '{"name":"Daniel","phone":"03-7890 1234"}')`, [b2990], /Malaysian mobile/, 'a landline is refused')
const daniel = (await q(`select public.lead_save_sales(null, $1, '{"name":"Daniel Chew","phone":"012-000 1101","showroom":"KL"}') i`, [b2990]))[0].i
const sharon = (await q(`select public.lead_save_sales(null, $1, '{"name":"Sharon Lee","phone":"0120001102"}') i`, [b2990]))[0].i
const alvin = (await q(`select public.lead_save_sales(null, $1, '{"name":"Alvin Goh","phone":"+60 12 000 3301"}') i`, [bCarress]))[0].i
check((await q('select phone from public.lead_sales where id = $1', [daniel]))[0].phone, '0120001101', 'kept as digits')
check((await q('select phone from public.lead_sales where id = $1', [alvin]))[0].phone, '0120003301', '+60 taken off')

// A test enquiry: one conversation per brand, channel and name.
const aisyah = (await q(`select public.lead_simulate($1, 'messenger', 'Aisyah', 'Oct Sofa Week', '你好，我想問這款沙發') c`, [b2990]))[0].c
const again = (await q(`select public.lead_simulate($1, 'messenger', 'aisyah', '', '可以分期付款嗎？') c`, [b2990]))[0].c
check(again, aisyah, 'the same name is the same conversation')
let t = (await q('select public.lead_thread($1) t', [aisyah]))[0].t
check(t.messages.length, 2, 'both messages kept')
check([t.contact.isTest, t.contact.sourceAd, t.contact.phoneState, t.contact.lastDir], [true, 'Oct Sofa Week', 'none', 'in'], 'a test, from the ad, no phone, waiting')
check(t.events.map(e => e.what), ['Came in from the ad Oct Sofa Week (test)'], 'the timeline starts')
check((await q('select public.lead_config() c'))[0].c.waiting, 1, 'one conversation waiting for a reply')

// A reply: recorded, with who wrote it.
await refuses('select public.lead_reply($1, $2)', [aisyah, '   '], /Write a reply/, 'an empty reply')
await q('select public.lead_reply($1, $2)', [aisyah, '可以的！方便留個電話嗎？'])
t = (await q('select public.lead_thread($1) t', [aisyah]))[0].t
const last = t.messages.at(-1)
check([last.direction, last.sender, last.byName, last.delivery], ['out', 'cs', 'Mei Ling', 'recorded'], 'by Mei Ling, recorded only')
check(t.contact.lastDir, 'out', 'no longer waiting')

// Handing over needs a phone.
await refuses('select public.lead_handoff($1, $2)', [aisyah, daniel], /phone before/, 'no phone, no hand-over')
// The phone in her message is found, not yet confirmed.
await q(`select public.lead_simulate($1, 'messenger', 'Aisyah', '', '好 我的號碼 012-338 4721')`, [b2990])
t = (await q('select public.lead_thread($1) t', [aisyah]))[0].t
check([t.contact.phone, t.contact.phoneState], ['0123384721', 'detected'], 'found in the message')
check(t.messages.at(-1).phoneFound, '0123384721', 'the message says so')
// Another number later does not replace it.
await q(`select public.lead_simulate($1, 'messenger', 'Aisyah', '', '或者 017-552 0193')`, [b2990])
check((await q('select phone from public.lead_contacts where id = $1', [aisyah]))[0].phone, '0123384721', 'the first phone stays')

// The card.
await refuses(`select public.lead_save_card($1, '{"phone":"12345"}')`, [aisyah], /not a Malaysian mobile/, 'a wrong phone')
await q(`select public.lead_save_card($1, '{"phone":"012 338 4721","interest":"L 型沙發","showroom":"KL","note":"想分期"}')`, [aisyah])
t = (await q('select public.lead_thread($1) t', [aisyah]))[0].t
check([t.contact.phoneState, t.contact.interest, t.contact.showroom, t.contact.note], ['confirmed', 'L 型沙發', 'KL', '想分期'], 'saved')
check(t.events.map(e => e.what).slice(-1), ['Phone confirmed'], 'the timeline says so')

// Only to this brand's salesperson.
await refuses('select public.lead_handoff($1, $2)', [aisyah, alvin], /this brand/, 'another brand\'s salesperson')
await refuses(`select public.lead_set_outcome($1, 'booked', 'unknown')`, [aisyah], /Hand the lead over/, 'outcome before hand-over')
const got = (await q('select public.lead_handoff($1, $2) s', [aisyah, daniel]))[0].s
check([got.name, got.phone], ['Daniel Chew', '0120001101'], 'the salesperson comes back for WhatsApp')
t = (await q('select public.lead_thread($1) t', [aisyah]))[0].t
check([t.contact.handedSalesName, t.contact.handedByName], ['Daniel Chew', 'Mei Ling'], 'who got it, who gave it')
check((await q('select public.lead_config() c'))[0].c.brands[0].sales.find(s => s.id === daniel).week, 1, 'Daniel has one this week')
await refuses(`select public.lead_save_card($1, '{"phone":""}')`, [aisyah], /handed over/, 'a handed phone stays')
await q('select public.lead_handoff($1, $2)', [aisyah, sharon])
check((await q('select public.lead_thread($1) t', [aisyah]))[0].t.events.at(-1).what, 'Handed again, to Sharon Lee', 'handed again')

// The outcome.
await refuses(`select public.lead_set_outcome($1, 'maybe', 'unknown')`, [aisyah], /Unknown outcome/, 'unknown value')
await q(`select public.lead_set_outcome($1, 'booked', 'came')`, [aisyah])
check((await q('select appt, shown from public.lead_contacts where id = $1', [aisyah]))[0], { appt: 'booked', shown: 'came' }, 'outcome kept')

// Leads / Insight read a period.
await refuses(`select public.lead_list('2026-10-01', '2026-09-01')`, [], /a year or less/, 'a backwards period')
const today = (await q(`select (now() at time zone 'Asia/Kuala_Lumpur')::date d`))[0].d
const list = (await q(`select public.lead_list($1::date, ($1::date + 1)) l`, [today]))[0].l
check(list.length, 1, 'one conversation today')

// Brands: a new one, names unique.
await refuses(`select public.lead_save_brand(null, '{"name":"carress"}')`, [], /already a brand/, 'names are unique')
await refuses(`select public.lead_save_brand($1, '{"name":"2990s mini","fbPageId":"abc"}')`, [bMini], /digits only/, 'a Page id is digits')
await q(`select public.lead_save_brand($1, '{"name":"2990s mini","fbPageId":"478652958664343"}')`, [bMini])
check((await q('select fb_page_id from public.lead_brands where id = $1', [bMini]))[0].fb_page_id, '478652958664343', 'Page id kept')
await q(`select public.lead_save_brand(null, '{"name":"Brand Four","tone":"olive"}')`)
check((await q('select public.lead_config() c'))[0].c.brands.map(b => b.name).at(-1), 'Brand Four', 'a fourth brand, last')

// Removing a salesperson keeps their name on the lead.
await q('select public.lead_remove_sales($1)', [sharon])
check((await q('select public.lead_thread($1) t', [aisyah]))[0].t.contact.handedSalesName, 'Sharon Lee', 'name kept')
check((await q('select public.lead_config() c'))[0].c.brands[0].sales.map(s => s.name), ['Daniel Chew'], 'off the list')

// Nobody reads or writes the tables straight.
const grants = await q(`select count(*)::int n from information_schema.role_table_grants
  where table_name like 'lead\\_%' and grantee in ('anon', 'authenticated')`)
check(grants[0].n, 0, 'no table grants')

// ── Flows (mig 20261016310000) ──────────────────────────────────────────────
await db.exec(await readFile(new URL('../../supabase/migrations/20261016310000_lead_flows.sql', import.meta.url), 'utf8'))
const SOFA = JSON.stringify([
  { id: 's1', kind: 'question', text: '你想看哪一種？', buttons: [{ label: '3 人座', next: 's2' }, { label: 'L 型', next: 's2' }] },
  { id: 's2', kind: 'message', text: '照片 👇', next: 's3' },
  { id: 's3', kind: 'phone', text: '留個電話？', next: 's4' },
  { id: 's4', kind: 'handoff', text: '同事會聯絡你' },
])
await as(CS_USER, ['leads.view', 'leads.create', 'leads.edit'])
await refuses(`select public.lead_save_flow(null, '{"name":"x","triggerKind":"first","steps":[]}')`, [], /Lead View · Manage/, 'flows need Manage')
await as(CS_USER, ALL)
await refuses(`select public.lead_save_flow(null, '{"name":"x","triggerKind":"first","steps":[]}')`, [], /at least one step/, 'a flow needs steps')
await refuses(`select public.lead_save_flow(null, $1::jsonb)`, [JSON.stringify({ name: 'x', triggerKind: 'first', steps: [{ id: 's1', kind: 'question', text: 'q', buttons: [{ label: 'A', next: 's9' }] }] })], /leads to a step/, 'a button to nowhere')
await refuses(`select public.lead_save_flow(null, '{"name":"x","triggerKind":"ad","steps":[]}')`, [], /which ad or keyword/, 'an ad flow names its ad')
const sofaFlow = (await q(`select public.lead_save_flow(null, jsonb_build_object('name','沙發廣告','brandId',$1::text,'triggerKind','ad','triggerValue','Sofa Week','active',true,'steps',$2::jsonb)) i`, [b2990, SOFA]))[0].i
await q(`select public.lead_save_flow(null, jsonb_build_object('name','歡迎','triggerKind','first','active',true,'steps',$1::jsonb))`,
  [JSON.stringify([{ id: 'w1', kind: 'handoff', text: 'Hi！同事馬上回覆你' }])])
await q(`select public.lead_save_flow(null, jsonb_build_object('name','關掉的','triggerKind','first','active',false,'steps',$1::jsonb))`,
  [JSON.stringify([{ id: 'x1', kind: 'handoff', text: '不會出現' }])])

const flowThread = async c => (await q('select public.lead_thread($1) t', [c]))[0].t
// From the ad: the ad's flow, not the welcome.
const ben = (await q(`select public.lead_simulate($1, 'messenger', 'Ben', 'Oct Sofa Week（影片）', '你好') c`, [b2990]))[0].c
let ft = await flowThread(ben)
check(ft.messages.map(m => [m.sender, m.body]), [['customer', '你好'], ['flow', '你想看哪一種？']], 'the ad starts its flow')
check(ft.messages[1].buttons, ['3 人座', 'L 型'], 'the question carries its buttons')
check([ft.contact.flowState, ft.contact.flowName, ft.contact.lastDir], ['running', '沙發廣告', 'out'], 'waiting on the customer')
// A button: the photos, then the phone question.
await q(`select public.lead_simulate($1, 'messenger', 'Ben', '', ' l 型 ')`, [b2990])
ft = await flowThread(ben)
check(ft.messages.slice(-2).map(m => m.body), ['照片 👇', '留個電話？'], 'a message goes straight on to the next step')
// The phone: found, and the hand-over ends the flow and waits for Customer Service.
await q(`select public.lead_simulate($1, 'messenger', 'Ben', '', '0123384721')`, [b2990])
ft = await flowThread(ben)
check([ft.messages.at(-1).body, ft.contact.flowState, ft.contact.phoneState, ft.contact.lastDir], ['同事會聯絡你', 'done', 'detected', 'in'], 'handed to Customer Service with the phone')
check(ft.events.some(e => e.what.includes('handed the customer to Customer Service')), true, 'the timeline says so')

// Typed instead of a button: the flow stops.
const cara = (await q(`select public.lead_simulate($1, 'messenger', 'Cara', 'Sofa Week', 'hi') c`, [b2990]))[0].c
await q(`select public.lead_simulate($1, 'messenger', 'Cara', '', '請問有分期嗎')`, [b2990])
ft = await flowThread(cara)
check([ft.contact.flowState, ft.messages.at(-1).sender], ['stopped', 'customer'], 'a typed answer stops the flow')
// Customer Service replying stops a running one.
const dan = (await q(`select public.lead_simulate($1, 'messenger', 'Dan', 'Sofa Week', 'hi') c`, [b2990]))[0].c
await q('select public.lead_reply($1, $2)', [dan, '你好，我是 Mei Ling'])
check((await flowThread(dan)).contact.flowState, 'stopped', 'a reply stops the flow')
// No ad: the welcome (the inactive one never runs); a second message starts nothing more.
const eve = (await q(`select public.lead_simulate($1, 'instagram', 'Eve', '', 'hello') c`, [bCarress]))[0].c
await q(`select public.lead_simulate($1, 'instagram', 'Eve', '', 'still there?')`, [bCarress])
ft = await flowThread(eve)
check(ft.messages.map(m => m.body), ['hello', 'Hi！同事馬上回覆你', 'still there?'], 'the welcome once, never the inactive flow')
// An old conversation (it had replies before any flow) starts none.
await q(`select public.lead_simulate($1, 'messenger', 'Aisyah', '', 'hello again')`, [b2990])
check((await flowThread(aisyah)).messages.at(-1).sender, 'customer', 'an answered conversation starts no flow')
// Reading and removing.
const flows = (await q('select public.lead_flows() f'))[0].f
check(flows.map(f => [f.name, f.started]), [['沙發廣告', 3], ['歡迎', 1], ['關掉的', 0]], 'flows with the conversations they started')
await q('select public.lead_remove_flow($1)', [sofaFlow])
check((await q('select public.lead_flows() f'))[0].f.length, 2, 'removed')
check((await q(`select count(*)::int n from information_schema.role_table_grants where table_name = 'lead_flows' and grantee in ('anon','authenticated')`))[0].n, 0, 'no grants on flows')

// ── Automations (mig 20261016320000) ────────────────────────────────────────
await db.exec(await readFile(new URL('../../supabase/migrations/20261016320000_lead_automations.sql', import.meta.url), 'utf8'))
check((await q('select public.lead_auto_categories() c'))[0].c.map(c => c.name), ['General', '廣告'], 'two categories to start')
check((await q('select category_id is not null c from public.lead_flows where deleted_at is null limit 1'))[0].c, true, 'older flows are General')
await refuses(`select public.lead_save_auto_category(null, 'general', null)`, [], /already a category/, 'category names are unique')
const festive = (await q(`select public.lead_save_auto_category(null, '節日活動', 'olive') i`))[0].i
// Away hours.
const hours = JSON.stringify({ hours: [{ day: 1, from: '10:00', to: '22:00' }] })
const away = async at => (await q('select public.lead_is_away($1::jsonb, $2::timestamptz) a', [hours, at]))[0].a
check(await away('2026-10-19T04:00:00Z'), false, 'Monday 12:00 in KL is open')
check(await away('2026-10-19T15:00:00Z'), true, 'Monday 23:00 in KL is closed')
check(await away('2026-10-18T04:00:00Z'), true, 'Sunday is not listed: closed')
// Templates save with their form; saveAs is checked.
await refuses(`select public.lead_save_flow(null, $1::jsonb)`, [JSON.stringify({ name: 'x', triggerKind: 'first', steps: [{ id: 's1', kind: 'question', text: 'q', saveAs: 'salary', buttons: [{ label: 'A', next: 's1' }] }] })], /kept as interest/, 'saveAs is one of the card fields')
await refuses(`select public.lead_save_flow(null, '{"name":"x","template":"nope","triggerKind":"first","steps":[{"id":"s1","kind":"handoff","text":"a"}]}')`, [], /Unknown template/, 'templates are known')
// Turn the earlier flows off, so these tests see only their own.
await db.exec(`update public.lead_flows set active = false`)
const adQ = JSON.stringify([
  { id: 'q1', kind: 'question', text: '哪一種？', saveAs: 'interest', buttons: [{ label: '床褥', next: 'q2' }] },
  { id: 'q2', kind: 'question', text: '預算？', saveAs: 'budget', buttons: [{ label: '3,000 以上', next: 'p' }] },
  { id: 'p', kind: 'phone', text: '留電話？', next: 'h' },
  { id: 'h', kind: 'handoff', text: '收到' },
])
await q(`select public.lead_save_flow(null, jsonb_build_object('name','試睡廣告','template','ad','categoryId',$1::text,'brandId',$2::text,'triggerKind','ad','triggerValue','Trial','active',true,'steps',$3::jsonb,'config','{"questions":2}'::jsonb))`, [festive, bCarress, adQ])
const fay = (await q(`select public.lead_simulate($1, 'messenger', 'Fay', 'Mattress Trial', 'hi') c`, [bCarress]))[0].c
await q(`select public.lead_simulate($1, 'messenger', 'Fay', '', '床褥')`, [bCarress])
await q(`select public.lead_simulate($1, 'messenger', 'Fay', '', '3,000 以上')`, [bCarress])
ft = await flowThread(fay)
check([ft.contact.interest, ft.contact.budget, ft.messages.at(-1).body], ['床褥', '3,000 以上', '留電話？'], 'the ad answers fill the card')
// A keyword answers a later message too — but not while Customer Service is serving the customer.
await q(`select public.lead_save_flow(null, jsonb_build_object('name','分期','template','keyword','triggerKind','keyword','triggerValue','分期, installment','active',true,'steps','[{"id":"k1","kind":"message","text":"可以分期！"}]'::jsonb))`)
const gus = (await q(`select public.lead_simulate($1, 'instagram', 'Gus', '', 'hello') c`, [b2990]))[0].c
check((await flowThread(gus)).messages.length, 1, 'no automation for a plain first message now')
await q(`select public.lead_simulate($1, 'instagram', 'Gus', '', '請問可以 installment 嗎')`, [b2990])
check((await flowThread(gus)).messages.at(-1).body, '可以分期！', 'a keyword in a later message answers')
await q('select public.lead_reply($1, $2)', [gus, '你好我是 Mei Ling'])
await q(`select public.lead_simulate($1, 'instagram', 'Gus', '', '分期要幾個月？')`, [b2990])
check((await flowThread(gus)).messages.at(-1).sender, 'customer', 'Customer Service is serving: the keyword keeps quiet')
// Away: every day closed → always away; once in 12 hours.
await q(`select public.lead_save_flow(null, jsonb_build_object('name','下班','template','away','triggerKind','away','active',true,'config','{"hours":[]}'::jsonb,'steps','[{"id":"a1","kind":"message","text":"我們下班了"}]'::jsonb))`)
const hal = (await q(`select public.lead_simulate($1, 'messenger', 'Hal', '', 'hi') c`, [b2990]))[0].c
await q(`select public.lead_simulate($1, 'messenger', 'Hal', '', 'anyone?')`, [b2990])
ft = await flowThread(hal)
check(ft.messages.map(m => m.body), ['hi', '我們下班了', 'anyone?'], 'away answers once, not again within 12 hours')
const flowList = (await q('select public.lead_flows() f'))[0].f
check(flowList.find(f => f.name === '試睡廣告').template, 'ad', 'the template comes back')
await q('select public.lead_remove_auto_category($1)', [festive])
check((await q('select public.lead_flows() f'))[0].f.find(f => f.name === '試睡廣告').categoryId, null, 'its automations stay, in no category')

// ── AI Agent: Data Center, the soul, drafts (migs 20261016330000 / 330100) ──
await db.exec(await readFile(new URL('../../supabase/migrations/20261016330000_lead_ai.sql', import.meta.url), 'utf8'))
// The guards only (the registry tables are production's): each write asks its page, after its own check, once.
const aiTabs = (await readFile(new URL('../../supabase/migrations/20261016330100_lead_ai_tabs.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(aiTabs.slice(aiTabs.indexOf('CREATE OR REPLACE FUNCTION pg_temp.guard_put')))
for (const [fn, page, want] of [['lead_save_knowledge', '/leads/knowledge', 'leads.manage'], ['lead_remove_knowledge', '/leads/knowledge', 'leads.manage'],
  ['lead_save_persona', '/leads/ai', 'leads.manage'], ['lead_ai_try_context', '/leads/ai', 'leads.manage'], ['lead_ai_context', '/leads', 'leads.create'],
  ['lead_ai_log_draft', '/leads', 'leads.create'], ['lead_ai_draft_outcome', '/leads', 'leads.create']]) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY['${page}'], ARRAY['${want}']);`), true, `${fn} asks ${page}`)
}
for (const t of ['lead_knowledge', 'lead_personas', 'lead_ai_drafts'])
  check((await q(`select count(*)::int n from information_schema.role_table_grants where table_name = $1 and grantee in ('anon','authenticated')`, [t]))[0].n, 0, `no grants on ${t}`)
// Who may: View reads, Manage writes the Data Center and the soul, Create asks for a draft.
await as(CS_USER, ['leads.view'])
await refuses(`select public.lead_save_knowledge(null, '{"title":"x","body":"y"}')`, [], /Lead View · Manage/, 'cards need Manage')
await refuses(`select public.lead_save_persona($1, '{}')`, [b2990], /Lead View · Manage/, 'the soul needs Manage')
await as(CS_USER, ALL)
await refuses(`select public.lead_save_knowledge(null, '{"title":"","body":"y"}')`, [], /needs a title/, 'a card needs a title')
await refuses(`select public.lead_save_knowledge(null, '{"title":"x","body":"y","kind":"secret"}')`, [], /promo, a product/, 'a card is a known kind')
await refuses(`select public.lead_save_knowledge(null, '{"title":"x","body":"y","startsOn":"2026-10-20","endsOn":"2026-10-01"}')`, [], /before the start/, 'dates in order')
const klToday = (await q(`select (now() at time zone 'Asia/Kuala_Lumpur')::date::text d`))[0].d
const card = (title, extra) => q('select public.lead_save_knowledge(null, $1::jsonb) i', [JSON.stringify({ title, body: `${title} text`, ...extra })]).then(r => r[0].i)
const kHours = await card('Opening hours', { kind: 'showroom' })
await card('Sofa promo', { kind: 'promo', brandId: b2990, startsOn: klToday, endsOn: klToday })
await card('Old promo', { kind: 'promo', brandId: b2990, startsOn: '2020-01-01', endsOn: '2020-01-31' })
await card('Carress mattress', { kind: 'product', brandId: bCarress })
await card('Switched off', { brandId: b2990, active: false })
check((await q('select public.lead_knowledge() k'))[0].k.length, 5, 'every card on the Data Center')
// The soul: a brand with none yet is off, with the starting values.
let personas = (await q('select public.lead_personas() p'))[0].p
check(personas.slice(0, 3).map(p => [p.brandName, p.mode, p.saved]), [['2990s', 'off', false], ['2990s mini', 'off', false], ['Carress', 'off', false]], 'every brand, off until saved')
await refuses(`select public.lead_save_persona($1, '{"mode":"auto"}')`, [b2990], /off or a copilot/, 'auto is not offered yet')
// The try-it works whatever the mode, with the brand's cards for today and every brand's.
const tryCtx = (await q('select public.lead_ai_try_context($1) c', [b2990]))[0].c
check(tryCtx.knowledge.map(k => k.title).sort(), ['Opening hours', 'Sofa promo'], 'today’s cards: its own and every brand’s, in date, switched on')
// A draft needs the agent on.
await db.exec('update public.lead_flows set active = false')  // the automations above keep quiet
const ivy = (await q(`select public.lead_simulate($1, 'messenger', 'Ivy', '', 'L型沙发多少钱？') c`, [b2990]))[0].c
await refuses('select public.lead_ai_context($1)', [ivy], /off for this brand/, 'no draft while the agent is off')
await q(`select public.lead_save_persona($1, '{"agentName":"Mia","personality":"friendly","tone":"warm","goal":"get the phone","mode":"copilot"}')`, [b2990])
personas = (await q('select public.lead_personas() p'))[0].p
check([personas[0].agentName, personas[0].mode, personas[0].saved, personas[0].updatedByName], ['Mia', 'copilot', true, 'Mei Ling'], 'the soul saved, by whom')
const ctx = (await q('select public.lead_ai_context($1) c', [ivy]))[0].c
check([ctx.persona.agentName, ctx.contact.name, ctx.messages.map(m => m.body), ctx.knowledge.length], ['Mia', 'Ivy', ['L型沙发多少钱？'], 2], 'what a draft is written from')
await as(CS_USER, ['leads.view'])
await refuses('select public.lead_ai_context($1)', [ivy], /Lead View · Create/, 'a draft needs Create')
await as(CS_USER, ALL)
// Drafts: a new one passes over the last unused; only a pending one takes an outcome.
const d1 = (await q(`select public.lead_ai_log_draft($1, 'Hi! 你好', $2::jsonb, false, '', 'claude-opus-5-5') i`, [ivy, JSON.stringify([{ id: kHours, title: 'Opening hours' }])]))[0].i
const d2 = (await q(`select public.lead_ai_log_draft($1, 'Hi again', '[]', true, 'asks for a discount', 'claude-opus-5-5') i`, [ivy]))[0].i
check((await q('select outcome from public.lead_ai_drafts where id = $1', [d1]))[0].outcome, 'dismissed', 'a new draft passes over the unused one')
await refuses(`select public.lead_ai_draft_outcome($1, 'pending')`, [d2], /sent, edited or dismissed/, 'outcomes are known')
await q(`select public.lead_ai_draft_outcome($1, 'edited')`, [d2])
await q(`select public.lead_ai_draft_outcome($1, 'sent')`, [d2])
check((await q('select outcome, by_name from public.lead_ai_drafts where id = $1', [d2]))[0], { outcome: 'edited', by_name: 'Mei Ling' }, 'an outcome is kept once, with who asked')
check((await q('select public.lead_personas() p'))[0].p[0].drafts, { total: 2, sent: 0, edited: 1, dismissed: 1 }, 'the brand’s drafts in 30 days')
await q('select public.lead_remove_knowledge($1)', [kHours])
check((await q('select public.lead_knowledge() k'))[0].k.length, 4, 'a card removed')
await refuses('select public.lead_remove_knowledge($1)', [kHours], /gone/, 'removed once')

// ── Campaigns (migs 20261016340000 / 340100) ────────────────────────────────
await db.exec(await readFile(new URL('../../supabase/migrations/20261016340000_lead_campaigns.sql', import.meta.url), 'utf8'))
const campTabs = (await readFile(new URL('../../supabase/migrations/20261016340100_lead_campaigns_tabs.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(campTabs.slice(campTabs.indexOf('CREATE OR REPLACE FUNCTION pg_temp.guard_put')))
for (const [fn, page, want] of [['lead_save_campaign', '/leads/campaigns', 'leads.manage'], ['lead_send_campaign', '/leads/campaigns', 'leads.manage'],
  ['lead_remove_campaign', '/leads/campaigns', 'leads.manage'], ['lead_set_opt_in', '/leads', 'leads.edit']]) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY['${page}'], ARRAY['${want}']);`), true, `${fn} asks ${page}`)
}
// Applying it again changes nothing (the card's two keys go in once).
await db.exec(await readFile(new URL('../../supabase/migrations/20261016340000_lead_campaigns.sql', import.meta.url), 'utf8'))
for (const t of ['lead_campaigns', 'lead_campaign_recipients'])
  check((await q(`select count(*)::int n from information_schema.role_table_grants where table_name = $1 and grantee in ('anon','authenticated')`, [t]))[0].n, 0, `no grants on ${t}`)
await db.exec('update public.lead_flows set active = false')
const camp = (await q(`select public.lead_save_brand(null, '{"name":"Camp"}') i`))[0].i
const who = {}
for (const [name, ch] of [['Ann', 'messenger'], ['Bob', 'messenger'], ['Cat', 'messenger'], ['Dee', 'messenger'], ['Eve', 'instagram']])
  who[name] = (await q(`select public.lead_simulate($1, $2, $3, '', 'hello') c`, [camp, ch, name]))[0].c
// Bob, Cat and Dee wrote three days ago; Bob agreed to promotions, Dee unsubscribed.
await db.exec(`update public.lead_messages set created_at = now() - interval '3 days' where contact_id in ('${who.Bob}', '${who.Cat}', '${who.Dee}')`)
await db.exec(`update public.lead_contacts set last_at = now() - interval '3 days' where id in ('${who.Bob}', '${who.Cat}', '${who.Dee}')`)
await q(`select public.lead_set_opt_in($1, 'in')`, [who.Bob])
await q(`select public.lead_set_opt_in($1, 'out')`, [who.Dee])
await refuses(`select public.lead_set_opt_in($1, 'maybe')`, [who.Bob], /Agreed, not asked/, 'three states')
check((await q('select public.lead_thread($1) t', [who.Bob]))[0].t.contact.optIn, 'in', 'the card shows the consent')
await db.exec(`update public.lead_contacts set is_test = false where id = '${who.Cat}'`)
await refuses(`select public.lead_set_opt_in($1, 'in')`, [who.Cat], /through Meta/, 'a real customer’s consent is Meta’s')
await db.exec(`update public.lead_contacts set is_test = true where id = '${who.Cat}'`)
// The count before sending: Meta's rule.
const aud = { days: 30, tests: true }
let count = (await q(`select public.lead_campaign_audience($1, 'all', $2::jsonb) a`, [camp, JSON.stringify(aud)]))[0].a
check([count.matched, count.window, count.optin, count.notOptedIn, count.unsubscribed], [5, 2, 1, 1, 1], 'within 24 hours, opted in, neither, unsubscribed')
check(count.sample, ['Ann', 'Bob', 'Eve'], 'who will get it')
count = (await q(`select public.lead_campaign_audience($1, 'messenger', $2::jsonb) a`, [camp, JSON.stringify(aud)]))[0].a
check(count.matched, 4, 'one channel')
check((await q(`select public.lead_campaign_audience($1, 'all', '{"days":30}') a`, [camp]))[0].a.matched, 0, 'test conversations only when asked for')
check((await q(`select public.lead_campaign_audience($1, 'all', '{"days":1,"tests":true}') a`, [camp]))[0].a.matched, 2, 'contacted within the days')
// Saving: checked; scheduled only in the future.
const base = { brandId: camp, name: '11.11 preview', channel: 'all', audience: aud, body: 'Hi {name}! 11.11 starts next week.', buttons: ['Book a visit'] }
await refuses(`select public.lead_save_campaign(null, $1::jsonb)`, [JSON.stringify({ ...base, buttons: ['a', 'b', 'c', 'd'] })], /Up to 3 buttons/, 'three buttons at most')
await refuses(`select public.lead_save_campaign(null, $1::jsonb)`, [JSON.stringify({ ...base, scheduledAt: '2020-01-01T00:00:00Z' })], /still to come/, 'no schedule in the past')
await as(CS_USER, ['leads.view', 'leads.create', 'leads.edit'])
await refuses(`select public.lead_save_campaign(null, $1::jsonb)`, [JSON.stringify(base)], /Lead View · Manage/, 'campaigns need Manage')
await as(CS_USER, ALL)
const later = (await q(`select public.lead_save_campaign(null, $1::jsonb) i`, [JSON.stringify({ ...base, name: 'Later', scheduledAt: new Date(Date.now() + 86400000).toISOString() })]))[0].i
const k1 = (await q(`select public.lead_save_campaign(null, $1::jsonb) i`, [JSON.stringify(base)]))[0].i
check((await q('select public.lead_send_campaign($1) n', [k1]))[0].n, 3, 'sent to the three who may get it')
await refuses('select public.lead_send_campaign($1)', [k1], /already sent/, 'sent once')
await refuses(`select public.lead_save_campaign($1, $2::jsonb)`, [k1, JSON.stringify(base)], /already sent/, 'a sent campaign is not changed')
await refuses('select public.lead_remove_campaign($1)', [k1], /already sent/, 'a sent campaign stays')
const annT = (await q('select public.lead_thread($1) t', [who.Ann]))[0].t
check([annT.messages.at(-1).sender, annT.messages.at(-1).body, annT.messages.at(-1).buttons, annT.contact.lastDir],
  ['campaign', 'Hi Ann! 11.11 starts next week.', ['Book a visit'], 'out'], 'the message on the conversation, with the name')
check((await q('select public.lead_thread($1) t', [who.Cat]))[0].t.messages.at(-1).sender, 'customer', 'not to one outside 24 hours without consent')
check((await q('select public.lead_thread($1) t', [who.Dee]))[0].t.messages.at(-1).sender, 'customer', 'never to one who unsubscribed')
// What came of it: Ann answers with her phone.
await q(`select public.lead_simulate($1, 'messenger', 'Ann', '', 'Book a visit 0123384721')`, [camp])
let campList = (await q('select public.lead_campaigns() l'))[0].l
let row = campList.find(k => k.id === k1)
check([row.status, row.sent, row.paid, row.replied, row.phones], ['sent', 3, 1, 1, 1], 'delivered, paid, replied, phones')
check(campList.find(k => k.id === later).status, 'scheduled', 'the scheduled one waits')
// The clock's sweep sends only what is due.
check((await q('select public.lead_campaign_send_due() n'))[0].n, 0, 'nothing due yet')
await db.exec(`update public.lead_campaigns set scheduled_at = now() - interval '1 minute' where id = '${later}'`)
check((await q('select public.lead_campaign_send_due() n'))[0].n, 1, 'the due one goes')
check((await q('select status, sent_by_name from public.lead_campaigns where id = $1', [later]))[0], { status: 'sent', sent_by_name: 'Scheduled' }, 'sent by the schedule')
const draft = (await q(`select public.lead_save_campaign(null, $1::jsonb) i`, [JSON.stringify({ ...base, name: 'Draft' })]))[0].i
await q('select public.lead_remove_campaign($1)', [draft])
check((await q('select public.lead_campaigns() l'))[0].l.some(k => k.id === draft), false, 'a draft removed')
// The flow runner leaves a campaign message alone.
check((await q('select flow_state from public.lead_contacts where id = $1', [who.Eve]))[0].flow_state, 'none', 'no flow started or stopped')

// ── Ads: name, source, link (migs 20261018110000 / 110100) ───────────────────
await db.exec(await readFile(new URL('../../supabase/migrations/20261018110000_lead_ads.sql', import.meta.url), 'utf8'))
const adsGuards = (await readFile(new URL('../../supabase/migrations/20261018110100_lead_ads_guards.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(adsGuards.slice(adsGuards.indexOf('CREATE OR REPLACE FUNCTION pg_temp.guard_put')))
for (const [fn, want] of [['lead_name_ad', 'leads.manage'], ['lead_save_meta_ads', 'leads.manage'], ['lead_test_ad', 'leads.create']]) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY['/leads/settings'], ARRAY['${want}']);`), true, `${fn} asks /leads/settings`)
}
// Applying it again changes nothing (the adCard's keys and join go in once).
await db.exec(await readFile(new URL('../../supabase/migrations/20261018110000_lead_ads.sql', import.meta.url), 'utf8'))
check((await q(`select count(*)::int n from information_schema.role_table_grants where table_name = 'lead_ads' and grantee in ('anon','authenticated')`))[0].n, 0, 'no grants on lead_ads')
// A test conversation from an ad, with its id.
const ida = (await q(`select public.lead_simulate($1, 'instagram', 'Ida', 'Chat with us', 'hi') c`, [b2990]))[0].c
await refuses(`select public.lead_test_ad($1, 'abc')`, [ida], /digits only/, 'an ad id is digits')
await q(`select public.lead_test_ad($1, '120210000000001')`, [ida])
let adCard = (await q('select public.lead_thread($1) t', [ida]))[0].t.contact
check([adCard.adId, adCard.sourceAd, adCard.adName, adCard.adLink], ['120210000000001', 'Chat with us', '', ''], 'the id and headline, no name yet')
await db.exec(`update public.lead_contacts set is_test = false where id = '${ida}'`)
await refuses(`select public.lead_test_ad($1, '120210000000001')`, [ida], /comes from Meta/, 'a real conversation’s ad is Meta’s')
await db.exec(`update public.lead_contacts set is_test = true where id = '${ida}'`)
// Meta fills it; a name given by hand wins and Meta keeps filling what the hand left empty.
await as(CS_USER, ['leads.view', 'leads.create', 'leads.edit'])
await refuses(`select public.lead_name_ad('120210000000001', '{"name":"x"}')`, [], /Lead View · Manage/, 'naming needs Manage')
await as(CS_USER, ALL)
await refuses(`select public.lead_name_ad('120210000000001', '{"link":"http://x"}')`, [], /https/, 'links are https')
const meta = [{ adId: '120210000000001', name: 'Oct Sofa Week · Video', campaign: 'Oct Sofa', adset: 'KL 25-45', accountId: '1234567', status: 'ACTIVE', link: 'https://www.facebook.com/111_222' },
  { adId: 'nope', name: 'skipped' }]
check((await q('select public.lead_save_meta_ads($1::jsonb) n', [JSON.stringify(meta)]))[0].n, 1, 'one kept, a bad id skipped')
adCard = (await q('select public.lead_thread($1) t', [ida]))[0].t.contact
check([adCard.adName, adCard.adCampaign, adCard.adSet, adCard.adAccount, adCard.adLink], ['Oct Sofa Week · Video', 'Oct Sofa', 'KL 25-45', '1234567', 'https://www.facebook.com/111_222'], 'the adCard shows Ads Manager’s')
await q(`select public.lead_name_ad('120210000000001', '{"name":"Sofa video (our name)"}')`)
await q('select public.lead_save_meta_ads($1::jsonb) n', [JSON.stringify([{ ...meta[0], name: 'Renamed in Meta', adset: 'KL 30-50' }])])
adCard = (await q('select public.lead_thread($1) t', [ida]))[0].t.contact
check([adCard.adName, adCard.adSet], ['Sofa video (our name)', 'KL 30-50'], 'the hand’s name wins; Meta fills what the hand left empty')
const ads = (await q('select public.lead_ads() a'))[0].a
const adRow = ads.find(a => a.adId === '120210000000001')
check([adRow.headline, adRow.conversations, adRow.name, adRow.source], ['Chat with us', 1, 'Sofa video (our name)', 'manual'], 'Settings › Ads lists it')
// Clearing the hand's name falls back to Meta's next fetch.
await q(`select public.lead_name_ad('120210000000001', '{}')`)
check((await q('select public.lead_thread($1) t', [ida]))[0].t.contact.adName, '', 'cleared')
await q('select public.lead_save_meta_ads($1::jsonb) n', [JSON.stringify([meta[0]])])
check((await q('select public.lead_thread($1) t', [ida]))[0].t.contact.adName, 'Oct Sofa Week · Video', 'Meta’s again')

// ── Leads v2: the pipeline (mig 20261022220000) ──
await db.exec(await readFile(new URL('../../supabase/migrations/20261022220000_lead_stages.sql', import.meta.url), 'utf8'))
await as(CS_USER, ALL)
const stageCard = async c => (await q('select public.lead_thread($1) t', [c]))[0].t.contact
let stc = await stageCard(aisyah)
check([stc.contactedAt, stc.closedAt, stc.lostReason, stc.saleValue], [null, null, '', null], 'the card carries the steps, none reached yet')
await refuses(`select public.lead_set_stage($1, 'maybe', null)`, [aisyah], /Unknown status/, 'an unknown step')
await refuses(`select public.lead_set_stage($1, 'contacted', 10)`, [aisyah], /closed lead/, 'a value only when closed')
await refuses(`select public.lead_set_stage($1, 'contacted', null)`, [ida], /Hand the lead over/, 'steps come after the hand-over')
await q(`select public.lead_set_stage($1, 'closed', 2690)`, [aisyah])
stc = await stageCard(aisyah)
check([!!stc.contactedAt, !!stc.apptAt, !!stc.cameAt, !!stc.closedAt, Number(stc.saleValue), stc.appt, stc.shown, stc.stageByName],
  [true, true, true, true, 2690, 'booked', 'came', 'Mei Ling'], 'closed: every step before it dated, the value kept')
check((await q('select public.lead_thread($1) t', [aisyah]))[0].t.events.at(-1).what, 'Closed · bought · RM 2,690.00', 'the timeline says the sale')
await refuses(`select public.lead_mark_lost($1, 'x')`, [aisyah], /closed/, 'a closed lead is not lost')
await q(`select public.lead_set_stage($1, 'contacted', null)`, [aisyah])
stc = await stageCard(aisyah)
check([!!stc.contactedAt, stc.apptAt, stc.cameAt, stc.closedAt, stc.saleValue, stc.appt, stc.shown], [true, null, null, null, null, 'unknown', 'unknown'], 'back a step clears the later ones')
await q(`select public.lead_mark_lost($1, '  ')`, [aisyah])
stc = await stageCard(aisyah)
check([!!stc.lostAt, stc.lostReason, !!stc.contactedAt], [true, 'No reason', true], 'lost, the steps kept for a reopen')
await q('select public.lead_reopen($1)', [aisyah])
check([(await stageCard(aisyah)).lostAt, (await q('select public.lead_thread($1) t', [aisyah]))[0].t.events.at(-1).what], [null, 'Reopened'], 'reopened')
await refuses(`select public.lead_mark_lost($1, 'x')`, [ida], /no phone/, 'no phone, nothing to lose')
await as(CS_USER, ['leads.view'])
await refuses(`select public.lead_set_stage($1, 'came', null)`, [aisyah], /Lead View · Edit/, 'the steps need Edit')
await refuses('select public.lead_reopen($1)', [aisyah], /Lead View · Edit/, 'reopening needs Edit')
const everyone = (await q('select public.lead_leads(null, null) l'))[0].l
check(everyone.some(c => c.id === ida) && everyone.some(c => c.id === aisyah), true, 'all time lists everybody, no phone included')
const todays = (await q(`select public.lead_leads($1::date, ($1::date + 1)) l`, [today]))[0].l
check(todays.length, everyone.length, 'today, by the last update')
check((await q(`select public.lead_leads($1::date - 30, $1::date - 1) l`, [today]))[0].l.length, 0, 'a month ago, nobody')
await refuses(`select public.lead_leads($1::date, null)`, [today], /all time/, 'one bound alone')
await as(CS_USER, ALL)
// Its writes ask Leads' boxes (mig 20261022220100); the guard is a stand-in here, so it lets every call through.
await db.exec(await readFile(new URL('../../supabase/migrations/20261022220100_lead_stages_guards.sql', import.meta.url), 'utf8'))
for (const fn of ['lead_set_stage', 'lead_mark_lost', 'lead_reopen']) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes("PERFORM public.tab_write_guard(ARRAY['/leads/list'], ARRAY['leads.edit']);"), true, `${fn} asks /leads/list`)
}
await q(`select public.lead_set_stage($1, 'came', null)`, [aisyah])
check((await stageCard(aisyah)).shown, 'came', 'still works behind its guard')
check((await q('select prosrc from pg_proc where proname = $1', ['lead_set_outcome']))[0].prosrc.includes("PERFORM public.tab_write_guard(ARRAY['/leads'], ARRAY['leads.edit']);"), true, 'the outcome asks the Inbox')

// ── General info and Business bh (mig 20261022230000; the registry rows are production's, left out here) ──
const infoSql = (await readFile(new URL('../../supabase/migrations/20261022230000_lead_info_hours.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(infoSql.slice(0, infoSql.indexOf('-- ── The two tabs')))
await db.exec((await readFile(new URL('../../supabase/migrations/20261022230100_lead_info_hours_guards.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
await as(CS_USER, ALL)
let info = (await q('select public.lead_info() i'))[0].i
check(info.cats.map(c => [c.label, c.kind, c.custom]), [['Showrooms', 'showroom', false], ['Payment methods', 'topic', false], ['Delivery', 'topic', false], ['Warranty and returns', 'topic', false]], 'the four categories')
check(info.cards, [], 'no card yet')
const shop = info.cats[0].id
const saveInfo = async data => (await q('select public.lead_save_info($1::jsonb) i', [JSON.stringify(data)]))[0].i
const kl = { catId: shop, brandId: b2990, name: 'KL showroom', code: '', status: 'on', validFrom: '', validUntil: '', note: '',
  fields: [{ key: 'address', label: 'Address', value: 'Jalan Klang Lama' }, { key: 'evil', label: 'Hours', value: '10am – 10pm' }], uses: ['AI Agent · 2990s', 'AI Agent · 2990s'] }
await refuses(`select public.lead_save_info($1::jsonb)`, [JSON.stringify({ cats: info.cats, cards: [{ ...kl, catId: 'new-1' }] })], /category that is not there/, 'a card in an unknown category')
info = await saveInfo({ cats: [...(await q('select public.lead_info() i'))[0].i.cats, { id: 'new-1', label: 'Promotion' }],
  cards: [kl, { ...kl, catId: 'new-1', brandId: null, name: 'Instalment', code: 'Instal Plan', fields: [{ label: 'Plan', value: '0% 12 months' }] }] })
check(info.cats.map(c => c.label).at(-1), 'Promotion', 'a category added')
check(info.cards.map(c => [c.code, c.name, c.brandId === null, c.uses.length, c.updatedByName]), [['kl-showroom', 'KL showroom', false, 1, 'Mei Ling'], ['instal-plan', 'Instalment', true, 1, 'Mei Ling']], 'codes from the name or tidied; every brand; uses once')
check(info.cards[0].fields.map(f => f.key), ['address', null], 'only a showroom key is kept')
check(info.cards[1].catId, info.cats.at(-1).id, 'the new category’s cards point at it')
await refuses(`select public.lead_save_info($1::jsonb)`, [JSON.stringify({ cats: info.cats, cards: [...info.cards, { ...kl, code: 'kl-showroom' }] })], /Two cards use the code/, 'codes are unique')
await refuses(`select public.lead_save_info($1::jsonb)`, [JSON.stringify({ cats: info.cats, cards: [{ ...info.cards[0], validFrom: '2026-11-09', validUntil: '2026-11-08' }] })], /ends before it starts/, 'a backwards range')
// Swapping codes in one save, then deleting the custom category takes its card along.
const [c1, c2] = info.cards
info = await saveInfo({ cats: info.cats, cards: [{ ...c1, code: 'instal-plan' }, { ...c2, code: 'kl-showroom' }] })
check(info.cards.map(c => c.code), ['instal-plan', 'kl-showroom'], 'two codes swapped')
info = await saveInfo({ cats: info.cats.filter(c => !c.custom), cards: info.cards.filter(c => info.cats.some(k => k.id === c.catId && !k.custom)) })
check([info.cats.length, info.cards.length], [4, 1], 'a custom category left out goes with its cards')
await as(CS_USER, ['leads.view', 'leads.create', 'leads.edit'])
await refuses(`select public.lead_save_info($1::jsonb)`, [JSON.stringify({ cats: info.cats, cards: [] })], /Lead View · Manage/, 'General info needs Manage')
await refuses(`select public.lead_save_hours('[]'::jsonb, '[]'::jsonb)`, [], /Lead View · Manage/, 'bh need Manage')
await as(CS_USER, ALL)
let bh = (await q('select public.lead_business_hours() h'))[0].h
check(bh.week.map(d => d.on), [true, true, true, true, true, false, false], 'Monday to Friday by default')
const wk = bh.week.map(d => ({ ...d, from: '10:00', to: '22:00' }))
await refuses(`select public.lead_save_hours($1::jsonb, '[]'::jsonb)`, [JSON.stringify(wk.map((d, i) => i === 0 ? { ...d, from: '10:15' } : d))], /half hour/, 'a quarter hour')
await refuses(`select public.lead_save_hours($1::jsonb, '[]'::jsonb)`, [JSON.stringify(wk.map((d, i) => i === 0 ? { ...d, to: '09:00' } : d))], /closes after it opens/, 'closing before opening')
await refuses(`select public.lead_save_hours($1::jsonb, '[]'::jsonb)`, [JSON.stringify(wk.slice(1))], /right shape/, 'six days')
await q(`select public.lead_save_hours($1::jsonb, $2::jsonb)`, [JSON.stringify(wk), JSON.stringify([
  { name: 'Deepavali', from: '2026-11-08', to: '2026-11-08', mode: 'closed', open: '10:00', close: '18:00' },
  { name: 'Leave', from: '2026-11-02', to: '2026-11-04', mode: 'custom', open: '12:00', close: '18:00' }])])
bh = (await q('select public.lead_business_hours() h'))[0].h
check([bh.specials.map(s => s.name), bh.updatedByName], [['Leave', 'Deepavali'], 'Mei Ling'], 'special dates kept in order')
const isOpen = async at => (await q('select public.lead_hours_open($1::timestamptz) o', [at]))[0].o
check(await isOpen('2026-10-19T03:00:00Z'), true, 'Monday 11:00 open')
check(await isOpen('2026-10-19T14:30:00Z'), false, 'Monday 22:30 closed')
check(await isOpen('2026-10-24T03:00:00Z'), false, 'Saturday closed')
check(await isOpen('2026-11-08T03:00:00Z'), false, 'Deepavali closed (a Sunday anyway)')
check(await isOpen('2026-11-03T02:00:00Z'), false, 'leave: 10:00 before its 12:00')
check(await isOpen('2026-11-03T05:00:00Z'), true, 'leave: 13:00 open')
for (const [fn, page] of [['lead_save_info', '/leads/info'], ['lead_save_hours', '/leads/hours']]) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY['${page}'], ARRAY['leads.manage']);`), true, `${fn} asks ${page}`)
}
const lockedInfo = await q(`select count(*)::int n from information_schema.role_table_grants
  where table_name in ('lead_info_cats','lead_info_cards','lead_business_hours') and grantee in ('anon','authenticated')`)
check(lockedInfo[0].n, 0, 'no grants on the new tables')

// ── Reply rules, Reply templates and the Step library (mig 20261023100010; the registry rows are production's, left out here) ──
const replySql = (await readFile(new URL('../../supabase/migrations/20261023100010_lead_reply.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(replySql.slice(0, replySql.indexOf('-- ── The two new pages, by name')))
await db.exec((await readFile(new URL('../../supabase/migrations/20261023100100_lead_reply_guards.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
await as(CS_USER, ALL)
const tpl = [
  { id: 's1', name: 'Welcome', kind: 'question', text: 'What are you looking for?', saveAs: 'interest', pos: { x: 0, y: 0 },
    buttons: [{ label: 'Sofa', next: 's2' }, { label: 'Just looking', next: '', endMsg: 'No problem, browse away!' }] },
  { id: 's2', name: 'Ask for phone', kind: 'phone', text: 'Your mobile number?', retryText: 'Numbers only please.', retryMax: '1', failNext: 'person', next: 's3' },
  { id: 's3', name: 'Anything else', kind: 'text', text: 'Anything we should know?', saveAs: 'note', next: '' },
]
const saveTpl = async (id, data) => (await q('select public.lead_save_template($1, $2::jsonb) i', [id, JSON.stringify(data)]))[0].i
await refuses(`select public.lead_save_template(null, $1::jsonb)`, [JSON.stringify({ name: 'x', steps: [{ ...tpl[0], buttons: [{ label: 'Sofa', next: 'nope' }] }] })], /goes to a step of this template, or ends/, 'an option to nowhere')
await refuses(`select public.lead_save_template(null, $1::jsonb)`, [JSON.stringify({ name: 'x', steps: [{ ...tpl[1], next: '', retryMax: '9' }] })], /1 to 5 times/, 'a retry limit past 5')
await refuses(`select public.lead_save_template(null, $1::jsonb)`, [JSON.stringify({ name: 'x', steps: [{ id: 's1', kind: 'ai', text: '', name: 'AI' }, { id: 's2', kind: 'dance', text: 'x' }] })], /an option, an answer/, 'an unknown kind')
const sofaTpl = await saveTpl(null, { name: 'Sofa enquiry', description: 'Ad Oct Sofa Week', endMsg: 'Thanks! We’ll be in touch soon 😊', steps: tpl })
let flowRow = (await q('select active, trigger_kind, end_msg, description from public.lead_flows where id = $1', [sofaTpl]))[0]
check([flowRow.active, flowRow.trigger_kind, flowRow.description], [false, 'first', 'Ad Oct Sofa Week'], 'a new template is not started by a trigger')
check((await q('select public.lead_flows() f'))[0].f.find(f => f.id === sofaTpl).endMsg, 'Thanks! We’ll be in touch soon 😊', 'the reader carries the closing message')
// The rules: Carress on Instagram → the template, working hours and after.
await refuses(`select public.lead_save_reply_rules('[]'::jsonb, $1::jsonb)`, [JSON.stringify([{ brandId: bCarress, channel: 'instagram', work: 'gone', after: 'cs' }])], /a template that is there/, 'a reply to nothing')
await q(`select public.lead_save_reply_rules($1::jsonb, $2::jsonb)`, [JSON.stringify([{ adId: '120210000000009', when: 'open', reply: 'ai' }, { adId: '120210000000009', when: 'any', reply: sofaTpl }]),
  JSON.stringify([{ brandId: bCarress, channel: 'instagram', work: sofaTpl, after: sofaTpl }])])
const rules = (await q('select public.lead_reply_rules() r'))[0].r
check([rules.ads.length, rules.pages.find(p => p.brandId === bCarress && p.channel === 'instagram').work, rules.pages.find(p => p.brandId === b2990 && p.channel === 'messenger').work],
  [2, sofaTpl, 'cs'], 'rules read back; a page with none is Customer Service')
await refuses(`select public.lead_save_reply_rules($1::jsonb, '[]'::jsonb)`, [JSON.stringify([{ adId: '120210000000009', when: 'any', reply: 'cs' }, { adId: '120210000000009', when: 'any', reply: 'ai' }])], /same ad at the same time/, 'two rules for one ad and time')
// An ad rule beats the page; the hours pick between the ad's rules (a Monday 11:00 is open, 23:00 closed).
const contactRule = async (contact, at) => (await q('select public.lead_rule_reply(c, $2::timestamptz) r from public.lead_contacts c where c.id = $1', [contact, at]))[0].r
await db.exec(`update public.lead_contacts set ad_id = '120210000000009' where id = '${aisyah}'`)
check(await contactRule(aisyah, '2026-10-19T03:00:00Z'), 'ai', 'working hours: the ad’s open rule')
check(await contactRule(aisyah, '2026-10-19T15:00:00Z'), sofaTpl, 'after hours: the ad’s any-time rule')
await db.exec(`update public.lead_contacts set ad_id = null where id = '${aisyah}'`)
check(await contactRule(aisyah, '2026-10-19T03:00:00Z'), null, 'no ad, 2990s Messenger has no rule — today’s triggers decide')
// The template runs: options, a wrong phone (asked again), a right one, an answer kept in the note, the closing message.
const zoe = (await q(`select public.lead_simulate($1, 'instagram', 'Zoe', '', 'hello') c`, [bCarress]))[0].c
const zoeOut = async () => (await q(`select body, buttons from public.lead_messages where contact_id = $1 and direction = 'out' order by id`, [zoe])).map(m => m.body)
check(await zoeOut(), ['What are you looking for?'], 'the rule started the template')
await q(`select public.lead_simulate($1, 'instagram', 'Zoe', '', 'sofa')`, [bCarress])
await q(`select public.lead_simulate($1, 'instagram', 'Zoe', '', 'later')`, [bCarress])
check((await zoeOut()).slice(-2), ['Your mobile number?', 'Numbers only please.'], 'not a phone: asked again')
await q(`select public.lead_simulate($1, 'instagram', 'Zoe', '', '012-338 4999')`, [bCarress])
await q(`select public.lead_simulate($1, 'instagram', 'Zoe', '', 'Prefer olive green')`, [bCarress])
check((await zoeOut()).slice(-2), ['Anything we should know?', 'Thanks! We’ll be in touch soon 😊'], 'the answer, then the template’s closing message')
const zoeCard = (await q('select interest, note, flow_state, phone from public.lead_contacts where id = $1', [zoe]))[0]
check([zoeCard.interest, zoeCard.note, zoeCard.flow_state, zoeCard.phone], ['Sofa', 'Prefer olive green', 'done', '0123384999'], 'interest and note kept, the phone found, done')
// Still wrong after the tries: to a person.
const yan = (await q(`select public.lead_simulate($1, 'instagram', 'Yan', '', 'hi') c`, [bCarress]))[0].c
await q(`select public.lead_simulate($1, 'instagram', 'Yan', '', 'sofa')`, [bCarress])
await q(`select public.lead_simulate($1, 'instagram', 'Yan', '', 'no')`, [bCarress])
await q(`select public.lead_simulate($1, 'instagram', 'Yan', '', 'still no')`, [bCarress])
const yanCard = (await q('select flow_state, last_dir from public.lead_contacts where id = $1', [yan]))[0]
check([yanCard.flow_state, yanCard.last_dir], ['done', 'in'], 'still wrong: handed to a person, waiting in the Inbox')
// An option that ends says its own closing message.
const xia = (await q(`select public.lead_simulate($1, 'instagram', 'Xia', '', 'hi') c`, [bCarress]))[0].c
await q(`select public.lead_simulate($1, 'instagram', 'Xia', '', 'Just looking')`, [bCarress])
check((await q(`select body from public.lead_messages where contact_id = $1 and direction = 'out' order by id desc limit 1`, [xia]))[0].body, 'No problem, browse away!', 'an option’s own closing message')
// The library: a step, saved again as v2; a template holding v1 is out of date.
const libSave = async (id, data) => (await q('select public.lead_save_library_item($1, $2::jsonb) i', [id, JSON.stringify(data)]))[0].i
await refuses(`select public.lead_save_library_item(null, $1::jsonb)`, [JSON.stringify({ kind: 'step', name: 'Two', steps: tpl })], /a flow is several/, 'a step is one step')
const askPhone = await libSave(null, { kind: 'step', name: 'Ask for phone', description: 'Gets a number', steps: [{ ...tpl[1], next: '' , failNext: 'person' }] })
await saveTpl(sofaTpl, { name: 'Sofa enquiry', endMsg: 'Thanks!', steps: tpl.map(s => (s.id === 's2' ? { ...s, lib: { id: askPhone, ver: 1 } } : s)) })
await libSave(askPhone, { kind: 'step', name: 'Ask for phone', description: 'Gets a number', steps: [{ ...tpl[1], text: 'Your WhatsApp number?', next: '', failNext: 'person' }] })
const lib = (await q('select public.lead_library() l'))[0].l.find(l => l.id === askPhone)
check([lib.ver, lib.usedIn.length, lib.usedIn[0].flowName, lib.usedIn[0].steps, lib.usedIn[0].outdated], [2, 1, 'Sofa enquiry', ['Ask for phone'], 1], 'v2, used in the template, which holds v1')
await q('select public.lead_remove_library_item($1)', [askPhone])
check((await q('select public.lead_library() l'))[0].l.some(l => l.id === askPhone), false, 'removed; the template keeps its copy')
for (const [fn, page] of [['lead_save_template', "'/leads/flows'"], ['lead_save_reply_rules', "'/leads/rules'"], ['lead_save_library_item', "'/leads/flows', '/leads/library'"], ['lead_remove_library_item', "'/leads/library'"]]) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY[${page}], ARRAY['leads.manage']);`), true, `${fn} asks ${page}`)
}
await as(CS_USER, ['leads.view', 'leads.create', 'leads.edit'])
await refuses(`select public.lead_save_template(null, $1::jsonb)`, [JSON.stringify({ name: 'x', steps: tpl })], /Lead View · Manage/, 'templates need Manage')
await refuses(`select public.lead_save_reply_rules('[]'::jsonb, '[]'::jsonb)`, [], /Lead View · Manage/, 'rules need Manage')
await as(CS_USER, ALL)
check((await q(`select count(*)::int n from information_schema.role_table_grants
  where table_name in ('lead_reply_rules','lead_reply_pages','lead_step_library') and grantee in ('anon','authenticated')`))[0].n, 0, 'no grants on the new tables')

// ── AI Agent v2, AI corrections and the Data Center's files (mig 20261023200000; storage is a stand-in here) ──
await db.exec(`create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table if not exists storage.objects (bucket_id text, name text, owner_id uuid);
  create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  do $$ begin if not exists (select 1 from pg_proc where proname = 'has_any_action') then
    create function public.has_any_action(p text[]) returns boolean language sql as 'select true'; end if; end $$;`)
const aiV2 = (await readFile(new URL('../../supabase/migrations/20261023200000_lead_ai_v2.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(aiV2.slice(0, aiV2.indexOf('-- ── The new page, by name')))
await db.exec((await readFile(new URL('../../supabase/migrations/20261023200100_lead_ai_v2_guards.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
await as(CS_USER, ALL)
check((await q(`select public, file_size_limit from storage.buckets where id = 'lead-data'`))[0], { public: false, file_size_limit: 52428800 }, 'a private bucket, 50 MB a file')
// Files and links.
const saveFile = async (id, data) => (await q('select public.lead_save_data_file($1, $2::jsonb) i', [id, JSON.stringify(data)]))[0].i
await refuses(`select public.lead_save_data_file(null, $1::jsonb)`, [JSON.stringify({ kind: 'file', name: 'x.pdf', path: 'files/00000000-0000-4000-8000-000000000001/x.pdf' })], /did not finish uploading/, 'a file not in the bucket')
await refuses(`select public.lead_save_data_file(null, $1::jsonb)`, [JSON.stringify({ kind: 'link', name: 'FAQ', url: 'http://x' })], /https address/, 'a link is https')
const objPath = 'files/00000000-0000-4000-8000-000000000001/Catalogue.pdf'
await db.exec(`insert into storage.objects (bucket_id, name) values ('lead-data', '${objPath}')`)
const catalogue = await saveFile(null, { kind: 'file', name: 'Catalogue.pdf', path: objPath, mime: 'application/pdf', sizeBytes: 4200000, brandId: b2990, category: 'Catalogues', validUntil: '2026-10-31' })
const faqLink = await saveFile(null, { kind: 'link', name: '2990s FAQ', url: 'https://2990s.com.my/faq', category: 'After-sales' })
const carressFile = await saveFile(null, { kind: 'link', name: 'Carress trial', url: 'https://carress.com.my/trial', brandId: bCarress })
let dataFiles = (await q('select public.lead_data_files() f'))[0].f
check(dataFiles.map(f => [f.name, f.kind, f.ver, f.brandId === null]).sort(), [['2990s FAQ', 'link', 1, true], ['Carress trial', 'link', 1, false], ['Catalogue.pdf', 'file', 1, false]], 'two links and a file')
// A new upload on an old file is its next version.
const objPath2 = 'files/00000000-0000-4000-8000-000000000002/Catalogue Nov.pdf'
await db.exec(`insert into storage.objects (bucket_id, name) values ('lead-data', '${objPath2}')`)
await saveFile(catalogue, { kind: 'file', name: 'Catalogue.pdf', path: objPath2, mime: 'application/pdf', sizeBytes: 1000, brandId: b2990, category: 'Catalogues' })
check((await q('select ver, path from public.lead_data_files where id = $1', [catalogue]))[0], { ver: 2, path: objPath2 }, 'a new upload is v2')
// The agent: settings, fixed answers, playbook, sources.
const saveAi = async (brand, data) => q('select public.lead_save_ai($1, $2::jsonb)', [brand, JSON.stringify(data)])
const aiSettings = { goal: 'Get the mobile number.', tone: 'Friendly', toneNote: 'Warm', length: 'Short', rules: ['Customer’s language'], phone: { on: true, after: 2 } }
await refuses(`select public.lead_save_ai($1, $2::jsonb)`, [b2990, JSON.stringify({ settings: aiSettings, answers: [], playbook: [], sources: [{ fileId: carressFile }] })], /brand''s folder or Shared|brand's folder or Shared/, 'another brand’s file')
await saveAi(b2990, { settings: aiSettings, answers: [{ question: 'Penang?', answer: 'Klang Valley only.' }], playbook: [{ name: 'Too expensive', words: 'mahal, 太贵', approaches: ['Mention instalments'], reply: 'We have 0% instalments.' }],
  sources: [{ fileId: catalogue }, { fileId: faqLink, paused: true }] })
let aiMore = (await q('select public.lead_ai_more($1) m', [b2990]))[0].m
check([aiMore.settings.tone, aiMore.answers.map(a => [a.question, a.source]), aiMore.playbook[0].approaches, aiMore.sources.map(s => [s.file.name, s.paused]).sort()],
  ['Friendly', [['Penang?', 'Added by Mei Ling']], ['Mention instalments'], [['2990s FAQ', true], ['Catalogue.pdf', false]]], 'the agent reads back')
check((await q('select goal from public.lead_personas where brand_id = $1', [b2990]))[0].goal, 'Get the mobile number.', 'the soul’s goal follows the settings')
check((await q('select public.lead_data_files() f'))[0].f.find(f => f.id === catalogue).usedBy, [{ brandId: b2990, paused: false }], 'the Data Center says which agent reads it')
// A correction: a corrDraft CS changed, then saved as a fixed answer and edited.
const corrDraft = (await q(`select public.lead_ai_log_draft($1, 'Yes we deliver anywhere.', '[]'::jsonb, false, '', 'test') d`, [aisyah]))[0].d
await q(`select public.lead_ai_draft_kept($1, 'edited', 'Only within the Klang Valley for now.')`, [corrDraft])
let corrList = (await q('select public.lead_ai_corrections($1, 30) c', [b2990]))[0].c
check([corrList.length, corrList[0].wrong, corrList[0].right, corrList[0].answerId, typeof corrList[0].question], [1, 'Yes we deliver anywhere.', 'Only within the Klang Valley for now.', null, 'string'], 'the correction, with the customer’s message')
aiMore = (await q('select public.lead_ai_more($1) m', [b2990]))[0].m
await saveAi(b2990, { settings: aiSettings, answers: [...aiMore.answers, { question: corrList[0].question, answer: corrList[0].right, draftId: String(corrDraft) }], playbook: aiMore.playbook, sources: aiMore.sources.map(s => ({ fileId: s.fileId, paused: s.paused })) })
corrList = (await q('select public.lead_ai_corrections($1, null) c', [b2990]))[0].c
aiMore = (await q('select public.lead_ai_more($1) m', [b2990]))[0].m
const fromCorr = aiMore.answers.find(a => a.draftId === corrDraft)
check([corrList[0].answerId === fromCorr.id, fromCorr.source.startsWith('From a correction'), fromCorr.editedAt], [true, true, null], 'saved as a fixed answer, linked to its correction')
await saveAi(b2990, { settings: aiSettings, answers: aiMore.answers.map(a => (a.id === fromCorr.id ? { ...a, answer: 'Klang Valley and Seremban.' } : a)), playbook: aiMore.playbook, sources: aiMore.sources.map(s => ({ fileId: s.fileId, paused: s.paused })) })
aiMore = (await q('select public.lead_ai_more($1) m', [b2990]))[0].m
check([aiMore.answers.find(a => a.id === fromCorr.id).answer, !!aiMore.answers.find(a => a.id === fromCorr.id).editedAt, corrList[0].right], ['Klang Valley and Seremban.', true, 'Only within the Klang Valley for now.'], 'edited later: stamped; the correction keeps what CS sent')
// A dismissed corrDraft keeps no text; removing a file takes it off every agent.
const corrDraft2 = (await q(`select public.lead_ai_log_draft($1, 'x', '[]'::jsonb, false, '', 'test') d`, [aisyah]))[0].d
await q(`select public.lead_ai_draft_kept($1, 'dismissed', 'ignored')`, [corrDraft2])
check((await q('select sent_text from public.lead_ai_drafts where id = $1', [corrDraft2]))[0].sent_text, null, 'a dismissed corrDraft keeps no text')
await q('select public.lead_remove_data_file($1)', [faqLink])
check((await q('select public.lead_ai_more($1) m', [b2990]))[0].m.sources.map(s => s.file.name), ['Catalogue.pdf'], 'a removed file leaves every agent')
for (const [fn, pages, want] of [['lead_save_ai', "'/leads/ai', '/leads/corrections'", 'leads.manage'], ['lead_save_data_file', "'/leads/knowledge'", 'leads.manage'], ['lead_remove_data_file', "'/leads/knowledge'", 'leads.manage'], ['lead_ai_draft_kept', "'/leads'", 'leads.create']]) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY[${pages}], ARRAY['${want}']);`), true, `${fn} asks ${pages}`)
}
await as(CS_USER, ['leads.view', 'leads.create', 'leads.edit'])
await refuses(`select public.lead_save_ai($1, '{"settings":{},"answers":[],"playbook":[],"sources":[]}'::jsonb)`, [b2990], /Lead View · Manage/, 'the agent needs Manage')
await refuses(`select public.lead_remove_data_file($1)`, [catalogue], /Lead View · Manage/, 'the Data Center needs Manage')
await as(CS_USER, ALL)
check((await q(`select count(*)::int n from information_schema.role_table_grants
  where table_name in ('lead_ai_answers','lead_ai_playbook','lead_data_files','lead_ai_sources') and grantee in ('anon','authenticated')`))[0].n, 0, 'no grants on the new tables')

// ── Data Center › Quick replies (mig 20261023300000) ──
await db.exec((await readFile(new URL('../../supabase/migrations/20261023300000_lead_quick_replies.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
await db.exec((await readFile(new URL('../../supabase/migrations/20261023300100_lead_quick_replies_guards.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
const saveQuick = rows => q('select public.lead_save_quick_replies($1::jsonb)', [JSON.stringify(rows)])
await saveQuick([{ shortcut: '/instal', body: '0% for 12 months.' }, { shortcut: '/kl', brandId: b2990, body: 'Our KL showroom.' }])
let quickList = (await q('select public.lead_quick_replies() r'))[0].r
check(quickList.map(r => [r.shortcut, r.brandId, r.used]), [['/instal', null, 0], ['/kl', b2990, 0]], 'quick replies saved, in order')
await q('select public.lead_quick_reply_used($1)', [quickList[0].id])
await saveQuick([{ id: quickList[1].id, shortcut: '/kl', brandId: b2990, body: 'KL, open 10–10.' }, { id: quickList[0].id, shortcut: '/instal', body: '0% for 12 months.' }])
quickList = (await q('select public.lead_quick_replies() r'))[0].r
check(quickList.map(r => [r.shortcut, r.body, r.used]), [['/kl', 'KL, open 10–10.', 0], ['/instal', '0% for 12 months.', 1]], 'edited and reordered; a use is counted and kept')
await saveQuick([{ id: quickList[1].id, shortcut: '/instal', body: '0% for 12 months.' }, { shortcut: '/kl', body: 'Every brand.' }])
check((await q('select count(*)::int n from public.lead_quick_replies'))[0].n, 2, 'one left out is removed; the same shortcut for every brand is another row')
await refuses('select public.lead_save_quick_replies($1::jsonb)', [JSON.stringify([{ shortcut: 'instal', body: 'x' }])], /shortcut like/, 'a shortcut starts with /')
await refuses('select public.lead_save_quick_replies($1::jsonb)', [JSON.stringify([{ shortcut: '/a', body: 'x' }, { shortcut: '/a', body: 'y' }])], /same shortcut/, 'one shortcut once per brand')
for (const [fn, pages, want] of [['lead_save_quick_replies', "'/leads/knowledge'", 'leads.manage'], ['lead_quick_reply_used', "'/leads'", 'leads.create']]) {
  const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY[${pages}], ARRAY['${want}']);`), true, `${fn} asks ${pages}`)
}
await as(CS_USER, ['leads.view', 'leads.create', 'leads.edit'])
await refuses('select public.lead_save_quick_replies($1::jsonb)', ['[]'], /Lead View · Manage/, 'quick replies need Manage')
await q('select public.lead_quick_reply_used($1)', [quickList[1].id])
await as(CS_USER, ALL)
check((await q(`select count(*)::int n from information_schema.role_table_grants where table_name = 'lead_quick_replies' and grantee in ('anon','authenticated')`))[0].n, 0, 'no grants on quick replies')

// ── Step 6: Campaigns' filters and Bought, consent, Insight's replies and steps, the Audit log tab (mig 20261023400000) ──
const step6 = (await readFile(new URL('../../supabase/migrations/20261023400000_lead_step6.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
await db.exec(step6.slice(0, step6.indexOf('-- ── The Audit log page, by name')))
check(step6.includes("('/leads/audit', 'lead.audit')") && step6.includes("('lead.audit', 'view', 'leads.view')"), true, 'the Audit log page is registered by name')
{
  const consentRows = (await q('select public.lead_consent() c'))[0].c
  check(Array.isArray(consentRows) && consentRows.every(r => ['in', 'none', 'out'].includes(r.optIn) && r.n > 0), true, 'consent counts per brand and opt-in')
  const camps = (await q('select public.lead_campaigns() c'))[0].c
  check(camps.every(k => typeof k.bought === 'number'), true, 'every campaign says how many bought')
  // The two "did not buy" filters narrow the audience.
  const all = (await q(`select count(*)::int n from public.lead_audience($1, 'all', '{"days":3650,"tests":true}'::jsonb)`, [b2990]))[0].n
  const notBought = (await q(`select count(*)::int n from public.lead_audience($1, 'all', '{"days":3650,"tests":true,"notBought":true}'::jsonb)`, [b2990]))[0].n
  const closedOnes = (await q(`select count(*)::int n from public.lead_contacts where brand_id = $1 and closed_at is not null`, [b2990]))[0].n
  check(notBought, all - closedOnes, 'Did not buy yet leaves out the closed')
  const cameNot = (await q(`select count(*)::int n from public.lead_audience($1, 'all', '{"days":3650,"tests":true,"cameNotBought":true}'::jsonb)`, [b2990]))[0].n
  const cameOpen = (await q(`select count(*)::int n from public.lead_contacts where brand_id = $1 and (came_at is not null or shown = 'came') and closed_at is null`, [b2990]))[0].n
  check(cameNot, cameOpen, 'Came but did not buy is exactly those')
  const more = (await q('select public.lead_insight_more(null, null) m'))[0].m
  check([Array.isArray(more.replies), Array.isArray(more.steps), more.replies.length], [true, true, (await q('select count(*)::int n from public.lead_contacts'))[0].n], 'insight: one reply row per conversation, and the template steps')
  check(more.replies.every(r => r.by === null || ['cs', 'template', 'ai'].includes(r.by)), true, 'who answered first is CS, a template or the AI Agent')
  check((await q(`select public.lead_insight_more('2000-01-01', '2000-01-02') m`))[0].m.replies.length, 0, 'insight keeps to its office days')
  await as(CS_USER, [])
  await refuses('select public.lead_consent()', [], /Lead View · View/, 'consent needs Lead View · View')
  await refuses('select public.lead_insight_more(null, null)', [], /Lead View · View/, 'insight needs Lead View · View')
  await as(CS_USER, ALL)
}

// ── General info: any category can be deleted (mig 20261023500000) ──
await db.exec((await readFile(new URL('../../supabase/migrations/20261023500000_lead_info_any_category.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
{
  const before = (await q('select public.lead_info() i'))[0].i
  const delivery = before.cats.find(c => c.label === 'Delivery')
  check(!!delivery && delivery.custom === false, true, 'Delivery is a seeded category')
  await saveInfo({ cats: before.cats.filter(c => c.id !== delivery.id), cards: before.cards.filter(c => c.catId !== delivery.id) })
  const after = (await q('select public.lead_info() i'))[0].i
  check([after.cats.some(c => c.id === delivery.id), after.cats.length], [false, before.cats.length - 1], 'a seeded category the save leaves out is deleted')
  check((await q('select deleted_at is not null d from public.lead_info_cats where id = $1', [delivery.id]))[0].d, true, 'soft-deleted, as a custom one')
  await saveInfo({ cats: after.cats, cards: after.cards })
  check((await q('select public.lead_info() i'))[0].i.cats.length, after.cats.length, 'the rest stay')
}

// ── Data Center files in R2 (mig 20261026100000): the bucket is R2's, the save asks public.file_objects ──
await db.exec(`
  create table if not exists public.file_buckets (id text primary key, public boolean not null default false, file_size_limit bigint,
    allowed_mime_types text[], backend text not null default 'supabase', public_url text, created_at timestamptz default now());
  create table if not exists public.file_objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
    owner uuid, owner_id text, metadata jsonb default '{}'::jsonb, created_at timestamptz default now(), unique (bucket_id, name));
  alter table storage.objects add column if not exists id uuid default gen_random_uuid();
  alter table storage.objects add column if not exists owner uuid;
  alter table storage.objects add column if not exists metadata jsonb;
  alter table storage.objects add column if not exists created_at timestamptz default now();
  alter table storage.objects alter column owner_id type text using owner_id::text;
`)
{
  const before = (await q(`select md5(prosrc) m from pg_proc where oid = 'public.lead_save_data_file(uuid, jsonb)'::regprocedure`))[0].m
  const leadR2 = (await readFile(new URL('../../supabase/migrations/20261026100000_lead_data_r2.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
  // The test database's body differs from production's only if a migration drifted: say so instead of skipping.
  check(before, 'ada0e52d0a74b57e6859a9042a9d4053', 'lead_save_data_file here is production’s body (the move is written against it)')
  await db.exec(leadR2)
  check((await q(`select backend, file_size_limit from public.file_buckets where id = 'lead-data'`))[0], { backend: 'r2', file_size_limit: 52428800 }, 'lead-data is an R2 bucket, 50 MB a file')
  const src = (await q(`select prosrc from pg_proc where oid = 'public.lead_save_data_file(uuid, jsonb)'::regprocedure`))[0].prosrc
  check([src.includes('storage.objects'), src.includes('public.file_objects'), src.includes('tab_write_guard')], [false, true, true], 'the save asks file_objects, its page guard kept')
  check((await q(`select count(*)::int n from pg_policies where tablename = 'file_objects' and policyname in ('lead_data_upload', 'lead_data_read')`))[0].n, 2, 'the bucket’s two policies on file_objects')
  const r2Path = `files/${'5'.repeat(8)}-5555-5555-5555-${'5'.repeat(12)}/price-list.pdf`
  await refuses(`select public.lead_save_data_file(null, $1::jsonb)`, [JSON.stringify({ kind: 'file', name: 'Price list', path: r2Path })], /did not finish uploading/, 'a file not in file_objects has not arrived')
  await db.exec(`insert into public.file_objects (bucket_id, name) values ('lead-data', '${r2Path}')`)
  const r2File = (await q(`select public.lead_save_data_file(null, $1::jsonb) id`, [JSON.stringify({ kind: 'file', name: 'Price list', path: r2Path, mime: 'application/pdf', sizeBytes: 1200 })]))[0].id
  check(typeof r2File, 'string', 'a file in file_objects is saved')
}

// ── Messenger connected (mig 20261026110000 + its guards): the webhook's ingest, the templates' outbox, a reply sent ──
{
  const msgr = f => readFile(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  await db.exec(await msgr('20261026110000_lead_messenger.sql'))
  await db.exec(await msgr('20261026110100_lead_messenger_guards.sql'))
  const P2990 = '946946021838962', PCARRES = '504171022789980'
  await db.exec(`update public.lead_brands set fb_page_id = '${P2990}' where id = '${b2990}';
    update public.lead_brands set fb_page_id = '${PCARRES}' where id = '${bCarress}';
    update public.lead_brands set fb_page_id = null where id = '${bMini}'`)
  const ingest = async msgs => (await q('select public.lead_ingest_messenger($1::jsonb) r', [JSON.stringify(msgs)]))[0].r
  const msg = (mid, pageId, psid, body, extra = {}) => ({ externalId: mid, pageId, psid, name: 'Nur Iman', kind: 'text', body, sentAt: '2026-10-28T03:00:00Z', ad: null, ...extra })
  const contactOf = async psid => (await q(`select id, brand_id, page_id, name, is_test, phone, phone_state from public.lead_contacts where channel = 'messenger' and external_id = $1`, [psid]))

  // A new customer from a "mini" ad on the 2990s Page is 2990s mini's; their next message finds the same conversation.
  const r1 = await ingest([msg('m.001', P2990, '7700001', '你好', { ad: { sourceId: '120210000000077', headline: 'Mini Sofa Week', sourceUrl: null, media: 'video' } })])
  check([r1.messages, r1.ignored, r1.contacts.length], [1, 0, 1], 'one message, one conversation')
  const [iman] = await contactOf('7700001')
  check([iman.brand_id, iman.page_id, iman.name, iman.is_test], [bMini, P2990, 'Nur Iman', false], 'a mini ad’s customer is 2990s mini’s, with the Page kept')
  const r2 = await ingest([msg('m.002', P2990, '7700001', '我的號碼 012-338 4721'), msg('m.002', P2990, '7700001', 'again')])
  check([r2.messages, r2.ignored], [1, 1], 'the same mid twice is taken once')
  const after2 = await contactOf('7700001')
  check(after2.length, 1, 'the next message finds the same conversation')
  check([after2[0].phone, after2[0].phone_state], ['0123384721', 'detected'], 'a phone in the message is found')
  const events = (await q(`select what from public.lead_events where contact_id = $1 order by id`, [iman.id])).map(e => e.what)
  check([events.includes('Came in from the ad Mini Sofa Week'), events.includes('Phone found in the message')], [true, true], 'the timeline says how they came and the phone')

  // An attachment with no words, a Page no brand names, a PSID that is not one, and Carress's own Page.
  const r3 = await ingest([
    msg('m.003', PCARRES, '7700002', null, { kind: 'image' }),
    msg('m.004', '999999999', '7700003', 'hi'),
    msg('m.005', P2990, 'abc', 'hi'),
  ])
  check([r3.messages, r3.ignored], [1, 2], 'an unknown Page and a bad PSID are ignored')
  const [carres] = await contactOf('7700002')
  check(carres.brand_id, bCarress, 'Carress’s Page is Carress’s')
  check((await q(`select body from public.lead_messages where external_id = 'm.003'`))[0].body, '[Photo]', 'a photo with no words reads [Photo]')

  // The outbox: what a template wrote in the last ten minutes, real Messenger conversations only; Meta's answer kept.
  await db.exec(`insert into public.lead_messages (contact_id, direction, sender, body, buttons)
    values ('${iman.id}', 'out', 'flow', 'Which one?', '["3-seater","L-shape"]'::jsonb)`)
  const out = (await q('select public.lead_outbox($1::uuid[]) o', [[iman.id, carres.id]]))[0].o
  const ours = out.filter(o => o.body === 'Which one?')
  check(ours.map(o => [o.pageId, o.psid, o.buttons]), [[P2990, '7700001', ['3-seater', 'L-shape']]], 'the template’s message, with its Page, customer and buttons')
  check(out.every(o => o.pageId && o.psid && o.lastInAt), true, 'every outgoing message knows where it goes and the window')
  await q('select public.lead_outbox_done($1::jsonb)', [JSON.stringify([...out.filter(o => o !== ours[0]).map(o => ({ id: o.id, error: 'Outside the window' })), { id: ours[0].id, mid: 'm_out_1' }])])
  check((await q(`select delivery, external_id from public.lead_messages where id = $1`, [ours[0].id]))[0], { delivery: 'sent', external_id: 'm_out_1' }, 'sent: Meta’s id kept')
  check((await q('select public.lead_outbox($1::uuid[]) o', [[iman.id, carres.id]]))[0].o, [], 'nothing goes twice')
  await db.exec(`update public.lead_contacts set is_test = true where id = '${carres.id}';
    insert into public.lead_messages (contact_id, direction, sender, body) values ('${carres.id}', 'out', 'flow', 'test only')`)
  check((await q('select public.lead_outbox($1::uuid[]) o', [[carres.id]]))[0].o, [], 'a test conversation sends nothing')

  // Customer Service's reply: recorded first, then where it goes, then what Meta said — the caller's own reply only.
  await as(CS_USER, ALL)
  const reply = (await q(`select public.lead_reply($1, 'Ya, ada stok') r`, [iman.id]))[0].r
  const replyId = typeof reply === 'object' && reply !== null ? reply.id : reply
  const target = (await q('select public.lead_reply_target($1::bigint) t', [replyId]))[0].t
  check([target.channel, target.pageId, target.psid, target.isTest], ['messenger', P2990, '7700001', false], 'the reply goes to the customer through their Page')
  await as(OTHER, ALL)
  check((await q('select public.lead_reply_target($1::bigint) t', [replyId]))[0].t, null, 'somebody else’s reply is not theirs to send')
  await q(`select public.lead_reply_sent($1::bigint, 'm_x', null)`, [replyId])
  check((await q(`select delivery from public.lead_messages where id = $1`, [replyId]))[0].delivery, 'recorded', 'nor theirs to mark sent')
  await as(CS_USER, ['leads.view'])
  await refuses(`select public.lead_reply_sent($1::bigint, 'm_x', null)`, [replyId], /Lead View · Create/, 'marking it sent needs Create')
  await as(CS_USER, ALL)
  await q(`select public.lead_reply_sent($1::bigint, null, 'More than 24 hours since the customer’s last message')`, [replyId])
  check((await q(`select delivery, delivery_error from public.lead_messages where id = $1`, [replyId]))[0], { delivery: 'failed', delivery_error: 'More than 24 hours since the customer’s last message' }, 'not sent: why is kept')
  check((await q('select public.lead_reply_target($1::bigint) t', [replyId]))[0].t, null, 'an answered reply is not sent again')
  const src = (await q(`select prosrc from pg_proc where proname = 'lead_reply_sent'`))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY['/leads'], ARRAY['leads.create']);`), true, 'lead_reply_sent asks the Inbox')
}

// ── 2990s mini by the ad's ad account (mig 20261027100010): the account's name decides, the headline still does ──
{
  const src0 = (await q(`select md5(prosrc) m from pg_proc where oid = 'public.lead_ingest_messenger(jsonb)'::regprocedure`))[0].m
  check(src0, 'ccd998d3be8787fed944ba376ab48600', 'lead_ingest_messenger here is production’s body (the swap is written against it)')
  const mig = (await readFile(new URL('../../supabase/migrations/20261027100010_lead_mini_by_ad_account.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(mig)
  await db.exec(mig) // twice: the second finds it in place
  const P = '946946021838962'
  const one = async (mid, psid, ad) => (await q('select public.lead_ingest_messenger($1::jsonb) r', [JSON.stringify([
    { externalId: mid, pageId: P, psid, name: 'Customer ' + psid, kind: 'text', body: 'hi', sentAt: '2026-10-28T03:00:00Z', ad },
  ])]))[0].r
  const brandOf = async psid => (await q(`select brand_id from public.lead_contacts where channel = 'messenger' and external_id = $1`, [psid]))[0]?.brand_id
  await one('m.101', '7700101', { sourceId: '120210000000101', headline: 'Chat with us', sourceUrl: null, media: 'video', account: "2990's Mini@Kelana Jaya" })
  check(await brandOf('7700101'), bMini, 'an ad from a Mini ad account is 2990s mini’s, whatever its headline')
  await one('m.102', '7700102', { sourceId: '120210000000102', headline: 'Chat with us', sourceUrl: null, media: 'video', account: '2990s Main' })
  check(await brandOf('7700102'), b2990, 'an ad from another account stays the Page’s brand')
  await one('m.103', '7700103', { sourceId: '120210000000103', headline: '2990’s mini 来 Kelana Jaya 啦', sourceUrl: null, media: 'image', account: null })
  check(await brandOf('7700103'), bMini, 'no account known: the headline still decides')
  await one('m.104', '7700104', null)
  check(await brandOf('7700104'), b2990, 'no ad: the Page’s brand')
  await one('m.105', '7700101', { sourceId: '120210000000555', headline: 'x', sourceUrl: null, media: null, account: '2990s Main' })
  check(await brandOf('7700101'), bMini, 'a conversation already begun stays where it began')
}

// ── Instagram Direct (mig 20261027110010): the brand by its Instagram account, the Page kept for replies, the outbox ──
{
  const o0 = (await q(`select md5(prosrc) m from pg_proc where oid = 'public.lead_outbox(uuid[])'::regprocedure`))[0].m
  check(o0, 'c1ca0feb687a89ec8e960d7579687979', 'lead_outbox here is production’s body (the swap is written against it)')
  const mig = (await readFile(new URL('../../supabase/migrations/20261027110010_lead_instagram.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(mig)
  await db.exec(mig) // twice: the outbox swap finds itself in place
  const IG = '17841400000000001', P = '946946021838962'
  await db.exec(`update public.lead_brands set ig_account_id = '${IG}' where id = '${b2990}'`)
  const ig = async msgs => (await q('select public.lead_ingest_instagram($1::jsonb) r', [JSON.stringify(msgs)]))[0].r
  const msg = (mid, psid, extra = {}) => ({ externalId: mid, pageId: IG, psid, name: 'insta_' + psid, kind: 'text', body: 'hi', sentAt: '2026-10-28T03:00:00Z', ad: null, ...extra })
  const row = async psid => (await q(`select id, brand_id, channel, page_id, name from public.lead_contacts where channel = 'instagram' and external_id = $1`, [psid]))[0]
  const r1 = await ig([msg('ig.1', '8800001'), msg('ig.1', '8800001'), { ...msg('ig.2', '8800009'), pageId: '17841499999999999' }])
  check([r1.messages, r1.ignored], [1, 2], 'one taken: the same mid twice and an account no brand names are ignored')
  const c1 = await row('8800001')
  check([c1.brand_id, c1.channel, c1.page_id, c1.name], [b2990, 'instagram', P, 'insta_8800001'], 'the brand by its Instagram account, its Facebook Page kept for replies')
  await ig([msg('ig.3', '8800002', { ad: { sourceId: '120210000000301', headline: 'Chat with us', sourceUrl: null, media: 'video', account: "2990's Mini@Kelana Jaya" } })])
  check((await row('8800002')).brand_id, bMini, 'a mini ad account’s Instagram customer is 2990s mini’s')
  check((await q(`select what from public.lead_events where contact_id = $1 order by id limit 1`, [c1.id]))[0].what, 'Came in on Instagram', 'the timeline says Instagram')
  await db.exec(`insert into public.lead_messages (contact_id, direction, sender, body) values ('${c1.id}', 'out', 'flow', 'Hello on IG')`)
  const out = (await q('select public.lead_outbox($1::uuid[]) o', [[c1.id]]))[0].o
  check(out.filter(x => x.body === 'Hello on IG').map(x => [x.pageId, x.psid]), [[P, '8800001']], 'the outbox sends Instagram conversations through the Page')
  check((await q(`select has_function_privilege('authenticated', 'public.lead_ingest_instagram(jsonb)', 'execute') a`))[0].a, false, 'the Instagram ingest is the service role’s alone')
}

// ── Handed to the sales group (mig 20261027120000 + its guards): nobody named, still handed, the page asked ──
{
  const f = n => readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  await db.exec(await f('20261027120000_lead_handoff_group.sql'))
  await db.exec(await f('20261027120100_lead_handoff_group_guards.sql'))
  await as(CS_USER, ALL)
  const g = (await q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: 'grp.1', pageId: '946946021838962', psid: '7700201', name: 'Group Lead', kind: 'text', body: 'hi', sentAt: '2026-10-28T03:00:00Z', ad: null },
  ])]))[0].r.contacts[0]
  await refuses(`select public.lead_handoff_group($1)`, [g], /phone before handing/, 'no phone, no hand-over')
  await q(`select public.lead_ingest_messenger($1::jsonb)`, [JSON.stringify([
    { externalId: 'grp.2', pageId: '946946021838962', psid: '7700201', name: 'Group Lead', kind: 'text', body: '012-338 4721', sentAt: '2026-10-28T03:01:00Z', ad: null },
  ])])
  await as(CS_USER, ['leads.view', 'leads.create'])
  await refuses(`select public.lead_handoff_group($1)`, [g], /Lead View · Edit/, 'handing over needs Edit')
  await as(CS_USER, ALL)
  await q(`select public.lead_handoff_group($1)`, [g])
  const row = (await q(`select handed_sales_id, handed_at is not null handed, phone_state, handed_by_name from public.lead_contacts where id = $1`, [g]))[0]
  check([row.handed_sales_id, row.handed, row.phone_state], [null, true, 'confirmed'], 'handed with nobody named, the phone confirmed')
  check((await q(`select what from public.lead_events where contact_id = $1 order by id desc limit 1`, [g]))[0].what, 'Handed to the sales group', 'the timeline says so')
  await q(`select public.lead_handoff_group($1)`, [g])
  check((await q(`select what from public.lead_events where contact_id = $1 order by id desc limit 1`, [g]))[0].what, 'Handed again, to the sales group', 'handed again says again')
  const card = (await q(`select public.lead_thread($1) t`, [g]))[0].t
  const contact = card.contact ?? card
  check([!!contact.handedAt, contact.handedSalesName ?? null], [true, null], 'the card reads handed with no salesperson')
  await refuses(`update public.lead_contacts set handed_sales_id = (select id from public.lead_sales limit 1), handed_at = null where id = $1`, [g], /lead_contacts_handed|check constraint/, 'a salesperson is never named on a lead not handed')
  const src = (await q(`select prosrc from pg_proc where proname = 'lead_handoff_group'`))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY['/leads'], ARRAY['leads.edit']);`), true, 'it asks the Inbox')
}

// ── The Page's own replies (mig 20261027130000): kept on a conversation Lead View has, as sent, Answered ──
{
  await db.exec((await readFile(new URL('../../supabase/migrations/20261027130000_lead_page_replies.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
  const P = '946946021838962'
  const r0 = (await q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: 'pr.in.1', pageId: P, psid: '7700301', name: 'Lee Hwa Ong', kind: 'text', body: 'Where is the store located?', sentAt: '2026-10-27T01:50:00Z', ad: null },
  ])]))[0].r
  const c = r0.contacts[0]
  const pr = async rows => (await q(`select public.lead_ingest_page_replies($1::jsonb) r`, [JSON.stringify(rows)]))[0].r
  const reply = (mid, psid, extra = {}) => ({ externalId: mid, pageId: P, psid, kind: 'text', body: "We're in PJ New Town!", sentAt: '2026-10-27T01:53:00Z', ...extra })
  const r1 = await pr([reply('pr.out.1', '7700301'), reply('pr.out.1', '7700301'), reply('pr.out.2', '7700399'), { ...reply('pr.out.3', '7700301'), pageId: '999999999' }])
  check([r1.messages, r1.ignored], [1, 3], 'kept once; a customer Lead View lacks and a Page no brand names are left out')
  const m = (await q(`select direction, sender, by_name, delivery, external_id from public.lead_messages where external_id = 'pr.out.1'`))[0]
  check([m.direction, m.sender, m.by_name, m.delivery], ['out', 'page', 'Business Suite', 'sent'], 'kept as the Page’s, sent')
  check((await q(`select last_dir from public.lead_contacts where id = $1`, [c]))[0].last_dir, 'out', 'the conversation reads answered')
  await pr([{ ...reply('pr.out.4', '7700301'), body: null, kind: 'image' }])
  check((await q(`select body from public.lead_messages where external_id = 'pr.out.4'`))[0].body, '[Photo]', 'a photo with no words reads [Photo]')
  check((await q(`select has_function_privilege('authenticated', 'public.lead_ingest_page_replies(jsonb)', 'execute') a`))[0].a, false, 'the service role’s alone')
}

// ── Photos and files (mig 20261027140000 + its guards): a sent file on its reply, a customer's attachment kept ──
{
  const f = n => readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  const before = (await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_thread','lead_ingest_messenger','lead_ingest_instagram') order by 1`)).map(r => [r.proname, r.m])
  check(before, [['lead_ingest_instagram', '95240bef30c3140ab143b940f1f77ffd'], ['lead_ingest_messenger', '816bacb8113b7a232f43035efb411aef'], ['lead_thread', 'cf7fc34fc94286819682cd3a08bd1e51']], 'the three bodies here are production’s (the swaps are written against them)')
  await db.exec(await f('20261027140010_lead_media.sql'))
  await db.exec(await f('20261027140100_lead_media_guards.sql'))
  const P = '946946021838962'
  await as(CS_USER, ALL)
  const c = (await q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: 'md.in.1', pageId: P, psid: '7700501', name: 'Photo Lead', kind: 'image', body: null, mediaUrl: 'https://scontent.xx.fbcdn.net/v/t1/abc.jpg', sentAt: '2026-10-27T03:00:00Z', ad: null },
  ])]))[0].r.contacts[0]
  check((await q(`select body, media_url from public.lead_messages where external_id = 'md.in.1'`))[0], { body: '[Photo]', media_url: 'https://scontent.xx.fbcdn.net/v/t1/abc.jpg' }, 'a customer’s photo keeps Meta’s address')
  const path = `chat/${c}/11111111-1111-4111-8111-111111111111-floor plan.pdf`
  await refuses(`select public.lead_reply_media($1, $2, 'application/pdf', '')`, [c, path], /did not finish uploading/, 'a file not in the bucket has not arrived')
  await db.exec(`insert into public.file_objects (bucket_id, name) values ('lead-media', '${path.replace(/'/g, "''")}')`)
  await refuses(`select public.lead_reply_media($1, $2, 'application/pdf', '')`, [c, `chat/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}/x.pdf`], /not this conversation/, 'another conversation’s file is refused')
  const id = (await q(`select public.lead_reply_media($1, $2, 'application/pdf', '') id`, [c, path]))[0].id
  const m = (await q(`select direction, sender, body, media_path, media_mime, delivery from public.lead_messages where id = $1`, [id]))[0]
  check([m.direction, m.sender, m.body, m.media_path, m.media_mime, m.delivery], ['out', 'cs', '[File] floor plan.pdf', path, 'application/pdf', 'recorded'], 'recorded as CS’s reply with its file')
  const t = (await q(`select public.lead_thread($1) t`, [c]))[0].t
  const last = t.messages[t.messages.length - 1]
  check([last.mediaPath, last.mediaMime, t.messages[0].mediaUrl], [path, 'application/pdf', 'https://scontent.xx.fbcdn.net/v/t1/abc.jpg'], 'the thread hands the files to the screen')
  await as(CS_USER, ['leads.view'])
  await refuses(`select public.lead_reply_media($1, $2, 'application/pdf', 'hi')`, [c, path], /Lead View · Create/, 'sending a file needs Create')
  await as(CS_USER, ALL)
  const src = (await q(`select prosrc from pg_proc where proname = 'lead_reply_media'`))[0].prosrc
  check(src.includes(`PERFORM public.tab_write_guard(ARRAY['/leads'], ARRAY['leads.create']);`), true, 'it asks the Inbox')
}

// ── Each conversation's own CS (mig 20261027150000): a mark — everybody still sees everything ──
{
  const f = n => readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  await db.exec(`alter table public.users add column if not exists is_active boolean not null default true`)
  await db.exec(await f('20261027150000_lead_owner.sql'))
  const CS = ['leads.view', 'leads.create', 'leads.edit']
  const P = '946946021838962'
  const c = (await q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: 'own.1', pageId: P, psid: '7700601', name: 'Owner Test', kind: 'text', body: 'hi', sentAt: '2026-10-27T03:00:00Z', ad: null },
  ])]))[0].r.contacts[0]
  await as(OTHER, CS)
  await q(`select public.lead_reply($1, 'Hi, I can help')`, [c])
  check((await q(`select assigned_to from public.lead_contacts where id = $1`, [c]))[0].assigned_to, OTHER, 'the first CS to reply takes it')
  check((await q(`select what from public.lead_events where contact_id = $1 order by id desc limit 1`, [c]))[0].what.startsWith('Taken by '), true, 'the timeline says who took it')
  await as(CS_USER, CS)
  check(((await q(`select public.lead_inbox() i`))[0].i).some(x => x.id === c), true, 'another CS still sees it')
  await q(`select public.lead_reply($1, 'me too')`, [c])
  check((await q(`select assigned_to from public.lead_contacts where id = $1`, [c]))[0].assigned_to, OTHER, 'and replying does not take it from its CS')
  await refuses(`select public.lead_assign($1, $2)`, [c, CS_USER], /Lead View · Manage/, 'only Manage gives a conversation')
  await as(CS_USER, ALL)
  await q(`select public.lead_assign($1, $2)`, [c, CS_USER])
  const t = (await q(`select public.lead_thread($1) t`, [c]))[0].t
  check([t.contact.assignedTo, !!t.contact.assignedName], [CS_USER, true], 'given to another CS; the card says who')
  await q(`select public.lead_assign($1, null)`, [c])
  check((await q(`select assigned_to from public.lead_contacts where id = $1`, [c]))[0].assigned_to, null, 'given back to nobody')
  await q(`select public.lead_reply($1, 'Principal here')`, [c])
  check((await q(`select assigned_to from public.lead_contacts where id = $1`, [c]))[0].assigned_to, null, 'Manage replying takes nothing')
}

// ── The Inbox's unread count (mig 20261027160000): the customer's messages since the last one that went out ──
{
  const f = n => readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  const before = (await q(`select md5(prosrc) m from pg_proc where proname = 'lead_inbox'`))[0].m
  check(before, '68e0e08f58deaba5ffe0466f283e6483', 'lead_inbox here is production’s body')
  await db.exec(await f('20261027160000_lead_unread.sql'))
  await db.exec(await f('20261027160000_lead_unread.sql'))
  const P = '946946021838962'
  const say = (id, body) => q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: id, pageId: P, psid: '7700701', name: 'Unread Test', kind: 'text', body, sentAt: '2026-10-27T04:00:00Z', ad: null },
  ])])
  const c = (await say('un.1', 'hi'))[0].r.contacts[0]
  await say('un.2', 'price?')
  await say('un.3', 'anyone?')
  await as(CS_USER, ALL)
  const unread = async () => ((await q(`select public.lead_inbox() i`))[0].i).find(x => x.id === c).unread
  check(await unread(), 3, 'three from the customer, nothing back: 3')
  await q(`select public.lead_reply($1, 'Hi! Which sofa?')`, [c])
  check(await unread(), 0, 'answered: 0')
  await say('un.4', 'L shape')
  check(await unread(), 1, 'a new message after the answer: 1')
  await q(`select public.lead_ingest_page_replies($1::jsonb)`, [JSON.stringify([{ externalId: 'un.p1', pageId: P, psid: '7700701', body: 'From Business Suite', sentAt: '2026-10-27T04:05:00Z' }])])
  check(await unread(), 0, 'the Page answering from Business Suite clears it too')

  // ── Opening a chat clears it for whoever opened it (mig 20261027170000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_inbox'`))[0].m, '195d52d07d2f977a82ad8fb13c66d5a1', 'lead_inbox here is production’s body after 160000')
  await db.exec(await f('20261027170000_lead_seen.sql'))
  await db.exec(await f('20261027170000_lead_seen.sql'))
  await say('un.5', 'hello?')
  await say('un.6', 'still there?')
  check(await unread(), 2, 'two new: 2')
  await q(`select public.lead_mark_seen($1)`, [c])
  check(await unread(), 0, 'opened: 0, no answer needed')
  await as(OTHER, ALL)
  check(await unread(), 2, 'somebody else who has not opened it still sees 2')
  await as(CS_USER, ALL)
  await say('un.7', 'ok thanks')
  check(await unread(), 1, 'a message after opening: 1')
  await as(CS_USER, [])
  await refuses(`select public.lead_mark_seen($1)`, [c], /Lead View · View/, 'marking needs Lead View · View')
  await as(CS_USER, ALL)
  check((await q(`select has_function_privilege('anon', 'public.lead_mark_seen(uuid)', 'execute') a`))[0].a, false, 'not the publishable key’s')
  check((await q(`select count(*)::int n from information_schema.role_table_grants where table_name = 'lead_seen' and grantee in ('anon','authenticated')`))[0].n, 0, 'the table has no grants')

  // ── The Page's own photos show in the chat (mig 20261027180000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_ingest_page_replies'`))[0].m, '54726b97802abfe23f9a78e0ae8a68a6', 'lead_ingest_page_replies here is production’s body')
  // One kept before the change, whose address is still in the delivery log.
  await q(`select public.lead_ingest_page_replies($1::jsonb)`, [JSON.stringify([{ externalId: 'un.p2', pageId: P, psid: '7700701', kind: 'image', body: null, sentAt: '2026-10-27T04:10:00Z' }])])
  // The CRM's delivery log, as production has it (the CRM's migrations are not loaded here).
  await db.exec(`create table if not exists public.crm_channel_events (id bigserial primary key, received_at timestamptz not null default now(),
    channel text not null, status text not null, message text, counts jsonb, payload jsonb)`)
  await db.exec(`insert into public.crm_channel_events (channel, status, payload) values ('messenger', 'ok', '${JSON.stringify({ object: 'page', entry: [{ id: P, standby: [
    { sender: { id: P }, recipient: { id: '7700701' }, message: { mid: 'un.p2', is_echo: true, attachments: [{ type: 'image', payload: { url: 'https://scontent.xx.fbcdn.net/v/old.jpg' } }] } },
    { sender: { id: P }, recipient: { id: '7700701' }, message: { mid: 'un.1', attachments: [{ type: 'image', payload: { url: 'https://evil.example.com/x.jpg' } }] } },
  ] }] })}'::jsonb)`)
  await db.exec(await f('20261027180000_lead_page_media.sql'))
  await db.exec(await f('20261027180000_lead_page_media.sql'))
  check((await q(`select media_url from public.lead_messages where external_id = 'un.p2'`))[0].media_url, 'https://scontent.xx.fbcdn.net/v/old.jpg', 'a photo kept before gets its address from the log')
  check((await q(`select media_url from public.lead_messages where external_id = 'un.1'`))[0].media_url, null, 'never an address off Meta’s CDN')
  await q(`select public.lead_ingest_page_replies($1::jsonb)`, [JSON.stringify([{ externalId: 'un.p3', pageId: P, psid: '7700701', kind: 'image', body: null, mediaUrl: 'https://scontent.xx.fbcdn.net/v/new.jpg', sentAt: '2026-10-27T04:12:00Z' }])])
  check((await q(`select body, media_url from public.lead_messages where external_id = 'un.p3'`))[0], { body: '[Photo]', media_url: 'https://scontent.xx.fbcdn.net/v/new.jpg' }, 'a photo the Page sends now keeps its address')

  // ── Labels and read ticks (migs 20261027190000 + its guards) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_contact_json'`))[0].m, '5c67205569ebe4e6f5ca7381b6ac89c2', 'lead_contact_json here is production’s body')
  await db.exec(await f('20261027190000_lead_labels_reads.sql'))
  await db.exec(await f('20261027190000_lead_labels_reads.sql'))
  await db.exec(await f('20261027190100_lead_labels_guards.sql'))
  await as(CS_USER, ALL)
  const labels = (await q(`select public.lead_labels() l`))[0].l
  check(labels.map(l => l.name), ['Considering', 'Qualified', 'Converted', 'Lost', 'Not qualified'], 'Meta’s five stages to start, once')
  const card = async () => ((await q(`select public.lead_inbox() i`))[0].i).find(x => x.id === c)
  check((await card()).labels, [], 'a customer has no labels at first')
  await q(`select public.lead_set_labels($1, $2::uuid[])`, [c, [labels[0].id, labels[1].id]])
  check((await card()).labels.map(l => l.name), ['Considering', 'Qualified'], 'labelled with two, in the list’s order')
  check((await q(`select what from public.lead_events where contact_id = $1 order by id desc limit 1`, [c]))[0].what, 'Labelled Considering, Qualified', 'the timeline says so')
  await q(`select public.lead_set_labels($1, $2::uuid[])`, [c, [labels[1].id]])
  check((await card()).labels.map(l => l.name), ['Qualified'], 'one taken off')
  await as(CS_USER, ['leads.view', 'leads.create'])
  await refuses(`select public.lead_set_labels($1, $2::uuid[])`, [c, [labels[0].id]], /Lead View · Edit/, 'labelling needs Edit')
  await refuses(`select public.lead_save_labels('[]'::jsonb)`, [], /Lead View · Manage/, 'changing the list needs Manage')
  await as(CS_USER, ALL)
  await q(`select public.lead_save_labels($1::jsonb)`, [JSON.stringify([{ id: labels[1].id, name: 'Hot lead', tone: 'red' }, { name: 'VIP', tone: 'clay' }])])
  const after = (await q(`select public.lead_labels() l`))[0].l
  check(after.map(l => [l.name, l.tone]), [['Hot lead', 'red'], ['VIP', 'clay']], 'renamed, added, the rest deleted')
  check((await card()).labels.map(l => l.name), ['Hot lead'], 'the customer keeps a renamed label')
  await refuses(`select public.lead_set_labels($1, $2::uuid[])`, [c, [labels[0].id]], /That label is gone/, 'a deleted label cannot be put on')
  check((await q(`select prosrc from pg_proc where proname = 'lead_set_labels'`))[0].prosrc.includes(`PERFORM public.tab_write_guard(ARRAY['/leads'], ARRAY['leads.edit']);`), true, 'labelling asks the Inbox')

  // Read ticks: Meta's deliveries (mids) and reads (a watermark) for the Page.
  const outMid = (await q(`select external_id, created_at from public.lead_messages where external_id = 'un.p3'`))[0]
  await q(`select public.lead_ingest_receipts($1::jsonb)`, [JSON.stringify({ delivered: [{ externalId: 'un.p3' }], reads: [] })])
  const t1 = await card()
  check([!!t1.deliveredAt, t1.readAt], [true, null], 'delivered, not read yet')
  await q(`select public.lead_ingest_receipts($1::jsonb)`, [JSON.stringify({ delivered: [], reads: [{ pageId: P, psid: '7700701', watermark: '2030-01-01T00:00:00Z' }] })])
  check(Date.parse((await card()).readAt), Date.parse('2030-01-01T00:00:00Z'), 'read up to Meta’s watermark')
  await q(`select public.lead_ingest_receipts($1::jsonb)`, [JSON.stringify({ reads: [{ pageId: P, psid: '7700701', watermark: '2029-01-01T00:00:00Z' }] })])
  check(Date.parse((await card()).readAt), Date.parse('2030-01-01T00:00:00Z'), 'an older watermark never moves it back')
  check(!!outMid, true, 'the message out is there')
  check((await q(`select has_function_privilege('authenticated', 'public.lead_ingest_receipts(jsonb)', 'execute') a`))[0].a, false, 'receipts are the service role’s alone')

  // ── In the order it was written (mig 20261027200000): a message filled in later, at its own time ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_thread', 'lead_inbox') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_inbox', 'bb29724939997dee9a552adab8756de1'], ['lead_thread', 'ee6b0c5c2e53cba1ea639afb2f08247a']], 'both bodies here are production’s')
  await db.exec(await f('20261027200000_lead_order_by_time.sql'))
  await db.exec(await f('20261027200000_lead_order_by_time.sql'))
  await as(CS_USER, ALL)
  const g = (await q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: 'ord.1', pageId: P, psid: '7700801', name: 'Order Test', kind: 'text', body: 'first question', sentAt: '2026-10-27T05:00:00Z', ad: null },
  ])]))[0].r.contacts[0]
  await q(`select public.lead_mark_seen($1)`, [g])
  // The Page's answer, filled in afterwards (a higher id) at the time it was really sent — before the question.
  await db.exec(`insert into public.lead_messages (contact_id, direction, sender, by_name, body, delivery, external_id, created_at)
    values ('${g}', 'out', 'page', 'Business Suite', 'an older greeting', 'sent', 'ord.p', now() - interval '1 day')`)
  const th = (await q(`select public.lead_thread($1) t`, [g]))[0].t
  check(th.messages.map(m => m.body), ['an older greeting', 'first question'], 'the chat reads in the order it was written')
  const unreadOf = async () => ((await q(`select public.lead_inbox() i`))[0].i).find(x => x.id === g).unread
  check(await unreadOf(), 0, 'opened after the question: 0, an older reply filled in changes nothing')
  await as(OTHER, ALL)
  check(await unreadOf(), 1, 'for somebody who has not opened it, the question after the old greeting is unread')
  await as(CS_USER, ALL)

  // ── Meta's own times (mig 20261027210010): Ray Ng's case — his message arrives after the Page's answer to it ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_ingest_messenger', 'lead_ingest_instagram', 'lead_ingest_page_replies') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_ingest_instagram', '67351ec9be16f60519634ecf6363b9bb'], ['lead_ingest_messenger', 'b7644cce739f2f6bf6b33e6ee41cad54'], ['lead_ingest_page_replies', '00a667a6e2455f712a20a1cf382b0b25']], 'the three ingests here are production’s')
  await db.exec(await f('20261027210010_lead_meta_times.sql'))
  await db.exec(await f('20261027210010_lead_meta_times.sql'))
  const sent = (s) => new Date(Date.now() - s * 1000).toISOString()
  const ray = (await q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: 'ray.1', pageId: P, psid: '7700901', name: 'Ray Test', kind: 'text', body: 'mattress', sentAt: sent(600), ad: null },
  ])]))[0].r.contacts[0]
  // The Page answers at -10 s, and that echo reaches us first …
  await q(`select public.lead_ingest_page_replies($1::jsonb)`, [JSON.stringify([{ externalId: 'ray.p', pageId: P, psid: '7700901', body: 'Hi, sofa or mattress?', sentAt: sent(10) }])])
  // … then his message sent at -12 s arrives.
  await q(`select public.lead_ingest_messenger($1::jsonb)`, [JSON.stringify([
    { externalId: 'ray.2', pageId: P, psid: '7700901', name: 'Ray Test', kind: 'text', body: "I'd like to learn more", sentAt: sent(12), ad: null },
  ])])
  const rt = (await q(`select public.lead_thread($1) t`, [ray]))[0].t
  check(rt.messages.map(m => m.body), ['mattress', "I'd like to learn more", 'Hi, sofa or mattress?'], 'his message sits before the answer it got')
  check([rt.contact.lastDir, rt.contact.lastText], ['out', 'Hi, sofa or mattress?'], 'and the chat reads answered')
  // A time Meta could not have sent (a year back) falls back to the arrival time.
  await q(`select public.lead_ingest_messenger($1::jsonb)`, [JSON.stringify([
    { externalId: 'ray.3', pageId: P, psid: '7700901', name: 'Ray Test', kind: 'text', body: 'still there?', sentAt: '2025-01-01T00:00:00Z', ad: null },
  ])])
  const rt2 = (await q(`select public.lead_thread($1) t`, [ray]))[0].t
  check([rt2.messages.at(-1).body, rt2.contact.lastDir], ['still there?', 'in'], 'an unreadable or far-off time is taken as now')
  check((await q(`select has_function_privilege('authenticated', 'public.lead_meta_time(text)', 'execute') a`))[0].a, false, 'the helper is nobody’s to call')

  // ── Reply to one message, react with an emoji (migs 20261027220000 + its guards) ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_thread', 'lead_ingest_messenger', 'lead_ingest_page_replies') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_ingest_messenger', '6202f20169e982c58a2d0acf5de9b67d'], ['lead_ingest_page_replies', 'f0a9ea37771b5e711163815721f3da34'], ['lead_thread', 'ecf0ec961ca624dfb01d33445b965215']], 'the three bodies here are production’s')
  await db.exec(await f('20261027220000_lead_reply_to_react.sql'))
  await db.exec(await f('20261027220000_lead_reply_to_react.sql'))
  await db.exec(await f('20261027220100_lead_reply_to_react_guards.sql'))
  await as(CS_USER, ALL)
  const q1 = (await q(`select id from public.lead_messages where external_id = 'ray.1'`))[0].id
  const r1 = (await q(`select public.lead_reply_to($1, 'Which size?', $2) r`, [ray, q1]))[0].r
  check(r1.replyToMid, 'ray.1', 'a reply carries the mid of the message it answers')
  const t3 = (await q(`select public.lead_thread($1) t`, [ray]))[0].t
  const mine = t3.messages.find(m => m.id === r1.id)
  check([mine.replyToMid, mine.body, t3.messages.find(m => m.mid === 'ray.1')?.body], ['ray.1', 'Which size?', 'mattress'], 'the chat hands the quote and each message’s mid')
  await refuses(`select public.lead_reply_to($1, 'x', $2)`, [c, q1], /not in this conversation/, 'a message of another conversation cannot be answered')
  // The customer quotes the Page's answer back (Meta's reply_to on his message).
  await q(`select public.lead_ingest_messenger($1::jsonb)`, [JSON.stringify([
    { externalId: 'ray.4', pageId: P, psid: '7700901', name: 'Ray Test', kind: 'text', body: 'Queen', replyToMid: 'ray.p', sentAt: new Date().toISOString(), ad: null },
  ])])
  check((await q(`select reply_to_mid from public.lead_messages where external_id = 'ray.4'`))[0].reply_to_mid, 'ray.p', 'a customer’s quoted reply keeps what it quotes')
  const q4 = (await q(`select id from public.lead_messages where external_id = 'ray.4'`))[0].id
  const re = (await q(`select public.lead_react($1, '👍') r`, [q4]))[0].r
  check([re.mid, re.psid, re.before], ['ray.4', '7700901', null], 'reacting hands back where it goes')
  await q(`select public.lead_react($1, '❤️')`, [q4])
  check((await q(`select reaction from public.lead_messages where id = $1`, [q4]))[0].reaction, '❤️', 'reacting again replaces it')
  await q(`select public.lead_react($1, null)`, [q4])
  check((await q(`select reaction from public.lead_messages where id = $1`, [q4]))[0].reaction, null, 'and null takes it away')
  await refuses(`select public.lead_react($1, '👍')`, [r1.id], /Only a customer/, 'only a customer’s message is reacted to')
  await as(CS_USER, ['leads.view'])
  await refuses(`select public.lead_react($1, '👍')`, [q4], /Lead View · Create/, 'reacting needs Create')
  await as(CS_USER, ALL)
  for (const fn of ['lead_reply_to', 'lead_react']) {
    check((await q(`select prosrc from pg_proc where proname = $1`, [fn]))[0].prosrc.includes(`PERFORM public.tab_write_guard(ARRAY['/leads'], ARRAY['leads.create']);`), true, `${fn} asks the Inbox`)
  }

  // ── The same as Messenger: a conversation's history, pageId / psid on the card (mig 20261028100000) ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_flow_on_message', 'lead_contact_json') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_contact_json', '599eeb023b6dcde9792d13bb958099e5'], ['lead_flow_on_message', '03b5955f7bd61d661e022bbec6656110']], 'the two bodies here are production’s')
  await db.exec(await f('20261028100000_lead_like_messenger.sql'))
  await db.exec(await f('20261028100000_lead_like_messenger.sql'))
  const nowMs = Date.now()
  const ago = min => new Date(nowMs - min * 60000).toISOString()
  const hin = (await q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: 'hist.3', pageId: P, psid: '7701001', name: 'History Test', kind: 'text', body: 'hello again', sentAt: ago(1), ad: null },
  ])]))[0].r
  const hc = hin.contacts[0]
  const wanted = (await q(`select public.lead_history_wanted($1::uuid[]) w`, [[hc]]))[0].w
  check(wanted.map(w => [w.id, w.pageId, w.psid]), [[hc, P, '7701001']], 'a new Messenger conversation wants its history')
  check((await q(`select public.lead_history_wanted($1::uuid[]) w`, [[ray]]))[0].w, [], 'one there before the migration does not')
  const flowsBefore = (await q(`select count(*)::int n from public.lead_messages where sender = 'flow'`))[0].n
  const added = (await q(`select public.lead_ingest_history($1, $2::jsonb) n`, [hc, JSON.stringify([
    { mid: 'hist.1', in: true, at: ago(600), body: 'my number 012-338 4721', mediaUrl: null },
    { mid: 'hist.2', in: false, at: ago(590), body: '[Photo]', mediaUrl: 'https://scontent.xx.fbcdn.net/v/a.jpg' },
    { mid: 'hist.3', in: true, at: ago(1), body: 'hello again', mediaUrl: null },
    { mid: 'hist.f', in: true, at: new Date(nowMs + 3600000).toISOString(), body: 'from the future', mediaUrl: null },
    { mid: '', in: true, at: ago(5), body: 'no id', mediaUrl: null },
  ])]))[0].n
  check(added, 2, 'only what Lead View lacks, with an id, not in the future')
  const ht = (await q(`select public.lead_thread($1) t`, [hc]))[0].t
  check(ht.messages.map(m => m.mid), ['hist.1', 'hist.2', 'hist.3'], 'in the order they were written')
  check((await q(`select sender, by_name, media_url from public.lead_messages where external_id = 'hist.2'`))[0], { sender: 'page', by_name: 'Business Suite', media_url: 'https://scontent.xx.fbcdn.net/v/a.jpg' }, 'the Page’s message is the Page’s')
  const hrow = (await q(`select last_dir, last_text, phone, phone_state, history_at is not null h from public.lead_contacts where id = $1`, [hc]))[0]
  check(hrow, { last_dir: 'in', last_text: 'hello again', phone: '0123384721', phone_state: 'detected', h: true }, 'the last message by time, the phone found, marked filled')
  check((await q(`select count(*)::int n from public.lead_messages where sender = 'flow'`))[0].n, flowsBefore, 'history starts no template')
  check((await q(`select public.lead_history_wanted($1::uuid[]) w`, [[hc]]))[0].w, [], 'filled once, never asked again')
  check((await q(`select public.lead_ingest_history($1, $2::jsonb) n`, [hc, JSON.stringify([{ mid: 'hist.1', in: true, at: ago(600), body: 'x' }])]))[0].n, 0, 'a message kept is not kept twice')
  for (const fn of ['lead_history_wanted(uuid[])', 'lead_ingest_history(uuid, jsonb)']) {
    check((await q(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') a`))[0].a, false, `${fn} is the service role’s alone`)
  }
  check([ht.contact.pageId, ht.contact.psid], [P, '7701001'], 'the card carries the Page and the customer’s Messenger id')

  // ── The Inbox's tools: mark unread, every photo kept in R2 (mig 20261028110000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_mark_seen'`))[0].m, '086511bc7a2b6019cce5d5162ddb17c4', 'lead_mark_seen here is production’s')
  await db.exec(await f('20261028110000_lead_inbox_tools.sql'))
  await db.exec(await f('20261028110000_lead_inbox_tools.sql'))
  await as(CS_USER, ALL)
  await q(`select public.lead_mark_seen($1)`, [hc])
  check((await q(`select public.lead_my_unread_marks() m`))[0].m, [], 'nothing marked at first')
  await q(`select public.lead_mark_unread($1)`, [hc])
  check((await q(`select public.lead_my_unread_marks() m`))[0].m, [hc], 'a chat marked unread is listed for its marker')
  await as(OTHER, ALL)
  check((await q(`select public.lead_my_unread_marks() m`))[0].m, [], 'and for nobody else')
  await as(CS_USER, ALL)
  await q(`select public.lead_mark_seen($1)`, [hc])
  check((await q(`select public.lead_my_unread_marks() m`))[0].m, [], 'opening it again clears the mark')
  await q(`select public.lead_mark_unread($1)`, [ray])
  check((await q(`select public.lead_my_unread_marks() m`))[0].m, [ray], 'a chat never opened can be marked too')
  await as(CS_USER, [])
  await refuses(`select public.lead_mark_unread($1)`, [hc], /Lead View · View/, 'marking needs Lead View · View')
  await as(CS_USER, ALL)
  const keep = (await q(`select public.lead_media_to_keep() k`))[0].k
  const photo = keep.find(k => k.url === 'https://scontent.xx.fbcdn.net/v/a.jpg')
  check([photo?.contactId, photo?.body], [hc, '[Photo]'], 'a photo only at Meta’s address is listed to keep')
  const kept = `chat/${hc}/meta-${photo.id}.jpg`
  check((await q(`select public.lead_media_kept($1::jsonb) n`, [JSON.stringify([{ id: photo.id, path: kept, mime: 'image/jpeg' }])]))[0].n, 0, 'not before the bucket has it')
  await db.exec(`insert into public.file_objects (bucket_id, name) values ('lead-media', '${kept}')`)
  check((await q(`select public.lead_media_kept($1::jsonb) n`, [JSON.stringify([{ id: photo.id, path: `chat/${ray}/x.jpg`, mime: 'image/jpeg' }])]))[0].n, 0, 'never another conversation’s folder')
  check((await q(`select public.lead_media_kept($1::jsonb) n`, [JSON.stringify([{ id: photo.id, path: kept, mime: 'image/jpeg' }])]))[0].n, 1, 'kept once it is there')
  const keptMsg = (await q(`select public.lead_thread($1) t`, [hc]))[0].t.messages.find(m => m.mid === 'hist.2')
  check([keptMsg.mediaPath, keptMsg.mediaMime], [kept, 'image/jpeg'], 'the chat shows our copy')
  check((await q(`select public.lead_media_to_keep() k`))[0].k.some(k => k.id === photo.id), false, 'and it is not listed again')
  for (const fn of ['lead_media_to_keep()', 'lead_media_kept(jsonb)']) {
    check((await q(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') a`))[0].a, false, `${fn} is the service role’s alone`)
  }
  check((await q(`select has_function_privilege('anon', 'public.lead_mark_unread(uuid)', 'execute') a`))[0].a, false, 'marking is no anon’s')

  // ── Long options (mig 20261029100010) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_template_problem'`))[0].m, '88621c4466fed9cf166b5e4cbf9674f4', 'lead_template_problem here is production’s')
  const opt = label => JSON.stringify([{ id: 'a', kind: 'question', text: 'Which?', buttons: [{ label, next: '' }] }])
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [opt('x'.repeat(21))]))[0].p, 'An option says 1 to 20 characters.', 'before: 20 at most')
  await db.exec(await f('20261029100010_lead_long_options.sql'))
  await db.exec(await f('20261029100010_lead_long_options.sql'))
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [opt('Talk to a salesperson about delivery')]))[0].p, null, 'a long option is fine')
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [opt('x'.repeat(201))]))[0].p, 'An option says 1 to 200 characters.', '200 at most')

  // ── Several replies to an option; picking more than one, by tapping again or by numbers (mig 20261029150010) ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_flow_send', 'lead_flow_on_message') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_flow_on_message', 'b9bd11748a326fe93d77f4c9bfb02a1c'], ['lead_flow_send', 'adb6349aca3f86262e0c892a2e5764ff']], 'the runner here is production’s')
  await db.exec(await f('20261029150010_lead_pick_more.sql'))
  await db.exec(await f('20261029150010_lead_pick_more.sql'))
  const PM = [
    { id: 'q', kind: 'question', text: 'Which are you after?', saveAs: 'interest', multi: true, doneLabel: "That's all", next: 'ph',
      buttons: [{ label: 'Sofa', next: '', also: ['ms', 'mp'] }, { label: 'Mattress', next: '', also: ['mm'] }, { label: 'Bed frame', next: '' }] },
    { id: 'ms', kind: 'message', text: 'Our sofas: RM2,990', next: '' },
    { id: 'mp', kind: 'message', text: 'Sofa promo this month', next: '' },
    { id: 'mm', kind: 'message', text: 'Our mattresses: RM2,990', next: '' },
    { id: 'ph', kind: 'phone', text: 'Your phone number?', next: '' },
  ]
  const ONE = [
    { id: 'q', kind: 'question', text: 'Sofa or mattress?', buttons: [{ label: 'Sofa', next: 'ph', also: ['ms'] }, { label: 'Mattress', next: '' }] },
    { id: 'ms', kind: 'message', text: 'Our sofas: RM2,990', next: '' },
    { id: 'ph', kind: 'phone', text: 'Your phone number?', next: '' },
  ]
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [JSON.stringify(PM)]))[0].p, null, 'a question that takes more than one is fine')
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [JSON.stringify(ONE)]))[0].p, null, 'an option with another reply is fine')
  const bad = (patch) => JSON.stringify(PM.map(s => (s.id === 'q' ? { ...s, ...patch } : s)))
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [bad({ buttons: [{ label: 'Sofa', next: '', also: ['ph'] }] })]))[0].p, 'An option\'s other replies are "Send a message" steps.', 'only message steps as other replies')
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [bad({ buttons: [{ label: 'Sofa', next: '', also: ['gone'] }] })]))[0].p, 'An option\'s replies are steps of this template.', 'only this template’s steps')
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [bad({ buttons: [{ label: 'Sofa', next: 'ms' }] })]))[0].p, 'On a question that takes more than one, an option\'s replies are its messages; the question goes on when they finish.', 'a pick-more option goes nowhere itself')
  check((await q(`select public.lead_template_problem($1::jsonb) p`, [bad({ doneLabel: 'x'.repeat(21) })]))[0].p, 'The finish button says 20 characters at most.', 'the finish button fits Messenger')

  const pmFlowOf = async steps => (await q(`insert into public.lead_flows (name, template, trigger_kind, trigger_value, active, steps) values ('Pick more', 'custom', 'first', '', false, $1::jsonb) returning id`, [JSON.stringify(steps)]))[0].id
  await as(CS_USER, ALL)
  const startAt = async (name, flow) => {
    const id = (await q(`select public.lead_simulate($1, 'messenger', $2, '', 'hi') c`, [b2990, name]))[0].c
    await q(`update public.lead_contacts set flow_state = 'none', flow_step = null, interest = '' where id = $1`, [id])
    await q(`select public.lead_flow_send($1, f, 'q') from public.lead_flows f where f.id = $2`, [id, flow])
    return id
  }
  const tap = (name, body) => q(`select public.lead_simulate($1, 'messenger', $2, '', $3)`, [b2990, name, body])
  const flowSince = async (id, n) => (await q(`select body, buttons from public.lead_messages where contact_id = $1 and sender = 'flow' order by created_at, id`, [id])).slice(n)
  const pmFlow = await pmFlowOf(PM)

  // Tap one, then another, then finish.
  const pa = await startAt('Pick A', pmFlow)
  check((await flowSince(pa, 0)).map(m => [m.body, m.buttons]), [['Which are you after?', ['Sofa', 'Mattress', 'Bed frame']]], 'the question asks')
  await tap('Pick A', 'Sofa')
  let pmSent = await flowSince(pa, 1)
  check(pmSent.map(m => m.body), ['Our sofas: RM2,990', 'Sofa promo this month', 'Anything else? Pick another, or tap "That\'s all".'], 'an option’s replies in order, then the question again')
  check(pmSent.at(-1).buttons, ['Mattress', 'Bed frame', "That's all"], 'the options not picked yet and the finish button')
  await tap('Pick A', 'mattress')
  check((await flowSince(pa, 4)).map(m => m.body), ['Our mattresses: RM2,990', 'Anything else? Pick another, or tap "That\'s all".'], 'another pick, its reply, the question again')
  check((await q(`select interest, flow_state, flow_picked from public.lead_contacts where id = $1`, [pa]))[0], { interest: 'Sofa, Mattress', flow_state: 'running', flow_picked: [0, 1] }, 'both kept in the card')
  await tap('Pick A', "That's all")
  check((await flowSince(pa, 6)).map(m => m.body), ['Your phone number?'], 'the finish button goes on')
  check((await q(`select flow_step, flow_picked from public.lead_contacts where id = $1`, [pa]))[0], { flow_step: 'ph', flow_picked: [] }, 'on to the next step, the picks emptied')

  // Typed numbers: several at once, as the list shown numbers them; the finish button's own number.
  const pb = await startAt('Pick B', pmFlow)
  await tap('Pick B', '1、2')
  pmSent = await flowSince(pb, 1)
  check(pmSent.map(m => m.body), ['Our sofas: RM2,990', 'Sofa promo this month', 'Our mattresses: RM2,990', 'Anything else? Pick another, or tap "That\'s all".'], 'two numbers, both options’ replies in order')
  check(pmSent.at(-1).buttons, ['Bed frame', "That's all"], 'what is left')
  await tap('Pick B', '２')
  check((await flowSince(pb, 5)).map(m => m.body), ['Your phone number?'], 'a number as the list now shown counts it — 2 is the finish button')
  check((await q(`select interest from public.lead_contacts where id = $1`, [pb]))[0].interest, 'Sofa, Mattress', 'the picks kept')

  // Every option picked goes on by itself.
  const pc = await startAt('Pick C', pmFlow)
  await tap('Pick C', '1 2 3')
  check((await flowSince(pc, 1)).map(m => m.body).at(-1), 'Your phone number?', 'all three picked: on to the next step')

  // A question that takes one: its other reply, then where it goes; a number picks it; other words stop it.
  const oneFlow = await pmFlowOf(ONE)
  const pd = await startAt('Pick D', oneFlow)
  await tap('Pick D', '1')
  check((await flowSince(pd, 1)).map(m => m.body), ['Our sofas: RM2,990', 'Your phone number?'], 'a number picks the option: its other reply, then its next step')
  const pe = await startAt('Pick E', oneFlow)
  await tap('Pick E', '1,2')
  check((await flowSince(pe, 1)).map(m => m.body), ['Our sofas: RM2,990', 'Your phone number?'], 'one-option question: only the first number counts')
  const pf = await startAt('Pick F', oneFlow)
  await tap('Pick F', 'can I pay by instalment?')
  check((await q(`select flow_state from public.lead_contacts where id = $1`, [pf]))[0].flow_state, 'stopped', 'its own words still stop it for CS')
  const pg = await startAt('Pick G', oneFlow)
  await tap('Pick G', '123')
  check((await q(`select flow_state from public.lead_contacts where id = $1`, [pg]))[0].flow_state, 'stopped', 'a number with no such option stops it')
  for (const fn of ['lead_flow_question(uuid, lead_flows, jsonb, text)', 'lead_flow_also(uuid, lead_flows, jsonb)', 'lead_flow_keep(uuid, text, text, boolean)', 'lead_template_more(jsonb)']) {
    check((await q(`select has_function_privilege('authenticated', 'public.${fn}', 'execute') a`))[0].a, false, `${fn} is nobody’s to call`)
  }

  // ── Back from an ad: the ad kept, the reply rules asked again (mig 20261029170010) ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_ingest_messenger', 'lead_flow_on_message') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_flow_on_message', 'b55553cafa0373854a71f1ed4d76e45f'], ['lead_ingest_messenger', '81363a67c59972b2b10a3f00bc539951']], 'the runner and the intake here are production’s')
  await db.exec(await f('20261029170010_lead_ad_again.sql'))
  await db.exec(await f('20261029170010_lead_ad_again.sql'))
  const AGAIN_AD = '120249999000001'
  const backFlow = (await q(`insert into public.lead_flows (name, template, trigger_kind, trigger_value, active, steps) values ('Back from the ad', 'custom', 'first', '', false, $1::jsonb) returning id`,
    [JSON.stringify([{ id: 'w', kind: 'message', text: 'Welcome back! Here is this week’s promo.', next: '' }])]))[0].id
  await q(`insert into public.lead_reply_rules (ad_id, at_when, reply) values ($1, 'any', $2)`, [AGAIN_AD, backFlow])
  let seq = 0
  const inMsg = (psid, body, ad = null) => q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: `again.${psid}.${++seq}`, pageId: P, psid, name: 'Back Again', kind: 'text', body, sentAt: new Date().toISOString(), ad },
  ])])
  const contactOf = async psid => (await q(`select id from public.lead_contacts where channel = 'messenger' and external_id = $1`, [psid]))[0].id
  const welcomes = async id => (await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and sender = 'flow' and body like 'Welcome back!%'`, [id]))[0].n
  const settle = id => q(`update public.lead_contacts set flow_state = 'done', flow_step = null where id = $1`, [id])

  // A customer we have, tapping the ad again: the referral on its own keeps the ad; their next message gets its template, once.
  await inMsg('7703001', 'hello')
  const ba = await contactOf('7703001')
  await settle(ba)
  check((await q(`select public.lead_ingest_ad_return($1::jsonb) n`, [JSON.stringify([{ pageId: P, psid: '7703001', ad: { sourceId: AGAIN_AD, headline: 'Skip the markup' } }])]))[0].n, 1, 'a return from an ad is kept')
  let bc = (await q(`select ad_id, source_ad, ad_again_at is not null marked from public.lead_contacts where id = $1`, [ba]))[0]
  check(bc, { ad_id: AGAIN_AD, source_ad: 'Skip the markup', marked: true }, 'the ad on the conversation, marked')
  check((await q(`select count(*)::int n from public.lead_events where contact_id = $1 and what = 'Came back from the ad Skip the markup'`, [ba]))[0].n, 1, 'the timeline says so')
  await inMsg('7703001', 'is the promo still on?')
  check(await welcomes(ba), 1, 'their next message gets the ad’s reply again')
  check((await q(`select ad_again_at from public.lead_contacts where id = $1`, [ba]))[0].ad_again_at, null, 'the mark is used once')
  await settle(ba)
  await inMsg('7703001', 'and delivery?')
  check(await welcomes(ba), 1, 'a later message gets nothing more')

  // CS answered in the last day: no template over their conversation.
  await inMsg('7703002', 'hi')
  const bb = await contactOf('7703002')
  await settle(bb)
  await q(`insert into public.lead_messages (contact_id, direction, sender, by_name, body, delivery) values ($1, 'out', 'cs', 'CS', 'Sure, what size?', 'sent')`, [bb])
  await q(`select public.lead_ingest_ad_return($1::jsonb)`, [JSON.stringify([{ pageId: P, psid: '7703002', ad: { sourceId: AGAIN_AD, headline: 'Skip the markup' } }])])
  await inMsg('7703002', 'hello again')
  check(await welcomes(bb), 0, 'CS replied in the last day: nothing automatic')

  // The ad told on the message itself: that message gets the template.
  await inMsg('7703003', 'hi')
  const bd = await contactOf('7703003')
  await settle(bd)
  await inMsg('7703003', 'saw your ad again', { sourceId: AGAIN_AD, headline: 'Skip the markup' })
  check(await welcomes(bd), 1, 'a referral on the message runs the rules on it')
  check((await q(`select count(*)::int n from public.lead_events where contact_id = $1 and what like 'Came back from the ad%'`, [bd]))[0].n, 1, 'and says so once')

  check((await q(`select public.lead_ingest_ad_return($1::jsonb) n`, [JSON.stringify([{ pageId: P, psid: '7703999', ad: { sourceId: AGAIN_AD } }, { pageId: P, psid: '7703001', ad: { sourceId: 'x' } }])]))[0].n, 0, 'nobody we have, or no ad: nothing')
  check((await q(`select has_function_privilege('authenticated', 'public.lead_ingest_ad_return(jsonb)', 'execute') a`))[0].a, false, 'the service role’s alone')

  // ── Lead View v2's customer panel: Language, Special request, a phone typed by hand (mig 20261102100000) ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_save_card', 'lead_contact_json') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_contact_json', 'f5de0ecb6a72fc1f34247c333a11f7a9'], ['lead_save_card', '0cc93c19a0d0c3d20b6888eb56c33e70']], 'the card’s save and reader here are production’s')
  await db.exec(await f('20261102100000_lead_v2_card.sql'))
  await as(CS_USER, ALL)
  const v2card = async () => (await q(`select phone, phone_state, phone_typed, language, special_request from public.lead_contacts where id = $1`, [ba]))[0]
  await q(`update public.lead_contacts set phone = null, phone_state = 'none', phone_typed = false where id = $1`, [ba])
  await q(`select public.lead_save_card($1, '{"phone":"+65 9123 4567"}')`, [ba])
  check(await v2card(), { phone: '+65 9123 4567', phone_state: 'confirmed', phone_typed: true, language: '', special_request: '' }, 'a foreign number typed by hand is kept as typed')
  await q(`select public.lead_save_card($1, '{"phone":"012 338 4721"}')`, [ba])
  check((await v2card()).phone, '0123384721', 'a Malaysian mobile typed by hand is kept as its digits')
  check((await v2card()).phone_typed, true, 'and says it was typed')
  await refuses(`select public.lead_save_card($1, '{"phone":"call me"}')`, [ba], /Type a phone number/, 'words with no number are not a phone')
  await q(`update public.lead_contacts set phone = '0198765432', phone_state = 'detected', phone_typed = false where id = $1`, [ba])
  await q(`select public.lead_save_card($1, '{"phone":"0198765432"}')`, [ba])
  check(await v2card(), { phone: '0198765432', phone_state: 'confirmed', phone_typed: false, language: '', special_request: '' }, 'the number found in the chat, confirmed, is not typed')
  await q(`select public.lead_save_card($1, '{"language":"Malay","specialRequest":"  Needs delivery to 3rd floor  "}')`, [ba])
  check([(await v2card()).language, (await v2card()).special_request], ['Malay', 'Needs delivery to 3rd floor'], 'language and special request are kept')
  await q(`select public.lead_save_card($1, '{"language":"Klingon"}')`, [ba])
  check((await v2card()).language, 'Malay', 'a language off the list is not taken')
  await refuses(`update public.lead_contacts set phone = '+65 9123 4567', phone_typed = false where id = $1`, [ba], /phone_check/, 'only a typed phone may be outside the Malaysian form')
  const cardJson = (await q(`select public.lead_contact_json(c) j from public.lead_contacts c where id = $1`, [ba]))[0].j
  check([cardJson.language, cardJson.specialRequest, cardJson.phoneTyped, 'psid' in cardJson], ['Malay', 'Needs delivery to 3rd floor', false, true], 'the card carries the three keys beside the rest')
  await q(`select public.lead_save_card($1, '{"phone":""}')`, [ba])
  check((await v2card()).phone_typed, false, 'a cleared phone is no longer typed')

  // Leads' bulk hand-over (mig 20261102100100): the sales group's hand-over asks no page of its own any more.
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_handoff_group'`))[0].m, '3f611e3a93e94b9504c6f32f10763042', 'the hand-over here is production’s')
  await db.exec(await f('20261102100100_lead_v2_card_guards.sql'))
  const hg = (await q(`select prosrc, prosecdef from pg_proc where proname = 'lead_handoff_group'`))[0]
  check([hg.prosrc.includes('tab_write_guard'), hg.prosrc.includes(`lead_need(ARRAY['leads.edit']`), hg.prosecdef], [false, true, true], 'it keeps its own check, DEFINER, and no page guard')
  check([(await q(`select has_function_privilege('authenticated', 'public.lead_handoff_group(uuid)', 'execute') a`))[0].a,
    (await q(`select has_function_privilege('anon', 'public.lead_handoff_group(uuid)', 'execute') a`))[0].a], [true, false], 'authenticated may call it, anon may not')
  // ── Lead View v2 › Settings' Pages and Working hours' On Leave (mig 20261102110000 / 100) ──
  const colsBefore = await q(`select id, fb_page_id, ig_account_id from public.lead_brands where deleted_at is null order by id`)
  await db.exec(await f('20261102110000_lead_v2_pages_leave.sql'))
  await db.exec(await f('20261102110100_lead_v2_pages_leave_guards.sql'))
  for (const [fn, page] of [['lead_connect_page', '/leads/settings'], ['lead_set_page', '/leads/settings'], ['lead_disconnect_page', '/leads/settings'], ['lead_save_leave', '/leads/hours']]) {
    const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
    check(src.includes(`PERFORM public.tab_write_guard(ARRAY['${page}'], ARRAY['leads.manage']);`), true, `${fn} asks ${page}`)
  }
  await as(CS_USER, ALL)
  const seeded = (await q(`select public.lead_pages() p`))[0].p
  check(seeded.length, colsBefore.reduce((n, b) => n + (b.fb_page_id ? 1 : 0) + (b.ig_account_id ? 1 : 0), 0), 'every Page and Instagram id on a brand is seeded as a page')
  const brandCols = async id => (await q(`select fb_page_id f, ig_account_id i from public.lead_brands where id = $1`, [id]))[0]
  const b4 = (await q(`select id from public.lead_brands where name = 'Brand Four'`))[0].id
  await refuses(`select public.lead_connect_page('{"channel":"messenger","externalId":"abc","brandId":"${b4}"}')`, [], /Pick a page/, 'a page id is digits')
  if (seeded[0]) await refuses(`select public.lead_connect_page($1::jsonb)`, [JSON.stringify({ channel: seeded[0].channel, externalId: seeded[0].externalId, brandId: b4 })], /connected already/, 'a page is connected once')
  const pg4 = (await q(`select public.lead_connect_page($1::jsonb) i`, [JSON.stringify({ channel: 'messenger', externalId: '555000111', name: 'Brand Four Page', brandId: b4, reply: 'ai' })]))[0].i
  check((await brandCols(b4)).f, '555000111', 'connecting puts the Page in its brand (the ingest finds it there)')
  check((await q(`select work_reply, after_reply from public.lead_reply_pages where brand_id = $1 and channel = 'messenger'`, [b4]))[0], { work_reply: 'ai', after_reply: 'ai' }, 'and Reply rules gets its row with the first reply')
  await refuses(`select public.lead_connect_page($1::jsonb)`, [JSON.stringify({ channel: 'messenger', externalId: '555000222', brandId: b4 })], /has a Facebook Page already/, 'one Facebook Page a brand')
  await q(`select public.lead_set_page($1, '{"paused":true}')`, [pg4])
  check((await brandCols(b4)).f, null, 'a paused page leaves its brand (its messages are ignored)')
  await q(`select public.lead_set_page($1, '{"paused":false}')`, [pg4])
  check((await brandCols(b4)).f, '555000111', 'resumed, it is back')
  const nb = (await q(`select public.lead_connect_page($1::jsonb) i`, [JSON.stringify({ channel: 'instagram', externalId: '666000111', pageId: '555000111', name: '@five', newBrand: 'Brand Five', reply: 'cs' })]))[0].i
  const b5 = (await q(`select brand_id from public.lead_pages where id = $1`, [nb]))[0].brand_id
  check([(await q(`select name from public.lead_brands where id = $1`, [b5]))[0].name, (await brandCols(b5)).i], ['Brand Five', '666000111'], '+ New brand makes the brand and puts the account in it')
  await q(`select public.lead_set_page($1, $2::jsonb)`, [nb, JSON.stringify({ brandId: b4 })])
  check([(await brandCols(b5)).i, (await brandCols(b4)).i], [null, '666000111'], 'moving it to another brand moves the id')
  await q(`select public.lead_disconnect_page($1)`, [nb])
  check([(await brandCols(b4)).i, (await q(`select count(*)::int n from public.lead_pages where id = $1`, [nb]))[0].n], [null, 0], 'disconnected: gone, and its brand no longer finds it')
  await refuses(`select public.lead_disconnect_page($1)`, [nb], /not connected any more/, 'twice: said')
  await as(CS_USER, ['leads.view'])
  await refuses(`select public.lead_set_page($1, '{"paused":true}')`, [pg4], /Lead View · Manage/, 'pages need Manage')
  await refuses(`select public.lead_save_leave('[]')`, [], /Lead View · Manage/, 'leave needs Manage')
  check(Array.isArray((await q(`select public.lead_pages() p`))[0].p), true, 'View reads the pages')
  await as(CS_USER, ALL)
  await refuses(`select public.lead_save_leave('[{"name":"Mei Ling","from":"2026-11-04","to":"2026-11-02"}]')`, [], /same day or later/, 'leave runs forwards')
  await q(`select public.lead_save_leave('[{"name":"Mei Ling","from":"2026-11-02","to":"2026-11-04"},{"name":"Jia Hui","from":"2026-12-24","to":"2026-12-24"}]')`)
  const lv = (await q(`select public.lead_leave() l`))[0].l
  check(lv.map(x => [x.name, x.from, x.to]), [['Mei Ling', '2026-11-02', '2026-11-04'], ['Jia Hui', '2026-12-24', '2026-12-24']], 'leave kept, in date order')
  await q(`select public.lead_save_leave($1::jsonb)`, [JSON.stringify([{ ...lv[0], to: '2026-11-05' }])])
  check((await q(`select public.lead_leave() l`))[0].l.map(x => [x.id, x.to]), [[lv[0].id, '2026-11-05']], 'saved whole: one kept and changed, one left out removed')
  for (const sig of ['lead_pages()', 'lead_connect_page(jsonb)', 'lead_set_page(uuid,jsonb)', 'lead_disconnect_page(uuid)', 'lead_leave()', 'lead_save_leave(jsonb)']) {
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [true, false], `${sig}: authenticated, not anon`)
  }
  check((await q(`select has_function_privilege('authenticated', 'public.lead_page_sync(uuid,text)', 'execute') a`))[0].a, false, 'the sync is only for the functions')
  // ── Lead View v2 › Reply templates and the Step library (mig 20261102120000) ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_flow_send', 'lead_flow_also', 'lead_outbox', 'lead_save_library_item') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_flow_also', '372865466dfcca837b8f0bfeb7d19296'], ['lead_flow_send', '35120029381043ad3520aaeab83e45ec'], ['lead_outbox', '2313898ccd6174412078db73754855e3'], ['lead_save_library_item', 'f7ed4ccd027b1d47957b599931e32560']],
    'the runner, the outbox and the library save here are production’s')
  await db.exec(await f('20261102120000_lead_v2_templates.sql'))
  const srcOf = async n => (await q('select prosrc from pg_proc where proname = $1', [n]))[0].prosrc
  check([(await srcOf('lead_flow_send')).includes('lead_flow_say_file(p_contact, p_flow.name, s);'), (await srcOf('lead_flow_also')).includes('lead_flow_say_file(p_contact, p_flow.name, s);'),
    (await srcOf('lead_outbox')).includes('mediaPath'), (await srcOf('lead_save_library_item')).includes('lead_library_push(p_id)')], [true, true, true, true], 'each body has its one statement')
  check([(await q(`select has_function_privilege('authenticated', 'public.lead_flow_say_file(uuid,text,jsonb)', 'execute') a`))[0].a,
    (await q(`select has_function_privilege('authenticated', 'public.lead_library_push(uuid)', 'execute') a`))[0].a], [false, false], 'the two helpers are the functions’ alone')

  // A template step's photo goes just before its words.
  const FILE_AD = '120249999000077'
  const PIC = 'chat/tpl/11111111-2222-3333-4444-555555555555/sofa.jpg'
  await q(`insert into public.file_objects (bucket_id, name) values ('lead-media', $1)`, [PIC])
  const picFlow = (await q(`insert into public.lead_flows (name, template, trigger_kind, trigger_value, active, steps) values ('Photo first', 'custom', 'first', '', false, $1::jsonb) returning id`,
    [JSON.stringify([{ id: 'w', kind: 'message', text: 'Here is our sofa.', next: '', file: { path: PIC, name: 'sofa.jpg', mime: 'image/jpeg', size: 1000 } }])]))[0].id
  await q(`insert into public.lead_reply_rules (ad_id, at_when, reply) values ($1, 'any', $2)`, [FILE_AD, picFlow])
  await inMsg('7709001', 'hi', { sourceId: FILE_AD, headline: 'Sofa photo' })
  const picC = await contactOf('7709001')
  const picSent = await q(`select body, media_path, media_mime from public.lead_messages where contact_id = $1 and sender = 'flow' order by id`, [picC])
  check(picSent.map(m => [m.body, m.media_path, m.media_mime]), [['[Photo]', PIC, 'image/jpeg'], ['Here is our sofa.', null, null]], 'the photo, then the words')
  const picOut = (await q('select public.lead_outbox($1::uuid[]) o', [[picC]]))[0].o
  check(picOut.map(o => [o.body, o.mediaPath ?? null, o.mediaMime ?? null]), [['[Photo]', PIC, 'image/jpeg'], ['Here is our sofa.', null, null]], 'the outbox hands the file’s path and type')
  await q(`select public.lead_flow_say_file($1, 'x', $2::jsonb)`, [picC, JSON.stringify({ file: { path: 'chat/tpl/11111111-2222-3333-4444-555555555555/not-there.pdf', mime: 'application/pdf' } })])
  await q(`select public.lead_flow_say_file($1, 'x', $2::jsonb)`, [picC, JSON.stringify({ file: { path: '../secret', mime: 'image/png' } })])
  check((await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and sender = 'flow'`, [picC]))[0].n, 2, 'a file not uploaded, or outside the templates’ folder, sends nothing')

  // A library save updates every template that uses the step, each keeping its own way on.
  await as(CS_USER, ALL)
  const libId = (await q(`select public.lead_save_library_item(null, $1::jsonb) i`, [JSON.stringify({ kind: 'step', name: 'Pick a size', steps: [{ id: 's1', kind: 'question', name: 'Pick a size', text: 'Which size?', buttons: [{ label: '4 seater', next: '' }, { label: '6 seater', next: '' }] }] })]))[0].i
  const useTpl = async name => (await q(`select public.lead_save_template(null, $1::jsonb) i`, [JSON.stringify({ name, steps: [
    { id: 'a', kind: 'question', name: 'Pick a size', text: 'Which size?', buttons: [{ label: '4 seater', next: 'b', endMsg: '' }, { label: '6 seater', next: '', endMsg: 'Bye' }], lib: { id: libId, ver: 1 }, pos: { x: 40, y: 40 } },
    { id: 'b', kind: 'handoff', name: 'To a person', text: 'One of our team will reply.' },
  ] })]))[0].i
  const useA = await useTpl('Uses the step'), useB = await useTpl('Uses it too')
  await q(`select public.lead_save_library_item($1, $2::jsonb)`, [libId, JSON.stringify({ kind: 'step', name: 'Pick a size', steps: [{ id: 's1', kind: 'question', name: 'Seats', text: 'How many seats?', buttons: [{ label: '4 seats', next: '' }, { label: '6 seats', next: '' }, { label: '8 seats', next: '' }] }] })])
  for (const id of [useA, useB]) {
    const lst = (await q(`select steps from public.lead_flows where id = $1`, [id]))[0].steps[0]
    check([lst.name, lst.text, lst.buttons.map(b => [b.label, b.next, b.endMsg ?? null]), lst.lib.ver, lst.pos], ['Seats', 'How many seats?', [['4 seats', 'b', ''], ['6 seats', '', 'Bye'], ['8 seats', '', null]], 2, { x: 40, y: 40 }], 'the template takes the new words and keeps its way on')
  }
  check((await q(`select public.lead_library() l`))[0].l.find(x => x.id === libId).usedIn.map(u => u.outdated), [0, 0], 'no copy left behind')
  await q(`select public.lead_remove_library_item($1)`, [libId])
  check((await q(`select steps->0->>'text' t from public.lead_flows where id = $1`, [useA]))[0].t, 'How many seats?', 'deleting from the library changes no template')
  // ── Lead View v2 › AI corrections and General info (mig 20261102130000 / 100) ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_info', 'lead_save_info') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_info', '8d45c4ab8c9101ddb9a1f044132b355a'], ['lead_save_info', '8958b0b63084b31b06f965ea30777f9b']], 'General info’s reader and save here are production’s')
  await db.exec(await f('20261102130000_lead_v2_corrections_info.sql'))
  await db.exec(await f('20261102130100_lead_v2_corrections_info_guards.sql'))
  check((await q(`select prosrc from pg_proc where proname = 'lead_ai_dismiss'`))[0].prosrc.includes("PERFORM public.tab_write_guard(ARRAY['/leads/corrections'], ARRAY['leads.manage']);"), true, 'Dismiss asks AI corrections')
  check((await q(`select prosrc from pg_proc where proname = 'lead_save_info'`))[0].prosrc.includes("PERFORM public.tab_write_guard(ARRAY['/leads/info'], ARRAY['leads.manage']);"), true, 'the info save keeps its guard')
  await as(CS_USER, ALL)
  const dCon = (await q(`select id from public.lead_contacts limit 1`))[0].id
  const dId = (await q(`insert into public.lead_ai_drafts (contact_id, draft, outcome, sent_text) values ($1, 'We deliver everywhere', 'edited', 'Klang Valley only') returning id`, [dCon]))[0].id
  await q(`select public.lead_ai_dismiss($1, true)`, [dId])
  check((await q(`select public.lead_ai_dismissed() d`))[0].d, [Number(dId)], 'a dismissed correction is listed')
  await q(`select public.lead_ai_dismiss($1, false)`, [dId])
  check((await q(`select public.lead_ai_dismissed() d`))[0].d, [], 'moved back to review')
  await refuses(`select public.lead_ai_dismiss(-1, true)`, [], /That correction is gone/, 'a draft that is no correction')
  await as(CS_USER, ['leads.view'])
  await refuses(`select public.lead_ai_dismiss($1, true)`, [dId], /Lead View · Manage/, 'dismissing needs Manage')
  await as(CS_USER, ALL)

  const inf = (await q(`select public.lead_info() i`))[0].i
  const bs = (await q(`select id from public.lead_brands where deleted_at is null order by sort_order, name limit 2`)).map(r => r.id)
  const two = (await q(`select public.lead_save_info($1::jsonb) i`, [JSON.stringify({
    cats: [...inf.cats.map(c => ({ id: c.id, label: c.id === inf.cats[0].id ? 'Our showrooms' : c.label, icon: c.id === inf.cats[0].id ? 'sofa' : c.icon })), { id: 'new-c', label: 'Warranty', icon: 'shield-check' }],
    cards: [...inf.cards, { catId: 'new-c', brandIds: bs, name: 'Two-brand warranty', code: '', status: 'on', validFrom: null, validUntil: null, note: '',
      fields: [{ key: null, label: 'Years', value: '5', type: 'number' }, { key: null, label: 'Odd', value: 'x', type: 'weird' }], uses: [] }],
  })]))[0].i
  const wc = two.cards.find(c => c.name === 'Two-brand warranty')
  check([wc.brandIds.slice().sort(), wc.brandId, wc.fields.map(f => f.type)], [bs.slice().sort(), null, ['number', 'text']], 'several brands kept (no single brandId), a detail’s type kept, an unknown one read as text')
  check([two.cats[0].label, two.cats[0].icon, two.cats.find(c => c.label === 'Warranty').icon], ['Our showrooms', 'sofa', 'shield-check'], 'a category is renamed and re-iconed; a new one keeps its icon')
  const one = (await q(`select public.lead_save_info($1::jsonb) i`, [JSON.stringify({ cats: two.cats, cards: two.cards.map(c => (c.id === wc.id ? { ...c, brandIds: [bs[0]] } : c)) })]))[0].i
  check(one.cards.find(c => c.id === wc.id).brandId, bs[0], 'one brand: brandId is that brand, for older readers')
  await refuses(`select public.lead_save_info($1::jsonb)`, [JSON.stringify({ cats: one.cats, cards: one.cards.map(c => (c.id === wc.id ? { ...c, brandIds: ['00000000-0000-0000-0000-000000000000'] } : c)) })], /brand that is not there/, 'a brand that is not there')
  for (const sig of ['lead_ai_dismissed()', 'lead_ai_dismiss(bigint,boolean)']) {
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [true, false], `${sig}: authenticated, not anon`)
  }

  // ── Lead View v2 › Data Center and the AI Agent's Knowledge (mig 20261102140000 / 100) ──
  check((await q(`select proname, md5(prosrc) m from pg_proc where proname in ('lead_data_file_json', 'lead_save_data_file', 'lead_remove_data_file', 'lead_ai_more', 'lead_save_ai') order by 1`)).map(r => [r.proname, r.m]),
    [['lead_ai_more', '1d99ad70ccfb20873222f9b85428fca5'], ['lead_data_file_json', '419b0ce8a9265dce2dc289111dba9f5a'], ['lead_remove_data_file', '70861acfc3c61b047c9f229b8aa6bf8b'],
      ['lead_save_ai', 'd809a916bd4b5e7df55c6785cc1b8af5'], ['lead_save_data_file', 'cd0f1d7f77b55d8548c3267c3cafdf7e']], 'the five bodies here are production’s')
  // A source picked before the migration becomes a file of Knowledge.
  const [b1, b2] = bs
  const oldFile = (await q(`select id from public.lead_data_files where deleted_at is null and kind = 'file' limit 1`))[0].id
  await q(`update public.lead_data_files set brand_id = null where id = $1`, [oldFile])
  await q(`insert into public.lead_ai_sources (brand_id, file_id, paused, added_by_name) values ($1, $2, true, 'Mei Ling') on conflict (brand_id, file_id) do update set paused = true, added_by_name = 'Mei Ling'`, [b1, oldFile])
  await db.exec(await f('20261102140000_lead_v2_data_center.sql'))
  await db.exec(await f('20261102140100_lead_v2_data_center_guards.sql'))
  for (const [fn, pages] of [['lead_save_data_folder', "ARRAY['/leads/knowledge']"], ['lead_remove_data_folder', "ARRAY['/leads/knowledge']"], ['lead_link_checked', "ARRAY['/leads/knowledge']"], ['lead_data_file_until', "ARRAY['/leads/knowledge', '/leads/ai']"]]) {
    check((await q(`select prosrc from pg_proc where proname = $1`, [fn]))[0].prosrc.includes(`PERFORM public.tab_write_guard(${pages}, ARRAY['leads.manage']);`), true, `${fn} asks its page`)
  }
  check((await q(`select kind, paused, added_by_name from public.lead_ai_knowledge where brand_id = $1 and ref = $2`, [b1, oldFile]))[0], { kind: 'file', paused: true, added_by_name: 'Mei Ling' }, 'a source became Knowledge, paused as it was')
  check((await q(`select count(*)::int n from public.lead_data_file_versions where file_id = $1`, [oldFile]))[0].n, 1, 'a file there before has its version')

  // Folders: nested, coloured, unique among their siblings, moved across brands with what is inside.
  const fold = async (idv, d) => (await q(`select public.lead_save_data_folder($1, $2::jsonb) i`, [idv, JSON.stringify(d)]))[0].i
  const cat = await fold(null, { brandId: b1, parentId: null, name: 'Catalogues' })
  const promo = await fold(null, { brandId: b1, parentId: null, name: 'Promotions', color: 'rust' })
  const raya = await fold(null, { brandId: null, parentId: promo, name: 'Raya 2026' })
  check((await q(`select brand_id from public.lead_data_folders where id = $1`, [raya]))[0].brand_id, b1, 'a folder takes its parent’s brand')
  await refuses(`select public.lead_save_data_folder(null, $1::jsonb)`, [JSON.stringify({ brandId: b1, name: 'catalogues' })], /already has that name/, 'two folders of one name side by side')
  await refuses(`select public.lead_save_data_folder($1, $2::jsonb)`, [promo, JSON.stringify({ parentId: raya, name: 'Promotions' })], /inside itself/, 'a folder inside its own folder')
  await refuses(`select public.lead_save_data_folder(null, $1::jsonb)`, [JSON.stringify({ brandId: b1, name: 'X', color: 'pink' })], /folder colours/, 'a colour that is not one of the six')
  const pPath = `files/${'6'.repeat(8)}-6666-6666-6666-${'6'.repeat(12)}/raya.pdf`, pPath2 = `files/${'7'.repeat(8)}-7777-7777-7777-${'7'.repeat(12)}/raya.pdf`
  await db.exec(`insert into public.file_objects (bucket_id, name) values ('lead-data', '${pPath}'), ('lead-data', '${pPath2}')`)
  const rayaFile = (await q(`select public.lead_save_data_file(null, $1::jsonb) i`, [JSON.stringify({ kind: 'file', name: 'Raya promo.pdf', folderId: raya, brandId: b2, path: pPath, mime: 'application/pdf', sizeBytes: 900 })]))[0].i
  check((await q(`select brand_id, folder_id from public.lead_data_files where id = $1`, [rayaFile]))[0], { brand_id: b1, folder_id: raya }, 'a file’s brand is its folder’s, whatever was sent')
  const fileRow = async () => (await q(`select public.lead_data_file_json(f) j from public.lead_data_files f where id = $1`, [rayaFile]))[0].j
  await q(`select public.lead_save_data_file($1, $2::jsonb)`, [rayaFile, JSON.stringify({ kind: 'file', name: 'Raya promo.pdf', folderId: raya, path: pPath2, mime: 'application/pdf', sizeBytes: 950 })])
  check((await fileRow()).versions.map(v => v.ver), [2, 1], 'Replace file adds a version')
  await q(`select public.lead_save_data_file($1, $2::jsonb)`, [rayaFile, JSON.stringify({ kind: 'file', name: 'Raya promo 2026.pdf', folderId: raya, path: pPath2 })])
  check([(await fileRow()).ver, (await fileRow()).versions.length, (await fileRow()).name], [2, 2, 'Raya promo 2026.pdf'], 'a rename is no new version')

  // Knowledge: a folder picked reads what is in it; usedBy says so; only its brand's folder or Shared.
  const more = async b => (await q(`select public.lead_ai_more($1) m`, [b]))[0].m
  const m1 = await more(b1)
  check([Object.keys(m1).includes('sources'), m1.knowledge.length], [false, 1], 'lead_ai_more hands knowledge, not sources')
  const save = (b, knowledge) => q(`select public.lead_save_ai($1, $2::jsonb)`, [b, JSON.stringify({ settings: m1.settings, answers: [], playbook: [], ...(knowledge ? { knowledge } : {}) })])
  await save(b1, [{ kind: 'folder', ref: promo, paused: false }, { kind: 'file', ref: oldFile, paused: true }])
  check((await fileRow()).usedBy, [{ brandId: b1, paused: false }], 'a file in a picked folder’s folder is used by that agent')
  await save(b1, null)
  check((await more(b1)).knowledge.length, 2, 'a save without knowledge (AI corrections) leaves Knowledge alone')
  await refuses(`select public.lead_save_ai($1, $2::jsonb)`, [b2, JSON.stringify({ settings: {}, answers: [], playbook: [], knowledge: [{ kind: 'folder', ref: promo }] })], /its brand’s folder or Shared|its brand''s folder or Shared|its brand's folder or Shared/, 'another brand’s folder')
  // Moving the folder to the other brand takes its folders and files along and out of the first agent.
  await fold(promo, { brandId: b2, parentId: null, name: 'Promotions', color: 'green' })
  check([(await q(`select brand_id from public.lead_data_folders where id = $1`, [raya]))[0].brand_id, (await q(`select brand_id from public.lead_data_files where id = $1`, [rayaFile]))[0].brand_id],
    [b2, b2], 'a folder moved to another brand takes its folders and files')
  check((await more(b1)).knowledge.map(k => k.kind), ['file'], 'and leaves the first brand’s agent')

  // A file's end date, Restore.
  await q(`update public.lead_data_files set valid_from = '2026-10-01' where id = $1`, [rayaFile])
  await refuses(`select public.lead_data_file_until($1, '2026-09-01')`, [rayaFile], /end before it starts/, 'an end before the start')
  await q(`update public.lead_data_files set status = 'paused' where id = $1`, [rayaFile])
  await q(`select public.lead_data_file_until($1, '2026-12-31')`, [rayaFile])
  check((await q(`select valid_until::text u, status from public.lead_data_files where id = $1`, [rayaFile]))[0], { u: '2026-12-31', status: 'active' }, 'Restore gives a new end date and turns it back on')

  // Web links: checked how often, Check now keeps what it read; another address drops it.
  const link = (await q(`select public.lead_save_data_file(null, $1::jsonb) i`, [JSON.stringify({ kind: 'link', name: '2990s.com.my/sofas', url: 'https://2990s.com.my/sofas', brandId: b1, folderId: cat, checkEvery: 'hour' })]))[0].i
  check((await q(`select folder_id, check_every from public.lead_data_files where id = $1`, [link]))[0], { folder_id: null, check_every: 'hour' }, 'a link sits in no folder; its check frequency kept')
  await refuses(`select public.lead_save_data_file($1, $2::jsonb)`, [link, JSON.stringify({ kind: 'link', name: 'x', url: 'https://2990s.com.my/sofas', checkEvery: 'minute' })], /every hour, day or week/, 'a frequency that is not offered')
  await q(`select public.lead_link_checked($1, 'L-shape sofas from RM 2,990', 3, '')`, [link])
  await q(`select public.lead_link_checked($1, '', 0, 'The page answered 404')`, [link])
  check((await q(`select public.lead_link_text($1::uuid[]) t`, [[link]]))[0].t.map(x => x.content), ['L-shape sofas from RM 2,990'], 'a failed check keeps what the last one read')
  const lj = (await q(`select public.lead_data_file_json(f) j from public.lead_data_files f where id = $1`, [link]))[0].j
  check([lj.pagesRead, lj.hasContent, lj.checkError, 'content' in lj], [3, true, 'The page answered 404', false], 'the file’s JSON says what a check found, never the text')
  await q(`select public.lead_save_data_file($1, $2::jsonb)`, [link, JSON.stringify({ kind: 'link', name: 'carress', url: 'https://carress.my/mattresses', brandId: b1, checkEvery: 'day' })])
  check((await q(`select content, pages_read, checked_at from public.lead_data_files where id = $1`, [link]))[0], { content: '', pages_read: 0, checked_at: null }, 'another address is another page')
  await save(b1, [{ kind: 'link', ref: link }])
  await q(`select public.lead_remove_data_file($1)`, [link])
  check((await more(b1)).knowledge.length, 0, 'a link deleted leaves Knowledge')

  // Deleting a folder deletes its folders and their files.
  await save(b2, [{ kind: 'folder', ref: raya }])
  await q(`select public.lead_remove_data_folder($1)`, [promo])
  check([(await q(`select count(*)::int n from public.lead_data_folders where id in ($1, $2)`, [promo, raya]))[0].n, (await q(`select deleted_at is not null d from public.lead_data_files where id = $1`, [rayaFile]))[0].d, (await more(b2)).knowledge.length],
    [0, true, 0], 'a deleted folder takes its folders, its files and Knowledge’s picks')
  await as(CS_USER, ['leads.view', 'leads.create'])
  await refuses(`select public.lead_save_data_folder(null, $1::jsonb)`, [JSON.stringify({ brandId: b1, name: 'Y' })], /Lead View · Manage/, 'folders need Manage')
  await refuses(`select public.lead_link_checked($1, 'x', 1, '')`, [oldFile], /Lead View · Manage/, 'a check needs Manage')
  await as(CS_USER, ALL)
  for (const sig of ['lead_data_folders()', 'lead_save_data_folder(uuid,jsonb)', 'lead_remove_data_folder(uuid)', 'lead_data_file_until(uuid,date)', 'lead_link_checked(uuid,text,integer,text)', 'lead_link_text(uuid[])']) {
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [true, false], `${sig}: authenticated, not anon`)
  }
  for (const sig of ['lead_data_subtree(uuid)', 'lead_data_chain(uuid)', 'lead_knowledge_tidy()']) {
    check((await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, false, `${sig}: only the functions’`)
  }

  // ── The reply rules answer every message, not only the first (mig 20261102150000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_flow_on_message'`))[0].m, 'c0c1d012577bacd7933939655f74a5d0', 'the runner here is production’s')
  await db.exec(await f('20261102150000_lead_rules_every_message.sql'))
  await db.exec(await f('20261102150000_lead_rules_every_message.sql'))
  // A customer who wrote before, on the rule's ad: each later message runs the rule again while nobody of ours answers.
  await inMsg('7704001', 'hi', { sourceId: AGAIN_AD, headline: 'Skip the markup' })
  const ev = await contactOf('7704001')
  check(await welcomes(ev), 1, 'the first message gets the rule’s template')
  await settle(ev)
  await inMsg('7704001', 'hello?')
  check(await welcomes(ev), 2, 'a later message gets it again')
  // A template waiting on the customer answers the message itself.
  await q(`update public.lead_contacts set flow_state = 'running', flow_id = $2, flow_step = 'w' where id = $1`, [ev, backFlow])
  await inMsg('7704001', 'ok')
  check(await welcomes(ev), 2, 'a template waiting: no new start')
  // CS, or a person in Business Suite, wrote in the last day: nothing automatic.
  await settle(ev)
  await q(`insert into public.lead_messages (contact_id, direction, sender, by_name, body, delivery) values ($1, 'out', 'page', 'Business Suite', 'Hi, how can we help?', 'sent')`, [ev])
  await inMsg('7704001', 'price?')
  check(await welcomes(ev), 2, 'the Page answered in the last day: nothing automatic')
  await q(`update public.lead_messages set created_at = now() - interval '25 hours' where contact_id = $1 and sender = 'page'`, [ev])
  await inMsg('7704001', 'still there?')
  check(await welcomes(ev), 3, 'a day later the rule runs again')
  // No rule for the conversation: a later message keeps today's triggers (none here) — nothing.
  await inMsg('7704002', 'hi')
  const nr = await contactOf('7704002')
  await settle(nr)
  const nrFlows = (await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and sender = 'flow'`, [nr]))[0].n
  await inMsg('7704002', 'hello again')
  check((await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and sender = 'flow'`, [nr]))[0].n, nrFlows, 'no rule that answers: no new start')

  // ── …but not after a template handed the customer to a person or the AI Agent, until we answer (mig 20261102160000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_flow_on_message'`))[0].m, 'cbd0ae0587d55cc19247de7ead45a0e1', 'the runner here is production’s after 20261102150000')
  await db.exec(await f('20261102160000_lead_rules_not_after_handoff.sql'))
  await db.exec(await f('20261102160000_lead_rules_not_after_handoff.sql'))
  const HAND_AD = '120249999000002'
  const handFlow = (await q(`insert into public.lead_flows (name, template, trigger_kind, trigger_value, active, steps) values ('Hand to AI', 'custom', 'first', '', false, $1::jsonb) returning id`,
    [JSON.stringify([{ id: 'h', kind: 'ai', text: 'One moment, checking for you.', next: '' }])]))[0].id
  await q(`insert into public.lead_reply_rules (ad_id, at_when, reply) values ($1, 'any', $2)`, [HAND_AD, handFlow])
  const moments = async id => (await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and sender = 'flow' and body = 'One moment, checking for you.'`, [id]))[0].n
  await inMsg('7705001', 'hi', { sourceId: HAND_AD, headline: 'Sofas' })
  const ho = await contactOf('7705001')
  check([await moments(ho), (await q(`select flow_state from public.lead_contacts where id = $1`, [ho]))[0].flow_state], [1, 'done'], 'the template hands the customer to the AI Agent')
  await inMsg('7705001', 'hello?')
  check(await moments(ho), 1, 'handed over and nobody answered yet: no new start')
  await q(`insert into public.lead_messages (contact_id, direction, sender, by_name, body, delivery, created_at) values ($1, 'out', 'cs', 'CS', 'Here you go.', 'sent', now() - interval '25 hours')`, [ho])
  await q(`update public.lead_events set at = now() - interval '26 hours' where contact_id = $1 and what like '%handed the customer to%'`, [ho])
  await inMsg('7705001', 'one more question')
  check(await moments(ho), 2, 'CS answered after the hand-off, a day ago: the rule runs again')

  // ── The AI Agent answers by itself (mig 20261102170000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_flow_on_message'`))[0].m, '33603adc96b3ac1bdaaf8b25a157f991', 'the runner here is 20261102160000’s')
  await db.exec(await f('20261102170000_lead_ai_answers.sql'))
  await db.exec(await f('20261102170000_lead_ai_answers.sql'))
  const aiOf = async id => (await q(`select ai_on, ai_turns, ai_busy_at is not null busy, flow_state from public.lead_contacts where id = $1`, [id]))[0]
  const claim = async ids => (await q(`select public.lead_ai_claim($1::uuid[]) c`, [ids]))[0].c
  const lastEvent = async id => (await q(`select what from public.lead_events where contact_id = $1 order by at desc, id desc limit 1`, [id]))[0].what
  // A template's AI Agent step hands the customer to the AI, which then answers.
  await inMsg('7706001', 'hi', { sourceId: HAND_AD, headline: 'Sofas' })
  const ai1 = await contactOf('7706001')
  check(await aiOf(ai1), { ai_on: true, ai_turns: 0, busy: false, flow_state: 'done' }, 'the AI Agent step puts the conversation in the AI’s hands')
  check(await claim([ai1]), [ai1], 'just handed over, though the template wrote last: the AI answers at once')
  check(await claim([ai1]), [], 'claimed once: a second delivery leaves it')
  await q(`select public.lead_ai_answered($1, 'Hi! Looking for a sofa?', 'Aina', false, '', null)`, [ai1])
  check(await claim([ai1]), [], 'it wrote last: nothing more')
  await inMsg('7706001', 'how much is the L-shape?')
  check(await moments(ai1), 1, 'the AI’s customer: no template again')
  check(await claim([ai1]), [ai1], 'the customer wrote last: claimed')
  const aiMsg = (await q(`select public.lead_ai_answered($1, 'RM 2,990 this week.', 'Aina', false, '', null) i`, [ai1]))[0].i
  check((await q(`select sender, by_name, delivery from public.lead_messages where id = $1`, [aiMsg]))[0], { sender: 'ai', by_name: 'Aina', delivery: 'recorded' }, 'the AI’s reply is kept as its own, to send')
  check(await aiOf(ai1), { ai_on: true, ai_turns: 2, busy: false, flow_state: 'done' }, 'still the AI’s, two replies')
  check((await q(`select public.lead_outbox($1::uuid[]) o`, [[ai1]]))[0].o.some(r => r.id === aiMsg), true, 'the outbox sends it')
  check(await claim([ai1]), [], 'it wrote last: nothing more')
  await inMsg('7706001', 'ok my number is 0123456789')
  check(await claim([ai1]), [ai1], 'the customer again: claimed')
  await q(`select public.lead_ai_answered($1, 'Thanks! A colleague will call you.', 'Aina', true, 'Got the phone', null)`, [ai1])
  check([(await aiOf(ai1)).ai_on, await lastEvent(ai1)], [false, 'AI Agent handed the customer to Customer Service — Got the phone'], 'the goal reached: handed to CS, the timeline says why')
  await inMsg('7706001', 'when will they call?')
  check([await moments(ai1), await claim([ai1])], [1, []], 'handed over: no template, no AI, until CS answers')
  // CS (or Business Suite) replying takes it off.
  await inMsg('7706002', 'hi', { sourceId: HAND_AD, headline: 'Sofas' })
  const ai2 = await contactOf('7706002')
  await q(`insert into public.lead_messages (contact_id, direction, sender, by_name, body, delivery) values ($1, 'out', 'page', 'Business Suite', 'Hi there', 'sent')`, [ai2])
  check([(await aiOf(ai2)).ai_on, await lastEvent(ai2)], [false, 'AI Agent stopped — a person replied'], 'a person replied: the AI stops')
  // A reply rule set to AI Agent.
  const AI_AD = '120249999000003'
  await q(`insert into public.lead_reply_rules (ad_id, at_when, reply) values ($1, 'any', 'ai')`, [AI_AD])
  await inMsg('7706003', 'hello', { sourceId: AI_AD, headline: 'Beds' })
  const ai3 = await contactOf('7706003')
  check([(await aiOf(ai3)).ai_on, await claim([ai3])], [true, [ai3]], 'a rule set to AI Agent: the AI answers the first message')
  // The brand’s limit (How it replies › When to hand over), else 30 at most.
  await q(`update public.lead_contacts set ai_turns = 4 where id = $1`, [ai3])
  await q(`select public.lead_ai_answered($1, 'Here you go.', '', false, '', 6)`, [ai3])
  check((await aiOf(ai3)).ai_on, true, 'under the brand’s limit: still the AI’s')
  await q(`select public.lead_ai_answered($1, 'And this.', '', false, '', 6)`, [ai3])
  check([(await aiOf(ai3)).ai_on, await lastEvent(ai3)], [false, 'AI Agent handed the customer to Customer Service — 6 replies'], 'its 6th reply, the brand’s limit, hands the customer to CS')
  await q(`update public.lead_contacts set ai_on = true, ai_turns = 29 where id = $1`, [ai3])
  await q(`select public.lead_ai_answered($1, 'Here you go.', '', false, '', null)`, [ai3])
  check(await lastEvent(ai3), 'AI Agent handed the customer to Customer Service — 30 replies', 'no limit set: 30 at most')
  // It could not answer: a passing failure keeps it, a lasting one hands over.
  await q(`update public.lead_contacts set ai_on = true, ai_busy_at = now() where id = $1`, [ai3])
  await q(`select public.lead_ai_stop($1, 'busy', true)`, [ai3])
  check(await aiOf(ai3), { ai_on: true, ai_turns: 30, busy: false, flow_state: 'none' }, 'a passing failure lets the claim go')
  await q(`select public.lead_ai_stop($1, 'The AI Agent is not set up for this brand', false)`, [ai3])
  check([(await aiOf(ai3)).ai_on, await lastEvent(ai3)], [false, 'AI Agent handed the customer to Customer Service — The AI Agent is not set up for this brand'], 'a lasting one hands over')
  check((await q(`select public.lead_ai_answered($1, 'late', '', false, '', null) i`, [ai3]))[0].i, null, 'no longer the AI’s: a late reply is not kept')
  // The app's server may read what the draft reads; anybody else is asked as before.
  await as(null, [])
  await refuses(`select public.lead_ai_more($1)`, [b1], /Lead View · View/, 'no session, no role: refused')
  await db.exec(`select set_config('request.jwt.claim.role', 'service_role', false)`)
  check(typeof (await q(`select public.lead_ai_more($1) m`, [b1]))[0].m, 'object', 'the service role reads the agent')
  await db.exec(`select set_config('request.jwt.claim.role', '', false)`)
  await as(CS_USER, ALL)
  for (const sig of ['lead_ai_claim(uuid[])', 'lead_ai_answered(uuid,text,text,boolean,text,integer)', 'lead_ai_stop(uuid,text,boolean)']) {
    check((await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a, false, `${sig}: not the publishable key’s`)
  }

  // ── {name} and ‹ Back (mig 20261102180000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_flow_on_message'`))[0].m, '4b2ca8a6f45ad49bbb7dab46710968c7', 'the runner here is 20261102170000’s')
  await db.exec(await f('20261102180000_lead_name_and_back.sql'))
  await db.exec(await f('20261102180000_lead_name_and_back.sql'))
  const BACK_AD = '120249999000004'
  const backTpl = (await q(`insert into public.lead_flows (name, template, trigger_kind, trigger_value, active, steps) values ('With back', 'custom', 'first', '', false, $1::jsonb) returning id`,
    [JSON.stringify([
      { id: 'q1', kind: 'question', text: 'Hi *{name}*! Sofa or bed?', back: true, buttons: [{ label: 'Sofa', next: 'q2' }, { label: 'Bed', next: 'q2' }] },
      { id: 'q2', kind: 'question', text: 'Budget?', back: true, buttons: [{ label: 'Under 3k', next: 'p' }] },
      { id: 'p', kind: 'phone', text: 'Your number?', back: true, next: '' },
    ])]))[0].id
  await q(`insert into public.lead_reply_rules (ad_id, at_when, reply) values ($1, 'any', $2)`, [BACK_AD, backTpl])
  const lastFlow = async id => (await q(`select body, buttons from public.lead_messages where contact_id = $1 and sender = 'flow' order by id desc limit 1`, [id]))[0]
  const where = async id => (await q(`select flow_step, flow_trail from public.lead_contacts where id = $1`, [id]))[0]
  await inMsg('7707001', 'hi', { sourceId: BACK_AD, headline: 'Sofas' })
  const bk = await contactOf('7707001')
  check(await lastFlow(bk), { body: 'Hi *Back Again*! Sofa or bed?', buttons: ['Sofa', 'Bed'] }, '{name} is the customer’s name; no ‹ Back on the first step')
  await inMsg('7707001', 'Sofa')
  check([await lastFlow(bk), await where(bk)], [{ body: 'Budget?', buttons: ['Under 3k', '‹ Back'] }, { flow_step: 'q2', flow_trail: ['q1', 'q2'] }], 'the next question offers ‹ Back')
  await inMsg('7707001', 'Under 3k')
  check([await lastFlow(bk), await where(bk)], [{ body: 'Your number?', buttons: ['‹ Back'] }, { flow_step: 'p', flow_trail: ['q1', 'q2', 'p'] }], 'a phone step offers it too')
  await inMsg('7707001', '返回')
  check([(await lastFlow(bk)).body, await where(bk)], ['Budget?', { flow_step: 'q2', flow_trail: ['q1', 'q2'] }], 'typed back: the question before, again')
  await inMsg('7707001', '‹ Back')
  check([await lastFlow(bk), await where(bk)], [{ body: 'Hi *Back Again*! Sofa or bed?', buttons: ['Sofa', 'Bed'] }, { flow_step: 'q1', flow_trail: ['q1'] }], 'tapped back to the first question')
  check((await q(`select count(*)::int n from public.lead_events where contact_id = $1 and what = 'Went back to the question before'`, [bk]))[0].n, 2, 'the timeline says so')
  await inMsg('7707002', 'hi')
  const nn = await contactOf('7707002')
  await q(`update public.lead_contacts set name = '' where id = $1`, [nn])
  await q(`select public.lead_flow_say($1, 'T', 'Hello {name}!', null)`, [nn])
  check((await lastFlow(nn)).body, 'Hello there!', 'no name: "there"')

  // ── The customer asks for a person (mig 20261102190000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_flow_on_message'`))[0].m, '8c0cc780f5294f58f17013ba406f29ae', 'the runner here is production’s after 20261102180000')
  await db.exec(await f('20261102190000_lead_asks_for_person.sql'))
  await db.exec(await f('20261102190000_lead_asks_for_person.sql'))
  const asks = async t => (await q(`select public.lead_asks_for_person($1) a`, [t]))[0].a
  for (const t of ['我要找客服', '转人工', 'Customer service please', 'can I talk to a real person?', 'are you human?', 'nak cakap dengan orang']) check(await asks(t), true, `asks for a person: ${t}`)
  for (const t of ['2 person sofa', 'L-shape for 5 people', 'service centre?']) check(await asks(t), false, `not asking for a person: ${t}`)
  const personEvents = async id => (await q(`select count(*)::int n from public.lead_events where contact_id = $1 and what like 'Customer asked for a person%'`, [id]))[0].n
  // A template waiting on the customer stops.
  await inMsg('7708001', 'hi', { sourceId: BACK_AD, headline: 'Sofas' })
  const askA = await contactOf('7708001')
  check((await q(`select flow_state from public.lead_contacts where id = $1`, [askA]))[0].flow_state, 'running', 'a template is waiting')
  await inMsg('7708001', 'can I talk to a real person?')
  check([(await q(`select flow_state from public.lead_contacts where id = $1`, [askA]))[0].flow_state, await personEvents(askA)], ['stopped', 1], 'asked for a person: the template stops, the timeline says so')
  await inMsg('7708001', '客服')
  check([await personEvents(askA), (await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and sender = 'flow' and created_at > now() - interval '1 minute'`, [askA]))[0].n], [1, 1], 'asked again: nothing more, and no template starts')
  // The AI Agent steps aside.
  await inMsg('7708002', 'hello', { sourceId: AI_AD, headline: 'Beds' })
  const askB = await contactOf('7708002')
  check((await aiOf(askB)).ai_on, true, 'the AI’s customer')
  await inMsg('7708002', '转人工')
  check([(await aiOf(askB)).ai_on, await personEvents(askB)], [false, 1], 'asked for a person: the AI steps aside')

  // ── Start over (mig 20261102200000) ──
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_flow_on_message'`))[0].m, 'b227eaecf216c073dd5140b8d5e609e6', 'the runner here is production’s after 20261102190000')
  await db.exec(await f('20261102200000_lead_start_over.sql'))
  await db.exec(await f('20261102200000_lead_start_over.sql'))
  await db.exec(await f('20261102200100_lead_start_over_guards.sql'))
  // askA asked for a person: nothing runs until we answer — Start over makes the next message run the rules.
  await inMsg('7708001', 'hello again')
  check(await personEvents(askA), 1, 'handed to a person: nothing runs')
  const askAFlows = async () => (await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and sender = 'flow'`, [askA]))[0].n
  const soBefore = await askAFlows()
  await as(CS_USER, ['leads.view'])
  await refuses(`select public.lead_start_over($1)`, [askA], /Lead View · Create/, 'Start over needs Lead View · Create')
  await as(CS_USER, ALL)
  await q(`select public.lead_start_over($1)`, [askA])
  check((await q(`select restart_at is not null r, flow_state from public.lead_contacts where id = $1`, [askA]))[0], { r: true, flow_state: 'none' }, 'started over: marked, nothing waiting')
  check(await askAFlows(), soBefore, 'nothing is sent at once')
  await inMsg('7708001', 'hi')
  check([(await askAFlows()) > soBefore, (await q(`select restart_at from public.lead_contacts where id = $1`, [askA]))[0].restart_at], [true, null], 'the next message runs the rules again, once')
  check((await q(`select has_function_privilege('anon', 'public.lead_start_over(uuid)', 'execute') a`))[0].a, false, 'not the publishable key’s')
  await q(`update public.lead_contacts set ai_on = true, ai_turns = 35 where id = $1`, [ai3])
  await q(`select public.lead_ai_answered($1, 'More.', '', false, '', 40)`, [ai3])
  check((await aiOf(ai3)).ai_on, true, 'a limit of 40 set: still the AI’s at 36 replies (no 30 ceiling)')

  // ── A chat handed to the AI by hand (mig 20261102210000) ──
  await db.exec(await f('20261102210000_lead_give_to_ai.sql'))
  await db.exec(await f('20261102210000_lead_give_to_ai.sql'))
  await inMsg('7709001', 'hello there')
  const ga = await contactOf('7709001')
  await as(CS_USER, ['leads.view', 'leads.create'])
  await refuses(`select public.lead_give_to_ai($1, true)`, [ga], /Lead View · Manage/, 'giving a chat to the AI needs Manage')
  await as(CS_USER, ALL)
  await q(`select public.lead_give_to_ai($1, true)`, [ga])
  check([(await aiOf(ga)).ai_on, await lastEvent(ga)], [true, 'Given to the AI Agent by ' + (await q(`select public.lead_actor_name() n`))[0].n], 'given to the AI: on, the timeline says by whom')
  check((await q(`select public.lead_contact_json(c) j from public.lead_contacts c where id = $1`, [ga]))[0].j.aiOn, true, 'the card says the AI has it')
  check(await claim([ga]), [ga], 'a signed-in person with Create may have it answered at once')
  await q(`select public.lead_ai_stop($1, '', true)`, [ga])
  await as(CS_USER, ['leads.view'])
  await refuses(`select public.lead_ai_claim($1::uuid[])`, [[ga]], /Lead View · Create/, 'View alone may not')
  await refuses(`select public.lead_outbox($1::uuid[])`, [[ga]], /Lead View · Create/, 'nor read the outbox')
  await as(CS_USER, ALL)
  await q(`select public.lead_give_to_ai($1, false)`, [ga])
  check([(await aiOf(ga)).ai_on, (await lastEvent(ga)).startsWith('Taken back from the AI Agent')], [false, true], 'taken back')
  // The service role on a connection where the old-style claim once was set (reads back as '') — mig 20261102220000.
  await db.exec(await f('20261102220000_lead_need_service_role.sql'))
  await as(null, [])
  await db.exec(`select set_config('request.jwt.claims', '{"role":"service_role"}', false), set_config('request.jwt.claim.role', '', false)`)
  check(Array.isArray((await q(`select public.lead_outbox($1::uuid[]) o`, [[ga]]))[0].o), true, 'the service role sends though the old claim reads back empty')
  await db.exec(`select set_config('request.jwt.claims', '', false)`)
  await refuses(`select public.lead_outbox($1::uuid[])`, [[ga]], /Lead View · Create/, 'and nobody else does')
  await as(CS_USER, ALL)
  // A long note still fits the timeline (mig 20261102230000).
  await db.exec(await f('20261102230000_lead_ai_event_length.sql'))
  await q(`select public.lead_give_to_ai($1, true)`, [ga])
  check(typeof (await q(`select public.lead_ai_answered($1, 'Thanks!', '', true, $2, null) i`, [ga, 'x'.repeat(250)]))[0].i, 'number', 'a 250-character note: the reply is kept')
  check((await lastEvent(ga)).length, 200, 'and its timeline line is cut to 200')
  await q(`select public.lead_give_to_ai($1, true)`, [ga])
  await q(`select public.lead_ai_stop($1, $2, false)`, [ga, 'y'.repeat(250)])
  check((await lastEvent(ga)).length, 200, 'a long reason to stop is cut too')
  // Which rule a chat follows (mig 20261102240000).
  await db.exec(await f('20261102240000_lead_rule_of.sql'))
  const ro = (await q(`select public.lead_rule_of($1) r`, [ai3]))[0].r
  check([ro.source, ro.reply, ro.when, ro.adId], ['ad', 'ai', 'any', AI_AD], 'a chat from an ad with its own rule: that rule')
  const ruleT = (await q(`select public.lead_rule_of($1) r`, [askA]))[0].r
  check([ruleT.source, ruleT.templateName], ['ad', 'With back'], 'a template rule names its template')
  await as(CS_USER, [])
  await refuses(`select public.lead_rule_of($1)`, [ai3], /Lead View · View/, 'reading it needs Lead View · View')
  await as(CS_USER, ALL)
  for (const sig of ['lead_ai_claim(uuid[])', 'lead_outbox(uuid[])', 'lead_give_to_ai(uuid,boolean)']) {
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [true, false], `${sig}: authenticated, not anon`)
  }

  // ── Each ad's post and picture from Meta's deliveries (mig 20261102250000) ──
  await db.exec(await f('20261102250000_lead_ad_posts.sql'))
  const postPayload = { object: 'page', entry: [{ id: P, messaging: [{ sender: { id: '79' }, referral: { ad_id: AI_AD, source: 'ADS', type: 'OPEN_THREAD',
    ads_context_data: { post_id: '122151015069199078', ad_title: 'Beds', photo_url: 'https://www.facebook.com/ads/image/?d=x' } } }] }] }
  await q(`insert into public.crm_channel_events (channel, status, payload) values ('messenger', 'ok', $1::jsonb)`, [JSON.stringify(postPayload)])
  await q(`insert into public.crm_channel_events (channel, status, payload) values ('messenger', 'ok', $1::jsonb)`, [JSON.stringify({ ...postPayload, entry: [{ id: P, messaging: [{ referral: { ad_id: '999', ads_context_data: { post_id: '1' } } }] }] })])
  const adPosts = (await q(`select public.lead_ad_posts() p`))[0].p
  const adPost = adPosts.find(x => x.adId === AI_AD)
  check([adPost?.postUrl, adPost?.picture], [`https://www.facebook.com/${P}_122151015069199078`, 'https://www.facebook.com/ads/image/?d=x'], 'an ad’s post and picture as Meta sent them')
  check(adPosts.some(x => x.adId === '999'), false, 'an ad no chat came from is left out')
  await as(CS_USER, [])
  await refuses(`select public.lead_ad_posts()`, [], /Lead View · View/, 'reading them needs Lead View · View')
  await as(CS_USER, ALL)
  // ── The Inbox hears a new message (mig 20261102260000) ──
  await db.exec(await f('20261102260000_lead_live_inbox.sql'))
  await db.exec(await f('20261102260000_lead_live_inbox.sql'))
  const liveBefore = (await q(`select count(*)::int n from public.lead_messages`))[0].n
  await inMsg('7710001', 'hello, anyone?')
  check((await q(`select count(*)::int n from public.lead_messages`))[0].n > liveBefore, true, 'a message is kept though the ping cannot be sent (no Realtime here)')
  check((await q(`select has_function_privilege('authenticated', 'public.lead_inbox_ping()', 'execute') a`))[0].a, false, 'the ping is nobody’s to call')

  // ── Block, and each CS's brands (mig 20261102270000) ──
  await db.exec(await f('20261102270000_lead_block_and_brands.sql'))
  await db.exec(await f('20261102270000_lead_block_and_brands.sql'))
  await db.exec(await f('20261102270100_lead_block_and_brands_guards.sql'))
  await inMsg('7711001', 'hi', { sourceId: BACK_AD, headline: 'Sofas' })
  const bl = await contactOf('7711001')
  await as(CS_USER, ['leads.view', 'leads.create'])
  await refuses(`select public.lead_block($1, true)`, [bl], /Lead View · Edit/, 'blocking needs Lead View · Edit')
  await as(CS_USER, ALL)
  await q(`select public.lead_block($1, true)`, [bl])
  const blRow = (await q(`select blocked_at is not null b, flow_state from public.lead_contacts where id = $1`, [bl]))[0]
  check([blRow.b, blRow.flow_state], [true, 'stopped'], 'blocked: marked, the template waiting stops')
  check((await q(`select public.lead_contact_json(c) j from public.lead_contacts c where id = $1`, [bl]))[0].j.blockedAt !== null, true, 'the card says so')
  const blFlows = async () => (await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and sender = 'flow'`, [bl]))[0].n
  const blBefore = await blFlows()
  await inMsg('7711001', 'hello again')
  check([await blFlows(), (await q(`select count(*)::int n from public.lead_messages where contact_id = $1 and body = 'hello again'`, [bl]))[0].n], [blBefore, 1], 'a blocked customer’s message is kept and nothing answers it')
  await q(`select public.lead_block($1, false)`, [bl])
  check((await q(`select blocked_at from public.lead_contacts where id = $1`, [bl]))[0].blocked_at, null, 'unblocked')

  // Brands: OTHER handles one brand and reads only its chats; no ticks = every brand; Manage reads all.
  const brandOfBl = (await q(`select brand_id from public.lead_contacts where id = $1`, [bl]))[0].brand_id
  const another = (await q(`select id from public.lead_brands where id <> $1 limit 1`, [brandOfBl]))[0].id
  await as(OTHER, ['leads.view', 'leads.create'])
  await refuses(`select public.lead_save_agent_brands($1, $2::uuid[])`, [OTHER, [another]], /Lead View · Manage/, 'saving who handles which brand needs Manage')
  const inboxIds = async () => (await q(`select public.lead_inbox() j`))[0].j.map(x => x.id)
  check((await inboxIds()).includes(bl), true, 'no ticks: every brand')
  await as(CS_USER, ALL)
  await q(`select public.lead_save_agent_brands($1, $2::uuid[])`, [OTHER, [another]])
  check((await q(`select public.lead_agent_brands() j`))[0].j.find(x => x.userId === OTHER)?.brandIds, [another], 'Settings › Team reads it back')
  await as(OTHER, ['leads.view', 'leads.create'])
  check((await inboxIds()).includes(bl), false, 'another brand’s chat is out of their Inbox')
  check((await q(`select public.lead_thread($1) t`, [bl]))[0].t, null, 'and cannot be opened')
  check((await q(`select public.lead_leads(null, null) j`))[0].j.some(x => x.id === bl), false, 'nor listed on Leads')
  await db.exec(await f('20261103100010_lead_brands_for_managers.sql'))
  await db.exec(await f('20261103100010_lead_brands_for_managers.sql'))
  await as(OTHER, ALL)
  check((await inboxIds()).includes(bl), false, 'with Lead View · Manage, their ticks still narrow them (mig 20261103100000)')
  await as(CS_USER, ALL)
  check((await inboxIds()).includes(bl), true, 'Manage with no ticks: every brand')
  await q(`select public.lead_save_agent_brands($1, '{}'::uuid[])`, [OTHER])
  check((await q(`select count(*)::int n from public.lead_agent_brands where user_id = $1`, [OTHER]))[0].n, 0, 'untick all: back to every brand')
  for (const sig of ['lead_block(uuid,boolean)', 'lead_save_agent_brands(uuid,uuid[])', 'lead_agent_brands()']) {
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [true, false], `${sig}: authenticated, not anon`)
  }
  check((await q(`select has_function_privilege('authenticated', 'public.lead_my_brands()', 'execute') a`))[0].a, false, 'lead_my_brands: only the functions’')
}


// Outlets (mig 20261110200000, Lead View v3 § 3): a brand's outlets, an ad's outlet, a customer's follows the ad unless CS sets it.
{
  const f = n => readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  await db.exec(await f('20261110200000_lead_outlets.sql'))
  await db.exec(await f('20261110200000_lead_outlets.sql'))
  await db.exec(await f('20261110200100_lead_outlets_guards.sql'))
  await db.exec(await f('20261110200100_lead_outlets_guards.sql'))
  for (const [fn, page] of [['lead_save_outlets', "ARRAY['/leads/settings']"], ['lead_set_ad_outlet', "ARRAY['/leads/rules', '/leads/settings']"], ['lead_set_contact_outlet', "ARRAY['/leads']"]]) {
    const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
    check(src.includes(`PERFORM public.tab_write_guard(${page}`), true, `${fn} asks its page`)
  }
  await as(CS_USER, ['leads.view'])
  const outs = (await q('select public.lead_outlets() j'))[0].j
  check(outs.map(o => o.name), ['2990s Kelana Jaya', '2990s Petaling Jaya', 'PWCC Penang', 'Carress Taman Maluri', 'Carress Johor', 'Carress Penang'], 'seeded once, by brand, in order')
  const [kj, pj, pwcc] = outs
  await refuses('select public.lead_save_outlets($1, $2::jsonb)', [kj.brandId, '[]'], /Lead View · Manage/, 'saving outlets needs Manage')
  await refuses('select public.lead_set_ad_outlet($1, $2)', ['9000000009', kj.id], /Lead View · Manage/, 'an ad’s outlet needs Manage')

  // A customer from 9000000009: no outlet until the ad has one; then the ad's; CS's pick wins; auto follows the ad again.
  const cid = (await q('select id from public.lead_contacts order by created_at limit 1'))[0].id
  await q('update public.lead_contacts set ad_id = $2 where id = $1', [cid, '9000000009'])
  const card = async () => { const j = (await q('select public.lead_contact_json(c) j from public.lead_contacts c where id = $1', [cid]))[0].j; return [j.outletId, j.outletBy] }
  check(await card(), [null, ''], 'no outlet yet')
  await as(CS_USER, ALL)
  await q('select public.lead_set_ad_outlet($1, $2)', ['9000000009', pj.id])
  check(await card(), [pj.id, 'ad'], 'follows the ad')
  check((await q('select public.lead_ads() j'))[0].j.find(a => a.adId === '9000000009')?.outletId, pj.id, 'the ad list carries it')
  check((await q('select public.lead_inbox() j'))[0].j.find(x => x.id === cid)?.outletId, pj.id, 'the Inbox carries it')
  await q('select public.lead_set_contact_outlet($1, $2, $3)', [cid, 'outlet', pwcc.id])
  await q('select public.lead_set_contact_outlet($1, $2, $3)', [cid, 'outlet', pwcc.id])
  check(await card(), [pwcc.id, 'cs'], 'CS’s pick wins over the ad')
  check((await q("select count(*)::int n from public.lead_events where contact_id = $1 and what like 'Outlet set to PWCC Penang by %'", [cid]))[0].n, 1, 'once on the timeline')
  await q('select public.lead_set_contact_outlet($1, $2, null)', [cid, 'none'])
  check(await card(), [null, 'cs'], 'No outlet, by CS')
  await q('select public.lead_set_contact_outlet($1, $2, null)', [cid, 'auto'])
  check(await card(), [pj.id, 'ad'], 'back to the ad’s')
  await refuses('select public.lead_set_contact_outlet($1, $2, null)', [cid, 'x'], /An outlet, none/, 'a mode it does not know')

  // Renamed, reordered, one removed: its ads and CS's picks let go.
  await q('select public.lead_set_contact_outlet($1, $2, $3)', [cid, 'outlet', kj.id])
  await refuses('select public.lead_save_outlets($1, $2::jsonb)', [kj.brandId, JSON.stringify([{ name: 'A' }, { name: 'a ' }])], /share a name/, 'two of the same name')
  await refuses('select public.lead_save_outlets($1, $2::jsonb)', [kj.brandId, JSON.stringify([{ name: ' ' }])], /needs a name/, 'a blank name')
  const saved = (await q('select public.lead_save_outlets($1, $2::jsonb) j', [kj.brandId, JSON.stringify([{ id: pwcc.id, name: 'PWCC Penang' }, { id: kj.id, name: '2990s KJ' }, { name: '2990s Puchong' }])]))[0].j
  check(saved.filter(o => o.brandId === kj.brandId).map(o => o.name), ['PWCC Penang', '2990s KJ', '2990s Puchong'], 'renamed, reordered, added')
  check(await card(), [kj.id, 'cs'], 'a kept outlet keeps its customers')
  await q('select public.lead_save_outlets($1, $2::jsonb)', [kj.brandId, JSON.stringify([{ id: pwcc.id, name: 'PWCC Penang' }])])
  check(await card(), [null, ''], 'removed: CS’s pick let go, and its ad no longer has an outlet (9000000009 was on Petaling Jaya)')
  check((await q('select count(*)::int n from public.lead_ad_outlets where ad_id = $1', ['9000000009']))[0].n, 0, 'the ad mapping went with it')
  await refuses('select public.lead_set_ad_outlet($1, $2)', ['9000000009', kj.id], /That outlet is gone/, 'a removed outlet cannot be picked')
  await refuses('select public.lead_save_outlets($1, $2::jsonb)', [kj.brandId, JSON.stringify([{ id: outs[3].id, name: 'x' }])], /not this brand/, 'another brand’s outlet')
  await q('select public.lead_set_ad_outlet($1, null)', ['9000000009'])
  for (const sig of ['lead_outlets()', 'lead_save_outlets(uuid,jsonb)', 'lead_set_ad_outlet(text,uuid)', 'lead_set_contact_outlet(uuid,text,uuid)']) {
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [true, false], `${sig}: authenticated, not anon`)
  }
}

// Team (migs 20261110220000 / 220100 / 220200, Lead View v3 § 4): the ERP staff feed; Team gives Lead View through the
// three permission readers (production's, from lead-team-production.sql, md5-checked); stopped is stopped; an Outlet
// staff sees their outlets and the chats with none.
{
  const f = n => readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  const md5 = async fn => (await q(`select md5(prosrc) m from pg_proc where proname = $1`, [fn]))[0].m
  await db.exec(`
    alter table public.users add column if not exists role text, add column if not exists is_active boolean not null default true;
    alter table public.hr_staff_costs add column if not exists title_id uuid, add column if not exists email text,
      add column if not exists employee_code text, add column if not exists resignation_date date;
    create table public.permission_templates(id uuid primary key, base_role text);
    create table public.titles(id uuid primary key, name text, template_id uuid);
    create table public.permission_template_grants(template_id uuid, function_key text, action text, scope text);
    create table public.user_permission_cells(user_id uuid, function_key text, action text, scope text);
    create table public.user_permission_sensitive(user_id uuid, field text, granted boolean);
    create table public.permission_template_sensitive(template_id uuid, field text);
    create table public.permission_cell_keys(function_key text, action text, legacy_key text, min_scope text, gate text);
    create table public.title_permissions(title_id uuid, permission_key text);
    create table public.role_default_permissions(role text, permission_key text);
    create table public.user_permissions(user_id uuid, permission_key text, granted boolean);
    create table public.permission_key_actions(legacy_key text, function_key text, action text);
    create table public.permission_template_tabs(template_id uuid, tab_id text, action text);
    create table public.user_permission_tabs(user_id uuid, tab_id text, action text, granted boolean);
    create table if not exists public.permission_tab_cells(tab_id text, action text, cell text);
    insert into public.permission_tab_cells values
      ('lead.inbox','view','leads.view'),('lead.inbox','create','leads.create'),('lead.inbox','edit','leads.edit'),
      ('lead.leads','view','leads.view'),('lead.leads','edit','leads.edit'),('lead.insight','view','leads.view'),
      ('lead.rules','view','leads.view'),('lead.rules','edit','leads.manage'),('lead.campaigns','view','leads.view'),
      ('lead.campaigns','edit','leads.manage'),('lead.settings','view','leads.view'),('lead.settings','create','leads.create'),
      ('lead.settings','edit','leads.manage'),('hr.people','view','team.view');
    insert into public.permission_cell_keys values ('leads','view','leads','all',null),('team','view','team','all',null);
    insert into public.permission_key_actions values ('leads','leads','view'),('leads','leads','create'),('leads','leads','edit'),('leads','leads','manage'),('team','team','view');
  `)
  await db.exec((await readFile(new URL('./lead-team-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))
  check([await md5('current_actions'), await md5('current_permissions'), await md5('current_tabs')],
    ['aae861a3bcdabf3e843ee794f647457f', 'b6122dcaf7ca957b67b17134569bb575', 'f4642c7adab521153f7d8a94242c3417'], 'the readers are production’s')
  for (let i = 0; i < 2; i++) {
    await db.exec(await f('20261110220000_erp_staff_feed.sql'))
    await db.exec(await f('20261110220100_lead_team.sql'))
    await db.exec(await f('20261110220200_lead_team_guards.sql'))
  }
  for (const fn of ['lead_team_save', 'lead_team_remove']) {
    check((await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc.includes(`PERFORM public.tab_write_guard(ARRAY['/leads/settings'], ARRAY['leads.manage']);`), true, `${fn} asks Settings`)
  }

  // The ERP feed: whole list per company, stale refused, the missing deleted.
  const ingest = b => q('select public.ingest_erp_staff($1::jsonb) r', [JSON.stringify(b)]).then(r => r[0].r)
  const r1 = await ingest({ companyId: 1, snapshotAt: '2026-11-10T01:00:00Z', staff: [
    { staffId: 'e1', code: 'S-0142', name: 'Daniel Chew', email: 'Daniel@2990s.my', job: 'Outlet manager', branch: 'Kelana Jaya', active: true },
    { staffId: 'e2', code: 'S-0188', name: 'Sharon Lee', email: '', job: 'Sales', branch: 'Kelana Jaya', active: true },
    { staffId: 'e3', name: 'Gone Soon', active: true }, { code: 'no id' }] })
  check([r1.outcome, r1.staff, r1.unreadable], ['applied', 3, 1], 'three kept, one unreadable')
  check((await ingest({ companyId: 1, snapshotAt: '2026-11-09T00:00:00Z', staff: [] })).outcome, 'stale', 'an older snapshot changes nothing')
  check((await q(`select email from public.erp_staff where staff_id = 'e1'`))[0].email, 'daniel@2990s.my', 'emails kept lower-case')
  await refuses(`select public.ingest_erp_staff('{"companyId":0,"staff":[]}'::jsonb)`, [], /companyId/, 'a company id is needed')

  // People: Daniel (outlet staff, template without Lead View), Mei Ling the Lead Executive (no template), Sharon (no login).
  const DAN = id(901), MEI = CS_USER, TPL = id(950), TT = id(951), TL = id(952)
  await db.exec(`
    insert into public.users (id, email, name, role, is_active) values ('${DAN}', 'dan@x', 'Daniel', 'staff', true) on conflict do nothing;
    update public.users set role = 'staff' where id = '${MEI}';
    insert into public.permission_templates values ('${TPL}', 'staff');
    insert into public.titles values ('${TT}', 'Outlet manager', '${TPL}'), ('${TL}', 'Lead Executive', null);
    insert into public.permission_template_grants values ('${TPL}', 'team', 'view', 'all'), ('${TPL}', 'leads', 'manage', 'all');
    insert into public.permission_template_tabs values ('${TPL}', 'hr.people', 'view');
    insert into public.hr_staff_costs (id, employee_name, user_id, status, title_id, email) values
      ('${id(902)}', 'Daniel Chew', '${DAN}', 'active', '${TT}', 'daniel@2990s.my'),
      ('${id(903)}', 'Sharon Lee', null, 'active', null, '');
    update public.hr_staff_costs set title_id = '${TL}', email = 'mei@x' where user_id = '${MEI}';
    insert into public.role_default_permissions values ('staff', 'team');
  `)
  const asUser = async u => db.exec(`select set_config('test.uid', '${u}', false)`)
  const acts = async u => { await asUser(u); return (await q('select public.current_actions() a'))[0].a }
  const keys = async u => { await asUser(u); return (await q('select public.current_permissions() p'))[0].p.sort() }
  const tabs = async u => { await asUser(u); return (await q('select public.current_tabs() t'))[0].t }
  check(await acts(DAN), { 'team.view': 'all', 'leads.manage': 'all' }, 'before the Team: the template’s cells')

  // Directory: People with the ERP's job and branch (Daniel by email, Sharon by name); the ERP-only.
  await as(CS_USER, ALL)
  const dir = (await q('select public.lead_staff_directory() d'))[0].d
  const dan = dir.people.find(p => p.name === 'Daniel Chew'), sharon = dir.people.find(p => p.name === 'Sharon Lee')
  check([dan.erpJob, dan.branch, dan.hasLogin, dan.added], ['Outlet manager', 'Kelana Jaya', true, false], 'Daniel matched by email')
  check([sharon.erpCode, sharon.hasLogin], ['S-0188', false], 'Sharon matched by name, no login yet')
  check(dir.erpOnly.map(x => x.name), ['Gone Soon'], 'the ERP-only list')
  await as(OTHER, ['leads.view'])
  await refuses('select public.lead_staff_directory()', [], /Lead View · Manage/, 'the staff list needs Manage')

  // Add Daniel as Outlet staff on Kelana Jaya, no reply; Mei Ling as Customer service.
  await as(CS_USER, ALL)
  const kj = (await q(`select id from public.lead_outlets where name = 'PWCC Penang'`))[0].id
  await q('select public.lead_team_save($1, $2, $3, $4, $5::uuid[], null, null)', [id(902), 'outlet', false, true, [kj]])
  const meiStaff = (await q(`select id from public.hr_staff_costs where user_id = $1`, [MEI]))[0].id
  await q('select public.lead_team_save($1, $2, true, true, $3::uuid[], null, null)', [meiStaff, 'cs', []])
  await refuses('select public.lead_team_save($1, $2, true, true, $3::uuid[], null, null)', [id(902), 'boss', []], /Admin, Customer service/, 'a role it does not know')
  await refuses(`select public.lead_team_save($1, 'cs', true, true, '{}'::uuid[], '2026-12-01', '2026-11-01')`, [id(902)], /last day/, 'dates the wrong way round')

  check(await acts(DAN), { 'team.view': 'all', 'leads.view': 'all' }, 'Outlet staff, no reply: Lead View · View only — the template’s Manage set aside')
  check((await keys(DAN)).includes('leads'), true, 'the leads key')
  const dt = await tabs(DAN)
  const box = (t, a) => dt.boxes.find(b => b.tab === t && b.action === a)?.granted
  check([dt.ticks, box('lead.inbox', 'view'), box('lead.inbox', 'create'), box('lead.insight', 'view'), box('lead.rules', 'view'), box('lead.settings', 'view')],
    [['hr.people.view'], true, false, true, false, false], 'over a template: the Team’s lead boxes')
  check(await acts(MEI), { 'team.view': 'all', 'leads.view': 'all', 'leads.create': 'all', 'leads.edit': 'all', 'leads.manage': 'all' }, 'Customer service: the Team’s four, beside the role’s keys')
  const mt = await tabs(MEI)
  check([mt.ticks, mt.boxes.find(b => b.tab === 'lead.settings' && b.action === 'view').granted, mt.boxes.find(b => b.tab === 'lead.campaigns' && b.action === 'edit').granted,
    mt.boxes.find(b => b.tab === 'lead.rules' && b.action === 'edit').granted], [null, false, false, true], 'no template: boxes over the cells’ tabs; no Settings, Campaigns to view')

  // Stopped: the ERP marks Daniel inactive → nothing of Lead View; back when it lists him active again.
  await ingest({ companyId: 1, snapshotAt: '2026-11-10T02:00:00Z', staff: [
    { staffId: 'e1', name: 'Daniel Chew', email: 'daniel@2990s.my', active: false }, { staffId: 'e2', name: 'Sharon Lee' }] })
  check([await acts(DAN), (await keys(DAN)).includes('leads'), (await tabs(DAN)).boxes.filter(b => b.tab.startsWith('lead.')).some(b => b.granted)],
    [{ 'team.view': 'all' }, false, false], 'inactive in the ERP: Lead View stopped')
  check((await q(`select count(*)::int n from public.erp_staff where staff_id = 'e3'`))[0].n, 0, 'somebody the ERP no longer lists is gone')
  await as(CS_USER, ALL)
  check((await q('select public.lead_team() t'))[0].t.find(x => x.name === 'Daniel Chew').why, 'erp', 'the Team says why')
  await ingest({ companyId: 1, snapshotAt: '2026-11-10T03:00:00Z', staff: [{ staffId: 'e1', name: 'Daniel Chew', email: 'daniel@2990s.my', active: true }] })
  check((await acts(DAN))['leads.view'], 'all', 'active again: back by itself')
  await as(CS_USER, ALL)
  await q(`select public.lead_team_save($1, 'outlet', false, true, $2::uuid[], '2026-01-01', '2026-01-31')`, [id(902), [kj]])
  check(await acts(DAN), { 'team.view': 'all' }, 'past their last day: stopped')
  await q(`select public.lead_team_save($1, 'outlet', true, false, $2::uuid[], null, null)`, [id(902), [kj]])
  check(await acts(DAN), { 'team.view': 'all', 'leads.view': 'all', 'leads.create': 'all', 'leads.edit': 'all' }, 'may reply: create and edit')

  // Scope: Daniel sees PWCC Penang's chats and those with no outlet, nothing else; everybody else sees all.
  const all = (await q('select id from public.lead_contacts')).map(r => r.id)
  const inPw = all[0], inOther = all[1]
  const other = (await q(`select id from public.lead_outlets where name <> 'PWCC Penang' and deleted_at is null limit 1`))[0].id
  await q(`update public.lead_contacts set outlet_by = 'cs', outlet_id = $2 where id = $1`, [inPw, kj])
  await q(`update public.lead_contacts set outlet_by = 'cs', outlet_id = $2 where id = $1`, [inOther, other])
  await asUser(DAN)
  await db.exec(`select set_config('test.cells', 'leads.view', false)`)
  const seen = (await q('select public.lead_inbox() j'))[0].j.map(x => x.id)
  check([seen.includes(inPw), seen.includes(inOther), seen.length], [true, false, all.length - 1], 'the Inbox: their outlet and the chats with none')
  check([(await q('select public.lead_thread($1) t', [inOther]))[0].t, (await q('select public.lead_thread($1) t', [inPw]))[0].t !== null], [null, true], 'another outlet’s chat cannot be opened')
  check((await q('select public.lead_leads(null, null) j'))[0].j.some(x => x.id === inOther), false, 'nor listed on Leads')
  check((await q(`select public.lead_list(current_date - 300, current_date + 2) j`))[0].j.some(x => x.id === inOther), false, 'nor in Insight’s list')
  await asUser(CS_USER)
  check((await q('select public.lead_inbox() j'))[0].j.length, all.length, 'Customer service sees every chat')

  // Removed from the Team: as before the Team (the template's cells).
  await as(CS_USER, ALL)
  await q('select public.lead_team_remove($1)', [id(902)])
  check(await acts(DAN), { 'team.view': 'all', 'leads.manage': 'all' }, 'off the Team: the template again')
  check(await acts(OTHER), {}, 'somebody not on the Team and with no record: unchanged')
  for (const sig of ['lead_team()', 'lead_staff_directory()', 'lead_team_save(uuid,text,boolean,boolean,uuid[],date,date)', 'lead_team_remove(uuid)']) {
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [true, false], `${sig}: authenticated, not anon`)
  }
  for (const sig of ['lead_team_state(uuid)', 'lead_team_cells(uuid)', 'lead_team_boxes(uuid)', 'lead_my_outlets()', 'ingest_erp_staff(jsonb)']) {
    check((await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, false, `${sig}: not the browser’s`)
  }
}

// AI Agent memory (mig 20261110230000, Lead View v3 § 5): fixed / collected / goal / outlet lines, their figures,
// the file questions, what customers asked, earlier chats by phone.
{
  const f = n => readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  await as(CS_USER, ALL)
  await db.exec(await f('20261110230000_lead_ai_memory.sql'))
  await db.exec(await f('20261110230000_lead_ai_memory.sql'))
  for (const fn of ['lead_ai_more', 'lead_save_ai']) {
    const src = (await q('select prosrc from pg_proc where proname = $1', [fn]))[0].prosrc
    check(src.split('mig 20261110230000').length - 1, 1, `${fn}: swapped once, applying twice changes nothing`)
  }
  const more = async b => (await q('select public.lead_ai_more($1) m', [b]))[0].m
  const base = await more(b2990)
  check([Array.isArray(base.memory), Array.isArray(base.fileQs), Array.isArray(base.suggestions), typeof base.asked], [true, true, true, 'object'], 'lead_ai_more carries memory, questions, suggestions, asked')
  const ai = { settings: base.settings, answers: base.answers.map(a => ({ id: a.id, question: a.question, answer: a.answer })), playbook: base.playbook }
  const save = data => q('select public.lead_save_ai($1, $2::jsonb)', [b2990, JSON.stringify({ ...ai, ...data })])
  const myOutlet = (await q('select id from public.lead_outlets where brand_id = $1 and deleted_at is null order by name limit 1', [b2990]))[0].id
  const otherOutlet = (await q('select id from public.lead_outlets where brand_id <> $1 and deleted_at is null limit 1', [b2990]))[0].id

  await save({ memory: [
    { kind: 'fixed', body: 'Never offer a discount beyond the current promotion.' },
    { kind: 'goal', body: 'Answer what they asked first.' },
    { kind: 'goal', body: '   ' },
    { kind: 'outlet', outletId: myOutlet, body: 'Free parking at the front.' },
  ] })
  let m = (await more(b2990)).memory
  check(m.map(x => [x.kind, x.body, x.status, x.addedByName !== '']), [
    ['fixed', 'Never offer a discount beyond the current promotion.', 'on', true],
    ['goal', 'Answer what they asked first.', 'on', true],
    ['outlet', 'Free parking at the front.', 'on', true]], 'fixed, goal and outlet lines kept; an empty line is not')
  await refuses(`select public.lead_save_ai($1, $2::jsonb)`, [b2990, JSON.stringify({ ...ai, memory: [{ kind: 'collected', body: 'made up' }] })], /learning/, 'a collected lesson is not made on the page')
  await refuses(`select public.lead_save_ai($1, $2::jsonb)`, [b2990, JSON.stringify({ ...ai, memory: [{ kind: 'outlet', outletId: otherOutlet, body: 'x' }] })], /this brand/, 'another brand’s outlet')
  await save({})
  check((await more(b2990)).memory.length, 3, 'a save without memory leaves it alone')

  // A lesson the learning run collected: used, voted, made fixed.
  const lesson = (await q(`insert into public.lead_ai_memory (brand_id, kind, body, status, source, cases) values ($1, 'collected', 'Ask how many seats first.', 'review', 'Its own chats', 12) returning id`, [b2990]))[0].id
  m = (await more(b2990)).memory
  await save({ memory: m.map(x => x.id === lesson ? { ...x, status: 'on', dir: 'up' } : x) })
  let l = (await more(b2990)).memory.find(x => x.id === lesson)
  check([l.status, l.dir, l.source, l.cases], ['on', 'up', 'Its own chats', 12], 'Use it, More like this')
  await db.exec(`update public.lead_personas set settings = jsonb_set(coalesce(settings, '{}'), '{learn}', '{"forget":"30"}') where brand_id = '${b2990}'`)
  await db.exec(`update public.lead_ai_memory set updated_at = now() - interval '40 days', last_used_at = null where id = '${lesson}'`)
  check((await more(b2990)).memory.find(x => x.id === lesson).status, 'off', 'Forget unused lessons: unused for 30 days reads as off')
  await db.exec(`update public.lead_personas set settings = settings - 'learn' where brand_id = '${b2990}'`)
  m = (await more(b2990)).memory
  await save({ memory: m.map(x => x.id === lesson ? { ...x, kind: 'fixed' } : x) })
  l = (await more(b2990)).memory.find(x => x.id === lesson)
  check([l.kind, l.status, l.dir], ['fixed', 'on', null], 'Make fixed')

  // The figures: a draft sent that named a line counts its chat; reached once a phone came within 7 days.
  const goalLine = m.find(x => x.kind === 'goal').id
  const kim = (await q(`select public.lead_simulate($1, 'messenger', 'Kim', '', 'How much is the L-shape sofa?') c`, [b2990]))[0].c
  const draft = (await q(`select public.lead_ai_log_draft($1, 'From RM2,990.', $2::jsonb, false, '', 'm') i`,
    [kim, JSON.stringify([{ id: `mem-${goalLine}`, title: 'Answer what they asked first.' }, { id: 'file-00000000-0000-4000-8000-0000000f11e5', title: 'Price list' }])]))[0].i
  let stat = () => more(b2990).then(x => x.memory.find(y => y.id === goalLine))
  check([(await stat()).chats, (await stat()).reached], [0, 0], 'a draft not sent yet counts nothing')
  await q(`select public.lead_ai_draft_kept($1, 'sent', '')`, [draft])
  check([(await stat()).chats, (await stat()).reached], [0, 0], 'sent, but the 7 days are not over and no phone: not counted yet')
  await db.exec(`update public.lead_contacts set phone = '0177770001', phone_state = 'confirmed', phone_at = now() where id = '${kim}'`)
  check([(await stat()).chats, (await stat()).reached], [1, 1], 'a phone within 7 days: reached')
  const lee = (await q(`select public.lead_simulate($1, 'messenger', 'Lee', '', 'hi') c`, [b2990]))[0].c
  await q('select public.lead_ai_memory_used($1, $2::uuid[])', [lee, [goalLine]])
  await db.exec(`update public.lead_ai_memory_uses set first_at = now() - interval '9 days' where contact_id = '${lee}'`)
  check([(await stat()).chats, (await stat()).reached], [2, 1], 'the AI’s own answer counts; 7 days without the goal: counted, not reached')

  // What customers asked when a file was used, and the questions' instructions.
  check((await more(b2990)).asked['00000000-0000-4000-8000-0000000f11e5'], ['How much is the L-shape sofa?'], 'the customer’s question beside the file')
  const ref = '00000000-0000-4000-8000-0000000f11e5'
  await save({ fileQs: [
    { kind: 'file', ref, question: 'How much is the L-shape sofa?', instruction: 'Give the starting price, then ask which room.' },
    { kind: 'file', ref, question: 'Is it in stock?', instruction: '', custom: true },
    { kind: 'file', ref, question: 'Any discount?', instruction: '' },
  ] })
  check((await more(b2990)).fileQs.map(x => [x.question, x.instruction, x.custom]), [
    ['How much is the L-shape sofa?', 'Give the starting price, then ask which room.', false], ['Is it in stock?', '', true]], 'an instruction kept; a question somebody added kept; an asked one with none is not')
  await refuses(`select public.lead_save_ai($1, $2::jsonb)`, [b2990, JSON.stringify({ ...ai, fileQs: [{ kind: 'file', ref, question: '' }] })], /its words/, 'a question needs its words')

  // Suggestions are decided on the page.
  const sg = (await q(`insert into public.lead_ai_suggestions (brand_id, kind, body, why, chats) values ($1, 'add', 'Mention 0% instalments.', 'Reached 54%', 63) returning id`, [b2990]))[0].id
  check((await more(b2990)).suggestions.map(x => x.body), ['Mention 0% instalments.'], 'an open suggestion is listed')
  await save({ suggestions: [{ id: sg, status: 'dismissed' }] })
  check((await more(b2990)).suggestions.length, 0, 'dismissed, gone from the list')

  // Earlier chats with this customer: the same phone elsewhere.
  const mo = (await q(`select public.lead_simulate($1, 'instagram', 'Kim again', '', 'My number 017-777 0001') c`, [bCarress]))[0].c
  const earlier = (await q('select public.lead_ai_earlier($1) e', [mo]))[0].e
  check([earlier.length, earlier[0].messages.at(-1).body], [1, 'How much is the L-shape sofa?'], 'the other conversation with the same phone, its last messages')

  check((await q(`select count(*)::int n from information_schema.role_table_grants where table_name in ('lead_ai_memory','lead_ai_memory_uses','lead_ai_file_questions','lead_ai_suggestions') and grantee in ('anon','authenticated')`))[0].n, 0, 'no table grants')
  for (const sig of ['lead_ai_memory_json(uuid)', 'lead_save_ai_memory(uuid,jsonb,text)', 'lead_ai_memory_from_draft()'])
    check((await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, false, `${sig}: not the browser’s`)
  for (const sig of ['lead_ai_memory_used(uuid,uuid[])', 'lead_ai_earlier(uuid)'])
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [true, false], `${sig}: authenticated, not anon`)
  await as(CS_USER, [])
  await refuses('select public.lead_ai_earlier($1)', [mo], /Lead View · View/, 'earlier chats need Lead View')
  await as(CS_USER, ALL)
}

// Reply templates in English and Chinese, several files a step (mig 20261111130000): the customer's language decides,
// the other one fills an empty box, an option matches either language, the files go first in their order.
{
  const f = n => readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), 'utf8').then(t => t.replace(/\r\n/g, '\n'))
  await as(CS_USER, ALL)
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_flow_on_message'`))[0].m, '708935155aae4bc8a0a93ad6f69fd622', 'the runner here is production’s')
  await db.exec(await f('20261111130000_lead_templates_bilingual_files.sql'))
  await db.exec(await f('20261111130000_lead_templates_bilingual_files.sql'))
  for (const fn of ['lead_flow_on_message', 'lead_flow_say', 'lead_template_problem', 'lead_flow_send', 'lead_flow_question'])
    check((await q(`select prosrc from pg_proc where proname = $1`, [fn]))[0].prosrc.split('mig 20261111130000').length - 1, 1, `${fn}: changed once, applying twice changes nothing`)
  check((await q(`select prosrc from pg_proc where proname = 'lead_flow_on_message'`))[0].prosrc.split(`public.lead_flow_t(c.id, s, 'endMsg')`).length - 1, 2, 'both closing messages of the runner are in the customer’s language')
  for (const sig of ['lead_flow_lang(uuid)', 'lead_flow_t(uuid,jsonb,text)', 'lead_flow_is(text,jsonb)'])
    check([(await q(`select has_function_privilege('authenticated', 'public.${sig}', 'execute') a`))[0].a, (await q(`select has_function_privilege('anon', 'public.${sig}', 'execute') a`))[0].a], [false, false], `${sig}: the runner’s alone`)

  const P = '946946021838962', AD = '120249999000011'
  const F1 = 'chat/tpl/00000000-0000-4000-8000-0000000b1001/sofa.jpg', F2 = 'chat/tpl/00000000-0000-4000-8000-0000000b1001/price list.pdf'
  await q(`insert into public.file_objects (bucket_id, name) values ('lead-media', $1), ('lead-media', $2)`, [F1, F2])
  const files = [{ path: F1, name: 'sofa.jpg', mime: 'image/jpeg' }, { path: F2, name: 'price list.pdf', mime: 'application/pdf' }]
  const steps = [
    { id: 'q1', kind: 'question', text: 'Hi {name}! Sofa or bed?', textZh: '{name}你好！沙发还是床？', saveAs: 'interest', files,
      buttons: [{ label: 'Sofa', labelZh: '沙发', next: 'q2' }, { label: 'Bed', labelZh: '', next: 'q2' }] },
    { id: 'q2', kind: 'question', text: 'Which ones?', textZh: '', multi: true, back: true, doneLabelZh: '好了', saveAs: 'interest', next: 'p',
      buttons: [{ label: 'Fabric', labelZh: '布', next: '' }, { label: 'Leather', labelZh: '皮', next: '' }] },
    { id: 'p', kind: 'phone', text: 'Your number?', textZh: '您的电话？', back: true, retryText: 'Not a phone', retryTextZh: '这不是电话号码', retryMax: '1', failNext: '', next: '' },
  ]
  const tpl = await q(`select public.lead_save_template(null, $1::jsonb) i`, [JSON.stringify({ name: 'Bilingual', endMsg: 'Thanks!', endMsgZh: '谢谢！', steps })]).then(r => r[0].i)
  check((await q(`select end_msg, end_msg_zh from public.lead_flows where id = $1`, [tpl]))[0], { end_msg: 'Thanks!', end_msg_zh: '谢谢！' }, 'the closing message in both languages')
  check((await q(`select public.lead_flows() l`))[0].l.find(x => x.id === tpl).endMsgZh, '谢谢！', 'read back as endMsgZh')
  await q(`insert into public.lead_reply_rules (ad_id, at_when, reply) values ($1, 'any', $2)`, [AD, tpl])

  let seq = 0
  const inMsg = (psid, body, ad = null) => q(`select public.lead_ingest_messenger($1::jsonb) r`, [JSON.stringify([
    { externalId: `bi.${psid}.${++seq}`, pageId: P, psid, name: 'Bi Lang', kind: 'text', body, sentAt: new Date().toISOString(), ad },
  ])])
  const contactOf = async psid => (await q(`select id from public.lead_contacts where channel = 'messenger' and external_id = $1`, [psid]))[0].id
  const flowMsgs = async (id, n) => (await q(`select body, buttons, media_path from public.lead_messages where contact_id = $1 and sender = 'flow' order by id desc limit $2`, [id, n])).reverse()
  const last = async id => { const [m] = await flowMsgs(id, 1); return { body: m.body, buttons: m.buttons } }
  const card = async id => (await q(`select interest, flow_step, flow_state from public.lead_contacts where id = $1`, [id]))[0]

  // A customer writing Chinese.
  await inMsg('7711001', '你好', { sourceId: AD, headline: 'Sofas' })
  const zh = await contactOf('7711001')
  const nm = async id => (await q('select name from public.lead_contacts where id = $1', [id]))[0].name
  check(await flowMsgs(zh, 3), [
    { body: '[Photo]', buttons: null, media_path: F1 },
    { body: '[File] price list.pdf', buttons: null, media_path: F2 },
    { body: `${await nm(zh)}你好！沙发还是床？`, buttons: ['沙发', 'Bed'], media_path: null },
  ], 'the files first, in order; then the Chinese words; an option with no Chinese keeps its English')
  await inMsg('7711001', '沙发')
  check([await last(zh), (await card(zh)).interest], [{ body: 'Which ones?', buttons: ['布', '皮', '‹ 返回'] }, '沙发'], 'tapped in Chinese; kept as shown; no Chinese words → the English; ‹ 返回')
  await inMsg('7711001', '1')
  check(await last(zh), { body: '还有别的吗？再选一个，或点“好了”。', buttons: ['皮', '好了'] }, 'a number keeps the language; the Chinese default comes back with its finish button')
  await inMsg('7711001', '好了')
  check([await last(zh), (await card(zh)).flow_step], [{ body: '您的电话？', buttons: ['‹ 返回'] }, 'p'], 'finished in Chinese; on to the phone')
  await inMsg('7711001', '‹ 返回')
  check((await card(zh)).flow_step, 'q2', '‹ 返回 goes back')
  await inMsg('7711001', '好了')
  await inMsg('7711001', '不知道')
  check(await last(zh), { body: '这不是电话号码', buttons: null }, 'still wrong, in Chinese')
  await inMsg('7711001', '0123384721')
  check([await last(zh), (await card(zh)).flow_state], [{ body: '谢谢！', buttons: null }, 'done'], 'the template’s Chinese closing message')

  // A customer writing English, then typing Chinese with the panel's Language set to English.
  await inMsg('7711002', 'hello there', { sourceId: AD, headline: 'Sofas' })
  const en = await contactOf('7711002')
  check(await last(en), { body: `Hi ${await nm(en)}! Sofa or bed?`, buttons: ['Sofa', 'Bed'] }, 'English words and options')
  await inMsg('7711002', 'sofa')
  await q(`update public.lead_contacts set language = 'English' where id = $1`, [en])
  await inMsg('7711002', '皮')
  check([await last(en), (await card(en)).interest], [{ body: 'Anything else? Pick another, or tap "That\'s all".', buttons: ['Fabric', "That's all"] }, 'Leather'],
    'the Chinese words still pick the option; the panel’s Language keeps English')
  await inMsg('7711002', "That's all")
  check(await last(en), { body: 'Your number?', buttons: ['‹ Back'] }, 'on to the phone in English')

  // The finish button falls back to the other language's too (mig 20261112100000).
  check((await q(`select md5(prosrc) m from pg_proc where proname = 'lead_flow_question'`))[0].m, '8aacc9c1b3c88c9d89f68d8a98a6d6bf', 'lead_flow_question here is production’s after 20261111130000')
  await db.exec(await f('20261112100000_lead_done_label_fallback.sql'))
  await db.exec(await f('20261112100000_lead_done_label_fallback.sql'))
  check((await q(`select prosrc from pg_proc where proname = 'lead_flow_question'`))[0].prosrc.split('mig 20261112100000').length - 1, 1, 'swapped once, applying twice changes nothing')
  const doneTpl = (await q(`insert into public.lead_flows (name, template, trigger_kind, trigger_value, active, steps) values ('Done label', 'custom', 'first', '', false, $1::jsonb) returning id`,
    [JSON.stringify([{ id: 'm', kind: 'question', text: '选几个？', multi: true, doneLabel: 'Done', buttons: [{ label: 'A', labelZh: '甲', next: '' }, { label: 'B', labelZh: '乙', next: '' }] }])]))[0].id
  const AD2 = '120249999000012'
  await q(`insert into public.lead_reply_rules (ad_id, at_when, reply) values ($1, 'any', $2)`, [AD2, doneTpl])
  await inMsg('7711003', '你好', { sourceId: AD2, headline: 'Sofas' })
  const dz = await contactOf('7711003')
  await inMsg('7711003', '甲')
  check(await last(dz), { body: '还有别的吗？再选一个，或点“Done”。', buttons: ['乙', 'Done'] }, 'no Chinese finish button: the English one, not 就这些')
  await inMsg('7711003', 'done')
  check((await card(dz)).flow_state, 'done', 'and it finishes')

  // The words fall back, both ways; a step from before keeps its one file.
  const t = (s, lang) => q(`update public.lead_contacts set language = $2 where id = $1`, [en, lang]).then(() => q(`select public.lead_flow_t($1, $2::jsonb, 'text') t`, [en, JSON.stringify(s)])).then(r => r[0].t)
  check([await t({ text: 'Hi', textZh: '' }, 'Mandarin'), await t({ text: '', textZh: '你好' }, 'English'), await t({ text: 'Hi', textZh: '你好' }, 'Mandarin')], ['Hi', '你好', '你好'], 'an empty box is filled by the other language')
  const before = (await q(`select count(*)::int n from public.lead_messages where contact_id = $1`, [en]))[0].n
  await q(`select public.lead_flow_say_file($1, 'Old', $2::jsonb)`, [en, JSON.stringify({ file: files[0] })])
  await q(`select public.lead_flow_say_file($1, 'Old', $2::jsonb)`, [en, JSON.stringify({ files: [{ path: 'chat/tpl/00000000-0000-4000-8000-0000000b1001/missing.jpg', mime: 'image/jpeg' }] })])
  check((await q(`select count(*)::int n from public.lead_messages where contact_id = $1`, [en]))[0].n, before + 1, 'the old one `file` still goes; a file not in the bucket is skipped')
  await q(`update public.lead_contacts set name = '', language = 'Mandarin' where id = $1`, [en])
  await q(`select public.lead_flow_say($1, 'T', '你好 {name}！', null)`, [en])
  check((await last(en)).body, '你好 朋友！', 'no name, in Chinese: 朋友')

  // What a save takes.
  const bad = (s, what, re) => refuses(`select public.lead_save_template(null, $1::jsonb)`, [JSON.stringify({ name: 'Bad', steps: [s] })], re, what)
  await bad({ id: 'a', kind: 'message', text: 'x', files: Array.from({ length: 11 }, () => files[0]), next: '' }, '11 files', /10 files/)
  await bad({ id: 'a', kind: 'message', text: 'x', files: [{ path: 'elsewhere/x.jpg' }], next: '' }, 'a file from elsewhere', /uploaded with the template/)
  await bad({ id: 'a', kind: 'message', text: 'x', textZh: 'x'.repeat(1001), next: '' }, 'Chinese words too long', /1,000/)
  await bad({ id: 'a', kind: 'question', text: 'x', doneLabelZh: '一二三四五六七八九十一二三四五六七八九十一', multi: true, buttons: [{ label: 'a', next: '' }] }, 'a long Chinese finish button', /20 characters/)
  await bad({ id: 'a', kind: 'message', text: '', textZh: '', next: '' }, 'no words in either', /says something/)
  check(typeof (await q(`select public.lead_save_template(null, $1::jsonb) i`, [JSON.stringify({ name: 'Only Chinese', steps: [
    { id: 'a', kind: 'question', text: '', textZh: '选一个', buttons: [{ label: '', labelZh: '沙发', next: '' }] }] })]))[0].i, 'string', 'Chinese alone is enough')

  // The library brings its Chinese words and its files.
  const lib = (await q(`insert into public.lead_step_library (kind, name, steps, ver) values ('step', 'Promo', $1::jsonb, 2) returning id`,
    [JSON.stringify([{ id: 's1', kind: 'message', text: 'Promo!', textZh: '优惠！', files: [files[0]], next: '' }])]))[0].id
  const usesLib = (await q(`insert into public.lead_flows (name, template, trigger_kind, trigger_value, active, steps) values ('Uses lib', 'custom', 'first', '', false, $1::jsonb) returning id`,
    [JSON.stringify([{ id: 'x', kind: 'message', text: 'old', endMsgZh: '再见', next: '', lib: { id: lib, ver: 1 } }])]))[0].id
  await q(`select public.lead_library_push($1)`, [lib])
  const pushed = (await q(`select steps->0 s from public.lead_flows where id = $1`, [usesLib]))[0].s
  check([pushed.text, pushed.textZh, pushed.files.length, pushed.endMsgZh, pushed.lib.ver], ['Promo!', '优惠！', 1, '再见', 2], 'the library’s words in both languages and its files; the template’s own closing kept')
  await as(CS_USER, ALL)
}

console.log(`validate-leads: ${checks} checks passed`)
