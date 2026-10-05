-- ═══════════════════════════════════════════════════════════════════════════
-- EVERY OPTION PRICED ON MAINTENANCE IS A CHARGE (user 2026-10-06)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 20261005010000 made a bed frame's divan, leg, gap and total height a CHARGE:
-- what the customer pays for the option, on top — out of the margin on both
-- sides, in the commissionable sales, never KPI. A bed frame's specials and a
-- sofa's leg height and specials stayed a COST surcharge, so a price keyed for
-- them lowered the margin. The user, on being told so:
--
--   "我要那些价钱是不会算进 margin 的，加 100 就一定 default calculator 100"
--
-- and, asked how a sofa of several pieces is charged: "整组 sofa 只加一次" —
-- once for the whole sofa, not once per module; and a bed frame's specials
-- "一样改成向客户加收".
--
-- So, from here on, EVERY price keyed on Product List › Maintenance is what the
-- customer pays for that option:
--
--   * A bed frame (one line = one frame): qty × (divan + leg + gap + total
--     height + each special), each priced above zero — catalogue_line_charge,
--     on the line as it lands.
--   * A sofa (one line per MODULE, as the ERP writes it): ONCE PER SOFA. The
--     sofa lines of one order are grouped by base model (the grouping the
--     combos use); every distinct leg height and special any of its lines names
--     is charged once, times the sets — the smallest quantity among its lines
--     (2A-LHF ×2 + CNR ×2 + 2A-RHF ×2 is two sofas; ×1 / ×2 / ×1 is one sofa
--     with two middle pieces). The set's charge is spread over its lines in
--     proportion to what each line sells for, the rounding to the dearest —
--     catalogue_apply_sofa_charges, at commit, after the order's last line is
--     in, beside catalogue_apply_combos.
--   * No option adds to a line's cost any more: catalogue_line_surcharge
--     answers 0. A charge is never negative.
--
-- Nothing changes today: catalogue_option_prices is EMPTY (2026-10-06), so
-- every charge is 0 and every surcharge was 0 — every line's cost, every margin
-- and every commission is what it was. §0 checks that before anything moves.
--
-- The TypeScript twins: lineCharge / sofaSetCharges in lib/catalogue/pricing.ts
-- (the member calculator); the run reads option_charge_amount as before.
--
-- Reversal: re-apply catalogue_line_option_charge, catalogue_line_surcharge,
-- sales_order_lines_apply_combos, recost_sales_order_lines (20261005010000 /
-- 20260924030000) and member_catalogue (20261005020000); then
-- DROP FUNCTION catalogue_apply_sofa_charges(UUID);
-- DROP FUNCTION catalogue_line_charge(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]);
-- and put back CHECK catalogue_option_prices_charge_not_negative for the four
-- bed frame pools only.

-- ── 0. Nothing that moves is priced yet ─────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM catalogue_option_prices
                WHERE pool IN ('bedframe_specials', 'sofa_leg_heights', 'sofa_specials')
                  AND price <> 0) THEN
        RAISE EXCEPTION 'A bed frame special or a sofa leg height / special already carries a surcharge: making it a charge moves margins. Show the user the before/after first.';
    END IF;
END;
$$;

-- ── 1. A charge is never negative — every priced pool now ───────────────────

ALTER TABLE catalogue_option_prices
    DROP CONSTRAINT IF EXISTS catalogue_option_prices_charge_not_negative;
ALTER TABLE catalogue_option_prices
    ADD CONSTRAINT catalogue_option_prices_charge_not_negative CHECK (price >= 0);

-- ── 2. What one line's options are charged, per unit ────────────────────────

-- A bed frame: its divan, leg, gap and total height and each special; a sofa:
-- its leg height and each special — each priced above zero, a value named
-- twice counted once. FOC = an option nobody priced, or priced at 0.
CREATE OR REPLACE FUNCTION catalogue_line_charge(p_company BIGINT, p_category TEXT,
                                                 p_divan TEXT, p_leg TEXT, p_gap TEXT, p_total TEXT,
                                                 p_specials TEXT[])
RETURNS TABLE(amount NUMERIC, parts JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
    v_cat   TEXT := UPPER(COALESCE(p_category, ''));
    v_pairs TEXT[][];
    v_seen  TEXT[] := '{}';
    v_pool  TEXT;
    v_price NUMERIC;
    v_sp    TEXT;
    k       INTEGER;
BEGIN
    amount := 0;
    parts  := '[]'::JSONB;
    IF v_cat = 'BEDFRAME' THEN
        v_pairs := ARRAY[['bedframe_divan_heights', p_divan],
                         ['bedframe_leg_heights',   p_leg],
                         ['bedframe_gaps',          p_gap],
                         ['bedframe_total_heights', p_total]];
        v_pool  := 'bedframe_specials';
    ELSIF v_cat = 'SOFA' THEN
        v_pairs := ARRAY[['sofa_leg_heights', p_leg]];
        v_pool  := 'sofa_specials';
    ELSE
        RETURN NEXT;
        RETURN;
    END IF;

    FOR k IN 1 .. array_length(v_pairs, 1) LOOP
        CONTINUE WHEN NULLIF(BTRIM(COALESCE(v_pairs[k][2], '')), '') IS NULL;
        v_price := catalogue_option_price(p_company, v_pairs[k][1], v_pairs[k][2]);
        CONTINUE WHEN v_price IS NULL OR v_price <= 0;
        parts  := parts || jsonb_build_array(jsonb_build_object(
            'pool', v_pairs[k][1], 'value', v_pairs[k][2], 'price', v_price));
        amount := amount + v_price;
    END LOOP;

    FOREACH v_sp IN ARRAY COALESCE(p_specials, '{}') LOOP
        CONTINUE WHEN NULLIF(BTRIM(COALESCE(v_sp, '')), '') IS NULL;
        CONTINUE WHEN catalogue_value_key(v_sp) = ANY (v_seen);
        v_seen  := v_seen || catalogue_value_key(v_sp);
        v_price := catalogue_option_price(p_company, v_pool, v_sp);
        CONTINUE WHEN v_price IS NULL OR v_price <= 0;
        parts  := parts || jsonb_build_array(jsonb_build_object(
            'pool', v_pool, 'value', v_sp, 'price', v_price));
        amount := amount + v_price;
    END LOOP;
    RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION catalogue_line_charge(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) IS
    'What one line''s options are CHARGED to the customer per unit (2026-10-06): a bed frame''s divan, leg, gap, total height and specials; a sofa''s leg height and specials — each priced above zero on Maintenance. Out of the margin, in the commissionable sales, never KPI. A sofa is charged once per set (catalogue_apply_sofa_charges), not by this per line.';

-- The 6-argument form (20261005010000) reads no specials. Kept for any caller;
-- nothing in the portal calls it any more.
CREATE OR REPLACE FUNCTION catalogue_line_charge(p_company BIGINT, p_category TEXT,
                                                 p_divan TEXT, p_leg TEXT, p_gap TEXT, p_total TEXT)
RETURNS TABLE(amount NUMERIC, parts JSONB)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT c.amount, c.parts
      FROM catalogue_line_charge(p_company, p_category, p_divan, p_leg, p_gap, p_total, NULL::TEXT[]) c;
$fn$;

-- ── 3. A line as it lands: a bed frame is charged on its own line ───────────

-- What the line was read as (catalogue_line_facts) and which category it is
-- (the mirror's, else its item group), times its quantity. A sofa line answers
-- 0 here: a sofa is charged once per set, across its modules, at commit.
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
    SELECT * INTO c FROM catalogue_line_charge(p_company, v_cat, f.divan, f.leg, f.gap, f.total, f.specials);
    unit   := COALESCE(c.amount, 0);
    amount := ROUND(unit * COALESCE(p_qty, 0), 2);
    parts  := COALESCE(c.parts, '[]'::JSONB);
    RETURN NEXT;
END;
$fn$;

-- ── 4. No option adds to a line's cost any more ─────────────────────────────

-- catalogue_line_cost still asks; the answer is always nothing. The signature
-- stays so catalogue_line_cost (20260924030000) need not change.
CREATE OR REPLACE FUNCTION catalogue_line_surcharge(p_company BIGINT, p_category TEXT, p_leg TEXT,
                                                    p_divan TEXT, p_total TEXT, p_specials TEXT[])
RETURNS TABLE(amount NUMERIC, parts JSONB)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
BEGIN
    -- Every option priced on Maintenance is CHARGED to the customer (2026-10-06):
    -- catalogue_line_charge / catalogue_apply_sofa_charges. None is a cost.
    amount := 0;
    parts  := '[]'::JSONB;
    RETURN NEXT;
END;
$fn$;

COMMENT ON FUNCTION catalogue_line_surcharge(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT[]) IS
    'Always 0 since 2026-10-06: every option priced on Maintenance is a charge to the customer (catalogue_line_charge, catalogue_apply_sofa_charges), never a cost.';

-- ── 5. A sofa, once per set ─────────────────────────────────────────────────

-- Idempotent: every sofa line of the order starts from no charge. A line is a
-- sofa by the mirror's category, else its item group — the reading
-- catalogue_line_option_charge uses. A hand-costed line is charged too: a
-- charge is a price, not a cost.
CREATE OR REPLACE FUNCTION catalogue_apply_sofa_charges(p_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_company BIGINT;
    v_changed INTEGER := 0;
    v_n       INTEGER;
    g         RECORD;
    v_total   BIGINT;
    v_sum     BIGINT;
    v_shares  BIGINT[];
    v_target  INTEGER;
    k         INTEGER;
BEGIN
    SELECT COALESCE(o.erp_company_id, 1) INTO v_company
      FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Back to no charge first, so a set that no longer carries one (a price
    -- removed, a special dropped in the ERP) lets go of it. Only this pass
    -- ever charges a sofa line, and it always says so in charge_set.
    UPDATE sales_order_lines l
       SET option_charge_amount = 0,
           cost_detail = CASE WHEN l.cost_detail IS NULL THEN NULL
                              ELSE l.cost_detail - 'charges' - 'charge_set' END
     WHERE l.order_id = p_order_id
       AND (l.option_charge_amount <> 0 OR COALESCE(l.cost_detail ? 'charge_set', FALSE))
       AND UPPER(COALESCE((SELECT e.category FROM catalogue_sku_for_code(v_company, l.product_code) e LIMIT 1),
                          l.item_group, '')) = 'SOFA';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_changed := v_changed + v_n;

    FOR g IN
        WITH lines AS (
            SELECT l.id, l.line_no, l.qty,
                   ROUND(GREATEST(COALESCE(l.line_amount, 0), 0) * 100)::BIGINT AS weight,
                   COALESCE(NULLIF(UPPER(BTRIM(e.base_model)), ''),
                            NULLIF(UPPER(SPLIT_PART(BTRIM(COALESCE(l.product_code, '')), '-', 1)), ''),
                            l.id::TEXT) AS base_model,
                   f.leg, f.specials
              FROM sales_order_lines l
              LEFT JOIN LATERAL (SELECT x.category, x.base_model
                                   FROM catalogue_sku_for_code(v_company, l.product_code) x
                                  LIMIT 1) e ON TRUE
              CROSS JOIN LATERAL catalogue_line_facts(l.description2, l.raw) f
             WHERE l.order_id = p_order_id
               AND UPPER(COALESCE(e.category, l.item_group, '')) = 'SOFA'
               AND COALESCE(l.qty, 0) > 0
        ), named AS (
            -- Every option any line of the set names, once: a value spelled two
            -- ways is one value.
            SELECT x.base_model, x.pool, MIN(x.value) AS value
              FROM (SELECT s.base_model, 'sofa_leg_heights'::TEXT AS pool, BTRIM(s.leg) AS value
                      FROM lines s
                     WHERE NULLIF(BTRIM(COALESCE(s.leg, '')), '') IS NOT NULL
                    UNION ALL
                    SELECT s.base_model, 'sofa_specials', BTRIM(sp)
                      FROM lines s, unnest(s.specials) sp
                     WHERE NULLIF(BTRIM(COALESCE(sp, '')), '') IS NOT NULL) x
             GROUP BY x.base_model, x.pool, catalogue_value_key(x.value)
        ), charged AS (
            SELECT p.base_model,
                   SUM(p.price) AS unit,
                   jsonb_agg(jsonb_build_object('pool', p.pool, 'value', p.value, 'price', p.price)
                             ORDER BY p.pool, p.value) AS parts
              FROM (SELECT n.base_model, n.pool, n.value,
                           catalogue_option_price(v_company, n.pool, n.value) AS price
                      FROM named n) p
             WHERE p.price > 0
             GROUP BY p.base_model
        )
        SELECT s.base_model,
               ARRAY_AGG(s.id ORDER BY s.line_no, s.id)     AS ids,
               ARRAY_AGG(s.weight ORDER BY s.line_no, s.id) AS weights,
               GREATEST(FLOOR(MIN(s.qty)), 1)::INTEGER     AS sets,
               c.unit, c.parts
          FROM lines s
          JOIN charged c ON c.base_model = s.base_model
         GROUP BY s.base_model, c.unit, c.parts
    LOOP
        v_total := ROUND(g.unit * g.sets * 100)::BIGINT;
        CONTINUE WHEN v_total <= 0;
        v_sum := (SELECT SUM(w) FROM unnest(g.weights) w);

        -- Spread in proportion to what each line sells for, the rounding
        -- residual to the dearest line; evenly when nothing is priced.
        IF v_sum <= 0 THEN
            v_shares := array_fill(v_total / array_length(g.ids, 1), ARRAY[array_length(g.ids, 1)]);
        ELSE
            v_shares := ARRAY(SELECT FLOOR(u.w::NUMERIC * v_total / v_sum)::BIGINT
                                FROM unnest(g.weights) WITH ORDINALITY AS u(w, i) ORDER BY u.i);
        END IF;
        v_target := 1;
        FOR k IN 2 .. array_length(g.ids, 1) LOOP
            IF g.weights[k] > g.weights[v_target] THEN
                v_target := k;
            END IF;
        END LOOP;
        v_shares[v_target] := v_shares[v_target] + (v_total - (SELECT SUM(x) FROM unnest(v_shares) x));

        FOR k IN 1 .. array_length(g.ids, 1) LOOP
            UPDATE sales_order_lines l
               SET option_charge_amount = v_shares[k]::NUMERIC / 100,
                   cost_detail = COALESCE(l.cost_detail, '{}'::JSONB) || jsonb_build_object(
                       'charges', g.parts,
                       'charge_set', jsonb_build_object('unit', g.unit, 'sets', g.sets,
                                                        'total', ROUND(v_total::NUMERIC / 100, 2),
                                                        'lines', array_length(g.ids, 1)))
             WHERE l.id = g.ids[k];
            v_changed := v_changed + 1;
        END LOOP;
    END LOOP;

    RETURN v_changed;
END;
$fn$;

COMMENT ON FUNCTION catalogue_apply_sofa_charges(UUID) IS
    'Charges one order''s sofas their options ONCE PER SOFA (user 2026-10-06: 整组 sofa 只加一次): lines grouped by base model, every distinct leg height and special priced above zero charged once, times the sets (the smallest line quantity), spread over the lines in proportion to their sales. Out of the margin, in the commissionable sales, never KPI. Idempotent — starts from no charge.';

REVOKE ALL ON FUNCTION catalogue_apply_sofa_charges(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_apply_sofa_charges(UUID) TO authenticated, service_role;

-- ── 6. …at commit, after the order's last line, with the combos ─────────────

CREATE OR REPLACE FUNCTION sales_order_lines_apply_combos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_flag TEXT := 'catalogue.combos_' || REPLACE(NEW.order_id::TEXT, '-', '');
BEGIN
    IF current_setting(v_flag, TRUE) = 'done' THEN
        RETURN NULL;
    END IF;
    PERFORM set_config(v_flag, 'done', TRUE);
    -- At COMMIT of the delivery that inserted the lines: a fault here would
    -- refuse the whole order, so it is reported and the modules keep their
    -- own costs instead.
    BEGIN
        PERFORM catalogue_apply_combos(NEW.order_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'catalogue_apply_combos failed on order %: %', NEW.order_id, SQLERRM;
    END;
    -- And each sofa's options, once per sofa (2026-10-06). A fault leaves the
    -- sofa uncharged rather than refusing the order.
    BEGIN
        PERFORM catalogue_apply_sofa_charges(NEW.order_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'catalogue_apply_sofa_charges failed on order %: %', NEW.order_id, SQLERRM;
    END;
    RETURN NULL;
END;
$fn$;

-- ── 7. recost_sales_order_lines: a month re-priced re-charges its sofas ─────

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

    -- A bed frame's options the customer pays for — on EVERY line, a
    -- hand-costed one too: a charge is a price. A sofa line answers 0 here and
    -- is charged once per set below (catalogue_apply_sofa_charges).
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
        PERFORM catalogue_apply_sofa_charges(v_order);
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

-- ── 8. member_catalogue: what a sofa and a bed frame may be charged for ──────

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

-- ── 9. Who may call what ────────────────────────────────────────────────────

-- As the 6-argument form: a reading of the Product List's prices under the
-- caller's own session.
REVOKE ALL ON FUNCTION catalogue_line_charge(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_line_charge(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated, service_role;

-- ── 10. Lines already landed ────────────────────────────────────────────────

-- Every charge is 0 while nothing is priced (§0) — the column's default — so
-- nothing is written today. A month re-priced later (Recost) charges its
-- bed frames' specials and its sofas through §3 and §5.
