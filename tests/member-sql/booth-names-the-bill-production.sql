-- Production's bodies (pg_get_functiondef, 2026-11-14) the migration was written from — read by
-- its PGlite check, which compares each md5 before the migration runs. Never edited by hand.

-- erp_sync_order_brand(p_order jsonb, p_order_id uuid)
-- md5(prosrc) = c1c371268abf92b9cbe27824bc080057
CREATE OR REPLACE FUNCTION public.erp_sync_order_brand(p_order jsonb, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        -- (20261112003700) Another ERP company's order is that company's brand (2990's Home → 2990S), whatever its
        -- products are branded and whatever was picked for it.
        (SELECT b.code
           FROM comm_brands b
          WHERE b.is_active AND b.erp_company_id IS NOT NULL
            AND b.erp_company_id = COALESCE(
                  CASE WHEN p_order->>'companyId' ~ '^[0-9]{1,15}$' THEN (p_order->>'companyId')::BIGINT END,
                  (SELECT o.erp_company_id FROM sales_orders o WHERE o.id = p_order_id))
          ORDER BY b.created_at, b.id
          LIMIT 1),
        erp_sync_brand_code(p_order->>'brand'),
        erp_sync_brand_code(p_order->>'brandPick'),
        (SELECT p.brand_code FROM sales_order_brand_picks p WHERE p.order_id = p_order_id),
        CASE WHEN LOWER(COALESCE(p_order->'fair'->>'status', '')) <> 'cancelled'
             THEN erp_sync_brand_code(p_order->'fair'->>'brand') END);
$function$;

-- sales_order_restamp_brand(p_order_id uuid)
-- md5(prosrc) = 19433c3e1a804498a93eeb0fd5b7aa27
CREATE OR REPLACE FUNCTION public.sales_order_restamp_brand(p_order_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order sales_orders%ROWTYPE;
    v_brand TEXT;
BEGIN
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    v_brand := COALESCE(
        erp_sync_order_brand(JSONB_BUILD_OBJECT(
            'brand', v_order.raw->'header'->>'branding',
            'brandPick', v_order.raw->>'vpBrand',
            'fair', v_order.raw->'fair'), p_order_id),
        sales_order_lines_brand(p_order_id));
    UPDATE sales_orders SET brand_code = v_brand
     WHERE id = p_order_id AND brand_code IS DISTINCT FROM v_brand;
    UPDATE sales_order_lines l
       SET brand_code = COALESCE(erp_sync_brand_code(l.raw->>'brand'), v_brand, erp_sync_brand_by_prefix(l.product_code))
     WHERE l.order_id = p_order_id;
    RETURN v_brand;
END;
$function$;

-- erp_sync_brand_code(p_name text)
-- md5(prosrc) = b0df3385c53987a71ca25a28e17d056e
CREATE OR REPLACE FUNCTION public.erp_sync_brand_code(p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT b.code
    FROM comm_brands b
    WHERE p_name IS NOT NULL
      AND b.is_active
      AND (UPPER(BTRIM(b.code)) = UPPER(BTRIM(p_name)) OR UPPER(BTRIM(b.name)) = UPPER(BTRIM(p_name))
           OR UPPER(BTRIM(p_name)) IN (SELECT UPPER(BTRIM(s)) FROM UNNEST(b.sub_brands) AS s))
    -- A brand's own code or name before another brand's sub-brand of the same word.
    ORDER BY CASE WHEN UPPER(BTRIM(b.code)) = UPPER(BTRIM(p_name)) OR UPPER(BTRIM(b.name)) = UPPER(BTRIM(p_name))
                  THEN 0 ELSE 1 END,
             b.created_at
    LIMIT 1;
$function$;

-- sales_order_lines_brand(p_order_id uuid)
-- md5(prosrc) = 474ea3dc952541d61e8215473eb5550d
CREATE OR REPLACE FUNCTION public.sales_order_lines_brand(p_order_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT x.brand
      FROM (SELECT COALESCE(erp_sync_brand_code(l.raw->>'brand'), erp_sync_brand_by_prefix(l.product_code)) AS brand,
                   SUM(l.line_amount) AS amount
              FROM sales_order_lines l
             WHERE l.order_id = p_order_id
             GROUP BY 1) x
     WHERE x.brand IS NOT NULL
     ORDER BY x.amount DESC, x.brand
     LIMIT 1;
$function$;

-- erp_sync_brand_by_prefix(p_item_code text)
-- md5(prosrc) = a8995c8d20055f2924a8a17f82a1a717
CREATE OR REPLACE FUNCTION public.erp_sync_brand_by_prefix(p_item_code text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT b.code
    FROM comm_brands b
    CROSS JOIN LATERAL UNNEST(b.item_code_prefixes) AS p(prefix)
    WHERE p_item_code IS NOT NULL
      AND b.is_active
      AND UPPER(BTRIM(p_item_code)) LIKE UPPER(BTRIM(p.prefix)) || '%'
    ORDER BY LENGTH(p.prefix) DESC
    LIMIT 1;
$function$;
