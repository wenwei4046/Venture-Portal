-- ════════════════════════════════════════════════════════════════════════════
-- 20261012140000_move_a_bill_to_another_salesperson.sql
-- Right-click a bill › Move to another salesperson… (2026-10-12)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. The user, on a salesperson's ledger on Comm Cal (2026-10-12): "together
-- with rightclick … can select move this order to other sales person". The ERP
-- names who sold a bill (its salesperson, through comm_agent_aliases), and the
-- portal could take a bill out (Don't count this bill) or give away a part of
-- it (Share this bill) — never say "this bill is ANTHONY's". A bill keyed
-- under the wrong name could only be fixed in the ERP, and until it was every
-- re-send put the wrong name back.
--
-- THE RULE:
--   * One row in sales_order_reassignments says whose a bill is, and its
--     sales_orders.staff_id IS that person — so it is their sales, paid at
--     their rate, climbing their upline's override, on their ledger and in
--     their Revenue app, exactly as the ERP's salesperson's bill would be.
--   * KEPT BY TRIGGER (sales_orders_reassigned): the ERP re-sends a whole
--     document on every save and ingest_erp_sales_order writes staff_id from
--     the alias each time; matching an agent (match_erp_salesperson) rewrites
--     every bill of it. Whoever writes the bill, the move stands — the reason
--     sales_orders_manual_exclusion is a trigger. SECURITY DEFINER, so every
--     writer (the service-role receiver, an HR or a Principal session) reaches
--     the same answer.
--   * Writing the row moves the bill; taking it off hands the bill back to the
--     salesperson the ERP names — the alias by the ERP's salesperson id, else
--     by the agent's name — else to whoever had it when it was first moved.
--     Moving a bill to the salesperson the ERP names IS taking the row off.
--   * The new holder's share of the bill goes: they hold all of it now (other
--     holders keep theirs). Its Open Bill pick goes too — it ranked the old
--     salesperson's day — remembered on the row from the first move and put
--     back when the bill is moved back while the rank is free, Don't count's
--     rule (revenue_include_order).
--   * A month whose run has paid refuses both ways (23RUN), like sharing,
--     recosting or taking a bill out; a bill that does not count is counted
--     again before it is moved (23EXC).
--   * Closes are the app's to ask (billsClosedReason / staffClosedReason), as
--     for a share — the receiver writes these bills and must never be refused.
--
-- Rollback:
--   DROP FUNCTION revenue_move_order(UUID, UUID, TEXT);
--   DELETE FROM sales_order_reassignments;      -- hands every bill back
--   DROP TRIGGER sales_orders_reassigned ON sales_orders;
--   DROP FUNCTION sales_orders_keep_reassignment();
--   DROP TABLE sales_order_reassignments CASCADE;
--   DROP FUNCTION sales_order_reassignments_apply();
--   DROP FUNCTION sales_order_reassignments_guard();
--   DELETE FROM permission_table_writes WHERE table_name = 'sales_order_reassignments';
--   DELETE FROM permission_table_reads  WHERE table_name = 'sales_order_reassignments';
--   DELETE FROM audit_tables            WHERE table_name = 'sales_order_reassignments';
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The list ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_order_reassignments (
    order_id            UUID        PRIMARY KEY REFERENCES public.sales_orders (id) ON DELETE CASCADE,
    -- Whose the bill is now.
    staff_id            UUID        NOT NULL REFERENCES public.hr_staff_costs (id) ON DELETE CASCADE,
    -- Whose it was when it was first moved — the ERP's salesperson, as the
    -- portal knew them then. Null for a bill nobody was matched to.
    from_staff_id       UUID        REFERENCES public.hr_staff_costs (id) ON DELETE SET NULL,
    note                TEXT,
    -- The Open Bill pick the bill gave up when it was first moved.
    open_bill_rank      SMALLINT,
    open_bill_auto      BOOLEAN,
    open_bill_tagged_by UUID,
    open_bill_tagged_at TIMESTAMPTZ,
    moved_by            UUID        REFERENCES public.users (id) ON DELETE SET NULL,
    moved_by_name       TEXT,
    moved_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sales_order_reassignments_note CHECK (note IS NULL OR char_length(note) <= 500),
    CONSTRAINT sales_order_reassignments_rank CHECK (open_bill_rank IS NULL OR open_bill_rank BETWEEN 1 AND 3)
);

CREATE INDEX IF NOT EXISTS sales_order_reassignments_staff ON public.sales_order_reassignments (staff_id);

COMMENT ON TABLE public.sales_order_reassignments IS
    'Bills somebody moved to another salesperson (2026-10-12, right-click › Move to another salesperson…): a row makes its bill that person''s (sales_orders.staff_id) and keeps it theirs through every ERP re-send and agent match (trigger sales_orders_reassigned). Deleting the row hands the bill back to the salesperson the ERP names. Written by revenue_move_order.';
COMMENT ON COLUMN public.sales_order_reassignments.from_staff_id IS
    'Whose the bill was when it was first moved — what the ledger says it was moved from, and whom it goes back to when no alias names anybody.';
COMMENT ON COLUMN public.sales_order_reassignments.open_bill_rank IS
    'The Open Bill rank the bill held when it was first moved. Put back by revenue_move_order when the bill is moved back while nobody has claimed the rank.';

ALTER TABLE public.sales_order_reassignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_order_reassignments_hr_all ON public.sales_order_reassignments;
CREATE POLICY sales_order_reassignments_hr_all ON public.sales_order_reassignments
    FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS sales_order_reassignments_principal_all ON public.sales_order_reassignments;
CREATE POLICY sales_order_reassignments_principal_all ON public.sales_order_reassignments
    FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

REVOKE ALL ON public.sales_order_reassignments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_reassignments TO authenticated;

-- The database asks for the action too (PR3a / PR3d): writing it is Revenue's
-- work (the right-click's Server Action asks revenue.edit), reading it is
-- whoever reads the month's bills.
INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('sales_order_reassignments', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_reassignments', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_reassignments', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;

SELECT public.permission_writes_guard('sales_order_reassignments');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('sales_order_reassignments', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;

SELECT public.permission_reads_guard('sales_order_reassignments');

-- Every change is somebody's: in the app-wide history, read by Revenue's readers.
SELECT public.audit_register('sales_order_reassignments', 'Bills moved to another salesperson', 'Revenue', '{revenue}', 'all',
  p_keys => '{order_id}', p_labels => '{order_id,staff_id}');

-- ─── 2. Kept theirs, whichever path writes the bill ─────────────────────────

CREATE OR REPLACE FUNCTION public.sales_orders_keep_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff UUID;
BEGIN
    SELECT r.staff_id INTO v_staff FROM sales_order_reassignments r WHERE r.order_id = NEW.id;
    IF FOUND AND NEW.staff_id IS DISTINCT FROM v_staff THEN
        NEW.staff_id := v_staff;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_reassigned ON public.sales_orders;
CREATE TRIGGER sales_orders_reassigned
    BEFORE UPDATE OF staff_id ON public.sales_orders
    FOR EACH ROW EXECUTE FUNCTION public.sales_orders_keep_reassignment();

COMMENT ON FUNCTION public.sales_orders_keep_reassignment() IS
    'A bill moved to another salesperson stays theirs no matter who writes it next — the live receiver re-sending it, a replay, an agent matched on Data source. The ERP re-sends a document on every save and rewrites staff_id from the alias, so this cannot live anywhere but a trigger.';

-- ─── 3. The list's rules, refused at the table ──────────────────────────────

CREATE OR REPLACE FUNCTION public.sales_order_reassignments_guard()
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
        RAISE EXCEPTION 'A move belongs to one bill; move the other bill on its own';
    END IF;

    SELECT b.sub_department_id, o.period_month INTO v_sub, v_month
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.id = v_order_id;

    -- Whose a month's bills are is what its run paid on. Same refusal as
    -- sharing, recosting or taking a bill of that month out.
    IF FOUND AND commission_order_period_locked(v_sub, v_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before moving its bills.',
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

DROP TRIGGER IF EXISTS sales_order_reassignments_guard ON public.sales_order_reassignments;
CREATE TRIGGER sales_order_reassignments_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_reassignments
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_reassignments_guard();

-- ─── 4. Writing the list moves the bill ─────────────────────────────────────
--
-- So the list is the one fact: a row put on (or changed) makes the bill its
-- person's, a row taken off hands it back, whoever writes it and however.

CREATE OR REPLACE FUNCTION public.sales_order_reassignments_apply()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Back to the salesperson the ERP names — the alias by the ERP's
        -- salesperson id, else by the agent's name, as ingest_erp_sales_order
        -- reads it — else to whoever had it when it was first moved.
        UPDATE sales_orders o
           SET staff_id = COALESCE(
                   (SELECT a.staff_id FROM comm_agent_aliases a
                     WHERE o.erp_salesperson_id IS NOT NULL AND a.erp_salesperson_id = o.erp_salesperson_id
                     LIMIT 1),
                   (SELECT a.staff_id FROM comm_agent_aliases a WHERE a.agent_key = o.agent_key LIMIT 1),
                   OLD.from_staff_id)
         WHERE o.id = OLD.order_id;
        RETURN OLD;
    END IF;
    -- sales_orders_reassigned stamps the same person on the way through.
    UPDATE sales_orders SET staff_id = NEW.staff_id
     WHERE id = NEW.order_id AND staff_id IS DISTINCT FROM NEW.staff_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_reassignments_apply ON public.sales_order_reassignments;
CREATE TRIGGER sales_order_reassignments_apply
    AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_reassignments
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_reassignments_apply();

-- ─── 5. Move to another salesperson ─────────────────────────────────────────

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

    -- The new holder held a part of it: they hold all of it now.
    DELETE FROM sales_order_shares WHERE order_id = p_order_id AND staff_id = v_to
    RETURNING share_pct INTO v_share;

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
        -- Moved on again: the pick remembered is the first holder's, and stays.
        UPDATE sales_order_reassignments r
           SET staff_id = v_to,
               note = COALESCE(v_note, r.note),
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
            moved_by, moved_by_name)
        SELECT p_order_id, v_to, v_order.staff_id, v_note, v_rank, v_auto, v_by, v_at, u.id, u.name
          FROM (SELECT 1) one
          LEFT JOIN users u ON u.id = auth.uid();
    END IF;
    -- (sales_order_reassignments_apply has moved the bill.)

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
        'shareTaken', v_share);
END;
$$;

COMMENT ON FUNCTION public.revenue_move_order(UUID, UUID, TEXT) IS
    'Move one bill to another salesperson (right-click › Move to another salesperson…): it becomes theirs everywhere a bill''s salesperson counts and stays theirs through every ERP re-send. Moving it to the salesperson the ERP names (or to null) takes the move off. The new holder''s share goes; its Open Bill pick goes, remembered, and comes back on the move back while the rank is free. Refuses a month whose run has paid (23RUN) and a bill that does not count (23EXC).';

REVOKE ALL ON FUNCTION public.revenue_move_order(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_move_order(UUID, UUID, TEXT) TO authenticated;
