-- ════════════════════════════════════════════════════════════════════════════
-- No commission — a bill that still counts and pays nobody, by hand (2026-11-14)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. The user, splitting Comm Cal's *Don't count this bill…* in two (after
-- IT-0010 — SHAWN's ZNT6430, a bill he keyed for somebody else, had dragged
-- his November Zanotti margin to 11.8%):
--   "Down count（HR 那边）我觉得要分为两种：
--    1. 一种是指完全不出 commission，但他还是有算在 revenue，还有算在 margin 等等
--    2. 另外一种是不算 commission，同时也不算进 revenue、不算进 margin，跟他完全没有关系"
-- The second is the Don't count there already is (sales_order_exclusions →
-- the bill cancelled). The first is new. Asked what "no commission" leaves out,
-- with an RM example (a RM 10,000 bill at 6% pays RM 600; the leader's 2%
-- override on it RM 200), the user chose "整张单谁都不拿钱": NOBODY is paid on
-- the bill — no commission, no override on it, no KPI pay for its items — and it
-- counts everywhere else: its holder's sales (a rung, group sales, a group
-- incentive's target, the month's cards and Commissionable value, the Revenue
-- app, the Arena), the month's margin, and its KPI items' count on the
-- quantity ladder.
--
-- THE RULE: a row of sales_order_no_comm says its bill pays nothing. The
-- engine reads the list (`SalesOrder.noCommission`, loadCommissionInput), as it
-- reads Half comm's (mig 20261110160000), whose table this one mirrors.
-- Nothing here touches sales_orders: the ERP never writes this table, so
-- every re-send leaves it as it is, and a bill moved or shared keeps it (every
-- holder's part pays nothing). No commission on a half-comm bill takes the
-- half off — nothing is left to halve. Don't count on a no-commission bill
-- leaves this row under the exclusion, so *Count this bill again* brings it
-- back as it was (as Don't count does with Half comm). A bill that does not
-- count is refused (23EXC); a month whose run has paid, either way (23RUN).
--
-- Rollback (written as words — the database tool refuses a migration that
-- spells the statement): drop the two functions revenue_no_comm_order and
-- revenue_comm_again_order, the guard trigger and its function, the table
-- (every no-commission bill is paid again on its next computation), and the
-- table's rows in permission_table_writes, permission_table_reads and
-- audit_tables.
--
-- PGlite: tests/member-sql/validate-no-comm.mjs (the migration verbatim, twice).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The list ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_order_no_comm (
    order_id    UUID        PRIMARY KEY REFERENCES public.sales_orders (id) ON DELETE CASCADE,
    note        TEXT,
    set_by      UUID        REFERENCES public.users (id) ON DELETE SET NULL,
    set_by_name TEXT,
    set_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sales_order_no_comm_note CHECK (note IS NULL OR char_length(note) <= 500)
);

COMMENT ON TABLE public.sales_order_no_comm IS
    'Bills that count and pay nobody, by hand (Comm Cal › a bill''s menu › Don''t count this bill… › No commission, 2026-11-14): the engine pays no commission, no override and no KPI on the bill; its sales, its margin and its KPI items'' count stay. Written by revenue_no_comm_order / revenue_comm_again_order.';
COMMENT ON COLUMN public.sales_order_no_comm.note IS
    'Why, in the words of whoever decided — the Status chip''s tooltip.';

ALTER TABLE public.sales_order_no_comm ENABLE ROW LEVEL SECURITY;

-- Which rows: whoever reads a month's bills reads which pay nothing; whoever
-- works them writes it. The registry's RESTRICTIVE guards below ask the same.
DROP POLICY IF EXISTS sales_order_no_comm_read ON public.sales_order_no_comm;
CREATE POLICY sales_order_no_comm_read ON public.sales_order_no_comm
    FOR SELECT TO authenticated
    USING ((SELECT public.has_any_action(ARRAY['revenue.view:own', 'revenue.create', 'revenue.edit', 'revenue.manage'])));

DROP POLICY IF EXISTS sales_order_no_comm_write ON public.sales_order_no_comm;
CREATE POLICY sales_order_no_comm_write ON public.sales_order_no_comm
    FOR ALL TO authenticated
    USING ((SELECT public.has_any_action(ARRAY['revenue.create', 'revenue.edit', 'revenue.manage'])))
    WITH CHECK ((SELECT public.has_any_action(ARRAY['revenue.create', 'revenue.edit', 'revenue.manage'])));

REVOKE ALL ON public.sales_order_no_comm FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_order_no_comm TO authenticated;
GRANT ALL ON public.sales_order_no_comm TO service_role;

INSERT INTO public.permission_table_writes (table_name, command, actions) VALUES
  ('sales_order_no_comm', 'DELETE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_no_comm', 'INSERT', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage']),
  ('sales_order_no_comm', 'UPDATE', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage'])
ON CONFLICT (table_name, command) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_writes_guard('sales_order_no_comm');

INSERT INTO public.permission_table_reads (table_name, actions) VALUES
  ('sales_order_no_comm', ARRAY['revenue.create', 'revenue.edit', 'revenue.manage', 'revenue.view:own'])
ON CONFLICT (table_name) DO UPDATE SET actions = EXCLUDED.actions;
SELECT public.permission_reads_guard('sales_order_no_comm');

SELECT public.audit_register('sales_order_no_comm', 'Bills paid no commission', 'Revenue', '{revenue}', 'all',
    p_keys => '{order_id}', p_labels => '{note}');

-- ─── 2. The list's rules, refused at the table ──────────────────────────────

CREATE OR REPLACE FUNCTION public.sales_order_no_comm_guard()
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
        RAISE EXCEPTION 'No commission belongs to one bill; take it off and put a new one on';
    END IF;

    SELECT b.sub_department_id, o.period_month INTO v_sub, v_month
      FROM sales_orders o JOIN sales_import_batches b ON b.id = o.batch_id
     WHERE o.id = v_order_id;

    -- What a month pays on is what its run paid. Same refusal as Don't count,
    -- Half comm, Share and Move.
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

DROP TRIGGER IF EXISTS sales_order_no_comm_guard ON public.sales_order_no_comm;
CREATE TRIGGER sales_order_no_comm_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.sales_order_no_comm
    FOR EACH ROW EXECUTE FUNCTION public.sales_order_no_comm_guard();

-- ─── 3. No commission ───────────────────────────────────────────────────────
--
-- SECURITY INVOKER, as revenue_exclude_order and revenue_half_comm_order: the
-- caller's own policies and the registry's guards answer who may.

CREATE OR REPLACE FUNCTION public.revenue_no_comm_order(p_order_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_order sales_orders%ROWTYPE;
    v_sub   UUID;
    v_note  TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
    v_half  BOOLEAN;
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

    IF EXISTS (SELECT 1 FROM sales_order_no_comm n WHERE n.order_id = p_order_id) THEN
        -- Already paying nothing: saying so again can only change why.
        IF v_note IS NOT NULL THEN
            UPDATE sales_order_no_comm SET note = v_note WHERE order_id = p_order_id;
        END IF;
        RETURN jsonb_build_object('orderNo', v_order.order_no, 'changed', false, 'halfCommOff', false);
    END IF;

    IF v_order.cancelled THEN
        RAISE EXCEPTION '% does not count this month — count it again before taking its commission off.', v_order.order_no
            USING ERRCODE = '23EXC';
    END IF;

    INSERT INTO sales_order_no_comm (order_id, note, set_by, set_by_name)
    SELECT p_order_id, v_note, u.id, u.name
      FROM (SELECT 1) one
      LEFT JOIN users u ON u.id = auth.uid();

    -- Nothing is left to halve: a half-comm bill pays nothing now.
    DELETE FROM sales_order_half_comm WHERE order_id = p_order_id;
    v_half := FOUND;

    RETURN jsonb_build_object('orderNo', v_order.order_no, 'changed', true, 'halfCommOff', v_half);
END;
$$;

COMMENT ON FUNCTION public.revenue_no_comm_order(UUID, TEXT) IS
    'Comm Cal › a bill''s menu › Don''t count this bill… › No commission (2026-11-14): nobody is paid on the bill — no commission, no override, no KPI — while it counts in sales, margin and the KPI count. Takes a half comm off. Refuses a month whose run has paid (23RUN) and a bill that does not count (23EXC). Saying it again only changes why.';

REVOKE ALL ON FUNCTION public.revenue_no_comm_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_no_comm_order(UUID, TEXT) TO authenticated;

-- ─── 4. Commission again ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revenue_comm_again_order(p_order_id UUID)
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

    DELETE FROM sales_order_no_comm WHERE order_id = p_order_id;
    RETURN jsonb_build_object('orderNo', v_order.order_no, 'changed', FOUND);
END;
$$;

COMMENT ON FUNCTION public.revenue_comm_again_order(UUID) IS
    'Undo revenue_no_comm_order: the bill pays its commission (and the override and KPI on it) again. Refuses a month whose run has paid (23RUN).';

REVOKE ALL ON FUNCTION public.revenue_comm_again_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_comm_again_order(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
