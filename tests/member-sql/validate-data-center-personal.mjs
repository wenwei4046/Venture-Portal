// Local PostgreSQL regression for 20261014190000 (2026-10-14, People › Documentation — the user: "现在的 documentation 我要
// 分成两种：一个是 company，一个是 personal"; a person's folder holds folders shared with them or not, a document kept
// from them; Move / Copy / Duplicate; "view only me" — Alvin of HR (L3) sees it, those above him (L4 …) see it, no
// other L3 does). Documentation's migrations, Hiring's (their tables are in the review hardening's grants), the review
// hardening, the app's tick (20261011190000), the Drive and its Bin run VERBATIM over stand-ins for what they read, the
// storage schema, the permission check, the Audit Log's rule and the memo notices (production's statements) — then the
// migration under test. What is under test: a person's folder is a place (folders and files of HR's, a name once there,
// never for somebody who has left); a folder or a file in it is shared with its person or kept back — a folder's share
// reaching what is in it, something View only me needing a share of its own; a letter kept from its person leaves the
// memo it travelled as (its notice with it, the receipt kept), still on file, and comes back read as it was; a published
// memo's counts follow; View only me — the one who set it, whoever stands higher on the ladder (now, or as kept once they
// have left) and the Principal kind see it, nobody else, not in the read, a link, a write, the bucket, the Bin or a name
// refused as taken; moves and copies carry what they leave behind and share nothing with anybody new; one's own
// documents (Company behind a Revenue member's box, Personal under the nearest folder they are shown) and opening them;
// the Revenue app's View as; the Audit Log's rule; who may call what. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const load = async f => db.exec((await readFile(new URL(f, migrations), 'utf8')).replace(/\r\n/g, '\n'))

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

// Logins. ALVIN (HR, L3) and LISA (HR, L3) are peers; BOSS (HR, L5) stands above them; LOW (HR, L2) below; SHARED is hr@
// (no People record); PRIN_SHARED is principal@ (the Principal kind, no record); PETER (Revenue, L9) is a person whose
// folder HR keeps; KRIS (Revenue, L9, no login) another; GONE has left.
const ALVIN_USER = id(1)
const LISA_USER = id(2)
const BOSS_USER = id(3)
const LOW_USER = id(4)
const SHARED_USER = id(5)
const PRIN_SHARED_USER = id(6)
const PETER_USER = id(7)
const KRIS_USER = id(8)
const ALVIN = id(11)
const LISA = id(12)
const BOSS = id(13)
const LOW = id(14)
const PETER = id(17)
const KRIS = id(18)
const GONE = id(19)
const HR = id(21)
const REV = id(22)
const L2 = id(31)
const L3 = id(32)
const L5 = id(33)
const L9 = id(34)
const L6 = id(35)
const T_EXEC = id(41)
const T_MGR = id(42)
const T_ASST = id(43)
const T_DIR = id(44)
const T_LEAD = id(45)

const EDIT = ['documentation.view', 'documentation.create', 'documentation.edit']
const VIEW = ['documentation.view']
const MAKE = ['documentation.view', 'documentation.create']
/** Signed in as `user`, holding `actions` (has_any_action), `perms` (has_perm) — and Profile · Documentation's box closed or not. */
async function as(user, actions = [], role = null, perms = [], closed = false) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false), set_config('test.perms', $3, false),
                  set_config('test.closed', $4, false)`,
  [user ?? '', actions.join(','), perms.join(','), closed ? 'yes' : ''])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const asHr = (user, role = null) => as(user, EDIT, role)
const asPerson = (user, perms = [], role = null) => as(user, [], role, perms)
/** The tables themselves, as the database's owner (no session's grants). */
const sys = () => db.exec('RESET ROLE')

/** An object in the bucket, `age` old, uploaded by `owner` (a login's id) or by nobody (the service role). */
const put = async (name, age = '0 seconds', owner = null) => {
  await sys()
  await q(`INSERT INTO storage.objects(bucket_id, name, created_at, owner_id) VALUES ('hr-documents', $1, now() - $2::interval, $3)`,
    [name, age, owner])
}
const fileRow = async fid => {
  await sys()
  return (await q(`SELECT * FROM public.hr_drive_files WHERE id = $1`, [fid]))[0]
}
const folderRow = async fid => {
  await sys()
  return (await q(`SELECT * FROM public.hr_drive_folders WHERE id = $1`, [fid]))[0] ?? null
}
const trail = async fid => {
  await sys()
  return (await q(`SELECT what FROM public.hr_drive_file_events WHERE file_id = $1 ORDER BY created_at, id`, [fid])).map(e => e.what)
}
const lastEvent = async fid => {
  await sys()
  return (await q(`SELECT what, actor_name, note FROM public.hr_drive_file_events WHERE file_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [fid]))[0]
}
const driveAs = async user => {
  await asHr(user)
  return one(`SELECT public.hr_drive()`)
}
const seesFile = async (user, fid) => (await driveAs(user)).files.some(f => f.id === fid)
const seesFolder = async (user, fid) => (await driveAs(user)).folders.some(f => f.id === fid)
const folderIn = async (user, place, name) => {
  await asHr(user)
  return one(`SELECT public.hr_drive_folder_add($1, $2)`, [place, name])
}
const fileIn = async (user, place, name) => {
  const path = `drive/${crypto.randomUUID()}/${name}`
  await put(path)
  await asHr(user)
  return { id: await one(`SELECT public.hr_drive_file_add($1, $2, $3, 'application/pdf', 100)`, [place, path, name]), path }
}
const lock = async (user, kind, item, on = true) => {
  await asHr(user)
  return one(`SELECT public.hr_drive_private($1, $2, $3)`, [kind, item, on])
}
const share = async (user, kind, item, on) => {
  await asHr(user)
  return one(`SELECT public.hr_drive_member_view($1, $2, $3)`, [kind, item, on])
}
const memberSeesFile = async fid => {
  await sys()
  return one(`SELECT public.hr_drive_member_sees_file($1)`, [fid])
}
/** How many of the bucket's objects of that name a session reads — the signed link's own question. */
const reads = async (user, path, actions = [], perms = [], closed = false) => {
  await as(user, actions, 'authenticated', perms, closed)
  const n = Number(await one(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'hr-documents' AND name = $1`, [path]))
  await sys()
  return n
}
const recipients = async memo => {
  await sys()
  return (await q(`SELECT staff_id FROM public.member_memo_recipients WHERE memo_id = $1 ORDER BY staff_id`, [memo])).map(r => r.staff_id)
}
const memoNotices = async (user, memo) => {
  await sys()
  return q(`SELECT read_at IS NOT NULL AS read FROM public.app_notifications WHERE user_id = $1 AND ref_kind = 'memo' AND ref_id = $2 ORDER BY id`,
    [user, memo])
}
const letterTrail = async letter => {
  await sys()
  return q(`SELECT what, note FROM public.hr_letter_events WHERE letter_id = $1 ORDER BY created_at, id`, [letter])
}
const myDocs = async (user, perms = [], closed = false) => {
  await as(user, [], 'authenticated', perms, closed)
  const v = await one(`SELECT public.my_documents()`)
  await sys()
  return v
}
const byName = list => Object.fromEntries(list.map(x => [x.name, x]))

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), owner_id text);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;

    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text, role text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE title_levels(id uuid PRIMARY KEY, rank integer);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, level_id uuid);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, employee_code text, department_id uuid,
      status text NOT NULL DEFAULT 'active', user_id uuid, title_id uuid, designation text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE member_memos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL,
      sender text, version integer NOT NULL DEFAULT 1, published_at timestamptz NOT NULL DEFAULT now(), effective_at date,
      requires_ack boolean NOT NULL DEFAULT true, created_by uuid,
      CONSTRAINT member_memos_body_check CHECK (length(body) BETWEEN 1 AND 30000));
    CREATE TABLE member_memo_audiences(memo_id uuid NOT NULL REFERENCES member_memos(id), sub_department_id uuid NOT NULL);
    CREATE TABLE member_memo_receipts(memo_id uuid NOT NULL REFERENCES member_memos(id), user_id uuid NOT NULL, version integer NOT NULL,
      read_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz, PRIMARY KEY (memo_id, user_id, version));
    CREATE TABLE app_notifications(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL, kind text NOT NULL,
      title text, body text, ref_kind text, ref_id text, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());

    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT p_key = ANY (string_to_array(current_setting('test.perms', true), ','))
    $$;
    -- Profile · Documentation's box: closed for whoever the test says.
    CREATE FUNCTION public.tab_box_closed(p_tab text, p_action text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT coalesce(current_setting('test.closed', true), '') = 'yes'
    $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO public.audit_tables (table_name, needs_rule) VALUES (p_table, p_needs)
      ON CONFLICT (table_name) DO UPDATE SET needs_rule = EXCLUDED.needs_rule;
      RETURN p_table;
    END $$;
    CREATE TABLE audit_tables(table_name text PRIMARY KEY, needs_rule text);
    -- The Audit Log's lines (production's columns that matter here; its triggers are not stood in — the tests write lines).
    CREATE TABLE audit_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(),
      table_name text NOT NULL, row_key text, op text, old_row jsonb, new_row jsonb, needs text[]);
    ALTER TABLE audit_tables ADD CONSTRAINT audit_tables_needs_rule_check CHECK (needs_rule IN ('payroll_voucher', 'payroll_pool_row'));
    CREATE TABLE payment_vouchers(id uuid PRIMARY KEY, reference_type text, voucher_no text);
  `)
  // Production's audit_row_needs (read off pg_proc on 2026-10-14), its statement the migration swaps.
  await db.exec(`
CREATE OR REPLACE FUNCTION public.audit_row_needs(p_rule text, p_table text, p_row jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c_payroll CONSTANT text[] := ARRAY['payroll_disbursement', 'payroll_statutory', 'payroll_payment_request'];
  c_needs   CONSTANT text[] := ARRAY['payroll_payouts', 'hr_costing'];
  c_uuid    CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_ref     text;
  v_no      text;
BEGIN
  IF p_rule = 'payroll_voucher' THEN
    IF p_table = 'payment_vouchers' THEN
      v_ref := p_row ->> 'reference_type';
    ELSIF p_table = 'approval_requests' THEN
      IF p_row ->> 'request_type' = 'payment_voucher' AND (p_row ->> 'reference_id') ~ c_uuid THEN
        SELECT v.reference_type INTO v_ref FROM public.payment_vouchers v WHERE v.id = (p_row ->> 'reference_id')::uuid;
      END IF;
    ELSIF (p_row ->> 'voucher_id') ~ c_uuid THEN
      SELECT v.reference_type INTO v_ref FROM public.payment_vouchers v WHERE v.id = (p_row ->> 'voucher_id')::uuid;
    END IF;
    RETURN CASE WHEN v_ref = ANY (c_payroll) THEN c_needs END;
  ELSIF p_rule = 'payroll_pool_row' THEN
    v_no := substring(p_row ->> 'description' FROM '^PV (HV-(?:PV|OR)-[0-9]{6}-[0-9]{4}):');
    IF v_no IS NOT NULL THEN
      SELECT v.reference_type INTO v_ref FROM public.payment_vouchers v WHERE v.voucher_no = v_no LIMIT 1;
      IF FOUND THEN RETURN CASE WHEN v_ref = ANY (c_payroll) THEN c_needs END; END IF;
    END IF;
    RETURN CASE
      WHEN (p_row ->> 'description') ~ '^(PV \\S+: )?(Payroll disbursement|Director salary) [A-Z][a-z]{2} [0-9]{4} — '
      THEN c_needs END;
  END IF;
  RETURN NULL;
END
$function$;
  `)
  // The member app's own readers the migrations swap a statement into (as validate-data-center-bin.mjs stands them in).
  await db.exec(`
    CREATE FUNCTION public.member_has_membership(p_staff uuid, p_sub uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.member_visible_memo(p_memo uuid, p_staff uuid) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
    BEGIN
      RETURN EXISTS(SELECT 1 FROM public.member_memo_audiences a WHERE a.memo_id=p_memo AND public.member_has_membership(p_staff,a.sub_department_id));
    END $$;
    CREATE FUNCTION public.member_data_snapshot(p_first boolean) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
    BEGIN
      RETURN (SELECT jsonb_agg(jsonb_build_object('id', m.id, 'departments',(SELECT jsonb_agg(d.name) FROM public.member_memo_audiences a
 JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id))) FROM public.member_memos m);
    END $$;
    CREATE FUNCTION public.member_admin_snapshot() RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
    DECLARE v_memos boolean := true;
    BEGIN
      RETURN jsonb_build_object('memos', (SELECT jsonb_agg(m.id) FROM public.member_memos m WHERE v_memos));
    END $$;
    -- The Revenue app's member: an active commission person of theirs (production's asks payroll_source and the dates).
    CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
    DECLARE v uuid;
    BEGIN
      SELECT s.id INTO v FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() AND s.status = 'active' LIMIT 1;
      IF v IS NULL THEN RAISE EXCEPTION 'No active Revenue staff record is linked to this account' USING ERRCODE = '42501'; END IF;
      RETURN v;
    END $$;
  `)

  await q(`INSERT INTO users(id, name, email, role) VALUES
    ($1, 'Alvin', 'alvin@x', 'hr'), ($2, 'Lisa', 'lisa@x', 'hr'), ($3, 'Boss', 'boss@x', 'hr'), ($4, 'Low', 'low@x', 'hr'),
    ($5, 'HR', 'hr@venture.my', 'hr'), ($6, 'Principal', 'principal@venture.my', 'principal'),
    ($7, 'Peter', 'peter@x', 'revenue_member'), ($8, 'Kris', 'kris@x', 'revenue_member')`,
  [ALVIN_USER, LISA_USER, BOSS_USER, LOW_USER, SHARED_USER, PRIN_SHARED_USER, PETER_USER, KRIS_USER])
  await q(`INSERT INTO departments VALUES ($1, 'HR'), ($2, 'Revenue Department')`, [HR, REV])
  await q(`INSERT INTO title_levels VALUES ($1, 2), ($2, 3), ($3, 5), ($4, 9)`, [L2, L3, L5, L9])
  await q(`INSERT INTO titles VALUES ($1, 'HR EXECUTIVE', $5), ($2, 'HR MANAGER', $6), ($3, 'HR ASSISTANT', $7), ($4, 'Revenue Director', $8)`,
    [T_EXEC, T_MGR, T_ASST, T_DIR, L3, L5, L2, L9])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, status, user_id, title_id) VALUES
    ($1, 'ALVIN', $7, 'active', $8, $14), ($2, 'LISA', $7, 'active', $9, $14), ($3, 'BOSS', $7, 'active', $10, $15),
    ($4, 'LOW', $7, 'active', $11, $16), ($5, 'PETER', $13, 'active', $12, $17), ($6, 'KRIS', $13, 'active', NULL, $17)`,
  [ALVIN, LISA, BOSS, LOW, PETER, KRIS, HR, ALVIN_USER, LISA_USER, BOSS_USER, LOW_USER, PETER_USER, REV, T_EXEC, T_MGR, T_ASST, T_DIR])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, status) VALUES ($1, 'GONE', $2, 'inactive')`, [GONE, REV])

  for (const f of [
    '20261011070000_documentation.sql', '20261011070100_documentation_published_letter_type.sql',
    '20261011080000_hiring.sql', '20261011080100_hiring_file_reads.sql', '20261011080200_hiring_reconsider_declined.sql',
    '20261011120100_round2_review_hardening.sql', '20261011170000_documentation_withdraw_and_delete_files.sql',
    '20261011190000_documentation_app_ticks.sql', '20261011200000_documentation_memo_withdraw.sql',
    '20261012220000_documentation_drive.sql', '20261013183000_data_center_bin.sql',
  ]) {
    await load(f)
  }

  // The memo notices, as 20261012210000 writes them (its three triggers, verbatim).
  const memosSql = await readFile(new URL('20261012210000_memos_reach_every_view.sql', migrations), 'utf8')
  const notices = memosSql.replace(/\r\n/g, '\n').match(/-- ── 4b\. Telling them[\s\S]*?FOR EACH ROW EXECUTE FUNCTION public\.memo_receipt_reads_its_notice\(\);/)
  assert.ok(notices, 'the memo notices are where 20261012210000 writes them')
  await db.exec(notices[0])

  await load('20261014190000_data_center_personal_and_private.sql')
  checks++

  // ── 1. A person's folder is a place ──────────────────────────────────────────────────────────────────────────────
  const CONTRACTS = await folderIn(ALVIN_USER, `person:${PETER}`, 'Contracts')
  const contractsRow = await folderRow(CONTRACTS)
  check([contractsRow.parent_kind, contractsRow.parent_staff_id, contractsRow.parent_folder_id, contractsRow.parent_dept_id],
    ['person', PETER, null, null], 'a folder made in a person’s folder names the person')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_folder_add($1, ' contracts ')`, [`person:${PETER}`], /contracts is here already\./,
    'a name once in a person’s folder, case and spaces aside')
  check(typeof (await folderIn(ALVIN_USER, `person:${KRIS}`, 'Contracts')), 'string', 'another person’s folder may hold the same name')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_folder_add($1, 'Old')`, [`person:${GONE}`], /That person is not on the payroll any more\./,
    'nothing goes into the folder of somebody who has left')
  await reject(`SELECT public.hr_drive_folder_add($1, 'Old')`, [`person:${id(999)}`], /That person is not on the payroll any more\./,
    'nor of somebody who never was')
  const OFFER = await fileIn(ALVIN_USER, `person:${PETER}`, 'Offer.pdf')
  check(await lastEvent(OFFER.id), { what: 'Uploaded', actor_name: 'ALVIN', note: 'Into PETER' }, 'a file filed in a person’s folder says whose')
  const offerRow = await fileRow(OFFER.id)
  check([offerRow.parent_kind, offerRow.parent_staff_id, offerRow.member_view, offerRow.private_by], ['person', PETER, null, null],
    'it names the person, shared with nobody, View only me for nobody')
  const CONTRACT = await fileIn(ALVIN_USER, `folder:${CONTRACTS}`, 'Contract.pdf')
  check((await lastEvent(CONTRACT.id)).note, 'Into Contracts', 'one in a folder of theirs says the folder')
  const CARRES = await folderIn(ALVIN_USER, 'root', 'Carres')
  let d = await driveAs(ALVIN_USER)
  const contractsCard = d.folders.find(f => f.id === CONTRACTS)
  check([contractsCard.parent, contractsCard.memberView, contractsCard.memberSees, contractsCard.lock],
    [`person:${PETER}`, null, false, null], 'the read writes the place as person:<id>; the person is shown nothing yet')
  const offerCard = d.files.find(f => f.id === OFFER.id)
  check([offerCard.parent, offerCard.memberView, offerCard.memberSees, offerCard.lock], [`person:${PETER}`, null, false, null],
    'a file at the top of their folder too')
  check(d.files.find(f => f.id === CONTRACT.id).parent, `folder:${CONTRACTS}`, 'a file in a folder of theirs names the folder')
  check(d.folders.find(f => f.id === CARRES).memberSees, null, 'a folder in nobody’s folder has nobody to share with')
  check(d.me, { canLock: true }, 'ALVIN, a login of his own on the ladder, may lock')

  // ── 2. Shared with the person ────────────────────────────────────────────────────────────────────────────────────
  await as(ALVIN_USER, MAKE)
  await reject(`SELECT public.hr_drive_member_view('folder', $1, true)`, [CONTRACTS], /Sharing needs Documentation · Edit/, 'sharing needs Edit')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_member_view('folder', $1, true)`, [CARRES], /Only what is in a person's folder can be shared with them\./,
    'nothing outside a person’s folder is shared with anybody')
  await reject(`SELECT public.hr_drive_member_view('folder', $1, NULL)`, [CONTRACTS], /Share it or keep it back\./, 'yes or no, nothing else')
  await reject(`SELECT public.hr_drive_member_view('letter', $1, true)`, [CONTRACTS], /Only a file or a folder is shared\./, 'a file or a folder')
  check(await share(ALVIN_USER, 'folder', CONTRACTS, true), { name: 'Contracts', person: 'PETER', sees: true }, 'a folder shared: PETER sees it')
  const contractsShared = await folderRow(CONTRACTS)
  check([contractsShared.member_view, contractsShared.member_view_by, contractsShared.member_view_at !== null], [true, ALVIN_USER, true],
    'who shared it and when')
  d = await driveAs(ALVIN_USER)
  check([d.folders.find(f => f.id === CONTRACTS).memberView, d.folders.find(f => f.id === CONTRACTS).memberSees], [true, true],
    'the read says so')
  check([d.files.find(f => f.id === CONTRACT.id).memberView, d.files.find(f => f.id === CONTRACT.id).memberSees], [null, true],
    'a file in it follows it')
  check(await memberSeesFile(CONTRACT.id), true, 'and the database answers the same')
  const SALARY = await fileIn(ALVIN_USER, `folder:${CONTRACTS}`, 'Salary.pdf')
  check(await share(ALVIN_USER, 'file', SALARY.id, false), { name: 'Salary.pdf', person: 'PETER', sees: false }, 'one kept back in a shared folder')
  check(await lastEvent(SALARY.id), { what: 'Kept from PETER', actor_name: 'ALVIN', note: null }, 'its trail says so')
  check(await memberSeesFile(SALARY.id), false, 'he is not shown it')
  const Y2025 = await folderIn(ALVIN_USER, `folder:${CONTRACTS}`, '2025')
  const SLIP = await fileIn(ALVIN_USER, `folder:${Y2025}`, 'Slip.pdf')
  d = await driveAs(ALVIN_USER)
  check([d.folders.find(f => f.id === Y2025).memberView, d.folders.find(f => f.id === Y2025).memberSees], [null, true],
    'a folder inside follows the shared one')
  check(d.files.find(f => f.id === SLIP.id).memberSees, true, 'and what is in it')
  const NOTES = await fileIn(ALVIN_USER, `folder:${CONTRACTS}`, 'Notes.pdf')
  check(await lock(ALVIN_USER, 'file', NOTES.id), { name: 'Notes.pdf', on: true, wasShared: true },
    'locking something its person saw keeps it from him — and says so')
  check([(await fileRow(NOTES.id)).member_view, await memberSeesFile(NOTES.id)], [null, false],
    'View only me does not follow its folder’s share')
  check(await share(ALVIN_USER, 'file', NOTES.id, true), { name: 'Notes.pdf', person: 'PETER', sees: true },
    'a share of its own shows something View only me')
  check(await lastEvent(NOTES.id), { what: 'Shared with PETER', actor_name: 'ALVIN', note: null }, 'its trail says so')
  const FORM2 = await fileIn(ALVIN_USER, `person:${PETER}`, 'Form two.pdf')
  await share(ALVIN_USER, 'file', FORM2.id, true)
  check(await lock(ALVIN_USER, 'file', FORM2.id), { name: 'Form two.pdf', on: true, wasShared: true }, 'locking one shared on its own…')
  check([(await fileRow(FORM2.id)).member_view, await memberSeesFile(FORM2.id)], [null, false], '…takes its share away')
  const KEEP = await fileIn(ALVIN_USER, `person:${PETER}`, 'Keep.pdf')
  await share(ALVIN_USER, 'file', KEEP.id, false)
  check(await lock(ALVIN_USER, 'file', KEEP.id), { name: 'Keep.pdf', on: true, wasShared: false }, 'one kept back is not news…')
  check((await fileRow(KEEP.id)).member_view, false, '…and stays kept back')

  // ── 3. View only me ──────────────────────────────────────────────────────────────────────────────────────────────
  const CASES = await folderIn(ALVIN_USER, 'root', 'Cases')
  const CASE = await fileIn(ALVIN_USER, `folder:${CASES}`, 'Case.pdf')
  const SECRET = await fileIn(ALVIN_USER, 'root', 'Secret.pdf')
  await as(SHARED_USER, EDIT)
  await reject(`SELECT public.hr_drive_private('folder', $1, true)`, [CASES],
    /View only me needs a login of your own, with a title on the ladder\./, 'hr@ — several people — cannot lock')
  await as(PRIN_SHARED_USER, EDIT)
  await reject(`SELECT public.hr_drive_private('folder', $1, true)`, [CASES],
    /View only me needs a login of your own, with a title on the ladder\./, 'nor principal@, with no record of its own')
  await as(ALVIN_USER, MAKE)
  await reject(`SELECT public.hr_drive_private('folder', $1, true)`, [CASES], /View only me needs Documentation · Edit/, 'it needs Edit')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_private('letter', $1, true)`, [CASES], /Only a file or a folder is View only me\./, 'a file or a folder')
  check(await lock(ALVIN_USER, 'folder', CASES), { name: 'Cases', on: true, wasShared: false }, 'ALVIN locks a folder')
  const casesRow = await folderRow(CASES)
  check([casesRow.private_by, casesRow.private_rank, casesRow.private_by_name, casesRow.private_at !== null], [ALVIN_USER, 3, 'ALVIN', true],
    'whose, at which rank, when')
  check(await lock(ALVIN_USER, 'file', SECRET.id), { name: 'Secret.pdf', on: true, wasShared: false }, 'and a file')
  check(await lastEvent(SECRET.id), { what: 'View only me', actor_name: 'ALVIN', note: 'Seen only by ALVIN and above' }, 'its trail says so')
  const shown = async user => {
    const v = await driveAs(user)
    return [v.folders.some(f => f.id === CASES), v.files.some(f => f.id === CASE.id), v.files.some(f => f.id === SECRET.id)]
  }
  check(await shown(ALVIN_USER), [true, true, true], 'ALVIN sees what he locked, and what is in it')
  check(await shown(LISA_USER), [false, false, false], 'LISA, his peer at L3, is shown none of it')
  check(await shown(BOSS_USER), [true, true, true], 'BOSS, at L5, is')
  check(await shown(LOW_USER), [false, false, false], 'LOW, at L2, is not')
  check(await shown(SHARED_USER), [false, false, false], 'hr@ — nobody in particular — is not')
  check(await shown(PRIN_SHARED_USER), [true, true, true], 'principal@ is (the Principal sees everything)')
  d = await driveAs(ALVIN_USER)
  check([d.folders.find(f => f.id === CASES).lock.by, d.folders.find(f => f.id === CASES).lock.mine], ['ALVIN', true], 'his lock, his badge')
  d = await driveAs(BOSS_USER)
  check([d.folders.find(f => f.id === CASES).lock.by, d.folders.find(f => f.id === CASES).lock.mine], ['ALVIN', false],
    'BOSS reads whose it is')
  check((await driveAs(SHARED_USER)).me, { canLock: false }, 'hr@ may lock nothing')
  check((await driveAs(PRIN_SHARED_USER)).me, { canLock: false }, 'principal@ sees it all and locks nothing')
  await asHr(LISA_USER)
  await reject(`SELECT public.hr_drive_file($1)`, [SECRET.id], /That file is no longer here/, 'no link is signed for LISA')
  await reject(`SELECT public.hr_drive_file($1)`, [CASE.id], /That file is no longer here/, 'nor for a file in a locked folder')
  const secretEvents = (await trail(SECRET.id)).length
  await asHr(LISA_USER)
  await q(`SELECT public.hr_drive_log($1, 'Viewed')`, [SECRET.id])
  check((await trail(SECRET.id)).length, secretEvents, 'a look she cannot take writes nothing on its trail')
  await asHr(LISA_USER)
  await reject(`SELECT public.hr_drive_folder_rename($1, 'Mine')`, [CASES], /That folder is not there any more\./, 'she cannot rename it')
  await reject(`SELECT public.hr_drive_folder_move($1, 'company:hv')`, [CASES], /That folder is not there any more\./, 'nor move it')
  await reject(`SELECT public.hr_drive_folder_delete($1)`, [CASES], /That folder is not there any more\./, 'nor bin it')
  await reject(`SELECT public.hr_drive_folder_add($1, 'Inside')`, [`folder:${CASES}`], /That folder is not there any more\./,
    'nor make a folder in it')
  await reject(`SELECT public.hr_drive_file_delete($1)`, [SECRET.id], /That file is already deleted\./, 'nor bin the file')
  await reject(`SELECT public.hr_drive_file_move($1, 'company:hv')`, [SECRET.id], /That file is not there any more\./, 'nor move it')
  await reject(`SELECT public.hr_drive_copy_plan('file', $1)`, [SECRET.id], /That file is not there any more\./, 'nor copy it')
  await reject(`SELECT public.hr_drive_copy_plan('folder', $1)`, [CASES], /That folder is not there any more\./, 'nor the folder')
  await reject(`SELECT public.hr_drive_private('file', $1, false)`, [SECRET.id], /That file is not there any more\./, 'nor unlock it')
  await reject(`SELECT public.hr_drive_member_view('file', $1, true)`, [SECRET.id], /That file is not there any more\./, 'nor share it')
  await asHr(ALVIN_USER)
  check((await one(`SELECT public.hr_drive_file($1)`, [SECRET.id])).path, SECRET.path, 'ALVIN opens it')
  await asHr(BOSS_USER)
  await q(`SELECT public.hr_drive_log($1, 'Viewed')`, [SECRET.id])
  check(await lastEvent(SECRET.id), { what: 'Viewed', actor_name: 'BOSS', note: null }, 'BOSS’s look is on its trail')
  check(await lock(BOSS_USER, 'file', SECRET.id, false), { name: 'Secret.pdf', on: false, wasShared: false }, 'BOSS, above ALVIN, turns it off')
  check(await lastEvent(SECRET.id), { what: 'View only me off', actor_name: 'BOSS', note: null }, 'its trail says so')
  check([(await fileRow(SECRET.id)).private_by, (await shown(LISA_USER))[2]], [null, true], 'and LISA is shown it again')
  const offEvents = (await trail(SECRET.id)).length
  check(await lock(BOSS_USER, 'file', SECRET.id, false), { name: 'Secret.pdf', on: false, wasShared: false }, 'off twice…')
  check((await trail(SECRET.id)).length, offEvents, '…is nothing')
  await lock(ALVIN_USER, 'file', SECRET.id)
  // His rank now counts: promoted to L6, BOSS (L5) is no longer above him.
  await sys()
  await q(`INSERT INTO title_levels VALUES ($1, 6)`, [L6])
  await q(`INSERT INTO titles VALUES ($1, 'HR LEAD', $2)`, [T_LEAD, L6])
  await q(`UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2`, [T_LEAD, ALVIN])
  check(await shown(BOSS_USER), [false, false, false], 'promoted to L6, ALVIN’s locks leave BOSS (L5) out')
  await sys()
  await q(`UPDATE hr_staff_costs SET title_id = $1 WHERE id = $2`, [T_EXEC, ALVIN])
  check(await shown(BOSS_USER), [true, true, true], 'back at L3, BOSS is shown them again')
  // Once he has left, the rank kept when it was locked counts.
  await sys()
  await q(`UPDATE hr_drive_files SET private_rank = 6 WHERE id = $1`, [SECRET.id])
  check((await shown(BOSS_USER))[2], true, 'while ALVIN has a record, his rank now counts, not the one kept')
  await sys()
  await q(`UPDATE hr_staff_costs SET status = 'inactive' WHERE id = $1`, [ALVIN])
  check((await shown(BOSS_USER))[2], false, 'once he has left, the kept rank (6) counts — BOSS (5) is not above it')
  check([(await shown(ALVIN_USER))[2], (await driveAs(ALVIN_USER)).me], [true, { canLock: false }],
    'the one who locked it still sees it, and may lock nothing more')
  await sys()
  await q(`UPDATE hr_staff_costs SET status = 'active' WHERE id = $1`, [ALVIN])
  await q(`UPDATE hr_drive_files SET private_rank = 3 WHERE id = $1`, [SECRET.id])
  // Run as the session the app is.
  await asHr(ALVIN_USER, 'authenticated')
  check((await one(`SELECT public.hr_drive_private('file', $1, true)`, [OFFER.id])).on, true, 'a session locks…')
  check((await one(`SELECT public.hr_drive_private('file', $1, false)`, [OFFER.id])).on, false, '…and unlocks')
  await sys()

  // ── 4. A name is never refused for something the caller is not shown ────────────────────────────────────────────
  const VAULT_A = await folderIn(ALVIN_USER, 'root', 'Vault')
  await lock(ALVIN_USER, 'folder', VAULT_A)
  const VAULT_L = await folderIn(LISA_USER, 'root', 'Vault')
  check(typeof VAULT_L, 'string', 'LISA, not shown ALVIN’s Vault, may name hers the same')
  check([await seesFolder(BOSS_USER, VAULT_A), await seesFolder(BOSS_USER, VAULT_L)], [true, true], 'BOSS is shown both')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_private('folder', $1, false)`, [VAULT_A], /Vault is there already — rename one first\./,
    'ALVIN, shown both, cannot open his to everybody while hers stands')
  await reject(`SELECT public.hr_drive_folder_add('root', 'vault')`, [], /vault is here already\./, 'nor make a third')
  await asHr(LISA_USER)
  await reject(`SELECT public.hr_drive_folder_add('root', 'VAULT')`, [], /VAULT is here already\./, 'hers is hers')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_rename($1, 'Vault A')`, [VAULT_A])
  check((await lock(ALVIN_USER, 'folder', VAULT_A, false)).on, false, 'renamed, it opens')

  // ── 5. The bucket ────────────────────────────────────────────────────────────────────────────────────────────────
  check(await reads(ALVIN_USER, SECRET.path, VIEW), 1, 'the bucket reads ALVIN’s locked file for ALVIN')
  check(await reads(LISA_USER, SECRET.path, VIEW), 0, 'not for LISA — Documentation · View is not enough')
  check(await reads(BOSS_USER, SECRET.path, VIEW), 1, 'for BOSS, above him')
  check(await reads(LISA_USER, CASE.path, VIEW), 0, 'nor a file in a locked folder for LISA')
  check(await reads(LISA_USER, CONTRACT.path, VIEW), 1, 'a file nobody locked is HR’s as before')
  check(await reads(PRIN_SHARED_USER, SECRET.path, VIEW), 1, 'and principal@ reads it')
  check(await reads(PETER_USER, CONTRACT.path), 1, 'a file of his folder shared with him is read for PETER')
  check(await reads(PETER_USER, SALARY.path), 0, 'one kept back is not')
  check(await reads(PETER_USER, OFFER.path), 0, 'nor one never shared')
  check(await reads(PETER_USER, NOTES.path), 1, 'one View only me shared with him on its own is')
  check(await reads(LISA_USER, CONTRACT.path), 0, 'nobody else without Documentation · View reads his')
  check(await reads(PETER_USER, SLIP.path), 1, 'Slip.pdf, deep in his shared folder, is his')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_delete($1)`, [SLIP.id])
  check(await reads(PETER_USER, SLIP.path), 0, 'in the Bin, it is not')
  await asHr(ALVIN_USER)
  const slipBin = await one(`SELECT id FROM public.hr_drive_bin WHERE file_id = $1`, [SLIP.id])
  check((await one(`SELECT public.hr_drive_bin_restore($1)`, [slipBin])).label, '2025', 'restored where it was')
  check(await reads(PETER_USER, SLIP.path), 1, 'and his again')

  // ── 6. A letter kept from its person ─────────────────────────────────────────────────────────────────────────────
  await sys()
  const OFFER_TYPE = await one(`SELECT id FROM public.hr_letter_types WHERE name = 'Offer letter'`)
  const INC_TYPE = await one(`SELECT id FROM public.hr_letter_types WHERE name = 'Increment letter'`)
  const fileLetter = async (type, name) => {
    const path = `letters/${PETER}/${crypto.randomUUID()}/${name}`
    await put(path)
    await asHr(ALVIN_USER)
    const letter = await one(`SELECT public.hr_letter_file($1, $2, $3, $4, 'application/pdf', 10)`, [PETER, type, path, name])
    await sys()
    return { id: letter, path, memo: await one(`SELECT memo_id FROM public.hr_person_letters WHERE id = $1`, [letter]) }
  }
  const LT1 = await fileLetter(OFFER_TYPE, 'offer.pdf')
  check(await recipients(LT1.memo), [PETER], 'a letter filed is sent to its person, as before')
  check(await memoNotices(PETER_USER, LT1.memo), [{ read: false }], 'and he is told')
  await sys()
  await q(`INSERT INTO public.member_memo_receipts (memo_id, user_id, version, acknowledged_at) VALUES ($1, $2, 1, now())`, [LT1.memo, PETER_USER])
  check(await memoNotices(PETER_USER, LT1.memo), [{ read: true }], 'he acknowledges it: the notice is read')
  check(await reads(PETER_USER, LT1.path), 1, 'the bucket reads his letter for him')
  await as(ALVIN_USER, MAKE)
  await reject(`SELECT public.hr_letter_member_view($1, false)`, [LT1.id], /Sharing a letter needs Documentation · Edit/, 'keeping one back needs Edit')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_letter_member_view($1, NULL)`, [LT1.id], /Share it or keep it back\./, 'yes or no')
  await reject(`SELECT public.hr_letter_member_view($1, false)`, [id(998)], /That letter is not on file any more\./, 'a letter that is not there')
  check(await one(`SELECT public.hr_letter_member_view($1, false)`, [LT1.id]), { id: LT1.id, person: 'PETER', type: 'Offer letter', sees: false },
    'ALVIN keeps the offer letter from PETER')
  check(await recipients(LT1.memo), [], 'he is off the memo it travelled as')
  check(await memoNotices(PETER_USER, LT1.memo), [], 'its notice is gone from his bell')
  await sys()
  check(Number(await one(`SELECT count(*) FROM public.member_memo_receipts WHERE memo_id = $1 AND user_id = $2`, [LT1.memo, PETER_USER])), 1,
    'his receipt is kept')
  const keptRow = (await q(`SELECT member_hidden_at IS NOT NULL AS hidden, member_hidden_by, withdrawn_at FROM public.hr_person_letters WHERE id = $1`,
    [LT1.id]))[0]
  check([keptRow.hidden, keptRow.member_hidden_by, keptRow.withdrawn_at], [true, ALVIN_USER, null], 'the letter stays on file, kept back')
  check((await letterTrail(LT1.id)).at(-1), { what: 'Kept from PETER', note: 'Still on the record — no longer in their app' }, 'its trail says so')
  await asHr(ALVIN_USER)
  let doc = await one(`SELECT public.hr_documentation()`)
  check(doc.letterTypes.find(t => t.name === 'Offer letter').count, 1, 'it still counts as on file — nothing compulsory is missing')
  check(doc.letters.find(l => l.id === LT1.id).hiddenAt !== null, true, 'Documentation’s read says it is kept back')
  check(doc.letters.find(l => l.id === LT1.id).acknowledgedAt !== null, true, 'and what he had done with it')
  check(await reads(PETER_USER, LT1.path), 0, 'the bucket no longer reads it for him')
  check((await myDocs(PETER_USER)).personal.letters.some(l => l.id === LT1.id), false, 'his documents leave it out')
  await asPerson(PETER_USER, [], 'authenticated')
  await reject(`SELECT public.my_document_open('letter', $1)`, [LT1.id], /That letter is not shared with you\./, 'he cannot open it')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_letter_member_view($1, false)`, [LT1.id])
  check((await letterTrail(LT1.id)).filter(e => e.what === 'Kept from PETER').length, 1, 'kept back again, nothing more happens')
  await asHr(ALVIN_USER)
  check(await one(`SELECT public.hr_letter_member_view($1, true)`, [LT1.id]), { id: LT1.id, person: 'PETER', type: 'Offer letter', sees: true },
    'shared with him again')
  check(await recipients(LT1.memo), [PETER], 'he is back on the memo')
  check(await memoNotices(PETER_USER, LT1.memo), [{ read: true }], 'told again — read already, as he had read it')
  check((await letterTrail(LT1.id)).at(-1), { what: 'Shared with PETER', note: 'Back in their app' }, 'its trail says so')
  check(await reads(PETER_USER, LT1.path), 1, 'the bucket reads it for him again')
  const mine1 = (await myDocs(PETER_USER)).personal.letters.find(l => l.id === LT1.id)
  check([mine1.typeName, mine1.name, mine1.memoId, mine1.acknowledgedAt !== null], ['Offer letter', 'offer.pdf', LT1.memo, true],
    'his documents list it, acknowledged as it was')
  await asHr(ALVIN_USER)
  check(await one(`SELECT public.hr_letter_member_view($1, true)`, [LT1.id]), { id: LT1.id, person: 'PETER', type: 'Offer letter', sees: true },
    'shared twice…')
  check((await letterTrail(LT1.id)).filter(e => e.what === 'Shared with PETER').length, 1, '…is shared once')
  // A letter never read: kept back and shared again, its notice is news.
  const LT2 = await fileLetter(INC_TYPE, 'increment.pdf')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_letter_member_view($1, false)`, [LT2.id])
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_letter_member_view($1, true)`, [LT2.id])
  check(await memoNotices(PETER_USER, LT2.memo), [{ read: false }], 'a letter he had not read comes back as news')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_letter_withdraw($1)`, [LT2.id])
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_letter_member_view($1, true)`, [LT2.id], /That letter was withdrawn\./, 'a withdrawn letter is nobody’s to share')
  // A copy Publish & save filed: kept from PETER, the memo's counts follow.
  const pubPath = `publish/${crypto.randomUUID()}/rules.pdf`
  await put(pubPath)
  await asHr(ALVIN_USER)
  const PM = (await one(`SELECT public.hr_publish('Memo', NULL, 'House rules', 'Please read.', $1, 'rules.pdf', 'application/pdf', 5,
      ARRAY[$2::uuid], ARRAY[$3::uuid, $4::uuid], 'Revenue · everyone', true)`, [pubPath, REV, PETER, KRIS])).id
  await sys()
  const peterCopy = await one(`SELECT id FROM public.hr_person_letters WHERE memo_id = $1 AND staff_id = $2`, [PM, PETER])
  await q(`INSERT INTO public.member_memo_receipts (memo_id, user_id, version, acknowledged_at) VALUES ($1, $2, 1, now())`, [PM, PETER_USER])
  const published = async () => {
    await asHr(ALVIN_USER)
    return (await one(`SELECT public.hr_documentation()`)).published.find(m => m.id === PM)
  }
  let pub = await published()
  check([pub.recipients, pub.acknowledged], [2, 1], 'the memo reached both; PETER acknowledged it')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_letter_member_view($1, false)`, [peterCopy])
  pub = await published()
  check([pub.recipients, pub.acknowledged], [1, 0], 'his copy kept back: the list counts whom it still reaches')
  check(await recipients(PM), [KRIS], 'KRIS still has it')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_memo_withdraw($1)`, [PM])
  await sys()
  check(await one(`SELECT withdrawn_note FROM public.member_memos WHERE id = $1`, [PM]), 'Had reached 1 person · 0 acknowledged',
    'withdrawn, its line counts as the list did')

  // ── 7. Move to… ──────────────────────────────────────────────────────────────────────────────────────────────────
  const FORM = await fileIn(ALVIN_USER, `person:${PETER}`, 'Form.pdf')
  await share(ALVIN_USER, 'file', FORM.id, true)
  await as(ALVIN_USER, MAKE)
  await reject(`SELECT public.hr_drive_file_move($1, 'root')`, [FORM.id], /Moving a file needs Documentation · Edit/, 'a move needs Edit')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_move($1, $2)`, [FORM.id, `folder:${CONTRACTS}`])
  let formRow = await fileRow(FORM.id)
  check([formRow.parent_kind, formRow.parent_folder_id, formRow.parent_staff_id, formRow.member_view], ['folder', CONTRACTS, null, true],
    'moved within PETER’s folder, its share stays')
  check(await lastEvent(FORM.id), { what: 'Moved', actor_name: 'ALVIN', note: 'Into Contracts' }, 'its trail says where to')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_move($1, $2)`, [FORM.id, `person:${KRIS}`])
  formRow = await fileRow(FORM.id)
  check([formRow.parent_kind, formRow.parent_staff_id, formRow.parent_folder_id, formRow.member_view, formRow.member_view_by],
    ['person', KRIS, null, null, null], 'into KRIS’s folder: shared with nobody')
  check((await lastEvent(FORM.id)).note, 'Into KRIS', 'its trail names him')
  const formEvents = (await trail(FORM.id)).length
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_move($1, $2)`, [FORM.id, `person:${KRIS}`])
  check((await trail(FORM.id)).length, formEvents, 'a move to where it is writes nothing')
  const BINNED = await fileIn(ALVIN_USER, 'root', 'Binned.pdf')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_delete($1)`, [BINNED.id])
  await reject(`SELECT public.hr_drive_file_move($1, 'company:hv')`, [BINNED.id], /It is in the Bin — restore it first\./, 'not from the Bin')
  // A folder out of PETER's folder into KRIS's: it and everything in it shared with nobody.
  const REVIEWS = await folderIn(ALVIN_USER, `person:${PETER}`, 'Reviews')
  const REV24 = await folderIn(ALVIN_USER, `folder:${REVIEWS}`, '2024')
  const REVIEW = await fileIn(ALVIN_USER, `folder:${REV24}`, 'Review.pdf')
  await share(ALVIN_USER, 'folder', REVIEWS, true)
  await share(ALVIN_USER, 'folder', REV24, false)
  await share(ALVIN_USER, 'file', REVIEW.id, true)
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_move($1, $2)`, [REVIEWS, `folder:${CONTRACTS}`])
  check([(await folderRow(REVIEWS)).member_view, (await folderRow(REV24)).member_view, (await fileRow(REVIEW.id)).member_view], [true, false, true],
    'moved within PETER’s folder, every share stays')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_move($1, $2)`, [REVIEWS, `person:${KRIS}`])
  const reviewsRow = await folderRow(REVIEWS)
  check([reviewsRow.parent_kind, reviewsRow.parent_staff_id, reviewsRow.parent_folder_id], ['person', KRIS, null], 'into KRIS’s folder')
  check([reviewsRow.member_view, (await folderRow(REV24)).member_view, (await fileRow(REVIEW.id)).member_view], [null, null, null],
    'it and everything in it are shared with nobody')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_folder_move($1, $2)`, [REVIEWS, `folder:${REV24}`], /A folder cannot go inside itself\./,
    'never inside itself')
  await reject(`SELECT public.hr_drive_folder_move($1, $2)`, [REVIEWS, `person:${GONE}`], /That person is not on the payroll any more\./,
    'never to somebody who has left')
  // Out of a locked folder, it takes the lock along.
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_move($1, 'root')`, [CASE.id])
  const caseRow = await fileRow(CASE.id)
  check([caseRow.parent_kind, caseRow.private_by, caseRow.private_rank, caseRow.private_by_name], ['root', ALVIN_USER, 3, 'ALVIN'],
    'out of ALVIN’s locked folder, Case.pdf takes the lock along')
  check(await seesFile(LISA_USER, CASE.id), false, 'LISA is still not shown it')
  // Within the same locked folder, nothing is stamped.
  const SUB = await folderIn(ALVIN_USER, `folder:${CASES}`, 'Sub')
  const INNER = await fileIn(ALVIN_USER, `folder:${CASES}`, 'Inner.pdf')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_move($1, $2)`, [INNER.id, `folder:${SUB}`])
  check((await fileRow(INNER.id)).private_by, null, 'moved inside the locked folder, it needs no lock of its own')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_move($1, 'root')`, [SUB])
  const subRow = await folderRow(SUB)
  check([subRow.parent_kind, subRow.private_by, subRow.private_rank], ['root', ALVIN_USER, 3], 'a folder leaving it takes the lock along too')
  check([await seesFolder(LISA_USER, SUB), await seesFile(LISA_USER, INNER.id)], [false, false], 'and what is in it is still not LISA’s')
  // A stronger lock left behind wins over the thing's own weaker one.
  const BOARD = await folderIn(BOSS_USER, 'root', 'Board')
  await lock(BOSS_USER, 'folder', BOARD)
  const MINE = await fileIn(ALVIN_USER, 'root', 'Mine.pdf')
  await lock(ALVIN_USER, 'file', MINE.id)
  await asHr(BOSS_USER)
  await q(`SELECT public.hr_drive_file_move($1, $2)`, [MINE.id, `folder:${BOARD}`])
  check([(await fileRow(MINE.id)).private_by, await seesFile(ALVIN_USER, MINE.id)], [ALVIN_USER, false],
    'into BOSS’s locked folder: its own lock stays ALVIN’s, and ALVIN is not shown it there')
  await asHr(BOSS_USER)
  await q(`SELECT public.hr_drive_file_move($1, 'root')`, [MINE.id])
  const mineRow = await fileRow(MINE.id)
  check([mineRow.private_by, mineRow.private_rank, mineRow.private_by_name], [BOSS_USER, 5, 'BOSS'],
    'out of it, BOSS’s stronger lock goes along instead of ALVIN’s')
  check(await seesFile(ALVIN_USER, MINE.id), false, 'never seen more widely than before')
  // A weaker lock left behind does not replace a stronger one of its own.
  const BOSSES = await fileIn(BOSS_USER, `folder:${CASES}`, 'Bosses.pdf')
  await lock(BOSS_USER, 'file', BOSSES.id)
  await asHr(BOSS_USER)
  await q(`SELECT public.hr_drive_file_move($1, 'root')`, [BOSSES.id])
  check((await fileRow(BOSSES.id)).private_by, BOSS_USER, 'BOSS’s own lock stays when ALVIN’s weaker one is left behind')

  // ── 8. Copy to… and Duplicate ────────────────────────────────────────────────────────────────────────────────────
  const plan = async (user, kind, item, actions = EDIT) => {
    await as(user, actions)
    return one(`SELECT public.hr_drive_copy_plan($1, $2)`, [kind, item])
  }
  check(await plan(ALVIN_USER, 'file', OFFER.id), [{ id: OFFER.id, path: OFFER.path, fileName: 'Offer.pdf' }], 'a file’s copy takes its object')
  await as(ALVIN_USER, VIEW)
  await reject(`SELECT public.hr_drive_copy_plan('file', $1)`, [OFFER.id], /Copying needs Documentation · View and Create/, 'copying needs Create')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_copy_plan('thing', $1)`, [OFFER.id], /Only a file or a folder is copied\./, 'a file or a folder')
  await reject(`SELECT public.hr_drive_copy_plan('file', $1)`, [BINNED.id], /That file is not there any more\./, 'not one in the Bin')
  const POL = await folderIn(ALVIN_USER, 'company:hv', 'Policies')
  const P1 = await fileIn(ALVIN_USER, `folder:${POL}`, 'P1.pdf')
  const OLDF = await folderIn(ALVIN_USER, `folder:${POL}`, 'Old')
  const P2 = await fileIn(ALVIN_USER, `folder:${OLDF}`, 'P2.pdf')
  const BOARD_ONLY = await folderIn(BOSS_USER, `folder:${POL}`, 'Board only')
  await lock(BOSS_USER, 'folder', BOARD_ONLY)
  const P3 = await fileIn(BOSS_USER, `folder:${BOARD_ONLY}`, 'P3.pdf')
  const P4 = await fileIn(ALVIN_USER, `folder:${POL}`, 'P4.pdf')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_delete($1)`, [P4.id])
  const planA = await plan(ALVIN_USER, 'folder', POL)
  check(planA.map(f => f.id).sort(), [P1.id, P2.id].sort(), 'ALVIN’s plan: what he is shown in it, nothing in the Bin')
  check((await plan(BOSS_USER, 'folder', POL)).map(f => f.id).sort(), [P1.id, P2.id, P3.id].sort(), 'BOSS’s has his locked folder’s file too')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_copy_plan('folder', $1)`, [BOARD_ONLY], /That folder is not there any more\./,
    'ALVIN cannot copy what he is not shown')
  // A file's copy: its object first.
  const copyPath = `drive/${crypto.randomUUID()}/P1.pdf`
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_file_copy($1, 'root', $2, NULL)`, [P1.id, copyPath], /The copy did not arrive\. Please try again\./,
    'the object must be in the bucket first')
  await put(copyPath)
  await as(ALVIN_USER, VIEW)
  await reject(`SELECT public.hr_drive_file_copy($1, 'root', $2, NULL)`, [P1.id, copyPath], /Copying a file needs Documentation · Create/,
    'a copy needs Create')
  await asHr(ALVIN_USER, 'authenticated')
  const C1 = await one(`SELECT public.hr_drive_file_copy($1, 'root', $2, NULL)`, [P1.id, copyPath])
  const c1 = await fileRow(C1)
  check([c1.parent_kind, c1.file_name, c1.file_path, c1.member_view, c1.private_by, c1.uploaded_by], ['root', 'P1.pdf', copyPath, null, null, ALVIN_USER],
    'a copy: a row and an object of its own, its source’s name')
  check(await lastEvent(C1), { what: 'Copied', actor_name: 'ALVIN', note: `From ${(await fileRow(P1.id)).ref} · into Data center` },
    'its trail says where from')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_file_copy($1, 'root', $2, NULL)`, [P1.id, copyPath], /That file is filed already\./, 'one object, one file')
  await reject(`SELECT public.hr_drive_file_copy($1, 'root', $2, NULL)`, [BINNED.id, copyPath], /That file is not there any more\./,
    'not one in the Bin')
  // Duplicate: a copy in the same place, named "Copy of …".
  const dupPath = `drive/${crypto.randomUUID()}/Offer.pdf`
  await put(dupPath)
  await asHr(ALVIN_USER)
  const DUP = await one(`SELECT public.hr_drive_file_copy($1, $2, $3, 'Copy of Offer.pdf')`, [OFFER.id, `person:${PETER}`, dupPath])
  const dupRow = await fileRow(DUP)
  check([dupRow.parent_kind, dupRow.parent_staff_id, dupRow.file_name], ['person', PETER, 'Copy of Offer.pdf'], 'Duplicate: beside it, "Copy of …"')
  // A shared file's copy is shared with nobody; a file copied out of a locked folder takes the lock along.
  const sharedCopyPath = `drive/${crypto.randomUUID()}/Contract.pdf`
  await put(sharedCopyPath)
  await asHr(ALVIN_USER)
  const C2 = await one(`SELECT public.hr_drive_file_copy($1, $2, $3, NULL)`, [CONTRACT.id, `folder:${CONTRACTS}`, sharedCopyPath])
  check([(await fileRow(C2)).member_view, await memberSeesFile(C2)], [null, true], 'its copy beside it follows the shared folder like any file')
  const sharedCopyPath2 = `drive/${crypto.randomUUID()}/Contract.pdf`
  await put(sharedCopyPath2)
  await share(ALVIN_USER, 'file', CONTRACT.id, true)
  await asHr(ALVIN_USER)
  const C3 = await one(`SELECT public.hr_drive_file_copy($1, $2, $3, NULL)`, [CONTRACT.id, `person:${PETER}`, sharedCopyPath2])
  check([(await fileRow(C3)).member_view, await memberSeesFile(C3)], [null, false], 'a copy of one shared on its own is shared with nobody')
  const lockedCopyPath = `drive/${crypto.randomUUID()}/Inner.pdf`
  await put(lockedCopyPath)
  await asHr(ALVIN_USER)
  const C4 = await one(`SELECT public.hr_drive_file_copy($1, 'company:hv', $2, NULL)`, [INNER.id, lockedCopyPath])
  check([(await fileRow(C4)).private_by, (await fileRow(C4)).private_rank], [ALVIN_USER, 3], 'copied out of a locked folder, it takes the lock')
  check(await seesFile(LISA_USER, C4), false, 'LISA is not shown the copy either')
  // A folder's copy: its folders and files the caller is shown, each object copied first.
  const objectsFor = async list => {
    const map = {}
    for (const f of list) {
      const path = `drive/${crypto.randomUUID()}/${f.fileName}`
      await put(path)
      map[f.id] = path
    }
    return map
  }
  await asHr(ALVIN_USER)
  const FC1 = await one(`SELECT public.hr_drive_folder_copy($1, 'company:hv', NULL, $2::jsonb)`, [POL, JSON.stringify(await objectsFor(planA))])
  check([FC1.name, FC1.folders, FC1.files, FC1.skipped], ['Copy of Policies', 2, 2, 0],
    'Duplicate of a folder: "Copy of Policies", the folders and files ALVIN is shown')
  await sys()
  check((await q(`SELECT name FROM public.hr_drive_folders WHERE parent_folder_id = $1 ORDER BY name`, [FC1.id])).map(r => r.name), ['Old'],
    'its folders under the copy — not the one ALVIN is not shown')
  check((await q(`SELECT file_name FROM public.hr_drive_files WHERE parent_folder_id = $1
                     OR parent_folder_id IN (SELECT id FROM public.hr_drive_folders WHERE parent_folder_id = $1) ORDER BY file_name`, [FC1.id]))
    .map(r => r.file_name), ['P1.pdf', 'P2.pdf'], 'its files, each in its own folder’s copy')
  const fcRow = await folderRow(FC1.id)
  check([fcRow.parent_kind, fcRow.created_by, fcRow.private_by, fcRow.member_view], ['company', ALVIN_USER, null, null], 'a copy of ALVIN’s own')
  await asHr(ALVIN_USER)
  const FC2 = await one(`SELECT public.hr_drive_folder_copy($1, 'company:hv', NULL, $2::jsonb)`, [POL, JSON.stringify(await objectsFor(planA))])
  check(FC2.name, 'Copy of Policies (2)', 'a second copy beside it is "(2)"')
  const onlyP1 = await objectsFor(planA.filter(f => f.id === P1.id))
  await asHr(ALVIN_USER)
  const FC3 = await one(`SELECT public.hr_drive_folder_copy($1, 'root', 'Policies 2026', $2::jsonb)`, [POL, JSON.stringify(onlyP1)])
  check([FC3.name, FC3.folders, FC3.files, FC3.skipped], ['Policies 2026', 2, 1, 1], 'a file whose object was not copied is counted, not filed')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_folder_copy($1, $2, NULL, '{}'::jsonb)`, [POL, `folder:${POL}`], /A folder cannot be copied inside itself\./,
    'never into itself')
  await reject(`SELECT public.hr_drive_folder_copy($1, $2, NULL, '{}'::jsonb)`, [POL, `folder:${OLDF}`], /A folder cannot be copied inside itself\./,
    'nor a folder inside it')
  await reject(`SELECT public.hr_drive_folder_copy($1, 'company:hv', 'Policies', '{}'::jsonb)`, [POL], /Policies is there already — rename one first\./,
    'a name the place has')
  await reject(`SELECT public.hr_drive_folder_copy($1, 'root', 'A/B', '{}'::jsonb)`, [POL], /A folder's name cannot hold a slash\./, 'no slash')
  await as(ALVIN_USER, VIEW)
  await reject(`SELECT public.hr_drive_folder_copy($1, 'root', NULL, '{}'::jsonb)`, [POL], /Copying a folder needs Documentation · Create/,
    'it needs Create')
  const planB = await plan(BOSS_USER, 'folder', POL)
  await asHr(BOSS_USER)
  const FCB = await one(`SELECT public.hr_drive_folder_copy($1, 'root', 'Board copy', $2::jsonb)`, [POL, JSON.stringify(await objectsFor(planB))])
  check([FCB.folders, FCB.files, FCB.skipped], [3, 3, 0], 'BOSS’s copy has what he is shown')
  await sys()
  const fcbKids = await q(`SELECT id, name, private_by FROM public.hr_drive_folders WHERE parent_folder_id = $1 ORDER BY name`, [FCB.id])
  check(fcbKids.map(r => [r.name, r.private_by]), [['Board only', BOSS_USER], ['Old', null]], 'a lock inside goes along as it was')
  check([await seesFolder(ALVIN_USER, FCB.id), await seesFolder(ALVIN_USER, fcbKids[0].id)], [true, false],
    'ALVIN is shown the copy, not its locked part')
  // A copy of a locked folder keeps its lock; a copy of a shared folder is shared with nobody.
  await asHr(ALVIN_USER)
  const FCC = await one(`SELECT public.hr_drive_folder_copy($1, 'root', NULL, '{}'::jsonb)`, [CASES])
  check([FCC.name, (await folderRow(FCC.id)).private_by], ['Copy of Cases', ALVIN_USER], 'a locked folder’s copy is locked as it was')
  check(await seesFolder(LISA_USER, FCC.id), false, 'LISA is not shown it')
  await asHr(ALVIN_USER)
  const FCS = await one(`SELECT public.hr_drive_folder_copy($1, $2, NULL, '{}'::jsonb)`, [CONTRACTS, `person:${PETER}`])
  check([FCS.name, (await folderRow(FCS.id)).member_view], ['Copy of Contracts', null], 'a shared folder’s copy beside it…')
  d = await driveAs(ALVIN_USER)
  check(d.folders.find(f => f.id === FCS.id).memberSees, false, '…is shared with nobody')
  await asHr(LISA_USER)
  await reject(`SELECT public.hr_drive_folder_copy($1, 'root', NULL, '{}'::jsonb)`, [CASES], /That folder is not there any more\./,
    'LISA cannot copy what she is not shown')
  await reject(`SELECT public.hr_drive_file_copy($1, 'root', $2, NULL)`, [SECRET.id, copyPath], /That file is not there any more\./, 'nor a file')

  // ── 9. The Bin, with what each one is shown ──────────────────────────────────────────────────────────────────────
  const HIDDEN = await fileIn(ALVIN_USER, 'root', 'Hidden.pdf')
  await lock(ALVIN_USER, 'file', HIDDEN.id)
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_delete($1)`, [HIDDEN.id])
  await sys()
  const hiddenBin = await one(`SELECT id FROM public.hr_drive_bin WHERE file_id = $1`, [HIDDEN.id])
  check([(await driveAs(LISA_USER)).bin.some(b => b.id === hiddenBin), (await driveAs(ALVIN_USER)).bin.some(b => b.id === hiddenBin)],
    [false, true], 'LISA’s Bin leaves ALVIN’s locked file out; his has it')
  await asHr(LISA_USER)
  await reject(`SELECT public.hr_drive_bin_restore($1)`, [hiddenBin], /That is not in the Bin any more\./, 'LISA cannot restore it')
  await reject(`SELECT public.hr_drive_bin_delete($1)`, [hiddenBin], /That is not in the Bin any more\./, 'nor delete it forever')
  await asHr(LISA_USER)
  await q(`SELECT public.hr_drive_bin_empty()`)
  await sys()
  check([Number(await one(`SELECT count(*) FROM public.hr_drive_bin WHERE id = $1`, [hiddenBin])), (await fileRow(HIDDEN.id)).deleted_at],
    [1, null], 'her Empty bin leaves it there, not deleted')
  check(Number(await one(`SELECT count(*) FROM public.hr_drive_bin WHERE file_id = $1`, [BINNED.id])), 0, 'while what she is shown went')
  await asHr(ALVIN_USER)
  check(await one(`SELECT public.hr_drive_bin_restore($1)`, [hiddenBin]), { kind: 'file', name: 'Hidden.pdf', label: 'Data center' },
    'ALVIN restores it')
  // A locked folder stands apart from an open one of its name; two open ones do not.
  const TWIN_LOCKED = await folderIn(ALVIN_USER, 'root', 'Twin one')
  await lock(ALVIN_USER, 'folder', TWIN_LOCKED)
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_delete($1)`, [TWIN_LOCKED])
  const TWIN_OPEN = await folderIn(LISA_USER, 'root', 'Twin one')
  await asHr(ALVIN_USER)
  check((await one(`SELECT public.hr_drive_bin_restore((SELECT id FROM public.hr_drive_bin WHERE folder_id = $1))`, [TWIN_LOCKED])).label,
    'Data center', 'a locked folder comes back beside an open one of its name')
  check([await seesFolder(ALVIN_USER, TWIN_LOCKED), await seesFolder(ALVIN_USER, TWIN_OPEN), await seesFolder(LISA_USER, TWIN_LOCKED)],
    [true, true, false], 'ALVIN is shown both; LISA only hers')
  const TWIN_A = await folderIn(LISA_USER, 'root', 'Twin two')
  await asHr(LISA_USER)
  await q(`SELECT public.hr_drive_folder_delete($1)`, [TWIN_A])
  await folderIn(LISA_USER, 'root', 'Twin two')
  await asHr(LISA_USER)
  await reject(`SELECT public.hr_drive_bin_restore((SELECT id FROM public.hr_drive_bin WHERE folder_id = $1))`, [TWIN_A],
    /Twin two is there already — rename one first\./, 'an open folder does not come back beside an open one of its name')
  // A person's own, through the Bin.
  const BINME = await fileIn(ALVIN_USER, `person:${PETER}`, 'Bin me.pdf')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_delete($1)`, [BINME.id])
  check((await driveAs(ALVIN_USER)).bin.find(b => b.fileId === BINME.id).at, `person:${PETER}`, 'the Bin says it was in PETER’s folder')
  await asHr(ALVIN_USER)
  check((await one(`SELECT public.hr_drive_bin_restore((SELECT id FROM public.hr_drive_bin WHERE file_id = $1))`, [BINME.id])).label, 'PETER',
    'and puts it back there')
  const EMPTYF = await folderIn(ALVIN_USER, `person:${PETER}`, 'Empty one')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_delete($1)`, [EMPTYF])
  check((await driveAs(ALVIN_USER)).bin.find(b => b.folderId === EMPTYF).at, `person:${PETER}`, 'a folder of his, binned, too')
  await asHr(ALVIN_USER)
  check((await one(`SELECT public.hr_drive_bin_restore((SELECT id FROM public.hr_drive_bin WHERE folder_id = $1))`, [EMPTYF])).label, 'PETER',
    'and restored into his folder')

  // ── 10. One's own documents ──────────────────────────────────────────────────────────────────────────────────────
  const DOCS = await folderIn(ALVIN_USER, `person:${PETER}`, 'Docs')
  await share(ALVIN_USER, 'folder', DOCS, true)
  const A = await fileIn(ALVIN_USER, `folder:${DOCS}`, 'A.pdf')
  const INNERF = await folderIn(ALVIN_USER, `folder:${DOCS}`, 'Inner')
  await share(ALVIN_USER, 'folder', INNERF, false)
  const B = await fileIn(ALVIN_USER, `folder:${INNERF}`, 'B.pdf')
  await share(ALVIN_USER, 'file', B.id, true)
  const HRONLY = await folderIn(ALVIN_USER, `person:${PETER}`, 'HR only')
  const C = await fileIn(ALVIN_USER, `folder:${HRONLY}`, 'C.pdf')
  await share(ALVIN_USER, 'file', C.id, true)
  const LOCKED = await fileIn(ALVIN_USER, `folder:${DOCS}`, 'Locked.pdf')
  await lock(ALVIN_USER, 'file', LOCKED.id)
  await share(ALVIN_USER, 'file', LOCKED.id, true)
  let mine = await myDocs(PETER_USER)
  check(mine.staffId, PETER, 'his login, his record')
  const myFolders = byName(mine.personal.folders)
  check(Object.keys(myFolders).sort(), ['2025', 'Contracts', 'Docs'].sort(),
    'his folders: what is shared with him — never kept back, never shared, never a copy')
  check([myFolders.Contracts.parent, myFolders['2025'].parent, myFolders.Docs.parent], [null, CONTRACTS, null],
    'each under the nearest folder he is shown')
  check(mine.personal.folders.find(f => f.id === FCS.id), undefined, 'the copy of Contracts is a different folder')
  check(mine.personal.folders.filter(f => f.name === 'Copy of Contracts').length, 0, 'and not shared')
  const myFiles = byName(mine.personal.files)
  check(Object.keys(myFiles).sort(), ['A.pdf', 'B.pdf', 'C.pdf', 'Contract.pdf', 'Locked.pdf', 'Notes.pdf', 'Slip.pdf'].sort(),
    'his files: shared with the folder or on their own; never one kept back, never one nobody shared')
  check(mine.personal.files.filter(f => f.name === 'Contract.pdf').map(f => f.id).sort(), [CONTRACT.id, C2].sort(),
    'the copy beside Contract.pdf follows the shared folder; the one at the top of his folder does not')
  check([myFiles['A.pdf'].parent, myFiles['B.pdf'].parent, myFiles['C.pdf'].parent, myFiles['Slip.pdf'].parent], [DOCS, DOCS, null, Y2025],
    'a file shared inside a folder kept back sits in the nearest folder he is shown — or at the top')
  check([myFiles['A.pdf'].seen, myFiles['A.pdf'].id, myFiles['A.pdf'].contentType], [false, A.id, 'application/pdf'], 'new until he opens it')
  await asPerson(PETER_USER, [], 'authenticated')
  check(await one(`SELECT public.my_document_open('drive', $1)`, [A.id]), { path: A.path, fileName: 'A.pdf', contentType: 'application/pdf' },
    'he opens one of his own')
  await sys()
  check(Number(await one(`SELECT count(*) FROM public.hr_drive_member_seen WHERE file_id = $1 AND staff_id = $2`, [A.id, PETER])), 1, 'it is seen')
  check(await lastEvent(A.id), { what: 'Opened', actor_name: 'PETER', note: null }, 'its trail says he opened it')
  check((await myDocs(PETER_USER)).personal.files.find(f => f.id === A.id).seen, true, 'no longer new')
  check(await reads(PETER_USER, A.path), 1, 'the bucket reads it for him')
  await asPerson(PETER_USER, [], 'authenticated')
  await reject(`SELECT public.my_document_open('drive', $1)`, [SALARY.id], /That file is not shared with you\./, 'one kept back does not open')
  await reject(`SELECT public.my_document_open('drive', $1)`, [REVIEW.id], /That file is not shared with you\./, 'nor another person’s')
  await reject(`SELECT public.my_document_open('drive', $1)`, [OFFER.id], /That file is not shared with you\./, 'nor one never shared')
  await reject(`SELECT public.my_document_open('elsewhere', $1)`, [A.id], /Unknown kind of file/, 'a document, a file or a letter')
  // A letter of his opened is its memo read.
  const LT3 = await fileLetter(INC_TYPE, 'raise.pdf')
  check(await memoNotices(PETER_USER, LT3.memo), [{ read: false }], 'a new letter is news')
  await asPerson(PETER_USER, [], 'authenticated')
  check((await one(`SELECT public.my_document_open('letter', $1)`, [LT3.id])).path, LT3.path, 'he opens his letter')
  await sys()
  check(Number(await one(`SELECT count(*) FROM public.member_memo_receipts WHERE memo_id = $1 AND user_id = $2`, [LT3.memo, PETER_USER])), 1,
    'opening it reads the memo it travelled as')
  check(await memoNotices(PETER_USER, LT3.memo), [{ read: true }], 'its notice is read')
  // Company: what his department is shared.
  const docPath = `documents/${crypto.randomUUID()}/hb.pdf`
  await put(docPath)
  await asHr(ALVIN_USER)
  const D1 = await one(`SELECT public.hr_document_add('Handbook', $1, 'hb.pdf', 'application/pdf', 5, ARRAY[$2::uuid])`, [docPath, REV])
  mine = await myDocs(PETER_USER)
  check(mine.company.map(x => [x.id, x.name, x.fileName, x.seen]), [[D1, 'Handbook', 'hb.pdf', false]], 'Company: his department’s')
  check((await myDocs(PETER_USER, ['member_portal'], true)).company, [], 'a Revenue member whose Documentation box is closed has none')
  check((await myDocs(PETER_USER, ['member_portal'], true)).personal.files.length, 8, 'his own stay his')
  check((await myDocs(PETER_USER, ['member_portal'], false)).company.length, 1, 'with the box open he has them')
  check(await reads(PETER_USER, docPath, [], ['member_portal'], true), 0, 'the bucket keeps the box too')
  check(await reads(PETER_USER, docPath), 1, 'and reads it for anybody else in the department')
  await as(PETER_USER, [], 'authenticated', ['member_portal'], true)
  await reject(`SELECT public.my_document_open('document', $1)`, [D1], /Documentation is not open to your account\./, 'nor opens it')
  await asPerson(PETER_USER, [], 'authenticated')
  check(await one(`SELECT public.my_document_open('document', $1)`, [D1]), { path: docPath, fileName: 'hb.pdf', contentType: 'application/pdf' },
    'he opens a company document')
  await sys()
  check(Number(await one(`SELECT count(*) FROM public.hr_document_seen WHERE document_id = $1 AND staff_id = $2`, [D1, PETER])), 1, 'seen')
  check((await q(`SELECT what, actor_name FROM public.hr_document_events WHERE document_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [D1]))[0],
    { what: 'Opened in My documents', actor_name: 'PETER' }, 'its trail says where')
  check((await myDocs(PETER_USER)).company[0].seen, true, 'no longer new')
  await asPerson(LISA_USER, [], 'authenticated')
  await reject(`SELECT public.my_document_open('document', $1)`, [D1], /That document is not shared with you\./, 'HR’s LISA: not her department’s')
  check((await myDocs(LISA_USER)).company, [], 'her Company has none of Revenue’s')
  // A shared login, and nobody at all.
  check(await myDocs(SHARED_USER), { staffId: null, company: [], personal: { folders: [], files: [], letters: [] } }, 'hr@ — no record — has none')
  await asPerson(SHARED_USER, [], 'authenticated')
  await reject(`SELECT public.my_document_open('drive', $1)`, [A.id], /No People record is linked to this account\./, 'and opens nothing')
  await asPerson(null, [], 'authenticated')
  await reject(`SELECT public.my_documents()`, [], /Sign in with an active account\./, 'nobody signed in has nothing')
  await sys()
  await q(`UPDATE users SET is_active = false WHERE id = $1`, [PETER_USER])
  await asPerson(PETER_USER, [], 'authenticated')
  await reject(`SELECT public.my_documents()`, [], /Sign in with an active account\./, 'a login switched off has nothing')
  await sys()
  await q(`UPDATE users SET is_active = true WHERE id = $1`, [PETER_USER])
  // The Revenue app's View as: one member's, less what the reader is not shown, nothing marked seen.
  const seenBefore = Number(await one(`SELECT count(*) FROM public.hr_drive_member_seen WHERE staff_id = $1`, [PETER]))
  await as(LISA_USER, [], 'authenticated')
  await reject(`SELECT public.my_documents_of($1)`, [PETER], /Seeing a member's documents needs Documentation · View\./, 'it needs View')
  await as(LISA_USER, VIEW, 'authenticated')
  let theirs = await one(`SELECT public.my_documents_of($1)`, [PETER])
  check([theirs.staffId, theirs.company.map(x => x.id)], [PETER, [D1]], 'LISA reads PETER’s Company')
  check([theirs.personal.files.some(f => f.id === LOCKED.id), theirs.personal.files.some(f => f.id === NOTES.id),
    theirs.personal.files.some(f => f.id === A.id)], [false, false, true], 'and his Personal, less what ALVIN locked')
  await as(ALVIN_USER, VIEW, 'authenticated')
  theirs = await one(`SELECT public.my_documents_of($1)`, [PETER])
  check([theirs.personal.files.some(f => f.id === LOCKED.id), theirs.personal.files.some(f => f.id === NOTES.id)], [true, true],
    'ALVIN is shown all of it')
  check(theirs.personal.files.find(f => f.id === A.id).seen, true, 'with whether PETER opened each')
  await sys()
  check(Number(await one(`SELECT count(*) FROM public.hr_drive_member_seen WHERE staff_id = $1`, [PETER])), seenBefore, 'reading as HR marks nothing')
  await as(ALVIN_USER, VIEW, 'authenticated')
  await reject(`SELECT public.my_documents_of($1)`, [id(997)], /Pick a team member first\./, 'somebody who is there')

  // ── 11. The Audit Log: View only me needs its key ────────────────────────────────────────────────────────────────
  await sys()
  const auditOf = async (table, where, value) =>
    one(`SELECT public.audit_row_needs('drive_private', $1, to_jsonb(r)) FROM public.${table} r WHERE r.${where} = $2`, [table, value])
  check(await auditOf('hr_drive_files', 'id', SECRET.id), ['audit_log'], 'a locked file’s history needs the Audit Log key')
  check(await auditOf('hr_drive_files', 'id', INNER.id), ['audit_log'], 'so does one inside a locked folder')
  check(await auditOf('hr_drive_files', 'id', P2.id), null, 'one nobody locked needs nothing more')
  check(await auditOf('hr_drive_folders', 'id', CASES), ['audit_log'], 'a locked folder')
  check(await auditOf('hr_drive_folders', 'id', OLDF), null, 'a folder nobody locked')
  const LOCKBIN = await fileIn(ALVIN_USER, `folder:${CASES}`, 'Lock bin.pdf')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_delete($1)`, [LOCKBIN.id])
  await sys()
  check(await auditOf('hr_drive_bin', 'file_id', LOCKBIN.id), ['audit_log'], 'its line in the Bin')
  const OPENBIN = await fileIn(ALVIN_USER, 'company:hv', 'Open bin.pdf')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_delete($1)`, [OPENBIN.id])
  await sys()
  check(await auditOf('hr_drive_bin', 'file_id', OPENBIN.id), null, 'an open file’s line in the Bin needs nothing more')
  check(await one(`SELECT public.audit_row_needs('payroll_voucher', 'payment_vouchers', '{"reference_type":"payroll_disbursement"}'::jsonb)`),
    ['payroll_payouts', 'hr_costing'], 'the Audit Log’s other rules answer as before')
  check((await q(`SELECT table_name, needs_rule FROM public.audit_tables
                   WHERE table_name IN ('hr_drive_folders', 'hr_drive_files', 'hr_drive_bin', 'hr_drive_member_seen') ORDER BY table_name`))
    .map(r => [r.table_name, r.needs_rule]),
  [['hr_drive_bin', 'drive_private'], ['hr_drive_files', 'drive_private'], ['hr_drive_folders', 'drive_private'], ['hr_drive_member_seen', null]],
  'the three tables ask the rule; who opened what is no history of its own')

  // ── 12. Who may call what ────────────────────────────────────────────────────────────────────────────────────────
  const may = async (role, fn) => one(`SELECT has_function_privilege($1, $2, 'EXECUTE')`, [role, fn])
  for (const fn of ['public.my_documents()', 'public.my_document_open(text, uuid)', 'public.my_documents_of(uuid)',
    'public.hr_drive_private(text, uuid, boolean)', 'public.hr_drive_member_view(text, uuid, boolean)', 'public.hr_letter_member_view(uuid, boolean)',
    'public.hr_drive_file_move(uuid, text)', 'public.hr_drive_copy_plan(text, uuid)', 'public.hr_drive_file_copy(uuid, text, text, text)',
    'public.hr_drive_folder_copy(uuid, text, text, jsonb)', 'public.hr_doc_readable_by_hr(text)', 'public.hr_drive()']) {
    check([await may('authenticated', fn), await may('anon', fn)], [true, false], `${fn}: a session's, never the publishable key's`)
  }
  for (const fn of ['public.hr_drive_rank_of(uuid)', 'public.hr_drive_sees(uuid, integer)', 'public.hr_drive_sees_folder(uuid)',
    'public.hr_drive_sees_file(uuid)', 'public.hr_drive_place(text)', 'public.hr_drive_name_taken(text, uuid, uuid, uuid, text, uuid)',
    'public.hr_personal_documents(uuid, boolean)', 'public.hr_company_documents(uuid)', 'public.hr_my_company_open()',
    'public.hr_drive_lock_left(uuid, uuid, uuid, integer)', 'public.hr_drive_member_sees_file(uuid)', 'public.hr_drive_row_private(text, jsonb)',
    'public.hr_drive_person_of(text, uuid, uuid)', 'public.hr_drive_label(text, uuid, uuid, uuid)']) {
    check([await may('authenticated', fn), await may('anon', fn), await may('service_role', fn)], [false, false, true],
      `${fn}: the functions' own, closed to sessions`)
  }
  check(Number(await one(`SELECT count(*) FROM pg_proc WHERE proname = 'hr_drive_name_taken'`)), 1, 'the old name check is gone, not left beside')
  await asHr(ALVIN_USER, 'authenticated')
  await reject(`SELECT public.hr_drive_sees(NULL, NULL)`, [], /permission denied/, 'a session cannot ask the helpers itself')

  // ── 13. After the independent review (20261014230000) ───────────────────────────────────────────────────────────
  await sys()
  await load('20261014230000_data_center_personal_review_fixes.sql')
  checks++

  // 13a. A walk that cannot reach the top fails closed.
  let deep = await folderIn(ALVIN_USER, `person:${KRIS}`, 'Deep 1')
  await share(ALVIN_USER, 'folder', deep, true)
  const chain = [deep]
  for (let n = 2; n <= 65; n++) {
    deep = await folderIn(ALVIN_USER, `folder:${deep}`, `Deep ${n}`)
    chain.push(deep)
  }
  await sys()
  const helper = async (fn, arg) => one(`SELECT public.${fn}($1)`, [arg])
  check([await helper('hr_drive_sees_folder', chain[63]), await helper('hr_drive_sees_folder', chain[64])], [true, false],
    '64 folders deep is shown; one deeper, its walk cut short, is not')
  check([await helper('hr_drive_locked_folder', chain[63]), await helper('hr_drive_locked_folder', chain[64])], [false, true],
    'and counts as locked for the Audit Log')
  check([await helper('hr_drive_member_sees_folder', chain[63]), await helper('hr_drive_member_sees_folder', chain[64])], [true, false],
    'nor does its person see it')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_folder_rename($1, 'Deeper')`, [chain[64]], /That folder is not there any more\./,
    'nobody acts on it')

  // 13b. A lock stands between a person and everything in it.
  const BAR = await folderIn(ALVIN_USER, `person:${PETER}`, 'Bar')
  await share(ALVIN_USER, 'folder', BAR, true)
  const IN1 = await fileIn(ALVIN_USER, `folder:${BAR}`, 'In one.pdf')
  await share(ALVIN_USER, 'file', IN1.id, true)
  const BARSUB = await folderIn(ALVIN_USER, `folder:${BAR}`, 'Sub')
  const IN2 = await fileIn(ALVIN_USER, `folder:${BARSUB}`, 'In two.pdf')
  check([await memberSeesFile(IN1.id), await memberSeesFile(IN2.id)], [true, true], 'before the lock PETER sees both')
  check(await lock(ALVIN_USER, 'folder', BAR), { name: 'Bar', on: true, wasShared: true }, 'ALVIN locks the folder: PETER saw it')
  check([(await folderRow(BAR)).member_view, (await fileRow(IN1.id)).member_view], [null, true],
    'the folder’s share goes; the file’s own stays on record')
  check([await memberSeesFile(IN1.id), await memberSeesFile(IN2.id)], [false, false], 'a share inside a locked folder no longer reaches him')
  await sys()
  check(await helper('hr_drive_member_sees_folder', BARSUB), false, 'nor does a folder in it')
  d = await driveAs(ALVIN_USER)
  check([d.files.find(f => f.id === IN1.id).memberView, d.files.find(f => f.id === IN1.id).memberSees], [true, false], 'the read says so')
  check(d.folders.find(f => f.id === BARSUB).memberSees, false, 'of the folder in it too')
  check(await reads(PETER_USER, IN1.path), 0, 'the bucket does not read it for him')
  const peterAfter = (await myDocs(PETER_USER)).personal
  check([peterAfter.folders.some(f => [BAR, BARSUB].includes(f.id)), peterAfter.files.some(f => [IN1.id, IN2.id].includes(f.id))], [false, false],
    'his documents leave all of it out')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_member_view('file', $1, true)`, [IN1.id],
    /In one\.pdf is inside Bar, which is View only me — share Bar with PETER first\./, 'sharing inside it is refused, saying why')
  await reject(`SELECT public.hr_drive_member_view('folder', $1, true)`, [BARSUB], /Sub is inside Bar, which is View only me/, 'a folder in it too')
  check(await share(ALVIN_USER, 'file', IN1.id, false), { name: 'In one.pdf', person: 'PETER', sees: false }, 'keeping one back is never refused')
  check(await share(ALVIN_USER, 'folder', BAR, true), { name: 'Bar', person: 'PETER', sees: true }, 'the locked folder itself may be shared')
  check([await memberSeesFile(IN1.id), await memberSeesFile(IN2.id)], [false, true], 'then what is in it follows; what was kept back stays back')
  check(await share(ALVIN_USER, 'file', IN1.id, true), { name: 'In one.pdf', person: 'PETER', sees: true }, 'and a share inside is his to give again')
  check((await myDocs(PETER_USER)).personal.files.filter(f => [IN1.id, IN2.id].includes(f.id)).length, 2, 'both in his documents')
  const W = await folderIn(ALVIN_USER, `person:${PETER}`, 'W')
  const WF = await fileIn(ALVIN_USER, `folder:${W}`, 'W file.pdf')
  await share(ALVIN_USER, 'file', WF.id, true)
  check(await memberSeesFile(WF.id), true, 'a file shared on its own, its folder not')
  check(await lock(ALVIN_USER, 'folder', W), { name: 'W', on: true, wasShared: true }, 'locking the folder takes that file from him — and says so')
  check(await memberSeesFile(WF.id), false, 'it is taken')
  const Z = await folderIn(ALVIN_USER, `person:${PETER}`, 'Z')
  await fileIn(ALVIN_USER, `folder:${Z}`, 'Z file.pdf')
  check(await lock(ALVIN_USER, 'folder', Z), { name: 'Z', on: true, wasShared: false }, 'nothing in it his: no news')

  // 13c. A lock hides the history written before it.
  const AF = await folderIn(ALVIN_USER, 'company:hv', 'Audit box')
  const AFF = await fileIn(ALVIN_USER, `folder:${AF}`, 'Audit file.pdf')
  const AFC = await folderIn(ALVIN_USER, `folder:${AF}`, 'Audit child')
  const AOTHER = await folderIn(ALVIN_USER, 'company:hv', 'Audit other')
  await sys()
  const affRef = (await fileRow(AFF.id)).ref
  await q(`INSERT INTO public.audit_events (table_name, row_key, op, new_row) VALUES
    ('hr_drive_folders', $1, 'INSERT', '{}'), ('hr_drive_folders', $2, 'INSERT', '{}'), ('hr_drive_files', $3, 'INSERT', '{}'),
    ('hr_drive_bin', $4, 'INSERT', jsonb_build_object('file_id', $5::text)), ('hr_drive_folders', $6, 'INSERT', '{}')`,
  [AF, AFC, affRef, crypto.randomUUID(), AFF.id, AOTHER])
  const needsOf = async () => {
    await sys()
    return (await q(`SELECT needs FROM public.audit_events ORDER BY id`)).map(r => r.needs)
  }
  check(await needsOf(), [null, null, null, null, null], 'the history as written, before any lock')
  await lock(ALVIN_USER, 'folder', AF)
  check(await needsOf(), [['audit_log'], ['audit_log'], ['audit_log'], ['audit_log'], null],
    'locked: its own history, a folder’s, a file’s and a Bin line in it need the Audit Log key — another folder’s does not')
  await lock(ALVIN_USER, 'folder', AF, false)
  check(await needsOf(), [['audit_log'], ['audit_log'], ['audit_log'], ['audit_log'], null], 'unlocked, what was hidden stays hidden')
  const MOVER = await folderIn(ALVIN_USER, 'company:hv', 'Audit mover')
  const MOVERF = await fileIn(ALVIN_USER, 'company:hv', 'Audit mover.pdf')
  const VAULT = await folderIn(ALVIN_USER, 'company:hv', 'Vault')
  await lock(ALVIN_USER, 'folder', VAULT)
  await sys()
  const moverRef = (await fileRow(MOVERF.id)).ref
  await q(`INSERT INTO public.audit_events (table_name, row_key, op, new_row) VALUES ('hr_drive_folders', $1, 'INSERT', '{}'),
    ('hr_drive_files', $2, 'INSERT', '{}')`, [MOVER, moverRef])
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_move($1, $2)`, [MOVER, `folder:${VAULT}`])
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_move($1, $2)`, [MOVERF.id, `folder:${VAULT}`])
  await sys()
  check((await q(`SELECT needs FROM public.audit_events WHERE row_key IN ($1, $2) ORDER BY id`, [MOVER, moverRef])).map(r => r.needs),
    [['audit_log'], ['audit_log']], 'moved into a locked folder, a folder’s and a file’s history are hidden')
  const SOLO = await fileIn(ALVIN_USER, 'company:hv', 'Solo.pdf')
  await sys()
  const soloRef = (await fileRow(SOLO.id)).ref
  await q(`INSERT INTO public.audit_events (table_name, row_key, op, new_row) VALUES ('hr_drive_files', $1, 'INSERT', '{}')`, [soloRef])
  await lock(ALVIN_USER, 'file', SOLO.id)
  await sys()
  check(await one(`SELECT needs FROM public.audit_events WHERE row_key = $1`, [soloRef]), ['audit_log'], 'a file locked on its own too')

  // 13d. An object the Data center has not recorded is its uploader's alone.
  const inFlight = `drive/${crypto.randomUUID()}/In flight.pdf`
  await put(inFlight, '0 seconds', ALVIN_USER)
  check([await reads(ALVIN_USER, inFlight, VIEW), await reads(LISA_USER, inFlight, VIEW), await reads(BOSS_USER, inFlight, VIEW),
    await reads(PRIN_SHARED_USER, inFlight, VIEW)], [1, 0, 0, 0], 'an upload not yet recorded is read for its uploader only')
  const ownerless = `drive/${crypto.randomUUID()}/Nobody.pdf`
  await put(ownerless)
  check(await reads(ALVIN_USER, ownerless, VIEW), 0, 'one nobody uploaded with a login is read for nobody')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_add('company:hv', $1, 'In flight.pdf', 'application/pdf', 100)`, [inFlight])
  check(await reads(LISA_USER, inFlight, VIEW), 1, 'recorded, it is HR’s like any file nobody locked')
  const plainDocPath = `documents/${crypto.randomUUID()}/policy.pdf`
  await put(plainDocPath)
  check(await reads(LISA_USER, plainDocPath, VIEW), 1, 'what is not the Data center’s is read as before')
  check(await reads(PETER_USER, IN2.path), 1, 'and a person’s shared file is still read for him')

  // 13e. HR's own writes sweep only what the sweeper may read; the hourly sweep takes the rest.
  const oldMine = `drive/${crypto.randomUUID()}/Old mine.pdf`
  await put(oldMine, '2 days', ALVIN_USER)
  const oldDoc = `documents/${crypto.randomUUID()}/Old doc.pdf`
  await put(oldDoc, '2 days')
  const leftovers = async user => {
    await asHr(user)
    return one(`SELECT public.hr_documentation_leftovers()`)
  }
  const alvinSweeps = await leftovers(ALVIN_USER)
  const lisaSweeps = await leftovers(LISA_USER)
  check([alvinSweeps.includes(oldMine), alvinSweeps.includes(oldDoc)], [true, true], 'ALVIN’s writes sweep his own day-old upload')
  check([lisaSweeps.includes(oldMine), lisaSweeps.includes(oldDoc)], [false, true], 'LISA’s do not — she cannot read it')
  await sys()
  const orphans = await one(`SELECT public.hr_drive_orphans(100)`)
  check([orphans.includes(oldMine), orphans.includes(inFlight), orphans.includes(oldDoc), orphans.includes(ownerless)], [true, false, false, false],
    'the hourly sweep: a day-old Data center object nobody recorded — not a recorded one, another folder’s or one just up')
  check((await one(`SELECT public.hr_drive_orphans(1)`)).length, 1, 'as many as asked')

  // 13f. A copy is checked before any object is copied.
  const plan4 = async (user, kind, item, parent, name) => {
    await asHr(user)
    return one(`SELECT public.hr_drive_copy_plan($1, $2, $3, $4)`, [kind, item, parent, name])
  }
  const DEST = await folderIn(ALVIN_USER, 'root', 'Copy dest')
  check((await plan4(ALVIN_USER, 'folder', POL, `folder:${DEST}`, 'Policies')).map(f => f.id).sort(), [P1.id, P2.id].sort(),
    'a folder’s plan for a name its place has not got: what he is shown in it, as before')
  await folderIn(ALVIN_USER, `folder:${DEST}`, 'Policies')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_copy_plan('folder', $1, $2, 'Policies')`, [POL, `folder:${DEST}`],
    /Policies is there already — rename one first\./, 'a name the place has is refused before anything is copied')
  check((await plan4(ALVIN_USER, 'folder', POL, `folder:${DEST}`, null)).length, 2, 'no name: the copy finds its own, as before')
  await asHr(ALVIN_USER)
  await reject(`SELECT public.hr_drive_copy_plan('folder', $1, $2, 'Policies copy')`, [POL, `folder:${OLDF}`],
    /A folder cannot be copied inside itself\./, 'never into a folder inside itself')
  await reject(`SELECT public.hr_drive_copy_plan('folder', $1, $2, 'Policies copy')`, [POL, `folder:${POL}`],
    /A folder cannot be copied inside itself\./, 'nor into itself')
  await reject(`SELECT public.hr_drive_copy_plan('file', $1, $2, NULL)`, [P1.id, `folder:${BOARD_ONLY}`], /That folder is not there any more\./,
    'nor anywhere the caller is not shown')
  await reject(`SELECT public.hr_drive_copy_plan('file', $1, $2, NULL)`, [P1.id, `person:${GONE}`],
    /That person is not on the payroll any more\./, 'nor into the folder of somebody who has left')
  check(await plan4(ALVIN_USER, 'file', P1.id, 'root', null), [{ id: P1.id, path: P1.path, fileName: 'P1.pdf' }], 'a file’s plan, as before')
  await as(ALVIN_USER, VIEW)
  await reject(`SELECT public.hr_drive_copy_plan('file', $1, 'root', NULL)`, [P1.id], /Copying needs Documentation · View and Create/,
    'it still needs Create')

  // 13g. Restored to the top of the Data center, a thing keeps the lock of the folders it was in.
  const BOX = await folderIn(ALVIN_USER, 'company:hv', 'Locked box')
  await lock(ALVIN_USER, 'folder', BOX)
  const BOXF = await fileIn(ALVIN_USER, `folder:${BOX}`, 'Box file.pdf')
  const BOXC = await folderIn(ALVIN_USER, `folder:${BOX}`, 'Box child')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_file_delete($1)`, [BOXF.id])
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_delete($1)`, [BOXC])
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_folder_delete($1)`, [BOX])
  await sys()
  const binOf = async (col, value) => {
    await sys()
    return one(`SELECT id FROM public.hr_drive_bin WHERE ${col} = $1`, [value])
  }
  const boxBin = await binOf('folder_id', BOX)
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_bin_delete($1)`, [boxBin])
  check((await folderRow(BOX)) !== null, true, 'deleted forever, the folder stays as a row while things it held wait in the Bin')
  const boxfBin = await binOf('file_id', BOXF.id)
  await asHr(ALVIN_USER)
  check((await one(`SELECT public.hr_drive_bin_restore($1)`, [boxfBin])).label, 'Data center', 'its file comes back at the top')
  const boxfRow = await fileRow(BOXF.id)
  check([boxfRow.parent_kind, boxfRow.private_by, boxfRow.private_by_name], ['root', ALVIN_USER, 'ALVIN'], 'carrying the folder’s lock')
  check([await seesFile(LISA_USER, BOXF.id), await seesFile(BOSS_USER, BOXF.id)], [false, true], 'LISA is not shown it; BOSS is')
  const boxcBin = await binOf('folder_id', BOXC)
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_drive_bin_restore($1)`, [boxcBin])
  const boxcRow = await folderRow(BOXC)
  check([boxcRow.parent_kind, boxcRow.private_by], ['root', ALVIN_USER], 'a folder too')
  check(await seesFolder(LISA_USER, BOXC), false, 'and LISA is not shown it')

  // 13h. A letter kept back still belongs to Documentation.
  const LTHIDE = await fileLetter(OFFER_TYPE, 'offer again.pdf')
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_letter_member_view($1, false)`, [LTHIDE.id])
  await sys()
  check(((await one(`SELECT public.member_admin_snapshot()`)).memos ?? []).includes(LTHIDE.memo), false,
    'its memo, reaching nobody now, is not Member services’ to list')
  const pubPath2 = `publish/${crypto.randomUUID()}/rules two.pdf`
  await put(pubPath2)
  await asHr(ALVIN_USER)
  const PM2 = (await one(`SELECT public.hr_publish('Memo', NULL, 'House rules two', 'Please read.', $1, 'rules two.pdf', 'application/pdf', 5,
      ARRAY[$2::uuid], ARRAY[$3::uuid, $4::uuid], 'Revenue · everyone', true)`, [pubPath2, REV, PETER, KRIS])).id
  await sys()
  const peterCopy2 = await one(`SELECT id FROM public.hr_person_letters WHERE memo_id = $1 AND staff_id = $2`, [PM2, PETER])
  const krisCopy2 = await one(`SELECT id FROM public.hr_person_letters WHERE memo_id = $1 AND staff_id = $2`, [PM2, KRIS])
  await q(`INSERT INTO public.member_memo_receipts (memo_id, user_id, version, acknowledged_at) VALUES ($1, $2, 1, now())`, [PM2, PETER_USER])
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_letter_member_view($1, false)`, [peterCopy2])
  await asHr(ALVIN_USER)
  await q(`SELECT public.hr_letter_withdraw($1)`, [krisCopy2])
  await sys()
  check(await one(`SELECT withdrawn_at FROM public.member_memos WHERE id = $1`, [PM2]), null,
    'KRIS’s copy withdrawn while PETER’s is kept back: the memo is not withdrawn')
  check(Number(await one(`SELECT count(*) FROM public.member_memo_receipts WHERE memo_id = $1 AND user_id = $2`, [PM2, PETER_USER])), 1,
    'and PETER’s receipt is kept')
  check(((await one(`SELECT public.member_admin_snapshot()`)).memos ?? []).includes(PM2), false, 'nor is it Member services’')
  await asHr(ALVIN_USER)
  check((await one(`SELECT public.hr_letter_member_view($1, true)`, [peterCopy2])).sees, true, 'shared with PETER again')
  check([await recipients(PM2), await memoNotices(PETER_USER, PM2)], [[PETER], [{ read: true }]], 'he is back on it, acknowledged as he was')

  // 13i. Who may call what, now.
  for (const fn of ['public.hr_drive_copy_plan(text, uuid, text, text)', 'public.hr_doc_readable_by_hr(text, text)']) {
    check([await may('authenticated', fn), await may('anon', fn)], [true, false], `${fn}: a session's, never the publishable key's`)
  }
  for (const fn of ['public.hr_drive_orphans(integer)', 'public.hr_drive_audit_hide(text, uuid)', 'public.hr_drive_barrier_above(uuid)',
    'public.hr_drive_member_sees_any(uuid)']) {
    check([await may('authenticated', fn), await may('anon', fn), await may('service_role', fn)], [false, false, true],
      `${fn}: the service role's and the functions' own`)
  }
  check([await one(`SELECT to_regprocedure('public.hr_drive_copy_plan(text, uuid)') IS NULL`),
    await one(`SELECT to_regprocedure('public.hr_doc_readable_by_hr(text)') IS NULL`)], [true, true], 'the old signatures are gone')

  console.log(`validate-data-center-personal: ${checks} checks passed`)
} catch (e) {
  // A database error's own words, where and why — not the driver's bundle.
  console.error(e instanceof assert.AssertionError ? e : { message: e?.message, code: e?.code, position: e?.position, where: e?.where, detail: e?.detail })
  process.exitCode = 1
} finally {
  await db.close()
}
