-- Director payouts join the custody segment model (user 2026-09-11 "改").
--
-- Since mig 20260720140000 the rule was "staff payouts → segment hr (they
-- spend HR's staged Alliance pot), director payouts → segment director (they
-- spend the Director pool's own staged cash)". That premise died on
-- 2026-08-07: director funding now drains dept_pool_director INTO the HR
-- custody pool (np_in) exactly like staff, the funding staging JE is
-- hr-tagged (JE-202609-0603), and the payout PVs draw dept_pool_hr with
-- source_pool = 'dept_pool_hr'. Only the JE segment still said 'director'.
--
-- Effect of the mismatch on the Daily Bank board: the 64,976.20 arriving in
-- Alliance sat in HR's column while the 42,802.05 leaving sat in Director's,
-- so Alliance showed Director (41,879.58) and the today-fold-in plugged
-- HLB Director +111,431.26 / HLB HR (46,887.83). Totals were right, cells
-- meaningless.
--
-- Fix: payout JEs for directors are hr-segment like staff (the cash leaving
-- Alliance is HR's custody operation; Director's cost is already on its P&L
-- via the funding accrual, and its cash-out reaches the segment Cash Flow via
-- the custody bridge in lib/inter-billing-cash-flow.ts, extended in the same
-- commit). September's four posted payouts are re-tagged in place (balance-
-- sheet-only entries: Dr 4070 / Cr 3010, no P&L effect).
--
-- ⚠ Other sessions: mig 20260910151626 rewrote this function today and kept
-- 'director'; if you regenerate it again, keep the hr branches below.
--
-- NOT touched: the Jul-2026 payroll round (HV-PV-202608-0255, JEs
-- JE-202608-0441/0464..0467) — pool custody but GL still director-tagged
-- both legs. Left as legacy and explicitly excluded from the bridge pairing;
-- re-tagging it changes August's Director cash flow and needs a separate
-- user decision.

BEGIN;

CREATE OR REPLACE FUNCTION public.derive_journal_segment(p_reference_type text, p_reference_id uuid)
 RETURNS gl_segment
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_billing_mode TEXT;
    v_dept_name    TEXT;
    v_voucher_type TEXT;
    v_pv_ref_type  TEXT;
    v_pv_ref_id    UUID;
    v_line_scope   TEXT;
BEGIN
    IF p_reference_type IS NULL THEN
        RETURN 'unallocated'::gl_segment;
    END IF;

    IF p_reference_type IN ('loan', 'fund_source', 'repayment') THEN
        RETURN 'treasury'::gl_segment;
    END IF;

    IF p_reference_type IN (
        'salary', 'director_payout', 'payroll_disbursement', 'hr_monthly_payroll'
    ) THEN
        RETURN 'director_office'::gl_segment;
    END IF;

    IF p_reference_type = 'invoice' AND p_reference_id IS NOT NULL THEN
        SELECT billing_mode INTO v_billing_mode
          FROM invoices WHERE id = p_reference_id;
        IF v_billing_mode IS NOT NULL THEN
            RETURN billing_mode_to_segment(v_billing_mode);
        END IF;
        RETURN 'corporate'::gl_segment;
    END IF;

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

    IF p_reference_type = 'dept_transfer' THEN
        RETURN 'hr'::gl_segment;
    END IF;

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

        IF v_pv_ref_type = 'payroll_disbursement' THEN
            -- Mig 20260910150000: the lines say who the voucher pays.
            -- Mig 20260911010000: BOTH scopes are hr — every payout spends
            -- the HR custody pot (staff and directors alike since 2026-08-07;
            -- source_pool = dept_pool_hr on the voucher). Each department's
            -- own cash-out is the funding drain, bridged in the Cash Flow.
            SELECT l.scope INTO v_line_scope
              FROM payroll_voucher_lines l
             WHERE l.voucher_id = p_reference_id
             LIMIT 1;
            IF v_line_scope IN ('staff', 'directors') THEN
                RETURN 'hr'::gl_segment;
            END IF;
        END IF;

        IF v_pv_ref_type = 'payroll_disbursement' AND v_pv_ref_id IS NOT NULL THEN
            -- Pre-lines vouchers (Jun–Aug 2026 are backfilled, this is belt and braces).
            IF EXISTS (SELECT 1 FROM hr_monthly_payroll mp WHERE mp.id = v_pv_ref_id) THEN
                RETURN 'hr'::gl_segment;
            END IF;
            IF EXISTS (SELECT 1 FROM director_monthly_payroll dmp WHERE dmp.id = v_pv_ref_id) THEN
                RETURN 'hr'::gl_segment;
            END IF;
            -- v1 director_payouts (retired, pre-custody): legacy answer kept.
            IF EXISTS (SELECT 1 FROM director_payouts dp WHERE dp.id = v_pv_ref_id) THEN
                RETURN 'director'::gl_segment;
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
$function$;

-- ── Re-tag September's posted director payouts (Aug 2026 payroll) ────────────
-- Matched semantically (voucher lines scope = directors, posted on/after the
-- custody flip), not by id. Idempotent.
DO $$
DECLARE
    v_n integer;
    v_uid uuid;
BEGIN
    UPDATE journal_entries je
       SET segment = 'hr'::gl_segment
      FROM payment_vouchers pv
      JOIN payroll_voucher_lines l ON l.voucher_id = pv.id
     WHERE je.reference_id = pv.id
       AND je.reference_type = 'payment_voucher'
       AND pv.reference_type = 'payroll_disbursement'
       AND l.scope = 'directors'
       AND je.segment = 'director'::gl_segment
       AND je.is_reversed = false
       AND je.transaction_date >= '2026-09-01';
    GET DIAGNOSTICS v_n = ROW_COUNT;

    SELECT id INTO v_uid FROM users WHERE role = 'finance' AND is_active LIMIT 1;
    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (v_uid, 'journal_entries', 'mig_20260911010000', 'retag_segment',
        jsonb_build_object('from', 'director', 'to', 'hr', 'rows', v_n,
            'reason', 'director payouts spend HR custody (Alliance) - segment aligned with pool ledger'));
END $$;

COMMIT;
