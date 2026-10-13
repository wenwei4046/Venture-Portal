// Local PostgreSQL regression for 20261013183000 (2026-10-13, People › Documentation › the Data center's Bin and
// Move to… — the user, once the Talent Bank had both: "Data center 也加 Bin 和 Move to…"). Documentation's migrations,
// Hiring's (their tables are in the review hardening's grants), the review hardening and the Drive (20261012220000)
// run VERBATIM over stand-ins for what they read, the storage schema and the permission check — as
// validate-documentation-drive.mjs does — then folders deleted before the Bin are seeded, then the migration under
// test. What is under test: what was deleted in the last 30 days is in the Bin, nothing older; a file moved to the Bin
// is not deleted (its object held, never a leftover, never opened) and leaves the page's files for its Bin; a folder
// goes only empty, what is in the Bin not counting; Restore puts a file back — the folders above it with it, the top
// of the Data center when its folder is gone for good — refuses a name now taken and anything past 30 days; Delete
// forever and Empty bin delete as a Data center file always was ("Show deleted", a leftover at once, "File deleted");
// the hourly purge drops only what is past 30 days, answers the objects nobody holds, and "File deleted" is written
// once the bucket no longer has them; a folder moves with everything in it, never into itself, a person, a name the
// place has or a folder in the Bin; who may call what. No live I/O.
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
/** The hourly sweep: no JWT, the service role. */
const asCron = () => as(null, [], 'service_role')

const put = (name, age = '0 seconds') =>
  q(`INSERT INTO storage.objects(bucket_id, name, created_at) VALUES ('hr-documents', $1, now() - $2::interval)`, [name, age])
const inBucket = async name => Number(await one(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'hr-documents' AND name = $1`, [name])) === 1
const removeAs = async name => (await db.query(`DELETE FROM storage.objects WHERE bucket_id = 'hr-documents' AND name = $1`, [name])).affectedRows
const drive = async () => {
  await asGrace()
  return one(`SELECT public.hr_drive()`)
}
const trail = async fid => (await q(`SELECT what FROM public.hr_drive_file_events WHERE file_id = $1 ORDER BY created_at, id`, [fid])).map(e => e.what)
const lastEvent = async fid =>
  (await q(`SELECT what, actor_name, note FROM public.hr_drive_file_events WHERE file_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [fid]))[0]
const binOf = async ({ file, folder }) =>
  (await q(`SELECT * FROM public.hr_drive_bin WHERE ${file ? 'file_id' : 'folder_id'} = $1`, [file ?? folder]))[0] ?? null
const fileRow = async fid => (await q(`SELECT * FROM public.hr_drive_files WHERE id = $1`, [fid]))[0]
const folderRow = async fid => (await q(`SELECT * FROM public.hr_drive_folders WHERE id = $1`, [fid]))[0] ?? null

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
    await load(f)
  }

  // ── Deleted before the Bin ─────────────────────────────────────────────────────────────────────────────────
  // Folders HR deleted 3, 5, 2 and 40 days ago (by Grace — a staff record —, by Maker — a login only —, by nobody known);
  // a file deleted 3 days ago (its object went then); a live file left in the 40-day folder (no rule makes one now —
  // it stands for a file whose folder is gone for good).
  const OLD3 = id(401)
  const OLD5 = id(402)
  const OLD2 = id(403)
  const OLD40 = id(404)
  await q(`INSERT INTO hr_drive_folders (id, name, parent_kind, created_by_name, deleted_at, deleted_by) VALUES
    ($1, 'Old three', 'root', 'HR', now() - interval '3 days', $5),
    ($2, 'Old five', 'root', 'HR', now() - interval '5 days', $6),
    ($3, 'Old two', 'root', 'HR', now() - interval '2 days', NULL),
    ($4, 'Old forty', 'root', 'HR', now() - interval '40 days', $5)`, [OLD3, OLD5, OLD2, OLD40, GRACE_USER, MAKER_USER])
  const OLDFILE = id(405)
  await q(`INSERT INTO hr_drive_files (id, parent_kind, file_path, file_name, uploaded_by_name, deleted_at)
           VALUES ($1, 'root', $2, 'Old.pdf', 'HR', now() - interval '3 days')`, [OLDFILE, `drive/${id(406)}/Old.pdf`])
  const STRANDED = id(407)
  const strandedPath = `drive/${id(408)}/Stranded.pdf`
  await q(`INSERT INTO hr_drive_files (id, parent_kind, parent_folder_id, file_path, file_name, uploaded_by_name)
           VALUES ($1, 'folder', $2, $3, 'Stranded.pdf', 'HR')`, [STRANDED, OLD40, strandedPath])
  await put(strandedPath)

  await load('20261013183000_data_center_bin.sql')

  // ── The backfill: what was deleted in the last 30 days is in the Bin, nothing older, no file ──────────────────
  const backfilled = await q(`SELECT b.kind, b.folder_id, b.file_id, b.name, b.deleted_by_name, b.deleted_at = f.deleted_at AS kept
                                FROM hr_drive_bin b JOIN hr_drive_folders f ON f.id = b.folder_id ORDER BY b.deleted_at`)
  check(backfilled.map(r => [r.kind, r.folder_id, r.name, r.deleted_by_name, r.kept]), [
    ['folder', OLD5, 'Old five', 'Maker', true],
    ['folder', OLD3, 'Old three', 'Grace Lim', true],
    ['folder', OLD2, 'Old two', 'HR', true],
  ], 'the folders deleted in the last 30 days are in the Bin, each when and by whom (a staff name, else the login, else HR)')
  check(await binOf({ folder: OLD40 }), null, 'a folder deleted 40 days ago is not')
  check(await binOf({ file: OLDFILE }), null, 'a file deleted before the Bin is not (its object went then)')
  check(Number(await one(`SELECT count(*) FROM hr_drive_bin`)), 3, 'nothing else')

  // ── What HR makes (as the Drive's test does) ──────────────────────────────────────────────────────────────────
  await asMaker()
  const CARRES = await one(`SELECT public.hr_drive_folder_add('root', 'Carres')`)
  const SALES = await one(`SELECT public.hr_drive_folder_add($1, 'Sales')`, [`folder:${CARRES}`])
  const ALI = await one(`SELECT public.hr_drive_folder_add($1, 'Ali Tan')`, [`folder:${SALES}`])
  const POL = await one(`SELECT public.hr_drive_folder_add('company:hv', 'Policies')`)
  const fileIn = async (place, name, type = 'application/pdf', size = 100) => {
    const path = `drive/${crypto.randomUUID()}/${name}`
    await put(path)
    await asMaker()
    const fid = await one(`SELECT public.hr_drive_file_add($1, $2, $3, $4, $5)`, [place, path, name, type, size])
    return { id: fid, path }
  }
  const IC = await fileIn(`folder:${ALI}`, 'IC.pdf')
  const CV = await fileIn(`folder:${ALI}`, 'CV.pdf')
  const HB = await fileIn('company:hv', 'Handbook.docx', null, 5)
  const ROOTF = await fileIn('root', 'Root.pdf')
  const RATES = await fileIn(`dept:${REV}`, 'Rates.xlsx', null, 5)

  // ── A file's Move to Bin: not deleted — in the Bin ────────────────────────────────────────────────────────────
  await asMaker()
  await reject(`SELECT public.hr_drive_file_delete($1)`, [IC.id], /Documentation · Edit/, 'moving a file to the Bin needs Edit')
  await asGrace()
  await one(`SELECT public.hr_drive_file_delete($1)`, [IC.id])
  check((await fileRow(IC.id)).deleted_at, null, 'a file in the Bin is not deleted')
  const icBin = await binOf({ file: IC.id })
  check([icBin.kind, icBin.name, icBin.deleted_by_name, icBin.deleted_by], ['file', 'IC.pdf', 'Grace Lim', GRACE_USER], 'it is in the Bin: what, who')
  check(await trail(IC.id), ['Uploaded', 'Moved to Bin'], 'its trail says so')
  let d = await drive()
  check(d.files.some(f => f.id === IC.id), false, 'the page’s files leave it out — neither kept nor deleted')
  const icItem = d.bin.find(b => b.fileId === IC.id)
  check([icItem.id, icItem.kind, icItem.name, icItem.at, icItem.folderId, icItem.contentType, icItem.size, icItem.deletedBy],
    [icBin.id, 'file', 'IC.pdf', `folder:${ALI}`, null, 'application/pdf', 100, 'Grace Lim'], 'the Bin lists it, with where it was')
  check(icItem.ref.startsWith('F-'), true, 'and its ref')
  check(await one(`SELECT ($1::timestamptz - $2::timestamptz) = interval '30 days'`, [icItem.expiresAt, icItem.deletedAt]), true,
    'it goes for good 30 days after it went in')
  await asGrace('authenticated')
  check(await one(`SELECT public.hr_doc_file_unused($1)`, [IC.path]), false, 'its object is held while it is in the Bin')
  check(await removeAs(IC.path), 0, 'so the bucket keeps it from a session')
  await q(`RESET ROLE`)
  await q(`UPDATE storage.objects SET created_at = now() - interval '2 days' WHERE name = $1`, [IC.path])
  await asGrace()
  check((await one(`SELECT public.hr_documentation_leftovers()`)).includes(IC.path), false, 'never a leftover, even two days old')
  await reject(`SELECT public.hr_drive_file($1)`, [IC.id], /It is in the Bin — restore it to open it\./, 'no link is signed to it')
  await reject(`SELECT public.hr_drive_file_delete($1)`, [IC.id], /That file is already deleted\./, 'moved to the Bin once')

  // ── A folder's Move to Bin: only an empty one, what is in the Bin not counting ────────────────────────────────
  await reject(`SELECT public.hr_drive_folder_delete($1)`, [ALI], /Empty it first\./, 'a folder with a live file in it stays')
  await reject(`SELECT public.hr_drive_folder_delete($1)`, [CARRES], /Empty it first\./, 'a folder with a live folder in it stays')
  await one(`SELECT public.hr_drive_file_delete($1)`, [CV.id])
  await one(`SELECT public.hr_drive_folder_delete($1)`, [ALI])
  check((await folderRow(ALI)).deleted_at !== null, true, 'its files all in the Bin, the folder goes — deleted softly, as before')
  const aliBin = await binOf({ folder: ALI })
  check([aliBin.kind, aliBin.name, aliBin.deleted_by_name], ['folder', 'Ali Tan', 'Grace Lim'], 'and it is in the Bin')
  d = await drive()
  check(d.folders.some(f => f.id === ALI), false, 'the page’s folders leave it out')
  const aliItem = d.bin.find(b => b.folderId === ALI)
  check([aliItem.id, aliItem.kind, aliItem.name, aliItem.at, aliItem.fileId], [aliBin.id, 'folder', 'Ali Tan', `folder:${SALES}`, null],
    'the Bin lists it, with where it was')
  check(d.bin.map(b => b.name), ['Ali Tan', 'CV.pdf', 'IC.pdf', 'Old two', 'Old three', 'Old five'], 'newest first')

  // ── Restore ───────────────────────────────────────────────────────────────────────────────────────────────────
  await asMaker()
  await reject(`SELECT public.hr_drive_bin_restore($1)`, [icBin.id], /Documentation · Edit/, 'restoring needs Edit')
  await asGrace()
  // The file's folder is in the Bin too: it comes back with it.
  check(await one(`SELECT public.hr_drive_bin_restore($1)`, [icBin.id]), { kind: 'file', name: 'IC.pdf', label: 'Ali Tan' },
    'a file is restored, and says where it is now')
  check([await binOf({ file: IC.id }), (await fileRow(IC.id)).deleted_at], [null, null], 'out of the Bin, kept')
  check([(await folderRow(ALI)).deleted_at, await binOf({ folder: ALI })], [null, null], 'the folder it was in came back with it')
  check(await lastEvent(IC.id), { what: 'Restored', actor_name: 'Grace Lim', note: 'Into Ali Tan' }, 'its trail says where it went')
  check((await one(`SELECT public.hr_drive_file($1)`, [IC.id])).path, IC.path, 'and it opens again')
  check((await one(`SELECT public.hr_drive_bin_restore($1)`, [(await binOf({ file: CV.id })).id])).label, 'Ali Tan', 'the other file too')
  // Two folders up: a file in P2 in P1, all three in the Bin; the file brings both back.
  await asMaker()
  const P1 = await one(`SELECT public.hr_drive_folder_add('root', 'Chain one')`)
  const P2 = await one(`SELECT public.hr_drive_folder_add($1, 'Chain two')`, [`folder:${P1}`])
  const G = await fileIn(`folder:${P2}`, 'Deep.pdf')
  await asGrace()
  await one(`SELECT public.hr_drive_file_delete($1)`, [G.id])
  await one(`SELECT public.hr_drive_folder_delete($1)`, [P2])
  await one(`SELECT public.hr_drive_folder_delete($1)`, [P1])
  await one(`SELECT public.hr_drive_bin_restore($1)`, [(await binOf({ file: G.id })).id])
  check([(await folderRow(P1)).deleted_at, (await folderRow(P2)).deleted_at, await binOf({ folder: P1 }), await binOf({ folder: P2 })],
    [null, null, null, null], 'both folders above it came back with it')
  // A file whose folder is gone for good comes back to the top.
  await one(`SELECT public.hr_drive_file_delete($1)`, [STRANDED])
  check(await one(`SELECT public.hr_drive_bin_restore($1)`, [(await binOf({ file: STRANDED })).id]),
    { kind: 'file', name: 'Stranded.pdf', label: 'Data center' }, 'its folder gone before the Bin, it comes back to the top')
  check([(await fileRow(STRANDED)).parent_kind, (await fileRow(STRANDED)).parent_folder_id], ['root', null], 'kept at the top')
  // A folder restored where its name is taken now is refused.
  await one(`SELECT public.hr_drive_folder_delete($1)`, [POL])
  await asMaker()
  const POL2 = await one(`SELECT public.hr_drive_folder_add('company:hv', 'policies')`)
  await asGrace()
  const polBin = await binOf({ folder: POL })
  await reject(`SELECT public.hr_drive_bin_restore($1)`, [polBin.id], /policies is there already — rename one first\.|Policies is there already — rename one first\./,
    'a folder whose name is taken where it was is not restored')
  check([(await folderRow(POL)).deleted_at !== null, (await binOf({ folder: POL })) !== null], [true, true], 'it stays in the Bin')
  // A folder deleted before the Bin is restored from it.
  check(await one(`SELECT public.hr_drive_bin_restore($1)`, [(await binOf({ folder: OLD3 })).id]), { kind: 'folder', name: 'Old three', label: 'Data center' },
    'a folder the Bin took in when it came is restored')
  check((await folderRow(OLD3)).deleted_at, null, 'it is back')
  // Past 30 days: not listed, not restored.
  await one(`SELECT public.hr_drive_file_delete($1)`, [ROOTF.id])
  const rootBin = await binOf({ file: ROOTF.id })
  await q(`RESET ROLE`)
  await q(`UPDATE hr_drive_bin SET deleted_at = now() - interval '31 days' WHERE id = $1`, [rootBin.id])
  d = await drive()
  check(d.bin.some(b => b.id === rootBin.id), false, 'an item 31 days in the Bin is not listed')
  check(d.files.some(f => f.id === ROOTF.id), false, 'nor among the files')
  await reject(`SELECT public.hr_drive_bin_restore($1)`, [rootBin.id], /That is not in the Bin any more\./, 'nor restored')
  await reject(`SELECT public.hr_drive_bin_restore($1)`, [id(999)], /That is not in the Bin any more\./, 'an unknown one neither')

  // ── Delete forever: deleted as a Data center file always was ──────────────────────────────────────────────────
  await one(`SELECT public.hr_drive_file_delete($1)`, [HB.id])
  const hbBin = await binOf({ file: HB.id })
  await asMaker()
  await reject(`SELECT public.hr_drive_bin_delete($1)`, [hbBin.id], /Documentation · Edit/, 'deleting forever needs Edit')
  await asGrace()
  check(await one(`SELECT public.hr_drive_bin_delete($1)`, [hbBin.id]), { files: 1 }, 'deleted forever')
  const hb = await fileRow(HB.id)
  check([hb.deleted_at !== null, hb.deleted_by, await binOf({ file: HB.id })], [true, GRACE_USER, null], 'deleted, by the caller, out of the Bin')
  check(await lastEvent(HB.id), { what: 'Deleted', actor_name: 'Grace Lim', note: 'From the Bin' }, 'its trail says it went from the Bin')
  d = await drive()
  check(typeof d.files.find(f => f.id === HB.id)?.deletedAt, 'string', 'it shows under "Show deleted", as a deleted file always has')
  check(d.bin.some(b => b.fileId === HB.id), false, 'not in the Bin')
  check((await one(`SELECT public.hr_documentation_leftovers()`)).includes(HB.path), true, 'its object is a leftover at once')
  await asGrace('authenticated')
  check(await removeAs(HB.path), 1, 'Edit deletes it through the bucket')
  await asGrace()
  check(await one(`SELECT public.hr_documentation_files_removed($1)`, [[HB.path]]), 1, '"File deleted" on its trail')
  check(await trail(HB.id), ['Uploaded', 'Moved to Bin', 'Deleted', 'File deleted'], 'the whole trail')
  // A folder nothing names any more: its row goes.
  check(await one(`SELECT public.hr_drive_bin_delete($1)`, [polBin.id]), { files: 0 }, 'a folder deleted forever')
  check([await folderRow(POL), await binOf({ folder: POL })], [null, null], 'its row is gone — nothing named it')
  check((await folderRow(POL2)).deleted_at, null, 'the folder that took its name is untouched')
  // A folder a deleted file still names: its row stays, deleted, out of the Bin.
  await asMaker()
  const KEEP = await one(`SELECT public.hr_drive_folder_add('root', 'Keep')`)
  const KF = await fileIn(`folder:${KEEP}`, 'Kept.pdf')
  await asGrace()
  await one(`SELECT public.hr_drive_file_delete($1)`, [KF.id])
  await one(`SELECT public.hr_drive_bin_delete($1)`, [(await binOf({ file: KF.id })).id])
  await one(`SELECT public.hr_drive_folder_delete($1)`, [KEEP])
  await one(`SELECT public.hr_drive_bin_delete($1)`, [(await binOf({ folder: KEEP })).id])
  const keep = await folderRow(KEEP)
  check([keep !== null, keep?.deleted_at !== null, await binOf({ folder: KEEP })], [true, true, null],
    'a folder a deleted file still names keeps its row, deleted, out of the Bin')
  check((await drive()).bin.some(b => b.folderId === KEEP), false, 'and is not listed')
  await reject(`SELECT public.hr_drive_bin_delete($1)`, [id(999)], /That is not in the Bin any more\./, 'an unknown one is refused')
  await reject(`SELECT public.hr_drive_bin_delete($1)`, [hbBin.id], /That is not in the Bin any more\./, 'deleted forever once')

  // ── The hourly purge: only what is past 30 days ───────────────────────────────────────────────────────────────
  // Past 30 days by now: Root.pdf (31 days), Old five (set back to 35). A path a live record still holds: Rates.xlsx,
  // put in the Bin, set back 31 days, and named by a live memo's attachment.
  await one(`SELECT public.hr_drive_file_delete($1)`, [RATES.id])
  await q(`RESET ROLE`)
  await q(`UPDATE hr_drive_bin SET deleted_at = now() - interval '35 days' WHERE folder_id = $1`, [OLD5])
  await q(`UPDATE hr_drive_bin SET deleted_at = now() - interval '31 days' WHERE file_id = $1`, [RATES.id])
  await q(`INSERT INTO member_memos (title, body, attachment_path) VALUES ('A memo', 'Its file', $1)`, [RATES.path])
  const stillIn = (await q(`SELECT name FROM hr_drive_bin ORDER BY name`)).map(r => r.name)
  check(stillIn, ['Old five', 'Old two', 'Rates.xlsx', 'Root.pdf'], 'the Bin before the sweep')
  await asCron()
  const purged = await one(`SELECT public.hr_drive_bin_purge()`)
  check([purged.count, purged.paths], [3, [ROOTF.path]],
    'the sweep drops what is past 30 days and answers the objects nobody holds — not one a live memo still holds')
  await q(`RESET ROLE`)
  check((await q(`SELECT name FROM hr_drive_bin ORDER BY name`)).map(r => r.name), ['Old two'], 'what is not past 30 days stays')
  const rootf = await fileRow(ROOTF.id)
  check([rootf.deleted_at !== null, rootf.deleted_by], [true, null], 'Root.pdf is deleted — by nobody')
  check(await lastEvent(ROOTF.id), { what: 'Deleted', actor_name: 'Data center', note: '30 days in the Bin' }, 'by the Data center, after 30 days')
  check((await fileRow(RATES.id)).deleted_at !== null, true, 'Rates.xlsx is deleted too (its object kept for the memo)')
  check(await folderRow(OLD5), null, 'Old five’s row is gone — nothing named it')
  // The Storage API removes the object; then "File deleted", once — never while the object is still there.
  await asCron()
  check(await one(`SELECT public.hr_drive_bin_files_gone($1)`, [[ROOTF.path]]), 0, 'nothing is written while the object is still there')
  await q(`RESET ROLE`)
  await q(`DELETE FROM storage.objects WHERE bucket_id = 'hr-documents' AND name = $1`, [ROOTF.path])
  await asCron()
  check(await one(`SELECT public.hr_drive_bin_files_gone($1)`, [[ROOTF.path]]), 1, '"File deleted" once the bucket no longer has it')
  check(await one(`SELECT public.hr_drive_bin_files_gone($1)`, [[ROOTF.path]]), 0, 'once')
  check(await one(`SELECT public.hr_drive_bin_files_gone($1)`, [[KF.path]]), 0, 'a deleted file whose object is still there: nothing')
  await q(`RESET ROLE`)
  check(await lastEvent(ROOTF.id), { what: 'File deleted', actor_name: 'Data center', note: 'Root.pdf' }, 'by the Data center')
  check(await inBucket(KF.path), true, '(its object is still in the bucket)')
  check(await one(`SELECT public.hr_drive_bin_purge()`), { count: 0, paths: [] }, 'a second sweep finds nothing')

  // ── Empty bin ─────────────────────────────────────────────────────────────────────────────────────────────────
  const E1 = await fileIn('root', 'Empty one.pdf')
  await asGrace()
  await one(`SELECT public.hr_drive_file_delete($1)`, [E1.id])
  await asMaker()
  await reject(`SELECT public.hr_drive_bin_empty()`, [], /Documentation · Edit/, 'emptying the Bin needs Edit')
  await asGrace()
  check(await one(`SELECT public.hr_drive_bin_empty()`), { count: 2 }, 'Empty bin answers how many went')
  check(Number(await one(`SELECT count(*) FROM hr_drive_bin`)), 0, 'nothing is left in the Bin')
  check([(await fileRow(E1.id)).deleted_at !== null, (await lastEvent(E1.id)).note], [true, 'From the Bin'], 'a file in it is deleted as Delete forever does')
  check(await folderRow(OLD2), null, 'a folder in it goes')
  check((await one(`SELECT public.hr_documentation_leftovers()`)).includes(E1.path), true, 'its object is a leftover at once')

  // ── Move to… ──────────────────────────────────────────────────────────────────────────────────────────────────
  await asMaker()
  const MA = await one(`SELECT public.hr_drive_folder_add('root', 'Move A')`)
  const MB = await one(`SELECT public.hr_drive_folder_add($1, 'Move B')`, [`folder:${MA}`])
  const FM = await fileIn(`folder:${MB}`, 'Moved.pdf')
  await asMaker()
  const TARGET = await one(`SELECT public.hr_drive_folder_add('root', 'Target')`)
  await reject(`SELECT public.hr_drive_folder_move($1, $2)`, [MA, `folder:${TARGET}`], /Documentation · Edit/, 'moving a folder needs Edit')
  await asGrace()
  const where = async fid => {
    const f = await folderRow(fid)
    return [f.parent_kind, f.parent_dept_id, f.parent_folder_id]
  }
  await one(`SELECT public.hr_drive_folder_move($1, $2)`, [MA, `folder:${TARGET}`])
  check(await where(MA), ['folder', null, TARGET], 'into another folder')
  check([await where(MB), (await fileRow(FM.id)).parent_folder_id], [['folder', null, MA], MB], 'with everything in it')
  await one(`SELECT public.hr_drive_folder_move($1, 'company:hv')`, [MA])
  check(await where(MA), ['company', null, null], 'into HOUZS Venture')
  await one(`SELECT public.hr_drive_folder_move($1, $2)`, [MA, `dept:${REV}`])
  check(await where(MA), ['dept', REV, null], 'into a department')
  await one(`SELECT public.hr_drive_folder_move($1, 'root')`, [MA])
  check(await where(MA), ['root', null, null], 'to the top of the Data center')
  await one(`SELECT public.hr_drive_folder_move($1, 'root')`, [MA])
  check(await where(MA), ['root', null, null], 'the place it is in already: nothing happens')
  await reject(`SELECT public.hr_drive_folder_move($1, $2)`, [MA, `folder:${MA}`], /A folder cannot go inside itself\./, 'never into itself')
  await reject(`SELECT public.hr_drive_folder_move($1, $2)`, [MA, `folder:${MB}`], /A folder cannot go inside itself\./, 'nor into a folder inside it')
  await reject(`SELECT public.hr_drive_folder_move($1, $2)`, [MA, `person:${KARJUN}`], /upload a letter there/, 'never into a person')
  await asMaker()
  await one(`SELECT public.hr_drive_folder_add('company:hv', 'Move A')`)
  await asGrace()
  await reject(`SELECT public.hr_drive_folder_move($1, 'company:hv')`, [MA], /Move A is there already — rename one first\./, 'not onto a name the place has')
  await asMaker()
  const NAMED = await one(`SELECT public.hr_drive_folder_add('root', 'Revenue')`)
  await asGrace()
  await reject(`SELECT public.hr_drive_folder_move($1, 'company:hv')`, [NAMED], /Revenue is there already — rename one first\./,
    'nor onto what is there by itself (a department with people)')
  await one(`SELECT public.hr_drive_folder_delete($1)`, [TARGET])
  await reject(`SELECT public.hr_drive_folder_move($1, $2)`, [MA, `folder:${TARGET}`], /That folder is not there any more\./, 'nor into a folder in the Bin')
  await reject(`SELECT public.hr_drive_folder_move($1, 'root')`, [TARGET], /That folder is not there any more\./, 'a folder in the Bin is not moved')
  check(await where(MA), ['root', null, null], 'every refusal left it where it was')

  // ── Who may ───────────────────────────────────────────────────────────────────────────────────────────────────
  for (const fn of ['hr_drive_bin_restore(uuid)', 'hr_drive_bin_delete(uuid)', 'hr_drive_bin_empty()', 'hr_drive_folder_move(uuid,text)']) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a signed-in session may ask ${fn}`)
  }
  for (const fn of ['hr_drive_bin_purge(integer)', 'hr_drive_bin_files_gone(text[])', 'hr_drive_bin_drop(uuid,boolean)', 'hr_drive_bin_reopen(uuid)',
    'hr_drive_bin_keeps()']) {
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is not a session's`)
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `${fn} is not the publishable key's`)
    check(await one(`SELECT has_function_privilege('service_role', 'public.${fn}', 'EXECUTE')`), true, `${fn} is the service role's`)
  }
  check(await one(`SELECT has_table_privilege('authenticated', 'public.hr_drive_bin', 'SELECT')`), false, 'the Bin is read only through hr_drive()')
  check(await one(`SELECT has_table_privilege('anon', 'public.hr_drive_bin', 'SELECT')`), false, 'nobody reads it straight')
  // Without Documentation at all: View is needed to read the Bin with the rest.
  await as(NOBODY_USER, [])
  await reject(`SELECT public.hr_drive()`, [], /Documentation access is required/, 'reading the Data center (and its Bin) needs View')
  for (const [sql, params] of [[`SELECT public.hr_drive_bin_restore($1)`, [id(999)]], [`SELECT public.hr_drive_bin_delete($1)`, [id(999)]],
    [`SELECT public.hr_drive_bin_empty()`, []], [`SELECT public.hr_drive_folder_move($1, 'root')`, [MA]]]) {
    await assert.rejects(() => q(sql, params), err => err.code === '42501', `${sql} refuses without Edit (42501)`)
    checks++
  }

  // ── The swapped bodies hold their new text once ───────────────────────────────────────────────────────────────
  for (const [fn, needle] of [
    ['hr_drive', 'hr_drive_bin bx WHERE bx.file_id = x.id'],
    ['hr_drive', "'bin', (SELECT"],
    ['hr_drive_file', 'It is in the Bin — restore it to open it.'],
    ['hr_drive_file_delete', "'Moved to Bin'"],
    ['hr_drive_folder_delete', 'hr_drive_bin b WHERE b.file_id = x.id'],
    ['hr_drive_folder_delete', 'INSERT INTO public.hr_drive_bin (kind, folder_id'],
  ]) {
    const src = await one(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn])
    check(src.split(needle).length - 1, 1, `${fn} holds "${needle}" once`)
  }
  check((await one(`SELECT prosrc FROM pg_proc WHERE proname = 'hr_drive_file_delete'`)).includes('SET deleted_at'), false,
    'moving a file to the Bin no longer deletes it')

  console.log(`validate-data-center-bin: ${checks} checks passed`)
} finally {
  await db.close()
}
