// Local PostgreSQL regression for 20261024235300 (2026-10-24, Hiring › Talent
// Bank: the reasons are HR's to manage — asked whether HR should add, rename
// and turn off the reasons like File types, the user: "1, yes do with same").
// The Hiring migrations, the Drive, the Bin and 20261024233700 run VERBATIM
// over validate-talent-bank-reason.mjs's stand-ins; the two helpers the
// migration makes again are first checked to be production's (its own md5
// check, line endings aside). What is under test: the five become rows, their
// keys kept, and a talent's reason names a row; the board answers the list
// with how many people each keeps; + Add (a name it has is that one, turned
// back on if it was off), ✎ rename, On / Off (never the last one on); a reason
// turned off is given to nobody new while those kept with it keep it; the
// words in every trail are the list's; who may call what; each write asks its
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

// The bodies the migration makes again, as production ran them on 2026-10-24 (md5 of prosrc).
const PRODUCTION = {
  'hiring_candidate_stage(uuid, text)': '6c5b68daa8be872653994b577be15e20',
  'hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb)': '2b83be6c8ebf01b980e231911a00b41b',
  'hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[])': '43f74811663bf438a913f57364f9370d',
  'hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb)': 'd39cebad0d5cb3e9a7013070c4c14e40',
  'hiring_bank_add_talent(text, text, text, text, text, text, jsonb)': '217dcfc60c5df215b37c75f6d5a3bf4b',
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
    -- The audit log's register: here it only notes what it was told.
    CREATE TABLE audit_calls(n bigserial PRIMARY KEY, t text, label text, area text, reads text[], mode text, keys text[], labels text[]);
    CREATE FUNCTION public.audit_register(p_table text, p_label text, p_area text, p_read text[], p_mode text DEFAULT 'all',
      p_keys text[] DEFAULT '{}', p_labels text[] DEFAULT '{}', p_ignore text[] DEFAULT '{}', p_omit text[] DEFAULT '{}',
      p_diff boolean DEFAULT false, p_salary text[] DEFAULT '{}', p_nric text[] DEFAULT '{}', p_bank text[] DEFAULT '{}',
      p_needs text DEFAULT NULL, p_actor_column text DEFAULT NULL, p_reason text DEFAULT NULL)
      RETURNS text LANGUAGE sql AS $$
        INSERT INTO audit_calls (t, label, area, reads, mode, keys, labels) VALUES (p_table, p_label, p_area, p_read, p_mode, p_keys, p_labels);
        SELECT p_table
      $$;
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
  await q(`INSERT INTO guest_link_subsidiaries (id, code, name, departments, sort_order) VALUES ($1, 'CAR', 'Carres', '{Marketing,Sales}', 1)`, [CARRES])

  for (const f of ['20261011080000_hiring.sql', '20261011080100_hiring_file_reads.sql', '20261011080200_hiring_reconsider_declined.sql',
    '20261011160000_hiring_files.sql', '20261011210000_hiring_file_types_manage.sql']) {
    await load(f)
  }
  let n = 900
  /** A fresh object's path, put in the bucket — what the browser's upload leaves. */
  const upload = async name => {
    const path = `files/${id(++n)}/${name}`
    await q(`INSERT INTO storage.objects (bucket_id, name) VALUES ('hiring-files', $1)`, [path])
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
  await load('20261013061500_talent_bank_bin.sql')
  // Production's copies of the five writes made again (they carry the page guards mig 20261011220100 put in).
  await db.exec((await readFile(new URL('./talent-bank-reason-production.sql', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'))


  await as(GRACE_USER, ALL)
  const portalReq = await one(`SELECT public.hiring_submit($1, $2)`, [KARJUN, ANSWERS])
  const ADD = `SELECT public.hiring_candidate_add($1, $2, '0123', $3, $4, $5, NULL, NULL, $6)`
  const candidate = async (req, name, { stage = 'shortlisted', note = '', answers = {}, files = null } = {}) =>
    one(ADD, [req, name, stage, note, answers, files && JSON.stringify(files)])
  const STAGE = `SELECT public.hiring_candidate_stage($1, $2, $3)`
  const stage = (c, s, reason = null) => q(STAGE, [c, s, reason])
  const cand = c => q(`SELECT stage, talent_id FROM public.hiring_candidates WHERE id = $1`, [c]).then(r => r[0])
  const reasonOf = t => one(`SELECT reason FROM public.hiring_talents WHERE id = $1`, [t])
  const historyOf = t => q(`SELECT what, note FROM public.hiring_talent_events WHERE talent_id = $1 ORDER BY id`, [t])
  const board = () => one(`SELECT public.hiring_board()`)
  const BANK_ADD = `SELECT public.hiring_bank_add_talent('company:hv', $1, '019', '', 'Promoter', '', NULL, $2)`
  const SET = `SELECT public.hiring_talent_set_reason($1, $2)`

  // ── Before: 20261024233700, and people kept with its five ─────────────────
  await load('20261024233700_talent_bank_reason.sql')
  const aina = await candidate(portalReq, 'Aina', { stage: 'appointment' })
  await stage(aina, 'rejected', 'failed_interview')
  const ainaT = (await cand(aina)).talent_id
  const amir = await one(BANK_ADD, ['Amir', 'not_right_now'])
  const old = await one(`SELECT public.hiring_bank_add_talent('company:hv', 'Old', '', '', 'Driver', '', NULL, NULL)`)

  // ── The migration ─────────────────────────────────────────────────────────
  await load('20261024235300_talent_bank_reasons_managed.sql')

  // ── 1. The five are rows, their keys kept ─────────────────────────────────
  check(await q(`SELECT id, name, sort, retired_at IS NULL AS live FROM public.hiring_bank_reasons ORDER BY sort`), [
    { id: 'not_shortlisted', name: 'Not shortlisted', sort: 1, live: true },
    { id: 'failed_interview', name: 'Failed interview', sort: 2, live: true },
    { id: 'not_right_now', name: 'Not right now', sort: 3, live: true },
    { id: 'declined_offer', name: 'Declined offer', sort: 4, live: true },
    { id: 'other', name: 'Other', sort: 5, live: true },
  ], 'the five it began with, in their order, under the keys every talent and the stage’s default name')
  check([await reasonOf(ainaT), await reasonOf(amir), await reasonOf(old)], ['failed_interview', 'not_right_now', null], 'everybody kept keeps their reason')
  check(await one(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hiring_bank_reasons'::regclass`), true, 'its rows are behind RLS')
  for (const role of ['authenticated', 'anon']) {
    check(await one(`SELECT has_table_privilege($1, 'public.hiring_bank_reasons', 'SELECT') OR has_table_privilege($1, 'public.hiring_bank_reasons', 'INSERT')
      OR has_table_privilege($1, 'public.hiring_bank_reasons', 'UPDATE') OR has_table_privilege($1, 'public.hiring_bank_reasons', 'DELETE')`, [role]),
      false, `${role} reads and writes it only through the board and the functions`)
  }
  check(await q(`SELECT t, label, area, reads, mode, keys, labels FROM audit_calls WHERE t = 'hiring_bank_reasons'`), [
    { t: 'hiring_bank_reasons', label: 'Talent Bank reasons', area: 'People', reads: ['hiring'], mode: 'all', keys: ['id'], labels: ['name'] },
  ], 'the audit log keeps its changes, read as Hiring’s')
  await reject(`UPDATE public.hiring_talents SET reason = 'bored' WHERE id = $1`, [amir], /foreign key/, 'a talent’s reason names a row of the list')

  // ── 2. The board answers the list ─────────────────────────────────────────
  let bd = await board()
  check(bd.talentReasons, [
    { id: 'not_shortlisted', name: 'Not shortlisted', active: true, used: 0 },
    { id: 'failed_interview', name: 'Failed interview', active: true, used: 1 },
    { id: 'not_right_now', name: 'Not right now', active: true, used: 1 },
    { id: 'declined_offer', name: 'Declined offer', active: true, used: 0 },
    { id: 'other', name: 'Other', active: true, used: 0 },
  ], 'the board: each reason, on or off, with the people kept with it')
  const boardSrc = await one(`SELECT prosrc FROM pg_proc WHERE oid = 'public.hiring_board()'::regprocedure`)
  check(boardSrc.split(`'talentReasons'`).length - 1, 1, 'hiring_board() answers the list, once')

  // ── 3. + Add reason ───────────────────────────────────────────────────────
  const ADD_REASON = `SELECT public.hiring_bank_reason_add($1)`
  await as(GRACE_USER, CREATE)
  await reject(ADD_REASON, ['Salary too high'], /Hiring · Edit is required/, 'adding one asks Hiring · Edit')
  await as(GRACE_USER, ALL)
  await reject(ADD_REASON, ['  '], /Name the reason\./, 'a reason has a name')
  await reject(ADD_REASON, ['x'.repeat(61)], /Name the reason\./, '…of sixty letters at most')
  const salary = await one(ADD_REASON, ['  Salary too high '])
  check([typeof salary, salary.length > 8, await one(ADD_REASON, ['salary TOO high'])], ['string', true, salary], 'made once: the same name again — any case, any spaces — is that one')
  check(await one(ADD_REASON, ['not right now']), 'not_right_now', 'one of the five named again is that one')
  bd = await board()
  check(bd.talentReasons.at(-1), { id: salary, name: 'Salary too high', active: true, used: 0 }, 'the new one comes last, on, nobody kept with it yet')

  // …and is given like any other — the trails in its words.
  const bob = await candidate(portalReq, 'Bob', { stage: 'offered' })
  await stage(bob, 'rejected', salary)
  const bobT = (await cand(bob)).talent_id
  check([await reasonOf(bobT), (await historyOf(bobT))[0].note], [salary, `From ${portalReq} · Sales Executive · Not selected · Salary too high`],
    'Not selected with the new reason: kept with it, their History in its words')
  const cara = await one(BANK_ADD, ['Cara', salary])
  check((await historyOf(cara))[0].note, 'HOUZS Venture · Salary too high', '+ New › Add talent takes it too')
  await reject(BANK_ADD, ['Dan', 'bored'], /Pick why they are kept\./, 'a reason not on the list is refused')

  // ── 4. ✎ Rename ───────────────────────────────────────────────────────────
  const RENAME = `SELECT public.hiring_bank_reason_rename($1, $2)`
  await as(GRACE_USER, CREATE)
  await reject(RENAME, [salary, 'Asked too much'], /Hiring · Edit is required/, 'renaming asks Hiring · Edit')
  await as(GRACE_USER, ALL)
  await reject(RENAME, [salary, ' '], /Name the reason\./, 'a name is needed')
  await reject(RENAME, [salary, 'OTHER'], /That reason is already there\./, 'a name another has — any case — is refused')
  await reject(RENAME, ['gone', 'Moved away'], /That reason is not there any more/, 'one that is not there is said so')
  await q(RENAME, [salary, 'Salary too high'])
  await q(RENAME, [salary, 'Asked too much'])
  await q(RENAME, ['failed_interview', 'Interview failed'])
  bd = await board()
  check(bd.talentReasons.filter(r => [salary, 'failed_interview'].includes(r.id)).map(r => [r.id, r.name, r.used]),
    [['failed_interview', 'Interview failed', 1], [salary, 'Asked too much', 2]], 'the new names; the people kept with each are still theirs')
  check(await one(`SELECT public.hiring_reason_label('failed_interview')`), 'Interview failed', 'the words everywhere are the list’s')
  check((await historyOf(bobT))[0].note.endsWith('Salary too high'), true, 'what the trails already say is left as it was said')
  await q(SET, [bobT, 'failed_interview'])
  check((await historyOf(bobT)).at(-1), { what: 'Reason changed', note: 'Asked too much → Interview failed' }, 'a change after says it in the new words')

  // ── 5. On / Off ───────────────────────────────────────────────────────────
  const ACTIVE = `SELECT public.hiring_bank_reason_set_active($1, $2)`
  await as(GRACE_USER, CREATE)
  await reject(ACTIVE, ['not_right_now', false], /Hiring · Edit is required/, 'turning one off asks Hiring · Edit')
  await as(GRACE_USER, ALL)
  await reject(ACTIVE, ['gone', false], /That reason is not there any more/, 'one that is not there is said so')
  await q(ACTIVE, ['not_right_now', false])
  await q(ACTIVE, ['not_right_now', false])
  bd = await board()
  check(bd.talentReasons.find(r => r.id === 'not_right_now'), { id: 'not_right_now', name: 'Not right now', active: false, used: 1 },
    'off: the board says so, and still counts who is kept with it')
  check([await reasonOf(amir), await one(`SELECT public.hiring_reason_label('not_right_now')`)], ['not_right_now', 'Not right now'],
    'the people kept with it keep it, in its words')
  check(await one(`SELECT retired_by FROM public.hiring_bank_reasons WHERE id = 'not_right_now'`), GRACE_USER, 'who turned it off is kept')
  await reject(BANK_ADD, ['Eve', 'not_right_now'], /Not right now is turned off — pick another reason\./, 'nobody new is given it — Add talent')
  const fay = await candidate(portalReq, 'Fay')
  await reject(STAGE, [fay, 'rejected', 'not_right_now'], /Not right now is turned off/, '…nor Not selected')
  check((await cand(fay)).stage, 'shortlisted', '…and nothing changed')
  await reject(SET, [cara, 'not_right_now'], /Not right now is turned off/, '…nor their page')
  await q(SET, [amir, 'other'])
  check(await reasonOf(amir), 'other', 'somebody kept with it is moved to another as before')

  // The database's own default, for a page that sends no reason, is as the stage says — even one turned off.
  await q(ACTIVE, ['not_shortlisted', false])
  const gus = await candidate(portalReq, 'Gus')
  await stage(gus, 'rejected')
  check(await reasonOf((await cand(gus)).talent_id), 'not_shortlisted', 'no reason sent: the stage’s, as before')

  // Named again: on again.
  check(await one(ADD_REASON, ['Not Right Now']), 'not_right_now', 'a reason turned off, named again, is that one')
  check([(await board()).talentReasons.find(r => r.id === 'not_right_now').active,
    await one(`SELECT retired_by IS NULL FROM public.hiring_bank_reasons WHERE id = 'not_right_now'`)], [true, true], '…turned back on')

  // Never the last one on.
  for (const id of ['failed_interview', 'not_right_now', 'declined_offer', 'other']) await q(ACTIVE, [id, false])
  check((await board()).talentReasons.filter(r => r.active).map(r => r.id), [salary], 'one left on')
  await reject(ACTIVE, [salary, false], /Keep at least one reason on\./, 'the last one on stays on')
  await q(ACTIVE, ['other', true])
  await q(ACTIVE, [salary, false])
  check((await board()).talentReasons.filter(r => r.active).map(r => r.id), ['other'], 'with another on, it may go off')

  // ── 6. Who may call what; each write asks its page first ──────────────────
  for (const sig of ['hiring_bank_reason_add(text)', 'hiring_bank_reason_rename(text, text)', 'hiring_bank_reason_set_active(text, boolean)']) {
    check([await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [`public.${sig}`]),
      await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [`public.${sig}`]),
      await one(`SELECT prosecdef FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${sig}`])], [true, false, true],
      `${sig}: a signed-in session’s, never the stranger’s; it runs as its owner`)
  }
  for (const sig of ['hiring_reason_label(text)', 'hiring_reason_check(text)']) {
    check([await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [`public.${sig}`]),
      await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [`public.${sig}`]),
      await one(`SELECT has_function_privilege('service_role', $1, 'EXECUTE')`, [`public.${sig}`]),
      await one(`SELECT provolatile FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${sig}`])], [false, false, true, 's'],
      `${sig}: the functions’ helper, nobody’s to call — it reads the list now`)
  }
  for (const sig of ['hiring_bank_reason_rename(text, text)', 'hiring_bank_reason_set_active(text, boolean)']) {
    const src = await one(`SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${sig}`])
    check([src.split('tab_write_guard').length - 1,
      src.slice(src.search(/\bBEGIN\b/i) + 'BEGIN'.length).trimStart().startsWith(`PERFORM public.tab_write_guard(ARRAY['/hiring/requests'], ARRAY['hiring.edit']);`)],
    [1, true], `${sig} asks Form settings’ page first, once`)
  }
  check((await one(`SELECT prosrc FROM pg_proc WHERE oid = 'public.hiring_bank_reason_add(text)'::regprocedure`)).includes('tab_write_guard'), false,
    'Add asks no page: it is offered on the request’s page, the Talent Bank and Form settings, which narrows nothing')
  await q(`DELETE FROM guard_calls`)
  await q(RENAME, ['other', 'Other reason'])
  await q(ACTIVE, ['declined_offer', true])
  await q(ADD_REASON, ['Relocating'])
  check(await q(`SELECT pages, wants FROM guard_calls ORDER BY n`), [
    { pages: ['/hiring/requests'], wants: ['hiring.edit'] },
    { pages: ['/hiring/requests'], wants: ['hiring.edit'] },
  ], 'rename and On / Off ask their page when they run')

  console.log(`talent bank reasons managed: ${checks} checks passed`)
} finally {
  await db.close()
}
