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

console.log(`validate-leads: ${checks} checks passed`)
