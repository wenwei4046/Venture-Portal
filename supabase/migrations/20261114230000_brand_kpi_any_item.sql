-- ============================================================================
-- 20261114230000_brand_kpi_any_item.sql
-- 2990s' own KPI items are picked as the sub-department's are — a SKU, a model, a compartment, a special, a fabric
-- series of its own ERP company — and carry only a bonus and its tiers (2026-11-14).
-- ============================================================================
--
-- 20261112200000 gave a brand on its own commission scheme KPI items of its own (2990s' Upgrade fabric and Upgrade
-- latex seat), and only a SOFA SPECIAL could be one (kpi_item_brand_kinds). 20261114040000 and 20261114100000 gave
-- such an item a cost and a corner cost to take off the bill. The user, the same evening, of 2990s' block on Rules ›
-- KPI items: "我只需要像 Fair 一样选 KPI 就好，不需要去选它的 cost … 因为它其实是连接跟 2990s 的 POS system 的"; "HR 那
-- 边只需要 set 哪一个 item 是有 KPI，然后它有没有 tiering 加上去"; and of where an item comes from: "那个选择可以是 from
-- SKU master、Bedroom special、Sofa special 等等 … 它也可以是 like by compartment：比如这个 compartment 属于 KPI item，
-- 只要有哪一个 model 选到 corner compartment，它就属于 KPI item … by model、by special 或者是 by compartment". The POS
-- prices every bill (its own SKU master is the selling price; the Houzs ERP's is the cost — "它们是两个独立的个体，不要搞
-- 乱"), so what an item takes off a bill is what the bill charged for it. Asked, the user chose: the item's money comes
-- off the commissionable sales and its bonus is paid ("扣掉再发 bonus"); a compartment counts once a sofa set ("每组
-- 沙发算 1 个").
--
-- Now a brand's own item is any of, each of the brand's own ERP company (2990s: 2):
--   a SKU            — its code on a line; per unit; off: what its line charges.
--   a model          — the SKU master's base model of a line's SKU (a sofa's: its code before the first '-'); a sofa's
--                      once per sofa SET, any other's per unit; off: what its lines charge.
--   a compartment    — a sofa piece's module (its code after its last '-', no spaces, before its brackets: BOOQIT-CNR
--                      → CNR, as the costing reads a piece); once per sofa SET that has one, however many; off: what
--                      those pieces charge.
--   a special        — a sofa's once per sofa SET, a bed frame's per bed frame, found where a line names it; off: what
--                      the line's special order charges for it (a sofa's dearest copy), nothing where it charges nothing.
--   a fabric series  — the series of the line's fabric on its company's fabric list, else the fabric code's family
--                      (its code before the first '-': 2990s' D-004, EZ-007 have no series on the list); a sofa's once
--                      per sofa SET, a bed frame's per bed frame; off: nothing — no bill charges for a series apart.
-- A piece is ONE whole item: a SKU item before a model item before a compartment item (the more particular wins, as
-- the POS's product rule beats its category rule). Specials and fabric series stack on it, each found and paid — but
-- a special on a sofa or a bed frame that comes off whole takes nothing more off: its charge is in that money already
-- (the POS caps a unit at its total). A line of a group that earns no commission (a delivery) takes nothing off the
-- commissionable sales. What a unit PAYS is unchanged: its bonus, or its month's tier. The item's cost and corner cost are no longer read or written
-- (cost_amount, corner_cost_amount stay, all NULL on production: the application deployed before this one still
-- selects them; a later migration may drop them).
--
--   1. The table: kpi_item_brand_kinds goes; kpi_item_identity takes two more pools, 'models' and 'compartments', a
--      brand's alone (kpi_item_pool_is_a_brands).
--   2. comm_kpi_hits: a brand's bills find every kind above.
--   3. catalogue_save_kpi_items: a brand's add of any kind, from its own company, its cost and corner cost left alone.
--   4. member_kpi_for_staff: a brand's item's code in the Revenue app names its SKU, or its model, compartment,
--      special or series with its kind (a sofa special's code as it was) — a brand SKU had none, and the app drops an
--      item with no code.
--
-- On production when this was written only 2990s' two sofa specials are a brand's, with no cost: what they take off is
-- what the bill charged, before and after (dry run on production, rolled back: September–November's hits and Comm
-- Cal's months identical).
--
-- Three functions from PRODUCTION's bodies (2026-11-14, md5 of prosrc): comm_kpi_hits and catalogue_save_kpi_items as
-- 20261114100000 left them, each written whole; member_kpi_for_staff as 20261114020000 left it, one statement swapped.
-- Each is refused if production's body has changed since. No signature changes, so every grant stays.
--
-- Rollback, in words: end every brand item that is not a sofa special (effective_to), drop kpi_item_pool_is_a_brands,
-- put kpi_item_identity's four pools and kpi_item_brand_kinds back, and re-apply 20261114100000's two bodies
-- (comm_kpi_hits b7710762…, catalogue_save_kpi_items 4c676def…) and 20261114020000's member_kpi_for_staff (a20392fb…).
--
-- PGlite: tests/member-sql/validate-brand-kpi-any-item.mjs (the chain to production's bodies, md5-checked; this
-- migration verbatim, twice).

BEGIN;

SET LOCAL lock_timeout = '8s';

CREATE TEMP TABLE brand_kpi_any_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO brand_kpi_any_fns VALUES
  ('public.comm_kpi_hits(uuid, uuid[], date)',                    'b7710762d784f1e7707a137a7c43c92b', '13619cdb8dde3e75fc2ffe7ad0900b95'),
  ('public.catalogue_save_kpi_items(uuid, jsonb, jsonb, uuid[])', '4c676def8a63d5d41008619e2bdc0d41', '60457794cf68a6245c5f1063f08bb1c8'),
  ('public.member_kpi_for_staff(uuid, uuid, date)',               'a20392fb1acc51891dee50e72d01de07', '9cfa4355677da71c7ca86d21ef3e83cb');

-- Each is production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM brand_kpi_any_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

-- ── 1. The table ─────────────────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comm_kpi_items DROP CONSTRAINT IF EXISTS kpi_item_brand_kinds;

-- A model or a compartment: two more pools, an option item's value its model's or its compartment's name.
ALTER TABLE public.comm_kpi_items DROP CONSTRAINT IF EXISTS kpi_item_identity;
ALTER TABLE public.comm_kpi_items
  ADD CONSTRAINT kpi_item_identity CHECK (
    (source = 'sku' AND product_code IS NOT NULL AND btrim(product_code) <> '' AND option_pool IS NULL AND option_value IS NULL)
    OR (source = 'option' AND product_code IS NULL AND erp_product_id IS NULL
        AND option_pool = ANY (ARRAY['bedframe_specials', 'sofa_specials', 'bedframe_fabric_series', 'sofa_fabric_series',
                                     'models', 'compartments'])
        AND option_value IS NOT NULL AND btrim(option_value) <> ''));

DO $$
BEGIN
  -- Only a brand's own item is a model or a compartment (the sub-department's own are found by the run as before).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.comm_kpi_items'::regclass AND conname = 'kpi_item_pool_is_a_brands') THEN
    ALTER TABLE public.comm_kpi_items
      ADD CONSTRAINT kpi_item_pool_is_a_brands
      CHECK (brand_id IS NOT NULL OR option_pool IS NULL OR option_pool NOT IN ('models', 'compartments'));
  END IF;
END $$;

COMMENT ON COLUMN public.comm_kpi_items.brand_id IS
  'NULL: the sub-department''s own item. Else the item of that brand of the scheme, which follows its own commission scheme (2026-11-12 — 2990s): since 2026-11-14 a SKU, a model, a compartment, a bed frame''s or a sofa''s special, or a bed frame''s or a sofa''s fabric series of the brand''s own ERP company, found only on that brand''s bills and counted as its kind is; what the bill charged for it comes off the bill''s commissionable sales (nothing for a fabric series) and kpi_amount (or its tier) is paid, whatever the sub-department''s KPI switch says.';

COMMENT ON COLUMN public.comm_kpi_items.cost_amount IS
  'No longer read or written (2026-11-14, 20261114230000: a brand''s own item takes off what the bill charged for it — the user: "不需要去选它的 cost"). Was, from 20261114040000: RM a unit taken off the bill. NULL everywhere.';

COMMENT ON COLUMN public.comm_kpi_items.corner_cost_amount IS
  'No longer read or written (2026-11-14, 20261114230000). Was, from 20261114100000: RM a unit taken off the bill of a sofa with a corner. NULL everywhere.';

-- ── 2. The items a bill carries ──────────────────────────────────────────────────────────────────────────────────────
-- Production's body (md5 b7710762…, 20261114100000's), whole: the sub-department's own as before, and a brand's own of
-- every kind found on its bills, each taking off what the bill charged for it.
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
        -- other bill the sub-department's and none of a brand's. (20261114230000) And such a brand's ERP company
        -- (2990s: 2), whose SKU master and fabric list its bills are read on.
        SELECT o.id AS order_id, ob.id AS brand_id, COALESCE(ob.erp_company_id, 1) AS company_id
          FROM sales_orders o
          LEFT JOIN LATERAL (
                SELECT b.id, b.erp_company_id FROM comm_brands b
                 WHERE b.scheme_id = p_scheme AND b.own_scheme AND b.is_active
                   AND UPPER(BTRIM(b.code)) = UPPER(BTRIM(o.brand_code))
                 ORDER BY b.id LIMIT 1) ob ON TRUE
         WHERE o.id = ANY (p_order_ids)
    ), lines AS (
        SELECT l.id, l.order_id, bo.brand_id, COALESCE(bo.company_id, 1) AS company_id, UPPER(BTRIM(l.item_group)) AS grp,
               UPPER(BTRIM(l.product_code)) AS code_key, l.description2, l.raw, l.qty, l.line_amount
          FROM sales_order_lines l
          LEFT JOIN bills_of bo ON bo.order_id = l.order_id
         WHERE l.order_id = ANY (p_order_ids)
    ), facts AS (
        -- A bed frame's or a sofa's specials and fabric, read once — only
        -- while the scheme has a special or a fabric series to look for.
        SELECT l.order_id, l.id AS line_id, l.brand_id, l.company_id, l.grp, l.code_key, l.qty, f.specials, f.fabric
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
        -- (its fabrics are another company's — brand_series below). A code listed twice: the
        -- live row, then the active one, then the latest delivery's.
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
        -- (20261114030000) A brand's own special on a line — found where the line NAMES it, charged or not (the
        -- user, 2026-11-13: the price is sometimes written in the remark, the special's amount left empty) — with
        -- what that line's copy of the special order charges for it: nothing where it charges nothing.
        -- (20261114230000) A sofa's or a bed frame's: its pool with it, and the sofa a piece belongs to.
        SELECT m.order_id, m.line_id, m.item_id, m.option_pool, m.code_key, m.qty,
               COALESCE(NULLIF(SPLIT_PART(m.code_key, '-', 1), ''), m.line_id::TEXT) AS sofa,
               COALESCE(MAX(mo.amount), 0) AS amount
          FROM matched m
          LEFT JOIN money mo
            ON mo.order_id = m.order_id AND mo.line_id = m.line_id AND mo.special_key = m.special_key
         WHERE m.brand_id IS NOT NULL
         GROUP BY m.order_id, m.line_id, m.item_id, m.option_pool, m.code_key, m.qty
    ), brand_lines AS (
        -- (20261114230000) Every line of a bill of a brand on its own scheme, as its own items find one: what it
        -- charged — of its commissionable sales: a line of a group that earns nothing (a delivery) takes nothing off
        -- them —, the sofa it belongs to (its code before the first '-' — the set its pieces are counted in), a sofa
        -- piece's compartment (its code after its last '-', no spaces, before its brackets, as the costing reads a
        -- piece: BOOQIT-CNR → CNR) and — only while the brand has a model to look for — its SKU's base model on the
        -- brand's own SKU master.
        SELECT l.order_id, l.id AS line_id, l.brand_id, l.grp, l.code_key, l.qty,
               CASE WHEN COALESCE(g.commissionable, FALSE) THEN COALESCE(l.line_amount, 0) ELSE 0 END AS amount,
               COALESCE(NULLIF(SPLIT_PART(l.code_key, '-', 1), ''), l.id::TEXT) AS sofa,
               CASE WHEN l.grp = 'SOFA'
                    THEN REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(l.code_key, '^.*-', ''), '\s+', '', 'g'), '\(.*$', '')
               END AS compartment,
               CASE WHEN EXISTS (SELECT 1 FROM items i WHERE i.brand_id = l.brand_id AND i.option_pool = 'models')
                    THEN (SELECT BTRIM(p.base_model) FROM erp_products p
                           WHERE p.erp_company_id = l.company_id AND UPPER(BTRIM(p.item_code)) = l.code_key
                             AND NULLIF(BTRIM(COALESCE(p.base_model, '')), '') IS NOT NULL
                           ORDER BY (p.removed_at IS NULL) DESC, p.erp_id
                           LIMIT 1)
               END AS model
          FROM lines l
          LEFT JOIN comm_item_groups g
                 ON g.scheme_id = p_scheme AND UPPER(BTRIM(g.item_group)) = l.grp
         WHERE l.brand_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM items i WHERE i.brand_id = l.brand_id)
    ), brand_skus AS (
        -- A piece is one whole item: its SKU's item first …
        SELECT bl.*, i.id AS item_id
          FROM brand_lines bl
          JOIN items i ON i.brand_id = bl.brand_id AND i.source = 'sku' AND i.code_key = bl.code_key
    ), brand_models AS (
        -- … else its model's …
        SELECT bl.*, i.id AS item_id
          FROM brand_lines bl
          JOIN items i ON i.brand_id = bl.brand_id AND i.option_pool = 'models'
                      AND i.value_key = catalogue_value_key(bl.model)
         WHERE NOT EXISTS (SELECT 1 FROM brand_skus s WHERE s.line_id = bl.line_id)
    ), brand_compartments AS (
        -- … else its compartment's.
        SELECT bl.*, i.id AS item_id
          FROM brand_lines bl
          JOIN items i ON i.brand_id = bl.brand_id AND i.option_pool = 'compartments'
                      AND i.value_key = catalogue_value_key(bl.compartment)
         WHERE NOT EXISTS (SELECT 1 FROM brand_skus s WHERE s.line_id = bl.line_id)
           AND NOT EXISTS (SELECT 1 FROM brand_models m WHERE m.line_id = bl.line_id)
    ), brand_whole AS (
        -- The pieces whose whole money comes off as a SKU, a model or a compartment: a special on one takes nothing
        -- more off — its charge is in the piece's money already (the POS: a whole-item rule takes the unit's total).
        SELECT s.order_id, s.line_id, s.sofa FROM brand_skus s
        UNION
        SELECT m.order_id, m.line_id, m.sofa FROM brand_models m
        UNION
        SELECT c.order_id, c.line_id, c.sofa FROM brand_compartments c
    ), brand_sofas AS (
        -- The sofa sets of a brand's bill: a sofa's pieces, as many sets as its fewest pieces, its sign the sofa's.
        SELECT bl.order_id, bl.sofa, SIGN(SUM(bl.qty)) * GREATEST(FLOOR(MIN(ABS(bl.qty))), 1) AS sets
          FROM brand_lines bl
         WHERE bl.grp = 'SOFA'
         GROUP BY bl.order_id, bl.sofa
    ), brand_series AS (
        -- A brand's line's fabric series: its fabric's series on its company's fabric list, else the fabric code's
        -- family — its code before the first '-' (2990s' D-004, EZ-007: no series on the list).
        SELECT DISTINCT ON (fa.line_id)
               fa.order_id, fa.line_id, fa.brand_id, fa.grp, fa.code_key, fa.qty,
               catalogue_value_key(COALESCE(NULLIF(BTRIM(e.series), ''), SPLIT_PART(BTRIM(fa.fabric), '-', 1))) AS series_key
          FROM facts fa
          LEFT JOIN erp_fabrics e
            ON e.erp_company_id = fa.company_id
           AND UPPER(BTRIM(e.fabric_code)) = UPPER(BTRIM(fa.fabric))
         WHERE fa.brand_id IS NOT NULL
           AND NULLIF(BTRIM(COALESCE(fa.fabric, '')), '') IS NOT NULL
           AND EXISTS (SELECT 1 FROM items i
                        WHERE i.brand_id = fa.brand_id AND i.option_pool IN ('bedframe_fabric_series', 'sofa_fabric_series'))
         ORDER BY fa.line_id, (e.removed_at IS NULL) DESC, e.active DESC NULLS LAST, e.synced_at DESC NULLS LAST
    ), brand_fabric_lines AS (
        SELECT se.order_id, se.line_id, se.code_key, se.qty, i.id AS item_id, i.option_pool
          FROM brand_series se
          JOIN items i
            ON i.source = 'option'
           AND i.brand_id = se.brand_id
           AND se.grp = CASE i.option_pool WHEN 'bedframe_fabric_series' THEN 'BEDFRAME'
                                           WHEN 'sofa_fabric_series' THEN 'SOFA' END
           AND i.value_key = se.series_key
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
        -- ── A brand's own items (20261114230000 — the user: "扣掉再发 bonus"): what comes off the bill is what the
        --    bill charged for the item; what it pays is read beside the hits (its bonus, or its month's tier). ──
        -- A SKU: per unit, at what its line charges a unit.
        SELECT s.order_id, s.line_id, s.item_id, s.qty, CASE WHEN s.qty <> 0 THEN s.amount / s.qty ELSE 0 END
          FROM brand_skus s
        UNION ALL
        -- A model: a sofa's once per sofa SET, at what its pieces charge; any other's per unit, at what its line charges.
        SELECT m.order_id, m.line_id, m.item_id, m.qty, CASE WHEN m.qty <> 0 THEN m.amount / m.qty ELSE 0 END
          FROM brand_models m
         WHERE m.grp IS DISTINCT FROM 'SOFA'
        UNION ALL
        SELECT m.order_id, MIN(m.line_id::TEXT)::UUID, m.item_id,
               SIGN(SUM(m.qty)) * GREATEST(FLOOR(MIN(ABS(m.qty))), 1),
               SUM(m.amount) / NULLIF(SIGN(SUM(m.qty)) * GREATEST(FLOOR(MIN(ABS(m.qty))), 1), 0)
          FROM brand_models m
         WHERE m.grp = 'SOFA'
         GROUP BY m.order_id, m.sofa, m.item_id
        HAVING SIGN(SUM(m.qty)) <> 0
        UNION ALL
        -- A compartment: once per sofa SET that has one (the user: "每组沙发算 1 个"), at what those pieces charge.
        SELECT c.order_id, MIN(c.line_id::TEXT)::UUID, c.item_id, MAX(bs.sets), SUM(c.amount) / NULLIF(MAX(bs.sets), 0)
          FROM brand_compartments c
          JOIN brand_sofas bs ON bs.order_id = c.order_id AND bs.sofa = c.sofa
         GROUP BY c.order_id, c.sofa, c.item_id
        HAVING MAX(bs.sets) <> 0
        UNION ALL
        -- A sofa special (20261112200000): once per sofa SET — the bill's pieces of one model that carry it
        -- (20261114030000: charged or not), as many sets as its fewest pieces, its sign the sofa's — at what the set's
        -- special order charges for it (on every piece: its dearest copy); nothing where a piece of the sofa comes off
        -- whole.
        SELECT c.order_id, MIN(c.line_id::TEXT)::UUID, c.item_id,
               SIGN(SUM(c.qty)) * GREATEST(FLOOR(MIN(ABS(c.qty))), 1),
               CASE WHEN EXISTS (SELECT 1 FROM brand_whole w WHERE w.order_id = c.order_id AND w.sofa = c.sofa)
                    THEN 0 ELSE MAX(c.amount) END
          FROM charged c
         WHERE c.option_pool = 'sofa_specials'
         GROUP BY c.order_id, c.sofa, c.item_id
        HAVING SIGN(SUM(c.qty)) <> 0
        UNION ALL
        -- A bed frame special: once per bed frame, at what the line's special order charges for it — nothing where the
        -- bed frame comes off whole.
        SELECT c.order_id, c.line_id, c.item_id, c.qty,
               CASE WHEN EXISTS (SELECT 1 FROM brand_whole w WHERE w.line_id = c.line_id) THEN 0 ELSE c.amount END
          FROM charged c
         WHERE c.option_pool = 'bedframe_specials'
        UNION ALL
        -- A fabric series: a bed frame's once per bed frame, a sofa's once per sofa SET — nothing comes off: no bill
        -- charges for a series apart.
        SELECT fl.order_id, fl.line_id, fl.item_id, fl.qty, 0::NUMERIC
          FROM brand_fabric_lines fl
         WHERE fl.option_pool = 'bedframe_fabric_series'
        UNION ALL
        SELECT fl.order_id, MIN(fl.line_id::TEXT)::UUID, fl.item_id,
               SIGN(SUM(fl.qty)) * GREATEST(FLOOR(MIN(ABS(fl.qty))), 1), 0::NUMERIC
          FROM brand_fabric_lines fl
         WHERE fl.option_pool = 'sofa_fabric_series'
         GROUP BY fl.order_id, COALESCE(NULLIF(SPLIT_PART(fl.code_key, '-', 1), ''), fl.line_id::TEXT), fl.item_id
        HAVING SIGN(SUM(fl.qty)) <> 0
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

-- ── 3. The writer ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Production's body (md5 4c676def…, 20261114100000's), whole: a brand's add of any kind from its own ERP company, the
-- cost and the corner cost neither written nor refused (a page still open from before sends them).
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

    -- A new amount — or, a brand's item, new tiers — from today, the same way. What a change does not name stays: the
    -- item's brand, its name, and whichever of the amount and the tiers was not sent. (20261114230000) A cost or a
    -- corner cost sent is neither written nor refused: nothing reads them any more.
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
                                        option_pool, option_value, kpi_amount, unit_tiers, effective_from, effective_to,
                                        created_by)
            VALUES (p_scheme, v_item.brand_id, v_item.source, v_item.product_code, v_item.product_name,
                    v_item.erp_product_id, v_item.option_pool, v_item.option_value, v_amount, v_tiers, v_today,
                    v_item.effective_to, auth.uid());
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
            -- (20261114230000) of any kind, from its own ERP company. Only such an item has a name of its own, pays by
            -- tier, or is a model or a compartment.
            SELECT COALESCE(b.erp_company_id, 1) INTO v_company
              FROM comm_brands b
             WHERE b.id = r.brand_id AND b.scheme_id = p_scheme AND b.own_scheme;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'That brand is not one of this sub-department''s brands on their own scheme'
                    USING ERRCODE = '23503';
            END IF;
            v_label := NULLIF(LEFT(BTRIM(COALESCE(r.label, '')), 120), '');
        ELSIF v_tiers <> '[]'::JSONB THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item pays by tier' USING ERRCODE = '22023';
        ELSIF r.option_pool IN ('models', 'compartments') THEN
            RAISE EXCEPTION 'Only a brand''s own KPI item is a model or a compartment' USING ERRCODE = '22023';
        END IF;
        IF NOT comm_kpi_unit_tiers_valid(v_tiers) THEN
            RAISE EXCEPTION 'A tier is a whole number of units from 2 up, each above the one before, and what a unit pays'
                USING ERRCODE = '22023';
        END IF;

        IF r.source = 'sku' THEN
            -- (20261114230000) A brand's SKU is one of its own ERP company's, under its own name, else the SKU's.
            SELECT p.item_code, p.description INTO v_code, v_name
              FROM erp_products p
             WHERE p.erp_id = r.erp_product_id
               AND (r.brand_id IS NULL OR p.erp_company_id = v_company);
            IF NOT FOUND THEN
                RAISE EXCEPTION 'SKU % is not in the SKU Master', r.erp_product_id USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, brand_id, source, product_code, product_name, erp_product_id,
                                        kpi_amount, unit_tiers, effective_from, created_by)
            VALUES (p_scheme, r.brand_id, 'sku', v_code, COALESCE(v_label, v_name), r.erp_product_id,
                    r.kpi_amount, v_tiers, v_today, auth.uid());
        ELSIF r.source = 'option' AND r.option_pool = 'models' THEN
            -- (20261114230000) A model: a base model of the brand's own SKU master — its live SKUs' spelling.
            SELECT BTRIM(p.base_model) INTO v_value
              FROM erp_products p
             WHERE p.erp_company_id = v_company
               AND catalogue_value_key(p.base_model) = catalogue_value_key(r.option_value)
             ORDER BY (p.removed_at IS NULL) DESC, p.base_model
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION '"%" is no model of the SKU Master', r.option_value USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, brand_id, source, option_pool, option_value, product_name,
                                        kpi_amount, unit_tiers, effective_from, created_by)
            VALUES (p_scheme, r.brand_id, 'option', 'models', v_value, v_label, r.kpi_amount, v_tiers, v_today, auth.uid());
        ELSIF r.source = 'option' AND r.option_pool = 'compartments' THEN
            -- (20261114230000) A compartment: a sofa piece's module on the brand's own SKU master, as the costing reads
            -- a piece (its code after its last '-', no spaces, before its brackets).
            SELECT x.compartment INTO v_value
              FROM (SELECT REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(UPPER(BTRIM(p.item_code)), '^.*-', ''), '\s+', '', 'g'),
                                          '\(.*$', '') AS compartment
                      FROM erp_products p
                     WHERE p.erp_company_id = v_company AND UPPER(BTRIM(p.category)) = 'SOFA'
                       AND POSITION('-' IN p.item_code) > 0) x
             WHERE x.compartment <> '' AND catalogue_value_key(x.compartment) = catalogue_value_key(r.option_value)
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION '"%" is no sofa compartment of the SKU Master', r.option_value USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, brand_id, source, option_pool, option_value, product_name,
                                        kpi_amount, unit_tiers, effective_from, created_by)
            VALUES (p_scheme, r.brand_id, 'option', 'compartments', v_value, v_label, r.kpi_amount, v_tiers, v_today,
                    auth.uid());
        ELSIF r.source = 'option' AND r.option_pool IN ('bedframe_fabric_series', 'sofa_fabric_series') THEN
            -- A fabric series (2026-10-29): the fabric list's own spelling — a
            -- live fabric's first — what comm_kpi_hits compares a line's series
            -- against, and a name that says whose it is (kpi.ts fabricSeriesLabel).
            -- (20261114230000) A brand's: its own company's list, a fabric with no series in its code's family.
            SELECT x.series INTO v_value
              FROM (SELECT CASE WHEN r.brand_id IS NULL THEN BTRIM(f.series)
                                ELSE COALESCE(NULLIF(BTRIM(f.series), ''), BTRIM(SPLIT_PART(BTRIM(f.fabric_code), '-', 1))) END AS series,
                           f.removed_at
                      FROM erp_fabrics f
                     WHERE f.erp_company_id = v_company) x
             WHERE catalogue_value_key(x.series) = catalogue_value_key(r.option_value)
             ORDER BY (x.removed_at IS NULL) DESC, x.series
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION '"%" is not a fabric series on the ERP''s fabric list', r.option_value
                    USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, brand_id, source, option_pool, option_value, product_name,
                                        kpi_amount, unit_tiers, effective_from, created_by)
            VALUES (p_scheme, r.brand_id, 'option', r.option_pool, v_value,
                    COALESCE(v_label,
                             v_value || CASE r.option_pool WHEN 'sofa_fabric_series' THEN ' · Sofa fabric'
                                                           ELSE ' · Bed frame fabric' END),
                    r.kpi_amount, v_tiers, v_today, auth.uid());
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

-- ── 4. The Revenue app's list ────────────────────────────────────────────────────────────────────────────────────────
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
  SELECT makes INTO STRICT v_makes FROM brand_kpi_any_fns WHERE proc = p_proc;
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

SELECT pg_temp.remake('public.member_kpi_for_staff(uuid, uuid, date)', ARRAY[
    -- A brand's item's code: its SKU's, or its model's, compartment's, special's or series' with its kind — a sofa
    -- special's as it was.
    $o$CASE WHEN b.id IS NOT NULL THEN upper(btrim(b.code))||' · '||btrim(k.option_value)$o$,
    $n$CASE WHEN b.id IS NOT NULL THEN upper(btrim(b.code))||' · '||CASE
          -- (20261114230000) A brand's item of any kind: its SKU's code, else its value — and, but for a sofa special
          -- (its code as it was), its kind: a series may be a bed frame's item and a sofa's.
          WHEN k.source='sku' THEN upper(btrim(k.product_code))
          WHEN k.option_pool='sofa_specials' THEN btrim(k.option_value)
          WHEN k.option_pool='bedframe_specials' THEN btrim(k.option_value)||' · Bed frame'
          WHEN k.option_pool='sofa_fabric_series' THEN btrim(k.option_value)||' · Sofa fabric'
          WHEN k.option_pool='bedframe_fabric_series' THEN btrim(k.option_value)||' · Bed frame fabric'
          WHEN k.option_pool='models' THEN btrim(k.option_value)||' · Model'
          ELSE btrim(k.option_value)||' · Compartment' END$n$
]);

-- ── 5. What stands now is what was tested ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(format('%s is md5 %s', f.proc, md5(replace(p.prosrc, E'\r', ''))), '; ' ORDER BY f.proc) INTO v_bad
    FROM brand_kpi_any_fns f
    JOIN pg_proc p ON p.oid = to_regprocedure(f.proc)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM f.makes;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the bodies this migration makes: %', v_bad;
  END IF;
END $$;

COMMIT;
