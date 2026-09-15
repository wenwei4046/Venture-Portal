-- Live Arena: performance facts and self-reported brand weeks. No sample data,
-- points policy or inferred Fair events. Scope is the caller's active membership.
CREATE TABLE public.member_arena_brand_weeks (
  staff_id uuid NOT NULL REFERENCES public.hr_staff_costs(id),
  sub_department_id uuid NOT NULL REFERENCES public.comm_sub_departments(id),
  period_month date NOT NULL CHECK (extract(day FROM period_month)=1),
  weeks integer NOT NULL CHECK (weeks IN (4,5)),
  counts jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(staff_id,sub_department_id,period_month)
);
ALTER TABLE public.member_arena_brand_weeks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_arena_brand_weeks FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.member_arena_scheme(p_sub_department uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_scheme uuid; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  IF NOT coalesce(public.has_perm('member_insight'),false) THEN
    RAISE EXCEPTION 'Arena is not enabled for this account' USING ERRCODE='42501';
  END IF;
  SELECT c.id INTO v_scheme FROM comm_hierarchy h
  JOIN comm_schemes c ON c.id=h.scheme_id
  JOIN comm_sub_departments d ON d.id=c.sub_department_id
  JOIN hr_staff_costs s ON s.id=h.staff_id
  WHERE h.staff_id=v_staff AND d.id=p_sub_department AND s.status='active'
    AND d.is_active AND c.is_active
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
    AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  ORDER BY c.effective_from DESC LIMIT 1;
  IF v_scheme IS NULL THEN RAISE EXCEPTION 'This department is not available to your account' USING ERRCODE='42501'; END IF;
  RETURN v_scheme;
END $$;
REVOKE ALL ON FUNCTION public.member_arena_scheme(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.member_arena_save_brand_weeks(p_sub_department uuid,p_period text,p_weeks integer,p_counts jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_staff uuid:=public.member_staff_id(); v_month date; v_sum integer:=0; v_key text; v_value text;
BEGIN
  PERFORM public.member_arena_scheme(p_sub_department);
  IF p_period IS NULL OR p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Choose a valid month'; END IF;
  v_month:=(p_period||'-01')::date;
  IF v_month>date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date THEN RAISE EXCEPTION 'Choose the current or a past month'; END IF;
  IF p_weeks IS NULL OR p_weeks NOT IN (4,5) OR p_counts IS NULL OR jsonb_typeof(p_counts)<>'object' THEN RAISE EXCEPTION 'Choose 4 or 5 brand weeks'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_counts))<>4 THEN RAISE EXCEPTION 'Fill in all four brands'; END IF;
  FOREACH v_key IN ARRAY ARRAY['AKEMI','ERGOTEX','ZANOTTI','DUNLOP'] LOOP
    v_value:=p_counts->>v_key;
    IF v_value IS NULL OR jsonb_typeof(p_counts->v_key)<>'number' OR v_value !~ '^[0-5]$' THEN RAISE EXCEPTION 'Brand weeks must be whole numbers from 0 to 5'; END IF;
    v_sum:=v_sum+v_value::integer;
  END LOOP;
  IF v_sum<>p_weeks THEN RAISE EXCEPTION 'Brand weeks must add up to the selected total'; END IF;
  INSERT INTO member_arena_brand_weeks(staff_id,sub_department_id,period_month,weeks,counts)
  VALUES(v_staff,p_sub_department,v_month,p_weeks,p_counts)
  ON CONFLICT(staff_id,sub_department_id,period_month) DO UPDATE SET weeks=excluded.weeks,counts=excluded.counts,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.member_arena_save_brand_weeks(uuid,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_arena_save_brand_weeks(uuid,text,integer,jsonb) TO authenticated;

CREATE FUNCTION public.member_arena_snapshot(p_sub_department uuid,p_period text DEFAULT NULL,p_window text DEFAULT 'monthly') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_staff uuid:=public.member_staff_id(); v_scheme uuid:=public.member_arena_scheme(p_sub_department);
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
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'self',p.id=v_staff,
      'brands',coalesce((SELECT jsonb_object_agg(b.brand,b.score) FROM totals b WHERE b.staff_id=p.id AND b.brand IS NOT NULL),'{}'::jsonb))
      || coalesce(t.score,'{"sales":0,"held":0,"orders":0,"kpiQty":0,"marginRevenue":0,"marginCost":0,"blindOrders":0}'::jsonb) ORDER BY p.name),'[]'::jsonb)
    INTO v_people FROM roster p LEFT JOIN totals t ON t.staff_id=p.id AND t.brand IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object('code',b.code,'name',b.name) ORDER BY b.name),'[]'::jsonb)
    INTO v_brands FROM comm_brands b WHERE b.scheme_id=v_scheme AND b.is_active;
  SELECT jsonb_build_object('weeks',w.weeks,'counts',w.counts) INTO v_weeks FROM member_arena_brand_weeks w
    WHERE w.staff_id=v_staff AND w.sub_department_id=p_sub_department AND w.period_month=v_anchor;
  RETURN jsonb_build_object('membershipId',p_sub_department,'department',(SELECT name FROM comm_sub_departments WHERE id=p_sub_department),
    'selfId',v_staff,'period',to_char(v_anchor,'YYYY-MM'),'window',p_window,'from',v_from,'through',least(v_until-1,v_today),
    'asOf',now(),'live',v_until>v_current,'people',v_people,'brands',v_brands,'brandWeeks',v_weeks);
END $$;
REVOKE ALL ON FUNCTION public.member_arena_snapshot(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_arena_snapshot(uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.member_arena_snapshot(uuid,text,text) IS
  'Authenticated member Arena, active own membership only. Counts each latest committed document once: released month when present, otherwise current open month. Raw total/brand sales, KPI units and margin facts only; no peer pay, orders, costs of individual products, inferred fairs or championship awards.';
