-- ════════════════════════════════════════════════════════════════════════════
-- Close a month to the ERP feed · possible double claims (2026-09-26)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. The Houzs ERP re-sends a whole document on every save, and the portal
-- writes whatever it says into the month the bill lives in. That is the point
-- of a live feed — until a month has been worked out by hand. August 2026 was
-- paid from the claim form, bill by bill, and the feed keeps rewriting August
-- underneath it: transport folded into totals, bills re-dated, deposits the
-- sales admin has not keyed yet. The user asked (2026-09-26) for a switch on
-- the month's "Live from ERP" chip that stops the feed touching that month,
-- so the month can hold exactly what was paid, while every other month keeps
-- syncing — and for the portal to say so when one bill is being claimed in
-- two months.
--
-- 1. erp_feed_closed_months — (sub-department, month) rows. A row means the
--    feed may not write into or out of that month.
-- 2. ingest_erp_sales_order holds such a delivery the way it holds one for a
--    month whose run has paid: 200 `held`, payload kept, logged under the
--    closed month. Reopening deletes the row and the Comm Cal page replays
--    what was held — nothing the ERP sent in between is lost.
-- 3. The fair calendar leaves a closed month alone (it moves bills by
--    rewriting period_month + batch_id, which is the same write), and it only
--    ever reads the month's COMMITTED batch.
-- 4. commit_sales_import_batch may replace a closed month's live batch — how a
--    month's hand-worked orders get in. An OPEN live month still refuses.
-- 5. revenue_possible_double_claims — every bill whose document number turns
--    up on more than one bill a run could pay (or already paid), across
--    months or inside one, with a "checked, not a double claim" answer that
--    lapses the moment another bill joins the group.
--
-- The receiver is 20260924050000's verbatim plus the three blocks marked
-- (20260926010000). Rollback: re-apply 20260924050000's ingest_erp_sales_order,
-- 20260923010000's three calendar functions, 20260920050000's
-- revenue_fair_calendar_gaps and 20260911020000's commit_sales_import_batch,
-- then drop the objects this file creates.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Which months are closed to the feed ─────────────────────────────────

CREATE TABLE IF NOT EXISTS erp_feed_closed_months (
    sub_department_id UUID        NOT NULL REFERENCES comm_sub_departments(id) ON DELETE RESTRICT,
    period_month      DATE        NOT NULL,
    closed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
    closed_by_name    TEXT,
    note              TEXT,
    PRIMARY KEY (sub_department_id, period_month),
    CONSTRAINT erp_feed_closed_months_month_is_first
        CHECK (period_month = DATE_TRUNC('month', period_month)::DATE)
);

COMMENT ON TABLE erp_feed_closed_months IS
    'Months the Houzs ERP live feed may not change (2026-09-26). While a row exists every delivery that would write into or out of that month is held with its payload; deleting the row and replaying the held events hands the month back to the feed.';

ALTER TABLE erp_feed_closed_months ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_feed_closed_months_hr_all ON erp_feed_closed_months;
CREATE POLICY erp_feed_closed_months_hr_all ON erp_feed_closed_months
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS erp_feed_closed_months_principal_all ON erp_feed_closed_months;
CREATE POLICY erp_feed_closed_months_principal_all ON erp_feed_closed_months
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON erp_feed_closed_months TO authenticated;

-- ─── 2. Asking, closing, reopening ──────────────────────────────────────────

-- SECURITY DEFINER on purpose: whether a month is closed is a fact every write
-- path must see the same way, whoever is calling. It answers a boolean only.
CREATE OR REPLACE FUNCTION erp_feed_month_closed(p_sub_department_id UUID, p_period DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM erp_feed_closed_months
         WHERE sub_department_id = p_sub_department_id
           AND period_month = p_period
    );
$fn$;

COMMENT ON FUNCTION erp_feed_month_closed(UUID, DATE) IS
    'True while the month is closed to the ERP feed (erp_feed_closed_months).';

CREATE OR REPLACE FUNCTION erp_sync_period_closed(p_period DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    SELECT erp_feed_month_closed(erp_sync_sub_department(), p_period);
$fn$;

COMMENT ON FUNCTION erp_sync_period_closed(DATE) IS
    'The receiver''s question: is this month of the feed''s own sub-department closed to it?';

CREATE OR REPLACE FUNCTION erp_feed_close_month(
    p_sub_department_id UUID,
    p_period            DATE,
    p_note              TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_row erp_feed_closed_months%ROWTYPE;
BEGIN
    IF p_period IS NULL OR p_period <> DATE_TRUNC('month', p_period)::DATE THEN
        RAISE EXCEPTION 'A month is its first day, e.g. 2026-08-01';
    END IF;
    IF p_sub_department_id IS DISTINCT FROM erp_sync_sub_department() THEN
        RAISE EXCEPTION 'Only the sub-department the Houzs ERP feeds can be closed to it';
    END IF;

    -- Row security decides who may: HR and the Principal.
    INSERT INTO erp_feed_closed_months (sub_department_id, period_month, closed_by, closed_by_name, note)
    SELECT p_sub_department_id, p_period, auth.uid(),
           (SELECT u.name FROM users u WHERE u.id = auth.uid()),
           NULLIF(BTRIM(p_note), '')
    ON CONFLICT (sub_department_id, period_month) DO NOTHING;

    SELECT * INTO v_row
      FROM erp_feed_closed_months
     WHERE sub_department_id = p_sub_department_id AND period_month = p_period;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only HR or the Principal may close a month to the ERP feed';
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'periodMonth',  v_row.period_month,
        'closedAt',     v_row.closed_at,
        'closedByName', v_row.closed_by_name,
        'note',         v_row.note);
END;
$fn$;

COMMENT ON FUNCTION erp_feed_close_month(UUID, DATE, TEXT) IS
    'Closes a month of the ERP feed''s sub-department to the feed. Idempotent: closing a closed month keeps who closed it first.';

CREATE OR REPLACE FUNCTION erp_feed_reopen_month(p_sub_department_id UUID, p_period DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_reopened INTEGER;
    v_held     INTEGER;
BEGIN
    DELETE FROM erp_feed_closed_months
     WHERE sub_department_id = p_sub_department_id AND period_month = p_period;
    GET DIAGNOSTICS v_reopened = ROW_COUNT;

    SELECT COUNT(*) INTO v_held
      FROM erp_sync_events
     WHERE sub_department_id = p_sub_department_id
       AND period_month = p_period
       AND status = 'held'
       AND replayed_at IS NULL;

    RETURN JSONB_BUILD_OBJECT('reopened', v_reopened > 0, 'held', v_held);
END;
$fn$;

COMMENT ON FUNCTION erp_feed_reopen_month(UUID, DATE) IS
    'Hands a closed month back to the ERP feed and says how many held deliveries are waiting to be replayed. The replay itself is the Comm Cal page''s (replayHeldErpEvents), through the receiver''s own function.';

-- ─── 3. The receiver ────────────────────────────────────────────────────────

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
    v_fair          UUID;
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
        -- (20260926010000) A month closed to the feed keeps its bills as they are.
        IF erp_sync_period_closed(v_existing.period_month) THEN
            RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                                'deleted in the ERP while the month is closed to the feed — reopen it and replay',
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
    -- bill did before 2026-09-20. A new document still lands in its order
    -- date's month.
    IF v_found THEN
        v_fair := CASE WHEN v_existing.fair_source = 'manual' THEN v_existing.fair_event_id
                       ELSE venue_event_for_order(v_venue, v_order_date) END;
        IF v_fair IS NOT NULL THEN
            v_period := v_existing.period_month;
        END IF;
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
        RETURN erp_sync_log(v_doc_no, v_period, 'held',
                            'the month''s commission run is applied or locked — reopen it and replay',
                            '{}', v_snapshot, p_order, p_replay_of);
    END IF;

    -- ── A month closed to the feed (20260926010000) ────────────────────────
    -- Somebody closed the month the bill lives in: nothing the ERP says about
    -- it now is written, wherever the delivery would move it. The payload is
    -- kept, logged under THAT month, so reopening it replays exactly this.
    IF v_found AND erp_sync_period_closed(v_existing.period_month) THEN
        RETURN erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                            'the month is closed to the ERP feed — reopen it and replay',
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

COMMENT ON FUNCTION ingest_erp_sales_order(JSONB, UUID) IS
    'The ERP live feed''s one write: upserts one sales order (canonical shape from src/lib/erp-sync/contract.ts) into its month''s erp_sync batch, replaces its lines, re-derives the day''s Open Bill suggestions, refreshes the batch counters and logs the outcome. A new order lands in its order date''s month; a re-sent order that has a fair keeps the month it is in (only the fair calendar moves it), one without a fair follows its order date. A month that is closed to the feed (erp_feed_closed_months) or whose run has paid holds the delivery, payload kept, until it is reopened and replayed. Never raises for a business outcome — see erp_sync_events.status.';

-- ─── 4. The fair calendar leaves a closed month alone ───────────────────────
--
-- The calendar moves a bill by rewriting its period_month and batch_id — the
-- very write a closed month forbids the feed. It also only ever reads a
-- month's COMMITTED batch: once a closed month's hand-worked orders replace
-- its live batch, the retired rows are history, not bills to move or count.

CREATE OR REPLACE FUNCTION revenue_fair_calendar_moves(p_sub_department_id UUID)
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
             OR commission_order_period_locked(p_sub_department_id, e.period_month)
             OR erp_feed_month_closed(p_sub_department_id, o.period_month)
             OR erp_feed_month_closed(p_sub_department_id, e.period_month),
           o.fair_source = 'manual'
      FROM sales_orders o
      JOIN sales_import_batches b ON b.id = o.batch_id
      JOIN comm_venue_events e    ON e.id = o.fair_event_id
      LEFT JOIN comm_organisers og ON og.id = e.organiser_id
      LEFT JOIN hr_staff_costs s   ON s.id = o.staff_id
     WHERE b.sub_department_id = p_sub_department_id
       AND b.status = 'committed'
       AND e.period_month <> o.period_month
     ORDER BY e.period_month, o.order_date, o.order_no;
$fn$;

COMMENT ON FUNCTION revenue_fair_calendar_moves(UUID) IS
    'Every bill the fair calendar disagrees with: where it sits, the fair it was written at, and the month that fair belongs to. confirmed = a human placed the bill at that fair (fair_source = manual); otherwise the fair is venue_event_for_order''s guess. locked = a month on either side has a run that has paid, or is closed to the ERP feed. Committed batches only. Read-only — this is what revenue_apply_fair_calendar would do.';

CREATE OR REPLACE FUNCTION revenue_apply_fair_calendar(
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
    -- A month closed to the ERP feed is left out on both sides (20260926010000):
    -- its bills are what was paid, and they stay where they are.
    SELECT ARRAY(
        SELECT DISTINCT m FROM (
            SELECT mv.from_period AS m FROM revenue_fair_calendar_moves(p_sub_department_id) mv
             WHERE (NOT p_confirmed_only OR mv.confirmed)
               AND NOT erp_feed_month_closed(p_sub_department_id, mv.from_period)
               AND NOT erp_feed_month_closed(p_sub_department_id, mv.to_period)
            UNION
            SELECT mv.to_period        FROM revenue_fair_calendar_moves(p_sub_department_id) mv
             WHERE (NOT p_confirmed_only OR mv.confirmed)
               AND NOT erp_feed_month_closed(p_sub_department_id, mv.from_period)
               AND NOT erp_feed_month_closed(p_sub_department_id, mv.to_period)
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
         WHERE (NOT p_confirmed_only OR m.confirmed)
           AND NOT erp_feed_month_closed(p_sub_department_id, m.from_period)
           AND NOT erp_feed_month_closed(p_sub_department_id, m.to_period)
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
    'Moves the bills the fair calendar disagrees with into the month of their fair, batch and all, and refreshes the counters on both sides. p_confirmed_only = move only bills a human placed at their fair (fair_source = manual). A month closed to the ERP feed is skipped on both sides. Refuses (23RUN) if any month it would touch has a run that has paid. Every run over a touched month must be computed again afterwards.';

CREATE OR REPLACE FUNCTION revenue_fair_calendar()
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
          -- A bill still waiting to move is one the calendar CAN move: not in a
          -- month closed to the feed, on either side (20260926010000).
          SELECT COUNT(*)                                            AS bills,
                 SUM(so.order_total)                                 AS value,
                 COUNT(*) FILTER (WHERE so.waiting)                  AS moving,
                 SUM(so.order_total) FILTER (WHERE so.waiting)       AS moving_value,
                 COUNT(*) FILTER (WHERE so.waiting AND so.fair_source = 'manual')
                                                                     AS confirmed,
                 SUM(so.order_total) FILTER (WHERE so.waiting AND so.fair_source = 'manual')
                                                                     AS confirmed_value
            FROM (
                SELECT x.order_total, x.fair_source,
                       x.period_month <> e.period_month
                         AND NOT erp_feed_month_closed(b.sub_department_id, x.period_month)
                         AND NOT erp_feed_month_closed(b.sub_department_id, e.period_month) AS waiting
                  FROM sales_orders x
                  JOIN sales_import_batches b ON b.id = x.batch_id AND b.status = 'committed'
                 WHERE x.fair_event_id = e.id
            ) so
      ) o ON TRUE
     ORDER BY COALESCE(e.start_date, e.period_month) DESC,
              COALESCE(v.display_name, e.venue_key);
$fn$;

COMMENT ON FUNCTION revenue_fair_calendar() IS
    'Every fair on record: its place, its days, its organiser, what was sold at it (committed batches only), how many of those bills are still sitting in a different month than the fair and could be moved (a month closed to the ERP feed cannot), and how many of THOSE a human confirmed (fair_source = manual). Department-level like the venue register — a hall is a hall whoever sells in it.';

CREATE OR REPLACE FUNCTION revenue_fair_calendar_gaps()
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
      JOIN sales_import_batches b ON b.id = o.batch_id AND b.status = 'committed'
      LEFT JOIN comm_venues v ON v.venue_key = venue_group_key(o.venue)
     WHERE o.fair_event_id IS NULL
       AND o.venue IS NOT NULL
     GROUP BY 1, 2, 3
     ORDER BY 3 DESC, 5 DESC;
$fn$;

COMMENT ON FUNCTION revenue_fair_calendar_gaps() IS
    'Bills of a committed batch that belong to no fair, grouped by place and the month their order date puts them in — the work list for typing the calendar, biggest first. The spread is the tell: a place whose bills run over three weeks held more than one fair that month.';

-- ─── 5. A closed month may take its hand-worked orders ──────────────────────

CREATE OR REPLACE FUNCTION public.commit_sales_import_batch(p_batch_id UUID, p_suggest_open_bills BOOLEAN DEFAULT TRUE)
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_batch sales_import_batches%ROWTYPE; v_open_bill BOOLEAN; v_suggested INTEGER := 0;
BEGIN
    IF current_user_role() NOT IN ('principal', 'hr') THEN
        RAISE EXCEPTION 'Only Principal or HR may commit a sales import';
    END IF;
    SELECT * INTO STRICT v_batch FROM sales_import_batches WHERE id = p_batch_id FOR UPDATE;
    PERFORM pg_advisory_xact_lock(hashtext('commission_orders:' || v_batch.sub_department_id || ':' || v_batch.period_month));
    IF v_batch.source <> 'file' OR v_batch.status <> 'draft' THEN
        RAISE EXCEPTION 'Only a draft file import can be committed';
    END IF;
    IF commission_order_period_locked(v_batch.sub_department_id, v_batch.period_month) THEN
        RAISE EXCEPTION 'These sales have an applied commission run; reopen it before re-importing';
    END IF;
    -- (20260926010000) A live month refuses a file — unless it is closed to
    -- the feed, which is how a month's hand-worked orders take its place.
    IF EXISTS (SELECT 1 FROM sales_import_batches WHERE sub_department_id = v_batch.sub_department_id
                 AND period_month = v_batch.period_month AND status = 'committed' AND source = 'erp_sync')
       AND NOT erp_feed_month_closed(v_batch.sub_department_id, v_batch.period_month) THEN
        RAISE EXCEPTION 'This sub-department month is fed live from the ERP — close it to the feed first';
    END IF;
    IF EXISTS (SELECT 1 FROM sales_orders WHERE batch_id = p_batch_id AND period_month <> v_batch.period_month) THEN
        RAISE EXCEPTION 'An import contains orders from another month';
    END IF;
    UPDATE sales_import_batches SET status = 'superseded', superseded_at = now()
     WHERE sub_department_id = v_batch.sub_department_id AND period_month = v_batch.period_month
       AND status = 'committed';
    UPDATE sales_import_batches SET status = 'committed' WHERE id = p_batch_id;

    SELECT enable_open_bill INTO v_open_bill FROM comm_schemes
     WHERE sub_department_id = v_batch.sub_department_id AND is_active AND effective_to IS NULL;
    -- Retired imports must not reserve the day's bill ranks forever. Preserve
    -- human picks when the replacement still names the same salesperson/day.
    WITH previous AS (
        DELETE FROM sales_order_open_bill_tags t USING sales_orders o, sales_import_batches b
         WHERE t.order_id = o.id AND o.batch_id = b.id
           AND b.sub_department_id = v_batch.sub_department_id
           AND b.period_month = v_batch.period_month AND b.id <> p_batch_id
        RETURNING o.order_no, t.staff_id, t.event_date, t.bill_rank, t.auto_suggested, t.tagged_by, t.tagged_at
    )
    INSERT INTO sales_order_open_bill_tags(order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by, tagged_at)
    SELECT o.id, o.staff_id, o.event_date, p.bill_rank, FALSE, p.tagged_by, p.tagged_at
      FROM previous p JOIN sales_orders o ON o.batch_id = p_batch_id AND o.order_no = p.order_no
     WHERE v_open_bill AND NOT p.auto_suggested AND NOT o.cancelled
       AND o.staff_id = p.staff_id AND o.event_date = p.event_date
    ON CONFLICT DO NOTHING;

    IF p_suggest_open_bills AND v_open_bill THEN
        INSERT INTO sales_order_open_bill_tags(order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by)
        SELECT o.id, o.staff_id, o.event_date, o.sequence_in_day, TRUE, auth.uid()
          FROM sales_orders o WHERE o.batch_id = p_batch_id AND NOT o.cancelled
           AND o.staff_id IS NOT NULL AND o.sequence_in_day BETWEEN 1 AND 3
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_suggested = ROW_COUNT;
    END IF;
    RETURN v_suggested;
END;
$$;

COMMENT ON FUNCTION public.commit_sales_import_batch(UUID, BOOLEAN) IS
    'Commits a staged file import as its month''s batch, retiring the one before. A month fed live by the ERP refuses, unless it is closed to the feed (erp_feed_closed_months).';

-- ─── 6. Possible double claims ──────────────────────────────────────────────
--
-- A bill's own number is the paper one — ZNT6185, HC11366 — not the ERP's
-- running HC-SO-013385. The ERP keeps it in `customer_so_no`, and when one
-- customer bought on several papers the cell carries them all, its OWN number
-- first ("HC12850+ZNT5996"). A hand-worked row carries it as its order_no.
-- So the first paper number in the cell is the bill; failing that the
-- document's own number, which only ever matches itself.

CREATE OR REPLACE FUNCTION sales_order_bill_ref(p_order_no TEXT, p_customer_so_no TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
    SELECT COALESCE(
        UPPER(REGEXP_REPLACE(SUBSTRING(p_customer_so_no FROM '[A-Za-z]{2,4}\s*-?\s*[0-9]{3,}'), '[\s-]', '', 'g')),
        UPPER(REGEXP_REPLACE(BTRIM(p_order_no), '\s', '', 'g')));
$fn$;

COMMENT ON FUNCTION sales_order_bill_ref(TEXT, TEXT) IS
    'The paper number a bill is known by: the first one in the ERP''s customer_so_no (a cell can list the customer''s other papers after it), else the order''s own number. Upper-case, no spaces or dashes.';

CREATE TABLE IF NOT EXISTS comm_double_claim_dismissals (
    sub_department_id UUID        NOT NULL REFERENCES comm_sub_departments(id) ON DELETE RESTRICT,
    bill_ref          TEXT        NOT NULL,
    -- The bills somebody looked at. A bill that joins the group later is not
    -- covered, so the question comes back by itself.
    order_ids         UUID[]      NOT NULL,
    note              TEXT,
    dismissed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    dismissed_by_name TEXT,
    dismissed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (sub_department_id, bill_ref)
);

COMMENT ON TABLE comm_double_claim_dismissals IS
    'Groups of bills sharing one paper number that a human checked and said are separate sales. Covers exactly the bills listed; a new bill under the same number asks again.';

ALTER TABLE comm_double_claim_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_double_claim_dismissals_hr_all ON comm_double_claim_dismissals;
CREATE POLICY comm_double_claim_dismissals_hr_all ON comm_double_claim_dismissals
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS comm_double_claim_dismissals_principal_all ON comm_double_claim_dismissals;
CREATE POLICY comm_double_claim_dismissals_principal_all ON comm_double_claim_dismissals
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON comm_double_claim_dismissals TO authenticated;

CREATE OR REPLACE FUNCTION revenue_possible_double_claims(p_sub_department_id UUID)
RETURNS TABLE (
    bill_ref      TEXT,
    order_id      UUID,
    order_no      TEXT,
    period_month  DATE,
    order_date    DATE,
    staff_id      UUID,
    employee_name TEXT,
    agent_name    TEXT,
    order_total   NUMERIC,
    source        TEXT,
    paid_by_run   BOOLEAN,
    dismissed     BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
    WITH live AS (
        -- Every bill a run could pay: in its month's committed batch, not
        -- excluded, and worth something (a "refer" document at RM 0 pays nobody).
        SELECT o.id, o.order_no, o.period_month, o.order_date, o.staff_id, o.agent_name,
               o.order_total, o.source,
               sales_order_bill_ref(o.order_no, o.raw->'header'->>'customer_so_no') AS ref
          FROM sales_orders o
          JOIN sales_import_batches b ON b.id = o.batch_id
         WHERE b.sub_department_id = p_sub_department_id
           AND b.status = 'committed'
           AND NOT o.cancelled
           AND o.order_total > 0
    ), paid AS (
        -- Every bill a run has paid, wherever its row sits now.
        SELECT DISTINCT ON (o.id)
               o.id, o.order_no, r.order_period_month AS period_month, o.order_date, o.staff_id,
               o.agent_name, o.order_total, o.source,
               sales_order_bill_ref(o.order_no, o.raw->'header'->>'customer_so_no') AS ref
          FROM comm_order_releases r
          JOIN comm_runs c ON c.id = r.run_id AND c.status IN ('applied', 'locked')
          JOIN sales_orders o ON o.order_no = r.order_no
          JOIN sales_import_batches b ON b.id = o.batch_id
                                     AND b.sub_department_id = r.sub_department_id
         WHERE r.sub_department_id = p_sub_department_id
         ORDER BY o.id
    ), bills AS (
        SELECT l.id, l.order_no, l.period_month, l.order_date, l.staff_id, l.agent_name,
               l.order_total, l.source, l.ref, (p.id IS NOT NULL) AS paid_by_run
          FROM live l LEFT JOIN paid p ON p.id = l.id
        UNION ALL
        SELECT p.id, p.order_no, p.period_month, p.order_date, p.staff_id, p.agent_name,
               p.order_total, p.source, p.ref, TRUE
          FROM paid p
         WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.id = p.id)
    ), groups AS (
        SELECT b.ref, ARRAY_AGG(b.id ORDER BY b.id) AS ids
          FROM bills b
         GROUP BY b.ref
        HAVING COUNT(*) > 1
    )
    SELECT b.ref, b.id, b.order_no, b.period_month, b.order_date, b.staff_id, s.employee_name,
           b.agent_name, b.order_total, b.source, b.paid_by_run,
           EXISTS (
               SELECT 1 FROM comm_double_claim_dismissals d
                WHERE d.sub_department_id = p_sub_department_id
                  AND d.bill_ref = b.ref
                  AND d.order_ids @> g.ids
           )
      FROM bills b
      JOIN groups g ON g.ref = b.ref
      LEFT JOIN hr_staff_costs s ON s.id = b.staff_id
     ORDER BY b.ref, b.period_month, b.order_date, b.order_no;
$fn$;

COMMENT ON FUNCTION revenue_possible_double_claims(UUID) IS
    'Every bill whose paper number (sales_order_bill_ref) is shared with another bill a run could pay or already paid — across months, or two documents in one. dismissed = a human checked exactly this group and said they are separate sales.';

CREATE OR REPLACE FUNCTION revenue_dismiss_double_claim(
    p_sub_department_id UUID,
    p_bill_ref          TEXT,
    p_note              TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_ids UUID[];
BEGIN
    -- The group as it stands now, read here rather than trusted from a page.
    SELECT ARRAY_AGG(c.order_id ORDER BY c.order_id) INTO v_ids
      FROM revenue_possible_double_claims(p_sub_department_id) c
     WHERE c.bill_ref = p_bill_ref;
    IF v_ids IS NULL THEN
        RAISE EXCEPTION 'No bills share the number %', p_bill_ref;
    END IF;

    INSERT INTO comm_double_claim_dismissals
        (sub_department_id, bill_ref, order_ids, note, dismissed_by, dismissed_by_name)
    VALUES
        (p_sub_department_id, p_bill_ref, v_ids, NULLIF(BTRIM(p_note), ''), auth.uid(),
         (SELECT u.name FROM users u WHERE u.id = auth.uid()))
    ON CONFLICT (sub_department_id, bill_ref) DO UPDATE
       SET order_ids         = EXCLUDED.order_ids,
           note              = EXCLUDED.note,
           dismissed_by      = EXCLUDED.dismissed_by,
           dismissed_by_name = EXCLUDED.dismissed_by_name,
           dismissed_at      = NOW();

    RETURN CARDINALITY(v_ids);
END;
$fn$;

COMMENT ON FUNCTION revenue_dismiss_double_claim(UUID, TEXT, TEXT) IS
    'Records that a human checked the bills sharing one paper number and they are separate sales. Covers exactly the bills in the group now.';

CREATE OR REPLACE FUNCTION revenue_restore_double_claim(p_sub_department_id UUID, p_bill_ref TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM comm_double_claim_dismissals
     WHERE sub_department_id = p_sub_department_id AND bill_ref = p_bill_ref;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted > 0;
END;
$fn$;

COMMENT ON FUNCTION revenue_restore_double_claim(UUID, TEXT) IS
    'Takes back a "not a double claim" answer, so the group is asked about again.';

-- ─── 7. Who may call what ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION erp_feed_month_closed(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION erp_sync_period_closed(DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION erp_feed_close_month(UUID, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION erp_feed_reopen_month(UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION sales_order_bill_ref(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION revenue_possible_double_claims(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION revenue_dismiss_double_claim(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION revenue_restore_double_claim(UUID, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION erp_feed_month_closed(UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_sync_period_closed(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_feed_close_month(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_feed_reopen_month(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION sales_order_bill_ref(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION revenue_possible_double_claims(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION revenue_dismiss_double_claim(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION revenue_restore_double_claim(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
