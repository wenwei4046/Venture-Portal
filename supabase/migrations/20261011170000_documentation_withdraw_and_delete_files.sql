-- ============================================================================
-- 20261011170000_documentation_withdraw_and_delete_files.sql
-- People › Documentation (2026-10-11, the user's answer E after round 2's
-- questions): a file really goes, and a letter can be withdrawn.
-- ============================================================================
--
-- 1. Deleting a document keeps its row and its trail (greyed under "Show
--    deleted", as before) — and now its FILE goes from the bucket.
-- 2. "Withdraw letter" — a letter filed to somebody's record by mistake (a
--    Warning letter to the wrong person). Its person stops receiving it: they
--    come off the memo it travelled as, and a memo that then reaches nobody
--    goes too (a Data center letter's always does; a published one keeps its
--    other recipients). The letter itself stays on file as WITHDRAWN with its
--    trail — "Withdrawn", by whom, when; what its person had opened and
--    acknowledged is written into the trail before their receipts go — and
--    counts for nothing: a compulsory type flags its person again. Its file
--    goes from the bucket once no live record holds it (a published
--    attachment stays while its other recipients keep it).
-- 3. The bucket: Documentation · Edit may delete a file NO live record holds
--    (`hr_doc_file_unused`) — never a live document's, a live letter's or a
--    memo's attachment. The database refuses a direct DELETE on
--    storage.objects, so the page's Server Action deletes, through the Storage
--    API under the user's own session, what `hr_documentation_leftovers()`
--    lists: the files of deleted documents and withdrawn letters, and an
--    upload nobody saved once it is a day old. `hr_documentation_files_removed`
--    then writes "File deleted" on each trail whose file is gone — the bucket
--    itself is asked, never the caller.
-- 4. A withdrawn letter opens for nobody (`hr_file_readable_by_member`), the
--    page signs no link to a deleted document's or a withdrawn letter's file
--    (`hr_documentation_file`), the page's read (`hr_documentation`) says when
--    a letter was withdrawn and leaves it out of its type's count, and a type
--    whose letters were all withdrawn may be deleted (`hr_letter_type_delete`).
--
-- Function changes swap one statement each into PRODUCTION's body (read off
-- pg_proc on 2026-10-11: hr_documentation acbf0603…, hr_documentation_file
-- d3b14847…, hr_file_readable_by_member 09194b71…, hr_letter_type_delete
-- 94f50e25…); the swap refuses if production changed since. Owners, grants,
-- volatility and every other statement stay.

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

-- ── 1. A letter can be withdrawn ────────────────────────────────────────────

ALTER TABLE public.hr_person_letters
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES public.users(id);

CREATE OR REPLACE FUNCTION public.hr_letter_withdraw(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_letter public.hr_person_letters%ROWTYPE;
  v_person text;
  v_user uuid;
  v_read timestamptz;
  v_ack timestamptz;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Withdrawing a letter needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_letter FROM public.hr_person_letters WHERE id = p_id FOR UPDATE;
  IF v_letter.id IS NULL THEN
    RAISE EXCEPTION 'That letter is not on file any more.' USING ERRCODE = '22023';
  END IF;
  IF v_letter.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'That letter is already withdrawn.' USING ERRCODE = '22023';
  END IF;
  SELECT s.employee_name, s.user_id INTO v_person, v_user FROM public.hr_staff_costs s WHERE s.id = v_letter.staff_id;

  IF v_letter.memo_id IS NOT NULL THEN
    -- What its person had done with it stays on the letter's own trail ...
    SELECT min(r.read_at), min(r.acknowledged_at) INTO v_read, v_ack
      FROM public.member_memo_receipts r
     WHERE r.memo_id = v_letter.memo_id AND r.user_id = v_user;
    IF v_read IS NOT NULL THEN
      INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, created_at)
      VALUES (p_id, 'Opened in Revenue app', v_user, coalesce(v_person, ''), v_read);
    END IF;
    IF v_ack IS NOT NULL THEN
      INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, created_at)
      VALUES (p_id, 'Acknowledged', v_user, coalesce(v_person, ''), v_ack);
    END IF;
    -- ... and it stops reaching them.
    DELETE FROM public.member_memo_recipients WHERE memo_id = v_letter.memo_id AND staff_id = v_letter.staff_id;
    IF v_user IS NOT NULL THEN
      DELETE FROM public.member_memo_receipts WHERE memo_id = v_letter.memo_id AND user_id = v_user;
    END IF;
  END IF;

  UPDATE public.hr_person_letters SET withdrawn_at = now(), withdrawn_by = auth.uid() WHERE id = p_id;

  -- A memo that now reaches nobody goes too — a Data center letter's always does.
  IF v_letter.memo_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.member_memo_recipients r WHERE r.memo_id = v_letter.memo_id)
     AND NOT EXISTS (SELECT 1 FROM public.member_memo_audiences a WHERE a.memo_id = v_letter.memo_id) THEN
    UPDATE public.hr_person_letters SET memo_id = NULL WHERE memo_id = v_letter.memo_id;
    DELETE FROM public.member_memo_receipts WHERE memo_id = v_letter.memo_id;
    DELETE FROM public.member_memos WHERE id = v_letter.memo_id;
  END IF;

  INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, note)
  VALUES (p_id, 'Withdrawn', auth.uid(), public.hr_doc_actor_name(),
          'No longer on ' || coalesce(v_person, 'the person') || '''s record or in the Revenue app');
  RETURN jsonb_build_object('id', p_id, 'person', v_person, 'type', v_letter.type_name);
END
$$;
REVOKE ALL ON FUNCTION public.hr_letter_withdraw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_letter_withdraw(uuid) TO authenticated;

-- ── 2. Files no live record holds ────────────────────────────────────────────

-- Whether a file in the bucket is still somebody's: a live document, a letter
-- not withdrawn, or a memo's attachment. The bucket's delete policy asks it,
-- so it answers only Documentation · Edit — anybody else hears "no".
CREATE OR REPLACE FUNCTION public.hr_doc_file_unused(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RETURN false;
  END IF;
  RETURN p_name IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.hr_documents d WHERE d.file_path = p_name AND d.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = p_name AND l.withdrawn_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.member_memos m WHERE m.attachment_path = p_name);
END
$$;
REVOKE ALL ON FUNCTION public.hr_doc_file_unused(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_doc_file_unused(text) TO authenticated;

CREATE POLICY hr_documents_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hr-documents'
    AND (storage.foldername(name))[1] IN ('documents', 'letters', 'publish')
    AND public.hr_doc_file_unused(name));

-- The files to delete now: a deleted document's, a withdrawn letter's (once no
-- live record holds it), and an upload nobody saved once it is a day old (a
-- Save that failed after its file went up). At most a hundred at a time.
CREATE OR REPLACE FUNCTION public.hr_documentation_leftovers()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Deleting files needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT array_agg(x.name ORDER BY x.created_at, x.name)
      FROM (SELECT o.name, o.created_at
              FROM storage.objects o
             WHERE o.bucket_id = 'hr-documents'
               AND (storage.foldername(o.name))[1] IN ('documents', 'letters', 'publish')
               AND public.hr_doc_file_unused(o.name)
               AND (o.created_at < now() - interval '1 day'
                    OR EXISTS (SELECT 1 FROM public.hr_documents d WHERE d.file_path = o.name)
                    OR EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = o.name))
             ORDER BY o.created_at, o.name
             LIMIT 100) x
  ), '{}'::text[]);
END
$$;
REVOKE ALL ON FUNCTION public.hr_documentation_leftovers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_documentation_leftovers() TO authenticated;

-- After the page deleted them: "File deleted" on each trail whose file is
-- really gone from the bucket — once.
CREATE OR REPLACE FUNCTION public.hr_documentation_files_removed(p_paths text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_docs integer;
  v_letters integer;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.edit']) THEN
    RAISE EXCEPTION 'Deleting files needs Documentation · Edit' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.hr_document_events (document_id, what, actor_id, actor_name, note)
  SELECT d.id, 'File deleted', auth.uid(), public.hr_doc_actor_name(), d.file_name
    FROM public.hr_documents d
   WHERE d.file_path = ANY (coalesce(p_paths, '{}'::text[])) AND d.deleted_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hr-documents' AND o.name = d.file_path)
     AND NOT EXISTS (SELECT 1 FROM public.hr_document_events e WHERE e.document_id = d.id AND e.what = 'File deleted');
  GET DIAGNOSTICS v_docs = ROW_COUNT;
  INSERT INTO public.hr_letter_events (letter_id, what, actor_id, actor_name, note)
  SELECT l.id, 'File deleted', auth.uid(), public.hr_doc_actor_name(), l.file_name
    FROM public.hr_person_letters l
   WHERE l.file_path = ANY (coalesce(p_paths, '{}'::text[])) AND l.withdrawn_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'hr-documents' AND o.name = l.file_path)
     AND NOT EXISTS (SELECT 1 FROM public.hr_letter_events e WHERE e.letter_id = l.id AND e.what = 'File deleted');
  GET DIAGNOSTICS v_letters = ROW_COUNT;
  RETURN v_docs + v_letters;
END
$$;
REVOKE ALL ON FUNCTION public.hr_documentation_files_removed(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_documentation_files_removed(text[]) TO authenticated;

-- ── 3. A withdrawn letter, everywhere it was read ────────────────────────────

-- Its person no longer opens its file.
SELECT pg_temp.swap_check('public.hr_file_readable_by_member(text)',
  $q$OR EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = p_name AND l.staff_id = v_staff)$q$,
  $q$OR EXISTS (SELECT 1 FROM public.hr_person_letters l WHERE l.file_path = p_name AND l.staff_id = v_staff AND l.withdrawn_at IS NULL)$q$);

-- The page's read: a type counts the letters still on file ...
SELECT pg_temp.swap_check('public.hr_documentation()',
  $q$'count', (SELECT count(*) FROM public.hr_person_letters l WHERE l.letter_type_id = t.id))$q$,
  $q$'count', (SELECT count(*) FROM public.hr_person_letters l WHERE l.letter_type_id = t.id AND l.withdrawn_at IS NULL))$q$);
-- ... and a letter says when it was withdrawn.
SELECT pg_temp.swap_check('public.hr_documentation()',
  $q$'filedAt', l.filed_at, 'filedBy', l.filed_by_name, 'source', l.source,$q$,
  $q$'filedAt', l.filed_at, 'filedBy', l.filed_by_name, 'source', l.source, 'withdrawnAt', l.withdrawn_at,$q$);

-- No link is signed to a deleted document's or a withdrawn letter's file.
SELECT pg_temp.swap_check('public.hr_documentation_file(text,uuid)',
  $q$'contentType', l.content_type, 'deleted', false)$q$,
  $q$'contentType', l.content_type, 'deleted', l.withdrawn_at IS NOT NULL)$q$);
SELECT pg_temp.swap_check('public.hr_documentation_file(text,uuid)',
  $q$RAISE EXCEPTION 'That file is no longer here' USING ERRCODE = '22023';
  END IF;$q$,
  $q$RAISE EXCEPTION 'That file is no longer here' USING ERRCODE = '22023';
  END IF;
  IF (v->>'deleted')::boolean THEN
    RAISE EXCEPTION 'Its file was deleted with it.' USING ERRCODE = '22023';
  END IF;$q$);

-- A type whose letters were all withdrawn may be deleted.
SELECT pg_temp.swap_check('public.hr_letter_type_delete(uuid)',
  $q$IF EXISTS (SELECT 1 FROM public.hr_person_letters WHERE letter_type_id = p_id) THEN$q$,
  $q$IF EXISTS (SELECT 1 FROM public.hr_person_letters WHERE letter_type_id = p_id AND withdrawn_at IS NULL) THEN$q$);
