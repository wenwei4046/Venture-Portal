-- ============================================================================
-- 20261011110000_member_documents_of.sql
-- The Revenue app's Documentation as the Principal sees a member's app
-- (2026-10-11, HR revamp round 2 — README 18.4).
-- ============================================================================
--
-- `member_documents()` (mig 20261011070000) answers for the caller's own
-- Revenue staff record (`member_staff_id()`). The Principal's View as draws a
-- member's app, read-only, so its Documentation needs the list as THAT member
-- sees it: the documents shared with their department, newest first, each
-- "New" until they opened it — the same body, for the person asked about.
--
-- It asks Documentation · View: whoever holds it already reads every document
-- and its trail (who opened it, when) on People › Documentation, so nothing
-- new is opened to anybody. STABLE — it writes nothing, and View as a person
-- may read it (lib/supabase/read-only.ts). Nothing else changes.

CREATE OR REPLACE FUNCTION public.member_documents_of(p_staff uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept uuid;
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Seeing a member''s documents needs Documentation · View.' USING ERRCODE = '42501';
  END IF;
  SELECT department_id INTO v_dept FROM public.hr_staff_costs WHERE id = p_staff;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'fileName', d.file_name, 'contentType', d.content_type,
             'size', d.file_size, 'uploadedAt', d.uploaded_at,
             'seen', EXISTS (SELECT 1 FROM public.hr_document_seen x WHERE x.document_id = d.id AND x.staff_id = p_staff))
           ORDER BY d.uploaded_at DESC, d.ref DESC)
      FROM public.hr_documents d
     WHERE d.deleted_at IS NULL AND v_dept = ANY (d.department_ids)
  ), '[]'::jsonb);
END
$$;
REVOKE ALL ON FUNCTION public.member_documents_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_documents_of(uuid) TO authenticated;
COMMENT ON FUNCTION public.member_documents_of(uuid) IS
  'The Revenue app''s Documentation as one member sees it (their department''s documents, New until they opened it) — for the Principal''s View as. Asks Documentation · View. Read-only.';
