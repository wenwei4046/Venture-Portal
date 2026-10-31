-- Production's bodies as they ran on 2026-10-31 (20:24), before 20261031210000_open_bill_gone — read with
-- pg_get_functiondef through the Supabase CLI (never retyped); each body's md5 is production's.
-- Loaded by tests/member-sql/validate-open-bill-gone.mjs.

-- commit_sales_import_batch() md5 28be945a8451c7196269d747e155dc90
CREATE OR REPLACE FUNCTION public.commit_sales_import_batch(p_batch_id uuid, p_suggest_open_bills boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_batch sales_import_batches%ROWTYPE; v_open_bill BOOLEAN; v_suggested INTEGER := 0;
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.has_any_action(ARRAY['revenue.create']) THEN RAISE EXCEPTION 'commit_sales_import_batch: needs Revenue · Create' USING ERRCODE = '42501';
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

    -- (20260926030000) The month's own Open Bill setting, not the scheme's.
    v_open_bill := comm_open_bill_on(v_batch.sub_department_id, v_batch.period_month);
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
$function$
;

-- ingest_erp_sales_order() md5 400c57fc7e3479f07bb401e18ede78b7
CREATE OR REPLACE FUNCTION public.ingest_erp_sales_order(p_order jsonb, p_replay_of uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    -- (20261012200000) A late key-in whose sale month is paid or closed.
    v_sold_in       DATE;
    v_sold_why      TEXT;
    v_try           DATE;
    -- (20261013010000) What the portal knew of the document before this delivery.
    v_before        JSONB;
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
    -- (20261013010000) The ERP audit trail compares this delivery with it.
    v_before := erp_sync_known_state(v_sub_id, v_doc_no, CASE WHEN v_found THEN v_existing.id END);
    PERFORM lock_commission_order_periods(v_sub_id, ARRAY[
        CASE WHEN v_found THEN v_existing.period_month END, date_trunc('month', v_order_date)::DATE,
        date_trunc('month', v_sale_day)::DATE]);

    -- ── Ordering guard ─────────────────────────────────────────────────────
    IF v_found AND v_snapshot IS NOT NULL AND v_existing.erp_snapshot_at IS NOT NULL THEN
        IF v_snapshot = v_existing.erp_snapshot_at THEN
            RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_existing.period_month, 'duplicate',
                                'same snapshot already applied', '{}', v_snapshot, NULL, p_replay_of), v_before);
        ELSIF v_snapshot < v_existing.erp_snapshot_at THEN
            RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_existing.period_month, 'stale',
                                'a newer snapshot is already applied', '{}', v_snapshot, NULL, p_replay_of), v_before);
        END IF;
    END IF;

    -- ── Deleted in the ERP ─────────────────────────────────────────────────
    IF v_deleted THEN
        IF NOT v_found THEN
            RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, NULL, 'skipped', 'deleted before the portal ever saw it',
                                '{}', v_snapshot, NULL, p_replay_of), v_before);
        END IF;
        IF erp_sync_period_locked(v_existing.period_month) THEN
            v_result := erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                                'deleted in the ERP after the month''s run was applied — reopen the run and replay',
                                '{}', v_snapshot, p_order, p_replay_of);
            -- (20260926020000) What the paid bill loses is a drop.
            PERFORM erp_sync_note_adjustment(v_existing.id, p_order, (v_result->>'eventId')::UUID);
            RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, v_result, v_before);
        END IF;
        -- (20260926010000) A month closed to the feed keeps its bills as they are.
        IF erp_sync_period_closed(v_existing.period_month) THEN
            v_result := erp_sync_log(v_doc_no, v_existing.period_month, 'held',
                                'deleted in the ERP while the month is closed to the feed — reopen it and replay',
                                '{}', v_snapshot, p_order, p_replay_of);
            -- (20260926020000) What the settled bill loses is a drop.
            PERFORM erp_sync_note_adjustment(v_existing.id, p_order, (v_result->>'eventId')::UUID);
            RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, v_result, v_before);
        END IF;
        UPDATE sales_orders
           SET cancelled = TRUE, erp_status = 'DELETED', erp_snapshot_at = v_snapshot,
               synced_at = NOW(), sequence_in_day = NULL
         WHERE id = v_existing.id;
        DELETE FROM sales_order_open_bill_tags WHERE order_id = v_existing.id AND auto_suggested;
        PERFORM erp_sync_resequence_day(v_existing.agent_key, v_existing.event_date);
        PERFORM erp_sync_suggest_open_bills(v_existing.staff_id, v_existing.event_date);
        PERFORM erp_sync_refresh_batch(v_existing.batch_id);
        RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_existing.period_month, 'applied', 'excluded: deleted in the ERP',
                            '{}', v_snapshot, NULL, p_replay_of), v_before);
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
        RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_period, 'skipped', 'draft — not a sale yet',
                            '{}', v_snapshot, NULL, p_replay_of), v_before);
    END IF;

    -- ── A late key-in lands in a month still open (20261012200000) ─────────
    -- The user, 2026-10-12: a bill keyed after its fair's month "will go in
    -- the table as well … commission will jump to the same month, then show
    -- up with different colour"; then "can go for b". A NEW document whose
    -- sale day's month is already paid (its run applied or locked) or closed
    -- to the feed (by hand, or before the cutover) was held where nobody saw
    -- it — in no month's table, the Revenue app or the Arena, paid to nobody.
    -- It now lands in the first month still open from the month it was keyed
    -- in (its order date's; never the sale month or before, never past the
    -- office's own month), where Comm Cal marks it Late key-in · Sep 2026 fair
    -- and pays it with that month; a bill already paid by hand is the Double
    -- claims tab's and *Don't count*'s. No month open: held, as before. A bill
    -- already in the portal never moves this way: its re-sends keep the month
    -- it is in (a bill with a fair keeps its month, above).
    IF NOT v_found AND (erp_sync_period_locked(v_period) OR erp_sync_period_closed(v_period)) THEN
        v_sold_why := CASE WHEN erp_sync_period_locked(v_period) THEN 'paid' ELSE 'closed to the ERP feed' END;
        v_try := GREATEST(DATE_TRUNC('month', v_order_date)::DATE, (v_period + INTERVAL '1 month')::DATE);
        WHILE v_try <= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::DATE)::DATE LOOP
            -- Each month's lock in calendar order, as every writer takes them.
            PERFORM lock_commission_order_periods(v_sub_id, ARRAY[v_try]);
            IF NOT erp_sync_period_locked(v_try) AND NOT erp_sync_period_closed(v_try) THEN
                v_sold_in := v_period;
                v_period := v_try;
                EXIT;
            END IF;
            v_try := (v_try + INTERVAL '1 month')::DATE;
        END LOOP;
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
        RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, v_result, v_before);
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
        RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, v_result, v_before);
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
            RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_period, 'applied',
                                'removed: re-dated before the feed window (' || v_floor || ')',
                                '{}', v_snapshot, NULL, p_replay_of), v_before);
        END IF;
        RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_period, 'skipped',
                            'dated before the feed window (' || v_floor || ')',
                            '{}', v_snapshot, NULL, p_replay_of), v_before);
    END IF;

    -- (20260926010000) Nor may a delivery bring a bill INTO a closed month —
    -- a new document dated in it, or a bill re-dated into it. Checked after
    -- the feed window, so a document the portal would never keep is still
    -- answered skipped rather than held.
    IF erp_sync_period_closed(v_period) THEN
        RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_period, 'held',
                            'the month is closed to the ERP feed — reopen it and replay',
                            '{}', v_snapshot, p_order, p_replay_of), v_before);
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
        RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, erp_sync_log(v_doc_no, v_period, 'held',
                            'the month was imported from a file — retire that import to let the live feed own it',
                            '{}', v_snapshot, p_order, p_replay_of), v_before);
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
        -- (20261013010000) Written, not held: whether a drop or an upsell still
        -- waits on this document is erp_sync_after_delivery's to say — a bill a
        -- salesperson's close paid asks even though its month is open.
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
                                  WHEN v_found THEN 'updated' ELSE 'created' END
                             -- (20261012200000)
                             || CASE WHEN v_sold_in IS NULL THEN ''
                                     ELSE ' — keyed late: sold in ' || TO_CHAR(v_sold_in, 'FMMonth YYYY') || ', which is '
                                          || v_sold_why || ', so it counts in ' || TO_CHAR(v_period, 'FMMonth YYYY') END,
                             v_warnings, v_snapshot, NULL, p_replay_of);
    RETURN erp_sync_after_delivery(v_sub_id, v_doc_no, p_order, v_result || JSONB_BUILD_OBJECT('orderId', v_order_id), v_before);
END;
$function$
;

-- match_erp_salesperson() md5 54d8c49d60e1338179c3c72264c520d7
CREATE OR REPLACE FUNCTION public.match_erp_salesperson(p_agent_key text, p_erp_salesperson_id text, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_key      TEXT := UPPER(REGEXP_REPLACE(BTRIM(COALESCE(p_agent_key, '')), '\s+', ' ', 'g'));
    v_sp_id    TEXT := NULLIF(BTRIM(p_erp_salesperson_id), '');
    v_sub      UUID;
    v_sample   TEXT;
    v_orders   INTEGER := 0;
    v_locked_orders INTEGER := 0;
    v_locked   DATE[];
    v_dates    DATE[];
    r          RECORD;
BEGIN
    IF v_key = '' AND v_sp_id IS NULL THEN
        RAISE EXCEPTION 'Nothing to match on';
    END IF;
    IF p_staff_id IS NULL THEN
        RAISE EXCEPTION 'Pick a salesperson';
    END IF;
    v_sub := erp_sync_sub_department();

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

    -- Which of this name's months can still move. Asked once per month, not
    -- once per order: three years of back-fill is 26 months and 207 orders.
    SELECT COALESCE(ARRAY_AGG(m) FILTER (WHERE commission_order_period_locked(v_sub, m)), '{}')
      INTO v_locked
      FROM (SELECT DISTINCT period_month AS m
              FROM sales_orders
             WHERE source = 'erp_sync'
               AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))) months;

    UPDATE sales_orders SET staff_id = p_staff_id
     WHERE source = 'erp_sync' AND staff_id IS NULL
       AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
       AND period_month <> ALL (v_locked);
    GET DIAGNOSTICS v_orders = ROW_COUNT;

    -- What stayed behind, and why the person may still be on the list.
    SELECT COUNT(*) INTO v_locked_orders
      FROM sales_orders
     WHERE source = 'erp_sync' AND staff_id IS NULL
       AND (agent_key = v_key OR (v_sp_id IS NOT NULL AND erp_salesperson_id = v_sp_id))
       AND period_month = ANY (v_locked);

    SELECT COALESCE(ARRAY_AGG(DISTINCT o.event_date), '{}') INTO v_dates
      FROM sales_orders o
     WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
       AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
       AND o.period_month <> ALL (v_locked);

    PERFORM erp_sync_suggest_open_bill_days(p_staff_id, v_dates);

    FOR r IN
        SELECT DISTINCT o.batch_id
          FROM sales_orders o
         WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
           AND (o.agent_key = v_key OR (v_sp_id IS NOT NULL AND o.erp_salesperson_id = v_sp_id))
           AND o.period_month <> ALL (v_locked)
    LOOP
        PERFORM erp_sync_refresh_batch(r.batch_id);
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('ordersMatched', v_orders, 'ordersLocked', v_locked_orders);
END;
$function$
;

-- member_data_snapshot() md5 f5568e775511d6bae5326a71faa3e2e7
CREATE OR REPLACE FUNCTION public.member_data_snapshot(p_full boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_staff uuid:=public.member_staff_id(); v_profile jsonb; v_memberships jsonb; v_departments jsonb; v_products jsonb; v_bands jsonb;
 v_incomes jsonb; v_orders jsonb; v_requests jsonb; v_memos jsonb; v_catalogue jsonb; v_today date:=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 SELECT jsonb_build_object('id',s.id,'userId',u.id,'name',s.employee_name,'firstName',coalesce(nullif(btrim(s.first_name),''),(public.person_name_parts(s.employee_name)).first_name),'email',u.email,'salary',s.basic_salary)
 INTO v_profile FROM public.hr_staff_costs s JOIN public.users u ON u.id=s.user_id WHERE s.id=v_staff;
 -- Public department directory permits Fair members to request IR transfers
 -- without exposing another department's roster or personal finances.
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'capacity',cap.headcount_limit,
 'occupied',public.member_occupied(d.id,v_today)) ORDER BY d.created_at,d.id),'[]')
 INTO v_departments FROM public.comm_sub_departments d JOIN public.hr_staff_costs s ON s.department_id=d.department_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id WHERE s.id=v_staff AND d.is_active;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
 'title',coalesce(t.name,'Title 待配置'),'rank',coalesce(r.label,'Rank 待配置'),'rate',coalesce(r.product_rate,0),
 'calculator',(upper(d.code)='FAIR' OR lower(d.name)='fair') AND public.has_perm('member_quote'),
 'effective',h.effective_from,'capacity',cap.headcount_limit,'occupied',public.member_occupied(d.id,v_today),
 'people',public.member_tree_json(c.id,v_staff)) ORDER BY d.created_at,d.id),'[]') INTO v_memberships
 FROM public.comm_hierarchy h JOIN public.comm_schemes c ON c.id=h.scheme_id JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 LEFT JOIN public.comm_ranks r ON r.id=h.rank_id LEFT JOIN public.titles t ON t.id=h.title_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE h.staff_id=v_staff AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
 AND d.is_active AND c.is_active AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today);
 v_memberships:=v_memberships||(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
 'title',coalesce(t.name,'Revenue Director'),'rank',coalesce(r.label,''),'rate',coalesce(r.product_rate,0),
 'calculator',(upper(d.code)='FAIR' OR lower(d.name)='fair') AND public.has_perm('member_quote'),
 'effective',c.effective_from,'capacity',cap.headcount_limit,'occupied',public.member_occupied(d.id,v_today),
 'people',public.member_tree_json(c.id,v_staff),'director',true) ORDER BY d.created_at,d.id),'[]'::jsonb)
 FROM public.comm_sub_department_directors x
 JOIN public.comm_sub_departments d ON d.id=x.sub_department_id
 JOIN public.comm_schemes c ON c.id=public.member_director_scheme(x.staff_id,x.sub_department_id)
 JOIN public.hr_staff_costs s ON s.id=x.staff_id
 LEFT JOIN public.titles t ON t.id=s.title_id
 LEFT JOIN LATERAL (SELECT dr.label,dr.product_rate FROM public.comm_ranks dr WHERE dr.scheme_id=c.id AND dr.title_id=s.title_id ORDER BY dr.sort_order DESC,dr.id LIMIT 1) r ON true
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE x.staff_id=v_staff AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) m WHERE m->>'id'=d.id::text));

 -- The calculator's catalogue (2026-09-24): what Product List › Modular offers
 -- for the brands a calculator membership sells, plus the riders. No price.
 IF p_full THEN
 v_catalogue := public.member_catalogue(ARRAY(SELECT DISTINCT b.code FROM jsonb_array_elements(v_memberships) m
  JOIN public.comm_brands b ON b.scheme_id=(m->>'schemeId')::uuid WHERE (m->>'calculator')::boolean), NULL, false, 0);
 v_products := v_catalogue->'products';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.code,'key',m.label,'kind',m.kind,
 'threshold',m.margin_pct*100,'multiplier',m.commission_multiplier,'amount',m.monthly_incentive)),'[]') INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) x WHERE (x->>'schemeId')::uuid=m.scheme_id AND (x->>'calculator')::boolean);

 SELECT coalesce(jsonb_agg(x.payload ORDER BY x.period DESC),'[]') INTO v_incomes FROM (
 SELECT r.period_month AS period,jsonb_build_object('schemeId',r.scheme_id,'period',to_char(r.period_month,'YYYY-MM'),
 'status',r.status,'personal',s.product_commission,'override',s.override_commission,'kpi',s.kpi_commission,
 'openBill',s.open_bill_bonus,'incentive',s.margin_incentive,'group',s.group_incentive,'total',s.total_commission,
 'sales',s.product_revenue,'groupSales',s.group_revenue,'deferred',s.deferred_revenue,
 'rank',coalesce(cr.label,s.rank_key,'Rank 待配置'),'rate',s.product_rate,
 'kpis',jsonb_build_array(jsonb_build_object('label','个人销售','current',s.product_revenue,'target',cr.personal_sales_threshold,'unit','RM'),
 jsonb_build_object('label','团队销售','current',s.group_revenue,'target',cr.group_sales_threshold,'unit','RM'))
 || CASE WHEN c.enable_kpi THEN jsonb_build_array(jsonb_build_object('label','KPI 商品','current',s.kpi_qty,'target',
 (SELECT min(k.min_qty) FROM public.comm_kpi_thresholds k WHERE k.scheme_id=c.id AND k.min_qty>s.kpi_qty),'unit','件')) ELSE '[]'::jsonb END,
 'brands',(SELECT coalesce(jsonb_agg(jsonb_build_object('brand',b.brand_code,'margin',b.margin_pct*100,'revenue',b.revenue,'tier',b.top_band_key)),'[]')
 FROM public.comm_statement_brand_margins b WHERE b.statement_id=s.id)) AS payload
 FROM public.comm_statements s JOIN public.comm_runs r ON r.id=s.run_id JOIN public.comm_schemes c ON c.id=r.scheme_id
 LEFT JOIN public.comm_ranks cr ON cr.scheme_id=r.scheme_id AND cr.rank_key=s.rank_key
 WHERE s.staff_id=v_staff AND r.period_month>=date_trunc('month',v_today)-interval '12 months'
 ) x;

 IF p_full THEN
 -- Recent own Fair orders retain their source-month window and 200-row cap.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',f.order_id,'number',f.order_no,'brand',f.brand,'revenue',f.revenue,
  'marginRevenue',f.goods_revenue,'margin',f.margin_pct*100,'date',f.order_date,'manual',f.manual
 ) ORDER BY f.order_date DESC,f.order_no DESC),'[]'::jsonb) INTO v_orders
 FROM (
  SELECT facts.* FROM public.comm_sub_departments d
  JOIN LATERAL (
   SELECT c.id FROM public.comm_schemes c WHERE c.sub_department_id=d.id AND c.is_active
    AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today)
    AND EXISTS(SELECT 1 FROM public.comm_hierarchy h WHERE h.scheme_id=c.id AND h.staff_id=v_staff
     AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today))
   ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1
  ) scheme ON true
  CROSS JOIN LATERAL public.member_order_facts(scheme.id,NULL,NULL) facts
  WHERE d.is_active AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
   AND public.member_has_membership(v_staff,d.id) AND facts.staff_id=v_staff
   AND facts.source_period>=date_trunc('month',v_today)-interval '1 month'
  ORDER BY facts.order_date DESC,facts.order_no DESC LIMIT 200
 ) f;
 END IF;

 IF public.has_perm('member_requests') THEN
 SELECT coalesce(jsonb_agg(public.member_request_json(r.id) ORDER BY r.created_at DESC),'[]') INTO v_requests
 FROM public.member_requests r WHERE r.created_by=auth.uid() AND r.status<>'draft';
 END IF;
 IF public.has_perm('member_memos') THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'sender',m.sender,
 'publishedAt',m.published_at,'effectiveAt',m.effective_at,'version',m.version,'requiresAck',m.requires_ack,
 'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at,'kind',m.kind,'attachmentName',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_name END,'attachmentType',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_type END,'departments',(SELECT coalesce(jsonb_agg(d.name),'[]'::jsonb) FROM public.member_memo_audiences a
 JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id)) ORDER BY m.published_at DESC),'[]') INTO v_memos
 FROM public.member_memos m LEFT JOIN public.member_memo_receipts r ON r.memo_id=m.id AND r.user_id=auth.uid() AND r.version=m.version
 WHERE public.member_visible_memo(m.id,v_staff);
 END IF;
 RETURN jsonb_build_object('demo',false,'configured',true,'refreshedAt',now(),'profile',v_profile,
 'memberships',v_memberships,'departments',v_departments,'products',v_products,
 'catalogueModels',coalesce(v_catalogue->'models','[]'::jsonb),'bands',v_bands,'incomes',v_incomes,
 'orders',v_orders,'requests',coalesce(v_requests,'[]'),'memos',coalesce(v_memos,'[]'));
END $function$
;

-- member_principal_snapshot() md5 cff3805f5798d456ec36a7189f84096d
CREATE OR REPLACE FUNCTION public.member_principal_snapshot(p_full boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_profile jsonb;
 v_memberships jsonb;
 v_departments jsonb;
 v_products jsonb;
 v_bands jsonb;
 v_incomes jsonb;
 v_orders jsonb;
 v_requests jsonb;
 v_memos jsonb;
 v_catalogue jsonb;
 v_today date := (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date;
BEGIN
 SELECT jsonb_build_object(
  'id',u.id,'userId',u.id,'name',coalesce(nullif(u.name,''),'Principal'),'firstName',coalesce((SELECT nullif(btrim(fs.first_name),'') FROM public.hr_staff_costs fs WHERE fs.user_id=u.id AND fs.status='active' ORDER BY fs.created_at LIMIT 1),(public.person_name_parts(coalesce(nullif(u.name,''),'Principal'))).first_name),
  'email',coalesce(u.email,''),'salary',NULL
 ) INTO v_profile
 FROM public.users u
 WHERE u.id=auth.uid() AND u.role='principal' AND u.is_active;
 IF v_profile IS NULL THEN
  RAISE EXCEPTION 'An active Principal account is required' USING ERRCODE='42501';
 END IF;

 -- Include departments without a roster or staff-account links. A current
 -- scheme supplies the valid quotation/routing identity for an empty roster.
 WITH positions AS (
  SELECT DISTINCT c.sub_department_id,h.staff_id
  FROM public.comm_hierarchy h
  JOIN public.comm_schemes c ON c.id=h.scheme_id
  JOIN public.hr_staff_costs s ON s.id=h.staff_id
  WHERE c.is_active AND c.effective_from<=v_today
  AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  AND h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
  AND s.status='active' AND (s.hire_date IS NULL OR s.hire_date<=v_today)
  AND (s.resignation_date IS NULL OR s.resignation_date>=v_today)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'name',d.name,'capacity',cap.headcount_limit,
  'occupied',(SELECT count(*) FROM positions p WHERE p.sub_department_id=d.id)
 ) ORDER BY d.created_at,d.id),'[]'::jsonb) INTO v_departments
 FROM public.comm_sub_departments d
 JOIN public.departments department ON department.id=d.department_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE d.is_active AND department.payroll_source='commission';

 WITH positions AS (
  SELECT h.*,s.employee_name
  FROM public.comm_hierarchy h JOIN public.hr_staff_costs s ON s.id=h.staff_id
  WHERE h.effective_from<=v_today AND (h.effective_to IS NULL OR h.effective_to>=v_today)
  AND s.status='active' AND (s.hire_date IS NULL OR s.hire_date<=v_today)
  AND (s.resignation_date IS NULL OR s.resignation_date>=v_today)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'schemeId',c.id,'name',d.name,'code',coalesce(d.code,d.name),
  'title','Principal','rank','All members','rate',0,
  'calculator',coalesce(upper(d.code)='FAIR' OR lower(d.name)='fair',false),
  'effective',c.effective_from,'capacity',cap.headcount_limit,
  'occupied',coalesce((SELECT (x->>'occupied')::integer
   FROM jsonb_array_elements(v_departments) x WHERE x->>'id'=d.id::text),0),
  'people',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',h.staff_id,'name',h.employee_name,
   'title',coalesce(t.name,'Title pending'),'rank',coalesce(r.label,'Rank pending'),
   'parentId',CASE WHEN EXISTS(SELECT 1 FROM positions parent
    WHERE parent.scheme_id=c.id AND parent.staff_id=h.upline_staff_id) THEN h.upline_staff_id END,
   'self',false
  ) ORDER BY h.employee_name,h.staff_id),'[]'::jsonb)
   FROM positions h LEFT JOIN public.titles t ON t.id=h.title_id
   LEFT JOIN public.comm_ranks r ON r.id=h.rank_id WHERE h.scheme_id=c.id)
  ||(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',ds.id,'name',ds.employee_name,
   'title',coalesce(dt.name,'Revenue Director'),'rank',coalesce(dr.label,''),
   'parentId',NULL,'self',false,'director',true
  ) ORDER BY ds.employee_name,ds.id),'[]'::jsonb)
   FROM public.comm_sub_department_directors dd
   JOIN public.hr_staff_costs ds ON ds.id=dd.staff_id
   LEFT JOIN public.titles dt ON dt.id=ds.title_id
   LEFT JOIN LATERAL (SELECT x.label FROM public.comm_ranks x WHERE x.scheme_id=c.id AND x.title_id=ds.title_id
    ORDER BY x.sort_order DESC,x.id LIMIT 1) dr ON true
   WHERE dd.sub_department_id=d.id AND public.member_director_scheme(dd.staff_id,d.id)=c.id
    AND NOT EXISTS(SELECT 1 FROM positions seat WHERE seat.scheme_id=c.id AND seat.staff_id=dd.staff_id))
 ) ORDER BY d.created_at,d.id,c.effective_from DESC,c.id),'[]'::jsonb) INTO v_memberships
 FROM public.comm_schemes c
 JOIN public.comm_sub_departments d ON d.id=c.sub_department_id
 JOIN public.departments department ON department.id=d.department_id
 LEFT JOIN public.member_department_capacity cap ON cap.sub_department_id=d.id
 WHERE department.payroll_source='commission' AND d.is_active AND c.is_active
 AND c.effective_from<=v_today AND (c.effective_to IS NULL OR c.effective_to>=v_today);

 -- The calculator's catalogue (2026-09-24), exactly what a member sees: no
 -- price, even for the Principal's Revenue View.
 IF p_full THEN
 v_catalogue := public.member_catalogue(ARRAY(SELECT DISTINCT b.code FROM jsonb_array_elements(v_memberships) x
  JOIN public.comm_brands b ON b.scheme_id=(x->>'schemeId')::uuid
  WHERE (x->>'calculator')::boolean AND b.is_active), NULL, false, 0);
 v_products := v_catalogue->'products';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'brand',b.code,'key',m.label,'kind',m.kind,'threshold',m.margin_pct*100,
  'multiplier',m.commission_multiplier,'amount',m.monthly_incentive
 ) ORDER BY b.code,m.margin_pct,m.id),'[]'::jsonb) INTO v_bands
 FROM public.comm_margin_bands m JOIN public.comm_brands b ON b.id=m.brand_id
 WHERE b.is_active AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_memberships) x
  WHERE (x->>'schemeId')::uuid=m.scheme_id AND (x->>'calculator')::boolean);

 -- Each department has one run per month; each run has one statement per
 -- staff member. Select the latest run per scheme/month explicitly, then sum
 -- those statements once. group_revenue includes downlines and MUST NOT be
 -- added across staff. Team sales is the sum of personal product_revenue.
 -- Rank targets and statement brand margins are not additive team metrics.
 WITH latest_runs AS (
  SELECT DISTINCT ON (r.scheme_id,r.period_month) r.*
  FROM public.comm_runs r
  JOIN public.comm_sub_departments d ON d.id=r.sub_department_id
  JOIN public.departments department ON department.id=d.department_id
  WHERE department.payroll_source='commission'
  AND r.period_month>=date_trunc('month',v_today)-interval '12 months'
  ORDER BY r.scheme_id,r.period_month,r.created_at DESC,r.id DESC
 ), totals AS (
  SELECT r.id,r.scheme_id,r.period_month,r.status,
   sum(s.product_commission) AS personal,sum(s.override_commission) AS override_amount,
   sum(s.kpi_commission) AS kpi,sum(s.open_bill_bonus) AS open_bill,
   sum(s.margin_incentive) AS incentive,sum(s.group_incentive) AS group_amount,
   sum(s.total_commission) AS total,sum(s.product_revenue) AS sales,
   sum(s.deferred_revenue) AS deferred,sum(s.kpi_qty) AS kpi_qty
  FROM latest_runs r JOIN public.comm_statements s ON s.run_id=r.id
  GROUP BY r.id,r.scheme_id,r.period_month,r.status
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'schemeId',s.scheme_id,'period',to_char(s.period_month,'YYYY-MM'),'status',s.status,
  'personal',s.personal,'override',s.override_amount,'kpi',s.kpi,'openBill',s.open_bill,
  'incentive',s.incentive,'group',s.group_amount,'total',s.total,
  'sales',s.sales,'groupSales',s.sales,'deferred',s.deferred,'rank','All members','rate',0,
  'kpis',jsonb_build_array(jsonb_build_object(
   'label','Team sales','current',s.sales,'target',NULL,'unit','RM'
  )) || CASE WHEN c.enable_kpi THEN jsonb_build_array(jsonb_build_object(
   'label','KPI products','current',s.kpi_qty,'target',NULL,'unit','items'
  )) ELSE '[]'::jsonb END,
  'brands','[]'::jsonb
 ) ORDER BY s.period_month DESC,s.scheme_id),'[]'::jsonb) INTO v_incomes
 FROM totals s JOIN public.comm_schemes c ON c.id=s.scheme_id;

 IF p_full THEN
 -- Recent Fair orders preserve the source-month window and actual Principal
 -- scope, while using the same latest-document and goods-margin facts as Insight.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',f.order_id,'schemeId',scheme.id,'number',f.order_no,'brand',f.brand,'revenue',f.revenue,
  'marginRevenue',f.goods_revenue,'margin',f.margin_pct*100,'date',f.order_date,'manual',f.manual
 ) ORDER BY f.order_date DESC,f.order_id),'[]'::jsonb) INTO v_orders
 FROM public.comm_sub_departments d
 JOIN public.departments department ON department.id=d.department_id
 JOIN LATERAL (
  SELECT c.id FROM public.comm_schemes c
  WHERE c.sub_department_id=d.id AND c.is_active AND c.effective_from<=v_today
   AND (c.effective_to IS NULL OR c.effective_to>=v_today)
  ORDER BY c.effective_from DESC,c.created_at DESC,c.id LIMIT 1
 ) scheme ON true
 CROSS JOIN LATERAL public.member_order_facts(scheme.id,NULL,NULL) f
 WHERE d.is_active AND department.payroll_source='commission'
  AND (upper(d.code)='FAIR' OR lower(d.name)='fair')
  AND f.source_period>=date_trunc('month',v_today)-interval '1 month';
 END IF;

 SELECT coalesce(jsonb_agg(public.member_request_json(r.id)
  ORDER BY r.created_at DESC,r.id),'[]'::jsonb) INTO v_requests
 FROM public.member_requests r
 JOIN public.comm_sub_departments d ON d.id=r.sub_department_id
 JOIN public.departments department ON department.id=d.department_id
 WHERE r.status<>'draft' AND department.payroll_source='commission';

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'title',m.title,'body',m.body,'sender',m.sender,
  'publishedAt',m.published_at,'effectiveAt',m.effective_at,
  'version',m.version,'requiresAck',m.requires_ack,
  'readAt',receipt.read_at,'acknowledgedAt',receipt.acknowledged_at,'kind',m.kind,'attachmentName',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_name END,'attachmentType',CASE WHEN m.attachment_path IS NOT NULL AND m.attachment_deleted_at IS NULL THEN m.attachment_type END,
  'departments',(SELECT coalesce(jsonb_agg(d.name ORDER BY d.name),'[]'::jsonb)
   FROM public.member_memo_audiences a
   JOIN public.comm_sub_departments d ON d.id=a.sub_department_id WHERE a.memo_id=m.id),
  'recipients',(SELECT coalesce(jsonb_agg(x.staff_id ORDER BY x.staff_id),'[]'::jsonb)
   FROM public.member_memo_recipients x WHERE x.memo_id=m.id)
 ) ORDER BY m.published_at DESC,m.id),'[]'::jsonb) INTO v_memos
 FROM public.member_memos m
 LEFT JOIN public.member_memo_receipts receipt
  ON receipt.memo_id=m.id AND receipt.user_id=auth.uid() AND receipt.version=m.version
 WHERE EXISTS(SELECT 1 FROM public.member_memo_audiences a
  JOIN public.comm_sub_departments d ON d.id=a.sub_department_id
  JOIN public.departments department ON department.id=d.department_id
  WHERE a.memo_id=m.id AND department.payroll_source='commission')
  OR EXISTS(SELECT 1 FROM public.member_memo_recipients x
  JOIN public.hr_staff_costs s ON s.id=x.staff_id
  JOIN public.departments dd ON dd.id=s.department_id
  WHERE x.memo_id=m.id AND dd.payroll_source='commission');

 RETURN jsonb_build_object(
  'demo',false,'configured',true,'principalView',true,'refreshedAt',now(),
  'profile',v_profile,'memberships',v_memberships,'departments',v_departments,
  'products',v_products,'catalogueModels',coalesce(v_catalogue->'models','[]'::jsonb),
  'bands',v_bands,'incomes',v_incomes,'orders',v_orders,
  'requests',v_requests,'memos',v_memos
 );
END $function$
;

-- revenue_exclude_order() md5 7ee04244a6240b640f22f6fefdf5dff9
CREATE OR REPLACE FUNCTION public.revenue_exclude_order(p_order_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order     sales_orders%ROWTYPE;
    v_sub       UUID;
    v_note      TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
    v_open_bill BOOLEAN;
    v_rank      SMALLINT;
    v_auto      BOOLEAN;
    v_by        UUID;
    v_at        TIMESTAMPTZ;
BEGIN
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is no longer in the portal. Refresh the page.';
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_order.batch_id;
    -- One writer per month at a time: the lock every write to its orders takes.
    PERFORM lock_commission_order_periods(v_sub, ARRAY[v_order.period_month]);
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id FOR UPDATE;

    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing which of its bills count.',
            TO_CHAR(v_order.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    IF sales_order_excluded_by_hand(p_order_id) THEN
        -- Already out by hand: saying so again can only change why.
        IF v_note IS NOT NULL THEN
            UPDATE sales_order_exclusions SET note = v_note WHERE order_id = p_order_id;
        END IF;
        RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no, 'changed', FALSE);
    END IF;

    IF v_order.cancelled THEN
        RAISE EXCEPTION '% already does not count: %', v_order.order_no,
            CASE WHEN v_order.excluded_reason = 'ignored_agent' THEN 'its salesperson is not ours'
                 WHEN v_order.erp_on_hold THEN 'it is on hold in the ERP'
                 WHEN v_order.erp_status = 'DELETED' THEN 'it was deleted in the ERP'
                 WHEN v_order.erp_status IS NOT NULL
                     THEN 'it is ' || LOWER(REPLACE(v_order.erp_status, '_', ' ')) || ' in the ERP'
                 ELSE 'it is excluded' END
            USING ERRCODE = '23EXC';
    END IF;

    -- In a month that pays Open Bill, the pick leaves with the bill.
    v_open_bill := comm_open_bill_on(v_sub, v_order.period_month);
    IF v_open_bill THEN
        SELECT t.bill_rank, t.auto_suggested, t.tagged_by, t.tagged_at
          INTO v_rank, v_auto, v_by, v_at
          FROM sales_order_open_bill_tags t
         WHERE t.order_id = p_order_id;
    END IF;

    INSERT INTO sales_order_exclusions (
        order_id, note, open_bill_rank, open_bill_auto, open_bill_tagged_by, open_bill_tagged_at,
        excluded_by, excluded_by_name)
    SELECT p_order_id, v_note, v_rank, v_auto, v_by, v_at, u.id, u.name
      FROM (SELECT 1) one
      LEFT JOIN users u ON u.id = auth.uid();
    -- (sales_order_exclusions_apply has taken the bill out.)

    IF v_rank IS NOT NULL THEN
        DELETE FROM sales_order_open_bill_tags WHERE order_id = p_order_id;
    END IF;

    IF v_order.source = 'erp_sync' THEN
        -- The rest of the salesperson's day moves up, as when the ERP cancels a bill.
        PERFORM erp_sync_resequence_day(v_order.agent_key, v_order.event_date);
        PERFORM erp_sync_suggest_open_bills(v_order.staff_id, v_order.event_date);
    END IF;
    PERFORM erp_sync_refresh_batch(v_order.batch_id);

    RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no, 'changed', TRUE, 'openBillRank', v_rank);
END;
$function$
;

-- revenue_include_order() md5 031c10a95cfe299c9ffac48bcf52698b
CREATE OR REPLACE FUNCTION public.revenue_include_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order    sales_orders%ROWTYPE;
    v_sub      UUID;
    v_ex       sales_order_exclusions%ROWTYPE;
    v_auto     BOOLEAN;
    v_n        INTEGER := 0;
BEGIN
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is no longer in the portal. Refresh the page.';
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_order.batch_id;
    PERFORM lock_commission_order_periods(v_sub, ARRAY[v_order.period_month]);

    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing which of its bills count.',
            TO_CHAR(v_order.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    DELETE FROM sales_order_exclusions WHERE order_id = p_order_id RETURNING * INTO v_ex;
    IF NOT FOUND THEN
        RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no, 'changed', FALSE, 'counts', NOT v_order.cancelled);
    END IF;
    -- (sales_order_exclusions_apply has handed the bill back to its own verdict.)
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;

    IF v_order.source = 'erp_sync' THEN
        PERFORM erp_sync_resequence_day(v_order.agent_key, v_order.event_date);
    END IF;

    -- Its Open Bill pick comes back, unless somebody claimed the rank by hand
    -- meanwhile. A suggestion the feed made while the bill was out gives way.
    IF v_ex.open_bill_rank IS NOT NULL AND NOT v_order.cancelled AND v_order.staff_id IS NOT NULL
       AND comm_open_bill_on(v_sub, v_order.period_month)
       AND NOT EXISTS (SELECT 1 FROM sales_order_open_bill_tags t WHERE t.order_id = p_order_id) THEN
        v_auto := COALESCE(v_ex.open_bill_auto, FALSE);
        DELETE FROM sales_order_open_bill_tags t
         WHERE t.sub_department_id = v_sub
           AND t.staff_id = v_order.staff_id
           AND t.event_date = v_order.event_date
           AND t.bill_rank = v_ex.open_bill_rank
           AND t.auto_suggested;
        INSERT INTO sales_order_open_bill_tags (
            order_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by, tagged_at)
        SELECT p_order_id, v_order.staff_id, v_order.event_date, v_ex.open_bill_rank, v_auto,
               -- Whoever made the pick, while they still have an account.
               (SELECT u.id FROM users u WHERE u.id = v_ex.open_bill_tagged_by),
               COALESCE(v_ex.open_bill_tagged_at, NOW())
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;

    IF v_order.source = 'erp_sync' THEN
        PERFORM erp_sync_suggest_open_bills(v_order.staff_id, v_order.event_date);
    END IF;
    PERFORM erp_sync_refresh_batch(v_order.batch_id);

    RETURN JSONB_BUILD_OBJECT(
        'orderNo', v_order.order_no,
        'changed', TRUE,
        'counts', NOT v_order.cancelled,
        -- Out for another reason all along: counting it by hand cannot bring it in.
        'stillOut', CASE WHEN NOT v_order.cancelled THEN NULL
                         WHEN v_order.excluded_reason = 'ignored_agent' THEN 'its salesperson is not ours'
                         WHEN v_order.erp_on_hold THEN 'it is on hold in the ERP'
                         WHEN v_order.erp_status = 'DELETED' THEN 'it was deleted in the ERP'
                         WHEN v_order.erp_status IS NOT NULL
                             THEN 'it is ' || LOWER(REPLACE(v_order.erp_status, '_', ' ')) || ' in the ERP'
                         ELSE 'it is excluded' END,
        'openBillRank', CASE WHEN v_n > 0 THEN v_ex.open_bill_rank END);
END;
$function$
;

-- revenue_month_orders() md5 deac7a5e90e893c978d446613de6b3fe
CREATE OR REPLACE FUNCTION public.revenue_month_orders(p_sub_department_id uuid, p_period date)
 RETURNS TABLE(order_id uuid, order_no text, order_date date, event_date date, customer_name text, debtor_code text, venue text, venue_group_key text, venue_group_name text, organizer text, location text, brand_code text, order_total numeric, paid_amount numeric, balance numeric, cancelled boolean, excluded_reason text, erp_status text, erp_on_hold boolean, sequence_in_day integer, staff_id uuid, employee_name text, employee_code text, agent_name text, line_count integer, line_amount numeric, commissionable numeric, margin_revenue numeric, margin_cost numeric, margin_pct numeric, margin_source text, lines_without_cost integer, lines_without_brand integer, open_bill_rank smallint, open_bill_auto boolean, deposit_required numeric, deposit_met boolean, ref_no text, paper_no text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    WITH scheme AS (
        SELECT s.id,
               s.enable_kpi,
               s.deposit_threshold_pct AS pct,
               CASE WHEN COALESCE(s.revenue_cost_divisor, 1) > 0
                    THEN s.revenue_cost_divisor ELSE 1 END AS cost_divisor
          FROM comm_schemes s
         WHERE s.sub_department_id = p_sub_department_id AND s.is_active
         ORDER BY s.effective_from DESC
         LIMIT 1
    ), batch AS (
        SELECT b.id
          FROM sales_import_batches b
         WHERE b.sub_department_id = p_sub_department_id
           AND b.period_month = p_period
           AND b.status = 'committed'
    ), organiser AS (
        -- The organiser belongs to THIS month's fair, not to the hall: the
        -- same venue has a different organiser from month to month. One row
        -- per place, chosen as venue_event_organiser chooses: an undated fair
        -- first, then the earliest start (20260926100000: read once here, not
        -- once per bill).
        SELECT DISTINCT ON (e.venue_key) e.venue_key, og.name
          FROM comm_venue_events e
          JOIN comm_organisers og ON og.id = e.organiser_id
         WHERE e.period_month = DATE_TRUNC('month', p_period)::DATE
         ORDER BY e.venue_key, (e.start_date IS NULL) DESC, e.start_date
    ), kpi AS (
        -- What each bill's KPI items take off its sales (2026-09-27), in force
        -- at the month's end as the run reads them; none while KPI is off.
        SELECT h.order_id, SUM(h.qty * h.unit_amount) AS amount
          FROM scheme sc
          CROSS JOIN LATERAL comm_kpi_hits(
              sc.id,
              CASE WHEN sc.enable_kpi
                   THEN ARRAY(SELECT o.id FROM sales_orders o JOIN batch ON batch.id = o.batch_id)
                   ELSE '{}'::UUID[] END,
              (DATE_TRUNC('month', p_period) + INTERVAL '1 month - 1 day')::DATE) h
         GROUP BY h.order_id
    )
    SELECT
        o.id, o.order_no, o.order_date, o.event_date, o.customer_name, o.debtor_code,
        o.venue,
        -- The spelling stays on the row; the PLACE is what groups and filters.
        COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue)),
        COALESCE(canon.display_name, own.display_name),
        org.name,
        o.location, o.brand_code,
        o.order_total, COALESCE(o.paid_amount, 0), o.balance,
        o.cancelled, o.excluded_reason, o.erp_status, o.erp_on_hold, o.sequence_in_day,
        o.staff_id, st.employee_name, st.employee_code, o.agent_name,
        COALESCE(l.n, 0)::INTEGER,
        COALESCE(l.amount, 0),
        -- What the rate is paid on: the bill's MAIN sales — its commissionable
        -- lines less its KPI items. What the margin is taken on: the same, less
        -- what its bed frames' divan, leg, gap and total height were CHARGED (2026-10-05) —
        -- the customer's price for an option is out of the margin on both
        -- sides, and still in the sales the rate is paid on.
        COALESCE(l.main, 0),
        COALESCE(l.margin_base, 0),
        l.margin_cost,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN o.manual_margin_pct
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_base, 0) <= 0 THEN NULL
            ELSE ROUND((l.margin_base - l.margin_cost) / l.margin_base, 6)
        END,
        CASE
            WHEN o.manual_margin_pct IS NOT NULL THEN 'manual'
            WHEN l.margin_cost IS NULL OR COALESCE(l.margin_base, 0) <= 0 THEN 'none'
            ELSE 'cost'
        END,
        COALESCE(l.no_cost, 0)::INTEGER,
        COALESCE(l.no_brand, 0)::INTEGER,
        t.bill_rank, t.auto_suggested,
        CASE WHEN sc.pct IS NULL THEN NULL ELSE ROUND(o.order_total * sc.pct, 2) END,
        CASE WHEN sc.pct IS NULL THEN TRUE
             ELSE COALESCE(o.paid_amount, 0) + 0.005 >= o.order_total * sc.pct END,
        -- The paper beside the document (20261003170000): the Ref No. as the
        -- ERP has it, and the paper number the double-claim check reads.
        ref_no(o),
        paper_no(o)
      FROM sales_orders o
      JOIN batch ON batch.id = o.batch_id
      CROSS JOIN scheme sc
      LEFT JOIN hr_staff_costs st ON st.id = o.staff_id
      LEFT JOIN comm_venues own ON own.venue_key = venue_key(o.venue)
      LEFT JOIN comm_venues canon ON canon.venue_key = own.canonical_key
      -- venue_group_key(o.venue), spelled out: the canonical place when a
      -- human folded this spelling into one, else the spelling's own key.
      LEFT JOIN organiser org
             ON org.venue_key = COALESCE(own.canonical_key, own.venue_key, venue_key(o.venue))
      LEFT JOIN kpi k ON k.order_id = o.id
      LEFT JOIN LATERAL (
          SELECT g.n, g.amount, g.margin_cost, g.no_cost, g.no_brand,
                 -- comm_kpi_hits pays only what the bill's sales cover.
                 COALESCE(g.goods, 0) - COALESCE(k.amount, 0) AS main,
                 COALESCE(g.goods, 0) - COALESCE(k.amount, 0) - COALESCE(g.charges, 0) AS margin_base
            FROM (
              SELECT
                  COUNT(*) AS n,
                  SUM(sl.line_amount) AS amount,
                  -- Every line in a commissionable group. A free giveaway is
                  -- in it: its cost is real and that is how giving it away is
                  -- meant to hurt the margin.
                  SUM(sl.line_amount) FILTER (WHERE ig.commissionable) AS goods,
                  -- What its bed frames' divan, leg, gap and total height were charged.
                  SUM(sl.option_charge_amount) FILTER (WHERE ig.commissionable) AS charges,
                  -- NULL when ANY line of that base has no cost. A partial
                  -- cost would show as a fat margin and the engine would
                  -- disagree - it refuses to judge an incomplete bill at all.
                  --
                  -- Each line divided by its SKU's own ratio, else the
                  -- scheme's (2026-09-27), exactly as marginBase() divides it:
                  -- this is the cost the MARGIN is taken on, not the cost on
                  -- the invoice.
                  CASE WHEN COUNT(*) FILTER (WHERE ig.commissionable AND sl.cost_amount IS NULL) > 0
                       THEN NULL
                       ELSE ROUND(
                            COALESCE(SUM(sl.cost_amount / COALESCE(cr.ratio, sc.cost_divisor))
                                     FILTER (WHERE ig.commissionable), 0),
                            2) END AS margin_cost,
                  COUNT(*) FILTER (WHERE sl.cost_amount IS NULL) AS no_cost,
                  COUNT(*) FILTER (WHERE sl.brand_code IS NULL) AS no_brand
                FROM sales_order_lines sl
                LEFT JOIN comm_item_groups ig
                       ON ig.scheme_id = sc.id
                      AND UPPER(BTRIM(ig.item_group)) = UPPER(BTRIM(sl.item_group))
                LEFT JOIN comm_cost_ratios cr
                       ON cr.scheme_id = sc.id
                      AND UPPER(BTRIM(cr.product_code)) = UPPER(BTRIM(sl.product_code))
               WHERE sl.order_id = o.id
            ) g
      ) l ON TRUE
      LEFT JOIN sales_order_open_bill_tags t ON t.order_id = o.id
     ORDER BY o.order_date, o.sequence_in_day NULLS LAST, o.order_no;
$function$
;

-- revenue_move_order() md5 b0e138911666f3bbc20f54a56036b66d
CREATE OR REPLACE FUNCTION public.revenue_move_order(p_order_id uuid, p_staff_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order  sales_orders%ROWTYPE;
    v_sub    UUID;
    v_note   TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
    v_was    sales_order_reassignments%ROWTYPE;
    v_moved  BOOLEAN;
    v_named  UUID;
    v_to     UUID;
    v_back   BOOLEAN;
    v_rank   SMALLINT;
    v_auto   BOOLEAN;
    v_by     UUID;
    v_at     TIMESTAMPTZ;
    v_share  NUMERIC;
    v_put    INTEGER := 0;
    v_share_by  UUID;
    v_share_at  TIMESTAMPTZ;
    v_give      NUMERIC;
    v_given     INTEGER := 0;
BEGIN
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is no longer in the portal. Refresh the page.';
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_order.batch_id;
    -- One writer per month at a time: the lock every write to its orders takes.
    PERFORM lock_commission_order_periods(v_sub, ARRAY[v_order.period_month]);
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id FOR UPDATE;

    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before moving its bills.',
            TO_CHAR(v_order.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;
    IF v_order.cancelled THEN
        RAISE EXCEPTION '% does not count this month — count it again before moving it.', v_order.order_no
            USING ERRCODE = '23EXC';
    END IF;

    SELECT r.* INTO v_was FROM sales_order_reassignments r WHERE r.order_id = p_order_id;
    v_moved := FOUND;
    -- Who the ERP names, as the receiver reads it; for a bill no alias names
    -- (a file import, an agent never matched), whoever had it before any move.
    v_named := COALESCE(
        (SELECT a.staff_id FROM comm_agent_aliases a
          WHERE v_order.erp_salesperson_id IS NOT NULL AND a.erp_salesperson_id = v_order.erp_salesperson_id
          LIMIT 1),
        (SELECT a.staff_id FROM comm_agent_aliases a WHERE a.agent_key = v_order.agent_key LIMIT 1),
        CASE WHEN v_moved THEN v_was.from_staff_id ELSE v_order.staff_id END);
    -- No one named: back to the ERP's salesperson.
    v_to := COALESCE(p_staff_id, v_named);
    -- A moved bill going to the salesperson the ERP names — nobody, for a bill
    -- never matched — is the move coming off.
    v_back := v_moved AND v_to IS NOT DISTINCT FROM v_named;

    IF v_to IS NOT DISTINCT FROM v_order.staff_id THEN
        -- Already theirs; saying so again can only change why.
        IF v_moved AND v_note IS NOT NULL THEN
            UPDATE sales_order_reassignments SET note = v_note WHERE order_id = p_order_id;
        END IF;
        RETURN JSONB_BUILD_OBJECT('orderNo', v_order.order_no, 'changed', FALSE,
            'staffId', v_order.staff_id, 'namedStaffId', v_named);
    END IF;
    IF v_to IS NULL AND NOT v_back THEN
        RAISE EXCEPTION 'Say whom % goes to.', v_order.order_no USING ERRCODE = '23MOV';
    END IF;

    -- Its Open Bill pick ranked the old salesperson's day: it leaves with the
    -- bill. The first move remembers it; the move back may put it back.
    SELECT t.bill_rank, t.auto_suggested, t.tagged_by, t.tagged_at
      INTO v_rank, v_auto, v_by, v_at
      FROM sales_order_open_bill_tags t
     WHERE t.order_id = p_order_id;
    IF FOUND THEN
        DELETE FROM sales_order_open_bill_tags WHERE order_id = p_order_id;
    END IF;

    -- The new holder held a part of it: they hold all of it now. The part is
    -- remembered on the move and given back when the bill leaves them.
    DELETE FROM sales_order_shares WHERE order_id = p_order_id AND staff_id = v_to
    RETURNING share_pct, created_by, created_at INTO v_share, v_share_by, v_share_at;
    -- The part the bill's holder gave up when a move made all of it theirs.
    v_give := CASE WHEN v_moved THEN v_was.share_taken_pct END;

    IF v_back THEN
        -- Back to the ERP's salesperson: the move comes off
        -- (sales_order_reassignments_apply hands the bill back).
        DELETE FROM sales_order_reassignments WHERE order_id = p_order_id;
        -- The pick it gave up on its first move comes back, unless somebody
        -- claimed that rank by hand meanwhile; a suggestion gives way.
        IF v_was.open_bill_rank IS NOT NULL AND v_to IS NOT NULL AND comm_open_bill_on(v_sub, v_order.period_month) THEN
            DELETE FROM sales_order_open_bill_tags t
             WHERE t.sub_department_id = v_sub
               AND t.staff_id = v_to
               AND t.event_date = v_order.event_date
               AND t.bill_rank = v_was.open_bill_rank
               AND t.auto_suggested;
            -- The sub-department named here, not left to guard_open_bill_scope:
            -- the rank's uniqueness is per (sub-department, salesperson, day).
            INSERT INTO sales_order_open_bill_tags (
                order_id, sub_department_id, staff_id, event_date, bill_rank, auto_suggested, tagged_by, tagged_at)
            SELECT p_order_id, v_sub, v_to, v_order.event_date, v_was.open_bill_rank, COALESCE(v_was.open_bill_auto, FALSE),
                   -- Whoever made the pick, while they still have an account.
                   (SELECT u.id FROM users u WHERE u.id = v_was.open_bill_tagged_by),
                   COALESCE(v_was.open_bill_tagged_at, NOW())
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_put = ROW_COUNT;
        END IF;
    ELSIF v_moved THEN
        -- Moved on again: the pick remembered is the first holder's, and stays;
        -- the part remembered is now the new holder's.
        UPDATE sales_order_reassignments r
           SET staff_id = v_to,
               note = COALESCE(v_note, r.note),
               share_taken_pct = v_share,
               share_taken_by = v_share_by,
               share_taken_at = v_share_at,
               moved_by = u.id,
               moved_by_name = u.name,
               moved_at = NOW()
          FROM (SELECT 1) one
          LEFT JOIN users u ON u.id = auth.uid()
         WHERE r.order_id = p_order_id;
    ELSE
        INSERT INTO sales_order_reassignments (
            order_id, staff_id, from_staff_id, note,
            open_bill_rank, open_bill_auto, open_bill_tagged_by, open_bill_tagged_at,
            share_taken_pct, share_taken_by, share_taken_at,
            moved_by, moved_by_name)
        SELECT p_order_id, v_to, v_order.staff_id, v_note, v_rank, v_auto, v_by, v_at,
               v_share, v_share_by, v_share_at, u.id, u.name
          FROM (SELECT 1) one
          LEFT JOIN users u ON u.id = auth.uid();
    END IF;
    -- (sales_order_reassignments_apply has moved the bill.)

    -- The part its last holder gave up is theirs again now the bill is somebody
    -- else's — unless it is nobody's, or the parts held meanwhile would leave
    -- the new holder nothing (sales_order_shares_guard's rule, asked first).
    IF v_give IS NOT NULL AND v_order.staff_id IS NOT NULL AND v_to IS NOT NULL
       AND v_order.staff_id IS DISTINCT FROM v_to
       AND (SELECT COALESCE(SUM(s.share_pct), 0) FROM sales_order_shares s
             WHERE s.order_id = p_order_id AND s.staff_id <> v_order.staff_id) + v_give < 1 THEN
        INSERT INTO sales_order_shares (order_id, staff_id, share_pct, created_by, created_at)
        VALUES (p_order_id, v_order.staff_id, v_give, v_was.share_taken_by, COALESCE(v_was.share_taken_at, NOW()))
        ON CONFLICT (order_id, staff_id) DO NOTHING;
        GET DIAGNOSTICS v_given = ROW_COUNT;
    END IF;

    IF v_order.source = 'erp_sync' THEN
        -- Both salespeople's day, where the month pays Open Bill.
        PERFORM erp_sync_suggest_open_bills(v_order.staff_id, v_order.event_date);
        PERFORM erp_sync_suggest_open_bills(v_to, v_order.event_date);
    END IF;
    PERFORM erp_sync_refresh_batch(v_order.batch_id);

    RETURN JSONB_BUILD_OBJECT(
        'orderNo', v_order.order_no,
        'changed', TRUE,
        'staffId', v_to,
        'fromStaffId', v_order.staff_id,
        'namedStaffId', v_named,
        'movedBack', v_back,
        'openBillRank', v_rank,
        'openBillBack', CASE WHEN v_put > 0 THEN v_was.open_bill_rank END,
        'shareTaken', v_share,
        -- The part fromStaffId holds again — or could not be given back.
        'shareBack', CASE WHEN v_given > 0 THEN v_give END,
        'shareNotBack', CASE WHEN v_give IS NOT NULL AND v_given = 0 THEN v_give END);
END;
$function$
;

-- save_commission_run() md5 93830a226afca5b1525ab22c9149aeb1
CREATE OR REPLACE FUNCTION public.save_commission_run(p_period_month date, p_sub_department_id uuid, p_scheme_id uuid, p_batch_id uuid, p_total_commission numeric, p_warnings jsonb, p_statements jsonb, p_released_orders jsonb, p_deferred_orders jsonb, p_penalised_orders jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE

    v_run_id     UUID;
    v_status     comm_run_status;
    v_stmt       JSONB;
    v_stmt_id    UUID;
    v_line_sum   DECIMAL(15, 2);
    v_total      DECIMAL(15, 2) := 0;
    v_count      INTEGER := 0;
BEGIN
    IF NOT has_scope(ARRAY['hr']) THEN
        RAISE EXCEPTION 'Only Principal or HR may compute a commission run';
    END IF;

    IF EXTRACT(DAY FROM p_period_month) <> 1 THEN
        RAISE EXCEPTION 'Period must be the first of a month, got %', p_period_month;
    END IF;

    -- Match apply/reopen/finance-submit lock order before locking the run.
    PERFORM pg_advisory_xact_lock(hashtext('commission_payroll:' || p_period_month::TEXT));
    PERFORM public.assert_commission_payroll_open(p_period_month);

    -- An applied run has money in payroll behind it. Recomputing it in place
    -- would leave that money describing statements that no longer exist.
    SELECT id, status INTO v_run_id, v_status
      FROM comm_runs
     WHERE sub_department_id = p_sub_department_id
       AND period_month = p_period_month
     FOR UPDATE;

    IF v_status IN ('applied', 'locked') THEN
        RAISE EXCEPTION 'The % run is already % — reopen it before recomputing',
            to_char(p_period_month, 'Mon YYYY'), v_status;
    END IF;

    IF v_run_id IS NULL THEN
        INSERT INTO comm_runs (sub_department_id, period_month, scheme_id, batch_id, status)
        VALUES (p_sub_department_id, p_period_month, p_scheme_id, p_batch_id, 'draft')
        RETURNING id INTO v_run_id;
    END IF;

    -- Cascades to lines and brand margins.
    DELETE FROM comm_statements WHERE run_id = v_run_id;

    FOR v_stmt IN SELECT * FROM jsonb_array_elements(COALESCE(p_statements, '[]'::JSONB))
    LOOP
        INSERT INTO comm_statements (
            run_id, staff_id,
            rank_title_id, promotes_to_title_id,
            base_rank_key, rank_key, rate_mode, qualifies_for_rank_key,
            product_rate, upline_staff_id,
            product_revenue, penalty_weighted_revenue, group_revenue,
            deferred_revenue, excluded_revenue, product_commission,
            kpi_qty, kpi_base, kpi_threshold_pct, kpi_commission,
            open_bill_bonus, override_commission,
            margin_revenue, margin_cost, margin_pct, margin_band_key,
            margin_incentive, margin_penalty_withheld, group_incentive, group_subsidy_cap, group_breakdown, full_spec,
            total_commission
        )
        VALUES (
            v_run_id,
            (v_stmt ->> 'staff_id')::UUID,
            (v_stmt ->> 'rank_title_id')::UUID,
            (v_stmt ->> 'promotes_to_title_id')::UUID,
            v_stmt ->> 'base_rank_key',
            v_stmt ->> 'rank_key',
            (v_stmt ->> 'rate_mode')::comm_rate_mode,
            v_stmt ->> 'qualifies_for_rank_key',
            COALESCE((v_stmt ->> 'product_rate')::DECIMAL, 0),
            (v_stmt ->> 'upline_staff_id')::UUID,
            COALESCE((v_stmt ->> 'product_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'penalty_weighted_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'group_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'deferred_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'excluded_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'product_commission')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'kpi_qty')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'kpi_base')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'kpi_threshold_pct')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'kpi_commission')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'open_bill_bonus')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'override_commission')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'margin_revenue')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'margin_cost')::DECIMAL, 0),
            (v_stmt ->> 'margin_pct')::DECIMAL,
            v_stmt ->> 'margin_band_key',
            COALESCE((v_stmt ->> 'margin_incentive')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'margin_penalty_withheld')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'group_incentive')::DECIMAL, 0),
            COALESCE((v_stmt ->> 'group_subsidy_cap')::DECIMAL, 0),
            COALESCE(v_stmt -> 'group_breakdown', '[]'::jsonb),
            COALESCE((v_stmt ->> 'full_spec')::boolean, false),
            COALESCE((v_stmt ->> 'total_commission')::DECIMAL, 0)
        )
        RETURNING id INTO v_stmt_id;

        INSERT INTO comm_statement_lines (
            statement_id, component, source_order_id, source_line_id, source_staff_id,
            basis_amount, rate, qty, amount, note
        )
        SELECT
            v_stmt_id,
            (l ->> 'component')::comm_component,
            (l ->> 'source_order_id')::UUID,
            (l ->> 'source_line_id')::UUID,
            (l ->> 'source_staff_id')::UUID,
            COALESCE((l ->> 'basis_amount')::DECIMAL, 0),
            (l ->> 'rate')::DECIMAL,
            (l ->> 'qty')::DECIMAL,
            (l ->> 'amount')::DECIMAL,
            l ->> 'note'
        FROM jsonb_array_elements(COALESCE(v_stmt -> 'lines', '[]'::JSONB)) AS l;

        INSERT INTO comm_statement_brand_margins (
            statement_id, brand_code, revenue, cost, margin_pct, top_band_key
        )
        SELECT
            v_stmt_id,
            b ->> 'brand_code',
            COALESCE((b ->> 'revenue')::DECIMAL, 0),
            COALESCE((b ->> 'cost')::DECIMAL, 0),
            (b ->> 'margin_pct')::DECIMAL,
            b ->> 'top_band_key'
        FROM jsonb_array_elements(COALESCE(v_stmt -> 'brand_margins', '[]'::JSONB)) AS b
        WHERE b ->> 'brand_code' IS NOT NULL;

        -- Invariant 1.
        SELECT COALESCE(SUM(amount), 0) INTO v_line_sum
          FROM comm_statement_lines WHERE statement_id = v_stmt_id;

        IF ABS(v_line_sum - COALESCE((v_stmt ->> 'total_commission')::DECIMAL, 0)) > 0.01 THEN
            RAISE EXCEPTION 'Statement for staff % does not tally: lines sum to % but the total is %',
                v_stmt ->> 'staff_id', v_line_sum, v_stmt ->> 'total_commission';
        END IF;

        v_total := v_total + COALESCE((v_stmt ->> 'total_commission')::DECIMAL, 0);
        v_count := v_count + 1;
    END LOOP;

    -- Invariant 2.
    IF ABS(v_total - COALESCE(p_total_commission, 0)) > 0.01 THEN
        RAISE EXCEPTION 'Run total % does not match the statements, which sum to %',
            p_total_commission, v_total;
    END IF;

    UPDATE comm_runs
       SET scheme_id        = p_scheme_id,
           batch_id         = p_batch_id,
           status           = 'computed',
           staff_count      = v_count,
           total_commission = v_total,
           warnings         = COALESCE(p_warnings, '[]'::JSONB),
           released_orders  = COALESCE(p_released_orders, '[]'::JSONB),
           deferred_orders  = COALESCE(p_deferred_orders, '[]'::JSONB),
           penalised_orders = COALESCE(p_penalised_orders, '[]'::JSONB),
           computed_at      = NOW(),
           computed_by      = auth.uid(),
           reopened_at      = NULL,
           reopened_by      = NULL
     WHERE id = v_run_id;

    -- Computing a valid Revenue month is the payroll hand-off. The call is
    -- in this transaction: payroll, releases and titles all succeed or roll
    -- back with the statements. Warnings stay visible for correction.
    IF jsonb_array_length(COALESCE(p_warnings, '[]'::JSONB)) = 0 THEN
        PERFORM public.apply_commission_run(v_run_id);
    END IF;

    RETURN v_run_id;
END;
$function$
;

-- comm_open_bill_on() md5 dc569f985bed8077234cef91a082eb22
CREATE OR REPLACE FUNCTION public.comm_open_bill_on(p_sub_department_id uuid, p_period date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        (SELECT m.enabled FROM comm_open_bill_months m
          WHERE m.sub_department_id = p_sub_department_id
            AND m.period_month = DATE_TRUNC('month', p_period)::DATE),
        (SELECT s.enable_open_bill FROM comm_schemes s
          WHERE s.sub_department_id = p_sub_department_id AND s.is_active AND s.effective_to IS NULL
          LIMIT 1),
        FALSE);
$function$
;

-- erp_sync_suggest_open_bill_days() md5 caf050783af196e36b83450787782f86
CREATE OR REPLACE FUNCTION public.erp_sync_suggest_open_bill_days(p_staff_id uuid, p_event_dates date[])
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_sub    UUID;
    v_locked DATE[];
    n        INTEGER := 0;
BEGIN
    IF p_staff_id IS NULL OR COALESCE(ARRAY_LENGTH(p_event_dates, 1), 0) = 0 THEN
        RETURN 0;
    END IF;
    v_sub := erp_sync_sub_department();

    -- Which of the months these days fall in are closed. One test per month.
    SELECT COALESCE(ARRAY_AGG(m) FILTER (WHERE commission_order_period_locked(v_sub, m)), '{}')
      INTO v_locked
      FROM (SELECT DISTINCT period_month AS m
              FROM sales_orders
             WHERE source = 'erp_sync' AND staff_id = p_staff_id
               AND event_date = ANY(p_event_dates)) months;

    -- (20260926030000) Only in the months Open Bill pays in.
    DELETE FROM sales_order_open_bill_tags t
     USING sales_orders o
     WHERE t.order_id = o.id
       AND t.staff_id = p_staff_id AND t.event_date = ANY(p_event_dates)
       AND t.auto_suggested AND o.source = 'erp_sync'
       AND o.period_month <> ALL (v_locked)
       AND comm_open_bill_on(v_sub, o.period_month);

    INSERT INTO sales_order_open_bill_tags (order_id, staff_id, event_date, bill_rank, auto_suggested)
    SELECT o.id, p_staff_id, o.event_date, o.sequence_in_day, TRUE
      FROM sales_orders o
     WHERE o.source = 'erp_sync' AND o.staff_id = p_staff_id
       AND o.event_date = ANY(p_event_dates) AND NOT o.cancelled
       AND o.period_month <> ALL (v_locked)
       AND comm_open_bill_on(v_sub, o.period_month)
       AND o.sequence_in_day BETWEEN 1 AND 3
       AND NOT EXISTS (SELECT 1 FROM sales_order_open_bill_tags h WHERE h.order_id = o.id)
       AND NOT EXISTS (
           SELECT 1 FROM sales_order_open_bill_tags h
            WHERE h.sub_department_id = v_sub AND h.staff_id = p_staff_id
              AND h.event_date = o.event_date AND h.bill_rank = o.sequence_in_day);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$function$
;

-- erp_sync_suggest_open_bills() md5 fb894c6b440f5be52c8ee0338054eb23
CREATE OR REPLACE FUNCTION public.erp_sync_suggest_open_bills(p_staff_id uuid, p_event_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN erp_sync_suggest_open_bill_days(p_staff_id, ARRAY[p_event_date]);
END;
$function$
;

-- guard_open_bill_scope() md5 bad6ac313210b022438280511338626f
CREATE OR REPLACE FUNCTION public.guard_open_bill_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_sub UUID; v_staff UUID; v_event DATE; v_period DATE;
BEGIN
    SELECT b.sub_department_id, o.staff_id, o.event_date, o.period_month
      INTO STRICT v_sub, v_staff, v_event, v_period
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id WHERE o.id = NEW.order_id;
    IF NEW.sub_department_id IS NOT NULL AND NEW.sub_department_id <> v_sub THEN
        RAISE EXCEPTION 'Open Bill tag does not belong to its order sub-department';
    END IF;
    IF NEW.staff_id IS DISTINCT FROM v_staff OR NEW.event_date IS DISTINCT FROM v_event THEN
        RAISE EXCEPTION 'Open Bill tag must match its order salesperson and event date';
    END IF;
    -- (20260926030000) The order's month decides, not the scheme alone.
    IF NOT comm_open_bill_on(v_sub, v_period) THEN
        RAISE EXCEPTION 'Open Bill is disabled for this sub-department in %', TO_CHAR(v_period, 'FMMonth YYYY');
    END IF;
    NEW.sub_department_id := v_sub;
    RETURN NEW;
END;
$function$
;
