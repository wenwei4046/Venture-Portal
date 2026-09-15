-- Own-member Today KPI progress. Read only; no commission or product-cost fields.
-- A single monthly quantity combines every configured KPI product. Item labels
-- and the first threshold come from the scheme, never from preview constants.
CREATE FUNCTION public.member_kpi_summary(p_scheme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_staff uuid;
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
 IF auth.uid() IS NULL OR NOT coalesce(public.has_perm('member_portal'),false) THEN
  RAISE EXCEPTION 'Member portal access is required' USING ERRCODE='42501';
 END IF;
 v_staff:=public.member_staff_id();
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

REVOKE ALL ON FUNCTION public.member_kpi_summary(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.member_kpi_summary(uuid) TO authenticated;
COMMENT ON FUNCTION public.member_kpi_summary(uuid) IS
 'Own active membership only: current-month net KPI units from each latest committed document, recognising released month or the current open month, and the actual first configured quantity threshold. Read only.';
