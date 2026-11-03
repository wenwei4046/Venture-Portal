-- ============================================================================
-- 20261027020300_sofa_specials_by_compartment.sql
-- A bill's sofa specials are Maintenance's again: Full set once per sofa, By quantity once per compartment
-- (2026-10-27).
-- ============================================================================
--
-- The user, showing the ERP's New Sales Order — its Special Orders ticked from a list: "因为他填入 Special Order 时
-- 你应该能看到他的 Special Order description 嘛，我就跟着，只要他的 description 能 match 到 … 在这边就自然而然从
-- sales order 那边扣除那个 Special Order 的 total amount", "有些是 full set 的，直接用它的价钱减 300 块（比如直接从 6,000
-- 块抽 300 块出来）。如果有些是 by seat / by compartment，就看它有哪几个 compartment … 每一个 compartment 只会有一个
-- back cushion（1A 是一个 back cushion，2A 就是两个 back cushion）". Asked: a whole sofa (8211 6FT) "都当 1 个"; the
-- money the ERP's special order itself carries — "只照 Maintenance"; October's bills count too (at a Recost).
--
-- Since 20261026173700 a bill's sofa specials were what its special order charged — and on the 165 sofa bills since
-- 1 Sept that was nothing: the ERP's sofa special orders are ticked from a list at RM 0. Now:
--
--   catalogue_apply_sofa_charges   each special any piece of a sofa names (catalogue_line_facts, as before
--                                  20261026173700) at Maintenance's price, matched by name as every option is: a Full
--                                  set special once per sofa × the sofas, a By quantity one once per COMPARTMENT — each
--                                  piece's back cushions (the ERP's SOFA_MODULES `cushions`: 1A / 1B / 1NA / 1S one,
--                                  2A / 2B / 2NA / 2S two, 3S three, a chaise or a corner one, a console or a stool
--                                  none, a whole sofa (6FT) or anything else one) × its quantity. The leg height as
--                                  before, once per sofa. The bill's own special-order money is not read.
--                                  cost_detail.charges: each part's price and `count` (`by_quantity` when it is);
--                                  charge_set: sets, compartments, total, lines.
--
-- The TypeScript twin: moduleCushions (quote-model.ts) — the Quote's first + on a counted special fills them in.
-- Production's body (20261026173700's, md5-checked) replaced whole; the md5 checked at the end.
-- PGlite: tests/member-sql/validate-sofa-specials-by-compartment.mjs.

BEGIN;

DO $$
DECLARE
    v_apply TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_sofa_charges(uuid)'::regprocedure;
    IF v_apply NOT IN ('cbab7a6e35a7b1c8dbd391326311ec70', 'c0146d4639ed8963daf6b9f6479af167') THEN
        RAISE EXCEPTION 'catalogue_apply_sofa_charges is md5 %, not the body this migration was written from', v_apply;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.catalogue_apply_sofa_charges(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
                   -- Its back cushions — its compartments (the ERP's SOFA_MODULES): the module is
                   -- the code after its last '-', before its brackets.
                   CASE WHEN m.module ~ '^[0-9](A|B|NA|S)$' THEN SUBSTRING(m.module FROM 1 FOR 1)::INTEGER
                        WHEN m.module IN ('CONSOLE', 'STOOL', 'OTT') THEN 0
                        ELSE 1 END AS cushions,
                   f.leg, f.specials
              FROM sales_order_lines l
              LEFT JOIN LATERAL (SELECT x.category, x.base_model
                                   FROM catalogue_sku_for_code(v_company, l.product_code) x
                                  LIMIT 1) e ON TRUE
              CROSS JOIN LATERAL (SELECT UPPER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(l.product_code, ''),
                                                 '^.*-', ''), '\s+', '', 'g'), '\(.*$', '')) AS module) m
              CROSS JOIN LATERAL catalogue_line_facts(l.description2, l.raw) f
             WHERE l.order_id = p_order_id
               AND UPPER(COALESCE(e.category, l.item_group, '')) = 'SOFA'
               AND COALESCE(l.qty, 0) > 0
        ), sofas AS (
            -- How many sofas — the smallest quantity among the pieces (×2 everywhere = two
            -- sofas) — and how many compartments, every piece's cushions times its quantity.
            SELECT s.base_model, GREATEST(FLOOR(MIN(s.qty)), 1)::INTEGER AS sets,
                   ROUND(SUM(s.cushions * s.qty))::INTEGER AS compartments
              FROM lines s
             GROUP BY s.base_model
        ), named AS (
            -- Every option any piece of the sofa names, once: a value spelled two ways
            -- is one value.
            SELECT x.base_model, x.pool, MIN(x.value) AS value
              FROM (SELECT s.base_model, 'sofa_leg_heights'::TEXT AS pool, BTRIM(s.leg) AS value
                      FROM lines s
                     WHERE NULLIF(BTRIM(COALESCE(s.leg, '')), '') IS NOT NULL
                    UNION ALL
                    SELECT s.base_model, 'sofa_specials', BTRIM(sp)
                      FROM lines s, unnest(s.specials) sp
                     WHERE NULLIF(BTRIM(COALESCE(sp, '')), '') IS NOT NULL) x
             GROUP BY x.base_model, x.pool, catalogue_value_key(x.value)
        ), parts AS (
            -- Maintenance's price, the row catalogue_option_price reads: once per sofa, a
            -- special charged By quantity once per compartment.
            SELECT n.base_model, n.pool, n.value, op.price, op.by_quantity,
                   CASE WHEN op.by_quantity THEN st.compartments ELSE st.sets END AS times
              FROM named n
              JOIN sofas st ON st.base_model = n.base_model
              CROSS JOIN LATERAL (
                  SELECT o.price, o.by_quantity
                    FROM catalogue_option_prices o
                   WHERE o.erp_company_id = v_company
                     AND o.pool = n.pool
                     AND catalogue_value_key(o.value) IN (catalogue_value_key(n.value),
                                                          catalogue_value_key(REGEXP_REPLACE(COALESCE(n.value, ''), '\s*\(.*\)\s*$', '')))
                   ORDER BY (catalogue_value_key(o.value) = catalogue_value_key(n.value)) DESC
                   LIMIT 1) op
             WHERE op.price > 0
        ), charged AS (
            SELECT p.base_model,
                   SUM(ROUND(p.price * p.times * 100))::BIGINT AS total_sen,
                   jsonb_agg(jsonb_build_object('pool', p.pool, 'value', p.value, 'price', p.price, 'count', p.times)
                             || CASE WHEN p.by_quantity THEN jsonb_build_object('by_quantity', TRUE) ELSE '{}'::JSONB END
                             ORDER BY p.pool, p.value) AS parts
              FROM parts p
             WHERE p.times > 0
             GROUP BY p.base_model
        )
        SELECT s.base_model,
               ARRAY_AGG(s.id ORDER BY s.line_no, s.id)     AS ids,
               ARRAY_AGG(s.weight ORDER BY s.line_no, s.id) AS weights,
               st.sets, st.compartments, c.total_sen, c.parts
          FROM lines s
          JOIN sofas st ON st.base_model = s.base_model
          JOIN charged c ON c.base_model = s.base_model
         GROUP BY s.base_model, st.sets, st.compartments, c.total_sen, c.parts
    LOOP
        v_total := COALESCE(g.total_sen, 0);
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
                       'charge_set', jsonb_build_object('sets', g.sets, 'compartments', g.compartments,
                                                        'total', ROUND(v_total::NUMERIC / 100, 2),
                                                        'lines', array_length(g.ids, 1)))
             WHERE l.id = g.ids[k];
            v_changed := v_changed + 1;
        END LOOP;
    END LOOP;

    RETURN v_changed;
END;
$function$;

COMMENT ON FUNCTION public.catalogue_apply_sofa_charges(uuid) IS
    'Charges one order''s sofas their options (2026-10-27): lines grouped by base model; every distinct leg height and special priced above zero on Maintenance — matched by name — once per sofa times the sofas (the smallest line quantity), a special charged By quantity once per compartment (each piece''s back cushions, the ERP''s SOFA_MODULES, times its quantity); spread over the lines in proportion to their sales. The bill''s own special-order money is not read. Out of the margin, in the commissionable sales, never KPI. Idempotent — starts from no charge.';

-- ── What landed is what this file says ─────────────────────────────────────

DO $$
DECLARE
    v_apply TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_sofa_charges(uuid)'::regprocedure;
    IF v_apply IS DISTINCT FROM 'c0146d4639ed8963daf6b9f6479af167' THEN
        RAISE EXCEPTION 'catalogue_apply_sofa_charges landed as md5 %, not this file''s body', v_apply;
    END IF;
END $$;

COMMIT;
