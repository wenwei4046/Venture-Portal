-- ============================================================================
-- 20261026173700_sofa_specials_by_quantity.sql
-- A sofa special is charged once per sofa or BY QUANTITY on the Quote, and a bill's sofa specials are charged what the
-- bill's special order says (2026-10-26).
-- ============================================================================
--
-- The user, on Product List › Maintenance › Sofa › Specials: "我要它能够选择两种：一种是整 set 沙发的，比如我加了 200 块，
-- 它就是算整套沙发；另一种是 by quantity 的。比如 change 8030 back cushion，一个沙发可能有三个 compartment（三个
-- seat），所以这个东西应该要乘三。所以它需要在 quotation 那边的 quantity 可以放 plus 和 minus。" Asked how a bill
-- should count it, since the ERP writes a special's name on every piece and no number: "ERP 那边，他们填下去的时候就会直接
-- 写 Total 的价钱。我放这个价钱，只是给他们在做 quotation 的时候比较简单 … 比如说 detect 到这个 special order 是 600，
-- 自然而然这个 600 就不会算进 margin 里面了".
--
--   catalogue_option_prices.by_quantity   a sofa special's price is charged each, times the quantity the member sets
--                                         on the Quote (false: once per sofa, as since 2026-10-06). Sofa specials only.
--   catalogue_model_charges               the Quote's charge list says so: { value, charge, byQuantity: true }.
--   catalogue_apply_sofa_charges          a bill's sofa leg height is still Maintenance's price once per sofa × the sets;
--                                         its SPECIALS are what the bill's special order charges — the ERP's
--                                         custom_specials on the delivered items (sales_orders.raw.items: a preset
--                                         add-on's price, or Custom / other's extra charge), each special once per
--                                         sofa (the ERP writes a set's special order on every piece), times the piece's
--                                         quantity. A special the bill charges nothing for is charged nothing.
--
-- The TypeScript side: validateOptionPrices / MaintenanceTab (CHARGED), chargeList (byQuantity), specialQtyCharges
-- and the Quote's −/+ (the twin of nothing on a bill: the bill says what it charged). Production's bodies — the repo's
-- last copies, md5-checked — swapped (catalogue_model_charges, one statement) and replaced whole
-- (catalogue_apply_sofa_charges, from 55af81ff…), md5 checked at the end.
-- PGlite: tests/member-sql/validate-sofa-specials-by-quantity.mjs.

BEGIN;

-- ── How a sofa special is charged on the Quote ─────────────────────────────

ALTER TABLE public.catalogue_option_prices
  ADD COLUMN IF NOT EXISTS by_quantity BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.catalogue_option_prices
  DROP CONSTRAINT IF EXISTS catalogue_option_prices_by_quantity_sofa_specials;
ALTER TABLE public.catalogue_option_prices
  ADD CONSTRAINT catalogue_option_prices_by_quantity_sofa_specials CHECK (NOT by_quantity OR pool = 'sofa_specials');

COMMENT ON COLUMN public.catalogue_option_prices.by_quantity IS
  'A sofa special charged each, times the quantity the member sets on the Quote (2026-10-26). False: once per sofa. A bill is charged what its special order says.';

-- ── Production's bodies, as this file found them ───────────────────────────

DO $$
DECLARE
    v_charges TEXT;
    v_apply   TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_charges
      FROM pg_proc WHERE oid = 'public.catalogue_model_charges(bigint, text, jsonb, jsonb)'::regprocedure;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_sofa_charges(uuid)'::regprocedure;
    IF v_charges NOT IN ('5b6c299a088c8510929f868ae7185457', '8bc593720b73c69ef87d2f79541399a2') THEN
        RAISE EXCEPTION 'catalogue_model_charges is md5 %, not the body this migration was written from', v_charges;
    END IF;
    IF v_apply NOT IN ('55af81ff0c49ad4ff38aef13130863b9', 'cbab7a6e35a7b1c8dbd391326311ec70') THEN
        RAISE EXCEPTION 'catalogue_apply_sofa_charges is md5 %, not the body this migration was written from', v_apply;
    END IF;
END $$;

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

-- ── The Quote's charge list: a special charged by quantity says so ─────────

SELECT pg_temp.swap_check('public.catalogue_model_charges(bigint, text, jsonb, jsonb)'::regprocedure,
$old$jsonb_build_object('value', v.value, 'charge', op.price)$old$,
$new$jsonb_build_object('value', v.value, 'charge', op.price)
                         || CASE WHEN op.by_quantity THEN jsonb_build_object('byQuantity', TRUE) ELSE '{}'::JSONB END$new$);

-- ── A bill: its sofa's specials are what its special order charges ─────────

CREATE OR REPLACE FUNCTION public.catalogue_apply_sofa_charges(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_company BIGINT;
    v_items   JSONB;
    v_changed INTEGER := 0;
    v_n       INTEGER;
    g         RECORD;
    v_total   BIGINT;
    v_sum     BIGINT;
    v_shares  BIGINT[];
    v_target  INTEGER;
    k         INTEGER;
BEGIN
    SELECT COALESCE(o.erp_company_id, 1),
           CASE WHEN jsonb_typeof(o.raw -> 'items') = 'array' THEN o.raw -> 'items' ELSE '[]'::JSONB END
      INTO v_company, v_items
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
                   f.leg
              FROM sales_order_lines l
              LEFT JOIN LATERAL (SELECT x.category, x.base_model
                                   FROM catalogue_sku_for_code(v_company, l.product_code) x
                                  LIMIT 1) e ON TRUE
              CROSS JOIN LATERAL catalogue_line_facts(l.description2, l.raw) f
             WHERE l.order_id = p_order_id
               AND UPPER(COALESCE(e.category, l.item_group, '')) = 'SOFA'
               AND COALESCE(l.qty, 0) > 0
        ), sets AS (
            -- How many sofas: the smallest quantity among the pieces (×2 everywhere = two sofas).
            SELECT s.base_model, GREATEST(FLOOR(MIN(s.qty)), 1)::INTEGER AS sets
              FROM lines s
             GROUP BY s.base_model
        ), legs AS (
            -- A leg height any piece names, once (a value spelled two ways is
            -- one), at Maintenance's price: once per sofa, times the sofas.
            SELECT x.base_model, MIN(x.value) AS value
              FROM (SELECT s.base_model, BTRIM(s.leg) AS value
                      FROM lines s
                     WHERE NULLIF(BTRIM(COALESCE(s.leg, '')), '') IS NOT NULL) x
             GROUP BY x.base_model, catalogue_value_key(x.value)
        ), leg_parts AS (
            SELECT l.base_model, 'sofa_leg_heights'::TEXT AS pool, l.value, p.price,
                   ROUND(p.price * st.sets * 100)::BIGINT AS sen
              FROM legs l
              JOIN sets st ON st.base_model = l.base_model
              CROSS JOIN LATERAL (SELECT catalogue_option_price(v_company, 'sofa_leg_heights', l.value) AS price) p
             WHERE p.price > 0
        ), items AS (
            -- The bill as the ERP delivered it: its live sofa pieces.
            SELECT it.value AS item,
                   COALESCE(NULLIF(UPPER(BTRIM(e.base_model)), ''),
                            NULLIF(UPPER(SPLIT_PART(BTRIM(COALESCE(it.value ->> 'item_code', '')), '-', 1)), '')) AS base_model,
                   CASE WHEN (it.value ->> 'qty') ~ '^\d+(\.\d+)?$' THEN (it.value ->> 'qty')::NUMERIC ELSE 0 END AS qty
              FROM jsonb_array_elements(v_items) it
              LEFT JOIN LATERAL (SELECT x.category, x.base_model
                                   FROM catalogue_sku_for_code(v_company, it.value ->> 'item_code') x
                                  LIMIT 1) e ON TRUE
             WHERE jsonb_typeof(it.value) = 'object'
               AND COALESCE(it.value ->> 'cancelled', 'false') <> 'true'
               AND UPPER(COALESCE(e.category, it.value ->> 'item_group', '')) = 'SOFA'
        ), orders AS (
            -- Each special order a piece carries (custom_specials: an ERP add-on
            -- at its price, or Custom / other's extra charge), the piece's quantity of it.
            SELECT i.base_model, BTRIM(cs.value ->> 'description') AS value,
                   ROUND((cs.value ->> 'surchargeSen')::NUMERIC * i.qty)::BIGINT AS sen
              FROM items i
              CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.item -> 'custom_specials') = 'array'
                                                           THEN i.item -> 'custom_specials' ELSE '[]'::JSONB END) cs
             WHERE i.base_model IS NOT NULL
               AND i.qty > 0
               AND jsonb_typeof(cs.value) = 'object'
               AND NULLIF(BTRIM(COALESCE(cs.value ->> 'description', '')), '') IS NOT NULL
               AND (cs.value ->> 'surchargeSen') ~ '^\d+(\.\d+)?$'
               AND (cs.value ->> 'surchargeSen')::NUMERIC > 0
        ), order_parts AS (
            -- One per special per sofa: the ERP writes a set's special order on
            -- every piece of it, so the dearest copy is the special's.
            SELECT o.base_model, 'sofa_specials'::TEXT AS pool, MIN(o.value) AS value, MAX(o.sen) AS sen
              FROM orders o
             GROUP BY o.base_model, catalogue_value_key(o.value)
        ), parts AS (
            SELECT lp.base_model, lp.pool, lp.value, lp.sen, lp.price AS unit,
                   jsonb_build_object('pool', lp.pool, 'value', lp.value, 'price', lp.price) AS part
              FROM leg_parts lp
            UNION ALL
            SELECT op.base_model, op.pool, op.value, op.sen, NULL::NUMERIC,
                   jsonb_build_object('pool', op.pool, 'value', op.value, 'price', ROUND(op.sen::NUMERIC / 100, 2),
                                      'special_order', TRUE)
              FROM order_parts op
        ), charged AS (
            SELECT p.base_model,
                   COALESCE(SUM(p.unit), 0) AS unit,
                   COALESCE(SUM(p.sen) FILTER (WHERE p.pool = 'sofa_specials'), 0) AS order_sen,
                   SUM(p.sen) AS total_sen,
                   jsonb_agg(p.part ORDER BY p.pool, p.value) AS parts
              FROM parts p
             GROUP BY p.base_model
        )
        SELECT s.base_model,
               ARRAY_AGG(s.id ORDER BY s.line_no, s.id)     AS ids,
               ARRAY_AGG(s.weight ORDER BY s.line_no, s.id) AS weights,
               st.sets, c.unit, c.order_sen, c.total_sen, c.parts
          FROM lines s
          JOIN sets st ON st.base_model = s.base_model
          JOIN charged c ON c.base_model = s.base_model
         GROUP BY s.base_model, st.sets, c.unit, c.order_sen, c.total_sen, c.parts
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
                       'charge_set', jsonb_build_object('unit', g.unit, 'sets', g.sets,
                                                        'special_order', ROUND(g.order_sen::NUMERIC / 100, 2),
                                                        'total', ROUND(v_total::NUMERIC / 100, 2),
                                                        'lines', array_length(g.ids, 1)))
             WHERE l.id = g.ids[k];
            v_changed := v_changed + 1;
        END LOOP;
    END LOOP;

    RETURN v_changed;
END;
$function$;

-- ── What landed is what this file says ─────────────────────────────────────

DO $$
DECLARE
    v_charges TEXT;
    v_apply   TEXT;
BEGIN
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_charges
      FROM pg_proc WHERE oid = 'public.catalogue_model_charges(bigint, text, jsonb, jsonb)'::regprocedure;
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_apply
      FROM pg_proc WHERE oid = 'public.catalogue_apply_sofa_charges(uuid)'::regprocedure;
    IF v_charges IS DISTINCT FROM '8bc593720b73c69ef87d2f79541399a2' THEN
        RAISE EXCEPTION 'catalogue_model_charges landed as md5 %, not this file''s body', v_charges;
    END IF;
    IF v_apply IS DISTINCT FROM 'cbab7a6e35a7b1c8dbd391326311ec70' THEN
        RAISE EXCEPTION 'catalogue_apply_sofa_charges landed as md5 %, not this file''s body', v_apply;
    END IF;
END $$;

COMMIT;
