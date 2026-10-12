// Local PostgreSQL regression for 20261013030000 (2026-10-12, Hiring › Talent
// Bank as a Drive — the user: "talent bank need be like google drive as well,
// can create new file, and name as well … so when save or upload can detect
// and locate file"; asked: company › department › people, the companies and
// departments both from Admin › Guest Link and from folders HR makes, HR's
// folders hold people and files). The Hiring migrations run VERBATIM over
// stand-ins for what they read (the roster, storage, the permission check,
// the guest link's subsidiaries, the tab guard); talents are saved the old way
// first, so the backfill has work. What is under test: every talent has a
// place — found by name from its request (a guest's company and department, a
// portal request's department picked) and made when not there yet, reusing
// what HR made by hand; the page's read; folders made, renamed and deleted
// only when empty, one name per place (the places' own names included); Move
// to…; + Add talent in a place; files kept in a place, held in the bucket
// while they are there; who may call what; each write asks the Talent Bank's
// page first. No live I/O.
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
  await q(`INSERT INTO users VALUES ($1, 'grace@venture.my account', 'grace@x')`, [GRACE_USER])
  await q(`INSERT INTO departments VALUES ($1, 'HR'), ($2, 'Revenue Department')`, [HR, REV])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, status, user_id, designation) VALUES
    ($1, 'Grace Lim', $3, 'active', $4, 'HR Manager'), ($2, 'Kar Jun', $5, 'active', NULL, 'Team Assistant')`, [GRACE, KARJUN, HR, GRACE_USER, REV])
  const CARRES = id(501)
  const HOOKKA = id(502)
  const OLDCO = id(503)
  const HOOKKA_GONE = id(505) // an older, removed company of the same name: the live one is found first
  await q(`INSERT INTO guest_link_subsidiaries (id, code, name, departments, sort_order, deleted_at, created_at) VALUES
    ($1, 'CAR', 'Carres', '{Marketing,Sales}', 1, NULL, now()), ($2, 'HK', 'Hookka', '{Management}', 2, NULL, now()),
    ($3, 'OLD', 'Old Co', '{Sales}', 3, now(), now()), ($4, 'HKO', 'Hookka', '{Management}', 4, now(), now() - interval '1 year')`,
    [CARRES, HOOKKA, OLDCO, HOOKKA_GONE])

  for (const f of ['20261011080000_hiring.sql', '20261011080100_hiring_file_reads.sql', '20261011080200_hiring_reconsider_declined.sql',
    '20261011160000_hiring_files.sql', '20261011210000_hiring_file_types_manage.sql']) {
    await load(f)
  }
  /** An object in the bucket, put there `days` ago — what the browser's upload leaves. */
  const put = (path, days = 0) => q(`INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('hiring-files', $1, now() - make_interval(days => $2))`, [path, days])

  // The guest link's Request manpower (mig 20261011092000, as production runs it since 20261012220000) — only what the
  // Drive's swap reads: its company row in v_sub, the request's id in v_id, and production's own last statement.
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

  // A request from the portal, a guest request, a candidate each — and talents saved the old way, before the Drive.
  await as(GRACE_USER, ALL)
  const portalReq = await one(`SELECT public.hiring_submit($1, $2)`, [KARJUN, ANSWERS])
  /** A guest request, filed as the guest link files one (its own door, the service role's — here the owner's). */
  const guestReq = async (company, dept) => {
    await as(null, [])
    const r = await one(`SELECT public.hiring_file_guest_request($1, NULL, 'Wong Mei Yee', '012', $2, NULL, NULL)`, [company, { ...ANSWERS, dept }])
    await as(GRACE_USER, ALL)
    return r
  }
  const candidate = (req, name) => one(`SELECT public.hiring_candidate_add($1, $2, '', 'shortlisted', '', '{}')`, [req, name])
  const save = (name, dept, cand = null) =>
    one(`SELECT public.hiring_talent_save($1, '', '', 'Sales Executive', $2, '', NULL, NULL, $3, NULL)`, [name, dept, cand])

  const oldFromRequest = await save('Old Revenue', 'Revenue', await candidate(portalReq, 'Old Revenue'))
  const oldPicked = await save('Old Marketing', 'Marketing', await candidate(portalReq, 'Old Marketing'))
  const oldPlain = await save('Old Finance', 'Finance')
  const oldUnlisted = await save('Old Warehouse', 'Warehouse')
  // Guest requests already filed — the backfill names their company by id.
  const preCarres = await guestReq('Carres', 'Sales')
  const preHookka = await guestReq('Hookka', 'Management')

  // ── The Drive (mig 20261013030000) ─────────────────────────────────────────
  const DRIVE = '20261013030000_talent_bank_drive.sql'
  await load(DRIVE)
  const bank = () => one(`SELECT public.hiring_bank()`)
  const placeOf = async talent => (await bank()).places[talent]
  const folderNamed = async (name, parent) => (await bank()).folders.find(f => f.name === name && (parent === undefined || f.parent === parent))
  const subOfRequest = rid => one(`SELECT requester_sub_id FROM public.hiring_requests WHERE id = $1`, [rid])

  // ── 0. A guest's request keeps which company sent it ──────────────────────
  check(await subOfRequest(preCarres), CARRES, 'a guest request already filed: its company found by name')
  check(await subOfRequest(preHookka), HOOKKA, '…the live one, not an older removed company of the same name')
  check(await subOfRequest(portalReq), null, 'a portal request names no subsidiary')

  // ── 1. The talents already in the bank are placed ─────────────────────────
  check(await placeOf(oldFromRequest), 'dept:hv:Revenue', 'a portal request’s talent: HOUZS Venture › the department picked')
  check(await placeOf(oldPicked), 'dept:hv:Marketing', 'the department HR picked wins over the request’s')
  check(await placeOf(oldPlain), 'dept:hv:Finance', 'one added straight: HOUZS Venture › their department')
  const hvWarehouse = await folderNamed('Warehouse', 'company:hv')
  check(!!hvWarehouse && (await placeOf(oldUnlisted)) === `folder:${hvWarehouse.id}`, true,
    'a department HOUZS Venture does not list: a folder made in it, and the talent there')
  check(await one(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'hiring_talents' AND column_name = 'place_kind'`), 'NO',
    'every talent has a place from now on')
  check(await one(`SELECT count(*)::int FROM public.hiring_talents WHERE place_kind IS NULL`), 0, 'nobody is left without one')

  // ── 2. Saved from a candidate, found by name ──────────────────────────────
  const carresReq = await guestReq('Carres', 'Sales')
  const ahmad = await save('Ahmad', 'Revenue', await candidate(carresReq, 'Ahmad'))
  check(await placeOf(ahmad), `dept:${CARRES}:Sales`, 'a guest request’s talent: its company › its department (the page’s department ignored)')
  const lower = await guestReq('carres', ' SALES ')
  const siti = await save('Siti', 'Sales', await candidate(lower, 'Siti'))
  check(await placeOf(siti), `dept:${CARRES}:Sales`, 'found whatever the case and the spaces')

  const folders0 = (await bank()).folders.length
  const ohanaReq = await guestReq('Ohana', 'Sales')
  const ali = await save('Ali', 'Sales', await candidate(ohanaReq, 'Ali'))
  const ohana = await folderNamed('Ohana', 'root')
  const ohanaSales = ohana && (await folderNamed('Sales', `folder:${ohana.id}`))
  check([!!ohana, !!ohanaSales, await placeOf(ali)], [true, true, `folder:${ohanaSales?.id}`],
    'a company not on the list: a folder at the top for it, its department inside, the talent there')
  const ohanaReq2 = await guestReq('OHANA', 'sales')
  const ben = await save('Ben', 'Sales', await candidate(ohanaReq2, 'Ben'))
  check([await placeOf(ben), (await bank()).folders.length - folders0], [`folder:${ohanaSales?.id}`, 2], 'saved again: the same folders, none made twice')

  const oldCoReq = await guestReq('Old Co', 'Sales')
  const ivy = await save('Ivy', 'Sales', await candidate(oldCoReq, 'Ivy'))
  check(await placeOf(ivy), `dept:${OLDCO}:Sales`, 'a company removed from the list is still that company — no folder made for it')
  await q(`SELECT public.hiring_talent_remove($1)`, [ivy])

  const carresWh = await guestReq('Carres', 'Warehouse')
  const chong = await save('Chong', 'Warehouse', await candidate(carresWh, 'Chong'))
  const carresWarehouse = await folderNamed('Warehouse', `company:${CARRES}`)
  check([!!carresWarehouse, await placeOf(chong)], [true, `folder:${carresWarehouse?.id}`],
    'a department the company does not list: a folder made in the company')

  // "Both can": what HR made by hand is found by name too.
  const acme = await one(`SELECT public.hiring_bank_folder_add('root', 'Acme')`)
  const acmeOps = await one(`SELECT public.hiring_bank_folder_add($1, 'Ops')`, [`folder:${acme}`])
  const folders1 = (await bank()).folders.length
  const acmeReq = await guestReq('Acme', 'Ops')
  const dina = await save('Dina', 'Ops', await candidate(acmeReq, 'Dina'))
  check([await placeOf(dina), (await bank()).folders.length], [`folder:${acmeOps}`, folders1], 'a company and department HR made by hand: found, nothing new made')

  // ── 3. The page's read ────────────────────────────────────────────────────
  await as(GRACE_USER, [])
  await reject(`SELECT public.hiring_bank()`, [], /Hiring access is required/, 'no Hiring · View, no Talent Bank')
  await as(GRACE_USER, VIEW)
  let b = await bank()
  check(b.hq, ['Revenue', 'HR', 'Finance', 'Marketing', 'IT', 'Director Office'], 'HOUZS Venture’s departments: Form settings’ choices by their first part, once each')
  check(b.subs.map(s => [s.name, s.code, s.departments, s.removed]),
    [['Carres', 'CAR', ['Marketing', 'Sales'], false], ['Hookka', 'HK', ['Management'], false], ['Old Co', 'OLD', ['Sales'], true],
      ['Hookka', 'HKO', ['Management'], true]],
    'the guest link’s companies, a removed one saying so')
  check(b.folders.find(f => f.id === acmeOps).parent, `folder:${acme}`, 'a folder says where it is')
  check(b.folders.find(f => f.id === acme).parent, 'root', '…the top too')
  check([b.folders.find(f => f.id === acme).createdBy, typeof b.folders.find(f => f.id === acme).createdAt], ['Grace Lim', 'string'], 'who made it, when')
  check(Object.keys(b.places).length, 10, 'every talent in the bank has a place')
  await as(GRACE_USER, ALL)
  await q(`SELECT public.hiring_talent_remove($1)`, [oldPlain])
  check((await placeOf(oldPlain)) === undefined, true, 'a removed talent is not in the bank’s places')
  check(await one(`SELECT provolatile FROM pg_proc WHERE proname = 'hiring_bank'`), 's', 'reading the bank writes nothing (View as)')

  // ── 4. + New › New folder ─────────────────────────────────────────────────
  const add = (parent, name) => q(`SELECT public.hiring_bank_folder_add($1, $2) AS r`, [parent, name]).then(r => r[0].r)
  const ADD = `SELECT public.hiring_bank_folder_add($1, $2)`
  await as(GRACE_USER, VIEW)
  await reject(ADD, ['root', 'Walk-ins'], /Hiring · Create is required/, 'View makes no folder')
  await as(GRACE_USER, CREATE)
  await reject(ADD, ['root', '   '], /Name the folder\./, 'a folder has a name')
  await reject(ADD, ['root', 'x'.repeat(81)], /Keep the name under 80 characters\./, 'eighty characters at most')
  await reject(ADD, ['root', 'Sales/Marketing'], /A folder's name cannot hold a slash\./, 'no slash in a name')
  await reject(ADD, ['root', ' ACME '], /ACME is here already\./, 'one folder of a name in a place, whatever its case')
  await reject(ADD, ['root', 'houzs venture'], /houzs venture is here already\./, 'HOUZS Venture is in the Talent Bank by itself')
  await reject(ADD, ['root', 'Carres'], /Carres is here already\./, 'so is each company of the guest link’s list')
  await reject(ADD, [`company:${CARRES}`, 'sales'], /sales is here already\./, 'a department a company lists is in it by itself')
  await reject(ADD, ['company:hv', 'Marketing'], /Marketing is here already\./, '…HOUZS Venture’s too')
  await reject(ADD, [`company:${CARRES}`, 'Warehouse'], /Warehouse is here already\./, '…and a folder made in it for a talent')
  const walkIns = await add('root', 'Walk-ins')
  const senior = await add(`dept:${CARRES}:sales`, 'Senior')
  check((await bank()).folders.find(f => f.id === senior).parent, `dept:${CARRES}:Sales`, 'in a department, by the department’s own spelling')
  const night = await add(`folder:${walkIns}`, 'Night shift')
  check((await bank()).folders.find(f => f.id === night).parent, `folder:${walkIns}`, 'in a folder')
  const hqSales = await add('dept:hv:Revenue', 'Promoters')
  check((await bank()).folders.find(f => f.id === hqSales).parent, 'dept:hv:Revenue', 'in one of HOUZS Venture’s departments')
  check(await add(`company:${OLDCO}`, 'Archive') !== null, true, 'a removed company of the list still takes a folder')
  await reject(ADD, [`talent:${ahmad}`, 'Docs'], /A person's folder is their record — open it to add their files\./, 'never inside a person')
  await reject(ADD, ['dept:hv:Nowhere', 'X'], /That department is not there any more\./, 'a department neither listed nor holding anything is not a place')
  await reject(ADD, [`dept:${id(999)}:Sales`, 'X'], /That department is not there any more\./, '…nor one of an unknown company')
  await reject(ADD, [`company:${id(999)}`, 'X'], /That company is not there any more\./, 'an unknown company is not a place')
  await reject(ADD, [`folder:${id(999)}`, 'X'], /That folder is not there any more\./, 'nor an unknown folder')
  await reject(ADD, ['somewhere', 'X'], /That folder is not there any more\./, 'nor anything else')

  // ── 5. Rename ─────────────────────────────────────────────────────────────
  const RENAME = `SELECT public.hiring_bank_folder_rename($1, $2)`
  await reject(RENAME, [walkIns, 'Walk-in CVs'], /Hiring · Edit is required/, 'renaming asks Edit')
  await as(GRACE_USER, ALL)
  await q(RENAME, [walkIns, 'Walk-ins'])
  await q(RENAME, [walkIns, 'WALK-INS'])
  check((await bank()).folders.find(f => f.id === walkIns).name, 'WALK-INS', 'its own name again, another case: fine')
  await reject(RENAME, [walkIns, 'acme'], /acme is here already\./, 'not to a neighbour’s name')
  await reject(RENAME, [walkIns, 'Carres'], /Carres is here already\./, 'nor a company’s at the top')
  await reject(RENAME, [walkIns, ' '], /Name the folder\./, 'a name still')
  await q(RENAME, [walkIns, 'Walk-ins'])

  // ── 6. Delete — only when empty ───────────────────────────────────────────
  const DELETE = `SELECT public.hiring_bank_folder_delete($1)`
  await as(GRACE_USER, CREATE)
  await reject(DELETE, [night], /Hiring · Edit is required/, 'deleting asks Edit')
  await as(GRACE_USER, ALL)
  await reject(DELETE, [walkIns], /Empty it first\./, 'not with a folder in it')
  await reject(DELETE, [ohanaSales.id], /Empty it first\./, 'not with somebody in it')
  await q(DELETE, [night])
  check((await bank()).folders.some(f => f.id === night), false, 'an empty folder goes')
  await reject(DELETE, [night], /That folder is not there any more\./, 'deleted once')
  await reject(ADD, [`folder:${night}`, 'X'], /That folder is not there any more\./, 'nothing is made in a deleted folder')

  // ── 7. Move to… ───────────────────────────────────────────────────────────
  const MOVE = `SELECT public.hiring_bank_move($1, $2)`
  const historyOf = talent => q(`SELECT what, note FROM public.hiring_talent_events WHERE talent_id = $1 ORDER BY id`, [talent])
  await as(GRACE_USER, CREATE)
  await reject(MOVE, [ali, `dept:${CARRES}:Sales`], /Hiring · Edit is required/, 'moving asks Edit')
  await as(GRACE_USER, ALL)
  await reject(MOVE, [ali, 'root'], /Pick a company, a department or a folder\./, 'not to the top itself')
  await reject(MOVE, [ali, `talent:${ahmad}`], /A person's folder is their record/, 'not into a person')
  await q(MOVE, [ali, `dept:${CARRES}:Sales`])
  check(await placeOf(ali), `dept:${CARRES}:Sales`, 'moved')
  check((await historyOf(ali)).at(-1), { what: 'Moved', note: 'Carres › Sales' }, 'on their history, the place in words')
  const before = (await historyOf(ali)).length
  await q(MOVE, [ali, `dept:${CARRES}:SALES`])
  check((await historyOf(ali)).length, before, 'moved where they are: nothing written')
  await q(MOVE, [ali, `folder:${senior}`])
  check((await historyOf(ali)).at(-1).note, 'Carres › Sales › Senior', 'a folder in a department, from the top')
  await q(MOVE, [ali, `folder:${acmeOps}`])
  check((await historyOf(ali)).at(-1).note, 'Acme › Ops', 'a folder HR made at the top')
  await q(MOVE, [ali, 'company:hv'])
  check([await placeOf(ali), (await historyOf(ali)).at(-1).note], ['company:hv', 'HOUZS Venture'], 'a company itself')
  await reject(MOVE, [oldPlain, 'company:hv'], /That talent is not in the bank any more/, 'a removed talent is not moved')
  await reject(DELETE, [ohanaSales.id], /Empty it first\./, 'Ben is still in Ohana › Sales: it stays')
  await q(MOVE, [ben, `folder:${ohana.id}`])
  await q(DELETE, [ohanaSales.id])
  check((await bank()).folders.some(f => f.id === ohanaSales.id), false, 'emptied, it goes')
  const oldFolder = await add('company:hv', 'Leavers')
  await q(MOVE, [ben, `folder:${oldFolder}`])
  await q(`SELECT public.hiring_talent_remove($1)`, [ben])
  await q(DELETE, [oldFolder])
  check((await bank()).folders.some(f => f.id === oldFolder), false, 'somebody removed from the bank keeps no folder')

  // ── 8. + New › Add talent, in a place ─────────────────────────────────────
  const ADD_TALENT = `SELECT public.hiring_bank_add_talent($1, $2, '011', 'x@y', $3, 'Good at fairs', $4)`
  const types = (await one(`SELECT public.hiring_board()`)).fileTypes
  const RESUME = types.find(t => t.builtin === 'resume').id
  const ELLA_CV = `files/${id(801)}/Ella_CV.pdf`
  await put(ELLA_CV)
  await as(GRACE_USER, VIEW)
  await reject(ADD_TALENT, [`dept:${CARRES}:Sales`, 'Ella', 'Promoter', null], /Hiring · Create is required/, 'View adds nobody')
  await as(GRACE_USER, CREATE)
  await reject(ADD_TALENT, ['root', 'Ella', 'Promoter', null], /Open a company, a department or a folder first\./, 'not at the very top')
  await reject(ADD_TALENT, [`dept:${CARRES}:Sales`, ' ', 'Promoter', null], /Add a name and the position they fit\./, 'a name and a position')
  const ella = await one(ADD_TALENT, [`dept:${CARRES}:Sales`, 'Ella', 'Promoter', JSON.stringify([{ path: ELLA_CV, name: 'Ella_CV.pdf', type: RESUME }])])
  const ellaRow = (await q(`SELECT department, position, phone, email, notes, from_request FROM public.hiring_talents WHERE id = $1`, [ella]))[0]
  check([await placeOf(ella), ellaRow.department, ellaRow.position, ellaRow.from_request], [`dept:${CARRES}:Sales`, 'Sales', 'Promoter', null],
    'added where it was pressed, filed under that department')
  check((await one(`SELECT public.hiring_board()`)).talents.find(t => t.id === ella).files.map(f => [f.type, f.name]), [['Résumé', 'Ella_CV.pdf']],
    'with their files, each with its type')
  check(await historyOf(ella), [{ what: 'Added to Talent Bank', note: 'Carres › Sales' }], 'their history says where')
  const fern = await one(ADD_TALENT, [`folder:${senior}`, 'Fern', 'Promoter', null])
  check([await placeOf(fern), await one(`SELECT department FROM public.hiring_talents WHERE id = $1`, [fern])], [`folder:${senior}`, 'Sales'],
    'in a folder of a department: filed under the department')
  const gus = await one(ADD_TALENT, [`folder:${acmeOps}`, 'Gus', 'Driver', null])
  check(await one(`SELECT department FROM public.hiring_talents WHERE id = $1`, [gus]), 'Ops', 'in a folder with no department above: the folder’s own name')
  const hal = await one(ADD_TALENT, [`company:${HOOKKA}`, 'Hal', 'Manager', null])
  check(await one(`SELECT department FROM public.hiring_talents WHERE id = $1`, [hal]), 'Hookka', 'in a company itself: the company’s name')
  check((await historyOf(hal))[0].note, 'Hookka', '…and in words')

  // ── 9. Files kept in a place ──────────────────────────────────────────────
  const FILE_ADD = `SELECT public.hiring_bank_file_add($1, $2, $3, 'application/pdf', 2048)`
  const POSTER = `files/${id(802)}/Job_poster.pdf`
  await as(GRACE_USER, VIEW)
  await reject(FILE_ADD, ['root', POSTER, 'Job_poster.pdf'], /Hiring · Create is required/, 'View files nothing')
  await as(GRACE_USER, CREATE)
  await reject(FILE_ADD, ['root', `resumes/${id(803)}/x.pdf`, 'x.pdf'], /That file did not arrive\. Please upload it again\./, 'only under files/')
  await reject(FILE_ADD, ['root', POSTER, 'Job_poster.pdf'], /That file did not arrive/, 'only once it is in the bucket')
  await reject(FILE_ADD, ['root', ELLA_CV, 'again.pdf'], /That file is already on a record\./, 'not an object already on a record')
  await reject(FILE_ADD, [`talent:${ella}`, POSTER, 'x.pdf'], /A person's folder is their record/, 'not in a person’s folder')
  await put(POSTER, 3)
  const poster = await one(FILE_ADD, [`folder:${walkIns}`, POSTER, ' '])
  b = await bank()
  check(b.files.map(f => [f.id, f.name, f.contentType, Number(f.size), f.parent, f.addedBy]),
    [[poster, 'Job_poster.pdf', 'application/pdf', 2048, `folder:${walkIns}`, 'Grace Lim']], 'kept in its folder, named after its object when not named')
  await reject(FILE_ADD, ['root', POSTER, 'twice.pdf'], /That file is already on a record\./, 'one object, one place')
  const MAP = `files/${id(804)}/Fair_map.png`
  await put(MAP)
  const map = await one(FILE_ADD, ['root', MAP, 'Fair map.png'])
  check((await bank()).files.find(f => f.id === map).parent, 'root', 'a file at the very top too')
  check(await one(`SELECT public.hiring_file_path('bank', $1)`, [poster]), { path: POSTER, name: 'Job_poster.pdf' }, 'it opens as every hiring file does')
  check(await one(`SELECT public.hiring_file_in_use($1)`, [POSTER]), true, 'while it is kept, the bucket keeps its object')
  check((await one(`SELECT public.hiring_leftovers(200)`)).includes(POSTER), false, 'however old it is, it is no leftover')
  await as(GRACE_USER, ALL)
  await reject(DELETE, [walkIns], /Empty it first\./, 'a folder with a file in it stays')
  await as(GRACE_USER, CREATE)
  await reject(`SELECT public.hiring_bank_file_delete($1)`, [poster], /Hiring · Edit is required/, 'deleting a file asks Edit')
  await as(GRACE_USER, ALL)
  check(await one(`SELECT public.hiring_bank_file_delete($1)`, [poster]), { orphans: [POSTER] }, 'deleted: its object is answered, nobody names it')
  await reject(`SELECT public.hiring_bank_file_delete($1)`, [poster], /That file is not there any more\./, 'deleted once')
  check(await one(`SELECT public.hiring_file_in_use($1)`, [POSTER]), false, 'the bucket may let it go')
  check((await one(`SELECT public.hiring_leftovers(200)`)).includes(POSTER), true, 'a day old and named by nobody: a leftover')
  check(await one(`SELECT public.hiring_file_path('bank', $1)`, [poster]), null, 'nothing to open')
  await q(DELETE, [walkIns])
  check((await bank()).folders.some(f => f.id === walkIns), false, 'its file gone, the folder may go')

  // ── 10. Who may call what ─────────────────────────────────────────────────
  const PUBLIC_FNS = ['public.hiring_bank()', 'public.hiring_bank_folder_add(text, text)', 'public.hiring_bank_folder_rename(uuid, text)',
    'public.hiring_bank_folder_delete(uuid)', 'public.hiring_bank_move(uuid, text)',
    'public.hiring_bank_add_talent(text, text, text, text, text, text, jsonb)', 'public.hiring_bank_file_add(text, text, text, text, bigint)',
    'public.hiring_bank_file_delete(uuid)', 'public.hiring_bank_folder_move(uuid, text)', 'public.hiring_bank_move_all(text, text)',
    'public.guest_link_rename_department(uuid, text, text)']
  for (const fn of PUBLIC_FNS) {
    check(await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), true, `${fn} is a signed-in user's`)
    check(await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [fn]), false, `${fn} is not the publishable key's`)
  }
  for (const fn of ['public.hiring_bank_at(text, uuid, text, uuid)', 'public.hiring_bank_hq_departments()', 'public.hiring_bank_departments(uuid)',
    'public.hiring_bank_place(text)', 'public.hiring_bank_name_taken(text, uuid, text, uuid, text, uuid)', 'public.hiring_bank_label(text, uuid, text, uuid)',
    'public.hiring_bank_dept_of(text, uuid, text, uuid)', 'public.hiring_bank_locate(text, text, uuid)', 'public.hiring_bank_home(text, text)']) {
    check(await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), false, `${fn} is internal`)
    check(await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [fn]), false, `${fn} is not the publishable key's`)
  }
  for (const t of ['hiring_bank_folders', 'hiring_bank_files']) {
    check(await one(`SELECT has_table_privilege('authenticated', $1, 'SELECT')`, [`public.${t}`]), false, `${t} is not read straight`)
    check(await one(`SELECT relrowsecurity FROM pg_class WHERE relname = $1`, [t]), true, `${t} has RLS on`)
  }

  // ── 11. Each write asks the Talent Bank's page first ──────────────────────
  const WRITES = {
    'hiring_bank_folder_add(text, text)': 'hiring.create',
    'hiring_bank_folder_rename(uuid, text)': 'hiring.edit',
    'hiring_bank_folder_delete(uuid)': 'hiring.edit',
    'hiring_bank_move(uuid, text)': 'hiring.edit',
    'hiring_bank_add_talent(text, text, text, text, text, text, jsonb)': 'hiring.create',
    'hiring_bank_file_add(text, text, text, text, bigint)': 'hiring.create',
    'hiring_bank_file_delete(uuid)': 'hiring.edit',
    'hiring_bank_folder_move(uuid, text)': 'hiring.edit',
    'hiring_bank_move_all(text, text)': 'hiring.edit',
  }
  for (const [sig, want] of Object.entries(WRITES)) {
    const src = await one(`SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${sig}`])
    const after = src.slice(src.search(/\bBEGIN\b/i) + 'BEGIN'.length).trimStart()
    check(after.startsWith(`PERFORM public.tab_write_guard(ARRAY['/hiring/talent'], ARRAY['${want}']);`), true, `${sig} asks /hiring/talent for ${want} first`)
  }
  check(await one(`SELECT prosrc LIKE '%tab_write_guard%' FROM pg_proc WHERE proname = 'hiring_bank'`), false, 'the read asks no page (a View narrows nothing)')
  await q(`DELETE FROM guard_calls`)
  await as(GRACE_USER, ALL)
  const rugs = await add('root', 'Rugs')
  await q(RENAME, [rugs, 'Rugs & mats'])
  await q(DELETE, [rugs])
  check(await q(`SELECT pages, wants FROM guard_calls ORDER BY n`), [
    { pages: ['/hiring/talent'], wants: ['hiring.create'] },
    { pages: ['/hiring/talent'], wants: ['hiring.edit'] },
    { pages: ['/hiring/talent'], wants: ['hiring.edit'] },
  ], 'and the guard is asked when they run')

  // ── Production's bodies, one statement swapped each — once ────────────────
  for (const [fn, needle] of [['hiring_file_in_use', 'hiring_bank_files'], ['hiring_leftovers', 'hiring_bank_files'], ['hiring_orphaned', 'hiring_bank_files'],
    ['hiring_take_upload', 'hiring_bank_files'], ['hiring_file_path', "p_kind = 'bank'"]]) {
    const src = await one(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fn])
    check(src.split(needle).length - 1, 1, `${fn} learned the Talent Bank's files, once`)
  }
  for (const sig of [...Object.keys(WRITES), 'hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb)']) {
    const src = await one(`SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${sig}`])
    check(src.split('tab_write_guard').length - 1, 1, `${sig} asks its page once`)
  }

  // ── 12. Save to Talent Bank from a candidate asks the request page ────────
  const SAVE_SIG = 'public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb)'
  const saveSrc = await one(`SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [SAVE_SIG])
  check(saveSrc.slice(saveSrc.search(/\bBEGIN\b/i) + 'BEGIN'.length).trimStart()
    .startsWith("PERFORM public.tab_write_guard(ARRAY['/hiring/requests/[id]'], ARRAY['hiring.create']);"), true, 'it asks the request page first')
  const unaCand = await candidate(carresReq, 'Una')
  await q(`DELETE FROM guard_calls`)
  const una = await save('Una', 'Sales', unaCand)
  check(await q(`SELECT pages, wants FROM guard_calls ORDER BY n`), [{ pages: ['/hiring/requests/[id]'], wants: ['hiring.create'] }], '…when it runs')
  check(await placeOf(una), `dept:${CARRES}:Sales`, '…and still lands where the request came from')

  // ── 13. A company renamed in Admin › Guest Link is still found ────────────
  const hireSrc = await one(`SELECT prosrc FROM pg_proc WHERE oid = 'public.guest_link_hire(text, uuid, text, jsonb, text, text)'::regprocedure`)
  const RECORD = 'UPDATE public.hiring_requests SET requester_sub_id = v_sub.id WHERE id = v_id;'
  check(hireSrc.split(RECORD).length - 1, 1, 'the guest link records the company a request came from, once')
  check(/UPDATE public\.hiring_requests SET requester_sub_id = v_sub\.id WHERE id = v_id;\s*RETURN jsonb_build_object\('id', v_id, 'position'/.test(hireSrc), true,
    '…right before it answers the guest')
  check(await q(`SELECT company, sub, dept FROM public.hiring_bank_home($1, 'Ignored')`, [preCarres]), [{ company: 'Carres', sub: CARRES, dept: 'Sales' }],
    'where a guest request’s talent belongs: the company’s name and id, the request’s department')
  await q(`UPDATE guest_link_subsidiaries SET name = 'Carres Sdn Bhd' WHERE id = $1`, [CARRES])
  const roots = async () => (await bank()).folders.filter(f => f.parent === 'root').length
  const roots0 = await roots()
  const jun = await save('Jun', 'Sales', await candidate(preCarres, 'Jun'))
  check([await placeOf(jun), await roots()], [`dept:${CARRES}:Sales`, roots0], 'a candidate of a request filed before the rename: that company’s department, no folder for the old name')
  check((await historyOf(jun))[0].what, 'Saved to Talent Bank', 'saved as before')
  await q(`UPDATE guest_link_subsidiaries SET name = 'Carres' WHERE id = $1`, [CARRES])
  await as(null, [])
  const viaLink = (await one(`SELECT public.guest_link_hire('hv-ABCDEFGH', $1, 'Wong Mei Yee', $2, NULL, NULL)`, [HOOKKA, { ...ANSWERS, dept: 'Management' }])).id
  await as(GRACE_USER, ALL)
  check(await subOfRequest(viaLink), HOOKKA, 'a request sent through the link keeps its company’s id')

  // ── 14. A department taken off the list while somebody is still in it ─────
  const kim = await save('Kim', 'Management', await candidate(viaLink, 'Kim'))
  check(await placeOf(kim), `dept:${HOOKKA}:Management`, 'saved while Hookka lists Management')
  await q(`UPDATE guest_link_subsidiaries SET departments = '{}' WHERE id = $1`, [HOOKKA])
  const folders2 = (await bank()).folders.length
  const lee = await save('Lee', 'Management', await candidate(viaLink, 'Lee'))
  check([await placeOf(lee), (await bank()).folders.length], [`dept:${HOOKKA}:Management`, folders2],
    'taken off the list: the next one joins Kim there — no folder of its name made')
  await q(`UPDATE guest_link_subsidiaries SET name = 'Hookka Group' WHERE id = $1`, [HOOKKA])
  const mo = await save('Mo', 'Management', await candidate(viaLink, 'Mo'))
  check([await placeOf(mo), (await bank()).folders.length], [`dept:${HOOKKA}:Management`, folders2], 'renamed as well: found by id, still together')

  // ── 15. A folder moved takes everything in it ─────────────────────────────
  const FMOVE = `SELECT public.hiring_bank_folder_move($1, $2)`
  const box = await add('root', 'Box')
  const inner = await add(`folder:${box}`, 'Inner')
  await q(MOVE, [hal, `folder:${box}`])
  const BOX_FILE = `files/${id(805)}/Box_list.pdf`
  await put(BOX_FILE)
  const boxFile = await one(FILE_ADD, [`folder:${inner}`, BOX_FILE, 'Box_list.pdf'])
  await as(GRACE_USER, CREATE)
  await reject(FMOVE, [box, `dept:${CARRES}:Sales`], /Hiring · Edit is required/, 'moving a folder asks Edit')
  await as(GRACE_USER, ALL)
  await reject(FMOVE, [box, `folder:${box}`], /A folder cannot go inside itself\./, 'not into itself')
  await reject(FMOVE, [box, `folder:${inner}`], /A folder cannot go inside itself\./, 'nor into a folder inside it')
  await reject(FMOVE, [id(999), 'root'], /That folder is not there any more\./, 'a folder that is there')
  await reject(FMOVE, [box, 'dept:hv:Nowhere'], /That department is not there any more\./, 'to a place that is there')
  await q(FMOVE, [box, `dept:${CARRES}:sales`])
  b = await bank()
  check([b.folders.find(f => f.id === box).parent, b.folders.find(f => f.id === inner).parent, b.places[hal], b.files.find(f => f.id === boxFile).parent],
    [`dept:${CARRES}:Sales`, `folder:${box}`, `folder:${box}`, `folder:${inner}`], 'moved — its folder, its people and its files with it')
  await q(FMOVE, [box, `dept:${CARRES}:SALES`])
  check((await bank()).folders.find(f => f.id === box).parent, `dept:${CARRES}:Sales`, 'where it is already: nothing changes')
  const rootSales = await add('root', 'Sales')
  await reject(FMOVE, [rootSales, `company:${CARRES}`], /Sales is there already — rename one first\./, 'not where the company lists a department of its name')
  const carresNamed = await add(`folder:${inner}`, 'Carres')
  await reject(FMOVE, [carresNamed, 'root'], /Carres is there already — rename one first\./, 'not to the top beside a company of its name')
  const hvNamed = await add(`folder:${inner}`, 'HOUZS Venture')
  await reject(FMOVE, [hvNamed, 'root'], /HOUZS Venture is there already — rename one first\./, '…nor beside HOUZS Venture')
  await add(`dept:${CARRES}:Sales`, 'inner')
  await reject(FMOVE, [inner, `dept:${CARRES}:Sales`], /Inner is there already — rename one first\./, 'nor beside a folder of its name')
  await q(FMOVE, [rootSales, 'company:hv'])
  check((await bank()).folders.find(f => f.id === rootSales).parent, 'company:hv', 'a folder moves into a company')

  // ── 16. Move everyone out of a department ─────────────────────────────────
  const ALL_MOVE = `SELECT public.hiring_bank_move_all($1, $2)`
  const MGMT = `dept:${HOOKKA}:Management`
  const interviews = await add(MGMT, 'Interviews')
  const deep = await add(`folder:${interviews}`, 'Deep')
  const MGMT_FILE = `files/${id(806)}/Org_chart.pdf`
  await put(MGMT_FILE)
  const mgmtFile = await one(FILE_ADD, [MGMT, MGMT_FILE, 'Org_chart.pdf'])
  await as(GRACE_USER, CREATE)
  await reject(ALL_MOVE, [MGMT, `company:${HOOKKA}`], /Hiring · Edit is required/, 'moving everyone asks Edit')
  await as(GRACE_USER, ALL)
  await reject(ALL_MOVE, [`company:${HOOKKA}`, 'company:hv'], /Move everyone out of a department\./, 'out of a department only')
  await reject(ALL_MOVE, [`folder:${box}`, 'company:hv'], /Move everyone out of a department\./, '…not a folder')
  await reject(ALL_MOVE, [MGMT, 'root'], /Pick a company, a department or a folder\./, 'not to the top')
  await reject(ALL_MOVE, [MGMT, `dept:${HOOKKA}:MANAGEMENT`], /They are there already\./, 'not where they are')
  await reject(ALL_MOVE, [MGMT, `folder:${deep}`], /Pick a place outside this department\./, 'not into a folder of the department itself')
  const clash = await add(`company:${HOOKKA}`, 'interviews')
  await reject(ALL_MOVE, [MGMT, `company:${HOOKKA}`], /Interviews is there already — rename one first\./, 'not beside a folder of the same name')
  await q(DELETE, [clash])
  const moved = await one(ALL_MOVE, [MGMT, `company:${HOOKKA}`])
  check(moved, { people: 3, folders: 1, files: 1, to: 'Hookka Group' }, 'everyone, the folder and the file — and where they went')
  b = await bank()
  check([kim, lee, mo].map(t => b.places[t]), [`company:${HOOKKA}`, `company:${HOOKKA}`, `company:${HOOKKA}`], 'the people are there')
  check([b.folders.find(f => f.id === interviews).parent, b.folders.find(f => f.id === deep).parent, b.files.find(f => f.id === mgmtFile).parent],
    [`company:${HOOKKA}`, `folder:${interviews}`, `company:${HOOKKA}`], 'the folder (with what is in it) and the file too')
  check((await historyOf(kim)).at(-1), { what: 'Moved', note: 'Hookka Group' }, 'each person’s History says Moved, and where')
  await reject(ADD, [MGMT, 'X'], /That department is not there any more\./, 'emptied and no longer listed: the department is no place any more')
  check(await one(ALL_MOVE, [`dept:${CARRES}:Marketing`, 'company:hv']), { people: 0, folders: 0, files: 0, to: 'HOUZS Venture' }, 'an empty department: nothing to move')

  // ── 17. A department renamed in Admin › Guest Link takes its people along ─
  const DC = id(504)
  await q(`INSERT INTO guest_link_subsidiaries (id, code, name, departments, sort_order) VALUES ($1, 'DC', 'Dream Crafter', '{Interior,Renovation,Sales}', 5)`, [DC])
  const RENAME_DEPT = `SELECT public.guest_link_rename_department($1, $2, $3)`
  const tia = await one(ADD_TALENT, [`dept:${DC}:Interior`, 'Tia', 'Designer', null])
  const plans = await add(`dept:${DC}:Interior`, 'Plans')
  const DC_FILE = `files/${id(807)}/Moodboard.pdf`
  await put(DC_FILE)
  const dcFile = await one(FILE_ADD, [`dept:${DC}:Interior`, DC_FILE, 'Moodboard.pdf'])
  await reject(RENAME_DEPT, [DC, 'Interior', 'Interior Design'], /Changing the guest link needs Guest link · Edit\./, 'it is the guest link’s to change')
  await as(GRACE_USER, [...ALL, 'guest_link.edit'])
  await reject(RENAME_DEPT, [OLDCO, 'Sales', 'Selling'], /That subsidiary is no longer there\./, 'not a removed company’s')
  await reject(RENAME_DEPT, [DC, 'Interior', '  '], /Name the department\./, 'a name')
  await reject(RENAME_DEPT, [DC, 'Interior', 'x'.repeat(61)], /Keep a department under 60 characters\./, 'sixty characters at most')
  await reject(RENAME_DEPT, [DC, 'Kitchen', 'Kitchens'], /That department is no longer there\./, 'one the company lists')
  await reject(RENAME_DEPT, [DC, 'Interior', 'renovation'], /renovation is on the list already\./, 'not to another one’s name, whatever its case')
  const renamed = await one(RENAME_DEPT, [DC, ' interior ', 'Interior Design'])
  check(renamed.departments, ['Interior Design', 'Renovation', 'Sales'], 'renamed in its own place on the list')
  b = await bank()
  check([b.places[tia], b.folders.find(f => f.id === plans).parent, b.files.find(f => f.id === dcFile).parent],
    [`dept:${DC}:Interior Design`, `dept:${DC}:Interior Design`, `dept:${DC}:Interior Design`], 'its people, folders and files go with the new name')
  check((await one(RENAME_DEPT, [DC, 'Interior Design', 'INTERIOR DESIGN'])).departments, ['INTERIOR DESIGN', 'Renovation', 'Sales'],
    'a change of case alone is a rename too')
  check((await bank()).places[tia], `dept:${DC}:INTERIOR DESIGN`, '…and they follow it')
  await q(`UPDATE guest_link_subsidiaries SET departments = departments || '{Kitchen}' WHERE id = $1`, [DC])
  await add(`dept:${DC}:Kitchen`, 'plans')
  await q(`UPDATE guest_link_subsidiaries SET departments = array_remove(departments, 'Kitchen') WHERE id = $1`, [DC])
  await reject(RENAME_DEPT, [DC, 'INTERIOR DESIGN', 'Kitchen'], /The Talent Bank has a folder of one name in both — rename one there first\./,
    'not onto a department whose folders it would collide with')
  check((await bank()).subs.find(s => s.id === DC).departments, ['INTERIOR DESIGN', 'Renovation', 'Sales'], 'refused: the list as it was')

  console.log(`talent bank drive: ${checks} checks passed`)
} finally {
  await db.close()
}
