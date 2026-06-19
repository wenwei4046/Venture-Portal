-- P&L expenses were landing on Principal's APPROVAL date, not the payment
-- date Finance entered on the PV (user report 2026-06-11: "P&L 的 expense
-- 是根据 principal 的 approve 日期录入的，应该是根据 finance 开 PV 的日期").
--
-- Root cause: approve_single_voucher / approve_voucher_batch /
-- approve_voucher_batch_partial all stamp v_today := CURRENT_DATE into the
-- JE transaction_date + period_month, into the repayment rows, AND overwrite
-- payment_vouchers.payment_date with it — discarding whatever Finance set.
--
-- Fix (this migration patches all three RPCs from their LIVE definitions via
-- pg_get_functiondef + targeted replaces, mig-156 style; every anchor is
-- verified present first so a drifted definition fails loud instead of
-- silently mis-patching):
--   1. payment_date is preserved: payment_date = COALESCE(old value, today).
--   2. v_je_date := COALESCE(voucher.payment_date, today) drives the JE
--      transaction_date, period_month, and the JE-YYYYMM entry_no month.
--   3. Repayment rows use LEAST(v_je_date, today) — backdate yes, future no
--      (matches the action-layer clamp in recordLoanRepaymentReceived).
--   4. Period-lock is checked against v_je_date (per voucher in the batch
--      RPCs), so a backdated PV cannot post into a closed month.
--
-- Companion app change (same day): createPaymentVoucher now stores the form's
-- payment_date on DEBIT drafts too (it previously only stored it for credit
-- auto-complete), and updatePaymentVoucher/EditPaymentForm allow editing it
-- while draft/pending. Vouchers created before this fix have payment_date
-- NULL → COALESCE falls back to approval date, i.e. old behavior.
--
-- (Applied via MCP apply_migration on 2026-06-11; file kept for repo parity.)

DO $$
DECLARE
    fn_name TEXT;
    def     TEXT;
BEGIN
    FOR fn_name IN SELECT unnest(ARRAY['approve_single_voucher', 'approve_voucher_batch', 'approve_voucher_batch_partial'])
    LOOP
        SELECT pg_get_functiondef(p.oid) INTO def
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = fn_name;
        IF def IS NULL THEN
            RAISE EXCEPTION 'patch: function % not found', fn_name;
        END IF;

        -- R1: declare the new date vars (anchor: the v_now declaration)
        IF position('v_now           TIMESTAMPTZ := NOW();' IN def) = 0 THEN
            RAISE EXCEPTION 'patch %: v_now declaration anchor missing', fn_name;
        END IF;
        def := replace(def,
            'v_now           TIMESTAMPTZ := NOW();',
            'v_now           TIMESTAMPTZ := NOW();' || E'\n' ||
            '    v_je_date       DATE;' || E'\n' ||
            '    v_je_period     DATE;' || E'\n' ||
            '    v_repay_date    DATE;');

        -- R2: stop overwriting Finance's payment_date
        IF position('payment_date=v_today' IN def) = 0 THEN
            RAISE EXCEPTION 'patch %: payment_date=v_today anchor missing', fn_name;
        END IF;
        def := replace(def,
            'payment_date=v_today',
            'payment_date=COALESCE(payment_vouchers.payment_date, v_today)');

        -- R3: repayment rows on the (clamped) payment date
        IF position('v_today, format(''Auto-synced' IN def) > 0 THEN
            def := replace(def,
                'v_today, format(''Auto-synced',
                'v_repay_date, format(''Auto-synced');
        END IF;

        -- R4: JE transaction_date + period_month from the payment date
        IF position('(v_entry_no, v_today, v_period_month,' IN def) = 0 THEN
            RAISE EXCEPTION 'patch %: JE VALUES anchor missing', fn_name;
        END IF;
        def := replace(def,
            '(v_entry_no, v_today, v_period_month,',
            '(v_entry_no, v_je_date, v_je_period,');

        -- R5: entry_no month follows the JE date
        IF position('TO_CHAR(v_today, ''YYYYMM'')' IN def) = 0 THEN
            RAISE EXCEPTION 'patch %: entry_no TO_CHAR anchor missing', fn_name;
        END IF;
        def := replace(def,
            'TO_CHAR(v_today, ''YYYYMM'')',
            'TO_CHAR(v_je_date, ''YYYYMM'')');

        -- Function-specific: load payment_date into v_voucher and compute
        -- v_je_date/v_je_period/v_repay_date once the voucher is known,
        -- with a per-voucher period-lock check on the JE date.
        IF fn_name = 'approve_single_voucher' THEN
            IF position('pv.loan_id, pv.repayment_breakdown, pv.status, pv.reference_type' IN def) = 0 THEN
                RAISE EXCEPTION 'patch %: voucher SELECT anchor missing', fn_name;
            END IF;
            def := replace(def,
                'pv.loan_id, pv.repayment_breakdown, pv.status, pv.reference_type',
                'pv.loan_id, pv.repayment_breakdown, pv.status, pv.reference_type, pv.payment_date');

            IF position('UPDATE approval_requests SET status=''approved''' IN def) = 0 THEN
                RAISE EXCEPTION 'patch %: approval UPDATE anchor missing', fn_name;
            END IF;
            def := replace(def,
                'UPDATE approval_requests SET status=''approved''',
                'v_je_date := COALESCE(v_voucher.payment_date, v_today);' || E'\n' ||
                '    v_je_period := DATE_TRUNC(''month'', v_je_date)::DATE;' || E'\n' ||
                '    v_repay_date := LEAST(v_je_date, v_today);' || E'\n' ||
                '    IF is_period_locked(v_je_date) THEN RAISE EXCEPTION ''approve_single_voucher: accounting period % is closed (voucher payment date %)'', TO_CHAR(v_je_period, ''Mon YYYY''), v_je_date; END IF;' || E'\n\n' ||
                '    UPDATE approval_requests SET status=''approved''');

        ELSIF fn_name = 'approve_voucher_batch' THEN
            IF position('payment_vouchers.reference_type' IN def) = 0 THEN
                RAISE EXCEPTION 'patch %: RETURNING anchor missing', fn_name;
            END IF;
            def := replace(def,
                'payment_vouchers.reference_type',
                'payment_vouchers.reference_type, payment_vouchers.payment_date');

            IF position('race - voucher % flipped out from under us'', v_approval.voucher_id; END IF;' IN def) = 0 THEN
                RAISE EXCEPTION 'patch %: race-check anchor missing', fn_name;
            END IF;
            def := replace(def,
                'race - voucher % flipped out from under us'', v_approval.voucher_id; END IF;',
                'race - voucher % flipped out from under us'', v_approval.voucher_id; END IF;' || E'\n\n' ||
                '        v_je_date := COALESCE(v_voucher.payment_date, v_today);' || E'\n' ||
                '        v_je_period := DATE_TRUNC(''month'', v_je_date)::DATE;' || E'\n' ||
                '        v_repay_date := LEAST(v_je_date, v_today);' || E'\n' ||
                '        IF is_period_locked(v_je_date) THEN RAISE EXCEPTION ''approve_voucher_batch: accounting period % is closed (voucher % payment date %)'', TO_CHAR(v_je_period, ''Mon YYYY''), v_voucher.voucher_no, v_je_date; END IF;');

        ELSIF fn_name = 'approve_voucher_batch_partial' THEN
            IF position('repayment_breakdown, reference_type' IN def) = 0 THEN
                RAISE EXCEPTION 'patch %: RETURNING anchor missing', fn_name;
            END IF;
            def := replace(def,
                'repayment_breakdown, reference_type',
                'repayment_breakdown, reference_type, payment_date');

            IF position('race - voucher % flipped'', v_approval.voucher_id; END IF;' IN def) = 0 THEN
                RAISE EXCEPTION 'patch %: race-check anchor missing', fn_name;
            END IF;
            def := replace(def,
                'race - voucher % flipped'', v_approval.voucher_id; END IF;',
                'race - voucher % flipped'', v_approval.voucher_id; END IF;' || E'\n\n' ||
                '            v_je_date := COALESCE(v_voucher.payment_date, v_today);' || E'\n' ||
                '            v_je_period := DATE_TRUNC(''month'', v_je_date)::DATE;' || E'\n' ||
                '            v_repay_date := LEAST(v_je_date, v_today);' || E'\n' ||
                '            IF is_period_locked(v_je_date) THEN RAISE EXCEPTION ''approve_voucher_batch_partial: accounting period % is closed (voucher % payment date %)'', TO_CHAR(v_je_period, ''Mon YYYY''), v_voucher.voucher_no, v_je_date; END IF;');
        END IF;

        EXECUTE def;
        RAISE NOTICE 'patched %', fn_name;
    END LOOP;
END
$$;
