-- ============================================================================
-- 20261112200000_brand_kpi_items.sql
-- 2990s' own KPI items: a brand on its own commission scheme has KPI items of its own (2026-11-12).
-- ============================================================================
--
-- The user, 2026-11-11, of the brand that follows its own commission scheme (20261112003700): "另一个不同是它有 KPI
-- item：如果它的 SKU 选到 KPI item，就会有 extra amount。这个 KPI item 是独立的，属于 2990 专属的 KPI item（你当作 2990
-- 是一个独立 brand）… KPI item 那边我是可以手动去加的"; the list: "Upgrade fabric RM125/RM250(corner) Bonus RM50 —
-- Upgrade latex seat RM500/RM1000(corner) Bonus by tier (units): 1 - 4 per units RM50; 5-9 per units RM70; 10 above
-- per units RM100". Asked 2026-11-12, the user chose:
--   • found by the ERP's special on the sofa — Upgrade fabric = "Sofa Full Fabric", Upgrade latex seat = "Latex Seat"
--     (the ERP's 2990s orders carry no SKU line for an upgrade; a sofa is one unit, a corner too);
--   • the tier is WHOLE: six latex seats in a month are 6 × RM 70 = RM 420;
--   • "升级的钱只拿 bonus": what the bill charges for the upgrade earns the item's bonus and NO commission — a RM 3,240
--     bill (sofa 2,990 + fabric 250) at 4% is 2,990 × 4% + RM 50 = RM 169.60;
--   • paid whatever the sub-department's own KPI switch says (comm_schemes.enable_kpi is the sub-department's items').
--
-- What stood before. comm_kpi_items were the sub-department's alone, each with ONE amount that both comes off the bill
-- and is paid; comm_kpi_hits found them on every bill, a bill of a brand on its own scheme too (the run never did —
-- engine.ts gave such a bill no KPI items at all — so the two disagreed, unseen while Fair's KPI switch is off).
--
-- Now:
--   1. comm_kpi_items.brand_id — NULL the sub-department's item, as every row was; else the item of that brand of the
--      scheme: a SOFA SPECIAL of the brand's own ERP company, found only on that brand's bills. A bill of a brand on
--      its own scheme finds its brand's items and none of the sub-department's; every other bill the sub-department's
--      and none of a brand's.
--   2. comm_kpi_items.unit_tiers — a brand's item alone: [{min_qty, amount}], "from min_qty units in a month EVERY
--      unit pays amount". kpi_amount is what a unit pays below the first tier.
--   3. What a brand's item takes OFF its bill is what the bill charges for it — never the item's amount: the special's
--      money on the sofa's special order (the ERP's custom_specials on the delivered items, sales_orders.raw: the
--      set's surcharge is written on every piece, so once a sofa at its dearest copy). Found only where the bill
--      CHARGES for it: an upgrade given away earns no bonus. Counted once a sofa SET (the bill's pieces of one model
--      that carry it — as a fabric series is). sales_order_special_money reads the money, for comm_kpi_hits here and
--      for the run (the app reads it by RPC).
--   4. comm_kpi_hits says so (its unit_amount is what a unit takes off the bill, as it always was) and now reads the
--      sub-department's switch itself: the sub-department's own items only while it is on, a brand's whatever it says.
--      revenue_month_orders, which asked nothing while the switch was off, asks while a brand has an item.
--   5. catalogue_save_kpi_items writes a brand's item: its brand, its name, its tiers; the special is the brand's own
--      ERP company's (comm_brands.erp_company_id).
--   6. The Quote and the member's KPI card keep to the sub-department's own items (a brand on its own scheme has no
--      calculator; the app's KPI pages follow in their own change).
--   7. The user's two items, on every scheme whose brand 2990S follows its own scheme, from 1 November 2026.
--
-- Two functions are written whole from PRODUCTION's bodies (2026-11-12, md5 of prosrc) and four have one statement
-- swapped, each refused if production's body has changed since. No signature changes, so every grant stays.
--
-- Rollback, in words: re-apply the bodies 20261030010000 left (comm_kpi_hits, catalogue_save_kpi_items), put
-- revenue_month_orders' CASE back to the switch alone, and end the brand's items (effective_to) — a brand with no
-- item in force finds none.
--
-- PGlite: tests/member-sql/validate-brand-kpi-items.mjs (production's bodies, md5-checked; the migration verbatim,
-- twice).

BEGIN;

CREATE TEMP TABLE brand_kpi_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_kpi_fns VALUES
  ('public.comm_kpi_hits(uuid, uuid[], date)',                    '456161456dccbfd6842ad3a79b917c52', '2f12a0cd2714f2bd831c71d310fcb66b'),
  ('public.catalogue_save_kpi_items(uuid, jsonb, jsonb, uuid[])', '85becfc13d24352ac162e73f80af4320', '29ea3f043b11daa7fb1f335220675cf5'),
  ('public.revenue_month_orders(uuid, date)',                     '99c8386e4549d99c963b250c4538ce80', 'ca65252e526c2eda011eb476e3d84adb'),
  ('public.member_quote_context(uuid)',                           'a11b580df9e5ee3ca636c1675d74e7fc', 'ee888af6d3901a5a2a2c3422098679e8'),
  ('public.member_principal_quote_context(uuid)',                 '92a65b713ff10d22b2c6ff1b0685e841', 'bebedd81ecbac4d065d49921ff3408b6'),
  ('public.member_kpi_for_staff(uuid, uuid, date)',               'b5b431e78aaffd51cad678c68321166a', '2c34201f1ed847022e3bc6b306b574f1');

-- The brand's own scheme is 20261112003700's.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'comm_brands' AND column_name = 'own_scheme') THEN
    RAISE EXCEPTION 'comm_brands.own_scheme is not here: apply 20261112003700_brand_own_scheme first';
  END IF;
END $$;

-- Each is production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_kpi_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 1. A brand's own items, and their tiers ──────────────────────────────────────────────────────────────────────────

-- A brand's item is a brand's of the SAME scheme: the pair is the key the items point at.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_brands'::regclass AND conname = 'comm_brands_id_scheme_key') THEN
    ALTER TABLE public.comm_brands ADD CONSTRAINT comm_brands_id_scheme_key UNIQUE (id, scheme_id);
  END IF;
END $$;

-- [{min_qty, amount}]: whole numbers of units from 2 up, each tier above the one before; an amount is RM a unit.
CREATE OR REPLACE FUNCTION public.comm_kpi_unit_tiers_valid(p_tiers jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tier jsonb;
  v_last numeric := 1;
  v_min  numeric;
  v_pay  numeric;
BEGIN
  IF p_tiers IS NULL OR jsonb_typeof(p_tiers) <> 'array' THEN
    RETURN false;
  END IF;
  FOR v_tier IN SELECT t.tier FROM jsonb_array_elements(p_tiers) WITH ORDINALITY AS t(tier, at) ORDER BY t.at LOOP
    IF jsonb_typeof(v_tier) <> 'object'
       OR jsonb_typeof(v_tier->'min_qty') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_tier->'amount') IS DISTINCT FROM 'number'
       OR (SELECT count(*) FROM jsonb_object_keys(v_tier)) <> 2 THEN
      RETURN false;
    END IF;
    v_min := (v_tier->>'min_qty')::numeric;
    v_pay := (v_tier->>'amount')::numeric;
    IF v_min <> trunc(v_min) OR v_min <= v_last OR v_min > 100000 OR v_pay < 0 OR v_pay > 1000000 THEN
      RETURN false;
    END IF;
    v_last := v_min;
  END LOOP;
  RETURN true;
END
$fn$;

COMMENT ON FUNCTION public.comm_kpi_unit_tiers_valid(jsonb) IS
  'comm_kpi_items.unit_tiers is a list of {min_qty, amount}: from min_qty units in a month every unit pays amount (2026-11-12). Whole units from 2 up, each tier above the one before. The column''s CHECK.';

REVOKE ALL ON FUNCTION public.comm_kpi_unit_tiers_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comm_kpi_unit_tiers_valid(jsonb) TO authenticated, service_role;

ALTER TABLE public.comm_kpi_items
  ADD COLUMN IF NOT EXISTS brand_id UUID,
  ADD COLUMN IF NOT EXISTS unit_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.comm_kpi_items.brand_id IS
  'NULL: the sub-department''s own item. Else the item of that brand of the scheme, which follows its own commission scheme (2026-11-12 — 2990s): a sofa special of the brand''s own ERP company, found only on that brand''s bills and only where the bill charges for it; what the bill charged comes off its commissionable sales and kpi_amount (or its tier) is paid, whatever the sub-department''s KPI switch says.';
COMMENT ON COLUMN public.comm_kpi_items.unit_tiers IS
  'A brand''s item alone: [{min_qty, amount}] — from min_qty units in a month EVERY unit pays amount (the user, 2026-11-12: six at the 5-unit tier are 6 × RM 70). kpi_amount is what a unit pays below the first tier.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'comm_kpi_items_brand_fkey') THEN
    -- NO ACTION: a brand with items cannot be deleted on its own; a scheme deleted takes both in one statement.
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT comm_kpi_items_brand_fkey FOREIGN KEY (brand_id, scheme_id)
      REFERENCES public.comm_brands (id, scheme_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'kpi_item_unit_tiers_valid') THEN
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT kpi_item_unit_tiers_valid CHECK (public.comm_kpi_unit_tiers_valid(unit_tiers));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'kpi_item_tiers_are_a_brands') THEN
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT kpi_item_tiers_are_a_brands CHECK (brand_id IS NOT NULL OR unit_tiers = '[]'::jsonb);
  END IF;
  -- A brand's item is a sofa special: the one kind whose money the ERP's 2990s orders were read for (2026-11-12).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'kpi_item_brand_kinds') THEN
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT kpi_item_brand_kinds
      CHECK (brand_id IS NULL OR (source = 'option' AND option_pool IS NOT DISTINCT FROM 'sofa_specials'));
  END IF;

  -- One item a code — and one a special — at a time, FOR EACH OWNER: the sub-department's Latex Seat and a brand's are
  -- two items. (The same names: the app reads a refusal by them.)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'no_overlapping_kpi_item'
                    AND pg_get_constraintdef(oid) LIKE '%brand_id%') THEN
    ALTER TABLE public.comm_kpi_items DROP CONSTRAINT IF EXISTS no_overlapping_kpi_item;
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT no_overlapping_kpi_item
      EXCLUDE USING gist (scheme_id WITH =,
                          (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
                          (upper(btrim(product_code))) WITH =,
                          (daterange(effective_from, effective_to, '[]'::text)) WITH &&);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'no_overlapping_kpi_option'
                    AND pg_get_constraintdef(oid) LIKE '%brand_id%') THEN
    ALTER TABLE public.comm_kpi_items DROP CONSTRAINT IF EXISTS no_overlapping_kpi_option;
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT no_overlapping_kpi_option
      EXCLUDE USING gist (scheme_id WITH =,
                          (COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
                          option_pool WITH =,
                          (catalogue_value_key(option_value)) WITH =,
                          (daterange(effective_from, effective_to, '[]'::text)) WITH &&)
      WHERE (source = 'option'::text);
  END IF;
END $$;

-- ── 2. What a bill's special order charges for each special ──────────────────────────────────────────────────────────
-- The ERP delivers an order's items whole (sales_orders.raw → items): each carries its special order,
-- custom_specials [{description, surchargeSen}]. A sofa's is written on every piece of the set with the SET's
-- surcharge, so a reader takes a special once a sofa, at its dearest copy. Only a surcharge above 0 is listed: a
-- special given away charges nothing. The caller's own row policies decide which bills are read.
CREATE OR REPLACE FUNCTION public.sales_order_special_money(p_order_ids uuid[])
RETURNS TABLE(order_id uuid, line_id uuid, special_key text, amount numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
    SELECT o.id, l.id, x.special_key, MAX(x.sen) / 100
      FROM sales_orders o
      CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(o.raw->'items') = 'array' THEN o.raw->'items' ELSE '[]'::jsonb END) AS it(item)
      JOIN sales_order_lines l
        ON l.order_id = o.id
       AND l.line_no::numeric = CASE WHEN jsonb_typeof(it.item->'line_no') = 'number'
                                     THEN (it.item->>'line_no')::numeric END
      CROSS JOIN LATERAL (
            SELECT catalogue_value_key(s.special->>'description') AS special_key,
                   CASE WHEN jsonb_typeof(s.special->'surchargeSen') = 'number'
                        THEN (s.special->>'surchargeSen')::numeric END AS sen
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(it.item->'custom_specials') = 'array'
                          THEN it.item->'custom_specials' ELSE '[]'::jsonb END) AS s(special)
             WHERE jsonb_typeof(s.special) = 'object'
           ) x
     WHERE o.id = ANY (p_order_ids)
       AND it.item->'cancelled' IS DISTINCT FROM 'true'::jsonb
       AND x.special_key IS NOT NULL
       AND x.sen > 0
     GROUP BY o.id, l.id, x.special_key;
$fn$;

COMMENT ON FUNCTION public.sales_order_special_money(uuid[]) IS
  'What each line''s special order charges for each special (2026-11-12): the ERP''s custom_specials on the delivered items, by the special''s name (catalogue_value_key), a surcharge above 0 only, never a cancelled item''s. A sofa''s is on every piece with the set''s surcharge: take it once a sofa, at its dearest copy. Read by comm_kpi_hits and by the run for a brand''s own KPI items — what the bill charged comes off its commissionable sales.';

REVOKE ALL ON FUNCTION public.sales_order_special_money(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_order_special_money(uuid[]) TO authenticated, service_role;

-- ── 3. The items a bill carries ──────────────────────────────────────────────────────────────────────────────────────
-- Production's body (md5 45616145…), whole: every item is its owner's bills' alone, the sub-department's own count
-- only while its switch is on, and a brand's own item is found where the bill charges for it, at what it charged.
CREATE OR REPLACE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
 RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH items AS (
        SELECT k.id, k.source, UPPER(BTRIM(k.product_code)) AS code_key,
               k.option_pool, catalogue_value_key(k.option_value) AS value_key, k.kpi_amount, k.brand_id
          FROM comm_kpi_items k
         WHERE k.scheme_id = p_scheme
           AND k.effective_from <= p_asat
           AND (k.effective_to IS NULL OR k.effective_to >= p_asat)
           -- (20261112200000) The sub-department's own items count only while its KPI switch is on, as the run
           -- reads them; a brand's own are paid whatever the switch says.
           AND (k.brand_id IS NOT NULL
                OR COALESCE((SELECT s.enable_kpi FROM comm_schemes s WHERE s.id = p_scheme), FALSE))
    ), bills_of AS (
        -- Whose items a bill finds (20261112200000). A bill of a brand on its own commission scheme
        -- (comm_brands.own_scheme — 2990s) finds that brand's own items and none of the sub-department's; every
        -- other bill the sub-department's and none of a brand's.
        SELECT o.id AS order_id,
               (SELECT ob.id FROM comm_brands ob
                 WHERE ob.scheme_id = p_scheme AND ob.own_scheme AND ob.is_active
                   AND UPPER(BTRIM(ob.code)) = UPPER(BTRIM(o.brand_code))
                 ORDER BY ob.id LIMIT 1) AS brand_id
          FROM sales_orders o
         WHERE o.id = ANY (p_order_ids)
    ), lines AS (
        SELECT l.id, l.order_id, bo.brand_id, UPPER(BTRIM(l.item_group)) AS grp,
               UPPER(BTRIM(l.product_code)) AS code_key, l.description2, l.raw, l.qty, l.line_amount
          FROM sales_order_lines l
          LEFT JOIN bills_of bo ON bo.order_id = l.order_id
         WHERE l.order_id = ANY (p_order_ids)
    ), facts AS (
        -- A bed frame's or a sofa's specials and fabric, read once — only
        -- while the scheme has a special or a fabric series to look for.
        SELECT l.order_id, l.id AS line_id, l.brand_id, l.grp, l.code_key, l.qty, f.specials, f.fabric
          FROM lines l
          CROSS JOIN LATERAL catalogue_line_facts(l.description2, l.raw) f
         WHERE l.grp IN ('BEDFRAME', 'SOFA')
           AND EXISTS (SELECT 1 FROM items i WHERE i.source = 'option')
    ), specials AS (
        SELECT fa.order_id, fa.line_id, fa.brand_id, fa.grp, fa.code_key, fa.qty, s.special
          FROM facts fa
          CROSS JOIN LATERAL UNNEST(fa.specials) AS s(special)
    ), matched AS (
        -- A line's special that is an item of the bill's owner.
        -- Exact spelling first; without a trailing "(…)" only when no item
        -- of that owner has the exact one (OptionPrices.get / catalogue_option_price).
        SELECT sp.order_id, sp.line_id, sp.brand_id, sp.code_key, sp.qty,
               catalogue_value_key(sp.special) AS special_key,
               i.id AS item_id, i.option_pool, i.kpi_amount
          FROM specials sp
          JOIN items i
            ON i.source = 'option'
           AND i.brand_id IS NOT DISTINCT FROM sp.brand_id
           AND sp.grp = CASE i.option_pool WHEN 'bedframe_specials' THEN 'BEDFRAME'
                                           WHEN 'sofa_specials' THEN 'SOFA' END
           AND (i.value_key = catalogue_value_key(sp.special)
                OR (i.value_key = catalogue_value_key(REGEXP_REPLACE(sp.special, '\s*\(.*\)\s*$', ''))
                    AND NOT EXISTS (SELECT 1 FROM items x
                                     WHERE x.source = 'option' AND x.option_pool = i.option_pool
                                       AND x.brand_id IS NOT DISTINCT FROM i.brand_id
                                       AND x.value_key = catalogue_value_key(sp.special))))
    ), option_lines AS (
        -- The sub-department's own: one hit per (line, item), however many times the line prints it.
        SELECT DISTINCT m.order_id, m.line_id, m.item_id, m.option_pool, m.qty, m.kpi_amount
          FROM matched m
         WHERE m.brand_id IS NULL
    ), series AS (
        -- A line's fabric series (2026-10-29): its fabric on the fabric list
        -- of the ERP's one company — only while the scheme has a fabric
        -- series to look for, and never a bill of a brand on its own scheme
        -- (its fabrics are another company's). A code listed twice: the live
        -- row, then the active one, then the latest delivery's.
        SELECT DISTINCT ON (fa.line_id)
               fa.order_id, fa.line_id, fa.grp, fa.code_key, fa.qty,
               catalogue_value_key(e.series) AS series_key
          FROM facts fa
          JOIN erp_fabrics e
            ON e.erp_company_id = 1
           AND UPPER(BTRIM(e.fabric_code)) = UPPER(BTRIM(fa.fabric))
         WHERE NULLIF(BTRIM(COALESCE(e.series, '')), '') IS NOT NULL
           AND fa.brand_id IS NULL
           AND EXISTS (SELECT 1 FROM items i WHERE i.option_pool IN ('bedframe_fabric_series', 'sofa_fabric_series'))
         ORDER BY fa.line_id, (e.removed_at IS NULL) DESC, e.active DESC, e.synced_at DESC
    ), fabric_lines AS (
        SELECT se.order_id, se.line_id, se.code_key, se.qty, i.id AS item_id, i.option_pool, i.kpi_amount
          FROM series se
          JOIN items i
            ON i.source = 'option'
           AND i.brand_id IS NULL
           AND se.grp = CASE i.option_pool WHEN 'bedframe_fabric_series' THEN 'BEDFRAME'
                                           WHEN 'sofa_fabric_series' THEN 'SOFA' END
           AND i.value_key = se.series_key
    ), money AS (
        -- (20261112200000) What the special order of a bill of a brand on its own scheme charges for each special:
        -- the upgrade's money, which earns its item's bonus and no commission ("升级的钱只拿 bonus").
        SELECT m.order_id, m.line_id, m.special_key, m.amount
          FROM sales_order_special_money(ARRAY(SELECT bo.order_id FROM bills_of bo WHERE bo.brand_id IS NOT NULL)) m
    ), charged AS (
        -- A brand's own special on a line, at what that line's copy of the special order charges for it — only
        -- where it charges.
        SELECT m.order_id, m.line_id, m.item_id, m.code_key, m.qty, MAX(mo.amount) AS amount
          FROM matched m
          JOIN money mo
            ON mo.order_id = m.order_id AND mo.line_id = m.line_id AND mo.special_key = m.special_key
         WHERE m.brand_id IS NOT NULL
         GROUP BY m.order_id, m.line_id, m.item_id, m.code_key, m.qty
    ), found AS (
        -- ── The sub-department's own items: what comes off the bill is the item's amount. ──
        SELECT l.order_id, l.id AS line_id, i.id AS item_id, l.qty, i.kpi_amount
          FROM lines l
          JOIN items i ON i.source = 'sku' AND i.code_key = l.code_key AND i.brand_id IS NULL
         WHERE l.brand_id IS NULL
        UNION ALL
        -- A bed frame special: once per bed frame.
        SELECT o.order_id, o.line_id, o.item_id, o.qty, o.kpi_amount
          FROM option_lines o
         WHERE o.option_pool = 'bedframe_specials'
        UNION ALL
        -- A sofa special: once per bill, its sign the sofa's.
        SELECT o.order_id, MIN(o.line_id::TEXT)::UUID, o.item_id, SIGN(SUM(o.qty)), o.kpi_amount
          FROM option_lines o
         WHERE o.option_pool = 'sofa_specials'
         GROUP BY o.order_id, o.item_id, o.kpi_amount
        HAVING SIGN(SUM(o.qty)) <> 0
        UNION ALL
        -- A bed frame's fabric series: once per bed frame.
        SELECT fl.order_id, fl.line_id, fl.item_id, fl.qty, fl.kpi_amount
          FROM fabric_lines fl
         WHERE fl.option_pool = 'bedframe_fabric_series'
        UNION ALL
        -- A sofa's fabric series: once per sofa SET — the bill's pieces of one
        -- model in that series, as many sets as its fewest pieces, its sign
        -- the sofa's.
        SELECT fl.order_id, MIN(fl.line_id::TEXT)::UUID, fl.item_id,
               SIGN(SUM(fl.qty)) * GREATEST(FLOOR(MIN(ABS(fl.qty))), 1), fl.kpi_amount
          FROM fabric_lines fl
         WHERE fl.option_pool = 'sofa_fabric_series'
         GROUP BY fl.order_id, COALESCE(NULLIF(SPLIT_PART(fl.code_key, '-', 1), ''), fl.line_id::TEXT),
                  fl.item_id, fl.kpi_amount
        HAVING SIGN(SUM(fl.qty)) <> 0
        UNION ALL
        -- ── A brand's own item (20261112200000), a sofa special: once per sofa SET — the bill's pieces of one
        --    model that carry it and are charged for it, as many sets as its fewest pieces, its sign the sofa's —
        --    and what comes off the bill is what the set's special order charges (on every piece: its dearest
        --    copy). ──
        SELECT c.order_id, MIN(c.line_id::TEXT)::UUID, c.item_id,
               SIGN(SUM(c.qty)) * GREATEST(FLOOR(MIN(ABS(c.qty))), 1), MAX(c.amount)
          FROM charged c
         GROUP BY c.order_id, COALESCE(NULLIF(SPLIT_PART(c.code_key, '-', 1), ''), c.line_id::TEXT), c.item_id
        HAVING SIGN(SUM(c.qty)) <> 0
    ), goods AS (
        -- Each bill's commissionable sales: its lines in a commissionable group.
        SELECT l.order_id, COALESCE(SUM(l.line_amount) FILTER (WHERE g.commissionable), 0) AS goods
          FROM lines l
          LEFT JOIN comm_item_groups g
                 ON g.scheme_id = p_scheme AND UPPER(BTRIM(g.item_group)) = l.grp
         GROUP BY l.order_id
    ), bills AS (
        SELECT f.order_id, SUM(f.qty * f.kpi_amount) AS kpi
          FROM found f
         GROUP BY f.order_id
    )
    SELECT f.order_id, f.line_id, f.item_id, f.qty, f.kpi_amount
      FROM found f
      JOIN bills b ON b.order_id = f.order_id
      JOIN goods g ON g.order_id = f.order_id
     -- Covered: taking the items off leaves the sales on the same side of 0.
     WHERE CASE WHEN g.goods >= 0 THEN g.goods - b.kpi >= 0 ELSE g.goods - b.kpi <= 0 END;
$function$;

-- ── 4. The writer ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Production's body (md5 85becfc1…), whole: an item keeps its brand and its tiers through a change; a new item may be
-- a brand's — its brand, its name, its tiers; its special from the brand's own ERP company's pool.
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

    -- A new amount — or, a brand's item, new tiers — from today, the same way. What a change does not name stays:
    -- the item's brand, its name, and whichever of the amount and the tiers was not sent.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_changes, '[]'::JSONB))
               AS c(id UUID, kpi_amount NUMERIC, unit_tiers JSONB) LOOP
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
        IF v_item.brand_id IS NULL AND v_tiers <> '[]'::JSONB THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item pays by tier' USING ERRCODE = '22023';
        END IF;
        IF NOT comm_kpi_unit_tiers_valid(v_tiers) THEN
            RAISE EXCEPTION 'A tier is a whole number of units from 2 up, each above the one before, and what a unit pays'
                USING ERRCODE = '22023';
        END IF;
        CONTINUE WHEN v_item.kpi_amount = v_amount AND v_item.unit_tiers = v_tiers;
        IF v_item.effective_from < v_today THEN
            UPDATE comm_kpi_items SET effective_to = v_today - 1 WHERE id = v_item.id;
            INSERT INTO comm_kpi_items (scheme_id, brand_id, source, product_code, product_name, erp_product_id,
                                        option_pool, option_value, kpi_amount, unit_tiers,
                                        effective_from, effective_to, created_by)
            VALUES (p_scheme, v_item.brand_id, v_item.source, v_item.product_code, v_item.product_name,
                    v_item.erp_product_id, v_item.option_pool, v_item.option_value, v_amount, v_tiers,
                    v_today, v_item.effective_to, auth.uid());
        ELSE
            UPDATE comm_kpi_items SET kpi_amount = v_amount, unit_tiers = v_tiers WHERE id = v_item.id;
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    -- New items, in force from today.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_adds, '[]'::JSONB))
               AS a(source TEXT, erp_product_id TEXT, option_pool TEXT, option_value TEXT, kpi_amount NUMERIC,
                    brand_id UUID, label TEXT, unit_tiers JSONB) LOOP
        v_company := 1;
        v_label := NULL;
        v_tiers := COALESCE(r.unit_tiers, '[]'::JSONB);
        IF r.brand_id IS NOT NULL THEN
            -- A brand's own item (20261112200000): of a brand of this scheme that follows its own commission scheme,
            -- a sofa special of its own ERP company. Only such an item has a name of its own, or pays by tier.
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
                                        kpi_amount, unit_tiers, effective_from, created_by)
            VALUES (p_scheme, r.brand_id, 'option', r.option_pool, v_value, v_label,
                    r.kpi_amount, v_tiers, v_today, auth.uid());
        ELSE
            RAISE EXCEPTION 'A KPI item is a SKU, a special or a fabric series, not %', COALESCE(r.source, 'nothing')
                USING ERRCODE = '22023';
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    RETURN v_touched;
END;
$function$;

-- ── 5. One statement swapped in four ─────────────────────────────────────────────────────────────────────────────────
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

-- A function made again from the body the database holds, its statements swapped in pairs (old, new) — unless it is
-- this migration's own body already.
CREATE OR REPLACE FUNCTION pg_temp.remake(p_proc text, p_swaps text[])
RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_oid   regprocedure := to_regprocedure(p_proc);
  v_makes text;
  v_def   text;
  i       integer;
BEGIN
  SELECT makes INTO STRICT v_makes FROM brand_kpi_fns WHERE proc = p_proc;
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

-- Comm Cal's month: it asked the items of nothing while the sub-department's KPI was off. A brand's own are paid
-- whatever that switch says (comm_kpi_hits now reads the switch for the sub-department's own), so the month asks
-- while a brand has an item too — what the upgrade's money takes off a bill's sales is on the month's list as it is
-- in the run.
SELECT pg_temp.remake('public.revenue_month_orders(uuid, date)', ARRAY[
    $o$CASE WHEN sc.enable_kpi
                   THEN ARRAY(SELECT o.id FROM sales_orders o JOIN batch ON batch.id = o.batch_id)$o$,
    $n$-- (20261112200000) … or a brand on its own scheme has KPI items: those are paid whatever the switch says.
              CASE WHEN sc.enable_kpi
                        OR EXISTS (SELECT 1 FROM comm_kpi_items bk WHERE bk.scheme_id = sc.id AND bk.brand_id IS NOT NULL)
                   THEN ARRAY(SELECT o.id FROM sales_orders o JOIN batch ON batch.id = o.batch_id)$n$
]);

-- A brand on its own scheme has no calculator: the Quote prices the sub-department's own items.
SELECT pg_temp.remake('public.member_quote_context(uuid)', ARRAY[
    $o$FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme$o$,
    $n$FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme AND k.brand_id IS NULL$n$
]);
SELECT pg_temp.remake('public.member_principal_quote_context(uuid)', ARRAY[
    $o$FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme$o$,
    $n$FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme AND k.brand_id IS NULL$n$
]);
-- The member's KPI card counts the sub-department's own items against the sub-department's own threshold.
SELECT pg_temp.remake('public.member_kpi_for_staff(uuid, uuid, date)', ARRAY[
    $o$FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme$o$,
    $n$FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme AND k.brand_id IS NULL$n$
]);

-- ── 6. The user's two items ──────────────────────────────────────────────────────────────────────────────────────────
-- On every scheme whose brand 2990S follows its own scheme, from the month being worked (November 2026). Once: an item
-- of that special the brand already has — in force or ended — is left as it is.
INSERT INTO public.comm_kpi_items (scheme_id, brand_id, source, option_pool, option_value, product_name,
                                   kpi_amount, unit_tiers, effective_from)
SELECT b.scheme_id, b.id, 'option', 'sofa_specials', v.special, v.label, v.amount, v.tiers, DATE '2026-11-01'
  FROM public.comm_brands b
  CROSS JOIN (VALUES
    ('Sofa Full Fabric', 'Upgrade fabric',     50::numeric, '[]'::jsonb),
    ('Latex Seat',       'Upgrade latex seat', 50::numeric, '[{"min_qty": 5, "amount": 70}, {"min_qty": 10, "amount": 100}]'::jsonb)
  ) AS v(special, label, amount, tiers)
 WHERE b.own_scheme AND UPPER(BTRIM(b.code)) = '2990S'
   AND NOT EXISTS (SELECT 1 FROM public.comm_kpi_items k
                    WHERE k.brand_id = b.id AND k.source = 'option' AND k.option_pool = 'sofa_specials'
                      AND catalogue_value_key(k.option_value) = catalogue_value_key(v.special));

-- ── 7. What stands now is what was tested ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
  v_bad text := '';
BEGIN
  FOR v_fn IN SELECT * FROM brand_kpi_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS DISTINCT FROM v_fn.makes THEN
      v_bad := v_bad || format(' %s ended as md5 %s;', v_fn.proc, v_md5);
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'Not the bodies this migration makes:%', v_bad;
  END IF;
END $$;

COMMIT;
