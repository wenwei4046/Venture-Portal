-- Deliberately project JSON instead of opening salary/order tables to members.
CREATE FUNCTION public.member_tree_json(p_scheme uuid,p_staff uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH RECURSIVE positions AS (
 SELECT h.* FROM public.comm_hierarchy h WHERE h.scheme_id=p_scheme
 AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
 AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 ), tree AS (
 SELECT h.staff_id,ARRAY[h.staff_id] AS visited,0 AS depth FROM positions h WHERE h.staff_id=p_staff
 UNION ALL SELECT h.staff_id,t.visited||h.staff_id,t.depth+1 FROM positions h JOIN tree t ON h.upline_staff_id=t.staff_id
 WHERE t.depth<20 AND NOT h.staff_id=ANY(t.visited)
 ), visible AS (
 SELECT staff_id FROM tree UNION SELECT upline_staff_id FROM positions WHERE staff_id=p_staff AND upline_staff_id IS NOT NULL
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.employee_name,
 'title',coalesce(t.name,'Title 待配置'),'rank',coalesce(r.label,'Rank 待配置'),
 'parentId',CASE WHEN h.upline_staff_id IN(SELECT staff_id FROM visible) THEN h.upline_staff_id END,'self',s.id=p_staff)
 ORDER BY s.employee_name),'[]'::jsonb)
 FROM visible v JOIN public.hr_staff_costs s ON s.id=v.staff_id JOIN positions h ON h.staff_id=s.id
 LEFT JOIN public.titles t ON t.id=h.title_id LEFT JOIN public.comm_ranks r ON r.id=h.rank_id;
$$;
CREATE FUNCTION public.member_quote_context(p_scheme uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_sub uuid; v_bands jsonb;
BEGIN
 IF NOT public.has_perm('member_quote') THEN RAISE EXCEPTION 'Quotation access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT d.id INTO v_sub FROM public.comm_schemes c JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
 AND c.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AND (c.effective_to IS NULL OR c.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
 AND public.member_has_membership(v_staff,d.id)
 AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
 AND h.effective_from<=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AND (h.effective_to IS NULL OR h.effective_to>=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date));
 IF v_sub IS NULL THEN RAISE EXCEPTION 'An active Fair membership is required for quotation' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'key',m.label,'kind',m.kind,
 'threshold',m.margin_pct*100,'multiplier',m.commission_multiplier,'amount',m.monthly_incentive)),'[]') INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id WHERE m.scheme_id=p_scheme;
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands);
END $$;

CREATE FUNCTION public.member_data_snapshot() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.item_code,'name',coalesce(p.product_name,p.item_code),
 'brand',p.brand_code,'category',o.category,'size',o.size,'color',o.color,'available',o.available AND p.is_active,
 'gift',o.gift,'version',concat(to_jsonb(p.updated_at)#>>'{}',':',to_jsonb(o.updated_at)#>>'{}')) ORDER BY p.item_code),'[]') INTO v_products
 FROM public.comm_products p JOIN public.member_product_options o ON o.product_id=p.id
 WHERE p.is_active AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m JOIN public.comm_brands b ON b.scheme_id=(m->>'schemeId')::uuid
 WHERE (m->>'calculator')::boolean AND b.code=p.brand_code);
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

 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number',o.order_no,'brand',coalesce(o.brand_code,'未分类'),
 'revenue',coalesce(b.revenue,0),'margin',CASE WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct*100
 WHEN b.complete AND b.revenue>0 THEN (b.revenue-b.cost)/b.revenue*100 ELSE NULL END,
 'date',o.order_date,'manual',o.manual_margin_pct IS NOT NULL) ORDER BY o.order_date DESC),'[]') INTO v_orders
 FROM (SELECT so.* FROM public.sales_orders so JOIN public.sales_import_batches ib ON ib.id=so.batch_id
 JOIN public.comm_sub_departments sd ON sd.id=ib.sub_department_id
 WHERE so.staff_id=v_staff AND ib.status='committed' AND NOT so.cancelled
 AND (upper(sd.code)='FAIR' OR lower(sd.name)='fair') AND public.member_has_membership(v_staff,sd.id)
 AND so.period_month>=date_trunc('month',v_today)-interval '1 month' ORDER BY so.order_date DESC LIMIT 200) o
 JOIN public.sales_import_batches ib ON ib.id=o.batch_id
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

CREATE FUNCTION public.member_acknowledge_memo(p_memo uuid,p_ack boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_version integer; v_receipt public.member_memo_receipts%ROWTYPE;
BEGIN
 IF NOT public.has_perm('member_memos') OR NOT public.member_visible_memo(p_memo,v_staff) THEN RAISE EXCEPTION 'Memo is not addressed to this account' USING ERRCODE='42501'; END IF;
 SELECT version INTO v_version FROM public.member_memos WHERE id=p_memo;
 INSERT INTO public.member_memo_receipts(memo_id,user_id,version,acknowledged_at) VALUES(p_memo,auth.uid(),v_version,CASE WHEN p_ack THEN now() END)
 ON CONFLICT(memo_id,user_id,version) DO UPDATE SET acknowledged_at=coalesce(member_memo_receipts.acknowledged_at,EXCLUDED.acknowledged_at)
 RETURNING * INTO v_receipt;
 RETURN jsonb_build_object('id',p_memo,'readAt',v_receipt.read_at,'acknowledgedAt',v_receipt.acknowledged_at,'version',v_version);
END $$;
REVOKE ALL ON FUNCTION public.member_tree_json(uuid,uuid),public.member_quote_context(uuid),public.member_data_snapshot(),public.member_acknowledge_memo(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_quote_context(uuid),public.member_data_snapshot(),public.member_acknowledge_memo(uuid,boolean) TO authenticated;
