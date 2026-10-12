-- ============================================================================
-- 20261012210000_memos_reach_every_view.sql
-- A memo reaches its person in EVERY view, and is acknowledged once
-- (2026-10-12 — the user: "我发现当我在 HR 这里 publish memo 的时候，我是没有收到
-- 的 … 我在任何一个 view 都可以收到那个 notification，那我只需要 acknowledge 一次，
-- 我每一个 view 就都当做是 acknowledge 了，因为主要都是我的 account 嘛"; and "如果我
-- 发 memo 时附带了文件（比如发给 kris 这个 user），他在打开 memo 时是看不到附件的").
-- ============================================================================
--
-- Until now a memo (People › Documentation › Publish, a Data center letter) was
-- read only in the Revenue app, through member_staff_id() — the record of a
-- Revenue (commission) person. Anybody else it was addressed to — a Director,
-- HR, Finance — had nowhere to read it, and nobody was told one had come: the
-- user published to themself (Director · LOO WEN WEI) and saw nothing.
--
-- 1. `my_memos()` — the caller's own: every live memo addressed to the People
--    record their login holds (any department), each with their receipt.
--    `my_memo_mark(memo, ack)` writes that receipt — read, or acknowledged —
--    keyed by LOGIN and version (member_memo_receipts' own key), the very row
--    the Revenue app writes: a memo acknowledged in the portal (any view), the
--    HR app or the Revenue app is acknowledged in all of them.
-- 2. `memo_attachment(memo)` — a memo's file, to sign a short link to: for a
--    person it is addressed to, or Documentation · View (Publish › Preview, the
--    Revenue app's View as). The bucket's read policy already lets both through
--    (`hr_file_readable_by_member` — a recipient's memo attachment; or
--    Documentation · View).
-- 3. `hr_memo_preview(memo)` — Publish › Preview: the memo as its people read
--    it, and each person's receipt — or that they have no login yet, so it cannot
--    reach them. Documentation · View.
-- 4. Notices: a memo's new recipients are told (`app_notifications`, kind and
--    ref 'memo') — whoever published it too, when it is addressed to them; a
--    recipient taken off it (a withdraw) loses its notice; a receipt (opened in
--    any view) reads the memo's notice. A trigger that fails only warns: a notice
--    never stops the publish it tells of. The app pushes them right after.
-- 5. The Revenue app's two snapshots give each memo its kind and its attachment
--    (name, type) — one statement swapped into each of PRODUCTION's bodies (read
--    off pg_proc 2026-10-12: member_data_snapshot(boolean) ce7749e8…,
--    member_principal_snapshot(boolean) fea986ba…); the swap refuses if
--    production changed since, and a second run changes nothing.
--
-- No new table. Comments stay outside the function bodies.

-- ── 4a. The notices may tell of a memo ──────────────────────────────────────

ALTER TABLE public.app_notifications DROP CONSTRAINT IF EXISTS app_notifications_kind_check;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_kind_check
  CHECK (kind IN ('hiring', 'rooms', 'review', 'memo'));
ALTER TABLE public.app_notifications DROP CONSTRAINT IF EXISTS app_notifications_ref_kind_check;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_ref_kind_check
  CHECK (ref_kind IN ('hiring_request', 'booking', 'member_request', 'memo'));

-- ── 1. One's own memos ──────────────────────────────────────────────────────

-- The caller's own People record: the one their login holds, still on the payroll.
-- A shared login (principal@, finance@, hr@) holds none and has no memos.
CREATE OR REPLACE FUNCTION public.my_memos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := auth.uid();
  v_staff uuid;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  SELECT s.id INTO v_staff FROM public.hr_staff_costs s
   WHERE s.user_id = v_me AND s.status = 'active'
   ORDER BY s.created_at, s.id LIMIT 1;
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('staffId', NULL, 'memos', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('staffId', v_staff, 'memos', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', m.id, 'title', m.title, 'body', m.body, 'sender', m.sender, 'kind', m.kind,
             'publishedAt', m.published_at, 'effectiveAt', m.effective_at, 'version', m.version,
             'requiresAck', m.requires_ack,
             'attachmentName', CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_name END,
             'attachmentType', CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_type END,
             'readAt', r.read_at, 'acknowledgedAt', r.acknowledged_at)
           ORDER BY m.published_at DESC, m.id)
      FROM (SELECT x.* FROM public.member_memos x
             WHERE x.withdrawn_at IS NULL AND x.published_at <= now()
               AND (EXISTS (SELECT 1 FROM public.member_memo_recipients p WHERE p.memo_id = x.id AND p.staff_id = v_staff)
                 OR EXISTS (SELECT 1 FROM public.member_memo_audiences a
                             WHERE a.memo_id = x.id AND public.member_has_membership(v_staff, a.sub_department_id)))
             ORDER BY x.published_at DESC, x.id LIMIT 100) m
      LEFT JOIN public.member_memo_receipts r ON r.memo_id = m.id AND r.user_id = v_me AND r.version = m.version
  ), '[]'::jsonb));
END
$fn$;

REVOKE ALL ON FUNCTION public.my_memos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_memos() TO authenticated, service_role;
COMMENT ON FUNCTION public.my_memos() IS
  'The caller''s own memos (2026-10-12): every live memo addressed to the People record their login holds, with their receipt — for the portal''s every view, the HR app and the Revenue app.';

-- Read (p_ack false) or acknowledged: the caller's own receipt, one per login and version.
CREATE OR REPLACE FUNCTION public.my_memo_mark(p_memo uuid, p_ack boolean DEFAULT false)
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
  INSERT INTO public.member_memo_receipts (memo_id, user_id, version, acknowledged_at)
  VALUES (p_memo, v_me, v_version, CASE WHEN coalesce(p_ack, false) THEN now() END)
  ON CONFLICT (memo_id, user_id, version) DO UPDATE
     SET acknowledged_at = coalesce(member_memo_receipts.acknowledged_at, EXCLUDED.acknowledged_at)
  RETURNING * INTO v_receipt;
  RETURN jsonb_build_object('id', p_memo, 'readAt', v_receipt.read_at, 'acknowledgedAt', v_receipt.acknowledged_at, 'version', v_version);
END
$fn$;

REVOKE ALL ON FUNCTION public.my_memo_mark(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_memo_mark(uuid, boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.my_memo_mark(uuid, boolean) IS
  'The caller''s own receipt of a memo addressed to them — read, or acknowledged (2026-10-12). One per login and version: acknowledged in one view is acknowledged in all.';

-- ── 2. A memo's file ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.memo_attachment(p_memo uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me    uuid := auth.uid();
  v_staff uuid;
  v_m     public.member_memos%ROWTYPE;
BEGIN
  IF v_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_me AND u.is_active) THEN
    RAISE EXCEPTION 'Sign in with an active account.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_m FROM public.member_memos m WHERE m.id = p_memo;
  IF v_m.id IS NULL OR v_m.attachment_path IS NULL THEN
    RAISE EXCEPTION 'This memo has no file.' USING ERRCODE = '22023';
  END IF;
  IF v_m.withdrawn_at IS NOT NULL OR v_m.attachment_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This file was withdrawn.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    SELECT s.id INTO v_staff FROM public.hr_staff_costs s
     WHERE s.user_id = v_me AND s.status = 'active'
     ORDER BY s.created_at, s.id LIMIT 1;
    IF v_staff IS NULL OR NOT EXISTS (SELECT 1 FROM public.member_memo_recipients p WHERE p.memo_id = p_memo AND p.staff_id = v_staff) THEN
      RAISE EXCEPTION 'That memo is not addressed to you.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN jsonb_build_object('path', v_m.attachment_path, 'fileName', v_m.attachment_name, 'contentType', v_m.attachment_type);
END
$fn$;

REVOKE ALL ON FUNCTION public.memo_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.memo_attachment(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.memo_attachment(uuid) IS
  'A memo''s file, to sign a short link to (2026-10-12): for a person it is addressed to, or Documentation · View. Never a withdrawn memo''s.';

-- ── 3. Publish › Preview ────────────────────────────────────────────────────

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
               'readAt', r.read_at, 'acknowledgedAt', r.acknowledged_at)
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
COMMENT ON FUNCTION public.hr_memo_preview(uuid) IS
  'Publish › Preview (2026-10-12): a memo as its people read it, and each person''s receipt — or that they have no login yet. Documentation · View.';

-- ── 4b. Telling them ────────────────────────────────────────────────────────

-- New recipients: one notice each, for the login their record holds. The publisher too, when it is
-- addressed to them (unlike notify_people, which never tells the person who did it).
CREATE OR REPLACE FUNCTION public.notify_memo_recipients_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  BEGIN
    INSERT INTO public.app_notifications (user_id, kind, title, body, ref_kind, ref_id)
    SELECT DISTINCT ON (s.user_id, m.id) s.user_id, 'memo',
           left(CASE WHEN m.kind IS NULL OR m.kind = 'Memo' THEN m.title ELSE m.kind || ' · ' || m.title END, 200),
           left('From ' || coalesce(nullif(trim(m.sender), ''), 'People & Culture')
             || CASE WHEN m.requires_ack THEN ' · please read and acknowledge' ELSE '' END, 400),
           'memo', m.id::text
      FROM added a
      JOIN public.member_memos m ON m.id = a.memo_id AND m.withdrawn_at IS NULL
      JOIN public.hr_staff_costs s ON s.id = a.staff_id AND s.status = 'active' AND s.user_id IS NOT NULL
      JOIN public.users u ON u.id = s.user_id AND u.is_active
     ORDER BY s.user_id, m.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'A memo''s notices could not be written: %', SQLERRM;
  END;
  RETURN NULL;
END
$fn$;

-- Taken off a memo (a withdraw): their notice of it goes too.
CREATE OR REPLACE FUNCTION public.notify_memo_recipients_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  BEGIN
    DELETE FROM public.app_notifications n
     USING removed r
      JOIN public.hr_staff_costs s ON s.id = r.staff_id
     WHERE n.ref_kind = 'memo' AND n.ref_id = r.memo_id::text AND n.user_id = s.user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'A memo''s notices could not be taken back: %', SQLERRM;
  END;
  RETURN NULL;
END
$fn$;

-- A receipt — the memo opened in any view — reads its notice.
CREATE OR REPLACE FUNCTION public.memo_receipt_reads_its_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  BEGIN
    UPDATE public.app_notifications SET read_at = now()
     WHERE user_id = NEW.user_id AND ref_kind = 'memo' AND ref_id = NEW.memo_id::text AND read_at IS NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'A memo''s notice could not be marked read: %', SQLERRM;
  END;
  RETURN NULL;
END
$fn$;

REVOKE ALL ON FUNCTION public.notify_memo_recipients_added() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_memo_recipients_removed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memo_receipt_reads_its_notice() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_memo_recipients_added ON public.member_memo_recipients;
CREATE TRIGGER notify_memo_recipients_added AFTER INSERT ON public.member_memo_recipients
REFERENCING NEW TABLE AS added
FOR EACH STATEMENT EXECUTE FUNCTION public.notify_memo_recipients_added();

DROP TRIGGER IF EXISTS notify_memo_recipients_removed ON public.member_memo_recipients;
CREATE TRIGGER notify_memo_recipients_removed AFTER DELETE ON public.member_memo_recipients
REFERENCING OLD TABLE AS removed
FOR EACH STATEMENT EXECUTE FUNCTION public.notify_memo_recipients_removed();

DROP TRIGGER IF EXISTS memo_receipt_reads_its_notice ON public.member_memo_receipts;
CREATE TRIGGER memo_receipt_reads_its_notice AFTER INSERT OR UPDATE ON public.member_memo_receipts
FOR EACH ROW EXECUTE FUNCTION public.memo_receipt_reads_its_notice();

-- ── 5. The Revenue app's snapshots: each memo's kind and attachment ─────────

CREATE OR REPLACE FUNCTION pg_temp.swap_check(p_sig regprocedure, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_src   text := (SELECT prosrc FROM pg_proc WHERE oid = p_sig);
  v_pat   text;
  v_found text;
  v_n     integer;
BEGIN
  IF strpos(v_src, p_new) > 0 THEN
    RETURN;  -- already swapped
  END IF;
  -- The old statement, every run of whitespace matching any run.
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- A member's own snapshot.
SELECT pg_temp.swap_check('public.member_data_snapshot(boolean)'::regprocedure,
  $old$'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at,'departments',$old$,
  $new$'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at,'kind',m.kind,'attachmentName',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_name END,'attachmentType',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_type END,'departments',$new$);

-- The Principal's (View as).
SELECT pg_temp.swap_check('public.member_principal_snapshot(boolean)'::regprocedure,
  $old$'readAt',receipt.read_at,'acknowledgedAt',receipt.acknowledged_at,$old$,
  $new$'readAt',receipt.read_at,'acknowledgedAt',receipt.acknowledged_at,'kind',m.kind,'attachmentName',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_name END,'attachmentType',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_type END,$new$);

NOTIFY pgrst, 'reload schema';
