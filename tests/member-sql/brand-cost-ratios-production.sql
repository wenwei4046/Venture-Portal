-- Production's bodies (pg_get_functiondef, 2026-11-14) the migration was written from — read by
-- its PGlite check, which compares each md5 before the migration runs. Never edited by hand.

-- catalogue_save_cost_setting(p_scheme uuid, p_divisor numeric, p_ratios jsonb, p_removes text[])
-- md5(prosrc) = eb9f0116074174ee38a3ea508f0e9582
CREATE OR REPLACE FUNCTION public.catalogue_save_cost_setting(p_scheme uuid, p_divisor numeric, p_ratios jsonb, p_removes text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_touched INTEGER := 0;
    v_n       INTEGER;
    v_missing TEXT;
BEGIN
    IF NOT COALESCE(public.has_any_action(ARRAY['product_list.edit']), FALSE) THEN
        RAISE EXCEPTION 'Changing the cost ratios needs Product List · Edit.' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM comm_schemes WHERE id = p_scheme;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown sub-department scheme' USING ERRCODE = 'P0002';
    END IF;

    IF p_divisor IS NOT NULL THEN
        -- The range 20260915060000 gave revenue_cost_divisor.
        IF NOT (p_divisor > 0 AND p_divisor <= 10) THEN
            RAISE EXCEPTION 'A cost ratio must be above 0 and at most 10' USING ERRCODE = '22023';
        END IF;
        UPDATE comm_schemes
           SET revenue_cost_divisor = p_divisor, updated_at = now()
         WHERE id = p_scheme AND revenue_cost_divisor IS DISTINCT FROM p_divisor;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    IF COALESCE(CARDINALITY(p_removes), 0) > 0 THEN
        DELETE FROM comm_cost_ratios WHERE scheme_id = p_scheme AND erp_product_id = ANY (p_removes);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    IF jsonb_typeof(p_ratios) = 'array' AND jsonb_array_length(p_ratios) > 0 THEN
        SELECT r.erp_product_id INTO v_missing
          FROM jsonb_to_recordset(p_ratios) AS r(erp_product_id TEXT, ratio NUMERIC)
         WHERE NOT EXISTS (SELECT 1 FROM erp_products p WHERE p.erp_id = r.erp_product_id)
         LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'SKU % is not in the SKU Master', v_missing USING ERRCODE = '23503';
        END IF;
        -- The code is read again on every save, so saving a SKU the ERP
        -- renamed follows it to the code its new bills carry.
        INSERT INTO comm_cost_ratios (scheme_id, erp_product_id, product_code, ratio, updated_by, updated_at)
        SELECT p_scheme, r.erp_product_id, p.item_code, r.ratio, auth.uid(), now()
          FROM jsonb_to_recordset(p_ratios) AS r(erp_product_id TEXT, ratio NUMERIC)
          JOIN erp_products p ON p.erp_id = r.erp_product_id
        ON CONFLICT (scheme_id, erp_product_id) DO UPDATE
           SET product_code = EXCLUDED.product_code,
               ratio        = EXCLUDED.ratio,
               updated_by   = EXCLUDED.updated_by,
               updated_at   = EXCLUDED.updated_at;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_touched := v_touched + v_n;
    END IF;

    RETURN v_touched;
END;
$function$;

-- catalogue_save_cost_setting(p_scheme uuid, p_divisor numeric, p_ratios jsonb, p_removes text[], p_brands jsonb)
-- md5(prosrc) = a97bf8e72a9944a5c3f62409735fa483
CREATE OR REPLACE FUNCTION public.catalogue_save_cost_setting(p_scheme uuid, p_divisor numeric, p_ratios jsonb, p_removes text[], p_brands jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_touched INTEGER;
    v_n       INTEGER;
    v_bad     TEXT;
BEGIN
    IF NOT COALESCE(public.has_any_action(ARRAY['product_list.edit']), FALSE) THEN
        RAISE EXCEPTION 'Changing the cost ratios needs Product List · Edit.' USING ERRCODE = '42501';
    END IF;

    -- The sub-department's ratio and the SKUs' own.
    v_touched := public.catalogue_save_cost_setting(p_scheme, p_divisor, p_ratios, p_removes);

    -- A brand's ratio follows a SKU the ERP renamed, as its own ratio just did.
    UPDATE comm_cost_ratio_brands b
       SET product_code = p.item_code
      FROM erp_products p
     WHERE b.scheme_id = p_scheme AND p.erp_id = b.erp_product_id AND b.product_code IS DISTINCT FROM p.item_code;

    IF jsonb_typeof(p_brands) IS DISTINCT FROM 'array' OR jsonb_array_length(p_brands) = 0 THEN
        RETURN v_touched;
    END IF;

    -- Each row once.
    IF (SELECT COUNT(*) FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC))
       <> (SELECT COUNT(DISTINCT (b.erp_product_id, b.brand_code))
             FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)) THEN
        RAISE EXCEPTION 'A SKU''s brand is named twice' USING ERRCODE = '22023';
    END IF;
    -- A SKU of the SKU Master …
    SELECT b.erp_product_id INTO v_bad
      FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
     WHERE NOT EXISTS (SELECT 1 FROM erp_products p WHERE p.erp_id = b.erp_product_id)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'SKU % is not in the SKU Master', v_bad USING ERRCODE = '23503';
    END IF;
    -- … under a brand this sub-department has a ladder for …
    SELECT COALESCE(b.brand_code, '—') INTO v_bad
      FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
     WHERE b.ratio IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM comm_brands cb WHERE cb.scheme_id = p_scheme AND cb.code = b.brand_code AND cb.is_active)
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% is not a brand of this sub-department', v_bad USING ERRCODE = '22023';
    END IF;
    -- … at a ratio …
    IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
                WHERE b.ratio IS NOT NULL AND NOT (b.ratio > 0 AND b.ratio <= 10)) THEN
        RAISE EXCEPTION 'A cost ratio must be above 0 and at most 10' USING ERRCODE = '22023';
    END IF;
    -- … and a rider, as member_catalogue reads one (the twin is isRiderModel): a bed frame, an accessory — anything but
    -- a mattress or a sofa — or a mattress or a sofa the ERP gives no brand, marked Rider on Modular. A mattress or a
    -- sofa with a brand sells under it.
    SELECT p.item_code INTO v_bad
      FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
      JOIN erp_products p ON p.erp_id = b.erp_product_id
      LEFT JOIN erp_product_models pm ON pm.erp_id = p.model_erp_id
      LEFT JOIN catalogue_models cm ON cm.erp_model_id = p.model_erp_id
     WHERE b.ratio IS NOT NULL
       AND UPPER(BTRIM(COALESCE(pm.category, p.category, ''))) IN ('MATTRESS', 'SOFA')
       AND NOT (catalogue_brand_of(COALESCE(pm.category, p.category), pm.branding, p.branding) IS NULL
                AND COALESCE(cm.brand_code = 'RIDER', FALSE))
     LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION '% sells under its own brand: only a bed frame, an accessory or another rider takes a ratio by brand', v_bad
            USING ERRCODE = '22023';
    END IF;

    DELETE FROM comm_cost_ratio_brands c
     USING jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
     WHERE b.ratio IS NULL AND c.scheme_id = p_scheme AND c.erp_product_id = b.erp_product_id AND c.brand_code = b.brand_code;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_touched := v_touched + v_n;

    INSERT INTO comm_cost_ratio_brands (scheme_id, erp_product_id, product_code, brand_code, ratio, updated_by, updated_at)
    SELECT p_scheme, b.erp_product_id, p.item_code, b.brand_code, b.ratio, auth.uid(), now()
      FROM jsonb_to_recordset(p_brands) AS b(erp_product_id TEXT, brand_code TEXT, ratio NUMERIC)
      JOIN erp_products p ON p.erp_id = b.erp_product_id
     WHERE b.ratio IS NOT NULL
    ON CONFLICT (scheme_id, erp_product_id, brand_code) DO UPDATE
       SET product_code = EXCLUDED.product_code,
           ratio        = EXCLUDED.ratio,
           updated_by   = EXCLUDED.updated_by,
           updated_at   = EXCLUDED.updated_at
     WHERE comm_cost_ratio_brands.ratio IS DISTINCT FROM EXCLUDED.ratio
        OR comm_cost_ratio_brands.product_code IS DISTINCT FROM EXCLUDED.product_code;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_touched := v_touched + v_n;

    RETURN v_touched;
END;
$function$;

-- member_quote_cost_rules(p_scheme uuid)
-- md5(prosrc) = d300e873e6ddc7eb8c9cb5461d92533e
CREATE OR REPLACE FUNCTION public.member_quote_cost_rules(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object(
  'costDivisor',(SELECT coalesce(c.revenue_cost_divisor,1) FROM public.comm_schemes c WHERE c.id=p_scheme),
  'costRatios',(SELECT coalesce(jsonb_object_agg(r.product_code,r.ratio),'{}'::jsonb)
   FROM public.comm_cost_ratios r WHERE r.scheme_id=p_scheme),
  -- (20261107233000) A rider SKU's ratio for each brand the cart may answer to: { code: { brand: ratio } }.
  'costRatioBrands',(SELECT coalesce(jsonb_object_agg(x.product_code,x.brands),'{}'::jsonb)
   FROM (SELECT b.product_code,jsonb_object_agg(upper(btrim(b.brand_code)),b.ratio) AS brands
    FROM public.comm_cost_ratio_brands b WHERE b.scheme_id=p_scheme GROUP BY b.product_code) x),
  -- (20261108010000) The gifts with purchase (Product List › GWP): with a buy SKU in the cart, up to its units of the
  -- gift SKUs leave the cost, cheapest first, as the run reads the bill.
  -- (20261108020000) Each gift with its own quantity a unit bought: [{ id, buy: [codes], gifts: [{ code, perUnit }] }].
  'gwp',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,
    'buy',(SELECT coalesce(jsonb_agg(i.product_code ORDER BY i.product_code),'[]'::jsonb)
     FROM public.catalogue_gwp_items i WHERE i.gwp_id=g.id AND i.role='buy'),
    'gifts',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',i.product_code,'perUnit',i.qty) ORDER BY i.product_code),'[]'::jsonb)
     FROM public.catalogue_gwp_items i WHERE i.gwp_id=g.id AND i.role='gift' AND i.qty>0))
   ORDER BY g.created_at,g.id),'[]'::jsonb) FROM public.catalogue_gwp g));
$function$;

-- revenue_month_orders(p_sub_department_id uuid, p_period date)
-- md5(prosrc) = ca65252e526c2eda011eb476e3d84adb
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
              -- (20261112200000) … or a brand on its own scheme has KPI items: those are paid whatever the switch says.
              CASE WHEN sc.enable_kpi
                        OR EXISTS (SELECT 1 FROM comm_kpi_items bk WHERE bk.scheme_id = sc.id AND bk.brand_id IS NOT NULL)
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

-- member_order_facts_with_old_bills(p_scheme uuid, p_from date, p_until date)
-- md5(prosrc) = 33414791db34a741ce9bd6ee84c9687a
CREATE OR REPLACE FUNCTION public.member_order_facts_with_old_bills(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean, no_sales_cost numeric, old_bill boolean, full_revenue numeric, weight numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.*,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS today,
   public.comm_first_paid_month(c.sub_department_id) AS first_paid,
   date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS current_month,
   -- (20261107230000) The feed window: a bill dated before it, in a month from it on, is an old bill topped up.
   (SELECT f.min_order_date FROM public.erp_feed_settings f WHERE f.sub_department_id = c.sub_department_id) AS feed_floor
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), own AS (
  -- (20261112013000) The brands that follow their own commission scheme (comm_brands.own_scheme — 2990s): a bill of
  -- one is the sub-department's sale like any other, and stands in no margin.
  SELECT DISTINCT upper(btrim(ob.code)) AS code FROM public.comm_brands ob
  WHERE ob.scheme_id=p_scheme AND ob.own_scheme AND ob.is_active
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
   -- The bill's own month, always (user 2026-10-06: by record a sale follows
   -- its date, not a close). A close decides only when it is PAID — a bill
   -- the close did not pay is paid by the next month's run (Comm Cal's carry,
   -- lib/commission/carry.ts) — never which month's sales it is.
   so.period_month AS recognition,
   -- The Revenue Team cost basis. Guarded the way marginBase() guards it: a
   -- missing or nonsense divisor divides by one rather than erasing the cost.
   CASE WHEN coalesce(c.revenue_cost_divisor,0)>0 THEN c.revenue_cost_divisor ELSE 1 END AS cost_divisor,
   r.id IS NOT NULL OR coalesce(so.period_month<c.first_paid,false)
    OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
    OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS is_cleared,
   -- (20261107230000) An old bill topped up pays its collector commission, never sales (the user: "is go with b"):
   -- member_order_facts leaves it out; the order books list it, flagged.
   public.sales_order_old_bill(so.source, so.order_date, so.period_month, c.feed_floor) AS old_bill
  FROM sources so CROSS JOIN scheme c
  LEFT JOIN public.comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=c.sub_department_id
  WHERE NOT so.cancelled AND so.order_date<=c.today
 ), windowed AS (
  SELECT o.* FROM scoped o
  WHERE (p_from IS NULL OR o.recognition>=p_from) AND (p_until IS NULL OR o.recognition<p_until)
 ), ladder AS (
  -- (20261107233000) The brand whose ladder each bill answers to, as marginBase() picks it: its own, else the brand its
  -- goods lines sell the most of (on a tie, the one whose first line comes first). A rider SKU may divide by a ratio of
  -- its own for that brand (Product List › Costing Setting).
  SELECT w.id,upper(btrim(coalesce(nullif(btrim(w.brand_code),''),(
   SELECT bl.brand_code FROM public.sales_order_lines bl
   WHERE bl.order_id=w.id AND nullif(bl.brand_code,'') IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.comm_item_groups bg WHERE bg.scheme_id=p_scheme AND bg.commissionable
     AND upper(btrim(bg.item_group))=upper(btrim(bl.item_group)))
   GROUP BY bl.brand_code ORDER BY sum(bl.line_amount) DESC,min(bl.id::text COLLATE "C") LIMIT 1)))) AS brand
  FROM windowed w
 ), gwp AS (
  -- (20261108010000) What each bill's purchases earn free (Product List › GWP): the units of each line given.
  SELECT g.line_id,g.free_qty FROM public.sales_order_gwp_free(ARRAY(SELECT w.id FROM windowed w)) g
 ), kpi AS (
  -- (2026-09-27) The KPI items each bill carries, in force at the end of the
  -- month it is recognised in (the run's as-at): their amount is paid flat as
  -- KPI, off its sales. One call per month, none while KPI is off.
  SELECT h.order_id,sum(h.qty*h.unit_amount) AS amount,sum(h.qty) AS qty
  FROM scheme c
  -- (20261114020000) … or a brand on its own scheme has KPI items of its own: counted whatever the switch says
  -- (comm_kpi_hits reads the switch for the sub-department's own).
  CROSS JOIN LATERAL (SELECT DISTINCT w.recognition FROM windowed w WHERE c.enable_kpi
    OR EXISTS(SELECT 1 FROM public.comm_kpi_items bk WHERE bk.scheme_id=c.id AND bk.brand_id IS NOT NULL)) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT w.id FROM windowed w WHERE w.recognition=m.recognition),
   (m.recognition+interval '1 month - 1 day')::date) h
  GROUP BY h.order_id
 ), line_scope AS (
  SELECT o.id,o.staff_id,o.order_no,o.order_date,o.period_month,o.recognition,
   o.brand_code,o.is_cleared,o.old_bill,o.manual_margin_pct,l.line_amount,l.cost_amount,l.option_charge_amount,
   -- Layer 2: the cost the salesperson is measured on, not the invoice cost —
   -- each line at its SKU's own ratio, else the scheme's (2026-09-27).
   l.cost_amount*(1-coalesce(gw.free_qty/nullif(l.qty,0),0))/coalesce(crb.ratio,cr.ratio,o.cost_divisor) AS team_cost,
   -- (20261108010000) A line wholly given with a purchase never holds the bill as uncosted.
   coalesce(gw.free_qty>=l.qty,false) AS gwp_whole,
   EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
    AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
  FROM windowed o JOIN public.sales_order_lines l ON l.order_id=o.id
  LEFT JOIN public.comm_cost_ratios cr ON cr.scheme_id=p_scheme
   AND upper(btrim(cr.product_code))=upper(btrim(l.product_code))
  -- (20261107233000) The SKU's ratio for the brand the bill answers to (Costing Setting).
  LEFT JOIN ladder lb ON lb.id=o.id
  LEFT JOIN public.comm_cost_ratio_brands crb ON crb.scheme_id=p_scheme
   AND upper(btrim(crb.product_code))=upper(btrim(l.product_code)) AND upper(btrim(crb.brand_code))=lb.brand
  LEFT JOIN gwp gw ON gw.line_id=l.id
 ), bills AS (
  SELECT l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct,l.old_bill,
   coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,
   -- What its bed frames' divan, leg, gap and total height were charged (2026-10-05).
   coalesce(sum(l.option_charge_amount) FILTER(WHERE l.is_goods),0) AS charges,
   bool_and(l.cost_amount IS NOT NULL OR l.gwp_whole) FILTER(WHERE l.is_goods) AS costed,
   sum(l.team_cost) FILTER(WHERE l.is_goods) AS team_cost,
   bool_or(l.is_goods) AS has_goods
  FROM line_scope l
  GROUP BY l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
   l.brand_code,l.is_cleared,l.manual_margin_pct,l.old_bill
 ), split AS (
  -- comm_kpi_hits pays only what a bill's sales cover.
  -- The margin is taken on the main sales less the options' charges: the
  -- customer's price for an option is out of the margin on both sides, and
  -- still in the sales (2026-10-05).
  SELECT b.*,coalesce(k.qty,0) AS kpi_qty,b.goods-coalesce(k.amount,0) AS main,
   b.goods-coalesce(k.amount,0)-b.charges AS margin_base,
   -- (20261112013000) A bill of a brand on its own scheme stands in no margin: judged, never waited for, it adds
   -- nothing to any margin — a no-sales cost of 0, what a gift that cost nothing answers.
   CASE WHEN ob.code IS NOT NULL THEN 0
        WHEN b.goods-coalesce(k.amount,0)-b.charges<=0 AND coalesce(b.costed,true) THEN coalesce(b.team_cost,0) END AS no_sales_cost,
   ob.code IS NOT NULL AS own_scheme
  FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
  LEFT JOIN own ob ON ob.code=upper(btrim(b.brand_code))
  WHERE b.has_goods OR k.order_id IS NOT NULL
 ), parts AS (
  SELECT p.order_id,p.staff_id,p.part,p.staff_id IS NOT DISTINCT FROM p.owner_staff_id AS owner
  FROM public.sales_order_parts(ARRAY(SELECT s.id FROM split s)) p
 ), given AS (
  SELECT x.order_id,sum(round(s.main*x.part,2)) AS main,sum(round(s.margin_base*x.part,2)) AS margin_base,
   sum(s.kpi_qty*x.part) AS kpi_qty,sum(round(s.no_sales_cost*x.part,2)) AS no_sales_cost
  FROM parts x JOIN split s ON s.id=x.order_id WHERE NOT x.owner GROUP BY x.order_id
 )
 , stored AS (
  -- (20261107235500) What a standing close or an applied run paid a part at: the multiplier its margin penalty left
  -- (the engine's PenalisedOrder: staffId, orderId, multiplier), a close's before a run's, the newest first. Read once.
  SELECT DISTINCT ON (e.staff_id,e.order_id) e.staff_id,e.order_id,e.multiplier
  FROM (
   SELECT CASE WHEN p->>'staffId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'staffId')::uuid END AS staff_id,
    CASE WHEN p->>'orderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'orderId')::uuid END AS order_id,
    CASE WHEN jsonb_typeof(p->'multiplier')='number' THEN (p->>'multiplier')::numeric END AS multiplier,
    0 AS kind,x.period_month AS at
   FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(x.penalised_orders)='array' THEN x.penalised_orders ELSE '[]'::jsonb END) p
   WHERE x.reopened_at IS NULL
   UNION ALL
   SELECT CASE WHEN p->>'staffId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'staffId')::uuid END,
    CASE WHEN p->>'orderId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (p->>'orderId')::uuid END,
    CASE WHEN jsonb_typeof(p->'multiplier')='number' THEN (p->>'multiplier')::numeric END,
    1,r.period_month
   FROM public.comm_runs r JOIN scheme c ON c.sub_department_id=r.sub_department_id
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.penalised_orders)='array' THEN r.penalised_orders ELSE '[]'::jsonb END) p
   WHERE r.status IN ('applied','locked')
  ) e
  WHERE e.staff_id IS NOT NULL AND e.order_id IS NOT NULL AND e.multiplier IS NOT NULL
  ORDER BY e.staff_id,e.order_id,e.kind,e.at DESC
 ), paid AS (
  -- A part a standing close paid (its order_ids), when nothing is stored of it: paid in full.
  SELECT DISTINCT x.staff_id,o.order_id FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
  CROSS JOIN LATERAL unnest(x.order_ids) AS o(order_id) WHERE x.reopened_at IS NULL
 ), released AS (
  -- A bill released (paid by a later run), when nothing is stored of it: paid in full.
  SELECT DISTINCT r.order_no FROM public.comm_order_releases r JOIN scheme c ON c.sub_department_id=r.sub_department_id
 ), bands AS (
  -- The penalty bands, only while the scheme cuts commission by margin (engine.ts penaltyBandFor). Read once.
  SELECT b.id,b.margin_pct,b.commission_multiplier,b.sort_order,upper(btrim(br.code)) AS code
  FROM public.comm_margin_bands b JOIN public.comm_brands br ON br.id=b.brand_id JOIN scheme c ON c.id=b.scheme_id
  WHERE b.kind='penalty' AND c.enable_margin_penalty
 ), held AS (
  SELECT s.id,x.staff_id,s.order_no,s.order_date,s.period_month,s.recognition,
  coalesce(nullif(btrim(s.brand_code),''),'UNCLASSIFIED') AS brand,s.is_cleared,
  CASE WHEN x.owner THEN s.main-coalesce(g.main,0) ELSE round(s.main*x.part,2) END AS part_revenue,
  CASE WHEN x.owner THEN s.margin_base-coalesce(g.margin_base,0) ELSE round(s.margin_base*x.part,2) END AS goods_revenue,
  CASE WHEN s.own_scheme THEN NULL  -- (20261112013000) a brand's own scheme: no margin
   WHEN s.margin_base<=0 THEN NULL
   WHEN s.manual_margin_pct IS NOT NULL THEN s.manual_margin_pct
   WHEN s.costed THEN 1-s.team_cost/s.margin_base END AS margin_pct,
  CASE WHEN x.owner THEN s.kpi_qty-coalesce(g.kpi_qty,0) ELSE s.kpi_qty*x.part END AS kpi_qty,
  s.manual_margin_pct IS NOT NULL AS manual,
  CASE WHEN x.owner THEN s.no_sales_cost-coalesce(g.no_sales_cost,0) ELSE round(s.no_sales_cost*x.part,2) END AS no_sales_cost,
  s.old_bill,  -- (20261107230000) an old bill topped up: commission, never sales
  -- (20261107235500) The bill's whole revenue, unshared and unweighted; the brand its penalty bands are read for —
  -- ladder's, the one its cost ratios are read for (marginBase's: its own, else its goods lines' most sold; none, every
  -- brand's).
  s.main AS full_revenue,
  nullif(lg.brand,'') AS band_brand
  FROM split s JOIN parts x ON x.order_id=s.id LEFT JOIN given g ON g.order_id=s.id
  LEFT JOIN ladder lg ON lg.id=s.id
 ), weighed AS (
  -- What a part counts at: what it was paid at, else the penalty its margin falls in now (none for a head), else all.
  SELECT h.*,CASE
    WHEN st.multiplier IS NOT NULL THEN st.multiplier
    WHEN pd.order_id IS NOT NULL OR rl.order_no IS NOT NULL THEN 1
    WHEN h.margin_pct IS NOT NULL AND hd.id IS NULL THEN coalesce(pb.commission_multiplier,1)
    ELSE 1 END AS weight
  FROM held h
  LEFT JOIN stored st ON st.staff_id=h.staff_id AND st.order_id=h.id
  LEFT JOIN paid pd ON pd.staff_id=h.staff_id AND pd.order_id=h.id
  LEFT JOIN released rl ON rl.order_no=h.order_no
  LEFT JOIN (SELECT s.id FROM public.hr_staff_costs s JOIN public.titles t ON t.id=s.title_id WHERE t.is_department_head) hd
   ON hd.id=h.staff_id
  LEFT JOIN LATERAL (SELECT bd.commission_multiplier FROM bands bd
    WHERE (h.band_brand IS NULL OR bd.code=h.band_brand) AND h.margin_pct<=bd.margin_pct+1e-9
    ORDER BY bd.margin_pct,bd.sort_order,bd.id LIMIT 1) pb ON true
 )
 -- (20261107235500) The part counts as its commission is: a RM 10,000 bill shared half, RM 5,000; cut to x0.5, RM 2,500.
 SELECT w.id,w.staff_id,w.order_no,w.order_date,w.period_month,w.recognition,w.brand,w.is_cleared,
  round(w.part_revenue*w.weight,2),w.goods_revenue,w.margin_pct,w.kpi_qty,w.manual,w.no_sales_cost,w.old_bill,
  w.full_revenue,w.weight
 FROM weighed w;
$function$;

-- member_order_facts(p_scheme uuid, p_from date, p_until date)
-- md5(prosrc) = 987d328c0ec4087e4ce6f3e58346a382
CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid, p_from date, p_until date)
 RETURNS TABLE(order_id uuid, staff_id uuid, order_no text, order_date date, source_period date, recognition_month date, brand text, cleared boolean, revenue numeric, goods_revenue numeric, margin_pct numeric, kpi_qty numeric, manual boolean, no_sales_cost numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 -- (20261107230000) The Revenue app's sales: every bill member_order_facts_with_old_bills reads but an old bill topped
 -- up, which is commission, never sales (the user: "is go with b, not a"). The calculation lives there.
 SELECT f.order_id,f.staff_id,f.order_no,f.order_date,f.source_period,f.recognition_month,f.brand,f.cleared,f.revenue,
  f.goods_revenue,f.margin_pct,f.kpi_qty,f.manual,f.no_sales_cost
 FROM public.member_order_facts_with_old_bills(p_scheme,p_from,p_until) f
 WHERE NOT f.old_bill;
$function$;
