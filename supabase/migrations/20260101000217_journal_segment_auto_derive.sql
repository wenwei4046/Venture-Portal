-- ============================================================================
-- 20260101000217_journal_segment_auto_derive.sql
-- Auto-derive journal_entries.segment via BEFORE INSERT trigger.
--
-- Why a trigger
-- -------------
-- 16+ callsites write to journal_entries today: 6 TS Server Actions
-- (billing/payments/approvals/fund-out, plus 2 helpers) and 7 SQL RPCs
-- (approve_single_voucher, approve_voucher_batch, approve_voucher_batch_partial,
-- approve_dept_payment_expense, fan_out_payroll_bank_transfer,
-- save_director_salary_results, credit_dept_pool_on_invoice_paid). Two of
-- those SQL RPCs write INSERT INTO journal_entries directly (not through
-- post_journal_entry). Rewriting every callsite to pass segment would touch
-- ~1000 lines of SQL across 7 migrations.
--
-- A BEFORE INSERT trigger is cleaner: derive segment from reference_type +
-- reference_id when the caller leaves it at the default 'unallocated'.
-- Explicit callers (new code) bypass the trigger by passing a non-default
-- value — belt-and-braces, no ambiguity.
--
-- Derivation rules — must match mig 216 backfill exactly
-- ------------------------------------------------------
--   reference_type='loan'                       → treasury
--   reference_type='fund_source'                → treasury
--   reference_type='repayment'                  → treasury
--   reference_type='salary'                     → director_office
--   reference_type='director_payout'            → director_office
--   reference_type='payroll_disbursement'       → director_office
--   reference_type='hr_monthly_payroll'         → director_office
--   reference_type='dept_transfer'              → derive from dept_pools.dept
--   reference_type='dept_expense_request'       → derive from dept_payment_requests.dept
--   reference_type='dept_payment_request'       → derive from dept_payment_requests.dept
--   reference_type='claim'                      → derive from claims.dept
--   reference_type='invoice'                    → derive from invoices.billing_mode
--   reference_type='invoice_paid_credit'        → derive from PV→invoice billing_mode
--   reference_type='payment_voucher'            → derive from voucher_type / linked invoice
--   anything else                               → unallocated
-- ============================================================================

BEGIN;

-- ── 1) Helper: dept name → segment ─────────────────────────────────────
CREATE OR REPLACE FUNCTION dept_to_segment(p_dept_name TEXT)
RETURNS gl_segment
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE LOWER(COALESCE(p_dept_name, ''))
        WHEN 'marketing'       THEN 'marketing'::gl_segment
        WHEN 'hr'              THEN 'hr'::gl_segment
        WHEN 'finance'         THEN 'finance'::gl_segment
        WHEN 'director office' THEN 'director_office'::gl_segment
        WHEN 'director'        THEN 'director_office'::gl_segment
        ELSE 'corporate'::gl_segment
    END;
END;
$$;

-- ── 2) Helper: billing_mode → segment ─────────────────────────────────
CREATE OR REPLACE FUNCTION billing_mode_to_segment(p_mode TEXT)
RETURNS gl_segment
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_mode
        WHEN 'marketing_project'           THEN 'marketing'::gl_segment
        WHEN 'hr_attribution'              THEN 'hr'::gl_segment
        WHEN 'finance_attribution'         THEN 'finance'::gl_segment
        WHEN 'director_office_attribution' THEN 'director_office'::gl_segment
        WHEN 'director_attribution'        THEN 'director_office'::gl_segment
        ELSE 'corporate'::gl_segment
    END;
END;
$$;

-- ── 3) Main derivation function ───────────────────────────────────────
CREATE OR REPLACE FUNCTION derive_journal_segment(
    p_reference_type TEXT,
    p_reference_id   UUID
) RETURNS gl_segment
LANGUAGE plpgsql
AS $$
DECLARE
    v_billing_mode TEXT;
    v_dept_name    TEXT;
    v_voucher_type TEXT;
    v_pv_ref_type  TEXT;
    v_pv_ref_id    UUID;
BEGIN
    IF p_reference_type IS NULL THEN
        RETURN 'unallocated'::gl_segment;
    END IF;

    -- Treasury references
    IF p_reference_type IN ('loan', 'fund_source', 'repayment') THEN
        RETURN 'treasury'::gl_segment;
    END IF;

    -- Director-related references
    IF p_reference_type IN (
        'salary', 'director_payout', 'payroll_disbursement', 'hr_monthly_payroll'
    ) THEN
        RETURN 'director_office'::gl_segment;
    END IF;

    -- Invoice (AR accrual at issue)
    IF p_reference_type = 'invoice' AND p_reference_id IS NOT NULL THEN
        SELECT billing_mode INTO v_billing_mode
          FROM invoices WHERE id = p_reference_id;
        IF v_billing_mode IS NOT NULL THEN
            RETURN billing_mode_to_segment(v_billing_mode);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    -- Invoice paid credit (mig 202): reference_id → PV → invoice
    IF p_reference_type = 'invoice_paid_credit' AND p_reference_id IS NOT NULL THEN
        SELECT inv.billing_mode INTO v_billing_mode
          FROM payment_vouchers pv
          JOIN invoices inv ON inv.id = pv.reference_id
         WHERE pv.id = p_reference_id
           AND pv.reference_type = 'invoice';
        IF v_billing_mode IS NOT NULL THEN
            RETURN billing_mode_to_segment(v_billing_mode);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    -- Dept expense / payment request (mig 198, 173)
    IF p_reference_type IN ('dept_expense_request', 'dept_payment_request')
       AND p_reference_id IS NOT NULL THEN
        SELECT d.name INTO v_dept_name
          FROM dept_payment_requests dpr
          JOIN departments d ON d.id = dpr.department_id
         WHERE dpr.id = p_reference_id;
        IF v_dept_name IS NOT NULL THEN
            RETURN dept_to_segment(v_dept_name);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    -- Dept transfer (mig 200, payroll fan-out): reference_id → PV
    -- This JE consolidates several source dept pools into the destination
    -- (HR Pool). Tag as 'hr' since the destination is HR Pool funding.
    IF p_reference_type = 'dept_transfer' THEN
        RETURN 'hr'::gl_segment;
    END IF;

    -- Claim
    IF p_reference_type = 'claim' AND p_reference_id IS NOT NULL THEN
        SELECT d.name INTO v_dept_name
          FROM claims c
          LEFT JOIN departments d ON d.id = c.department_id
         WHERE c.id = p_reference_id;
        IF v_dept_name IS NOT NULL THEN
            RETURN dept_to_segment(v_dept_name);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

    -- Payment voucher: derive from voucher_type / linked context
    IF p_reference_type = 'payment_voucher' AND p_reference_id IS NOT NULL THEN
        SELECT voucher_type, reference_type, reference_id
          INTO v_voucher_type, v_pv_ref_type, v_pv_ref_id
          FROM payment_vouchers WHERE id = p_reference_id;

        IF v_voucher_type = 'loan_repayment' THEN
            RETURN 'treasury'::gl_segment;
        END IF;

        IF v_voucher_type = 'salary_payout' THEN
            RETURN 'director_office'::gl_segment;
        END IF;

        IF v_voucher_type = 'billing_payment'
           AND v_pv_ref_type = 'invoice' AND v_pv_ref_id IS NOT NULL THEN
            SELECT billing_mode INTO v_billing_mode
              FROM invoices WHERE id = v_pv_ref_id;
            IF v_billing_mode IS NOT NULL THEN
                RETURN billing_mode_to_segment(v_billing_mode);
            END IF;
        END IF;

        -- expense / claim_payout / other / internal_transfer with no
        -- additional context → fall back to dept lookup via reference_type
        IF v_pv_ref_type = 'dept_payment_request' AND v_pv_ref_id IS NOT NULL THEN
            SELECT d.name INTO v_dept_name
              FROM dept_payment_requests dpr
              JOIN departments d ON d.id = dpr.department_id
             WHERE dpr.id = v_pv_ref_id;
            IF v_dept_name IS NOT NULL THEN
                RETURN dept_to_segment(v_dept_name);
            END IF;
        END IF;

        RETURN 'corporate'::gl_segment;
    END IF;

    RETURN 'unallocated'::gl_segment;
END;
$$;

-- ── 4) BEFORE INSERT trigger on journal_entries ───────────────────────
CREATE OR REPLACE FUNCTION journal_entries_set_segment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only auto-derive when caller left it at the default. Explicit
    -- non-default values from new code pass through untouched.
    IF NEW.segment = 'unallocated' THEN
        NEW.segment := derive_journal_segment(NEW.reference_type, NEW.reference_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_set_segment_trigger ON journal_entries;
CREATE TRIGGER journal_entries_set_segment_trigger
    BEFORE INSERT ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION journal_entries_set_segment();

COMMENT ON FUNCTION derive_journal_segment IS
    'Derives gl_segment from reference_type + reference_id. Source of truth for both the BEFORE INSERT trigger (mig 217) and the historical backfill (mig 216) — keep them in lockstep.';

COMMENT ON FUNCTION journal_entries_set_segment IS
    'BEFORE INSERT trigger: auto-derives segment when caller passes the default "unallocated". Lets legacy RPCs (approve_single_voucher, approve_voucher_batch) tag without code changes. New code may pass segment explicitly to bypass.';

COMMIT;
