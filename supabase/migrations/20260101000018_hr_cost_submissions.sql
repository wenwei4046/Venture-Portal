-- ============================================================================
-- 20260101000018_hr_cost_submissions.sql
-- Phase 2 Step 3 — immutable HR cost submission snapshots
-- HOUZS Venture Portal (VP)
--
-- Design (Decision 3A from docs/plan-phase2.md review):
-- - HR submits monthly cost data, creating an immutable snapshot row per period.
-- - Submission is the input to Step 5's generate_monthly_invoices() RPC.
-- - PII-sensitive columns (staff_snapshot, pool_allocation_snapshot,
--   staff_allocation_snapshot) are only readable by Principal + HR via RLS.
--   Finance reads aggregate totals via get_submitted_hr_summary() RPC which
--   projects columns to exclude the PII snapshots.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: hr_cost_submissions
-- ----------------------------------------------------------------------------

CREATE TABLE hr_cost_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL,
    submitted_by UUID NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Aggregate totals per department (Finance-safe, exposed via RPC).
    -- Keyed by department name. Structure:
    --   {
    --     "HR": {
    --       "department_id": "uuid",
    --       "staff_count": 3,
    --       "total_basic": 18000.00,
    --       "total_statutory": 2690.00,
    --       "total_allowance": 2500.00,
    --       "total_ctc": 23190.00
    --     },
    --     "Finance": {...},
    --     "Marketing": {...}
    --   }
    dept_summaries JSONB NOT NULL,

    -- Full staff + allocation snapshots. PII-sensitive — RLS blocks Finance.
    -- Consumed by Step 5's generate_monthly_invoices RPC via SECURITY DEFINER.
    staff_snapshot JSONB NOT NULL,
    pool_allocation_snapshot JSONB NOT NULL,
    staff_allocation_snapshot JSONB NOT NULL,

    notes TEXT,

    CONSTRAINT period_is_first_of_month
        CHECK (EXTRACT(DAY FROM period_month) = 1),
    CONSTRAINT uq_hr_cost_submissions_period UNIQUE (period_month)
);

COMMENT ON TABLE hr_cost_submissions IS
    'Phase 2 Step 3: immutable HR cost snapshot per period. dept_summaries is Finance-safe. staff_snapshot/pool_allocation_snapshot/staff_allocation_snapshot contain PII — RLS blocks Finance at the table level.';

CREATE INDEX idx_hr_cost_submissions_period ON hr_cost_submissions(period_month DESC);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

ALTER TABLE hr_cost_submissions ENABLE ROW LEVEL SECURITY;

-- Principal + HR see everything (PII access)
CREATE POLICY hr_cost_sub_ph_select ON hr_cost_submissions
    FOR SELECT USING (current_user_role() IN ('principal', 'hr'));

-- HR inserts (with submitted_by matching caller)
CREATE POLICY hr_cost_sub_hr_insert ON hr_cost_submissions
    FOR INSERT WITH CHECK (
        current_user_role() = 'hr'
        AND submitted_by = auth.uid()
    );

-- Immutable: no UPDATE, no DELETE (audit trail)
CREATE POLICY hr_cost_sub_no_update ON hr_cost_submissions
    FOR UPDATE USING (FALSE);
CREATE POLICY hr_cost_sub_no_delete ON hr_cost_submissions
    FOR DELETE USING (FALSE);

-- ----------------------------------------------------------------------------
-- RPC: build_hr_cost_submission_payload
-- Called by the submit Server Action. Runs as SECURITY DEFINER so it can
-- read all hr_staff_costs rows (PII) and compute the snapshot payload.
-- Internal role check restricts to HR + Principal.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION build_hr_cost_submission_payload(p_period DATE)
RETURNS TABLE (
    dept_summaries JSONB,
    staff_snapshot JSONB,
    pool_allocation_snapshot JSONB,
    staff_allocation_snapshot JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_dept_sum JSONB;
    v_staff_snap JSONB;
    v_pool_snap JSONB;
    v_staff_alloc_snap JSONB;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'build_hr_cost_submission_payload: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Aggregate per department, keyed by department name.
    SELECT COALESCE(
        jsonb_object_agg(d.name, jsonb_build_object(
            'department_id', d.id,
            'staff_count', t.staff_count,
            'total_basic', t.total_basic,
            'total_statutory', t.total_statutory,
            'total_allowance', t.total_allowance,
            'total_ctc', t.total_ctc
        )),
        '{}'::jsonb
    ) INTO v_dept_sum
    FROM (
        SELECT
            hsc.department_id,
            COUNT(*) AS staff_count,
            SUM(hsc.basic_salary) AS total_basic,
            SUM(COALESCE(hsc.epf_er, 0) + COALESCE(hsc.socso_er, 0) + COALESCE(hsc.eis_er, 0)) AS total_statutory,
            SUM(hsc.allowances) AS total_allowance,
            SUM(hsc.total_ctc) AS total_ctc
        FROM hr_staff_costs hsc
        WHERE hsc.status = 'active'
        GROUP BY hsc.department_id
    ) t
    JOIN departments d ON d.id = t.department_id;

    -- Full staff snapshot (PII)
    SELECT COALESCE(jsonb_agg(to_jsonb(hsc) ORDER BY hsc.employee_name), '[]'::jsonb)
    INTO v_staff_snap
    FROM hr_staff_costs hsc
    WHERE hsc.status = 'active';

    -- Pool allocation snapshot for the period
    SELECT COALESCE(jsonb_agg(to_jsonb(hpa)), '[]'::jsonb)
    INTO v_pool_snap
    FROM hr_pool_allocation hpa
    WHERE hpa.period_month = p_period;

    -- Staff allocation snapshot for the period
    SELECT COALESCE(jsonb_agg(to_jsonb(hsa)), '[]'::jsonb)
    INTO v_staff_alloc_snap
    FROM hr_staff_allocation hsa
    WHERE hsa.period_month = p_period;

    RETURN QUERY SELECT v_dept_sum, v_staff_snap, v_pool_snap, v_staff_alloc_snap;
END;
$$;

COMMENT ON FUNCTION build_hr_cost_submission_payload(DATE) IS
    'Phase 2 Step 3: assembles the HR cost snapshot payload for a given period. Used by the submitHRCostSummary Server Action. SECURITY DEFINER + internal role check (hr | principal).';

GRANT EXECUTE ON FUNCTION build_hr_cost_submission_payload(DATE) TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC: get_submitted_hr_summary
-- Finance-safe view of a submitted HR cost snapshot. Projects columns to
-- exclude the PII snapshots. SECURITY DEFINER + role check.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_submitted_hr_summary(p_period DATE)
RETURNS TABLE (
    id UUID,
    period_month DATE,
    submitted_by UUID,
    submitted_by_name TEXT,
    submitted_at TIMESTAMPTZ,
    dept_summaries JSONB
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        h.id,
        h.period_month,
        h.submitted_by,
        u.name,
        h.submitted_at,
        h.dept_summaries
    FROM hr_cost_submissions h
    JOIN users u ON u.id = h.submitted_by
    WHERE h.period_month = p_period
      AND current_user_role() IN ('principal', 'finance', 'hr')
    LIMIT 1
$$;

COMMENT ON FUNCTION get_submitted_hr_summary(DATE) IS
    'Phase 2 Step 3: Finance-safe view of a submitted HR cost snapshot. Returns aggregate dept_summaries only — excludes PII snapshots.';

GRANT EXECUTE ON FUNCTION get_submitted_hr_summary(DATE) TO authenticated;
