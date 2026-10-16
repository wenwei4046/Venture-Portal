-- Production's permission readers as they ran on 2026-10-16, before 20261016190000 (pg_get_functiondef, verbatim).
-- validate-personal-edits-win.mjs checks each one's md5 against production's before the migration swaps anything.

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
           CASE WHEN (SELECT role FROM me)::text = 'dept_manager'
                 AND k.function_key IN ('dept_pool', 'opex', 'my_billing', 'dept_reports', 'claims')
                THEN 'dept' ELSE 'all' END
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
  SELECT EXISTS(SELECT 1 FROM public.permission_template_sensitive s
   WHERE s.template_id=(SELECT id FROM my_template) AND s.field='salary') AS yes
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
  OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list'])
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.current_sensitive_fields()
 RETURNS text[]
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
  ), fields AS (
    SELECT s.field AS f FROM public.permission_template_sensitive s
     WHERE s.template_id = (SELECT template_id FROM my_title)
    UNION
    SELECT k.f FROM me, unnest(CASE me.role::text
        WHEN 'principal' THEN ARRAY['bank', 'nric']
        WHEN 'hr' THEN ARRAY['bank', 'nric']
        WHEN 'finance' THEN ARRAY['bank']
        ELSE '{}'::text[] END) AS k(f)
     WHERE (SELECT template_id FROM my_title) IS NULL
  )
  SELECT coalesce(array_agg(f ORDER BY f), '{}'::text[]) FROM (
    SELECT f FROM fields WHERE f IN ('bank', 'nric')
    UNION
    SELECT 'salary' WHERE 'salary_individual' = ANY (public.current_permissions())
  ) x
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.has_action(p_function text, p_action text, p_scope text DEFAULT 'all'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
  SELECT coalesce(
           array_position(ARRAY['own', 'dept', 'all'], public.current_actions() ->> (p_function || '.' || p_action))
             >= array_position(ARRAY['own', 'dept', 'all'], coalesce(p_scope, 'all')),
           false)
     AND (NOT EXISTS (SELECT 1 FROM public.permission_key_actions k
                       WHERE k.function_key = p_function AND k.action = 'view')
          OR EXISTS (SELECT 1 FROM public.permission_key_actions k
                      WHERE k.function_key = p_function AND k.action = 'view'
                        AND k.legacy_key = ANY (public.current_permissions())))
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.has_any_action(p_wants text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
  WITH me AS (
    SELECT public.current_actions() AS acts, public.current_permissions() AS perms
  ), wants AS (
    SELECT split_part(w, ':', 1) AS fa,
           split_part(split_part(w, ':', 1), '.', 1) AS fn,
           coalesce(nullif(split_part(w, ':', 2), ''), 'all') AS scope
      FROM unnest(coalesce(p_wants, '{}'::text[])) AS w
  )
  SELECT EXISTS (
    SELECT 1
      FROM wants, me
     WHERE array_position(ARRAY['own', 'dept', 'all'], me.acts ->> wants.fa)
             >= array_position(ARRAY['own', 'dept', 'all'], wants.scope)
       AND (NOT EXISTS (SELECT 1 FROM public.permission_key_actions k
                         WHERE k.function_key = wants.fn AND k.action = 'view')
            OR EXISTS (SELECT 1 FROM public.permission_key_actions k
                        WHERE k.function_key = wants.fn AND k.action = 'view'
                          AND k.legacy_key = ANY (me.perms))))
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.has_perm(p_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
  select p_key = any (public.current_permissions())
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.has_scope(p_scopes text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
  select exists (
    select 1
    from permission_defs d
    where d.scope = any (p_scopes)
      and d.key = any (public.current_permissions())
  )
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.sees_sensitive(p_field text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
  SELECT p_field = ANY (public.current_sensitive_fields())

  );
END
$function$
;
