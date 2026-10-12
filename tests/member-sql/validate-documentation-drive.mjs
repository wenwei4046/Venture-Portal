// Local PostgreSQL regression for 20261012220000 (2026-10-12, People › Documentation › the Data center as a Drive):
// the folders HR makes — in the Data center, in HOUZS Venture, in a department, in another folder, never in a
// person — and the files HR keeps in them. Documentation's migrations (20261011070000, 070100, 170000, 200000),
// Hiring's (their tables are in the review hardening's grants) and the review hardening (20261011120100) run
// VERBATIM over stand-ins for what they read, the storage schema and the permission check; then the migration under
// test. What is under test: View reads, Create makes a folder or files a file, Edit renames and deletes — and nobody
// else; a name is one per place, HOUZS Venture's departments and a department's people included; only an empty
// folder goes; a file must be in the bucket under `drive/`, its trail says Uploaded / Viewed / Deleted / File
// deleted; the bucket takes uploads under `drive/` from Create only and lets Edit delete a file only once no live
// record holds it; a deleted file's object is a leftover at once. No live I/O.
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
const MAKER_USER = id(2) // Documentation · View and Create only
const READER_USER = id(3) // Documentation · View only
const NOBODY_USER = id(4) // no Documentation at all
const GRACE = id(11)
const KARJUN = id(12)
const HR = id(21)
const REV = id(22)
const EMPTY_DEPT = id(23)

async function as(user, actions, role = null) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  if (role) await db.exec(`SET ROLE ${role}`)
}
const EDIT = ['documentation.view', 'documentation.create', 'documentation.edit']
const asGrace = (role = null) => as(GRACE_USER, EDIT, role)
const asMaker = (role = null) => as(MAKER_USER, ['documentation.view', 'documentation.create'], role)

const put = (name, age = '0 seconds') =>
  q(`INSERT INTO storage.objects(bucket_id, name, created_at) VALUES ('hr-documents', $1, now() - $2::interval)`, [name, age])
const inBucket = async name => Number(await one(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'hr-documents' AND name = $1`, [name])) === 1
/** The Storage API's upload and delete, under the caller's own session: the bucket's policies decide. */
const uploadAs = async name => {
  try {
    await q(`INSERT INTO storage.objects(bucket_id, name) VALUES ('hr-documents', $1)`, [name])
    return true
  } catch {
    return false
  }
}
const removeAs = async name => (await db.query(`DELETE FROM storage.objects WHERE bucket_id = 'hr-documents' AND name = $1`, [name])).affectedRows
const drive = async () => {
  await asGrace()
  return one(`SELECT public.hr_drive()`)
}
const trail = async fid => (await q(`SELECT what FROM public.hr_drive_file_events WHERE file_id = $1 ORDER BY created_at, id`, [fid])).map(e => e.what)

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

    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$ SELECT p_table $$;

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
  await q(`INSERT INTO users(id, name, email) VALUES ($1, 'HR', 'hr@x'), ($2, 'Maker', 'm@x'), ($3, 'Reader', 'r@x'), ($4, 'Nobody', 'n@x')`,
    [GRACE_USER, MAKER_USER, READER_USER, NOBODY_USER])
  await q(`INSERT INTO departments VALUES ($1, 'HR'), ($2, 'Revenue Department'), ($3, 'Venture Office')`, [HR, REV, EMPTY_DEPT])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, status, user_id, designation) VALUES
    ($1, 'Grace Lim', $3, 'active', $4, 'HR Manager'), ($2, 'Kar Jun', $5, 'active', NULL, 'Team Assistant')`,
    [GRACE, KARJUN, HR, GRACE_USER, REV])

  for (const f of [
    '20261011070000_documentation.sql', '20261011070100_documentation_published_letter_type.sql',
    '20261011080000_hiring.sql', '20261011080100_hiring_file_reads.sql', '20261011080200_hiring_reconsider_declined.sql',
    '20261011120100_round2_review_hardening.sql', '20261011170000_documentation_withdraw_and_delete_files.sql',
    '20261011200000_documentation_memo_withdraw.sql', '20261012220000_documentation_drive.sql',
  ]) {
    await db.exec(await readFile(new URL(f, migrations), 'utf8'))
  }

  // ── Who may ───────────────────────────────────────────────────────────────
  const callable = ['hr_drive()', 'hr_drive_file(uuid)', 'hr_drive_log(uuid,text)', 'hr_drive_folder_add(text,text)',
    'hr_drive_folder_rename(uuid,text)', 'hr_drive_folder_delete(uuid)', 'hr_drive_file_add(text,text,text,text,bigint)',
    'hr_drive_file_delete(uuid)']
  for (const fn of callable) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a signed-in session may ask ${fn}`)
  }
  for (const fn of ['hr_drive_place(text)', 'hr_drive_name_taken(text,uuid,uuid,text,uuid)']) {
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the functions' own`)
  }
  for (const t of ['hr_drive_folders', 'hr_drive_files', 'hr_drive_file_events']) {
    check(await one(`SELECT has_table_privilege('authenticated', 'public.${t}', 'SELECT')`), false, `${t} is read only through the functions`)
    check(await one(`SELECT has_table_privilege('anon', 'public.${t}', 'SELECT')`), false, `${t} is nobody's to read straight`)
  }
  await as(NOBODY_USER, [])
  await reject(`SELECT public.hr_drive()`, [], /Documentation access is required/, 'reading the Data center needs View')
  await as(READER_USER, ['documentation.view'])
  check(await one(`SELECT public.hr_drive()`), { folders: [], files: [] }, 'View reads it: nothing made yet')
  await reject(`SELECT public.hr_drive_folder_add('root', 'Carres')`, [], /Documentation · Create/, 'making a folder needs Create')

  // ── Folders: in the Data center, in HOUZS Venture, in a department, in a folder ──────────────────────────────
  await asMaker()
  const CARRES = await one(`SELECT public.hr_drive_folder_add('root', '  Carres Sdn Bhd ')`)
  const CARRES_FIN = await one(`SELECT public.hr_drive_folder_add($1, 'Finance')`, [`folder:${CARRES}`])
  const POLICIES = await one(`SELECT public.hr_drive_folder_add('company:hv', 'Policies')`)
  const REV_OLD = await one(`SELECT public.hr_drive_folder_add($1, '2025 contracts')`, [`dept:${REV}`])
  let d = await drive()
  check(d.folders.map(f => [f.name, f.parent]).sort(), [
    ['2025 contracts', `dept:${REV}`], ['Carres Sdn Bhd', 'root'], ['Finance', `folder:${CARRES}`], ['Policies', 'company:hv'],
  ].sort(), 'each folder says where it is, its name trimmed')
  check(d.folders.find(f => f.id === CARRES).createdBy, 'Maker', 'and who made it')

  // One name per place — what is there by itself included.
  await reject(`SELECT public.hr_drive_folder_add('root', 'carres sdn bhd')`, [], /is here already/, 'a name once in a place, any case')
  await reject(`SELECT public.hr_drive_folder_add('root', 'HOUZS Venture')`, [], /is here already/, 'HOUZS Venture is the Data center’s own')
  await reject(`SELECT public.hr_drive_folder_add('company:hv', 'Revenue')`, [], /is here already/, 'a department with people is there by itself')
  check(typeof (await one(`SELECT public.hr_drive_folder_add('company:hv', 'Venture Office')`)), 'string',
    'a department nobody works in shows no folder, so its name is free')
  await reject(`SELECT public.hr_drive_folder_add($1, 'Kar Jun')`, [`dept:${REV}`], /is here already/, 'a person is in their department by themselves')
  check(typeof (await one(`SELECT public.hr_drive_folder_add($1, 'Finance')`, [`folder:${POLICIES}`])), 'string', 'the same name in another place is fine')
  await reject(`SELECT public.hr_drive_folder_add('root', '   ')`, [], /Name the folder/, 'a folder has a name')
  await reject(`SELECT public.hr_drive_folder_add('root', 'a/b')`, [], /slash/, 'no slash in a name')
  await reject(`SELECT public.hr_drive_folder_add($1, 'Notes')`, [`person:${KARJUN}`], /upload a letter there/, 'never in a person — their folder is their record')
  await reject(`SELECT public.hr_drive_folder_add($1, 'Notes')`, [`folder:${id(999)}`], /not there any more/, 'nor in a folder that is not there')
  await reject(`SELECT public.hr_drive_folder_add($1, 'Notes')`, [`dept:${id(998)}`], /department is not there/, 'nor in a department that is not there')
  await reject(`SELECT public.hr_drive_folder_add('elsewhere', 'Notes')`, [], /not there any more/, 'nor anywhere else')

  // Rename and delete are Edit's.
  await asMaker()
  await reject(`SELECT public.hr_drive_folder_rename($1, 'Carres')`, [CARRES], /Documentation · Edit/, 'renaming needs Edit')
  await reject(`SELECT public.hr_drive_folder_delete($1)`, [CARRES_FIN], /Documentation · Edit/, 'deleting needs Edit')
  await asGrace()
  await one(`SELECT public.hr_drive_folder_rename($1, 'Carres')`, [CARRES])
  check((await drive()).folders.find(f => f.id === CARRES).name, 'Carres', 'renamed')
  await one(`SELECT public.hr_drive_folder_rename($1, 'carres')`, [CARRES])
  check((await drive()).folders.find(f => f.id === CARRES).name, 'carres', 'its own name in another case is no clash')
  await one(`SELECT public.hr_drive_folder_add('root', 'Dream Crafter')`)
  await reject(`SELECT public.hr_drive_folder_rename($1, 'Dream crafter')`, [CARRES], /is here already/, 'nor renamed onto a neighbour')
  await reject(`SELECT public.hr_drive_folder_rename($1, 'HOUZS Venture')`, [CARRES], /is here already/, 'nor onto what is there by itself')
  check(typeof (await one(`SELECT public.hr_drive_folder_rename($1, 'Policies')`, [CARRES])), 'string',
    'a name used elsewhere is free here')
  await one(`SELECT public.hr_drive_folder_rename($1, 'Carres')`, [CARRES])
  await reject(`SELECT public.hr_drive_folder_delete($1)`, [CARRES], /Empty it first/, 'a folder with a folder in it stays')

  // ── Files ───────────────────────────────────────────────────────────────────────────────────────────────────
  const finFile = `drive/${id(301)}/Carres_SOP.pdf`
  await asMaker()
  await reject(`SELECT public.hr_drive_file_add($1, $2, 'Carres_SOP.pdf', 'application/pdf', 100)`, [`folder:${CARRES_FIN}`, finFile],
    /did not arrive/, 'a file must be in the bucket first')
  // The bucket takes it from Create, under drive/ only.
  await asMaker('authenticated')
  check(await uploadAs(finFile), true, 'Create uploads under drive/')
  check(await uploadAs(`elsewhere/${id(302)}/x.pdf`), false, 'and nowhere else')
  await as(READER_USER, ['documentation.view'], 'authenticated')
  check(await uploadAs(`drive/${id(303)}/x.pdf`), false, 'View alone uploads nothing')
  await asMaker()
  await reject(`SELECT public.hr_drive_file_add($1, $2, 'x.pdf', 'application/pdf', 1)`, [`person:${KARJUN}`, finFile],
    /upload a letter there/, 'a person’s folder takes letters, not files')
  const F1 = await one(`SELECT public.hr_drive_file_add($1, $2, 'Carres_SOP.pdf', 'application/pdf', 100)`, [`folder:${CARRES_FIN}`, finFile])
  await reject(`SELECT public.hr_drive_file_add($1, $2, 'again.pdf', 'application/pdf', 100)`, [`folder:${CARRES_FIN}`, finFile],
    /filed already/, 'one object is one file')
  d = await drive()
  const f1 = d.files.find(f => f.id === F1)
  check([f1.fileName, f1.parent, f1.uploadedBy, f1.deletedAt, f1.ref.startsWith('F-')], ['Carres_SOP.pdf', `folder:${CARRES_FIN}`, 'Maker', null, true],
    'the file says where it is and who put it there')
  check((await q(`SELECT note FROM hr_drive_file_events WHERE file_id = $1`, [F1]))[0].note, 'Into Finance', 'its trail says where it went')

  // A file at HOUZS Venture's own level, and one in a department.
  const hvFile = `drive/${id(304)}/Handbook.docx`
  const revFile = `drive/${id(305)}/Rates.xlsx`
  await put(hvFile)
  await put(revFile)
  await one(`SELECT public.hr_drive_file_add('company:hv', $1, 'Handbook.docx', NULL, 5)`, [hvFile])
  await one(`SELECT public.hr_drive_file_add($1, $2, 'Rates.xlsx', NULL, 5)`, [`dept:${REV}`, revFile])
  check((await q(`SELECT note FROM hr_drive_file_events WHERE what = 'Uploaded' ORDER BY created_at, id`)).map(e => e.note),
    ['Into Finance', 'Into HOUZS Venture', 'Into Revenue'], 'a department is named as the Data center names it')

  // Opened: a path to sign, and a line on its trail — View's.
  await as(READER_USER, ['documentation.view'])
  check((await one(`SELECT public.hr_drive_file($1)`, [F1])).path, finFile, 'View gets the path to sign a link to')
  await one(`SELECT public.hr_drive_log($1, 'Viewed')`, [F1])
  await reject(`SELECT public.hr_drive_log($1, 'Deleted')`, [F1], /Only a view or a download/, 'only a view or a download is logged')
  check(await trail(F1), ['Uploaded', 'Viewed'], 'the trail')

  // A live file's object is nobody's to delete.
  await asGrace('authenticated')
  check(await one(`SELECT public.hr_doc_file_unused($1)`, [finFile]), false, 'a live Data center file holds its object')
  check(await removeAs(finFile), 0, 'so the bucket keeps it')
  await asGrace()
  check(await one(`SELECT public.hr_documentation_leftovers()`), [], 'and it is no leftover')

  // Deleted: Edit's; the row and trail stay, the object is a leftover at once, then "File deleted" once.
  await asMaker()
  await reject(`SELECT public.hr_drive_file_delete($1)`, [F1], /Documentation · Edit/, 'deleting a file needs Edit')
  await asGrace()
  await reject(`SELECT public.hr_drive_folder_delete($1)`, [CARRES_FIN], /Empty it first/, 'a folder with a file in it stays')
  await one(`SELECT public.hr_drive_file_delete($1)`, [F1])
  await reject(`SELECT public.hr_drive_file_delete($1)`, [F1], /already deleted/, 'deleted once')
  await reject(`SELECT public.hr_drive_file($1)`, [F1], /deleted with it/, 'no link is signed to a deleted file')
  check(typeof (await drive()).files.find(f => f.id === F1).deletedAt, 'string', 'it stays on the read, deleted')
  check(await one(`SELECT public.hr_documentation_leftovers()`), [finFile], 'its object is a leftover at once')
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[finFile]]), 0, 'nothing is written while the object is still there')
  await asGrace('authenticated')
  check(await removeAs(finFile), 1, 'Edit deletes it through the bucket')
  await asGrace()
  check(await inBucket(finFile), false, 'gone')
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[finFile]]), 1, '"File deleted" on its trail')
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[finFile]]), 0, 'once')
  check(await trail(F1), ['Uploaded', 'Viewed', 'Deleted', 'File deleted'], 'the whole trail')

  // An upload nobody filed under drive/ is a leftover after a day, as before.
  const stray = `drive/${id(306)}/stray.pdf`
  await put(stray, '2 days')
  check((await one(`SELECT public.hr_documentation_leftovers()`)).includes(stray), true, 'a day-old upload nobody saved')

  // Only an empty folder goes; then it leaves the read, and nothing more goes in it.
  await one(`SELECT public.hr_drive_folder_delete($1)`, [CARRES_FIN])
  check((await drive()).folders.some(f => f.id === CARRES_FIN), false, 'an emptied folder is deleted, and leaves the read')
  await reject(`SELECT public.hr_drive_folder_add($1, 'Again')`, [`folder:${CARRES_FIN}`], /not there any more/, 'a deleted folder takes nothing')
  await reject(`SELECT public.hr_drive_folder_delete($1)`, [CARRES_FIN], /not there any more/, 'deleted once')
  check(typeof (await one(`SELECT public.hr_drive_folder_add($1, 'Finance')`, [`folder:${CARRES}`])), 'string', 'its name is free again')

  // ── The three swapped bodies hold the new statement once ──────────────────────────────────────────────────
  for (const [fn, needle] of [['hr_doc_file_unused', 'hr_drive_files f WHERE f.file_path = p_name'], ['hr_documentation_leftovers', "'publish', 'drive')"],
    ['hr_documentation_files_removed', 'INSERT INTO public.hr_drive_file_events']]) {
    const src = await one(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn])
    check(src.split(needle).length - 1, 1, `${fn} asks the Data center's files once`)
  }

  console.log(`validate-documentation-drive: ${checks} checks passed`)
} finally {
  await db.close()
}
