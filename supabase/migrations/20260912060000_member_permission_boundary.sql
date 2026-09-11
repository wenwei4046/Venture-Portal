-- A neutral member account cannot inherit managerial access from its company
-- title or an accidentally broad per-person exception. Existing roles retain
-- exactly their prior title -> role fallback -> person override resolution.
-- Member role defaults also work when the staff title was already configured.
CREATE OR REPLACE FUNCTION public.current_permissions() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH me AS (
  SELECT id,role FROM public.users WHERE id=auth.uid() AND is_active
 ), my_title AS (
  SELECT s.title_id FROM public.hr_staff_costs s WHERE s.user_id=(SELECT id FROM me) AND s.title_id IS NOT NULL LIMIT 1
 ), title_is_configured AS (
  SELECT EXISTS(SELECT 1 FROM public.title_permissions tp WHERE tp.title_id=(SELECT title_id FROM my_title)) AS yes
 ), inherited AS (
  SELECT tp.permission_key AS key FROM public.title_permissions tp
  WHERE tp.title_id=(SELECT title_id FROM my_title) AND (SELECT yes FROM title_is_configured)
   AND (SELECT role FROM me)<>'revenue_member'
  UNION
  SELECT rdp.permission_key FROM public.role_default_permissions rdp
  WHERE rdp.role=(SELECT role FROM me) AND (NOT(SELECT yes FROM title_is_configured) OR (SELECT role FROM me)='revenue_member')
 ), overrides AS (
  SELECT permission_key AS key,granted FROM public.user_permissions WHERE user_id=(SELECT id FROM me)
 ), resolved AS (
  SELECT i.key FROM inherited i WHERE NOT EXISTS(SELECT 1 FROM overrides o WHERE o.key=i.key AND NOT o.granted)
  UNION SELECT o.key FROM overrides o WHERE o.granted
 )
 SELECT coalesce(array_agg(key),'{}'::text[]) FROM resolved
 WHERE (SELECT role FROM me)<>'revenue_member'
  OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos']);
$$;
REVOKE ALL ON FUNCTION public.current_permissions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_permissions() TO authenticated;
