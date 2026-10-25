// Local PostgreSQL regression for 20261025235500 (2026-10-25 — Marketing: a subsidiary's own key dates; the user's answer
// 14, "each company's own", and "Marketing 全员，可每年重复"). Marketing's migrations up to ②a-5 run; then this one, twice.
// What is under test: who may call what; the table no client reaches, its history the audit trail's; the list read by
// Marketing · View; a key date added by Marketing · Edit — its day and name needed, its limits, 200 a subsidiary — and
// changed by only what was sent, so another login's change in between stays; deleted, one already gone no error, another
// subsidiary's never; and the PIC's calendar — the subsidiary's own key dates beside HR's holidays, once in the window or
// every year from their day, never another subsidiary's, never an id.
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
await db.exec(await sql('20261025221000_marketing_task_minutes.sql'))
await db.exec(await sql('20261025231000_marketing_task_pic.sql'))
await db.exec(await sql('20261025235000_marketing_task_pic_stage.sql'))
const mig = await sql('20261025235500_marketing_key_dates.sql')
await asSystem()
// As production makes them: a new function is the signed-in's and the service role's unless the migration says not.
await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role')
await db.exec(mig)
await db.exec(mig) // twice: nothing changes, nothing breaks

// ── Who may call what ───────────────────────────────────────────────────────────────────────────────────
const may = async (role, fn) => peek1(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, `public.${fn}`])
for (const fn of ['mkt_key_dates(uuid)', 'mkt_key_date_save(uuid, uuid, jsonb)', 'mkt_key_date_delete(uuid, uuid)'])
  check([await may('anon', fn), await may('authenticated', fn)], [false, true], `${fn}: signed in only — its cell asked inside`)
check([await may('anon', 'mkt_key_date_list(uuid)'), await may('authenticated', 'mkt_key_date_list(uuid)'), await may('service_role', 'mkt_key_date_list(uuid)')],
  [false, false, true], 'mkt_key_date_list: called by the three only')
check([await may('anon', 'mkt_pic_calendar(text)'), await may('authenticated', 'mkt_pic_calendar(text)')], [true, true],
  'mkt_pic_calendar: still the stranger’s, by its code')
check(await peek1(`SELECT has_table_privilege('authenticated', 'public.mkt_key_dates', 'SELECT')
                       OR has_table_privilege('anon', 'public.mkt_key_dates', 'SELECT')
                       OR has_table_privilege('authenticated', 'public.mkt_key_dates', 'INSERT')`), false, 'the table: no client reaches it')
check(await peek1(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mkt_key_dates'::regclass`), true, '…its row security on')
check(await peek(`SELECT reads, mode, ignore FROM public.audit_registered WHERE t = 'mkt_key_dates'`),
  [{ reads: ['marketing'], mode: 'all', ignore: ['updated_at', 'updated_by'] }], 'its history: the audit trail’s, read by Marketing')

const CAR = await peek1(`SELECT id FROM public.mkt_subsidiaries WHERE code = 'CAR'`)
await asSystem()
const ACM = await one(`INSERT INTO public.mkt_subsidiaries (code, name) VALUES ('ACM', 'Acme Home') RETURNING id`)
const OLDCO = await one(`INSERT INTO public.mkt_subsidiaries (code, name, active) VALUES ('OLD', 'Old Co', false) RETURNING id`)
const list = sub => one(`SELECT public.mkt_key_dates($1)`, [sub])
const SAVE = `SELECT public.mkt_key_date_save($1, $2, $3::jsonb)`
const save = (sub, kid, patch) => one(SAVE, [sub, kid, JSON.stringify(patch)])
const DEL = `SELECT public.mkt_key_date_delete($1, $2)`
const del = (sub, kid) => one(DEL, [sub, kid])

// ── Read: Marketing · View ──────────────────────────────────────────────────────────────────────────────
await as(U.ali, [])
await refuses(`SELECT public.mkt_key_dates($1)`, [CAR], /Marketing is not open to your account/, 'nobody from Marketing: reads none')
await as(U.ali, VIEW)
check(await list(CAR), [], 'none yet')

// ── Added: Marketing · Edit — everybody in Marketing ─────────────────────────────────────────────────────
await refuses(SAVE, [CAR, null, JSON.stringify({ day: '2026-11-11', name: '11.11' })], /Changing key dates is not open to your account/,
  'a viewer adds none')
await as(U.mei, STAFF)
const added = await save(CAR, null, { day: '2026-11-11', name: ' 11.11 sale day ', short: ' 11.11 ', yearly: true })
check(added.map(k => [k.day, k.name, k.short, k.yearly]), [['2026-11-11', '11.11 sale day', '11.11', true]], 'added — its words trimmed; the list comes back')
const SALE = added[0].id
check(await peek(`SELECT created_by, updated_by FROM public.mkt_key_dates WHERE id = $1`, [SALE]), [{ created_by: U.mei, updated_by: U.mei }], 'who added it')
for (const [patch, pattern, what] of [
  [{ name: 'No day' }, /Pick the key date's day/, 'no day'],
  [{ day: 'soon', name: 'x' }, /Pick the key date's day/, 'not a day'],
  [{ day: '2026-02-30', name: 'x' }, /Pick the key date's day/, 'no such day'],
  [{ day: '1999-12-31', name: 'x' }, /Pick the key date's day/, 'too long ago'],
  [{ day: '2101-01-01', name: 'x' }, /Pick the key date's day/, 'too far ahead'],
  [{ day: '2026-12-31' }, /Name the key date/, 'no name'],
  [{ day: '2026-12-31', name: '   ' }, /Name the key date/, 'a blank name'],
  [{ day: '2026-12-31', name: 'x'.repeat(81) }, /80 characters at most/, 'a name too long'],
  [{ day: '2026-12-31', name: 'Payday', short: 'y'.repeat(17) }, /16 characters at most/, 'a flag too long'],
  [{ day: '2026-12-31', name: 'Payday', yearly: 'yes' }, /a yes or a no/, 'every year in words'],
]) await refuses(SAVE, [CAR, null, JSON.stringify(patch)], pattern, `refused: ${what}`)
await refuses(SAVE, [CAR, null, '[]'], /Nothing to save/, 'refused: not an object')
await refuses(SAVE, [id(999), null, JSON.stringify({ day: '2026-12-31', name: 'Payday' })], /That subsidiary is not there/, 'refused: no such subsidiary')
await refuses(SAVE, [OLDCO, null, JSON.stringify({ day: '2026-12-31', name: 'Payday' })], /That subsidiary is not there/, 'refused: one no longer active')
check(await peek1(`SELECT count(*)::int FROM public.mkt_key_dates`), 1, '…and nothing more was written')

// ── Changed: only what was sent — another login's change in between stays ────────────────────────────────
const pay = (await save(CAR, null, { day: '2026-12-31', name: 'Payday', short: '  ', yearly: false })).find(k => k.name === 'Payday')
check(pay.short, null, 'a blank flag is none')
await as(U.josiah, MANAGER)
await save(CAR, pay.id, { name: 'Payday (Dec)' })
await as(U.mei, STAFF)
const moved = await save(CAR, pay.id, { day: '2026-12-30' })
check(moved.find(k => k.id === pay.id), { id: pay.id, day: '2026-12-30', name: 'Payday (Dec)', short: null, yearly: false },
  'only its day sent: the other login’s new name stays')
check(await peek(`SELECT created_by, updated_by FROM public.mkt_key_dates WHERE id = $1`, [pay.id]), [{ created_by: U.mei, updated_by: U.mei }],
  'who changed it last')
check((await save(CAR, SALE, { short: '' })).find(k => k.id === SALE).short, null, 'its flag’s words taken off: its name shows')
check((await save(CAR, SALE, { yearly: false })).find(k => k.id === SALE).yearly, false, 'once now, not every year')
await refuses(SAVE, [CAR, SALE, JSON.stringify({ name: '' })], /Name the key date/, 'a change may not leave it nameless')
await refuses(SAVE, [CAR, SALE, JSON.stringify({ day: null })], /Pick the key date's day/, '…or without its day')
await refuses(SAVE, [ACM, SALE, JSON.stringify({ name: 'Mine now' })], /not there any more/, 'another subsidiary’s key date: not changed through this one')
await refuses(SAVE, [CAR, id(998), JSON.stringify({ name: 'x' })], /not there any more/, 'no such key date')
check(await peek(`SELECT name, day::text AS day, yearly FROM public.mkt_key_dates WHERE id = $1`, [SALE]),
  [{ name: '11.11 sale day', day: '2026-11-11', yearly: false }], '…and it is as it was')

// ── 200 a subsidiary at most ───────────────────────────────────────────────────────────────────────────
await asSystem()
await q(`INSERT INTO public.mkt_key_dates (sub_id, day, name) SELECT $1, DATE '2027-01-01' + g, 'Day ' || g FROM generate_series(1, 198) g`, [CAR])
await as(U.mei, STAFF)
check((await list(CAR)).length, 200, '200 kept')
await refuses(SAVE, [CAR, null, JSON.stringify({ day: '2027-12-31', name: 'One more' })], /200 key dates at most/, 'the 201st refused')
check((await save(ACM, null, { day: '2027-12-31', name: 'Acme day' })).map(k => k.name), ['Acme day'], '…another subsidiary keeps its own count')
check((await save(CAR, SALE, { name: '11.11 sale day!' })).length, 200, 'a change is no new one: taken at 200')
await asSystem()
await q(`DELETE FROM public.mkt_key_dates WHERE name LIKE 'Day %'`)

// ── Deleted ────────────────────────────────────────────────────────────────────────────────────────────
await as(U.ali, VIEW)
await refuses(DEL, [CAR, SALE], /Changing key dates is not open to your account/, 'a viewer deletes none')
await as(U.mei, STAFF)
const acme = (await list(ACM))[0].id
check((await del(CAR, acme)).map(k => k.name), ['11.11 sale day!', 'Payday (Dec)'], 'another subsidiary’s key date: not deleted through this one')
check((await list(ACM)).map(k => k.name), ['Acme day'], '…it stays')
check((await del(CAR, pay.id)).map(k => k.name), ['11.11 sale day!'], 'deleted — the list comes back')
check((await del(CAR, pay.id)).map(k => k.name), ['11.11 sale day!'], 'one already gone: no error')

// ── The PIC's calendar: the subsidiary's own key dates beside HR's holidays ──────────────────────────────────
const TODAY = await peek1(`SELECT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text`)
const FROM = await peek1(`SELECT ((date_trunc('month', $1::date) - interval '1 month')::date)::text`, [TODAY])
const TO = await peek1(`SELECT ((date_trunc('month', $1::date) + interval '4 months')::date - 1)::text`, [TODAY])
const shift = (d, n) => peek1(`SELECT (($1::date + $2::integer))::text`, [d, n])
const yearsBack = (d, n) => peek1(`SELECT (($1::date - make_interval(years => $2::integer))::date)::text`, [d, n])
await as(U.josiah, MANAGER)
await one(`SELECT public.mkt_sub_edit($1, $2::jsonb)`, [CAR, JSON.stringify({ pic: 'Kelvin Tan', whatsapp: '012-345 6789' })])
const code = await one(`SELECT public.mkt_sub_cal_link($1, 1, false)`, [CAR])
await as(U.mei, STAFF)
await save(CAR, SALE, { day: await yearsBack(TODAY, 3), name: 'Founding day', yearly: true })
await save(CAR, null, { day: await shift(TODAY, 10), name: 'Showroom opens', short: 'Showroom' })
await save(CAR, null, { day: await shift(TO, 1), name: 'Too far' })
await save(CAR, null, { day: await shift(FROM, -1), name: 'Too early' })
await save(CAR, null, { day: await shift(TO, 1), name: 'Not yet every year', yearly: true })
await save(ACM, null, { day: await shift(TODAY, 3), name: 'Acme only' })
await asSystem()
await q(`INSERT INTO public.att_holidays (day, name, states) VALUES ($1, 'Deepavali', NULL)`, [await shift(TODAY, 5)])
await as(null, [], 'anon')
const cal = await one(`SELECT public.mkt_pic_calendar($1)`, [code])
check(cal.keyDates.map(k => [k.name, k.short, k.yearly]), [['Founding day', null, true], ['Showroom opens', 'Showroom', false]],
  'its own in the window — once, or every year from before it; never one outside it, one still to start, another subsidiary’s')
check(cal.keyDates.map(k => Object.keys(k).sort().join(',')), ['day,name,short,yearly', 'day,name,short,yearly'], 'never an id')
check(cal.holidays.map(h => h.name), ['Deepavali'], 'HR’s holidays beside them, as before')
check(await one(`SELECT public.mkt_pic_calendar($1)`, ['f'.repeat(32)]), null, 'another code: nothing')

console.log(`marketing key dates: ${checks} checks passed`)
