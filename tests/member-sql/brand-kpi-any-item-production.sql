-- Production's body of member_kpi_for_staff(uuid, uuid, date) on 2026-11-14, as 20261114020000 left it
-- (pg_get_functiondef, read-only). validate-brand-kpi-any-item.mjs loads it after the chain 20261112200000 …
-- 20261114100000, which does not run 20261114020000.
-- md5(prosrc) = a20392fb1acc51891dee50e72d01de07
CREATE OR REPLACE FUNCTION public.member_kpi_for_staff(p_staff uuid, p_scheme uuid, p_period date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_staff uuid:=p_staff;
 v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
 v_period date:=coalesce(date_trunc('month',p_period)::date,date_trunc('month',v_today)::date);
 v_rules_at date:=(v_period+interval '1 month - 1 day')::date;
 v_sub uuid;
 v_enabled boolean;
 v_brand boolean;
 v_threshold integer;
 v_items jsonb;
 v_total numeric;
 v_ladder numeric;
BEGIN
 SELECT c.sub_department_id,c.enable_kpi
 INTO v_sub,v_enabled
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 WHERE c.id=p_scheme AND c.is_active AND d.is_active
  AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND ((public.member_has_membership(v_staff,d.id)
  AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
    AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)))
   OR public.member_director_scheme(v_staff,d.id)=c.id);
 IF v_sub IS NULL THEN
  RAISE EXCEPTION 'An active membership in this scheme is required' USING ERRCODE='42501';
 END IF;
 IF v_period>date_trunc('month',v_today)::date THEN
  RAISE EXCEPTION 'Choose a month that has started' USING ERRCODE='22023';
 END IF;

 -- (20261114020000) A brand on its own commission scheme has KPI items of its own (2990s): counted whatever the
 -- sub-department's switch says.
 v_brand:=EXISTS(SELECT 1 FROM public.comm_kpi_items k
  JOIN public.comm_brands b ON b.id=k.brand_id AND b.scheme_id=k.scheme_id
  WHERE k.scheme_id=p_scheme AND b.own_scheme AND b.is_active
   AND k.effective_from<=v_rules_at AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at));

 IF NOT v_enabled AND NOT v_brand THEN
  RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
   'asOf',now(),'enabled',false,'items','[]'::jsonb,'total',0,'threshold',NULL,'hit',NULL);
 END IF;

 -- The commission run selects its configuration at period end. Retain the
 -- FIRST rung even after it is reached; the old MemberKpi.target is next-unmet.
 -- (20261114020000) The ladder is the sub-department's own items': none while its switch is off.
 SELECT min(k.min_qty) INTO v_threshold FROM public.comm_kpi_thresholds k
 WHERE v_enabled AND k.scheme_id=p_scheme AND k.effective_from<=v_rules_at
  AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at);

 WITH configured AS (
  -- A SKU (by its code) or a bed frame's / sofa's special (2026-09-27) — the sub-department's own while its switch
  -- is on, and (20261114020000) a brand's own on its own scheme, named with the brand. Its code says the brand too:
  -- the same special may be the sub-department's own item, and the app reads each code once.
  SELECT k.id,
   CASE WHEN b.id IS NOT NULL THEN upper(btrim(b.code))||' · '||btrim(k.option_value)
        WHEN k.source='option' THEN btrim(k.option_value) ELSE upper(btrim(k.product_code)) END AS code,
   coalesce(nullif(btrim(k.product_name),''),
    CASE WHEN k.source='option' THEN btrim(k.option_value) ELSE btrim(k.product_code) END) AS label,
   upper(btrim(b.code)) AS brand
  FROM public.comm_kpi_items k
  LEFT JOIN public.comm_brands b ON b.id=k.brand_id AND b.scheme_id=k.scheme_id AND b.own_scheme AND b.is_active
  WHERE k.scheme_id=p_scheme
   AND CASE WHEN k.brand_id IS NULL THEN v_enabled ELSE b.id IS NOT NULL END
   AND k.effective_from<=v_rules_at AND (k.effective_to IS NULL OR k.effective_to>=v_rules_at)
 ), eligible_orders AS (
  -- The month's deposit-cleared bills, recognised exactly as Insight's sales.
  SELECT f.order_id AS id FROM public.member_order_facts(p_scheme,v_period,(v_period+interval '1 month')::date) f
  WHERE f.staff_id=v_staff AND f.cleared
 ), hits AS (
  SELECT h.item_id,sum(h.qty*coalesce(pt.part,1)) AS qty
  FROM public.comm_kpi_hits(p_scheme,ARRAY(SELECT o.id FROM eligible_orders o),v_rules_at) h
  LEFT JOIN public.sales_order_parts(ARRAY(SELECT o.id FROM eligible_orders o)) pt ON pt.order_id=h.order_id AND pt.staff_id=v_staff
  GROUP BY h.item_id
 ), quantities AS (
  SELECT c.code,c.label,c.brand,coalesce(h.qty,0) AS quantity
  FROM configured c LEFT JOIN hits h ON h.item_id=c.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('productCode',code,'label',label,'quantity',quantity)
    || CASE WHEN brand IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('brand',brand) END
   ORDER BY brand NULLS FIRST,label,code),'[]'::jsonb),coalesce(sum(quantity),0),
  coalesce(sum(quantity) FILTER(WHERE brand IS NULL),0)
 INTO v_items,v_total,v_ladder FROM quantities;

 RETURN jsonb_build_object('schemeId',p_scheme,'period',to_char(v_period,'YYYY-MM'),
  'asOf',now(),'enabled',true,'items',v_items,'total',v_total,'ladderTotal',v_ladder,'threshold',v_threshold,
  'hit',CASE WHEN v_threshold IS NULL THEN NULL ELSE v_ladder>=v_threshold END);
END $function$;
