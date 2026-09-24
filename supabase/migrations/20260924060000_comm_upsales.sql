-- ════════════════════════════════════════════════════════════════════════════
-- Upsales HR records by hand (2026-09-24)
-- ════════════════════════════════════════════════════════════════════════════
--
-- A customer adds to an order they placed earlier — a protector at the next
-- fair, a second mattress, a bedframe upgrade. The first sale's commission was
-- paid long ago, so only the ADDED amount earns (user 2026-09-24: 它是跟着
-- upsells 的 amount 来算 commission，因为 before that 那个 sales 的 commission
-- 已经算去了的嘛). August's claim form carries eleven of them.
--
-- The ERP cannot tell the portal what was added. It has no upsale concept (no
-- field, no code); of August's eleven, two are their own priced line on the old
-- document, five are folded into an existing price and invisible, three old
-- numbers are not in the ERP at all, and one raised a new bill. The old
-- documents all came over from AutoCount on 2026-08-28, so nothing even dates
-- the change. So HR records it here (user's choice, 2026-09-24).
--
-- THE RULES, read off the August claim form:
--   * paid at the salesperson's own rate, like their own sales;
--   * counts toward the upline's override — Yuny's override base (RM 158,554)
--     and Louis's (RM 66,144) are their claim totals WITH their upsales;
--   * paid in the month it is recorded under; HR records it once the customer
--     has paid, so the deposit gate does not ask;
--   * not a bill: no Open Bill, no KPI, no margin.
-- The run reads these rows by month and hands each to the engine as a one-line
-- order flagged `upsale` (`lib/commission/upsales.ts`). It is never released
-- and never carried: a row belongs to exactly one month.
--
-- Rollback: DROP TABLE comm_upsales CASCADE; DROP FUNCTION comm_upsales_guard();
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comm_upsales (
    id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_department_id UUID           NOT NULL REFERENCES comm_sub_departments (id) ON DELETE RESTRICT,
    -- The month whose run pays it. Chosen by HR, not derived from sold_on.
    period_month      DATE           NOT NULL,
    staff_id          UUID           NOT NULL REFERENCES hr_staff_costs (id) ON DELETE RESTRICT,
    amount            NUMERIC(15, 2) NOT NULL,
    sold_on           DATE           NOT NULL,
    fair_event_id     UUID           REFERENCES comm_venue_events (id) ON DELETE SET NULL,
    -- The paper bill it was added to, e.g. HC5315 — how the claim form names it.
    original_ref      TEXT           NOT NULL,
    note              TEXT,
    created_by        UUID           DEFAULT auth.uid(),
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_by        UUID,
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT comm_upsales_month_is_first CHECK (period_month = DATE_TRUNC('month', period_month)::DATE),
    CONSTRAINT comm_upsales_amount_positive CHECK (amount > 0),
    CONSTRAINT comm_upsales_ref_present CHECK (BTRIM(original_ref) <> '')
);

CREATE INDEX IF NOT EXISTS idx_comm_upsales_sub_period ON comm_upsales (sub_department_id, period_month);
CREATE INDEX IF NOT EXISTS idx_comm_upsales_staff ON comm_upsales (staff_id);

COMMENT ON TABLE comm_upsales IS
    'Upsales HR records by hand: an amount a customer added to an earlier order, paid at the salesperson''s own rate in period_month and counted toward the upline''s override. Not a bill — no Open Bill, KPI, margin or deposit gate. Read by the run as one-line orders (lib/commission/upsales.ts).';

-- ─── A paid month's upsales do not move ─────────────────────────────────────

CREATE OR REPLACE FUNCTION comm_upsales_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
    -- What a run paid is what these rows said when it paid. Same refusal as
    -- moving, sharing or recosting a bill in that month.
    IF TG_OP IN ('UPDATE', 'DELETE')
       AND commission_order_period_locked(OLD.sub_department_id, OLD.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before changing its upsales.',
            TO_CHAR(OLD.period_month, 'Mon YYYY')
            USING ERRCODE = '23RUN';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND commission_order_period_locked(NEW.sub_department_id, NEW.period_month) THEN
        RAISE EXCEPTION 'The run for % has paid. Reopen it before recording an upsale in it.',
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

DROP TRIGGER IF EXISTS comm_upsales_guard ON comm_upsales;
CREATE TRIGGER comm_upsales_guard
    BEFORE INSERT OR UPDATE OR DELETE ON comm_upsales
    FOR EACH ROW
    EXECUTE FUNCTION comm_upsales_guard();

-- ─── Who may see and change it: whoever runs the commission ─────────────────

ALTER TABLE comm_upsales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comm_upsales_hr_all ON comm_upsales;
CREATE POLICY comm_upsales_hr_all ON comm_upsales
    FOR ALL
    USING ((SELECT has_scope(ARRAY['hr'])))
    WITH CHECK ((SELECT has_scope(ARRAY['hr'])));

DROP POLICY IF EXISTS comm_upsales_principal_all ON comm_upsales;
CREATE POLICY comm_upsales_principal_all ON comm_upsales
    FOR ALL
    USING ((SELECT has_scope(ARRAY['admin'])))
    WITH CHECK ((SELECT has_scope(ARRAY['admin'])));

GRANT SELECT, INSERT, UPDATE, DELETE ON comm_upsales TO authenticated;

NOTIFY pgrst, 'reload schema';
