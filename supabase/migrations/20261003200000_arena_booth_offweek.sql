-- ═══════════════════════════════════════════════════════════════════════════
-- Every booth a seller wrote at shows them; one booth a week scores (2026-10-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 20261003180000 left a seller off every board but their brand week's, and
-- counted the bills they wrote at other booths that week only in a note. The
-- user (2026-10-03): 他应该是要上榜。只是后面那个 sales 他应该也是会算，要不然
-- … 就奇怪怎么少了几十千。他只是没有拿那个名次 … 你照样上榜，只是你上榜了没有
-- 拿到积分 … 就是能算积分的只有一个.
--
-- So every bill at a completed fair is on a board — the booth it was picked at,
-- else the booth its seller worked that week, else its own brand, else the
-- fair's no-brand board (ten old bills on 2026-10-03, RM 45,876) — and a booth's
-- figures add up to everything sold there. A seller appears on every board they
-- wrote at; exactly ONE of those a week SCORES (`scoring`): the booth of their
-- brand week at the fair with the most bills for it. Everybody on a board is
-- ranked by the app like anybody else (a 30k that is third there shows third —
-- user: 依然会显示属于那个名次，而不是直接不算名次); a place off the brand week
-- just earns no points (lib/member/arena-history.ts). `offWeekOrders` /
-- `offWeekSales` count what is ranked with no points; `elsewhereOrders` /
-- `elsewhereSales` are gone with the note they fed.
--
-- REVERSAL: member_arena_booth_history_for_staff back to 20261003190000's.

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
      (date_trunc('week',e.start_date::timestamp)::date+4) AS week
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
    -- Until they pick — and once the week closes, for good: the brand they
    -- opened the most bills for that week, then the most sales.
    SELECT DISTINCT ON (w.staff_id,w.week) w.staff_id,w.week,w.brand
    FROM written w
    ORDER BY w.staff_id,w.week,w.bills DESC,w.amount DESC,w.brand
  ), week_brand AS (
    SELECT coalesce(p.staff_id,g.staff_id) AS staff_id,coalesce(p.week,g.week) AS week,
      coalesce(p.brand,g.brand) AS brand,p.brand IS NOT NULL AS confirmed
    FROM picked p FULL JOIN guessed g ON g.staff_id=p.staff_id AND g.week=p.week
  ), fits AS (
    -- At each fair that week, what can be the seller's booth's: the bills
    -- picked at that brand's booth, and the bills with no pick.
    SELECT f.id AS fair_id,f.week,o.staff_id,wb.brand,
      sum(o.revenue) AS amount,count(*) AS bills
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    JOIN week_brand wb ON wb.staff_id=o.staff_id AND wb.week=f.week
    WHERE o.booth_pick IS NULL OR o.booth_pick=wb.brand
    GROUP BY f.id,f.week,o.staff_id,wb.brand
  ), placed AS (
    -- The ONE booth a week that scores: their week's brand, at the fair with
    -- the most bills for it.
    SELECT DISTINCT ON (x.staff_id,x.week) x.fair_id,x.week,x.staff_id,x.brand
    FROM fits x
    ORDER BY x.staff_id,x.week,x.bills DESC,x.amount DESC,x.fair_id
  ), appearances AS (
    -- Every bill at a completed fair, at the booth it was written at: its
    -- pick, else the booth its seller worked that week, else its own brand
    -- (NULL: the fair's no-brand board).
    SELECT o.id,o.staff_id,o.fair_event_id,o.cleared,o.revenue,
      coalesce(o.booth_pick,wb.brand,o.own_brand) AS booth,wb.confirmed
    FROM order_facts o JOIN fairs f ON f.id=o.fair_event_id
    LEFT JOIN week_brand wb ON wb.staff_id=o.staff_id AND wb.week=f.week
  ), booth_people AS (
    SELECT a.fair_event_id AS fair_id,a.booth,a.staff_id,
      coalesce(bool_and(a.confirmed),false) AS confirmed,
      EXISTS(SELECT 1 FROM placed pl WHERE pl.staff_id=a.staff_id AND pl.fair_id=a.fair_event_id
        AND pl.brand IS NOT DISTINCT FROM a.booth) AS scoring,
      coalesce(sum(a.revenue) FILTER(WHERE a.cleared),0) AS sales,
      coalesce(sum(a.revenue) FILTER(WHERE NOT a.cleared),0) AS held,
      count(*) FILTER(WHERE a.cleared) AS orders
    FROM appearances a
    GROUP BY a.fair_event_id,a.booth,a.staff_id
  ), events AS (
    SELECT f.id AS fair_id,bp.booth,f.venue,f.start_date,f.end_date,f.period_month,f.week,
      public.member_arena_week_closes_on(f.week) AS closes_on,
      jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'sales',bp.sales,'held',bp.held,
        'orders',bp.orders,'confirmed',bp.confirmed,'scoring',bp.scoring) ORDER BY p.name,p.id) AS people
    FROM booth_people bp JOIN fairs f ON f.id=bp.fair_id JOIN roster p ON p.id=bp.staff_id
    GROUP BY f.id,bp.booth,f.venue,f.start_date,f.end_date,f.period_month,f.week
  ), loose AS (
    SELECT count(*) AS orders,coalesce(sum(o.revenue),0) AS sales
    FROM order_facts o WHERE o.fair_event_id IS NULL AND o.cleared
  ), off_week AS (
    -- On a board without scoring: another booth than the seller's brand week,
    -- a second fair that week, or the no-brand board.
    SELECT coalesce(sum(bp.orders),0) AS orders,coalesce(sum(bp.sales),0) AS sales
    FROM booth_people bp WHERE NOT bp.scoring
  )
  SELECT jsonb_build_object(
    'asOf',now(),'provisional',true,
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.fair_id::text||'|'||coalesce(e.booth,''),'fairId',e.fair_id,
      'brand',e.booth,'venue',e.venue,'start',e.start_date,'end',e.end_date,'week',e.week,
      'closesOn',e.closes_on,'locked',v_today>e.closes_on,
      'periodMonth',to_char(e.period_month,'YYYY-MM'),'people',e.people)
      ORDER BY e.end_date,e.start_date,e.fair_id,e.booth NULLS LAST) FROM events e),'[]'::jsonb),
    'unassignedOrders',(SELECT orders FROM loose),
    'unassignedSales',(SELECT sales FROM loose),
    'offWeekOrders',(SELECT orders FROM off_week),
    'offWeekSales',(SELECT sales FROM off_week),
    'championship',jsonb_build_object('status','pending',
      'reason','Championship totals need every ranking source and a settled scoring ledger. Fair finishes stand on their own until then.'))
  INTO v_result;
  RETURN v_result;
END $$;

COMMENT ON FUNCTION public.member_arena_booth_history_for_staff(uuid,uuid) IS
  'The Arena''s Fair results booth by booth (2026-10-03): one board per (completed fair, booth brand) holding every bill written there — the booth it was picked at, else its seller''s booth that week, else its own brand, else the fair''s no-brand board. A seller is on every board they wrote at; ONE a week scores (scoring = true): the brand they picked for the week (member_arena_brand_weeks.picks), else the brand they opened the most bills for (confirmed = false; auto-located once locked), at the fair with the most bills for it. offWeekOrders/Sales = what is on a board without scoring; unassignedOrders/Sales = bills on no fair.';
