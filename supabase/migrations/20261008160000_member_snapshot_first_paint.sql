-- The Revenue app's first screen without the Quote's catalogue (2026-10-08).
--
-- User: 每次进来好像都在 loading … 我要它做到真正的快. Measured on production: every
-- open of /member waited for member_principal_snapshot() — 610 ms warm, 2.1 s cold,
-- 480 KB — and 551 ms / 340 KB of it is member_catalogue(), the Quote's catalogue,
-- which Today, Insight, Arena and Profile never read. A further 119 KB is `orders`,
-- which nothing in the Revenue app reads any more. The DB is the smallest compute,
-- so every open paying ~0.6 s of CPU for a page it does not show is also what makes
-- two people opening the app at once wait 4–9 s.
--
-- Both snapshots gain an overload with `p_full boolean` — NO default, so the old
-- zero-argument call is never ambiguous (the MCP cannot DROP FUNCTION here; see
-- mig 20261004020000 for the same pattern). Its body is production's body with two
-- `IF p_full THEN … END IF;` guards and nothing else (checked by md5 when this
-- file was generated, and again below): p_full = false leaves out the catalogue
-- (products, catalogueModels) and the recent orders, and the app reads the
-- catalogue on its own when the Quote needs it (`member_*_snapshot()`, unchanged
-- output). The zero-argument functions keep their name, grants and output — they
-- are now `(true)` — so the old workspace, the preview and the tests see no change.

-- ── member_data_snapshot(p_full) ──
CREATE OR REPLACE FUNCTION public.member_data_snapshot(p_full boolean)
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
 IF p_full THEN
 v_catalogue := public.member_catalogue(ARRAY(SELECT DISTINCT b.code FROM jsonb_array_elements(v_memberships) m
  JOIN public.comm_brands b ON b.scheme_id=(m->>'schemeId')::uuid WHERE (m->>'calculator')::boolean), NULL, false, 0);
 v_products := v_catalogue->'products';
 END IF;
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

 IF p_full THEN
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
 END IF;

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

REVOKE ALL ON FUNCTION public.member_data_snapshot(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_data_snapshot(boolean) TO authenticated, service_role;


-- ── member_principal_snapshot(p_full) ──
CREATE OR REPLACE FUNCTION public.member_principal_snapshot(p_full boolean)
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
 IF p_full THEN
 v_catalogue := public.member_catalogue(ARRAY(SELECT DISTINCT b.code FROM jsonb_array_elements(v_memberships) x
  JOIN public.comm_brands b ON b.scheme_id=(x->>'schemeId')::uuid
  WHERE (x->>'calculator')::boolean AND b.is_active), NULL, false, 0);
 v_products := v_catalogue->'products';
 END IF;
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

 IF p_full THEN
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
 END IF;

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

REVOKE ALL ON FUNCTION public.member_principal_snapshot(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_principal_snapshot(boolean) TO authenticated, service_role;

-- ── the zero-argument calls: the full snapshot, as before ──
CREATE OR REPLACE FUNCTION public.member_data_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN public.member_data_snapshot(true);
END $function$;

CREATE OR REPLACE FUNCTION public.member_principal_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 RETURN public.member_principal_snapshot(true);
END $function$;

DO $$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.member_data_snapshot(boolean)'::regprocedure)) <> '79d03374ab02b2280cc0ca91f9d889b6' THEN
    RAISE EXCEPTION 'member_data_snapshot(boolean) is not the body this file was generated with';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.member_principal_snapshot(boolean)'::regprocedure)) <> 'a630b01fd33eaf275fc8bd7b4f7fa059' THEN
    RAISE EXCEPTION 'member_principal_snapshot(boolean) is not the body this file was generated with';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
