-- ════════════════════════════════════════════════════════════════════════════
-- Resolve the place ONCE per call, not once per fair (2026-09-23)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Revenue › Fair › Aug 2026 stopped loading: "Could not read the month's
-- orders: canceling statement due to statement timeout".
--
-- `revenue_month_orders` calls `venue_event_organiser(o.venue, p_period)` for
-- every bill, and that function filtered
--
--     WHERE e.venue_key = venue_group_key(p_venue)
--
-- `venue_group_key` is STABLE and reads `comm_venues`, so Postgres evaluated
-- it once per comm_venue_events row scanned — and under RLS each of those
-- reads re-checks the policies. With August's 24 fairs on the calendar
-- (20260920050000) that was 409 bills × every fair: 18.9 s as the Principal,
-- 1.1 s as postgres, which is why nobody saw it in SQL.
--
-- Wrapping the call in a scalar sub-SELECT makes it an InitPlan: evaluated
-- once per call. Measured on the live schema as the Principal:
-- revenue_month_orders(Fair, Aug 2026) 18.2 s → 2.2 s.
--
-- `venue_event_for_order` has the same shape and runs inside the stamping
-- trigger and the order page, so it gets the same fix. Bodies are otherwise
-- unchanged from 20260920050000.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION venue_event_for_order(
    p_venue      TEXT,
    p_order_date DATE,
    p_grace_days INT DEFAULT 45
)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT e.id
      FROM comm_venue_events e
     WHERE e.start_date IS NOT NULL
       AND e.venue_key = (SELECT venue_group_key(p_venue))
       AND p_order_date >= e.start_date
       AND p_order_date <= e.end_date + p_grace_days
     ORDER BY (p_order_date <= e.end_date) DESC,  -- open on the day wins outright
              e.end_date DESC                     -- else the fair that closed last
     LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION venue_event_organiser(p_venue TEXT, p_period DATE)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT og.name
      FROM comm_venue_events e
      JOIN comm_organisers og ON og.id = e.organiser_id
     WHERE e.venue_key = (SELECT venue_group_key(p_venue))
       AND e.period_month = DATE_TRUNC('month', p_period)::DATE
     ORDER BY (e.start_date IS NULL) DESC, e.start_date
     LIMIT 1;
$fn$;
