// Local PostgreSQL regression for 20261011080000 / 080100 / 080200 / 160000
// (2026-10-11, the HR revamp's Hiring). The migrations run VERBATIM over
// stand-ins for the tables they read, the storage schema and the permission
// check they ask (has_any_action reads the actions this test hands it). What
// is under test: nobody without a cell reads or writes; a request is filed
// only whole ("Fill in …"), for somebody working here; its owner is somebody
// in HR; Request more info and Decline need a note, and a declined request may
// be reconsidered; Mark filled names this request's candidates and an active
// source, marks them Hired and writes the cost into the trail; Position and
// Department stay on the form; a used source is turned off, never removed;
// the Talent Bank keeps who was not picked, invites them once per request;
// the guest link's two functions are the service role's alone. 160000: files
// with a type, several per candidate and talent, following a candidate into
// the bank and a talent onto a request; filed only once really uploaded; an
// object answered for deletion only when no record names it; the leftovers a
// day old. No live I/O.
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
  `)
  await q(`INSERT INTO users VALUES ($1, 'grace@venture.my account', 'grace@x')`, [GRACE_USER])
  await q(`INSERT INTO departments VALUES ($1, 'HR'), ($2, 'Revenue Department')`, [HR, REV])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, status, user_id, designation) VALUES
    ($1, 'Grace Lim', $6, 'active', $7, 'HR Manager'), ($2, 'Nurul Huda', $6, 'active', NULL, 'HR Executive'),
    ($3, 'Kar Jun', $8, 'active', NULL, 'Team Assistant'), ($4, 'Chea Huan', $8, 'active', NULL, 'Team Leader'),
    ($5, 'Old Hand', $6, 'inactive', NULL, 'HR Executive')`, [GRACE, NURUL, KARJUN, CHEA, LEFT, HR, GRACE_USER, REV])

  for (const f of ['20261011080000_hiring.sql', '20261011080100_hiring_file_reads.sql', '20261011080200_hiring_reconsider_declined.sql',
    '20261011160000_hiring_files.sql', '20261011210000_hiring_file_types_manage.sql']) {
    await db.exec(await readFile(new URL(f, migrations), 'utf8'))
  }
  /** An object in the bucket, put there `days` ago — what the browser's upload leaves. */
  const put = (path, days = 0) => q(`INSERT INTO storage.objects (bucket_id, name, created_at) VALUES ('hiring-files', $1, now() - make_interval(days => $2))`, [path, days])
  const DANIEL_CV = `resumes/${id(901)}/Daniel_Lee_CV.pdf`
  await put(DANIEL_CV)

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
  const daniel = await one(`SELECT public.hiring_candidate_add($1, 'Daniel Lee', '016-221 0457', 'appointment', 'Referred by Chea Huan', $2, $3, 'Daniel_Lee_CV.pdf')`,
    [r1, { salary: '3000', avail: '2026-11-01', transport: 'Yes', shoe: '42' }, DANIEL_CV])
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
  check(await one(`SELECT public.hiring_file_path('candidate', $1)`, [daniel]), { path: DANIEL_CV, name: 'Daniel_Lee_CV.pdf' }, 'where a résumé is')
  check(await one(`SELECT provolatile FROM pg_proc WHERE proname = 'hiring_file_path'`), 's', 'reading where a file is writes nothing (View as)')
  await q(`SELECT public.hiring_resume_downloaded($1)`, [daniel])
  check((await requestOf(r1)).events.at(-1).what, 'Résumé downloaded', 'a download is on the trail')
  check(await one(`SELECT to_regprocedure('public.hiring_file_of(text, text, boolean)') IS NULL`), true, 'the old writing reader is gone')

  // ── Several files, each with a type (160000) ─────────────────────────────
  const fileOf = async (rid, cid) => (await requestOf(rid)).candidates.find(c => c.id === cid).files
  const types = (await board()).fileTypes
  check(types.map(t => [t.name, t.builtin]), [['Résumé', 'resume'], ['IC', null], ['Certificate', null]], 'Résumé is built in; IC and Certificate to start')
  const RESUME = types[0].id
  const IC = types[1].id
  check(await one(`SELECT count(*)::int FROM information_schema.columns WHERE table_name IN ('hiring_candidates', 'hiring_talents') AND column_name LIKE 'resume%'`), 0, 'the résumé columns are gone')
  let files = await fileOf(r1, daniel)
  check(files.map(f => [f.type, f.name, f.typeId]), [['Résumé', 'Daniel_Lee_CV.pdf', RESUME]], 'the résumé given with a candidate is a Résumé file')
  check((await requestOf(r1)).candidates.find(c => c.id === daniel).resumeName, 'Daniel_Lee_CV.pdf', 'the board still names the résumé')

  // A file type: Edit names one; the same name twice is the same type.
  await as(GRACE_USER, ['hiring.view', 'hiring.create'])
  await reject(`SELECT public.hiring_file_type_add('Driving licence')`, [], /Hiring · Edit is required/, 'a new type asks Edit')
  await as(GRACE_USER, ALL)
  const licence = await one(`SELECT public.hiring_file_type_add(' Driving licence ')`)
  check(await one(`SELECT public.hiring_file_type_add('driving LICENCE')`), licence, 'one type of a name, whatever its case')
  await reject(`SELECT public.hiring_file_type_add('  ')`, [], /Name the file type\./, 'a type has a name')
  check((await board()).fileTypes.map(t => t.name), ['Résumé', 'IC', 'Certificate', 'Driving licence'], 'a new type at the end')

  // + Add file: Create or Edit; the object must be in the bucket, under files/, on nobody's record yet.
  const DANIEL_IC = `files/${id(902)}/Daniel_IC.jpg`
  const addFiles = (kind, owner, list) => q(`SELECT public.hiring_files_add($1, $2, $3)`, [kind, owner, JSON.stringify(list)])
  await as(GRACE_USER, ['hiring.view'])
  await reject(`SELECT public.hiring_files_add('candidate', $1, $2)`, [daniel, JSON.stringify([{ path: DANIEL_IC, name: 'IC.jpg', type: IC }])], /Create or Edit is required/, 'View adds no file')
  await as(GRACE_USER, ['hiring.view', 'hiring.create'])
  await assert.rejects(() => addFiles('candidate', daniel, [{ path: DANIEL_IC, name: 'IC.jpg', type: IC }]), /That file did not arrive/, 'not uploaded, not filed'); checks++
  await put(DANIEL_IC)
  await assert.rejects(() => addFiles('candidate', daniel, [{ path: DANIEL_IC, name: 'IC.jpg', type: 'not-a-type' }]), /Pick what kind of file it is\./, 'a file has a type'); checks++
  await assert.rejects(() => addFiles('candidate', daniel, [{ path: 'guest/hv-ABCDEFGH/' + id(903) + '.pdf', name: 'x.pdf', type: IC }]), /did not arrive/, 'a guest upload is not a candidate’s file'); checks++
  await assert.rejects(() => addFiles('candidate', daniel, [{ path: DANIEL_CV, name: 'again.pdf', type: IC }]), /already on a record/, 'an object already filed is not filed again'); checks++
  await assert.rejects(() => addFiles('candidate', id(999), [{ path: DANIEL_IC, name: 'IC.jpg', type: IC }]), /That candidate is not there any more/, 'on a candidate who is there'); checks++
  await addFiles('candidate', daniel, [{ path: DANIEL_IC, name: 'IC.jpg', type: IC }])
  files = await fileOf(r1, daniel)
  check(files.map(f => [f.type, f.name, f.addedBy, f.resume]), [['Résumé', 'Daniel_Lee_CV.pdf', 'Grace Lim', true], ['IC', 'IC.jpg', 'Grace Lim', false]], 'the résumé first (and says so), then the IC')
  check((await requestOf(r1)).events.at(-1), { what: 'File added', who: 'Grace Lim', note: 'Daniel Lee · IC · IC.jpg', at: (await requestOf(r1)).events.at(-1).at }, 'a file added is on the trail')

  // Moved to the Talent Bank, a candidate brings every file: the same objects, named twice.
  const danielT = await one(`SELECT public.hiring_talent_save('Daniel Lee', '016-221 0457', '', 'Revenue Specialist', 'Revenue', 'Strong', NULL, NULL, $1)`, [daniel])
  let talentFiles = (await board()).talents.find(t => t.id === danielT).files
  check(talentFiles.map(f => [f.type, f.name]), [['Résumé', 'Daniel_Lee_CV.pdf'], ['IC', 'IC.jpg']], 'the talent has the candidate’s files')
  check((await board()).talents.find(t => t.id === danielT).resumeName, 'Daniel_Lee_CV.pdf', 'and their résumé')
  check(await one(`SELECT public.hiring_file_path('talent', $1)`, [danielT]), { path: DANIEL_CV, name: 'Daniel_Lee_CV.pdf' }, 'the talent’s résumé is the same object')

  // Taking a file off: Edit; the object stays while another record names it.
  await reject(`SELECT public.hiring_file_remove($1)`, [files[1].id], /Hiring · Edit is required/, 'removing a file asks Edit')
  await as(GRACE_USER, ALL)
  check(await one(`SELECT public.hiring_file_remove($1)`, [files[1].id]), { orphans: [] }, 'the IC is still on the talent: nothing to delete')
  check((await fileOf(r1, daniel)).map(f => f.type), ['Résumé'], 'off the candidate')
  check((await requestOf(r1)).events.at(-1).what, 'File removed', 'a file removed is on the trail')
  await reject(`SELECT public.hiring_file_remove($1)`, [files[1].id], /That file is not there any more/, 'removed once')

  // A talent's file downloaded is no step of a trail; a candidate's is, a résumé as before.
  await q(`SELECT public.hiring_file_downloaded($1)`, [talentFiles[1].id])
  check((await requestOf(r1)).events.at(-1).what, 'File removed', 'a talent’s download writes no request trail')
  await q(`SELECT public.hiring_file_downloaded($1)`, [files[0].id])
  check((await requestOf(r1)).events.at(-1), { what: 'Résumé downloaded', who: 'Grace Lim', note: 'Daniel Lee', at: (await requestOf(r1)).events.at(-1).at }, 'a résumé downloaded, as before')
  check(await one(`SELECT public.hiring_file_path('file', $1)`, [talentFiles[1].id]), { path: DANIEL_IC, name: 'IC.jpg' }, 'any one file by its id')

  // Replacing: a new upload in the file's place, the type kept; the old object goes only when nobody names it.
  const DANIEL_CV2 = `files/${id(904)}/Daniel_Lee_CV_2026.pdf`
  await reject(`SELECT public.hiring_file_replace($1, $2, 'Daniel_Lee_CV_2026.pdf')`, [files[0].id, DANIEL_CV2], /did not arrive/, 'a replacement is uploaded first')
  await put(DANIEL_CV2)
  check(await one(`SELECT public.hiring_file_replace($1, $2, 'Daniel_Lee_CV_2026.pdf')`, [files[0].id, DANIEL_CV2]), { orphans: [] }, 'the old CV is still the talent’s')
  check((await fileOf(r1, daniel)).map(f => [f.type, f.name]), [['Résumé', 'Daniel_Lee_CV_2026.pdf']], 'replaced, still a Résumé')
  check((await requestOf(r1)).events.at(-1).what, 'Résumé replaced', 'replacing is on the trail')

  // Removed from the Talent Bank, their files come off: the objects nobody else names are answered.
  await as(GRACE_USER, ['hiring.view', 'hiring.create'])
  await reject(`SELECT public.hiring_talent_remove($1)`, [danielT], /Hiring · Edit is required/, 'removing a talent asks Edit')
  await as(GRACE_USER, ALL)
  check(await one(`SELECT public.hiring_talent_remove($1)`, [danielT]), { orphans: [DANIEL_IC, DANIEL_CV].sort() }, 'their IC and old CV are named by nobody now')
  check(await one(`SELECT count(*)::int FROM public.hiring_files WHERE talent_id = $1`, [danielT]), 0, 'no file is left on a removed talent')
  check(await one(`SELECT note FROM public.hiring_talent_events WHERE talent_id = $1 ORDER BY id DESC LIMIT 1`, [danielT]), '2 files deleted', 'their history says so')
  check(await one(`SELECT public.hiring_file_path('file', $1)`, [talentFiles[1].id]), null, 'a removed talent’s file is not found')

  // Add talent with files; invited, they bring them onto the request.
  const AISYAH_CV = `files/${id(905)}/Aisyah_CV.pdf`
  await put(AISYAH_CV)
  const aisyah = await one(`SELECT public.hiring_talent_save('Aisyah Rahman', '013', '', 'Revenue Specialist', 'Revenue', '', NULL, NULL, NULL, $1)`,
    [JSON.stringify([{ path: AISYAH_CV, name: 'Aisyah_CV.pdf', type: RESUME }])])
  check((await board()).talents.find(t => t.id === aisyah).files.map(f => f.name), ['Aisyah_CV.pdf'], 'a talent added with a file')
  const aisyahC = await one(`SELECT public.hiring_talent_invite($1, $2)`, [aisyah, r2])
  check((await fileOf(r2, aisyahC)).map(f => [f.type, f.name]), [['Résumé', 'Aisyah_CV.pdf']], 'invited, the talent’s files come with her')

  // Edit details: files filed and taken off in one save; the objects nobody names are answered.
  const AISYAH_CERT = `files/${id(906)}/Diploma.pdf`
  await put(AISYAH_CERT)
  const cvRow = (await fileOf(r2, aisyahC))[0].id
  const out = await one(`SELECT public.hiring_candidate_edit($1, 'Aisyah Rahman', '013', NULL, '', '{}', NULL, NULL, $2, $3)`,
    [aisyahC, JSON.stringify([{ path: AISYAH_CERT, name: 'Diploma.pdf', type: types[2].id }]), [cvRow]])
  check(out, { orphans: [] }, 'her CV is still the talent’s')
  check((await fileOf(r2, aisyahC)).map(f => [f.type, f.name]), [['Certificate', 'Diploma.pdf']], 'the CV off the candidate, the diploma on')
  check((await requestOf(r2)).events.slice(-2).map(e => e.what), ['File removed', 'File added'], 'both on the trail')

  // Up to 20 files each.
  const many = []
  for (let i = 0; i < 20; i++) {
    const p = `files/${id(1000 + i)}/f${i}.pdf`
    await put(p)
    many.push({ path: p, name: `f${i}.pdf`, type: IC })
  }
  await assert.rejects(() => addFiles('candidate', aisyahC, many), /Up to 20 files each\./, 'twenty files at most'); checks++
  check((await fileOf(r2, aisyahC)).length, 1, 'refused whole')

  // The leftovers: a day old, named by nobody — a guest's upload never sent, a removed file's object.
  const STALE = `guest/hv-ABCDEFGH/${id(907)}.pdf`
  const FRESH = `guest/hv-ABCDEFGH/${id(908)}.pdf`
  await put(STALE, 2)
  await put(FRESH, 0)
  await q(`UPDATE storage.objects SET created_at = now() - interval '3 days' WHERE name = ANY ($1)`, [[DANIEL_IC, DANIEL_CV, DANIEL_CV2, AISYAH_CV, AISYAH_CERT]])
  const left = await one(`SELECT public.hiring_orphan_files(50)`)
  check([STALE, DANIEL_IC, DANIEL_CV].every(p => left.includes(p)), true, 'a stale guest upload and the removed files are leftovers')
  check([FRESH, DANIEL_CV2, AISYAH_CV, AISYAH_CERT].some(p => left.includes(p)), false, 'a fresh upload and every file on a record (however old) are not')
  await as(GRACE_USER, ['hiring.view', 'hiring.create'])
  await reject(`SELECT public.hiring_orphan_files(50)`, [], /Hiring · Edit is required/, 'the leftovers are Edit’s to clear')
  await as(GRACE_USER, ALL)

  // Who may call what, and the bucket's policies.
  for (const fn of ['public.hiring_files_add(text, uuid, jsonb)', 'public.hiring_file_replace(uuid, text, text)', 'public.hiring_file_remove(uuid)',
    'public.hiring_file_type_add(text)', 'public.hiring_file_downloaded(uuid)', 'public.hiring_orphan_files(integer)',
    'public.hiring_candidate_add(text, text, text, text, text, jsonb, text, text, jsonb)',
    'public.hiring_candidate_edit(uuid, text, text, text, text, jsonb, text, text, jsonb, uuid[])',
    'public.hiring_talent_save(text, text, text, text, text, text, text, text, uuid, jsonb)', 'public.hiring_talent_remove(uuid)']) {
    check(await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), true, `${fn} is a signed-in user's`)
    check(await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [fn]), false, `${fn} is not the publishable key's`)
  }
  for (const fn of ['public.hiring_attach(uuid, uuid, jsonb, boolean)', 'public.hiring_take_upload(text)', 'public.hiring_orphaned(text[])']) {
    check(await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), false, `${fn} is internal`)
  }
  check(await one(`SELECT has_function_privilege('authenticated', 'public.hiring_file_in_use(text)', 'EXECUTE')`), true, 'the delete policy asks hiring_file_in_use under the session')
  check(await one(`SELECT has_function_privilege('anon', 'public.hiring_file_in_use(text)', 'EXECUTE')`), false, '…never the publishable key')
  const policy = name => q(`SELECT cmd, roles::text[] AS roles, qual, with_check FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = $1`, [name])
  const del = (await policy('hiring_files_delete'))[0]
  check([del.cmd, del.roles], ['DELETE', ['authenticated']], 'Edit deletes from the bucket, signed in')
  check(/hiring\.edit/.test(del.qual) && /NOT hiring_file_in_use\(name\)/.test(del.qual), true, '…only an object no record names')
  check(/'files'/.test((await policy('hiring_files_write'))[0].with_check), true, 'new files go under files/')
  check(await one(`SELECT public.hiring_file_in_use($1)`, [DANIEL_CV2]), true, 'a file on a record is in use')
  check(await one(`SELECT public.hiring_file_in_use($1)`, [STALE]), false, 'a leftover is not')

  // ── File types renamed and turned off; the leftovers' one list (210000) ──
  const typeOf = async name => (await board()).fileTypes.find(t => t.name === name)
  const AISYAH_IC = `files/${id(909)}/Aisyah_IC.jpg`
  await put(AISYAH_IC)
  await addFiles('candidate', aisyahC, [{ path: AISYAH_IC, name: 'Aisyah_IC.jpg', type: IC }])
  check([(await typeOf('IC')).active, (await typeOf('IC')).used, (await typeOf('Résumé')).used], [true, 1, 2], 'each type says it is on, and how many files it has (two résumés: Daniel’s and the talent Aisyah’s)')
  await as(GRACE_USER, ['hiring.view', 'hiring.create'])
  await reject(`SELECT public.hiring_file_type_rename($1, 'NRIC')`, [IC], /Hiring · Edit is required/, 'renaming asks Edit')
  await reject(`SELECT public.hiring_file_type_set_active($1, false)`, [IC], /Hiring · Edit is required/, 'turning off asks Edit')
  await as(GRACE_USER, ALL)
  await reject(`SELECT public.hiring_file_type_rename($1, 'CV')`, [RESUME], /Résumé is built in — it keeps its name\./, 'Résumé keeps its name')
  await reject(`SELECT public.hiring_file_type_set_active($1, false)`, [RESUME], /Résumé is built in — it stays on\./, 'Résumé stays on')
  await reject(`SELECT public.hiring_file_type_rename($1, ' certificate ')`, [IC], /That type is already there\./, 'one type of a name')
  await reject(`SELECT public.hiring_file_type_rename($1, '  ')`, [IC], /Name the file type\./, 'a type has a name')
  await q(`SELECT public.hiring_file_type_rename($1, 'NRIC')`, [IC])
  check((await fileOf(r2, aisyahC)).find(f => f.name === 'Aisyah_IC.jpg').type, 'NRIC', 'a renamed type is renamed on its files too')
  await q(`SELECT public.hiring_file_type_set_active($1, false)`, [IC])
  check((await typeOf('NRIC')).active, false, 'turned off')
  check((await fileOf(r2, aisyahC)).find(f => f.name === 'Aisyah_IC.jpg').type, 'NRIC', 'a file filed under it keeps it')
  const LATER_IC = `files/${id(910)}/Later_IC.jpg`
  await put(LATER_IC)
  await assert.rejects(() => addFiles('candidate', aisyahC, [{ path: LATER_IC, name: 'Later_IC.jpg', type: IC }]), /NRIC is turned off — pick another type\./, 'nothing new is filed under a type turned off'); checks++
  check(await one(`SELECT public.hiring_file_type_add('nric')`), IC, 'naming it again is the same type…')
  check((await typeOf('NRIC')).active, true, '…turned back on')
  await addFiles('candidate', aisyahC, [{ path: LATER_IC, name: 'Later_IC.jpg', type: IC }])
  check((await fileOf(r2, aisyahC)).filter(f => f.type === 'NRIC').length, 2, 'filed under it again')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.hiring_leftovers(integer)', 'EXECUTE')`), false, 'the leftovers list is not a signed-in user’s…')
  check(await one(`SELECT has_function_privilege('anon', 'public.hiring_leftovers(integer)', 'EXECUTE')`), false, '…nor the publishable key’s')
  check(await one(`SELECT has_function_privilege('service_role', 'public.hiring_leftovers(integer)', 'EXECUTE')`), true, '…it is the hourly sweep’s (the service role)')
  check(await one(`SELECT public.hiring_leftovers(50)`), await one(`SELECT public.hiring_orphan_files(50)`), 'HR’s list and the sweep’s are one list')
  check((await one(`SELECT public.hiring_leftovers(1)`)).length, 1, 'a bounded batch')
  for (const fn of ['public.hiring_file_type_rename(uuid, text)', 'public.hiring_file_type_set_active(uuid, boolean)']) {
    check(await one(`SELECT has_function_privilege('authenticated', $1, 'EXECUTE')`, [fn]), true, `${fn} is a signed-in user's`)
    check(await one(`SELECT has_function_privilege('anon', $1, 'EXECUTE')`, [fn]), false, `${fn} is not the publishable key's`)
  }

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
