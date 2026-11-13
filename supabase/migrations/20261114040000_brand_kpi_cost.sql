-- ============================================================================
-- 20261114040000_brand_kpi_cost.sql
-- A brand's own KPI item has a COST a unit — what comes off the bill (2026-11-13).
-- ============================================================================
--
-- 20261114030000 found a brand's own KPI item (2990s' Upgrade fabric, Upgrade latex seat) wherever the sofa names the
-- special, charged or not — and took off the bill only what its special order charges, so an upgrade whose price is
-- written in the remark earned the whole bill's commission AND the bonus: more than one keyed properly. Told so the
-- same evening, the user: "i need a place at kpi item rules set there fill in cost, so that it can dedecut the cost
-- out and change to kpi amount only . so that the margin is calculate correctly". A brand on its own scheme has no
-- Product List (20261112003700), so the upgrade's price cannot stand on Maintenance as the sub-department's do: it
-- stands on the item.
--
-- Now:
--   1. comm_kpi_items.cost_amount — a brand's own item alone, RM a unit above 0; NULL = no cost.
--   2. What a unit takes OFF its bill's commissionable sales is the item's cost — or what the set's special order
--      charges for it when that is MORE (a corner sofa's, charged double: "升级的钱只拿 bonus"), so an amount left
--      empty or typed short never pays commission on the upgrade's money (补钱容易、扣钱难). An item with no cost is
--      as before: what the special order charges, nothing where it charges nothing. What a unit PAYS is unchanged —
--      kpi_amount, or its month's tier.
--   3. catalogue_save_kpi_items takes the cost on an add and on a change (cost_amount: a key left out stays as
--      stored, 0 = no cost any more), refuses one on the sub-department's own item, and carries it — as the brand,
--      the name and the tiers — when a change of an item in force before today closes yesterday's row and opens
--      today's.
--
-- No cost is set here: the user fills it in on Rules › KPI items. Until then no figure moves (dry run on production,
-- rolled back: September–November's hits and Comm Cal's months identical before and after).
--
-- Two functions from PRODUCTION's bodies (2026-11-13, md5 of prosrc): comm_kpi_hits as 20261114030000 left it, three
-- statements and two comments swapped; catalogue_save_kpi_items as 20261112200000 left it, written whole. Each is
-- refused if production's body has changed since. No signature changes, so every grant stays. Every reader of the
-- hits follows by itself: revenue_month_orders, the member facts, both order books, member_kpi_for_staff.
--
-- Rollback, in words: clear every cost (UPDATE comm_kpi_items SET cost_amount = NULL) — the bodies then answer as
-- 20261114030000's and 20261112200000's did; or re-apply those two bodies.
--
-- PGlite: tests/member-sql/validate-brand-kpi-items.mjs (after 20261114030000, this migration verbatim, twice).

BEGIN;

CREATE TEMP TABLE brand_kpi_cost_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_kpi_cost_fns VALUES
  ('public.comm_kpi_hits(uuid, uuid[], date)',                    '786af079da486a58f7b28967cdf134d5', 'bea109da50baac1a36105406b50f9fd5'),
  ('public.catalogue_save_kpi_items(uuid, jsonb, jsonb, uuid[])', '29ea3f043b11daa7fb1f335220675cf5', 'a85779d3bbc5083962183aa9433a6880');

-- Each is production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_kpi_cost_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 1. The cost ──────────────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comm_kpi_items
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(15,2);

COMMENT ON COLUMN public.comm_kpi_items.cost_amount IS
  'A brand''s own item alone (2026-11-13): RM a unit taken OFF its bill''s commissionable sales — the upgrade''s price, set on Rules › KPI items, whatever the bill''s special order says of it (its price is sometimes written in the remark). A special order charging MORE takes that off instead. NULL: no cost — what the special order charges alone. kpi_amount (or its tier) is what the unit PAYS.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'kpi_item_cost_in_range') THEN
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT kpi_item_cost_in_range CHECK (cost_amount IS NULL OR (cost_amount > 0 AND cost_amount <= 1000000));
  END IF;
  -- The sub-department's own item takes its ONE amount off the bill and pays it (the user, 2026-09-27).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'kpi_item_cost_is_a_brands') THEN
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT kpi_item_cost_is_a_brands CHECK (brand_id IS NOT NULL OR cost_amount IS NULL);
  END IF;
END $$;

-- ── 2. The items a bill carries ──────────────────────────────────────────────────────────────────────────────────────
-- The old text, every run of whitespace matching any run, replaced by the new — found exactly once, or refused
-- (20261031210000's).
CREATE OR REPLACE FUNCTION pg_temp.swap_text(p_src text, p_old text, p_new text)
RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE
  v_pat   text := regexp_replace(regexp_replace(p_old, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
  v_n     integer;
  v_found text;
BEGIN
  SELECT count(*) INTO v_n FROM regexp_matches(p_src, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'A statement this migration swaps is there % times, not once — production changed since it was written: %', v_n, left(p_old, 80);
  END IF;
  v_found := (regexp_match(p_src, '(' || v_pat || ')'))[1];
  RETURN replace(p_src, v_found, p_new);
END
$fn$;

-- The function made again from the body the database holds, its statements swapped in pairs (old, new) — unless it
-- is this migration's own body already.
CREATE OR REPLACE FUNCTION pg_temp.remake(p_proc text, p_swaps text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_oid   regprocedure := to_regprocedure(p_proc);
  v_makes text;
  v_def   text;
  i       integer;
BEGIN
  SELECT makes INTO STRICT v_makes FROM brand_kpi_cost_fns WHERE proc = p_proc;
  IF (SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE oid = v_oid) = v_makes THEN
    RETURN;  -- made already
  END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(p_swaps, 1) / 2 LOOP
    v_def := pg_temp.swap_text(v_def, p_swaps[2 * i - 1], p_swaps[2 * i]);
  END LOOP;
  EXECUTE v_def;
END
$fn$;

SELECT pg_temp.remake('public.comm_kpi_hits(uuid, uuid[], date)', ARRAY[
    -- The items read: each with its cost.
    $o$catalogue_value_key(k.option_value) AS value_key, k.kpi_amount, k.brand_id$o$,
    $n$catalogue_value_key(k.option_value) AS value_key, k.kpi_amount, k.brand_id,
               -- (20261114040000) A brand's own item's cost a unit; NULL = none.
               k.cost_amount$n$,
    -- A line's special that is an item: its cost with it.
    $o$i.id AS item_id, i.option_pool, i.kpi_amount
          FROM specials sp$o$,
    $n$i.id AS item_id, i.option_pool, i.kpi_amount, i.cost_amount
          FROM specials sp$n$,
    -- The statement: what a line's copy takes off — the cost, or what its special order charges when that is more.
    $o$SELECT m.order_id, m.line_id, m.item_id, m.code_key, m.qty, COALESCE(MAX(mo.amount), 0) AS amount$o$,
    $n$SELECT m.order_id, m.line_id, m.item_id, m.code_key, m.qty,
               GREATEST(COALESCE(MAX(mo.amount), 0), COALESCE(m.cost_amount, 0)) AS amount$n$,
    $o$GROUP BY m.order_id, m.line_id, m.item_id, m.code_key, m.qty$o$,
    $n$GROUP BY m.order_id, m.line_id, m.item_id, m.code_key, m.qty, m.cost_amount$n$,
    -- Its comment.
    $o$-- what that line's copy of the special order charges for it: nothing where it charges nothing, and then
        -- nothing comes off the bill.$o$,
    $n$-- the item's COST a unit (20261114040000 — the user, the same evening: "i need a place at kpi item rules
        -- set there fill in cost, so that it can dedecut the cost out and change to kpi amount only"), or what that
        -- line's copy of the special order charges for it when that is more. An item with no cost: what the special
        -- order charges alone — nothing where it charges nothing, and then nothing comes off the bill.$n$,
    -- The finding's comment.
    $o$and what comes off the bill is what the set's special order charges (on every piece: its dearest
        --    copy). ──$o$,
    $n$and what comes off the bill is the item's cost a unit, or what the set's special order charges (on every
        --    piece: its dearest copy) when that is more (20261114040000). ──$n$
]);

-- ── 3. The writer ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Production's body (md5 29ea3f04…), whole: a brand's item's cost on an add and on a change — a key left out stays
-- as stored, 0 is no cost any more — refused on the sub-department's own, and kept through a change as the brand, the
-- name and the tiers are.
CREATE OR REPLACE FUNCTION public.catalogue_save_kpi_items(p_scheme uuid, p_adds jsonb, p_changes jsonb, p_removes uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_today   DATE := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    v_touched INTEGER := 0;
    v_item    comm_kpi_items%ROWTYPE;
    v_code    TEXT;
    v_name    TEXT;
    v_value   TEXT;
    v_label   TEXT;
    v_company BIGINT;
    v_amount  NUMERIC;
    v_tiers   JSONB;
    v_cost    NUMERIC;
    r         RECORD;
BEGIN
    PERFORM 1 FROM comm_schemes WHERE id = p_scheme;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown sub-department scheme' USING ERRCODE = 'P0002';
    END IF;

    -- Removed. Begun before today: closed yesterday, so a month already run
    -- keeps it. Begun today or later: it never applied, and goes.
    FOR r IN SELECT DISTINCT u.id FROM UNNEST(COALESCE(p_removes, '{}'::UUID[])) AS u(id) LOOP
        SELECT * INTO v_item FROM comm_kpi_items
         WHERE id = r.id AND scheme_id = p_scheme
           AND (effective_to IS NULL OR effective_to >= v_today)
           FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A KPI item changed since the page was opened. Reload and try again.'
                USING ERRCODE = '40001';
        END IF;
        IF v_item.effective_from < v_today THEN
            UPDATE comm_kpi_items SET effective_to = v_today - 1 WHERE id = v_item.id;
        ELSE
            DELETE FROM comm_kpi_items WHERE id = v_item.id;
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    -- A new amount — or, a brand's item, new tiers or a new cost — from today, the same way. What a change does not
    -- name stays: the item's brand, its name, and whichever of the amount, the tiers and the cost was not sent.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_changes, '[]'::JSONB))
               AS c(id UUID, kpi_amount NUMERIC, unit_tiers JSONB, cost_amount NUMERIC) LOOP
        SELECT * INTO v_item FROM comm_kpi_items
         WHERE id = r.id AND scheme_id = p_scheme
           AND (effective_to IS NULL OR effective_to >= v_today)
           FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A KPI item changed since the page was opened. Reload and try again.'
                USING ERRCODE = '40001';
        END IF;
        v_amount := COALESCE(r.kpi_amount, v_item.kpi_amount);
        v_tiers := COALESCE(r.unit_tiers, v_item.unit_tiers);
        -- (20261114040000) The cost: a key left out stays as stored; 0 is no cost any more.
        v_cost := CASE WHEN r.cost_amount IS NULL THEN v_item.cost_amount ELSE NULLIF(ROUND(r.cost_amount, 2), 0) END;
        IF v_item.brand_id IS NULL AND v_tiers <> '[]'::JSONB THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item pays by tier' USING ERRCODE = '22023';
        END IF;
        IF v_item.brand_id IS NULL AND v_cost IS NOT NULL THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item has a cost' USING ERRCODE = '22023';
        END IF;
        IF v_cost < 0 OR v_cost > 1000000 THEN
            RAISE EXCEPTION 'A cost is RM 0.01 to RM 1,000,000 a unit' USING ERRCODE = '22023';
        END IF;
        IF NOT comm_kpi_unit_tiers_valid(v_tiers) THEN
            RAISE EXCEPTION 'A tier is a whole number of units from 2 up, each above the one before, and what a unit pays'
                USING ERRCODE = '22023';
        END IF;
        CONTINUE WHEN v_item.kpi_amount = v_amount AND v_item.unit_tiers = v_tiers
                      AND v_item.cost_amount IS NOT DISTINCT FROM v_cost;
        IF v_item.effective_from < v_today THEN
            UPDATE comm_kpi_items SET effective_to = v_today - 1 WHERE id = v_item.id;
            INSERT INTO comm_kpi_items (scheme_id, brand_id, source, product_code, product_name, erp_product_id,
                                        option_pool, option_value, kpi_amount, unit_tiers, cost_amount,
                                        effective_from, effective_to, created_by)
            VALUES (p_scheme, v_item.brand_id, v_item.source, v_item.product_code, v_item.product_name,
                    v_item.erp_product_id, v_item.option_pool, v_item.option_value, v_amount, v_tiers, v_cost,
                    v_today, v_item.effective_to, auth.uid());
        ELSE
            UPDATE comm_kpi_items SET kpi_amount = v_amount, unit_tiers = v_tiers, cost_amount = v_cost WHERE id = v_item.id;
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    -- New items, in force from today.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_adds, '[]'::JSONB))
               AS a(source TEXT, erp_product_id TEXT, option_pool TEXT, option_value TEXT, kpi_amount NUMERIC,
                    brand_id UUID, label TEXT, unit_tiers JSONB, cost_amount NUMERIC) LOOP
        v_company := 1;
        v_label := NULL;
        v_tiers := COALESCE(r.unit_tiers, '[]'::JSONB);
        -- (20261114040000) A cost of 0, or none sent, is no cost.
        v_cost := NULLIF(ROUND(r.cost_amount, 2), 0);
        IF r.brand_id IS NOT NULL THEN
            -- A brand's own item (20261112200000): of a brand of this scheme that follows its own commission scheme,
            -- a sofa special of its own ERP company. Only such an item has a name of its own, pays by tier, or has
            -- a cost.
            SELECT COALESCE(b.erp_company_id, 1) INTO v_company
              FROM comm_brands b
             WHERE b.id = r.brand_id AND b.scheme_id = p_scheme AND b.own_scheme;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'That brand is not one of this sub-department''s brands on their own scheme'
                    USING ERRCODE = '23503';
            END IF;
            IF r.source IS DISTINCT FROM 'option' OR r.option_pool IS DISTINCT FROM 'sofa_specials' THEN
                RAISE EXCEPTION 'A brand''s own KPI item is a sofa special' USING ERRCODE = '22023';
            END IF;
            v_label := NULLIF(LEFT(BTRIM(COALESCE(r.label, '')), 120), '');
        ELSIF v_tiers <> '[]'::JSONB THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item pays by tier' USING ERRCODE = '22023';
        ELSIF v_cost IS NOT NULL THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item has a cost' USING ERRCODE = '22023';
        END IF;
        IF v_cost < 0 OR v_cost > 1000000 THEN
            RAISE EXCEPTION 'A cost is RM 0.01 to RM 1,000,000 a unit' USING ERRCODE = '22023';
        END IF;
        IF NOT comm_kpi_unit_tiers_valid(v_tiers) THEN
            RAISE EXCEPTION 'A tier is a whole number of units from 2 up, each above the one before, and what a unit pays'
                USING ERRCODE = '22023';
        END IF;

        IF r.source = 'sku' THEN
            SELECT p.item_code, p.description INTO v_code, v_name
              FROM erp_products p WHERE p.erp_id = r.erp_product_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'SKU % is not in the SKU Master', r.erp_product_id USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, source, product_code, product_name, erp_product_id,
                                        kpi_amount, effective_from, created_by)
            VALUES (p_scheme, 'sku', v_code, v_name, r.erp_product_id, r.kpi_amount, v_today, auth.uid());
        ELSIF r.source = 'option' AND r.option_pool IN ('bedframe_fabric_series', 'sofa_fabric_series') THEN
            -- A fabric series (2026-10-29): the fabric list's own spelling — a
            -- live fabric's first — what comm_kpi_hits compares a line's series
            -- against, and a name that says whose it is (kpi.ts fabricSeriesLabel).
            SELECT BTRIM(f.series) INTO v_value
              FROM erp_fabrics f
             WHERE f.erp_company_id = 1
               AND catalogue_value_key(f.series) = catalogue_value_key(r.option_value)
             ORDER BY (f.removed_at IS NULL) DESC, f.series
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION '"%" is not a fabric series on the ERP''s fabric list', r.option_value
                    USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, source, option_pool, option_value, product_name,
                                        kpi_amount, effective_from, created_by)
            VALUES (p_scheme, 'option', r.option_pool, v_value,
                    v_value || CASE r.option_pool WHEN 'sofa_fabric_series' THEN ' · Sofa fabric'
                                                  ELSE ' · Bed frame fabric' END,
                    r.kpi_amount, v_today, auth.uid());
        ELSIF r.source = 'option' THEN
            -- The pool's own spelling: what comm_kpi_hits compares a line against
            -- (a brand's item: its own ERP company's pool).
            SELECT o.value INTO v_value
              FROM erp_maintenance_options o
             WHERE o.erp_company_id = v_company AND o.pool = r.option_pool
               AND catalogue_value_key(o.value) = catalogue_value_key(r.option_value)
             ORDER BY (o.removed_at IS NULL) DESC, o.value
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION '"%" is not in the % Maintenance pool', r.option_value, r.option_pool
                    USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, brand_id, source, option_pool, option_value, product_name,
                                        kpi_amount, unit_tiers, cost_amount, effective_from, created_by)
            VALUES (p_scheme, r.brand_id, 'option', r.option_pool, v_value, v_label,
                    r.kpi_amount, v_tiers, v_cost, v_today, auth.uid());
        ELSE
            RAISE EXCEPTION 'A KPI item is a SKU, a special or a fabric series, not %', COALESCE(r.source, 'nothing')
                USING ERRCODE = '22023';
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    RETURN v_touched;
END;
$function$;

-- ── 4. What stands now is what was tested ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(format('%s is md5 %s', f.proc, md5(replace(p.prosrc, E'\r', ''))), '; ' ORDER BY f.proc) INTO v_bad
    FROM brand_kpi_cost_fns f
    JOIN pg_proc p ON p.oid = to_regprocedure(f.proc)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM f.makes;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the bodies this migration makes: %', v_bad;
  END IF;
END $$;

COMMIT;
