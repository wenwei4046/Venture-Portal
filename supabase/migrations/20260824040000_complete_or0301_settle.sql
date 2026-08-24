-- Data fix (2026-08-24): HV-OR-202608-0301 (the RM 1.00 Revenue Department
-- acceptance-test settle of HV-INV-202608-0030) was created by the FIRST
-- settle attempt, which died at the then-hardcoded adjustPool AFTER the
-- voucher insert + bank bump but BEFORE the pool credit and the GL posting
-- (payments/actions order: insert PV → bump bank → adjustPool → JE). The
-- mark-invoice-paid trigger flipped the invoice on the voucher insert, so the
-- retry found nothing left to click. Complete the two missing pieces exactly
-- as the fixed code would have written them:
--   1. settle JE  Dr 3000 / Cr 3030, segment revenue_department
--   2. dept_pools np_in RM 1.00 for Revenue Department
-- Bank cache needs no touch — the bump already ran before the throw.

DO $$
DECLARE
    v_pv payment_vouchers%ROWTYPE;
    v_dept_id uuid;
BEGIN
    SELECT * INTO v_pv FROM payment_vouchers WHERE voucher_no = 'HV-OR-202608-0301';
    IF NOT FOUND THEN RAISE EXCEPTION 'voucher missing'; END IF;

    -- Idempotency: skip if a settle JE already exists.
    IF NOT EXISTS (
        SELECT 1 FROM journal_entries
        WHERE reference_type = 'payment_voucher' AND reference_id = v_pv.id AND is_reversed = false
    ) THEN
        PERFORM post_journal_entry(
            v_pv.payment_date,
            'PV ' || v_pv.voucher_no || ': Settle invoice HV-INV-202608-0030 — 2990 [revenue_department]',
            'payment_voucher',
            v_pv.id,
            v_pv.created_by,
            jsonb_build_array(
                jsonb_build_object('account_code', '3000', 'debit', 1.00,
                                   'description', 'Bank deposit — ' || v_pv.voucher_no),
                jsonb_build_object('account_code', '3030', 'credit', 1.00,
                                   'description', 'Payment received — 2990')
            ),
            'revenue_department'::gl_segment
        );
    END IF;

    SELECT id INTO v_dept_id FROM departments WHERE name = 'Revenue Department';
    IF v_dept_id IS NULL THEN RAISE EXCEPTION 'Revenue Department missing'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM dept_pools
        WHERE department_id = v_dept_id AND description LIKE 'PV ' || v_pv.voucher_no || '%'
    ) THEN
        INSERT INTO dept_pools (department_id, transaction_type, amount, period_month, description, created_by)
        VALUES (v_dept_id, 'np_in', 1.00, '2026-08-01',
                'PV ' || v_pv.voucher_no || ': settle HV-INV-202608-0030 — 2990', v_pv.created_by);
    END IF;
END $$;
