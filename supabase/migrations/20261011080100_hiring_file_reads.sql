-- ============================================================================
-- 20261011080100_hiring_file_reads.sql
-- Hiring: opening a file reads, downloading it is a step of the trail.
-- ============================================================================
--
-- hiring_file_of() (20261011080000) both found a file and, for a résumé
-- downloaded, wrote "Résumé downloaded" into the request's trail. While
-- viewing the portal as somebody (read-only, lib/supabase/read-only.ts) the
-- app may call only functions that write nothing, so the two halves part:
--   hiring_file_path(kind, id)       STABLE — where a résumé / attachment is
--   hiring_resume_downloaded(cand)   the trail's "Résumé downloaded"
-- hiring_file_of() is closed to the app (EXECUTE revoked; nothing calls it).

CREATE OR REPLACE FUNCTION public.hiring_file_path(p_kind text, p_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_path text;
  v_name text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'candidate' THEN
    SELECT c.resume_path, c.resume_name INTO v_path, v_name FROM public.hiring_candidates c WHERE c.id::text = p_id;
  ELSIF p_kind = 'talent' THEN
    SELECT t.resume_path, t.resume_name INTO v_path, v_name FROM public.hiring_talents t WHERE t.id::text = p_id AND t.removed_at IS NULL;
  ELSIF p_kind = 'attachment' THEN
    SELECT r.attachment_path, r.attachment_name INTO v_path, v_name FROM public.hiring_requests r WHERE r.id = p_id;
  ELSE
    RAISE EXCEPTION 'Unknown file' USING ERRCODE = '22023';
  END IF;
  IF v_path IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('path', v_path, 'name', coalesce(v_name, 'file'));
END
$fn$;

CREATE OR REPLACE FUNCTION public.hiring_resume_downloaded(p_candidate uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_request text;
  v_name text;
BEGIN
  IF public.has_any_action(ARRAY['hiring.view']) IS NOT TRUE THEN
    RAISE EXCEPTION 'Hiring access is required' USING ERRCODE = '42501';
  END IF;
  SELECT c.request_id, c.name INTO v_request, v_name FROM public.hiring_candidates c WHERE c.id = p_candidate AND c.resume_path IS NOT NULL;
  IF v_request IS NULL THEN RETURN; END IF;
  PERFORM public.hiring_log(v_request, 'Résumé downloaded', NULL, v_name);
END
$fn$;

REVOKE ALL ON FUNCTION public.hiring_file_of(text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hiring_file_path(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hiring_resume_downloaded(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hiring_file_path(text, text), public.hiring_resume_downloaded(uuid) TO authenticated;
