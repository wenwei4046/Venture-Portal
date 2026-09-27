-- ════════════════════════════════════════════════════════════════════════════
-- Close a salesperson's month: their commission, locked (2026-09-27)
--
-- User 2026-09-27: 因为这里是做计算，我需要一个类似 close 的 button … 比如说我是
-- 15 号 close，那我 15 号按 complete close 时，他们全部人的 commission 就会被
-- lock 住。后续怎么接 payroll 那边，我后面再接着写。 And: close one person at a
-- time from inside their ledger, or tick several — or everybody — on the list.
--
-- Comm Cal works the month out LIVE every time it opens. A close keeps one
-- person's figure as it stood when somebody checked it and said "done":
--
--   comm_salesperson_closes — one row per close. While `reopened_at` is null it
--   is THE figure for (sub-department, month, person), whatever the live
--   calculation says afterwards; the page shows both when they differ.
--   Reopening stamps the row and leaves it as history; closing again writes a
--   new one. The locked columns can never be edited (trigger below).
--
-- What a close keeps is what the payroll step will need, so that step can be
-- built from the closes instead of from a fresh calculation: the engine's
-- statement in save_commission_run's own element shape, the bills it releases,
-- holds and cuts for margin — and the row the table showed, and the ids of the
-- person's own bills (their edits are refused while they are closed; the
-- server actions ask, since the ERP receiver also writes those tables and must
-- never be refused).
--
-- Upsales and drops are refused HERE, by trigger: a confirmed one is paid in
-- the month it is recorded under, so confirming one into a closed person's
-- month would be paid nowhere. SQLSTATE 23CLS, like 23RUN for a paid run.
-- Pending rows — what the ERP receiver writes — are never touched by it.
--
-- Nothing here changes what any run, payroll row or member screen reads.
--
-- Rollback:
--   DROP FUNCTION comm_reopen_salespeople(UUID, DATE, UUID[]);
--   DROP FUNCTION comm_close_salespeople(UUID, DATE, JSONB, UUID);
--   DROP TRIGGER comm_upsales_closed_month ON comm_upsales;
--   DROP FUNCTION comm_upsales_closed_month_guard();
--   DROP FUNCTION comm_staff_month_closed(UUID, DATE, UUID);
--   DROP TABLE comm_salesperson_closes;   -- with its trigger and function
--   DROP FUNCTION comm_salesperson_closes_guard();
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. The closes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comm_salesperson_closes (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_department_id   UUID          NOT NULL REFERENCES comm_sub_departments(id) ON DELETE RESTRICT,
    period_month        DATE          NOT NULL,
    staff_id            UUID          NOT NULL REFERENCES hr_staff_costs(id) ON DELETE RESTRICT,
    total_commission    NUMERIC(15,2) NOT NULL,
    personal_commission NUMERIC(15,2) NOT NULL,
    override_commission NUMERIC(15,2) NOT NULL,
    group_incentive     NUMERIC(15,2) NOT NULL DEFAULT 0,
    -- The table row as it stood (lib/commission/closes.ts CloseSummary).
    summary             JSONB         NOT NULL,
    -- save_commission_run's p_statements element; NULL for a person the run
    -- would skip (nothing sold, nothing earned, nothing held).
    statement           JSONB,
    released_orders     JSONB         NOT NULL DEFAULT '[]'::JSONB,
    deferred_orders     JSONB         NOT NULL DEFAULT '[]'::JSONB,
    penalised_orders    JSONB         NOT NULL DEFAULT '[]'::JSONB,
    order_ids           UUID[]        NOT NULL DEFAULT '{}',
    -- The month's run the page was replaying when the figure was taken, if any.
    run_id              UUID          REFERENCES comm_runs(id) ON DELETE SET NULL,
    closed_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    closed_by           UUID          REFERENCES users(id) ON DELETE SET NULL,
    closed_by_name      TEXT,
    reopened_at         TIMESTAMPTZ,
    reopened_by         UUID          REFERENCES users(id) ON DELETE SET NULL,
    reopened_by_name    TEXT,
    CONSTRAINT comm_salesperson_closes_month_is_first
        CHECK (period_month = DATE_TRUNC('month', period_month)::DATE),
    CONSTRAINT comm_salesperson_closes_summary_is_object
        CHECK (JSONB_TYPEOF(summary) = 'object'),
    CONSTRAINT comm_salesperson_closes_lists_are_arrays
        CHECK (JSONB_TYPEOF(released_orders) = 'array'
           AND JSONB_TYPEOF(deferred_orders) = 'array'
           AND JSONB_TYPEOF(penalised_orders) = 'array')
);

-- One standing close per person per month; reopened ones are history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_salesperson_close_standing
    ON comm_salesperson_closes (sub_department_id, period_month, staff_id)
    WHERE reopened_at IS NULL;

-- "Is any standing close holding this bill?" — the server actions' check.
CREATE INDEX IF NOT EXISTS ix_comm_salesperson_close_orders
    ON comm_salesperson_closes USING GIN (order_ids)
    WHERE reopened_at IS NULL;

COMMENT ON TABLE comm_salesperson_closes IS
    'A salesperson''s month closed on Comm Cal (2026-09-27): their commission locked at the figure somebody checked. While reopened_at is NULL it is the figure for (sub_department_id, period_month, staff_id), whatever the live calculation says since; reopening stamps the row and keeps it as history. Keeps save_commission_run''s statement shape and the bills released / held / cut, for the payroll step to build on. Written by comm_close_salespeople / comm_reopen_salespeople.';
COMMENT ON COLUMN comm_salesperson_closes.summary IS
    'The salesperson table''s row as it stood (lib/commission/closes.ts CloseSummary, version 1): sales value, commissionable, bills, upsell, drops, group sales, margin, personal, overriding, total — and each bill''s and each downline''s amount, which is how the page names what moved since.';
COMMENT ON COLUMN comm_salesperson_closes.order_ids IS
    'The person''s own bills (shared parts included, upsales not): an Open Bill pick, share, exclusion or keyed margin on one of them is refused while this close stands.';

ALTER TABLE comm_salesperson_closes ENABLE ROW LEVEL SECURITY;

-- HR or the Principal, like every comm_* table — but per command rather than
-- FOR ALL, because there is no DELETE: a close is reopened, never erased.
DROP POLICY IF EXISTS comm_salesperson_closes_read ON comm_salesperson_closes;
CREATE POLICY comm_salesperson_closes_read ON comm_salesperson_closes
    FOR SELECT TO authenticated
    USING ((SELECT has_scope(ARRAY['hr', 'admin'])));

DROP POLICY IF EXISTS comm_salesperson_closes_close ON comm_salesperson_closes;
CREATE POLICY comm_salesperson_closes_close ON comm_salesperson_closes
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT has_scope(ARRAY['hr', 'admin'])));

DROP POLICY IF EXISTS comm_salesperson_closes_reopen ON comm_salesperson_closes;
CREATE POLICY comm_salesperson_closes_reopen ON comm_salesperson_closes
    FOR UPDATE TO authenticated
    USING ((SELECT has_scope(ARRAY['hr', 'admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr', 'admin'])));

-- The schema's default privileges hand every new table to anon and
-- authenticated whole; take back what a close must never allow.
REVOKE ALL ON comm_salesperson_closes FROM anon;
REVOKE DELETE, TRUNCATE ON comm_salesperson_closes FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON comm_salesperson_closes TO authenticated;

-- ─── 2. A close is locked ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION comm_salesperson_closes_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    IF OLD.reopened_at IS NOT NULL THEN
        RAISE EXCEPTION 'That close was reopened already — it is history now'
            USING ERRCODE = '23CLS';
    END IF;
    -- The only change a standing close takes is its reopening.
    IF NEW.reopened_at IS NULL
       OR ROW(NEW.sub_department_id, NEW.period_month, NEW.staff_id, NEW.total_commission,
              NEW.personal_commission, NEW.override_commission, NEW.group_incentive, NEW.summary,
              NEW.statement, NEW.released_orders, NEW.deferred_orders, NEW.penalised_orders,
              NEW.order_ids, NEW.run_id, NEW.closed_at, NEW.closed_by, NEW.closed_by_name)
          IS DISTINCT FROM
          ROW(OLD.sub_department_id, OLD.period_month, OLD.staff_id, OLD.total_commission,
              OLD.personal_commission, OLD.override_commission, OLD.group_incentive, OLD.summary,
              OLD.statement, OLD.released_orders, OLD.deferred_orders, OLD.penalised_orders,
              OLD.order_ids, OLD.run_id, OLD.closed_at, OLD.closed_by, OLD.closed_by_name) THEN
        RAISE EXCEPTION 'A closed month is locked — reopen it to change anything'
            USING ERRCODE = '23CLS';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS comm_salesperson_closes_guard ON comm_salesperson_closes;
CREATE TRIGGER comm_salesperson_closes_guard
    BEFORE UPDATE ON comm_salesperson_closes
    FOR EACH ROW EXECUTE FUNCTION comm_salesperson_closes_guard();

-- ─── 3. Is this person's month closed ───────────────────────────────────────
--
-- SECURITY DEFINER for the reason sales_order_excluded_by_hand is: the upsale
-- trigger below must reach the same verdict whoever writes the row.

CREATE OR REPLACE FUNCTION comm_staff_month_closed(p_sub_department_id UUID, p_period DATE, p_staff_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM comm_salesperson_closes
         WHERE sub_department_id = p_sub_department_id
           AND period_month = p_period
           AND staff_id = p_staff_id
           AND reopened_at IS NULL
    );
$fn$;

COMMENT ON FUNCTION comm_staff_month_closed(UUID, DATE, UUID) IS
    'True while the person''s month is closed on Comm Cal (a standing comm_salesperson_closes row).';

REVOKE ALL ON FUNCTION comm_staff_month_closed(UUID, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comm_staff_month_closed(UUID, DATE, UUID) TO authenticated, service_role;

-- ─── 4. No upsale or drop paid into a closed month ──────────────────────────
--
-- Only CONFIRMED rows are paid (the run reads nothing else), so only a change
-- that makes, moves, alters or unmakes a confirmed row is asked about. The
-- ERP receiver writes pending rows only: this never refuses a delivery.

CREATE OR REPLACE FUNCTION comm_upsales_closed_month_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
    v_name TEXT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'confirmed'
       AND (TG_OP = 'DELETE'
            OR ROW(NEW.status, NEW.period_month, NEW.staff_id, NEW.amount, NEW.sub_department_id)
               IS DISTINCT FROM ROW(OLD.status, OLD.period_month, OLD.staff_id, OLD.amount, OLD.sub_department_id))
       AND comm_staff_month_closed(OLD.sub_department_id, OLD.period_month, OLD.staff_id) THEN
        SELECT employee_name INTO v_name FROM hr_staff_costs WHERE id = OLD.staff_id;
        RAISE EXCEPTION '%''s % is closed. Reopen it on Comm Cal before changing what it pays.',
            COALESCE(v_name, 'This salesperson'), TO_CHAR(OLD.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23CLS';
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'confirmed'
       AND (TG_OP = 'INSERT'
            OR ROW(NEW.status, NEW.period_month, NEW.staff_id, NEW.amount, NEW.sub_department_id)
               IS DISTINCT FROM ROW(OLD.status, OLD.period_month, OLD.staff_id, OLD.amount, OLD.sub_department_id))
       AND comm_staff_month_closed(NEW.sub_department_id, NEW.period_month, NEW.staff_id) THEN
        SELECT employee_name INTO v_name FROM hr_staff_costs WHERE id = NEW.staff_id;
        RAISE EXCEPTION '%''s % is closed. Reopen it on Comm Cal, or pay this in a later month.',
            COALESCE(v_name, 'This salesperson'), TO_CHAR(NEW.period_month, 'FMMonth YYYY')
            USING ERRCODE = '23CLS';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS comm_upsales_closed_month ON comm_upsales;
CREATE TRIGGER comm_upsales_closed_month
    BEFORE INSERT OR UPDATE OR DELETE ON comm_upsales
    FOR EACH ROW EXECUTE FUNCTION comm_upsales_closed_month_guard();

COMMENT ON FUNCTION comm_upsales_closed_month_guard() IS
    'Refuses (23CLS) a confirmed upsale or drop made, moved, changed or taken back in a month the salesperson has closed on Comm Cal: it is paid in its own month, so it would be paid nowhere. Pending rows — the ERP receiver''s — are never refused.';

-- ─── 5. Close ───────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER: RLS (HR or Principal) is the outer wall. The server action
-- computed every figure from the month as saved and checked each against what
-- the page showed; this writes them all or none.

CREATE OR REPLACE FUNCTION comm_close_salespeople(
    p_sub_department_id UUID,
    p_period            DATE,
    p_closes            JSONB,
    p_run_id            UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_first DATE;
    v_taken TEXT;
    v_name  TEXT;
    v_count INTEGER;
BEGIN
    IF NOT has_scope(ARRAY['hr', 'admin']) THEN
        RAISE EXCEPTION 'Only HR or the Principal may close a salesperson''s month'
            USING ERRCODE = '42501';
    END IF;
    IF p_period IS NULL OR p_period <> DATE_TRUNC('month', p_period)::DATE THEN
        RAISE EXCEPTION 'A month is its first day, e.g. 2026-09-01';
    END IF;
    IF p_closes IS NULL OR JSONB_TYPEOF(p_closes) <> 'array' OR JSONB_ARRAY_LENGTH(p_closes) = 0 THEN
        RAISE EXCEPTION 'Say who to close';
    END IF;

    -- A month settled before the portal pays has nothing to lock.
    v_first := comm_first_paid_month(p_sub_department_id);
    IF v_first IS NOT NULL AND p_period < v_first THEN
        RAISE EXCEPTION '% was settled by hand before the portal started paying — there is nothing to close',
            TO_CHAR(p_period, 'FMMonth YYYY')
            USING ERRCODE = '23CLS';
    END IF;

    -- Already closed: say who, and close nobody.
    SELECT STRING_AGG(s.employee_name, ', ' ORDER BY s.employee_name) INTO v_taken
      FROM comm_salesperson_closes c
      JOIN hr_staff_costs s ON s.id = c.staff_id
     WHERE c.sub_department_id = p_sub_department_id
       AND c.period_month = p_period
       AND c.reopened_at IS NULL
       AND c.staff_id IN (SELECT (e->>'staff_id')::UUID FROM JSONB_ARRAY_ELEMENTS(p_closes) e);
    IF v_taken IS NOT NULL THEN
        RAISE EXCEPTION '% already closed for % — refresh the page', v_taken, TO_CHAR(p_period, 'FMMonth YYYY')
            USING ERRCODE = '23CLS';
    END IF;

    SELECT u.name INTO v_name FROM users u WHERE u.id = auth.uid();

    INSERT INTO comm_salesperson_closes (
        sub_department_id, period_month, staff_id,
        total_commission, personal_commission, override_commission, group_incentive,
        summary, statement, released_orders, deferred_orders, penalised_orders, order_ids,
        run_id, closed_by, closed_by_name)
    SELECT p_sub_department_id, p_period, (e->>'staff_id')::UUID,
           ROUND((e->>'total_commission')::NUMERIC, 2),
           ROUND((e->>'personal_commission')::NUMERIC, 2),
           ROUND((e->>'override_commission')::NUMERIC, 2),
           ROUND(COALESCE((e->>'group_incentive')::NUMERIC, 0), 2),
           e->'summary',
           NULLIF(e->'statement', 'null'::JSONB),
           COALESCE(e->'released_orders', '[]'::JSONB),
           COALESCE(e->'deferred_orders', '[]'::JSONB),
           COALESCE(e->'penalised_orders', '[]'::JSONB),
           COALESCE(ARRAY(SELECT JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(e->'order_ids', '[]'::JSONB))::UUID), '{}'),
           p_run_id, auth.uid(), v_name
      FROM JSONB_ARRAY_ELEMENTS(p_closes) e;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Somebody was named twice, or closed meanwhile — refresh the page'
        USING ERRCODE = '23CLS';
END;
$fn$;

COMMENT ON FUNCTION comm_close_salespeople(UUID, DATE, JSONB, UUID) IS
    'Closes salespeople''s month on Comm Cal, all or none: one comm_salesperson_closes row per element of p_closes (lib/commission/closes.ts CloseSnapshot). Refuses a month settled before the portal pays and anybody already closed (23CLS).';

REVOKE ALL ON FUNCTION comm_close_salespeople(UUID, DATE, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comm_close_salespeople(UUID, DATE, JSONB, UUID) TO authenticated;

-- ─── 6. Reopen ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION comm_reopen_salespeople(
    p_sub_department_id UUID,
    p_period            DATE,
    p_staff_ids         UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
    v_name  TEXT;
    v_count INTEGER;
BEGIN
    IF NOT has_scope(ARRAY['hr', 'admin']) THEN
        RAISE EXCEPTION 'Only HR or the Principal may reopen a salesperson''s month'
            USING ERRCODE = '42501';
    END IF;
    IF p_staff_ids IS NULL OR CARDINALITY(p_staff_ids) = 0 THEN
        RAISE EXCEPTION 'Say who to reopen';
    END IF;

    SELECT u.name INTO v_name FROM users u WHERE u.id = auth.uid();

    UPDATE comm_salesperson_closes
       SET reopened_at      = NOW(),
           reopened_by      = auth.uid(),
           reopened_by_name = v_name
     WHERE sub_department_id = p_sub_department_id
       AND period_month = p_period
       AND staff_id = ANY (p_staff_ids)
       AND reopened_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION comm_reopen_salespeople(UUID, DATE, UUID[]) IS
    'Reopens salespeople''s closed month on Comm Cal: their close becomes history and the live calculation is their figure again. Returns how many were closed.';

REVOKE ALL ON FUNCTION comm_reopen_salespeople(UUID, DATE, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comm_reopen_salespeople(UUID, DATE, UUID[]) TO authenticated;
