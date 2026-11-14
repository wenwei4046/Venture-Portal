-- ============================================================================
-- 20261114110000_arena_booth_every_weekend.sql
-- A booth open several weekends is ranked in the Arena weekend by weekend (2026-11-14).
-- ============================================================================
--
-- 20261114060000 made a booth a brand week every weekend it is open (2990s' standing booth at Penang Waterfront,
-- 29 Oct – 31 Dec: nine weekends), but the Arena's Fair results still had one board a booth at a COMPLETED fair: the
-- standing booth would have had no board until 31 December, then one for its two months — every weekend's brand week
-- in between without a result. Asked whether it should be ranked weekend by weekend, the user: "yes need by week as
-- well".
--
-- Now member_arena_booth_history_for_staff gives a fair's booth a board EVERY WEEKEND the fair holds — the weekends
-- member_erp_brand_weeks counts (the weekend the fair opens in, then every later Monday–Sunday week it is open on a
-- Friday, Saturday or Sunday; the TS twin is fairWeekends, lib/member/claim-rules.ts):
--   * a weekend's board holds the bills SOLD in it — the day the ERP names (raw.fair.fairDate) when that is one of the
--     fair's days, else the order date; before the fair's second weekend's week a bill is its first weekend's, from
--     its last weekend's week on its last's (member_erp_brand_weeks' own reading);
--   * it is ranked once that weekend is over: its days run from its week's Monday (the fair's first day, for the
--     first) to the day before the next weekend's week (the fair's last day, for the last), and the board stands from
--     its last day — as a fair's board stood from the fair's last day;
--   * the one booth a weekend that scores is the seller's brand week OF THAT WEEKEND (member_erp_brand_weeks gives one
--     a weekend since 20261114060000), else, guessed, the brand they wrote the most bills for in it;
--   * a board's id is the fair's and the booth's, then the weekend's Friday (`<fair>|<brand>|<YYYY-MM-DD>`); its
--     start / end are the weekend's own days, its week that weekend's Friday, its month that Friday's.
-- A fair of ONE weekend — every fair but two on 2026-11-14 — is exactly as before: one board, its id, its days, its
-- week, its month, every bill. The other two: AEON SEREMBAN 2, 14–26 Apr (no bill), and the standing booth.
--
-- One function, written whole from PRODUCTION's body (2026-11-14, md5 of prosrc 1eb40a99…), refused if production
-- changed since. Read by member_arena_booth_history and member_principal_arena_booth_history (each cuts `weeks` to the
-- person read), which do not change. member_arena_week_closes_on is unchanged (nothing has read a week's close since
-- the picks went, 2026-10-12).
--
-- Rollback, in words: re-apply production's body as 20261114060000 left it (md5 1eb40a99…).
--
-- PGlite: tests/member-sql/validate-arena-booth-every-weekend.mjs (production's bodies, this migration verbatim, twice).

BEGIN;

CREATE TEMP TABLE arena_booth_weekend_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO arena_booth_weekend_fns VALUES
  ('public.member_arena_booth_history_for_staff(uuid, uuid)', '1eb40a99a7c9cc10c133f6e52f64abb8', '1b0a242f00643f9974e6ce3344160422');

-- Production's body, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM arena_booth_weekend_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.member_arena_booth_history_for_staff(p_sub_department uuid, p_scheme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
  -- (20261107235500) The bills are member_order_facts' — the old bills topped up out of them already.
  v_current date:=date_trunc('month',v_today)::date;
  -- The brand weeks the app shows (My brand weeks, Today, the claim form): this
  -- month's weekends and the two months' before — the month still being worked
  -- can be two back early in a month.
  v_weeks_from date:=(date_trunc('month',v_today)-interval '2 months')::date;
  v_weeks_until date:=(date_trunc('month',v_today)+interval '1 month')::date;
  v_result jsonb;
BEGIN
  WITH roster AS (
    SELECT DISTINCT s.id,s.employee_name AS name FROM comm_hierarchy h
    JOIN hr_staff_costs s ON s.id=h.staff_id
    LEFT JOIN titles t ON t.id=h.title_id LEFT JOIN titles st ON st.id=s.title_id
    WHERE h.scheme_id=p_scheme AND s.status='active'
      AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
      AND NOT coalesce(t.is_department_head,false) AND NOT coalesce(st.is_department_head,false)
  ), order_facts AS (
    -- (20261107235500) Each holder's part of each bill, counted as its commission is — member_order_facts' reading:
    -- every bill up to this month, its deposit, its KPI items off, a shared bill in its holders' parts, a part a margin
    -- penalty cuts by as much — for a holder on the roster, with the bill's fair, the booth it was picked at and its own
    -- brand. owner: the salesperson it is written on — a week's booth is guessed from the bills a seller wrote.
    SELECT f.order_id AS id,f.staff_id,so.fair_event_id,f.cleared,f.revenue,
      so.staff_id IS NOT DISTINCT FROM f.staff_id AS owner,
      -- The booth the salesperson picked in the ERP, while that pick is the
      -- bill's fair (lib/exhibitions.ts boothOf + brandCodeFor).
      CASE WHEN so.fair_source='erp' AND coalesce(x.fair->>'status','')<>'cancelled'
                AND nullif(btrim(x.fair->>'brand'),'') IS NOT NULL
           THEN coalesce(erp_sync_brand_code(x.fair->>'brand'),
                         upper(regexp_replace(btrim(x.fair->>'brand'),'\s+',' ','g'))) END AS booth_pick,
      nullif(btrim(so.brand_code),'') AS own_brand,
      -- (20261114110000) What says the day it was sold: the day of the fair the ERP names, and its order date.
      x.fair->>'fairDate' AS fair_day,so.order_date
    FROM public.member_order_facts(p_scheme,NULL,NULL) f
    JOIN sales_orders so ON so.id=f.order_id
    -- (20261114110000) The ERP's fair on the bill, read out of the document once — not once a field.
    CROSS JOIN LATERAL (SELECT so.raw->'fair' AS fair OFFSET 0) x
    WHERE f.staff_id IN (SELECT id FROM roster)
  ), fairs AS (
    -- (20261114110000) Every fair that has begun — a weekend of one may be over before the fair is — with its weekends
    -- (the user, 2026-11-14: "yes need by week as well"), member_erp_brand_weeks' own: the Monday of the weekend the
    -- fair opens in — named by its Friday, as a fair's week always was — and of every later Monday–Sunday week in which
    -- it is open on a Friday, Saturday or Sunday; a fair that ends on a Monday is one weekend, the standing booth of two
    -- months nine. A year at most. Its days and its Mondays also as text: what a bill's sale day is read against.
    SELECT e.id,coalesce(nullif(btrim(v.display_name),''),e.venue_key) AS venue,
      coalesce(nullif(btrim(org.name),''),nullif(btrim(e.erp_organiser_text),'')) AS organizer,
      e.start_date,e.end_date,e.period_month,w.mondays,array_length(w.mondays,1) AS weekends,w.monday_texts,
      to_char(e.start_date,'YYYY-MM-DD') AS start_text,to_char(e.end_date,'YYYY-MM-DD') AS end_text
    FROM comm_venue_events e LEFT JOIN comm_venues v ON v.venue_key=e.venue_key
    LEFT JOIN comm_organisers org ON org.id=e.organiser_id
    CROSS JOIN LATERAL (SELECT date_trunc('week',e.start_date::timestamp) AS first_monday) m
    CROSS JOIN LATERAL (
      SELECT array_agg(s.monday ORDER BY s.monday) AS mondays,
             array_agg(to_char(s.monday,'YYYY-MM-DD') ORDER BY s.monday) AS monday_texts
        FROM (SELECT gs::date AS monday
                FROM generate_series(m.first_monday,
                                     LEAST(GREATEST(date_trunc('week',e.end_date::timestamp),m.first_monday),
                                           m.first_monday+interval '52 weeks'),
                                     interval '7 days') AS gs) s
       WHERE s.monday=m.first_monday::date OR (e.start_date<=s.monday+6 AND e.end_date>=s.monday+4)) w
    WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL AND e.start_date<=v_today
  ), fair_weekends AS (
    -- (20261114110000) A fair's weekends, one row each. A weekend's days run from its week's Monday (the fair's first
    -- day, for its first) to the day before its next weekend's week (the fair's last day, for its last).
    SELECT f.id,f.venue,f.organizer,f.start_date,f.end_date,f.period_month,f.weekends,(g.monday+4) AS week,
      CASE WHEN g.nth=1 THEN f.start_date ELSE g.monday END AS span_start,
      coalesce(f.mondays[g.nth::integer+1]-1,f.end_date) AS span_end
    FROM fairs f CROSS JOIN LATERAL unnest(f.mondays) WITH ORDINALITY AS g(monday,nth)
  ), fair_bills AS (
    -- (20261114110000) Each bill at a fair, in the weekend it was sold in: the fair day the ERP names when that is one
    -- of the fair's days, else its order date; before the fair's second weekend's week a bill is its first weekend's,
    -- from its last weekend's week on its last's. A fair of one weekend holds every bill, as before. `done`: the
    -- weekend is over — its board stands from its last day, as a fair's stood from the fair's last day.
    SELECT o.*,f.id AS fair_id,f.mondays[k.nth]+4 AS week,
      (coalesce(f.mondays[k.nth+1]-1,f.end_date)<=v_today) AS done
    FROM order_facts o
    JOIN fairs f ON f.id=o.fair_event_id
    -- The sale day, as text — a day that does not read is no day and no error — read only for a fair of several
    -- weekends: a fair of one is its first and its last, and takes every bill whatever it says.
    CROSS JOIN LATERAL (
      SELECT CASE WHEN f.weekends=1 THEN NULL
                  WHEN left(coalesce(o.fair_day,''),10) ~ '^\d{4}-\d{2}-\d{2}$'
                       AND left(o.fair_day,10) BETWEEN f.start_text AND f.end_text THEN left(o.fair_day,10)
                  ELSE to_char(o.order_date,'YYYY-MM-DD') END AS sold OFFSET 0) d
    -- Its weekend: the first, and one more for each later weekend whose Monday is on or before that day.
    CROSS JOIN LATERAL (
      SELECT CASE WHEN f.weekends=1 THEN 1
                  ELSE (SELECT 1+count(*)::integer FROM unnest(f.monday_texts[2:]) AS t(monday) WHERE t.monday<=d.sold)
             END AS nth OFFSET 0) k
  ), erp_weeks AS (
    -- The first layer: the booth the ERP's Sales Attending lists each seller
    -- at — each weekend it is open (20261114060000).
    SELECT w.* FROM public.member_erp_brand_weeks(p_sub_department) w
    WHERE w.staff_id IN (SELECT id FROM roster)
  ), written AS (
    -- What each seller wrote each weekend that is over, by the brand each bill
    -- names — its booth pick, else its own brand. Only for guessing the week's brand.
    SELECT b.week,b.staff_id,coalesce(b.booth_pick,b.own_brand) AS brand,
      sum(b.revenue) AS amount,count(*) AS bills
    FROM fair_bills b
    WHERE b.done AND b.owner AND coalesce(b.booth_pick,b.own_brand) IS NOT NULL
    GROUP BY b.week,b.staff_id,coalesce(b.booth_pick,b.own_brand)
  ), guessed AS (
    -- The second layer, only where the ERP lists them at no booth that
    -- weekend — the engine as it was: the brand they opened the most bills
    -- for that week, then the most sales.
    SELECT DISTINCT ON (w.staff_id,w.week) w.staff_id,w.week,w.brand
    FROM written w
    WHERE NOT EXISTS (SELECT 1 FROM erp_weeks e WHERE e.staff_id=w.staff_id AND e.week=w.week)
    ORDER BY w.staff_id,w.week,w.bills DESC,w.amount DESC,w.brand
  ), week_brand AS (
    SELECT e.staff_id,e.week,e.brand,'erp'::text AS source FROM erp_weeks e
    UNION ALL
    SELECT g.staff_id,g.week,g.brand,'auto'::text FROM guessed g
  ), owned AS (
    -- (20261114110000) What each seller wrote at each fair each weekend that is over, by the booth it was picked at
    -- (none: NULL) — added up first, so the guessed brands below meet a few rows, not every bill.
    SELECT b.fair_id,b.week,b.staff_id,b.booth_pick,sum(b.revenue) AS amount,count(*) AS bills
    FROM fair_bills b
    WHERE b.done AND b.owner
    GROUP BY b.fair_id,b.week,b.staff_id,b.booth_pick
  ), fits AS (
    -- At each fair that weekend, what can be a guessed seller's booth's: the
    -- bills picked at that brand's booth, and the bills with no pick.
    SELECT o.fair_id,o.week,o.staff_id,g.brand,
      sum(o.amount) AS amount,sum(o.bills) AS bills
    FROM owned o
    JOIN guessed g ON g.staff_id=o.staff_id AND g.week=o.week
    WHERE o.booth_pick IS NULL OR o.booth_pick=g.brand
    GROUP BY o.fair_id,o.week,o.staff_id,g.brand
  ), placed AS (
    -- The ONE booth a week that scores: the one the ERP lists them at; else
    -- their guessed brand, at the fair with the most bills for it.
    SELECT e.fair_id,e.week,e.staff_id,e.brand,'erp'::text AS source FROM erp_weeks e WHERE e.fair_id IS NOT NULL
    UNION ALL
    (SELECT DISTINCT ON (x.staff_id,x.week) x.fair_id,x.week,x.staff_id,x.brand,'auto'::text
     FROM fits x
     ORDER BY x.staff_id,x.week,x.bills DESC,x.amount DESC,x.fair_id)
  ), appearances AS (
    -- Every bill of a weekend that is over, at the booth it was written at:
    -- its pick, else the booth its seller worked that weekend, else its own
    -- brand (NULL: the fair's no-brand board).
    SELECT b.id,b.staff_id,b.fair_id,b.week,b.cleared,b.revenue,
      coalesce(b.booth_pick,wb.brand,b.own_brand) AS booth,wb.source
    FROM fair_bills b
    LEFT JOIN week_brand wb ON wb.staff_id=b.staff_id AND wb.week=b.week
    WHERE b.done
  ), booth_people AS (
    SELECT a.fair_id,a.week,a.booth,a.staff_id,
      max(a.source) AS source,
      -- (20261114110000) The booth of their brand week of THIS weekend.
      EXISTS(SELECT 1 FROM placed pl WHERE pl.staff_id=a.staff_id AND pl.fair_id=a.fair_id AND pl.week=a.week
        AND pl.brand IS NOT DISTINCT FROM a.booth) AS scoring,
      coalesce(sum(a.revenue) FILTER(WHERE a.cleared),0) AS sales,
      coalesce(sum(a.revenue) FILTER(WHERE NOT a.cleared),0) AS held,
      count(*) FILTER(WHERE a.cleared) AS orders
    FROM appearances a
    GROUP BY a.fair_id,a.week,a.booth,a.staff_id
  ), events AS (
    -- A board a booth a weekend: a fair of one weekend as before — its days, its week, its month; a fair of several,
    -- each weekend's own days, its Friday and that Friday's month.
    SELECT fw.id AS fair_id,fw.week,fw.weekends,bp.booth,fw.venue,fw.organizer,fw.span_start,fw.span_end,
      CASE WHEN fw.weekends>1 THEN date_trunc('month',fw.week::timestamp)::date ELSE fw.period_month END AS period_month,
      public.member_arena_week_closes_on(fw.week) AS closes_on,
      jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'sales',bp.sales,'held',bp.held,
        'orders',bp.orders,'source',bp.source,'confirmed',bp.source='erp','scoring',bp.scoring) ORDER BY p.name,p.id) AS people
    FROM booth_people bp JOIN fair_weekends fw ON fw.id=bp.fair_id AND fw.week=bp.week JOIN roster p ON p.id=bp.staff_id
    GROUP BY fw.id,fw.week,fw.weekends,bp.booth,fw.venue,fw.organizer,fw.span_start,fw.span_end,fw.period_month
  ), loose AS (
    SELECT count(DISTINCT o.id) AS orders,coalesce(sum(o.revenue),0) AS sales
    FROM order_facts o WHERE o.fair_event_id IS NULL AND o.cleared
  ), off_week AS (
    -- On a board without scoring: another booth than the seller's brand week,
    -- a second fair that week, or the no-brand board.
    SELECT coalesce(sum(bp.orders),0) AS orders,coalesce(sum(bp.sales),0) AS sales
    FROM booth_people bp WHERE NOT bp.scoring
  ), shown_weeks AS (
    -- Each seller's brand week, this month's weekends and the two months'
    -- before: where the ERP lists them (upcoming weekends too), else where the
    -- second layer placed them by their bills — the fair's days, first to last.
    SELECT e.staff_id,e.week,'erp'::text AS source,e.brand,e.fair_id,e.venue,e.organizer,e.start_date,e.end_date,e.booths
    FROM erp_weeks e WHERE e.week>=v_weeks_from AND e.week<v_weeks_until
    UNION ALL
    SELECT pl.staff_id,pl.week,'auto'::text,pl.brand,pl.fair_id,fw.venue,fw.organizer,fw.start_date,fw.end_date,NULL::integer
    FROM placed pl JOIN fair_weekends fw ON fw.id=pl.fair_id AND fw.week=pl.week
    WHERE pl.source='auto' AND pl.week>=v_weeks_from AND pl.week<v_weeks_until
  )
  SELECT jsonb_build_object(
    'asOf',now(),'provisional',true,
    'events',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',e.fair_id::text||'|'||coalesce(e.booth,'')||CASE WHEN e.weekends>1 THEN '|'||to_char(e.week,'YYYY-MM-DD') ELSE '' END,
      'fairId',e.fair_id,'brand',e.booth,'venue',e.venue,'organizer',e.organizer,'start',e.span_start,'end',e.span_end,
      'week',e.week,'closesOn',e.closes_on,'locked',v_today>e.closes_on,
      'periodMonth',to_char(e.period_month,'YYYY-MM'),'people',e.people)
      ORDER BY e.span_end,e.span_start,e.fair_id,e.booth NULLS LAST) FROM events e),'[]'::jsonb),
    'weeks',coalesce((SELECT jsonb_agg(jsonb_build_object('staffId',w.staff_id,'week',w.week,'source',w.source,
      'brand',w.brand,'fairId',w.fair_id,'venue',w.venue,'organizer',w.organizer,'start',w.start_date,'end',w.end_date,
      'booths',w.booths) ORDER BY w.week,w.staff_id) FROM shown_weeks w),'[]'::jsonb),
    'unassignedOrders',(SELECT orders FROM loose),
    'unassignedSales',(SELECT sales FROM loose),
    'offWeekOrders',(SELECT orders FROM off_week),
    'offWeekSales',(SELECT sales FROM off_week),
    'championship',jsonb_build_object('status','pending',
      'reason','Championship totals need every ranking source and a settled scoring ledger. Fair finishes stand on their own until then.'))
  INTO v_result;
  RETURN v_result;
END $function$;

-- What stands now is what was tested.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(format('%s is md5 %s', f.proc, md5(replace(p.prosrc, E'\r', ''))), '; ' ORDER BY f.proc) INTO v_bad
    FROM arena_booth_weekend_fns f
    JOIN pg_proc p ON p.oid = to_regprocedure(f.proc)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM f.makes;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the body this migration makes: %', v_bad;
  END IF;
END $$;

COMMIT;
