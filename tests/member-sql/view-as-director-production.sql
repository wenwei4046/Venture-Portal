-- Production's own text of the two functions 20261023100000 swaps a statement into, whose last repo copy is not
-- production's (read from pg_get_functiondef on 2026-10-23; md5(prosrc) member_principal_context(uuid,uuid,uuid)
-- 04ccd4e04e98834263f0c35837cfa2b1, member_principal_snapshot(boolean) 80abc002c770035b9e5c04db014d306a). Loaded by validate-view-as-director.mjs,
-- which checks both md5s before running the migration over them.

CREATE OR REPLACE FUNCTION public.member_principal_context(p_staff uuid, p_sub_department uuid, p_scheme uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_department uuid:=public.member_principal_department(p_sub_department);
 v_scheme uuid; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 SELECT c.id INTO v_scheme FROM public.comm_hierarchy h
 JOIN public.comm_schemes c ON c.id=h.scheme_id
 JOIN public.hr_staff_costs s ON s.id=h.staff_id
 LEFT JOIN public.titles t ON t.id=h.title_id LEFT JOIN public.titles st ON st.id=s.title_id
 WHERE s.id=p_staff AND s.department_id=v_department AND s.status='active'
  AND (s.hire_date IS NULL OR s.hire_date<=v_today)
  AND (s.resignation_date IS NULL OR s.resignation_date>=v_today)
  AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  AND c.sub_department_id=p_sub_department AND (p_scheme IS NULL OR c.id=p_scheme)
  AND c.is_active AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
 ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1;
 IF v_scheme IS NULL THEN
  RAISE EXCEPTION 'The selected member needs an active membership in this department' USING ERRCODE='42501';
 END IF;
 RETURN v_scheme;
END $function$;

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
  'id',u.id,'userId',u.id,'name',coalesce(nullif(u.name,''),'Principal'),'firstName',coalesce((SELECT nullif(btrim(fs.first_name),'') FROM public.hr_staff_costs fs WHERE fs.user_id=u.id AND fs.status='active' ORDER BY fs.created_at LIMIT 1),(public.person_name_parts(coalesce(nullif(u.name,''),'Principal'))).first_name),
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
  'readAt',receipt.read_at,'acknowledgedAt',receipt.acknowledged_at,'kind',m.kind,'attachmentName',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_name END,'attachmentType',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_type END,
  'departments',(SELECT coalesce(jsonb_agg(d.name ORDER BY d.name),'[]'::jsonb)
   FROM public.member_memo_audiences a
   JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id),
  'recipients',(SELECT coalesce(jsonb_agg(x.staff_id ORDER BY x.staff_id),'[]'::jsonb)
   FROM public.member_memo_recipients x WHERE x.memo_id=m.id)
 ) ORDER BY m.published_at DESC,m.id),'[]'::jsonb) INTO v_memos
 FROM public.member_memos m
 LEFT JOIN public.member_memo_receipts receipt
  ON receipt.memo_id=m.id AND receipt.user_id=auth.uid() AND receipt.version=m.version
 WHERE EXISTS(SELECT 1 FROM public.member_memo_audiences a
  JOIN public.comm_sub_departments d ON d.id=a.sub_department_id
  JOIN public.departments department ON department.id=d.department_id
  WHERE a.memo_id=m.id AND department.payroll_source='commission')
  OR EXISTS(SELECT 1 FROM public.member_memo_recipients x
  JOIN public.hr_staff_costs s ON s.id=x.staff_id
  JOIN public.departments dd ON dd.id=s.department_id
  WHERE x.memo_id=m.id AND dd.payroll_source='commission');

 RETURN jsonb_build_object(
  'demo',false,'configured',true,'principalView',true,'refreshedAt',now(),
  'profile',v_profile,'memberships',v_memberships,'departments',v_departments,
  'products',v_products,'catalogueModels',coalesce(v_catalogue->'models','[]'::jsonb),
  'bands',v_bands,'incomes',v_incomes,'orders',v_orders,
  'requests',v_requests,'memos',v_memos
 );
END $function$;
