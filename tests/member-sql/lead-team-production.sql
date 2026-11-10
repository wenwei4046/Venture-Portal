CREATE OR REPLACE FUNCTION public.current_actions()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
  WITH me AS (
    SELECT id, role FROM public.users WHERE id = auth.uid() AND is_active
  ), my_title AS (
    SELECT t.template_id FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id
     WHERE s.user_id = (SELECT id FROM me) LIMIT 1
  ), my_template AS (
    SELECT pt.id FROM public.permission_templates pt WHERE pt.id = (SELECT template_id FROM my_title)
  ), cells AS (
    SELECT g.function_key, g.action, g.scope
      FROM public.permission_template_grants g
     WHERE g.template_id = (SELECT id FROM my_template)
       AND NOT EXISTS (SELECT 1 FROM public.user_permission_cells u
                        WHERE u.user_id = (SELECT id FROM me) AND u.function_key = g.function_key AND u.action = g.action)
    UNION ALL
    SELECT u.function_key, u.action, u.scope
      FROM public.user_permission_cells u
     WHERE u.user_id = (SELECT id FROM me) AND u.scope IS NOT NULL AND EXISTS (SELECT 1 FROM my_template)
    UNION ALL
    SELECT k.function_key, k.action,
           'all' /* every key at All: the Dept Manager's department reach went with the kind (2026-10-17) */
      FROM unnest(public.current_permissions()) AS p(key)
      JOIN public.permission_key_actions k ON k.legacy_key = p.key
     WHERE NOT EXISTS (SELECT 1 FROM my_template)
  )
  SELECT coalesce(jsonb_object_agg(fa, scope), '{}'::jsonb)
    FROM (
      SELECT c.function_key || '.' || c.action AS fa,
             (array_agg(c.scope ORDER BY array_position(ARRAY['own', 'dept', 'all'], c.scope) DESC))[1] AS scope
        FROM cells c
       WHERE EXISTS (SELECT 1 FROM me)
       GROUP BY 1
    ) x
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.current_permissions()
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
 WITH me AS (
  SELECT id,role FROM public.users WHERE id=auth.uid() AND is_active
 ), my_title AS (
  SELECT s.title_id,t.template_id FROM public.hr_staff_costs s JOIN public.titles t ON t.id=s.title_id
  WHERE s.user_id=(SELECT id FROM me) LIMIT 1
 ), my_template AS (
  SELECT pt.id,pt.base_role FROM public.permission_templates pt WHERE pt.id=(SELECT template_id FROM my_title)
 ), cells AS (
  SELECT g.function_key,g.action,g.scope FROM public.permission_template_grants g
  WHERE g.template_id=(SELECT id FROM my_template)
   AND NOT EXISTS(SELECT 1 FROM public.user_permission_cells u
    WHERE u.user_id=(SELECT id FROM me) AND u.function_key=g.function_key AND u.action=g.action)
  UNION ALL
  SELECT u.function_key,u.action,u.scope FROM public.user_permission_cells u
  WHERE u.user_id=(SELECT id FROM me) AND u.scope IS NOT NULL AND EXISTS(SELECT 1 FROM my_template)
 ), sees_salary AS (
  SELECT coalesce((SELECT p.granted FROM public.user_permission_sensitive p WHERE p.user_id=(SELECT id FROM me) AND p.field='salary' AND EXISTS(SELECT 1 FROM my_template)),
   EXISTS(SELECT 1 FROM public.permission_template_sensitive s WHERE s.template_id=(SELECT id FROM my_template) AND s.field='salary')) AS yes
 ), template_keys AS (
  SELECT k.legacy_key AS key FROM cells c
  JOIN public.permission_cell_keys k ON k.function_key=c.function_key AND k.action=c.action
  WHERE array_position(ARRAY['own','dept','all'],c.scope)>=array_position(ARRAY['own','dept','all'],k.min_scope)
   AND (k.gate IS NULL
    OR (k.gate='salary' AND (SELECT yes FROM sees_salary))
    OR (k.gate='treasury' AND EXISTS(SELECT 1 FROM cells t WHERE t.function_key='treasury' AND t.action='view'))
    OR (k.gate='principal' AND (SELECT base_role FROM my_template)='principal'))
  UNION
  SELECT unnest(ARRAY['salary_individual','payroll_payouts']) WHERE (SELECT yes FROM sees_salary)
 ), title_is_configured AS (
  SELECT EXISTS(SELECT 1 FROM public.title_permissions tp WHERE tp.title_id=(SELECT title_id FROM my_title)) AS yes
 ), inherited AS (
  SELECT key FROM template_keys WHERE EXISTS(SELECT 1 FROM my_template)
  UNION
  SELECT tp.permission_key FROM public.title_permissions tp
  WHERE tp.title_id=(SELECT title_id FROM my_title) AND (SELECT yes FROM title_is_configured)
   AND NOT EXISTS(SELECT 1 FROM my_template) AND (SELECT role FROM me)<>'revenue_member'
  UNION
  SELECT rdp.permission_key FROM public.role_default_permissions rdp
  WHERE rdp.role=(SELECT role FROM me) AND NOT EXISTS(SELECT 1 FROM my_template)
   AND (NOT(SELECT yes FROM title_is_configured) OR (SELECT role FROM me)='revenue_member')
 ), overrides AS (
  SELECT permission_key AS key,granted FROM public.user_permissions WHERE user_id=(SELECT id FROM me)
 ), resolved AS (
  SELECT i.key FROM inherited i WHERE NOT EXISTS(SELECT 1 FROM overrides o WHERE o.key=i.key AND NOT o.granted)
  UNION SELECT o.key FROM overrides o WHERE o.granted
 )
 SELECT coalesce(array_agg(key),'{}'::text[]) FROM resolved
 WHERE (SELECT role FROM me)<>'revenue_member'
  OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list','it_requests'])
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.current_tabs()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me uuid;
  v_template uuid;
BEGIN
  SELECT id INTO v_me FROM public.users WHERE id = auth.uid() AND is_active;
  IF v_me IS NULL THEN RETURN NULL; END IF;
  SELECT t.template_id INTO v_template
    FROM public.hr_staff_costs s JOIN public.titles t ON t.id = s.title_id
   WHERE s.user_id = v_me LIMIT 1;
  IF v_template IS NULL OR NOT EXISTS (SELECT 1 FROM public.permission_templates WHERE id = v_template) THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'ticks', (SELECT array_agg(g.tab_id || '.' || g.action ORDER BY g.tab_id, g.action)
                FROM public.permission_template_tabs g WHERE g.template_id = v_template),
    'boxes', coalesce((SELECT jsonb_agg(jsonb_build_object('tab', b.tab_id, 'action', b.action, 'granted', b.granted)
                                        ORDER BY b.tab_id, b.action)
                         FROM public.user_permission_tabs b WHERE b.user_id = v_me), '[]'::jsonb),
    'cells', EXISTS (SELECT 1 FROM public.user_permission_cells c WHERE c.user_id = v_me));
END
$function$
;
