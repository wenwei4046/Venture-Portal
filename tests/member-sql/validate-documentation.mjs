// Local PostgreSQL regression for 20261011170000 (2026-10-11, People ›
// Documentation after the user's answer E): a file really goes, and a letter
// can be withdrawn. Documentation's migrations (20261011070000, 070100), Hiring's
// (their tables are in the review hardening's grants) and the review hardening
// (20261011120100) run VERBATIM over stand-ins for the tables they read, the
// storage schema and the permission check they ask; then the migration under
// test. What is under test: only Documentation · Edit withdraws; a withdrawn
// Data center letter's memo, recipient and receipts go, what its person had
// opened and acknowledged stays on the letter's trail, its person no longer
// opens the file, the page counts it for nothing and signs no link to it; a
// withdrawn published letter takes its person off the memo and leaves the rest,
// and the memo goes once it reaches nobody; the bucket lets Edit delete only a
// file no live record holds; the leftovers are the files of deleted documents
// and withdrawn letters and a day-old upload nobody saved; "File deleted" is
// written once, only for a file really gone. No live I/O.
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

const GRACE_USER = id(1) // HR, Documentation · View / Create / Edit
const VIEWER_USER = id(2) // Documentation · View and Create only
const KJ_USER = id(3) // Kar Jun's own login
const CHEA_USER = id(4) // Chea Huan's own login
const GRACE = id(11)
const KARJUN = id(12)
const CHEA = id(13)
const HR = id(21)
const REV = id(22)

/** Signed in as somebody holding these actions (the stand-in has_any_action reads them), as the database role. */
async function as(user, actions, role = null) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const EDIT = ['documentation.view', 'documentation.create', 'documentation.edit']
const asGrace = (role = null) => as(GRACE_USER, EDIT, role)

const put = (name, age = '0 seconds') =>
  q(`INSERT INTO storage.objects(bucket_id, name, created_at) VALUES ('hr-documents', $1, now() - $2::interval)`, [name, age])
const inBucket = async name => Number(await one(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'hr-documents' AND name = $1`, [name])) === 1
/** The Storage API's delete, under the caller's own session: the bucket's policies decide. */
const removeAs = async name => (await db.query(`DELETE FROM storage.objects WHERE bucket_id = 'hr-documents' AND name = $1`, [name])).affectedRows
const page = async () => {
  await asGrace()
  return one(`SELECT public.hr_documentation()`)
}
const letterOf = async lid => (await page()).letters.find(l => l.id === lid)
const trail = async lid => (await q(`SELECT what, actor_name, note FROM public.hr_letter_events WHERE letter_id = $1 ORDER BY created_at, id`, [lid]))
  .map(e => e.what)
const readable = async (user, name) => {
  await as(user, [], 'authenticated')
  const yes = await one(`SELECT public.hr_file_readable_by_member($1)`, [name])
  await db.exec('RESET ROLE')
  return yes
}

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
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;

    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE title_levels(id uuid PRIMARY KEY, rank integer);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL, level_id uuid);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, employee_code text, department_id uuid,
      status text NOT NULL DEFAULT 'active', user_id uuid, title_id uuid, designation text);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE member_memos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL,
      sender text, version integer NOT NULL DEFAULT 1, published_at timestamptz NOT NULL DEFAULT now(), effective_at date,
      requires_ack boolean NOT NULL DEFAULT true, created_by uuid,
      CONSTRAINT member_memos_body_check CHECK (length(body) BETWEEN 1 AND 30000));
    CREATE TABLE member_memo_audiences(memo_id uuid NOT NULL REFERENCES member_memos(id), sub_department_id uuid NOT NULL);
    CREATE TABLE member_memo_receipts(memo_id uuid NOT NULL REFERENCES member_memos(id), user_id uuid NOT NULL, version integer NOT NULL,
      read_at timestamptz, acknowledged_at timestamptz);

    -- The permission check: any wanted 'fn.action[:scope]' among the actions handed in.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$ SELECT p_table $$;

    -- The Revenue app's three functions the migrations swap a statement into, each holding production's statement.
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
  `)
  await q(`INSERT INTO users(id, name, email) VALUES ($1, 'HR', 'hr@x'), ($2, 'Viewer', 'v@x'), ($3, 'Kar Jun', 'kj@x'), ($4, 'Chea Huan', 'ch@x')`,
    [GRACE_USER, VIEWER_USER, KJ_USER, CHEA_USER])
  await q(`INSERT INTO departments VALUES ($1, 'HR'), ($2, 'Revenue Department')`, [HR, REV])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, status, user_id, designation) VALUES
    ($1, 'Grace Lim', $4, 'active', $5, 'HR Manager'), ($2, 'Kar Jun', $6, 'active', $7, 'Team Assistant'),
    ($3, 'Chea Huan', $6, 'active', $8, 'Team Leader')`, [GRACE, KARJUN, CHEA, HR, GRACE_USER, REV, KJ_USER, CHEA_USER])

  for (const f of [
    '20261011070000_documentation.sql', '20261011070100_documentation_published_letter_type.sql',
    '20261011080000_hiring.sql', '20261011080100_hiring_file_reads.sql', '20261011080200_hiring_reconsider_declined.sql',
    '20261011120100_round2_review_hardening.sql', '20261011170000_documentation_withdraw_and_delete_files.sql',
  ]) {
    await db.exec(await readFile(new URL(f, migrations), 'utf8'))
  }
  // Applying it twice changes nothing (each swap sees it is done).
  await db.exec(await readFile(new URL('20261011170000_documentation_withdraw_and_delete_files.sql', migrations), 'utf8')
    .then(s => s.replace(/CREATE POLICY hr_documents_delete[\s\S]*?;\r?\n/, '')))

  const OFFER = await one(`SELECT id FROM public.hr_letter_types WHERE name = 'Offer letter'`)
  const WARNING = await one(`SELECT id FROM public.hr_letter_types WHERE name = 'Warning letter'`)

  // ── Who may ───────────────────────────────────────────────────────────────
  for (const fn of ['hr_letter_withdraw(uuid)', 'hr_documentation_leftovers()', 'hr_documentation_files_removed(text[])', 'hr_doc_file_unused(text)']) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
  }

  // ── A Data center letter, read and acknowledged ───────────────────────────
  const offerFile = `letters/${KARJUN}/${id(101)}/Offer_KJ.pdf`
  await put(offerFile)
  await asGrace()
  const L1 = await one(`SELECT public.hr_letter_file($1, $2, $3, 'Offer_KJ.pdf', 'application/pdf', 100)`, [KARJUN, OFFER, offerFile])
  const M1 = await one(`SELECT memo_id FROM public.hr_person_letters WHERE id = $1`, [L1])
  await q(`INSERT INTO member_memo_receipts VALUES ($1, $2, 1, now(), now())`, [M1, KJ_USER])
  check(await readable(KJ_USER, offerFile), true, 'Kar Jun opens his letter')
  check((await page()).letterTypes.find(t => t.id === OFFER).count, 1, 'Offer letter has one on file')

  // A live letter's file is nobody's to delete.
  await asGrace('authenticated')
  check(await removeAs(offerFile), 0, 'the bucket keeps a live letter’s file')
  check(await one(`SELECT public.hr_doc_file_unused($1)`, [offerFile]), false, 'a live letter holds its file')

  // View and Create alone withdraw nothing.
  await as(VIEWER_USER, ['documentation.view', 'documentation.create'])
  await reject(`SELECT public.hr_letter_withdraw($1)`, [L1], /Documentation · Edit/, 'withdrawing needs Edit')
  await reject(`SELECT public.hr_documentation_leftovers()`, [], /Documentation · Edit/, 'the leftovers need Edit')
  await as(VIEWER_USER, ['documentation.view', 'documentation.create'], 'authenticated')
  check(await one(`SELECT public.hr_doc_file_unused($1)`, [offerFile]), false, 'without Edit, no file is anybody’s to delete')

  // ── Withdrawn ─────────────────────────────────────────────────────────────
  await asGrace()
  const w = await one(`SELECT public.hr_letter_withdraw($1)`, [L1])
  check([w.person, w.type], ['Kar Jun', 'Offer letter'], 'it says whose and what')
  check(Number(await one(`SELECT count(*) FROM member_memos WHERE id = $1`, [M1])), 0, 'its memo, which reached only him, is gone')
  check(Number(await one(`SELECT count(*) FROM member_memo_recipients WHERE memo_id = $1`, [M1])), 0, 'and its recipient')
  check(Number(await one(`SELECT count(*) FROM member_memo_receipts WHERE memo_id = $1`, [M1])), 0, 'and its receipts')
  check(await trail(L1), ['Uploaded', 'Sent to Revenue app', 'Opened in Revenue app', 'Acknowledged', 'Withdrawn'],
    'the trail keeps what he did with it, then says it was withdrawn')
  check((await q(`SELECT note FROM hr_letter_events WHERE letter_id = $1 AND what = 'Withdrawn'`, [L1]))[0].note,
    'No longer on Kar Jun\'s record or in the Revenue app', 'in words')
  let l1 = await letterOf(L1)
  check([typeof l1.withdrawnAt, l1.readAt, l1.acknowledgedAt], ['string', null, null], 'the page reads it as withdrawn')
  check((await page()).letterTypes.find(t => t.id === OFFER).count, 0, 'and counts it for nothing — Kar Jun is missing his Offer letter again')
  check(await readable(KJ_USER, offerFile), false, 'Kar Jun no longer opens it')
  await asGrace()
  await reject(`SELECT public.hr_letter_withdraw($1)`, [L1], /already withdrawn/, 'withdrawn once')
  await reject(`SELECT public.hr_documentation_file('letter', $1)`, [L1], /deleted/, 'no link is signed to it')

  // Its file is nobody's now: listed, deleted by Edit, and the trail says so once.
  check(await one(`SELECT public.hr_documentation_leftovers()`), [offerFile], 'its file is a leftover')
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[offerFile]]), 0, 'nothing is written while the file is still there')
  await asGrace('authenticated')
  check(await removeAs(offerFile), 1, 'Edit deletes it through the bucket')
  await asGrace()
  check(await inBucket(offerFile), false, 'gone')
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[offerFile]]), 1, '"File deleted" on its trail')
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[offerFile]]), 0, 'once')
  check((await trail(L1)).at(-1), 'File deleted', 'the last line of the trail')

  // ── A published letter, saved to two records ──────────────────────────────
  const rulesFile = `publish/${id(102)}/Rules.pdf`
  await put(rulesFile)
  const pub = await one(`SELECT public.hr_publish('Letter', $1, 'House rules', '', $2, 'Rules.pdf', 'application/pdf', 100, $3, $4, 'Revenue · everyone', true)`,
    [WARNING, rulesFile, [REV], [KARJUN, CHEA]])
  const M2 = pub.id
  const L2 = await one(`SELECT id FROM hr_person_letters WHERE memo_id = $1 AND staff_id = $2`, [M2, KARJUN])
  const L3 = await one(`SELECT id FROM hr_person_letters WHERE memo_id = $1 AND staff_id = $2`, [M2, CHEA])
  await q(`INSERT INTO member_memo_receipts VALUES ($1, $2, 1, now(), NULL), ($1, $3, 1, now(), now())`, [M2, KJ_USER, CHEA_USER])

  await one(`SELECT public.hr_letter_withdraw($1)`, [L2])
  check((await q(`SELECT staff_id FROM member_memo_recipients WHERE memo_id = $1`, [M2])).map(r => r.staff_id), [CHEA],
    'Kar Jun comes off the memo; Chea Huan keeps it')
  check((await q(`SELECT user_id FROM member_memo_receipts WHERE memo_id = $1`, [M2])).map(r => r.user_id), [CHEA_USER], 'and his receipt goes')
  check(Number(await one(`SELECT count(*) FROM member_memos WHERE id = $1`, [M2])), 1, 'the memo stays for her')
  check(await readable(KJ_USER, rulesFile), false, 'he no longer opens the attachment')
  check(await readable(CHEA_USER, rulesFile), true, 'she still does')
  await asGrace()
  check(await one(`SELECT public.hr_documentation_leftovers()`), [], 'a file the memo still holds is no leftover')
  check(await trail(L2), ['Published', 'Saved to Data center', 'Sent to Revenue app', 'Opened in Revenue app', 'Withdrawn'], 'his trail')
  check((await page()).published.find(m => m.id === M2).recipients, 1, 'Publish counts one recipient now')

  await one(`SELECT public.hr_letter_withdraw($1)`, [L3])
  check(Number(await one(`SELECT count(*) FROM member_memos WHERE id = $1`, [M2])), 0, 'reaching nobody, the memo goes')
  check((await q(`SELECT memo_id FROM hr_person_letters WHERE id = ANY ($1) ORDER BY ref`, [[L2, L3]])).map(r => r.memo_id), [null, null],
    'both letters let go of it')
  check(await one(`SELECT public.hr_documentation_leftovers()`), [rulesFile], 'and its attachment is a leftover')
  await asGrace('authenticated')
  check(await removeAs(rulesFile), 1, 'deleted')
  await asGrace()
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[rulesFile]]), 2, '"File deleted" on both trails')

  // ── A type whose letters were all withdrawn may go ───────────────────────
  const E2E = await one(`SELECT public.hr_letter_type_add('E2E type')`)
  const typedFile = `letters/${CHEA}/${id(103)}/Typed.pdf`
  await put(typedFile)
  const L4 = await one(`SELECT public.hr_letter_file($1, $2, $3, 'Typed.pdf', 'application/pdf', 1)`, [CHEA, E2E, typedFile])
  await reject(`SELECT public.hr_letter_type_delete($1)`, [E2E], /has letters on file/, 'a type with a letter on file stays')
  await one(`SELECT public.hr_letter_withdraw($1)`, [L4])
  await one(`SELECT public.hr_letter_type_delete($1)`, [E2E])
  check(await one(`SELECT deleted_at IS NOT NULL FROM hr_letter_types WHERE id = $1`, [E2E]), true, 'its letters all withdrawn, it may be deleted')

  // ── Documents ─────────────────────────────────────────────────────────────
  const docFile = `documents/${id(104)}/Price_list.pdf`
  await put(docFile)
  const D1 = await one(`SELECT public.hr_document_add('Price list', $1, 'Price_list.pdf', 'application/pdf', 10, $2)`, [docFile, [REV]])
  await asGrace('authenticated')
  check(await removeAs(docFile), 0, 'the bucket keeps a live document’s file')
  await asGrace()
  check((await one(`SELECT public.hr_documentation_leftovers()`)).includes(docFile), false, 'a live document is no leftover')
  await one(`SELECT public.hr_document_delete($1)`, [D1])
  await reject(`SELECT public.hr_documentation_file('document', $1)`, [D1], /deleted/, 'no link to a deleted document')
  check((await one(`SELECT public.hr_documentation_leftovers()`)).includes(docFile), true, 'deleted, its file is a leftover')
  await asGrace('authenticated')
  check(await removeAs(docFile), 1, 'and Edit deletes it')
  await asGrace()
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[docFile]]), 1, '"File deleted" on the document’s trail')
  check((await page()).documents.find(d => d.id === D1).events.map(e => e.what), ['Uploaded', 'Deleted', 'File deleted'], 'the document’s trail')

  // ── An upload nobody saved ────────────────────────────────────────────────
  const old = `documents/${id(105)}/Abandoned.pdf`
  const fresh = `publish/${id(106)}/Uploading.pdf`
  await put(old, '2 days')
  await put(fresh)
  const left = await one(`SELECT public.hr_documentation_leftovers()`)
  check([left.includes(old), left.includes(fresh)], [true, false], 'a day-old unsaved upload is a leftover; one going up now is not')
  await asGrace('authenticated')
  check(await removeAs(fresh), 1, 'an unsaved upload is nobody’s, so Edit may delete it')
  await as(VIEWER_USER, ['documentation.view', 'documentation.create'], 'authenticated')
  check(await removeAs(old), 0, 'without Edit the bucket deletes nothing')
  await db.exec('RESET ROLE')

  // ── 20261011190000: the Revenue app's Profile · Documentation box binds in the database (review L6) ──
  await db.exec(`CREATE OR REPLACE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT s.id FROM hr_staff_costs s WHERE s.user_id = auth.uid() LIMIT 1 $$`)
  await db.exec(`CREATE OR REPLACE FUNCTION public.current_tabs() RETURNS jsonb LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.tabs', true), '')::jsonb $$`)
  const roomsTicks = (await readFile(new URL('20261011150000_rooms_on_behalf_and_app_ticks.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(roomsTicks.match(/CREATE OR REPLACE FUNCTION public\.tab_box_closed[\s\S]*?\$fn\$;/)[0])
  const DOC_TICKS = (await readFile(new URL('20261011190000_documentation_app_ticks.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  await db.exec(DOC_TICKS)
  const docBodies = () => q(`SELECT proname, md5(prosrc) AS h FROM pg_proc WHERE proname IN ('member_documents', 'member_document_open', 'hr_file_readable_by_member') ORDER BY proname`)
  const docSwapped = await docBodies()
  await db.exec(DOC_TICKS)
  check(await docBodies(), docSwapped, 'run twice, each statement is swapped once')
  const tabs = v => q(`SELECT set_config('test.tabs', $1, false)`, [v === null ? '' : JSON.stringify(v)])

  await asGrace()
  const shared = `documents/${id(107)}/Handbook.pdf`
  await put(shared)
  const D2 = await one(`SELECT public.hr_document_add('Handbook', $1, 'Handbook.pdf', 'application/pdf', 10, $2)`, [shared, [REV]])
  await tabs(null)
  await as(KJ_USER, [], 'authenticated')
  check((await one(`SELECT public.member_documents()`)).map(d => d.name), ['Handbook'], 'nothing closed: Kar Jun lists his department’s documents')
  await db.exec('RESET ROLE')
  check(await readable(KJ_USER, shared), true, 'and opens the file')
  await tabs({ ticks: ['rev.today.view'], boxes: [], cells: false })
  await as(KJ_USER, [], 'authenticated')
  await reject(`SELECT public.member_documents()`, [], /Documentation is not open to your account/, 'Documentation’s View left out: no list')
  await reject(`SELECT public.member_document_open($1)`, [D2], /Documentation is not open to your account/, 'no open')
  await db.exec('RESET ROLE')
  check(await readable(KJ_USER, shared), false, 'and no file of a department’s document')
  await tabs({ ticks: null, boxes: [{ tab: 'rev.documentation', action: 'view', granted: false }], cells: false })
  check(await readable(KJ_USER, shared), false, 'the same when only his own box holds it back')
  await tabs({ ticks: ['rev.documentation.view'], boxes: [], cells: false })
  await as(KJ_USER, [], 'authenticated')
  check(((await one(`SELECT public.member_document_open($1)`, [D2])) ?? {}).fileName, 'Handbook.pdf', 'ticked: it opens again')
  await db.exec('RESET ROLE')
  await tabs(null)

  console.log(`validate-documentation: ${checks} checks passed`)
} finally {
  await db.close()
}
