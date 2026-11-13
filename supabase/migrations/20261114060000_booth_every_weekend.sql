-- ============================================================================
-- 20261114060000_booth_every_weekend.sql
-- A booth is a brand week every weekend it is open (2026-11-13).
-- ============================================================================
--
-- A seller's brand week — the booth a claim is for, My brand weeks, Today's and Insight's week, the one booth a
-- weekend that scores — is the booth the Houzs ERP's Sales Attending lists them at "for the weekend its fair opens
-- in" (20261012150000). 2990s' standing booth at Penang Waterfront is open 29 Oct – 31 Dec: ETHAN and SHELDON TAN had
-- a brand week on 30 Oct and none after — nothing to claim for from 6 Nov on, while the one weekend's claim reached
-- over two months. Asked whether every weekend a standing booth is open counts as a brand week (for whom the ERP
-- lists; listed at another fair the same weekend, the one with the most bills, as before), the user, 2026-11-13: "yes".
--
-- Now member_erp_brand_weeks answers one row a WEEKEND a booth is open:
--   * the weekend its fair opens in, exactly as before — so a booth of one weekend answers what it answered;
--   * and every later Monday–Sunday week in which the booth is open on a Friday, Saturday or Sunday. A fair that
--     ends on a Monday (6–9 Nov) is still one weekend; the standing booth is nine (30 Oct … 25 Dec — its last four
--     days, Monday 28 to Thursday 31 December, open no weekend).
--   * Listed at two booths one weekend, the one they wrote the most bills at — and of a booth open several weekends
--     only the bills sold in that weekend's own week count: the day the ERP says a bill was sold on when that is one
--     of the booth's days, else its order date; before the booth's second weekend's week is its first weekend's,
--     from its last weekend's week on its last's.
-- Each row still carries the booth's own days, first to last: a claim follows the fair's dates (the user, the same
-- day: "跟着他的那个 fair date，fair date 是多长，它就是多长") — an Airbnb stay may run the fair's length, and the phone
-- gives each weekend the fair's days of its own week to tick for food (lib/member/claim-rules.ts › fairDays).
--
-- One function, written whole from the body 20261114050000_fair_by_organiser makes (md5 7f495826…, production's
-- 183e8d18… with that migration's one statement) — refused if it is anything else. Read only by four DEFINER
-- functions (the claim's brand week, the Arena's booth history, the order book, HR's Brand weeks); EXECUTE stays the
-- owner's and the service role's. No signature change.
--
-- Rollback, in words: re-apply the body 20261114050000 left.
--
-- PGlite: tests/member-sql/validate-booth-every-weekend.mjs.

BEGIN;

CREATE TEMP TABLE booth_every_weekend_fns (proc text PRIMARY KEY, written_from text NOT NULL, makes text NOT NULL) ON COMMIT DROP;
INSERT INTO booth_every_weekend_fns VALUES
  ('public.member_erp_brand_weeks(uuid, uuid)', '7f495826d491eb26487bd3c715928cc0', '1e03815e94580339bbcea0ce43aa01ff');

-- The body the fair split made, or this migration's own once it has run — else nothing is touched.
DO $$
DECLARE
  v_fn  record;
  v_md5 text;
BEGIN
  FOR v_fn IN SELECT * FROM booth_every_weekend_fns ORDER BY proc LOOP
    SELECT md5(replace(prosrc, E'\r', '')) INTO v_md5 FROM pg_proc WHERE oid = to_regprocedure(v_fn.proc);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION '% is not on this database', v_fn.proc;
    END IF;
    IF v_md5 IS DISTINCT FROM v_fn.written_from AND v_md5 IS DISTINCT FROM v_fn.makes THEN
      RAISE EXCEPTION '% is md5 %, not the body this migration was written from', v_fn.proc, v_md5;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.member_erp_brand_weeks(p_sub_department uuid, p_staff uuid DEFAULT NULL::uuid)
 RETURNS TABLE(staff_id uuid, week date, erp_project_id bigint, fair_id uuid, brand text, venue text, venue_key text, organizer text, start_date date, end_date date, booths integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH listed AS (
    -- Every booth the ERP lists a portal person at — by the scm.staff id the
    -- order feed already matched to them — a cancelled booth aside.
    SELECT a.staff_id, b.erp_project_id, b.brand_code, b.venue AS erp_venue, b.venue_key AS erp_venue_key,
           b.organizer, b.start_date, b.end_date,
           f.id AS fair_id, f.start_date AS fair_start, f.venue_key AS fair_venue_key,
           coalesce(nullif(btrim(v.display_name), ''), f.venue_key) AS fair_venue
      FROM erp_booth_staff s
      JOIN comm_agent_aliases a ON a.erp_salesperson_id = s.erp_salesperson_id
      JOIN erp_booths b ON b.erp_project_id = s.erp_project_id
      -- The portal's fair for the booth: the one the order feed pinned the
      -- project to, else the same place on overlapping days under the same organiser (erp_sync_fair's rule).
      LEFT JOIN LATERAL (
        SELECT e.id, e.start_date, e.venue_key
          FROM comm_venue_events e
         WHERE e.erp_project_ids @> ARRAY[b.erp_project_id::integer]
            OR (e.venue_key = b.venue_key AND e.start_date IS NOT NULL AND e.end_date IS NOT NULL
                AND daterange(e.start_date, e.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
                -- (20261114050000) … under the booth's own organiser: another organiser's fair at the place on
                -- those days is another fair, and the booth is read in its own weekend.
                AND (e.organiser_id IS NULL OR organiser_key(b.organizer) IS NULL
                     OR organiser_key(b.organizer) = (SELECT organiser_key(og.name) FROM comm_organisers og
                                                       WHERE og.id = e.organiser_id)))
         ORDER BY (e.erp_project_ids @> ARRAY[b.erp_project_id::integer]) DESC,
                  (e.start_date = b.start_date AND e.end_date = b.end_date) DESC, e.start_date, e.id
         LIMIT 1) f ON true
      LEFT JOIN comm_venues v ON v.venue_key = f.venue_key
     WHERE lower(b.status) NOT IN ('cancelled', 'canceled')
       AND (p_staff IS NULL OR a.staff_id = p_staff)
  ), weekends AS (
    -- (20261114060000) A booth is a brand week every weekend it is open (the user, 2026-11-13): the weekend its fair
    -- opens in, as before — a fair belongs to the weekend it opens in, named by its Friday, the Arena's weeks — and
    -- every later Monday–Sunday week in which the booth is open on a Friday, Saturday or Sunday. A fair that ends on
    -- a Monday is one weekend; a standing booth of two months is nine. `nth` is the weekend's place among the booth's,
    -- `next_monday` the Monday its next one's week begins — none after its last.
    SELECT l.*, g.monday, g.nth, w.mondays[g.nth::integer + 1] AS next_monday
      FROM listed l
     CROSS JOIN LATERAL (SELECT date_trunc('week', coalesce(l.fair_start, l.start_date)::timestamp)::date AS first_monday) o
     CROSS JOIN LATERAL (
       SELECT array_agg(s.monday ORDER BY s.monday) AS mondays
         FROM (SELECT gs::date AS monday
                 FROM generate_series(o.first_monday::timestamp,
                                      LEAST(GREATEST(date_trunc('week', l.end_date::timestamp), o.first_monday::timestamp),
                                            o.first_monday::timestamp + interval '52 weeks'),
                                      interval '7 days') AS gs) s
        WHERE s.monday = o.first_monday
           OR (l.start_date <= s.monday + 6 AND l.end_date >= s.monday + 4)) w
     CROSS JOIN LATERAL unnest(w.mondays) WITH ORDINALITY AS g(monday, nth)
  ), weighed AS (
    SELECT l.*,
      (l.monday + 4) AS wk,
      -- Listed at two booths that weekend: the one they wrote the most bills at
      -- (the second layer's own measure), each bill read at the booth it names.
      (SELECT count(DISTINCT so.order_no)
         FROM sales_orders so
         JOIN sales_import_batches ib ON ib.id = so.batch_id
        CROSS JOIN LATERAL (
          -- The booth the bill names (member_arena_booth_history_for_staff's booth_pick).
          SELECT CASE WHEN so.fair_source = 'erp' AND coalesce(so.raw->'fair'->>'status', '') <> 'cancelled'
                           AND nullif(btrim(so.raw->'fair'->>'brand'), '') IS NOT NULL
                      THEN coalesce(erp_sync_brand_code(so.raw->'fair'->>'brand'),
                                    upper(regexp_replace(btrim(so.raw->'fair'->>'brand'), '\s+', ' ', 'g'))) END AS booth,
                 -- (20261114060000) The day it was sold: the day of the fair the ERP names when that is one of the
                 -- booth's days, else its order date — as text, so a day that does not read is no day and no error.
                 CASE WHEN left(coalesce(so.raw->'fair'->>'fairDate', ''), 10) ~ '^\d{4}-\d{2}-\d{2}$'
                           AND left(so.raw->'fair'->>'fairDate', 10)
                               BETWEEN to_char(l.start_date, 'YYYY-MM-DD') AND to_char(l.end_date, 'YYYY-MM-DD')
                      THEN left(so.raw->'fair'->>'fairDate', 10)
                      ELSE to_char(so.order_date, 'YYYY-MM-DD') END AS sold
        ) bp
        WHERE l.fair_id IS NOT NULL AND so.fair_event_id = l.fair_id AND so.staff_id = l.staff_id
          AND NOT so.cancelled AND ib.sub_department_id = p_sub_department AND ib.status = 'committed'
          AND (bp.booth IS NULL OR bp.booth = l.brand_code)
          -- (20261114060000) Of a booth open several weekends, the bills sold in this weekend's own week: before its
          -- second weekend's week they are its first weekend's, from its last weekend's week on its last's.
          AND (l.nth = 1 OR bp.sold >= to_char(l.monday, 'YYYY-MM-DD'))
          AND (l.next_monday IS NULL OR bp.sold < to_char(l.next_monday, 'YYYY-MM-DD'))) AS bills
      FROM weekends l
  )
  SELECT DISTINCT ON (w.staff_id, w.wk)
         w.staff_id, w.wk, w.erp_project_id, w.fair_id, w.brand_code,
         coalesce(w.fair_venue, w.erp_venue), coalesce(w.fair_venue_key, w.erp_venue_key),
         w.organizer, w.start_date, w.end_date,
         (count(*) OVER (PARTITION BY w.staff_id, w.wk))::integer
    FROM weighed w
   ORDER BY w.staff_id, w.wk, w.bills DESC, w.start_date, w.erp_project_id
$function$;

-- What stands now is what was tested.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(format('%s is md5 %s', f.proc, md5(replace(p.prosrc, E'\r', ''))), '; ' ORDER BY f.proc) INTO v_bad
    FROM booth_every_weekend_fns f
    JOIN pg_proc p ON p.oid = to_regprocedure(f.proc)
   WHERE md5(replace(p.prosrc, E'\r', '')) IS DISTINCT FROM f.makes;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Not the body this migration makes: %', v_bad;
  END IF;
END $$;

COMMIT;
