-- Rules › KPI items: a bed frame's or a sofa's FABRIC SERIES (user 2026-10-29).
--
-- "i want the kpi item, can selected with fabric series as well. for sofa and
-- bedframe, so once select with that particular fabric series. it will pay the
-- kpi". Asked how a bill counts one, the user: a sofa's "每组算一次" — once per
-- sofa SET, two PC151 sofas on one bill are two — and a bed frame's per bed
-- frame, each set apart with its own amount.
--
-- 1. comm_kpi_items: an 'option' item may name two more pools,
--    `bedframe_fabric_series` and `sofa_fabric_series`, whose value is a
--    series on the ERP's fabric list (`erp_fabrics.series`: BO315, PC151, ZL).
--    The live row per (scheme, pool, spelling) is already the exclusion
--    constraint's (`no_overlapping_kpi_option`, every 'option' row).
--
-- 2. comm_kpi_hits finds them. A line's fabric is what it carries
--    (`catalogue_line_facts().fabric`: `variants.fabricCode`, else the first
--    word of the ERP's description2 — the fabric the costing reads its tier
--    from), looked up on the fabric list of the ERP's one company: its code
--    trimmed and in any case, where the list holds a code twice the live row,
--    then the active one, then the latest delivery's (`indexFabricSeries`).
--    A bed frame's series counts per bed frame (the line's quantity). A sofa's
--    once per SET: the bill's pieces of one model — its code before the first
--    '-', 8030-1A(LHF) → 8030 — in that series, as many sets as its fewest
--    pieces (×2 everywhere = two sofas), the sign the sofa's: a return takes
--    them back, an exchange of a piece is none. Read only while the scheme has
--    a fabric series to look for. Production's body (md5 1f0394c4…) with the
--    facts read once for both the specials and the fabric, and the series
--    joined beside them; the specials' part is unchanged. Twin: kpi.ts
--    `orderKpiHits` + `lineKpiFactsOf`.
--
--    A fabric keyed TBC on the ERP's order carries no series and nothing is
--    found; when the ERP saves the order again with its fabric, the order
--    comes back whole and the month, worked out live, finds it.
--
-- 3. catalogue_save_kpi_items writes them: a series' spelling read from the
--    fabric list (a live fabric's first), and a NAME that says whose it is —
--    "PC151 · Sofa fabric" / "PC151 · Bed frame fabric", kpi.ts
--    `fabricSeriesLabel` — since the same series may be both pools' item and
--    every reader shows `product_name` first (the member app's KPI card,
--    member_kpi_for_staff, among them). Production's body (md5 2256b26c…)
--    with the option branch split in two.
--
-- 4. Rules › KPI items, the run and Comm Cal's bill page read the fabric list
--    behind Revenue · View too: erp_fabrics' reads gain `revenue.view:own`.
--
-- NOTHING MOVES TODAY: no item names a fabric series. Reversal at the foot.

BEGIN;

-- ── 1. comm_kpi_items: two more pools an option item may name ───────────────

ALTER TABLE comm_kpi_items DROP CONSTRAINT kpi_item_identity;
ALTER TABLE comm_kpi_items ADD CONSTRAINT kpi_item_identity CHECK (
    (source = 'sku'
        AND product_code IS NOT NULL AND BTRIM(product_code) <> ''
        AND option_pool IS NULL AND option_value IS NULL)
    OR (source = 'option'
        AND product_code IS NULL AND erp_product_id IS NULL
        AND option_pool IN ('bedframe_specials', 'sofa_specials', 'bedframe_fabric_series', 'sofa_fabric_series')
        AND option_value IS NOT NULL AND BTRIM(option_value) <> '')
);

COMMENT ON COLUMN comm_kpi_items.source IS
    'sku = product_code on a line; option = a Maintenance special (option_pool bedframe_specials / sofa_specials, 2026-09-27) or a fabric series on the ERP''s fabric list (bedframe_fabric_series / sofa_fabric_series, 2026-10-29), option_value its spelling.';

-- ── 2. comm_kpi_hits — the fabric series beside the specials ────────────────

CREATE OR REPLACE FUNCTION comm_kpi_hits(p_scheme UUID, p_order_ids UUID[], p_asat DATE)
RETURNS TABLE (order_id UUID, line_id UUID, item_id UUID, qty NUMERIC, unit_amount NUMERIC)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
    WITH items AS (
        SELECT k.id, k.source, UPPER(BTRIM(k.product_code)) AS code_key,
               k.option_pool, catalogue_value_key(k.option_value) AS value_key, k.kpi_amount
          FROM comm_kpi_items k
         WHERE k.scheme_id = p_scheme
           AND k.effective_from <= p_asat
           AND (k.effective_to IS NULL OR k.effective_to >= p_asat)
    ), lines AS (
        SELECT l.id, l.order_id, UPPER(BTRIM(l.item_group)) AS grp,
               UPPER(BTRIM(l.product_code)) AS code_key, l.description2, l.raw, l.qty, l.line_amount
          FROM sales_order_lines l
         WHERE l.order_id = ANY (p_order_ids)
    ), facts AS (
        -- A bed frame's or a sofa's specials and fabric, read once — only
        -- while the scheme has a special or a fabric series to look for.
        SELECT l.order_id, l.id AS line_id, l.grp, l.code_key, l.qty, f.specials, f.fabric
          FROM lines l
          CROSS JOIN LATERAL catalogue_line_facts(l.description2, l.raw) f
         WHERE l.grp IN ('BEDFRAME', 'SOFA')
           AND EXISTS (SELECT 1 FROM items i WHERE i.source = 'option')
    ), specials AS (
        SELECT fa.order_id, fa.line_id, fa.grp, fa.qty, s.special
          FROM facts fa
          CROSS JOIN LATERAL UNNEST(fa.specials) AS s(special)
    ), option_lines AS (
        -- One hit per (line, item), however many times the line prints it.
        -- Exact spelling first; without a trailing "(…)" only when no item
        -- has the exact one (OptionPrices.get / catalogue_option_price).
        SELECT DISTINCT sp.order_id, sp.line_id, i.id AS item_id, i.option_pool, sp.qty, i.kpi_amount
          FROM specials sp
          JOIN items i
            ON i.source = 'option'
           AND sp.grp = CASE i.option_pool WHEN 'bedframe_specials' THEN 'BEDFRAME'
                                           WHEN 'sofa_specials' THEN 'SOFA' END
           AND (i.value_key = catalogue_value_key(sp.special)
                OR (i.value_key = catalogue_value_key(REGEXP_REPLACE(sp.special, '\s*\(.*\)\s*$', ''))
                    AND NOT EXISTS (SELECT 1 FROM items x
                                     WHERE x.source = 'option' AND x.option_pool = i.option_pool
                                       AND x.value_key = catalogue_value_key(sp.special))))
    ), series AS (
        -- A line's fabric series (2026-10-29): its fabric on the fabric list
        -- of the ERP's one company — only while the scheme has a fabric
        -- series to look for. A code listed twice: the live row, then the
        -- active one, then the latest delivery's.
        SELECT DISTINCT ON (fa.line_id)
               fa.order_id, fa.line_id, fa.grp, fa.code_key, fa.qty,
               catalogue_value_key(e.series) AS series_key
          FROM facts fa
          JOIN erp_fabrics e
            ON e.erp_company_id = 1
           AND UPPER(BTRIM(e.fabric_code)) = UPPER(BTRIM(fa.fabric))
         WHERE NULLIF(BTRIM(COALESCE(e.series, '')), '') IS NOT NULL
           AND EXISTS (SELECT 1 FROM items i WHERE i.option_pool IN ('bedframe_fabric_series', 'sofa_fabric_series'))
         ORDER BY fa.line_id, (e.removed_at IS NULL) DESC, e.active DESC, e.synced_at DESC
    ), fabric_lines AS (
        SELECT se.order_id, se.line_id, se.code_key, se.qty, i.id AS item_id, i.option_pool, i.kpi_amount
          FROM series se
          JOIN items i
            ON i.source = 'option'
           AND se.grp = CASE i.option_pool WHEN 'bedframe_fabric_series' THEN 'BEDFRAME'
                                           WHEN 'sofa_fabric_series' THEN 'SOFA' END
           AND i.value_key = se.series_key
    ), found AS (
        SELECT l.order_id, l.id AS line_id, i.id AS item_id, l.qty, i.kpi_amount
          FROM lines l
          JOIN items i ON i.source = 'sku' AND i.code_key = l.code_key
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
$fn$;

COMMENT ON FUNCTION comm_kpi_hits(UUID, UUID[], DATE) IS
    'The KPI items these bills carry and are paid, at p_asat (twin of kpi.ts orderKpiHits + coverKpi): a SKU by code, a special among the line''s specials in its own category — per bed frame, once per sofa bill — a fabric series by the line''s fabric on the ERP''s fabric list — per bed frame, once per sofa set (2026-10-29) — and only on a bill whose commissionable sales cover them. SECURITY INVOKER: RLS decides what lines a caller sees.';

REVOKE ALL ON FUNCTION comm_kpi_hits(UUID, UUID[], DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comm_kpi_hits(UUID, UUID[], DATE) TO authenticated, service_role;

-- ── 3. catalogue_save_kpi_items — a fabric series from the fabric list ──────

CREATE OR REPLACE FUNCTION catalogue_save_kpi_items(
    p_scheme  UUID,
    p_adds    JSONB,   -- [{source:'sku', erp_product_id, kpi_amount} | {source:'option', option_pool, option_value, kpi_amount}]
    p_changes JSONB,   -- [{id, kpi_amount}]
    p_removes UUID[]
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_today   DATE := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
    v_touched INTEGER := 0;
    v_item    comm_kpi_items%ROWTYPE;
    v_code    TEXT;
    v_name    TEXT;
    v_value   TEXT;
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

    -- A new amount, from today, the same way.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_changes, '[]'::JSONB)) AS c(id UUID, kpi_amount NUMERIC) LOOP
        SELECT * INTO v_item FROM comm_kpi_items
         WHERE id = r.id AND scheme_id = p_scheme
           AND (effective_to IS NULL OR effective_to >= v_today)
           FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A KPI item changed since the page was opened. Reload and try again.'
                USING ERRCODE = '40001';
        END IF;
        CONTINUE WHEN v_item.kpi_amount = r.kpi_amount;
        IF v_item.effective_from < v_today THEN
            UPDATE comm_kpi_items SET effective_to = v_today - 1 WHERE id = v_item.id;
            INSERT INTO comm_kpi_items (scheme_id, source, product_code, product_name, erp_product_id,
                                        option_pool, option_value, kpi_amount,
                                        effective_from, effective_to, created_by)
            VALUES (p_scheme, v_item.source, v_item.product_code, v_item.product_name, v_item.erp_product_id,
                    v_item.option_pool, v_item.option_value, r.kpi_amount,
                    v_today, v_item.effective_to, auth.uid());
        ELSE
            UPDATE comm_kpi_items SET kpi_amount = r.kpi_amount WHERE id = v_item.id;
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    -- New items, in force from today.
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_adds, '[]'::JSONB))
               AS a(source TEXT, erp_product_id TEXT, option_pool TEXT, option_value TEXT, kpi_amount NUMERIC) LOOP
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
            -- The pool's own spelling: what comm_kpi_hits compares a line against.
            SELECT o.value INTO v_value
              FROM erp_maintenance_options o
             WHERE o.erp_company_id = 1 AND o.pool = r.option_pool
               AND catalogue_value_key(o.value) = catalogue_value_key(r.option_value)
             ORDER BY (o.removed_at IS NULL) DESC, o.value
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION '"%" is not in the % Maintenance pool', r.option_value, r.option_pool
                    USING ERRCODE = '23503';
            END IF;
            INSERT INTO comm_kpi_items (scheme_id, source, option_pool, option_value,
                                        kpi_amount, effective_from, created_by)
            VALUES (p_scheme, 'option', r.option_pool, v_value, r.kpi_amount, v_today, auth.uid());
        ELSE
            RAISE EXCEPTION 'A KPI item is a SKU, a special or a fabric series, not %', COALESCE(r.source, 'nothing')
                USING ERRCODE = '22023';
        END IF;
        v_touched := v_touched + 1;
    END LOOP;

    RETURN v_touched;
END;
$fn$;

COMMENT ON FUNCTION catalogue_save_kpi_items(UUID, JSONB, JSONB, UUID[]) IS
    'Rules › KPI items, in one transaction (2026-09-27; a fabric series since 2026-10-29). Adds start today; a new amount or a removal of an item begun before today closes it yesterday, so a month already run keeps what it was run at.';

REVOKE ALL ON FUNCTION catalogue_save_kpi_items(UUID, JSONB, JSONB, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION catalogue_save_kpi_items(UUID, JSONB, JSONB, UUID[]) TO authenticated;

-- ── 4. The fabric list, read behind Revenue · View too ──────────────────────

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('erp_fabrics', ARRAY['product_list.view', 'revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('erp_fabrics');

COMMIT;

-- ═══ DOWN ════════════════════════════════════════════════════════════════════
-- Take every fabric series item off first (they would break the old CHECK):
--   DELETE FROM comm_kpi_items WHERE option_pool IN ('bedframe_fabric_series', 'sofa_fabric_series');
-- then re-run §1's ALTER with the two specials pools only, §3 of
-- 20260927050000 (comm_kpi_hits) and its catalogue_save_kpi_items, set
-- erp_fabrics' row of permission_table_reads back to its four actions (§4
-- without revenue.view:own) and run permission_reads_guard('erp_fabrics').
