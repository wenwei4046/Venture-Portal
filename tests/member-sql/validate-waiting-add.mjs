// Local PostgreSQL regression for 20261011230000 (2026-10-11, Sales Groups ›
// Waiting list's "+"). The migration runs VERBATIM over stand-ins for the
// tables it reads and writes (member_requests with its real constraints, its
// events trigger copied from production, the attachments table, storage) and
// the two doors it asks (member_is_manager, has_any_action — the test hands
// each its answer). What is under test: nobody without both doors adds; who
// may have brought them in (an active member of a sub-department of the same
// department); the basics asked, HR's own questions kept as sent, never
// required; one open place per phone number; a press sent twice is one add;
// the signed form follows Form settings — with one, a draft until the file is
// found in the adder's own folder and attested; the phone checked again when
// the draft goes on the list. No live I/O.
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

const HR_USER = id(1)
const OTHER_USER = id(2)
const REV = id(11)
const OPS = id(12)
const FAIR = id(21)
const IR = id(22)
const CLOSED = id(23)
const LOGI = id(24)
const STANLEY = id(31) // Fair
const ALVIN = id(32) // IR only — the same department
const GONE = id(33) // Fair, no longer active
const OUTSIDER = id(34) // Logistics — another department
const NOBODY = id(35) // on the roster, in no sub-department

/** Sign in as `user`; `manager` = member_is_manager's answer, `actions` = what has_any_action finds. */
async function as(user, { manager = true, actions = ['member.manage'] } = {}) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false),
                        set_config('test.manager', '${manager ? 'on' : 'off'}', false),
                        set_config('test.actions', '${actions.join(',')}', false)`)
}

const ADD = `SELECT public.member_waiting_add($1, $2, $3::jsonb, $4, $5) AS r`
let keys = 100
const add = (o = {}) =>
  q(ADD, [o.sub ?? FAIR, o.staff ?? STANLEY, JSON.stringify(o.detail ?? detail()), o.key ?? id(++keys), o.withForm ?? false]).then(r => r[0].r)
const detail = (over = {}) => ({ newPerson: 'Daniel Lee', contact: '016-221 0457', start: '2026-11-02', ...over })
const HASH = 'a'.repeat(64)
const FINISH = `SELECT public.member_waiting_add_form($1, $2) AS r`
const finish = (request, path) => q(FINISH, [request, path]).then(r => r[0].r)
const objectPath = (request, ext = 'pdf') => `${HR_USER}/${request}/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.${ext}`

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY, name text);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL, department_id uuid, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, status text NOT NULL DEFAULT 'active', user_id uuid, department_id uuid);
    -- Stand-in for the chart: who is placed where today.
    CREATE TABLE placements(staff_id uuid, sub_id uuid);
    CREATE FUNCTION public.member_has_membership(p_staff uuid, p_sub uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM placements p JOIN comm_sub_departments d ON d.id = p.sub_id
                         WHERE p.staff_id = p_staff AND p.sub_id = p_sub AND d.is_active) $$;
    -- The two doors: the member back office's own, and the action cells.
    CREATE FUNCTION public.member_is_manager(p_permission text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT auth.uid() IS NOT NULL AND current_setting('test.manager', true) = 'on' AND p_permission = 'member_requests_manage' $$;
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE TABLE member_waiting_forms(version int PRIMARY KEY, fields jsonb NOT NULL DEFAULT '[]', require_upload boolean NOT NULL DEFAULT false);
    -- member_requests as production has it (the columns this reads and writes, every constraint and index).
    CREATE TABLE member_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by uuid NOT NULL REFERENCES users(id),
      staff_id uuid NOT NULL REFERENCES hr_staff_costs(id),
      sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id),
      kind text NOT NULL CHECK (kind IN ('claim', 'replacement', 'waiting')),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','needs_info','approved','rejected','waiting','reserved','accepted','allocated','executed','withdrawn','expired','failed','scheduled')),
      title text NOT NULL,
      detail jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object'),
      idempotency_key uuid NOT NULL,
      note text,
      reviewed_by uuid REFERENCES users(id),
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      submitted_at timestamptz,
      request_no text,
      UNIQUE (created_by, idempotency_key)
    );
    CREATE UNIQUE INDEX member_waiting_unique_contact ON member_requests (sub_department_id, (detail ->> 'contact'))
      WHERE kind = 'waiting' AND status IN ('submitted', 'needs_info', 'waiting', 'reserved', 'accepted');
    CREATE TABLE member_request_events(id bigserial PRIMARY KEY, request_id uuid NOT NULL, actor_id uuid, from_status text, to_status text,
      note text, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    -- Production's member_request_audit, as it is.
    CREATE FUNCTION public.member_request_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
     IF TG_OP='INSERT' THEN
     INSERT INTO public.member_request_events(request_id,actor_id,to_status,note) VALUES(NEW.id,auth.uid(),NEW.status,NEW.note);
     ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
     INSERT INTO public.member_request_events(request_id,actor_id,from_status,to_status,note) VALUES(NEW.id,auth.uid(),OLD.status,NEW.status,NEW.note);
     END IF;
     RETURN NEW;
    END $$;
    CREATE TRIGGER member_requests_audit AFTER INSERT OR UPDATE ON member_requests FOR EACH ROW EXECUTE FUNCTION member_request_audit();
    -- Stand-in for the numbering: a number once it is no longer a draft.
    CREATE FUNCTION public.member_requests_number() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND OLD.request_no IS NOT NULL THEN NEW.request_no := OLD.request_no;
      ELSIF NEW.request_no IS NULL AND NEW.status <> 'draft' THEN
        NEW.request_no := 'RQ-2610-' || lpad((SELECT count(*) + 1 FROM member_requests WHERE request_no IS NOT NULL)::text, 3, '0');
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER member_requests_number BEFORE INSERT OR UPDATE ON member_requests FOR EACH ROW EXECUTE FUNCTION member_requests_number();
    CREATE TABLE member_request_attachments(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id uuid NOT NULL REFERENCES member_requests(id),
      uploaded_by uuid NOT NULL REFERENCES users(id),
      object_path text NOT NULL UNIQUE,
      mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
      size_bytes integer NOT NULL CHECK (size_bytes >= 1 AND size_bytes <= 3145728),
      content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL, metadata jsonb);
  `)
  await q(`INSERT INTO users VALUES ($1, 'HR'), ($2, 'Someone else')`, [HR_USER, OTHER_USER])
  await q(`INSERT INTO comm_sub_departments VALUES ($1, 'Fair', $5, true), ($2, 'IR', $5, true), ($3, 'Closed', $5, false), ($4, 'Logistics', $6, true)`,
    [FAIR, IR, CLOSED, LOGI, REV, OPS])
  await q(`INSERT INTO hr_staff_costs(id, employee_name, status) VALUES ($1, 'STANLEY', 'active'), ($2, 'ALVIN', 'active'), ($3, 'GONE', 'resigned'),
             ($4, 'OUTSIDER', 'active'), ($5, 'NOBODY', 'active')`, [STANLEY, ALVIN, GONE, OUTSIDER, NOBODY])
  await q(`INSERT INTO placements VALUES ($1, $5), ($2, $6), ($3, $5), ($4, $7)`, [STANLEY, ALVIN, GONE, OUTSIDER, FAIR, IR, LOGI])
  await q(`INSERT INTO member_waiting_forms VALUES (1, '[]', false)`)

  await db.exec(await readFile(new URL('20261011230000_member_waiting_add.sql', migrations), 'utf8'))

  // ── The grants: never the publishable key ──
  check(await one(`SELECT has_function_privilege('anon', 'public.member_waiting_add(uuid, uuid, jsonb, uuid, boolean)', 'EXECUTE')`), false, 'anon cannot add')
  check(await one(`SELECT has_function_privilege('anon', 'public.member_waiting_add_form(uuid, text)', 'EXECUTE')`), false, 'anon cannot attest')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.member_waiting_add(uuid, uuid, jsonb, uuid, boolean)', 'EXECUTE')`), true, 'a session may ask')

  // ── Both doors ──
  await as(HR_USER, { manager: false })
  await reject(ADD, [FAIR, STANLEY, JSON.stringify(detail()), id(1), false], /HR management access is required/, 'not the back office')
  await as(HR_USER, { actions: ['member.view'] })
  await reject(ADD, [FAIR, STANLEY, JSON.stringify(detail()), id(1), false], /HR management access is required/, 'no Member services · Edit')
  await as(null)
  await reject(ADD, [FAIR, STANLEY, JSON.stringify(detail()), id(1), false], /HR management access is required/, 'nobody signed in')
  await as(HR_USER)

  // ── Straight onto the list ──
  const daniel = await add({
    key: id(900),
    detail: detail({ newPerson: ' Daniel Lee ', answers: [{ id: 'ic', label: 'IC number', value: ' 900101-01-1234 ' }, { id: 'bad id!', value: 'x' }, 'junk'], formVersion: '3' }),
  })
  check([daniel.status, daniel.requestNo, daniel.userId], ['waiting', 'RQ-2610-001', HR_USER], 'on the list at once, numbered')
  const row = (await q(`SELECT * FROM member_requests WHERE id = $1`, [daniel.id]))[0]
  check([row.kind, row.status, row.staff_id, row.sub_department_id, row.title, row.created_by, row.reviewed_by, row.note],
    ['waiting', 'waiting', STANLEY, FAIR, 'Daniel Lee · Waiting List', HR_USER, HR_USER, 'Added on Sales Groups'], 'the row as a member’s accepted one')
  check(row.submitted_at !== null && row.reviewed_at !== null, true, 'sent and accepted now')
  check(row.detail, {
    newPerson: 'Daniel Lee', contact: '016-221 0457', start: '2026-11-02', addedBy: 'hr', formVersion: 3,
    answers: [{ id: 'ic', label: 'IC number', value: '900101-01-1234' }],
  }, 'the detail trimmed, only well-formed answers kept')
  check(await q(`SELECT from_status, to_status, note, actor_id FROM member_request_events WHERE request_id = $1`, [daniel.id]),
    [{ from_status: null, to_status: 'waiting', note: 'Added on Sales Groups', actor_id: HR_USER }], 'one step: onto the list, by HR')

  // The same press sent again is the same add.
  check((await add({ key: id(900) })).id, daniel.id, 'the same key, the same request')
  check(await one(`SELECT count(*)::int FROM member_requests`), 1, 'still one')
  await reject(ADD, [IR, STANLEY, JSON.stringify(detail()), id(900), false], /already been used for a different request/, 'a key is one request')

  // ── Who brought them in ──
  check((await add({ staff: ALVIN, detail: detail({ newPerson: 'Two', contact: '011-1' }) })).status, 'waiting', 'a member of a sibling sub-department')
  for (const [staff, what] of [[GONE, 'no longer active'], [OUTSIDER, 'another department'], [NOBODY, 'in no sub-department']]) {
    await reject(ADD, [FAIR, staff, JSON.stringify(detail({ contact: '011-9' })), id(++keys), false], /Pick who brought them in from the Revenue team/, what)
  }
  await reject(ADD, [CLOSED, STANLEY, JSON.stringify(detail({ contact: '011-9' })), id(++keys), false], /This sub-department is not open/, 'a closed sub-department')

  // ── The basics ──
  const refuse = (over, pattern, what) => reject(ADD, [FAIR, STANLEY, JSON.stringify(detail({ contact: '011-8', ...over })), id(++keys), false], pattern, what)
  await refuse({ newPerson: '  ' }, /Enter the new member's name/, 'a name')
  await refuse({ newPerson: 'x'.repeat(161) }, /Enter the new member's name/, 'a name, not an essay')
  await refuse({ contact: '' }, /Enter a phone number/, 'a phone number')
  await refuse({ start: '2026-02-30' }, /Pick the joining date/, 'a day the calendar has')
  await refuse({ start: '' }, /Pick the joining date/, 'a joining date')
  await reject(ADD, [FAIR, STANLEY, '[]', id(++keys), false], /Invalid request/, 'a detail object')

  // HR's own questions, a required one too, may stay blank.
  await q(`INSERT INTO member_waiting_forms VALUES (2, $1, false)`, [JSON.stringify([{ id: 'ic', label: 'IC number', type: 'text', required: true }])])
  check((await add({ detail: detail({ newPerson: 'Three', contact: '011-3', answers: [{ id: 'ic', label: 'IC number', value: '' }] }) })).status, 'waiting',
    'a required question of HR’s left blank')

  // ── One open place per phone number ──
  await refuse({ contact: '016-221 0457' }, /already on the waiting list, or waiting for review/, 'Daniel’s number again')
  check((await add({ sub: IR, staff: ALVIN, detail: detail({ newPerson: 'Daniel elsewhere' }) })).status, 'waiting', 'the same number on another list')

  // ── The signed form follows Form settings ──
  await q(`UPDATE member_waiting_forms SET require_upload = true WHERE version = 2`)
  await refuse({ contact: '011-4' }, /Upload the signed application form/, 'required once Form settings says so')
  await reject(ADD, [FAIR, STANLEY, JSON.stringify(detail({ contact: '011-4' })), id(++keys), true], /Attach the signed application form again/, 'a form with no hash')
  const four = await add({ withForm: true, detail: detail({ newPerson: 'Four', contact: '011-4', signedFormName: 'Four signed.pdf', signedFormHash: HASH }) })
  check([four.status, four.requestNo], ['draft', null], 'with a form: a draft, no number yet')
  check(await q(`SELECT to_status FROM member_request_events WHERE request_id = $1`, [four.id]), [{ to_status: 'draft' }], 'not on the list yet')
  check((await q(`SELECT detail FROM member_requests WHERE id = $1`, [four.id]))[0].detail.signedFormHash, HASH, 'the draft names its form')

  // The file must be the adder's own, in this draft's folder, and really there.
  await reject(FINISH, [four.id, `${OTHER_USER}/${four.id}/0b5f6a1e-4c1d-4f3a-9a77-2f1d0c3b4e5a.pdf`], /Attach the signed application form again/, 'someone else’s folder')
  await reject(FINISH, [four.id, `${HR_USER}/${four.id}/../x.pdf`], /Attach the signed application form again/, 'a made-up name')
  await reject(FINISH, [four.id, objectPath(four.id)], /Attach the signed application form again/, 'nothing uploaded')
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 1234, "mimetype": "text/html"}')`, [objectPath(four.id, 'png')])
  await reject(FINISH, [four.id, objectPath(four.id, 'png')], /Attach the signed application form again/, 'a file of another kind')
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 2048, "mimetype": "application/pdf"}')`, [objectPath(four.id)])
  await as(OTHER_USER)
  await reject(FINISH, [four.id, objectPath(four.id)], /no longer waiting for its form/, 'only the adder finishes their add')
  await as(HR_USER)
  const done = await finish(four.id, objectPath(four.id))
  check([done.status, done.requestNo !== null], ['waiting', true], 'found, attested, on the list')
  check(await q(`SELECT uploaded_by, object_path, mime_type, size_bytes, content_sha256 FROM member_request_attachments WHERE request_id = $1`, [four.id]),
    [{ uploaded_by: HR_USER, object_path: objectPath(four.id), mime_type: 'application/pdf', size_bytes: 2048, content_sha256: HASH }], 'the attestation')
  check(await q(`SELECT from_status, to_status, note FROM member_request_events WHERE request_id = $1 ORDER BY id`, [four.id]),
    [{ from_status: null, to_status: 'draft', note: null }, { from_status: 'draft', to_status: 'waiting', note: 'Added on Sales Groups' }], 'its steps')
  await reject(FINISH, [four.id, objectPath(four.id)], /no longer waiting for its form/, 'once')

  // The phone is asked again when the draft goes on the list: somebody took it meanwhile.
  const five = await add({ withForm: true, detail: detail({ newPerson: 'Five', contact: '011-5', signedFormName: 'f.pdf', signedFormHash: HASH }) })
  await q(`UPDATE member_waiting_forms SET require_upload = false WHERE version = 2`)
  check((await add({ detail: detail({ newPerson: 'Five again', contact: '011-5' }) })).status, 'waiting', 'a draft holds no place')
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 99, "mimetype": "image/jpeg"}')`, [objectPath(five.id, 'jpg')])
  await reject(FINISH, [five.id, objectPath(five.id, 'jpg')], /already on the waiting list, or waiting for review/, 'the number taken meanwhile')
  check(await one(`SELECT status FROM member_requests WHERE id = $1`, [five.id]), 'draft', 'the draft stays a draft')
  check(await one(`SELECT count(*)::int FROM member_request_attachments WHERE request_id = $1`, [five.id]), 0, 'and keeps no attestation')

  // ── Any time ready (20261014213000; 2026-10-14, the user: "some of them is anytime ready, just wait us to let
  // then join") — the joining date may be the word `anytime`. Production's three readers of it: this add (above,
  // verbatim), and stand-ins carrying the Revenue app's send and the legacy candidate's statements as production
  // words them. ──
  await refuse({ start: 'anytime' }, /Pick the joining date/, 'before: a day only')
  await db.exec(`
    CREATE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid)
    RETURNS date LANGUAGE plpgsql AS $$
    DECLARE v_date date;
    BEGIN
     v_date:=(p_detail->>'start')::date;
     RETURN v_date;
    END $$;
    CREATE FUNCTION public.member_admin_action(p_action text, p_request uuid, p_data jsonb)
    RETURNS date LANGUAGE plpgsql AS $$
    DECLARE r record; v_now date := '2026-10-14';
    BEGIN
     SELECT p_data AS detail INTO r;
     RETURN greatest((r.detail->>'start')::date,v_now);
    END $$;
  `)
  const ANYTIME = (await readFile(new URL('20261014213000_waiting_list_any_time_start.sql', migrations), 'utf8')).replace(/\r\n/g, '\n')
  const md5s = () => q(`SELECT proname, md5(prosrc) AS m FROM pg_proc WHERE proname IN ('member_waiting_add', 'member_prepare_request', 'member_admin_action') ORDER BY proname`)
  const before = await md5s()
  await db.exec(ANYTIME)
  const after = await md5s()
  check(after.map((r, i) => r.m !== before[i].m), [true, true, true], 'each of the three swapped')

  const ready = await add({ detail: detail({ newPerson: 'Joan Quek', contact: '018-776 0020', start: 'anytime' }) })
  check(ready.status, 'waiting', 'Any time ready goes on the list')
  check(await one(`SELECT detail ->> 'start' FROM member_requests WHERE id = $1`, [ready.id]), 'anytime', 'kept as the word, not a day')
  const dated = await add({ detail: detail({ newPerson: 'Dated', contact: '011-6', start: '2026-12-01' }) })
  check(await one(`SELECT detail ->> 'start' FROM member_requests WHERE id = $1`, [dated.id]), '2026-12-01', 'a day is kept as the day')
  for (const [start, what] of [['2026-02-30', 'a day the calendar has not'], ['', 'blank'], ['today', 'a word Postgres reads as a date'],
    ['ANYTIME', 'the word in capitals'], ['infinity', 'infinity']]) {
    await refuse({ start }, /Pick the joining date/, `still refused: ${what}`)
  }

  const send = start => one(`SELECT public.member_prepare_request('waiting', $1, $2::jsonb, $3, NULL)::text`, [FAIR, JSON.stringify({ start }), id(++keys)])
  check(await send('anytime'), null, 'the Revenue app’s send takes anytime, no day cast')
  check(await send('2026-11-02'), '2026-11-02', 'a day is still read as the day')
  await reject(`SELECT public.member_prepare_request('waiting', $1, $2::jsonb, $3, NULL)`, [FAIR, JSON.stringify({ start: 'whenever' }), id(++keys)],
    /invalid input syntax for type date/, 'anything else is still not a day')
  const candidate = start => one(`SELECT public.member_admin_action('create_candidate', NULL, $1::jsonb)::text`, [JSON.stringify({ start })])
  check([await candidate('anytime'), await candidate('2026-11-02'), await candidate('2026-10-01')], ['2026-10-14', '2026-11-02', '2026-10-14'],
    'the legacy roster row: anytime starts today, a day as before')

  await db.exec(ANYTIME)
  check(await md5s(), after, 'a second run changes nothing')
  await db.exec(`CREATE OR REPLACE FUNCTION public.member_prepare_request(p_kind text, p_sub_department uuid, p_detail jsonb, p_idempotency uuid, p_revision uuid)
    RETURNS date LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`)
  await assert.rejects(() => db.exec(ANYTIME), /not once — production changed since this migration was written/, 'a body changed since is refused')
  checks++

  console.log(`validate-waiting-add: ${checks} checks passed`)
} finally {
  await db.close()
}
