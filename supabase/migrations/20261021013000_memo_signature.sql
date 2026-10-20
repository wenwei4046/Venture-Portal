-- ============================================================================
-- 20261021013000_memo_signature.sql
-- A memo is acknowledged with the person's own hand-drawn signature
-- (2026-10-20 — the user: "点进去的时候，应该要有一个 signature，也就是他自己手绘签名
-- 的那种，签完之后再来点那个 Acknowledge button").
-- ============================================================================
--
-- 1. `member_memo_receipts.signature` — the signature drawn when the memo was
--    acknowledged: a PNG data URL (`data:image/png;base64,iVBORw0KGgo…`, at most
--    200,000 characters), kept with the FIRST acknowledgement as its time is
--    (a second Acknowledge changes neither). A receipt that is only "opened" has
--    none. The table has no client grants and no policy — every read and write
--    is one of the functions below — and its audit line is `none` (the receipt
--    is itself the record), so the image is copied nowhere else.
-- 2. `my_memo_mark(memo, ack, signature)` and `member_acknowledge_memo(memo,
--    ack, signature)` — the receipt's two writers (every view's, and the Revenue
--    app's), each PRODUCTION's body (read off pg_proc 2026-10-20, md5 checked
--    below) with the signature added: acknowledging needs one
--    (`memo_signature_ok`), reading does not. New signatures with no DEFAULT, so
--    PostgREST picks them only when the app names `p_signature`; the old
--    two-argument ones are left as they are until the app that signs is live —
--    20261021013100 then makes them refuse an acknowledgement.
-- 3. `hr_memo_preview(memo)` — Publish › Preview's *Who has it* shows each
--    person's signature beside Acknowledged (PRODUCTION's body, one key added).
-- 4. `my_memo_signature(memo)` — one's own signature on a memo one acknowledged,
--    to draw it beside "You acknowledged this" (read when such a memo is opened,
--    never with the list: `my_memos()` stays as small as it was).
--    `hr_letter_signature(letter)` — Documentation · View: the signature on a
--    Data center letter's receipt, for the letter's preview.
--
-- Comments stay outside the function bodies.

CREATE OR REPLACE FUNCTION pg_temp.expect_body(p_sig regprocedure, p_md5 text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v text := (SELECT md5(regexp_replace(prosrc, '\s+', ' ', 'g')) FROM pg_proc WHERE oid = p_sig);
BEGIN
  IF v IS DISTINCT FROM p_md5 THEN
    RAISE EXCEPTION '%: its body reads % here, not % as read off production on 2026-10-20 — production changed since this migration was written',
      p_sig, v, p_md5;
  END IF;
END
$fn$;

-- The bodies this migration copies, as production ran them on 2026-10-20 (whitespace folded). hr_memo_preview is
-- checked only until it carries the signature (a second run changes nothing); the two writers' two-argument bodies
-- until 20261021013100 has turned them into refusals.
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.hr_memo_preview(uuid)'::regprocedure AND strpos(prosrc, '''signature''') > 0) THEN
    PERFORM pg_temp.expect_body('public.hr_memo_preview(uuid)', '00c1fbf9a72e7731fa30ab5c19b867fe');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.my_memo_mark(uuid,boolean)'::regprocedure AND strpos(prosrc, 'refresh the app') > 0) THEN
    PERFORM pg_temp.expect_body('public.my_memo_mark(uuid,boolean)', 'e58967962ff66c2fbf6aca311fd87744');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.member_acknowledge_memo(uuid,boolean)'::regprocedure AND strpos(prosrc, 'refresh the app') > 0) THEN
    PERFORM pg_temp.expect_body('public.member_acknowledge_memo(uuid,boolean)', 'eb0354d8bcbcec5fc60945fb53536a6c');
  END IF;
END
$guard$;

-- ── 1. The signature on the receipt ─────────────────────────────────────────

ALTER TABLE public.member_memo_receipts ADD COLUMN IF NOT EXISTS signature text;
ALTER TABLE public.member_memo_receipts DROP CONSTRAINT IF EXISTS member_memo_receipts_signature_check;
ALTER TABLE public.member_memo_receipts ADD CONSTRAINT member_memo_receipts_signature_check
  CHECK (signature IS NULL OR (acknowledged_at IS NOT NULL AND length(signature) BETWEEN 200 AND 200000
                               AND signature ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$'));

-- A signature an acknowledgement may carry: a PNG data URL of a sensible size (lib/memos/signature.ts says the same).
CREATE OR REPLACE FUNCTION public.memo_signature_ok(p_signature text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT p_signature IS NOT NULL
     AND length(p_signature) BETWEEN 200 AND 200000
     AND p_signature ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$'
$fn$;

REVOKE ALL ON FUNCTION public.memo_signature_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memo_signature_ok(text) TO service_role;

-- ── 2. The receipt's writers, with the signature ────────────────────────────

-- Every view's (the portal's bell, the HR app, the Revenue app for a Principal): the login's own receipt.
CREATE OR REPLACE FUNCTION public.my_memo_mark(p_memo uuid, p_ack boolean, p_signature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me      uuid := auth.uid();
  v_staff   uuid;
  v_version integer;
  v_receipt public.member_memo_receipts%ROWTYPE;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  SELECT s.id INTO v_staff FROM public.hr_staff_costs s
   WHERE s.user_id = v_me AND s.status = 'active'
   ORDER BY s.created_at, s.id LIMIT 1;
  SELECT m.version INTO v_version FROM public.member_memos m
   WHERE m.id = p_memo AND v_staff IS NOT NULL AND m.withdrawn_at IS NULL AND m.published_at <= now()
     AND (EXISTS (SELECT 1 FROM public.member_memo_recipients p WHERE p.memo_id = m.id AND p.staff_id = v_staff)
       OR EXISTS (SELECT 1 FROM public.member_memo_audiences a
                   WHERE a.memo_id = m.id AND public.member_has_membership(v_staff, a.sub_department_id)));
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'That memo is not addressed to you.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_ack, false) AND NOT public.memo_signature_ok(p_signature) THEN
    RAISE EXCEPTION 'Sign in the box before you acknowledge.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.member_memo_receipts (memo_id, user_id, version, acknowledged_at, signature)
  VALUES (p_memo, v_me, v_version, CASE WHEN coalesce(p_ack, false) THEN now() END, CASE WHEN coalesce(p_ack, false) THEN p_signature END)
  ON CONFLICT (memo_id, user_id, version) DO UPDATE
     SET acknowledged_at = coalesce(member_memo_receipts.acknowledged_at, EXCLUDED.acknowledged_at),
         signature = CASE WHEN member_memo_receipts.acknowledged_at IS NULL THEN EXCLUDED.signature ELSE member_memo_receipts.signature END
  RETURNING * INTO v_receipt;
  RETURN jsonb_build_object('id', p_memo, 'readAt', v_receipt.read_at, 'acknowledgedAt', v_receipt.acknowledged_at, 'version', v_version);
END
$fn$;

REVOKE ALL ON FUNCTION public.my_memo_mark(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_memo_mark(uuid, boolean, text) TO authenticated, service_role;

-- The Revenue app's (a member's own receipt, through member_staff_id()).
CREATE OR REPLACE FUNCTION public.member_acknowledge_memo(p_memo uuid, p_ack boolean, p_signature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_staff uuid:=public.member_staff_id(); v_version integer; v_receipt public.member_memo_receipts%ROWTYPE;
BEGIN
 IF NOT public.has_perm('member_memos') OR NOT public.member_visible_memo(p_memo,v_staff) THEN RAISE EXCEPTION 'Memo is not addressed to this account' USING ERRCODE='42501'; END IF;
 IF coalesce(p_ack,false) AND NOT public.memo_signature_ok(p_signature) THEN RAISE EXCEPTION 'Sign in the box before you acknowledge.' USING ERRCODE='22023'; END IF;
 SELECT version INTO v_version FROM public.member_memos WHERE id=p_memo;
 INSERT INTO public.member_memo_receipts(memo_id,user_id,version,acknowledged_at,signature) VALUES(p_memo,auth.uid(),v_version,CASE WHEN p_ack THEN now() END,CASE WHEN p_ack THEN p_signature END)
 ON CONFLICT(memo_id,user_id,version) DO UPDATE SET acknowledged_at=coalesce(member_memo_receipts.acknowledged_at,EXCLUDED.acknowledged_at),
   signature=CASE WHEN member_memo_receipts.acknowledged_at IS NULL THEN EXCLUDED.signature ELSE member_memo_receipts.signature END
 RETURNING * INTO v_receipt;
 RETURN jsonb_build_object('id',p_memo,'readAt',v_receipt.read_at,'acknowledgedAt',v_receipt.acknowledged_at,'version',v_version);
END
$fn$;

REVOKE ALL ON FUNCTION public.member_acknowledge_memo(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_acknowledge_memo(uuid, boolean, text) TO authenticated, service_role;

-- ── 3. Publish › Preview: each person's signature ──────────────────────────

CREATE OR REPLACE FUNCTION public.hr_memo_preview(p_memo uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_m public.member_memos%ROWTYPE;
  v_file boolean;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Previewing needs Documentation · View' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_m FROM public.member_memos m WHERE m.id = p_memo;
  IF v_m.id IS NULL THEN
    RAISE EXCEPTION 'That memo is not there any more.' USING ERRCODE = '22023';
  END IF;
  v_file := v_m.attachment_path IS NOT NULL AND v_m.attachment_deleted_at IS NULL AND v_m.withdrawn_at IS NULL;
  RETURN jsonb_build_object(
    'id', v_m.id, 'title', v_m.title, 'body', v_m.body, 'sender', v_m.sender, 'kind', v_m.kind,
    'publishedAt', v_m.published_at, 'requiresAck', v_m.requires_ack, 'origin', v_m.origin,
    'attachmentName', CASE WHEN v_file THEN v_m.attachment_name END,
    'attachmentType', CASE WHEN v_file THEN v_m.attachment_type END,
    'withdrawnAt', v_m.withdrawn_at,
    'people', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'staffId', s.id, 'name', s.employee_name, 'department', d.name,
               'hasLogin', coalesce(u.is_active, false),
               'readAt', r.read_at, 'acknowledgedAt', r.acknowledged_at, 'signature', r.signature)
             ORDER BY (r.acknowledged_at IS NOT NULL), (u.id IS NULL), s.employee_name, s.id)
        FROM public.member_memo_recipients p
        JOIN public.hr_staff_costs s ON s.id = p.staff_id
        LEFT JOIN public.departments d ON d.id = s.department_id
        LEFT JOIN public.users u ON u.id = s.user_id
        LEFT JOIN public.member_memo_receipts r ON r.memo_id = p.memo_id AND r.user_id = s.user_id AND r.version = v_m.version
       WHERE p.memo_id = v_m.id), '[]'::jsonb));
END
$fn$;

REVOKE ALL ON FUNCTION public.hr_memo_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_memo_preview(uuid) TO authenticated, service_role;

-- ── 4. Reading a signature back ─────────────────────────────────────────────

-- One's own, on a memo one acknowledged (the current version's receipt); null when there is none.
CREATE OR REPLACE FUNCTION public.my_memo_signature(p_memo uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT r.signature
            FROM public.member_memo_receipts r
            JOIN public.member_memos m ON m.id = r.memo_id AND m.version = r.version
           WHERE r.memo_id = p_memo AND r.user_id = v_me AND r.acknowledged_at IS NOT NULL
           LIMIT 1);
END
$fn$;

REVOKE ALL ON FUNCTION public.my_memo_signature(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_memo_signature(uuid) TO authenticated, service_role;

-- A Data center letter's: its person's receipt on the memo it travelled as (as hr_documentation() reads the receipt).
CREATE OR REPLACE FUNCTION public.hr_letter_signature(p_letter uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'A letter''s signature needs Documentation · View' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object('signature', r.signature, 'acknowledgedAt', r.acknowledged_at)
            FROM public.hr_person_letters l
            JOIN public.hr_staff_costs s ON s.id = l.staff_id
            JOIN public.member_memos m ON m.id = l.memo_id
            JOIN public.member_memo_receipts r ON r.memo_id = l.memo_id AND r.user_id = s.user_id AND r.version = m.version
           WHERE l.id = p_letter AND r.acknowledged_at IS NOT NULL
           ORDER BY r.acknowledged_at
           LIMIT 1);
END
$fn$;

REVOKE ALL ON FUNCTION public.hr_letter_signature(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_letter_signature(uuid) TO authenticated, service_role;
