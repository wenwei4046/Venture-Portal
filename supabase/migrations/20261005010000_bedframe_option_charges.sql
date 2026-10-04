-- ═══════════════════════════════════════════════════════════════════════════
-- A BED FRAME'S OPTIONS ARE CHARGED, NOT COSTED (user 2026-10-04)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now every option a sales line names was a COST surcharge
-- (catalogue_line_surcharge, 20260924030000): a price keyed on Product List ›
-- Maintenance for a bed frame's divan height, leg height or total height was
-- added to what the line cost, and the margin fell with it.
--
-- The user, on the member Quote: a bed frame's divan, leg and gap show ONE
-- "FOC" choice and the options that carry a charge — "如果是 free、没有填任何价钱的
-- 话，那边就会变成 FOC。除非我有填特定的尺寸，比如 16 寸需要 100 块，这样它就会出现 FOC
-- 跟 16 寸" — and that charge "本身不会算进 margin 里面，而是算 commission amount
-- 来的 … 跟 KPI item 也不一样 … 只会给普通 commission". Total height "不需要存在";
-- specials stay as they were.
--
-- So, from here on:
--
--   * A bed frame's divan height, leg height and gap priced on Maintenance
--     ABOVE ZERO is what the CUSTOMER pays for that option, on top: the line's
--     `option_charge_amount` = qty × the options' charges. It is OUT of the
--     margin on both sides — not in the bill's margin revenue, not in its cost
--     — and IN the commissionable sales the rate is paid on. Never KPI.
--   * A bed frame's specials are still a cost surcharge; so are a sofa's leg
--     height and specials. Total height is priced nowhere (and may not be).
--   * Gaps may now carry a price (they could not: a gap was never a cost).
--
-- Nothing changes today: no option carries a price (catalogue_option_prices
-- is empty on 2026-10-05), so every charge is 0 and every surcharge was 0 —
-- every line's cost, every margin and every commission is what it was. The
-- migration checks that before it touches anything.
--
-- 1. sales_order_lines.option_charge_amount.
-- 2. catalogue_option_prices: a charge is never negative; total height and a
--    sofa's seat size carry no price.
-- 3. catalogue_line_charge / catalogue_line_option_charge (+ the TypeScript
--    twins `lineCharge` in lib/catalogue/pricing.ts) and
--    catalogue_model_charges (what a model may be charged for).
-- 4. catalogue_line_surcharge: a bed frame's divan, leg and total height
--    leave the cost; its specials stay.
-- 5. catalogue_cost_detail_with_charges: the order page's explanation.
-- 6–7. The charge is filled where the cost is: on every line that lands
--    (sales_order_lines_fill_cost) and when a month is re-priced
--    (recost_sales_order_lines).
-- 8. member_catalogue: each bed frame model's chargeable options, with their
--    charges — a customer's price, so the unpriced answer carries it.
-- 9–10. The margin readers take the charges off the margin revenue, exactly
--    as the engine's marginBase() now does: revenue_month_orders
--    (`margin_revenue` = main sales − charges; `commissionable` unchanged) and
--    member_order_facts (`goods_revenue` = the same; `revenue` unchanged).
--
-- Reversal: re-apply catalogue_line_surcharge and sales_order_lines_fill_cost
-- / recost_sales_order_lines from 20260924030000, member_catalogue from
-- 20260924040000, revenue_month_orders from 20261003170000 (CREATE OR
-- REPLACE), member_order_facts from 20261004020000; then drop the three new
-- functions, the two CHECKs and the column.

-- ── 0. Nothing is priced yet: the "nothing moves" promise ──────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM catalogue_option_prices
                WHERE pool IN ('bedframe_divan_heights', 'bedframe_leg_heights', 'bedframe_total_heights')
                  AND price IS NOT NULL AND price <> 0) THEN
        RAISE EXCEPTION 'A bed frame divan / leg / total height already carries a surcharge: moving it out of the cost would move margins. Show the user the before/after first.';
    END IF;
END;
$$;

-- ── 1. The charge on a sales line ───────────────────────────────────────────

ALTER TABLE sales_order_lines
    ADD COLUMN IF NOT EXISTS option_charge_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN sales_order_lines.option_charge_amount IS
    'What the customer pays for this bed frame''s divan height, leg height and gap (2026-10-05): qty × each option''s charge on Product List › Maintenance, above zero. OUT of the margin on both sides, IN the commissionable sales, never KPI. Filled with the cost (sales_order_lines_fill_cost, recost_sales_order_lines).';

-- ── 2. What a price on Maintenance may be ───────────────────────────────────

ALTER TABLE catalogue_option_prices
    ADD CONSTRAINT catalogue_option_prices_unpriced_pools
    CHECK (pool NOT IN ('bedframe_total_heights', 'sofa_sizes'));

ALTER TABLE catalogue_option_prices
    ADD CONSTRAINT catalogue_option_prices_charge_not_negative
    CHECK (pool NOT IN ('bedframe_divan_heights', 'bedframe_leg_heights', 'bedframe_gaps') OR price >= 0);

-- ── 3. What a bed frame's options are charged ───────────────────────────────

-- Per unit: each of the divan, leg and gap priced above zero. FOC = an option
-- nobody priced, or priced at 0. Only a bed frame is charged.
CREATE OR REPLACE FUNCTION catalogue_line_charge(p_company BIGINT, p_category TEXT,
                                                 p_divan TEXT, p_leg TEXT, p_gap TEXT)
RETURNS TABLE(amount NUMERIC, parts JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    v_pairs TEXT[][] := ARRAY[['bedframe_divan_heights', p_divan],
                              ['bedframe_leg_heights',   p_leg],
                              ['bedframe_gaps',          p_gap]];
    v_price NUMERIC;
    k       INTEGER;
BEGIN
    amount := 0;
    parts  := '[]'::JSONB;
    IF UPPER(COALESCE(p_category, '')) <> 'BEDFRAME' THEN
        RETURN NEXT;
        RETURN;
    END IF;
    FOR k IN 1 .. 3 LOOP
        CONTINUE WHEN NULLIF(BTRIM(COALESCE(v_pairs[k][2], '')), '') IS NULL;
        v_price := catalogue_option_price(p_company, v_pairs[k][1], v_pairs[k][2]);
        CONTINUE WHEN v_price IS NULL OR v_price <= 0;
        parts  := parts || jsonb_build_array(jsonb_build_object(
            'pool', v_pairs[k][1], 'value', v_pairs[k][2], 'price', v_price));
        amount := amount + v_price;
    END LOOP;
    RETURN NEXT;
END;
$fn$;

-- One sales line: what it was read as (catalogue_line_facts) and which
-- category it is (the mirror's, else its item group — as catalogue_line_cost
-- reads both), times its quantity.
CREATE OR REPLACE FUNCTION catalogue_line_option_charge(p_company BIGINT, p_code TEXT, p_item_group TEXT,
                                                        p_description2 TEXT, p_raw JSONB, p_qty NUMERIC)
RETURNS TABLE(amount NUMERIC, unit NUMERIC, parts JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    f     RECORD;
    c     RECORD;
    v_cat TEXT;
BEGIN
    amount := 0;
    unit   := 0;
    parts  := '[]'::JSONB;
    SELECT e.category INTO v_cat FROM catalogue_sku_for_code(p_company, p_code) e;
    v_cat := UPPER(COALESCE(v_cat, p_item_group, ''));
    IF v_cat <> 'BEDFRAME' THEN
        RETURN NEXT;
        RETURN;
    END IF;
    SELECT * INTO f FROM catalogue_line_facts(p_description2, p_raw);
    SELECT * INTO c FROM catalogue_line_charge(p_company, v_cat, f.divan, f.leg, f.gap);
    unit   := COALESCE(c.amount, 0);
    amount := ROUND(unit * COALESCE(p_qty, 0), 2);
    parts  := COALESCE(c.parts, '[]'::JSONB);
    RETURN NEXT;
END;
$fn$;

-- What a model may be charged for in one pool: the live options the ERP lets
-- it take (an empty list restricts nothing — the ERP's own rule, as
-- catalogue_model_options reads it) priced above zero, in the pool's order.
-- NULL when there is none, so the answer drops the key.
CREATE OR REPLACE FUNCTION catalogue_model_charges(p_company BIGINT, p_pool TEXT, p_allowed JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
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
$fn$;

-- ── 4. A bed frame's divan, leg and total height leave the cost ─────────────

CREATE OR REPLACE FUNCTION catalogue_line_surcharge(p_company BIGINT, p_category TEXT, p_leg TEXT,
                                                    p_divan TEXT, p_total TEXT, p_specials TEXT[])
RETURNS TABLE(amount NUMERIC, parts JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    v_cat   TEXT := UPPER(COALESCE(p_category, ''));
    v_pool  TEXT;
    v_price NUMERIC;
    v_sp    TEXT;
BEGIN
    amount := 0;
    parts  := '[]'::JSONB;
    IF v_cat NOT IN ('BEDFRAME', 'SOFA') THEN
        RETURN NEXT;
        RETURN;
    END IF;

    -- A sofa module's leg height is still a cost. A bed frame's divan, leg
    -- and total height are not (2026-10-05): its divan, leg and gap are
    -- CHARGED to the customer (catalogue_line_charge) and its total height
    -- is priced nowhere. p_divan / p_total are kept for the signature.
    IF v_cat = 'SOFA' AND p_leg IS NOT NULL THEN
        v_price := catalogue_option_price(p_company, 'sofa_leg_heights', p_leg);
        parts  := parts || jsonb_build_array(jsonb_build_object(
            'pool', 'sofa_leg_heights', 'value', p_leg, 'price', v_price));
        amount := amount + COALESCE(v_price, 0);
    END IF;

    v_pool := CASE v_cat WHEN 'BEDFRAME' THEN 'bedframe_specials' ELSE 'sofa_specials' END;
    FOREACH v_sp IN ARRAY COALESCE(p_specials, '{}') LOOP
        v_price := catalogue_option_price(p_company, v_pool, v_sp);
        parts  := parts || jsonb_build_array(jsonb_build_object(
            'pool', v_pool, 'value', v_sp, 'price', v_price));
        amount := amount + COALESCE(v_price, 0);
    END LOOP;
    RETURN NEXT;
END;
$fn$;

-- ── 5. The order page's explanation of a line ───────────────────────────────

-- How a line was costed, with what its options were charged beside it.
CREATE OR REPLACE FUNCTION catalogue_cost_detail_with_charges(p_detail JSONB, p_charges JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT CASE WHEN jsonb_typeof(p_charges) = 'array' AND jsonb_array_length(p_charges) > 0
                THEN COALESCE(p_detail, '{}'::JSONB) || jsonb_build_object('charges', p_charges)
                ELSE p_detail END;
$fn$;


-- ── 6. sales_order_lines_fill_cost: the charge on every line it lands ───────

CREATE OR REPLACE FUNCTION sales_order_lines_fill_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_company      BIGINT;
    r              RECORD;
    v_charge       NUMERIC;
    v_charge_parts JSONB;
BEGIN
    SELECT COALESCE(o.erp_company_id, 1) INTO v_company FROM sales_orders o WHERE o.id = NEW.order_id;

    -- What the customer pays for a bed frame's divan, leg and gap (2026-10-05)
    -- — whoever costs the line, a hand-keyed cost included: a charge is a
    -- price, not a cost. A fault here must not stop the order landing either.
    BEGIN
        SELECT ch.amount, ch.parts INTO v_charge, v_charge_parts
          FROM catalogue_line_option_charge(COALESCE(v_company, 1), NEW.product_code, NEW.item_group,
                                            NEW.description2, NEW.raw, NEW.qty) ch;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'catalogue_line_option_charge failed for % on order %: %', NEW.product_code, NEW.order_id, SQLERRM;
        v_charge       := 0;
        v_charge_parts := NULL;
    END;
    NEW.option_charge_amount := COALESCE(v_charge, 0);

    IF COALESCE(NEW.cost_source, '') = 'manual' THEN
        RETURN NEW;
    END IF;

    -- A pricing fault must never stop an order landing: the ERP retries a
    -- refused delivery forever. The line lands unpriced, and says why.
    BEGIN
        SELECT * INTO r
          FROM catalogue_line_cost(COALESCE(v_company, 1), NEW.product_code, NEW.item_group,
                                   NEW.description2, NEW.raw, NEW.qty);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'catalogue_line_cost failed for % on order %: %', NEW.product_code, NEW.order_id, SQLERRM;
        NEW.list_cost_amount := NULL;
        NEW.cost_amount      := NULL;
        NEW.cost_source      := NULL;
        NEW.cost_detail      := jsonb_build_object('reason', 'error', 'message', LEFT(SQLERRM, 200));
        RETURN NEW;
    END;

    NEW.list_cost_amount := r.cost;
    NEW.cost_amount      := r.cost;
    NEW.cost_source      := CASE WHEN r.cost IS NULL THEN NULL ELSE 'catalogue' END;
    NEW.cost_detail      := catalogue_cost_detail_with_charges(r.detail, v_charge_parts);
    RETURN NEW;
END;
$fn$;

-- ── 7. recost_sales_order_lines: a month re-priced re-charges it too ───────

CREATE OR REPLACE FUNCTION recost_sales_order_lines(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE(lines_costed INTEGER, lines_still_blind INTEGER, orders_with_cost INTEGER)
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_batch   UUID;
    v_changed INTEGER := 0;
    v_order   UUID;
    v_before  JSONB;
BEGIN
    IF commission_order_period_locked(p_sub_department_id, p_period) THEN
        RAISE EXCEPTION 'The run for this month has paid. Reopen it before refilling costs — a cost changes the margin, and the margin changes what the run paid.'
            USING ERRCODE = '23RUN';
    END IF;

    SELECT b.id INTO v_batch
      FROM sales_import_batches b
     WHERE b.sub_department_id = p_sub_department_id
       AND b.period_month = p_period
       AND b.status = 'committed';

    IF v_batch IS NULL THEN
        RETURN QUERY SELECT 0, 0, 0;
        RETURN;
    END IF;

    -- What each line cost before. The count is of lines whose cost (or where it
    -- came from) MOVED — not of the combo lines the UPDATE below resets to
    -- their own price and catalogue_apply_combos then puts back.
    SELECT COALESCE(jsonb_object_agg(sl.id::TEXT, jsonb_build_array(sl.cost_amount, sl.cost_source, sl.option_charge_amount)), '{}'::JSONB)
      INTO v_before
      FROM sales_order_lines sl
      JOIN sales_orders o ON o.id = sl.order_id
     WHERE o.batch_id = v_batch;

    -- A bed frame's divan, leg and gap the customer pays for (2026-10-05) —
    -- on EVERY line, a hand-costed one too: a charge is a price, not a cost.
    WITH charged AS (
        SELECT sl.id, COALESCE(c.amount, 0) AS amount
          FROM sales_order_lines sl
          JOIN sales_orders o ON o.id = sl.order_id
          CROSS JOIN LATERAL catalogue_line_option_charge(COALESCE(o.erp_company_id, 1), sl.product_code, sl.item_group,
                                                          sl.description2, sl.raw, sl.qty) c
         WHERE o.batch_id = v_batch
    )
    UPDATE sales_order_lines sl
       SET option_charge_amount = ch.amount
      FROM charged ch
     WHERE sl.id = ch.id
       AND sl.option_charge_amount IS DISTINCT FROM ch.amount;

    WITH priced AS (
        SELECT sl.id, r.cost, catalogue_cost_detail_with_charges(r.detail, c.parts) AS detail
          FROM sales_order_lines sl
          JOIN sales_orders o ON o.id = sl.order_id
          CROSS JOIN LATERAL catalogue_line_cost(COALESCE(o.erp_company_id, 1), sl.product_code, sl.item_group,
                                                 sl.description2, sl.raw, sl.qty) r
          CROSS JOIN LATERAL catalogue_line_option_charge(COALESCE(o.erp_company_id, 1), sl.product_code, sl.item_group,
                                                          sl.description2, sl.raw, sl.qty) c
         WHERE o.batch_id = v_batch
           AND COALESCE(sl.cost_source, '') <> 'manual'
    )
    UPDATE sales_order_lines sl
       SET list_cost_amount = p.cost,
           cost_amount      = p.cost,
           cost_source      = CASE WHEN p.cost IS NULL THEN NULL ELSE 'catalogue' END,
           cost_detail      = p.detail
      FROM priced p
     WHERE sl.id = p.id
       AND (sl.cost_amount      IS DISTINCT FROM p.cost
         OR sl.list_cost_amount IS DISTINCT FROM p.cost
         OR sl.cost_detail      IS DISTINCT FROM p.detail
         OR sl.cost_source      IS DISTINCT FROM CASE WHEN p.cost IS NULL THEN NULL ELSE 'catalogue' END);

    FOR v_order IN
        SELECT DISTINCT o.id
          FROM sales_orders o
          JOIN sales_order_lines sl ON sl.order_id = o.id
         WHERE o.batch_id = v_batch
           AND UPPER(COALESCE(sl.item_group, '')) = 'SOFA'
    LOOP
        PERFORM catalogue_apply_combos(v_order);
    END LOOP;

    SELECT COUNT(*)::INTEGER INTO v_changed
      FROM sales_order_lines sl
      JOIN sales_orders o ON o.id = sl.order_id
     WHERE o.batch_id = v_batch
       AND v_before->(sl.id::TEXT) IS DISTINCT FROM jsonb_build_array(sl.cost_amount, sl.cost_source, sl.option_charge_amount);

    RETURN QUERY
    SELECT v_changed,
           (SELECT COUNT(*)::INTEGER
              FROM sales_order_lines sl
              JOIN sales_orders o ON o.id = sl.order_id
             WHERE o.batch_id = v_batch AND sl.cost_source IS NULL),
           (SELECT COUNT(*)::INTEGER
              FROM sales_orders o
             WHERE o.batch_id = v_batch
               AND NOT EXISTS (SELECT 1 FROM sales_order_lines sl
                                WHERE sl.order_id = o.id AND sl.cost_source IS NULL));
END;
$fn$;

-- ── 8. member_catalogue: a bed frame model's charged options ──────────────

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
               -- A bed frame's divan, leg and gap the customer may be CHARGED
               -- for (2026-10-05): what the ERP lets the model take, priced on
               -- Maintenance above zero. Anything else is FOC. A charge is the
               -- customer's price, not a cost, so the unpriced answer carries it.
               || CASE WHEN UPPER(m.category) = 'BEDFRAME' THEN jsonb_build_object('charges', jsonb_strip_nulls(jsonb_build_object(
                   'divan_heights', catalogue_model_charges(v_company, 'bedframe_divan_heights', m.allowed_options->'divan_heights'),
                   'leg_heights',   catalogue_model_charges(v_company, 'bedframe_leg_heights',   m.allowed_options->'leg_heights'),
                   'gaps',          catalogue_model_charges(v_company, 'bedframe_gaps',          m.allowed_options->'gaps'))))
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

-- ── 9. revenue_month_orders: the margin without the charges ──────────────

CREATE OR REPLACE FUNCTION public.revenue_month_orders(p_sub_department_id uuid, p_period date)
 RETURNS TABLE(order_id uuid, order_no text, order_date date, event_date date, customer_name text, debtor_code text, venue text, venue_group_key text, venue_group_name text, organizer text, location text, brand_code text, order_total numeric, paid_amount numeric, balance numeric, cancelled boolean, excluded_reason text, erp_status text, erp_on_hold boolean, sequence_in_day integer, staff_id uuid, employee_name text, employee_code text, agent_name text, line_count integer, line_amount numeric, commissionable numeric, margin_revenue numeric, margin_cost numeric, margin_pct numeric, margin_source text, lines_without_cost integer, lines_without_brand integer, open_bill_rank smallint, open_bill_auto boolean, deposit_required numeric, deposit_met boolean, ref_no text, paper_no text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH scheme AS (
        SELECT s.id,
               s.enable_kpi,
               s.deposit_threshold_pct AS pct,
               CASE WHEN COALESCE(s.revenue_cost_divisor, 1) > 0
                    THEN s.revenue_cost_divisor ELSE 1 END AS cost_divisor
          FROM comm_schemes s
         WHERE s.sub_department_id = p_sub_department_id AND s.is_active
         ORDER BY s.effective_from DESC
         LIMIT 1
    ), batch AS (
        SELECT b.id
          FROM sales_import_batches b
         WHERE b.sub_department_id = p_sub_department_id
           AND b.period_month = p_period
           AND b.status = 'committed'
    ), organiser AS (
        -- The organiser belongs to THIS month's fair, not to the hall: the
        -- same venue has a different organiser from month to month. One row
        -- per place, chosen as venue_event_organiser chooses: an undated fair
        -- first, then the earliest start (20260926100000: read once here, not
        -- once per bill).
        SELECT DISTINCT ON (e.venue_key) e.venue_key, og.name
          FROM comm_venue_events e
          JOIN comm_organisers og ON og.id = e.organiser_id
         WHERE e.period_month = DATE_TRUNC('month', p_period)::DATE
         ORDER BY e.venue_key, (e.start_date IS NULL) DESC, e.start_date
    ), kpi AS (
        -- What each bill's KPI items take off its sales (2026-09-27), in force
        -- at the month's end as the run reads them; none while KPI is off.
        SELECT h.order_id, SUM(h.qty * h.unit_amount) AS amount
          FROM scheme sc
          CROSS JOIN LATERAL comm_kpi_hits(
              sc.id,
              CASE WHEN sc.enable_kpi
                   THEN ARRAY(SELECT o.id FROM sales_orders o JOIN batch ON batch.id = o.batch_id)
                   ELSE '{}'::UUID[] END,
              (DATE_TRUNC('month', p_period) + INTERVAL '1 month - 1 day')::DATE) h
         GROUP BY h.order_id
    )
    SELECT
        o.id, o.order_no, o.order_date, o.event_date, o.customer_name, o.debtor_code,
        o.venue,
        -- The spelling stays on the row; the PLACE is what groups and filters.
        COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue)),
        COALESCE(canon.display_name, own.display_name),
        org.name,
        o.location, o.brand_code,
        o.order_total, COALESCE(o.paid_amount, 0), o.balance,
        o.cancelled, o.excluded_reason, o.erp_status, o.erp_on_hold, o.sequence_in_day,
        o.staff_id, st.employee_name, st.employee_code, o.agent_name,
        COALESCE(l.n, 0)::INTEGER,
        COALESCE(l.amount, 0),
        -- What the rate is paid on: the bill's MAIN sales — its commissionable
        -- lines less its KPI items. What the margin is taken on: the same, less
        -- what its bed frames' divan, leg and gap were CHARGED (2026-10-05) —
        -- the customer's price for an option is out of the margin on both
        -- sides, and still in the sales the rate is paid on.
        COALESCE(l.main, 0),
        COALESCE(l.margin_base, 0),
        l.margin_cost,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_base, 0) <= 0 THEN NULL
            ELSE ROUND((l.margin_base - l.margin_cost) / l.margin_base, 6)
        END,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN 'manual'
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_base, 0) <= 0 THEN 'none'
            ELSE 'cost'
        END,
        COALESCE(l.no_cost, 0)::INTEGER,
        COALESCE(l.no_brand, 0)::INTEGER,
        t.bill_rank, t.auto_suggested,
        CASE WHEN sc.pct IS NULL THEN NULL ELSE ROUND(o.order_total * sc.pct, 2) END,
        CASE WHEN sc.pct IS NULL THEN TRUE
             ELSE COALESCE(o.paid_amount, 0) + 0.005 >= o.order_total * sc.pct END,
        -- The paper beside the document (20261003170000): the Ref No. as the
        -- ERP has it, and the paper number the double-claim check reads.
        ref_no(o),
        paper_no(o)
      FROM sales_orders o
      JOIN batch ON batch.id = o.batch_id
      CROSS JOIN scheme sc
      LEFT JOIN hr_staff_costs st ON st.id = o.staff_id
      LEFT JOIN comm_venues own ON own.venue_key = venue_key(o.venue)
      LEFT JOIN comm_venues canon ON canon.venue_key = own.canonical_key
      -- venue_group_key(o.venue), spelled out: the canonical place when a
      -- human folded this spelling into one, else the spelling's own key.
      LEFT JOIN organiser org
             ON org.venue_key = COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue))
      LEFT JOIN kpi k ON k.order_id = o.id
      LEFT JOIN LATERAL (
          SELECT g.n, g.amount, g.margin_cost, g.no_cost, g.no_brand,
                 -- comm_kpi_hits pays only what the bill's sales cover.
                 COALESCE(g.goods, 0) - COALESCE(k.amount, 0) AS main,
                 COALESCE(g.goods, 0) - COALESCE(k.amount, 0) - COALESCE(g.charges, 0) AS margin_base
            FROM (
              SELECT
                  COUNT(*) AS n,
                  SUM(sl.line_amount) AS amount,
                  -- Every line in a commissionable group. A free giveaway is
                  -- in it: its cost is real and that is how giving it away is
                  -- meant to hurt the margin.
                  SUM(sl.line_amount) FILTER (WHERE ig.commissionable) AS goods,
                  -- What its bed frames' divan, leg and gap were charged.
                  SUM(sl.option_charge_amount) FILTER (WHERE ig.commissionable) AS charges,
                  -- NULL when ANY line of that base has no cost. A partial
                  -- cost would show as a fat margin and the engine would
                  -- disagree - it refuses to judge an incomplete bill at all.
                  --
                  -- Each line divided by its SKU's own ratio, else the
                  -- scheme's (2026-09-27), exactly as marginBase() divides it:
                  -- this is the cost the MARGIN is taken on, not the cost on
                  -- the invoice.
                  CASE WHEN COUNT(*) FILTER (WHERE ig.commissionable AND sl.cost_amount IS NULL) > 0
                       THEN NULL
                       ELSE ROUND(
                            COALESCE(SUM(sl.cost_amount / COALESCE(cr.ratio, sc.cost_divisor))
                                     FILTER (WHERE ig.commissionable), 0),
                            2) END AS margin_cost,
                  COUNT(*) FILTER (WHERE sl.cost_amount IS NULL) AS no_cost,
                  COUNT(*) FILTER (WHERE sl.brand_code IS NULL) AS no_brand
                FROM sales_order_lines sl
                LEFT JOIN comm_item_groups ig
                       ON ig.scheme_id = sc.id
                      AND UPPER(BTRIM(ig.item_group)) = UPPER(BTRIM(sl.item_group))
                LEFT JOIN comm_cost_ratios cr
                       ON cr.scheme_id = sc.id
                      AND UPPER(BTRIM(cr.product_code)) = UPPER(BTRIM(sl.product_code))
               WHERE sl.order_id = o.id
            ) g
      ) l ON TRUE
      LEFT JOIN sales_order_open_bill_tags t ON t.order_id = o.id
     ORDER BY o.order_date, o.sequence_in_day NULLS LAST, o.order_no;
$function$;

-- ── 10. member_order_facts: the member's margin without the charges ──────

CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.*,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS today,
   public.comm_first_paid_month(c.sub_department_id) AS first_paid,
   date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS current_month
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), closed AS (
  -- The last month each salesperson was closed for on Comm Cal (a standing
  -- close; a reopened one is not).
  SELECT x.staff_id,max(x.period_month) AS last_closed
  FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
  WHERE x.reopened_at IS NULL
  GROUP BY x.staff_id
 ), run_closed AS (
  -- A run applied for the whole month closes it for everybody.
  SELECT max(r.period_month) AS last_closed
  FROM public.comm_runs r
  JOIN public.comm_schemes rs ON rs.id=r.scheme_id
  JOIN scheme c ON c.sub_department_id=rs.sub_department_id
  WHERE r.status IN ('applied','locked')
 ), sources AS (
  -- Resolve the newest committed document BEFORE checking owner, cancellation
  -- or order date, so an older imported version can never be revived.
  SELECT DISTINCT ON (so.order_no) so.* FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  JOIN scheme c ON c.sub_department_id=ib.sub_department_id
  WHERE ib.status='committed' AND so.period_month<=c.current_month
  ORDER BY so.order_no,so.created_at DESC,so.id
 ), scoped AS (
  SELECT so.*,c.enable_kpi,
   -- Released: the month that close paid it in, for good. Before the portal
   -- pays (20260926020000): its own month, settled by hand. Otherwise its own
   -- month until that month is closed for its salesperson, then the first
   -- month still open for them (20261004020000).
   coalesce(r.period_month,
    CASE WHEN so.period_month<c.first_paid THEN so.period_month
     ELSE greatest(so.period_month,
      (cl.last_closed+interval '1 month')::date,
      (rc.last_closed+interval '1 month')::date) END) AS recognition,
   -- The Revenue Team cost basis. Guarded the way marginBase() guards it: a
   -- missing or nonsense divisor divides by one rather than erasing the cost.
   CASE WHEN coalesce(c.revenue_cost_divisor,0)>0 THEN c.revenue_cost_divisor ELSE 1 END AS cost_divisor,
   r.id IS NOT NULL OR coalesce(so.period_month<c.first_paid,false)
    OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
    OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS is_cleared
  FROM sources so CROSS JOIN scheme c CROSS JOIN run_closed rc
  LEFT JOIN closed cl ON cl.staff_id=so.staff_id
  LEFT JOIN public.comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=c.sub_department_id
  WHERE NOT so.cancelled AND so.order_date<=c.today
 ), windowed AS (
  SELECT o.* FROM scoped o
  WHERE (p_from IS NULL OR o.recognition>=p_from) AND (p_until IS NULL OR o.recognition<p_until)
 ), kpi AS (
  -- (2026-09-27) The KPI items each bill carries, in force at the end of the
  -- month it is recognised in (the run's as-at): their amount is paid flat as
  -- KPI, off its sales. One call per month, none while KPI is off.
  SELECT h.order_id,sum(h.qty*h.unit_amount) AS amount,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT w.recognition FROM windowed w WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT w.id FROM windowed w WHERE w.recognition=m.recognition),
   (m.recognition+interval '1 month - 1 day')::date) h
  GROUP BY h.order_id
 ), line_scope AS (
  SELECT o.id,o.staff_id,o.order_no,o.order_date,o.period_month,o.recognition,
   o.brand_code,o.is_cleared,o.manual_margin_pct,l.line_amount,l.cost_amount,l.option_charge_amount,
   -- Layer 2: the cost the salesperson is measured on, not the invoice cost —
   -- each line at its SKU's own ratio, else the scheme's (2026-09-27).
   l.cost_amount/coalesce(cr.ratio,o.cost_divisor) AS team_cost,
   EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
    AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
  FROM windowed o JOIN public.sales_order_lines l ON l.order_id=o.id
  LEFT JOIN public.comm_cost_ratios cr ON cr.scheme_id=p_scheme
   AND upper(btrim(cr.product_code))=upper(btrim(l.product_code))
 ), bills AS (
  SELECT l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct,
   coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,
   -- What its bed frames' divan, leg and gap were charged (2026-10-05).
   coalesce(sum(l.option_charge_amount) FILTER(WHERE l.is_goods),0) AS charges,
   bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods) AS costed,
   sum(l.team_cost) FILTER(WHERE l.is_goods) AS team_cost,
   bool_or(l.is_goods) AS has_goods
  FROM line_scope l
  GROUP BY l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct
 ), split AS (
  -- comm_kpi_hits pays only what a bill's sales cover.
  -- The margin is taken on the main sales less the options' charges: the
  -- customer's price for an option is out of the margin on both sides, and
  -- still in the sales (2026-10-05).
  SELECT b.*,coalesce(k.qty,0) AS kpi_qty,b.goods-coalesce(k.amount,0) AS main,
   b.goods-coalesce(k.amount,0)-b.charges AS margin_base
  FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
  WHERE b.has_goods OR k.order_id IS NOT NULL
 )
 SELECT s.id,s.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED'),s.is_cleared,s.main,s.margin_base,
  CASE WHEN s.margin_base<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.margin_base END,
  s.kpi_qty,s.manual_margin_pct IS NOT NULL
 FROM split s;
$function$;

-- ── 11. Who may call what ───────────────────────────────────────────────────

-- As catalogue_model_options: read inside member_catalogue only.
REVOKE ALL ON FUNCTION catalogue_model_charges(BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalogue_model_charges(BIGINT, TEXT, JSONB) TO service_role;

-- ── 12. Lines already landed ────────────────────────────────────────────────

-- Every line's charge is 0 while nothing is priced (§0), which is the
-- column's default, so nothing is written today. Should a gap already carry a
-- charge when this runs, its lines are filled here — and a paid month's guard
-- refuses that loudly rather than letting a paid margin move.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM catalogue_option_prices
                WHERE pool IN ('bedframe_divan_heights', 'bedframe_leg_heights', 'bedframe_gaps')
                  AND price > 0) THEN
        UPDATE sales_order_lines sl
           SET option_charge_amount = ch.amount
          FROM (SELECT l.id, c.amount
                  FROM sales_order_lines l
                  JOIN sales_orders o ON o.id = l.order_id
                  CROSS JOIN LATERAL catalogue_line_option_charge(COALESCE(o.erp_company_id, 1), l.product_code,
                                                                  l.item_group, l.description2, l.raw, l.qty) c
                 WHERE c.amount <> 0) ch
         WHERE sl.id = ch.id;
    END IF;
END;
$$;
