-- Production's bodies (pg_get_functiondef, 2026-11-12) the migration 20261112200000 was written from — read by
-- validate-brand-kpi-items.mjs, which checks each md5 before the migration runs. Never edited by hand.

-- catalogue_value_key(p text)
-- md5(prosrc) = 1ea7b76ef890a99929c2b6c06c24321c
CREATE OR REPLACE FUNCTION public.catalogue_value_key(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT NULLIF(LOWER(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(COALESCE(p, ''), '[”“]', '"', 'g'), '\s+', ' ', 'g'))), '');
$function$;

-- catalogue_line_facts(p_description2 text, p_raw jsonb)
-- md5(prosrc) = 85e7986827c8adb666a14515ae88d3f7
CREATE OR REPLACE FUNCTION public.catalogue_line_facts(p_description2 text, p_raw jsonb)
 RETURNS TABLE(fabric text, seat text, leg text, divan text, gap text, total text, specials text[], parsed_from text)
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v    JSONB := CASE WHEN jsonb_typeof(p_raw->'variants') = 'object' THEN p_raw->'variants' END;
    seg  TEXT;
    m    TEXT[];
    i    INTEGER := 0;
    hit  BOOLEAN := FALSE;
BEGIN
    specials := '{}';

    IF v IS NOT NULL THEN
        -- A blank key falls through to its alternative, as a missing one does.
        fabric := COALESCE(NULLIF(BTRIM(v->>'fabricCode'), ''), NULLIF(BTRIM(v->>'fabricColor'), ''));
        seat   := COALESCE(NULLIF(BTRIM(v->>'seatHeight'), ''), NULLIF(BTRIM(v->>'depth'), ''));
        leg    := COALESCE(NULLIF(BTRIM(v->>'legHeight'), ''), NULLIF(BTRIM(v->>'sofaLegHeight'), ''));
        divan  := NULLIF(BTRIM(COALESCE(v->>'divanHeight', '')), '');
        gap    := NULLIF(BTRIM(COALESCE(v->>'gap', '')), '');
        total  := NULLIF(BTRIM(COALESCE(v->>'totalHeight', '')), '');
        specials := CASE
            WHEN jsonb_typeof(v->'specials') = 'array'
                THEN ARRAY(SELECT BTRIM(x) FROM jsonb_array_elements_text(v->'specials') x WHERE BTRIM(x) <> '')
            WHEN NULLIF(BTRIM(COALESCE(v->>'specials', '')), '') IS NOT NULL
                THEN ARRAY[BTRIM(v->>'specials')]
            ELSE '{}' END;
        parsed_from := 'variants';
        RETURN NEXT;
        RETURN;
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_description2, '')), '') IS NULL THEN
        RETURN NEXT;
        RETURN;
    END IF;

    FOREACH seg IN ARRAY REGEXP_SPLIT_TO_ARRAY(p_description2, '\s+/\s+') LOOP
        i := i + 1;
        seg := BTRIM(seg);
        IF seg ~* '^SEAT\s+' THEN
            seat := BTRIM(REGEXP_REPLACE(seg, '^SEAT\s+', '', 'i'));
            hit := TRUE;
        ELSIF seg ~* '^DIVAN\s+' THEN
            m := REGEXP_MATCH(seg, '^DIVAN\s+(.+?)\s*\+\s*(?:LEG\s+(.+)|(NO\s*LEG))\s*$', 'i');
            IF m IS NOT NULL THEN
                divan := BTRIM(m[1]);
                leg   := COALESCE(BTRIM(m[2]), 'No Leg');
            ELSE
                divan := BTRIM(REGEXP_REPLACE(seg, '^DIVAN\s+', '', 'i'));
            END IF;
            hit := TRUE;
        ELSIF seg ~* '^LEG\s+' THEN
            leg := BTRIM(REGEXP_REPLACE(seg, '^LEG\s+', '', 'i'));
            hit := TRUE;
        ELSIF seg ~* '^NO\s*LEG$' THEN
            leg := 'No Leg';
            hit := TRUE;
        ELSIF seg ~* '^GAP\s+' THEN
            gap := BTRIM(REGEXP_REPLACE(seg, '^GAP\s+', '', 'i'));
            hit := TRUE;
        ELSIF seg ~* '^T\.\s*Heights?\s+' THEN
            total := BTRIM(REGEXP_REPLACE(seg, '^T\.\s*Heights?\s+', '', 'i'));
            hit := TRUE;
        ELSIF seg ~* '^SPECIAL:\s*' THEN
            specials := ARRAY(SELECT BTRIM(x)
                                FROM REGEXP_SPLIT_TO_TABLE(REGEXP_REPLACE(seg, '^SPECIAL:\s*', '', 'i'), '\s+\+\s+') x
                               WHERE BTRIM(x) <> '');
            hit := TRUE;
        ELSIF seg ~* '^FREE\M' THEN
            NULL;
        ELSIF i = 1 THEN
            fabric := NULLIF(SPLIT_PART(seg, ' ', 1), '');
        END IF;
    END LOOP;

    IF hit THEN
        parsed_from := 'description2';
    ELSE
        fabric := NULL;
    END IF;
    RETURN NEXT;
END;
$function$;

-- comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
-- md5(prosrc) = 456161456dccbfd6842ad3a79b917c52
CREATE OR REPLACE FUNCTION public.comm_kpi_hits(p_scheme uuid, p_order_ids uuid[], p_asat date)
 RETURNS TABLE(order_id uuid, line_id uuid, item_id uuid, qty numeric, unit_amount numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

-- catalogue_save_kpi_items(p_scheme uuid, p_adds jsonb, p_changes jsonb, p_removes uuid[])
-- md5(prosrc) = 85becfc13d24352ac162e73f80af4320
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
$function$;

-- revenue_month_orders(p_sub_department_id uuid, p_period date)
-- md5(prosrc) = 99c8386e4549d99c963b250c4538ce80
CREATE OR REPLACE FUNCTION public.revenue_month_orders(p_sub_department_id uuid, p_period date)
 RETURNS TABLE(order_id uuid, order_no text, order_date date, event_date date, customer_name text, debtor_code text, venue text, venue_group_key text, venue_group_name text, organizer text, location text, brand_code text, order_total numeric, paid_amount numeric, balance numeric, cancelled boolean, excluded_reason text, erp_status text, erp_on_hold boolean, sequence_in_day integer, staff_id uuid, employee_name text, employee_code text, agent_name text, line_count integer, line_amount numeric, commissionable numeric, margin_revenue numeric, margin_cost numeric, margin_pct numeric, margin_source text, lines_without_cost integer, lines_without_brand integer, deposit_required numeric, deposit_met boolean, ref_no text, paper_no text)
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
    ), gwp AS (
        -- (20261108010000) What each bill's purchases earn free (Product List › GWP): the units of each line given.
        SELECT g.line_id, g.free_qty
          FROM sales_order_gwp_free(ARRAY(SELECT o.id FROM sales_orders o JOIN batch ON batch.id = o.batch_id)) g
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
        -- what its bed frames' divan, leg, gap and total height were CHARGED (2026-10-05) —
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
      -- (20261107233000) The brand whose ladder the bill answers to, as marginBase() picks it: its own, else the brand
      -- its goods lines sell the most of (on a tie, the one whose first line comes first). A rider SKU may divide by a
      -- ratio of its own for that brand (Product List › Costing Setting).
      LEFT JOIN LATERAL (
          SELECT UPPER(BTRIM(COALESCE(NULLIF(BTRIM(o.brand_code), ''), (
              SELECT bl.brand_code
                FROM sales_order_lines bl
               WHERE bl.order_id = o.id
                 AND NULLIF(bl.brand_code, '') IS NOT NULL
                 AND EXISTS (SELECT 1 FROM comm_item_groups bg
                              WHERE bg.scheme_id = sc.id AND bg.commissionable
                                AND UPPER(BTRIM(bg.item_group)) = UPPER(BTRIM(bl.item_group)))
               GROUP BY bl.brand_code
               ORDER BY SUM(bl.line_amount) DESC, MIN(bl.id::TEXT COLLATE "C")
               LIMIT 1)))) AS brand
      ) lb ON TRUE
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
                  -- What its bed frames' divan, leg, gap and total height were charged.
                  SUM(sl.option_charge_amount) FILTER (WHERE ig.commissionable) AS charges,
                  -- NULL when ANY line of that base has no cost. A partial
                  -- cost would show as a fat margin and the engine would
                  -- disagree - it refuses to judge an incomplete bill at all.
                  --
                  -- Each line divided by its SKU's own ratio, else the
                  -- scheme's (2026-09-27), exactly as marginBase() divides it:
                  -- this is the cost the MARGIN is taken on, not the cost on
                  -- the invoice.
                  CASE WHEN COUNT(*) FILTER (WHERE ig.commissionable AND sl.cost_amount IS NULL
                                             AND NOT COALESCE(gw.free_qty >= sl.qty, FALSE)) > 0
                       THEN NULL
                       ELSE ROUND(
                            COALESCE(SUM(sl.cost_amount * (1 - COALESCE(gw.free_qty / NULLIF(sl.qty, 0), 0))
                                / COALESCE(crb.ratio, cr.ratio, sc.cost_divisor))
                                     FILTER (WHERE ig.commissionable), 0),
                            2) END AS margin_cost,
                  COUNT(*) FILTER (WHERE sl.cost_amount IS NULL AND NOT COALESCE(gw.free_qty >= sl.qty, FALSE)) AS no_cost,
                  COUNT(*) FILTER (WHERE sl.brand_code IS NULL) AS no_brand
                FROM sales_order_lines sl
                LEFT JOIN comm_item_groups ig
                       ON ig.scheme_id = sc.id
                      AND UPPER(BTRIM(ig.item_group)) = UPPER(BTRIM(sl.item_group))
                LEFT JOIN comm_cost_ratios cr
                       ON cr.scheme_id = sc.id
                      AND UPPER(BTRIM(cr.product_code)) = UPPER(BTRIM(sl.product_code))
                -- (20261107233000) The SKU's ratio for the brand the bill answers to (Costing Setting).
                LEFT JOIN comm_cost_ratio_brands crb
                       ON crb.scheme_id = sc.id
                      AND UPPER(BTRIM(crb.product_code)) = UPPER(BTRIM(sl.product_code))
                      AND UPPER(BTRIM(crb.brand_code)) = lb.brand
                -- (20261108010000) The units of the line a purchase earned free (Product List › GWP).
                LEFT JOIN gwp gw ON gw.line_id = sl.id
               WHERE sl.order_id = o.id
            ) g
      ) l ON TRUE
     ORDER BY o.order_date, o.sequence_in_day NULLS LAST, o.order_no;
$function$;

-- member_quote_context(p_scheme uuid)
-- md5(prosrc) = a11b580df9e5ee3ca636c1675d74e7fc
CREATE OR REPLACE FUNCTION public.member_quote_context(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_sub uuid; v_bands jsonb;
 v_kpi_on boolean; v_kpi jsonb;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT public.has_perm('member_quote') THEN RAISE EXCEPTION 'Quotation access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT d.id,c.enable_kpi INTO v_sub,v_kpi_on FROM public.comm_schemes c JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
 AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 AND ((public.member_has_membership(v_staff,d.id)
 AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
 AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)))
 OR public.member_director_scheme(v_staff,d.id)=c.id);
 IF v_sub IS NULL THEN RAISE EXCEPTION 'An active Fair membership is required for quotation' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'key',m.label,'kind',m.kind,
 'threshold',m.margin_pct*100,'multiplier',m.commission_multiplier,'amount',m.monthly_incentive)),'[]') INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id WHERE m.scheme_id=p_scheme;
 IF v_kpi_on THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('source',k.source,'product_code',k.product_code,
   'product_name',k.product_name,'option_pool',k.option_pool,'option_value',k.option_value,
   'kpi_amount',k.kpi_amount)),'[]'::jsonb) INTO v_kpi
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_today AND (k.effective_to IS NULL OR k.effective_to>=v_today);
 ELSE
  v_kpi:='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands,'kpiItems',v_kpi);
END $function$;

-- member_principal_quote_context(p_scheme uuid)
-- md5(prosrc) = 92a65b713ff10d22b2c6ff1b0685e841
CREATE OR REPLACE FUNCTION public.member_principal_quote_context(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_sub uuid;
 v_bands jsonb;
 v_kpi_on boolean;
 v_kpi jsonb;
 v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active
 ) THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;

 SELECT d.id,c.enable_kpi INTO v_sub,v_kpi_on
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 JOIN public.departments department ON department.id=d.department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
 AND department.payroll_source='commission'
 AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
 AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today);
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active Fair scheme is required for quotation' USING ERRCODE='42501';
 END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'brand',b.code,'key',m.label,'kind',m.kind,'threshold',m.margin_pct*100,
  'multiplier',m.commission_multiplier,'amount',m.monthly_incentive
 ) ORDER BY b.code,m.margin_pct,m.id),'[]'::jsonb) INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id
 WHERE m.scheme_id=p_scheme AND b.is_active;
 IF v_kpi_on THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('source',k.source,'product_code',k.product_code,
   'product_name',k.product_name,'option_pool',k.option_pool,'option_value',k.option_value,
   'kpi_amount',k.kpi_amount)),'[]'::jsonb) INTO v_kpi
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_today AND (k.effective_to IS NULL OR k.effective_to>=v_today);
 ELSE
  v_kpi:='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands,'kpiItems',v_kpi);
END $function$;

-- member_kpi_for_staff(p_staff uuid, p_scheme uuid, p_period date)
-- md5(prosrc) = b5b431e78aaffd51cad678c68321166a
CREATE OR REPLACE FUNCTION public.member_kpi_for_staff(p_staff uuid, p_scheme uuid, p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date:=coalesce(date_trunc('month',p_period)::date,date_trunc('month',v_today)::date);
 v_rules_at date:=(v_period+interval '1 month - 1 day')::date;
 v_sub uuid;
 v_enabled boolean;
 v_threshold integer;
 v_items jsonb;
 v_total numeric;
BEGIN
 SELECT c.sub_department_id,c.enable_kpi
 INTO v_sub,v_enabled
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND ((public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)))
   OR public.member_director_scheme(v_staff,d.id)=c.id);
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active membership in this scheme is required' USING ERRCODE='42501';
 END IF;
 IF v_period>date_trunc('month',v_today)::date THEN
  RAISE EXCEPTION 'Choose a month that has started' USING ERRCODE='22023';
 END IF;

 IF NOT v_enabled THEN
  RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
   'asOf',now(),'enabled',false,'items','[]'::jsonb,'total',0,'threshold',NULL,'hit',NULL);
 END IF;

 -- The commission run selects its configuration at period end. Retain the
 -- FIRST rung even after it is reached; the old MemberKpi.target is next-unmet.
 SELECT min(k.min_qty) INTO v_threshold FROM public.comm_kpi_thresholds k
 WHERE k.scheme_id=p_scheme AND k.effective_from<=v_rules_at
  AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at);

 WITH configured AS (
  -- A SKU (by its code) or a bed frame's / sofa's special (2026-09-27).
  SELECT k.id,
   CASE WHEN k.source='option' THEN btrim(k.option_value) ELSE upper(btrim(k.product_code)) END AS code,
   coalesce(nullif(btrim(k.product_name),''),
    CASE WHEN k.source='option' THEN btrim(k.option_value) ELSE btrim(k.product_code) END) AS label
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_rules_at AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at)
 ), eligible_orders AS (
  -- The month's deposit-cleared bills, recognised exactly as Insight's sales.
  SELECT f.order_id AS id FROM public.member_order_facts(p_scheme,v_period,(v_period+interval '1 month')::date) f
  WHERE f.staff_id=v_staff AND f.cleared
 ), hits AS (
  SELECT h.item_id,sum(h.qty*coalesce(pt.part,1)) AS qty
  FROM public.comm_kpi_hits(p_scheme,ARRAY(SELECT o.id FROM eligible_orders o),v_rules_at) h
  LEFT JOIN public.sales_order_parts(ARRAY(SELECT o.id FROM eligible_orders o)) pt ON pt.order_id=h.order_id AND pt.staff_id=v_staff
  GROUP BY h.item_id
 ), quantities AS (
  SELECT c.code,c.label,coalesce(h.qty,0) AS quantity
  FROM configured c LEFT JOIN hits h ON h.item_id=c.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('productCode',code,'label',label,'quantity',quantity)
   ORDER BY label,code),'[]'::jsonb),coalesce(sum(quantity),0)
 INTO v_items,v_total FROM quantities;

 RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),'enabled',true,'items',v_items,'total',v_total,'threshold',v_threshold,
  'hit',CASE WHEN v_threshold IS NULL THEN NULL ELSE v_total>=v_threshold END);
END $function$;
