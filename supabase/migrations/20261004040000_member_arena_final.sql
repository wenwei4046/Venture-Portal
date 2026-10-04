-- Arena: is the window FINAL? (2026-10-04, Revenue app revamp)
--
-- A month's boards keep moving until everybody on them is closed on Comm Cal
-- (user 2026-10-04: closing is final; until then the month is live). The
-- member's own `closedMonths` (member_order_book) only says whether THEY are
-- closed; a board is final only when everyone with bills in it is. So the
-- snapshot now says, for its window:
--
--   openMonths  the window's months that are still moving — a month that has
--               not ended, or one holding a bill of a board member who is not
--               closed for it (a standing close, or an applied run, or a month
--               before the portal pays: settled by hand)
--   final       the window has ended and no month in it is open
--
-- Additive: two keys on the same JSON; nothing else in the function changes.
-- The rule mirrors member_order_facts' own (a standing close for a month or a
-- later one; an applied/locked run for a month or a later one).

CREATE OR REPLACE FUNCTION public.member_arena_for_staff(p_staff uuid, p_sub_department uuid, p_scheme uuid, p_period text, p_window text, p_is_self boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staff uuid:=p_staff; v_scheme uuid:=p_scheme;
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_current date:=date_trunc('month',v_today)::date; v_anchor date; v_from date; v_until date;
  v_people jsonb; v_brands jsonb; v_weeks jsonb; v_tiers jsonb;
  v_first date; v_run date; v_open jsonb;
BEGIN
  IF p_window IS NULL OR p_window NOT IN ('monthly','quarterly','annual') THEN RAISE EXCEPTION 'Choose a valid ranking period'; END IF;
  IF p_period IS NOT NULL AND p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Choose a valid month'; END IF;
  v_anchor:=least(coalesce((p_period||'-01')::date,v_current),v_current);
  v_from:=CASE p_window WHEN 'annual' THEN date_trunc('year',v_anchor)::date WHEN 'quarterly' THEN date_trunc('quarter',v_anchor)::date ELSE v_anchor END;
  v_until:=least((v_from+CASE p_window WHEN 'annual' THEN interval '1 year' WHEN 'quarterly' THEN interval '3 months' ELSE interval '1 month' END)::date,(v_current+interval '1 month')::date);

  -- What closes a month: before the cutover it was settled by hand; an
  -- applied run closes it (and every month before it) for everybody.
  v_first:=public.comm_first_paid_month(p_sub_department);
  SELECT max(r.period_month) INTO v_run FROM comm_runs r JOIN comm_schemes rs ON rs.id=r.scheme_id
   WHERE rs.sub_department_id=p_sub_department AND r.status IN ('applied','locked');

  WITH roster AS (
    SELECT DISTINCT s.id,s.employee_name AS name FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
    WHERE h.scheme_id=v_scheme AND s.status='active'
      AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
      AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ), line_facts AS (
    SELECT f.order_id AS id,f.staff_id,f.brand,f.cleared,f.revenue,f.goods_revenue,
      f.margin_pct AS margin,f.kpi_qty AS kpi,f.recognition_month AS month
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
  ), closes AS (
    -- Each person's last standing close in this sub-department.
    SELECT x.staff_id,max(x.period_month) AS last_closed FROM comm_salesperson_closes x
    WHERE x.sub_department_id=p_sub_department AND x.reopened_at IS NULL GROUP BY x.staff_id
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'self',p_is_self AND p.id=v_staff,
      'brands',coalesce((SELECT jsonb_object_agg(b.brand,b.score) FROM totals b WHERE b.staff_id=p.id AND b.brand IS NOT NULL),'{}'::jsonb))
      || coalesce(t.score,'{"sales":0,"held":0,"orders":0,"kpiQty":0,"marginRevenue":0,"marginCost":0,"blindOrders":0}'::jsonb) ORDER BY p.name),'[]'::jsonb),
    -- Months still moving: one with a bill of somebody not yet closed for it.
    (SELECT coalesce(jsonb_agg(DISTINCT to_char(lf.month,'YYYY-MM') ORDER BY to_char(lf.month,'YYYY-MM')),'[]'::jsonb)
       FROM line_facts lf LEFT JOIN closes c ON c.staff_id=lf.staff_id
      WHERE lf.month>=v_current
         OR NOT (lf.month<coalesce(v_first,'-infinity'::date)
              OR lf.month<=coalesce(v_run,'-infinity'::date)
              OR lf.month<=coalesce(c.last_closed,'-infinity'::date)))
    INTO v_people,v_open FROM roster p LEFT JOIN totals t ON t.staff_id=p.id AND t.brand IS NULL;

  -- A month that has not ended is open whatever its bills say.
  IF v_until>v_current THEN
    SELECT coalesce(jsonb_agg(DISTINCT m ORDER BY m),'[]'::jsonb) INTO v_open
      FROM (SELECT jsonb_array_elements_text(v_open) AS m UNION SELECT to_char(v_current,'YYYY-MM')) x;
  END IF;

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
    'asOf',now(),'live',v_until>v_current,'people',v_people,'brands',v_brands,'brandWeeks',v_weeks,'tiers',v_tiers,
    'openMonths',v_open,'final',v_until<=v_current AND jsonb_array_length(v_open)=0);
END $function$;
