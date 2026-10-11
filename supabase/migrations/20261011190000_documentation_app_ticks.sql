-- ============================================================================
-- 20261011190000_documentation_app_ticks.sql
-- The Revenue app's Profile · Documentation box binds in the database too (the
-- user's answer to review L6, 2026-10-11 — Book a room's half is 20261011150000):
-- with its View unticked for a member, `member_documents()` and
-- `member_document_open()` refuse, and `hr_file_readable_by_member` no longer
-- opens a document shared with their department. Letters and memo attachments
-- addressed to the person stay theirs — they live in Memos, which no tab hides.
-- `tab_box_closed` (150000) is the twin of lib/page-tabs closedBoxes; nothing is
-- closed for an account whose tabs are still worked out from its cells.
--
-- PRODUCTION's bodies, one statement swapped each (pg_temp.swap_check, as
-- 20261011150000): member_documents 19d7d98b…, member_document_open 095872a6…,
-- hr_file_readable_by_member fb80af00… (after 20261011170000). A second run
-- changes nothing. Comments stay outside the bodies.
-- ============================================================================

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
    RETURN;
  END IF;
  v_pat := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  SELECT count(*) INTO v_n FROM regexp_matches(v_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '%: its statement is there % times, not once — production changed since this migration was written', p_sig, v_n;
  END IF;
  v_found := (regexp_match(v_src, '(' || v_pat || ')'))[1];
  EXECUTE replace(pg_get_functiondef(p_sig), v_found, p_new);
END
$fn$;

-- The list and the open: refused while Documentation's View is closed to the member.
SELECT pg_temp.swap_check('public.member_documents()',
  $q$SELECT department_id INTO v_dept FROM public.hr_staff_costs WHERE id = v_staff;$q$,
  $q$IF public.tab_box_closed('rev.documentation', 'view') THEN
    RAISE EXCEPTION 'Documentation is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT department_id INTO v_dept FROM public.hr_staff_costs WHERE id = v_staff;$q$);
SELECT pg_temp.swap_check('public.member_document_open(uuid)',
  $q$SELECT department_id INTO v_dept FROM public.hr_staff_costs WHERE id = v_staff;$q$,
  $q$IF public.tab_box_closed('rev.documentation', 'view') THEN
    RAISE EXCEPTION 'Documentation is not open to your account.' USING ERRCODE = '42501';
  END IF;
  SELECT department_id INTO v_dept FROM public.hr_staff_costs WHERE id = v_staff;$q$);

-- A department's document file: only while that box is open. Their own letters and memo files are untouched.
SELECT pg_temp.swap_check('public.hr_file_readable_by_member(text)',
  $q$RETURN EXISTS (SELECT 1 FROM public.hr_documents d
                  WHERE d.file_path = p_name AND d.deleted_at IS NULL AND v_dept = ANY (d.department_ids))$q$,
  $q$RETURN (NOT public.tab_box_closed('rev.documentation', 'view') AND EXISTS (SELECT 1 FROM public.hr_documents d
                  WHERE d.file_path = p_name AND d.deleted_at IS NULL AND v_dept = ANY (d.department_ids)))$q$);
