-- ============================================================================
-- 20261014100000_product_list_for_any_template.sql
-- The Product List opens to whoever's template ticks it — the Revenue Director first (2026-10-14, the user: Product
-- List View + Edit on the Revenue Director template; "因为 Revenue Director 本身可以决定并调整一些 costing，所以为什么
-- Product List 本身是可以 access 给他看到的"). Before, People › Permissions said under the box "Does not open — only a
-- full-access template opens it", and it did not.
-- ============================================================================
--
-- Three things held the key `product_list` to the Principal's templates:
--   1. its cell key's GATE was 'principal' (`permission_cell_keys`: a Principal-kind template only);
--   2. a Revenue app account (kind `revenue_member`) holds only the member app's keys (`current_permissions()`'s
--      list at its end);
--   3. its domain was 'admin' (`permission_defs.scope`) — and `has_scope(ARRAY['admin'])` opens far more than the
--      Product List: `access_log` and `user_permissions` (no restrictive read policy), `payroll_line_accounts`
--      (a DEFINER reader that asks the scope alone), the Principal's own tables.
-- Only the Product List opens now (a side agent's note the user passed on: "请确认主 agent 只开放 Product List 这一项"):
--   * `product_list` is no admin-domain key: scope 'none' (as `team_directory`). Every account that held it holds
--     other admin keys (the full-access templates, principal@), so nobody's admin domain moves;
--   * the gate goes: a template whose Product List · View is ticked at All opens the key, whatever its kind;
--   * a Revenue app account may hold it (`current_permissions()`, one statement swapped in production's body);
--   * the Product List's own tables open to the key by a policy of their own, `<table>_product_list` — the catalogue
--     (`catalogue_skus`, `_models`, `_option_prices`, `_combos`, `_combo_prices`) and `comm_cost_ratios` for every
--     command, the ERP's catalogue mirror and the rules the page reads (`comm_brands`, `comm_schemes`,
--     `comm_sub_departments`) for reading, and of `erp_sync_events` only the catalogue's own deliveries
--     (`doc_no = 'catalogue'`). The restrictive `needs_action_*` policies still ask Product List · View / Edit;
--   * two of its functions stop running as the caller, so neither a bill nor a scheme opens to the key:
--     `revenue_costing_gaps` (it read every bill's lines — now SECURITY DEFINER asking Product List · View) and
--     `catalogue_save_cost_setting` (it updated `comm_schemes` — DEFINER asking Product List · Edit, and still
--     writing only the ratio); `catalogue_remove_combos` asks Product List · Edit instead of the admin domain.
-- Nothing else moves: on 2026-10-14 the full-access templates and principal@ hold the key as before, and the
-- Revenue Director template (PETER, KRIS) gains it.
--
-- Production's bodies: `current_permissions()` (1416f048…) and `catalogue_remove_combos` (25a03e2f…) have one
-- statement swapped (pg_temp.swap_check); `revenue_costing_gaps` (47e17f53…) and `catalogue_save_cost_setting`
-- (6f9b97a8…) are replaced whole from production's text after the guard finds those md5s — the first moves from
-- LANGUAGE sql to plpgsql to say why it refuses. Running it twice changes nothing.
-- PGlite: tests/member-sql/validate-product-list-access.mjs.

DO $guard$
DECLARE
  v_fn record;
  v_md5 text;
  v_src text;
BEGIN
  FOR v_fn IN SELECT * FROM (VALUES
    ('public.revenue_costing_gaps(date,date)', '47e17f532a41dd0bd8a8e6cc03a56769'),
    ('public.catalogue_save_cost_setting(uuid,numeric,jsonb,text[])', '6f9b97a8b70fcc51cdd17b67d219190c')
  ) AS f(sig, md5) LOOP
    SELECT md5(p.prosrc), p.prosrc INTO v_md5, v_src FROM pg_proc p WHERE p.oid = v_fn.sig::regprocedure;
    IF v_md5 IS DISTINCT FROM v_fn.md5 AND strpos(v_src, 'product_list.') = 0 THEN
      RAISE EXCEPTION '% changed in production since this migration was written (md5 %)', v_fn.sig, v_md5;
    END IF;
  END LOOP;
END
$guard$;

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

-- ── The key: no admin domain, no Principal gate, a Revenue app account may hold it ──
UPDATE public.permission_defs SET scope = 'none' WHERE key = 'product_list' AND scope = 'admin';
UPDATE public.permission_cell_keys SET gate = NULL WHERE function_key = 'product_list' AND action = 'view' AND gate = 'principal';

SELECT pg_temp.swap_check('public.current_permissions()'::regprocedure,
  $old$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage'])$old$,
  $new$OR key=ANY(ARRAY['member_portal','member_quote','member_requests','member_memos','member_insight','member_crm','crm_manage','product_list'])$new$);

-- ── The Product List's own tables, to whoever holds the key ─────────────────────
DROP POLICY IF EXISTS catalogue_skus_product_list ON public.catalogue_skus;
CREATE POLICY catalogue_skus_product_list ON public.catalogue_skus FOR ALL TO authenticated
  USING ((SELECT public.has_perm('product_list'))) WITH CHECK ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_models_product_list ON public.catalogue_models;
CREATE POLICY catalogue_models_product_list ON public.catalogue_models FOR ALL TO authenticated
  USING ((SELECT public.has_perm('product_list'))) WITH CHECK ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_option_prices_product_list ON public.catalogue_option_prices;
CREATE POLICY catalogue_option_prices_product_list ON public.catalogue_option_prices FOR ALL TO authenticated
  USING ((SELECT public.has_perm('product_list'))) WITH CHECK ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_combos_product_list ON public.catalogue_combos;
CREATE POLICY catalogue_combos_product_list ON public.catalogue_combos FOR ALL TO authenticated
  USING ((SELECT public.has_perm('product_list'))) WITH CHECK ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS catalogue_combo_prices_product_list ON public.catalogue_combo_prices;
CREATE POLICY catalogue_combo_prices_product_list ON public.catalogue_combo_prices FOR ALL TO authenticated
  USING ((SELECT public.has_perm('product_list'))) WITH CHECK ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS comm_cost_ratios_product_list ON public.comm_cost_ratios;
CREATE POLICY comm_cost_ratios_product_list ON public.comm_cost_ratios FOR ALL TO authenticated
  USING ((SELECT public.has_perm('product_list'))) WITH CHECK ((SELECT public.has_perm('product_list')));

DROP POLICY IF EXISTS erp_products_product_list ON public.erp_products;
CREATE POLICY erp_products_product_list ON public.erp_products FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS erp_product_models_product_list ON public.erp_product_models;
CREATE POLICY erp_product_models_product_list ON public.erp_product_models FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS erp_maintenance_options_product_list ON public.erp_maintenance_options;
CREATE POLICY erp_maintenance_options_product_list ON public.erp_maintenance_options FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS erp_fabrics_product_list ON public.erp_fabrics;
CREATE POLICY erp_fabrics_product_list ON public.erp_fabrics FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS comm_brands_product_list ON public.comm_brands;
CREATE POLICY comm_brands_product_list ON public.comm_brands FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS comm_schemes_product_list ON public.comm_schemes;
CREATE POLICY comm_schemes_product_list ON public.comm_schemes FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS comm_sub_departments_product_list ON public.comm_sub_departments;
CREATE POLICY comm_sub_departments_product_list ON public.comm_sub_departments FOR SELECT TO authenticated
  USING ((SELECT public.has_perm('product_list')));
DROP POLICY IF EXISTS erp_sync_events_product_list ON public.erp_sync_events;
CREATE POLICY erp_sync_events_product_list ON public.erp_sync_events FOR SELECT TO authenticated
  USING (doc_no = 'catalogue' AND (SELECT public.has_perm('product_list')));

-- ── Its functions ask for its actions — never for the admin domain ─────────────
SELECT pg_temp.swap_check('public.catalogue_remove_combos(jsonb)'::regprocedure,
  $old$IF NOT COALESCE((SELECT has_scope(ARRAY['admin'])), FALSE) THEN
        RAISE EXCEPTION 'Only the Principal can remove a combo.' USING ERRCODE = '42501';
    END IF;$old$,
  $new$IF NOT COALESCE((SELECT public.has_any_action(ARRAY['product_list.edit'])), FALSE) THEN
        RAISE EXCEPTION 'Removing a combo needs Product List · Edit.' USING ERRCODE = '42501';
    END IF;$new$);

CREATE OR REPLACE FUNCTION public.revenue_costing_gaps(p_from date, p_to date)
 RETURNS TABLE(item_code text, item_group text, product_name text, brand_code text, lines bigint, bills bigint, qty numeric, revenue numeric, in_sku_master boolean, has_price boolean, reason text, erp_product_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
    IF NOT COALESCE(public.has_any_action(ARRAY['product_list.view']), FALSE) THEN
        RAISE EXCEPTION 'Reading the costing gaps needs Product List · View.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
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
END
$function$;

CREATE OR REPLACE FUNCTION public.catalogue_save_cost_setting(p_scheme uuid, p_divisor numeric, p_ratios jsonb, p_removes text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_touched INTEGER := 0;
    v_n       INTEGER;
    v_missing TEXT;
BEGIN
    IF NOT COALESCE(public.has_any_action(ARRAY['product_list.edit']), FALSE) THEN
        RAISE EXCEPTION 'Changing the cost ratios needs Product List · Edit.' USING ERRCODE = '42501';
    END IF;
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
$function$;

REVOKE ALL ON FUNCTION public.revenue_costing_gaps(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_costing_gaps(date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogue_save_cost_setting(uuid, numeric, jsonb, text[]) TO authenticated, service_role;
