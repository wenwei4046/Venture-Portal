-- ============================================================================
-- 20261020160000_waiting_list_signed_form_word.sql
-- An applicant's signed form may be a Word file too (2026-10-20, the user, asked whether the waiting drawer's
-- upload should take Word: "want word file as well").
-- ============================================================================
--
-- HR's two ways of attaching an applicant's signed form — the waiting drawer's Upload / Replace
-- (member_waiting_attach_form, mig 20261020130000) and "+" with a form (member_waiting_add_form, mig
-- 20261011230000) — take a Word file beside a PDF, PNG or JPG: a .docx, or an old .doc. The server looks at the
-- bytes (a .docx is a ZIP holding word/document.xml, a .doc an OLE file holding a WordDocument stream; one that
-- holds macros is refused — `letterFile` in lib/commission/waiting-add.ts) and uploads it with the type it found.
-- The member app's own uploads are unchanged: its server takes only a PDF, PNG or JPG (verifiedUpload), and the
-- bucket still lets a member write only into their own draft.
--
-- 1. The bucket member-invoices keeps its 3 MB and takes the two Word types as well.
-- 2. member_request_attachments' mime_type check takes them too.
-- 3. member_waiting_attach_form (production's body, md5 7cd93f56…) — two statements swapped: the path may end
--    .docx / .doc; the type is one of the five and the path's extension is that type's (read with substring:
--    `right(p_path, 4)` cannot read ".docx").
-- 4. member_waiting_add_form (production's body, md5 a27df82b…) — two statements swapped: the same path and the
--    same five types.
-- pg_temp.swap_check as in 20261014213000: production's statement, whitespace-blind, exactly once; a body
-- already swapped is left alone.
-- PGlite: tests/member-sql/validate-waiting-signed-form.mjs (this migration verbatim, after 20261011230000 and
-- 20261020130000).

-- ── 1, 2. The bucket and the attestations take Word ─────────────────────────

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']
 WHERE id = 'member-invoices';

ALTER TABLE public.member_request_attachments
  DROP CONSTRAINT IF EXISTS member_request_attachments_mime_type_check,
  ADD CONSTRAINT member_request_attachments_mime_type_check CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'));

-- ── 3, 4. HR's two writers ──────────────────────────────────────────────────

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

-- The drawer's Upload / Replace.
SELECT pg_temp.swap_check('public.member_waiting_attach_form(uuid,text,text,text)',
  $q$'/[0-9a-f-]{36}\.(pdf|png|jpg)$'$q$,
  $q$'/[0-9a-f-]{36}\.(pdf|png|jpg|docx|doc)$'$q$);
SELECT pg_temp.swap_check('public.member_waiting_attach_form(uuid,text,text,text)',
  $q$OR v_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg')
     OR right(p_path, 4) IS DISTINCT FROM (CASE v_mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/png' THEN '.png' ELSE '.jpg' END) THEN$q$,
  $q$OR v_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword')
     OR substring(p_path FROM '\.([a-z]+)$') IS DISTINCT FROM (CASE v_mime WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx' WHEN 'application/msword' THEN 'doc' END) THEN$q$);

-- "+" with a form.
SELECT pg_temp.swap_check('public.member_waiting_add_form(uuid,text)',
  $q$'/[0-9a-f-]{36}\.(pdf|png|jpg)$'$q$,
  $q$'/[0-9a-f-]{36}\.(pdf|png|jpg|docx|doc)$'$q$);
SELECT pg_temp.swap_check('public.member_waiting_add_form(uuid,text)',
  $q$OR v_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg') THEN$q$,
  $q$OR v_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword') THEN$q$);
