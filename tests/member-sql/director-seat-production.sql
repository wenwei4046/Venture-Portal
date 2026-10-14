-- Production's own text of the two functions 20261014090000 swaps a statement into whose last repo copy
-- is older than production (read from pg_get_functiondef on 2026-10-14; md5(prosrc) member_data_snapshot(boolean)
-- f44dac41ed77726c9b53ac5ddec69be0, member_visible_memo a52d1aa6ef7c380b4097517e34c68f96). Loaded by
-- validate-director-seat.mjs, which checks both md5s before running the migration over them.

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
 'occupied',public.member_occupied(d.id,v_today)) ORDER BY d.created_at,d.id),'[]')
 INTO v_departments FROM public.comm_sub_departments d JOIN public.hr_staff_costs s ON s.department_id=d.department_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id WHERE s.id=v_staff AND d.is_active;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
 'title',coalesce(t.name,'Title 待配置'),'rank',coalesce(r.label,'Rank 待配置'),'rate',coalesce(r.product_rate,0),
 'calculator',(upper(d.code)='FAIR' OR lower(d.name)='fair') AND public.has_perm('member_quote'),
 'effective',h.effective_from,'capacity',cap.headcount_limit,'occupied',public.member_occupied(d.id,v_today),
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
 'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at,'kind',m.kind,'attachmentName',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_name END,'attachmentType',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_type END,'departments',(SELECT coalesce(jsonb_agg(d.name),'[]'::jsonb) FROM public.member_memo_audiences a
 JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id)) ORDER BY m.published_at DESC),'[]') INTO v_memos
 FROM public.member_memos m LEFT JOIN public.member_memo_receipts r ON r.memo_id=m.id AND r.user_id=auth.uid() AND r.version=m.version
 WHERE public.member_visible_memo(m.id,v_staff);
 END IF;
 RETURN jsonb_build_object('demo',false,'configured',true,'refreshedAt',now(),'profile',v_profile,
 'memberships',v_memberships,'departments',v_departments,'products',v_products,
 'catalogueModels',coalesce(v_catalogue->'models','[]'::jsonb),'bands',v_bands,'incomes',v_incomes,
 'orders',v_orders,'requests',coalesce(v_requests,'[]'),'memos',coalesce(v_memos,'[]'));
END $function$
;

CREATE OR REPLACE FUNCTION public.member_visible_memo(p_memo uuid, p_staff uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.member_memos m JOIN public.member_memo_audiences a ON a.memo_id=m.id
 WHERE m.id=p_memo AND m.published_at<=now() AND public.member_has_membership(p_staff,a.sub_department_id))
 OR EXISTS(SELECT 1 FROM public.member_memos m JOIN public.member_memo_recipients r ON r.memo_id=m.id
 WHERE m.id=p_memo AND m.published_at<=now() AND r.staff_id=p_staff);
$function$
;
