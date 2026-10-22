-- Production's own text, read with pg_get_functiondef on 2026-10-19, of member_catalogue (the Quote's catalogue, md5(prosrc)
-- a4261ebbc85d1a2f9aaf867bde9ad2f5) and every function it calls. Loaded by validate-sofa-model-names.mjs, which checks
-- each md5 before 20261019140000_sofa_model_names swaps its one expression into member_catalogue.

-- catalogue_brand_of(p_category text, p_model_branding text, p_sku_branding text) md5(prosrc) c57e06e354ec2b08906c081d8d3d9977
CREATE OR REPLACE FUNCTION public.catalogue_brand_of(p_category text, p_model_branding text, p_sku_branding text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT CASE WHEN UPPER(BTRIM(COALESCE(p_category, ''))) IN ('MATTRESS', 'SOFA')
                THEN COALESCE(erp_sync_brand_code(NULLIF(BTRIM(p_model_branding), '')),
                              erp_sync_brand_code(NULLIF(BTRIM(p_sku_branding), '')))
           END;
$function$
;

-- catalogue_calc_category(p_category text, p_name text) md5(prosrc) b1273cacef343585dc8dc85164485ec3
CREATE OR REPLACE FUNCTION public.catalogue_calc_category(p_category text, p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT CASE UPPER(BTRIM(COALESCE(p_category, '')))
        WHEN 'MATTRESS'  THEN 'Mattress'
        WHEN 'BEDFRAME'  THEN 'Bed frame'
        WHEN 'SOFA'      THEN 'Sofa'
        WHEN 'ACCESSORY' THEN CASE WHEN COALESCE(p_name, '') ~* 'PROTECTOR' THEN 'Protector'
                                   WHEN COALESCE(p_name, '') ~* 'PILLOW'    THEN 'Pillow'
                                   ELSE 'Accessory' END
        WHEN 'FABRIC_ACCESSORY' THEN 'Accessory'
        ELSE 'Other'
    END;
$function$
;

-- catalogue_default_gift(p_calc_category text) md5(prosrc) 9398d2b198ea92f76ca4d7c258a985df
CREATE OR REPLACE FUNCTION public.catalogue_default_gift(p_calc_category text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT COALESCE(p_calc_category, '') IN ('Pillow', 'Protector', 'Accessory');
$function$
;

-- catalogue_height_key(p text) md5(prosrc) d15bbca0ff85708427e948c82b4ff675
CREATE OR REPLACE FUNCTION public.catalogue_height_key(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT NULLIF(LOWER(REGEXP_REPLACE(COALESCE(p, ''), '["”“''\s]', '', 'g')), '');
$function$
;

-- catalogue_model_charges(p_company bigint, p_pool text, p_allowed jsonb) md5(prosrc) 8736a8516bf5330fca3d583a2bdff013
CREATE OR REPLACE FUNCTION public.catalogue_model_charges(p_company bigint, p_pool text, p_allowed jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT jsonb_agg(jsonb_build_object('value', o.value, 'charge', op.price) ORDER BY o.sort_order, o.value)
      FROM erp_maintenance_options o
      JOIN catalogue_option_prices op
        ON op.erp_company_id = o.erp_company_id AND op.pool = o.pool AND op.value = o.value
     WHERE o.erp_company_id = p_company
       AND o.pool = p_pool
       AND o.removed_at IS NULL
       AND o.active
       AND op.price > 0
       AND (CASE WHEN jsonb_typeof(p_allowed) = 'array' THEN jsonb_array_length(p_allowed) = 0 ELSE TRUE END
            OR EXISTS (SELECT 1
                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_allowed) = 'array'
                                                        THEN p_allowed ELSE '[]'::JSONB END) a
                        WHERE catalogue_value_key(CASE WHEN jsonb_typeof(a) = 'object'
                                                       THEN a->>'value' ELSE a #>> '{}' END)
                              = catalogue_value_key(o.value)));
$function$
;

-- catalogue_model_charges(p_company bigint, p_pool text, p_enabled jsonb, p_allowed jsonb) md5(prosrc) 5b6c299a088c8510929f868ae7185457
CREATE OR REPLACE FUNCTION public.catalogue_model_charges(p_company bigint, p_pool text, p_enabled jsonb, p_allowed jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT jsonb_agg(jsonb_build_object('value', v.value, 'charge', op.price) ORDER BY v.ord)
      FROM jsonb_array_elements_text(catalogue_model_options(p_company, p_pool, p_enabled, p_allowed))
           WITH ORDINALITY AS v(value, ord)
      JOIN catalogue_option_prices op
        ON op.erp_company_id = p_company AND op.pool = p_pool AND op.value = v.value
     WHERE op.price > 0;
$function$
;

-- catalogue_model_options(p_company bigint, p_pool text, p_enabled jsonb, p_allowed jsonb) md5(prosrc) baf5b2f98fd7c2fe9afe77a72512f619
CREATE OR REPLACE FUNCTION public.catalogue_model_options(p_company bigint, p_pool text, p_enabled jsonb, p_allowed jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(o.value ORDER BY o.sort_order, o.value), '[]'::JSONB)
      FROM erp_maintenance_options o
     WHERE o.erp_company_id = p_company
       AND o.pool = p_pool
       AND o.removed_at IS NULL
       AND o.active
       AND EXISTS (SELECT 1
                     FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_enabled) = 'array'
                                                         THEN p_enabled ELSE '[]'::JSONB END) v
                    WHERE catalogue_value_key(v) = catalogue_value_key(o.value))
       AND (CASE WHEN jsonb_typeof(p_allowed) = 'array' THEN jsonb_array_length(p_allowed) = 0 ELSE TRUE END
            OR EXISTS (SELECT 1
                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_allowed) = 'array'
                                                        THEN p_allowed ELSE '[]'::JSONB END) a
                        WHERE catalogue_value_key(CASE WHEN jsonb_typeof(a) = 'object'
                                                       THEN a->>'value' ELSE a #>> '{}' END)
                              = catalogue_value_key(o.value)));
$function$
;

-- catalogue_size_word(p_code text, p_label text) md5(prosrc) dc529afa2e91cfd79dfbcec48242c348
CREATE OR REPLACE FUNCTION public.catalogue_size_word(p_code text, p_label text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT CASE UPPER(BTRIM(COALESCE(p_code, '')))
               WHEN 'K'  THEN 'King'
               WHEN 'Q'  THEN 'Queen'
               WHEN 'S'  THEN 'Single'
               WHEN 'SS' THEN 'Super Single'
               WHEN 'SK' THEN 'Super King'
               WHEN 'SP' THEN 'Special size'
               ELSE COALESCE(NULLIF(BTRIM(p_label), ''), NULLIF(BTRIM(p_code), ''), '')
           END;
$function$
;

-- catalogue_value_key(p text) md5(prosrc) 1ea7b76ef890a99929c2b6c06c24321c
CREATE OR REPLACE FUNCTION public.catalogue_value_key(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT NULLIF(LOWER(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(p, ''), '[”“]', '"', 'g'), '\s+', ' ', 'g'))), '');
$function$
;

-- erp_sync_brand_code(p_name text) md5(prosrc) 285ce8ea21feef12b5250ac6be4ba6af
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
      AND (UPPER(BTRIM(b.code)) = UPPER(BTRIM(p_name)) OR UPPER(BTRIM(b.name)) = UPPER(BTRIM(p_name)))
    ORDER BY b.created_at
    LIMIT 1;
$function$
;

-- member_catalogue(p_brands text[], p_ids uuid[], p_priced boolean, p_suggest integer) md5(prosrc) a4261ebbc85d1a2f9aaf867bde9ad2f5
CREATE OR REPLACE FUNCTION public.member_catalogue(p_brands text[], p_ids uuid[] DEFAULT NULL::uuid[], p_priced boolean DEFAULT false, p_suggest integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company  BIGINT := 1;
    v_rows     JSONB;
    v_products JSONB;
    v_models   JSONB;
    v_options  JSONB;
    v_combos   JSONB;
BEGIN
    IF COALESCE(array_length(p_brands, 1), 0) = 0 THEN
        RETURN jsonb_build_object('products', '[]'::JSONB, 'models', '[]'::JSONB);
    END IF;

    -- Every row the answer carries, priced fields included; the unpriced answer
    -- drops them below. One JSON value rather than a temp table: this runs
    -- inside the STABLE snapshots, where no table may be written.
    WITH offered AS (
        SELECT e.vp_id, e.item_code, UPPER(COALESCE(e.category, '')) AS kind, e.base_model, e.module_code,
               e.size_code, e.size_label, e.fabric_color, e.model_erp_id,
               m.model_code, m.name AS model_name, UPPER(COALESCE(m.category, e.category, '')) AS model_kind,
               s.price, s.price_grid, s.updated_at AS sku_updated,
               cm.enabled, cm.updated_at AS model_updated,
               -- The ERP decides what it can (2026-10-06): a mattress or a sofa
               -- sells under the brand its branding names, in the section its
               -- category gives; a bed frame or an accessory is a rider in its
               -- own section, its margin judged on the cart's brand. Modular's
               -- picks (cm.calc_category, cm.brand_code) are read only for a
               -- mattress or a sofa the ERP gives no brand the portal knows —
               -- the twin is needsBrandPick in lib/catalogue/options.ts.
               CASE WHEN erp.sells AND erp.brand IS NULL
                    THEN COALESCE(cm.calc_category,
                                  catalogue_calc_category(COALESCE(m.category, e.category),
                                                          COALESCE(m.name, e.description)))
                    ELSE catalogue_calc_category(COALESCE(m.category, e.category),
                                                 COALESCE(m.name, e.description))
               END AS calc,
               cm.gift AS gift_override,
               CASE WHEN NOT erp.sells THEN NULL
                    WHEN erp.brand IS NOT NULL THEN erp.brand
                    WHEN cm.brand_code = 'RIDER' THEN NULL
                    ELSE cm.brand_code
               END AS brand,
               -- A rider joins any cart: a bed frame or an accessory, always,
               -- or a brandless mattress or sofa marked Rider on Modular. A
               -- mattress or a sofa with no ladder at all is sold under nothing
               -- and falls out below — never a rider by accident (the twin is
               -- isRiderModel).
               (NOT erp.sells OR (erp.brand IS NULL AND COALESCE(cm.brand_code = 'RIDER', FALSE))) AS rider
          FROM erp_products e
          JOIN catalogue_skus s ON s.erp_product_id = e.erp_id AND s.offered
          LEFT JOIN erp_product_models m ON m.erp_id = e.model_erp_id
          LEFT JOIN catalogue_models cm ON cm.erp_model_id = e.model_erp_id
          CROSS JOIN LATERAL (
              SELECT catalogue_brand_of(COALESCE(m.category, e.category), m.branding, e.branding) AS brand,
                     UPPER(BTRIM(COALESCE(m.category, e.category, ''))) IN ('MATTRESS', 'SOFA') AS sells
          ) erp
         WHERE e.erp_company_id = v_company
           AND e.removed_at IS NULL
           AND e.active
           AND (e.model_erp_id IS NULL OR (m.removed_at IS NULL AND COALESCE(cm.offered, FALSE)))
    ), eligible AS (
        SELECT o.*, COALESCE(o.gift_override, catalogue_default_gift(o.calc)) AS gift
          FROM offered o
         WHERE o.brand = ANY (p_brands) OR o.rider
    ), chosen AS (
        SELECT * FROM eligible WHERE p_ids IS NULL OR vp_id = ANY (p_ids)
        UNION
        SELECT * FROM (SELECT * FROM eligible
                        WHERE p_ids IS NOT NULL AND COALESCE(p_suggest, 0) > 0
                          AND calc = 'Pillow' AND gift
                        ORDER BY item_code
                        LIMIT GREATEST(COALESCE(p_suggest, 0), 0)) g
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', c.vp_id,
               'code', c.item_code,
               -- The family a SKU is sold under: a mattress, bed frame or sofa by
               -- its model (a sofa's code first: "8030 SOFFIO"); anything else by
               -- its own code without the size, so AERO-MP (K) and (Q) are one
               -- protector in two sizes.
               'name', CASE WHEN c.model_erp_id IS NOT NULL AND c.model_kind IN ('MATTRESS', 'BEDFRAME', 'SOFA') THEN
                                CASE WHEN NULLIF(BTRIM(c.model_name), '') IS NULL
                                          OR UPPER(BTRIM(c.model_name)) = UPPER(BTRIM(c.model_code)) THEN BTRIM(c.model_code)
                                     WHEN c.model_kind = 'SOFA' THEN BTRIM(c.model_code) || ' ' || BTRIM(c.model_name)
                                     ELSE BTRIM(c.model_name) END
                            ELSE COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(c.item_code, '\s*\(\s*(K|Q|S|SS|SK|SP)\s*\)\s*$', '', 'i')), ''),
                                          c.item_code)
                       END,
               'brand', c.brand,
               'category', c.calc,
               -- A sofa module's size is its module; everything else its size
               -- word, from the SKU master or the code's own (K) / (Q) / … suffix.
               'size', CASE WHEN c.kind = 'SOFA' THEN COALESCE(c.module_code, '')
                            ELSE catalogue_size_word(COALESCE(c.size_code,
                                                              (REGEXP_MATCH(c.item_code, '\(\s*(K|Q|S|SS|SK|SP)\s*\)\s*$', 'i'))[1]),
                                                     c.size_label)
                       END,
               'color', COALESCE(c.fabric_color, ''),
               'available', TRUE,
               'gift', c.gift,
               'modelId', c.model_erp_id,
               -- The grid's choices: a height the portal priced AND ticked for the
               -- model (a sofa's seat sizes). Never a price.
               'options', (SELECT jsonb_agg(DISTINCT jsonb_build_object('height', cell->>'height', 'tier', cell->>'tier'))
                             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.price_grid) = 'array'
                                                            THEN c.price_grid ELSE '[]'::JSONB END) cell
                            WHERE NULLIF(cell->>'height', '') IS NOT NULL
                              AND NULLIF(cell->>'tier', '') IS NOT NULL
                              AND (cell->>'price') ~ '^\d+(\.\d+)?$'
                              AND (c.kind <> 'SOFA'
                                   OR EXISTS (SELECT 1
                                                FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.enabled->'sizes') = 'array'
                                                                                    THEN c.enabled->'sizes' ELSE '[]'::JSONB END) h
                                               WHERE catalogue_height_key(h) = catalogue_height_key(cell->>'height')))),
               'version', CONCAT(to_jsonb(c.sku_updated) #>> '{}', ':', COALESCE(to_jsonb(c.model_updated) #>> '{}', '')),
               -- Which build a line takes and what a combo matches on — not
               -- money, so a member's builder may read them too.
               'kind', c.kind,
               'baseModel', c.base_model,
               'moduleCode', c.module_code,
               -- The money. Only the priced answer keeps it.
               'price', c.price,
               'grid', CASE WHEN jsonb_typeof(c.price_grid) = 'array' THEN c.price_grid END)
               ORDER BY c.item_code, c.vp_id), '[]'::JSONB)
      INTO v_rows
      FROM chosen c;

    SELECT COALESCE(jsonb_agg(CASE WHEN COALESCE(p_priced, FALSE) THEN x.r
                                   ELSE x.r - ARRAY['price', 'grid'] END
                              ORDER BY x.ord), '[]'::JSONB)
      INTO v_products
      FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS x(r, ord);

    -- The option dropdowns of every sofa and bed frame model in the answer.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', m.erp_id,
               'kind', UPPER(m.category),
               'options', jsonb_strip_nulls(jsonb_build_object(
                   'leg_heights', catalogue_model_options(v_company,
                                      CASE WHEN UPPER(m.category) = 'SOFA' THEN 'sofa_leg_heights' ELSE 'bedframe_leg_heights' END,
                                      cm.enabled->'leg_heights', m.allowed_options->'leg_heights'),
                   'specials', catalogue_model_options(v_company,
                                      CASE WHEN UPPER(m.category) = 'SOFA' THEN 'sofa_specials' ELSE 'bedframe_specials' END,
                                      cm.enabled->'specials', m.allowed_options->'specials'),
                   'divan_heights', CASE WHEN UPPER(m.category) = 'BEDFRAME' THEN
                                      catalogue_model_options(v_company, 'bedframe_divan_heights',
                                                              cm.enabled->'divan_heights', m.allowed_options->'divan_heights') END,
                   'total_heights', CASE WHEN UPPER(m.category) = 'BEDFRAME' THEN
                                      catalogue_model_options(v_company, 'bedframe_total_heights',
                                                              cm.enabled->'total_heights', m.allowed_options->'total_heights') END,
                   'gaps', CASE WHEN UPPER(m.category) = 'BEDFRAME' THEN
                                      catalogue_model_options(v_company, 'bedframe_gaps',
                                                              cm.enabled->'gaps', m.allowed_options->'gaps') END)))
               -- What the customer may be CHARGED for (2026-10-05, every option
               -- since 2026-10-06): what Modular turned ON for the model and the
               -- ERP still lets it take, priced on Maintenance above zero. A bed
               -- frame's divan, leg, gap, total height and specials; a sofa's leg
               -- height and specials (charged once per sofa). Anything else is
               -- FOC. A charge is the customer's price, not a cost, so the
               -- unpriced answer carries it.
               || CASE WHEN UPPER(m.category) = 'BEDFRAME' THEN jsonb_build_object('charges', jsonb_strip_nulls(jsonb_build_object(
                   'divan_heights', catalogue_model_charges(v_company, 'bedframe_divan_heights', cm.enabled->'divan_heights', m.allowed_options->'divan_heights'),
                   'leg_heights',   catalogue_model_charges(v_company, 'bedframe_leg_heights',   cm.enabled->'leg_heights',   m.allowed_options->'leg_heights'),
                   'gaps',          catalogue_model_charges(v_company, 'bedframe_gaps',          cm.enabled->'gaps',          m.allowed_options->'gaps'),
                   'total_heights', catalogue_model_charges(v_company, 'bedframe_total_heights', cm.enabled->'total_heights', m.allowed_options->'total_heights'),
                   'specials',      catalogue_model_charges(v_company, 'bedframe_specials',      cm.enabled->'specials',      m.allowed_options->'specials'))))
                       WHEN UPPER(m.category) = 'SOFA' THEN jsonb_build_object('charges', jsonb_strip_nulls(jsonb_build_object(
                   'leg_heights',   catalogue_model_charges(v_company, 'sofa_leg_heights',       cm.enabled->'leg_heights',   m.allowed_options->'leg_heights'),
                   'specials',      catalogue_model_charges(v_company, 'sofa_specials',          cm.enabled->'specials',      m.allowed_options->'specials'))))
                  ELSE '{}'::JSONB END
               ORDER BY m.model_code, m.erp_id), '[]'::JSONB)
      INTO v_models
      FROM erp_product_models m
      LEFT JOIN catalogue_models cm ON cm.erp_model_id = m.erp_id
     WHERE UPPER(COALESCE(m.category, '')) IN ('SOFA', 'BEDFRAME')
       AND m.erp_id IN (SELECT DISTINCT (r->>'modelId')::UUID
                          FROM jsonb_array_elements(v_rows) r
                         WHERE NULLIF(r->>'modelId', '') IS NOT NULL);

    IF NOT COALESCE(p_priced, FALSE) THEN
        RETURN jsonb_build_object('products', v_products, 'models', v_models);
    END IF;

    -- What an option is charged (2026-10-06: every price on Maintenance is the
    -- customer's). An option with no portal price is FOC — the run's rule too
    -- (catalogue_line_charge, catalogue_apply_sofa_charges) — and the
    -- Maintenance tab says which are unpriced.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('pool', op.pool, 'value', op.value, 'price', op.price)
                              ORDER BY op.pool, op.value), '[]'::JSONB)
      INTO v_options
      FROM catalogue_option_prices op
     WHERE op.erp_company_id = v_company;

    -- The combos a quoted sofa could match, each with the portal's price per
    -- seat height. A combo the portal has not priced is not a combo here.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'erpId', sc.erp_id, 'baseModel', sc.base_model, 'modules', sc.modules, 'tier', sc.tier,
               'label', sc.label, 'effectiveFrom', sc.effective_from, 'createdAt', sc.erp_created_at,
               'priceByHeight', cp.price_by_height)
               ORDER BY sc.base_model, sc.erp_id), '[]'::JSONB)
      INTO v_combos
      FROM catalogue_live_combos sc
      JOIN catalogue_combo_prices cp
        ON cp.erp_company_id = sc.erp_company_id
       AND cp.base_model     = sc.base_model
       AND cp.slots_key      = sc.slots_key
       AND cp.tier           = COALESCE(sc.tier, '')
     WHERE sc.erp_company_id = v_company
       AND sc.effective_from <= (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
       AND UPPER(sc.base_model) IN (SELECT DISTINCT UPPER(r->>'baseModel')
                                      FROM jsonb_array_elements(v_rows) r
                                     WHERE r->>'kind' = 'SOFA' AND NULLIF(r->>'baseModel', '') IS NOT NULL);

    RETURN jsonb_build_object('products', v_products, 'models', v_models,
                              'optionPrices', v_options, 'combos', v_combos);
END;
$function$
;
