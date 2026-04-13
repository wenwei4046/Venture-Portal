-- ============================================================================
-- 20260101000066_per_dept_invoice_generation.sql
-- Allow per-department invoice generation
-- HOUZS Venture Portal (VP)
--
-- Adds optional p_modes TEXT[] parameter to generate_monthly_invoices.
-- When NULL, all modes are generated (backward compatible).
-- When specified, only those modes are generated. Draft deletion is
-- also scoped to the requested modes.
-- ============================================================================

-- Drop old single-parameter version
DROP FUNCTION IF EXISTS generate_monthly_invoices(DATE);

CREATE OR REPLACE FUNCTION generate_monthly_invoices(
    p_period_month DATE,
    p_modes TEXT[] DEFAULT NULL
)
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
    v_need_hr BOOLEAN;
BEGIN
    -- Auth guard
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'generate_monthly_invoices: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_caller_id := auth.uid();
    v_period := date_trunc('month', p_period_month)::date;

    -- Check if any requested mode needs HR submission
    v_need_hr := p_modes IS NULL
        OR 'hr_pool_split' = ANY(p_modes)
        OR 'finance_attribution' = ANY(p_modes)
        OR 'finance_mgmt_fee' = ANY(p_modes);

    IF v_need_hr THEN
        SELECT * INTO v_submission
        FROM hr_cost_submissions
        WHERE period_month = v_period;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No HR cost submission for period %', v_period
                USING HINT = 'Ask HR to submit the period via /hr-costing before generating invoices.';
        END IF;
    END IF;

    -- Count existing non-draft invoices (preserved)
    SELECT COUNT(*) INTO v_skipped
    FROM invoices
    WHERE period_month = v_period
      AND status <> 'draft'
      AND (p_modes IS NULL OR billing_mode::text = ANY(p_modes));

    -- Delete only drafts for requested modes
    IF p_modes IS NULL THEN
        DELETE FROM invoices WHERE period_month = v_period AND status = 'draft';
    ELSE
        DELETE FROM invoices WHERE period_month = v_period AND status = 'draft'
            AND billing_mode::text = ANY(p_modes);
    END IF;

    -- 1. HR Pool Split
    IF p_modes IS NULL OR 'hr_pool_split' = ANY(p_modes) THEN
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
            SELECT ps.company_id, ROUND(ht.total_ctc * ps.split_pct, 2) AS amount
            FROM pool_splits ps
            JOIN hr_total ht ON ht.department_id = ps.department_id
            WHERE ROUND(ht.total_ctc * ps.split_pct, 2) > 0
        )
        INSERT INTO invoices (
            invoice_no, company_id, period_month, billing_mode,
            base_amount, total_amount, status, created_by
        )
        SELECT format_invoice_no(v_period), r.company_id, v_period,
               'hr_pool_split', r.amount, r.amount, 'draft', v_caller_id
        FROM hr_pool_rows r;

        GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
        v_generated_total := v_generated_total + v_generated_mode;
        v_mode_counts := v_mode_counts || jsonb_build_object('hr_pool_split', v_generated_mode);
    END IF;

    -- 2. Finance Attribution (non-mgmt)
    IF p_modes IS NULL OR 'finance_attribution' = ANY(p_modes) THEN
        WITH finance_dept AS (
            SELECT (v_submission.dept_summaries->'Finance'->>'department_id')::uuid AS department_id
        ),
        finance_non_mgmt AS (
            SELECT (rec->>'id')::uuid AS staff_id, (rec->>'total_ctc')::decimal AS total_ctc
            FROM jsonb_array_elements(v_submission.staff_snapshot) AS rec, finance_dept fd
            WHERE (rec->>'is_mgmt_fee')::boolean = false
              AND (rec->>'department_id')::uuid = fd.department_id
        ),
        staff_alloc AS (
            SELECT (rec->>'staff_id')::uuid AS staff_id, (rec->>'company_id')::uuid AS company_id,
                   (rec->>'allocation_pct')::decimal AS allocation_pct
            FROM jsonb_array_elements(v_submission.staff_allocation_snapshot) AS rec
        ),
        fin_attr_rows AS (
            SELECT sa.company_id, ROUND(SUM(fnm.total_ctc * sa.allocation_pct), 2) AS amount
            FROM staff_alloc sa JOIN finance_non_mgmt fnm ON fnm.staff_id = sa.staff_id
            GROUP BY sa.company_id HAVING ROUND(SUM(fnm.total_ctc * sa.allocation_pct), 2) > 0
        )
        INSERT INTO invoices (
            invoice_no, company_id, period_month, billing_mode,
            base_amount, total_amount, status, created_by
        )
        SELECT format_invoice_no(v_period), r.company_id, v_period,
               'finance_attribution', r.amount, r.amount, 'draft', v_caller_id
        FROM fin_attr_rows r;

        GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
        v_generated_total := v_generated_total + v_generated_mode;
        v_mode_counts := v_mode_counts || jsonb_build_object('finance_attribution', v_generated_mode);
    END IF;

    -- 3. Finance Mgmt Fee
    IF p_modes IS NULL OR 'finance_mgmt_fee' = ANY(p_modes) THEN
        WITH finance_dept AS (
            SELECT (v_submission.dept_summaries->'Finance'->>'department_id')::uuid AS department_id
        ),
        finance_mgmt AS (
            SELECT (rec->>'id')::uuid AS staff_id, (rec->>'total_ctc')::decimal AS total_ctc
            FROM jsonb_array_elements(v_submission.staff_snapshot) AS rec, finance_dept fd
            WHERE (rec->>'is_mgmt_fee')::boolean = true
              AND (rec->>'department_id')::uuid = fd.department_id
        ),
        staff_alloc AS (
            SELECT (rec->>'staff_id')::uuid AS staff_id, (rec->>'company_id')::uuid AS company_id,
                   (rec->>'allocation_pct')::decimal AS allocation_pct
            FROM jsonb_array_elements(v_submission.staff_allocation_snapshot) AS rec
        ),
        mgmt_fee_rows AS (
            SELECT sa.company_id, ROUND(SUM(fm.total_ctc * sa.allocation_pct), 2) AS amount
            FROM staff_alloc sa JOIN finance_mgmt fm ON fm.staff_id = sa.staff_id
            GROUP BY sa.company_id HAVING ROUND(SUM(fm.total_ctc * sa.allocation_pct), 2) > 0
        )
        INSERT INTO invoices (
            invoice_no, company_id, period_month, billing_mode,
            base_amount, total_amount, status, created_by
        )
        SELECT format_invoice_no(v_period), r.company_id, v_period,
               'finance_mgmt_fee', r.amount, r.amount, 'draft', v_caller_id
        FROM mgmt_fee_rows r;

        GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
        v_generated_total := v_generated_total + v_generated_mode;
        v_mode_counts := v_mode_counts || jsonb_build_object('finance_mgmt_fee', v_generated_mode);
    END IF;

    -- 4. Marketing Project
    IF p_modes IS NULL OR 'marketing_project' = ANY(p_modes) THEN
        WITH eligible_contracts AS (
            SELECT sc.id, sc.company_id, sc.amount
            FROM service_contracts sc
            WHERE sc.billing_mode = 'marketing_project'
              AND sc.status = 'active'
              AND sc.approved_by IS NOT NULL
              AND sc.company_id IS NOT NULL
              AND sc.amount IS NOT NULL AND sc.amount > 0
              AND (sc.start_date IS NULL OR sc.start_date <= (v_period + INTERVAL '1 month' - INTERVAL '1 day')::date)
              AND (sc.end_date IS NULL OR sc.end_date >= v_period)
        )
        INSERT INTO invoices (
            invoice_no, contract_id, company_id, period_month, billing_mode,
            base_amount, total_amount, status, created_by
        )
        SELECT format_invoice_no(v_period), ec.id, ec.company_id, v_period,
               'marketing_project', ec.amount, ec.amount, 'draft', v_caller_id
        FROM eligible_contracts ec;

        GET DIAGNOSTICS v_generated_mode = ROW_COUNT;
        v_generated_total := v_generated_total + v_generated_mode;
        v_mode_counts := v_mode_counts || jsonb_build_object('marketing_project', v_generated_mode);
    END IF;

    RETURN jsonb_build_object(
        'generated', v_generated_total,
        'skipped', v_skipped,
        'errors', v_errors,
        'period', v_period,
        'mode_counts', v_mode_counts
    );
END;
$$;

COMMENT ON FUNCTION generate_monthly_invoices(DATE, TEXT[]) IS
    'Per-department invoice generation. Pass p_modes to filter (e.g. ARRAY[''hr_pool_split'']). NULL = all modes.';

GRANT EXECUTE ON FUNCTION generate_monthly_invoices(DATE, TEXT[]) TO authenticated;
