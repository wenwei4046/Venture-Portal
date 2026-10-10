// Local PostgreSQL regression for 20261011080000 / 080100 / 080200 (2026-10-11,
// the HR revamp's Hiring). The migrations run VERBATIM over stand-ins for the
// tables they read, the storage schema and the permission check they ask
// (has_any_action reads the actions this test hands it). What is under test:
// nobody without a cell reads or writes; a request is filed only whole
// ("Fill in …"), for somebody working here; its owner is somebody in HR;
// Request more info and Decline need a note, and a declined request may be
// reconsidered; Mark filled names this request's candidates and an active
// source, marks them Hired and writes the cost into the trail; Position and
// Department stay on the form; a used source is turned off, never removed;
// the Talent Bank keeps who was not picked, invites them once per request;
// the guest link's two functions are the service role's alone. No live I/O.
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

const GRACE_USER = id(1)
const GRACE = id(11) // HR Manager
const NURUL = id(12) // HR Executive
const KARJUN = id(13) // Revenue, Team Assistant
const CHEA = id(14) // Revenue, Team Leader
const LEFT = id(15) // HR, no longer working here
const HR = id(21)
const REV = id(22)

/** Sign in as somebody holding these actions (the stand-in has_any_action reads them). */
async function as(user, actions) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false), set_config('test.actions', '${actions.join(',')}', false)`)
}
const ALL = ['hiring.view', 'hiring.create', 'hiring.edit', 'hiring.approve']
const board = () => one(`SELECT public.hiring_board()`)
const requestOf = async rid => (await board()).requests.find(r => r.id === rid)

const ANSWERS = {
  position: 'Senior Revenue Specialist', dept: 'Revenue · IR', headcount: '1', budget: '3200–3800', start: 'Within 1 month',
  emp: 'Full-time', jd: 'Lead fair sales for IR.', notes: 'Must drive.', colour: 'blue',
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
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
  `)
  await q(`INSERT INTO users VALUES ($1, 'grace@venture.my account', 'grace@x')`, [GRACE_USER])
  await q(`INSERT INTO departments VALUES ($1, 'HR'), ($2, 'Revenue Department')`, [HR, REV])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, status, user_id, designation) VALUES
    ($1, 'Grace Lim', $6, 'active', $7, 'HR Manager'), ($2, 'Nurul Huda', $6, 'active', NULL, 'HR Executive'),
    ($3, 'Kar Jun', $8, 'active', NULL, 'Team Assistant'), ($4, 'Chea Huan', $8, 'active', NULL, 'Team Leader'),
    ($5, 'Old Hand', $6, 'inactive', NULL, 'HR Executive')`, [GRACE, NURUL, KARJUN, CHEA, LEFT, HR, GRACE_USER, REV])

  for (const f of ['20261011080000_hiring.sql', '20261011080100_hiring_file_reads.sql', '20261011080200_hiring_reconsider_declined.sql']) {
    await db.exec(await readFile(new URL(f, migrations), 'utf8'))
  }

  // ── Nobody without a cell ─────────────────────────────────────────────────
  await as(GRACE_USER, [])
  await reject(`SELECT public.hiring_board()`, [], /Hiring access is required/, 'no Hiring · View, no board')
  await as(GRACE_USER, ['hiring.view'])
  await reject(`SELECT public.hiring_submit($1, $2)`, [KARJUN, ANSWERS], /Hiring · Create is required/, 'View alone files nothing')
  check(await one(`SELECT has_function_privilege('anon', 'public.hiring_board()', 'EXECUTE')`), false, 'the publishable key cannot call the board')

  // ── The board as it starts ────────────────────────────────────────────────
  let b = await board()
  check(b.fields.map(f => f.id), ['position', 'dept', 'headcount', 'budget', 'start', 'emp', 'reason', 'age', 'gender', 'race', 'jd', 'notes'], 'the seeded form')
  check(b.fields.filter(f => f.core).map(f => f.id), ['position', 'dept'], 'Position and Department are core')
  check(b.sources.map(s => [s.name, s.used]), [['Jobstreet', 0], ['LinkedIn', 0], ['Social Media', 0], ['Referral', 0], ['Walk-in', 0], ['Other', 0]], 'the seeded sources')
  check(b.people.map(p => [p.name, p.department]), [['Grace Lim', 'HR'], ['Nurul Huda', 'HR'], ['Chea Huan', 'Revenue'], ['Kar Jun', 'Revenue']], 'people working here, departments by short name')
  check(b.me, { staffId: GRACE, name: 'Grace Lim' }, 'the reader is named from the roster')

  // ── Filing a request ──────────────────────────────────────────────────────
  await as(GRACE_USER, ALL)
  await reject(`SELECT public.hiring_submit($1, $2)`, [KARJUN, { position: 'Driver' }], /Fill in Department, Headcount, Budget \(RM \/ month\), Expected start, Job description\./, 'a blank required answer is named')
  await reject(`SELECT public.hiring_submit($1, $2)`, [LEFT, ANSWERS], /somebody working here today/, 'only for somebody working here')
  const r1 = await one(`SELECT public.hiring_submit($1, $2)`, [KARJUN, ANSWERS])
  check(r1, 'HR-001', 'requests are numbered')
  let r = await requestOf(r1)
  check([r.status, r.requesterName, r.requesterDepartment, r.source], ['submitted', 'Kar Jun', 'Revenue', 'portal'], 'filed as Pending, from the requester')
  check(r.answers.colour, undefined, 'an answer the form does not ask is dropped')
  check(r.events.map(e => [e.what, e.who]), [['Submitted', 'Kar Jun']], 'the trail starts with the requester')

  // ── Deciding ──────────────────────────────────────────────────────────────
  await as(GRACE_USER, ['hiring.view', 'hiring.create'])
  await reject(`SELECT public.hiring_acknowledge($1, $2, NULL)`, [r1, GRACE], /Hiring · Approve is required/, 'deciding asks Approve')
  await as(GRACE_USER, ALL)
  await reject(`SELECT public.hiring_acknowledge($1, $2, NULL)`, [r1, CHEA], /Pick the owner first\./, 'the owner is somebody in HR')
  await reject(`SELECT public.hiring_acknowledge($1, $2, NULL)`, [r1, LEFT], /Pick the owner first\./, '…working here today')
  await reject(`SELECT public.hiring_request_info($1, '  ')`, [r1], /Write what you need from the requester\./, 'more info needs a note')
  await reject(`SELECT public.hiring_decline($1, '')`, [r1], /Give a reason for declining\./, 'declining needs a note')
  await q(`SELECT public.hiring_decline($1, 'Budget is frozen')`, [r1])
  r = await requestOf(r1)
  check([r.status, r.closedAt === null], ['declined', false], 'declined, and closed')
  await reject(`SELECT public.hiring_decline($1, 'Again')`, [r1], /Only a pending request is declined/, 'declined once')
  await q(`SELECT public.hiring_request_info($1, 'Which outlet?')`, [r1])
  r = await requestOf(r1)
  check([r.status, r.closedAt], ['needs_info', null], 'a declined request may be asked about again — it opens')
  await q(`SELECT public.hiring_acknowledge($1, $2, 'Posting on JobStreet')`, [r1, NURUL])
  r = await requestOf(r1)
  check([r.status, r.ownerId], ['acknowledged', NURUL], 'acknowledged, Nurul owns it')
  check(r.events.at(-1), { what: 'Acknowledged', who: 'Nurul Huda', note: 'Takes responsibility for this hire · Posting on JobStreet', at: r.events.at(-1).at }, 'the owner names the step')
  await q(`SELECT public.hiring_set_owner($1, $2)`, [r1, GRACE])
  check((await requestOf(r1)).events.at(-1).note, 'Nurul Huda → Grace Lim', 'Owner changed, from whom to whom')
  await reject(`SELECT public.hiring_set_assist($1, $2)`, [r1, GRACE], /The owner is already on it/, 'the owner does not assist')
  await q(`SELECT public.hiring_set_assist($1, $2)`, [r1, CHEA])
  check((await requestOf(r1)).assistedBy, CHEA, 'Chea Huan recorded as helping')

  // ── Candidates and Mark filled ────────────────────────────────────────────
  const daniel = await one(`SELECT public.hiring_candidate_add($1, 'Daniel Lee', '016-221 0457', 'appointment', 'Referred by Chea Huan', $2, 'resumes/x/Daniel_Lee_CV.pdf', 'Daniel_Lee_CV.pdf')`,
    [r1, { salary: '3000', avail: '2026-11-01', transport: 'Yes', shoe: '42' }])
  await reject(`SELECT public.hiring_candidate_add($1, 'X', '', 'shortlisted', '', '{}', '../secret.pdf', 'secret.pdf')`, [r1], /A résumé lives under resumes\//, 'a résumé lives under resumes/')
  await reject(`SELECT public.hiring_candidate_add($1, 'X', '', 'shortlisted', '', $2)`, [r1, { salary: 'lots' }], /A number field takes a number/, 'a number is a number')
  const nur = await one(`SELECT public.hiring_candidate_add($1, 'Nur Iman', '012-778 4410', 'shortlisted', '', '{}')`, [r1])
  r = await requestOf(r1)
  check(r.candidates.map(c => [c.name, c.stage, c.answers]), [['Daniel Lee', 'appointment', { salary: '3000', avail: '2026-11-01', transport: 'Yes' }], ['Nur Iman', 'shortlisted', {}]], 'candidates, only the candidate fields kept')
  await q(`SELECT public.hiring_candidate_stage($1, 'rejected')`, [nur])
  await reject(`SELECT public.hiring_fill($1, ARRAY['Nur Iman'], 'Jobstreet', 450, NULL)`, [r1], /must be one of this request's candidates/, 'a candidate not selected is not hired')
  await reject(`SELECT public.hiring_fill($1, ARRAY['Daniel Lee'], 'Billboard', 450, NULL)`, [r1], /Pick where you found them/, 'an active source')
  await reject(`SELECT public.hiring_fill($1, '{}', 'Jobstreet', 450, NULL)`, [r1], /Choose who was hired/, 'somebody hired')
  await q(`SELECT public.hiring_fill($1, ARRAY['Daniel Lee'], 'jobstreet', 450, NULL)`, [r1])
  r = await requestOf(r1)
  check([r.status, r.hiredNames, r.hiredThrough, Number(r.hiringCost)], ['filled', ['Daniel Lee'], 'Jobstreet', 450], 'filled through Jobstreet at RM 450')
  check(r.candidates.find(c => c.id === daniel).stage, 'hired', 'the hire is marked Hired')
  check(r.events.at(-1).note, 'Hired: Daniel Lee · via Jobstreet · cost RM 450', 'the trail says who, how and what it cost')
  check((await board()).sources.find(s => s.name === 'Jobstreet').used, 1, 'the source counts the hire')
  await q(`SELECT public.hiring_reopen($1)`, [r1])
  r = await requestOf(r1)
  check([r.status, r.hiredNames, r.closedAt], ['acknowledged', [], null], 'reopened: being worked on again')
  await q(`SELECT public.hiring_cancel($1, NULL)`, [r1])
  check((await requestOf(r1)).events.at(-1).note, 'No longer needed', 'cancelled, with the handoff’s words')

  // ── The form and the sources ──────────────────────────────────────────────
  const form = (await board()).fields
  await reject(`SELECT public.hiring_save_form_fields($1)`, [JSON.stringify(form.filter(f => f.id !== 'dept'))], /Position and Department are core fields/, 'Department stays')
  await q(`SELECT public.hiring_save_form_fields($1)`, [JSON.stringify([...form.filter(f => f.id !== 'race'), { id: 'langs', label: 'Languages', type: 'text', options: '', required: false }])])
  check((await board()).fields.map(f => f.id).slice(-2), ['notes', 'langs'], 'a field added at the end, one removed')
  check((await requestOf(r1)).fields.some(f => f.id === 'race'), true, 'a filed request keeps the form it was sent with')
  await reject(`SELECT public.hiring_source_add(' jobstreet ')`, [], /already there/, 'one source of a name')
  const jobstreet = (await board()).sources.find(s => s.name === 'Jobstreet').id
  await reject(`SELECT public.hiring_source_remove($1)`, [jobstreet], /has hires on record — turn it off instead/, 'a used source is not removed')
  await q(`SELECT public.hiring_source_set_active($1, false)`, [jobstreet])
  check((await board()).sources.find(s => s.name === 'Jobstreet').active, false, 'turned off')

  // ── The Talent Bank ───────────────────────────────────────────────────────
  const r2 = await one(`SELECT public.hiring_submit($1, $2)`, [CHEA, { ...ANSWERS, position: 'Revenue Specialist', headcount: '2' }])
  const talent = await one(`SELECT public.hiring_talent_save('Nur Iman', '012-778 4410', 'nur@x', 'Revenue Specialist', 'Revenue', 'Runner-up', NULL, NULL, $1)`, [nur])
  b = await board()
  check(b.talents.map(t => [t.no, t.name, t.fromRequest]), [['T-001', 'Nur Iman', r1]], 'saved from the request she was not picked for')
  check((await requestOf(r1)).candidates.find(c => c.id === nur).talentId, talent, 'the candidate knows she is in the bank')
  await q(`SELECT public.hiring_talent_invite($1, $2)`, [talent, r2])
  await reject(`SELECT public.hiring_talent_invite($1, $2)`, [talent, r2], /Nur Iman is already on HR-002/, 'invited once per request')
  check((await requestOf(r2)).candidates.map(c => [c.name, c.source]), [['Nur Iman', 'Talent Bank']], 'on the new request, from the Talent Bank')
  check(b.talents[0].events.map(e => e.what), ['Saved to Talent Bank'], 'her history starts')
  await as(GRACE_USER, ['hiring.view', 'hiring.create'])
  await reject(`SELECT public.hiring_talent_remove($1)`, [talent], /Hiring · Edit is required/, 'removing asks Edit')
  await as(GRACE_USER, ALL)
  await q(`SELECT public.hiring_talent_remove($1)`, [talent])
  check((await board()).talents, [], 'removed from the bank')
  check((await requestOf(r2)).candidates[0].talentId, null, 'a removed talent is not linked any more')

  // ── Files ─────────────────────────────────────────────────────────────────
  check(await one(`SELECT public.hiring_file_path('candidate', $1)`, [daniel]), { path: 'resumes/x/Daniel_Lee_CV.pdf', name: 'Daniel_Lee_CV.pdf' }, 'where a résumé is')
  check(await one(`SELECT provolatile FROM pg_proc WHERE proname = 'hiring_file_path'`), 's', 'reading where a file is writes nothing (View as)')
  await q(`SELECT public.hiring_resume_downloaded($1)`, [daniel])
  check((await requestOf(r1)).events.at(-1).what, 'Résumé downloaded', 'a download is on the trail')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.hiring_file_of(text, text, boolean)', 'EXECUTE')`), false, 'the old writing reader is closed')

  // ── The guest link's door ─────────────────────────────────────────────────
  for (const fn of ['public.hiring_guest_form()', 'public.hiring_file_guest_request(text, text, text, text, jsonb, text, text)']) {
    check(await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), false, `${fn} is not a signed-in user's`)
    check(await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [fn]), false, `${fn} is not the publishable key's`)
    check(await one(`SELECT has_function_privilege('service_role', $1, 'EXECUTE')`, [fn]), true, `${fn} is the service role's`)
  }
  check((await one(`SELECT public.hiring_guest_form()`)).map(f => f.id).includes('langs'), true, 'the guest form is the current form')
  await reject(`SELECT public.hiring_file_guest_request('HOUZS Interior Sdn Bhd', 'Project', 'Wong Mei Yee', '012', $1, 'resumes/a.pdf', 'a.pdf')`, [ANSWERS], /lives under guest\//, 'a guest attachment lives under guest/')
  await as(null, [])
  const g = await one(`SELECT public.hiring_file_guest_request('HOUZS Interior Sdn Bhd', 'Project', 'Wong Mei Yee', '012-506 8821', $1, 'guest/x/org.pdf', 'org.pdf')`, [ANSWERS])
  await as(GRACE_USER, ALL)
  r = await requestOf(g)
  check([r.source, r.requesterCompany, r.requesterName, r.attachmentName, r.events[0].what, r.events[0].who, r.events[0].note],
    ['guest', 'HOUZS Interior Sdn Bhd', 'Wong Mei Yee', 'org.pdf', 'Submitted via guest link', 'Wong Mei Yee', 'HOUZS Interior Sdn Bhd'], 'a guest request says where it came from')

  console.log(`validate-hiring: ${checks} checks passed`)
} finally {
  await db.close()
}
