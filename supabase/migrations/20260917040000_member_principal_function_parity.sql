-- Principal C function parity: explicit read context, never a staff identity.
-- The original member_staff_id, membership permissions and ALL self-service
-- writes are untouched. Shared calculation helpers below are private; public
-- wrappers authorize either the caller's own staff or the actual Principal.

CREATE FUNCTION public.member_principal_department(p_sub_department uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_department uuid; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active) THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;
 SELECT department.id INTO v_department FROM public.comm_sub_departments d
 JOIN public.departments department ON department.id=d.department_id
 WHERE d.id=p_sub_department AND d.is_active AND department.payroll_source='commission'
  AND EXISTS(SELECT 1 FROM public.comm_schemes c WHERE c.sub_department_id=d.id AND c.is_active
   AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today));
 IF v_department IS NULL THEN
  RAISE EXCEPTION 'An active Revenue department is required' USING ERRCODE='42501';
 END IF;
 RETURN v_department;
END $$;

CREATE FUNCTION public.member_principal_context(p_staff uuid,p_sub_department uuid,p_scheme uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
END $$;

-- Calculation bodies are lifted from the established member RPCs. The selected
-- staff is a data parameter only, never auth.uid() or a changed session claim.
CREATE FUNCTION public.member_insight_for_staff(p_staff uuid,p_period text,p_sub_department uuid,p_is_self boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date;
 v_blocks jsonb;
BEGIN
 v_period:=date_trunc('month',coalesce(
  CASE WHEN p_period ~ '^\d{4}-\d{2}$' THEN to_date(p_period||'-01','YYYY-MM-DD') END,
  v_today))::date;
 IF v_period>date_trunc('month',v_today)::date THEN
  v_period:=date_trunc('month',v_today)::date;
 END IF;

 SELECT coalesce(jsonb_agg(b.block ORDER BY b.ord,b.department),'[]'::jsonb) INTO v_blocks FROM (
  SELECT d.created_at AS ord,d.name AS department,jsonb_build_object(
   'membershipId',d.id,
   'schemeId',c.id,
   'department',d.name,
   'title',coalesce(t.name,'Title not configured'),
   'rank',coalesce(r.label,'Rank not configured'),
   'rankSort',coalesce(r.sort_order,0),

   -- What the caller has done this month.
   'me',jsonb_build_object(
    'staffId',v_staff,
    'name',(SELECT employee_name FROM public.hr_staff_costs WHERE id=v_staff),
    'sales',coalesce(mine.sales,0),
    'held',coalesce(mine.held,0),
    'orders',coalesce(mine.order_count,0),
    'kpiQty',coalesce(mine.kpi_qty,0),
    'marginRevenue',coalesce(mine.margin_revenue,0),
    'marginCost',coalesce(mine.margin_cost,0),
    'blindOrders',coalesce(mine.blind_orders,0),
    'lastOrder',mine.last_order),

   -- The next rung, its gate, and how a personal-sales streak stands. The
   -- 100k gate is 100k in `months` months RUNNING (mig 20260903040000), so a
   -- single month's gap is only half the answer.
   'target',(
    SELECT jsonb_build_object(
     'rank',nx.label,
     'personal',nx.personal_sales_threshold,
     'months',nx.consecutive_months,
     'group',nx.group_sales_threshold,
     'streak',CASE WHEN nx.personal_sales_threshold IS NULL THEN NULL ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
       'period',to_char(m.month,'YYYY-MM'),
       'sales',m.sales,
       'live',m.month=v_period,
       'met',m.sales>=nx.personal_sales_threshold) ORDER BY m.month),'[]'::jsonb)
      FROM (
       SELECT (v_period-(g.back||' months')::interval)::date AS month,
        CASE WHEN g.back=0 THEN coalesce(mine.sales,0) ELSE coalesce((
         SELECT st.product_revenue FROM public.comm_statements st
         JOIN public.comm_runs r2 ON r2.id=st.run_id
         WHERE st.staff_id=v_staff AND r2.scheme_id=c.id
          AND r2.period_month=(v_period-(g.back||' months')::interval)::date
         LIMIT 1),0) END AS sales
       FROM generate_series(0,greatest(nx.consecutive_months,1)-1) AS g(back)
      ) m) END)
    FROM public.comm_ranks nx
    WHERE nx.scheme_id=c.id AND nx.sort_order>coalesce(r.sort_order,-1)
    ORDER BY nx.sort_order LIMIT 1),

   -- Every sub-department of this department, ranked. The caller's own first.
   'boards',(SELECT coalesce(jsonb_agg(x.board ORDER BY x.own DESC,x.ord,x.name),'[]'::jsonb) FROM (
     SELECT bd.name,bd.created_at AS ord,(bd.id=d.id) AS own,jsonb_build_object(
      'departmentId',bd.id,'department',bd.name,'own',bd.id=d.id,
      'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'staffId',p.staff_id,'name',p.name,'title',p.title,
        'sales',p.sales,'held',p.held,'orders',p.order_count,'kpiQty',p.kpi_qty,
        'marginRevenue',p.margin_revenue,'marginCost',p.margin_cost,
        'blindOrders',p.blind_orders,'lastOrder',p.last_order,
        'self',p_is_self AND p.staff_id=v_staff) ORDER BY p.sales DESC,p.name),'[]'::jsonb)
       FROM public.member_department_board(bc.id,v_period) p)) AS board
     FROM public.comm_sub_departments bd
     JOIN public.comm_schemes bc ON bc.sub_department_id=bd.id AND bc.is_active
      AND bc.effective_from<=v_today AND (bc.effective_to IS NULL OR bc.effective_to>=v_today)
     WHERE bd.is_active AND bd.department_id=d.department_id
    ) x),

   -- The caller's own subtree in this scheme.
   'downline',(SELECT coalesce(jsonb_agg(jsonb_build_object(
     'staffId',p.staff_id,'name',p.name,'title',p.title,'uplineId',p.upline_id,'depth',p.depth,
     'sales',p.sales,'held',p.held,'orders',p.order_count,'kpiQty',p.kpi_qty,
     'marginRevenue',p.margin_revenue,'marginCost',p.margin_cost,
     'blindOrders',p.blind_orders,'lastOrder',p.last_order)
     ORDER BY p.depth,p.sales DESC,p.name),'[]'::jsonb)
    FROM public.member_downline_board(c.id,v_staff,v_period) p),

   'orders',public.member_insight_orders(c.id,v_staff,v_period)
  ) AS block
  FROM public.comm_hierarchy h
  JOIN public.comm_schemes c ON c.id=h.scheme_id
  JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
  LEFT JOIN public.titles t ON t.id=h.title_id
  LEFT JOIN public.comm_ranks r ON r.id=h.rank_id
  LEFT JOIN LATERAL public.member_scoreboard(c.id,v_period) mine ON mine.staff_id=v_staff
  WHERE h.staff_id=v_staff AND (p_sub_department IS NULL OR d.id=p_sub_department)
   AND h.effective_from<=v_today
   AND (h.effective_to IS NULL OR h.effective_to>=v_today)
   AND d.is_active AND c.is_active AND c.effective_from<=v_today
   AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 ) b;

 RETURN jsonb_build_object(
  'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),
  'live',v_period=date_trunc('month',v_today)::date,
  'blocks',v_blocks);
END $$;

CREATE FUNCTION public.member_org_map_for_department(p_department uuid,p_staff uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_department uuid:=p_department;
 v_departments jsonb;
 v_people jsonb;
BEGIN

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
  'capacity',cap.headcount_limit,
  'mine',public.member_has_membership(v_staff,d.id),
  'directors',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ds.id,'name',ds.employee_name)
    ORDER BY ds.employee_name),'[]'::jsonb)
   FROM public.comm_sub_department_directors dd
   JOIN public.hr_staff_costs ds ON ds.id=dd.staff_id
   WHERE dd.sub_department_id=d.id AND ds.status='active')
 ) ORDER BY d.created_at,d.id),'[]'::jsonb) INTO v_departments
 FROM public.comm_sub_departments d
 JOIN public.comm_schemes c ON c.sub_department_id=d.id AND c.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE d.is_active AND d.department_id=v_department;

 -- One node per MEMBERSHIP, not per person: somebody in Fair and IR stands in
 -- both frames, under a different upline and a different title in each.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id||':'||h.staff_id,'staffId',h.staff_id,'departmentId',d.id,'schemeId',c.id,
  'name',s.employee_name,'code',s.employee_code,
  'title',coalesce(t.name,'Title not configured'),
  'parentId',CASE WHEN h.upline_staff_id IS NOT NULL THEN c.id||':'||h.upline_staff_id END,
  'self',coalesce(h.staff_id=v_staff,false),
  'mine',public.member_has_membership(v_staff,d.id)
 ) ORDER BY s.employee_name),'[]'::jsonb) INTO v_people
 FROM public.comm_hierarchy h
 JOIN public.comm_schemes c ON c.id=h.scheme_id AND c.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id AND d.is_active
  AND d.department_id=v_department
 JOIN public.hr_staff_costs s ON s.id=h.staff_id AND s.status='active'
 LEFT JOIN public.titles t ON t.id=h.title_id
 WHERE h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today);

 RETURN jsonb_build_object('asOf',now(),
  'departments',coalesce(v_departments,'[]'::jsonb),
  'people',coalesce(v_people,'[]'::jsonb));
END $$;

CREATE FUNCTION public.member_kpi_for_staff(p_staff uuid,p_scheme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date:=date_trunc('month',v_today)::date;
 v_rules_at date:=(date_trunc('month',v_today)+interval '1 month - 1 day')::date;
 v_sub uuid;
 v_enabled boolean;
 v_deposit numeric;
 v_threshold integer;
 v_items jsonb;
 v_total numeric;
BEGIN
 SELECT c.sub_department_id,c.enable_kpi,c.deposit_threshold_pct
 INTO v_sub,v_enabled,v_deposit
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today));
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active membership in this scheme is required' USING ERRCODE='42501';
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
  SELECT upper(btrim(k.product_code)) AS code,
   coalesce(nullif(btrim(k.product_name),''),btrim(k.product_code)) AS label
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_rules_at AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at)
 ), sources AS (
  -- Imports may repeat a document across months. Resolve the latest committed
  -- source before checking its owner/cancellation, so stale copies cannot count.
  SELECT DISTINCT ON (so.order_no) so.* FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  WHERE ib.sub_department_id=v_sub AND ib.status='committed' AND so.period_month<=v_period
  ORDER BY so.order_no,so.created_at DESC,so.id
 ), eligible_orders AS (
  SELECT so.id FROM sources so
  LEFT JOIN public.comm_order_releases r ON r.sub_department_id=v_sub AND r.order_no=so.order_no
  WHERE so.staff_id=v_staff AND NOT so.cancelled AND so.order_date<=v_today
   -- A carried order stays in the month that released it after settlement.
   -- Unreleased, cleared orders belong to the current open month.
   AND coalesce(r.period_month,v_period)=v_period
   AND (r.id IS NOT NULL OR v_deposit IS NULL OR so.order_total<=0
     OR so.paid_amount+0.005>=round(so.order_total*v_deposit,2))
 ), quantities AS (
  SELECT c.code,c.label,coalesce(sum(l.qty),0) AS quantity
  FROM configured c
  LEFT JOIN (public.sales_order_lines l JOIN eligible_orders o ON o.id=l.order_id)
   ON upper(btrim(l.product_code))=c.code
  GROUP BY c.code,c.label
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('productCode',code,'label',label,'quantity',quantity)
   ORDER BY label,code),'[]'::jsonb),coalesce(sum(quantity),0)
 INTO v_items,v_total FROM quantities;

 RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),'enabled',true,'items',v_items,'total',v_total,'threshold',v_threshold,
  'hit',CASE WHEN v_threshold IS NULL THEN NULL ELSE v_total>=v_threshold END);
END $$;

CREATE FUNCTION public.member_arena_for_staff(p_staff uuid,p_sub_department uuid,p_scheme uuid,p_period text,p_window text,p_is_self boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_staff uuid:=p_staff; v_scheme uuid:=p_scheme;
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_current date:=date_trunc('month',v_today)::date; v_anchor date; v_from date; v_until date;
  v_people jsonb; v_brands jsonb; v_weeks jsonb;
BEGIN
  IF p_window IS NULL OR p_window NOT IN ('monthly','quarterly','annual') THEN RAISE EXCEPTION 'Choose a valid ranking period'; END IF;
  IF p_period IS NOT NULL AND p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Choose a valid month'; END IF;
  v_anchor:=least(coalesce((p_period||'-01')::date,v_current),v_current);
  v_from:=CASE p_window WHEN 'annual' THEN date_trunc('year',v_anchor)::date WHEN 'quarterly' THEN date_trunc('quarter',v_anchor)::date ELSE v_anchor END;
  v_until:=least((v_from+CASE p_window WHEN 'annual' THEN interval '1 year' WHEN 'quarterly' THEN interval '3 months' ELSE interval '1 month' END)::date,(v_current+interval '1 month')::date);

  WITH roster AS (
    SELECT DISTINCT s.id,s.employee_name AS name FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
    WHERE h.scheme_id=v_scheme AND s.status='active'
      AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
      AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ), sources AS (
    -- A document may be repeated by imports. Choose its latest committed source
    -- within this department once, rather than summing duplicate snapshots.
    SELECT DISTINCT ON (so.order_no) so.* FROM sales_orders so
    JOIN sales_import_batches ib ON ib.id=so.batch_id
    WHERE ib.sub_department_id=p_sub_department AND ib.status='committed' AND so.period_month<=v_current
    ORDER BY so.order_no,so.created_at DESC,so.id
  ), scoped AS (
    SELECT so.*,c.enable_kpi,coalesce(r.period_month,v_current) AS recognition_month,
      r.id IS NOT NULL OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
        OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS cleared
    FROM sources so JOIN comm_schemes c ON c.id=v_scheme
    LEFT JOIN comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=p_sub_department
    WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)
  ), line_scope AS (
    SELECT o.id,o.staff_id,o.brand_code,o.cleared,o.manual_margin_pct,l.line_amount,l.cost_amount,l.qty,
      EXISTS(SELECT 1 FROM comm_item_groups g WHERE g.scheme_id=v_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods,
      o.enable_kpi AND EXISTS(SELECT 1 FROM comm_kpi_items k WHERE k.scheme_id=v_scheme
        AND upper(btrim(k.product_code))=upper(btrim(l.product_code))
        AND k.effective_from<=(o.recognition_month+interval '1 month - 1 day')::date
        AND (k.effective_to IS NULL OR k.effective_to>=(o.recognition_month+interval '1 month - 1 day')::date)) AS is_kpi
    FROM scoped o JOIN sales_order_lines l ON l.order_id=o.id
    WHERE o.recognition_month>=v_from AND o.recognition_month<v_until
  ), line_facts AS (
    SELECT l.id,l.staff_id,coalesce(nullif(btrim(l.brand_code),''),'UNCLASSIFIED') AS brand,
      l.cleared,sum(l.line_amount) AS revenue,
      coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods_revenue,
      -- KPI quantity can come from any group, but margin uses goods only.
      -- A missing cost on an excluded-group KPI must not invalidate goods margin.
      CASE WHEN coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0)<=0 THEN NULL
        WHEN l.manual_margin_pct IS NOT NULL THEN l.manual_margin_pct
        WHEN bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods)
          THEN 1-(sum(l.cost_amount) FILTER(WHERE l.is_goods))/(sum(l.line_amount) FILTER(WHERE l.is_goods)) END AS margin,
      sum(CASE WHEN l.is_kpi THEN l.qty ELSE 0 END) AS kpi
    FROM line_scope l WHERE l.is_goods OR l.is_kpi
    GROUP BY l.id,l.staff_id,l.brand_code,l.cleared,l.manual_margin_pct
  ), totals AS (
    SELECT f.staff_id,CASE WHEN grouping(f.brand)=1 THEN NULL ELSE f.brand END AS brand,
      jsonb_build_object('sales',coalesce(sum(f.revenue) FILTER(WHERE f.cleared),0),
        'held',coalesce(sum(f.revenue) FILTER(WHERE NOT f.cleared),0),'orders',count(*) FILTER(WHERE f.cleared),
        'kpiQty',coalesce(sum(f.kpi) FILTER(WHERE f.cleared),0),
        'marginRevenue',coalesce(sum(f.goods_revenue) FILTER(WHERE f.cleared AND f.margin IS NOT NULL),0),
        'marginCost',coalesce(sum(f.goods_revenue*(1-f.margin)) FILTER(WHERE f.cleared AND f.margin IS NOT NULL),0),
        'blindOrders',count(*) FILTER(WHERE f.cleared AND f.goods_revenue>0 AND f.margin IS NULL)) AS score
    FROM line_facts f GROUP BY GROUPING SETS ((f.staff_id),(f.staff_id,f.brand))
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'self',p_is_self AND p.id=v_staff,
      'brands',coalesce((SELECT jsonb_object_agg(b.brand,b.score) FROM totals b WHERE b.staff_id=p.id AND b.brand IS NOT NULL),'{}'::jsonb))
      || coalesce(t.score,'{"sales":0,"held":0,"orders":0,"kpiQty":0,"marginRevenue":0,"marginCost":0,"blindOrders":0}'::jsonb) ORDER BY p.name),'[]'::jsonb)
    INTO v_people FROM roster p LEFT JOIN totals t ON t.staff_id=p.id AND t.brand IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object('code',b.code,'name',b.name) ORDER BY b.name),'[]'::jsonb)
    INTO v_brands FROM comm_brands b WHERE b.scheme_id=v_scheme AND b.is_active;
  SELECT jsonb_build_object('weeks',w.weeks,'counts',w.counts) INTO v_weeks FROM member_arena_brand_weeks w
    WHERE w.staff_id=v_staff AND w.sub_department_id=p_sub_department AND w.period_month=v_anchor;
  RETURN jsonb_build_object('membershipId',p_sub_department,'department',(SELECT name FROM comm_sub_departments WHERE id=p_sub_department),
    'selfId',CASE WHEN p_is_self THEN v_staff::text ELSE '' END,'period',to_char(v_anchor,'YYYY-MM'),'window',p_window,'from',v_from,'through',least(v_until-1,v_today),
    'asOf',now(),'live',v_until>v_current,'people',v_people,'brands',v_brands,'brandWeeks',v_weeks);
END $$;

-- Employee entry points preserve their existing signatures and self boundary.
CREATE OR REPLACE FUNCTION public.member_insight_snapshot(p_period text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id();
BEGIN
 IF NOT public.has_perm('member_insight') THEN
  RAISE EXCEPTION 'Insight is not enabled for this account' USING ERRCODE='42501';
 END IF;
 RETURN public.member_insight_for_staff(v_staff,p_period,NULL,true);
END $$;

CREATE OR REPLACE FUNCTION public.member_org_map() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_department uuid;
BEGIN
 SELECT s.department_id INTO v_department FROM public.hr_staff_costs s WHERE s.id=v_staff;
 RETURN public.member_org_map_for_department(v_department,v_staff);
END $$;

CREATE OR REPLACE FUNCTION public.member_kpi_summary(p_scheme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.has_perm('member_portal'),false) THEN
  RAISE EXCEPTION 'Member portal access is required' USING ERRCODE='42501';
 END IF;
 v_staff:=public.member_staff_id();
 RETURN public.member_kpi_for_staff(v_staff,p_scheme);
END $$;

CREATE OR REPLACE FUNCTION public.member_arena_snapshot(p_sub_department uuid,p_period text DEFAULT NULL,p_window text DEFAULT 'monthly') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_scheme uuid:=public.member_arena_scheme(p_sub_department);
BEGIN
 RETURN public.member_arena_for_staff(v_staff,p_sub_department,v_scheme,p_period,p_window,true);
END $$;

-- Principal entry points authorize real staff in an explicit active department.
CREATE FUNCTION public.member_principal_insight_snapshot(p_staff uuid,p_sub_department uuid,p_period text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.member_principal_context(p_staff,p_sub_department);
 RETURN public.member_insight_for_staff(p_staff,p_period,p_sub_department,false)
  || jsonb_build_object('principalView',true,'viewedStaffId',p_staff);
END $$;

CREATE FUNCTION public.member_principal_kpi_summary(p_staff uuid,p_scheme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.member_principal_context(p_staff,(SELECT sub_department_id FROM public.comm_schemes WHERE id=p_scheme),p_scheme);
 RETURN public.member_kpi_for_staff(p_staff,p_scheme)
  || jsonb_build_object('principalView',true,'viewedStaffId',p_staff);
END $$;

CREATE FUNCTION public.member_principal_org_map(p_sub_department uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_department uuid:=public.member_principal_department(p_sub_department);
BEGIN
 -- Preserve the complete authorized department map, including sibling branches.
 RETURN public.member_org_map_for_department(v_department,NULL)
  || jsonb_build_object('principalView',true);
END $$;

CREATE FUNCTION public.member_principal_arena_snapshot(p_staff uuid,p_sub_department uuid,p_period text DEFAULT NULL,p_window text DEFAULT 'monthly') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_scheme uuid:=public.member_principal_context(p_staff,p_sub_department);
BEGIN
 RETURN public.member_arena_for_staff(p_staff,p_sub_department,v_scheme,p_period,p_window,false)
  || jsonb_build_object('principalView',true,'viewedStaffId',p_staff);
END $$;

REVOKE ALL ON FUNCTION
 public.member_principal_department(uuid),
 public.member_principal_context(uuid,uuid,uuid),
 public.member_insight_for_staff(uuid,text,uuid,boolean),
 public.member_org_map_for_department(uuid,uuid),
 public.member_kpi_for_staff(uuid,uuid),
 public.member_arena_for_staff(uuid,uuid,uuid,text,text,boolean),
 public.member_principal_insight_snapshot(uuid,uuid,text),
 public.member_principal_kpi_summary(uuid,uuid),
 public.member_principal_org_map(uuid),
 public.member_principal_arena_snapshot(uuid,uuid,text,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.member_principal_insight_snapshot(uuid,uuid,text),
 public.member_principal_kpi_summary(uuid,uuid),
 public.member_principal_org_map(uuid),
 public.member_principal_arena_snapshot(uuid,uuid,text,text)
TO authenticated;

COMMENT ON FUNCTION public.member_principal_context(uuid,uuid,uuid) IS
 'Private read authorization. Requires the stored active Principal role and a real, current, date-eligible Revenue membership. No staff account linkage or identity mutation.';
COMMENT ON FUNCTION public.member_principal_arena_snapshot(uuid,uuid,text,text) IS
 'Principal read context only. Selected staff is viewedStaffId, never selfId; every self flag stays false. Brand weeks are the selected member existing report and cannot be written by this RPC.';
