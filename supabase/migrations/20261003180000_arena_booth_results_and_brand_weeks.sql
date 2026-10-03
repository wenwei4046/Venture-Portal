-- ═══════════════════════════════════════════════════════════════════════════
-- The Arena's Fair results, booth by booth, and the brand a seller picks for
-- each week (2026-10-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- An exhibition is one brand's BOOTH at a fair, not the whole fair (user
-- 2026-10-03; the month page's *Sales exhibition*, `lib/exhibitions.ts`): the
-- same venue, organiser and days with another brand is another exhibition, and
-- its result is that booth's. So the Fair results rank each booth on its own,
-- and a seller's figure there is what they sold AT THAT BOOTH — the 100k at the
-- Akemi booth of the Big Home fair at Mid Valley, never with the 10k they wrote
-- somewhere else that week.
--
-- ONE BOOTH PER SELLER PER WEEK (user: 一个人在一周里，只可以在一个地方参与第一、
-- 第二、第三、第四、第五名的排名). A seller belongs to one brand each week — the
-- brand they pick for that week in *My brand weeks* — and ranks only at that
-- brand's booth. Bills they wrote at another brand's booth that week still count
-- in their sales; they are not a finish anywhere. Until they pick, the week's
-- brand is the booth they wrote the most at that week, and the finish says it
-- is unconfirmed. (On 2026-10-03 no Revenue seller has a member login yet, so
-- every finish starts unconfirmed.) Two fairs of their brand the same week: the
-- one they wrote the most at. Small booths rank like any other (user: 人少也算).
--
-- A WEEK is a fair weekend: the Monday–Sunday week a fair opens in, named by its
-- Friday — September 2026 has four (4, 11, 18, 25), October five. A fair from
-- Wed 30 Sep is October's first week.
--
-- THE BOOTH a bill counts at: the ERP project the salesperson picked while that
-- pick is the bill's fair (`fair_source = 'erp'`, not cancelled) — only that
-- booth. A bill with no pick (before the ERP's fair picker, or a fair placed by
-- a person or the calendar) counts at the booth its seller worked that week:
-- 在 Akemi 的 booth 那边卖 Dunlopillo 的枕头 … 还是会落在他选的那个 fair 那一边.
-- Guessing a week's brand reads each bill's pick, else its own brand.
--
-- WHAT CHANGES:
--   1. member_arena_brand_weeks.picks — { "<Friday>": "<brand>" } for the month;
--      weeks / counts follow from it on save.
--   2. member_arena_month_fridays(month) — the weeks of a month.
--   3. member_arena_save_brand_week_picks(sub, period, picks) — the member's save.
--   4. member_arena_with_week_picks + member_arena_snapshot /
--      member_principal_arena_snapshot — the picks ride in `brandWeeks.picks`.
--   5. member_arena_booth_history_for_staff + member_arena_booth_history /
--      member_principal_arena_booth_history — the results booth by booth.
-- The old member_arena_history* and member_arena_save_brand_weeks stay as they
-- were for the app still deployed while this applies; the new app reads none of
-- them. Additive: nothing a member sees changes until the new app is live.
--
-- REVERSAL
--   DROP FUNCTION member_principal_arena_booth_history(uuid,uuid);
--   DROP FUNCTION member_arena_booth_history(uuid);
--   DROP FUNCTION member_arena_booth_history_for_staff(uuid,uuid);
--   DROP FUNCTION member_arena_save_brand_week_picks(uuid,text,jsonb);
--   member_arena_snapshot / member_principal_arena_snapshot back to
--     20260917040000's (RETURN member_arena_for_staff(...) without the wrap);
--   DROP FUNCTION member_arena_with_week_picks(jsonb,uuid,uuid);
--   DROP FUNCTION member_arena_month_fridays(date);
--   ALTER TABLE member_arena_brand_weeks DROP COLUMN picks;

-- ─── 1. The brand of each week ─────────────────────────────────────────────

ALTER TABLE public.member_arena_brand_weeks
  ADD COLUMN IF NOT EXISTS picks jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.member_arena_brand_weeks.picks IS
  'The brand the member worked each week of the month, keyed by the week''s Friday (YYYY-MM-DD): {"2026-09-04":"AKEMI",…}. A week left out is not picked. The Arena''s Fair results rank the member only at that brand''s booth that week (2026-10-03); weeks and counts follow from it.';

-- ─── 2. The weeks of a month ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_arena_month_fridays(p_month date) RETURNS date[]
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT array_agg(d ORDER BY d)
  FROM (SELECT (p_month-(extract(day FROM p_month)::int-1))::date AS first_day) m
  CROSS JOIN LATERAL (SELECT m.first_day+i AS d FROM generate_series(0,30) i) days
  WHERE extract(month FROM d)=extract(month FROM m.first_day) AND extract(isodow FROM d)=5
$$;

COMMENT ON FUNCTION public.member_arena_month_fridays(date) IS
  'The weeks of the month that holds p_month, each named by its Friday — the fair weekends a member picks a brand for (4 or 5).';

REVOKE ALL ON FUNCTION public.member_arena_month_fridays(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_arena_month_fridays(date) TO authenticated;

-- ─── 3. The member's save ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_arena_save_brand_week_picks(p_sub_department uuid,p_period text,p_picks jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_staff uuid:=public.member_staff_id(); v_month date; v_fridays date[];
  v_brands text[]:=ARRAY['AKEMI','ERGOTEX','ZANOTTI','DUNLOP'];
  v_key text; v_value jsonb; v_brand text; v_picks jsonb:='{}'::jsonb;
BEGIN
  PERFORM public.member_arena_scheme(p_sub_department);
  IF p_period IS NULL OR p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Choose a valid month'; END IF;
  v_month:=(p_period||'-01')::date;
  IF v_month>date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date THEN RAISE EXCEPTION 'Choose the current or a past month'; END IF;
  IF p_picks IS NULL OR jsonb_typeof(p_picks)<>'object' THEN RAISE EXCEPTION 'Pick a brand for each week'; END IF;
  v_fridays:=public.member_arena_month_fridays(v_month);
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_picks) LOOP
    IF v_key !~ '^\d{4}-\d{2}-\d{2}$' OR NOT (v_key::date=ANY(v_fridays)) THEN
      RAISE EXCEPTION 'A brand week must be one of the weeks of %',to_char(v_month,'FMMonth YYYY');
    END IF;
    CONTINUE WHEN jsonb_typeof(v_value)='null';
    v_brand:=v_value#>>'{}';
    IF jsonb_typeof(v_value)<>'string' OR NOT (v_brand=ANY(v_brands)) THEN
      RAISE EXCEPTION 'Pick Akemi, Dunlopillo, Zanotti or Ergotex for each week';
    END IF;
    v_picks:=v_picks||jsonb_build_object(v_key,v_brand);
  END LOOP;
  INSERT INTO member_arena_brand_weeks(staff_id,sub_department_id,period_month,weeks,counts,picks)
  VALUES(v_staff,p_sub_department,v_month,cardinality(v_fridays),
    (SELECT jsonb_object_agg(b,(SELECT count(*) FROM jsonb_each_text(v_picks) k WHERE k.value=b)) FROM unnest(v_brands) b),
    v_picks)
  ON CONFLICT(staff_id,sub_department_id,period_month) DO UPDATE
    SET weeks=excluded.weeks,counts=excluded.counts,picks=excluded.picks,updated_at=now();
END $$;

COMMENT ON FUNCTION public.member_arena_save_brand_week_picks(uuid,text,jsonb) IS
  'A member saves the brand they worked each week of a month (current or past): {"<Friday>":"AKEMI"|"DUNLOP"|"ZANOTTI"|"ERGOTEX"|null}. Weeks and counts are derived. Their own row only (member_staff_id).';

REVOKE ALL ON FUNCTION public.member_arena_save_brand_week_picks(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_arena_save_brand_week_picks(uuid,text,jsonb) TO authenticated;

-- ─── 4. The picks ride in the Arena snapshot ───────────────────────────────

CREATE OR REPLACE FUNCTION public.member_arena_with_week_picks(p_snapshot jsonb,p_staff uuid,p_sub_department uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN jsonb_typeof(p_snapshot->'brandWeeks')='object'
    THEN jsonb_set(p_snapshot,'{brandWeeks,picks}',coalesce((SELECT w.picks FROM member_arena_brand_weeks w
      WHERE w.staff_id=p_staff AND w.sub_department_id=p_sub_department
        AND w.period_month=((p_snapshot->>'period')||'-01')::date),'{}'::jsonb))
    ELSE p_snapshot END
$$;

REVOKE ALL ON FUNCTION public.member_arena_with_week_picks(jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.member_arena_snapshot(p_sub_department uuid,p_period text DEFAULT NULL::text,p_window text DEFAULT 'monthly'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_scheme uuid:=public.member_arena_scheme(p_sub_department);
BEGIN
 RETURN public.member_arena_with_week_picks(
  public.member_arena_for_staff(v_staff,p_sub_department,v_scheme,p_period,p_window,true),v_staff,p_sub_department);
END $function$;

CREATE OR REPLACE FUNCTION public.member_principal_arena_snapshot(p_staff uuid,p_sub_department uuid,p_period text DEFAULT NULL::text,p_window text DEFAULT 'monthly'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_scheme uuid:=public.member_principal_context(p_staff,p_sub_department);
BEGIN
 RETURN public.member_arena_with_week_picks(
  public.member_arena_for_staff(p_staff,p_sub_department,v_scheme,p_period,p_window,false),p_staff,p_sub_department)
  || jsonb_build_object('principalView',true,'viewedStaffId',p_staff);
END $function$;

-- ─── 5. The results, booth by booth ────────────────────────────────────────
-- 20260927050000's member_arena_history_for_staff for the scope (roster, latest
-- committed document, deposit gate, each bill's MAIN sales), then grouped by
-- (fair, booth) and placed one booth per seller per week.

CREATE OR REPLACE FUNCTION public.member_arena_booth_history_for_staff(p_sub_department uuid,p_scheme uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  v_current date:=date_trunc('month',v_today)::date;
  v_result jsonb;
BEGIN
  WITH roster AS (
    SELECT DISTINCT s.id,s.employee_name AS name FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
    WHERE h.scheme_id=p_scheme AND s.status='active'
      AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
      AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ), sources AS (
    SELECT DISTINCT ON (so.order_no) so.* FROM sales_orders so
    JOIN sales_import_batches ib ON ib.id=so.batch_id
    WHERE ib.sub_department_id=p_sub_department AND ib.status='committed' AND so.period_month<=v_current
    ORDER BY so.order_no,so.created_at DESC,so.id
  ), scoped AS (
    SELECT so.*,c.enable_kpi,coalesce(r.period_month,v_current) AS recognition_month,
      r.id IS NOT NULL OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
        OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS cleared,
      -- The booth the salesperson picked in the ERP, while that pick is the
      -- bill's fair (lib/exhibitions.ts boothOf + brandCodeFor).
      CASE WHEN so.fair_source='erp' AND coalesce(so.raw->'fair'->>'status','')<>'cancelled'
                AND nullif(btrim(so.raw->'fair'->>'brand'),'') IS NOT NULL
           THEN coalesce(erp_sync_brand_code(so.raw->'fair'->>'brand'),
                         upper(regexp_replace(btrim(so.raw->'fair'->>'brand'),'\s+',' ','g'))) END AS booth_pick,
      nullif(btrim(so.brand_code),'') AS own_brand
    FROM sources so JOIN comm_schemes c ON c.id=p_scheme
    LEFT JOIN comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=p_sub_department
    WHERE NOT so.cancelled AND so.order_date<=v_today AND so.staff_id IN (SELECT id FROM roster)
  ), kpi AS (
    SELECT h.order_id,sum(h.qty*h.unit_amount) AS amount
    FROM comm_schemes c
    CROSS JOIN LATERAL (SELECT DISTINCT s.recognition_month FROM scoped s WHERE c.enable_kpi) m
    CROSS JOIN LATERAL comm_kpi_hits(p_scheme,
      ARRAY(SELECT s.id FROM scoped s WHERE s.recognition_month=m.recognition_month),
      (m.recognition_month+interval '1 month - 1 day')::date) h
    WHERE c.id=p_scheme
    GROUP BY h.order_id
  ), line_scope AS (
    SELECT o.id,o.staff_id,o.fair_event_id,o.booth_pick,o.own_brand,o.cleared,l.line_amount,
      EXISTS(SELECT 1 FROM comm_item_groups g WHERE g.scheme_id=p_scheme
        AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods
    FROM scoped o JOIN sales_order_lines l ON l.order_id=o.id
  ), bills AS (
    SELECT l.id,l.staff_id,l.fair_event_id,l.booth_pick,l.own_brand,l.cleared,
      coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0) AS goods,bool_or(l.is_goods) AS has_goods
    FROM line_scope l
    GROUP BY l.id,l.staff_id,l.fair_event_id,l.booth_pick,l.own_brand,l.cleared
  ), order_facts AS (
    SELECT b.id,b.staff_id,b.fair_event_id,b.booth_pick,b.own_brand,b.cleared,b.goods-coalesce(k.amount,0) AS revenue
    FROM bills b LEFT JOIN kpi k ON k.order_id=b.id
    WHERE b.has_goods OR k.order_id IS NOT NULL
  ), fairs AS (
    SELECT e.id,coalesce(nullif(btrim(v.display_name),''),e.venue_key) AS venue,
      e.start_date,e.end_date,e.period_month,
      -- The fair weekend: the Friday of the Monday–Sunday week it opens in.
      (date_trunc('week',e.start_date)::date+4) AS week
    FROM comm_venue_events e LEFT JOIN comm_venues v ON v.venue_key=e.venue_key
    WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL AND e.end_date<=v_today
  ), written AS (
    -- What each seller wrote each week, by the brand each bill names — its
    -- booth pick, else its own brand. Only for guessing the week's brand.
    SELECT f.week,o.staff_id,coalesce(o.booth_pick,o.own_brand) AS brand,
      sum(o.revenue) AS amount,count(*) AS bills
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    WHERE coalesce(o.booth_pick,o.own_brand) IS NOT NULL
    GROUP BY f.week,o.staff_id,coalesce(o.booth_pick,o.own_brand)
  ), picked AS (
    -- The brand each seller picked for a week (My brand weeks).
    SELECT w.staff_id,k.key::date AS week,k.value AS brand
    FROM member_arena_brand_weeks w
    CROSS JOIN LATERAL jsonb_each_text(w.picks) k
    WHERE w.sub_department_id=p_sub_department AND k.key ~ '^\d{4}-\d{2}-\d{2}$'
      AND nullif(btrim(k.value),'') IS NOT NULL
  ), guessed AS (
    -- Until they pick: the brand they wrote the most for that week.
    SELECT DISTINCT ON (w.staff_id,w.week) w.staff_id,w.week,w.brand
    FROM written w
    ORDER BY w.staff_id,w.week,w.amount DESC,w.bills DESC,w.brand
  ), week_brand AS (
    SELECT coalesce(p.staff_id,g.staff_id) AS staff_id,coalesce(p.week,g.week) AS week,
      coalesce(p.brand,g.brand) AS brand,p.brand IS NOT NULL AS confirmed
    FROM picked p FULL JOIN guessed g ON g.staff_id=p.staff_id AND g.week=p.week
  ), fits AS (
    -- At each fair that week, what can be the seller's booth's: the bills
    -- picked at that brand's booth, and the bills with no pick.
    SELECT f.id AS fair_id,f.week,o.staff_id,wb.brand,wb.confirmed,
      sum(o.revenue) AS amount,count(*) AS bills
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    JOIN week_brand wb ON wb.staff_id=o.staff_id AND wb.week=f.week
    WHERE o.booth_pick IS NULL OR o.booth_pick=wb.brand
    GROUP BY f.id,f.week,o.staff_id,wb.brand,wb.confirmed
  ), placed AS (
    -- One booth per seller per week: their week's brand, at the fair where
    -- the most of it is.
    SELECT DISTINCT ON (x.staff_id,x.week) x.fair_id,x.week,x.staff_id,x.brand,x.confirmed
    FROM fits x
    ORDER BY x.staff_id,x.week,x.amount DESC,x.bills DESC,x.fair_id
  ), counted AS (
    SELECT o.id,o.staff_id,o.fair_event_id,o.cleared,o.revenue,pl.brand AS booth,pl.confirmed
    FROM order_facts o JOIN placed pl ON pl.staff_id=o.staff_id AND pl.fair_id=o.fair_event_id
    WHERE o.booth_pick IS NULL OR o.booth_pick=pl.brand
  ), booth_people AS (
    SELECT c.fair_event_id AS fair_id,c.booth,c.staff_id,bool_and(c.confirmed) AS confirmed,
      coalesce(sum(c.revenue) FILTER(WHERE c.cleared),0) AS sales,
      coalesce(sum(c.revenue) FILTER(WHERE NOT c.cleared),0) AS held,
      count(*) FILTER(WHERE c.cleared) AS orders
    FROM counted c
    GROUP BY c.fair_event_id,c.booth,c.staff_id
  ), events AS (
    SELECT f.id AS fair_id,bp.booth,f.venue,f.start_date,f.end_date,f.period_month,f.week,
      jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'sales',bp.sales,'held',bp.held,
        'orders',bp.orders,'confirmed',bp.confirmed) ORDER BY p.name,p.id) AS people
    FROM booth_people bp JOIN fairs f ON f.id=bp.fair_id JOIN roster p ON p.id=bp.staff_id
    GROUP BY f.id,bp.booth,f.venue,f.start_date,f.end_date,f.period_month,f.week
  ), loose AS (
    SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales
    FROM order_facts o WHERE o.fair_event_id IS NULL AND o.cleared
  ), elsewhere AS (
    -- Cleared bills at a completed fair that are no finish: picked at another
    -- booth than the seller's week, or at another fair that week. Sales, not
    -- finishes.
    SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales
    FROM order_facts o JOIN fairs f ON f.id=o.fair_event_id
    WHERE o.cleared AND NOT EXISTS (SELECT 1 FROM counted c WHERE c.id=o.id)
  )
  SELECT jsonb_build_object(
    'asOf',now(),'provisional',true,
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.fair_id::text||'|'||e.booth,'fairId',e.fair_id,
      'brand',e.booth,'venue',e.venue,'start',e.start_date,'end',e.end_date,'week',e.week,
      'periodMonth',to_char(e.period_month,'YYYY-MM'),'people',e.people)
      ORDER BY e.end_date,e.start_date,e.fair_id,e.booth) FROM events e),'[]'::jsonb),
    'unassignedOrders',(SELECT orders FROM loose),
    'unassignedSales',(SELECT sales FROM loose),
    'elsewhereOrders',(SELECT orders FROM elsewhere),
    'elsewhereSales',(SELECT sales FROM elsewhere),
    'championship',jsonb_build_object('status','pending',
      'reason','Championship totals need every ranking source and a settled scoring ledger. Fair finishes stand on their own until then.'))
  INTO v_result;
  RETURN v_result;
END $$;

COMMENT ON FUNCTION public.member_arena_booth_history_for_staff(uuid,uuid) IS
  'The Arena''s Fair results booth by booth (2026-10-03): one board per (completed fair, booth brand), each seller placed at ONE booth a week — the brand they picked for the week (member_arena_brand_weeks.picks), else the brand they wrote the most for (confirmed = false) — with what they sold there: bills picked at that booth, and bills with no booth pick. Bills picked at another booth, or at another fair that week, are counted in elsewhereOrders/Sales; bills on no fair in unassignedOrders/Sales.';

CREATE OR REPLACE FUNCTION public.member_arena_booth_history(p_sub_department uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.member_arena_booth_history_for_staff(p_sub_department,public.member_arena_scheme(p_sub_department));
END $$;

CREATE OR REPLACE FUNCTION public.member_principal_arena_booth_history(p_staff uuid,p_sub_department uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.member_arena_booth_history_for_staff(p_sub_department,public.member_principal_context(p_staff,p_sub_department));
END $$;

REVOKE ALL ON FUNCTION public.member_arena_booth_history_for_staff(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.member_arena_booth_history(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.member_principal_arena_booth_history(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_arena_booth_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_principal_arena_booth_history(uuid,uuid) TO authenticated;
