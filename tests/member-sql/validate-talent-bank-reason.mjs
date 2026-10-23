// Local PostgreSQL regression for 20261024233700 (2026-10-24, Hiring › Talent
// Bank: why somebody is kept, and a candidate not selected kept there by
// itself — IT-0008: "after the candidate is failed with interview or not
// shortlisted … instead of entirely dissapear the candidate will be placed
// within the Talent Bank"; the user: "包括 upload 的时候，最好能放一个 drop 掉的
// 原因 … 做成一个 dropdown，可以选 type 就好了"). The Hiring migrations, the
// Drive and the Bin run VERBATIM over validate-talent-bank-bin.mjs's stand-ins
// (the roster, storage, the permission check, the guest link's subsidiaries,
// the tab guard); the six bodies the migration makes again are first checked
// to be production's (its own md5 check). What is under test: Not selected —
// by Change status, Edit candidate or Add candidate — keeps the candidate in
// the bank with their files, details and the reason (given, or the one their
// stage says), where Move to Talent Bank would keep them; somebody already in
// the bank takes the reason; Move to Talent Bank and + New › Add talent take
// it; the reason changed on their page; the board answers it; who may call
// what; each write asks its page first. No live I/O.
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

  // ── 0. The bodies made again are production's ─────────────────────────────
  for (const [sig, md5] of Object.entries(PRODUCTION)) {
    check(await one(`SELECT md5(prosrc) FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${sig}`]), md5, `${sig} is production's body before the migration`)
  }

  // Requests and candidates, before the migration: one from the portal (Revenue · IR), one from Carres' Sales.
  await as(GRACE_USER, ALL)
  const portalReq = await one(`SELECT public.hiring_submit($1, $2)`, [KARJUN, ANSWERS])
  await as(null, [])
  const carresReq = await one(`SELECT public.hiring_file_guest_request('Carres', NULL, 'Wong Mei Yee', '012', $1, NULL, NULL)`, [{ ...ANSWERS, dept: 'Sales' }])
  await as(GRACE_USER, ALL)
  const types = (await one(`SELECT public.hiring_board()`)).fileTypes
  const RESUME = types.find(t => t.builtin === 'resume').id
  const IC = types.find(t => t.name === 'IC').id
  const ADD = `SELECT public.hiring_candidate_add($1, $2, '0123', $3, $4, $5, NULL, NULL, $6)`
  const candidate = async (req, name, { stage = 'shortlisted', note = '', answers = {}, files = null } = {}) =>
    one(ADD, [req, name, stage, note, answers, files && JSON.stringify(files)])

  // ── The migration ─────────────────────────────────────────────────────────
  await load('20261024233700_talent_bank_reason.sql')

  const bank = () => one(`SELECT public.hiring_bank()`)
  const board = () => one(`SELECT public.hiring_board()`)
  const placeOf = async talent => (await bank()).places[talent]
  const cand = c => q(`SELECT stage, talent_id FROM public.hiring_candidates WHERE id = $1`, [c]).then(r => r[0])
  const talentRow = t => q(`SELECT name, phone, position, department, from_request, notes, reason, removed_at IS NULL AS live FROM public.hiring_talents WHERE id = $1`, [t]).then(r => r[0])
  const talents = () => one(`SELECT count(*)::int FROM public.hiring_talents`)
  const historyOf = t => q(`SELECT what, note FROM public.hiring_talent_events WHERE talent_id = $1 ORDER BY id`, [t])
  const trailOf = (req, from = 0) => q(`SELECT what, note FROM public.hiring_request_events WHERE request_id = $1 AND id > $2 ORDER BY id`, [req, from])
  const lastTrailId = req => one(`SELECT coalesce(max(id), 0)::int FROM public.hiring_request_events WHERE request_id = $1`, [req])
  const filesOf = t => q(`SELECT path, name, type_id FROM public.hiring_files WHERE talent_id = $1 ORDER BY name`, [t])
  const STAGE = `SELECT public.hiring_candidate_stage($1, $2, $3)`
  const stage = (c, s, reason = null) => q(STAGE, [c, s, reason])

  // ── 1. Not selected keeps them in the Talent Bank ─────────────────────────
  const cv = await upload('Aina_CV.pdf')
  const ic = await upload('Aina_IC.pdf')
  const aina = await candidate(portalReq, 'Aina', {
    stage: 'appointment', note: 'Strong at roadshows', answers: { salary: '3000', transport: 'Yes' },
    files: [{ path: cv, name: 'Aina_CV.pdf', type: RESUME }, { path: ic, name: 'Aina_IC.pdf', type: IC }],
  })
  const before = await lastTrailId(portalReq)
  const talents0 = await talents()
  await stage(aina, 'rejected', 'failed_interview')
  const ainaT = (await cand(aina)).talent_id
  check([(await cand(aina)).stage, typeof ainaT, (await talents()) - talents0], ['rejected', 'string', 1], 'Not selected: the candidate is kept in the Talent Bank, once')
  check(await talentRow(ainaT), {
    name: 'Aina', phone: '0123', position: 'Sales Executive', department: 'Revenue', from_request: portalReq,
    notes: 'Strong at roadshows\nExpected salary (RM): 3000 · Own transport: Yes', reason: 'failed_interview', live: true,
  }, 'their name, phone, what they were up for, HR’s note and their details on the request; the reason given')
  check((await filesOf(ainaT)).map(f => [f.name, f.path, f.type_id]), [['Aina_CV.pdf', cv, RESUME], ['Aina_IC.pdf', ic, IC]], 'every file goes with them, its type kept')
  check(await placeOf(ainaT), 'dept:hv:Revenue', 'kept where Move to Talent Bank keeps a portal request’s candidate: HOUZS Venture › the request’s department')
  check(await trailOf(portalReq, before), [
    { what: 'Candidate status', note: 'Aina → Not selected · Failed interview' },
    { what: 'Saved to Talent Bank', note: 'Aina · Failed interview' },
  ], 'the request’s trail says why, and where they went')
  check(await historyOf(ainaT), [{ what: 'Saved to Talent Bank', note: `From ${portalReq} · Sales Executive · Not selected · Failed interview` }],
    'their History says where they came from and why')
  let bd = await board()
  check(bd.talents.find(t => t.id === ainaT).reason, 'failed_interview', 'the board answers the reason')
  check(bd.requests.find(r => r.id === portalReq).candidates.find(c => c.id === aina).talentId, ainaT, '…and the candidate is in the bank')
  check(await one(`SELECT public.hiring_file_in_use($1)`, [cv]), true, 'the files are named by both records')

  // No reason handed in (the HR app, an older page): the one their stage says.
  for (const [from, want] of [['shortlisted', 'not_shortlisted'], ['appointment', 'failed_interview'], ['offered', 'declined_offer'], ['hired', 'other']]) {
    const c = await candidate(portalReq, `From ${from}`, { stage: from })
    await stage(c, 'rejected')
    check((await talentRow((await cand(c)).talent_id)).reason, want, `Not selected from ${from}, no reason given: ${want}`)
  }
  // An app still sending only the two it always sent is answered the same.
  const oldShape = await candidate(portalReq, 'Old page')
  await q(`SELECT public.hiring_candidate_stage(p_candidate => $1, p_stage => $2)`, [oldShape, 'rejected'])
  check((await talentRow((await cand(oldShape)).talent_id)).reason, 'not_shortlisted', 'called by name without the reason: kept, the stage’s reason')

  // Not selected again: nothing new. Back on the list: they stay in the bank.
  const talents1 = await talents()
  await stage(aina, 'rejected', 'other')
  check([(await talents()) - talents1, (await talentRow(ainaT)).reason], [0, 'failed_interview'], 'not selected twice: no second record, the reason kept')
  await stage(aina, 'shortlisted')
  check([(await cand(aina)).talent_id, (await talentRow(ainaT)).live, (await talentRow(ainaT)).reason], [ainaT, true, 'failed_interview'],
    'back on the list: still in the bank — the bank keeps everybody until HR removes them')

  // A guest's candidate: kept in their company › department.
  const wong = await candidate(carresReq, 'Wong')
  await stage(wong, 'rejected', 'not_right_now')
  const wongT = (await cand(wong)).talent_id
  check([await placeOf(wongT), (await talentRow(wongT)).department], [`dept:${CARRES}:Sales`, 'Sales'], 'a guest request’s candidate: Carres › Sales')

  // Already in the bank: invited from it, then not selected — their record takes the reason, nobody new.
  const amir = await one(`SELECT public.hiring_bank_add_talent('company:hv', 'Amir', '019', 'a@b', 'Promoter', 'Met at a fair', NULL, 'not_right_now')`)
  await q(`SELECT public.hiring_talent_invite($1, $2)`, [amir, portalReq])
  const amirC = await one(`SELECT id FROM public.hiring_candidates WHERE talent_id = $1 AND request_id = $2`, [amir, portalReq])
  const talents2 = await talents()
  await stage(amirC, 'rejected', 'declined_offer')
  check([(await talents()) - talents2, (await cand(amirC)).talent_id, (await talentRow(amir)).reason], [0, amir, 'declined_offer'],
    'somebody already in the bank keeps their record and takes the reason')
  check((await historyOf(amir)).at(-1), { what: 'Not selected', note: `${portalReq} · Sales Executive · Declined offer` }, '…their History says it')

  // Their record in the Bin: a new one is made, the Bin's left to run out.
  const bina = await candidate(portalReq, 'Bina')
  await stage(bina, 'rejected', 'other')
  const binaOld = (await cand(bina)).talent_id
  await q(`SELECT public.hiring_talent_remove($1)`, [binaOld])
  await stage(bina, 'shortlisted')
  await stage(bina, 'rejected', 'not_right_now')
  const binaNew = (await cand(bina)).talent_id
  check([binaNew !== binaOld, (await talentRow(binaNew)).live, (await talentRow(binaNew)).reason, (await talentRow(binaOld)).live],
    [true, true, 'not_right_now', false], 'their old record in the Bin: kept again as a new one')

  // A reason not on the list is refused, and nothing changes.
  const cara = await candidate(portalReq, 'Cara')
  await reject(STAGE, [cara, 'rejected', 'too_old'], /Pick why they are kept\./, 'a reason not on the list is refused in words')
  check((await cand(cara)).stage, 'shortlisted', '…and the candidate stays as they were')
  await as(GRACE_USER, VIEW)
  await reject(STAGE, [cara, 'rejected', 'other'], /Hiring · Edit is required/, 'Change status asks Hiring · Edit, as it did')
  await as(GRACE_USER, ALL)

  // ── 2. Edit candidate and Add candidate keep them too ─────────────────────
  const dCv = await upload('Dani_CV.pdf')
  const dIc = await upload('Dani_IC.pdf')
  const dani = await candidate(portalReq, 'Dani', { stage: 'offered', files: [{ path: dCv, name: 'Dani_CV.pdf', type: RESUME }, { path: dIc, name: 'Dani_IC.pdf', type: IC }] })
  const daniIc = await one(`SELECT id FROM public.hiring_files WHERE candidate_id = $1 AND path = $2`, [dani, dIc])
  const EDIT = `SELECT public.hiring_candidate_edit($1, 'Dani', '0123', 'rejected', 'Asked for more', '{}', NULL, NULL, NULL, $2, $3)`
  const edited = await one(EDIT, [dani, `{${daniIc}}`, 'declined_offer'])
  const daniT = (await cand(dani)).talent_id
  check([(await talentRow(daniT)).reason, (await filesOf(daniT)).map(f => f.name)], ['declined_offer', ['Dani_CV.pdf']],
    'Edit candidate → Not selected: kept with the reason, and a file taken off in the same Save stays off')
  check(edited, { orphans: [dIc] }, '…that file is nobody’s now: the page deletes it')
  const eli = await candidate(portalReq, 'Eli', { stage: 'rejected' })
  check((await talentRow((await cand(eli)).talent_id)).reason, 'not_shortlisted', 'added as Not selected: kept straight away')
  const fay = await one(`SELECT public.hiring_candidate_add($1, 'Fay', '', 'rejected', '', '{}', NULL, NULL, NULL, 'not_right_now')`, [portalReq])
  check((await talentRow((await cand(fay)).talent_id)).reason, 'not_right_now', '…with the reason given')
  const gil = await candidate(portalReq, 'Gil', { stage: 'rejected' })
  const gilT = (await cand(gil)).talent_id
  const talents3 = await talents()
  await one(`SELECT public.hiring_candidate_edit($1, 'Gil', '0123', 'rejected', 'Still no', '{}', NULL, NULL, NULL, NULL, 'other')`, [gil])
  check([(await talents()) - talents3, (await talentRow(gilT)).reason], [0, 'not_shortlisted'], 'editing somebody already not selected changes nothing in the bank')

  // ── 3. The reason given by hand ───────────────────────────────────────────
  const hana = await candidate(portalReq, 'Hana')
  const SAVE = `SELECT public.hiring_talent_save('Hana', '', '', 'Sales Executive', 'Revenue', 'Keep warm', NULL, NULL, $1, NULL, $2)`
  await reject(SAVE, [hana, 'nope'], /Pick why they are kept\./, 'Move to Talent Bank: a reason not on the list is refused')
  const hanaT = await one(SAVE, [hana, 'not_right_now'])
  check([(await talentRow(hanaT)).reason, (await cand(hana)).stage], ['not_right_now', 'shortlisted'], 'Move to Talent Bank keeps the reason picked; the candidate stays on the request')
  check((await historyOf(hanaT)).at(-1), { what: 'Saved to Talent Bank', note: `From ${portalReq} · Sales Executive · Not right now` }, '…and their History says it')
  const ivan = await one(`SELECT public.hiring_bank_add_talent('company:hv', 'Ivan', '', '', 'Driver', '', NULL, 'other')`)
  check([(await talentRow(ivan)).reason, (await historyOf(ivan)).at(-1)], ['other', { what: 'Added to Talent Bank', note: 'HOUZS Venture · Other' }],
    '+ New › Add talent keeps the reason picked; their History says where and why')
  const jo = await one(`SELECT public.hiring_bank_add_talent('company:hv', 'Jo', '', '', 'Driver', '', NULL)`)
  check([(await talentRow(jo)).reason, (await historyOf(jo)).at(-1).note], [null, 'HOUZS Venture'], 'an older page sending no reason: kept without one, as before')

  // ── 4. The reason changed on their page ───────────────────────────────────
  const SET = `SELECT public.hiring_talent_set_reason($1, $2)`
  await as(GRACE_USER, CREATE)
  await reject(SET, [jo, 'other'], /Hiring · Edit is required/, 'changing it asks Hiring · Edit')
  await as(GRACE_USER, ALL)
  await reject(SET, [jo, null], /Pick why they are kept\./, 'it cannot be taken away')
  await reject(SET, [jo, 'bored'], /Pick why they are kept\./, '…nor be one not on the list')
  await q(SET, [jo, 'not_right_now'])
  await q(SET, [jo, 'failed_interview'])
  await q(SET, [jo, 'failed_interview'])
  check((await historyOf(jo)).slice(-2), [{ what: 'Reason changed', note: 'Not right now' }, { what: 'Reason changed', note: 'Not right now → Failed interview' }],
    'their History says from what to what; the same one again says nothing')
  check((await talentRow(jo)).reason, 'failed_interview', '…and it is theirs now')
  await q(`SELECT public.hiring_talent_remove($1)`, [jo])
  await reject(SET, [jo, 'other'], /That talent is not in the bank any more/, 'somebody in the Bin is not changed')

  // ── 5. Who may call what; each write asks its page first ──────────────────
  const WRITES = {
    'hiring_candidate_stage(uuid, text, text)': [['/hiring/requests'], ['hiring.edit']],
    'hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb, text)': [['/hiring/requests'], ['hiring.create']],
    'hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[], text)': [['/hiring/requests'], ['hiring.edit']],
    'hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb, text)': [['/hiring/requests/[id]'], ['hiring.create']],
    'hiring_bank_add_talent(text, text, text, text, text, text, jsonb, text)': [['/hiring/talent'], ['hiring.create']],
    'hiring_talent_set_reason(uuid, text)': [['/hiring/talent'], ['hiring.edit']],
  }
  for (const [sig, [pages, wants]] of Object.entries(WRITES)) {
    check([await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [`public.${sig}`]),
      await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [`public.${sig}`])], [true, false], `${sig}: a signed-in session’s, never the stranger’s`)
    const src = await one(`SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure`, [`public.${sig}`])
    check([src.split('tab_write_guard').length - 1,
      src.slice(src.search(/\bBEGIN\b/i) + 'BEGIN'.length).trimStart().startsWith(`PERFORM public.tab_write_guard(ARRAY['${pages[0]}'], ARRAY['${wants[0]}']);`)],
    [1, true], `${sig} asks its page first, once`)
  }
  for (const sig of ['hiring_candidate_stage(uuid, text)', 'hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb)',
    'hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[])',
    'hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb)', 'hiring_bank_add_talent(text, text, text, text, text, text, jsonb)']) {
    check(await one(`SELECT to_regprocedure($1) IS NULL`, [`public.${sig}`]), true, `${sig} is gone — one function each, no call is ever ambiguous`)
  }
  for (const sig of ['hiring_bank_keep(uuid, text)', 'hiring_reason_label(text)', 'hiring_out_reason(text)', 'hiring_reason_check(text)']) {
    check([await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [`public.${sig}`]),
      await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [`public.${sig}`]),
      await one(`SELECT has_function_privilege('service_role', $1, 'EXECUTE')`, [`public.${sig}`])], [false, false, true], `${sig}: the functions’ helper, nobody’s to call`)
  }
  await q(`DELETE FROM guard_calls`)
  const kim = await candidate(portalReq, 'Kim')
  await stage(kim, 'rejected', 'other')
  await q(SET, [(await cand(kim)).talent_id, 'not_right_now'])
  check(await q(`SELECT pages, wants FROM guard_calls ORDER BY n`), [
    { pages: ['/hiring/requests'], wants: ['hiring.create'] },
    { pages: ['/hiring/requests'], wants: ['hiring.edit'] },
    { pages: ['/hiring/talent'], wants: ['hiring.edit'] },
  ], 'each asks its page when it runs — keeping somebody in the bank asks nothing more')

  // The board's one swap, once.
  const boardSrc = await one(`SELECT prosrc FROM pg_proc WHERE oid = 'public.hiring_board()'::regprocedure`)
  check(boardSrc.split(`'reason', t.reason`).length - 1, 1, 'hiring_board() answers the reason, once')
  bd = await board()
  check(bd.talents.find(t => t.id === ivan).reason, 'other', '…for everybody in the bank')

  console.log(`talent bank reason: ${checks} checks passed`)
} finally {
  await db.close()
}
