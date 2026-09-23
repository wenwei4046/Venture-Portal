-- ════════════════════════════════════════════════════════════════════════════
-- The Revenue calculator sells from the catalogue (2026-09-24)
-- ════════════════════════════════════════════════════════════════════════════
--
-- THE RULE (user 2026-09-24): "Modular 是独立的，用来控制 Revenue team 的
-- calculator 上有哪些选项可以 drop down 下拉选择。SKU Master 里有 10 个 SKU，
-- 我在 Modular 这边开启了 7 个，那 calculator 上就只能选到这 7 个。"
--
-- Until now the member calculator read `comm_products` ⋈ `member_product_options`
-- — the hand-keyed list the catalogue mirror replaces — and on the way it had
-- lost two things (20260917050000 / 060000 rewrote both snapshots from an older
-- copy): the RIDER clause, so no bed frame or accessory reached a member at all,
-- and the sofa grid's CHOICES, so a sofa module could be put in a cart but never
-- given the seat height and fabric tier it is costed at.
--
-- WHAT A MEMBER MAY QUOTE, from here on — one function, `member_catalogue`:
--
--   * a SKU the ERP still lists (not removed, ACTIVE over there),
--   * ticked for the calculator on the Product List (`catalogue_skus.offered`),
--   * whose model is offered too (`catalogue_models.offered`) when it has one,
--   * selling under a brand one of the member's calculator schemes sells — or
--     under none: a bed frame or an accessory is a RIDER and joins any cart
--     (user 2026-09-12), and so is anything marked Rider on Modular. A
--     mattress or a sofa is never a rider by default — it decides the cart's
--     ladder — so one whose ERP branding matches no brand the portal knows
--     (MYLATEX, or none at all) is not offered until a ladder is chosen for it.
--
-- WHAT ITS DROPDOWNS MAY OFFER:
--
--   * a sofa's seat heights: the heights its portal price grid prices, among
--     the model's ticked seat sizes — a height nobody priced has nothing to
--     cost a module at, and a height nobody ticked is not offered;
--   * a model's leg heights, specials and (a bed frame's) divan / total / gap
--     heights: the portal's ticks (`catalogue_models.enabled`) that the ERP
--     still allows for that model and its Maintenance pool still lists. An
--     empty or missing ERP list is the ERP's own "no restriction"
--     (allowed-options-check.ts): the whole pool.
--
-- THE SAME FUNCTION PRICES THE QUOTE. `p_priced` adds the portal's prices —
-- the SKU's price and grid, the option surcharges, the combos with their price
-- per seat height — and is executable by the SERVICE ROLE ONLY: the server's
-- quote reads it through the admin client after the member's own session has
-- been authorised by `member_quote_context`, exactly as it read comm_products'
-- costs before. The snapshots call it unpriced, as its owner. No price ever
-- reaches a member's browser.
--
-- `comm_products` and `member_product_options` are no longer read by the member
-- app (kept, unread — the run's old provenance and the adoption still name
-- them).
--
-- Depends on 20260924030000 (catalogue_value_key / catalogue_height_key).
--
-- Reversal: re-create member_data_snapshot() and member_principal_snapshot()
-- from 20260917060000 / 20260917040000 (their comm_products clauses), then
--   DROP FUNCTION member_catalogue(TEXT[], UUID[], BOOLEAN, INTEGER);
--   DROP FUNCTION catalogue_model_options(BIGINT, TEXT, JSONB, JSONB);
--   DROP FUNCTION catalogue_size_word(TEXT, TEXT);
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. A size code in the calculator's words ────────────────────────────────
-- The ERP's size codes are K / Q / S / SS / SK / SP; the calculator (and the
-- free-gift size match) speaks King / Queen / Single / Super Single, which is
-- what the old list stored. The TypeScript twin is sizeWordOf
-- (lib/catalogue/options.ts).
CREATE OR REPLACE FUNCTION catalogue_size_word(p_code TEXT, p_label TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$
    SELECT CASE UPPER(BTRIM(COALESCE(p_code, '')))
               WHEN 'K'  THEN 'King'
               WHEN 'Q'  THEN 'Queen'
               WHEN 'S'  THEN 'Single'
               WHEN 'SS' THEN 'Super Single'
               WHEN 'SK' THEN 'Super King'
               WHEN 'SP' THEN 'Special size'
               ELSE COALESCE(NULLIF(BTRIM(p_label), ''), NULLIF(BTRIM(p_code), ''), '')
           END;
$fn$;

-- ── 2. One of a model's dropdowns ───────────────────────────────────────────
-- The portal's ticks (`enabled`), that the ERP still allows for the model
-- (`allowed`, strings or {value} objects) and that its Maintenance pool still
-- lists — in the pool's own order. Nothing ticked = nothing offered. An EMPTY
-- or missing `allowed` is the ERP's "no restriction" (hasRestriction in its
-- allowed-options-check.ts: only a non-empty list restricts), so the pool
-- alone bounds the ticks. The TypeScript twin is erpAllows (lib/catalogue/options.ts).
CREATE OR REPLACE FUNCTION catalogue_model_options(p_company BIGINT, p_pool TEXT, p_enabled JSONB, p_allowed JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(jsonb_agg(o.value ORDER BY o.sort_order, o.value), '[]'::JSONB)
      FROM erp_maintenance_options o
     WHERE o.erp_company_id = p_company
       AND o.pool = p_pool
       AND o.removed_at IS NULL
       AND o.active
       AND EXISTS (SELECT 1
                     FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_enabled) = 'array'
                                                         THEN p_enabled ELSE '[]'::JSONB END) v
                    WHERE catalogue_value_key(v) = catalogue_value_key(o.value))
       AND (CASE WHEN jsonb_typeof(p_allowed) = 'array' THEN jsonb_array_length(p_allowed) = 0 ELSE TRUE END
            OR EXISTS (SELECT 1
                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_allowed) = 'array'
                                                        THEN p_allowed ELSE '[]'::JSONB END) a
                        WHERE catalogue_value_key(CASE WHEN jsonb_typeof(a) = 'object'
                                                       THEN a->>'value' ELSE a #>> '{}' END)
                              = catalogue_value_key(o.value)));
$fn$;

-- ── 3. The calculator's catalogue ───────────────────────────────────────────
-- p_brands   the brands the caller's calculator schemes sell; empty = nothing
--            (not even riders — a member with no calculator has no catalogue)
-- p_ids      NULL = every offered SKU (the snapshot); else just those (a quote)
-- p_priced   add the portal's prices; SERVICE ROLE ONLY (see the grants)
-- p_suggest  also return up to this many gift-eligible pillows (the quote's
--            gift suggestions)
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

    -- What an option adds. An option with no portal price adds nothing — the
    -- run's rule too (catalogue_line_surcharge) — and the Maintenance tab says
    -- which are unpriced.
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

COMMENT ON FUNCTION member_catalogue(TEXT[], UUID[], BOOLEAN, INTEGER) IS
    'The Revenue calculator''s catalogue: every SKU ticked on Product List › Modular (and its model offered), selling under one of p_brands or as a rider; names, sizes, the grid''s seat-height × tier choices and each sofa / bed frame model''s option dropdowns (the portal''s ticks the ERP still allows). p_priced adds the portal''s prices, option surcharges and priced combos — SERVICE ROLE ONLY.';

REVOKE ALL ON FUNCTION member_catalogue(TEXT[], UUID[], BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION member_catalogue(TEXT[], UUID[], BOOLEAN, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION catalogue_model_options(BIGINT, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION catalogue_model_options(BIGINT, TEXT, JSONB, JSONB) TO service_role;

-- ── 4. The member's snapshot reads the catalogue ────────────────────────────
-- Identical to the live definition (20260917060000) except the catalogue block
-- and the `catalogueModels` key.
CREATE OR REPLACE FUNCTION public.member_data_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_profile jsonb; v_memberships jsonb; v_departments jsonb; v_products jsonb; v_bands jsonb;
 v_incomes jsonb; v_orders jsonb; v_requests jsonb; v_memos jsonb; v_catalogue jsonb; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 SELECT jsonb_build_object('id',s.id,'userId',u.id,'name',s.employee_name,'email',u.email,'salary',s.basic_salary)
 INTO v_profile FROM public.hr_staff_costs s JOIN public.users u ON u.id=s.user_id WHERE s.id=v_staff;
 -- Public department directory permits Fair members to request IR transfers
 -- without exposing another department's roster or personal finances.
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'capacity',cap.headcount_limit,
 'occupied',(SELECT count(DISTINCT h.staff_id) FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id
 WHERE c.sub_department_id=d.id AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today))) ORDER BY d.created_at,d.id),'[]')
 INTO v_departments FROM public.comm_sub_departments d JOIN public.hr_staff_costs s ON s.department_id=d.department_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id WHERE s.id=v_staff AND d.is_active;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
 'title',coalesce(t.name,'Title 待配置'),'rank',coalesce(r.label,'Rank 待配置'),'rate',coalesce(r.product_rate,0),
 'calculator',(upper(d.code)='FAIR' OR lower(d.name)='fair') AND public.has_perm('member_quote'),
 'effective',h.effective_from,'capacity',cap.headcount_limit,'occupied',(SELECT count(DISTINCT x.staff_id)
 FROM public.comm_hierarchy x JOIN public.comm_schemes xc ON xc.id=x.scheme_id WHERE xc.sub_department_id=d.id
 AND x.effective_from<=v_today AND (x.effective_to IS NULL OR x.effective_to>=v_today)),
 'people',public.member_tree_json(c.id,v_staff)) ORDER BY d.created_at,d.id),'[]') INTO v_memberships
 FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 LEFT JOIN public.comm_ranks r ON r.id=h.rank_id LEFT JOIN public.titles t ON t.id=h.title_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE h.staff_id=v_staff AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
 AND d.is_active AND c.is_active AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today);

 -- The calculator's catalogue (2026-09-24): what Product List › Modular offers
 -- for the brands a calculator membership sells, plus the riders. No price.
 v_catalogue := public.member_catalogue(ARRAY(SELECT DISTINCT b.code FROM jsonb_array_elements(v_memberships) m
  JOIN public.comm_brands b ON b.scheme_id=(m->>'schemeId')::uuid WHERE (m->>'calculator')::boolean), NULL, false, 0);
 v_products := v_catalogue->'products';
 SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'key',m.label,'kind',m.kind,
 'threshold',m.margin_pct*100,'multiplier',m.commission_multiplier,'amount',m.monthly_incentive)),'[]') INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) x WHERE (x->>'schemeId')::uuid=m.scheme_id AND (x->>'calculator')::boolean);

 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.period DESC),'[]') INTO v_incomes FROM (
 SELECT r.period_month AS period,jsonb_build_object('schemeId',r.scheme_id,'period',to_char(r.period_month,'YYYY-MM'),
 'status',r.status,'personal',s.product_commission,'override',s.override_commission,'kpi',s.kpi_commission,
 'openBill',s.open_bill_bonus,'incentive',s.margin_incentive,'group',s.group_incentive,'total',s.total_commission,
 'sales',s.product_revenue,'groupSales',s.group_revenue,'deferred',s.deferred_revenue,
 'rank',coalesce(cr.label,s.rank_key,'Rank 待配置'),'rate',s.product_rate,
 'kpis',jsonb_build_array(jsonb_build_object('label','个人销售','current',s.product_revenue,'target',cr.personal_sales_threshold,'unit','RM'),
 jsonb_build_object('label','团队销售','current',s.group_revenue,'target',cr.group_sales_threshold,'unit','RM'))
 || CASE WHEN c.enable_kpi THEN jsonb_build_array(jsonb_build_object('label','KPI 商品','current',s.kpi_qty,'target',
 (SELECT min(k.min_qty) FROM public.comm_kpi_thresholds k WHERE k.scheme_id=c.id AND k.min_qty>s.kpi_qty),'unit','件')) ELSE '[]'::jsonb END,
 'brands',(SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.brand_code,'margin',b.margin_pct*100,'revenue',b.revenue,'tier',b.top_band_key)),'[]')
 FROM public.comm_statement_brand_margins b WHERE b.statement_id=s.id)) AS payload
 FROM public.comm_statements s JOIN public.comm_runs r ON r.id=s.run_id JOIN public.comm_schemes c ON c.id=r.scheme_id
 LEFT JOIN public.comm_ranks cr ON cr.scheme_id=r.scheme_id AND cr.rank_key=s.rank_key
 WHERE s.staff_id=v_staff AND r.period_month>=date_trunc('month',v_today)-interval '12 months'
 ) x;

 -- Recent own Fair orders retain their source-month window and 200-row cap.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',f.order_id,'number',f.order_no,'brand',f.brand,'revenue',f.revenue,
  'marginRevenue',f.goods_revenue,'margin',f.margin_pct*100,'date',f.order_date,'manual',f.manual
 ) ORDER BY f.order_date DESC,f.order_no DESC),'[]'::jsonb) INTO v_orders
 FROM (
  SELECT facts.* FROM public.comm_sub_departments d
  JOIN LATERAL (
   SELECT c.id FROM public.comm_schemes c WHERE c.sub_department_id=d.id AND c.is_active
    AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
    AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
     AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today))
   ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1
  ) scheme ON true
  CROSS JOIN LATERAL public.member_order_facts(scheme.id,NULL,NULL) facts
  WHERE d.is_active AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
   AND public.member_has_membership(v_staff,d.id) AND facts.staff_id=v_staff
   AND facts.source_period>=date_trunc('month',v_today)-interval '1 month'
  ORDER BY facts.order_date DESC,facts.order_no DESC LIMIT 200
 ) f;

 IF public.has_perm('member_requests') THEN
 SELECT coalesce(jsonb_agg(public.member_request_json(r.id) ORDER BY r.created_at DESC),'[]') INTO v_requests
 FROM public.member_requests r WHERE r.created_by=auth.uid() AND r.status<>'draft';
 END IF;
 IF public.has_perm('member_memos') THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'sender',m.sender,
 'publishedAt',m.published_at,'effectiveAt',m.effective_at,'version',m.version,'requiresAck',m.requires_ack,
 'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at,'departments',(SELECT jsonb_agg(d.name) FROM public.member_memo_audiences a
 JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id)) ORDER BY m.published_at DESC),'[]') INTO v_memos
 FROM public.member_memos m LEFT JOIN public.member_memo_receipts r ON r.memo_id=m.id AND r.user_id=auth.uid() AND r.version=m.version
 WHERE public.member_visible_memo(m.id,v_staff);
 END IF;
 RETURN jsonb_build_object('demo',false,'configured',true,'refreshedAt',now(),'profile',v_profile,
 'memberships',v_memberships,'departments',v_departments,'products',v_products,
 'catalogueModels',coalesce(v_catalogue->'models','[]'::jsonb),'bands',v_bands,'incomes',v_incomes,
 'orders',v_orders,'requests',coalesce(v_requests,'[]'),'memos',coalesce(v_memos,'[]'));
END $function$;

-- ── 5. …and so does the Principal's ─────────────────────────────────────────
-- Identical to the live definition (20260917040000) except the catalogue block
-- and the `catalogueModels` key.
CREATE OR REPLACE FUNCTION public.member_principal_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_profile jsonb;
 v_memberships jsonb;
 v_departments jsonb;
 v_products jsonb;
 v_bands jsonb;
 v_incomes jsonb;
 v_orders jsonb;
 v_requests jsonb;
 v_memos jsonb;
 v_catalogue jsonb;
 v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 SELECT jsonb_build_object(
  'id',u.id,'userId',u.id,'name',coalesce(nullif(u.name,''),'Principal'),
  'email',coalesce(u.email,''),'salary',NULL
 ) INTO v_profile
 FROM public.users u
 WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active;
 IF v_profile IS NULL THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;

 -- Include departments without a roster or staff-account links. A current
 -- scheme supplies the valid quotation/routing identity for an empty roster.
 WITH positions AS (
  SELECT DISTINCT c.sub_department_id,h.staff_id
  FROM public.comm_hierarchy h
  JOIN public.comm_schemes c ON c.id=h.scheme_id
  JOIN public.hr_staff_costs s ON s.id=h.staff_id
  WHERE c.is_active AND c.effective_from<=v_today
  AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
  AND s.status='active' AND (s.hire_date IS NULL OR s.hire_date<=v_today)
  AND (s.resignation_date IS NULL OR s.resignation_date>=v_today)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'name',d.name,'capacity',cap.headcount_limit,
  'occupied',(SELECT count(*) FROM positions p WHERE p.sub_department_id=d.id)
 ) ORDER BY d.created_at,d.id),'[]'::jsonb) INTO v_departments
 FROM public.comm_sub_departments d
 JOIN public.departments department ON department.id=d.department_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE d.is_active AND department.payroll_source='commission';

 WITH positions AS (
  SELECT h.*,s.employee_name
  FROM public.comm_hierarchy h JOIN public.hr_staff_costs s ON s.id=h.staff_id
  WHERE h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
  AND s.status='active' AND (s.hire_date IS NULL OR s.hire_date<=v_today)
  AND (s.resignation_date IS NULL OR s.resignation_date>=v_today)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
  'title','Principal','rank','All members','rate',0,
  'calculator',coalesce(upper(d.code)='FAIR' OR lower(d.name)='fair',false),
  'effective',c.effective_from,'capacity',cap.headcount_limit,
  'occupied',coalesce((SELECT (x->>'occupied')::integer
   FROM jsonb_array_elements(v_departments) x WHERE x->>'id'=d.id::text),0),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',h.staff_id,'name',h.employee_name,
   'title',coalesce(t.name,'Title pending'),'rank',coalesce(r.label,'Rank pending'),
   'parentId',CASE WHEN EXISTS(SELECT 1 FROM positions parent
    WHERE parent.scheme_id=c.id AND parent.staff_id=h.upline_staff_id) THEN h.upline_staff_id END,
   'self',false
  ) ORDER BY h.employee_name,h.staff_id),'[]'::jsonb)
   FROM positions h LEFT JOIN public.titles t ON t.id=h.title_id
   LEFT JOIN public.comm_ranks r ON r.id=h.rank_id WHERE h.scheme_id=c.id)
 ) ORDER BY d.created_at,d.id,c.effective_from DESC,c.id),'[]'::jsonb) INTO v_memberships
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 JOIN public.departments department ON department.id=d.department_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE department.payroll_source='commission' AND d.is_active AND c.is_active
 AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today);

 -- The calculator's catalogue (2026-09-24), exactly what a member sees: no
 -- price, even for the Principal's Revenue View.
 v_catalogue := public.member_catalogue(ARRAY(SELECT DISTINCT b.code FROM jsonb_array_elements(v_memberships) x
  JOIN public.comm_brands b ON b.scheme_id=(x->>'schemeId')::uuid
  WHERE (x->>'calculator')::boolean AND b.is_active), NULL, false, 0);
 v_products := v_catalogue->'products';
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'brand',b.code,'key',m.label,'kind',m.kind,'threshold',m.margin_pct*100,
  'multiplier',m.commission_multiplier,'amount',m.monthly_incentive
 ) ORDER BY b.code,m.margin_pct,m.id),'[]'::jsonb) INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id
 WHERE b.is_active AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) x
  WHERE (x->>'schemeId')::uuid=m.scheme_id AND (x->>'calculator')::boolean);

 -- Each department has one run per month; each run has one statement per
 -- staff member. Select the latest run per scheme/month explicitly, then sum
 -- those statements once. group_revenue includes downlines and MUST NOT be
 -- added across staff. Team sales is the sum of personal product_revenue.
 -- Rank targets and statement brand margins are not additive team metrics.
 WITH latest_runs AS (
  SELECT DISTINCT ON (r.scheme_id,r.period_month) r.*
  FROM public.comm_runs r
  JOIN public.comm_sub_departments d ON d.id=r.sub_department_id
  JOIN public.departments department ON department.id=d.department_id
  WHERE department.payroll_source='commission'
  AND r.period_month>=date_trunc('month',v_today)-interval '12 months'
  ORDER BY r.scheme_id,r.period_month,r.created_at DESC,r.id DESC
 ), totals AS (
  SELECT r.id,r.scheme_id,r.period_month,r.status,
   sum(s.product_commission) AS personal,sum(s.override_commission) AS override_amount,
   sum(s.kpi_commission) AS kpi,sum(s.open_bill_bonus) AS open_bill,
   sum(s.margin_incentive) AS incentive,sum(s.group_incentive) AS group_amount,
   sum(s.total_commission) AS total,sum(s.product_revenue) AS sales,
   sum(s.deferred_revenue) AS deferred,sum(s.kpi_qty) AS kpi_qty
  FROM latest_runs r JOIN public.comm_statements s ON s.run_id=r.id
  GROUP BY r.id,r.scheme_id,r.period_month,r.status
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'schemeId',s.scheme_id,'period',to_char(s.period_month,'YYYY-MM'),'status',s.status,
  'personal',s.personal,'override',s.override_amount,'kpi',s.kpi,'openBill',s.open_bill,
  'incentive',s.incentive,'group',s.group_amount,'total',s.total,
  'sales',s.sales,'groupSales',s.sales,'deferred',s.deferred,'rank','All members','rate',0,
  'kpis',jsonb_build_array(jsonb_build_object(
   'label','Team sales','current',s.sales,'target',NULL,'unit','RM'
  )) || CASE WHEN c.enable_kpi THEN jsonb_build_array(jsonb_build_object(
   'label','KPI products','current',s.kpi_qty,'target',NULL,'unit','items'
  )) ELSE '[]'::jsonb END,
  'brands','[]'::jsonb
 ) ORDER BY s.period_month DESC,s.scheme_id),'[]'::jsonb) INTO v_incomes
 FROM totals s JOIN public.comm_schemes c ON c.id=s.scheme_id;

 -- Recent Fair orders preserve the source-month window and actual Principal
 -- scope, while using the same latest-document and goods-margin facts as Insight.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',f.order_id,'schemeId',scheme.id,'number',f.order_no,'brand',f.brand,'revenue',f.revenue,
  'marginRevenue',f.goods_revenue,'margin',f.margin_pct*100,'date',f.order_date,'manual',f.manual
 ) ORDER BY f.order_date DESC,f.order_id),'[]'::jsonb) INTO v_orders
 FROM public.comm_sub_departments d
 JOIN public.departments department ON department.id=d.department_id
 JOIN LATERAL (
  SELECT c.id FROM public.comm_schemes c
  WHERE c.sub_department_id=d.id AND c.is_active AND c.effective_from<=v_today
   AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1
 ) scheme ON true
 CROSS JOIN LATERAL public.member_order_facts(scheme.id,NULL,NULL) f
 WHERE d.is_active AND department.payroll_source='commission'
  AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
  AND f.source_period>=date_trunc('month',v_today)-interval '1 month';

 SELECT coalesce(jsonb_agg(public.member_request_json(r.id)
  ORDER BY r.created_at DESC,r.id),'[]'::jsonb) INTO v_requests
 FROM public.member_requests r
 JOIN public.comm_sub_departments d ON d.id=r.sub_department_id
 JOIN public.departments department ON department.id=d.department_id
 WHERE r.status<>'draft' AND department.payroll_source='commission';

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'title',m.title,'body',m.body,'sender',m.sender,
  'publishedAt',m.published_at,'effectiveAt',m.effective_at,
  'version',m.version,'requiresAck',m.requires_ack,
  'readAt',receipt.read_at,'acknowledgedAt',receipt.acknowledged_at,
  'departments',(SELECT coalesce(jsonb_agg(d.name ORDER BY d.name),'[]'::jsonb)
   FROM public.member_memo_audiences a
   JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id)
 ) ORDER BY m.published_at DESC,m.id),'[]'::jsonb) INTO v_memos
 FROM public.member_memos m
 LEFT JOIN public.member_memo_receipts receipt
  ON receipt.memo_id=m.id AND receipt.user_id=auth.uid() AND receipt.version=m.version
 WHERE EXISTS(SELECT 1 FROM public.member_memo_audiences a
  JOIN public.comm_sub_departments d ON d.id=a.sub_department_id
  JOIN public.departments department ON department.id=d.department_id
  WHERE a.memo_id=m.id AND department.payroll_source='commission');

 RETURN jsonb_build_object(
  'demo',false,'configured',true,'principalView',true,'refreshedAt',now(),
  'profile',v_profile,'memberships',v_memberships,'departments',v_departments,
  'products',v_products,'catalogueModels',coalesce(v_catalogue->'models','[]'::jsonb),
  'bands',v_bands,'incomes',v_incomes,'orders',v_orders,
  'requests',v_requests,'memos',v_memos
 );
END $function$;

NOTIFY pgrst, 'reload schema';
