-- Member catalogue: riders, sofa cost grids and the Revenue Team cost basis
-- (user 2026-09-12).
--
--  1. RIDERS. Bed frames and accessories carry NO brand: they join any cart
--     and follow the mattress or sofa's margin rules. The member catalogue
--     therefore shows brand-less products beside the brands a calculator
--     membership sells (before this, a product was visible only when its
--     brand_code matched a comm_brands row).
--  2. SOFA GRIDS. A sofa is costed the ERP way: per module, per (seat
--     height, fabric tier), summed over the modules in the cart.
--     comm_products.cost_grid mirrors mfg_products.seat_height_prices —
--     [{"height":"24","tier":"PRICE_1","cost":805}, …]. The member reads the
--     CHOICES (member_cost_options: height + tier, no cost); the priced grid
--     stays behind the server-only quote path like unit_cost does.
--  3. COST BASIS. Revenue Team cost = unit cost ÷ comm_schemes
--     .revenue_cost_divisor ("cost / 0.7 = revenue fair department team
--     cost"). The calculator, the members' order margins and the commission
--     run all judge margin on that cost, so the ladder means one thing.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, guarded UPDATE.

ALTER TABLE public.comm_schemes
  ADD COLUMN IF NOT EXISTS revenue_cost_divisor numeric(6,4) NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_schemes_revenue_cost_divisor_check') THEN
    ALTER TABLE public.comm_schemes
      ADD CONSTRAINT comm_schemes_revenue_cost_divisor_check
      CHECK (revenue_cost_divisor > 0 AND revenue_cost_divisor <= 10);
  END IF;
END $$;
COMMENT ON COLUMN public.comm_schemes.revenue_cost_divisor IS
  'Revenue Team cost = unit cost ÷ this. Every margin rule (member calculator, order margins, commission run) judges that cost. 1 = the cost as keyed; Fair 0.7 (user 2026-09-12).';

ALTER TABLE public.comm_products
  ADD COLUMN IF NOT EXISTS cost_grid jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_products_cost_grid_check') THEN
    ALTER TABLE public.comm_products
      ADD CONSTRAINT comm_products_cost_grid_check
      CHECK (cost_grid IS NULL OR jsonb_typeof(cost_grid) = 'array');
  END IF;
END $$;
COMMENT ON COLUMN public.comm_products.cost_grid IS
  'Sofa modules only: [{height, tier (PRICE_1/2/3), cost}] — the ERP seat_height_prices shape. A product with a grid is costed from it for the cart''s chosen seat height and fabric tier; unit_cost is the flat fallback.';

-- Fair judges margin on cost ÷ 0.7 (user 2026-09-12). Only the untouched default is set.
UPDATE public.comm_schemes c SET revenue_cost_divisor = 0.7, updated_at = now()
FROM public.comm_sub_departments d
WHERE d.id = c.sub_department_id
  AND (upper(coalesce(d.code, '')) = 'FAIR' OR lower(d.name) = 'fair')
  AND c.revenue_cost_divisor = 1;

-- The choices a grid offers, without the costs.
CREATE OR REPLACE FUNCTION public.member_cost_options(p_grid jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('height',g->>'height','tier',g->>'tier')),'[]'::jsonb)
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_grid)='array' THEN p_grid ELSE '[]'::jsonb END) g
 WHERE g ? 'height' AND g ? 'tier';
$$;

-- ── Quote contexts carry the divisor ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.member_quote_context(p_scheme uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_sub uuid; v_bands jsonb; v_divisor numeric;
BEGIN
 IF NOT public.has_perm('member_quote') THEN RAISE EXCEPTION 'Quotation access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT d.id,c.revenue_cost_divisor INTO v_sub,v_divisor FROM public.comm_schemes c JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
 AND c.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AND (c.effective_to IS NULL OR c.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 AND public.member_has_membership(v_staff,d.id)
 AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
 AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date));
 IF v_sub IS NULL THEN RAISE EXCEPTION 'An active Fair membership is required for quotation' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'key',m.label,'kind',m.kind,
 'threshold',m.margin_pct*100,'multiplier',m.commission_multiplier,'amount',m.monthly_incentive)),'[]') INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id WHERE m.scheme_id=p_scheme;
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands,'costDivisor',coalesce(v_divisor,1));
END $$;

CREATE OR REPLACE FUNCTION public.member_principal_quote_context(p_scheme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_sub uuid;
 v_bands jsonb;
 v_divisor numeric;
 v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active
 ) THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;

 SELECT d.id,c.revenue_cost_divisor INTO v_sub,v_divisor
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
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands,'costDivisor',coalesce(v_divisor,1));
END $$;

-- ── Member snapshot: riders + grid options; order margins on the team cost ──
CREATE OR REPLACE FUNCTION public.member_data_snapshot() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_profile jsonb; v_memberships jsonb; v_departments jsonb; v_products jsonb; v_bands jsonb;
 v_incomes jsonb; v_orders jsonb; v_requests jsonb; v_memos jsonb; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
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

 -- Catalogues and margin bands are Fair-only and contain no unit costs.
 -- Riders (no brand: bed frames, accessories) show beside the brands a
 -- calculator membership sells; a grid product exposes its choices only.
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.item_code,'name',coalesce(p.product_name,p.item_code),
 'brand',p.brand_code,'category',o.category,'size',o.size,'color',o.color,'available',o.available AND p.is_active,
 'gift',o.gift,'options',public.member_cost_options(p.cost_grid),
 'version',concat(to_jsonb(p.updated_at)#>>'{}',':',to_jsonb(o.updated_at)#>>'{}')) ORDER BY p.item_code),'[]') INTO v_products
 FROM public.comm_products p JOIN public.member_product_options o ON o.product_id=p.id
 WHERE p.is_active
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m WHERE (m->>'calculator')::boolean)
 AND (p.brand_code IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m JOIN public.comm_brands b ON b.scheme_id=(m->>'schemeId')::uuid
 WHERE (m->>'calculator')::boolean AND b.code=p.brand_code));
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

 -- An order's margin is judged on the Revenue Team cost (cost ÷ the scheme's divisor).
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number',o.order_no,'brand',coalesce(o.brand_code,'未分类'),
 'revenue',coalesce(b.revenue,0),'margin',CASE WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct*100
 WHEN b.complete AND b.revenue>0 THEN (b.revenue-b.cost/coalesce(sch.divisor,1))/b.revenue*100 ELSE NULL END,
 'date',o.order_date,'manual',o.manual_margin_pct IS NOT NULL) ORDER BY o.order_date DESC),'[]') INTO v_orders
 FROM (SELECT so.* FROM public.sales_orders so JOIN public.sales_import_batches ib ON ib.id=so.batch_id
 JOIN public.comm_sub_departments sd ON sd.id=ib.sub_department_id
 WHERE so.staff_id=v_staff AND ib.status='committed' AND NOT so.cancelled
 AND (upper(sd.code)='FAIR' OR lower(sd.name)='fair') AND public.member_has_membership(v_staff,sd.id)
 AND so.period_month>=date_trunc('month',v_today)-interval '1 month' ORDER BY so.order_date DESC LIMIT 200) o
 JOIN public.sales_import_batches ib ON ib.id=o.batch_id
 LEFT JOIN LATERAL(SELECT c.revenue_cost_divisor AS divisor FROM public.comm_schemes c
 WHERE c.sub_department_id=ib.sub_department_id AND c.is_active AND c.effective_from<=v_today
 AND (c.effective_to IS NULL OR c.effective_to>=v_today) ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1) sch ON true
 LEFT JOIN LATERAL(SELECT sum(l.line_amount) AS revenue,sum(l.cost_amount) AS cost,bool_and(l.cost_amount IS NOT NULL) AS complete
 FROM public.sales_order_lines l WHERE l.order_id=o.id AND EXISTS(
 SELECT 1 FROM public.comm_schemes c WHERE c.sub_department_id=ib.sub_department_id AND c.is_active
 AND (EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=c.id AND g.item_group=l.item_group AND g.commissionable)
 OR EXISTS(SELECT 1 FROM public.comm_kpi_items k WHERE k.scheme_id=c.id AND upper(trim(k.product_code))=upper(trim(l.product_code))
 AND k.effective_from<=o.order_date AND (k.effective_to IS NULL OR k.effective_to>=o.order_date)))
 )) b ON true;

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
 'memberships',v_memberships,'departments',v_departments,'products',v_products,'bands',v_bands,'incomes',v_incomes,
 'orders',v_orders,'requests',coalesce(v_requests,'[]'),'memos',coalesce(v_memos,'[]'));
END $$;

-- ── Principal snapshot: the same catalogue and order-margin rules ────────────
CREATE OR REPLACE FUNCTION public.member_principal_snapshot() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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

 -- The existing published metadata is mandatory. Unpublished ERP products and
 -- costs are not part of this response, even for Principal Revenue View.
 -- Riders (no brand) show beside the brands a calculator scheme sells.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'code',p.item_code,'name',coalesce(p.product_name,p.item_code),
  'brand',p.brand_code,'category',o.category,'size',o.size,'color',o.color,
  'available',o.available AND p.is_active,'gift',o.gift,
  'options',public.member_cost_options(p.cost_grid),
  'version',concat(to_jsonb(p.updated_at)#>>'{}',':',to_jsonb(o.updated_at)#>>'{}')
 ) ORDER BY p.item_code,p.id),'[]'::jsonb) INTO v_products
 FROM public.comm_products p JOIN public.member_product_options o ON o.product_id=p.id
 WHERE p.is_active
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) x WHERE (x->>'calculator')::boolean)
 AND (p.brand_code IS NULL OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(v_memberships) x
  JOIN public.comm_brands b ON b.scheme_id=(x->>'schemeId')::uuid
  WHERE (x->>'calculator')::boolean AND b.is_active AND b.code=p.brand_code
 ));
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

 -- Recent committed Fair orders, across all staff. Resolve a current scheme
 -- once per order so a historical bounded scheme cannot duplicate an order.
 -- Preserve the member goods/KPI margin rule, including manual margin and
 -- incomplete-cost handling. Service/miscellaneous fee lines are excluded.
 -- The margin is judged on the Revenue Team cost (cost ÷ the scheme's divisor).
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'schemeId',scheme.id,'number',o.order_no,
  'brand',coalesce(o.brand_code,'Unclassified'),'revenue',coalesce(goods.revenue,0),
  'margin',CASE WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct*100
   WHEN goods.complete AND goods.revenue>0 THEN (goods.revenue-goods.cost/coalesce(scheme.divisor,1))/goods.revenue*100
   ELSE NULL END,'date',o.order_date,'manual',o.manual_margin_pct IS NOT NULL
 ) ORDER BY o.order_date DESC,o.id),'[]'::jsonb) INTO v_orders
 FROM public.sales_orders o
 JOIN public.sales_import_batches batch ON batch.id=o.batch_id
 JOIN public.comm_sub_departments d ON d.id=batch.sub_department_id
 JOIN public.departments department ON department.id=d.department_id
 JOIN LATERAL (
  SELECT c.id,c.revenue_cost_divisor AS divisor FROM public.comm_schemes c
  WHERE c.sub_department_id=d.id AND c.is_active AND c.effective_from<=v_today
  AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1
 ) scheme ON true
 LEFT JOIN LATERAL (
  SELECT sum(l.line_amount) AS revenue,sum(l.cost_amount) AS cost,
   bool_and(l.cost_amount IS NOT NULL) AS complete
  FROM public.sales_order_lines l WHERE l.order_id=o.id AND (
   EXISTS(SELECT 1 FROM public.comm_item_groups g
    WHERE g.scheme_id=scheme.id AND g.item_group=l.item_group AND g.commissionable)
   OR EXISTS(SELECT 1 FROM public.comm_kpi_items k
    WHERE k.scheme_id=scheme.id AND upper(trim(k.product_code))=upper(trim(l.product_code))
    AND k.effective_from<=o.order_date AND (k.effective_to IS NULL OR k.effective_to>=o.order_date))
  )
 ) goods ON true
 WHERE batch.status='committed' AND NOT o.cancelled AND d.is_active
 AND department.payroll_source='commission' AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
 AND o.period_month>=date_trunc('month',v_today)-interval '1 month';

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
  'products',v_products,'bands',v_bands,'incomes',v_incomes,'orders',v_orders,
  'requests',v_requests,'memos',v_memos
 );
END $$;

REVOKE ALL ON FUNCTION public.member_cost_options(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_cost_options(jsonb) TO authenticated;
