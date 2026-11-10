-- ════════════════════════════════════════════════════════════════════════════
-- Half comm — one bill paid half its commission, by hand (2026-11-10)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. The user, on Comm Cal's bill menu: "half comm 的意思就是在他的 commission
-- value 里面 commission 的一半。example: commission value 5000, commission
-- percentage 6%; commission get RM300, 当我按了 half comm 就会是 total
-- commission RM150, then 在 status 里面就是 show half comm". Asked the rest:
--   * the upline's override on that bill is halved too;
--   * its SALES count in full — group sales, a rung, a group incentive's
--     target, the month's Commissionable value, the Revenue app and the Arena
--     keep the whole bill; only the money paid on it is halved;
--   * its KPI items are paid in full (Open Bill, which the user also named,
--     went on 2026-10-31 — nothing of it is left to halve);
--   * like *Don't count this bill…*: a small confirm panel with Why
--     (optional), the reason the Status chip's tooltip, and *Full comm again*
--     to undo it.
--
-- THE RULE: a row of sales_order_half_comm says its bill is paid half. The
-- engine reads the list (`SalesOrder.halfComm`, loadCommissionInput) and halves
-- the bill's own commission line and what it puts in its holder's override
-- base — nothing else. Nothing here touches sales_orders: the ERP never writes
-- this table, so every re-send leaves it as it is, and a bill moved or shared
-- keeps it (each holder's part is halved). A bill that does not count is no
-- bill to halve (23EXC); a month whose run has paid refuses either way (23RUN),
-- as Don't count / Share / Move do.
--
-- Rollback (written as words — the database tool refuses a migration that
-- spells the statement): drop the two functions revenue_half_comm_order and
-- revenue_full_comm_order, the guard trigger and its function, the table
-- (every half-comm bill is paid in full again on its next computation), and
-- the table's rows in permission_table_writes, permission_table_reads and
-- audit_tables.
--
-- PGlite: tests/member-sql/validate-half-comm.mjs (the migration verbatim, twice).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The list ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_order_half_comm (
    order_id    UUID        PRIMARY KEY REFERENCES public.sales_orders (id) ON DELETE CASCADE,
    note        TEXT,
    set_by      UUID        REFERENCES public.users (id) ON DELETE SET NULL,
    set_by_name TEXT,
    set_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sales_order_half_comm_note CHECK (note IS NULL OR char_length(note) <= 500)
);

COMMENT ON TABLE public.sales_order_half_comm IS
    'Bills paid half their commission by hand (Comm Cal › a bill''s menu › Half comm, 2026-11-10): the engine halves the bill''s own commission and its part of its holder''s override base; its sales, KPI items and every sales figure stay whole. Written by revenue_half_comm_order / revenue_full_comm_order.';
COMMENT ON COLUMN public.sales_order_half_comm.note IS
    'Why, in the words of whoever decided — the Status chip''s tooltip.';

ALTER TABLE public.sales_order_half_comm ENABLE ROW LEVEL SECURITY;

-- Which rows: whoever reads a month's bills reads which are half; whoever
-- works them writes it. The registry's RESTRICTIVE guards below ask the same.
DROP POLICY IF EXISTS sales_order_half_comm_read ON public.sales_order_half_comm;
CREATE POLICY sales_order_half_comm_read ON public.sales_order_half_comm
    FOR SELECT TO authenticated
    USING ((SELECT public.has_any_action(ARRAY['revenue.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage'])));

DROP POLICY IF EXISTS sales_order_half_comm_write ON public.sales_order_half_comm;
CREATE POLICY sales_order_half_comm_write ON public.sales_order_half_comm
    FOR ALL TO authenticated
    USING ((SELECT public.has_any_action(ARRAY['revenue.create', 'revenue.edit', 'revenue.manage'])))
    WITH CHECK ((SELECT public.has_any_action(ARRAY['revenue.create', 'revenue.edit', 'revenue.manage'])));

REVOKE ALL ON public.sales_order_half_comm FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_half_comm TO authenticated;
GRANT ALL ON public.sales_order_half_comm TO service_role;

INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('sales_order_half_comm', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_half_comm', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_half_comm', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('sales_order_half_comm');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('sales_order_half_comm', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('sales_order_half_comm');

SELECT public.audit_register('sales_order_half_comm', 'Bills paid half commission', 'Revenue', '{revenue}', 'all',
    p_keys => '{order_id}', p_labels => '{note}');

-- ─── 2. The list's rules, refused at the table ──────────────────────────────

CREATE OR REPLACE FUNCTION public.sales_order_half_comm_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_sub      UUID;
    v_month    DATE;
BEGIN
    v_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.order_id ELSE NEW.order_id END;
    IF TG_OP = 'UPDATE' AND NEW.order_id <> OLD.order_id THEN
        RAISE EXCEPTION 'Half comm belongs to one bill; take it off and put a new one on';
    END IF;

    SELECT b.sub_department_id, o.period_month INTO v_sub, v_month
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.id = v_order_id;

    -- What a month pays on is what its run paid. Same refusal as Don't count,
    -- Share and Move.
    IF FOUND AND commission_order_period_locked(v_sub, v_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing what its bills pay.',
            to_char(v_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    -- NOT FOUND on a DELETE: the bill itself went first (ON DELETE CASCADE).
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_half_comm_guard ON public.sales_order_half_comm;
CREATE TRIGGER sales_order_half_comm_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_half_comm
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_half_comm_guard();

-- ─── 3. Half comm ───────────────────────────────────────────────────────────
--
-- SECURITY INVOKER, as revenue_exclude_order: the caller's own policies and
-- the registry's guards answer who may.

CREATE OR REPLACE FUNCTION public.revenue_half_comm_order(p_order_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_order sales_orders%ROWTYPE;
    v_sub   UUID;
    v_note  TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
BEGIN
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is no longer in the portal. Refresh the page.';
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_order.batch_id;
    -- One writer per month at a time: the lock every write to its orders takes.
    PERFORM lock_commission_order_periods(v_sub, ARRAY[v_order.period_month]);

    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing what its bills pay.',
            to_char(v_order.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    IF EXISTS (SELECT 1 FROM sales_order_half_comm h WHERE h.order_id = p_order_id) THEN
        -- Already half: saying so again can only change why.
        IF v_note IS NOT NULL THEN
            UPDATE sales_order_half_comm SET note = v_note WHERE order_id = p_order_id;
        END IF;
        RETURN jsonb_build_object('orderNo', v_order.order_no, 'changed', false);
    END IF;

    IF v_order.cancelled THEN
        RAISE EXCEPTION '% does not count this month — count it again before halving its commission.', v_order.order_no
            USING ERRCODE = '23EXC';
    END IF;

    INSERT INTO sales_order_half_comm (order_id, note, set_by, set_by_name)
    SELECT p_order_id, v_note, u.id, u.name
      FROM (SELECT 1) one
      LEFT JOIN users u ON u.id = auth.uid();

    RETURN jsonb_build_object('orderNo', v_order.order_no, 'changed', true);
END;
$$;

COMMENT ON FUNCTION public.revenue_half_comm_order(UUID, TEXT) IS
    'Comm Cal › a bill''s menu › Half comm (2026-11-10): the bill''s own commission and its part of the override base are halved; its sales and KPI items stay whole. Refuses a month whose run has paid (23RUN) and a bill that does not count (23EXC). Saying it again only changes why.';

REVOKE ALL ON FUNCTION public.revenue_half_comm_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_half_comm_order(UUID, TEXT) TO authenticated;

-- ─── 4. Full comm again ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_full_comm_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_order sales_orders%ROWTYPE;
    v_sub   UUID;
BEGIN
    SELECT o.* INTO v_order FROM sales_orders o WHERE o.id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That bill is no longer in the portal. Refresh the page.';
    END IF;
    SELECT b.sub_department_id INTO v_sub FROM sales_import_batches b WHERE b.id = v_order.batch_id;
    PERFORM lock_commission_order_periods(v_sub, ARRAY[v_order.period_month]);

    IF commission_order_period_locked(v_sub, v_order.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing what its bills pay.',
            to_char(v_order.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23RUN';
    END IF;

    DELETE FROM sales_order_half_comm WHERE order_id = p_order_id;
    RETURN jsonb_build_object('orderNo', v_order.order_no, 'changed', FOUND);
END;
$$;

COMMENT ON FUNCTION public.revenue_full_comm_order(UUID) IS
    'Undo revenue_half_comm_order: the bill is paid its full commission again. Refuses a month whose run has paid (23RUN).';

REVOKE ALL ON FUNCTION public.revenue_full_comm_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_full_comm_order(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
