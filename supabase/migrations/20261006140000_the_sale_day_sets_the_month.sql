-- 20261006140000_the_sale_day_sets_the_month.sql
--
-- THE SALE DAY SETS THE MONTH (user 2026-10-06).
--
-- "By record it follows the date. Some fairs cross months — 30 Aug to 1 Sep:
-- 30 and 31 Aug are August's, 1 Sep is September's sales, though it is the same
-- fair." Since 2026-09-24 the ERP tells which day of its fair a bill was sold
-- on (fair.fairDate, the salesperson's pick; contract §3.4).
--
-- 1. ingest_erp_sales_order: a NEW document lands in its sale day's month — the
--    day, when it is one of its fair's days — instead of its order date's (the
--    back office keys a fair's bills up to 3 days late, so a month-end sale
--    landed in the next month). A re-sent document keeps its month as before;
--    a move is still a person's click on the calendar.
-- 2. sales_order_sale_month(): the month a bill at a fair belongs to — its sale
--    day's, else its fair's. The calendar's moves and its tally read it, so a
--    fair across two months splits by day instead of moving every bill to the
--    month it opened in.
-- Weekly rankings are unchanged: a fair's week is the week it opens in.
--
-- Today this moves nothing: of 255 bills with a sale day, every one is already
-- in its sale day's month (after 2026-10-06's three exclusions), and the
-- calendar's list is the same 9 bills before and after (none has a day).
--
-- Built by a script from the live bodies (ingest md5 074830ed… = 20260927080000,
-- moves cb317a4a… = 20260927010000, calendar 56f56899… = 20260926110000).
-- Rollback: re-apply those three bodies; DROP FUNCTION sales_order_sale_month.


CREATE OR REPLACE FUNCTION public.sales_order_sale_month(p_raw JSONB, p_fair_start DATE, p_fair_end DATE, p_fair_month DATE)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_day DATE;
BEGIN
    -- The month a bill at a fair belongs to: the month of the day of the fair
    -- the ERP says it was sold on, when that is one of the fair's days; else
    -- the fair's own month (a bill with no day cannot be split). raw is the
    -- delivery as the ERP sent it: a day that does not read is no day, never
    -- an error for the whole calendar.
    BEGIN
        v_day := NULLIF(p_raw->'fair'->>'fairDate', '')::DATE;
    EXCEPTION WHEN others THEN
        v_day := NULL;
    END;
    IF v_day IS NOT NULL AND v_day BETWEEN p_fair_start AND COALESCE(p_fair_end, p_fair_start) THEN
        RETURN DATE_TRUNC('month', v_day)::DATE;
    END IF;
    RETURN p_fair_month;
END;
$$;

COMMENT ON FUNCTION public.sales_order_sale_month(JSONB, DATE, DATE, DATE) IS
    'The month a bill at a fair belongs to (20261006140000, user: by record a sale follows its date): the month of its ERP sale day (raw.fair.fairDate) when that is one of the fair''s days, else the fair''s month. What the fair calendar moves bills to — a fair across two months splits by day.';

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
    v_sale_day      DATE;
    v_period        DATE;
    v_fair          UUID;
    v_erp_fair      UUID;
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

    -- (20261006140000) The day of its fair the sale was, when the ERP says so
    -- (fair.fairDate, the salesperson's pick) and it is one of that fair's
    -- days. A new document lands in that day's month (user 2026-10-06: by
    -- record a sale follows its date — 30 and 31 Aug are August, 1 Sep is
    -- September, at the same fair). A pick the portal cannot read is no pick.
    BEGIN
        v_sale_day := NULLIF(p_order->'fair'->>'fairDate', '')::DATE;
        IF v_sale_day IS NOT NULL AND NOT COALESCE(v_sale_day BETWEEN
                NULLIF(p_order->'fair'->>'startDate', '')::DATE
            AND COALESCE(NULLIF(p_order->'fair'->>'endDate', '')::DATE,
                         NULLIF(p_order->'fair'->>'startDate', '')::DATE), FALSE) THEN
            v_sale_day := NULL;
        END IF;
    EXCEPTION WHEN others THEN
        v_sale_day := NULL;
    END;

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
        CASE WHEN v_found THEN v_existing.period_month END, date_trunc('month', v_order_date)::DATE,
        date_trunc('month', v_sale_day)::DATE]);

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
            v_result := erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                                'deleted in the ERP after the month''s run was applied — reopen the run and replay',
                                '{}', v_snapshot, p_order, p_replay_of);
            -- (20260926020000) What the paid bill loses is a drop.
            PERFORM erp_sync_note_adjustment(v_existing.id, p_order, (v_result->>'eventId')::UUID);
            RETURN v_result;
        END IF;
        -- (20260926010000) A month closed to the feed keeps its bills as they are.
        IF erp_sync_period_closed(v_existing.period_month) THEN
            v_result := erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                                'deleted in the ERP while the month is closed to the feed — reopen it and replay',
                                '{}', v_snapshot, p_order, p_replay_of);
            -- (20260926020000) What the settled bill loses is a drop.
            PERFORM erp_sync_note_adjustment(v_existing.id, p_order, (v_result->>'eventId')::UUID);
            RETURN v_result;
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
    -- (20261006140000) The sale day's month when the ERP gives the day.
    v_period := DATE_TRUNC('month', COALESCE(v_sale_day, v_order_date))::DATE;
    -- Both the old and new source months were locked in calendar order above.

    -- (20260927010000) The fair the ERP names. Since 2026-09-13 the ERP makes
    -- the salesperson pick the event a bill was written at, and the delivery
    -- carries it (`fair`: the project's venue, organiser and days). That is a
    -- person's answer, not the calendar's guess, so it IS the bill's fair —
    -- kept in comm_venue_events like every other one (erp_sync_fair) and
    -- pinned to the bill below, over any pin typed before the ERP could say.
    v_erp_fair := erp_sync_fair(p_order->'fair');

    -- ── A bill with a fair keeps its month (20260924050000) ────────────────
    -- The fair sets the month and only the fair calendar moves a bill between
    -- months (revenue_apply_fair_calendar, a human's click). The ERP re-sends
    -- a document on every save, so re-deriving the month from its date here
    -- undid every such move at the document's next save. The fair is decided
    -- exactly as sales_orders_resolve_fair will stamp this row a moment from
    -- now: the one a human pinned, otherwise the one venue_event_for_order
    -- finds for the delivery's venue and date. A bill with a fair stays where
    -- it is; if that fair is in another month the calendar lists the move and
    -- a human makes it. A bill no fair claims follows its order date, as every
    -- bill did before 2026-09-20. A new document lands in its sale day's
    -- month, else its order date's (20261006140000).
    IF v_found THEN
        -- (20260927010000) The ERP's fair first.
        v_fair := COALESCE(v_erp_fair,
                  CASE WHEN v_existing.fair_source = 'manual' THEN v_existing.fair_event_id
                       ELSE venue_event_for_order(v_venue, v_order_date) END);
        IF v_fair IS NOT NULL THEN
            v_period := v_existing.period_month;
        END IF;
    END IF;

    -- (20260926020000) Nor does a re-send carry a bill the portal pays back
    -- into a month settled by hand (comm_cutovers). That month is closed for
    -- good: the delivery would be held forever, and a bill moved into a paying
    -- month to wait for its deposit would never hear of its payments again.
    IF v_found AND v_period <> v_existing.period_month
       AND v_period < comm_first_paid_month(v_sub_id)
       AND v_existing.period_month >= comm_first_paid_month(v_sub_id) THEN
        v_period := v_existing.period_month;
    END IF;

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
        v_result := erp_sync_log(v_doc_no, v_period, 'held',
                            'the month''s commission run is applied or locked — reopen it and replay',
                            '{}', v_snapshot, p_order, p_replay_of);
        -- (20260926020000) A bill a run paid: what changed is a drop or an upsell.
        IF v_found AND erp_sync_period_locked(v_existing.period_month) THEN
            PERFORM erp_sync_note_adjustment(v_existing.id, p_order, (v_result->>'eventId')::UUID);
        END IF;
        RETURN v_result;
    END IF;

    -- ── A month closed to the feed (20260926010000) ────────────────────────
    -- Somebody closed the month the bill lives in: nothing the ERP says about
    -- it now is written, wherever the delivery would move it. The payload is
    -- kept, logged under THAT month, so reopening it replays exactly this.
    IF v_found AND erp_sync_period_closed(v_existing.period_month) THEN
        v_result := erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                            'the month is closed to the ERP feed — reopen it and replay',
                            '{}', v_snapshot, p_order, p_replay_of);
        -- (20260926020000) A settled bill: what changed is a drop or an upsell.
        PERFORM erp_sync_note_adjustment(v_existing.id, p_order, (v_result->>'eventId')::UUID);
        RETURN v_result;
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

    -- (20260926010000) Nor may a delivery bring a bill INTO a closed month —
    -- a new document dated in it, or a bill re-dated into it. Checked after
    -- the feed window, so a document the portal would never keep is still
    -- answered skipped rather than held.
    IF erp_sync_period_closed(v_period) THEN
        RETURN erp_sync_log(v_doc_no, v_period, 'held',
                            'the month is closed to the ERP feed — reopen it and replay',
                            '{}', v_snapshot, p_order, p_replay_of);
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
    -- (20260927080000) Between them: the brand the salesperson picked in the
    -- ERP for a bill whose products name none, the brand somebody picked here
    -- (right-click on Sales orders), then the brand of the fair it was written
    -- at — a bed frame or an accessory is a second bill at a brand's fair and
    -- follows that brand's margin ladder (erp_sync_order_brand).
    v_brand := erp_sync_order_brand(p_order, v_existing.id);
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
               raw = p_order->'raw',
               -- (20260927010000) The ERP's fair is pinned; a bill the ERP no
               -- longer places goes back to the calendar's match.
               fair_event_id = CASE WHEN v_erp_fair IS NOT NULL THEN v_erp_fair ELSE fair_event_id END,
               fair_source = CASE WHEN v_erp_fair IS NOT NULL THEN 'erp'
                                  WHEN fair_source = 'erp' THEN NULL
                                  ELSE fair_source END
         WHERE id = v_existing.id
         RETURNING id INTO v_order_id;
        -- (20260926020000) Written, not held: a drop or upsell waiting on this
        -- document described a settled month that is open again.
        DELETE FROM comm_upsales
         WHERE sub_department_id = v_sub_id AND erp_doc_no = v_doc_no AND status = 'pending';
    ELSE
        v_event_date := v_order_date;
        INSERT INTO sales_orders (
            batch_id, period_month, order_no, order_date, event_date, debtor_code, customer_name,
            agent_name, agent_key, staff_id, location, venue, brand_code, order_total, balance,
            cancelled, source, erp_status, erp_on_hold, erp_salesperson_id, erp_company_id,
            erp_snapshot_at, erp_created_at, synced_at, raw,
            fair_event_id, fair_source)
        VALUES (
            v_batch_id, v_period, v_doc_no, v_order_date, v_event_date,
            NULLIF(p_order->>'debtorCode', ''), NULLIF(p_order->>'customerName', ''),
            v_agent_name, v_agent_key, v_staff_id, NULLIF(p_order->>'location', ''), v_venue, v_brand,
            v_total, v_balance, v_excluded,
            'erp_sync', v_status, v_on_hold, v_sp_id, NULLIF(p_order->>'companyId', '')::BIGINT,
            v_snapshot, NULLIF(p_order->>'createdAt', '')::TIMESTAMPTZ, NOW(), p_order->'raw',
            -- (20260927010000)
            v_erp_fair, CASE WHEN v_erp_fair IS NOT NULL THEN 'erp' END)
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

COMMENT ON FUNCTION ingest_erp_sales_order(JSONB, UUID) IS
    'The ERP live feed''s one write: upserts one sales order (canonical shape from src/lib/erp-sync/contract.ts) into its month''s erp_sync batch, replaces its lines, re-derives the day''s Open Bill suggestions, refreshes the batch counters and logs the outcome. A new order lands in the month of its sale day (fair.fairDate, when it is one of that fair''s days — 20261006140000), else its order date''s; a re-sent order that has a fair keeps the month it is in (only the fair calendar moves it), one without a fair follows its order date. The fair the ERP names in the delivery (20260927010000) is kept in comm_venue_events by erp_sync_fair and pinned to the bill (fair_source erp). The bill''s brand is erp_sync_order_brand — Branding, else the salesperson''s pick, else a pick made on the portal, else the fair''s brand (20260927080000) — and only then the lines. A month that is closed to the feed (erp_feed_closed_months, or before comm_cutovers) or whose run has paid holds the delivery, payload kept, until it is reopened and replayed — and what changed on a settled bill becomes a pending drop or upsell (erp_sync_note_adjustment). Never raises for a business outcome — see erp_sync_events.status.';

CREATE OR REPLACE FUNCTION revenue_fair_calendar_moves(p_sub_department_id UUID)
RETURNS TABLE(order_id uuid, order_no text, order_date date, venue text, agent_name text, staff_id uuid,
              employee_name text, order_total numeric, cancelled boolean, from_period date, to_period date,
              fair_id uuid, fair_start date, fair_end date, organiser text, lag_days integer,
              locked boolean, confirmed boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT o.id, o.order_no, o.order_date, o.venue, o.agent_name, o.staff_id,
           s.employee_name, o.order_total, o.cancelled,
           o.period_month, t.to_period,
           e.id, e.start_date, e.end_date, og.name,
           (o.order_date - e.end_date)::INTEGER,
           commission_order_period_locked(p_sub_department_id, o.period_month)
             OR commission_order_period_locked(p_sub_department_id, t.to_period)
             OR erp_feed_month_closed(p_sub_department_id, o.period_month)
             OR erp_feed_month_closed(p_sub_department_id, t.to_period),
           -- (20260927010000) The ERP's pick is confirmed, like a person's pin.
           COALESCE(o.fair_source IN ('manual', 'erp'), FALSE)
      FROM sales_orders o
      JOIN sales_import_batches b ON b.id = o.batch_id
      JOIN comm_venue_events e    ON e.id = o.fair_event_id
      -- (20261006140000) Its sale day's month when the ERP gave the day, else its fair's.
      CROSS JOIN LATERAL (SELECT sales_order_sale_month(o.raw, e.start_date, e.end_date, e.period_month) AS to_period) t
      LEFT JOIN comm_organisers og ON og.id = e.organiser_id
      LEFT JOIN hr_staff_costs s   ON s.id = o.staff_id
     WHERE b.sub_department_id = p_sub_department_id
       AND b.status = 'committed'
       AND t.to_period <> o.period_month
     ORDER BY t.to_period, o.order_date, o.order_no;
$$;

CREATE OR REPLACE FUNCTION public.revenue_fair_calendar()
 RETURNS TABLE(fair_id uuid, venue_key text, display_name text, period_month date, start_date date, end_date date, organiser_id uuid, organiser_name text, erp_organiser_text text, source text, notes text, bills integer, sales_value numeric, bills_to_move integer, value_to_move numeric, confirmed_to_move integer, confirmed_value_to_move numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH bill AS MATERIALIZED (
        -- Every bill with a fair, in a committed batch, beside its fair's month.
        -- (20261006140000) A bill's month is its sale day's when the ERP gave it.
        SELECT x.fair_event_id, x.order_total, x.fair_source, x.period_month,
               b.sub_department_id,
               sales_order_sale_month(x.raw, e.start_date, e.end_date, e.period_month) AS fair_month
          FROM sales_orders x
          JOIN sales_import_batches b ON b.id = x.batch_id AND b.status = 'committed'
          JOIN comm_venue_events e    ON e.id = x.fair_event_id
    ), closed AS MATERIALIZED (
        -- Whether a month is closed to the feed depends on (sub-department,
        -- month) alone: asked once per pair, not twice per bill (20260926110000).
        SELECT m.sub_department_id, m.period_month,
               erp_feed_month_closed(m.sub_department_id, m.period_month) AS is_closed
          FROM (SELECT bl.sub_department_id, bl.period_month FROM bill bl
                UNION
                SELECT bl.sub_department_id, bl.fair_month FROM bill bl) m
    ), tally AS (
        -- A bill still waiting to move is one the calendar CAN move: not in a
        -- month closed to the feed, on either side (20260926010000).
        SELECT so.fair_event_id,
               COUNT(*)                                            AS bills,
               SUM(so.order_total)                                 AS value,
               COUNT(*) FILTER (WHERE so.waiting)                  AS moving,
               SUM(so.order_total) FILTER (WHERE so.waiting)       AS moving_value,
               COUNT(*) FILTER (WHERE so.waiting AND so.fair_source = 'manual')
                                                                   AS confirmed,
               SUM(so.order_total) FILTER (WHERE so.waiting AND so.fair_source = 'manual')
                                                                   AS confirmed_value
          FROM (
              SELECT bl.fair_event_id, bl.order_total, bl.fair_source,
                     bl.period_month <> bl.fair_month
                       AND NOT own_month.is_closed
                       AND NOT fair_month.is_closed AS waiting
                FROM bill bl
                JOIN closed own_month  ON own_month.sub_department_id = bl.sub_department_id
                                      AND own_month.period_month = bl.period_month
                JOIN closed fair_month ON fair_month.sub_department_id = bl.sub_department_id
                                      AND fair_month.period_month = bl.fair_month
          ) so
         GROUP BY so.fair_event_id
    )
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
      LEFT JOIN tally o            ON o.fair_event_id = e.id
     ORDER BY COALESCE(e.start_date, e.period_month) DESC,
              COALESCE(v.display_name, e.venue_key);
$function$;
