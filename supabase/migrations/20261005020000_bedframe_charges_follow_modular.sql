-- ═══════════════════════════════════════════════════════════════════════════
-- A BED FRAME'S CHARGED OPTIONS FOLLOW MODULAR'S SWITCHES (user 2026-10-05)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 20261005010000 offered a bed frame's divan, leg, gap and total height on the
-- member Quote by its PRICE alone: anything Maintenance charged that the ERP
-- let the model take. The user: "要确保 modular 那一边，选择 Turn ON 的他才会出现在
-- calculate 的 option。如果没有，他就不会出现" — an option the model has not turned
-- ON on Product List › Modular never reaches the calculator, priced or not.
--
-- So a bed frame model's chargeable option is now: turned ON for that model on
-- Modular (catalogue_models.enabled) ∩ still allowed by the ERP ∩ live in the
-- Maintenance pool — exactly catalogue_model_options, the list every other
-- dropdown reads — ∩ priced above zero. Turned ON and not priced is FOC.
-- SKUs were already gated so: a SKU or model not turned ON is not offered at
-- all (member_catalogue's `offered`).
--
-- Nothing moves: no option carries a price and no bed frame has a tick
-- (2026-10-05), so every model's charges stay empty.
--
-- 1. catalogue_model_charges(company, pool, enabled, allowed): the 4-argument
--    form; the 3-argument one (20261005010000) is no longer read.
-- 2. member_catalogue calls it with each model's ticks.
--
-- Reversal: re-apply member_catalogue from 20261005010000.

-- ── 1. What a model may be charged for: ticked, allowed, live, priced ─────────

CREATE OR REPLACE FUNCTION catalogue_model_charges(p_company BIGINT, p_pool TEXT, p_enabled JSONB, p_allowed JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT jsonb_agg(jsonb_build_object('value', v.value, 'charge', op.price) ORDER BY v.ord)
      FROM jsonb_array_elements_text(catalogue_model_options(p_company, p_pool, p_enabled, p_allowed))
           WITH ORDINALITY AS v(value, ord)
      JOIN catalogue_option_prices op
        ON op.erp_company_id = p_company AND op.pool = p_pool AND op.value = v.value
     WHERE op.price > 0;
$fn$;

COMMENT ON FUNCTION catalogue_model_charges(BIGINT, TEXT, JSONB) IS
    'Superseded by catalogue_model_charges(company, pool, enabled, allowed) (20261005020000), which also asks Modular''s switches. No longer read.';

REVOKE ALL ON FUNCTION catalogue_model_charges(BIGINT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalogue_model_charges(BIGINT, TEXT, JSONB, JSONB) TO service_role;

-- ── 2. member_catalogue: the charges ask the model's switches ────────────────

CREATE OR REPLACE FUNCTION member_catalogue(p_brands TEXT[], p_ids UUID[] DEFAULT NULL,
                                            p_priced BOOLEAN DEFAULT FALSE, p_suggest INTEGER DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
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
               COALESCE(cm.calc_category,
                        catalogue_calc_category(COALESCE(m.category, e.category),
                                                COALESCE(m.name, e.description))) AS calc,
               cm.gift AS gift_override,
               CASE WHEN cm.brand_code = 'RIDER' THEN NULL
                    ELSE COALESCE(cm.brand_code,
                                  catalogue_brand_of(COALESCE(m.category, e.category), m.branding, e.branding))
               END AS brand,
               -- A rider joins any cart: a bed frame or an accessory nobody gave
               -- a brand, or anything marked Rider on Modular. A mattress or a
               -- sofa decides the cart's ladder, so one whose brand no scheme
               -- knows is sold under nothing and falls out below — never a
               -- rider by accident (the TypeScript twin is isRiderModel).
               COALESCE(cm.brand_code = 'RIDER'
                        OR (cm.brand_code IS NULL
                            AND UPPER(COALESCE(m.category, e.category, '')) NOT IN ('MATTRESS', 'SOFA')),
                        FALSE) AS rider
          FROM erp_products e
          JOIN catalogue_skus s ON s.erp_product_id = e.erp_id AND s.offered
          LEFT JOIN erp_product_models m ON m.erp_id = e.model_erp_id
          LEFT JOIN catalogue_models cm ON cm.erp_model_id = e.model_erp_id
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
               -- A bed frame's divan, leg, gap and total height the customer may be CHARGED
               -- for (2026-10-05): what Modular turned ON for the model and the ERP
               -- still lets it take, priced on Maintenance above zero. Anything else
               -- is FOC. A charge is the customer's price, not a cost, so the
               -- unpriced answer carries it.
               || CASE WHEN UPPER(m.category) = 'BEDFRAME' THEN jsonb_build_object('charges', jsonb_strip_nulls(jsonb_build_object(
                   'divan_heights', catalogue_model_charges(v_company, 'bedframe_divan_heights', cm.enabled->'divan_heights', m.allowed_options->'divan_heights'),
                   'leg_heights',   catalogue_model_charges(v_company, 'bedframe_leg_heights',   cm.enabled->'leg_heights',   m.allowed_options->'leg_heights'),
                   'gaps',          catalogue_model_charges(v_company, 'bedframe_gaps',          cm.enabled->'gaps',          m.allowed_options->'gaps'),
                   'total_heights', catalogue_model_charges(v_company, 'bedframe_total_heights', cm.enabled->'total_heights', m.allowed_options->'total_heights'))))
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

    -- What an option adds. An option with no portal price adds nothing — the
    -- run's rule too (catalogue_line_surcharge) — and the Maintenance tab says
    -- which are unpriced.
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
      FROM erp_sofa_combos sc
      JOIN catalogue_combo_prices cp
        ON cp.erp_company_id = sc.erp_company_id
       AND cp.base_model     = sc.base_model
       AND cp.slots_key      = sc.slots_key
       AND cp.tier           = COALESCE(sc.tier, '')
     WHERE sc.erp_company_id = v_company
       AND sc.deleted_at IS NULL
       AND sc.removed_at IS NULL
       AND sc.effective_from <= CURRENT_DATE
       AND UPPER(sc.base_model) IN (SELECT DISTINCT UPPER(r->>'baseModel')
                                      FROM jsonb_array_elements(v_rows) r
                                     WHERE r->>'kind' = 'SOFA' AND NULLIF(r->>'baseModel', '') IS NOT NULL);

    RETURN jsonb_build_object('products', v_products, 'models', v_models,
                              'optionPrices', v_options, 'combos', v_combos);
END;
$fn$;
