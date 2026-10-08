-- Modular asks for a margin ladder and a calculator section only where the
-- ERP cannot say (2026-10-06).
--
-- The user, on the Modular window: "这两个可以不需要存在，因为其实它是自动跟着
-- brand 来 recognize 的 … calculation section 也是一样 … 它是跟着 brand，而不是
-- 跟着我这里去选"; "but for those system cant detect the brand, then it could
-- come out with these 2 option dropdown"; "but rider catogory (accessory and
-- etc) dont need this, cause they will depend on what calculator or what sales
-- order brand to calculate with their margin".
--
-- So, for member_catalogue (the Revenue calculator's catalogue):
--   * a mattress or a sofa whose ERP branding names a brand the portal knows
--     sells under that brand, in the section its ERP category gives — always.
--     A ladder or section stored for it on Modular is no longer read;
--   * a bed frame, an accessory and every other category is a rider (its
--     margin is judged on the cart's brand, as a bill's is on the bill's) in
--     the section its ERP category gives — always;
--   * only a mattress or a sofa the ERP gives no such brand (MYLATEX, or no
--     branding at all: 36 mattresses and 6 sofas on 2026-10-06, none of them
--     offered) is asked, and there catalogue_models.brand_code and
--     calc_category count exactly as before.
-- The TypeScript twin is needsBrandPick (lib/catalogue/options.ts): the
-- Product List's loader reads the picks only there, and the Modular window
-- shows the two dropdowns only there.
--
-- What it changes today: nothing a member can see. No model carries a
-- brand_code. 357 of 358 rows carried a calc_category — written by the
-- September carry-over from the old Product List (and two saves that sent
-- the default back); 335 repeat the ERP's own section, and 22 accessories
-- carried the old list's (a bolster as Pillow, a mattress cover as
-- Protector), which now follow the ERP's (Accessory, Protector). All three
-- sections are gift-eligible, nobody picked them in the portal, and the
-- Revenue app lists every accessory together.

-- ── 0. The function this replaces is the one 20261006050000 left ───────────

DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc
     WHERE oid = 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '3a230caefb99e66df327aa220a39ae42' THEN
        RAISE EXCEPTION 'member_catalogue changed since 20261006050000 (md5 %); rebuild this migration on the live body', v_md5;
    END IF;
END $$;

-- ── 1. The picks the ERP now decides are not kept ──────────────────────────

-- Whatever was stored for a rider, or for a mattress or a sofa whose
-- branding (the model's, else one of its SKUs') names a brand.
UPDATE catalogue_models cm
   SET calc_category = NULL,
       brand_code    = NULL
  FROM erp_product_models m
 WHERE m.erp_id = cm.erp_model_id
   AND (cm.calc_category IS NOT NULL OR cm.brand_code IS NOT NULL)
   AND (UPPER(BTRIM(COALESCE(m.category, ''))) NOT IN ('MATTRESS', 'SOFA')
        OR catalogue_brand_of(m.category, m.branding, NULL) IS NOT NULL
        OR EXISTS (SELECT 1
                     FROM erp_products e
                    WHERE e.model_erp_id = m.erp_id
                      AND catalogue_brand_of(m.category, NULL, e.branding) IS NOT NULL));

-- A section stored for a brandless one that only repeats its ERP category
-- says nothing either (three sofas: Sofa = Sofa), so the window shows the
-- ERP's default rather than a pick nobody made.
UPDATE catalogue_models cm
   SET calc_category = NULL
  FROM erp_product_models m
 WHERE m.erp_id = cm.erp_model_id
   AND cm.calc_category = catalogue_calc_category(m.category, COALESCE(m.name, m.model_code));

-- ── 2. member_catalogue reads a pick only where the ERP gives no brand ─────

-- Verbatim from 20261006050000 but for the `offered` CTE: calc, brand and
-- rider, and the `erp` row they read.
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

-- ── 3. Who may call it: unchanged (service role only) ──────────────────────

REVOKE ALL ON FUNCTION member_catalogue(TEXT[], UUID[], BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION member_catalogue(TEXT[], UUID[], BOOLEAN, INTEGER) TO service_role;

-- ── 4. What landed is what this file says ───────────────────────────────────

DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc
     WHERE oid = 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '4171fb3c5bf670c7be0643213efc3309' THEN
        RAISE EXCEPTION 'member_catalogue did not land as written (md5 %)', v_md5;
    END IF;
END $$;
