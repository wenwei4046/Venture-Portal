-- ════════════════════════════════════════════════════════════════════════════
-- A bill that does not count — taken out of its month by hand (2026-09-27)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. A month's Sales orders lists every bill, and until now a bill could
-- leave the commission only two ways: the ERP's (cancelled, a draft, on hold,
-- deleted) and one about a whole PERSON (comm_ignored_agents, "not our
-- salesperson"). Nothing could say "this bill — not this person — does not
-- count": a duplicate of one already paid, a test document, a bill somebody
-- else's business wrote. The user asked (2026-09-27) for it on the row itself:
-- right-click the bill, *Don't count this bill*, and it is not calculated in
-- the month's commission.
--
-- THE RULE:
--   * A row in sales_order_exclusions takes its bill OUT exactly the way an
--     ERP-cancelled bill is out: sales_orders.cancelled = TRUE, with
--     excluded_reason = 'manual'. So it leaves everything that already reads
--     `cancelled` — the month's sales, the engine (own sales, group sales,
--     override, KPI, Open Bill, margin incentive), the carry-forward, the
--     member app, the venue breakdown and the double-claim check. Nothing new
--     has to learn about it.
--   * APPLIED BY TRIGGER, because the ERP re-sends a whole document on every
--     save and ingest_erp_sales_order writes `cancelled` from the ERP's status
--     each time — the same reason sales_orders_ignored_agent is a trigger. The
--     exclusion survives every re-send, a fair-calendar move and a replay.
--   * 'ignored_agent' outranks it (a whole person who is not ours says more
--     than one bill; the exclusion is still there if the person is taken
--     back), and it outranks the ERP's own status: the bill stays out whatever
--     the ERP says next. Deleting the row hands the bill back to the ERP's
--     verdict — or, for a file import, which only ever writes live bills, in.
--   * A held re-send of a settled bill does not see an upsell in it either
--     (erp_sync_note_adjustment): what does not count earned nothing and never
--     will, so the ERP's figure for it is 0.
--   * A month whose run has paid refuses both ways (23RUN), like sharing,
--     recosting or moving a bill.
--   * In a month that pays Open Bill, a bill that does not count gives up its
--     pick: the pick is taken off and REMEMBERED on the exclusion, the
--     salesperson's day is renumbered so the next bill moves up — exactly what
--     happens when the ERP cancels one — and *Count this bill again* puts the
--     pick back unless somebody has claimed that rank by hand meanwhile. In a
--     month that does not pay it the pick is inert and stays where it is, so
--     counting the bill again loses nothing (a pick cannot be written back
--     while the month's Open Bill is off).
--
-- Rollback:
--   DROP FUNCTION revenue_include_order(UUID);
--   DROP FUNCTION revenue_exclude_order(UUID, TEXT);
--   DELETE FROM sales_order_exclusions;          -- hands every bill back
--   DROP TRIGGER sales_orders_manual_exclusion ON sales_orders;
--   DROP FUNCTION sales_orders_apply_manual_exclusion();
--   DROP TABLE sales_order_exclusions CASCADE;
--   DROP FUNCTION sales_order_exclusions_apply(); DROP FUNCTION sales_order_exclusions_guard();
--   DROP FUNCTION sales_order_excluded_by_hand(UUID);
--   then re-apply 20260926020000's erp_sync_note_adjustment.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The list ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_order_exclusions (
    order_id            UUID        PRIMARY KEY REFERENCES sales_orders (id) ON DELETE CASCADE,
    note                TEXT,
    -- The Open Bill pick the bill gave up, so counting it again puts it back.
    open_bill_rank      SMALLINT,
    open_bill_auto      BOOLEAN,
    open_bill_tagged_by UUID,
    open_bill_tagged_at TIMESTAMPTZ,
    excluded_by         UUID        REFERENCES users (id) ON DELETE SET NULL,
    excluded_by_name    TEXT,
    excluded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sales_order_exclusions_rank CHECK (open_bill_rank IS NULL OR open_bill_rank BETWEEN 1 AND 3),
    CONSTRAINT sales_order_exclusions_note CHECK (note IS NULL OR char_length(note) <= 500)
);

COMMENT ON TABLE sales_order_exclusions IS
    'Bills somebody took out of their month by hand (2026-09-27): a row makes its bill cancelled with excluded_reason = ''manual'', exactly as out as a bill the ERP cancelled, and keeps it out through every ERP re-send (trigger sales_orders_manual_exclusion). Deleting the row hands the bill back to the ERP''s verdict. Written by revenue_exclude_order / revenue_include_order.';
COMMENT ON COLUMN sales_order_exclusions.note IS
    'Why, in the words of whoever decided — "duplicate of HC-SO-013251", "test bill".';
COMMENT ON COLUMN sales_order_exclusions.open_bill_rank IS
    'The Open Bill rank the bill held when it was taken out, in a month that pays Open Bill. Put back by revenue_include_order while nobody has claimed the rank by hand.';

ALTER TABLE sales_order_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_order_exclusions_hr_all ON sales_order_exclusions;
CREATE POLICY sales_order_exclusions_hr_all ON sales_order_exclusions
    FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS sales_order_exclusions_principal_all ON sales_order_exclusions;
CREATE POLICY sales_order_exclusions_principal_all ON sales_order_exclusions
    FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON sales_order_exclusions TO authenticated;

COMMENT ON COLUMN sales_orders.excluded_reason IS
    'Why this bill is excluded when the ERP is not the one saying so: ignored_agent (its salesperson is not ours — comm_ignored_agents) or manual (somebody took this bill out — sales_order_exclusions). NULL for an ERP-side exclusion — erp_status and erp_on_hold already say that in the ERP''s own words.';

-- ─── 2. Is this bill out by hand ────────────────────────────────────────────
--
-- SECURITY DEFINER for the reason erp_sync_agent_ignored is: the trigger below
-- must reach the same verdict for every writer — the service-role receiver, an
-- HR session, a Principal session. A writer that could not read the list would
-- otherwise decide "not excluded" and let the bill back in.

CREATE OR REPLACE FUNCTION sales_order_excluded_by_hand(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM sales_order_exclusions WHERE order_id = p_order_id);
$$;

COMMENT ON FUNCTION sales_order_excluded_by_hand(UUID) IS
    'True when somebody took this bill out of its month by hand (sales_order_exclusions).';

REVOKE ALL ON FUNCTION sales_order_excluded_by_hand(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sales_order_excluded_by_hand(UUID) TO authenticated, service_role;

-- ─── 3. Kept out, whichever path writes the bill ────────────────────────────
--
-- Fires after sales_orders_ignored_agent (triggers of one event fire in name
-- order), so an ignored salesperson's reason is already on the row and wins.

CREATE OR REPLACE FUNCTION sales_orders_apply_manual_exclusion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.excluded_reason = 'ignored_agent' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND sales_order_excluded_by_hand(NEW.id) THEN
        NEW.cancelled := TRUE;
        NEW.excluded_reason := 'manual';
    ELSIF NEW.excluded_reason = 'manual' THEN
        -- Counted again since the row was last written. Whoever did that set
        -- `cancelled` back to the document's own verdict; the stale reason
        -- must not outlive it.
        NEW.excluded_reason := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_manual_exclusion ON sales_orders;
CREATE TRIGGER sales_orders_manual_exclusion
    BEFORE INSERT OR UPDATE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION sales_orders_apply_manual_exclusion();

COMMENT ON FUNCTION sales_orders_apply_manual_exclusion() IS
    'A bill taken out by hand stays out no matter who writes it next — the live receiver re-sending it, a replay, the fair calendar moving it. The ERP re-sends a document on every save and rewrites `cancelled` from its own status, so this cannot live anywhere but a trigger.';

-- ─── 4. The list's rules, refused at the table ──────────────────────────────

CREATE OR REPLACE FUNCTION sales_order_exclusions_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_sub      UUID;
    v_month    DATE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_order_id := OLD.order_id;
    ELSE
        v_order_id := NEW.order_id;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.order_id <> OLD.order_id THEN
        RAISE EXCEPTION 'An exclusion belongs to one bill; take it off and put a new one on';
    END IF;

    SELECT b.sub_department_id, o.period_month INTO v_sub, v_month
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.id = v_order_id;

    -- Which bills a month counts is what its run paid on. Same refusal as
    -- sharing, recosting or moving a bill of that month.
    IF FOUND AND commission_order_period_locked(v_sub, v_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing which of its bills count.',
            TO_CHAR(v_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    -- NOT FOUND on a DELETE: the bill itself went first (ON DELETE CASCADE).
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_exclusions_guard ON sales_order_exclusions;
CREATE TRIGGER sales_order_exclusions_guard
    BEFORE INSERT OR UPDATE OR DELETE ON sales_order_exclusions
    FOR EACH ROW EXECUTE FUNCTION sales_order_exclusions_guard();

-- ─── 5. Writing the list moves the bill ─────────────────────────────────────
--
-- So the list is the one fact: a row put on takes the bill out, a row taken
-- off puts it back, whoever writes it and however.

CREATE OR REPLACE FUNCTION sales_order_exclusions_apply()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- sales_orders_manual_exclusion stamps the reason on the way through.
        UPDATE sales_orders
           SET cancelled = TRUE
         WHERE id = NEW.order_id
           AND (NOT cancelled OR excluded_reason IS NULL);
        RETURN NEW;
    END IF;

    -- Back to whatever the document itself says: for a bill the ERP feeds, the
    -- rule ingest_erp_sales_order applies (CANCELLED, DRAFT and a hold earn
    -- nothing; a deletion is DELETED); a file import only ever writes live
    -- bills. sales_orders_ignored_agent takes an ignored salesperson's bill
    -- straight back out, and a bill whose reason is that one is left alone.
    UPDATE sales_orders
       SET cancelled = CASE WHEN source = 'erp_sync'
                            THEN COALESCE(erp_status, '') IN ('CANCELLED', 'DRAFT', 'ON_HOLD', 'DELETED')
                                 OR COALESCE(erp_on_hold, FALSE)
                            ELSE FALSE END,
           excluded_reason = NULL
     WHERE id = OLD.order_id
       AND excluded_reason = 'manual';
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_exclusions_apply ON sales_order_exclusions;
CREATE TRIGGER sales_order_exclusions_apply
    AFTER INSERT OR DELETE ON sales_order_exclusions
    FOR EACH ROW EXECUTE FUNCTION sales_order_exclusions_apply();

-- ─── 6. Don't count this bill ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION revenue_exclude_order(p_order_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION revenue_exclude_order(UUID, TEXT) IS
    'Take one bill out of its month by hand (Sales orders › right-click › Don''t count this bill): it stops counting everywhere a cancelled bill does and stays out through every ERP re-send. Refuses a month whose run has paid (23RUN) and a bill that is already out for another reason (23EXC). In a month that pays Open Bill its pick is remembered and taken off, and the salesperson''s day renumbered.';

REVOKE ALL ON FUNCTION revenue_exclude_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION revenue_exclude_order(UUID, TEXT) TO authenticated;

-- ─── 7. Count this bill again ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION revenue_include_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION revenue_include_order(UUID) IS
    'Undo revenue_exclude_order: the bill goes back to whatever its document says (the ERP''s verdict, or in for a file import), its Open Bill pick comes back while the rank is free of a hand-made pick, and the salesperson''s day is renumbered. Refuses a month whose run has paid (23RUN).';

REVOKE ALL ON FUNCTION revenue_include_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION revenue_include_order(UUID) TO authenticated;

-- ─── 8. A held re-send sees no upsell in a bill that does not count ─────────
--
-- 20260926020000's erp_sync_note_adjustment verbatim but for the one marked
-- condition. A bill taken out by hand was settled at nothing (it is cancelled)
-- and the ERP, which knows nothing of the exclusion, would report its full
-- value — so every save in the ERP would have asked HR to pay the whole bill
-- as an upsell in the current month.

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
       OR COALESCE((p_order->>'onHold')::BOOLEAN, FALSE)
       -- (20260927020000) Nor for a bill somebody took out by hand.
       OR sales_order_excluded_by_hand(v_row.id) THEN
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
    'Called by ingest_erp_sales_order when it holds a delivery for a bill of a settled month: the delivery''s commissionable amount (0 when the ERP no longer counts it, or somebody took the bill out by hand) minus what was settled (a run''s product_revenue, else the hand-worked row under the same paper, else the bill as its closed month froze it, plus drops/upsells already confirmed or dismissed) becomes one pending comm_upsales row per document in the current month. Never raises.';

NOTIFY pgrst, 'reload schema';
