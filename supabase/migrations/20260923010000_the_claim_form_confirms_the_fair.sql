-- ════════════════════════════════════════════════════════════════════════════
-- The claim form confirms the fair (2026-09-23)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. `20260920050000` made the fair set the month: `venue_event_for_order`
-- stamps every bill with the fair open on its order date, else the most
-- recent fair at that place that closed within 45 days. Nobody has typed
-- September's fairs yet, so the 45 days reach back from September into
-- August. On 2026-09-23 the preview wanted to carry 174 bills (RM 1,057,125)
-- from September into August, and when those bills were checked against
-- August's hand-written claim form, document number by document number:
--
--   96 bills  RM 637,921  ARE on the claim form   → really August's
--   78 bills  RM 419,204  are NOT                 → September's own fairs at
--                                                   the same halls (IOI Mall
--                                                   Putrajaya 16–22 Sep, Mid
--                                                   Valley 13–22 Sep, MVEC
--                                                   Southkey 18–23 Sep …)
--
-- NO GRACE WINDOW CAN SPLIT THEM. The two groups' lags after the August fair
-- closed overlap completely: claim-form bills run 1–31 days late, the
-- September bills 10–40. Only a human record can say which is which. The
-- claim form is that record — the document August was actually paid from.
--
-- The schema already had a word for it: `fair_source = 'manual'`, "a human
-- said so, and the resolver never touches it again". What it lacked was a way
-- to MOVE ONLY what a human said. Without that, the apply is all or nothing:
-- move the 78 September bills into August with the 96, or move nothing.
--
-- So:
--   1. `revenue_fair_calendar_moves` reports `confirmed` per bill.
--   2. `revenue_fair_calendar` counts `confirmed_to_move` per fair.
--   3. `revenue_apply_fair_calendar(sub, p_confirmed_only)` can move only the
--      confirmed ones and leave the calendar's guesses where they are.
--
-- The 78 are NOT pinned to "no fair". A manual pin is forever, so pinning
-- them would stop them ever finding their September fair once it is typed.
-- They stay a guess, the banner keeps counting them as "the calendar thinks
-- these belong elsewhere", and they settle the day September is typed.
--
-- Rollback: re-run sections 5 and 6 of 20260920050000 (both functions are
-- DROP + CREATE there) and section 7's revenue_fair_calendar.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. What would move, and whether a human confirmed it ───────────────────

DROP FUNCTION IF EXISTS revenue_fair_calendar_moves(UUID);

CREATE FUNCTION revenue_fair_calendar_moves(p_sub_department_id UUID)
RETURNS TABLE (
    order_id      UUID,
    order_no      TEXT,
    order_date    DATE,
    venue         TEXT,
    agent_name    TEXT,
    staff_id      UUID,
    employee_name TEXT,
    order_total   NUMERIC,
    cancelled     BOOLEAN,
    from_period   DATE,
    to_period     DATE,
    fair_id       UUID,
    fair_start    DATE,
    fair_end      DATE,
    organiser     TEXT,
    lag_days      INTEGER,
    locked        BOOLEAN,
    confirmed     BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT o.id, o.order_no, o.order_date, o.venue, o.agent_name, o.staff_id,
           s.employee_name, o.order_total, o.cancelled,
           o.period_month, e.period_month,
           e.id, e.start_date, e.end_date, og.name,
           (o.order_date - e.end_date)::INTEGER,
           commission_order_period_locked(p_sub_department_id, o.period_month)
             OR commission_order_period_locked(p_sub_department_id, e.period_month),
           o.fair_source = 'manual'
      FROM sales_orders o
      JOIN sales_import_batches b ON b.id = o.batch_id
      JOIN comm_venue_events e    ON e.id = o.fair_event_id
      LEFT JOIN comm_organisers og ON og.id = e.organiser_id
      LEFT JOIN hr_staff_costs s   ON s.id = o.staff_id
     WHERE b.sub_department_id = p_sub_department_id
       AND e.period_month <> o.period_month
     ORDER BY e.period_month, o.order_date, o.order_no;
$fn$;

COMMENT ON FUNCTION revenue_fair_calendar_moves(UUID) IS
    'Every bill the fair calendar disagrees with: where it sits, the fair it was written at, and the month that fair belongs to. confirmed = a human placed the bill at that fair (fair_source = manual, e.g. from the month''s claim form); otherwise the fair is venue_event_for_order''s guess. Read-only — this is what revenue_apply_fair_calendar would do.';

-- ─── 2. Move them — all, or only what a human confirmed ─────────────────────

DROP FUNCTION IF EXISTS revenue_apply_fair_calendar(UUID);
DROP FUNCTION IF EXISTS revenue_apply_fair_calendar(UUID, BOOLEAN);

CREATE FUNCTION revenue_apply_fair_calendar(
    p_sub_department_id UUID,
    p_confirmed_only    BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    orders_moved   INTEGER,
    value_moved    NUMERIC,
    months_touched DATE[]
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_months DATE[];
    v_month  DATE;
    v_moved  INTEGER := 0;
    v_value  NUMERIC := 0;
BEGIN
    -- Both sides of every move: a bill leaving September changes September too.
    SELECT ARRAY(
        SELECT DISTINCT m FROM (
            SELECT from_period AS m FROM revenue_fair_calendar_moves(p_sub_department_id)
             WHERE NOT p_confirmed_only OR confirmed
            UNION
            SELECT to_period        FROM revenue_fair_calendar_moves(p_sub_department_id)
             WHERE NOT p_confirmed_only OR confirmed
        ) x ORDER BY m
    ) INTO v_months;

    IF v_months IS NULL OR CARDINALITY(v_months) = 0 THEN
        RETURN QUERY SELECT 0, 0::NUMERIC, ARRAY[]::DATE[];
        RETURN;
    END IF;

    -- The same refusal recost_sales_order_lines makes, for the same reason:
    -- which month a bill is in decides which run paid it.
    FOREACH v_month IN ARRAY v_months LOOP
        IF commission_order_period_locked(p_sub_department_id, v_month) THEN
            RAISE EXCEPTION
                'The run for % has paid. Reopen it before moving bills into or out of that month — the fair a bill belongs to decides what the run paid.',
                TO_CHAR(v_month, 'Mon YYYY')
                USING ERRCODE = '23RUN';
        END IF;
    END LOOP;

    -- A month whose fairs were all keyed in late may have no batch of its own
    -- yet. Open one the same way the live feed does.
    FOREACH v_month IN ARRAY v_months LOOP
        INSERT INTO sales_import_batches
            (period_month, file_name, source, status, notes, sub_department_id)
        VALUES
            (v_month, 'ERP live sync', 'erp_sync', 'committed',
             'Opened by the fair calendar: bills written at a fair this month reached the ERP later.',
             p_sub_department_id)
        ON CONFLICT (sub_department_id, period_month) WHERE status = 'committed'
        DO NOTHING;
    END LOOP;

    WITH moves AS (
        SELECT m.order_id,
               m.to_period,
               (SELECT b.id
                  FROM sales_import_batches b
                 WHERE b.sub_department_id = p_sub_department_id
                   AND b.period_month = m.to_period
                   AND b.status = 'committed') AS target_batch
          FROM revenue_fair_calendar_moves(p_sub_department_id) m
         WHERE NOT p_confirmed_only OR m.confirmed
    ), applied AS (
        UPDATE sales_orders o
           SET period_month = mv.to_period,
               batch_id     = mv.target_batch
          FROM moves mv
         WHERE o.id = mv.order_id
           AND mv.target_batch IS NOT NULL
        RETURNING o.order_total
    )
    SELECT COUNT(*)::INTEGER, COALESCE(SUM(order_total), 0)
      INTO v_moved, v_value
      FROM applied;

    PERFORM erp_sync_refresh_batch(b.id)
       FROM sales_import_batches b
      WHERE b.sub_department_id = p_sub_department_id
        AND b.period_month = ANY (v_months)
        AND b.status = 'committed';

    RETURN QUERY SELECT v_moved, v_value, v_months;
END;
$fn$;

COMMENT ON FUNCTION revenue_apply_fair_calendar(UUID, BOOLEAN) IS
    'Moves the bills the fair calendar disagrees with into the month of their fair, batch and all, and refreshes the counters on both sides. p_confirmed_only = move only bills a human placed at their fair (fair_source = manual) and leave venue_event_for_order''s guesses where they are — the calendar''s 45-day grace reaches back across a month end whenever the next month''s fairs are not typed yet. Refuses (23RUN) if any month it would touch has a run that has paid. Every run over a touched month must be computed again afterwards.';

-- ─── 3. The calendar, counting what is confirmed ────────────────────────────

DROP FUNCTION IF EXISTS revenue_fair_calendar();

CREATE FUNCTION revenue_fair_calendar()
RETURNS TABLE (
    fair_id                 UUID,
    venue_key               TEXT,
    display_name            TEXT,
    period_month            DATE,
    start_date              DATE,
    end_date                DATE,
    organiser_id            UUID,
    organiser_name          TEXT,
    erp_organiser_text      TEXT,
    source                  TEXT,
    notes                   TEXT,
    bills                   INTEGER,
    sales_value             NUMERIC,
    bills_to_move           INTEGER,
    value_to_move           NUMERIC,
    confirmed_to_move       INTEGER,
    confirmed_value_to_move NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT e.id,
           e.venue_key,
           COALESCE(v.display_name, e.venue_key),
           e.period_month,
           e.start_date,
           e.end_date,
           e.organiser_id,
           og.name,
           e.erp_organiser_text,
           e.source,
           e.notes,
           COALESCE(o.bills, 0)::INTEGER,
           COALESCE(o.value, 0),
           COALESCE(o.moving, 0)::INTEGER,
           COALESCE(o.moving_value, 0),
           COALESCE(o.confirmed, 0)::INTEGER,
           COALESCE(o.confirmed_value, 0)
      FROM comm_venue_events e
      LEFT JOIN comm_venues v      ON v.venue_key = e.venue_key
      LEFT JOIN comm_organisers og ON og.id = e.organiser_id
      LEFT JOIN LATERAL (
          SELECT COUNT(*)                                                      AS bills,
                 SUM(so.order_total)                                           AS value,
                 COUNT(*) FILTER (WHERE so.period_month <> e.period_month)     AS moving,
                 SUM(so.order_total) FILTER (WHERE so.period_month <> e.period_month)
                                                                               AS moving_value,
                 COUNT(*) FILTER (WHERE so.period_month <> e.period_month
                                    AND so.fair_source = 'manual')             AS confirmed,
                 SUM(so.order_total) FILTER (WHERE so.period_month <> e.period_month
                                               AND so.fair_source = 'manual')  AS confirmed_value
            FROM sales_orders so
           WHERE so.fair_event_id = e.id
      ) o ON TRUE
     ORDER BY COALESCE(e.start_date, e.period_month) DESC,
              COALESCE(v.display_name, e.venue_key);
$fn$;

COMMENT ON FUNCTION revenue_fair_calendar() IS
    'Every fair on record: its place, its days, its organiser, what was sold at it, how many of those bills are still sitting in a different month than the fair, and how many of THOSE a human confirmed (fair_source = manual). Department-level like the venue register — a hall is a hall whoever sells in it.';

NOTIFY pgrst, 'reload schema';
