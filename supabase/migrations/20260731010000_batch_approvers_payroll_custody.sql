-- Batch approvals must handle payroll funding exactly like the single path
-- (2026-07-31, user chose option 1 after the gap was reported).
--
-- approve_single_voucher, for a payroll_bank_transfer, does THREE things:
--   1. drains every source dept pool by its typed share,
--   2. allows those pools to go negative (预支) while doing so,
--   3. credits the FULL round into the pool its funding request targets
--      (staff → dept_pool_hr, director → dept_pool_director).
-- Both batch RPCs did NONE of them: `voucher_type NOT IN (…,
-- 'payroll_bank_transfer')` skipped the drain loop and no custody block
-- existed. A payroll PV approved through the batch path moved the bank cash
-- but left every pool untouched — silently understating the custody pool and
-- overstating the paying departments.
--
-- Both RETURNING lists also had to start carrying reference_id, the same
-- omission that broke approve_single_voucher (mig 20260731000000): the custody
-- lookup reads v_voucher.reference_id, and PL/pgSQL only fails at run time.
--
-- Applied as anchored patches against the live definitions; each replacement
-- asserts its anchor actually matched, and the whole block is skipped when the
-- custody marker is already present (idempotent).

DO $mig$
DECLARE
  v_def text; v_new text;
BEGIN
  -- ── approve_voucher_batch ──
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_voucher_batch';
  IF v_def IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch not found'; END IF;

  IF v_def NOT ILIKE '%payroll fund → custody pool%' THEN
    v_new := replace(v_def,
      'payment_vouchers.reference_type, payment_vouchers.payment_date',
      'payment_vouchers.reference_type, payment_vouchers.reference_id, payment_vouchers.payment_date');
    IF v_new = v_def THEN RAISE EXCEPTION 'batch: RETURNING anchor missing'; END IF;

    v_def := v_new;
    v_new := replace(v_def,
      'IF v_voucher.voucher_type NOT IN (''internal_transfer'', ''payroll_bank_transfer'') AND COALESCE(v_voucher.reference_type, '''') <> ''dept_payment_request'' THEN',
      'IF v_voucher.voucher_type <> ''internal_transfer'' AND COALESCE(v_voucher.reference_type, '''') <> ''dept_payment_request'' THEN');
    IF v_new = v_def THEN RAISE EXCEPTION 'batch: drain-condition anchor missing'; END IF;

    v_def := v_new;
    v_new := replace(v_def,
      'IF COALESCE(v_voucher.reference_type, '''') IN (''payroll_disbursement'', ''payroll_statutory'') THEN PERFORM set_config(''app.allow_pool_overdraw'', ''on'', true); END IF;',
      'IF v_voucher.voucher_type = ''payroll_bank_transfer'' OR COALESCE(v_voucher.reference_type, '''') IN (''payroll_disbursement'', ''payroll_statutory'') THEN PERFORM set_config(''app.allow_pool_overdraw'', ''on'', true); END IF;');
    IF v_new = v_def THEN RAISE EXCEPTION 'batch: overdraw anchor missing'; END IF;

    v_def := v_new;
    v_new := replace(v_def, '
        ELSIF v_voucher.direction = ''credit'' AND v_voucher.target_pool IS NOT NULL THEN', '
        -- Custody credit: mirror approve_single_voucher — the WHOLE round
        -- parks in the pool its funding request targets.
        IF v_voucher.voucher_type = ''payroll_bank_transfer'' THEN
            PERFORM apply_pool_adjustment(
                COALESCE((SELECT ppr.target_pool
                            FROM payroll_payment_requests ppr
                           WHERE v_voucher.reference_type = ''payroll_payment_request''
                             AND ppr.id = v_voucher.reference_id), ''dept_pool_hr''),
                ''in'', v_voucher.amount,
                format(''PV %s: payroll fund → custody pool'', v_voucher.voucher_no),
                p_user_id, v_approval.approval_id, v_now, NULL);
        END IF;
        ELSIF v_voucher.direction = ''credit'' AND v_voucher.target_pool IS NOT NULL THEN');
    IF v_new = v_def THEN RAISE EXCEPTION 'batch: ELSIF anchor missing'; END IF;
    EXECUTE v_new;
  END IF;

  -- ── approve_voucher_batch_partial ──
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_voucher_batch_partial';
  IF v_def IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch_partial not found'; END IF;

  IF v_def NOT ILIKE '%payroll fund → custody pool%' THEN
    v_new := replace(v_def,
      'bank_account_id, target_pool, fund_source_id, loan_id, repayment_breakdown, reference_type, payment_date',
      'bank_account_id, target_pool, fund_source_id, loan_id, repayment_breakdown, reference_type, reference_id, payment_date');
    IF v_new = v_def THEN RAISE EXCEPTION 'partial: RETURNING anchor missing'; END IF;

    v_def := v_new;
    v_new := replace(v_def,
      'IF v_voucher.voucher_type NOT IN (''internal_transfer'', ''payroll_bank_transfer'') AND COALESCE(v_voucher.reference_type, '''') <> ''dept_payment_request'' THEN
                IF COALESCE(v_voucher.reference_type, '''') IN (''payroll_disbursement'', ''payroll_statutory'') THEN PERFORM set_config(''app.allow_pool_overdraw'', ''on'', true); END IF;',
      'IF v_voucher.voucher_type <> ''internal_transfer'' AND COALESCE(v_voucher.reference_type, '''') <> ''dept_payment_request'' THEN
                IF v_voucher.voucher_type = ''payroll_bank_transfer'' OR COALESCE(v_voucher.reference_type, '''') IN (''payroll_disbursement'', ''payroll_statutory'') THEN PERFORM set_config(''app.allow_pool_overdraw'', ''on'', true); END IF;');
    IF v_new = v_def THEN RAISE EXCEPTION 'partial: drain/overdraw anchor missing'; END IF;

    v_def := v_new;
    v_new := replace(v_def, '
            ELSIF v_voucher.direction=''credit'' AND v_voucher.target_pool IS NOT NULL THEN', '
            -- Custody credit: mirror approve_single_voucher.
            IF v_voucher.voucher_type = ''payroll_bank_transfer'' THEN
                PERFORM apply_pool_adjustment(
                    COALESCE((SELECT ppr.target_pool
                                FROM payroll_payment_requests ppr
                               WHERE v_voucher.reference_type = ''payroll_payment_request''
                                 AND ppr.id = v_voucher.reference_id), ''dept_pool_hr''),
                    ''in'', v_voucher.amount,
                    format(''PV %s: payroll fund → custody pool'', v_voucher.voucher_no),
                    p_user_id, v_approval.approval_id, v_now, NULL);
            END IF;
            ELSIF v_voucher.direction=''credit'' AND v_voucher.target_pool IS NOT NULL THEN');
    IF v_new = v_def THEN RAISE EXCEPTION 'partial: ELSIF anchor missing'; END IF;
    EXECUTE v_new;
  END IF;
END $mig$;
