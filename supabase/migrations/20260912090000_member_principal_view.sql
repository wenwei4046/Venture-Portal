-- Principal Revenue View is an account-level overview, never a staff identity.
-- Keep the existing member_staff_id and member read/write policies unchanged.
CREATE FUNCTION public.member_principal_quote_context(p_scheme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_sub uuid;
 v_bands jsonb;
 v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active
 ) THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;

 SELECT d.id INTO v_sub
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
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands);
END $$;

CREATE FUNCTION public.member_principal_snapshot() RETURNS jsonb
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
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',p.id,'code',p.item_code,'name',coalesce(p.product_name,p.item_code),
  'brand',p.brand_code,'category',o.category,'size',o.size,'color',o.color,
  'available',o.available AND p.is_active,'gift',o.gift,
  'version',concat(to_jsonb(p.updated_at)#>>'{}',':',to_jsonb(o.updated_at)#>>'{}')
 ) ORDER BY p.item_code,p.id),'[]'::jsonb) INTO v_products
 FROM public.comm_products p JOIN public.member_product_options o ON o.product_id=p.id
 WHERE p.is_active AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(v_memberships) x
  JOIN public.comm_brands b ON b.scheme_id=(x->>'schemeId')::uuid
  WHERE (x->>'calculator')::boolean AND b.is_active AND b.code=p.brand_code
 );
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
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'schemeId',scheme.id,'number',o.order_no,
  'brand',coalesce(o.brand_code,'Unclassified'),'revenue',coalesce(goods.revenue,0),
  'margin',CASE WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct*100
   WHEN goods.complete AND goods.revenue>0 THEN (goods.revenue-goods.cost)/goods.revenue*100
   ELSE NULL END,'date',o.order_date,'manual',o.manual_margin_pct IS NOT NULL
 ) ORDER BY o.order_date DESC,o.id),'[]'::jsonb) INTO v_orders
 FROM public.sales_orders o
 JOIN public.sales_import_batches batch ON batch.id=o.batch_id
 JOIN public.comm_sub_departments d ON d.id=batch.sub_department_id
 JOIN public.departments department ON department.id=d.department_id
 JOIN LATERAL (
  SELECT c.id FROM public.comm_schemes c
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

REVOKE ALL ON FUNCTION public.member_principal_snapshot(),public.member_principal_quote_context(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_principal_snapshot(),public.member_principal_quote_context(uuid)
 TO authenticated;
