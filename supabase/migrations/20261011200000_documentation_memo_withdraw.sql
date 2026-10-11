-- ============================================================================
-- 20261011200000_documentation_memo_withdraw.sql
-- People › Documentation › Publish (2026-10-11, the user's answer to the
-- parked question after #293: "加"): a published memo can be WITHDRAWN from
-- the Published list — taken away from everyone it reached, its attachment
-- deleted — by Documentation · Edit.
-- ============================================================================
--
-- 1. `hr_memo_withdraw(id)` — a memo of the Published list (origin 'publish';
--    a Data center letter's own memo is withdrawn with its letter). Every copy
--    "Publish & save" filed into somebody's Data center is withdrawn with it
--    (what its person had opened / acknowledged written into its trail, then
--    "Withdrawn — The memo was withdrawn from everyone it reached"); its
--    receipts, recipients and sub-department audiences go, so it reaches
--    nobody — the Revenue app, the Principal's View as, Member services. The
--    memo itself STAYS on the Published list as HR's record ("留着当纪录"):
--    `withdrawn_at` / `withdrawn_by` / `withdrawn_by_name` and its line —
--    `withdrawn_note`, what it had reached ("Had reached 12 people · 9
--    acknowledged").
-- 2. Its attachment is nobody's any more: `hr_doc_file_unused` asks only live
--    memos, `hr_documentation_leftovers()` lists a withdrawn memo's attachment
--    at once, and `hr_documentation_files_removed` stamps the memo's
--    `attachment_deleted_at` once the bucket no longer has the file.
-- 3. A published memo whose last saved copy is withdrawn from a record
--    (`hr_letter_withdraw`) now stays on the list as withdrawn too, instead of
--    vanishing from it; a Data center letter's one-person memo still goes.
-- 4. The page's read (`hr_documentation`) gives each published memo those
--    fields; Member services' snapshot (`member_admin_snapshot`) leaves a
--    withdrawn memo out.
--
-- Function changes swap one statement each into PRODUCTION's body (read off
-- pg_proc on 2026-10-11: hr_documentation 404fb917…, hr_doc_file_unused
-- 5bdced3b…, hr_documentation_leftovers 1ebbd8e9…, hr_documentation_files_removed
-- 15b39651…, hr_letter_withdraw e6ddbd5f…, member_admin_snapshot 3f94d368…);
-- the swap refuses if production changed since, and a second run changes
-- nothing. Owners, grants, volatility and every other statement stay.

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

-- ── 1. A memo can be withdrawn ──────────────────────────────────────────────

ALTER TABLE public.member_memos
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS withdrawn_by_name text,
  ADD COLUMN IF NOT EXISTS withdrawn_note text,
  ADD COLUMN IF NOT EXISTS attachment_deleted_at timestamptz;

CREATE OR REPLACE FUNCTION public.hr_memo_withdraw(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_memo public.member_memos%ROWTYPE;
  v_people integer;
  v_where text;
  v_acked integer;
  v_copy record;
  v_read timestamptz;
  v_ack timestamptz;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Withdrawing a memo needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_memo FROM public.member_memos WHERE id = p_id FOR UPDATE;
  IF v_memo.id IS NULL OR v_memo.origin IS DISTINCT FROM 'publish' THEN
    RAISE EXCEPTION 'That is not on the Published list.' USING ERRCODE = '22023';
  END IF;
  IF v_memo.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'It is already withdrawn.' USING ERRCODE = '22023';
  END IF;

  -- What it had reached, for its line on the list.
  SELECT count(*) INTO v_people FROM public.member_memo_recipients r WHERE r.memo_id = p_id;
  SELECT string_agg(sd.name, ', ' ORDER BY sd.name) INTO v_where
    FROM public.member_memo_audiences a JOIN public.comm_sub_departments sd ON sd.id = a.sub_department_id
   WHERE a.memo_id = p_id;
  SELECT count(DISTINCT x.user_id) INTO v_acked FROM public.member_memo_receipts x
   WHERE x.memo_id = p_id AND x.version = v_memo.version AND x.acknowledged_at IS NOT NULL;

  -- Each copy "Publish & save" filed into a Data center goes with it, its person's steps kept on its trail.
  FOR v_copy IN
    SELECT l.id, s.user_id, s.employee_name
      FROM public.hr_person_letters l JOIN public.hr_staff_costs s ON s.id = l.staff_id
     WHERE l.memo_id = p_id AND l.withdrawn_at IS NULL
     ORDER BY l.ref
  LOOP
    v_read := NULL;
    v_ack := NULL;
    IF v_copy.user_id IS NOT NULL THEN
      SELECT min(r.read_at), min(r.acknowledged_at) INTO v_read, v_ack
        FROM public.member_memo_receipts r WHERE r.memo_id = p_id AND r.user_id = v_copy.user_id;
    END IF;
    IF v_read IS NOT NULL THEN
      INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, created_at)
      VALUES (v_copy.id, 'Opened in Revenue app', v_copy.user_id, coalesce(v_copy.employee_name, ''), v_read);
    END IF;
    IF v_ack IS NOT NULL THEN
      INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, created_at)
      VALUES (v_copy.id, 'Acknowledged', v_copy.user_id, coalesce(v_copy.employee_name, ''), v_ack);
    END IF;
    UPDATE public.hr_person_letters SET withdrawn_at = now(), withdrawn_by = auth.uid() WHERE id = v_copy.id;
    INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, note)
    VALUES (v_copy.id, 'Withdrawn', auth.uid(), public.hr_doc_actor_name(), 'The memo was withdrawn from everyone it reached');
  END LOOP;

  -- Nobody receives it any more; it stays on the Published list as withdrawn.
  DELETE FROM public.member_memo_receipts WHERE memo_id = p_id;
  DELETE FROM public.member_memo_recipients WHERE memo_id = p_id;
  DELETE FROM public.member_memo_audiences WHERE memo_id = p_id;
  UPDATE public.member_memos
     SET withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawn_by_name = public.hr_doc_actor_name(),
         withdrawn_note = 'Had reached '
           || CASE WHEN v_people > 0 THEN v_people || CASE WHEN v_people = 1 THEN ' person' ELSE ' people' END
                   ELSE coalesce(v_where, 'nobody') END
           || ' · ' || v_acked || ' acknowledged'
   WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'title', v_memo.title, 'reached', v_people);
END
$$;
REVOKE ALL ON FUNCTION public.hr_memo_withdraw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_memo_withdraw(uuid) TO authenticated;

-- ── 2. Its attachment is nobody's ───────────────────────────────────────────

SELECT pg_temp.swap_check('public.hr_doc_file_unused(text)',
  $q$AND NOT EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = p_name);$q$,
  $q$AND NOT EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = p_name AND m.withdrawn_at IS NULL);$q$);

SELECT pg_temp.swap_check('public.hr_documentation_leftovers()',
  $q$OR EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = o.name))$q$,
  $q$OR EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = o.name)
                    OR EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = o.name))$q$);

SELECT pg_temp.swap_check('public.hr_documentation_files_removed(text[])',
  $q$GET DIAGNOSTICS v_letters = ROW_COUNT;
  RETURN v_docs + v_letters;$q$,
  $q$GET DIAGNOSTICS v_letters = ROW_COUNT;
  v_docs := v_docs + v_letters;
  UPDATE public.member_memos m SET attachment_deleted_at = now()
   WHERE m.attachment_path = ANY (coalesce(p_paths, '{}'::text[])) AND m.withdrawn_at IS NOT NULL AND m.attachment_deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hr-documents' AND o.name = m.attachment_path);
  GET DIAGNOSTICS v_letters = ROW_COUNT;
  RETURN v_docs + v_letters;$q$);

-- ── 3. A published memo whose last copy is withdrawn stays on the list ───────

SELECT pg_temp.swap_check('public.hr_letter_withdraw(uuid)',
  $q$UPDATE public.hr_person_letters SET memo_id = NULL WHERE memo_id = v_letter.memo_id;
    DELETE FROM public.member_memo_receipts WHERE memo_id = v_letter.memo_id;
    DELETE FROM public.member_memos WHERE id = v_letter.memo_id;$q$,
  $q$IF (SELECT m.origin FROM public.member_memos m WHERE m.id = v_letter.memo_id) = 'publish' THEN
      DELETE FROM public.member_memo_receipts WHERE memo_id = v_letter.memo_id;
      UPDATE public.member_memos
         SET withdrawn_at = now(), withdrawn_by = auth.uid(), withdrawn_by_name = public.hr_doc_actor_name(),
             withdrawn_note = 'Its last copy was withdrawn from ' || coalesce(v_person, 'its person') || '''s record'
       WHERE id = v_letter.memo_id AND withdrawn_at IS NULL;
    ELSE
      UPDATE public.hr_person_letters SET memo_id = NULL WHERE memo_id = v_letter.memo_id;
      DELETE FROM public.member_memo_receipts WHERE memo_id = v_letter.memo_id;
      DELETE FROM public.member_memos WHERE id = v_letter.memo_id;
    END IF;$q$);

-- ── 4. Who reads it ─────────────────────────────────────────────────────────

-- The Published list: when, by whom, what it had reached, whether its attachment is gone.
SELECT pg_temp.swap_check('public.hr_documentation()',
  $q$'attachmentName', m.attachment_name, 'saved', m.saved_to_records,$q$,
  $q$'attachmentName', m.attachment_name, 'saved', m.saved_to_records,
                     'withdrawnAt', m.withdrawn_at, 'withdrawnBy', m.withdrawn_by_name, 'withdrawnNote', m.withdrawn_note,
                     'attachmentDeletedAt', m.attachment_deleted_at,$q$);

-- Member services never lists a withdrawn memo.
SELECT pg_temp.swap_check('public.member_admin_snapshot()',
  $q$AND NOT EXISTS(SELECT 1 FROM public.member_memo_recipients x WHERE x.memo_id=m.id)));$q$,
  $q$AND NOT EXISTS(SELECT 1 FROM public.member_memo_recipients x WHERE x.memo_id=m.id) AND m.withdrawn_at IS NULL));$q$);
