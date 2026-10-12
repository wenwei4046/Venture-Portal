-- ════════════════════════════════════════════════════════════════════════════
-- 20261012190000_a_move_gives_the_share_back.sql
-- A share a move took comes back when the bill leaves that person (2026-10-12)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. Moving a shared bill to somebody who held a part of it (ADRIAN 50% ·
-- ANTHONY 50% → ANTHONY) takes ANTHONY's share: he holds all of it now. Undo,
-- or *Give it back to ADRIAN*, then handed the bill back with ADRIAN at 100% —
-- ANTHONY's 50% was simply gone, and the notice did not say so (a side review
-- the same day; the user: "make sure for those shared bill, can pick cancel
-- share as well").
--
-- THE RULE: the part a move takes is remembered on the move (share_taken_*,
-- as the Open Bill pick is) and given back to that person when the bill leaves
-- them — moved back to the salesperson the ERP names, undone, or moved on. So
-- where a bill ends up never depends on the way it went: ADRIAN 50 · ANTHONY 50
-- moved to ANTHONY and on to LUCAS is LUCAS 50 · ANTHONY 50, exactly as if it
-- had gone straight to LUCAS; and an Undo is an undo. The part is not put back
-- when the bill goes to nobody, or when the parts held meanwhile would leave
-- its new holder nothing (sales_order_shares_guard's rule, asked first) — the
-- answer says so (shareNotBack) and HR shares it again by hand.
--
-- revenue_move_order is production's body (md5 b48282afd30c9b6e29901336684cae37,
-- mig 20261012170000) with the part remembered and given back; nothing else in
-- it changes.
--
-- Rollback: re-apply 20261012170000's revenue_move_order. The three columns
-- can stay (nothing else reads them).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sales_order_reassignments
    ADD COLUMN IF NOT EXISTS share_taken_pct NUMERIC,
    ADD COLUMN IF NOT EXISTS share_taken_by  UUID,
    ADD COLUMN IF NOT EXISTS share_taken_at  TIMESTAMPTZ;

DO $constraint$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_reassignments_share_taken') THEN
        ALTER TABLE public.sales_order_reassignments ADD CONSTRAINT sales_order_reassignments_share_taken
            CHECK (share_taken_pct IS NULL OR (share_taken_pct > 0 AND share_taken_pct < 1));
    END IF;
END
$constraint$;

COMMENT ON COLUMN public.sales_order_reassignments.share_taken_pct IS
    'The part of the bill its holder (staff_id) held before a move made all of it theirs — given back to them by revenue_move_order when the bill leaves them.';

CREATE OR REPLACE FUNCTION public.revenue_move_order(p_order_id UUID, p_staff_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.revenue_move_order(UUID, UUID, TEXT) IS
    'Move one bill to another salesperson (right-click › Move to another salesperson…): it becomes theirs everywhere a bill''s salesperson counts and stays theirs through every ERP re-send. Moving it to the salesperson the ERP names (or to null) takes the move off. The new holder''s share goes, remembered, and is theirs again when the bill leaves them (shareBack / shareNotBack); its Open Bill pick goes, remembered, and comes back on the move back while the rank is free. Refuses a month whose run has paid (23RUN) and a bill that does not count (23EXC).';

REVOKE ALL ON FUNCTION public.revenue_move_order(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_move_order(UUID, UUID, TEXT) TO authenticated;
