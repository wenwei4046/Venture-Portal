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
}

console.log(`validate-leads: ${checks} checks passed`)
