-- ============================================================================
-- 20261014244500_member_forms_remove_template.sql
-- Sales Groups › Waiting list / Replacement list: HR's uploaded form can be
-- removed, and its file goes with it (2026-10-14).
-- ============================================================================
--
-- The user (2026-10-14), on the "Form: <name>" chip above the waiting list:
-- "这个 upload file 本身呢，其实它应该是要能够 right click 然后按 view，同时也可以
-- 按 remove。因为如果我 upload 错的话，我需要 remove 掉。" Asked whether Remove
-- deletes the file too, or only stops members downloading it: "连档案一起删掉".
--
-- Remove (revenue/waiting-actions.ts `removeFormTemplate`) saves the next
-- version of the form without HR's file — members download the form built
-- from the questions again — and then deletes the file from the private
-- `member-forms` bucket under HR's own session. The bucket had no DELETE
-- policy, so nothing in it could ever be deleted (the upload's own clean-up
-- after a refused save failed quietly too).
--
-- 1. member_form_template_unused(name): whether a file under templates/ is
--    nobody's form now — neither the waiting list's latest version nor the
--    replacement list's names it. An older version may (its row keeps the
--    name for the history; nothing opens an older version's file). Answers
--    only a manager of member requests; anybody else hears "no".
-- 2. member_forms_templates_delete: a manager deletes a file under templates/
--    that no form uses now — never the one members download.

CREATE OR REPLACE FUNCTION public.member_form_template_unused(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.member_is_manager('member_requests_manage') IS NOT TRUE THEN
    RETURN false;
  END IF;
  RETURN p_name IS NOT NULL
     AND p_name IS DISTINCT FROM (SELECT f.template_path FROM public.member_waiting_forms f ORDER BY f.version DESC LIMIT 1)
     AND p_name IS DISTINCT FROM (SELECT f.template_path FROM public.member_replacement_forms f ORDER BY f.version DESC LIMIT 1);
END
$$;
-- The delete policy asks it under the caller's session.
REVOKE ALL ON FUNCTION public.member_form_template_unused(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_form_template_unused(text) TO authenticated;

-- A DELETE through the Storage API names its rows, so it needs the bucket's
-- SELECT policy too: member_forms_templates_read already shows templates/ to
-- a manager.
DROP POLICY IF EXISTS member_forms_templates_delete ON storage.objects;
CREATE POLICY member_forms_templates_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'member-forms' AND (storage.foldername(name))[1] = 'templates'
    AND (SELECT public.member_is_manager('member_requests_manage'))
    AND public.member_form_template_unused(name));
