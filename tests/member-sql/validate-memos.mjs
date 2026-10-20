// Local PostgreSQL regression for 20261012210000 (2026-10-12 — the user: "我发现当我在 HR 这里 publish memo 的时候，
// 我是没有收到的 … 我在任何一个 view 都可以收到那个 notification，那我只需要 acknowledge 一次"; and Kris could not see a
// memo's attachment). The migration runs VERBATIM — twice, the second changing nothing — over stand-ins for the
// tables it reads and the two Revenue app snapshots it swaps a statement into (each holding production's statement).
// What is under test: a memo's recipients are told (the publisher too, when it is addressed to them; never a person
// with no login, or a login switched off); `my_memos()` is the caller's own, any department, a shared login none;
// `my_memo_mark()` writes the LOGIN's receipt (read, then acknowledged — the first time kept) and reads the memo's
// notice, as a receipt written the Revenue app's way does; a memo not addressed to them is refused; a withdraw takes
// the notices back; `memo_attachment()` opens a file to its person or Documentation · View, never a withdrawn one;
// `hr_memo_preview()` asks Documentation · View and says where each person stands; the snapshots carry the file.
// No live I/O.
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

const LOO_USER = id(1) // a Director's own login — the user's
const KRIS_USER = id(2) // a Revenue member's own login
const SHARED_USER = id(3) // principal@ — a shared login no People record names
const OFF_USER = id(4) // a login switched off
const LOO = id(11)
const KRIS = id(12)
const ZACK = id(13) // no login at all
const OFF = id(14)

/** Signed in as somebody holding these actions (the stand-in has_any_action reads them), as the authenticated role. */
async function as(user, actions = []) {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('test.actions', $2, false)`, [user ?? '', actions.join(',')])
  await db.exec('SET ROLE authenticated')
}
const asSystem = async () => {
  await db.exec('RESET ROLE')
  await q(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('test.actions', '', false)`)
}
const notices = async user => {
  await asSystem()
  return q(`SELECT kind, title, body, ref_kind, ref_id, read_at IS NOT NULL AS read FROM public.app_notifications WHERE user_id = $1 ORDER BY created_at, id`, [user])
}
/** A memo as hr_publish writes one: the memo, then its recipients in one statement. */
async function publish(title, staff, over = {}) {
  await asSystem()
  const m = await one(`INSERT INTO public.member_memos (title, body, sender, kind, attachment_path, attachment_name, attachment_type, origin)
    VALUES ($1, $2, 'People & Culture', $3, $4, $5, $6, 'publish') RETURNING id`,
  [title, over.body ?? 'Please read.', over.kind ?? 'Memo', over.path ?? null, over.name ?? null, over.type ?? null])
  await q(`INSERT INTO public.member_memo_recipients (memo_id, staff_id) SELECT $1, x FROM unnest($2::uuid[]) x`, [m, staff])
  return m
}

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

    CREATE TABLE users(id uuid PRIMARY KEY, name text, email text, is_active boolean NOT NULL DEFAULT true);
    CREATE TABLE departments(id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE hr_staff_costs(id uuid PRIMARY KEY, employee_name text NOT NULL, department_id uuid, status text NOT NULL DEFAULT 'active',
      user_id uuid, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE member_memos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, body text NOT NULL DEFAULT '',
      sender text, version integer NOT NULL DEFAULT 1, published_at timestamptz NOT NULL DEFAULT now(), effective_at date,
      requires_ack boolean NOT NULL DEFAULT true, kind text, attachment_path text, attachment_name text, attachment_type text,
      origin text, withdrawn_at timestamptz, attachment_deleted_at timestamptz);
    CREATE TABLE member_memo_recipients(memo_id uuid NOT NULL REFERENCES member_memos(id) ON DELETE CASCADE, staff_id uuid NOT NULL);
    CREATE TABLE member_memo_audiences(memo_id uuid NOT NULL REFERENCES member_memos(id) ON DELETE CASCADE, sub_department_id uuid NOT NULL);
    CREATE TABLE member_memo_receipts(memo_id uuid NOT NULL REFERENCES member_memos(id) ON DELETE CASCADE, user_id uuid NOT NULL,
      version integer NOT NULL, read_at timestamptz DEFAULT now(), acknowledged_at timestamptz, UNIQUE (memo_id, user_id, version));
    -- As mig 20261011180000 made it, its checks by name.
    CREATE TABLE app_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      kind text NOT NULL CONSTRAINT app_notifications_kind_check CHECK (kind IN ('hiring', 'rooms', 'review')),
      title text NOT NULL CONSTRAINT app_notifications_title_check CHECK (length(title) BETWEEN 1 AND 200),
      body text NOT NULL DEFAULT '' CONSTRAINT app_notifications_body_check CHECK (length(body) <= 400),
      ref_kind text NOT NULL CONSTRAINT app_notifications_ref_kind_check CHECK (ref_kind IN ('hiring_request', 'booking', 'member_request')),
      ref_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), read_at timestamptz, push_taken_at timestamptz, pushed_at timestamptz);

    -- The permission check: any wanted 'fn.action[:scope]' among the actions handed in.
    CREATE FUNCTION public.has_any_action(p_wants text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM unnest(p_wants) w
                      WHERE split_part(w, ':', 1) = ANY (string_to_array(current_setting('test.actions', true), ',')))
    $$;
    CREATE FUNCTION public.member_has_membership(p_staff uuid, p_sub uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

    -- The Revenue app's two snapshots, each holding production's statement the migration swaps.
    CREATE FUNCTION public.member_data_snapshot(p_full boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,
 'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at,'departments',(SELECT coalesce(jsonb_agg(a.sub_department_id),'[]'::jsonb) FROM public.member_memo_audiences a
 WHERE a.memo_id=m.id))),'[]') FROM public.member_memos m LEFT JOIN public.member_memo_receipts r ON r.memo_id=m.id AND r.user_id=auth.uid() AND r.version=m.version);
    END $$;
    CREATE FUNCTION public.member_principal_snapshot(p_full boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
    BEGIN
      RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'title',m.title,
  'readAt',receipt.read_at,'acknowledgedAt',receipt.acknowledged_at,
  'recipients','[]'::jsonb)),'[]'::jsonb)
 FROM public.member_memos m LEFT JOIN public.member_memo_receipts receipt ON receipt.memo_id=m.id AND receipt.user_id=auth.uid() AND receipt.version=m.version);
    END $$;
  `)
  await q(`INSERT INTO users(id, name, email, is_active) VALUES ($1, 'Loo', 'loo@x', true), ($2, 'Kris', 'kris@x', true),
    ($3, 'Principal', 'principal@x', true), ($4, 'Off', 'off@x', false)`, [LOO_USER, KRIS_USER, SHARED_USER, OFF_USER])
  await q(`INSERT INTO departments VALUES ($1, 'Director'), ($2, 'Revenue Department')`, [id(21), id(22)])
  await q(`INSERT INTO hr_staff_costs (id, employee_name, department_id, user_id) VALUES
    ($1, 'LOO WEN WEI', $5, $6), ($2, 'KRIS', $7, $8), ($3, 'ZACK', $7, NULL), ($4, 'OFF', $7, $9)`,
  [LOO, KRIS, ZACK, OFF, id(21), LOO_USER, id(22), KRIS_USER, OFF_USER])

  const sql = await readFile(new URL('20261012210000_memos_reach_every_view.sql', migrations), 'utf8')
  await db.exec(sql)
  const swapped = async () => (await q(`SELECT proname, md5(prosrc) AS m FROM pg_proc WHERE proname IN ('member_data_snapshot', 'member_principal_snapshot') ORDER BY 1`))
  const before = await swapped()
  await db.exec(sql)
  check(await swapped(), before, 'applying it twice changes nothing (each swap sees it is done)')

  // ── Who may ───────────────────────────────────────────────────────────────
  for (const fn of ['my_memos()', 'my_memo_mark(uuid,boolean)', 'memo_attachment(uuid)', 'hr_memo_preview(uuid)']) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a signed-in login can call ${fn}`)
  }
  for (const fn of ['notify_memo_recipients_added()', 'notify_memo_recipients_removed()', 'memo_receipt_reads_its_notice()']) {
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), false, `${fn} is the triggers' alone`)
  }

  // ── Told: the recipients, the publisher too ───────────────────────────────
  // The user published to Director · LOO WEN WEI — themself — and expected to be told.
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [LOO_USER])
  const M1 = await publish('House rules', [LOO, KRIS, ZACK, OFF], { path: 'publish/x/Rules.pdf', name: 'Rules.pdf', type: 'application/pdf' })
  check(await notices(LOO_USER), [{ kind: 'memo', title: 'House rules', body: 'From People & Culture · please read and acknowledge', ref_kind: 'memo', ref_id: M1, read: false }],
    'the publisher, a recipient, is told')
  check((await notices(KRIS_USER)).map(n => n.title), ['House rules'], 'Kris is told')
  check((await notices(OFF_USER)).length, 0, 'a login switched off is not')
  check(Number(await one(`SELECT count(*) FROM app_notifications`)), 2, 'and nobody without a login (Zack)')
  const L1 = await publish('Offer letter', [KRIS], { kind: 'Letter' })
  check((await notices(KRIS_USER)).map(n => n.title), ['House rules', 'Letter · Offer letter'], 'a letter says what it is')

  // ── One's own memos ───────────────────────────────────────────────────────
  await as(LOO_USER)
  let mine = await one(`SELECT public.my_memos()`)
  check([mine.staffId, mine.memos.map(m => m.title)], [LOO, ['House rules']], 'a Director reads the memos addressed to them')
  check([mine.memos[0].attachmentName, mine.memos[0].attachmentType, mine.memos[0].readAt], ['Rules.pdf', 'application/pdf', null], 'with its file, unread')
  await as(KRIS_USER)
  check((await one(`SELECT public.my_memos()`)).memos.map(m => m.title).sort(), ['House rules', 'Offer letter'], 'Kris reads his')
  await as(SHARED_USER)
  check(await one(`SELECT public.my_memos()`), { staffId: null, memos: [] }, 'a shared login has none')
  await as(null)
  await reject(`SELECT public.my_memos()`, [], /Sign in/, 'nobody signed in reads nothing')

  // ── Read, then acknowledged — the login's receipt, once ───────────────────
  await as(LOO_USER)
  const read = await one(`SELECT public.my_memo_mark($1, false)`, [M1])
  check([typeof read.readAt, read.acknowledgedAt], ['string', null], 'opened: read, not yet acknowledged')
  check((await notices(LOO_USER)).map(n => n.read), [true], 'opening it reads its notice')
  await as(LOO_USER)
  const acked = await one(`SELECT public.my_memo_mark($1, true)`, [M1])
  check(typeof acked.acknowledgedAt, 'string', 'acknowledged')
  await as(LOO_USER)
  const again = await one(`SELECT public.my_memo_mark($1, true)`, [M1])
  check(again.acknowledgedAt, acked.acknowledgedAt, 'a second Acknowledge keeps the first time')
  await asSystem()
  check(Number(await one(`SELECT count(*) FROM member_memo_receipts WHERE memo_id = $1 AND user_id = $2`, [M1, LOO_USER])), 1, 'one receipt for the login, whichever view')
  await as(LOO_USER)
  await reject(`SELECT public.my_memo_mark($1, true)`, [L1], /not addressed to you/, 'a memo for somebody else is refused')

  // The Revenue app writes the same receipt its own way (member_acknowledge_memo): the notice is read all the same.
  await asSystem()
  await q(`INSERT INTO member_memo_receipts (memo_id, user_id, version) VALUES ($1, $2, 1)`, [L1, KRIS_USER])
  check((await notices(KRIS_USER)).map(n => [n.title, n.read]), [['House rules', false], ['Letter · Offer letter', true]], 'a receipt from the Revenue app reads its notice')

  // ── A memo's file ─────────────────────────────────────────────────────────
  await as(KRIS_USER)
  check((await one(`SELECT public.memo_attachment($1)`, [M1])).path, 'publish/x/Rules.pdf', 'its person opens the file')
  const M2 = await publish('Board only', [LOO], { path: 'publish/y/Board.pdf', name: 'Board.pdf', type: 'application/pdf' })
  await as(KRIS_USER)
  await reject(`SELECT public.memo_attachment($1)`, [M2], /not addressed to you/, 'somebody else does not')
  await as(SHARED_USER, ['documentation.view'])
  check((await one(`SELECT public.memo_attachment($1)`, [M2])).fileName, 'Board.pdf', 'Documentation · View does (Publish › Preview)')
  await as(KRIS_USER)
  await reject(`SELECT public.memo_attachment($1)`, [L1], /no file/, 'a memo without a file says so')

  // ── Publish › Preview ─────────────────────────────────────────────────────
  await as(KRIS_USER)
  await reject(`SELECT public.hr_memo_preview($1)`, [M1], /Documentation · View/, 'the preview needs Documentation · View')
  await as(SHARED_USER, ['documentation.view'])
  const pv = await one(`SELECT public.hr_memo_preview($1)`, [M1])
  check(pv.people.map(p => [p.name, p.hasLogin, !!p.acknowledgedAt]),
    [['KRIS', true, false], ['OFF', false, false], ['ZACK', false, false], ['LOO WEN WEI', true, true]],
    'waiting first, those with no login next, the acknowledged last')
  check([pv.title, pv.attachmentName, pv.requiresAck], ['House rules', 'Rules.pdf', true], 'the memo as its people read it')

  // ── Withdrawn: the notices go, the file is nobody's ──────────────────────
  await asSystem()
  await q(`UPDATE member_memos SET withdrawn_at = now() WHERE id = $1`, [M1])
  await q(`DELETE FROM member_memo_recipients WHERE memo_id = $1`, [M1])
  check((await notices(LOO_USER)).map(n => n.title), ['Board only'], 'a withdraw takes the publisher’s notice of it back — the other memo’s stays')
  check((await notices(KRIS_USER)).map(n => n.title), ['Letter · Offer letter'], 'and Kris’s')
  await as(LOO_USER)
  check((await one(`SELECT public.my_memos()`)).memos.map(m => m.title), ['Board only'], 'it leaves their memos')
  await as(SHARED_USER, ['documentation.view'])
  await reject(`SELECT public.memo_attachment($1)`, [M1], /withdrawn/, 'its file opens for nobody')

  // ── The Revenue app's snapshots carry the file ───────────────────────────
  await as(LOO_USER)
  const snap = await one(`SELECT public.member_data_snapshot(false)`)
  check(snap.find(m => m.id === M2).attachmentName, 'Board.pdf', 'a member’s snapshot names the file')
  const psnap = await one(`SELECT public.member_principal_snapshot(false)`)
  check([psnap.find(m => m.id === M2).attachmentName, psnap.find(m => m.id === M2).kind], ['Board.pdf', 'Memo'], 'and the Principal’s')

  // ══ 2026-10-20 — Acknowledge carries the person's own signature (the user: "点进去的时候，应该要有一个 signature，
  // 也就是他自己手绘签名的那种，签完之后再来点那个 Acknowledge button"; migs 20261021013000 + 20261021013100, each run
  // VERBATIM twice). The Revenue app's writer, member_acknowledge_memo, as production runs it (read off pg_proc
  // 2026-10-20 — the migration checks its body), over stand-ins for what it asks.
  await asSystem()
  await db.exec(`
    CREATE TABLE hr_person_letters(id uuid PRIMARY KEY, staff_id uuid NOT NULL, memo_id uuid);
    CREATE FUNCTION public.has_perm(p_key text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT p_key = ANY (string_to_array(current_setting('test.actions', true), ',')) $$;
    CREATE FUNCTION public.member_staff_id() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT s.id FROM public.hr_staff_costs s WHERE s.user_id = auth.uid() LIMIT 1 $$;
    CREATE FUNCTION public.member_visible_memo(p_memo uuid, p_staff uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS (SELECT 1 FROM public.member_memo_recipients r WHERE r.memo_id = p_memo AND r.staff_id = p_staff) $$;
    CREATE FUNCTION public.member_acknowledge_memo(p_memo uuid, p_ack boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_version integer; v_receipt public.member_memo_receipts%ROWTYPE;
BEGIN
 IF NOT public.has_perm('member_memos') OR NOT public.member_visible_memo(p_memo,v_staff) THEN RAISE EXCEPTION 'Memo is not addressed to this account' USING ERRCODE='42501'; END IF;
 SELECT version INTO v_version FROM public.member_memos WHERE id=p_memo;
 INSERT INTO public.member_memo_receipts(memo_id,user_id,version,acknowledged_at) VALUES(p_memo,auth.uid(),v_version,CASE WHEN p_ack THEN now() END)
 ON CONFLICT(memo_id,user_id,version) DO UPDATE SET acknowledged_at=coalesce(member_memo_receipts.acknowledged_at,EXCLUDED.acknowledged_at)
 RETURNING * INTO v_receipt;
 RETURN jsonb_build_object('id',p_memo,'readAt',v_receipt.read_at,'acknowledgedAt',v_receipt.acknowledged_at,'version',v_version);
END $$;
    GRANT EXECUTE ON FUNCTION public.member_acknowledge_memo(uuid, boolean) TO authenticated;
  `)
  const folded = sig => one(`SELECT md5(regexp_replace(prosrc, '\\s+', ' ', 'g')) FROM pg_proc WHERE oid = $1::regprocedure`, [sig])
  check(await folded('public.member_acknowledge_memo(uuid,boolean)'), 'eb0354d8bcbcec5fc60945fb53536a6c', 'the stand-in is production’s body, word for word')
  check(await folded('public.my_memo_mark(uuid,boolean)'), 'e58967962ff66c2fbf6aca311fd87744', '20261012210000’s my_memo_mark is production’s')
  check(await folded('public.hr_memo_preview(uuid)'), '00c1fbf9a72e7731fa30ab5c19b867fe', '…and its hr_memo_preview')

  const signed = await readFile(new URL('20261021013000_memo_signature.sql', migrations), 'utf8')
  const required = await readFile(new URL('20261021013100_memo_signature_required.sql', migrations), 'utf8')
  // The signature as the pad sends it: a PNG data URL.
  const SIG_A = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(400)}`
  const SIG_B = `data:image/png;base64,iVBORw0KGgo${'B'.repeat(400)}`
  const receipt = async (memo, user) => {
    await asSystem()
    return (await q(`SELECT acknowledged_at IS NOT NULL AS acked, signature FROM member_memo_receipts WHERE memo_id = $1 AND user_id = $2`, [memo, user]))[0] ?? null
  }

  await db.exec(signed)
  // Between the two (the app that signs not live yet): the old writers still acknowledge, as the page on the screen does.
  const M3 = await publish('Code of conduct', [LOO, KRIS, ZACK])
  const M4 = await publish('Fire drill', [LOO, KRIS])
  await as(LOO_USER)
  check(typeof (await one(`SELECT public.my_memo_mark($1, true)`, [M4])).acknowledgedAt, 'string', 'before 013100: the old my_memo_mark still acknowledges')
  check(await receipt(M4, LOO_USER), { acked: true, signature: null }, '…with no signature, as before')
  await db.exec(required)
  const bodies = async () => q(`SELECT oid::regprocedure::text AS f, md5(prosrc) AS m FROM pg_proc
    WHERE proname IN ('my_memo_mark', 'member_acknowledge_memo', 'hr_memo_preview', 'my_memo_signature', 'hr_letter_signature', 'memo_signature_ok') ORDER BY 1`)
  const once = await bodies()
  await db.exec(signed)
  await db.exec(required)
  check(await bodies(), once, 'both run again change nothing (each guard sees it is done)')

  // ── Who may ───────────────────────────────────────────────────────────────
  for (const fn of ['my_memo_mark(uuid,boolean,text)', 'member_acknowledge_memo(uuid,boolean,text)', 'my_memo_signature(uuid)', 'hr_letter_signature(uuid)']) {
    check(await one(`SELECT has_function_privilege('anon', 'public.${fn}', 'EXECUTE')`), false, `the publishable key cannot call ${fn}`)
    check(await one(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE')`), true, `a signed-in login can call ${fn}`)
  }
  check(await one(`SELECT has_function_privilege('authenticated', 'public.memo_signature_ok(text)', 'EXECUTE')`), false, 'memo_signature_ok is the writers’ alone')
  check(await one(`SELECT has_function_privilege('authenticated', 'public.my_memo_mark(uuid,boolean)', 'EXECUTE')`), true, 'the old my_memo_mark keeps its grant')

  // ── Every view's writer: no Acknowledge without a signature ───────────────
  await as(LOO_USER)
  await reject(`SELECT public.my_memo_mark($1, true, NULL)`, [M3], /Sign in the box/, 'Acknowledge with no signature is refused')
  await reject(`SELECT public.my_memo_mark($1, true, $2)`, [M3, `data:image/jpeg;base64,/9j/4AAQ${'A'.repeat(400)}`], /Sign in the box/, 'a picture that is not the pad’s PNG is refused')
  await reject(`SELECT public.my_memo_mark($1, true, $2)`, [M3, 'data:image/png;base64,iVBORw0KGgoAAAA'], /Sign in the box/, 'nor a PNG too small to hold a signature')
  await reject(`SELECT public.my_memo_mark($1, true, $2)`, [M3, `data:image/png;base64,iVBORw0KGgo${'A'.repeat(200001)}`], /Sign in the box/, 'nor one past 200,000 characters')
  check(await receipt(M3, LOO_USER), null, 'a refused Acknowledge writes nothing')
  await as(LOO_USER)
  const opened = await one(`SELECT public.my_memo_mark($1, false, NULL)`, [M3])
  check([typeof opened.readAt, opened.acknowledgedAt], ['string', null], 'opening needs no signature')
  check(await receipt(M3, LOO_USER), { acked: false, signature: null }, 'an opened receipt has none')
  await as(LOO_USER)
  const signedAck = await one(`SELECT public.my_memo_mark($1, true, $2)`, [M3, SIG_A])
  check(typeof signedAck.acknowledgedAt, 'string', 'signed: acknowledged')
  check(await receipt(M3, LOO_USER), { acked: true, signature: SIG_A }, 'the signature is kept on the receipt')
  check('signature' in signedAck, false, 'and never sent back')
  await as(LOO_USER)
  const twice = await one(`SELECT public.my_memo_mark($1, true, $2)`, [M3, SIG_B])
  check(twice.acknowledgedAt, signedAck.acknowledgedAt, 'a second Acknowledge keeps the first time…')
  check((await receipt(M3, LOO_USER)).signature, SIG_A, '…and the first signature')
  await as(LOO_USER)
  await reject(`SELECT public.my_memo_mark($1, true, $2)`, [L1, SIG_A], /not addressed to you/, 'a memo for somebody else is still refused, signed or not')
  await reject(`SELECT public.my_memo_mark($1, true)`, [M2], /refresh the app/, 'after 013100 the old my_memo_mark acknowledges nothing')
  check(await receipt(M2, LOO_USER), null, '…and writes nothing')
  await as(LOO_USER)
  check(typeof (await one(`SELECT public.my_memo_mark($1, false)`, [M2])).readAt, 'string', 'but still marks a memo opened')
  check(await receipt(M2, LOO_USER), { acked: false, signature: null }, '…unsigned, unacknowledged')
  await as(LOO_USER)
  check((await one(`SELECT public.my_memos()`)).memos.every(m => !('signature' in m)), true, 'my_memos() carries no signature (the list stays small)')

  // ── The Revenue app's writer, the same rule ───────────────────────────────
  await as(KRIS_USER, ['member_memos'])
  await reject(`SELECT public.member_acknowledge_memo($1, true, NULL)`, [M3], /Sign in the box/, 'the Revenue app’s Acknowledge needs a signature too')
  await reject(`SELECT public.member_acknowledge_memo($1, true)`, [M3], /refresh the app/, '…and its old two-argument one refuses to acknowledge')
  await as(KRIS_USER, ['member_memos'])
  check((await one(`SELECT public.member_acknowledge_memo($1, false)`, [M4])).acknowledgedAt, null, 'the old one still marks a memo read')
  await as(KRIS_USER, ['member_memos'])
  check(typeof (await one(`SELECT public.member_acknowledge_memo($1, true, $2)`, [M3, SIG_B])).acknowledgedAt, 'string', 'signed: acknowledged')
  check(await receipt(M3, KRIS_USER), { acked: true, signature: SIG_B }, 'the member’s signature is on their receipt')
  await as(KRIS_USER)
  await reject(`SELECT public.member_acknowledge_memo($1, true, $2)`, [M4, SIG_B], /not addressed to this account/, 'without Memos (member_memos) it is refused as before')
  await asSystem()
  await reject(`INSERT INTO member_memo_receipts (memo_id, user_id, version, signature) VALUES ($1, $2, 1, $3)`, [M4, OFF_USER, SIG_A],
    /signature_check/, 'the table refuses a signature on a receipt nobody acknowledged')

  // ── Reading it back ───────────────────────────────────────────────────────
  await as(LOO_USER)
  check(await one(`SELECT public.my_memo_signature($1)`, [M3]), SIG_A, 'one’s own signature on a memo one acknowledged')
  check(await one(`SELECT public.my_memo_signature($1)`, [M2]), null, 'none on a memo only opened')
  await as(KRIS_USER)
  check(await one(`SELECT public.my_memo_signature($1)`, [M3]), SIG_B, 'each login reads its own, never another’s')
  await as(null)
  await reject(`SELECT public.my_memo_signature($1)`, [M3], /Sign in/, 'nobody signed in reads none')

  await as(KRIS_USER)
  await reject(`SELECT public.hr_memo_preview($1)`, [M3], /Documentation · View/, 'Publish › Preview still needs Documentation · View')
  await as(SHARED_USER, ['documentation.view'])
  const pv3 = await one(`SELECT public.hr_memo_preview($1)`, [M3])
  check(pv3.people.map(p => [p.name, p.signature]), [['ZACK', null], ['KRIS', SIG_B], ['LOO WEN WEI', SIG_A]],
    'HR sees each person’s signature beside Acknowledged — none for who has not')

  const LETTER = id(31)
  const UNSIGNED = id(32)
  await asSystem()
  await q(`INSERT INTO hr_person_letters (id, staff_id, memo_id) VALUES ($1, $2, $3), ($4, $5, $6)`, [LETTER, KRIS, M3, UNSIGNED, KRIS, M4])
  await as(KRIS_USER)
  await reject(`SELECT public.hr_letter_signature($1)`, [LETTER], /Documentation · View/, 'a letter’s signature needs Documentation · View')
  await as(SHARED_USER, ['documentation.view'])
  const ls = await one(`SELECT public.hr_letter_signature($1)`, [LETTER])
  check([ls.signature, typeof ls.acknowledgedAt], [SIG_B, 'string'], 'HR reads the signature on a letter its person acknowledged')
  check(await one(`SELECT public.hr_letter_signature($1)`, [UNSIGNED]), null, 'nothing on a letter not acknowledged yet')

  console.log(`validate-memos: ${checks} checks passed`)
} finally {
  await db.close()
}
