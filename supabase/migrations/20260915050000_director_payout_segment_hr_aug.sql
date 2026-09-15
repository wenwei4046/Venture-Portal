-- Completes mig 20260911010000 for the Jul-2026 payroll round (user
-- 2026-09-15: "这个不是做了吗?" → do August too). That round was already
-- custody on the pool side (dept_pool_director expense_out 65,309.67 → HR
-- np_in) but its GL stayed director-tagged: the same-bank staging
-- JE-202608-0441 (Dr 3000 / Cr 3000, self-netting) and the four payouts
-- JE-202608-0464..0467 (Dr 4070 / Cr 3000). Re-tag all five to hr, matching
-- the September treatment; the Cash Flow custody bridge's carve-out for
-- HV-PV-202608-0255 is removed in the same commit so August pairs like any
-- other round (Director cash-out −65,309.67 via the bridged drain, = pool).
-- Balance-sheet entries only — no P&L movement.

BEGIN;

DO $$
DECLARE v_n integer; v_uid uuid;
BEGIN
    UPDATE journal_entries je
       SET segment = 'hr'::gl_segment
      FROM payment_vouchers pv
     WHERE je.reference_id = pv.id
       AND je.is_reversed = false
       AND je.segment = 'director'::gl_segment
       AND (
            pv.voucher_no = 'HV-PV-202608-0255'
         OR (pv.reference_type = 'payroll_disbursement'
             AND EXISTS (SELECT 1 FROM payroll_voucher_lines l
                          WHERE l.voucher_id = pv.id AND l.scope = 'directors'
                            AND l.period_month = DATE '2026-07-01'))
       );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 5 THEN
        RAISE EXCEPTION 'expected to re-tag 5 Jul-2026 director JEs, matched %', v_n;
    END IF;

    SELECT id INTO v_uid FROM users WHERE role = 'finance' AND is_active LIMIT 1;
    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (v_uid, 'journal_entries', 'mig_20260915050000', 'retag_segment',
        jsonb_build_object('from', 'director', 'to', 'hr', 'rows', v_n,
            'reason', 'Jul-2026 director payroll round: custody model on the GL side, matching Sept (mig 20260911010000)'));
END $$;

COMMIT;
