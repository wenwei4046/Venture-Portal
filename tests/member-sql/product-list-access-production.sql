-- Production's own text, read with pg_get_functiondef on 2026-10-14, of the permission helpers and the three Product
-- List functions 20261014100000 changes. Loaded by validate-product-list-access.mjs, which checks every md5(prosrc)
-- before running the migration over them (current_permissions 1416f048…, catalogue_remove_combos 25a03e2f…,
-- revenue_costing_gaps 47e17f53…, catalogue_save_cost_setting 6f9b97a8…).

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
  OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage'])
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

CREATE OR REPLACE FUNCTION public.may_read(p_table text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN coalesce((SELECT public.has_any_action(r.actions)
                     FROM public.permission_table_reads r
                    WHERE r.table_name = p_table), false);
END
$function$
;

CREATE OR REPLACE FUNCTION public.may_write(p_table text, p_command text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN (
  SELECT coalesce((SELECT public.has_any_action(w.actions)
                     FROM public.permission_table_writes w
                    WHERE w.table_name = p_table AND w.command = p_command), false)
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.catalogue_sku_for_code(p_company bigint, p_code text)
 RETURNS SETOF erp_products
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT e.*
      FROM erp_products e
     WHERE e.erp_company_id = p_company
       AND UPPER(BTRIM(e.item_code)) = UPPER(BTRIM(p_code))
     ORDER BY (e.item_code = BTRIM(p_code)) DESC, (e.removed_at IS NULL) DESC, e.active DESC, e.erp_id
     LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.revenue_costing_gaps(p_from date, p_to date)
 RETURNS TABLE(item_code text, item_group text, product_name text, brand_code text, lines bigint, bills bigint, qty numeric, revenue numeric, in_sku_master boolean, has_price boolean, reason text, erp_product_id text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH gaps AS (
        SELECT l.product_code                                        AS item_code,
               MIN(l.item_group)                                     AS item_group,
               MIN(l.product_name)                                   AS product_name,
               MIN(l.brand_code)                                     AS brand_code,
               COUNT(*)                                              AS lines,
               COUNT(DISTINCT l.order_id)                            AS bills,
               ROUND(SUM(l.qty), 3)                                  AS qty,
               ROUND(SUM(l.line_amount), 2)                          AS revenue,
               MODE() WITHIN GROUP (ORDER BY l.cost_detail->>'reason') AS reason,
               MIN(COALESCE(o.erp_company_id, 1))                    AS company
          FROM sales_order_lines l
          JOIN sales_orders o ON o.id = l.order_id
         WHERE o.order_date >= p_from
           AND o.order_date <  p_to
           AND NOT o.cancelled
           AND l.cost_source IS NULL
         GROUP BY l.product_code
    )
    SELECT g.item_code, g.item_group, g.product_name, g.brand_code,
           g.lines, g.bills, g.qty, g.revenue,
           e.erp_id IS NOT NULL,
           EXISTS (SELECT 1 FROM catalogue_skus s
                    WHERE s.erp_product_id = e.erp_id
                      AND (s.price IS NOT NULL OR jsonb_array_length(COALESCE(s.price_grid, '[]'::JSONB)) > 0)),
           COALESCE(g.reason, CASE WHEN e.erp_id IS NULL THEN 'not_in_sku_master' ELSE 'unpriced' END),
           e.erp_id
      FROM gaps g
      LEFT JOIN LATERAL catalogue_sku_for_code(g.company, g.item_code) e ON TRUE
     ORDER BY g.revenue DESC, g.lines DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.catalogue_save_cost_setting(p_scheme uuid, p_divisor numeric, p_ratios jsonb, p_removes text[])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_touched INTEGER := 0;
    v_n       INTEGER;
    v_missing TEXT;
BEGIN
    PERFORM 1 FROM comm_schemes WHERE id = p_scheme;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown sub-department scheme' USING ERRCODE = 'P0002';
    END IF;

    IF p_divisor IS NOT NULL THEN
        -- The range 20260915060000 gave revenue_cost_divisor.
        IF NOT (p_divisor > 0 AND p_divisor <= 10) THEN
            RAISE EXCEPTION 'A cost ratio must be above 0 and at most 10' USING ERRCODE = '22023';
        END IF;
        UPDATE comm_schemes
           SET revenue_cost_divisor = p_divisor, updated_at = now()
         WHERE id = p_scheme AND revenue_cost_divisor IS DISTINCT FROM p_divisor;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    IF COALESCE(CARDINALITY(p_removes), 0) > 0 THEN
        DELETE FROM comm_cost_ratios WHERE scheme_id = p_scheme AND erp_product_id = ANY (p_removes);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    IF jsonb_typeof(p_ratios) = 'array' AND jsonb_array_length(p_ratios) > 0 THEN
        SELECT r.erp_product_id INTO v_missing
          FROM jsonb_to_recordset(p_ratios) AS r(erp_product_id TEXT, ratio NUMERIC)
         WHERE NOT EXISTS (SELECT 1 FROM erp_products p WHERE p.erp_id = r.erp_product_id)
         LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'SKU % is not in the SKU Master', v_missing USING ERRCODE = '23503';
        END IF;
        -- The code is read again on every save, so saving a SKU the ERP
        -- renamed follows it to the code its new bills carry.
        INSERT INTO comm_cost_ratios (scheme_id, erp_product_id, product_code, ratio, updated_by, updated_at)
        SELECT p_scheme, r.erp_product_id, p.item_code, r.ratio, auth.uid(), now()
          FROM jsonb_to_recordset(p_ratios) AS r(erp_product_id TEXT, ratio NUMERIC)
          JOIN erp_products p ON p.erp_id = r.erp_product_id
        ON CONFLICT (scheme_id, erp_product_id) DO UPDATE
           SET product_code = EXCLUDED.product_code,
               ratio        = EXCLUDED.ratio,
               updated_by   = EXCLUDED.updated_by,
               updated_at   = EXCLUDED.updated_at;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    RETURN v_touched;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.catalogue_remove_combos(p_sets jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company BIGINT := 1;
    v_set     JSONB;
    v_model   TEXT;
    v_key     TEXT;
    v_rows    INTEGER;
    v_n       INTEGER := 0;
BEGIN
    IF NOT COALESCE((SELECT has_scope(ARRAY['admin'])), FALSE) THEN
        RAISE EXCEPTION 'Only the Principal can remove a combo.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_sets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sets) = 0 THEN
        RAISE EXCEPTION 'Pick a combo to remove.' USING ERRCODE = '22023';
    END IF;

    FOR v_set IN SELECT s FROM jsonb_array_elements(p_sets) s LOOP
        v_model := UPPER(BTRIM(COALESCE(v_set->>'base_model', '')));
        v_key   := v_set->>'slots_key';
        IF v_model = '' OR v_key IS NULL OR v_key = '' THEN
            RAISE EXCEPTION 'Pick a combo to remove.' USING ERRCODE = '22023';
        END IF;

        UPDATE catalogue_combos
           SET removed_at = now(),
               removed_by = auth.uid()
         WHERE erp_company_id = v_company
           AND base_model     = v_model
           AND slots_key      = v_key
           AND removed_at IS NULL;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
            RAISE EXCEPTION 'Model % no longer has that combo. Refresh the page and try again.', v_model USING ERRCODE = '22023';
        END IF;

        DELETE FROM catalogue_combo_prices
         WHERE erp_company_id = v_company
           AND base_model     = v_model
           AND slots_key      = v_key;
        v_n := v_n + 1;
    END LOOP;

    RETURN v_n;
END;
$function$
;

