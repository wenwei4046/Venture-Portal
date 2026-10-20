// Local PostgreSQL regression for 20261020130000 (2026-10-20, the user, on an applicant's drawer in Sales Groups ›
// Waiting list: "i want here can be view for the letter they submit, then can be upload as well, the file"). The
// migration runs VERBATIM over production's member_sub_department_requests (20261010130000, whose body is checked
// against production's md5 first), stand-ins for the tables it reads and writes (member_requests and the
// attachments with their real constraints and row policies, the events, storage) and the two doors it asks
// (member_is_manager, has_any_action — the test hands each its answer), with the member-invoices bucket's policies
// as production has them. What is under test: the list names each applicant's attested signed form, and only an
// attested one; nobody without both doors attaches one; only to somebody still on the list; only the file the
// caller put in their own folder of that request, really there, of the kinds the bucket keeps; the same file twice
// is refused, another one replaces it and the first stays attested; its step in the history; the bucket lets a
// manager put a file into their own folder of a request on the list — nobody else's, no other request — and clean
// up a file no attachment names, never an attested one. Then 20261020160000 (the user: "want word file as well"):
// the drawer and "+"'s finish (20261011230000, production's body) take a Word .docx / .doc too, each named by its
// own type, and the bucket and the attestations take the two Word types. No live I/O.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const migrations = new URL('../../supabase/migrations/', import.meta.url)
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const one = async (sql, params = []) => Object.values((await q(sql, params))[0])[0]
const id = v => `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`
const read = async name => (await readFile(new URL(name, migrations), 'utf8')).replace(/\r\n/g, '\n')

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
const OTHER_HR = id(2) // another manager
const MEMBER = id(3) // SHAWN's login: a Revenue member who sends requests
const FAIR = id(21)
const SHAWN = id(31)
const LI_SEAN = id(32)
// Requests on Fair's list, and around it.
const JOAN = id(41) // added with "+", no form — on the list
const NG = id(42) // sent by SHAWN from the Revenue app with his signed form — on the list
const LEE = id(43) // reserved
const TAN = id(44) // accepted
const GONE = id(45) // failed — off the list
const DRAFT = id(46) // a draft
const SENT = id(47) // sent, not yet accepted in Member services
const SWAP = id(48) // a replacement
const UNATTESTED = id(49) // its detail names a form no attachment holds

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const HASH_NG = 'c'.repeat(64)
const HASH_NONE = 'd'.repeat(64)
let files = 0
const objectPath = (user, request, ext = 'pdf') => `${user}/${request}/0b5f6a1e-4c1d-4f3a-9a77-${String(++files).padStart(12, '0')}.${ext}`

/** Sign in as `user`; `manager` = member_is_manager's answer, `actions` = what has_any_action finds. */
async function as(user, { manager = true, actions = ['member.manage'], role = null } = {}) {
  await db.exec(`RESET ROLE;
    SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false),
           set_config('test.manager', '${manager ? 'on' : 'off'}', false),
           set_config('test.actions', '${actions.join(',')}', false);
    ${role ? `SET ROLE ${role}` : ''}`)
}
/** As the Storage API puts a file in: an INSERT under the caller's own role. */
const upload = (name, meta = { size: 2048, mimetype: 'application/pdf' }) =>
  q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, $2::jsonb)`, [name, JSON.stringify(meta)])
const visible = () => q(`SELECT name FROM storage.objects WHERE bucket_id = 'member-invoices' ORDER BY name`).then(r => r.map(x => x.name))
const remove = name => q(`DELETE FROM storage.objects WHERE bucket_id = 'member-invoices' AND name = $1 RETURNING name`, [name]).then(r => r.length)

const ATTACH = `SELECT public.member_waiting_attach_form($1, $2, $3, $4) AS r`
const attach = (request, path, name, hash) => q(ATTACH, [request, path, name, hash]).then(r => r[0].r)
const list = async () => {
  const rows = await one(`SELECT public.member_sub_department_requests($1)`, [FAIR])
  return Object.fromEntries(rows.map(r => [r.id, r]))
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TYPE user_role AS ENUM ('principal', 'finance', 'hr');
    CREATE TABLE users(id uuid PRIMARY KEY, name text, role user_role);
    CREATE TABLE comm_sub_departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, status text NOT NULL DEFAULT 'active', user_id uuid);
    -- The two doors: the member back office's own, and the action cells.
    CREATE FUNCTION public.member_is_manager(p_permission text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT auth.uid() IS NOT NULL AND current_setting('test.manager', true) = 'on' AND p_permission = 'member_requests_manage' $$;
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.has_perm(p text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p = 'member_requests' $$;
    -- member_requests as production has it (the columns read and written, its constraints).
    CREATE TABLE member_requests(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_by uuid NOT NULL REFERENCES users(id),
      staff_id uuid NOT NULL REFERENCES hr_staff_costs(id),
      sub_department_id uuid NOT NULL REFERENCES comm_sub_departments(id),
      kind text NOT NULL CHECK (kind IN ('claim', 'replacement', 'waiting')),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','needs_info','approved','rejected','waiting','reserved','accepted','allocated','executed','withdrawn','expired','failed','scheduled')),
      title text NOT NULL DEFAULT 'x',
      detail jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object'),
      note text,
      created_at timestamptz NOT NULL DEFAULT now(),
      submitted_at timestamptz,
      reviewed_by uuid REFERENCES users(id),
      reviewed_at timestamptz,
      request_no text
    );
    CREATE TABLE member_request_events(id bigserial PRIMARY KEY, request_id uuid NOT NULL REFERENCES member_requests(id),
      actor_id uuid REFERENCES users(id), from_status text, to_status text NOT NULL, note text,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp());
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
      mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
      size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 3145728),
      content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    -- Their row policies, as production has them (20260912020000).
    ALTER TABLE member_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE member_request_attachments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY member_request_own_read ON public.member_requests FOR SELECT TO authenticated
     USING(created_by=(SELECT auth.uid()) AND (SELECT public.has_perm('member_requests')) OR (SELECT public.member_is_manager('member_requests_manage')));
    CREATE POLICY member_attachment_own_read ON public.member_request_attachments FOR SELECT TO authenticated
     USING(EXISTS(SELECT 1 FROM public.member_requests r WHERE r.id=request_id));
    -- Supabase Storage's objects, its folder helper, and the bucket's policies as production has them.
    CREATE SCHEMA storage;
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL, metadata jsonb);
    CREATE TABLE storage.buckets(id text PRIMARY KEY, file_size_limit bigint, allowed_mime_types text[]);
    INSERT INTO storage.buckets VALUES ('member-invoices', 3145728, ARRAY['image/jpeg', 'image/png', 'application/pdf']);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage, auth, public TO authenticated;
    GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
    GRANT SELECT ON public.member_requests, public.member_request_attachments TO authenticated;
    CREATE POLICY member_invoice_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
      (bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
       FROM member_requests r
      WHERE (((r.id)::text = (storage.foldername(objects.name))[2]) AND (r.created_by = auth.uid()) AND (r.status = 'draft'::text) AND (r.kind = ANY (ARRAY['claim'::text, 'waiting'::text, 'replacement'::text]))))));
    CREATE POLICY member_invoice_read ON storage.objects FOR SELECT TO authenticated USING (
      (bucket_id = 'member-invoices'::text) AND (EXISTS ( SELECT 1
       FROM (member_request_attachments a
         JOIN member_requests r ON ((r.id = a.request_id)))
      WHERE ((a.object_path = objects.name) AND ((r.created_by = auth.uid()) OR member_is_manager('member_requests_manage'::text))))));
    CREATE POLICY member_invoice_draft_read ON storage.objects FOR SELECT TO authenticated USING (
      (bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
       FROM member_requests r
      WHERE (((r.id)::text = (storage.foldername(objects.name))[2]) AND (r.created_by = ( SELECT auth.uid() AS uid)) AND (r.status = 'draft'::text)))));
    CREATE POLICY member_invoice_draft_delete ON storage.objects FOR DELETE TO authenticated USING (
      (bucket_id = 'member-invoices'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
       FROM member_requests r
      WHERE (((r.id)::text = (storage.foldername(objects.name))[2]) AND (r.created_by = auth.uid()) AND (r.status = 'draft'::text)))) AND (NOT (EXISTS ( SELECT 1
       FROM member_request_attachments a
      WHERE (a.object_path = objects.name)))));
  `)
  await q(`INSERT INTO users VALUES ($1, 'Li Sean', 'hr'), ($2, 'Other HR', 'hr'), ($3, 'Shawn', NULL)`, [HR, OTHER_HR, MEMBER])
  await q(`INSERT INTO comm_sub_departments VALUES ($1, 'Fair')`, [FAIR])
  await q(`INSERT INTO hr_staff_costs VALUES ($1, 'SHAWN', 'active', $3), ($2, 'LI SEAN', 'active', $4)`, [SHAWN, LI_SEAN, MEMBER, HR])
  const request = (rid, by, status, detail, kind = 'waiting') =>
    q(`INSERT INTO member_requests(id, created_by, staff_id, sub_department_id, kind, status, detail, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())`, [rid, by, SHAWN, FAIR, kind, status, JSON.stringify(detail)])
  await request(JOAN, HR, 'waiting', { newPerson: 'JOAN QUEK XIAO', contact: '018-776-0020', start: 'anytime', addedBy: 'hr' })
  await request(NG, MEMBER, 'waiting', { newPerson: 'NG WEI SHUN', contact: '019-464-6349', signedFormName: 'Ng signed.jpg', signedFormHash: HASH_NG })
  await request(LEE, HR, 'reserved', { newPerson: 'LEE JIT HWA', contact: '011-1' })
  await request(TAN, HR, 'accepted', { newPerson: 'TAN JIN YANG', contact: '011-2' })
  await request(GONE, HR, 'failed', { newPerson: 'GONE', contact: '011-3' })
  await request(DRAFT, HR, 'draft', { newPerson: 'DRAFT', contact: '011-4' })
  await request(SENT, MEMBER, 'submitted', { newPerson: 'SENT', contact: '011-5' })
  await request(SWAP, MEMBER, 'submitted', { original: 'X' }, 'replacement')
  await request(UNATTESTED, MEMBER, 'waiting', { newPerson: 'UNATTESTED', contact: '011-6', signedFormName: 'ghost.pdf', signedFormHash: HASH_NONE })
  // SHAWN's own signed form, sent from the Revenue app and attested then.
  const ngPath = objectPath(MEMBER, NG, 'jpg')
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 900, "mimetype": "image/jpeg"}')`, [ngPath])
  await q(`INSERT INTO member_request_attachments(request_id, uploaded_by, object_path, mime_type, size_bytes, content_sha256)
           VALUES ($1, $2, $3, 'image/jpeg', 900, $4)`, [NG, MEMBER, ngPath, HASH_NG])

  // ── Production's list, as it is ──
  await db.exec(await read('20261010130000_member_sub_department_requests.sql'))
  const md5 = () => one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = 'member_sub_department_requests'`)
  check(await md5(), 'b5f8cacefeaa4440120dc17574b2016e', 'the list is production’s body')
  await as(HR)
  check(Object.values(await list()).every(r => !('signedForm' in r)), true, 'before: the list names no signed form')

  const MIGRATION = await read('20261020130000_waiting_list_signed_form_upload.sql')
  await as(null)
  await db.exec(MIGRATION)
  const swapped = await md5()
  // The body production answered in this migration's dry-run (2026-10-20, BEGIN … ROLLBACK on the live schema).
  check(swapped, '75a80f3e8944f966e1e136e47db05092', 'the list’s body swapped, as on production')
  check(await q(`SELECT prosecdef, provolatile FROM pg_proc WHERE proname = 'member_sub_department_requests'`), [{ prosecdef: true, provolatile: 's' }],
    'still DEFINER and STABLE')

  // ── The grants: never the publishable key ──
  check(await one(`SELECT has_function_privilege('anon', 'public.member_waiting_attach_form(uuid, text, text, text)', 'EXECUTE')`), false, 'anon cannot attach')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.member_waiting_attach_form(uuid, text, text, text)', 'EXECUTE')`), true, 'a session may ask')
  check(await one(`SELECT prosecdef FROM pg_proc WHERE proname = 'member_waiting_attach_form'`), true, 'DEFINER')

  // ── The list names each applicant's attested form, and only that ──
  await as(HR)
  let rows = await list()
  check(rows[NG].signedForm.name, 'Ng signed.jpg', 'a member’s signed form, by its name')
  check([rows[NG].signedForm.type, rows[NG].signedForm.by, typeof rows[NG].signedForm.at], ['image/jpeg', 'SHAWN', 'string'], 'its kind, who uploaded it, when')
  check(rows[JOAN].signedForm, null, 'added with "+" and no form: none')
  check(rows[UNATTESTED].signedForm, null, 'a name no attested file matches: none')
  await as(HR, { manager: false })
  await reject(`SELECT public.member_sub_department_requests($1)`, [FAIR], /HR management access is required/, 'the list still asks the back office’s door')

  // ── Both doors ──
  const joanPath = objectPath(HR, JOAN)
  await as(HR, { manager: false })
  await reject(ATTACH, [JOAN, joanPath, 'Joan.pdf', HASH_A], /HR management access is required/, 'not the back office')
  await as(HR, { actions: ['member.view'] })
  await reject(ATTACH, [JOAN, joanPath, 'Joan.pdf', HASH_A], /HR management access is required/, 'no Member services · Edit')
  await as(null)
  await reject(ATTACH, [JOAN, joanPath, 'Joan.pdf', HASH_A], /HR management access is required/, 'nobody signed in')
  await as(HR)

  // ── Only somebody still on the list ──
  for (const [rid, what] of [[GONE, 'failed'], [DRAFT, 'a draft'], [SENT, 'not yet accepted'], [SWAP, 'a replacement'], [id(99), 'no such request']]) {
    await reject(ATTACH, [rid, objectPath(HR, rid), 'x.pdf', HASH_A], /no longer on the waiting list/, what)
  }

  // ── The file the caller put in their own folder of this request, really there, of the bucket's kinds ──
  await reject(ATTACH, [JOAN, joanPath, '  ', HASH_A], /Attach the signed form again/, 'a name')
  await reject(ATTACH, [JOAN, joanPath, 'Joan.pdf', 'not-a-hash'], /Attach the signed form again/, 'the server’s hash')
  await reject(ATTACH, [JOAN, objectPath(OTHER_HR, JOAN), 'Joan.pdf', HASH_A], /Attach the signed form again/, 'another person’s folder')
  await reject(ATTACH, [JOAN, objectPath(HR, LEE), 'Joan.pdf', HASH_A], /Attach the signed form again/, 'another request’s folder')
  await reject(ATTACH, [JOAN, `${HR}/${JOAN}/../x.pdf`, 'Joan.pdf', HASH_A], /Attach the signed form again/, 'a made-up name')
  await reject(ATTACH, [JOAN, objectPath(HR, JOAN, 'docx'), 'Joan.docx', HASH_A], /Attach the signed form again/, 'a kind the bucket does not keep')
  await reject(ATTACH, [JOAN, joanPath, 'Joan.pdf', HASH_A], /Attach the signed form again/, 'nothing uploaded')
  await as(null)
  const htmlPath = objectPath(HR, JOAN, 'png')
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 99, "mimetype": "text/html"}')`, [htmlPath])
  const bigPath = objectPath(HR, JOAN)
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 3145729, "mimetype": "application/pdf"}')`, [bigPath])
  const lyingPath = objectPath(HR, JOAN, 'jpg')
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 99, "mimetype": "application/pdf"}')`, [lyingPath])
  const otherBucket = objectPath(HR, JOAN)
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-forms', $1, '{"size": 99, "mimetype": "application/pdf"}')`, [otherBucket])
  await as(HR)
  await reject(ATTACH, [JOAN, htmlPath, 'Joan.png', HASH_A], /Attach the signed form again/, 'a file of another kind')
  await reject(ATTACH, [JOAN, bigPath, 'Joan.pdf', HASH_A], /Attach the signed form again/, 'over 3 MB')
  await reject(ATTACH, [JOAN, lyingPath, 'Joan.jpg', HASH_A], /Attach the signed form again/, 'its extension not its type')
  await reject(ATTACH, [JOAN, otherBucket, 'Joan.pdf', HASH_A], /Attach the signed form again/, 'another bucket')
  check(await one(`SELECT count(*)::int FROM member_request_attachments WHERE request_id = $1`, [JOAN]), 0, 'nothing attested by a refusal')

  // ── Attached ──
  await as(null)
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 2048, "mimetype": "application/pdf"}')`, [joanPath])
  await as(HR)
  const before = await one(`SELECT max(id)::int FROM member_request_events`)
  const done = await attach(JOAN, joanPath, '  Joan Quek application.pdf ', HASH_A)
  check([done.name, done.type, done.by, typeof done.at], ['Joan Quek application.pdf', 'application/pdf', 'LI SEAN', 'string'], 'the answer: the form as the list will name it')
  check(await q(`SELECT uploaded_by, object_path, mime_type, size_bytes, content_sha256 FROM member_request_attachments WHERE request_id = $1`, [JOAN]),
    [{ uploaded_by: HR, object_path: joanPath, mime_type: 'application/pdf', size_bytes: 2048, content_sha256: HASH_A }], 'attested')
  const joan = (await q(`SELECT status, detail FROM member_requests WHERE id = $1`, [JOAN]))[0]
  check([joan.status, joan.detail.signedFormName, joan.detail.signedFormHash, joan.detail.newPerson, joan.detail.addedBy],
    ['waiting', 'Joan Quek application.pdf', HASH_A, 'JOAN QUEK XIAO', 'hr'], 'the request names it, the rest as it was, still on the list')
  check(await q(`SELECT actor_id, from_status, to_status, note FROM member_request_events WHERE request_id = $1 AND id > $2`, [JOAN, before]),
    [{ actor_id: HR, from_status: 'waiting', to_status: 'waiting', note: 'Signed form uploaded · Joan Quek application.pdf' }],
    'one step, no move: the upload and who did it')
  rows = await list()
  check([rows[JOAN].signedForm.name, rows[JOAN].signedForm.type, rows[JOAN].signedForm.by], ['Joan Quek application.pdf', 'application/pdf', 'LI SEAN'], 'the list names it')
  const step = rows[JOAN].events.at(-1)
  check([step.to, step.note, step.by], ['waiting', 'Signed form uploaded · Joan Quek application.pdf', 'LI SEAN'], 'and its step')
  check(rows[JOAN].acceptedAt, rows[JOAN].events[0].at, 'accepted when it was, not when the form came')

  // ── The same file twice; another one replaces it ──
  await as(null)
  const againPath = objectPath(HR, JOAN)
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 2048, "mimetype": "application/pdf"}')`, [againPath])
  await as(HR)
  await reject(ATTACH, [JOAN, againPath, 'Joan again.pdf', HASH_A], /already their signed form/, 'the same bytes again')
  await as(null)
  const betterPath = objectPath(OTHER_HR, JOAN, 'png')
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 5000, "mimetype": "image/png"}')`, [betterPath])
  await as(OTHER_HR)
  check((await attach(JOAN, betterPath, 'Joan clearer.png', HASH_B)).name, 'Joan clearer.png', 'another manager replaces it')
  check(await q(`SELECT object_path FROM member_request_attachments WHERE request_id = $1 ORDER BY created_at`, [JOAN]).then(r => r.map(x => x.object_path)),
    [joanPath, betterPath], 'the first stays attested — a record')
  rows = await list()
  check([rows[JOAN].signedForm.name, rows[JOAN].signedForm.type, rows[JOAN].signedForm.by], ['Joan clearer.png', 'image/png', 'HR'],
    'the list names the new one; a login with no staff record by its role')
  // The earlier file is the request's again only by uploading it again — its own bytes, its own hash.
  await as(null)
  const backPath = objectPath(HR, JOAN)
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 2048, "mimetype": "application/pdf"}')`, [backPath])
  await as(HR)
  check((await attach(JOAN, backPath, 'Joan Quek application.pdf', HASH_A)).name, 'Joan Quek application.pdf', 'the first file, uploaded again')
  check((await list())[JOAN].signedForm.type, 'application/pdf', 'named again')

  // A member's own form may be replaced too, and reserved / accepted applicants take one.
  await as(null)
  const ngBetter = objectPath(HR, NG)
  const leePath = objectPath(HR, LEE, 'jpg')
  const tanPath = objectPath(HR, TAN)
  await q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, '{"size": 10, "mimetype": "application/pdf"}'),
           ('member-invoices', $2, '{"size": 10, "mimetype": "image/jpeg"}'), ('member-invoices', $3, '{"size": 10, "mimetype": "application/pdf"}')`,
    [ngBetter, leePath, tanPath])
  await as(HR)
  await attach(NG, ngBetter, 'Ng scan.pdf', HASH_A)
  await attach(LEE, leePath, 'Lee.jpg', HASH_A)
  await attach(TAN, tanPath, 'Tan.pdf', HASH_B)
  rows = await list()
  check([rows[NG].signedForm.name, rows[LEE].signedForm.name, rows[TAN].signedForm.name], ['Ng scan.pdf', 'Lee.jpg', 'Tan.pdf'], 'a member’s, reserved, accepted')
  check(await one(`SELECT detail ->> 'signedFormName' FROM member_requests WHERE id = $1`, [NG]), 'Ng scan.pdf', 'Member services opens the new one (its hash)')

  // ── The bucket ──
  // A manager with Member services · Edit puts a file into their own folder of a request on the list.
  await as(HR, { role: 'authenticated' })
  const viaApi = objectPath(HR, JOAN)
  await upload(viaApi)
  checks++
  for (const [name, what] of [
    [objectPath(OTHER_HR, JOAN), 'somebody else’s folder'],
    [objectPath(HR, GONE), 'a request off the list'],
    [objectPath(HR, SENT), 'a request not yet accepted'],
    [objectPath(HR, SWAP), 'a replacement'],
  ]) {
    await assert.rejects(() => upload(name), /row-level security/, what)
    checks++
  }
  await as(HR, { actions: ['member.view'], role: 'authenticated' })
  await assert.rejects(() => upload(objectPath(HR, JOAN)), /row-level security/, 'no Member services · Edit')
  checks++
  await as(MEMBER, { manager: false, actions: [], role: 'authenticated' })
  await assert.rejects(() => upload(objectPath(MEMBER, NG)), /row-level security/, 'a member, into their own sent request')
  checks++

  // The clean-up: the uploader sees and removes their own file no attachment names — never an attested one.
  await as(HR, { role: 'authenticated' })
  check((await visible()).includes(viaApi), true, 'the uploader sees their unattested file')
  await as(OTHER_HR, { role: 'authenticated' })
  check((await visible()).includes(viaApi), false, 'another manager does not')
  check(await remove(viaApi), 0, 'nor removes it')
  await as(MEMBER, { manager: false, actions: [], role: 'authenticated' })
  check((await visible()).includes(viaApi), false, 'nor a member')
  await as(HR, { role: 'authenticated' })
  check(await remove(viaApi), 1, 'the uploader removes it')
  check(await remove(joanPath), 0, 'an attested file is never removed')
  const seen = await visible()
  check([seen.includes(joanPath), seen.includes(betterPath), seen.includes(ngPath)], [true, true, true],
    'a manager reads every attested form — theirs, another’s, a member’s')
  await as(MEMBER, { manager: false, actions: [], role: 'authenticated' })
  const memberSees = await visible()
  check([memberSees.includes(ngPath), memberSees.includes(ngBetter), memberSees.includes(joanPath)], [true, true, false],
    'the member reads the forms of their own request, HR’s copy too, and nobody else’s')
  await as(null)

  // ── Twice is once ──
  await db.exec(MIGRATION)
  check(await md5(), swapped, 'a second run changes nothing')
  check(await one(`SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND policyname LIKE 'member_invoice_%'`), 7, 'seven policies, none twice')

  // ── A Word file too (20261020160000; 2026-10-20, the user: "want word file as well") — both of HR's writers:
  // the drawer's (above) and "+"'s finish (20261011230000, production's body). ──
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const DOC = 'application/msword'
  const HASH_C = 'e'.repeat(64)
  const HASH_D = 'f'.repeat(64)
  const fnMd5 = name => one(`SELECT md5(prosrc) FROM pg_proc WHERE proname = $1`, [name])
  await as(null)
  await db.exec(await read('20261011230000_member_waiting_add.sql'))
  check(await fnMd5('member_waiting_add_form'), 'a27df82bc3fba68202c7e26bca3b7623', '"+"’s finish is production’s body')
  check(await fnMd5('member_waiting_attach_form'), '7cd93f56644e6abd0cafbaafd298ad29', 'the drawer’s upload is production’s body')
  // A "+" add with a Word form, waiting as a draft for its file.
  const PLUS = id(50)
  await q(`INSERT INTO member_requests(id, created_by, staff_id, sub_department_id, kind, status, detail)
           VALUES ($1, $2, $3, $4, 'waiting', 'draft', $5::jsonb)`,
    [PLUS, HR, SHAWN, FAIR, JSON.stringify({ newPerson: 'PLUS', contact: '011-7', addedBy: 'hr', signedFormName: 'Plus letter.docx', signedFormHash: HASH_D })])
  const word = (user, request, ext, mime, size = 4000) => {
    const path = objectPath(user, request, ext)
    return q(`INSERT INTO storage.objects(bucket_id, name, metadata) VALUES ('member-invoices', $1, $2::jsonb)`,
      [path, JSON.stringify({ size, mimetype: mime })]).then(() => path)
  }
  const tanDocx = await word(HR, TAN, 'docx', DOCX)
  const plusDocx = await word(HR, PLUS, 'docx', DOCX)
  await as(HR)
  // Before: neither writer, nor the attestations, take one.
  await reject(ATTACH, [TAN, tanDocx, 'Tan letter.docx', HASH_C], /Attach the signed form again/, 'before: the drawer refuses a .docx')
  await reject(`SELECT public.member_waiting_add_form($1, $2)`, [PLUS, plusDocx], /Attach the signed application form again/, 'before: "+" refuses one')
  await as(null)
  await reject(`INSERT INTO member_request_attachments(request_id, uploaded_by, object_path, mime_type, size_bytes, content_sha256)
                VALUES ($1, $2, 'x/y.doc', $3, 10, $4)`, [TAN, HR, DOC, HASH_C], /check constraint/, 'before: no Word attestation')

  const WORD = await read('20261020160000_waiting_list_signed_form_word.sql')
  await db.exec(WORD)
  const wordMd5s = [await fnMd5('member_waiting_attach_form'), await fnMd5('member_waiting_add_form')]
  check([wordMd5s[0] !== '7cd93f56644e6abd0cafbaafd298ad29', wordMd5s[1] !== 'a27df82bc3fba68202c7e26bca3b7623'], [true, true], 'both writers swapped')
  check(await one(`SELECT allowed_mime_types FROM storage.buckets WHERE id = 'member-invoices'`),
    ['image/jpeg', 'image/png', 'application/pdf', DOCX, DOC], 'the bucket takes the two Word types too')
  check(await one(`SELECT file_size_limit FROM storage.buckets WHERE id = 'member-invoices'`), 3145728, 'and keeps its 3 MB')

  // The drawer: a .docx, an old .doc — each with its own type.
  await as(HR)
  const tan = await attach(TAN, tanDocx, 'Tan letter.docx', HASH_C)
  check([tan.name, tan.type], ['Tan letter.docx', DOCX], 'a .docx is attached')
  await as(null)
  const leeDoc = await word(HR, LEE, 'doc', DOC)
  await as(HR)
  check((await attach(LEE, leeDoc, 'Lee letter.doc', HASH_C)).type, DOC, 'an old .doc too')
  rows = await list()
  check([rows[TAN].signedForm.type, rows[LEE].signedForm.name], [DOCX, 'Lee letter.doc'], 'the list names them with their types')
  // The extension is the type's — a Word file under another name, or another file under Word's, is refused.
  await as(null)
  const lyingDocx = await word(HR, TAN, 'docx', 'application/pdf')
  const lyingPdf = await word(HR, TAN, 'pdf', DOCX)
  const lyingDoc = await word(HR, TAN, 'doc', DOCX)
  const macros = await word(HR, TAN, 'docx', 'application/vnd.ms-word.document.macroEnabled.12')
  await as(HR)
  for (const [path, what] of [[lyingDocx, 'a PDF named .docx'], [lyingPdf, 'a .docx named .pdf'], [lyingDoc, 'a .docx named .doc'], [macros, 'a Word file with macros']]) {
    await reject(ATTACH, [TAN, path, 'x', 'a'.repeat(63) + '1'], /Attach the signed form again/, what)
  }
  await reject(ATTACH, [TAN, `${HR}/${TAN}/0b5f6a1e-4c1d-4f3a-9a77-000000000999.docm`, 'x.docm', 'a'.repeat(63) + '2'], /Attach the signed form again/, 'a .docm path')
  // A PDF, PNG and JPG still go as they did.
  await as(null)
  const stillPdf = await word(HR, TAN, 'pdf', 'application/pdf')
  await as(HR)
  check((await attach(TAN, stillPdf, 'Tan scan.pdf', 'a'.repeat(63) + '3')).type, 'application/pdf', 'a PDF still goes')

  // "+": its draft finishes with the .docx.
  const plus = await one(`SELECT public.member_waiting_add_form($1, $2)`, [PLUS, plusDocx])
  check(plus.status, 'waiting', '"+" with a Word form goes on the list')
  check(await q(`SELECT mime_type, content_sha256 FROM member_request_attachments WHERE request_id = $1`, [PLUS]),
    [{ mime_type: DOCX, content_sha256: HASH_D }], 'attested as Word')
  await as(null)
  await reject(`INSERT INTO member_request_attachments(request_id, uploaded_by, object_path, mime_type, size_bytes, content_sha256)
                VALUES ($1, $2, 'x/z.html', 'text/html', 10, $3)`, [TAN, HR, HASH_C], /check constraint/, 'the attestations still take nothing else')
  await db.exec(WORD)
  check([await fnMd5('member_waiting_attach_form'), await fnMd5('member_waiting_add_form')], wordMd5s, 'the Word migration twice is once')

  // ── A body changed since is refused ──
  await db.exec(`CREATE OR REPLACE FUNCTION public.member_sub_department_requests(p_sub uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$ BEGIN RETURN '[]'::jsonb; END $$`)
  await assert.rejects(() => db.exec(MIGRATION), /not once — production changed since this migration was written/, 'a body changed since is refused')
  checks++
  await db.exec(`CREATE OR REPLACE FUNCTION public.member_waiting_add_form(p_request uuid, p_path text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN '{}'::jsonb; END $$`)
  await assert.rejects(() => db.exec(WORD), /not once — production changed since this migration was written/, 'the Word migration over a changed "+" is refused')
  checks++

  console.log(`validate-waiting-signed-form: ${checks} checks passed`)
} finally {
  await db.close()
}
