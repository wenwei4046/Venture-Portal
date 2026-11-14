-- ============================================================================
-- 20261114100000_brand_kpi_corner_cost.sql
-- A brand's own KPI item takes off ONLY its cost — and a sofa with a corner, its corner cost (2026-11-14).
-- ============================================================================
--
-- 20261114040000 gave a brand's own KPI item (2990s' Upgrade fabric, Upgrade latex seat) a COST a unit, and took off
-- the bill that cost — or what the sofa's special order charged for the special when that was more. Asked the next
-- night whether that was the rule, the user: "only follow the cost set in venture" — the cost set on Rules › KPI items
-- is what comes off, whatever the bill charged. And of the price list's corner prices (fabric RM 125 / RM 250 corner,
-- latex seat RM 500 / RM 1,000 corner), asked whether a corner should be read: "yes need to be corner as well, if that
-- is a compartment of corner sofa. then consider yes".
--
-- Now:
--   1. comm_kpi_items.corner_cost_amount — a brand's own item alone, RM a unit above 0; NULL = its cost.
--   2. What a unit takes OFF its bill's commissionable sales (comm_kpi_hits), once per sofa set as before:
--        a sofa with a CORNER — a piece of that model on the bill whose module is CNR (BOOQIT-CNR: the code after its
--        last '-', no spaces, before its brackets, as the costing reads a piece — catalogue_apply_sofa_charges) —
--        its corner cost when it has one;
--        else its cost when it has one;
--        an item with neither: what the set's special order charges for it (its dearest copy), nothing where it
--        charges nothing — as before.
--      A bill charging MORE than the cost no longer takes the more off: the rest earns its commission, as the user
--      said. What a unit PAYS is unchanged — the bonus, or its month's tier.
--   3. catalogue_save_kpi_items takes the corner cost as it takes the cost: on an add and on a change (a key left out
--      stays as stored, 0 = none any more), refused on the sub-department's own item, carried — with the brand, the
--      name, the tiers and the cost — when a change of an item in force before today closes yesterday's row and opens
--      today's.
--
-- No cost was set on production when this was written (2026-11-14: both of 2990s' items "As billed"), so no figure
-- moves until the user fills them in on Rules › KPI items (dry run on production, rolled back: September–November's
-- hits and Comm Cal's months identical before and after).
--
-- Two functions from PRODUCTION's bodies (2026-11-14, md5 of prosrc): comm_kpi_hits as 20261114040000 left it, four
-- statements swapped (the two readers of the items, the line's charge, the set's amount) and a CTE put in before the
-- line's charge; catalogue_save_kpi_items as 20261114040000 left it, written whole. Each is refused if production's
-- body has changed since. No signature changes, so every grant stays. Every reader of the hits follows by itself:
-- revenue_month_orders, the member facts, both order books, member_kpi_for_staff.
--
-- Rollback, in words: clear every corner cost (UPDATE comm_kpi_items SET corner_cost_amount = NULL), then re-apply
-- 20261114040000's two bodies (comm_kpi_hits bea109da…, catalogue_save_kpi_items a85779d3…) — the cost, or what the
-- bill charged when that is more, again. The column may stay: nothing else reads it.
--
-- PGlite: tests/member-sql/validate-brand-kpi-corner-cost.mjs (after 20261112200000, 20261114030000 and
-- 20261114040000, this migration verbatim, twice).

BEGIN;

CREATE TEMP TABLE brand_kpi_corner_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_kpi_corner_fns VALUES
  ('public.comm_kpi_hits(uuid, uuid[], date)',                    'bea109da50baac1a36105406b50f9fd5', 'b7710762d784f1e7707a137a7c43c92b'),
  ('public.catalogue_save_kpi_items(uuid, jsonb, jsonb, uuid[])', 'a85779d3bbc5083962183aa9433a6880', '4c676def8a63d5d41008619e2bdc0d41');

-- Each is production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_kpi_corner_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 1. The corner cost ───────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comm_kpi_items
  ADD COLUMN IF NOT EXISTS corner_cost_amount NUMERIC(15,2);

COMMENT ON COLUMN public.comm_kpi_items.corner_cost_amount IS
  'A brand''s own item alone (2026-11-14): RM a unit taken OFF the bill''s commissionable sales of a sofa with a corner — a piece of that model on the bill whose module is CNR — set on Rules › KPI items, whatever the bill''s special order says of it. NULL: its cost (cost_amount), as any sofa''s.';

COMMENT ON COLUMN public.comm_kpi_items.cost_amount IS
  'A brand''s own item alone (2026-11-13): RM a unit taken OFF its bill''s commissionable sales — the upgrade''s price, set on Rules › KPI items, whatever the bill''s special order says of it (2026-11-14, the user: "only follow the cost set in venture"; its price is sometimes written in the remark). A sofa with a corner takes corner_cost_amount when that is set. NULL: no cost — what the special order charges. kpi_amount (or its tier) is what the unit PAYS.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'kpi_item_corner_cost_in_range') THEN
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT kpi_item_corner_cost_in_range
      CHECK (corner_cost_amount IS NULL OR (corner_cost_amount > 0 AND corner_cost_amount <= 1000000));
  END IF;
  -- The sub-department's own item takes its ONE amount off the bill and pays it (the user, 2026-09-27).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'kpi_item_corner_cost_is_a_brands') THEN
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT kpi_item_corner_cost_is_a_brands CHECK (brand_id IS NOT NULL OR corner_cost_amount IS NULL);
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
  SELECT makes INTO STRICT v_makes FROM brand_kpi_corner_fns WHERE proc = p_proc;
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
    -- The items read: each with its corner cost too.
    $o$-- (20261114040000) A brand's own item's cost a unit; NULL = none.
               k.cost_amount
          FROM comm_kpi_items k$o$,
    $n$-- (20261114040000) A brand's own item's cost a unit; NULL = none.
               k.cost_amount,
               -- (20261114100000) And on a sofa with a corner; NULL = its cost.
               k.corner_cost_amount
          FROM comm_kpi_items k$n$,
    -- A line's special that is an item: its corner cost with it.
    $o$i.id AS item_id, i.option_pool, i.kpi_amount, i.cost_amount
          FROM specials sp$o$,
    $n$i.id AS item_id, i.option_pool, i.kpi_amount, i.cost_amount, i.corner_cost_amount
          FROM specials sp$n$,
    -- The sofas with a corner, and what a line's copy charges — the cost no longer weighed against it here.
    $o$), charged AS (
        -- (20261114030000) A brand's own special on a line — found where the line NAMES it, charged or not (the
        -- user, 2026-11-13: the price is sometimes written in the remark, the special's amount left empty) — at
        -- the item's COST a unit (20261114040000 — the user, the same evening: "i need a place at kpi item rules
        -- set there fill in cost, so that it can dedecut the cost out and change to kpi amount only"), or what that
        -- line's copy of the special order charges for it when that is more. An item with no cost: what the special
        -- order charges alone — nothing where it charges nothing, and then nothing comes off the bill.
        SELECT m.order_id, m.line_id, m.item_id, m.code_key, m.qty,
               GREATEST(COALESCE(MAX(mo.amount), 0), COALESCE(m.cost_amount, 0)) AS amount
          FROM matched m
          LEFT JOIN money mo
            ON mo.order_id = m.order_id AND mo.line_id = m.line_id AND mo.special_key = m.special_key
         WHERE m.brand_id IS NOT NULL
         GROUP BY m.order_id, m.line_id, m.item_id, m.code_key, m.qty, m.cost_amount$o$,
    $n$), corners AS (
        -- (20261114100000) The sofas of a bill of a brand on its own scheme that have a CORNER (the user, 2026-11-14:
        -- "yes need to be corner as well, if that is a compartment of corner sofa. then consider yes"): a piece of
        -- that model — its code before the first '-' — whose module is CNR: the code after its last '-', no spaces,
        -- before its brackets, as the costing reads a piece (catalogue_apply_sofa_charges).
        SELECT DISTINCT l.order_id, SPLIT_PART(l.code_key, '-', 1) AS model
          FROM lines l
         WHERE l.brand_id IS NOT NULL AND l.grp = 'SOFA' AND COALESCE(l.qty, 0) <> 0
           AND SPLIT_PART(l.code_key, '-', 1) <> ''
           AND REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(l.code_key, '^.*-', ''), '\s+', '', 'g'), '\(.*$', '') = 'CNR'
    ), charged AS (
        -- (20261114030000) A brand's own special on a line — found where the line NAMES it, charged or not (the
        -- user, 2026-11-13: the price is sometimes written in the remark, the special's amount left empty) — with
        -- what that line's copy of the special order charges for it: nothing where it charges nothing. What comes
        -- off the bill is the item's cost when it has one (20261114100000 — below, where the set is counted).
        SELECT m.order_id, m.line_id, m.item_id, m.code_key, m.qty, m.cost_amount, m.corner_cost_amount,
               COALESCE(MAX(mo.amount), 0) AS amount
          FROM matched m
          LEFT JOIN money mo
            ON mo.order_id = m.order_id AND mo.line_id = m.line_id AND mo.special_key = m.special_key
         WHERE m.brand_id IS NOT NULL
         GROUP BY m.order_id, m.line_id, m.item_id, m.code_key, m.qty, m.cost_amount, m.corner_cost_amount$n$,
    -- The set: only the cost — the corner cost on a sofa with a corner — else what the set's special order charges.
    $o$-- ── A brand's own item (20261112200000), a sofa special: once per sofa SET — the bill's pieces of one
        --    model that carry it (20261114030000: charged or not), as many sets as its fewest pieces, its sign the sofa's —
        --    and what comes off the bill is the item's cost a unit, or what the set's special order charges (on every
        --    piece: its dearest copy) when that is more (20261114040000). ──
        SELECT c.order_id, MIN(c.line_id::TEXT)::UUID, c.item_id,
               SIGN(SUM(c.qty)) * GREATEST(FLOOR(MIN(ABS(c.qty))), 1), MAX(c.amount)
          FROM charged c
         GROUP BY c.order_id, COALESCE(NULLIF(SPLIT_PART(c.code_key, '-', 1), ''), c.line_id::TEXT), c.item_id
        HAVING SIGN(SUM(c.qty)) <> 0$o$,
    $n$-- ── A brand's own item (20261112200000), a sofa special: once per sofa SET — the bill's pieces of one
        --    model that carry it (20261114030000: charged or not), as many sets as its fewest pieces, its sign the sofa's —
        --    and what comes off the bill is the item's cost a unit and ONLY its cost (20261114100000 — the user,
        --    2026-11-14: "only follow the cost set in venture"; 20261114040000 took what the set's special order
        --    charged when that was more): on a sofa with a corner its corner cost when it has one, else its cost. An
        --    item with neither: what the set's special order charges (on every piece: its dearest copy). ──
        SELECT c.order_id, MIN(c.line_id::TEXT)::UUID, c.item_id,
               SIGN(SUM(c.qty)) * GREATEST(FLOOR(MIN(ABS(c.qty))), 1),
               COALESCE(CASE WHEN MAX(cn.model) IS NOT NULL THEN MAX(c.corner_cost_amount) END,
                        MAX(c.cost_amount), MAX(c.amount))
          FROM charged c
          LEFT JOIN corners cn
            ON cn.order_id = c.order_id AND cn.model = SPLIT_PART(c.code_key, '-', 1)
         GROUP BY c.order_id, COALESCE(NULLIF(SPLIT_PART(c.code_key, '-', 1), ''), c.line_id::TEXT), c.item_id
        HAVING SIGN(SUM(c.qty)) <> 0$n$
]);

-- ── 3. The writer ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Production's body (md5 a85779d3…, 20261114040000's), whole: a brand's item's corner cost on an add and on a change
-- — a key left out stays as stored, 0 is none any more — refused on the sub-department's own, and kept through a change
-- as the brand, the name, the tiers and the cost are.
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
    v_corner  NUMERIC;
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

    -- A new amount — or, a brand's item, new tiers, a new cost or a new corner cost — from today, the same way. What a
    -- change does not name stays: the item's brand, its name, and whichever of the amount, the tiers, the cost and the
    -- corner cost was not sent.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_changes, '[]'::JSONB))
               AS c(id UUID, kpi_amount NUMERIC, unit_tiers JSONB, cost_amount NUMERIC, corner_cost_amount NUMERIC) LOOP
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
        -- (20261114100000) The corner cost, the same way.
        v_corner := CASE WHEN r.corner_cost_amount IS NULL THEN v_item.corner_cost_amount
                         ELSE NULLIF(ROUND(r.corner_cost_amount, 2), 0) END;
        IF v_item.brand_id IS NULL AND v_tiers <> '[]'::JSONB THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item pays by tier' USING ERRCODE = '22023';
        END IF;
        IF v_item.brand_id IS NULL AND (v_cost IS NOT NULL OR v_corner IS NOT NULL) THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item has a cost' USING ERRCODE = '22023';
        END IF;
        IF v_cost < 0 OR v_cost > 1000000 THEN
            RAISE EXCEPTION 'A cost is RM 0.01 to RM 1,000,000 a unit' USING ERRCODE = '22023';
        END IF;
        IF v_corner < 0 OR v_corner > 1000000 THEN
            RAISE EXCEPTION 'A corner cost is RM 0.01 to RM 1,000,000 a unit' USING ERRCODE = '22023';
        END IF;
        IF NOT comm_kpi_unit_tiers_valid(v_tiers) THEN
            RAISE EXCEPTION 'A tier is a whole number of units from 2 up, each above the one before, and what a unit pays'
                USING ERRCODE = '22023';
        END IF;
        CONTINUE WHEN v_item.kpi_amount = v_amount AND v_item.unit_tiers = v_tiers
                      AND v_item.cost_amount IS NOT DISTINCT FROM v_cost
                      AND v_item.corner_cost_amount IS NOT DISTINCT FROM v_corner;
        IF v_item.effective_from < v_today THEN
            UPDATE comm_kpi_items SET effective_to = v_today - 1 WHERE id = v_item.id;
            INSERT INTO comm_kpi_items (scheme_id, brand_id, source, product_code, product_name, erp_product_id,
                                        option_pool, option_value, kpi_amount, unit_tiers, cost_amount,
                                        corner_cost_amount, effective_from, effective_to, created_by)
            VALUES (p_scheme, v_item.brand_id, v_item.source, v_item.product_code, v_item.product_name,
                    v_item.erp_product_id, v_item.option_pool, v_item.option_value, v_amount, v_tiers, v_cost,
                    v_corner, v_today, v_item.effective_to, auth.uid());
        ELSE
            UPDATE comm_kpi_items SET kpi_amount = v_amount, unit_tiers = v_tiers, cost_amount = v_cost,
                                      corner_cost_amount = v_corner
             WHERE id = v_item.id;
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    -- New items, in force from today.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_adds, '[]'::JSONB))
               AS a(source TEXT, erp_product_id TEXT, option_pool TEXT, option_value TEXT, kpi_amount NUMERIC,
                    brand_id UUID, label TEXT, unit_tiers JSONB, cost_amount NUMERIC, corner_cost_amount NUMERIC) LOOP
        v_company := 1;
        v_label := NULL;
        v_tiers := COALESCE(r.unit_tiers, '[]'::JSONB);
        -- (20261114040000) A cost of 0, or none sent, is no cost; (20261114100000) a corner cost the same.
        v_cost := NULLIF(ROUND(r.cost_amount, 2), 0);
        v_corner := NULLIF(ROUND(r.corner_cost_amount, 2), 0);
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
        ELSIF v_cost IS NOT NULL OR v_corner IS NOT NULL THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item has a cost' USING ERRCODE = '22023';
        END IF;
        IF v_cost < 0 OR v_cost > 1000000 THEN
            RAISE EXCEPTION 'A cost is RM 0.01 to RM 1,000,000 a unit' USING ERRCODE = '22023';
        END IF;
        IF v_corner < 0 OR v_corner > 1000000 THEN
            RAISE EXCEPTION 'A corner cost is RM 0.01 to RM 1,000,000 a unit' USING ERRCODE = '22023';
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
                                        kpi_amount, unit_tiers, cost_amount, corner_cost_amount, effective_from, created_by)
            VALUES (p_scheme, r.brand_id, 'option', r.option_pool, v_value, v_label,
                    r.kpi_amount, v_tiers, v_cost, v_corner, v_today, auth.uid());
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
    FROM brand_kpi_corner_fns f
    JOIN pg_proc p ON p.oid = to_regprocedure(f.proc)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM f.makes;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the bodies this migration makes: %', v_bad;
  END IF;
END $$;

COMMIT;
