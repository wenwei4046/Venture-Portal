-- 20260917020000_venue_feed_window_pay_preview.sql
--
-- Three things the Fair commission month was missing, all read from what the
-- ERP already sends or from what payroll already knows.
--
-- 1. THE VENUE. Every delivery's header carries `venue` — "SUNWAY PYRAMID
--    CONVENTION CENTRE", "SPICE ARENA", "MIDVALLEY SOUTHKEY JB" — the place the
--    fair was held, which is not the same fact as `sales_location` (the
--    warehouse the order ships from, which is what the portal stored as
--    `location`). It was arriving and being dropped into `raw` where nothing
--    could read it. It becomes a column, backfilled from the raw headers the
--    portal already holds, and a small registry says who ORGANISED each venue's
--    event — the one fact the ERP does NOT send and cannot be derived.
--
-- 2. THE FEED WINDOW. The ERP back-filled its whole history (2023-08 onwards,
--    2,960 orders across 35 months) when the feed was switched on, and kept
--    pushing edits to those old documents afterwards. Commission starts at
--    August 2026, so everything before it is noise that re-creates itself every
--    time somebody opens an old order in the ERP. `erp_feed_settings.
--    min_order_date` is the portal's own floor: a delivery dated before it is
--    answered 200 `skipped` and never becomes a month. The ERP's `vp.since`
--    does the same on its side; this one does not depend on the ERP being
--    configured correctly.
--
-- 3. THE PAY PREVIEW. `compute_hr_monthly_payroll` turns commission into a
--    payslip, but only once HR has created the month's payroll and the run has
--    been applied. `revenue_pay_preview` answers the same question BEFORE any
--    of that: for every salesperson in a month's run, what the statutory
--    schedules say about them and what payroll already holds, so the portal can
--    show the salary the commission implies and HR can check it against the
--    rules that produced it. It computes nothing the trigger computes — it
--    returns the same INPUTS (pro-rata window, statutory lookups, the payroll
--    row if there is one) and the arithmetic is done, and tested, in
--    src/lib/revenue-pay.ts.
--
-- Additive. Reversal: DROP FUNCTION revenue_pay_preview, DROP TABLE
-- comm_venues, DROP TABLE erp_feed_settings, ALTER TABLE sales_orders DROP
-- COLUMN venue, and re-apply the previous ingest_erp_sales_order body.

-- ─── 1. The venue ───────────────────────────────────────────────────────────

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS venue TEXT;

COMMENT ON COLUMN sales_orders.venue IS
    'Where the fair was held, from the ERP header''s `venue`. Free text in the ERP (its `venue_id` is never populated). Not `location`, which is the ERP''s sales_location — the warehouse.';

/** The matching key for a free-text venue: upper case, single spaces. */
CREATE OR REPLACE FUNCTION venue_key(p_venue TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_venue, '')), '\s+', ' ', 'g')), '');
$$;

-- Everything already received: the venue has been sitting in raw all along.
UPDATE sales_orders
   SET venue = NULLIF(BTRIM(raw -> 'header' ->> 'venue'), '')
 WHERE venue IS NULL
   AND NULLIF(BTRIM(raw -> 'header' ->> 'venue'), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_period_venue
    ON sales_orders (period_month, venue);

-- Who organised the event at a venue. The ERP has no such field, so this is
-- the portal's own register: one row per venue spelling the ERP sends, filled
-- in by HR from the month page. Global rather than per-month — a venue's
-- organiser is a fact about the venue, not about August.
CREATE TABLE IF NOT EXISTS comm_venues (
    venue_key    TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    organizer    TEXT,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE comm_venues IS
    'Venue register: the organiser behind each venue the ERP names. The ERP sends the venue and nothing about who ran the event, so this is maintained on the portal.';

ALTER TABLE comm_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY comm_venues_principal_all ON comm_venues FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
CREATE POLICY comm_venues_hr_all ON comm_venues FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- Seed one row per venue already received, so the register opens full rather
-- than empty. display_name is the spelling the ERP used most recently.
INSERT INTO comm_venues (venue_key, display_name)
SELECT DISTINCT ON (venue_key(o.venue)) venue_key(o.venue), BTRIM(o.venue)
  FROM sales_orders o
 WHERE venue_key(o.venue) IS NOT NULL
 ORDER BY venue_key(o.venue), o.order_date DESC
ON CONFLICT (venue_key) DO NOTHING;

-- ─── 2. The feed window ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp_feed_settings (
    sub_department_id UUID PRIMARY KEY REFERENCES comm_sub_departments(id) ON DELETE CASCADE,
    min_order_date    DATE,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_name   TEXT
);

COMMENT ON TABLE erp_feed_settings IS
    'What the portal accepts from the ERP feed, per programme. Separate from erp_links because unlinking the key must not drop the window.';
COMMENT ON COLUMN erp_feed_settings.min_order_date IS
    'Orders dated before this are answered 200 skipped and never stored. NULL accepts everything. Mirrors the ERP''s own vp.since without depending on it.';

ALTER TABLE erp_feed_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_feed_settings_principal_all ON erp_feed_settings FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
CREATE POLICY erp_feed_settings_hr_all ON erp_feed_settings FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- Fair starts at the first commission month. Set here rather than left NULL
-- because the history is being deleted in the same breath, and an empty window
-- would let the ERP's next edit of a 2023 order put it straight back.
INSERT INTO erp_feed_settings (sub_department_id, min_order_date)
SELECT s.id, DATE '2026-08-01'
  FROM comm_sub_departments s
  JOIN departments d ON d.id = s.department_id
 WHERE d.payroll_source = 'commission'
   AND (UPPER(s.code) = 'FAIR' OR LOWER(s.name) = 'fair')
ON CONFLICT (sub_department_id) DO NOTHING;

-- ─── 3. The receiver honours both ───────────────────────────────────────────
--
-- Unchanged from 20260911020000 except for two things: the window is checked
-- once the period is known and the month's locks have had their say, and the
-- venue is written beside the location. An order EDITED backwards out of the
-- window is removed rather than left behind, so "the portal holds the months
-- at or after the floor" stays true however the ERP moves a date.

CREATE OR REPLACE FUNCTION ingest_erp_sales_order(p_order JSONB, p_replay_of UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_sub_id        UUID := erp_sync_sub_department();
    v_doc_no        TEXT := NULLIF(BTRIM(p_order->>'docNo'), '');
    v_snapshot      TIMESTAMPTZ := NULLIF(p_order->>'snapshotAt', '')::TIMESTAMPTZ;
    v_deleted       BOOLEAN := COALESCE((p_order->>'deleted')::BOOLEAN, FALSE);
    v_status        TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED'));
    v_on_hold       BOOLEAN := COALESCE((p_order->>'onHold')::BOOLEAN, FALSE);
    v_order_date    DATE := NULLIF(p_order->>'orderDate', '')::DATE;
    v_period        DATE;
    v_floor         DATE;
    v_existing      sales_orders%ROWTYPE;
    v_found         BOOLEAN := FALSE;
    v_batch_id      UUID;
    v_batch_source  TEXT;
    v_agent_name    TEXT;
    v_agent_key     TEXT;
    v_sp_id         TEXT := NULLIF(BTRIM(p_order->>'salespersonId'), '');
    v_staff_id      UUID;
    v_brand         TEXT;
    v_line_brand    TEXT;
    v_venue         TEXT := NULLIF(BTRIM(p_order->>'venue'), '');
    v_total         NUMERIC(15, 2) := COALESCE((p_order->>'total')::NUMERIC, 0);
    v_balance       NUMERIC(15, 2) := NULLIF(p_order->>'balance', '')::NUMERIC;
    v_excluded      BOOLEAN;
    v_event_date    DATE;
    v_order_id      UUID;
    v_warnings      TEXT[] := '{}';
    v_lines         JSONB := COALESCE(p_order->'lines', '[]'::JSONB);
    v_line          JSONB;
    v_line_no       INTEGER := 0;
    v_no_cost       INTEGER := 0;
    v_no_brand      INTEGER := 0;
    v_by_brand      JSONB := '{}'::JSONB;
    v_item_code     TEXT;
    v_qty           NUMERIC;
    v_amount        NUMERIC;
    v_cost          NUMERIC;
    v_unit_cost     NUMERIC;
    v_old_agent_key TEXT;
    v_old_event     DATE;
    v_old_staff     UUID;
    v_old_batch     UUID;
    v_result        JSONB;
BEGIN
    IF v_doc_no IS NULL THEN
        RAISE EXCEPTION 'docNo is required';
    END IF;

    -- Two deliveries of the same document never interleave.
    PERFORM pg_advisory_xact_lock(hashtext('erp_sync:' || v_doc_no));

    SELECT * INTO v_existing FROM sales_orders WHERE order_no = v_doc_no AND source = 'erp_sync';
    v_found := FOUND;
    -- The source endpoint owns Fair regardless of fields in the delivery.
    IF v_found AND NOT EXISTS (SELECT 1 FROM sales_import_batches
            WHERE id = v_existing.batch_id AND sub_department_id = v_sub_id) THEN
        RAISE EXCEPTION 'Existing ERP document belongs to another sub-department';
    END IF;
    PERFORM lock_commission_order_periods(v_sub_id, ARRAY[
        CASE WHEN v_found THEN v_existing.period_month END, date_trunc('month', v_order_date)::DATE]);

    -- ── Ordering guard ─────────────────────────────────────────────────────
    IF v_found AND v_snapshot IS NOT NULL AND v_existing.erp_snapshot_at IS NOT NULL THEN
        IF v_snapshot = v_existing.erp_snapshot_at THEN
            RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'duplicate',
                                'same snapshot already applied', '{}', v_snapshot, NULL, p_replay_of);
        ELSIF v_snapshot < v_existing.erp_snapshot_at THEN
            RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'stale',
                                'a newer snapshot is already applied', '{}', v_snapshot, NULL, p_replay_of);
        END IF;
    END IF;

    -- ── Deleted in the ERP ─────────────────────────────────────────────────
    IF v_deleted THEN
        IF NOT v_found THEN
            RETURN erp_sync_log(v_doc_no, NULL, 'skipped', 'deleted before the portal ever saw it',
                                '{}', v_snapshot, NULL, p_replay_of);
        END IF;
        IF erp_sync_period_locked(v_existing.period_month) THEN
            RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                                'deleted in the ERP after the month''s run was applied — reopen the run and replay',
                                '{}', v_snapshot, p_order, p_replay_of);
        END IF;
        UPDATE sales_orders
           SET cancelled = TRUE, erp_status = 'DELETED', erp_snapshot_at = v_snapshot,
               synced_at = NOW(), sequence_in_day = NULL
         WHERE id = v_existing.id;
        DELETE FROM sales_order_open_bill_tags WHERE order_id = v_existing.id AND auto_suggested;
        PERFORM erp_sync_resequence_day(v_existing.agent_key, v_existing.event_date);
        PERFORM erp_sync_suggest_open_bills(v_existing.staff_id, v_existing.event_date);
        PERFORM erp_sync_refresh_batch(v_existing.batch_id);
        RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'applied', 'excluded: deleted in the ERP',
                            '{}', v_snapshot, NULL, p_replay_of);
    END IF;

    IF v_order_date IS NULL THEN
        RAISE EXCEPTION 'orderDate is required for %', v_doc_no;
    END IF;
    v_period := DATE_TRUNC('month', v_order_date)::DATE;
    -- Both the old and new source months were locked in calendar order above.

    -- The ERP's own commission rule: CANCELLED, DRAFT and a hold earn nothing.
    -- CLOSED (the customer took 7 of 10) still earns. Unknown statuses earn.
    v_excluded := v_status IN ('CANCELLED', 'DRAFT', 'ON_HOLD') OR v_on_hold;

    -- A draft the portal has never seen is not a sale yet.
    IF NOT v_found AND v_status = 'DRAFT' THEN
        RETURN erp_sync_log(v_doc_no, v_period, 'skipped', 'draft — not a sale yet',
                            '{}', v_snapshot, NULL, p_replay_of);
    END IF;

    -- ── Locks ──────────────────────────────────────────────────────────────
    IF erp_sync_period_locked(v_period)
       OR (v_found AND v_existing.period_month <> v_period AND erp_sync_period_locked(v_existing.period_month)) THEN
        RETURN erp_sync_log(v_doc_no, v_period, 'held',
                            'the month''s commission run is applied or locked — reopen it and replay',
                            '{}', v_snapshot, p_order, p_replay_of);
    END IF;

    -- ── The feed window ────────────────────────────────────────────────────
    -- The portal's own floor, checked after the locks so a held month is still
    -- reported as held. A delivery from before it is a successful delivery the
    -- portal declined to keep: 200 skipped, nothing written, no month created.
    SELECT min_order_date INTO v_floor FROM erp_feed_settings WHERE sub_department_id = v_sub_id;
    IF v_floor IS NOT NULL AND v_order_date < v_floor THEN
        IF v_found THEN
            -- Its date moved backwards out of the window; the portal does not
            -- keep that month, so it does not keep the order either.
            v_old_batch := v_existing.batch_id;
            DELETE FROM sales_orders WHERE id = v_existing.id;
            PERFORM erp_sync_resequence_day(v_existing.agent_key, v_existing.event_date);
            PERFORM erp_sync_suggest_open_bills(v_existing.staff_id, v_existing.event_date);
            PERFORM erp_sync_refresh_batch(v_old_batch);
            RETURN erp_sync_log(v_doc_no, v_period, 'applied',
                                'removed: re-dated before the feed window (' || v_floor || ')',
                                '{}', v_snapshot, NULL, p_replay_of);
        END IF;
        RETURN erp_sync_log(v_doc_no, v_period, 'skipped',
                            'dated before the feed window (' || v_floor || ')',
                            '{}', v_snapshot, NULL, p_replay_of);
    END IF;

    -- ── The period's batch ─────────────────────────────────────────────────
    SELECT id, source INTO v_batch_id, v_batch_source
      FROM sales_import_batches
     WHERE sub_department_id = v_sub_id AND period_month = v_period AND status = 'committed';
    IF v_batch_id IS NULL THEN
        INSERT INTO sales_import_batches (sub_department_id, period_month, file_name, source, status, notes)
        VALUES (v_sub_id, v_period, 'ERP live sync', 'erp_sync', 'committed',
                'Fed live from the Houzs Century ERP. Orders are upserted as they change.')
        ON CONFLICT (sub_department_id, period_month) WHERE status = 'committed' DO NOTHING
        RETURNING id INTO v_batch_id;
        IF v_batch_id IS NULL THEN
            SELECT id, source INTO v_batch_id, v_batch_source
              FROM sales_import_batches
             WHERE sub_department_id = v_sub_id AND period_month = v_period AND status = 'committed';
        ELSE
            v_batch_source := 'erp_sync';
        END IF;
    END IF;
    IF v_batch_source <> 'erp_sync' THEN
        RETURN erp_sync_log(v_doc_no, v_period, 'held',
                            'the month was imported from a file — retire that import to let the live feed own it',
                            '{}', v_snapshot, p_order, p_replay_of);
    END IF;

    -- ── Who sold it ────────────────────────────────────────────────────────
    v_agent_name := COALESCE(NULLIF(BTRIM(p_order->>'salespersonName'), ''), '(no salesperson)');
    v_agent_key  := UPPER(REGEXP_REPLACE(BTRIM(v_agent_name), '\s+', ' ', 'g'));

    IF v_sp_id IS NOT NULL THEN
        SELECT staff_id INTO v_staff_id FROM comm_agent_aliases WHERE erp_salesperson_id = v_sp_id;
    END IF;
    IF v_staff_id IS NULL THEN
        SELECT staff_id INTO v_staff_id FROM comm_agent_aliases WHERE agent_key = v_agent_key;
    END IF;
    IF v_staff_id IS NULL AND v_found THEN
        v_staff_id := v_existing.staff_id;
    END IF;
    IF v_staff_id IS NULL AND NOT v_excluded THEN
        v_warnings := ARRAY_APPEND(v_warnings, 'unmatched_salesperson');
    END IF;

    -- ── Brand: the ERP's Branding first, then the lines, then the prefixes ──
    v_brand := erp_sync_brand_code(p_order->>'brand');
    IF v_brand IS NULL THEN
        FOR v_line IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_lines) LOOP
            v_line_brand := COALESCE(erp_sync_brand_code(v_line->>'brand'),
                                     erp_sync_brand_by_prefix(v_line->>'itemCode'));
            IF v_line_brand IS NOT NULL THEN
                v_amount := COALESCE((v_line->>'amount')::NUMERIC, 0);
                v_by_brand := JSONB_SET(v_by_brand, ARRAY[v_line_brand],
                                        TO_JSONB(COALESCE((v_by_brand->>v_line_brand)::NUMERIC, 0) + v_amount));
            END IF;
        END LOOP;
        SELECT key INTO v_brand
          FROM JSONB_EACH_TEXT(v_by_brand)
         ORDER BY value::NUMERIC DESC, key
         LIMIT 1;
    END IF;

    -- ── Header ─────────────────────────────────────────────────────────────
    IF v_found THEN
        v_old_agent_key := v_existing.agent_key;
        v_old_event     := v_existing.event_date;
        v_old_staff     := v_existing.staff_id;
        v_old_batch     := v_existing.batch_id;
        -- An event day a human moved off the order date stays where they put it.
        v_event_date := CASE WHEN v_existing.event_date = v_existing.order_date
                             THEN v_order_date ELSE v_existing.event_date END;
        UPDATE sales_orders
           SET batch_id = v_batch_id,
               period_month = v_period,
               order_date = v_order_date,
               event_date = v_event_date,
               debtor_code = NULLIF(p_order->>'debtorCode', ''),
               customer_name = NULLIF(p_order->>'customerName', ''),
               agent_name = v_agent_name,
               agent_key = v_agent_key,
               staff_id = v_staff_id,
               location = NULLIF(p_order->>'location', ''),
               venue = v_venue,
               brand_code = v_brand,
               order_total = v_total,
               balance = v_balance,
               cancelled = v_excluded,
               erp_status = v_status,
               erp_on_hold = v_on_hold,
               erp_salesperson_id = v_sp_id,
               erp_company_id = NULLIF(p_order->>'companyId', '')::BIGINT,
               erp_snapshot_at = v_snapshot,
               erp_created_at = NULLIF(p_order->>'createdAt', '')::TIMESTAMPTZ,
               synced_at = NOW(),
               raw = p_order->'raw'
         WHERE id = v_existing.id
         RETURNING id INTO v_order_id;
    ELSE
        v_event_date := v_order_date;
        INSERT INTO sales_orders (
            batch_id, period_month, order_no, order_date, event_date, debtor_code, customer_name,
            agent_name, agent_key, staff_id, location, venue, brand_code, order_total, balance,
            cancelled, source, erp_status, erp_on_hold, erp_salesperson_id, erp_company_id,
            erp_snapshot_at, erp_created_at, synced_at, raw)
        VALUES (
            v_batch_id, v_period, v_doc_no, v_order_date, v_event_date,
            NULLIF(p_order->>'debtorCode', ''), NULLIF(p_order->>'customerName', ''),
            v_agent_name, v_agent_key, v_staff_id, NULLIF(p_order->>'location', ''), v_venue, v_brand,
            v_total, v_balance, v_excluded,
            'erp_sync', v_status, v_on_hold, v_sp_id, NULLIF(p_order->>'companyId', '')::BIGINT,
            v_snapshot, NULLIF(p_order->>'createdAt', '')::TIMESTAMPTZ, NOW(), p_order->'raw')
        RETURNING id INTO v_order_id;
    END IF;

    -- The register learns every spelling the ERP uses, so the month page can
    -- ask for an organiser without a human typing the venue's name first.
    IF venue_key(v_venue) IS NOT NULL THEN
        INSERT INTO comm_venues (venue_key, display_name)
        VALUES (venue_key(v_venue), v_venue)
        ON CONFLICT (venue_key) DO NOTHING;
    END IF;

    -- ── Lines: the delivery is a full snapshot, so the set is replaced ──────
    DELETE FROM sales_order_lines WHERE order_id = v_order_id;
    FOR v_line IN SELECT * FROM JSONB_ARRAY_ELEMENTS(v_lines) LOOP
        v_line_no   := v_line_no + 1;
        v_item_code := COALESCE(NULLIF(BTRIM(v_line->>'itemCode'), ''), '(none)');
        v_qty       := COALESCE((v_line->>'qty')::NUMERIC, 0);
        v_amount    := COALESCE((v_line->>'amount')::NUMERIC, 0);
        v_line_brand := COALESCE(erp_sync_brand_code(v_line->>'brand'), v_brand,
                                 erp_sync_brand_by_prefix(v_item_code));

        -- Cost: the ERP's line cost when it carries one; the Product List when
        -- it does not; NULL (and a warning) when neither knows.
        v_cost := NULLIF(v_line->>'cost', '')::NUMERIC;
        IF v_cost IS NULL OR (v_cost = 0 AND v_amount <> 0) THEN
            v_unit_cost := NULL;
            SELECT unit_cost INTO v_unit_cost
              FROM comm_products
             WHERE UPPER(BTRIM(item_code)) = UPPER(BTRIM(v_item_code)) AND is_active
             LIMIT 1;
            v_cost := CASE WHEN v_unit_cost IS NULL THEN NULL ELSE ROUND(v_unit_cost * v_qty, 2) END;
        END IF;
        IF v_cost IS NULL THEN v_no_cost := v_no_cost + 1; END IF;
        IF v_line_brand IS NULL THEN v_no_brand := v_no_brand + 1; END IF;

        INSERT INTO sales_order_lines (
            order_id, line_no, item_group, product_code, product_name, description2, uom, location,
            qty, unit_price, line_amount, brand_code, cost_amount, raw)
        VALUES (
            v_order_id,
            COALESCE(NULLIF(v_line->>'lineNo', '')::INTEGER, v_line_no),
            COALESCE(NULLIF(BTRIM(v_line->>'itemGroup'), ''), 'UNGROUPED'),
            v_item_code,
            NULLIF(v_line->>'description', ''),
            NULLIF(v_line->>'description2', ''),
            NULLIF(v_line->>'uom', ''),
            NULLIF(v_line->>'location', ''),
            v_qty,
            COALESCE((v_line->>'unitPrice')::NUMERIC, 0),
            v_amount,
            v_line_brand,
            v_cost,
            v_line);
    END LOOP;

    IF NOT v_excluded THEN
        IF v_brand IS NULL THEN v_warnings := ARRAY_APPEND(v_warnings, 'no_brand'); END IF;
        IF v_no_cost > 0 THEN v_warnings := ARRAY_APPEND(v_warnings, 'lines_without_cost:' || v_no_cost); END IF;
        IF v_no_brand > 0 THEN v_warnings := ARRAY_APPEND(v_warnings, 'lines_without_brand:' || v_no_brand); END IF;
    END IF;

    -- ── The day's running order and the Open Bill suggestions ──────────────
    IF v_excluded THEN
        DELETE FROM sales_order_open_bill_tags WHERE order_id = v_order_id AND auto_suggested;
    END IF;
    PERFORM erp_sync_resequence_day(v_agent_key, v_event_date);
    PERFORM erp_sync_suggest_open_bills(v_staff_id, v_event_date);
    IF v_found AND (v_old_agent_key <> v_agent_key OR v_old_event <> v_event_date) THEN
        PERFORM erp_sync_resequence_day(v_old_agent_key, v_old_event);
    END IF;
    IF v_found AND v_old_staff IS NOT NULL
       AND (v_old_staff IS DISTINCT FROM v_staff_id OR v_old_event <> v_event_date) THEN
        PERFORM erp_sync_suggest_open_bills(v_old_staff, v_old_event);
    END IF;

    PERFORM erp_sync_refresh_batch(v_batch_id);
    IF v_old_batch IS NOT NULL AND v_old_batch <> v_batch_id THEN
        PERFORM erp_sync_refresh_batch(v_old_batch);
    END IF;

    v_result := erp_sync_log(v_doc_no, v_period, 'applied',
                             CASE WHEN v_excluded THEN 'excluded: ' || CASE WHEN v_on_hold THEN 'on hold' ELSE LOWER(v_status) END
                                  WHEN v_found THEN 'updated' ELSE 'created' END,
                             v_warnings, v_snapshot, NULL, p_replay_of);
    RETURN v_result || JSONB_BUILD_OBJECT('orderId', v_order_id);
END;
$$;

-- ─── 4. What the month's commission pays ────────────────────────────────────
--
-- One row per salesperson in a month's run: who they are, the pro-rata window,
-- what the statutory schedules say at their statutory wage, what other
-- programmes have already applied for the same month, and the payroll row if
-- one exists. The arithmetic that turns this into a payslip is
-- src/lib/revenue-pay.ts, which mirrors compute_hr_monthly_payroll line for
-- line — this function deliberately computes no total of its own, so there is
-- one place where gross and net are decided.
--
-- SECURITY DEFINER because the statutory schedules and the lookups belong to
-- the trigger's world, with the individual-salary wall re-asserted at the top:
-- HR and Principal only, never Finance (CLAUDE.md, Data Visibility).

CREATE OR REPLACE FUNCTION revenue_pay_preview(p_sub_department_id UUID, p_period DATE)
RETURNS TABLE (
    staff_id                UUID,
    employee_name           TEXT,
    employee_code           TEXT,
    designation             TEXT,
    employment_type         TEXT,
    basic_salary            NUMERIC,
    statutory_allowance     NUMERIC,
    non_statutory_allowance NUMERIC,
    ot_amount               NUMERIC,
    deduction_amount        NUMERIC,
    skbbk_amount            NUMERIC,
    unpaid_leave_days       NUMERIC,
    days_worked             INTEGER,
    days_in_month           INTEGER,
    epf_category            TEXT,
    socso_category          TEXT,
    pcb_category            TEXT,
    children_count          INTEGER,
    is_epf_exempt           BOOLEAN,
    tax_mode                TEXT,
    withholding_rate        NUMERIC,
    statutory_wages         NUMERIC,
    epf_er                  NUMERIC,
    epf_ee                  NUMERIC,
    socso_er                NUMERIC,
    socso_ee                NUMERIC,
    eis_er                  NUMERIC,
    eis_ee                  NUMERIC,
    pcb                     NUMERIC,
    commission_here         NUMERIC,
    commission_elsewhere    NUMERIC,
    payroll_exists          BOOLEAN,
    payroll_status          TEXT,
    payroll_source          TEXT,
    payroll_commission      NUMERIC,
    payroll_adjustment      NUMERIC,
    payroll_gross           NUMERIC,
    payroll_net             NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_end   DATE := (p_period + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_dim   INTEGER := EXTRACT(DAY FROM (p_period + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
BEGIN
    -- The individual-salary wall, re-asserted because SECURITY DEFINER stepped
    -- around RLS to reach the statutory schedules: HR and Principal, never
    -- Finance (CLAUDE.md, Data Visibility).
    IF NOT (has_scope(ARRAY['admin']) OR has_scope(ARRAY['hr'])) THEN
        RAISE EXCEPTION 'Individual pay is visible to HR and the Principal only';
    END IF;

    -- `sid` rather than `staff_id` throughout: an OUT parameter's name is in
    -- scope for the whole body, and a CTE column of the same name makes every
    -- reference ambiguous.
    RETURN QUERY
    WITH run AS (
        SELECT r.id FROM comm_runs r
         WHERE r.sub_department_id = p_sub_department_id AND r.period_month = p_period
    ), mine AS (
        SELECT s.staff_id AS sid, SUM(s.total_commission) AS amount
          FROM comm_statements s JOIN run ON run.id = s.run_id
         GROUP BY s.staff_id
    ), theirs AS (
        SELECT s.staff_id AS sid, SUM(s.total_commission) AS amount
          FROM comm_statements s
          JOIN comm_runs r ON r.id = s.run_id
         WHERE r.period_month = p_period
           AND r.sub_department_id <> p_sub_department_id
           AND r.status IN ('applied', 'locked')
         GROUP BY s.staff_id
    ), people AS (
        SELECT m.sid, m.amount AS here, COALESCE(t.amount, 0) AS elsewhere
          FROM mine m LEFT JOIN theirs t ON t.sid = m.sid
    ), base AS (
        SELECT p.here, p.elsewhere, st.*,
               pr.id AS payroll_id, pr.status AS pr_status, pr.source AS pr_source,
               COALESCE(pr.unpaid_leave_days, 0) AS leave_days,
               COALESCE(pr.ot_amount, 0) AS pr_ot,
               COALESCE(pr.deduction_amount, 0) AS pr_deduction,
               COALESCE(pr.skbbk_amount, 0) AS pr_skbbk,
               pr.commission_amount AS pr_commission,
               COALESCE(pr.commission_adjustment_amount, 0) AS pr_adjustment,
               pr.gross AS pr_gross, pr.net AS pr_net
          FROM people p
          JOIN hr_staff_costs st ON st.id = p.sid
          LEFT JOIN hr_monthly_payroll pr
                 ON pr.staff_id = p.sid AND pr.period_month = p_period
    ), windowed AS (
        SELECT b.*,
               GREATEST(
                   CASE WHEN GREATEST(COALESCE(b.hire_date, p_period), p_period) > LEAST(COALESCE(b.resignation_date, v_end), v_end)
                        THEN 0
                        ELSE LEAST(COALESCE(b.resignation_date, v_end), v_end)
                             - GREATEST(COALESCE(b.hire_date, p_period), p_period) + 1
                   END - b.leave_days, 0)::INTEGER AS worked
          FROM base b
    ), waged AS (
        SELECT w.*,
               GREATEST(w.basic_salary * w.worked::NUMERIC / NULLIF(v_dim, 0)
                      + w.allowances * w.worked::NUMERIC / NULLIF(v_dim, 0)
                      - w.pr_deduction, 0) AS stat_wage
          FROM windowed w
    )
    SELECT
        w.id, w.employee_name, w.employee_code, w.designation, w.employment_type::TEXT,
        w.basic_salary, w.allowances, w.non_statutory_allowance,
        w.pr_ot, w.pr_deduction, w.pr_skbbk, w.leave_days,
        w.worked, v_dim,
        w.epf_category::TEXT, w.socso_category::TEXT, w.pcb_category::TEXT,
        w.children_count, w.is_epf_exempt, w.tax_mode::TEXT, w.withholding_rate,
        ROUND(w.stat_wage, 2),
        COALESCE(e.employer, 0), COALESCE(e.employee, 0),
        COALESCE(s.employer, 0), COALESCE(s.employee, 0),
        COALESCE(i.employer, 0), COALESCE(i.employee, 0),
        -- PCB is looked up on the BASIC after employee EPF, exactly as the
        -- trigger does it: commission never raises a salesperson's PCB.
        CASE WHEN w.tax_mode::TEXT = 'pcb'
             THEN COALESCE(lookup_pcb(
                      GREATEST(ROUND(w.basic_salary * w.worked::NUMERIC / NULLIF(v_dim, 0), 2)
                               - COALESCE(e.employee, 0), 0),
                      w.pcb_category, w.children_count, p_period), 0)
             ELSE 0 END,
        w.here, w.elsewhere,
        w.payroll_id IS NOT NULL, w.pr_status::TEXT, w.pr_source::TEXT,
        w.pr_commission, w.pr_adjustment, w.pr_gross, w.pr_net
      FROM waged w
      LEFT JOIN LATERAL (
          SELECT * FROM lookup_epf(w.stat_wage, w.epf_category, p_period)
           WHERE w.stat_wage > 0 AND NOT w.is_epf_exempt
      ) e ON TRUE
      LEFT JOIN LATERAL (
          SELECT * FROM lookup_socso(w.stat_wage, w.socso_category, p_period) WHERE w.stat_wage > 0
      ) s ON TRUE
      LEFT JOIN LATERAL (
          SELECT * FROM lookup_eis(w.stat_wage, p_period) WHERE w.stat_wage > 0
      ) i ON TRUE
     ORDER BY w.here DESC, w.employee_name;
END;
$fn$;

REVOKE ALL ON FUNCTION revenue_pay_preview(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION revenue_pay_preview(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION revenue_pay_preview(UUID, DATE) IS
    'Salary inputs for every salesperson in a month''s commission run: pro-rata window, statutory schedule lookups, other programmes already applied, and the payroll row if there is one. The payslip arithmetic lives in src/lib/revenue-pay.ts.';
