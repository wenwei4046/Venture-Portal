// Local PostgreSQL regression for 20261013061500 (2026-10-13, Hiring › Talent
// Bank: the Bin — the user: "make a bin, then that bin will last for 30 days.
// file that last for more than 30days in bin, will auto delete"). The Hiring
// migrations and the Drive (20261013030000) run VERBATIM over the stand-ins
// validate-talent-bank-drive.mjs uses (the roster, storage, the permission
// check, the guest link's subsidiaries, the tab guard); a few things are
// deleted the old way first, so the backfill has work. What is under test: a
// file, a folder, a person and a person's file deleted in the bank wait in the
// Bin — their objects held, never leftovers — and come back where they were,
// with what they were in; Delete forever and Empty bin; the 30 days (the
// list, Restore, the hourly purge and the leftovers it frees); what is in the
// Bin is not where it was; who may call what; each write asks the Talent
// Bank's page first. No live I/O.
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

const GRACE_USER = id(1)
const PRINCIPAL_USER = id(2) // a login with no staff record: named by users.name
const GRACE = id(11) // HR Manager
const KARJUN = id(13) // Revenue, Team Assistant
const HR = id(21)
const REV = id(22)

/** Sign in as somebody holding these actions (the stand-in has_any_action reads them). */
async function as(user, actions) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false), set_config('test.actions', '${actions.join(',')}', false)`)
}
const ALL = ['hiring.view', 'hiring.create', 'hiring.edit', 'hiring.approve']
const VIEW = ['hiring.view']
const CREATE = ['hiring.view', 'hiring.create']

const ANSWERS = {
  position: 'Sales Executive', dept: 'Revenue · IR', headcount: '1', budget: '2500–3000', start: 'Within 1 month',
  emp: 'Full-time', jd: 'Sell at fairs.', notes: 'Must drive.',
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE titles(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid, status text NOT NULL DEFAULT 'active',
      user_id uuid, title_id uuid, designation text);
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
    -- Admin › Guest Link's subsidiaries (mig 20261011091000), as the table is.
    CREATE TABLE public.guest_link_subsidiaries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL DEFAULT '',
      name text NOT NULL,
      departments text[] NOT NULL DEFAULT '{}',
      sort_order integer NOT NULL DEFAULT 0,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- The tab guard (mig 20261011220000): here it only says it was asked.
    CREATE TABLE guard_calls(n bigserial PRIMARY KEY, pages text[], wants text[]);
    CREATE FUNCTION public.tab_write_guard(p_pages text[], p_wants text[]) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO guard_calls (pages, wants) VALUES (p_pages, p_wants);
    END $$;
  `)
  await q(`INSERT INTO users VALUES ($1, 'grace@venture.my account', 'grace@x'), ($2, 'Principal', 'principal@x')`, [GRACE_USER, PRINCIPAL_USER])
  await q(`INSERT INTO departments VALUES ($1, 'HR'), ($2, 'Revenue Department')`, [HR, REV])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, status, user_id, designation) VALUES
    ($1, 'Grace Lim', $3, 'active', $4, 'HR Manager'), ($2, 'Kar Jun', $5, 'active', NULL, 'Team Assistant')`, [GRACE, KARJUN, HR, GRACE_USER, REV])
  const CARRES = id(501)
  const DC = id(504)
  await q(`INSERT INTO guest_link_subsidiaries (id, code, name, departments, sort_order) VALUES
    ($1, 'CAR', 'Carres', '{Marketing,Sales}', 1), ($2, 'DC', 'Dream Crafter', '{Interior,Renovation}', 2)`, [CARRES, DC])

  for (const f of ['20261011080000_hiring.sql', '20261011080100_hiring_file_reads.sql', '20261011080200_hiring_reconsider_declined.sql',
    '20261011160000_hiring_files.sql', '20261011210000_hiring_file_types_manage.sql']) {
    await load(f)
  }
  /** An object in the bucket, put there `days` ago — what the browser's upload leaves. */
  const put = (path, days = 0) => q(`INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('hiring-files', $1, now() - make_interval(days => $2))`, [path, days])
  let n = 900
  /** A fresh object's path, put in the bucket `days` ago. */
  const upload = async (name, days = 0) => {
    const path = `files/${id(++n)}/${name}`
    await put(path, days)
    return path
  }

  // The guest link's Request manpower, only what the Drive's swap reads (as validate-talent-bank-drive.mjs has it).
  await db.exec(`
    CREATE FUNCTION public.guest_link_hire(p_code text, p_subsidiary uuid, p_name text, p_answers jsonb, p_attachment_path text,
      p_attachment_name text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE
      v_sub public.guest_link_subsidiaries%ROWTYPE;
      v_id  text;
    BEGIN
      SELECT * INTO v_sub FROM public.guest_link_subsidiaries WHERE id = p_subsidiary AND deleted_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'Fill in Company.'; END IF;
      v_id := public.hiring_file_guest_request(v_sub.name, NULL::text, p_name, NULL::text, coalesce(p_answers, '{}'::jsonb),
        p_attachment_path, p_attachment_name);
      RETURN jsonb_build_object('id', v_id, 'position', coalesce(nullif(btrim(p_answers ->> 'position'), ''), 'the role'));
    END
    $fn$;
  `)

  await load('20261013030000_talent_bank_drive.sql')

  const add = (parent, name) => one(`SELECT public.hiring_bank_folder_add($1, $2)`, [parent, name])
  const ADD_TALENT = `SELECT public.hiring_bank_add_talent($1, $2, '011', 'x@y', $3, 'Good at fairs', $4)`
  const talent = (place, name, files = null) => one(ADD_TALENT, [place, name, 'Promoter', files && JSON.stringify(files)])
  const FOLDER_DELETE = `SELECT public.hiring_bank_folder_delete($1)`
  const REMOVE = `SELECT public.hiring_talent_remove($1)`

  // ── 0. Deleted the old way, before the Bin ────────────────────────────────
  await as(GRACE_USER, ALL)
  const oldBox = await add('root', 'Old box')
  const ancient = await add('root', 'Ancient')
  const nobodys = await add('root', 'Nobody box')
  for (const f of [oldBox, ancient, nobodys]) await q(FOLDER_DELETE, [f])
  await q(`UPDATE public.hiring_bank_folders SET deleted_at = now() - interval '3 days' WHERE id = $1`, [oldBox])
  await q(`UPDATE public.hiring_bank_folders SET deleted_at = now() - interval '40 days' WHERE id = $1`, [ancient])
  await q(`UPDATE public.hiring_bank_folders SET deleted_at = now() - interval '5 days', deleted_by = NULL WHERE id = $1`, [nobodys])
  const preBin = await talent('company:hv', 'Pre Bin')
  await as(PRINCIPAL_USER, ALL)
  await q(REMOVE, [preBin])
  await q(`UPDATE public.hiring_talents SET removed_at = now() - interval '2 days' WHERE id = $1`, [preBin])
  await as(GRACE_USER, ALL)

  // ── The Bin (mig 20261013061500) ───────────────────────────────────────────
  await load('20261013061500_talent_bank_bin.sql')

  const bank = () => one(`SELECT public.hiring_bank()`)
  const binItem = async binId => (await bank()).bin.find(x => x.id === binId)
  const binId = async (col, value, kind) =>
    one(`SELECT x.id FROM public.hiring_bank_bin x WHERE x.${col} = $1 ${kind ? `AND x.kind = '${kind}'` : ''}`, [value])
  const binCount = (col, value) => one(`SELECT count(*)::int FROM public.hiring_bank_bin x WHERE x.${col} = $1`, [value])
  const RESTORE = `SELECT public.hiring_bank_bin_restore($1)`
  const FOREVER = `SELECT public.hiring_bank_bin_delete($1)`
  const EMPTY = `SELECT public.hiring_bank_bin_empty()`
  const restore = bin => one(RESTORE, [bin])
  const forever = bin => one(FOREVER, [bin])
  const FILE_ADD = `SELECT public.hiring_bank_file_add($1, $2, $3, 'application/pdf', 2048)`
  const FILE_DELETE = `SELECT public.hiring_bank_file_delete($1)`
  const bankFile = async (place, name) => one(FILE_ADD, [place, await upload(name), name])
  const folderGone = folder => one(`SELECT deleted_at IS NOT NULL FROM public.hiring_bank_folders WHERE id = $1`, [folder])
  const historyOf = t => q(`SELECT what, note FROM public.hiring_talent_events WHERE talent_id = $1 ORDER BY id`, [t])
  const lastEvent = async t => (await historyOf(t)).at(-1)
  const inUse = path => one(`SELECT public.hiring_file_in_use($1)`, [path])
  const leftovers = () => one(`SELECT public.hiring_leftovers(200)`)
  const types = (await one(`SELECT public.hiring_board()`)).fileTypes
  const RESUME = types.find(t => t.builtin === 'resume').id
  const IC = types.find(t => t.name === 'IC').id
  const CERT = types.find(t => t.name === 'Certificate').id
  const fileOn = (t, path) => q(`SELECT id, type_id, name, path, added_by_name, added_at::text AS added_at FROM public.hiring_files WHERE talent_id = $1 AND path = $2`, [t, path])
    .then(r => r[0])

  // ── 1. The backfill ────────────────────────────────────────────────────────
  check((await q(`SELECT kind, name, deleted_by_name AS by FROM public.hiring_bank_bin ORDER BY name`)).map(r => [r.kind, r.name, r.by]),
    [['folder', 'Nobody box', 'HR'], ['folder', 'Old box', 'Grace Lim'], ['talent', 'Pre Bin', 'Principal']],
    'what was deleted in the last 30 days is in the Bin — named after the staff record, else the login, else HR')
  check(await one(`SELECT count(*)::int FROM public.hiring_bank_bin x JOIN public.hiring_bank_folders f ON f.id = x.folder_id WHERE x.deleted_at = f.deleted_at`), 2,
    'a folder keeps the day it was deleted')
  check(await one(`SELECT x.deleted_at = t.removed_at FROM public.hiring_bank_bin x JOIN public.hiring_talents t ON t.id = x.talent_id`), true,
    '…and a person the day they were removed')
  check(await binCount('folder_id', ancient), 0, 'a folder deleted 40 days ago is not: its 30 days are over')
  let b = await bank()
  check(b.bin.map(x => [x.kind, x.name, x.at, x.deletedBy]),
    [['talent', 'Pre Bin', 'company:hv', 'Principal'], ['folder', 'Old box', 'root', 'Grace Lim'], ['folder', 'Nobody box', 'root', 'HR']],
    'the page reads the Bin newest first, each with where it was')
  check(b.bin.find(x => x.name === 'Old box').folderId, oldBox, 'a folder in the Bin says which')
  check(await restore(await binId('talent_id', preBin)), { kind: 'talent', name: 'Pre Bin', label: 'HOUZS Venture' },
    'somebody removed before the Bin comes back (without the files that went then)')
  check([(await bank()).places[preBin], await binCount('talent_id', preBin)], ['company:hv', 0], '…in the bank again, out of the Bin')

  // ── 2. A file kept in a place: Move to Bin ────────────────────────────────
  const shelf = await add('root', 'Shelf')
  const POSTER = await upload('Job_poster.pdf', 2)
  const poster = await one(FILE_ADD, [`folder:${shelf}`, POSTER, 'Job_poster.pdf'])
  await as(GRACE_USER, CREATE)
  await reject(FILE_DELETE, [poster], /Hiring · Edit is required/, 'moving a file to the Bin asks Edit')
  await as(GRACE_USER, ALL)
  check(await one(FILE_DELETE, [poster]), { orphans: [] }, 'moved to the Bin: no object to delete')
  check((await q(`SELECT deleted_at IS NOT NULL AS binned, deleted_by FROM public.hiring_bank_files WHERE id = $1`, [poster]))[0],
    { binned: true, deleted_by: GRACE_USER }, 'its row stays, marked, with who')
  const posterBin = await binId('bank_file_id', poster)
  check((await q(`SELECT kind, name, deleted_by_name FROM public.hiring_bank_bin WHERE id = $1`, [posterBin]))[0],
    { kind: 'file', name: 'Job_poster.pdf', deleted_by_name: 'Grace Lim' }, 'and a row in the Bin')
  b = await bank()
  check(b.files.some(f => f.id === poster), false, 'the bank’s files leave it out')
  const posterItem = b.bin.find(x => x.id === posterBin)
  check({ ...posterItem, deletedAt: typeof posterItem.deletedAt, expiresAt: typeof posterItem.expiresAt }, {
    id: posterBin, kind: 'file', name: 'Job_poster.pdf', at: `folder:${shelf}`, folderId: null, talentId: null, talentName: null,
    fileType: null, contentType: 'application/pdf', size: 2048, deletedAt: 'string', deletedBy: 'Grace Lim', expiresAt: 'string',
  }, 'the Bin lists it: what, where it was, who')
  check(await one(`SELECT bool_and((x ->> 'expiresAt')::timestamptz = (x ->> 'deletedAt')::timestamptz + interval '30 days')
                     FROM jsonb_array_elements(public.hiring_bank() -> 'bin') x`), true, '…and when it goes for good: 30 days on')
  check(await inUse(POSTER), true, 'its object is still in use')
  check(await one(`SELECT public.hiring_orphaned(ARRAY[$1])`, [POSTER]), [], '…nobody’s to delete')
  check((await leftovers()).includes(POSTER), false, 'two days old and in the Bin: no leftover')
  check(await one(`SELECT public.hiring_file_path('bank', $1)`, [poster]), null, 'a file in the Bin is not opened')
  await reject(FILE_DELETE, [poster], /That file is not there any more\./, 'moved to the Bin once')
  check(await restore(posterBin), { kind: 'file', name: 'Job_poster.pdf', label: 'Shelf' }, 'restored — into its folder')
  check([(await bank()).files.find(f => f.id === poster)?.parent, await binCount('bank_file_id', poster)], [`folder:${shelf}`, 0],
    'back in the bank, out of the Bin')
  check(await one(`SELECT public.hiring_file_path('bank', $1)`, [poster]), { path: POSTER, name: 'Job_poster.pdf' }, 'and it opens again')

  // ── 3. A folder: still only an empty one — what is in the Bin does not count ─
  const cupboard = await add('root', 'Cupboard')
  const memo = await bankFile(`folder:${cupboard}`, 'Memo.pdf')
  await reject(FOLDER_DELETE, [cupboard], /Empty it first\./, 'a file kept in it keeps a folder')
  await q(FILE_DELETE, [memo])
  const drawer = await add(`folder:${cupboard}`, 'Drawer')
  await reject(FOLDER_DELETE, [cupboard], /Empty it first\./, 'so does a folder in it')
  await q(FOLDER_DELETE, [drawer])
  const tess = await talent(`folder:${cupboard}`, 'Tess')
  await reject(FOLDER_DELETE, [cupboard], /Empty it first\./, 'and somebody kept in it')
  await q(`SELECT public.hiring_bank_move($1, 'company:hv')`, [tess])
  await q(FOLDER_DELETE, [cupboard])
  check(await folderGone(cupboard), true, 'its file and folder only in the Bin: it goes')
  const cupBin = await binId('folder_id', cupboard)
  check((await q(`SELECT kind, name, deleted_by_name FROM public.hiring_bank_bin WHERE id = $1`, [cupBin]))[0],
    { kind: 'folder', name: 'Cupboard', deleted_by_name: 'Grace Lim' }, 'to the Bin')
  b = await bank()
  check([b.folders.some(f => f.id === cupboard), (await binItem(cupBin)).at, (await binItem(cupBin)).folderId], [false, 'root', cupboard],
    'out of the bank, in the Bin with where it was')
  check(await restore(cupBin), { kind: 'folder', name: 'Cupboard', label: 'Talent Bank' }, 'restored to the top of the bank')
  check([await folderGone(cupboard), await binCount('folder_id', cupboard), (await bank()).folders.some(f => f.id === cupboard)], [false, 0, true],
    'back, out of the Bin')
  check([await folderGone(drawer), await binCount('folder_id', drawer)], [true, 1], 'what was in the Bin from inside it stays there')

  // ── 4. What it was in comes back with it ──────────────────────────────────
  const crate = await add('root', 'Crate')
  const list = await bankFile(`folder:${crate}`, 'List.pdf')
  await q(FILE_DELETE, [list])
  await q(FOLDER_DELETE, [crate])
  check(await restore(await binId('bank_file_id', list)), { kind: 'file', name: 'List.pdf', label: 'Crate' }, 'a file restored into its folder…')
  check([await folderGone(crate), await binCount('folder_id', crate)], [false, 0], '…which was in the Bin too, and came back with it')
  const outer = await add('root', 'Outer')
  const inner = await add(`folder:${outer}`, 'Inner')
  const deep = await bankFile(`folder:${inner}`, 'Deep.pdf')
  await q(FILE_DELETE, [deep])
  await q(FOLDER_DELETE, [inner])
  await q(FOLDER_DELETE, [outer])
  check(await restore(await binId('bank_file_id', deep)), { kind: 'file', name: 'Deep.pdf', label: 'Outer › Inner' }, 'two folders deep…')
  b = await bank()
  check([b.folders.find(f => f.id === outer)?.parent, b.folders.find(f => f.id === inner)?.parent, b.files.find(f => f.id === deep)?.parent],
    ['root', `folder:${outer}`, `folder:${inner}`], '…both come back, each where it was')

  // A folder gone for good: what was in it comes back to the top.
  const loft = await add('root', 'Loft')
  const plan = await bankFile(`folder:${loft}`, 'Plan.pdf')
  await q(FILE_DELETE, [plan])
  await q(FOLDER_DELETE, [loft])
  await q(`UPDATE public.hiring_bank_bin SET deleted_at = now() - interval '40 days' WHERE folder_id = $1`, [loft])
  await q(`UPDATE public.hiring_bank_folders SET deleted_at = now() - interval '40 days' WHERE id = $1`, [loft])
  check(await restore(await binId('bank_file_id', plan)), { kind: 'file', name: 'Plan.pdf', label: 'Talent Bank' },
    'its folder past its 30 days: the file comes back to the top of the bank')
  check((await q(`SELECT place_kind, place_folder_id, deleted_at FROM public.hiring_bank_files WHERE id = $1`, [plan]))[0],
    { place_kind: 'root', place_folder_id: null, deleted_at: null }, '…at the top, out of the Bin')
  check(await folderGone(loft), true, '…and the folder stays gone')
  const map = await bankFile('root', 'Map.pdf')
  await q(FILE_DELETE, [map])
  // As if kept in a folder deleted before the Bin (no row in the Bin at all).
  await q(`UPDATE public.hiring_bank_files SET place_kind = 'folder', place_folder_id = $2 WHERE id = $1`, [map, ancient])
  check(await restore(await binId('bank_file_id', map)), { kind: 'file', name: 'Map.pdf', label: 'Talent Bank' },
    'a folder deleted before the Bin is gone for good too')
  check([await one(`SELECT place_kind FROM public.hiring_bank_files WHERE id = $1`, [map]), await folderGone(ancient)], ['root', true],
    '…the file at the top, the folder not brought back')

  // ── 5. A name taken there now ─────────────────────────────────────────────
  const interns = await add('root', 'Interns')
  await q(FOLDER_DELETE, [interns])
  const interns2 = await add('root', 'interns')
  const internsBin = await binId('folder_id', interns)
  await reject(RESTORE, [internsBin], /Interns is there already — rename one first\./, 'a folder whose name is taken where it was is not restored')
  check([await folderGone(interns), await binCount('folder_id', interns)], [true, 1], '…it stays in the Bin')
  await q(`SELECT public.hiring_bank_folder_rename($1, 'Interns 2026')`, [interns2])
  check(await restore(internsBin), { kind: 'folder', name: 'Interns', label: 'Talent Bank' }, 'the other renamed, it comes back')
  const hall = await add('root', 'Hall')
  const coat = await add(`folder:${hall}`, 'Coats')
  const scarf = await bankFile(`folder:${coat}`, 'Scarf.pdf')
  await q(FILE_DELETE, [scarf])
  await q(FOLDER_DELETE, [coat])
  await add(`folder:${hall}`, 'coats')
  await reject(RESTORE, [await binId('bank_file_id', scarf)], /Coats is there already — rename one first\./,
    'nor a file whose folder would come back beside one of its name')
  check([await one(`SELECT deleted_at IS NOT NULL FROM public.hiring_bank_files WHERE id = $1`, [scarf]), await folderGone(coat)], [true, true],
    '…nothing moved')

  // ── 6. Remove from Talent Bank: to the Bin, their files kept ──────────────
  const CV1 = await upload('CV.pdf')
  const IC1 = await upload('IC.pdf')
  const wei = await talent(`dept:${CARRES}:Sales`, 'Wei', [{ path: CV1, name: 'CV.pdf', type: RESUME }, { path: IC1, name: 'IC.pdf', type: IC }])
  await as(GRACE_USER, CREATE)
  await reject(REMOVE, [wei], /Hiring · Edit is required/, 'removing asks Edit')
  await as(GRACE_USER, ALL)
  check(await one(REMOVE, [wei]), { orphans: [] }, 'removed: nothing to delete')
  check(await one(`SELECT removed_at IS NOT NULL FROM public.hiring_talents WHERE id = $1`, [wei]), true, 'they leave the bank')
  const weiBin = await binId('talent_id', wei, 'talent')
  check((await q(`SELECT kind, name, deleted_by_name FROM public.hiring_bank_bin WHERE id = $1`, [weiBin]))[0],
    { kind: 'talent', name: 'Wei', deleted_by_name: 'Grace Lim' }, 'to the Bin')
  check(await one(`SELECT count(*)::int FROM public.hiring_files WHERE talent_id = $1`, [wei]), 2, 'their files stay on them meanwhile')
  check([await inUse(CV1), await inUse(IC1)], [true, true], '…their objects held')
  check(await lastEvent(wei), { what: 'Removed from Talent Bank', note: 'In the Bin for 30 days' }, 'their History says so')
  b = await bank()
  check(b.places[wei], undefined, 'the bank’s places leave them out')
  const weiItem = b.bin.find(x => x.id === weiBin)
  check([weiItem.kind, weiItem.name, weiItem.at, weiItem.talentId, weiItem.talentName], ['talent', 'Wei', `dept:${CARRES}:Sales`, wei, null],
    'the Bin lists them with where they were')
  check((await one(`SELECT public.hiring_board()`)).talents.some(t => t.id === wei), false, 'nor does the board show them')
  check(await restore(weiBin), { kind: 'talent', name: 'Wei', label: 'Carres › Sales' }, 'restored — where they were')
  check([await one(`SELECT removed_at FROM public.hiring_talents WHERE id = $1`, [wei]), (await bank()).places[wei], await binCount('talent_id', wei)],
    [null, `dept:${CARRES}:Sales`, 0], 'in the bank again, out of the Bin')
  check(await lastEvent(wei), { what: 'Restored from the Bin', note: 'Carres › Sales' }, 'their History says where')
  check((await one(`SELECT public.hiring_board()`)).talents.find(t => t.id === wei).files.map(f => f.name), ['CV.pdf', 'IC.pdf'], 'with their files')

  const porch = await add('root', 'Porch')
  const pia = await talent(`folder:${porch}`, 'Pia')
  await q(REMOVE, [pia])
  await q(FOLDER_DELETE, [porch])
  check(await restore(await binId('talent_id', pia, 'talent')), { kind: 'talent', name: 'Pia', label: 'Porch' }, 'their folder in the Bin too…')
  check([await folderGone(porch), (await bank()).places[pia]], [false, `folder:${porch}`], '…comes back with them')

  const shed = await add('root', 'Shed')
  const sam = await talent(`folder:${shed}`, 'Sam')
  await q(REMOVE, [sam])
  await q(FOLDER_DELETE, [shed])
  await q(`UPDATE public.hiring_bank_bin SET deleted_at = now() - interval '40 days' WHERE folder_id = $1`, [shed])
  check(await restore(await binId('talent_id', sam, 'talent')), { kind: 'talent', name: 'Sam', label: 'HOUZS Venture' },
    'their folder gone for good: back to HOUZS Venture')
  check((await q(`SELECT place_kind, place_sub_id, place_folder_id FROM public.hiring_talents WHERE id = $1`, [sam]))[0],
    { place_kind: 'company', place_sub_id: null, place_folder_id: null }, '…kept at HOUZS Venture itself')
  check(await lastEvent(sam), { what: 'Restored from the Bin', note: 'HOUZS Venture' }, '…and their History says so')

  // ── 7. A file taken off a person: to the Bin, as it was on them ───────────
  const CV2 = await upload('Lim_CV.pdf')
  const IC2 = await upload('Lim_IC.pdf')
  const lim = await talent('dept:hv:Revenue', 'Lim', [{ path: CV2, name: 'Lim_CV.pdf', type: RESUME }, { path: IC2, name: 'Lim_IC.pdf', type: IC }])
  const icRow = await fileOn(lim, IC2)
  check(await one(`SELECT public.hiring_file_remove($1)`, [icRow.id]), { orphans: [] }, 'a file taken off a person: nothing to delete')
  check(await one(`SELECT count(*)::int FROM public.hiring_files WHERE path = $1`, [IC2]), 0, 'off their record')
  const icBin = await binId('path', IC2)
  check((await q(`SELECT kind, talent_id, file_type_id, name, file_added_by_name, file_added_at::text AS added_at, deleted_by_name
                   FROM public.hiring_bank_bin WHERE id = $1`, [icBin]))[0],
    { kind: 'talent_file', talent_id: lim, file_type_id: IC, name: 'Lim_IC.pdf', file_added_by_name: icRow.added_by_name, added_at: icRow.added_at,
      deleted_by_name: 'Grace Lim' }, 'into the Bin as it was on them — its type, who added it and when')
  check(await inUse(IC2), true, 'its object held')
  check(await lastEvent(lim), { what: 'File removed', note: 'IC · Lim_IC.pdf · in the Bin for 30 days' }, 'their History says where it went')
  const icItem = await binItem(icBin)
  check([icItem.kind, icItem.name, icItem.at, icItem.talentId, icItem.talentName, icItem.fileType], ['talent_file', 'Lim_IC.pdf', null, lim, 'Lim', 'IC'],
    'the Bin lists it with whose it was and what')
  check(await restore(icBin), { kind: 'talent_file', name: 'Lim_IC.pdf', label: 'Lim' }, 'restored — on them')
  const back = await fileOn(lim, IC2)
  check([back.type_id, back.name, back.added_by_name, back.added_at], [icRow.type_id, icRow.name, icRow.added_by_name, icRow.added_at],
    'the same file again: its type, name, who added it and when')
  check([await lastEvent(lim), await binCount('path', IC2)], [{ what: 'File restored', note: 'IC · Lim_IC.pdf' }, 0], 'on their History, out of the Bin')

  await q(`SELECT public.hiring_file_remove($1)`, [back.id])
  await q(REMOVE, [lim])
  check(await restore(await binId('path', IC2)), { kind: 'talent_file', name: 'Lim_IC.pdf', label: 'Lim' }, 'restored while they are in the Bin too…')
  check([await one(`SELECT removed_at FROM public.hiring_talents WHERE id = $1`, [lim]), await binCount('talent_id', lim), !!(await fileOn(lim, IC2))],
    [null, 0, true], '…they come back with it')
  check((await historyOf(lim)).slice(-2).map(e => e.what), ['Restored from the Bin', 'File restored'], '…both on their History')

  const ROY_CV = await upload('Roy_CV.pdf')
  const roy = await talent('company:hv', 'Roy', [{ path: ROY_CV, name: 'Roy_CV.pdf', type: RESUME }])
  await q(`SELECT public.hiring_file_remove($1)`, [(await fileOn(roy, ROY_CV)).id])
  await q(REMOVE, [roy])
  await q(`UPDATE public.hiring_bank_bin SET deleted_at = now() - interval '40 days' WHERE kind = 'talent' AND talent_id = $1`, [roy])
  await reject(RESTORE, [await binId('path', ROY_CV)], /Roy is not in the Talent Bank any more\./,
    'a file of somebody past their 30 days in the Bin has nobody to go back on')
  check([await binCount('path', ROY_CV), await one(`SELECT removed_at IS NOT NULL FROM public.hiring_talents WHERE id = $1`, [roy])], [1, true],
    '…it stays in the Bin, they stay removed')

  const twenty = await Promise.all(Array.from({ length: 20 }, (_, i) => upload(`Cert_${i + 1}.pdf`)))
  const max = await talent('company:hv', 'Max', twenty.map((path, i) => ({ path, name: `Cert_${i + 1}.pdf`, type: CERT })))
  await q(`SELECT public.hiring_file_remove($1)`, [(await fileOn(max, twenty[0])).id])
  await q(`SELECT public.hiring_files_add('talent', $1, $2)`, [max, JSON.stringify([{ path: await upload('Cert_21.pdf'), name: 'Cert_21.pdf', type: CERT }])])
  await reject(RESTORE, [await binId('path', twenty[0])], /Up to 20 files each\./, 'not past twenty files on a person')
  check(await binCount('path', twenty[0]), 1, '…it stays in the Bin')

  // A candidate's file is the request's: deleted at once, as before.
  const req = await one(`SELECT public.hiring_submit($1, $2)`, [KARJUN, ANSWERS])
  const CARA_CV = await upload('Cara_CV.pdf')
  const cara = await one(`SELECT public.hiring_candidate_add($1, 'Cara', '', 'shortlisted', '', '{}', NULL, NULL, $2)`,
    [req, JSON.stringify([{ path: CARA_CV, name: 'Cara_CV.pdf', type: RESUME }])])
  const caraFile = await one(`SELECT id FROM public.hiring_files WHERE candidate_id = $1`, [cara])
  check(await one(`SELECT public.hiring_file_remove($1)`, [caraFile]), { orphans: [CARA_CV] }, 'a candidate’s file taken off: its object answered at once')
  check(await binCount('path', CARA_CV), 0, '…not in the Bin')

  // ── 8. Delete forever ─────────────────────────────────────────────────────
  const OLD_CV = await upload('Old_CV.pdf')
  const oldCv = await one(FILE_ADD, ['root', OLD_CV, 'Old_CV.pdf'])
  await q(FILE_DELETE, [oldCv])
  const oldCvBin = await binId('bank_file_id', oldCv)
  await as(GRACE_USER, VIEW)
  await reject(FOREVER, [oldCvBin], /Hiring · Edit is required/, 'deleting forever asks Edit')
  await as(GRACE_USER, ALL)
  check(await forever(oldCvBin), { orphans: [OLD_CV] }, 'a file deleted forever: its object answered for the bucket')
  check([await one(`SELECT count(*)::int FROM public.hiring_bank_files WHERE id = $1`, [oldCv]), await binCount('bank_file_id', oldCv)], [0, 0],
    '…its row gone, and out of the Bin')
  check(await inUse(OLD_CV), false, '…the bucket may let it go')
  await reject(RESTORE, [oldCvBin], /That is not in the Bin any more\./, 'nothing to restore')

  const bare = await add('root', 'Bare')
  await q(FOLDER_DELETE, [bare])
  check(await forever(await binId('folder_id', bare)), { orphans: [] }, 'a folder deleted forever')
  check(await one(`SELECT count(*)::int FROM public.hiring_bank_folders WHERE id = $1`, [bare]), 0, '…nothing names it: its row goes')
  const keep = await add('root', 'Keep')
  const kay = await talent(`folder:${keep}`, 'Kay')
  await q(REMOVE, [kay])
  await q(FOLDER_DELETE, [keep])
  await forever(await binId('folder_id', keep))
  check([await one(`SELECT count(*)::int FROM public.hiring_bank_folders WHERE id = $1`, [keep]), await folderGone(keep), await binCount('folder_id', keep),
    (await bank()).bin.some(x => x.folderId === keep)], [1, true, 0, false], 'one a removed person still names: its row stays, deleted — out of the Bin')
  check(await restore(await binId('talent_id', kay, 'talent')), { kind: 'talent', name: 'Kay', label: 'HOUZS Venture' }, '…so Kay comes back to HOUZS Venture')

  // Bo: a candidate's résumé kept with him (one object, two records), a file of his own, and one already in the Bin.
  const req2 = await one(`SELECT public.hiring_submit($1, $2)`, [KARJUN, ANSWERS])
  const BO_CV = await upload('Bo_CV.pdf')
  const boCand = await one(`SELECT public.hiring_candidate_add($1, 'Bo', '', 'shortlisted', '', '{}', NULL, NULL, $2)`,
    [req2, JSON.stringify([{ path: BO_CV, name: 'Bo_CV.pdf', type: RESUME }])])
  const bo = await one(`SELECT public.hiring_talent_save('Bo', '', '', 'Sales Executive', 'Sales', '', NULL, NULL, $1, NULL)`, [boCand])
  const BO_OWN = await upload('Bo_own.pdf')
  const BO_OFF = await upload('Bo_off.pdf')
  await q(`SELECT public.hiring_files_add('talent', $1, $2)`,
    [bo, JSON.stringify([{ path: BO_OWN, name: 'Bo_own.pdf', type: CERT }, { path: BO_OFF, name: 'Bo_off.pdf', type: CERT }])])
  await q(`SELECT public.hiring_file_remove($1)`, [(await fileOn(bo, BO_OFF)).id])
  await q(REMOVE, [bo])
  check(await forever(await binId('talent_id', bo, 'talent')), { orphans: [BO_OWN, BO_OFF].sort() },
    'a person deleted forever: their objects answered — not the one their candidate still holds')
  check([await one(`SELECT count(*)::int FROM public.hiring_files WHERE talent_id = $1`, [bo]), await binCount('talent_id', bo)], [0, 0],
    '…their files gone, and their file that was in the Bin on its own')
  check([await inUse(BO_CV), await one(`SELECT removed_at IS NOT NULL FROM public.hiring_talents WHERE id = $1`, [bo])], [true, true],
    '…the candidate keeps the résumé; their row stays, removed, for its history')
  check(await lastEvent(bo), { what: 'Deleted from the Bin', note: '3 files deleted' }, 'their History says so')

  const ZED = await upload('Zed.pdf')
  await q(`SELECT public.hiring_files_add('talent', $1, $2)`, [wei, JSON.stringify([{ path: ZED, name: 'Zed.pdf', type: CERT }])])
  await q(`SELECT public.hiring_file_remove($1)`, [(await fileOn(wei, ZED)).id])
  check(await forever(await binId('path', ZED)), { orphans: [ZED] }, 'a person’s file deleted forever: its object answered')
  await reject(FOREVER, [id(999)], /That is not in the Bin any more\./, 'not what is not in the Bin')
  await reject(RESTORE, [id(999)], /That is not in the Bin any more\./, '…nor restored')

  // ── 9. Empty bin ──────────────────────────────────────────────────────────
  const A1 = await upload('Ann_1.pdf')
  const A2 = await upload('Ann_2.pdf')
  const ann = await talent('company:hv', 'Ann', [{ path: A1, name: 'Ann_1.pdf', type: CERT }, { path: A2, name: 'Ann_2.pdf', type: CERT }])
  await q(`SELECT public.hiring_file_remove($1)`, [(await fileOn(ann, A1)).id])
  await q(REMOVE, [ann])
  const inBin = await one(`SELECT count(*)::int FROM public.hiring_bank_bin`)
  check(inBin > 5, true, 'the Bin holds things of every kind by now')
  await as(GRACE_USER, VIEW)
  await reject(EMPTY, [], /Hiring · Edit is required/, 'emptying asks Edit')
  await as(GRACE_USER, ALL)
  const emptied = await one(EMPTY)
  check(emptied.count, inBin, 'every item counted — a person’s own file in the Bin before the person')
  check(await one(`SELECT count(*)::int FROM public.hiring_bank_bin`), 0, 'nothing left in the Bin')
  check([A1, A2, twenty[0], POSTER].map(p => emptied.orphans.includes(p)), [true, true, true, false], 'the objects nobody names any more are answered')
  check(await lastEvent(ann), { what: 'Deleted from the Bin', note: '1 file deleted' }, 'Ann’s History: her own file had gone first')
  check(await one(`SELECT count(*)::int FROM public.hiring_bank_folders WHERE id IN ($1, $2)`, [oldBox, nobodys]), 0,
    'the folders deleted before the Bin are gone for good')
  check((await bank()).bin, [], 'the page reads an empty Bin')

  // ── 10. The 30 days ───────────────────────────────────────────────────────
  const E1 = await upload('E1.pdf', 40)
  const e1 = await one(FILE_ADD, ['root', E1, 'E1.pdf'])
  await q(FILE_DELETE, [e1])
  const E2 = await upload('E2.pdf', 40)
  const oldHand = await talent('company:hv', 'Old Hand', [{ path: E2, name: 'E2.pdf', type: CERT }])
  await q(REMOVE, [oldHand])
  const E3 = await upload('E3.pdf', 40)
  await q(`SELECT public.hiring_files_add('talent', $1, $2)`, [wei, JSON.stringify([{ path: E3, name: 'E3.pdf', type: CERT }])])
  await q(`SELECT public.hiring_file_remove($1)`, [(await fileOn(wei, E3)).id])
  const F1 = await upload('F1.pdf', 40)
  const f1 = await one(FILE_ADD, ['root', F1, 'F1.pdf'])
  await q(FILE_DELETE, [f1])
  const e1Bin = await binId('bank_file_id', e1)
  const oldHandBin = await binId('talent_id', oldHand, 'talent')
  const e3Bin = await binId('path', E3)
  await q(`UPDATE public.hiring_bank_bin SET deleted_at = now() - interval '31 days' WHERE id = ANY ($1::uuid[])`, [[e1Bin, oldHandBin, e3Bin]])
  b = await bank()
  check([e1Bin, oldHandBin, e3Bin].map(x => b.bin.some(y => y.id === x)), [false, false, false], '31 days on, the page no longer lists them')
  check(b.bin.map(x => x.name), ['F1.pdf'], '…only what has not had its 30 days')
  await reject(RESTORE, [e1Bin], /That is not in the Bin any more\./, 'a file past its 30 days is not restored')
  await reject(RESTORE, [oldHandBin], /That is not in the Bin any more\./, '…nor a person')
  await reject(RESTORE, [e3Bin], /That is not in the Bin any more\./, '…nor a person’s file')
  check(await Promise.all([E1, E2, E3].map(inUse)), [true, true, true], 'the objects are still named until the sweep')
  check((await leftovers()).filter(p => [E1, E2, E3, F1].includes(p)), [], '…so none is a leftover yet')
  await as(null, [])
  check(await one(`SELECT public.hiring_bank_bin_purge()`), 3, 'the hourly sweep (no sign-in: the service role) drops exactly the expired ones')
  await as(GRACE_USER, ALL)
  check((await q(`SELECT kind, bank_file_id FROM public.hiring_bank_bin`)).map(r => [r.kind, r.bank_file_id]), [['file', f1]], 'what has days left stays')
  check(await one(`SELECT count(*)::int FROM public.hiring_bank_files WHERE id = $1`, [e1]), 0, 'the file’s row is gone')
  check(await one(`SELECT count(*)::int FROM public.hiring_files WHERE talent_id = $1`, [oldHand]), 0, 'the person’s files are gone')
  check((await q(`SELECT what, actor_name, note FROM public.hiring_talent_events WHERE talent_id = $1 ORDER BY id DESC LIMIT 1`, [oldHand]))[0],
    { what: 'Deleted from the Bin', actor_name: 'Talent Bank', note: '30 days in the Bin · 1 file deleted' }, 'their History: by the Talent Bank, after 30 days')
  const freed = await leftovers()
  check([E1, E2, E3, F1].map(p => freed.includes(p)), [true, true, true, false], 'the objects it freed are leftovers now — the same sweep deletes them')
  check(await one(`SELECT public.hiring_bank_bin_purge()`), 0, 'nothing more to drop')

  // ── 11. What is in the Bin is not where it was ────────────────────────────
  const PLACE = `SELECT kind, dept FROM public.hiring_bank_place($1)`
  const brief = await bankFile(`dept:${CARRES}:Marketing`, 'Brief.pdf')
  await q(`UPDATE public.guest_link_subsidiaries SET departments = array_remove(departments, 'Marketing') WHERE id = $1`, [CARRES])
  check(await q(PLACE, [`dept:${CARRES}:Marketing`]), [{ kind: 'dept', dept: 'Marketing' }], 'off the list, a department something is kept in is a place')
  await q(FILE_DELETE, [brief])
  await reject(PLACE, [`dept:${CARRES}:Marketing`], /That department is not there any more\./, '…a file in the Bin does not keep it one')
  check((await q(`SELECT kind FROM public.hiring_bank_locate('Carres', 'Marketing', $1)`, [CARRES]))[0].kind, 'folder',
    '…nor does the next one saved for it join it there: a folder of its name, as for any department not listed')
  const ivo = await talent(`dept:${DC}:Interior`, 'Ivo')
  const live = await bankFile(`dept:${DC}:Interior`, 'Live.pdf')
  const binned = await bankFile(`dept:${DC}:Interior`, 'Binned.pdf')
  await q(FILE_DELETE, [binned])
  check(await one(`SELECT public.hiring_bank_move_all($1, $2)`, [`dept:${DC}:Interior`, `company:${DC}`]),
    { people: 1, folders: 0, files: 1, to: 'Dream Crafter' }, 'Move everyone takes what is there — not the file in the Bin')
  b = await bank()
  check([b.places[ivo], b.files.find(f => f.id === live)?.parent], [`company:${DC}`, `company:${DC}`], '…the person and the file kept there went')
  check([(await q(`SELECT place_kind, place_dept FROM public.hiring_bank_files WHERE id = $1`, [binned]))[0], (await binItem(await binId('bank_file_id', binned))).at],
    [{ place_kind: 'dept', place_dept: 'Interior' }, `dept:${DC}:Interior`], 'the one in the Bin stays where it was: Restore takes it back there')
  // A department renamed in Admin › Guest Link takes along what is in the Bin from it too.
  const reno = await bankFile(`dept:${DC}:Renovation`, 'Reno.pdf')
  await q(FILE_DELETE, [reno])
  await as(GRACE_USER, [...ALL, 'guest_link.edit'])
  await q(`SELECT public.guest_link_rename_department($1, 'Renovation', 'Renovations')`, [DC])
  await as(GRACE_USER, ALL)
  check((await binItem(await binId('bank_file_id', reno))).at, `dept:${DC}:Renovations`, 'a department renamed: its file in the Bin goes with the new name')
  check(await restore(await binId('bank_file_id', reno)), { kind: 'file', name: 'Reno.pdf', label: 'Dream Crafter › Renovations' }, '…and is restored there')

  // ── 12. Who may call what ─────────────────────────────────────────────────
  const WRITES = ['public.hiring_bank_bin_restore(uuid)', 'public.hiring_bank_bin_delete(uuid)', 'public.hiring_bank_bin_empty()']
  for (const fn of WRITES) {
    check(await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), true, `${fn} is a signed-in user's`)
    check(await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [fn]), false, `${fn} is not the publishable key's`)
  }
  for (const fn of ['public.hiring_bank_bin_drop(uuid, boolean)', 'public.hiring_bank_bin_reopen(uuid)', 'public.hiring_bank_bin_unremove(uuid)',
    'public.hiring_bank_bin_keeps()', 'public.hiring_bank_bin_purge(integer)']) {
    check(await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), false, `${fn} is not a session's`)
    check(await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [fn]), false, `${fn} is not the publishable key's`)
  }
  check(await one(`SELECT has_table_privilege('authenticated', 'public.hiring_bank_bin', 'SELECT')`), false, 'the Bin is not read straight')
  check(await one(`SELECT relrowsecurity FROM pg_class WHERE relname = 'hiring_bank_bin'`), true, 'the Bin has RLS on')
  const viewOnly = await bankFile('root', 'View.pdf')
  await q(FILE_DELETE, [viewOnly])
  const viewBin = await binId('bank_file_id', viewOnly)
  await as(GRACE_USER, VIEW)
  check((await bank()).bin.some(x => x.id === viewBin), true, 'View reads the Bin')
  await reject(RESTORE, [viewBin], /Hiring · Edit is required/, '…but restores nothing')
  await reject(FOREVER, [viewBin], /Hiring · Edit is required/, '…deletes nothing')
  await reject(EMPTY, [], /Hiring · Edit is required/, '…empties nothing')

  // ── 13. Each write asks the Talent Bank's page first ──────────────────────
  for (const fn of WRITES) {
    const src = await one(`SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [fn])
    const after = src.slice(src.search(/\bBEGIN\b/i) + 'BEGIN'.length).trimStart()
    check(after.startsWith(`PERFORM public.tab_write_guard(ARRAY['/hiring/talent'], ARRAY['hiring.edit']);`), true, `${fn} asks /hiring/talent for hiring.edit first`)
    check(src.split('tab_write_guard').length - 1, 1, `${fn} asks once`)
  }
  await as(GRACE_USER, ALL)
  const g1 = await bankFile('root', 'Guard_1.pdf')
  const g2 = await bankFile('root', 'Guard_2.pdf')
  await q(FILE_DELETE, [g1])
  await q(FILE_DELETE, [g2])
  const g1Bin = await binId('bank_file_id', g1)
  const g2Bin = await binId('bank_file_id', g2)
  await q(`DELETE FROM guard_calls`)
  await restore(g1Bin)
  await forever(g2Bin)
  await one(EMPTY)
  check(await q(`SELECT pages, wants FROM guard_calls ORDER BY n`), [
    { pages: ['/hiring/talent'], wants: ['hiring.edit'] },
    { pages: ['/hiring/talent'], wants: ['hiring.edit'] },
    { pages: ['/hiring/talent'], wants: ['hiring.edit'] },
  ], 'and the guard is asked when they run')

  // ── 14. Production's bodies, one span swapped each — once ─────────────────
  const src = sig => one(`SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${sig}`])
  const times = (s, needle) => s.split(needle).length - 1
  for (const [sig, needle] of [
    ['hiring_file_in_use(text)', 'hiring_bank_bin'], ['hiring_leftovers(integer)', 'hiring_bank_bin'], ['hiring_orphaned(text[])', 'hiring_bank_bin'],
    ['hiring_take_upload(text)', 'hiring_bank_bin'], ['hiring_file_path(text, text)', 'b.deleted_at IS NULL'],
    ['hiring_bank()', 'FROM public.hiring_bank_bin x'], ['hiring_bank()', 'FROM public.hiring_bank_files b WHERE b.deleted_at IS NULL'],
    ['hiring_bank_file_delete(uuid)', 'hiring_bank_bin'], ['hiring_bank_folder_delete(uuid)', 'hiring_bank_bin'],
    ['hiring_bank_folder_delete(uuid)', 'b.deleted_at IS NULL'], ['hiring_talent_remove(uuid)', 'hiring_bank_bin'],
    ['hiring_file_remove(uuid)', 'hiring_bank_bin'], ['hiring_bank_place(text)', 'b.deleted_at IS NULL'],
    ['hiring_bank_locate(text, text, uuid)', 'b.deleted_at IS NULL'], ['hiring_bank_move_all(text, text)', 'WHERE deleted_at IS NULL AND place_kind'],
  ]) {
    check(times(await src(sig), needle), 1, `${sig} learned the Bin, once`)
  }
  check(times(await src('hiring_talent_remove(uuid)'), 'DELETE FROM public.hiring_files'), 0, 'Remove from Talent Bank no longer deletes their files')
  check(await one(`SELECT provolatile FROM pg_proc WHERE proname = 'hiring_bank'`), 's', 'reading the bank still writes nothing (View as)')

  console.log(`talent bank bin: ${checks} checks passed`)
} finally {
  await db.close()
}
