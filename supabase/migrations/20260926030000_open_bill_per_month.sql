-- ════════════════════════════════════════════════════════════════════════════
-- Open Bill for one month · no run for a month settled by hand (2026-09-26)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY. August 2026 was paid from the claim form, Open Bill included: 80 bills,
-- RM 12,969.78, each the bill's commission × 50 / 40 / 30 % for the event
-- day's 1st / 2nd / 3rd bill — exactly the portal's own rule. The portal's
-- switch was off, and it stays off for September (user 2026-09-26: "open for
-- august, not september"). The switch was the scheme's: one for every month.
--
-- 1. comm_open_bill_months — Open Bill set for ONE month over the scheme's
--    default. comm_open_bill_on(sub, month) is the one rule every reader asks.
-- 2. guard_open_bill_scope (a pick), erp_sync_suggest_open_bill_days (the
--    feed's suggestions) and commit_sales_import_batch (a file's suggestions
--    and the picks it keeps) ask it for the ORDER'S month, not the scheme.
-- 3. comm_runs_before_cutover — a month before the first month the portal
--    pays (comm_cutovers) takes no run: a clean compute syncs to payroll, and
--    that month's pay was made by hand.
--
-- Rollback: drop comm_runs_before_cutover (trigger + function), re-apply
-- 20260911020000's guard_open_bill_scope, 20260926010000's
-- commit_sales_import_batch and the live erp_sync_suggest_open_bill_days,
-- drop comm_open_bill_on and comm_open_bill_months.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Open Bill for one month ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comm_open_bill_months (
    sub_department_id UUID        NOT NULL REFERENCES comm_sub_departments(id) ON DELETE RESTRICT,
    period_month      DATE        NOT NULL,
    enabled           BOOLEAN     NOT NULL,
    set_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
    set_by_name       TEXT,
    set_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (sub_department_id, period_month),
    CONSTRAINT comm_open_bill_months_month_is_first
        CHECK (period_month = DATE_TRUNC('month', period_month)::DATE)
);

COMMENT ON TABLE comm_open_bill_months IS
    'Open Bill switched on or off for ONE month of a sub-department, over the scheme''s enable_open_bill (2026-09-26: on for August 2026, which the claim form paid, while September stays off). No row = the scheme decides. Read through comm_open_bill_on().';

ALTER TABLE comm_open_bill_months ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_open_bill_months_hr_all ON comm_open_bill_months;
CREATE POLICY comm_open_bill_months_hr_all ON comm_open_bill_months
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS comm_open_bill_months_principal_all ON comm_open_bill_months;
CREATE POLICY comm_open_bill_months_principal_all ON comm_open_bill_months
    FOR ALL TO authenticated
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON comm_open_bill_months TO authenticated;

-- SECURITY DEFINER for the same reason as comm_first_paid_month: the feed, a
-- trigger and the pages must all see the same answer, whoever is asking.
CREATE OR REPLACE FUNCTION comm_open_bill_on(p_sub_department_id UUID, p_period DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT COALESCE(
        (SELECT m.enabled FROM comm_open_bill_months m
          WHERE m.sub_department_id = p_sub_department_id
            AND m.period_month = DATE_TRUNC('month', p_period)::DATE),
        (SELECT s.enable_open_bill FROM comm_schemes s
          WHERE s.sub_department_id = p_sub_department_id AND s.is_active AND s.effective_to IS NULL
          LIMIT 1),
        FALSE);
$fn$;

COMMENT ON FUNCTION comm_open_bill_on(UUID, DATE) IS
    'Whether Open Bill pays in this month of the sub-department: the month''s own setting (comm_open_bill_months), else the scheme''s enable_open_bill.';

-- ─── 2. The readers ask the order's month ───────────────────────────────────

CREATE OR REPLACE FUNCTION guard_open_bill_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
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
$fn$;

CREATE OR REPLACE FUNCTION erp_sync_suggest_open_bill_days(p_staff_id UUID, p_event_dates DATE[])
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
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
$fn$;

CREATE OR REPLACE FUNCTION public.commit_sales_import_batch(p_batch_id uuid, p_suggest_open_bills boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;

-- ─── 3. No run for a month settled by hand ──────────────────────────────────

CREATE OR REPLACE FUNCTION comm_runs_before_cutover()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_first DATE := comm_first_paid_month(NEW.sub_department_id);
BEGIN
    IF v_first IS NOT NULL AND NEW.period_month < v_first THEN
        RAISE EXCEPTION '% was settled by hand — the portal pays from %. It takes no run.',
            TO_CHAR(NEW.period_month, 'FMMonth YYYY'), TO_CHAR(v_first, 'FMMonth YYYY')
            USING ERRCODE = '23CUT';
    END IF;
    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION comm_runs_before_cutover() IS
    'A month before comm_cutovers.first_paid_month takes no commission run: a clean compute syncs to payroll, and that month was paid by hand (2026-09-26).';

DROP TRIGGER IF EXISTS comm_runs_before_cutover ON comm_runs;
CREATE TRIGGER comm_runs_before_cutover
    BEFORE INSERT OR UPDATE ON comm_runs
    FOR EACH ROW EXECUTE FUNCTION comm_runs_before_cutover();

-- ─── 4. Who may call what ───────────────────────────────────────────────────

REVOKE ALL ON FUNCTION comm_open_bill_on(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comm_open_bill_on(UUID, DATE) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
