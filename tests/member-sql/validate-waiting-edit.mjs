// Local PostgreSQL regression for 20261020190000 (2026-10-20, the user, on Sales Groups › Waiting list: "要能够按
// Edit：这个 Edit 本身是让 HR 可以去改资料的", and "'submitted by' 选不到 Revenue 的人。它应该要能选到 Revenue department
// 的全部人，不管什么 title"). The migration runs VERBATIM over production's own member_waiting_add and
// member_sub_department_requests (waiting-edit-production.sql, each md5-checked first), stand-ins for the tables
// they read and write (member_requests with its real constraints, unique index and events trigger) and the two
// doors they ask (member_is_manager, has_any_action — the test hands each its answer). What is under test: "+"
// takes anybody active in the department — a Revenue Director with no placement too — and somebody placed in one
// of its sub-departments from elsewhere, never another department's or a resigned person; the list names each
// submitter's staff id; the drawer's Edit asks both doors, only for somebody still on the list, changes only what
// it was sent, checks each value as "+" does, refuses nothing changed, keeps the rest of the request as it was,
// and writes one step with no move. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const text = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n')

let checks = 0
const check = (actual, expected, what) => {
  assert.deepEqual(actual, expected, what)
  checks++
}
const reject = async (sql, params, pattern, what) => {
  await assert.rejects(() => q(sql, params), pattern, what)
  checks++
}

const HR = id(1) // LI SEAN's login: HR, a manager of member requests
const MEMBER = id(2) // SHAWN's login
const REV = id(11) // the Revenue department
const OPS = id(12) // another department
const FAIR = id(21)
const IR = id(22)
const LOGI = id(23) // a sub-department of the other department
const SHAWN = id(31) // Fair
const ALVIN = id(32) // IR only
const KRIS = id(33) // Revenue Director: in the department, placed nowhere
const HELPER = id(34) // based in the other department, placed in Fair too
const OUTSIDER = id(35) // the other department, placed in Logistics
const GONE = id(36) // Revenue, resigned
const NOBODY = id(37) // no department, placed nowhere
const LI_SEAN = id(38) // HR's own row
// Requests on Fair's list, and around it.
const JOAN = id(41) // added with "+" — on the list
const NG = id(42) // sent by SHAWN from the Revenue app — on the list, a signed form named
const LEE = id(43) // reserved
const TAN = id(44) // accepted
const FAILED = id(45)
const DRAFT = id(46)
const SENT = id(47) // sent, not yet accepted in Member services
const SWAP = id(48) // a replacement
const IR_ONE = id(49) // on IR's list

/** Sign in as `user`; `manager` = member_is_manager's answer, `actions` = what has_any_action finds. */
async function as(user, { manager = true, actions = ['member.manage'] } = {}) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false),
                        set_config('test.manager', '${manager ? 'on' : 'off'}', false),
                        set_config('test.actions', '${actions.join(',')}', false)`)
}

const ADD = `SELECT public.member_waiting_add($1, $2, $3::jsonb, $4, false) AS r`
let keys = 100
const add = (staff, contact) =>
  q(ADD, [FAIR, staff, JSON.stringify({ newPerson: 'Daniel Lee', contact, start: '2026-11-02' }), id(++keys)]).then(r => r[0].r)
const EDIT = `SELECT public.member_waiting_edit($1, $2::jsonb) AS r`
const edit = (request, changes) => q(EDIT, [request, JSON.stringify(changes)]).then(r => r[0].r)
const refuse = (request, changes, pattern, what) => reject(EDIT, [request, JSON.stringify(changes)], pattern, what)
const row = rid => q(`SELECT status, staff_id, title, detail, request_no FROM member_requests WHERE id = $1`, [rid]).then(r => r[0])
const list = async () => Object.fromEntries((await one(`SELECT public.member_sub_department_requests($1)`, [FAIR])).map(r => [r.id, r]))
const md5 = name => one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = $1`, [name])

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TYPE user_role AS ENUM ('principal', 'finance', 'hr');
    CREATE TABLE users(id uuid PRIMARY KEY, name text, role user_role);
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
    -- member_requests as production has it (the columns these read and write, every constraint and index).
    CREATE TABLE member_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by uuid NOT NULL REFERENCES users(id),
      staff_id uuid NOT NULL REFERENCES hr_staff_costs(id),
      sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id),
      kind text NOT NULL CHECK (kind IN ('claim', 'replacement', 'waiting')),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','needs_info','approved','rejected','waiting','reserved','accepted','allocated','executed','withdrawn','expired','failed','scheduled')),
      title text NOT NULL,
      detail jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object'),
      idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
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
    -- Production's member_request_audit, as it is: a step only for a move.
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
    CREATE TABLE member_request_attachments(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id uuid NOT NULL REFERENCES member_requests(id),
      uploaded_by uuid NOT NULL REFERENCES users(id),
      object_path text NOT NULL UNIQUE,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      content_sha256 text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await q(`INSERT INTO users VALUES ($1, 'Li Sean', 'hr'), ($2, 'Shawn', NULL)`, [HR, MEMBER])
  await q(`INSERT INTO comm_sub_departments VALUES ($1, 'Fair', $4, true), ($2, 'IR', $4, true), ($3, 'Logistics', $5, true)`, [FAIR, IR, LOGI, REV, OPS])
  await q(`INSERT INTO hr_staff_costs(id, employee_name, status, user_id, department_id) VALUES
             ($1, 'SHAWN', 'active', $10, $11), ($2, 'ALVIN', 'active', NULL, $11), ($3, 'KRIS', 'active', NULL, $11),
             ($4, 'HELPER', 'active', NULL, $12), ($5, 'OUTSIDER', 'active', NULL, $12), ($6, 'GONE', 'inactive', NULL, $11),
             ($7, 'NOBODY', 'active', NULL, NULL), ($8, 'LI SEAN', 'active', $9, $12)`,
    [SHAWN, ALVIN, KRIS, HELPER, OUTSIDER, GONE, NOBODY, LI_SEAN, HR, MEMBER, REV, OPS])
  await q(`INSERT INTO placements VALUES ($1, $6), ($2, $7), ($3, $6), ($4, $8), ($5, $6)`, [SHAWN, ALVIN, HELPER, OUTSIDER, GONE, FAIR, IR, LOGI])
  await q(`INSERT INTO member_waiting_forms VALUES (1, '[]', false)`)
  const request = (rid, by, status, detail, { kind = 'waiting', sub = FAIR, title } = {}) =>
    q(`INSERT INTO member_requests(id, created_by, staff_id, sub_department_id, kind, status, title, detail, submitted_at, request_no)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now(), $9)`,
      [rid, by, SHAWN, sub, kind, status, title ?? `${detail.newPerson ?? 'X'} · Waiting List`, JSON.stringify(detail), `RQ-${rid.slice(-3)}`])
  await request(JOAN, HR, 'waiting', { newPerson: 'JOAN QUEK XIAO', contact: '018-776-0020', start: 'anytime', addedBy: 'hr', answers: [] })
  await request(NG, MEMBER, 'waiting', { newPerson: 'NG WEI SHUN', contact: '019-464-6349', start: '2026-11-02', signature: 'Ng',
    signedFormName: 'Ng signed.jpg', signedFormHash: 'c'.repeat(64) }, { title: 'Waiting list · NG' })
  await request(LEE, HR, 'reserved', { newPerson: 'LEE JIT HWA', contact: '011-1' })
  await request(TAN, HR, 'accepted', { newPerson: 'TAN JIN YANG', contact: '011-2' })
  await request(FAILED, HR, 'failed', { newPerson: 'FAILED', contact: '011-3' })
  await request(DRAFT, HR, 'draft', { newPerson: 'DRAFT', contact: '011-4' })
  await request(SENT, MEMBER, 'submitted', { newPerson: 'SENT', contact: '011-5' })
  await request(SWAP, MEMBER, 'submitted', { original: 'X' }, { kind: 'replacement' })
  await request(IR_ONE, HR, 'waiting', { newPerson: 'IR ONE', contact: '011-9' }, { sub: IR })

  // ── Production's two bodies, as they are ──
  await db.exec(await text(new URL('./waiting-edit-production.sql', import.meta.url)))
  check([await md5('member_waiting_add'), await md5('member_sub_department_requests')],
    ['cae67d2e9af8894a7e128166f12026dd', '75a80f3e8944f966e1e136e47db05092'], 'production’s bodies, as read on 2026-10-20')
  await as(HR)
  await reject(ADD, [FAIR, KRIS, JSON.stringify({ newPerson: 'Before', contact: '012-0', start: '2026-11-02' }), id(++keys)],
    /Pick who brought them in from the Revenue team/, 'before: a Revenue Director could not be picked')
  check('submittedById' in (await list())[JOAN], false, 'before: the list named no staff id')

  // ── The migration, verbatim — twice is once ──
  const MIGRATION = await text(new URL('20261020190000_waiting_list_edit_any_revenue_submitter.sql', migrations))
  await as(null)
  await db.exec(MIGRATION)
  const swapped = [await md5('member_waiting_add'), await md5('member_sub_department_requests'), await md5('member_waiting_edit')]
  check(swapped.slice(0, 2).map((m, i) => m !== ['cae67d2e9af8894a7e128166f12026dd', '75a80f3e8944f966e1e136e47db05092'][i]), [true, true], 'each body swapped')
  await db.exec(MIGRATION)
  check([await md5('member_waiting_add'), await md5('member_sub_department_requests'), await md5('member_waiting_edit')], swapped, 'a second run changes nothing')
  check(await q(`SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('member_waiting_add', 'member_sub_department_requests', 'member_waiting_edit') ORDER BY proname`),
    [{ proname: 'member_sub_department_requests', prosecdef: true }, { proname: 'member_waiting_add', prosecdef: true }, { proname: 'member_waiting_edit', prosecdef: true }],
    'all three DEFINER')

  // ── The grants: never the publishable key ──
  check(await one(`SELECT has_function_privilege('anon', 'public.member_waiting_edit(uuid, jsonb)', 'EXECUTE')`), false, 'anon cannot edit')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.member_waiting_edit(uuid, jsonb)', 'EXECUTE')`), true, 'a session may ask')

  // ── "+": anybody active in the department, or placed in one of its sub-departments ──
  await as(HR)
  check((await add(KRIS, '012-1')).status, 'waiting', 'a Revenue Director, placed nowhere')
  check((await add(ALVIN, '012-2')).status, 'waiting', 'somebody placed only in a sibling sub-department')
  check((await add(HELPER, '012-3')).status, 'waiting', 'somebody based elsewhere, placed in Fair')
  check((await add(SHAWN, '012-4')).status, 'waiting', 'a Fair member, as before')
  for (const [staff, what] of [[OUTSIDER, 'another department’s'], [GONE, 'resigned'], [NOBODY, 'in no department, placed nowhere'], [id(99), 'nobody']]) {
    await reject(ADD, [FAIR, staff, JSON.stringify({ newPerson: 'X', contact: `013-${staff.slice(-2)}`, start: '2026-11-02' }), id(++keys)],
      /Pick who brought them in from the Revenue team/, `refused: ${what}`)
  }

  // ── The list names each submitter's staff id ──
  let rows = await list()
  check([rows[JOAN].submittedBy, rows[JOAN].submittedById], ['SHAWN', SHAWN], 'the name and its staff id')

  // ── Both doors ──
  await as(HR, { manager: false })
  await refuse(JOAN, { contact: '010-1' }, /HR management access is required/, 'not the back office')
  await as(HR, { actions: ['member.view'] })
  await refuse(JOAN, { contact: '010-1' }, /HR management access is required/, 'no Member services · Edit')
  await as(null)
  await refuse(JOAN, { contact: '010-1' }, /HR management access is required/, 'nobody signed in')
  await as(HR)

  // ── Only somebody still on the list ──
  for (const [rid, what] of [[FAILED, 'failed'], [DRAFT, 'a draft'], [SENT, 'not yet accepted'], [SWAP, 'a replacement'], [id(98), 'no such request']]) {
    await refuse(rid, { contact: '010-2' }, /no longer on the waiting list/, what)
  }
  await reject(`SELECT public.member_waiting_edit($1, '[]'::jsonb)`, [JOAN], /Invalid request/, 'changes are an object')
  await reject(`SELECT public.member_waiting_edit(NULL, '{}'::jsonb)`, [], /Invalid request/, 'a request')

  // ── Each value as "+" asks it ──
  for (const [changes, pattern, what] of [
    [{ newPerson: '   ' }, /Enter the new member's name/, 'a blank name'],
    [{ newPerson: 'x'.repeat(161) }, /Enter the new member's name/, 'a name over 160'],
    [{ contact: '' }, /Enter a phone number/, 'a blank phone'],
    [{ contact: '0'.repeat(61) }, /Enter a phone number/, 'a phone over 60'],
    [{ contact: '019-464-6349' }, /already on the waiting list/, 'another applicant’s number on this list'],
    [{ contact: '011-5' }, /already on the waiting list/, 'a number waiting in Member services'],
    [{ start: '2026-02-30' }, /Pick the joining date/, 'a day the calendar has not'],
    [{ start: 'today' }, /Pick the joining date/, 'a word Postgres reads as a date'],
    [{ start: '' }, /Pick the joining date/, 'no day'],
    [{ start: 'ANYTIME' }, /Pick the joining date/, 'the word in capitals'],
    [{ staffId: OUTSIDER }, /Pick who brought them in from the Revenue team/, 'another department’s'],
    [{ staffId: GONE }, /Pick who brought them in from the Revenue team/, 'resigned'],
    [{ staffId: 'SHAWN' }, /Pick who brought them in from the Revenue team/, 'not a staff id'],
    [{ newPerson: 'JOAN QUEK XIAO', contact: '018-776-0020', start: 'anytime', staffId: SHAWN }, /Nothing has changed/, 'every value as it is'],
    [{}, /Nothing has changed/, 'nothing sent'],
    [{ note: 'hello' }, /Nothing has changed/, 'a key it does not change'],
  ]) {
    await refuse(JOAN, changes, pattern, what)
  }
  check(await one(`SELECT count(*)::int FROM member_request_events WHERE request_id = $1`, [JOAN]), 1, 'a refusal writes no step')

  // ── Edited: only what was sent ──
  const before = await row(JOAN)
  const done = await edit(JOAN, { newPerson: '  JOAN QUEK  ', contact: '018-776-0021', start: '2026-12-01', staffId: KRIS })
  check(done.changed, ['name', 'phone number', 'joining date', 'submitted by'], 'the answer: what changed, in order')
  const after = await row(JOAN)
  check(after.detail, { ...before.detail, newPerson: 'JOAN QUEK', contact: '018-776-0021', start: '2026-12-01' }, 'the four, trimmed; the rest as it was')
  check([after.staff_id, after.status, after.request_no, after.title], [KRIS, 'waiting', before.request_no, 'JOAN QUEK · Waiting List'],
    'who brought them in, the title with the name; still on the list, the same number')
  check(await q(`SELECT actor_id, from_status, to_status, note FROM member_request_events WHERE request_id = $1 ORDER BY id DESC LIMIT 1`, [JOAN]),
    [{ actor_id: HR, from_status: 'waiting', to_status: 'waiting', note: 'Details edited · name, phone number, joining date, submitted by' }],
    'one step, no move: what changed and who')
  rows = await list()
  check([rows[JOAN].newPerson, rows[JOAN].contact, rows[JOAN].start, rows[JOAN].submittedBy, rows[JOAN].submittedById],
    ['JOAN QUEK', '018-776-0021', '2026-12-01', 'KRIS', KRIS], 'the list reads the edit')
  check(rows[JOAN].acceptedAt, rows[JOAN].events[0].at, 'accepted when it was, not when it was edited')

  // One field alone; the others untouched.
  await edit(JOAN, { start: 'anytime' })
  check([(await row(JOAN)).detail.start, (await row(JOAN)).detail.contact, (await row(JOAN)).staff_id], ['anytime', '018-776-0021', KRIS], 'Any time ready, alone')
  check(await one(`SELECT note FROM member_request_events WHERE request_id = $1 ORDER BY id DESC LIMIT 1`, [JOAN]), 'Details edited · joining date', 'its step names it alone')
  await edit(JOAN, { contact: '011-9' })
  check((await row(JOAN)).detail.contact, '011-9', 'a number on another sub-department’s list is no clash')
  await edit(JOAN, { staffId: HELPER })
  check((await row(JOAN)).staff_id, HELPER, 'somebody placed in Fair from another department')

  // A member's own request: its title is not the name's, so it stays; its signed form and signature stay too.
  const ng = await row(NG)
  await edit(NG, { newPerson: 'NG WEI SHUN JR' })
  const ngAfter = await row(NG)
  check([ngAfter.title, ngAfter.detail.newPerson, ngAfter.detail.signedFormName, ngAfter.detail.signature, ngAfter.staff_id],
    [ng.title, 'NG WEI SHUN JR', 'Ng signed.jpg', 'Ng', SHAWN], 'a member’s request: the name only')
  check((await edit(LEE, { contact: '011-11' })).changed, ['phone number'], 'reserved is on the list')
  check((await edit(TAN, { start: '2026-11-30' })).changed, ['joining date'], 'accepted is on the list')
  check((await edit(IR_ONE, { staffId: ALVIN })).changed, ['submitted by'], 'IR’s list, an IR member')

  console.log(`validate-waiting-edit: ${checks} checks passed`)
} finally {
  await db.close()
}
