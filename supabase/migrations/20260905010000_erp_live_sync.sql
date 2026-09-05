-- ============================================================================
-- ERP LIVE SYNC — the Houzs Century ERP pushes every changed sales order to the
-- portal, seconds after it is committed, and the portal upserts it into the
-- same sales_* tables the monthly xlsx import fills. Everything downstream
-- (compute → apply → payroll) is untouched: it still reads the one committed
-- batch per period.
--
-- The push is the ERP's own proven shape (docs/2990-live-sync in the ERP repo):
-- a same-transaction outbox trigger, a pg_cron + pg_net drain every ~10 s, and a
-- receiver that answers 2xx for every delivery it chose not to apply so the
-- drainer never wedges. This migration is the receiver's half. The contract the
-- ERP team implements against is docs/erp-sync/contract.md.
--
-- WHAT CHANGES FOR THE EXISTING MODEL
--
--   * A period fed by the ERP has ONE long-lived committed batch with
--     source = 'erp_sync'. Orders are upserted INTO it (keyed on the ERP doc
--     number) instead of the whole month being replaced. The partial unique
--     index "one committed batch per period" is exactly what keeps the file
--     import and the live feed from ever both owning a month: the importer
--     refuses a live month, and the feed HOLDS an event for a file-imported one.
--
--   * For a synced order `cancelled` means "excluded from commission" and the
--     new erp_status / erp_on_hold columns say why (CANCELLED, DRAFT, the ERP's
--     hold marker, or DELETED). The ERP's own rule (scm/shared/hr-commission.ts:
--     CANCELLED / ON_HOLD / DRAFT earn nothing; CLOSED still earns) is mirrored
--     here so the two systems never disagree about which orders pay.
--
--   * Cost now arrives per line from the ERP (line_cost_sen), which is the cost
--     source the commission spec's Q1 was waiting for. The Product List stays
--     the fallback for a line the ERP sends without one.
--
--   * A period whose run is applied or locked is never mutated by the feed.
--     The event is recorded as HELD with its full payload, the page shows it,
--     and a human replays it after reopening the run (clawback across periods
--     is still spec §13's non-goal).
--
-- Additive only: new columns with defaults, one new table, new functions. The
-- file importer keeps writing source = 'file' by default and reads nothing new.
-- ============================================================================

-- ── Batches ─────────────────────────────────────────────────────────────────

ALTER TABLE sales_import_batches
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'file'
        CONSTRAINT sales_import_batches_source_check CHECK (source IN ('file', 'erp_sync')),
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN sales_import_batches.source IS
    'file = one xlsx import, replaced whole on re-import. erp_sync = the period''s live feed from the ERP: one batch per period, orders upserted into it as they change.';
COMMENT ON COLUMN sales_import_batches.last_synced_at IS
    'erp_sync batches only: when the ERP last changed something in this period.';

-- ── Orders ──────────────────────────────────────────────────────────────────

ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'file'
        CONSTRAINT sales_orders_source_check CHECK (source IN ('file', 'erp_sync')),
    ADD COLUMN IF NOT EXISTS erp_status TEXT,
    ADD COLUMN IF NOT EXISTS erp_on_hold BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS erp_salesperson_id TEXT,
    ADD COLUMN IF NOT EXISTS erp_company_id BIGINT,
    ADD COLUMN IF NOT EXISTS erp_snapshot_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS erp_created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

COMMENT ON COLUMN sales_orders.erp_status IS
    'The ERP header status as delivered (DRAFT / CONFIRMED / IN_PRODUCTION / READY_TO_SHIP / SHIPPED / DELIVERED / INVOICED / CLOSED / CANCELLED, or DELETED when the ERP row is gone). Synced orders only.';
COMMENT ON COLUMN sales_orders.erp_on_hold IS
    'The ERP''s hold MARKER (their mig 0324): a held order keeps its real status but earns no commission while held.';
COMMENT ON COLUMN sales_orders.erp_salesperson_id IS
    'scm.staff.id in the ERP — the stable identity behind the free-text agent name. comm_agent_aliases.erp_salesperson_id matches on it first.';
COMMENT ON COLUMN sales_orders.erp_snapshot_at IS
    'now() on the ERP when the delivered snapshot was built. An older snapshot arriving after a newer one is ignored (stale); the same one twice is a duplicate.';
COMMENT ON COLUMN sales_orders.erp_created_at IS
    'When the ERP created the order — a real timestamp, which is what orders the 1st/2nd/3rd bill of a day. The xlsx export never had one.';

-- One live row per ERP document. File-imported rows keep their per-batch rule.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_erp_doc_no
    ON sales_orders (order_no) WHERE source = 'erp_sync';
CREATE INDEX IF NOT EXISTS idx_sales_orders_erp_salesperson
    ON sales_orders (erp_salesperson_id) WHERE erp_salesperson_id IS NOT NULL;

-- ── Aliases ─────────────────────────────────────────────────────────────────

ALTER TABLE comm_agent_aliases
    ADD COLUMN IF NOT EXISTS erp_salesperson_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_agent_aliases_erp_salesperson
    ON comm_agent_aliases (erp_salesperson_id) WHERE erp_salesperson_id IS NOT NULL;

COMMENT ON COLUMN comm_agent_aliases.erp_salesperson_id IS
    'The ERP staff uuid this alias was confirmed for. Looked up before agent_key, so a renamed salesperson still resolves.';

-- ── The event log ───────────────────────────────────────────────────────────
-- One row per delivery the receiver saw. This is the operator''s view of the
-- feed ("last event 12 s ago", "3 held since the run was applied") and the
-- payload store a held event is replayed from.

CREATE TABLE IF NOT EXISTS erp_sync_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_no       TEXT,
    period_month DATE,
    status       TEXT NOT NULL CHECK (status IN (
                     'applied', 'duplicate', 'stale', 'held', 'skipped', 'rejected', 'error')),
    message      TEXT,
    warnings     TEXT[] NOT NULL DEFAULT '{}',
    snapshot_at  TIMESTAMPTZ,
    payload      JSONB,
    replay_of    UUID REFERENCES erp_sync_events(id) ON DELETE SET NULL,
    replayed_at  TIMESTAMPTZ,
    replay_result TEXT,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE erp_sync_events IS
    'Every sales-order delivery from the ERP live feed and what the portal did with it. held rows carry the payload so a human can replay them once the run is reopened.';

CREATE INDEX IF NOT EXISTS idx_erp_sync_events_received ON erp_sync_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_sync_events_doc ON erp_sync_events (doc_no);
CREATE INDEX IF NOT EXISTS idx_erp_sync_events_held
    ON erp_sync_events (period_month, received_at) WHERE status = 'held' AND replayed_at IS NULL;

ALTER TABLE erp_sync_events ENABLE ROW LEVEL SECURITY;

-- Same wall as every other commission table: admin and hr scopes, nobody else.
-- The receiver itself writes through the service role, which bypasses RLS.
CREATE POLICY erp_sync_events_principal_all ON erp_sync_events FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));
CREATE POLICY erp_sync_events_hr_all ON erp_sync_events FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- A month whose run has paid out is never rewritten underneath payroll.
CREATE OR REPLACE FUNCTION erp_sync_period_locked(p_period DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM comm_runs
        WHERE period_month = p_period AND status IN ('applied', 'locked')
    );
$$;

-- The ERP's Branding text → a comm_brands code, case-insensitively on either
-- the code or the name, any active scheme. Brands are per scheme but a code
-- means the same brand everywhere.
CREATE OR REPLACE FUNCTION erp_sync_brand_code(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT b.code
    FROM comm_brands b
    WHERE p_name IS NOT NULL
      AND b.is_active
      AND (UPPER(BTRIM(b.code)) = UPPER(BTRIM(p_name)) OR UPPER(BTRIM(b.name)) = UPPER(BTRIM(p_name)))
    ORDER BY b.created_at
    LIMIT 1;
$$;

-- The importer's fallback, kept identical: longest matching Item Code prefix.
CREATE OR REPLACE FUNCTION erp_sync_brand_by_prefix(p_item_code TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT b.code
    FROM comm_brands b
    CROSS JOIN LATERAL UNNEST(b.item_code_prefixes) AS p(prefix)
    WHERE p_item_code IS NOT NULL
      AND b.is_active
      AND UPPER(BTRIM(p_item_code)) LIKE UPPER(BTRIM(p.prefix)) || '%'
    ORDER BY LENGTH(p.prefix) DESC
    LIMIT 1;
$$;

-- 1-based position among that agent's live orders on the event day, by the
-- ERP's own creation time. Excluded orders drop out of the count.
CREATE OR REPLACE FUNCTION erp_sync_resequence_day(p_agent_key TEXT, p_event_date DATE)
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
    UPDATE sales_orders o
       SET sequence_in_day = s.rn
      FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY erp_created_at NULLS LAST, order_no) AS rn
            FROM sales_orders
           WHERE source = 'erp_sync' AND agent_key = p_agent_key
             AND event_date = p_event_date AND NOT cancelled
      ) s
     WHERE o.id = s.id AND o.sequence_in_day IS DISTINCT FROM s.rn;

    UPDATE sales_orders
       SET sequence_in_day = NULL
     WHERE source = 'erp_sync' AND agent_key = p_agent_key
       AND event_date = p_event_date AND cancelled AND sequence_in_day IS NOT NULL;
$$;

-- The Open Bill suggestions for one salesperson-day, re-derived. Only rows the
-- feed suggested are touched: a rank a human picked, or an order a human
-- tagged, always wins — the same rule the importer follows.
CREATE OR REPLACE FUNCTION erp_sync_suggest_open_bills(p_staff_id UUID, p_event_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    n INTEGER := 0;
BEGIN
    IF p_staff_id IS NULL OR p_event_date IS NULL THEN
        RETURN 0;
    END IF;

    DELETE FROM sales_order_open_bill_tags t
     USING sales_orders o
     WHERE t.order_id = o.id
       AND t.staff_id = p_staff_id AND t.event_date = p_event_date
       AND t.auto_suggested AND o.source = 'erp_sync';

    INSERT INTO sales_order_open_bill_tags (order_id, staff_id, event_date, bill_rank, auto_suggested)
    SELECT o.id, p_staff_id, p_event_date, o.sequence_in_day, TRUE
      FROM sales_orders o
     WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
       AND o.event_date = p_event_date AND NOT o.cancelled
       AND o.sequence_in_day BETWEEN 1 AND 3
       AND NOT EXISTS (SELECT 1 FROM sales_order_open_bill_tags h WHERE h.order_id = o.id)
       AND NOT EXISTS (
           SELECT 1 FROM sales_order_open_bill_tags h
            WHERE h.staff_id = p_staff_id AND h.event_date = p_event_date
              AND h.bill_rank = o.sequence_in_day);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

-- The batch header the Comm Cal page reads, kept true after every change.
CREATE OR REPLACE FUNCTION erp_sync_refresh_batch(p_batch_id UUID)
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
    UPDATE sales_import_batches b
       SET order_count = (SELECT COUNT(*) FROM sales_orders WHERE batch_id = b.id AND NOT cancelled),
           cancelled_count = (SELECT COUNT(*) FROM sales_orders WHERE batch_id = b.id AND cancelled),
           unmatched_agent_count = (
               SELECT COUNT(DISTINCT agent_key) FROM sales_orders
                WHERE batch_id = b.id AND NOT cancelled AND staff_id IS NULL),
           row_count = (
               SELECT COUNT(*) FROM sales_order_lines l
                 JOIN sales_orders o ON o.id = l.order_id
                WHERE o.batch_id = b.id),
           last_synced_at = NOW()
     WHERE b.id = p_batch_id;
$$;

-- The one place an event row is written, so the shape of the log never drifts
-- between the seven outcomes. Also closes a replayed event's loop.
CREATE OR REPLACE FUNCTION erp_sync_log(
    p_doc_no TEXT, p_period DATE, p_status TEXT, p_message TEXT, p_warnings TEXT[],
    p_snapshot TIMESTAMPTZ, p_payload JSONB, p_replay_of UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO erp_sync_events (doc_no, period_month, status, message, warnings, snapshot_at, payload, replay_of)
    VALUES (p_doc_no, p_period, p_status, p_message, COALESCE(p_warnings, '{}'), p_snapshot, p_payload, p_replay_of)
    RETURNING id INTO v_id;

    IF p_replay_of IS NOT NULL THEN
        UPDATE erp_sync_events
           SET replayed_at = NOW(), replay_result = p_status
         WHERE id = p_replay_of;
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'status', p_status,
        'docNo', p_doc_no,
        'periodMonth', p_period,
        'message', p_message,
        'warnings', TO_JSONB(COALESCE(p_warnings, '{}')),
        'eventId', v_id);
END;
$$;

-- ── The receiver's write ────────────────────────────────────────────────────
--
-- ingest_erp_sales_order(p_order) takes ONE order in the portal's canonical
-- shape (src/lib/erp-sync/contract.ts turns the ERP's raw rows into it — sen
-- to ringgit, the hold marker, the salesperson, the line costs) and does every
-- write for it atomically. It never raises for a business reason: every
-- outcome is a row in erp_sync_events and a status in the returned JSON, so
-- the ERP's drainer always gets its 2xx and the operator always gets a record.
--
--   applied    written (or an existing order updated)
--   duplicate  this exact snapshot was already applied
--   stale      a newer snapshot of this order is already here
--   held       the month is applied/locked, or is file-imported — nothing
--              written, payload kept for replay
--   skipped    a brand-new DRAFT, or a delete for an order never seen
--
-- SECURITY INVOKER on purpose (the same reasoning as the run RPCs): the
-- service role calls it from the receiver and bypasses RLS; a signed-in HR user
-- replaying a held event goes through the ordinary hr/admin policies.

CREATE OR REPLACE FUNCTION ingest_erp_sales_order(p_order JSONB, p_replay_of UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_doc_no        TEXT := NULLIF(BTRIM(p_order->>'docNo'), '');
    v_snapshot      TIMESTAMPTZ := NULLIF(p_order->>'snapshotAt', '')::TIMESTAMPTZ;
    v_deleted       BOOLEAN := COALESCE((p_order->>'deleted')::BOOLEAN, FALSE);
    v_status        TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED'));
    v_on_hold       BOOLEAN := COALESCE((p_order->>'onHold')::BOOLEAN, FALSE);
    v_order_date    DATE := NULLIF(p_order->>'orderDate', '')::DATE;
    v_period        DATE;
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

    -- ── The period's batch ─────────────────────────────────────────────────
    SELECT id, source INTO v_batch_id, v_batch_source
      FROM sales_import_batches
     WHERE period_month = v_period AND status = 'committed';
    IF v_batch_id IS NULL THEN
        INSERT INTO sales_import_batches (period_month, file_name, source, status, notes)
        VALUES (v_period, 'ERP live sync', 'erp_sync', 'committed',
                'Fed live from the Houzs Century ERP. Orders are upserted as they change.')
        ON CONFLICT (period_month) WHERE status = 'committed' DO NOTHING
        RETURNING id INTO v_batch_id;
        IF v_batch_id IS NULL THEN
            SELECT id, source INTO v_batch_id, v_batch_source
              FROM sales_import_batches
             WHERE period_month = v_period AND status = 'committed';
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
            agent_name, agent_key, staff_id, location, brand_code, order_total, balance, cancelled,
            source, erp_status, erp_on_hold, erp_salesperson_id, erp_company_id, erp_snapshot_at,
            erp_created_at, synced_at, raw)
        VALUES (
            v_batch_id, v_period, v_doc_no, v_order_date, v_event_date,
            NULLIF(p_order->>'debtorCode', ''), NULLIF(p_order->>'customerName', ''),
            v_agent_name, v_agent_key, v_staff_id, NULLIF(p_order->>'location', ''), v_brand,
            v_total, v_balance, v_excluded,
            'erp_sync', v_status, v_on_hold, v_sp_id, NULLIF(p_order->>'companyId', '')::BIGINT,
            v_snapshot, NULLIF(p_order->>'createdAt', '')::TIMESTAMPTZ, NOW(), p_order->'raw')
        RETURNING id INTO v_order_id;
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

-- ── Matching a salesperson the feed could not place ─────────────────────────
-- The import wizard matches agents before anything is written; a live feed has
-- no such moment, so the Comm Cal page offers the same choice afterwards. This
-- remembers the choice (the alias) and applies it to every live order that was
-- waiting on it, in any month that is not locked.

CREATE OR REPLACE FUNCTION match_erp_salesperson(p_agent_key TEXT, p_erp_salesperson_id TEXT, p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_key      TEXT := UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_agent_key, '')), '\s+', ' ', 'g'));
    v_sp_id    TEXT := NULLIF(BTRIM(p_erp_salesperson_id), '');
    v_sample   TEXT;
    v_orders   INTEGER := 0;
    r          RECORD;
BEGIN
    IF v_key = '' AND v_sp_id IS NULL THEN
        RAISE EXCEPTION 'Nothing to match on';
    END IF;
    IF p_staff_id IS NULL THEN
        RAISE EXCEPTION 'Pick a salesperson';
    END IF;

    SELECT agent_name INTO v_sample
      FROM sales_orders
     WHERE source = 'erp_sync' AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
     ORDER BY synced_at DESC NULLS LAST
     LIMIT 1;

    -- One alias per spelling, and one per ERP identity. An existing alias for
    -- the spelling is re-pointed rather than duplicated.
    IF v_key <> '' THEN
        INSERT INTO comm_agent_aliases (agent_key, agent_name_sample, staff_id, erp_salesperson_id, created_by)
        VALUES (v_key, COALESCE(v_sample, v_key), p_staff_id, v_sp_id, auth.uid())
        ON CONFLICT (agent_key) DO UPDATE
            SET staff_id = EXCLUDED.staff_id,
                erp_salesperson_id = COALESCE(EXCLUDED.erp_salesperson_id, comm_agent_aliases.erp_salesperson_id);
    ELSE
        INSERT INTO comm_agent_aliases (agent_key, agent_name_sample, staff_id, erp_salesperson_id, created_by)
        VALUES ('ERP:' || v_sp_id, COALESCE(v_sample, v_sp_id), p_staff_id, v_sp_id, auth.uid())
        ON CONFLICT (agent_key) DO UPDATE SET staff_id = EXCLUDED.staff_id;
    END IF;

    -- Every live order still waiting on this person, in months that can move.
    FOR r IN
        SELECT o.id, o.agent_key, o.event_date, o.batch_id
          FROM sales_orders o
         WHERE o.source = 'erp_sync' AND o.staff_id IS NULL
           AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
           AND NOT erp_sync_period_locked(o.period_month)
    LOOP
        UPDATE sales_orders SET staff_id = p_staff_id WHERE id = r.id;
        v_orders := v_orders + 1;
    END LOOP;

    FOR r IN
        SELECT DISTINCT o.event_date, o.batch_id
          FROM sales_orders o
         WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
           AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
    LOOP
        PERFORM erp_sync_suggest_open_bills(p_staff_id, r.event_date);
        PERFORM erp_sync_refresh_batch(r.batch_id);
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('ordersMatched', v_orders);
END;
$$;

-- Executable by the receiver (service role) and by signed-in staff, whose
-- table policies decide what they may touch. Never by the anonymous key.
REVOKE ALL ON FUNCTION ingest_erp_sales_order(JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION match_erp_salesperson(TEXT, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION erp_sync_log(TEXT, DATE, TEXT, TEXT, TEXT[], TIMESTAMPTZ, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ingest_erp_sales_order(JSONB, UUID) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION match_erp_salesperson(TEXT, TEXT, UUID) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION erp_sync_log(TEXT, DATE, TEXT, TEXT, TEXT[], TIMESTAMPTZ, JSONB, UUID) TO service_role, authenticated;

COMMENT ON FUNCTION ingest_erp_sales_order(JSONB, UUID) IS
    'The ERP live feed''s one write: upserts one sales order (canonical shape from src/lib/erp-sync/contract.ts) into the period''s erp_sync batch, replaces its lines, re-derives the day''s Open Bill suggestions, refreshes the batch counters and logs the outcome. Never raises for a business outcome — see erp_sync_events.status.';
COMMENT ON FUNCTION match_erp_salesperson(TEXT, TEXT, UUID) IS
    'Remembers which portal salesperson an ERP salesperson is and back-fills every live order that was waiting on the answer.';
