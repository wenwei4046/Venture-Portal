-- ============================================================================
-- 20260101000019_generate_monthly_invoices.sql
-- Phase 2 Step 5 — generate_monthly_invoices() RPC + invoice_no SEQUENCE
-- HOUZS Venture Portal (VP)
--
-- Design decisions (from docs/plan-phase2.md review + unattended-run memory):
-- - Decision 4B: Postgres SEQUENCE for invoice_no (monotonic, format
--                HV-INV-YYYYMM-NNNN). Not UUID, not COUNT(*) race.
-- - Decision 5B: return { generated, skipped, errors } JSONB matching
--                Phase 1's generateStatements Server Action.
-- - Decision 6A: set-based INSERT INTO ... SELECT ... per mode. Not row-by-row.
--
-- Modes handled:
-- - hr_pool_split    — HR dept total × hr_pool_allocation split_pct per company
-- - finance_attribution — Finance non-mgmt staff × hr_staff_allocation per company
-- - finance_mgmt_fee — Finance is_mgmt_fee staff × hr_staff_allocation per company
-- - marketing_project — one invoice per active contract with period in range
--
-- Modes deferred (to Step 8+):
-- - fixed_split  — Rent/Utility tables land in Step 8
-- - non_billable — HV share auto-deducts from hv_operating_fund in Step 8
--
-- Source of truth: hr_cost_submissions snapshot for the period. If no
-- submission exists, the RPC raises an exception (don't silently bill from
-- live staff data — Finance would not see the same numbers HR did).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SEQUENCE: invoice_no_seq
-- Global monotonic sequence. Invoice format: HV-INV-YYYYMM-NNNN.
-- ----------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS invoice_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MAXVALUE
    NO CYCLE;

COMMENT ON SEQUENCE invoice_no_seq IS
    'Phase 2 Step 5: monotonic global sequence for invoice_no. Used by generate_monthly_invoices via format_invoice_no() helper.';

-- Helper to format a consistent invoice number
CREATE OR REPLACE FUNCTION format_invoice_no(p_period DATE)
RETURNS TEXT
LANGUAGE sql
AS $$
    SELECT 'HV-INV-' || to_char(p_period, 'YYYYMM') || '-' ||
           lpad(nextval('invoice_no_seq')::text, 4, '0')
$$;

COMMENT ON FUNCTION format_invoice_no(DATE) IS
    'Builds an invoice_no in the form HV-INV-YYYYMM-NNNN using the invoice_no_seq sequence. Must be called inside an INSERT so each row gets a unique sequence value.';

-- ----------------------------------------------------------------------------
-- RPC: generate_monthly_invoices
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generate_monthly_invoices(p_period_month DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_period DATE;
    v_submission hr_cost_submissions%ROWTYPE;
    v_caller_id UUID;
    v_generated_total INTEGER := 0;
    v_generated_mode INTEGER := 0;
    v_skipped INTEGER := 0;
    v_errors JSONB := '[]'::jsonb;
    v_mode_counts JSONB := '{}'::jsonb;
BEGIN
    -- Auth guard
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'generate_monthly_invoices: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_caller_id := auth.uid();

    -- Normalize to first of month
    v_period := date_trunc('month', p_period_month)::date;

    -- Fetch HR cost submission for the period (source of truth)
    SELECT * INTO v_submission
    FROM hr_cost_submissions
    WHERE period_month = v_period;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No HR cost submission for period %', v_period
            USING HINT = 'Ask HR to submit the period via /hr-costing before generating invoices.';
    END IF;

    -- Count existing non-draft invoices for the period (they are preserved).
    SELECT COUNT(*) INTO v_skipped
    FROM invoices
    WHERE period_month = v_period
      AND status <> 'draft';

    -- Delete existing DRAFT invoices for the period so this run regenerates
    -- cleanly. Issued/paid invoices stay — they are legally committed.
    DELETE FROM invoices
    WHERE period_month = v_period
      AND status = 'draft';

    -- ────────────────────────────────────────────────────────────────────
    -- 1. HR Pool Split (HR department only)
    -- Math: HR_dept.total_ctc × pool_allocation.split_pct per company
    -- ────────────────────────────────────────────────────────────────────
    WITH hr_total AS (
        SELECT
            (v_submission.dept_summaries->'HR'->>'total_ctc')::decimal AS total_ctc,
            (v_submission.dept_summaries->'HR'->>'department_id')::uuid AS department_id
    ),
    pool_splits AS (
        SELECT
            (rec->>'department_id')::uuid AS department_id,
            (rec->>'company_id')::uuid    AS company_id,
            (rec->>'split_pct')::decimal  AS split_pct
        FROM jsonb_array_elements(v_submission.pool_allocation_snapshot) AS rec
    ),
    hr_pool_rows AS (
        SELECT
            ps.company_id,
            ROUND(ht.total_ctc * ps.split_pct, 2) AS amount
        FROM pool_splits ps
        JOIN hr_total ht ON ht.department_id = ps.department_id
        WHERE ROUND(ht.total_ctc * ps.split_pct, 2) > 0
    )
    INSERT INTO invoices (
        invoice_no, company_id, period_month, billing_mode,
        base_amount, total_amount, status, created_by
    )
    SELECT
        format_invoice_no(v_period),
        r.company_id,
        v_period,
        'hr_pool_split',
        r.amount,
        r.amount,
        'draft',
        v_caller_id
    FROM hr_pool_rows r;

    GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
    v_generated_total := v_generated_total + v_generated_mode;
    v_mode_counts := v_mode_counts || jsonb_build_object('hr_pool_split', v_generated_mode);

    -- ────────────────────────────────────────────────────────────────────
    -- 2. Finance Attribution (Finance department, is_mgmt_fee = false)
    -- Math: SUM(staff.total_ctc × allocation_pct) per company
    -- ────────────────────────────────────────────────────────────────────
    WITH finance_dept AS (
        SELECT (v_submission.dept_summaries->'Finance'->>'department_id')::uuid AS department_id
    ),
    finance_non_mgmt AS (
        SELECT
            (rec->>'id')::uuid AS staff_id,
            (rec->>'total_ctc')::decimal AS total_ctc
        FROM jsonb_array_elements(v_submission.staff_snapshot) AS rec,
             finance_dept fd
        WHERE (rec->>'is_mgmt_fee')::boolean = false
          AND (rec->>'department_id')::uuid = fd.department_id
    ),
    staff_alloc AS (
        SELECT
            (rec->>'staff_id')::uuid AS staff_id,
            (rec->>'company_id')::uuid AS company_id,
            (rec->>'allocation_pct')::decimal AS allocation_pct
        FROM jsonb_array_elements(v_submission.staff_allocation_snapshot) AS rec
    ),
    fin_attr_rows AS (
        SELECT
            sa.company_id,
            ROUND(SUM(fnm.total_ctc * sa.allocation_pct), 2) AS amount
        FROM staff_alloc sa
        JOIN finance_non_mgmt fnm ON fnm.staff_id = sa.staff_id
        GROUP BY sa.company_id
        HAVING ROUND(SUM(fnm.total_ctc * sa.allocation_pct), 2) > 0
    )
    INSERT INTO invoices (
        invoice_no, company_id, period_month, billing_mode,
        base_amount, total_amount, status, created_by
    )
    SELECT
        format_invoice_no(v_period),
        r.company_id,
        v_period,
        'finance_attribution',
        r.amount,
        r.amount,
        'draft',
        v_caller_id
    FROM fin_attr_rows r;

    GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
    v_generated_total := v_generated_total + v_generated_mode;
    v_mode_counts := v_mode_counts || jsonb_build_object('finance_attribution', v_generated_mode);

    -- ────────────────────────────────────────────────────────────────────
    -- 3. Finance Mgmt Fee (Finance department, is_mgmt_fee = true)
    -- Math: SUM(mgmt_staff.total_ctc × allocation_pct) per company
    -- ────────────────────────────────────────────────────────────────────
    WITH finance_dept AS (
        SELECT (v_submission.dept_summaries->'Finance'->>'department_id')::uuid AS department_id
    ),
    finance_mgmt AS (
        SELECT
            (rec->>'id')::uuid AS staff_id,
            (rec->>'total_ctc')::decimal AS total_ctc
        FROM jsonb_array_elements(v_submission.staff_snapshot) AS rec,
             finance_dept fd
        WHERE (rec->>'is_mgmt_fee')::boolean = true
          AND (rec->>'department_id')::uuid = fd.department_id
    ),
    staff_alloc AS (
        SELECT
            (rec->>'staff_id')::uuid AS staff_id,
            (rec->>'company_id')::uuid AS company_id,
            (rec->>'allocation_pct')::decimal AS allocation_pct
        FROM jsonb_array_elements(v_submission.staff_allocation_snapshot) AS rec
    ),
    mgmt_fee_rows AS (
        SELECT
            sa.company_id,
            ROUND(SUM(fm.total_ctc * sa.allocation_pct), 2) AS amount
        FROM staff_alloc sa
        JOIN finance_mgmt fm ON fm.staff_id = sa.staff_id
        GROUP BY sa.company_id
        HAVING ROUND(SUM(fm.total_ctc * sa.allocation_pct), 2) > 0
    )
    INSERT INTO invoices (
        invoice_no, company_id, period_month, billing_mode,
        base_amount, total_amount, status, created_by
    )
    SELECT
        format_invoice_no(v_period),
        r.company_id,
        v_period,
        'finance_mgmt_fee',
        r.amount,
        r.amount,
        'draft',
        v_caller_id
    FROM mgmt_fee_rows r;

    GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
    v_generated_total := v_generated_total + v_generated_mode;
    v_mode_counts := v_mode_counts || jsonb_build_object('finance_mgmt_fee', v_generated_mode);

    -- ────────────────────────────────────────────────────────────────────
    -- 4. Marketing Project
    -- One invoice per active service_contract with period in range.
    -- ────────────────────────────────────────────────────────────────────
    WITH eligible_contracts AS (
        SELECT sc.id, sc.company_id, sc.amount
        FROM service_contracts sc
        WHERE sc.billing_mode = 'marketing_project'
          AND sc.status = 'active'
          AND sc.approved_by IS NOT NULL
          AND sc.company_id IS NOT NULL
          AND sc.amount IS NOT NULL
          AND sc.amount > 0
          AND (sc.start_date IS NULL
               OR sc.start_date <= (v_period + INTERVAL '1 month' - INTERVAL '1 day')::date)
          AND (sc.end_date IS NULL OR sc.end_date >= v_period)
    )
    INSERT INTO invoices (
        invoice_no, contract_id, company_id, period_month, billing_mode,
        base_amount, total_amount, status, created_by
    )
    SELECT
        format_invoice_no(v_period),
        ec.id,
        ec.company_id,
        v_period,
        'marketing_project',
        ec.amount,
        ec.amount,
        'draft',
        v_caller_id
    FROM eligible_contracts ec;

    GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
    v_generated_total := v_generated_total + v_generated_mode;
    v_mode_counts := v_mode_counts || jsonb_build_object('marketing_project', v_generated_mode);

    -- ────────────────────────────────────────────────────────────────────
    -- 5. Fixed Split (Rent/Utility) — DEFERRED to Step 8
    -- 6. Non-billable — DEFERRED to Step 8
    -- ────────────────────────────────────────────────────────────────────
    v_mode_counts := v_mode_counts || jsonb_build_object(
        'fixed_split', 0,
        'non_billable', 0
    );

    -- Return shape matches Phase 1's generateStatements pattern
    RETURN jsonb_build_object(
        'generated', v_generated_total,
        'skipped', v_skipped,
        'errors', v_errors,
        'period', v_period,
        'mode_counts', v_mode_counts
    );
END;
$$;

COMMENT ON FUNCTION generate_monthly_invoices(DATE) IS
    'Phase 2 Step 5: generates monthly invoices from the submitted HR cost snapshot + active marketing contracts. Handles 4 billing modes: hr_pool_split, finance_attribution, finance_mgmt_fee, marketing_project. Fixed split + non-billable deferred to Step 8. Idempotent: deletes existing drafts before regenerating. Returns { generated, skipped, errors, period, mode_counts }.';

GRANT EXECUTE ON FUNCTION generate_monthly_invoices(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION format_invoice_no(DATE) TO authenticated;
