// Local PostgreSQL regression for the food claim — migs 20261013150000, 20261013160000 and 20261013200000 (2026-10-13,
// the user: a rate a day HR sets, the titles that may claim it, and the days of the member's brand weeks they worked —
// "或者只 claim 其中的某几天"; "this food claim is only for fair sub-department"; then "they will submit by total month,
// for every pax, dont by week submit"). The three migrations run VERBATIM — each twice, the second changing nothing —
// over stand-ins for the tables they read, PRODUCTION's own bodies of the functions they swap statements into
// (member_claim_settings, member_claim_detail_for and member_submit_request, from the migrations that hold them,
// md5-equal to production on 2026-10-13) and a stand-in member_prepare_request holding production's claim and revision
// statements word for word.
// What is under test: HR's save (its door, its action, a rate before a title, the titles once) and read (Fair's titles,
// how many hold each in Fair); the member's form read; a month's food claim worked out (Fair only, the seat's title among
// HR's — a NULL in the list lets nobody through; HR's rate; the month over; each weekend of it, the member's own brand
// week, its days the booth's or the portal fair's or the weekend's; days × rate, nothing the phone sends about money);
// the sent claim (titled "Food claim · Sep 2026", no invoice, its claims row's line); a month claimed once and a day
// claimed once — refused before anything is written, free again once the other is cancelled or rejected, another
// person's never in the way, a claim HR sent back staying sent back, a stranded draft revisable; Outstation and Airbnb
// as before. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}
const rejects = async (promise, pattern, what) => {
  await assert.rejects(promise, pattern, what)
  checks++
}

const HR_USER = id(1)
const ANTHONY_USER = id(2)
const YUNY_USER = id(3)
const ZED_USER = id(4)
const REVENUE = id(10)
const HR_DEPT = id(11)
const FAIR = id(20)
const IR = id(21)
const FAIR_SCHEME = id(22)
const IR_SCHEME = id(23)
const LEVEL_MANAGER = id(30)
const LEVEL_EXEC = id(31)
const TL = id(40) // Team Leader
const RS = id(41) // Revenue Specialist
const HRX = id(42) // HR Executive — no Revenue title
const ANTHONY = id(50) // Team Leader in Fair, Revenue Specialist in IR
const YUNY = id(51) // Revenue Specialist in Fair
const ZED = id(52) // a Fair seat with no title, the company's Team Leader
const MIDVALLEY = id(60) // the 11–13 Sep fair
const NODAYS = id(61) // a fair whose days are not known (the weekend of 4 Sep)
const PENANG = id(62) // the 25–27 Sep fair, outstation
const KL_REGION = id(70)
const PENANG_REGION = id(71)

/** Signed in as somebody — HR's door (`test.manager`) and their actions (`test.actions`) for the stand-ins. */
async function as(user, { manager = false, actions = [] } = {}) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.manager', $2, false), set_config('test.actions', $3, false)`,
    [user ?? '', manager ? 'on' : 'off', actions.join(',')])
  await db.exec('SET ROLE authenticated')
}
const asSystem = async () => {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('test.manager', 'off', false), set_config('test.actions', '', false)`)
}

// The repo's own text, as production has it: LF line endings whatever this checkout's git turned them into.
const migrationText = async name => (await readFile(new URL(`${name}.sql`, migrations), 'utf8')).replace(/\r\n/g, '\n')
/** The LAST `CREATE … FUNCTION public.<name>(` in a migration, run as it is written. */
async function productionFunction(migration, name) {
  const sql = await migrationText(migration)
  const re = new RegExp(`create (?:or replace )?function (?:public\\.)?${name}\\([\\s\\S]*?\\bas\\s+(\\$\\w*\\$)`, 'gi')
  let match = null
  for (let m = re.exec(sql); m; m = re.exec(sql)) match = m
  assert(match, `Missing production function ${name}`)
  const end = sql.indexOf(`${match[1]};`, match.index + match[0].length)
  assert(end >= 0, `Missing function end ${name}`)
  await db.exec(sql.slice(match.index, end + match[1].length + 1))
}

let keys = 0
const key = () => id(9000 + ++keys)
/** The member's own send, as the app makes it: prepare, then submit. */
async function send(user, sub, detail) {
  await as(user)
  const prepared = await one(`SELECT public.member_prepare_request('claim', $1, $2::jsonb, $3, NULL)`, [sub, JSON.stringify(detail), key()])
  return one(`SELECT public.member_submit_request($1)`, [prepared.id])
}
/** A returned claim sent again, as the app sends it: its own request and its stored key. */
async function revise(user, sub, request, detail) {
  await asSystem()
  const stored = await one(`SELECT idempotency_key FROM member_requests WHERE id = $1`, [request])
  await as(user)
  const prepared = await one(`SELECT public.member_prepare_request('claim', $1, $2::jsonb, $3, $4)`, [sub, JSON.stringify(detail), stored, request])
  return one(`SELECT public.member_submit_request($1)`, [prepared.id])
}
const amountOf = async request => {
  await asSystem()
  return one(`SELECT c.amount::text FROM claims c JOIN member_requests r ON r.claim_id = c.id WHERE r.id = $1`, [request])
}
const statusOf = async request => {
  await asSystem()
  return one(`SELECT status FROM member_requests WHERE id = $1`, [request])
}
const drafts = async () => {
  await asSystem()
  return one(`SELECT count(*)::int FROM member_requests WHERE status = 'draft'`)
}
/** A month's food claim as the phone sends it: { week: [days] } for each weekend. */
const food = (month, weeks, more = {}) => ({
  claimType: 'food', month, notes: '', ...more,
  weeks: Object.entries(weeks).map(([week, days]) => ({ week, days })),
})

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    CREATE TABLE storage.objects(bucket_id text NOT NULL, name text NOT NULL);

    CREATE TABLE users(id uuid PRIMARY KEY, name text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE title_levels(id uuid PRIMARY KEY, rank smallint NOT NULL, name text NOT NULL);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true, level_id uuid);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid, status text NOT NULL DEFAULT 'active',
      user_id uuid, title_id uuid);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, department_id uuid NOT NULL, name text NOT NULL, code text,
      is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_schemes(id uuid PRIMARY KEY, sub_department_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_hierarchy(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id uuid NOT NULL, staff_id uuid NOT NULL, title_id uuid,
      effective_from date NOT NULL DEFAULT '2026-01-01', effective_to date);
    CREATE TABLE comm_venue_events(id uuid PRIMARY KEY, venue_key text, start_date date, end_date date);
    CREATE TABLE comm_venues(venue_key text PRIMARY KEY, display_name text);

    -- As production has them (migs 20261005030000, 20261006050000, 20261006150000).
    CREATE TABLE member_claim_rates(id boolean PRIMARY KEY DEFAULT true CHECK (id), base_name text NOT NULL DEFAULT 'Klang Valley',
      rate_per_spot numeric(15,2), airbnb_rate_per_pax_night numeric(15,2), updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid,
      airbnb_group_cap_per_night numeric(15,2), airbnb_group_max_pax integer NOT NULL DEFAULT 3);
    CREATE TABLE member_claim_regions(id uuid PRIMARY KEY, name text NOT NULL, spots integer NOT NULL, sort_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true, plane_ticket boolean NOT NULL DEFAULT false);
    CREATE TABLE member_claim_venue_regions(venue_key text PRIMARY KEY, region_id uuid NOT NULL);
    CREATE TABLE member_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL, staff_id uuid NOT NULL,
      sub_department_id uuid NOT NULL, kind text NOT NULL, status text NOT NULL DEFAULT 'draft', title text, detail jsonb NOT NULL DEFAULT '{}',
      claim_id uuid, idempotency_key uuid, note text, request_no text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), submitted_at timestamptz);
    CREATE TABLE member_request_attachments(request_id uuid NOT NULL, uploaded_by uuid NOT NULL, object_path text NOT NULL,
      content_sha256 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE claims(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), claim_type text NOT NULL, claimant_name text, department_id uuid,
      amount numeric(15,2) NOT NULL, description text, receipt_url text, status text NOT NULL, source_pool text, created_by uuid);
    CREATE TABLE member_waiting_forms(version integer PRIMARY KEY, require_upload boolean NOT NULL DEFAULT false);
    CREATE TABLE member_replacement_forms(version integer PRIMARY KEY, require_upload boolean NOT NULL DEFAULT false);

    -- Who the ERP lists where, weekend by weekend: the stand-in's answer for member_claim_brand_week.
    CREATE TABLE test_booths(staff_id uuid NOT NULL, sub_id uuid NOT NULL, week date NOT NULL, booth jsonb NOT NULL);
    CREATE TABLE test_audit(table_name text, ignore_columns text[]);

    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS text LANGUAGE sql AS
      $$ INSERT INTO test_audit VALUES (p_table, p_ignore) RETURNING 'all' $$;
    CREATE FUNCTION public.member_is_manager(p_permission text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT current_setting('test.manager', true) = 'on' $$;
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL $$;
    CREATE FUNCTION public.member_send_guard(p_kind text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
      $$ SELECT s.id FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() $$;
    CREATE FUNCTION public.member_claim_brand_week(p_staff uuid, p_sub uuid, p_week date) RETURNS jsonb LANGUAGE sql STABLE AS
      $$ SELECT b.booth FROM public.test_booths b WHERE b.staff_id = p_staff AND b.sub_id = p_sub AND b.week = p_week $$;
    CREATE FUNCTION public.member_request_json(p_request uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS
      $$ SELECT jsonb_build_object('id', r.id, 'kind', r.kind, 'title', r.title, 'status', r.status, 'detail', r.detail, 'claimId', r.claim_id)
           FROM public.member_requests r WHERE r.id = p_request $$;

    -- member_prepare_request: production's claim and revision statements (md5 321a82c9…), word for word; the waiting
    -- list's and replacement's left out.
    CREATE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid DEFAULT NULL::uuid)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
    DECLARE v_staff uuid:=public.member_staff_id(); v_existing public.member_requests%ROWTYPE; v_id uuid; v_title text;
    BEGIN
     IF p_kind='claim' AND p_detail ? 'claimType' THEN p_detail := public.member_claim_detail_for(p_detail, v_staff, p_sub_department); END IF;
     IF p_revision IS NOT NULL THEN
     SELECT * INTO v_existing FROM public.member_requests WHERE id=p_revision AND created_by=auth.uid() AND staff_id=v_staff FOR UPDATE;
     IF NOT FOUND OR v_existing.kind<>p_kind OR v_existing.sub_department_id<>p_sub_department OR v_existing.idempotency_key<>p_idempotency THEN RAISE EXCEPTION 'Only your returned request may be revised' USING ERRCODE='42501'; END IF;
     IF v_existing.status<>'needs_info' THEN
     IF v_existing.detail=p_detail AND v_existing.status IN('draft','submitted') THEN RETURN jsonb_build_object('id',v_existing.id,'userId',auth.uid(),'status',v_existing.status); END IF;
     IF NOT (v_existing.status='submitted' AND p_kind IN ('waiting','replacement')) THEN RAISE EXCEPTION 'Request is no longer awaiting your information; refresh and retry'; END IF;
     END IF;
     IF p_kind='claim' AND NOT EXISTS(SELECT 1 FROM public.claims WHERE id=v_existing.claim_id AND status='pending') THEN RAISE EXCEPTION 'Only a pending claim may be supplemented'; END IF;
     ELSE
     SELECT * INTO v_existing FROM public.member_requests WHERE created_by=auth.uid() AND idempotency_key=p_idempotency;
     IF FOUND THEN
     IF v_existing.kind<>p_kind OR v_existing.sub_department_id<>p_sub_department OR v_existing.detail<>p_detail THEN RAISE EXCEPTION 'This submission key has already been used for a different request'; END IF;
     RETURN jsonb_build_object('id',v_existing.id,'userId',auth.uid(),'status',v_existing.status);
     END IF;
     END IF;
     IF p_kind='claim' AND p_detail ? 'claimType' THEN
     v_title:=CASE WHEN coalesce((p_detail->>'planeTicket')::boolean,false) THEN 'Plane ticket claim'
      WHEN p_detail->>'claimType'='outstation' THEN 'Outstation claim' ELSE 'Airbnb claim' END
      ||CASE WHEN coalesce(p_detail->>'location','')<>'' THEN ' · '||(p_detail->>'location') ELSE '' END;
     END IF;
     IF p_revision IS NULL THEN
     INSERT INTO public.member_requests(created_by,staff_id,sub_department_id,kind,title,detail,idempotency_key)
     VALUES(auth.uid(),v_staff,p_sub_department,p_kind,v_title,p_detail,p_idempotency) RETURNING id INTO v_id;
     ELSE
     UPDATE public.member_requests SET status='draft',title=v_title,detail=p_detail,idempotency_key=p_idempotency WHERE id=p_revision AND created_by=auth.uid() AND (status='needs_info' OR (status='submitted' AND kind IN ('waiting','replacement'))) RETURNING id INTO v_id;
     IF v_id IS NULL THEN RAISE EXCEPTION 'Request changed while you were editing; refresh and retry'; END IF;
     END IF;
     RETURN jsonb_build_object('id',v_id,'userId',auth.uid(),'status','draft');
    END $function$;
  `)
  // PRODUCTION's bodies of the three the migrations swap statements into.
  await productionFunction('20261006150000_member_claim_airbnb_group', 'member_claim_settings')
  await productionFunction('20261012233000_member_claim_airbnb_cap_and_stay_window', 'member_claim_detail_for')
  await productionFunction('20261012233000_member_claim_airbnb_cap_and_stay_window', 'member_submit_request')

  await q(`INSERT INTO users (id, name) VALUES ($1, 'HR'), ($2, 'ANTHONY'), ($3, 'YUNY'), ($4, 'ZED')`, [HR_USER, ANTHONY_USER, YUNY_USER, ZED_USER])
  await q(`INSERT INTO departments VALUES ($1, 'Revenue Department'), ($2, 'HR Department')`, [REVENUE, HR_DEPT])
  await q(`INSERT INTO title_levels VALUES ($1, 7, 'Senior Manager'), ($2, 3, 'Executive')`, [LEVEL_MANAGER, LEVEL_EXEC])
  await q(`INSERT INTO titles (id, name, department_id, level_id) VALUES ($1, 'Team Leader', $4, $5), ($2, 'Revenue Specialist', $4, $6),
    ($3, 'HR Executive', $7, $6)`, [TL, RS, HRX, REVENUE, LEVEL_MANAGER, LEVEL_EXEC, HR_DEPT])
  await q(`INSERT INTO comm_sub_departments (id, department_id, name, code) VALUES ($1, $3, 'Fair', 'FAIR'), ($2, $3, 'IR', NULL)`, [FAIR, IR, REVENUE])
  await q(`INSERT INTO comm_schemes (id, sub_department_id) VALUES ($1, $2), ($3, $4)`, [FAIR_SCHEME, FAIR, IR_SCHEME, IR])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, user_id, title_id) VALUES
    ($1, 'ANTHONY', $4, $5, $8), ($2, 'YUNY', $4, $6, $9), ($3, 'ZED', $4, $7, $8)`, [ANTHONY, YUNY, ZED, REVENUE, ANTHONY_USER, YUNY_USER, ZED_USER, TL, RS])
  await q(`INSERT INTO comm_hierarchy (scheme_id, staff_id, title_id) VALUES ($1, $3, $6), ($2, $3, $7), ($1, $4, $7), ($1, $5, NULL)`,
    [FAIR_SCHEME, IR_SCHEME, ANTHONY, YUNY, ZED, TL, RS])
  // A seat that ended: not counted.
  await q(`INSERT INTO comm_hierarchy (scheme_id, staff_id, title_id, effective_to) VALUES ($1, $2, $3, '2026-06-30')`, [FAIR_SCHEME, YUNY, TL])
  await q(`INSERT INTO comm_venue_events VALUES ($1, 'MIDVALLEY', '2026-09-11', '2026-09-13'), ($2, 'NODAYS HALL', NULL, NULL),
    ($3, 'PWCC', '2026-09-25', '2026-09-27')`, [MIDVALLEY, NODAYS, PENANG])
  await q(`INSERT INTO comm_venues VALUES ('MIDVALLEY', 'Mid Valley'), ('PWCC', 'Penang Waterfront')`)
  await q(`INSERT INTO member_claim_rates (id, base_name, rate_per_spot, airbnb_rate_per_pax_night) VALUES (true, 'Klang Valley', 25, 65)`)
  await q(`INSERT INTO member_claim_regions (id, name, spots, sort_order) VALUES ($1, 'KL', 0, 1), ($2, 'Penang', 4, 2)`, [KL_REGION, PENANG_REGION])
  await q(`INSERT INTO member_claim_venue_regions VALUES ('MIDVALLEY', $1), ('PWCC', $2)`, [KL_REGION, PENANG_REGION])
  const booth = (fairId, more) => JSON.stringify({ fairId, brand: 'ZANOTTI', source: 'erp', picked: true, ...more })
  // ANTHONY in September: a fair with no days (4 Sep), Mid Valley (11–13), the ERP's MITEC booth no fair has (18–20),
  // Penang (25–27); and a weekend of a month still to come.
  await q(`INSERT INTO test_booths VALUES
    ($1, $4, '2026-09-04', $6::jsonb), ($1, $4, '2026-09-11', $7::jsonb), ($1, $4, '2026-09-18', $8::jsonb), ($1, $4, '2026-09-25', $9::jsonb),
    ($1, $4, '2099-01-02', $10::jsonb), ($1, $5, '2026-09-11', $7::jsonb), ($2, $4, '2026-09-11', $7::jsonb), ($3, $4, '2026-09-11', $7::jsonb)`,
  [ANTHONY, YUNY, ZED, FAIR, IR, booth(NODAYS), booth(MIDVALLEY), booth(null, { venueKey: 'MITEC', venue: 'MITEC', start: '2026-09-18', end: '2026-09-20' }),
    booth(PENANG), booth(null, { venueKey: 'FUTURE', venue: 'FUTURE HALL', start: '2099-01-02', end: '2099-01-04' })])

  // ── The three migrations, each twice: a second run changes nothing ──
  const bodies = async () => q(`SELECT proname, md5(prosrc) AS m FROM pg_proc WHERE proname IN
    ('member_claim_settings', 'member_claim_detail_for', 'member_prepare_request', 'member_submit_request', 'member_claim_food_detail',
     'member_food_claim_check', 'member_food_claim_taken', 'member_food_claim_line') ORDER BY proname`)
  for (const name of ['20261013150000_member_food_claim', '20261013160000_member_food_claim_hardening', '20261013200000_member_food_claim_by_month']) {
    const migration = await migrationText(name)
    await db.exec(migration)
    const first = await bodies()
    await db.exec(migration)
    check(await bodies(), first, `${name}: a second run swaps nothing again`)
  }
  const count = async (fn, text) => one(`SELECT (length(prosrc) - length(replace(prosrc, $2, ''))) / length($2) FROM pg_proc WHERE proname = $1`, [fn, text])
  check([
    await count('member_claim_detail_for', 'member_claim_food_detail'),
    await count('member_prepare_request', 'member_food_claim_taken'),
    await count('member_prepare_request', `'Food claim · '`),
    await count('member_prepare_request', `(status='draft' AND kind='claim' AND claim_id IS NOT NULL)`),
    await count('member_prepare_request', `NOT (v_existing.status='draft' AND p_kind='claim' AND v_existing.claim_id IS NOT NULL)`),
    await count('member_submit_request', 'member_food_claim_check'),
    await count('member_submit_request', 'member_food_claim_line'),
    await count('member_claim_settings', `'food'`),
  ], [1, 1, 1, 1, 1, 1, 1, 1], 'each swap is in once')
  check(await one(`SELECT count(*)::int FROM pg_proc WHERE proname = 'member_food_claim_clash'`), 0, 'the week-by-week check is gone')
  check(await q(`SELECT ignore_columns FROM test_audit WHERE table_name = 'member_claim_rates' LIMIT 1`),
    [{ ignore_columns: ['food_updated_at', 'food_updated_by'] }], 'its saved-at alone is no change')

  // ── HR's side ──
  await as(HR_USER, { manager: false, actions: ['member.manage'] })
  await reject(`SELECT public.member_admin_food_claim()`, [], /HR request management access is required/, 'the read keeps HR’s door')
  await reject(`SELECT public.member_admin_save_food_claim(20, $1::uuid[])`, [[TL]], /HR request management access is required/, 'the save keeps HR’s door')
  await as(HR_USER, { manager: true })
  await reject(`SELECT public.member_admin_save_food_claim(20, $1::uuid[])`, [[TL]], /HR request management access is required/, 'and asks member.manage')
  await as(HR_USER, { manager: true, actions: ['member.manage'] })
  await reject(`SELECT public.member_admin_save_food_claim(NULL, $1::uuid[])`, [[TL]], /Set the rate a day before picking who may claim it/, 'a title needs a rate')
  await reject(`SELECT public.member_admin_save_food_claim(0, $1::uuid[])`, [[TL]], /Set the rate a day before picking who may claim it/, 'a rate above nothing')
  await reject(`SELECT public.member_admin_save_food_claim(-1, '{}')`, [], /from RM 0 to RM 100,000, to the sen/, 'no negative rate')
  await reject(`SELECT public.member_admin_save_food_claim(12.345, '{}')`, [], /to the sen/, 'to the sen')
  await reject(`SELECT public.member_admin_save_food_claim(20, $1::uuid[])`, [[id(999)]], /no longer in People/, 'a title that is not')
  const saved = await one(`SELECT public.member_admin_save_food_claim(20, $1::uuid[])`, [[TL, TL]])
  check({ perDay: Number(saved.perDay), titleIds: saved.titleIds, sub: saved.subDepartmentId, subName: saved.subName, updatedBy: saved.updatedBy },
    { perDay: 20, titleIds: [TL], sub: FAIR, subName: 'Fair', updatedBy: 'HR' }, 'saved, each title once')
  check(saved.titles.map(t => [t.name, t.level, t.people]), [['Team Leader', 'Senior Manager', 1], ['Revenue Specialist', 'Executive', 1]],
    'the Revenue titles, the highest level first, and how many hold each in Fair now (not IR, not a seat that ended)')
  await asSystem()
  check(await q(`SELECT base_name, rate_per_spot::text, airbnb_rate_per_pax_night::text FROM member_claim_rates`),
    [{ base_name: 'Klang Valley', rate_per_spot: '25.00', airbnb_rate_per_pax_night: '65.00' }], 'Claim rates untouched')

  await as(ANTHONY_USER)
  const settings = await one(`SELECT public.member_claim_settings()`)
  check(settings.food, { subDepartmentId: FAIR, perDay: 20, titles: ['Team Leader'] }, 'the member’s form reads Fair, the rate and the titles')
  check([settings.perSpot, settings.regions.length], [25, 2], 'and the rest as before')

  // ── A month's food claim worked out ──
  await asSystem()
  const detail = async (staff, sub, d) => one(`SELECT public.member_claim_detail_for($1::jsonb, $2, $3)`, [JSON.stringify(d), staff, sub])
  const refused = (staff, sub, d, pattern, what) => reject(`SELECT public.member_claim_detail_for($1::jsonb, $2, $3)`, [JSON.stringify(d), staff, sub], pattern, what)
  const worked = await detail(ANTHONY, FAIR, food('2026-09', { '2026-09-18': ['2026-09-20'], '2026-09-11': ['2026-09-12', '2026-09-11', '2026-09-11'] },
    { amount: 999, rate: 1, region: 'x', week: '2026-09-11', notes: 'Saturday off' }))
  check(worked, {
    claimType: 'food', category: 'Food', month: '2026-09', monthLabel: 'Sep 2026', notes: 'Saturday off', titleName: 'Team Leader',
    weeks: [
      { week: '2026-09-11', fairId: MIDVALLEY, brand: 'ZANOTTI', location: 'Mid Valley', venueKey: 'MIDVALLEY', source: 'erp',
        fairStart: '2026-09-11', fairEnd: '2026-09-13', days: ['2026-09-11', '2026-09-12'] },
      { week: '2026-09-18', fairId: null, brand: 'ZANOTTI', location: 'MITEC', venueKey: 'MITEC', source: 'erp',
        fairStart: '2026-09-18', fairEnd: '2026-09-20', days: ['2026-09-20'] },
    ],
    days: ['2026-09-11', '2026-09-12', '2026-09-20'], dayCount: 3, rate: 20, amount: 60,
  }, 'each weekend in order, its days once and in order, at HR’s rate — what the phone says about money is not even kept')
  check((await detail(ANTHONY, FAIR, food('2026-09', { '2026-09-04': ['2026-09-06'] }))).weeks[0].fairEnd, '2026-09-06', 'a fair with no days: its weekend, Friday to Sunday')
  await refused(ANTHONY, FAIR, food('2099-01', { '2099-01-02': ['2099-01-03'] }), /Food for Jan 2099 is claimed once the month is over, from 1 Feb 2099/, 'a month not over')
  await refused(ANTHONY, IR, food('2026-09', { '2026-09-11': ['2026-09-11'] }), /for the Fair sub-department only/, 'not IR')
  await refused(YUNY, FAIR, food('2026-09', { '2026-09-11': ['2026-09-11'] }), /not open to Revenue Specialist/, 'a title HR did not tick')
  await refused(ZED, FAIR, food('2026-09', { '2026-09-11': ['2026-09-11'] }), /not open to your title/, 'a seat with no title: none, as the app asks')
  await q(`UPDATE member_claim_rates SET food_title_ids = ARRAY[NULL, $1]::uuid[]`, [RS])
  await refused(ANTHONY, FAIR, food('2026-09', { '2026-09-11': ['2026-09-11'] }), /not open to Team Leader/, 'a NULL in the list lets nobody through')
  await q(`UPDATE member_claim_rates SET food_title_ids = ARRAY[$1]::uuid[]`, [TL])
  await refused(ANTHONY, FAIR, food('2026-09', { '2026-10-02': ['2026-10-02'] }), /The weekend of 2 Oct is not one of Sep 2026/, 'a weekend of another month')
  await refused(ANTHONY, FAIR, { claimType: 'food', month: '2026-09', weeks: [{ week: '2026-09-11', days: ['2026-09-11'] }, { week: '2026-09-11', days: ['2026-09-12'] }] },
    /Tick the days you worked at the fairs/, 'a weekend twice')
  await refused(ANTHONY, FAIR, food('2026-08', { '2026-08-28': ['2026-08-28'] }), /no brand week the weekend of 28 Aug/, 'a weekend with no booth')
  await refused(ANTHONY, FAIR, food('2026-09', { '2026-09-11': ['2026-09-14'] }), /the fair's own days: 11 Sep to 13 Sep for the weekend of 11 Sep/, 'a day after the fair')
  // The booth's own days come first — the days the app's tiles show.
  await q(`UPDATE test_booths SET booth = booth || '{"start":"2026-09-12","end":"2026-09-13"}'::jsonb WHERE staff_id = $1 AND sub_id = $2 AND week = '2026-09-11'`, [ANTHONY, FAIR])
  await refused(ANTHONY, FAIR, food('2026-09', { '2026-09-11': ['2026-09-11'] }), /12 Sep to 13 Sep/, 'the booth’s days, not the portal fair’s')
  await q(`UPDATE test_booths SET booth = booth - 'start' - 'end' WHERE staff_id = $1 AND sub_id = $2 AND week = '2026-09-11'`, [ANTHONY, FAIR])
  for (const bad of [{ claimType: 'food', month: '2026-09' }, { claimType: 'food', month: '2026-09', weeks: [] }, food('2026-09', { '2026-09-11': [] }),
    food('2026-09', { '2026-09-11': ['11 Sep'] }), { claimType: 'food', month: '2026-09', weeks: ['2026-09-11'] }]) {
    await refused(ANTHONY, FAIR, bad, /Tick the days you worked at the fairs/, `refused: ${JSON.stringify(bad.weeks)}`)
  }
  await refused(ANTHONY, FAIR, { claimType: 'food', month: 'Sep', weeks: [] }, /Choose the month the food claim is for/, 'a month')
  // Outstation and Airbnb are worked out as before.
  check((await detail(ANTHONY, FAIR, { claimType: 'outstation', week: '2026-09-25' })).amount, 100, 'Outstation: 4 spots × RM 25')
  check(Number((await detail(ANTHONY, FAIR, { claimType: 'airbnb', week: '2026-09-25', start: '2026-09-24', end: '2026-09-26', male: '2', female: '0',
    invoiceAmount: '300', invoiceHash: 'a'.repeat(64) })).amount), 260, 'Airbnb: the invoice up to 2 pax × RM 65 × 2 nights')
  await refused(ANTHONY, FAIR, { claimType: 'lunch', week: '2026-09-11' }, /Choose Outstation or Airbnb/, 'anything else')

  // ── Sent: a month, once ──
  const september = food('2026-09', { '2026-09-11': ['2026-09-11', '2026-09-12', '2026-09-13'], '2026-09-18': ['2026-09-18', '2026-09-19', '2026-09-20'] })
  const sent = await send(ANTHONY_USER, FAIR, september)
  check([sent.status, sent.title, Number(sent.detail.amount)], ['submitted', 'Food claim · Sep 2026', 120], 'sent, titled by its month, with no invoice')
  await asSystem()
  check(await q(`SELECT amount::text, description, receipt_url, status, claimant_name FROM claims WHERE id = $1`, [sent.claimId]), [{
    amount: '120.00', status: 'pending', claimant_name: 'ANTHONY', receipt_url: null,
    description: 'Food · 6 days × RM 20.00 · Sep 2026; Mid Valley 11 Sep, 12 Sep, 13 Sep; MITEC 18 Sep, 19 Sep, 20 Sep',
  }], 'its claims row: the line HR, Finance and payroll read')
  const before = await drafts()
  await as(ANTHONY_USER)
  await reject(`SELECT public.member_prepare_request('claim', $1, $2::jsonb, $3, NULL)`,
    [FAIR, JSON.stringify(food('2026-09', { '2026-09-04': ['2026-09-04'] })), key()],
    /Food for Sep 2026 is already claimed \(another request\): a month is claimed once/, 'a month claimed once')
  check(await drafts(), before, 'refused before anything is written: no draft left')
  // Another person's month is theirs (HR ticks Revenue Specialist too).
  await as(HR_USER, { manager: true, actions: ['member.manage'] })
  await q(`SELECT public.member_admin_save_food_claim(20, $1::uuid[])`, [[TL, RS]])
  check((await send(YUNY_USER, FAIR, food('2026-09', { '2026-09-11': ['2026-09-11', '2026-09-12'] }))).status, 'submitted', 'YUNY’s September is YUNY’s')
  // Cancelled or rejected, a month is free again.
  await asSystem()
  await q(`UPDATE member_requests SET status = 'withdrawn' WHERE id = $1`, [sent.id])
  const again = await send(ANTHONY_USER, FAIR, food('2026-09', { '2026-09-11': ['2026-09-11'] }))
  check(again.status, 'submitted', 'after the cancel, September again')
  await asSystem()
  await q(`UPDATE member_requests SET status = 'rejected' WHERE id = $1`, [again.id])
  const held = (await send(ANTHONY_USER, FAIR, september)).id
  check(await statusOf(held), 'submitted', 'after a rejection, September again')

  // A day is claimed once too — whatever month holds it (a claim of August's with 4 Sep in it, written by hand).
  await asSystem()
  await q(`INSERT INTO member_requests (created_by, staff_id, sub_department_id, kind, status, title, detail)
    VALUES ($1, $2, $3, 'claim', 'submitted', 'Food claim · Aug 2026', '{"claimType":"food","month":"2026-08","days":["2026-09-04"]}'::jsonb)`, [ANTHONY_USER, ANTHONY, FAIR])
  // HR sends September back; sent again with that day, it is refused — and stays sent back.
  await q(`UPDATE member_requests SET status = 'needs_info' WHERE id = $1`, [held])
  await rejects(revise(ANTHONY_USER, FAIR, held, food('2026-09', { '2026-09-04': ['2026-09-04'], '2026-09-11': ['2026-09-11'] })),
    /Food is already claimed for 4 Sep/, 'the 4th is another claim’s')
  check(await statusOf(held), 'needs_info', 'still sent back — never left a draft nobody sees')
  check((await revise(ANTHONY_USER, FAIR, held, food('2026-09', { '2026-09-11': ['2026-09-11'] }))).status, 'submitted', 'sent again without it: through')
  check(await amountOf(held), '20.00', 'its claims row follows: 1 day')
  // One a refused send did leave a draft (its claims row still pending) may be revised again.
  await asSystem()
  await q(`UPDATE member_requests SET status = 'draft' WHERE id = $1`, [held])
  check((await revise(ANTHONY_USER, FAIR, held, september)).status, 'submitted', 'a stranded draft is sent again')
  check(await amountOf(held), '120.00', 'and its claims row with it')

  // Outstation by road still needs no invoice; Airbnb still does.
  check((await send(ANTHONY_USER, FAIR, { claimType: 'outstation', week: '2026-09-25' })).title, 'Outstation claim · Penang Waterfront', 'Outstation as before')
  await as(ANTHONY_USER)
  await reject(`SELECT public.member_submit_request((public.member_prepare_request('claim', $1, $2::jsonb, $3, NULL)->>'id')::uuid)`,
    [FAIR, JSON.stringify({ claimType: 'airbnb', week: '2026-09-25', start: '2026-09-24', end: '2026-09-26', male: '2', female: '0',
      invoiceAmount: '300', invoiceHash: 'b'.repeat(64) }), key()], /A verified invoice is required before submitting/, 'Airbnb still needs its invoice')

  // ── Nothing open to the browser it should not be ──
  await asSystem()
  check(await q(`SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
    FROM pg_proc p WHERE p.proname IN ('member_admin_food_claim', 'member_admin_save_food_claim', 'member_claim_food_detail', 'member_food_claim_check',
      'member_food_claim_taken', 'member_food_claim_line', 'member_food_claim_sub')
    ORDER BY p.proname`), [
    { proname: 'member_admin_food_claim', auth: true, anon: false },
    { proname: 'member_admin_save_food_claim', auth: true, anon: false },
    { proname: 'member_claim_food_detail', auth: false, anon: false },
    { proname: 'member_food_claim_check', auth: false, anon: false },
    { proname: 'member_food_claim_line', auth: false, anon: false },
    { proname: 'member_food_claim_sub', auth: false, anon: false },
    { proname: 'member_food_claim_taken', auth: false, anon: false },
  ], 'HR’s two to a signed-in session (each asks its own door); the helpers to nobody but the functions')

  console.log(`validate-food-claim: ${checks} checks passed`)
} finally {
  await db.close()
}
