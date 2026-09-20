-- 20260920050000_the_fair_sets_the_month.sql
--
-- THE FAIR SETS THE MONTH — NOT THE DAY SOMEBODY KEYED THE BILL IN.
--
-- A hand-computed SALARY CLAIM FORM for August 2026 was compared with this
-- database bill by bill on 2026-09-19/20. 341 documents, RM 2,138,566. Only
-- 174 of them (RM 1,202,637) were in the portal's August. 106 (RM 674,744)
-- had been pushed into September and 60 (RM 253,086) had never arrived at
-- all. The engine was not wrong. The MONTH was wrong, and it was wrong for
-- one reason, in one line:
--
--     src/lib/erp-sync/contract.ts:276   isoDate(header.so_date)
--     20260905010000_erp_live_sync.sql   v_period := DATE_TRUNC('month', v_order_date)
--
-- `header.so_date` is the day the document was OPENED IN THE BACK OFFICE. It
-- is not the day the customer signed at the fair. Fairs run Friday to Sunday;
-- the paperwork comes back to the office afterwards, and an out-station fair
-- (Kuching) is keyed in a week later. Of the 280 documents that matched, only
-- FIVE carried the right date. The median lag was 4 days and the longest 42.
--
-- Four days does not matter in the middle of a month. At the end of one it
-- moves a whole fair into the next month's payroll: Kuching (8/28-31), MITC
-- (8/30-31) and IOI GECC (8/29-31) all landed in the portal's September,
-- while July's month-end fairs (Sunway Pyramid, Kota Bharu) were sitting in
-- the portal's August. The two errors cancel to a 10% difference in the
-- monthly total, which is why nobody saw it — but half the bills inside the
-- month had been swapped.
--
-- THE FIX IS NOT A BETTER DATE. IT IS A FAIR.
--
-- The ERP cannot help: every `header` key of all 552 deliveries the portal
-- holds was enumerated on 2026-09-20 and there is no fair, event, roadshow or
-- campaign field. `header.venue_id` exists and is NULL on every single order
-- including the ones that arrived that morning. The only dates are `so_date`,
-- the record timestamps, a `payment_date` that copies `so_date`, and the
-- customer's delivery date.
--
-- So the portal keeps the fair calendar itself, and 20260918040000 left the
-- door open for exactly this day:
--
--     "the surrogate id and the UNIQUE constraint (rather than a composite
--      primary key) are here so that day is an ALTER, not a rewrite."
--
-- This is that ALTER. `comm_venue_events` already means "the fair"; it gains
-- the two dates it was always missing, and stops being limited to one row per
-- (venue, month) — because the user confirmed on 2026-09-20 that one hall
-- holds two or three fairs a month, and the hand-computed form proves it
-- names a different organiser each time:
--
--     REX     MVEC SOUTHKEY   8/09, 8/10, 8/15
--     BIGHOME MVEC SOUTHKEY   8/29, 8/30, 8/31
--
-- One venue, one month, two fairs, two organisers. The old UNIQUE could not
-- hold that, so the organiser it held for such a month was already a coin
-- toss.
--
-- WHAT DECIDES A BILL'S MONTH NOW. `venue_event_for_order()`: the fair at
-- that PLACE whose window contains the order date, else the most recent fair
-- there that closed within the grace window before it (45 days — the observed
-- worst lag was 42). A bill with no fair keeps the month of its order date,
-- exactly as today. Nothing is guessed: until a human types a fair's dates,
-- this migration changes no month at all.
--
-- WHAT IS DELIBERATELY NOT TOUCHED. `event_date`. The commission spec section
-- 4.4 reads Open Bill as "1st / 2nd / 3rd bill of the EVENT DAY", and
-- collapsing a four-day fair onto one date would turn three bonuses a fair
-- into one. That is a separate decision with its own money attached, so the
-- day stays where it is and only the MONTH moves here.
--
-- MOVING A MONTH IS MOVING MONEY, so `revenue_apply_fair_calendar` refuses a
-- month whose run has paid (23RUN), the same way `recost_sales_order_lines`
-- does, and `revenue_fair_calendar_moves` shows every bill that would move
-- before anything does.
--
-- Additive. Reversal:
--   DROP FUNCTION revenue_apply_fair_calendar, revenue_fair_calendar_moves,
--                 venue_event_organiser_for_order, venue_event_for_order;
--   DROP TRIGGER sales_orders_resolve_fair ON sales_orders;
--   DROP FUNCTION sales_orders_resolve_fair;
--   ALTER TABLE sales_orders DROP COLUMN fair_event_id, DROP COLUMN fair_source;
--   ALTER TABLE comm_venue_events
--       DROP CONSTRAINT comm_venue_events_no_overlap,
--       DROP COLUMN start_date, DROP COLUMN end_date;
--   DROP INDEX uq_comm_venue_events_undated;
--   ALTER TABLE comm_venue_events ADD CONSTRAINT uq_comm_venue_events
--       UNIQUE (venue_key, period_month);

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── 1. comm_venue_events becomes the fair proper ───────────────────────────

ALTER TABLE comm_venue_events
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date   DATE;

COMMENT ON COLUMN comm_venue_events.start_date IS
    'The first day the fair was open. NULL on a row that only names the month''s organiser (the shape every row had before 2026-09-20). A fair with no dates can never place a bill.';
COMMENT ON COLUMN comm_venue_events.end_date IS
    'The last day the fair was open, inclusive. A bill keyed after it still belongs to this fair for venue_event_for_order''s grace window.';

ALTER TABLE comm_venue_events
    DROP CONSTRAINT IF EXISTS uq_comm_venue_events;

ALTER TABLE comm_venue_events
    DROP CONSTRAINT IF EXISTS comm_venue_events_window_paired,
    DROP CONSTRAINT IF EXISTS comm_venue_events_window_ordered,
    DROP CONSTRAINT IF EXISTS comm_venue_events_window_in_month;

ALTER TABLE comm_venue_events
    ADD CONSTRAINT comm_venue_events_window_paired
        CHECK ((start_date IS NULL) = (end_date IS NULL)),
    ADD CONSTRAINT comm_venue_events_window_ordered
        CHECK (end_date IS NULL OR end_date >= start_date),
    -- A fair that straddles month end (8/30 - 9/2) belongs to whichever of the
    -- two months the human says, and to nothing else.
    ADD CONSTRAINT comm_venue_events_window_in_month
        CHECK (start_date IS NULL
               OR period_month = DATE_TRUNC('month', start_date)::DATE
               OR period_month = DATE_TRUNC('month', end_date)::DATE);

-- The legacy shape keeps its old guarantee: at most one undated row per
-- (place, month), so "who ran this venue in August" still has one answer when
-- nobody has typed the calendar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_venue_events_undated
    ON comm_venue_events (venue_key, period_month) WHERE start_date IS NULL;

-- Two fairs at one place may not be open at the same time. This is what makes
-- venue_event_for_order unambiguous rather than a best guess.
ALTER TABLE comm_venue_events
    DROP CONSTRAINT IF EXISTS comm_venue_events_no_overlap;
ALTER TABLE comm_venue_events
    ADD CONSTRAINT comm_venue_events_no_overlap
    EXCLUDE USING gist (
        venue_key WITH =,
        DATERANGE(start_date, end_date, '[]') WITH &&
    ) WHERE (start_date IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_comm_venue_events_window
    ON comm_venue_events (venue_key, end_date) WHERE start_date IS NOT NULL;

COMMENT ON TABLE comm_venue_events IS
    'The fair: one row per event at a canonical venue — its organiser and, since 2026-09-20, the days it was open. A venue holds several fairs a month (REX at MVEC SOUTHKEY mid-August, BIGHOME at the same hall month-end), so rows are unique by date window, not by month. A row with no dates only names the month''s organiser and cannot place a bill.';

-- ─── 2. Which fair a bill belongs to ────────────────────────────────────────

ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS fair_event_id UUID
        REFERENCES comm_venue_events (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fair_source TEXT;

ALTER TABLE sales_orders
    DROP CONSTRAINT IF EXISTS sales_orders_fair_source_known;
ALTER TABLE sales_orders
    ADD CONSTRAINT sales_orders_fair_source_known
        CHECK (fair_source IS NULL OR fair_source IN ('manual', 'venue_match'));

COMMENT ON COLUMN sales_orders.fair_event_id IS
    'The fair this bill was written at. Decides period_month. NULL while the calendar has no fair covering the venue and date, in which case the month falls back to the order date exactly as before 2026-09-20.';
COMMENT ON COLUMN sales_orders.fair_source IS
    'How the fair was decided: venue_match = venue_event_for_order resolved it; manual = a human said so, and the resolver never touches it again.';

CREATE INDEX IF NOT EXISTS idx_sales_orders_fair_event
    ON sales_orders (fair_event_id) WHERE fair_event_id IS NOT NULL;

-- ─── 3. The one resolution rule ─────────────────────────────────────────────

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
       AND e.venue_key = venue_group_key(p_venue)
       AND p_order_date >= e.start_date
       AND p_order_date <= e.end_date + p_grace_days
     ORDER BY (p_order_date <= e.end_date) DESC,  -- open on the day wins outright
              e.end_date DESC                     -- else the fair that closed last
     LIMIT 1;
$fn$;

COMMENT ON FUNCTION venue_event_for_order(TEXT, DATE, INT) IS
    'Which fair a bill belongs to: the fair at that PLACE that was open on the order date, else the most recent one there that closed within p_grace_days before it. 45 days because the August 2026 reconciliation measured a worst keying-in lag of 42. A bill dated before every fair at the place resolves to NULL rather than to the fair that had not opened yet.';

CREATE OR REPLACE FUNCTION venue_event_organiser_for_order(p_venue TEXT, p_order_date DATE)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(
        (SELECT og.name
           FROM comm_venue_events e
           JOIN comm_organisers og ON og.id = e.organiser_id
          WHERE e.id = venue_event_for_order(p_venue, p_order_date)),
        venue_event_organiser(p_venue, p_order_date)
    );
$fn$;

COMMENT ON FUNCTION venue_event_organiser_for_order(TEXT, DATE) IS
    'Who ran the fair this bill was written at — the organiser of the resolved fair, falling back to the month''s answer while the calendar is empty. Two fairs a month at one hall have two organisers, which venue_event_organiser(venue, month) cannot express.';

-- venue_event_organiser predates the calendar and several readers still call
-- it with a month. It must not start returning two rows now that a month can
-- hold several fairs: the undated row (the month's own answer) wins, then the
-- fair that opened first.
CREATE OR REPLACE FUNCTION venue_event_organiser(p_venue TEXT, p_period DATE)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT og.name
      FROM comm_venue_events e
      JOIN comm_organisers og ON og.id = e.organiser_id
     WHERE e.venue_key = venue_group_key(p_venue)
       AND e.period_month = DATE_TRUNC('month', p_period)::DATE
     ORDER BY (e.start_date IS NULL) DESC, e.start_date
     LIMIT 1;
$fn$;

COMMENT ON FUNCTION venue_event_organiser(TEXT, DATE) IS
    'Who ran the fair at a place in a month. Since 2026-09-20 a month can hold several fairs there, so this answers with the month-wide row when there is one and the earliest fair otherwise; venue_event_organiser_for_order is the per-bill answer.';

-- ─── 4. Every write path stamps the fair ────────────────────────────────────

CREATE OR REPLACE FUNCTION sales_orders_resolve_fair()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    -- A human's answer is the answer. They set both columns together.
    IF NEW.fair_source = 'manual' THEN
        RETURN NEW;
    END IF;

    NEW.fair_event_id := venue_event_for_order(NEW.venue, NEW.order_date);
    NEW.fair_source   := CASE WHEN NEW.fair_event_id IS NULL THEN NULL ELSE 'venue_match' END;
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION sales_orders_resolve_fair() IS
    'Stamps the fair on every order however it was written — the ERP live feed, a file import, a replay. A trigger rather than a line in ingest_erp_sales_order for the reason sales_orders_ignored_agent is one: the ERP re-pushes a document on every save and the file import writes the same table.';

DROP TRIGGER IF EXISTS sales_orders_resolve_fair ON sales_orders;
CREATE TRIGGER sales_orders_resolve_fair
    BEFORE INSERT OR UPDATE OF venue, order_date, fair_event_id, fair_source
    ON sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION sales_orders_resolve_fair();

-- The calendar is typed in long after the bills arrived, and the trigger above
-- only fires when an ORDER is written. Without this, adding Kuching 8/28-31
-- today would stamp nothing and `revenue_fair_calendar_moves` would find
-- nothing to move. Editing a fair re-stamps the bills at that place — the
-- stamp only; the MONTH never moves on its own.
CREATE OR REPLACE FUNCTION comm_venue_events_restamp_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_places TEXT[] := '{}';
BEGIN
    IF TG_OP <> 'INSERT' THEN v_places := v_places || OLD.venue_key; END IF;
    IF TG_OP <> 'DELETE' THEN v_places := v_places || NEW.venue_key; END IF;

    UPDATE sales_orders o
       SET fair_event_id = venue_event_for_order(o.venue, o.order_date),
           fair_source   = CASE WHEN venue_event_for_order(o.venue, o.order_date) IS NULL
                                THEN NULL ELSE 'venue_match' END
     WHERE venue_group_key(o.venue) = ANY (v_places)
       AND o.fair_source IS DISTINCT FROM 'manual'
       AND o.fair_event_id IS DISTINCT FROM venue_event_for_order(o.venue, o.order_date);

    RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION comm_venue_events_restamp_orders() IS
    'Re-resolves which fair the bills at a place belong to whenever that place''s calendar changes. Stamps fair_event_id only — moving the month is revenue_apply_fair_calendar''s job, because it moves money and has to refuse a run that has paid.';

DROP TRIGGER IF EXISTS comm_venue_events_restamp_orders ON comm_venue_events;
CREATE TRIGGER comm_venue_events_restamp_orders
    AFTER INSERT OR DELETE OR UPDATE OF venue_key, start_date, end_date
    ON comm_venue_events
    FOR EACH ROW
    EXECUTE FUNCTION comm_venue_events_restamp_orders();

-- ─── 5. What would move, before anything moves ──────────────────────────────

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
    locked        BOOLEAN
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
             OR commission_order_period_locked(p_sub_department_id, e.period_month)
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
    'Every bill the fair calendar disagrees with: where it sits, the fair it was written at, and the month that fair belongs to. Read-only — this is what revenue_apply_fair_calendar would do. A cancelled bill is listed too: it still belongs to its fair, and the month page counts it.';

-- ─── 6. Move them, refusing a month that has paid ───────────────────────────

DROP FUNCTION IF EXISTS revenue_apply_fair_calendar(UUID);

CREATE FUNCTION revenue_apply_fair_calendar(p_sub_department_id UUID)
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
    -- Both sides of every move: a bill leaving August changes August too.
    SELECT ARRAY(
        SELECT DISTINCT m FROM (
            SELECT from_period AS m FROM revenue_fair_calendar_moves(p_sub_department_id)
            UNION
            SELECT to_period        FROM revenue_fair_calendar_moves(p_sub_department_id)
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

COMMENT ON FUNCTION revenue_apply_fair_calendar(UUID) IS
    'Moves every bill the fair calendar disagrees with into the month of its fair, batch and all, and refreshes the counters on both sides. Refuses (23RUN) if any month it would touch has a run that has paid. Every run over a touched month must be computed again afterwards — the month is the run''s input.';

-- ─── 7. The calendar, and the holes in it ───────────────────────────────────

DROP FUNCTION IF EXISTS revenue_fair_calendar();

CREATE FUNCTION revenue_fair_calendar()
RETURNS TABLE (
    fair_id            UUID,
    venue_key          TEXT,
    display_name       TEXT,
    period_month       DATE,
    start_date         DATE,
    end_date           DATE,
    organiser_id       UUID,
    organiser_name     TEXT,
    erp_organiser_text TEXT,
    source             TEXT,
    notes              TEXT,
    bills              INTEGER,
    sales_value        NUMERIC,
    bills_to_move      INTEGER,
    value_to_move      NUMERIC
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
           COALESCE(o.moving_value, 0)
      FROM comm_venue_events e
      LEFT JOIN comm_venues v      ON v.venue_key = e.venue_key
      LEFT JOIN comm_organisers og ON og.id = e.organiser_id
      LEFT JOIN LATERAL (
          SELECT COUNT(*)                                                      AS bills,
                 SUM(so.order_total)                                           AS value,
                 COUNT(*) FILTER (WHERE so.period_month <> e.period_month)     AS moving,
                 SUM(so.order_total) FILTER (WHERE so.period_month <> e.period_month)
                                                                               AS moving_value
            FROM sales_orders so
           WHERE so.fair_event_id = e.id
      ) o ON TRUE
     ORDER BY COALESCE(e.start_date, e.period_month) DESC,
              COALESCE(v.display_name, e.venue_key);
$fn$;

COMMENT ON FUNCTION revenue_fair_calendar() IS
    'Every fair on record: its place, its days, its organiser, what was sold at it, and how many of those bills are still sitting in a different month than the fair. Department-level like the venue register — a hall is a hall whoever sells in it.';

DROP FUNCTION IF EXISTS revenue_fair_calendar_gaps();

CREATE FUNCTION revenue_fair_calendar_gaps()
RETURNS TABLE (
    venue_key    TEXT,
    display_name TEXT,
    period_month DATE,
    bills        INTEGER,
    sales_value  NUMERIC,
    first_order  DATE,
    last_order   DATE,
    spread_days  INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT venue_group_key(o.venue),
           COALESCE(v.display_name, venue_group_key(o.venue)),
           DATE_TRUNC('month', o.order_date)::DATE,
           COUNT(*)::INTEGER,
           SUM(o.order_total),
           MIN(o.order_date),
           MAX(o.order_date),
           (MAX(o.order_date) - MIN(o.order_date))::INTEGER
      FROM sales_orders o
      LEFT JOIN comm_venues v ON v.venue_key = venue_group_key(o.venue)
     WHERE o.fair_event_id IS NULL
       AND o.venue IS NOT NULL
     GROUP BY 1, 2, 3
     ORDER BY 3 DESC, 5 DESC;
$fn$;

COMMENT ON FUNCTION revenue_fair_calendar_gaps() IS
    'Bills that belong to no fair, grouped by place and the month their order date puts them in — the work list for typing the calendar, biggest first. The spread is the tell: a place whose bills run over three weeks held more than one fair that month.';

NOTIFY pgrst, 'reload schema';
