-- ════════════════════════════════════════════════════════════════════════════
-- member_income_context: who My income (and My honours) is for (2026-10-05)
--
-- My income works the member's month out with Comm Cal's own engine, which
-- reads the whole sub-department's bills and costs through the service role.
-- Before that read, the member's OWN session must say whose month it is:
--
--   p_staff NULL  the caller themselves — an active membership of the
--                 sub-department (member_insight_scheme) — returns their staff id
--   p_staff set   an active Principal viewing a member of it
--                 (member_principal_context) — returns p_staff
--
-- The helpers it calls are not executable by a session; this one is, and it
-- answers nothing but the staff id. Like member_quote_context for a quote's
-- prices. Additive.
--
-- Rollback: DROP FUNCTION member_income_context(uuid, uuid);
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.member_income_context(p_sub_department uuid, p_staff uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF p_staff IS NULL THEN
  -- The caller's own active membership of this sub-department.
  PERFORM public.member_insight_scheme(p_sub_department);
  RETURN public.member_staff_id();
 END IF;
 -- An active Principal viewing a member of this sub-department.
 PERFORM public.member_principal_context(p_staff, p_sub_department, NULL);
 RETURN p_staff;
END $function$;
REVOKE ALL ON FUNCTION public.member_income_context(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_income_context(uuid, uuid) TO authenticated;
