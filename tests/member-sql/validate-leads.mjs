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

// ── Reply rules, Reply templates and the Step library (mig 20261023100000; the registry rows are production's, left out here) ──
const replySql = (await readFile(new URL('../../supabase/migrations/20261023100000_lead_reply.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
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

console.log(`validate-leads: ${checks} checks passed`)
