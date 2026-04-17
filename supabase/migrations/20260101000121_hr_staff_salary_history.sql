-- ============================================================================
-- 20260101000121_hr_staff_salary_history.sql
-- Spec 1 (HR Payroll Redesign) — audit trail for basic_salary changes
-- HOUZS Venture Portal
--
-- Problem: basic_salary on hr_staff_costs is overwritten in place — once HR
-- edits a row, the old value is lost. Monthly payroll records need to know
-- "what was the basic on April 1?" even after a May raise.
--
-- Solution: BEFORE UPDATE trigger captures old→new and effective date (= next
-- month's first day, since payroll runs monthly). Stored permanently.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: hr_staff_salary_history
-- ----------------------------------------------------------------------------

CREATE TABLE hr_staff_salary_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES hr_staff_costs(id) ON DELETE CASCADE,
    old_basic DECIMAL(15, 2) NOT NULL,
    new_basic DECIMAL(15, 2) NOT NULL,
    effective_from DATE NOT NULL,
    changed_by UUID REFERENCES users(id),  -- nullable: system updates (seeds, service role) have no auth.uid()
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT,

    CONSTRAINT basics_differ CHECK (old_basic <> new_basic),
    CONSTRAINT effective_from_first_of_month CHECK (EXTRACT(DAY FROM effective_from) = 1)
);

COMMENT ON TABLE hr_staff_salary_history IS
    'Spec 1: audit trail for hr_staff_costs.basic_salary changes. Write-once via BEFORE UPDATE trigger; no direct INSERTs.';

CREATE INDEX idx_hr_salary_history_staff_effective
    ON hr_staff_salary_history (staff_id, effective_from DESC);

-- ----------------------------------------------------------------------------
-- TRIGGER FUNCTION: hr_staff_salary_history_on_update
-- Fires BEFORE UPDATE of basic_salary only when value actually changes.
-- effective_from = first day of NEXT month (salary raise takes effect next pay cycle).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION hr_staff_salary_history_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.basic_salary IS DISTINCT FROM NEW.basic_salary THEN
        INSERT INTO hr_staff_salary_history (
            staff_id, old_basic, new_basic, effective_from, changed_by
        ) VALUES (
            NEW.id,
            OLD.basic_salary,
            NEW.basic_salary,
            date_trunc('month', NOW())::DATE + INTERVAL '1 month',
            auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_staff_salary_history
    BEFORE UPDATE OF basic_salary ON hr_staff_costs
    FOR EACH ROW
    EXECUTE FUNCTION hr_staff_salary_history_on_update();

-- ----------------------------------------------------------------------------
-- RLS: principal + hr SELECT. No direct INSERT/UPDATE/DELETE (trigger-only).
-- ----------------------------------------------------------------------------

ALTER TABLE hr_staff_salary_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Principal and HR can view salary history"
    ON hr_staff_salary_history
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
              AND users.role IN ('principal', 'hr')
        )
    );

-- No INSERT / UPDATE / DELETE policies → direct writes blocked for all roles.
-- The trigger function is SECURITY DEFINER so it bypasses RLS when inserting
-- the audit row. Same pattern as cancel_loan_and_approval in migration 000017.
