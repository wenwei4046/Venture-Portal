-- ════════════════════════════════════════════════════════════════════════════
-- The portal pays from a month · drops and upsells the ERP reveals (2026-09-26)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. June, July and August 2026 were paid from the hand-worked claim forms.
-- No run of the portal has paid any of it, so the run carries every one of
-- those bills forward: September's calculation would pay June to August again
-- (119 bills, RM 678,945 from June and July alone). The user decided
-- (2026-09-26): the portal pays from September. Months before that were
-- settled by hand — their bills never carry, and the ERP may not change them.
--
-- And once a month is settled, the ERP keeps changing its bills: a customer
-- drops an item (HC13911, 16,888 → 14,800 on 18 August), adds one, cancels.
-- The ERP has no drop or upsell of its own — every save re-sends the whole
-- document — so the portal works out what changed against what was settled
-- and puts the difference in front of HR as a drop (−) or an upsell (+) of the
-- month it is noticed in, to confirm or dismiss (user 2026-09-26: 10 月薪水里
-- 有一个 column 显示 drop sales 的 amount，当然也会有 upsell).
--
-- 1. comm_cutovers — the first month a sub-department's runs pay.
-- 2. erp_feed_month_closed — a month before it is closed to the feed, exactly
--    as an explicitly closed one is.
-- 3. comm_upsales grows a kind (upsale | drop, signed), a status (pending |
--    confirmed | dismissed) and where it came from (manual | erp). Runs read
--    confirmed rows only.
-- 4. erp_sync_note_adjustment — called by the receiver whenever it holds a
--    delivery for a bill in a settled month (closed, before the cutover, or
--    paid by a run): new commissionable amount − settled amount = a pending
--    drop or upsell, one open per document, updated as the ERP keeps saving.
--    Settled means what a run paid on it, else the hand-worked row under the
--    same paper in that month's committed batch, else the bill as its closed
--    month froze it. A delivery that is later APPLIED (the month reopened)
--    clears the pending row: the change was written instead. And a re-send
--    never carries a bill that lives in a month the portal pays back into a
--    settled one — an August bill moved to September to wait for its deposit
--    keeps hearing of its payments there.
-- 5. member_order_facts — a bill of a month before the cutover is recognised
--    in its own month and counts as cleared (it was settled by hand), never
--    carried into the portal's months.
--
-- The receiver is 20260926010000's verbatim plus the blocks marked
-- (20260926020000); member_order_facts is 20260919050000's plus its marked
-- lines. Rollback: re-apply those two bodies and 20260926010000's
-- erp_feed_month_closed, drop the new objects and comm_upsales' new columns
-- (restoring comm_upsales_amount_positive).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The first month the portal pays ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS comm_cutovers (
    sub_department_id UUID        PRIMARY KEY REFERENCES comm_sub_departments(id) ON DELETE RESTRICT,
    first_paid_month  DATE        NOT NULL,
    set_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
    set_by_name       TEXT,
    set_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note              TEXT,
    CONSTRAINT comm_cutovers_month_is_first
        CHECK (first_paid_month = DATE_TRUNC('month', first_paid_month)::DATE)
);

COMMENT ON TABLE comm_cutovers IS
    'The first month a sub-department''s commission runs pay (2026-09-26). Every month before it was settled outside the portal: its bills never carry forward into a run, and the ERP feed may not change them (erp_feed_month_closed).';

ALTER TABLE comm_cutovers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_cutovers_hr_all ON comm_cutovers;
CREATE POLICY comm_cutovers_hr_all ON comm_cutovers
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS comm_cutovers_principal_all ON comm_cutovers;
CREATE POLICY comm_cutovers_principal_all ON comm_cutovers
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON comm_cutovers TO authenticated;

-- SECURITY DEFINER for the same reason as erp_feed_month_closed: the feed, the
-- run and the member app must all see the same month, whoever is asking.
CREATE OR REPLACE FUNCTION comm_first_paid_month(p_sub_department_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT first_paid_month FROM comm_cutovers WHERE sub_department_id = p_sub_department_id;
$fn$;

COMMENT ON FUNCTION comm_first_paid_month(UUID) IS
    'The first month the sub-department''s runs pay, or NULL when the portal has paid from the start.';

CREATE OR REPLACE FUNCTION comm_set_first_paid_month(
    p_sub_department_id UUID,
    p_month             DATE,
    p_note              TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_row comm_cutovers%ROWTYPE;
BEGIN
    IF p_month IS NULL OR p_month <> DATE_TRUNC('month', p_month)::DATE THEN
        RAISE EXCEPTION 'A month is its first day, e.g. 2026-09-01';
    END IF;
    -- A month a run has already paid cannot fall before the portal's first:
    -- it would stop carrying bills that run already released.
    IF EXISTS (SELECT 1 FROM comm_runs
                WHERE sub_department_id = p_sub_department_id AND period_month < p_month
                  AND status IN ('applied', 'locked')) THEN
        RAISE EXCEPTION 'A run before % has paid — the portal already pays from then', TO_CHAR(p_month, 'Mon YYYY');
    END IF;

    INSERT INTO comm_cutovers (sub_department_id, first_paid_month, set_by, set_by_name, note)
    VALUES (p_sub_department_id, p_month, auth.uid(),
            (SELECT u.name FROM users u WHERE u.id = auth.uid()), NULLIF(BTRIM(p_note), ''))
    ON CONFLICT (sub_department_id) DO UPDATE
       SET first_paid_month = EXCLUDED.first_paid_month,
           set_by           = EXCLUDED.set_by,
           set_by_name      = EXCLUDED.set_by_name,
           set_at           = NOW(),
           note             = EXCLUDED.note;

    SELECT * INTO v_row FROM comm_cutovers WHERE sub_department_id = p_sub_department_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only HR or the Principal may say when the portal starts paying';
    END IF;
    RETURN JSONB_BUILD_OBJECT('firstPaidMonth', v_row.first_paid_month, 'setAt', v_row.set_at,
                              'setByName', v_row.set_by_name, 'note', v_row.note);
END;
$fn$;

COMMENT ON FUNCTION comm_set_first_paid_month(UUID, DATE, TEXT) IS
    'Sets the first month the sub-department''s runs pay. Refuses a month after one a run has already paid.';

CREATE OR REPLACE FUNCTION comm_clear_first_paid_month(p_sub_department_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM comm_cutovers WHERE sub_department_id = p_sub_department_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted > 0;
END;
$fn$;

COMMENT ON FUNCTION comm_clear_first_paid_month(UUID) IS
    'The portal pays every month again: earlier bills carry forward as they did before a first month was set.';

-- ─── 2. A month before the portal pays is closed to the feed ────────────────

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
    ) OR COALESCE(p_period < comm_first_paid_month(p_sub_department_id), FALSE);
$fn$;

COMMENT ON FUNCTION erp_feed_month_closed(UUID, DATE) IS
    'True while the month is closed to the ERP feed: closed by hand (erp_feed_closed_months), or before the first month the portal pays (comm_cutovers) — settled outside the portal either way.';

-- ─── 3. Upsales become upsales and drops, recorded or found ─────────────────

ALTER TABLE comm_upsales
    ADD COLUMN IF NOT EXISTS kind            TEXT NOT NULL DEFAULT 'upsale',
    ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'confirmed',
    ADD COLUMN IF NOT EXISTS source          TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS erp_doc_no      TEXT,
    ADD COLUMN IF NOT EXISTS erp_event_id    UUID REFERENCES erp_sync_events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS settled_amount  NUMERIC(15, 2),
    ADD COLUMN IF NOT EXISTS erp_amount      NUMERIC(15, 2),
    ADD COLUMN IF NOT EXISTS original_period DATE,
    ADD COLUMN IF NOT EXISTS decided_by      UUID,
    ADD COLUMN IF NOT EXISTS decided_at      TIMESTAMPTZ;

ALTER TABLE comm_upsales DROP CONSTRAINT IF EXISTS comm_upsales_amount_positive;
ALTER TABLE comm_upsales DROP CONSTRAINT IF EXISTS comm_upsales_kind_known;
ALTER TABLE comm_upsales DROP CONSTRAINT IF EXISTS comm_upsales_status_known;
ALTER TABLE comm_upsales DROP CONSTRAINT IF EXISTS comm_upsales_source_known;
ALTER TABLE comm_upsales DROP CONSTRAINT IF EXISTS comm_upsales_amount_signed;
ALTER TABLE comm_upsales
    ADD CONSTRAINT comm_upsales_kind_known   CHECK (kind IN ('upsale', 'drop')),
    ADD CONSTRAINT comm_upsales_status_known CHECK (status IN ('pending', 'confirmed', 'dismissed')),
    ADD CONSTRAINT comm_upsales_source_known CHECK (source IN ('manual', 'erp')),
    -- An upsale adds, a drop takes away: the sign says which.
    ADD CONSTRAINT comm_upsales_amount_signed
        CHECK ((kind = 'upsale' AND amount > 0) OR (kind = 'drop' AND amount < 0));

-- One open question per ERP document: the ERP keeps saving, the row keeps up.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_upsales_pending_erp_doc
    ON comm_upsales (sub_department_id, erp_doc_no)
    WHERE status = 'pending' AND erp_doc_no IS NOT NULL;

COMMENT ON TABLE comm_upsales IS
    'Upsales (+) and drops (−) on bills of a settled month, paid at the salesperson''s own rate in period_month and counted toward the upline''s override. Recorded by hand, or found by the ERP feed (source = erp) as a pending row HR confirms or dismisses. Runs read confirmed rows only. Not a bill — no Open Bill, KPI, margin or deposit gate (lib/commission/upsales.ts).';

-- ─── 4. What the ERP changed on a settled bill ──────────────────────────────

CREATE OR REPLACE FUNCTION erp_sync_note_adjustment(p_order_id UUID, p_order JSONB, p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_row       sales_orders%ROWTYPE;
    v_sub       UUID;
    v_scheme    UUID;
    v_ref       TEXT;
    v_status    TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_order->>'status'), ''), 'CONFIRMED'));
    v_new       NUMERIC(15, 2);
    v_settled   NUMERIC(15, 2);
    v_staff     UUID;
    v_hand_id   UUID;
    v_confirmed NUMERIC(15, 2);
    v_delta     NUMERIC(15, 2);
    v_today     DATE := (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE;
BEGIN
    SELECT * INTO v_row FROM sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_row.batch_id;
    SELECT s.id INTO v_scheme
      FROM comm_schemes s
     WHERE s.sub_department_id = v_sub AND s.is_active AND s.effective_to IS NULL
     ORDER BY s.effective_from DESC
     LIMIT 1;
    IF v_scheme IS NULL THEN
        RETURN;
    END IF;
    v_ref := sales_order_bill_ref(v_row.order_no, v_row.raw->'header'->>'customer_so_no');

    -- What the ERP says now: its lines in groups the scheme pays on — nothing
    -- at all once it is deleted, cancelled, a draft or on hold.
    IF COALESCE((p_order->>'deleted')::BOOLEAN, FALSE)
       OR v_status IN ('CANCELLED', 'DRAFT', 'ON_HOLD')
       OR COALESCE((p_order->>'onHold')::BOOLEAN, FALSE) THEN
        v_new := 0;
    ELSE
        SELECT COALESCE(ROUND(SUM(COALESCE((l->>'amount')::NUMERIC, 0)), 2), 0) INTO v_new
          FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_order->'lines', '[]'::JSONB)) l
          JOIN comm_item_groups g
            ON g.scheme_id = v_scheme
           AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(COALESCE(l->>'itemGroup', '')))
           AND g.commissionable;
    END IF;

    -- What was settled, and whose it is:
    -- (a) a run paid it — what that run paid on;
    SELECT r.product_revenue, r.staff_id INTO v_settled, v_staff
      FROM comm_order_releases r
      JOIN comm_runs c ON c.id = r.run_id AND c.status IN ('applied', 'locked')
     WHERE r.sub_department_id = v_sub AND r.order_no = v_row.order_no
     ORDER BY r.released_at DESC
     LIMIT 1;

    -- (b) its month was worked out by hand — the row under the same paper in
    --     that month's committed (imported) batch, and the person it paid;
    IF v_settled IS NULL THEN
        SELECT m.id, m.staff_id INTO v_hand_id, v_staff
          FROM sales_orders m
          JOIN sales_import_batches b ON b.id = m.batch_id
         WHERE b.sub_department_id = v_sub
           AND b.status = 'committed'
           AND b.source = 'file'
           AND b.period_month = v_row.period_month
           AND NOT m.cancelled
           AND sales_order_bill_ref(m.order_no, m.raw->'header'->>'customer_so_no') = v_ref
         ORDER BY m.order_total DESC
         LIMIT 1;
        IF v_hand_id IS NOT NULL THEN
            SELECT COALESCE(SUM(ml.line_amount), 0) INTO v_settled
              FROM sales_order_lines ml
              JOIN comm_item_groups g
                ON g.scheme_id = v_scheme
               AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(ml.item_group))
               AND g.commissionable
             WHERE ml.order_id = v_hand_id;
        END IF;
    END IF;

    -- (c) the bill itself, as its closed month froze it.
    IF v_settled IS NULL
       AND EXISTS (SELECT 1 FROM sales_import_batches b WHERE b.id = v_row.batch_id AND b.status = 'committed')
       AND erp_feed_month_closed(v_sub, v_row.period_month) THEN
        IF v_row.cancelled THEN
            v_settled := 0;
        ELSE
            SELECT COALESCE(SUM(l.line_amount), 0) INTO v_settled
              FROM sales_order_lines l
              JOIN comm_item_groups g
                ON g.scheme_id = v_scheme
               AND UPPER(BTRIM(g.item_group)) = UPPER(BTRIM(l.item_group))
               AND g.commissionable
             WHERE l.order_id = v_row.id;
        END IF;
        v_staff := v_row.staff_id;
    END IF;

    IF v_settled IS NULL OR v_staff IS NULL THEN
        RETURN;
    END IF;

    -- Drops and upsells already answered on it are part of what was settled:
    -- a confirmed one was paid; a dismissed one said the ERP's figure stands.
    SELECT COALESCE(SUM(u.amount), 0) INTO v_confirmed
      FROM comm_upsales u
     WHERE u.sub_department_id = v_sub AND u.erp_doc_no = v_row.order_no
       AND u.status IN ('confirmed', 'dismissed');
    v_settled := v_settled + v_confirmed;
    v_delta := ROUND(v_new - v_settled, 2);

    IF ABS(v_delta) < 0.01 THEN
        -- The ERP is back to what was settled: nothing to ask any more.
        DELETE FROM comm_upsales
         WHERE sub_department_id = v_sub AND erp_doc_no = v_row.order_no AND status = 'pending';
        RETURN;
    END IF;

    INSERT INTO comm_upsales (
        sub_department_id, period_month, staff_id, amount, sold_on, original_ref, note,
        kind, status, source, erp_doc_no, erp_event_id, settled_amount, erp_amount, original_period, created_by)
    VALUES (
        v_sub, DATE_TRUNC('month', v_today)::DATE, v_staff, v_delta, v_today, v_ref,
        'The ERP changed ' || v_row.order_no || ' after ' || TO_CHAR(v_row.period_month, 'FMMonth YYYY') || ' was settled',
        CASE WHEN v_delta > 0 THEN 'upsale' ELSE 'drop' END, 'pending', 'erp', v_row.order_no, p_event_id,
        v_settled, v_new, v_row.period_month, NULL)
    ON CONFLICT (sub_department_id, erp_doc_no) WHERE status = 'pending' AND erp_doc_no IS NOT NULL
    DO UPDATE SET amount         = EXCLUDED.amount,
                  kind           = EXCLUDED.kind,
                  staff_id       = EXCLUDED.staff_id,
                  period_month   = EXCLUDED.period_month,
                  sold_on        = EXCLUDED.sold_on,
                  note           = EXCLUDED.note,
                  erp_event_id   = EXCLUDED.erp_event_id,
                  settled_amount = EXCLUDED.settled_amount,
                  erp_amount     = EXCLUDED.erp_amount;
EXCEPTION WHEN OTHERS THEN
    -- A delivery is never lost over its bookkeeping: the held event keeps the
    -- payload, and the drop or upsell can still be recorded by hand.
    RAISE WARNING 'erp_sync_note_adjustment(%): %', p_order_id, SQLERRM;
END;
$fn$;

COMMENT ON FUNCTION erp_sync_note_adjustment(UUID, JSONB, UUID) IS
    'Called by ingest_erp_sales_order when it holds a delivery for a bill of a settled month: the delivery''s commissionable amount minus what was settled (a run''s product_revenue, else the hand-worked row under the same paper, else the bill as its closed month froze it, plus drops/upsells already confirmed or dismissed) becomes one pending comm_upsales row per document in the current month. Never raises.';

-- ─── 5. The receiver ────────────────────────────────────────────────────────

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
    'The ERP live feed''s one write: upserts one sales order (canonical shape from src/lib/erp-sync/contract.ts) into its month''s erp_sync batch, replaces its lines, re-derives the day''s Open Bill suggestions, refreshes the batch counters and logs the outcome. A new order lands in its order date''s month; a re-sent order that has a fair keeps the month it is in (only the fair calendar moves it), one without a fair follows its order date. A month that is closed to the feed (erp_feed_closed_months, or before comm_cutovers) or whose run has paid holds the delivery, payload kept, until it is reopened and replayed — and what changed on a settled bill becomes a pending drop or upsell (erp_sync_note_adjustment). Never raises for a business outcome — see erp_sync_events.status.';

-- ─── 6. The member app counts a settled month where it was settled ──────────

CREATE OR REPLACE FUNCTION public.member_order_facts(p_scheme uuid,p_from date,p_until date)
RETURNS TABLE(
 order_id uuid,staff_id uuid,order_no text,order_date date,source_period date,
 recognition_month date,brand text,cleared boolean,revenue numeric,
 goods_revenue numeric,margin_pct numeric,kpi_qty numeric,manual boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scheme AS (
  SELECT c.*,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS today,
   public.comm_first_paid_month(c.sub_department_id) AS first_paid,
   date_trunc('month',now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS current_month
  FROM public.comm_schemes c WHERE c.id=p_scheme
 ), sources AS (
  -- Resolve the newest committed document BEFORE checking owner, cancellation
  -- or order date, so an older imported version can never be revived.
  SELECT DISTINCT ON (so.order_no) so.* FROM public.sales_orders so
  JOIN public.sales_import_batches ib ON ib.id=so.batch_id
  JOIN scheme c ON c.sub_department_id=ib.sub_department_id
  WHERE ib.status='committed' AND so.period_month<=c.current_month
  ORDER BY so.order_no,so.created_at DESC,so.id
 ), scoped AS (
  SELECT so.*,c.enable_kpi,
   -- (20260926020000) A month before the portal pays was settled by hand: its
   -- bills are recognised in their own month and never carried into ours.
   coalesce(r.period_month,CASE WHEN so.period_month<c.first_paid THEN so.period_month ELSE c.current_month END) AS recognition,
   -- The Revenue Team cost basis. Guarded the way marginBase() guards it: a
   -- missing or nonsense divisor divides by one rather than erasing the cost.
   CASE WHEN coalesce(c.revenue_cost_divisor,0)>0 THEN c.revenue_cost_divisor ELSE 1 END AS cost_divisor,
   r.id IS NOT NULL OR coalesce(so.period_month<c.first_paid,false)
    OR c.deposit_threshold_pct IS NULL OR so.order_total<=0
    OR so.paid_amount+0.005>=round(so.order_total*c.deposit_threshold_pct,2) AS is_cleared
  FROM sources so CROSS JOIN scheme c
  LEFT JOIN public.comm_order_releases r ON r.order_no=so.order_no AND r.sub_department_id=c.sub_department_id
  WHERE NOT so.cancelled AND so.order_date<=c.today
 ), line_scope AS (
  SELECT o.id,o.staff_id,o.order_no,o.order_date,o.period_month,o.recognition,
   o.brand_code,o.is_cleared,o.manual_margin_pct,o.cost_divisor,l.line_amount,l.cost_amount,l.qty,
   EXISTS(SELECT 1 FROM public.comm_item_groups g WHERE g.scheme_id=p_scheme
    AND upper(btrim(g.item_group))=upper(btrim(l.item_group)) AND g.commissionable) AS is_goods,
   o.enable_kpi AND EXISTS(SELECT 1 FROM public.comm_kpi_items k WHERE k.scheme_id=p_scheme
    AND upper(btrim(k.product_code))=upper(btrim(l.product_code))
    AND k.effective_from<=(o.recognition+interval '1 month - 1 day')::date
    AND (k.effective_to IS NULL OR k.effective_to>=(o.recognition+interval '1 month - 1 day')::date)) AS is_kpi
  FROM scoped o JOIN public.sales_order_lines l ON l.order_id=o.id
  WHERE (p_from IS NULL OR o.recognition>=p_from) AND (p_until IS NULL OR o.recognition<p_until)
 )
 SELECT l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
  coalesce(nullif(btrim(l.brand_code),''),'UNCLASSIFIED'),l.is_cleared,sum(l.line_amount),
  coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0),
  CASE WHEN coalesce(sum(l.line_amount) FILTER(WHERE l.is_goods),0)<=0 THEN NULL
   WHEN l.manual_margin_pct IS NOT NULL THEN l.manual_margin_pct
   WHEN bool_and(l.cost_amount IS NOT NULL) FILTER(WHERE l.is_goods)
    -- Layer 2: the cost the salesperson is measured on, not the invoice cost.
    THEN 1-(sum(l.cost_amount/l.cost_divisor) FILTER(WHERE l.is_goods))/(sum(l.line_amount) FILTER(WHERE l.is_goods)) END,
  sum(CASE WHEN l.is_kpi THEN l.qty ELSE 0 END),l.manual_margin_pct IS NOT NULL
 FROM line_scope l WHERE l.is_goods OR l.is_kpi
 GROUP BY l.id,l.staff_id,l.order_no,l.order_date,l.period_month,l.recognition,
  l.brand_code,l.is_cleared,l.manual_margin_pct;
$$;

COMMENT ON FUNCTION public.member_order_facts(uuid,date,date) IS
 'One private document-facts calculation for Insight, Arena and recent Income orders. Margin is the REVENUE TEAM margin - cost divided by comm_schemes.revenue_cost_divisor, the same basis the engine pays on - because the company''s own margin is not the salesperson''s to see. A bill of a month before the portal pays (comm_cutovers) is recognised in its own month as settled. Authorization stays in the public/member entry points.';

-- ─── 7. A paid month keeps what it paid — and only that ─────────────────────
--
-- The guard of 20260924060000, narrowed to what a run pays: a CONFIRMED row.
-- A pending drop or upsell was never paid, so a run that has paid since must
-- not freeze it — it is confirmed into the month HR is working on, or
-- dismissed.

CREATE OR REPLACE FUNCTION comm_upsales_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    -- What a run paid is what these rows said when it paid. Same refusal as
    -- moving, sharing or recosting a bill in that month.
    IF TG_OP IN ('UPDATE', 'DELETE')
       AND OLD.status = 'confirmed'
       AND commission_order_period_locked(OLD.sub_department_id, OLD.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing its upsales and drops.',
            TO_CHAR(OLD.period_month, 'Mon YYYY')
            USING ERRCODE = '23RUN';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND NEW.status = 'confirmed'
       AND commission_order_period_locked(NEW.sub_department_id, NEW.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before recording an upsale or drop in it.',
            TO_CHAR(NEW.period_month, 'Mon YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at := NOW();
        NEW.updated_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$fn$;

-- ─── 8. Who may call what ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION comm_first_paid_month(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION comm_set_first_paid_month(UUID, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION comm_clear_first_paid_month(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION erp_sync_note_adjustment(UUID, JSONB, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION comm_first_paid_month(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION comm_set_first_paid_month(UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION comm_clear_first_paid_month(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_sync_note_adjustment(UUID, JSONB, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
