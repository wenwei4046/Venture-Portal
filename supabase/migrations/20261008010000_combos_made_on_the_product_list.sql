-- Combo Pricing › Add combo (2026-10-08, design_handoff_product_list).
--
-- The Product List moved into the Revenue app, and its Combo Pricing tab gained
-- "+ Add combo": a sofa SET the ERP has not defined, made on the portal — a
-- base model, its compartments (one module per slot), a name, and a price per
-- fabric tier and seat height. Until now every combo came from the ERP
-- (erp_sofa_combos, written only by ingest_erp_catalogue) and the portal only
-- priced it (catalogue_combo_prices). A set made here is costed EXACTLY as the
-- ERP's are, by the same rule in the same place:
--
--   * catalogue_live_combos — the ERP's live combos and the portal's, one view;
--   * catalogue_apply_combos — the run's costing at commit / Recost — and
--     member_catalogue — the Quote's — read that view instead of
--     erp_sofa_combos. Byte for byte the bodies production runs (md5 checked
--     below, before and after), with only that FROM changed.
--
-- A portal set is ONE ROW PER FABRIC TIER with a price, like the ERP's, holding
-- only the seat heights that were priced; its prices go to catalogue_combo_prices
-- under the same (base model, slots_key, tier) key an ERP combo's would. It is
-- in effect from the day it is made (effective_from), as an ERP combo is from
-- its own date: new sales lines with those compartments take it; a month
-- already landed takes it only if it is Recosted and its orders are dated on or
-- after that day.
--
-- Nothing changes for any bill today: on 2026-10-08 no combo has a price at all
-- (catalogue_combo_prices is empty), and the view adds no row until a set is
-- made.

BEGIN;

-- ── 0. What is replaced is what production runs ─────────────────────────────
DO $$
DECLARE
    v_apply  TEXT;
    v_member TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_combos(uuid)'::regprocedure;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_member
      FROM pg_proc WHERE oid = 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
    IF v_apply IS DISTINCT FROM '628d4cd5874414894149485e1c0adc6e' AND v_apply IS DISTINCT FROM '65ee0f2f089660940fbdeaf4b6d1d136' THEN
        RAISE EXCEPTION 'catalogue_apply_combos drifted from the repo (md5 %) — compare before replacing it', v_apply;
    END IF;
    IF v_member IS DISTINCT FROM '4171fb3c5bf670c7be0643213efc3309' AND v_member IS DISTINCT FROM '6acf213df1ca36c27870a7ddbc5cf61b' THEN
        RAISE EXCEPTION 'member_catalogue drifted from the repo (md5 %) — compare before replacing it', v_member;
    END IF;
END $$;

-- ── 1. The sets made here ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogue_combos (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    erp_company_id BIGINT      NOT NULL DEFAULT 1,
    -- As the mirror stores a combo's: upper-cased, joined to its price exactly.
    base_model     TEXT        NOT NULL CHECK (base_model = UPPER(BTRIM(base_model)) AND base_model <> ''),
    -- One module per slot, the ERP's own shape: [["1A"], ["2A-LHF"], ["2A-LHF"]].
    modules        JSONB       NOT NULL CHECK (jsonb_typeof(modules) = 'array' AND jsonb_array_length(modules) BETWEEN 2 AND 30),
    slots_key      TEXT        GENERATED ALWAYS AS (erp_combo_slots_key(modules)) STORED,
    tier           TEXT        NOT NULL CHECK (tier IN ('PRICE_1', 'PRICE_2', 'PRICE_3')),
    label          TEXT        NOT NULL CHECK (BTRIM(label) <> '' AND char_length(label) <= 120),
    -- The seat heights it was priced at, as typed: the Combo Pricing sheet
    -- shades the rest, as it does for an ERP combo's.
    heights        TEXT[]      NOT NULL DEFAULT '{}',
    effective_from DATE        NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date),
    created_by     UUID        DEFAULT auth.uid() REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    removed_at     TIMESTAMPTZ
);

COMMENT ON TABLE catalogue_combos IS
    'Sofa combos made on the Product List (Combo Pricing › Add combo, 2026-10-08), one row per fabric tier — the ERP''s own shape. Priced in catalogue_combo_prices under the same key as an ERP combo, and costed through catalogue_live_combos exactly as the ERP''s are.';

-- One live set per (model, compartments, tier).
CREATE UNIQUE INDEX IF NOT EXISTS catalogue_combos_live_key
    ON catalogue_combos (erp_company_id, base_model, slots_key, tier) WHERE removed_at IS NULL;

ALTER TABLE catalogue_combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalogue_combos_principal_all ON catalogue_combos
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

-- HR reads them: a Recost and a file import cost sales lines under HR's session.
CREATE POLICY catalogue_combos_hr_select ON catalogue_combos
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])));

REVOKE ALL ON catalogue_combos FROM anon;
GRANT SELECT, INSERT, UPDATE ON catalogue_combos TO authenticated;
GRANT ALL ON catalogue_combos TO service_role;

-- ── 2. Every combo there is, the ERP's and ours ─────────────────────────────
CREATE OR REPLACE VIEW catalogue_live_combos WITH (security_invoker = true) AS
SELECT sc.erp_id::TEXT          AS erp_id,
       sc.erp_company_id,
       sc.base_model,
       sc.modules,
       sc.slots_key,
       sc.tier,
       sc.label,
       sc.effective_from,
       sc.erp_created_at,
       FALSE                    AS portal
  FROM erp_sofa_combos sc
 WHERE sc.deleted_at IS NULL
   AND sc.removed_at IS NULL
UNION ALL
SELECT 'portal:' || pc.id::TEXT,
       pc.erp_company_id,
       pc.base_model,
       pc.modules,
       pc.slots_key,
       pc.tier,
       pc.label,
       pc.effective_from,
       pc.created_at,
       TRUE
  FROM catalogue_combos pc
 WHERE pc.removed_at IS NULL;

COMMENT ON VIEW catalogue_live_combos IS
    'The live sofa combos a build can be costed at: the ERP''s (erp_sofa_combos) and those made on the Product List (catalogue_combos, erp_id ''portal:<id>''). Read by catalogue_apply_combos and member_catalogue. security_invoker: each table''s own RLS still answers.';

REVOKE ALL ON catalogue_live_combos FROM anon;
GRANT SELECT ON catalogue_live_combos TO authenticated, service_role;

-- ── 3. The run's costing reads it ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION catalogue_apply_combos(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_company  BIGINT;
    v_date     DATE;
    v_changed  INTEGER := 0;
    v_n        INTEGER;
    g          RECORD;
    c          RECORD;
    v_ids      UUID[];
    v_weights  BIGINT[];
    v_qtys     NUMERIC[];
    v_total    BIGINT;
    v_sum      BIGINT;
    v_shares   BIGINT[];
    v_target   INTEGER;
    k          INTEGER;
BEGIN
    SELECT COALESCE(o.erp_company_id, 1), o.order_date INTO v_company, v_date
      FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Back to each line's own cost first, so a combo that no longer matches
    -- (a price removed, a line cancelled) lets go of the lines it held.
    UPDATE sales_order_lines l
       SET cost_amount = l.list_cost_amount,
           cost_source = CASE WHEN l.list_cost_amount IS NULL THEN NULL ELSE 'catalogue' END,
           cost_detail = COALESCE(l.cost_detail, '{}'::JSONB) - 'combo'
     WHERE l.order_id = p_order_id
       AND l.cost_source = 'catalogue_combo';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_changed := v_changed + v_n;

    FOR g IN
        WITH lines AS (
            SELECT l.id, l.line_no, l.qty, COALESCE(l.list_cost_amount, 0) AS own_cost,
                   UPPER(e.base_model) AS base_model, e.module_code,
                   catalogue_height_key(l.cost_detail->>'height') AS height_key,
                   l.cost_detail->>'height' AS height,
                   COALESCE(l.cost_detail->>'tier', 'PRICE_2') AS tier
              FROM sales_order_lines l
              CROSS JOIN LATERAL catalogue_sku_for_code(v_company, l.product_code) e
             WHERE l.order_id = p_order_id
               AND e.category = 'SOFA'
               AND e.module_code IS NOT NULL
               AND COALESCE(l.cost_source, '') <> 'manual'
        )
        SELECT base_model,
               ARRAY_AGG(id ORDER BY line_no, id)          AS ids,
               ARRAY_AGG(module_code ORDER BY line_no, id) AS mods,
               ARRAY_AGG(qty ORDER BY line_no, id)         AS qtys,
               ARRAY_AGG(ROUND(own_cost * 100)::BIGINT ORDER BY line_no, id) AS weights,
               COUNT(DISTINCT tier)                        AS tiers,
               MIN(tier)                                   AS tier,
               COUNT(DISTINCT height_key)                  AS heights,
               MIN(height_key)                             AS height_key,
               MIN(height)                                 AS height,
               BOOL_OR(height_key IS NULL)                 AS unknown_height
          FROM lines
         GROUP BY base_model
    LOOP
        -- One tier and one seat height across the set, or no combo: the ERP
        -- refuses to guess which of two heights a combo was priced at.
        CONTINUE WHEN g.tiers <> 1 OR g.heights <> 1 OR g.unknown_height;

        SELECT x.* INTO c
          FROM (SELECT sc.erp_id, sc.label, sc.tier, sc.effective_from, sc.erp_created_at,
                       catalogue_match_slots(g.mods, sc.modules) AS matched,
                       -- A usable price at the build's height: a zero or a
                       -- word under another spelling of it never hides one.
                       (SELECT kv.value::NUMERIC
                          FROM jsonb_each_text(cp.price_by_height) kv
                         WHERE catalogue_height_key(kv.key) = g.height_key
                           AND CASE WHEN kv.value ~ '^\d+(\.\d+)?$' THEN kv.value::NUMERIC > 0 ELSE FALSE END
                         LIMIT 1) AS price
                  FROM catalogue_live_combos sc
                  JOIN catalogue_combo_prices cp
                    ON cp.erp_company_id = sc.erp_company_id
                   AND cp.base_model     = sc.base_model
                   AND cp.slots_key      = sc.slots_key
                   AND cp.tier           = COALESCE(sc.tier, '')
                 WHERE sc.erp_company_id = v_company
                   AND UPPER(sc.base_model) = g.base_model
                   AND sc.effective_from <= COALESCE(v_date, CURRENT_DATE)
                   AND (sc.tier IS NULL OR sc.tier = g.tier)) x
         WHERE x.matched IS NOT NULL
           AND x.price IS NOT NULL
           AND x.price > 0
         ORDER BY (x.tier IS NOT NULL) DESC, x.effective_from DESC,
                  x.erp_created_at DESC NULLS LAST, x.erp_id DESC
         LIMIT 1;
        CONTINUE WHEN NOT FOUND;

        v_ids     := ARRAY(SELECT g.ids[i]     FROM unnest(c.matched) i);
        v_weights := ARRAY(SELECT g.weights[i] FROM unnest(c.matched) i);
        v_qtys    := ARRAY(SELECT g.qtys[i]    FROM unnest(c.matched) i);

        -- A combo is ONE set; line costs are line totals. Mixed quantities
        -- have no clean set count, so the modules keep their own costs
        -- (never under-book) — the ERP's own guard.
        CONTINUE WHEN (SELECT COUNT(DISTINCT GREATEST(q, 1)) FROM unnest(v_qtys) q) <> 1;

        v_total := ROUND(c.price * GREATEST(v_qtys[1], 1) * 100)::BIGINT;
        v_sum   := (SELECT SUM(GREATEST(w, 0)) FROM unnest(v_weights) w);

        -- spreadComboTotal: in proportion to each line's own cost, the
        -- rounding residual to the dearest line; evenly when nothing is costed.
        IF v_sum <= 0 THEN
            v_shares := array_fill(v_total / array_length(v_ids, 1), ARRAY[array_length(v_ids, 1)]);
        ELSE
            v_shares := ARRAY(SELECT FLOOR(GREATEST(w, 0)::NUMERIC * v_total / v_sum)::BIGINT FROM unnest(v_weights) w);
        END IF;
        v_target := 1;
        FOR k IN 2 .. array_length(v_ids, 1) LOOP
            IF v_weights[k] > v_weights[v_target] THEN
                v_target := k;
            END IF;
        END LOOP;
        v_shares[v_target] := v_shares[v_target] + (v_total - (SELECT SUM(s) FROM unnest(v_shares) s));

        FOR k IN 1 .. array_length(v_ids, 1) LOOP
            UPDATE sales_order_lines l
               SET cost_amount = v_shares[k]::NUMERIC / 100,
                   cost_source = 'catalogue_combo',
                   cost_detail = COALESCE(l.cost_detail, '{}'::JSONB) || jsonb_build_object('combo', jsonb_build_object(
                       'erp_id', c.erp_id, 'label', c.label, 'price', c.price,
                       'sets', GREATEST(v_qtys[1], 1), 'height', g.height, 'tier', g.tier,
                       'lines', array_length(v_ids, 1)))
             WHERE l.id = v_ids[k];
            v_changed := v_changed + 1;
        END LOOP;
    END LOOP;

    RETURN v_changed;
END;
$fn$;

-- ── 4. The Quote's catalogue reads it ───────────────────────────────────────
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
      FROM catalogue_live_combos sc
      JOIN catalogue_combo_prices cp
        ON cp.erp_company_id = sc.erp_company_id
       AND cp.base_model     = sc.base_model
       AND cp.slots_key      = sc.slots_key
       AND cp.tier           = COALESCE(sc.tier, '')
     WHERE sc.erp_company_id = v_company
       AND sc.effective_from <= CURRENT_DATE
       AND UPPER(sc.base_model) IN (SELECT DISTINCT UPPER(r->>'baseModel')
                                      FROM jsonb_array_elements(v_rows) r
                                     WHERE r->>'kind' = 'SOFA' AND NULLIF(r->>'baseModel', '') IS NOT NULL);

    RETURN jsonb_build_object('products', v_products, 'models', v_models,
                              'optionPrices', v_options, 'combos', v_combos);
END;
$fn$;

-- Who may call it: unchanged (service role only).
REVOKE ALL ON FUNCTION member_catalogue(TEXT[], UUID[], BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION member_catalogue(TEXT[], UUID[], BOOLEAN, INTEGER) TO service_role;

-- ── 5. Add combo ────────────────────────────────────────────────────────────
-- One set, one transaction: a row and a price row per fabric tier that has a
-- price. SECURITY INVOKER — the Principal's RLS (admin scope) is the gate, the
-- Server Action's `requirePermission('product_list')` the one before it. A
-- refusal the Principal can act on is 22023 with the window's own words.
CREATE OR REPLACE FUNCTION catalogue_add_combo(p_base_model TEXT, p_modules JSONB, p_label TEXT, p_prices JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $add$
DECLARE
    v_company BIGINT := 1;
    v_model   TEXT := UPPER(BTRIM(COALESCE(p_base_model, '')));
    v_label   TEXT := BTRIM(COALESCE(p_label, ''));
    v_key     TEXT;
    v_code    TEXT;
    v_tier    TEXT;
    v_prices  JSONB;
    v_heights TEXT[];
    v_n       INTEGER := 0;
BEGIN
    IF v_model = '' THEN
        RAISE EXCEPTION 'Pick a sofa model.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_modules) IS DISTINCT FROM 'array' OR jsonb_array_length(p_modules) < 2 THEN
        RAISE EXCEPTION 'Add at least two compartments.' USING ERRCODE = '22023';
    END IF;
    IF v_label = '' THEN
        RAISE EXCEPTION 'Give the set a name.' USING ERRCODE = '22023';
    END IF;

    -- Every piece one module of this model's sofa SKUs.
    FOR v_code IN
        SELECT BTRIM(s->>0)
          FROM jsonb_array_elements(p_modules) s
    LOOP
        IF v_code IS NULL OR v_code = '' THEN
            RAISE EXCEPTION 'Each piece is one compartment.' USING ERRCODE = '22023';
        END IF;
        PERFORM 1
           FROM erp_products p
          WHERE p.erp_company_id = v_company
            AND UPPER(BTRIM(COALESCE(p.base_model, ''))) = v_model
            AND UPPER(COALESCE(p.category, '')) = 'SOFA'
            AND p.module_code = v_code
            AND p.removed_at IS NULL;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Model % has no compartment %.', v_model, v_code USING ERRCODE = '22023';
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_modules) s WHERE jsonb_typeof(s) <> 'array' OR jsonb_array_length(s) <> 1) THEN
        RAISE EXCEPTION 'Each piece is one compartment.' USING ERRCODE = '22023';
    END IF;

    v_key := erp_combo_slots_key(p_modules);
    IF EXISTS (SELECT 1 FROM catalogue_live_combos c
                WHERE c.erp_company_id = v_company AND UPPER(c.base_model) = v_model AND c.slots_key = v_key) THEN
        RAISE EXCEPTION 'This model already has a combo with these compartments.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM catalogue_live_combos c
                WHERE c.erp_company_id = v_company AND UPPER(c.base_model) = v_model
                  AND LOWER(BTRIM(COALESCE(c.label, ''))) = LOWER(v_label)) THEN
        RAISE EXCEPTION 'Model % already has a set called "%".', v_model, v_label USING ERRCODE = '22023';
    END IF;

    FOREACH v_tier IN ARRAY ARRAY['PRICE_1', 'PRICE_2', 'PRICE_3'] LOOP
        SELECT jsonb_object_agg(BTRIM(e.key), (e.value #>> '{}')::NUMERIC), array_agg(BTRIM(e.key) ORDER BY e.key)
          INTO v_prices, v_heights
          FROM jsonb_each(CASE WHEN jsonb_typeof(p_prices->v_tier) = 'object' THEN p_prices->v_tier ELSE '{}'::JSONB END) e
         WHERE BTRIM(e.key) <> ''
           AND (e.value #>> '{}') ~ '^\d+(\.\d{1,2})?$'
           AND (e.value #>> '{}')::NUMERIC > 0;
        CONTINUE WHEN v_prices IS NULL;
        INSERT INTO catalogue_combos (erp_company_id, base_model, modules, tier, label, heights)
        VALUES (v_company, v_model, p_modules, v_tier, v_label, v_heights);
        INSERT INTO catalogue_combo_prices (erp_company_id, base_model, slots_key, tier, price_by_height, updated_by, updated_at)
        VALUES (v_company, v_model, v_key, v_tier, v_prices, auth.uid(), now())
        ON CONFLICT (erp_company_id, base_model, slots_key, tier)
        DO UPDATE SET price_by_height = EXCLUDED.price_by_height, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;
        v_n := v_n + cardinality(v_heights);
    END LOOP;

    IF v_n = 0 THEN
        RAISE EXCEPTION 'Fill at least one price.' USING ERRCODE = '22023';
    END IF;
    RETURN v_n;
END;
$add$;

COMMENT ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) IS
    'Product List › Combo Pricing › Add combo (2026-10-08): a sofa set the ERP has not defined, in one transaction — a catalogue_combos row and a catalogue_combo_prices row per fabric tier with a positive price. Refuses (22023) a model or module that is not a sofa''s, a set or a name the model already has (ERP or portal).';

REVOKE ALL ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_add_combo(TEXT, JSONB, TEXT, JSONB) TO authenticated;

-- ── 6. What landed is what this file says ───────────────────────────────────
DO $$
DECLARE
    v_md5 TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.catalogue_apply_combos(uuid)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '65ee0f2f089660940fbdeaf4b6d1d136' THEN
        RAISE EXCEPTION 'catalogue_apply_combos did not land as written (md5 %)', v_md5;
    END IF;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5
      FROM pg_proc WHERE oid = 'public.member_catalogue(text[], uuid[], boolean, integer)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '6acf213df1ca36c27870a7ddbc5cf61b' THEN
        RAISE EXCEPTION 'member_catalogue did not land as written (md5 %)', v_md5;
    END IF;
END $$;

COMMIT;
