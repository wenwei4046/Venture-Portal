-- ═══════════════════════════════════════════════════════════════════════════
-- A brand week closes seven days after its fair (2026-10-03)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 20261003180000 let a member pick the brand of any week of the current or a
-- past month and change it whenever they liked — so a seller who wrote bills at
-- two booths could wait for the finishes and pick the board that ranked them
-- higher. The user (2026-10-03): 在这一边我建议加一道锁，就是在结束之后的一个
-- 星期 … 7 号是最后一天，那就从 7 号开始多给 7 天时间让他们去填，没有填就
-- closing 了 … after 一个星期后就不能再改了，除非是 ERP 那边改，或者是后台这边改.
--
-- 1. A WEEK CLOSES seven days after the last day of its fairs
--    (member_arena_week_closes_on): a fair of 5–7 is open to pick until the
--    14th. A week with no fair closes seven days after its Sunday.
-- 2. THE MEMBER'S SAVE refuses a change to a closed week
--    (member_arena_save_brand_week_picks). One helper checks the picks
--    (member_arena_clean_week_picks), one stores them (member_arena_store_week_picks).
-- 3. THE BACK OFFICE changes any week of a member, closed or not
--    (member_principal_save_brand_week_picks, an active Principal account —
--    the same check as the Principal's member view). The ERP changes a week
--    the other way: by changing which booth the bills were picked at.
-- 4. AUTO-LOCATED: a closed week nobody picked is placed at the brand the
--    seller opened the most bills for that week (开最多单的那个 brand), then the
--    most sales. Each booth now says when its week closes (closesOn) and
--    whether it has (locked), so the board tells Auto-located from Unconfirmed;
--    the snapshot carries the month's weekLocks for the form.
--
-- REVERSAL
--   member_arena_save_brand_week_picks, member_arena_with_week_picks and
--     member_arena_booth_history_for_staff back to 20261003180000's;
--   DROP FUNCTION member_principal_save_brand_week_picks(uuid,uuid,text,jsonb);
--   DROP FUNCTION member_arena_store_week_picks(uuid,uuid,date,jsonb);
--   DROP FUNCTION member_arena_clean_week_picks(text,jsonb);
--   DROP FUNCTION member_arena_week_closes_on(date);

-- ─── 1. When a week closes ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_arena_week_closes_on(p_week date) RETURNS date
LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT coalesce((SELECT max(e.end_date) FROM comm_venue_events e
                    WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL
                      AND date_trunc('week',e.start_date::timestamp)::date+4=p_week),
                  p_week+2)+7
$$;

COMMENT ON FUNCTION public.member_arena_week_closes_on(date) IS
  'The last day a member can pick the brand of the week named by p_week (its Friday): seven days after the last day of that week''s fairs, else seven days after its Sunday (2026-10-03).';

REVOKE ALL ON FUNCTION public.member_arena_week_closes_on(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_arena_week_closes_on(date) TO authenticated;

-- ─── 2. The picks, checked and stored ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.member_arena_clean_week_picks(p_period text,p_picks jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE
  v_month date; v_fridays date[]; v_brands text[]:=ARRAY['AKEMI','ERGOTEX','ZANOTTI','DUNLOP'];
  v_key text; v_value jsonb; v_brand text; v_picks jsonb:='{}'::jsonb;
BEGIN
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
  RETURN v_picks;
END $$;

REVOKE ALL ON FUNCTION public.member_arena_clean_week_picks(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.member_arena_store_week_picks(p_staff uuid,p_sub_department uuid,p_month date,p_picks jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO member_arena_brand_weeks(staff_id,sub_department_id,period_month,weeks,counts,picks)
  VALUES(p_staff,p_sub_department,p_month,cardinality(public.member_arena_month_fridays(p_month)),
    (SELECT jsonb_object_agg(b,(SELECT count(*) FROM jsonb_each_text(p_picks) k WHERE k.value=b))
       FROM unnest(ARRAY['AKEMI','ERGOTEX','ZANOTTI','DUNLOP']) b),
    p_picks)
  ON CONFLICT(staff_id,sub_department_id,period_month) DO UPDATE
    SET weeks=excluded.weeks,counts=excluded.counts,picks=excluded.picks,updated_at=now()
$$;

REVOKE ALL ON FUNCTION public.member_arena_store_week_picks(uuid,uuid,date,jsonb) FROM PUBLIC,anon,authenticated;

-- ─── 3. The member's save: a closed week stays as it is ────────────────────

CREATE OR REPLACE FUNCTION public.member_arena_save_brand_week_picks(p_sub_department uuid,p_period text,p_picks jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_staff uuid:=public.member_staff_id(); v_month date; v_picks jsonb; v_stored jsonb;
  v_week date; v_closes date; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
  PERFORM public.member_arena_scheme(p_sub_department);
  v_picks:=public.member_arena_clean_week_picks(p_period,p_picks);
  v_month:=(p_period||'-01')::date;
  SELECT w.picks INTO v_stored FROM member_arena_brand_weeks w
   WHERE w.staff_id=v_staff AND w.sub_department_id=p_sub_department AND w.period_month=v_month;
  FOREACH v_week IN ARRAY public.member_arena_month_fridays(v_month) LOOP
    v_closes:=public.member_arena_week_closes_on(v_week);
    IF v_today>v_closes AND (v_picks->>v_week::text) IS DISTINCT FROM (coalesce(v_stored,'{}'::jsonb)->>v_week::text) THEN
      RAISE EXCEPTION 'The weekend of % closed on % — only the back office can change it now',
        to_char(v_week,'FMDD Mon'),to_char(v_closes,'FMDD Mon');
    END IF;
  END LOOP;
  PERFORM public.member_arena_store_week_picks(v_staff,p_sub_department,v_month,v_picks);
END $$;

COMMENT ON FUNCTION public.member_arena_save_brand_week_picks(uuid,text,jsonb) IS
  'A member saves the brand they worked each week of a month: {"<Friday>":"AKEMI"|"DUNLOP"|"ZANOTTI"|"ERGOTEX"|null}. A week closed seven days after its fair (member_arena_week_closes_on) cannot change here — only in the back office (member_principal_save_brand_week_picks). Their own row only.';

-- ─── 4. The back office: any week, closed or not ───────────────────────────

CREATE OR REPLACE FUNCTION public.member_principal_save_brand_week_picks(p_staff uuid,p_sub_department uuid,p_period text,p_picks jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_picks jsonb;
BEGIN
  PERFORM public.member_principal_context(p_staff,p_sub_department);
  v_picks:=public.member_arena_clean_week_picks(p_period,p_picks);
  PERFORM public.member_arena_store_week_picks(p_staff,p_sub_department,(p_period||'-01')::date,v_picks);
END $$;

COMMENT ON FUNCTION public.member_principal_save_brand_week_picks(uuid,uuid,text,jsonb) IS
  'The back office (an active Principal account) sets a member''s brand weeks for a month — closed weeks too (2026-10-03).';

REVOKE ALL ON FUNCTION public.member_principal_save_brand_week_picks(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.member_principal_save_brand_week_picks(uuid,uuid,text,jsonb) TO authenticated;

-- ─── 5. The snapshot says which weeks of the month are still open ──────────

CREATE OR REPLACE FUNCTION public.member_arena_with_week_picks(p_snapshot jsonb,p_staff uuid,p_sub_department uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (CASE WHEN jsonb_typeof(p_snapshot->'brandWeeks')='object'
      THEN jsonb_set(p_snapshot,'{brandWeeks,picks}',coalesce((SELECT w.picks FROM member_arena_brand_weeks w
        WHERE w.staff_id=p_staff AND w.sub_department_id=p_sub_department
          AND w.period_month=((p_snapshot->>'period')||'-01')::date),'{}'::jsonb))
      ELSE p_snapshot END)
    || jsonb_build_object('weekLocks',coalesce((
      SELECT jsonb_agg(jsonb_build_object('week',x.week,'closesOn',x.closes_on,
          'locked',(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date>x.closes_on) ORDER BY x.week)
        FROM (SELECT w AS week,public.member_arena_week_closes_on(w) AS closes_on
                FROM unnest(public.member_arena_month_fridays(((p_snapshot->>'period')||'-01')::date)) w) x),'[]'::jsonb))
$$;

-- ─── 6. The results: auto-located by the most bills, and when a week closes ─
-- 20261003180000's, with the guess and the fair chosen by the most BILLS first
-- and every booth carrying its week's closesOn / locked.

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
    SELECT f.id AS fair_id,f.week,o.staff_id,wb.brand,wb.confirmed,
      sum(o.revenue) AS amount,count(*) AS bills
    FROM fairs f JOIN order_facts o ON o.fair_event_id=f.id
    JOIN week_brand wb ON wb.staff_id=o.staff_id AND wb.week=f.week
    WHERE o.booth_pick IS NULL OR o.booth_pick=wb.brand
    GROUP BY f.id,f.week,o.staff_id,wb.brand,wb.confirmed
  ), placed AS (
    -- One booth per seller per week: their week's brand, at the fair with the
    -- most bills for it.
    SELECT DISTINCT ON (x.staff_id,x.week) x.fair_id,x.week,x.staff_id,x.brand,x.confirmed
    FROM fits x
    ORDER BY x.staff_id,x.week,x.bills DESC,x.amount DESC,x.fair_id
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
      public.member_arena_week_closes_on(f.week) AS closes_on,
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
      'closesOn',e.closes_on,'locked',v_today>e.closes_on,
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
  'The Arena''s Fair results booth by booth (2026-10-03): one board per (completed fair, booth brand), each seller placed at ONE booth a week — the brand they picked for the week (member_arena_brand_weeks.picks), else the brand they opened the most bills for (confirmed = false; auto-located for good once the week is locked) — with what they sold there: bills picked at that booth, and bills with no booth pick. Bills picked at another booth, or at another fair that week, are counted in elsewhereOrders/Sales; bills on no fair in unassignedOrders/Sales.';
