-- 20261005120000_member_quote_context_no_ratio.sql
--
-- The second half of 20261005110000 (user 2026-10-05: nobody may open the
-- browser and see how our cost is made up). Apply it only once the code that
-- reads the cost rules from member_quote_cost_rules (service role) is live:
-- the code before it read `costDivisor` from the quote context, and without
-- it would judge every quote on the cost as keyed.
--
--   * member_quote_context / member_principal_quote_context: no
--     `costDivisor`, no `costRatios` — the bands and the KPI items only,
--     both of which the member's own screens show anyway. Who may quote is
--     decided exactly as before.
--   * member_order_book_for_staff (behind member_order_book and
--     member_principal_order_book): no `costDivisor`. It was there so Insight
--     could say "team cost (cost ÷ 0.7)", which no screen says any more.
--
-- Everything else is 20260927050000's and 20261004030000's, verbatim.


CREATE OR REPLACE FUNCTION public.member_quote_context(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_sub uuid; v_bands jsonb;
 v_kpi_on boolean; v_kpi jsonb;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT public.has_perm('member_quote') THEN RAISE EXCEPTION 'Quotation access is not enabled' USING ERRCODE='42501'; END IF;
 SELECT d.id,c.enable_kpi INTO v_sub,v_kpi_on FROM public.comm_schemes c JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
 AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
 AND public.member_has_membership(v_staff,d.id)
 AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
 AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today));
 IF v_sub IS NULL THEN RAISE EXCEPTION 'An active Fair membership is required for quotation' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'key',m.label,'kind',m.kind,
 'threshold',m.margin_pct*100,'multiplier',m.commission_multiplier,'amount',m.monthly_incentive)),'[]') INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id WHERE m.scheme_id=p_scheme;
 IF v_kpi_on THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('source',k.source,'product_code',k.product_code,
   'product_name',k.product_name,'option_pool',k.option_pool,'option_value',k.option_value,
   'kpi_amount',k.kpi_amount)),'[]'::jsonb) INTO v_kpi
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_today AND (k.effective_to IS NULL OR k.effective_to>=v_today);
 ELSE
  v_kpi:='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands,'kpiItems',v_kpi);
END $function$;

CREATE OR REPLACE FUNCTION public.member_principal_quote_context(p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_sub uuid;
 v_bands jsonb;
 v_kpi_on boolean;
 v_kpi jsonb;
 v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active
 ) THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;

 SELECT d.id,c.enable_kpi INTO v_sub,v_kpi_on
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
 IF v_kpi_on THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('source',k.source,'product_code',k.product_code,
   'product_name',k.product_name,'option_pool',k.option_pool,'option_value',k.option_value,
   'kpi_amount',k.kpi_amount)),'[]'::jsonb) INTO v_kpi
  FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
   AND k.effective_from<=v_today AND (k.effective_to IS NULL OR k.effective_to>=v_today);
 ELSE
  v_kpi:='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('schemeId',p_scheme,'subDepartmentId',v_sub,'bands',v_bands,'kpiItems',v_kpi);
END $function$;

CREATE OR REPLACE FUNCTION public.member_order_book_for_staff(p_staff uuid, p_scheme uuid, p_from date, p_until date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 WITH scheme AS (
  SELECT c.id,c.sub_department_id,c.enable_kpi,c.deposit_threshold_pct
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), facts AS (
  SELECT f.* FROM public.member_order_facts(p_scheme,p_from,p_until) f WHERE f.staff_id=p_staff
 ), hits AS (
  -- The KPI items of each line, in force at the end of the month its bill is
  -- recognised in (member_order_facts' as-at). None while KPI is off.
  SELECT h.line_id,sum(h.qty) AS qty
  FROM scheme c
  CROSS JOIN LATERAL (SELECT DISTINCT f.recognition_month FROM facts f WHERE c.enable_kpi) m
  CROSS JOIN LATERAL public.comm_kpi_hits(p_scheme,
   ARRAY(SELECT f.order_id FROM facts f WHERE f.recognition_month=m.recognition_month),
   (m.recognition_month+interval '1 month - 1 day')::date) h
  GROUP BY h.line_id
 )
 SELECT jsonb_build_object(
  'from',to_char(p_from,'YYYY-MM'),
  'through',to_char((p_until-interval '1 day')::date,'YYYY-MM'),
  'asOf',now(),
  'paysFrom',(SELECT to_char(public.comm_first_paid_month(c.sub_department_id),'YYYY-MM') FROM scheme c),
  'closedMonths',(SELECT coalesce(jsonb_agg(z.m ORDER BY z.m),'[]'::jsonb) FROM (
    SELECT to_char(x.period_month,'YYYY-MM') AS m FROM public.comm_salesperson_closes x JOIN scheme c ON c.sub_department_id=x.sub_department_id
    WHERE x.staff_id=p_staff AND x.reopened_at IS NULL
    UNION
    SELECT to_char(r.period_month,'YYYY-MM') FROM public.comm_runs r
    JOIN public.comm_schemes rs ON rs.id=r.scheme_id JOIN scheme c ON c.sub_department_id=rs.sub_department_id
    WHERE r.status IN ('applied','locked')) z),
  'brandWeeks',(SELECT coalesce(jsonb_object_agg(p.key,p.value),'{}'::jsonb)
    FROM public.member_arena_brand_weeks w JOIN scheme c ON c.sub_department_id=w.sub_department_id
    CROSS JOIN LATERAL jsonb_each_text(coalesce(w.picks,'{}'::jsonb)) p
    WHERE w.staff_id=p_staff AND w.period_month>=p_from AND w.period_month<p_until
     AND nullif(btrim(p.value),'') IS NOT NULL),
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',f.order_id,
    'number',f.order_no,
    'ref',nullif(btrim(so.bill_ref),''),
    'customer',coalesce(nullif(btrim(so.customer_name),''),''),
    'date',f.order_date,
    'sourceMonth',to_char(f.source_period,'YYYY-MM'),
    'recognitionMonth',to_char(f.recognition_month,'YYYY-MM'),
    'brand',f.brand,
    'booth',CASE WHEN so.fair_source='erp' AND coalesce(so.raw->'fair'->>'status','')<>'cancelled'
                AND nullif(btrim(so.raw->'fair'->>'brand'),'') IS NOT NULL
           THEN coalesce(public.erp_sync_brand_code(so.raw->'fair'->>'brand'),
                         upper(regexp_replace(btrim(so.raw->'fair'->>'brand'),'\s+',' ','g'))) END,
    'venue',coalesce(nullif(btrim(so.venue),''),''),
    'fairStart',ev.start_date,
    'fairEnd',ev.end_date,
    'organiser',coalesce(org.name,nullif(btrim(ev.erp_organiser_text),'')),
    -- The fair weekend the bill belongs to, named by its Friday (a fair is in
    -- the week it opens); a bill no fair claims, by the week it was written.
    'week',(date_trunc('week',coalesce(ev.start_date,f.order_date))::date+4),
    'revenue',f.revenue,
    'margin',CASE WHEN f.margin_pct IS NULL THEN NULL ELSE round(f.margin_pct*100,2) END,
    'kpiQty',f.kpi_qty,
    'cleared',f.cleared,
    'carried',f.source_period<f.recognition_month,
    'manual',f.manual,
    'total',so.order_total,
    'paid',so.paid_amount,
    'depositNeeded',CASE WHEN c.deposit_threshold_pct IS NULL THEN NULL ELSE round(so.order_total*c.deposit_threshold_pct,2) END,
    'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',coalesce(nullif(btrim(l.product_name),''),l.product_code,''),
      'code',l.product_code,
      'qty',l.qty,
      'amount',l.line_amount,
      'goods',EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable),
      'kpiQty',coalesce(h.qty,0))
      ORDER BY l.line_no,l.id),'[]'::jsonb)
     FROM public.sales_order_lines l LEFT JOIN hits h ON h.line_id=l.id
     WHERE l.order_id=f.order_id))
   ORDER BY f.order_date,f.order_no)
  FROM facts f
  CROSS JOIN scheme c
  JOIN public.sales_orders so ON so.id=f.order_id
  LEFT JOIN public.comm_venue_events ev ON ev.id=so.fair_event_id
  LEFT JOIN public.comm_organisers org ON org.id=ev.organiser_id),'[]'::jsonb));
$function$;

NOTIFY pgrst, 'reload schema';
