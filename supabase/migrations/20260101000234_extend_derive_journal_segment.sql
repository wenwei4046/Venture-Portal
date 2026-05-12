-- ============================================================================
-- 20260101000234_extend_derive_journal_segment.sql
-- GL audit T+14 (2026-05-12): fix missing rule in derive_journal_segment for
-- payment_voucher rows that link directly to a loan (pv.reference_type='loan').
--
-- Background (see .gstack/qa-reports/gl-audit-2026-05-12.md)
-- -----------------------------------------------------------
-- Two paid debit payment_vouchers with pv.reference_type='loan' were not
-- being routed to the 'treasury' segment:
--   1. PV d4206ded (RM 50,000): no journal entry at all — segment defaults
--      to 'unallocated' in fetchCashflowBuckets → misbooked as generalExpense.
--   2. PV 2a0e4c03 (RM 100,000): JE was created but trigger returned
--      'corporate' because the 'pv_ref_type=loan' case was unhandled.
--
-- Both PVs are loan-disbursement movements (balance-sheet, not P&L).
-- This migration:
--   (a) Extends derive_journal_segment() with the missing rule.
--   (b) Corrects the existing misclassified JE from corporate → treasury.
--
-- The orphaned PV (d4206ded) is intentionally NOT given a new JE here.
-- Its economic event is already captured by the sibling reference_type='loan'
-- JE posted on the same date. Creating a PV-level JE would duplicate the
-- posting. Finance must confirm whether the PV should be voided.
-- ============================================================================

BEGIN;

-- ── 1) Extend derive_journal_segment() ───────────────────────────────────────
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

    -- Dept transfer (mig 200, payroll fan-out)
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

        -- FIX (mig 234): PVs that reference a loan directly are treasury
        -- balance-sheet movements (loan disbursements), regardless of
        -- voucher_type. Without this rule, voucher_type='other' + pv_ref_type='loan'
        -- fell through to 'corporate', causing Check 2 BS drift and a wrong
        -- segment bucket in the income statement.
        IF v_pv_ref_type = 'loan' THEN
            RETURN 'treasury'::gl_segment;
        END IF;

        IF v_voucher_type = 'billing_payment'
           AND v_pv_ref_type = 'invoice' AND v_pv_ref_id IS NOT NULL THEN
            SELECT billing_mode INTO v_billing_mode
              FROM invoices WHERE id = v_pv_ref_id;
            IF v_billing_mode IS NOT NULL THEN
                RETURN billing_mode_to_segment(v_billing_mode);
            END IF;
        END IF;

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

-- ── 2) Backfill: fix existing JE that got 'corporate' instead of 'treasury' ──
-- Targets journal_entries for payment_vouchers whose own reference_type='loan'.
-- The trigger only fires on INSERT; existing rows need a manual correction.
UPDATE journal_entries je
SET    segment = 'treasury'
WHERE  je.reference_type = 'payment_voucher'
  AND  je.segment         = 'corporate'
  AND  je.is_reversed     = FALSE
  AND  je.reference_id IN (
           SELECT id
           FROM   payment_vouchers
           WHERE  reference_type = 'loan'
       );

COMMENT ON FUNCTION derive_journal_segment IS
    'Derives gl_segment from reference_type + reference_id. Mig 217: initial version. Mig 234: added pv_ref_type=loan → treasury rule to fix BS drift identified in T+14 GL audit.';

COMMIT;
