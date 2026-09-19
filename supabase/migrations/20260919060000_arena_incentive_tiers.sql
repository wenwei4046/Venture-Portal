-- ============================================================================
-- THE ARENA LEARNS THE LADDER (2026-09-19)
--
-- The Arena could already rank margin, and rank it by brand. What it could not
-- say is the only thing anybody actually asks: am I on a tier, and what is
-- stopping me. It had no thresholds -- `MemberArenaSnapshot` carried people
-- and brands and nothing about what a margin has to reach.
--
-- So the snapshot now carries the scheme's incentive ladder, brand by brand,
-- and the board is computed in `arenaIncentive()` against exactly the rule the
-- engine pays on: every brand you sold must clear the tier, the tiers you earn
-- are the INTERSECTION of what each brand clears, and one brand with a bill
-- that has no cost blocks the lot.
--
-- The thresholds are not the same for every brand -- Akemi and Ergotex start
-- at 36%, Dunlopillo and Zanotti at 33% (mig 20260919040000) -- which is
-- exactly why the board has to read them rather than assume them.
--
-- Nothing else in the snapshot changes, and both entry points
-- (member_arena_snapshot and member_principal_arena_snapshot) come through
-- here, so both learn it at once.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.member_arena_for_staff(
  p_staff uuid, p_sub_department uuid, p_scheme uuid, p_period text, p_window text, p_is_self boolean
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_staff uuid:=p_staff; v_scheme uuid:=p_scheme;
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_current date:=date_trunc('month',v_today)::date; v_anchor date; v_from date; v_until date;
  v_people jsonb; v_brands jsonb; v_weeks jsonb; v_tiers jsonb;
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
  ), line_facts AS (
    SELECT f.order_id AS id,f.staff_id,f.brand,f.cleared,f.revenue,f.goods_revenue,
      f.margin_pct AS margin,f.kpi_qty AS kpi
    FROM public.member_order_facts(v_scheme,v_from,v_until) f
    WHERE f.staff_id IN (SELECT id FROM roster)
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

  -- The ladder the board measures against. Thresholds follow the BRAND, so the
  -- board reads them per brand rather than assuming one scale.
  SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'bandKey',m.band_key,
      'label',m.label,'marginPct',m.margin_pct,'amount',m.monthly_incentive)
      ORDER BY b.code, m.margin_pct DESC),'[]'::jsonb)
    INTO v_tiers FROM comm_margin_bands m JOIN comm_brands b ON b.id=m.brand_id
   WHERE m.scheme_id=v_scheme AND m.kind='incentive';

  SELECT jsonb_build_object('weeks',w.weeks,'counts',w.counts) INTO v_weeks FROM member_arena_brand_weeks w
    WHERE w.staff_id=v_staff AND w.sub_department_id=p_sub_department AND w.period_month=v_anchor;
  RETURN jsonb_build_object('membershipId',p_sub_department,'department',(SELECT name FROM comm_sub_departments WHERE id=p_sub_department),
    'selfId',CASE WHEN p_is_self THEN v_staff::text ELSE '' END,'period',to_char(v_anchor,'YYYY-MM'),'window',p_window,'from',v_from,'through',least(v_until-1,v_today),
    'asOf',now(),'live',v_until>v_current,'people',v_people,'brands',v_brands,'brandWeeks',v_weeks,'tiers',v_tiers);
END $fn$;

COMMENT ON FUNCTION public.member_arena_for_staff(uuid,uuid,uuid,text,text,boolean) IS
 'The Arena snapshot: the department''s roster with sales, KPI and REVENUE TEAM margin per person and per brand, plus the scheme''s incentive ladder so the board can say which tier a month reaches and what is blocking it. Margin comes from member_order_facts, which divides cost by revenue_cost_divisor.';
