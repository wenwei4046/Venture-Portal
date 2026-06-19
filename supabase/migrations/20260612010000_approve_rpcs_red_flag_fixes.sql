-- Red-flag queue (user 开工 2026-06-12), approve-RPC portion:
--
-- 1. PV-path loan repayments now credit venture_pool 'loan_repayment_in' for
--    the PRINCIPAL portion (mirrors fund-out recordRepayment / Phase 10 mig
--    192 Q3=A: only principal returns capital). Previously only the direct
--    recordRepayment path wrote it — PV-settled repayments understated the
--    Venture pool (14 rows since 2026-05 had no venture_pool trace).
-- 2. dept_payment_request vouchers SKIP the pool debit at approval — the dept
--    pool was already debited at stage-1 expense approval
--    (approve_dept_payment_expense); debiting again at PV approval
--    double-counted.
-- 3. approve_voucher_batch / approve_voucher_batch_partial fully rewritten to
--    align with approve_single_voucher (they had drifted):
--      - repayment inserts reordered interest → penalty → principal (the
--        fully-repaid trigger fires on the principal insert and then blocks
--        the remaining legs — mig 20260606010000 fixed single only);
--      - per-segment GL branch for payroll_bank_transfer / internal_transfer
--        / expense / claim_payout (one segment-tagged JE per PVS row,
--        segment = pool_key_to_segment(pool)) — batch previously posted ONE
--        unsegmented JE, so dept spending landed outside every dept P&L view
--        (migs 20260606035000/050000 fixed single only);
--      - internal_transfer skips pools (mig 20260606035000 parity);
--      - payment-date GL dating (mig 20260611020000 parity) preserved;
--      - venture_pool loan_repayment_in + dept_payment_request skip (1 & 2).
--
-- approve_single_voucher is patched from its LIVE definition via anchored
-- replaces (it already carries the date fixes); batch/partial are full
-- rewrites because their GL section is restructured anyway.
-- (Applied via MCP apply_migration on 2026-06-12; file kept for repo parity.)

-- ─── Part A: anchored patches on approve_single_voucher ─────────────────────
DO $$
DECLARE
    def TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'approve_single_voucher';
    IF def IS NULL THEN RAISE EXCEPTION 'approve_single_voucher not found'; END IF;

    -- A1: dept_payment_request skips the pool debit (pool already reserved at
    -- stage-1 expense approval).
    IF position('IF v_voucher.voucher_type <> ''internal_transfer'' THEN' IN def) = 0 THEN
        RAISE EXCEPTION 'single: pool-skip anchor missing';
    END IF;
    def := replace(def,
        'IF v_voucher.voucher_type <> ''internal_transfer'' THEN',
        'IF v_voucher.voucher_type <> ''internal_transfer'' AND COALESCE(v_voucher.reference_type, '''') <> ''dept_payment_request'' THEN');

    -- A2: venture_pool capital return on PV-path loan principal repayments.
    IF position('VALUES (v_voucher.loan_id, v_principal, ''principal'', v_repay_date, format(''Auto-synced from voucher %s'', v_voucher.voucher_no), p_user_id); END IF;' IN def) = 0 THEN
        RAISE EXCEPTION 'single: loan principal anchor missing';
    END IF;
    def := replace(def,
        'VALUES (v_voucher.loan_id, v_principal, ''principal'', v_repay_date, format(''Auto-synced from voucher %s'', v_voucher.voucher_no), p_user_id); END IF;',
        'VALUES (v_voucher.loan_id, v_principal, ''principal'', v_repay_date, format(''Auto-synced from voucher %s'', v_voucher.voucher_no), p_user_id); END IF;' || E'\n' ||
        '            IF v_principal > 0 THEN INSERT INTO venture_pool(transaction_type, amount, description, reference_id, reference_table, created_by) VALUES (''loan_repayment_in'', v_principal, format(''Loan principal repayment — PV %s'', v_voucher.voucher_no), v_voucher.loan_id, ''loans'', p_user_id); END IF;');

    EXECUTE def;
    RAISE NOTICE 'patched approve_single_voucher';
END
$$;

-- ─── Part B: full rewrite of approve_voucher_batch ───────────────────────────
CREATE OR REPLACE FUNCTION public.approve_voucher_batch(p_group_id uuid, p_user_id uuid, p_notes text)
RETURNS TABLE(voucher_id uuid, voucher_no text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_approver_role user_role;
    v_today         DATE := CURRENT_DATE;
    v_now           TIMESTAMPTZ := NOW();
    v_je_date       DATE;
    v_je_period     DATE;
    v_repay_date    DATE;
    v_approval      RECORD;
    v_voucher       RECORD;
    v_bank          RECORD;
    v_bank_gl_code  VARCHAR(20);
    v_new_balance   DECIMAL(15, 2);
    v_pvs_row       RECORD;
    v_pvs_count     INT;
    v_breakdown     JSONB;
    v_principal     DECIMAL(15, 2);
    v_interest      DECIMAL(15, 2);
    v_penalty       DECIMAL(15, 2);
    v_overdue_id    UUID;
    v_entry_no      VARCHAR(30);
    v_entry_id      UUID;
    v_first_entry_id UUID;
    v_voucher_default_dr VARCHAR(20);
    v_resolved_dr   VARCHAR(20);
    v_seq           BIGINT;
    v_bank_debit_totals JSONB := '{}'::jsonb;
    v_bank_key      TEXT;
    v_required      DECIMAL(15, 2);
    v_available     DECIMAL(15, 2);
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_voucher_batch: only Principal may approve, got %', v_approver_role; END IF;

    IF NOT EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type = 'payment_voucher') THEN
        RAISE EXCEPTION 'approve_voucher_batch: no pending payment_voucher approvals in group %', p_group_id;
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND submitted_by = p_user_id) THEN
        RAISE EXCEPTION 'approve_voucher_batch: cannot approve own submission';
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type <> 'payment_voucher') THEN
        RAISE EXCEPTION 'approve_voucher_batch: group contains non-payment_voucher approvals';
    END IF;

    FOR v_approval IN SELECT id, reference_id FROM approval_requests WHERE group_id = p_group_id AND status = 'pending' AND request_type = 'payment_voucher'
    LOOP
        IF v_approval.reference_id IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch: approval % has null reference_id', v_approval.id; END IF;
        SELECT id, direction, amount, bank_account_id, status, payment_date INTO v_voucher FROM payment_vouchers WHERE id = v_approval.reference_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % missing', v_approval.reference_id; END IF;
        IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % status is %, must be pending_approval', v_voucher.id, v_voucher.status; END IF;
        IF is_period_locked(COALESCE(v_voucher.payment_date, v_today)) THEN
            RAISE EXCEPTION 'approve_voucher_batch: accounting period for voucher % (payment date %) is closed', v_voucher.id, COALESCE(v_voucher.payment_date, v_today);
        END IF;
        IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
            v_bank_key := v_voucher.bank_account_id::TEXT;
            v_bank_debit_totals := jsonb_set(v_bank_debit_totals, ARRAY[v_bank_key],
                to_jsonb(COALESCE((v_bank_debit_totals->>v_bank_key)::DECIMAL, 0) + v_voucher.amount), TRUE);
        END IF;
    END LOOP;

    FOR v_bank_key IN SELECT jsonb_object_keys(v_bank_debit_totals) LOOP
        v_required := (v_bank_debit_totals->>v_bank_key)::DECIMAL;
        SELECT current_balance INTO v_available FROM bank_accounts WHERE id = v_bank_key::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: bank account % not found', v_bank_key; END IF;
        IF v_available < v_required THEN RAISE EXCEPTION 'approve_voucher_batch: bank % has RM % but batch requires RM %', v_bank_key, v_available, v_required; END IF;
    END LOOP;

    UPDATE approval_requests SET status='approved', workflow_state='approved', approved_by=p_user_id, approved_at=v_now, notes=p_notes
     WHERE group_id = p_group_id AND status = 'pending';

    FOR v_approval IN SELECT id AS approval_id, reference_id AS voucher_id FROM approval_requests
         WHERE group_id = p_group_id AND approved_by = p_user_id AND approved_at = v_now AND request_type = 'payment_voucher' ORDER BY created_at
    LOOP
        UPDATE payment_vouchers SET status='paid', approved_by=p_user_id, approved_at=v_now,
               executed_by=p_user_id, executed_at=v_now,
               payment_date=COALESCE(payment_vouchers.payment_date, v_today), notes=p_notes
         WHERE id = v_approval.voucher_id AND status='pending_approval'
        RETURNING payment_vouchers.id, payment_vouchers.voucher_no, payment_vouchers.voucher_type,
                  payment_vouchers.direction, payment_vouchers.amount, payment_vouchers.description,
                  payment_vouchers.payee_name, payment_vouchers.bank_account_id, payment_vouchers.target_pool,
                  payment_vouchers.fund_source_id, payment_vouchers.loan_id, payment_vouchers.repayment_breakdown,
                  payment_vouchers.reference_type, payment_vouchers.payment_date
          INTO v_voucher;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch: race - voucher % flipped out from under us', v_approval.voucher_id; END IF;

        v_je_date := COALESCE(v_voucher.payment_date, v_today);
        v_je_period := DATE_TRUNC('month', v_je_date)::DATE;
        v_repay_date := LEAST(v_je_date, v_today);

        v_bank_gl_code := '3000';
        IF v_voucher.bank_account_id IS NOT NULL THEN
            SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id = v_voucher.bank_account_id FOR UPDATE;
            IF FOUND THEN
                v_bank_gl_code := COALESCE(v_bank.gl_account_code, '3000');
                v_new_balance := CASE WHEN v_voucher.direction='credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
                UPDATE bank_accounts SET current_balance=v_new_balance WHERE id=v_voucher.bank_account_id;
            END IF;
        END IF;

        IF v_voucher.direction = 'debit' THEN
            SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id;
            IF v_pvs_count = 0 THEN RAISE EXCEPTION 'approve_voucher_batch: voucher % has no payment_voucher_sources rows', v_voucher.id; END IF;
            -- internal_transfer: pure bank→bank, no pool spend (mig 20260606035000 parity).
            -- dept_payment_request: pool already debited at stage-1 expense approval.
            IF v_voucher.voucher_type <> 'internal_transfer' AND COALESCE(v_voucher.reference_type, '') <> 'dept_payment_request' THEN
                FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id = v_voucher.id
                LOOP
                    PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                        format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
                END LOOP;
            END IF;
        ELSIF v_voucher.direction = 'credit' AND v_voucher.target_pool IS NOT NULL THEN
            PERFORM apply_pool_adjustment(v_voucher.target_pool, 'in', v_voucher.amount,
                format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
        END IF;

        IF v_voucher.repayment_breakdown IS NOT NULL AND (v_voucher.fund_source_id IS NOT NULL OR v_voucher.loan_id IS NOT NULL) THEN
            v_breakdown := v_voucher.repayment_breakdown;
            v_principal := COALESCE((v_breakdown->>'principal')::DECIMAL, 0);
            v_interest  := COALESCE((v_breakdown->>'interest')::DECIMAL,  0);
            v_penalty   := COALESCE((v_breakdown->>'penalty')::DECIMAL,   0);
            -- interest → penalty → principal: the fully-repaid trigger fires on
            -- the principal insert and would block the remaining legs.
            IF v_voucher.fund_source_id IS NOT NULL THEN
                IF v_interest  > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_interest,  'interest',  v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                IF v_penalty   > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_penalty,   'penalty',   v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                IF v_principal > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
            ELSIF v_voucher.loan_id IS NOT NULL THEN
                IF v_interest  > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_interest,  'interest',  v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                IF v_penalty   > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_penalty,   'penalty',   v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                IF v_principal > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_principal, 'principal', v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                IF v_principal > 0 THEN INSERT INTO venture_pool(transaction_type, amount, description, reference_id, reference_table, created_by) VALUES ('loan_repayment_in', v_principal, format('Loan principal repayment — PV %s', v_voucher.voucher_no), v_voucher.loan_id, 'loans', p_user_id); END IF;
                SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id=v_voucher.loan_id AND status='pending' ORDER BY period_month DESC LIMIT 1;
                IF v_overdue_id IS NOT NULL THEN UPDATE overdue_records SET status='paid' WHERE id=v_overdue_id; END IF;
            END IF;
        END IF;

        v_seq := nextval('journal_entry_no_seq');
        v_entry_no := format('JE-%s-%s', TO_CHAR(v_je_date, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

        IF v_voucher.direction = 'credit' THEN
            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
            VALUES (v_entry_no, v_je_date, v_je_period, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
            RETURNING id INTO v_entry_id;
            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit - %s', v_voucher.voucher_no)),
                (v_entry_id, '3030', NULL, v_voucher.amount, format('Payment received - %s', v_voucher.payee_name));
        ELSIF v_voucher.voucher_type IN ('payroll_bank_transfer', 'internal_transfer', 'expense', 'claim_payout') THEN
            -- Per-segment GL (migs 20260606035000/050000 parity): one
            -- segment-tagged JE per PVS row so dept spending lands in the
            -- dept's P&L slice instead of one unsegmented entry.
            v_voucher_default_dr := CASE
                WHEN v_voucher.voucher_type IN ('payroll_bank_transfer', 'internal_transfer') THEN '9030'
                ELSE '9000'
            END;
            v_first_entry_id := NULL;
            FOR v_pvs_row IN
                SELECT pvs.pool, pvs.amount, pvs.account_code, pvs.override_gl_account_code
                  FROM payment_voucher_sources pvs
                 WHERE pvs.voucher_id = v_voucher.id
                 ORDER BY pvs.pool
            LOOP
                v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.account_code, v_voucher_default_dr);

                IF v_first_entry_id IS NOT NULL THEN
                    v_seq := nextval('journal_entry_no_seq');
                    v_entry_no := format('JE-%s-%s', TO_CHAR(v_je_date, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));
                END IF;

                INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by, segment)
                VALUES (v_entry_no, v_je_date, v_je_period,
                        format('PV %s: %s [%s]', v_voucher.voucher_no, v_voucher.description, v_pvs_row.pool),
                        'payment_voucher', v_voucher.id, v_pvs_row.amount, p_user_id,
                        pool_key_to_segment(v_pvs_row.pool))
                RETURNING id INTO v_entry_id;

                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                     format('%s - %s (%s)', v_voucher.voucher_type, v_voucher.payee_name, v_pvs_row.pool)),
                    (v_entry_id, v_bank_gl_code, NULL, v_pvs_row.amount,
                     format('Bank payment - %s (%s)', v_voucher.voucher_no, v_pvs_row.pool));

                IF v_first_entry_id IS NULL THEN v_first_entry_id := v_entry_id; END IF;
            END LOOP;
            v_entry_id := v_first_entry_id;
        ELSE
            v_voucher_default_dr := CASE
                WHEN v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment' THEN '3020'
                WHEN v_voucher.reference_type = 'dept_payment_request' THEN '4050'
                WHEN v_voucher.voucher_type = 'loan_repayment'    THEN '4000'
                WHEN v_voucher.voucher_type = 'billing_payment'   THEN '4050'
                WHEN v_voucher.voucher_type = 'salary_payout'     THEN '4020'
                ELSE '9000'
            END;

            INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
            VALUES (v_entry_no, v_je_date, v_je_period, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
            RETURNING id INTO v_entry_id;

            FOR v_pvs_row IN SELECT pvs.pool, pvs.amount, pvs.account_code, pvs.override_gl_account_code, pvs.account_code AS category_gl
                FROM payment_voucher_sources pvs WHERE pvs.voucher_id = v_voucher.id
            LOOP
                v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.category_gl, v_voucher_default_dr);
                IF (v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment')
                   OR v_voucher.reference_type = 'dept_payment_request'
                   OR v_voucher.voucher_type IN ('loan_repayment', 'billing_payment', 'salary_payout') THEN
                    v_resolved_dr := v_voucher_default_dr;
                END IF;
                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                     format('%s - %s%s', v_voucher.voucher_type, v_voucher.payee_name,
                            CASE WHEN v_pvs_row.account_code IS NOT NULL THEN ' (' || v_pvs_row.account_code || ')' ELSE '' END));
            END LOOP;

            INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount, format('Bank payment - %s', v_voucher.voucher_no));
        END IF;

        UPDATE payment_vouchers SET journal_entry_id = v_entry_id WHERE id = v_voucher.id;
        voucher_id := v_voucher.id;
        voucher_no := v_voucher.voucher_no;
        RETURN NEXT;
    END LOOP;
    RETURN;
END;
$function$;

-- ─── Part C: full rewrite of approve_voucher_batch_partial ───────────────────
CREATE OR REPLACE FUNCTION public.approve_voucher_batch_partial(p_group_id uuid, p_approve_ids uuid[], p_reject_ids uuid[], p_user_id uuid, p_approve_notes text, p_reject_reason text)
RETURNS TABLE(voucher_id uuid, voucher_no text, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_approver_role user_role;
    v_today         DATE := CURRENT_DATE;
    v_now           TIMESTAMPTZ := NOW();
    v_je_date       DATE;
    v_je_period     DATE;
    v_repay_date    DATE;
    v_all_pending   UUID[];
    v_combined      UUID[];
    v_overlap       INT;
    v_approval      RECORD;
    v_voucher       RECORD;
    v_bank          RECORD;
    v_bank_gl_code  VARCHAR(20);
    v_new_balance   DECIMAL(15, 2);
    v_pvs_row       RECORD;
    v_pvs_count     INT;
    v_breakdown     JSONB;
    v_principal     DECIMAL(15, 2);
    v_interest      DECIMAL(15, 2);
    v_penalty       DECIMAL(15, 2);
    v_overdue_id    UUID;
    v_entry_no      VARCHAR(30);
    v_entry_id      UUID;
    v_first_entry_id UUID;
    v_voucher_default_dr VARCHAR(20);
    v_resolved_dr   VARCHAR(20);
    v_seq           BIGINT;
    v_bank_debit_totals JSONB := '{}'::jsonb;
    v_bank_key      TEXT;
    v_required      DECIMAL(15, 2);
    v_available     DECIMAL(15, 2);
    v_rej_voucher_id UUID;
BEGIN
    SELECT role INTO v_approver_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_approver_role IS NULL THEN RAISE EXCEPTION 'approve_voucher_batch_partial: unknown or inactive user %', p_user_id; END IF;
    IF v_approver_role <> 'principal' THEN RAISE EXCEPTION 'approve_voucher_batch_partial: only Principal may approve, got %', v_approver_role; END IF;

    p_approve_ids := COALESCE(p_approve_ids, ARRAY[]::UUID[]);
    p_reject_ids  := COALESCE(p_reject_ids,  ARRAY[]::UUID[]);

    IF cardinality(p_approve_ids) = 0 AND cardinality(p_reject_ids) = 0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: both arrays empty'; END IF;
    IF cardinality(p_reject_ids) > 0 AND (p_reject_reason IS NULL OR length(trim(p_reject_reason)) = 0) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: rejection reason is required';
    END IF;

    SELECT ARRAY_AGG(id ORDER BY created_at) INTO v_all_pending
      FROM approval_requests WHERE group_id = p_group_id AND status='pending' AND request_type='payment_voucher';
    IF v_all_pending IS NULL OR cardinality(v_all_pending) = 0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: group % empty', p_group_id; END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE group_id=p_group_id AND status='pending' AND request_type<>'payment_voucher') THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: group has non-payment_voucher items';
    END IF;

    SELECT COUNT(*) INTO v_overlap FROM unnest(p_approve_ids) a JOIN unnest(p_reject_ids) r ON a=r;
    IF v_overlap > 0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: overlap by % ids', v_overlap; END IF;

    v_combined := p_approve_ids || p_reject_ids;
    IF EXISTS (SELECT 1 FROM unnest(v_combined) id WHERE id NOT IN (SELECT unnest(v_all_pending))) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: ids outside pending group';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_all_pending) id WHERE id NOT IN (SELECT unnest(v_combined))) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: some pending members uncovered';
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests WHERE id = ANY(p_approve_ids) AND submitted_by=p_user_id) THEN
        RAISE EXCEPTION 'approve_voucher_batch_partial: cannot approve own submission';
    END IF;

    FOR v_approval IN SELECT id, reference_id FROM approval_requests WHERE id=ANY(p_approve_ids) AND status='pending' AND request_type='payment_voucher'
    LOOP
        SELECT id, direction, amount, bank_account_id, status, payment_date INTO v_voucher FROM payment_vouchers WHERE id = v_approval.reference_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % missing', v_approval.reference_id; END IF;
        IF v_voucher.status <> 'pending_approval' THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % status is %', v_voucher.id, v_voucher.status; END IF;
        IF is_period_locked(COALESCE(v_voucher.payment_date, v_today)) THEN
            RAISE EXCEPTION 'approve_voucher_batch_partial: accounting period for voucher % (payment date %) is closed', v_voucher.id, COALESCE(v_voucher.payment_date, v_today);
        END IF;
        IF v_voucher.direction = 'debit' AND v_voucher.bank_account_id IS NOT NULL THEN
            v_bank_key := v_voucher.bank_account_id::TEXT;
            v_bank_debit_totals := jsonb_set(v_bank_debit_totals, ARRAY[v_bank_key],
                to_jsonb(COALESCE((v_bank_debit_totals->>v_bank_key)::DECIMAL, 0) + v_voucher.amount), TRUE);
        END IF;
    END LOOP;

    FOR v_bank_key IN SELECT jsonb_object_keys(v_bank_debit_totals) LOOP
        v_required := (v_bank_debit_totals->>v_bank_key)::DECIMAL;
        SELECT current_balance INTO v_available FROM bank_accounts WHERE id = v_bank_key::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch_partial: bank account % not found', v_bank_key; END IF;
        IF v_available < v_required THEN RAISE EXCEPTION 'approve_voucher_batch_partial: bank % balance % < required %', v_bank_key, v_available, v_required; END IF;
    END LOOP;

    IF cardinality(p_reject_ids) > 0 THEN
        FOR v_approval IN SELECT id, reference_id FROM approval_requests WHERE id=ANY(p_reject_ids) AND status='pending' AND request_type='payment_voucher'
        LOOP
            UPDATE approval_requests SET status='rejected', workflow_state='rejected', approved_by=p_user_id, approved_at=v_now, notes=p_reject_reason
             WHERE id=v_approval.id AND status='pending';
            IF v_approval.reference_id IS NOT NULL THEN
                v_rej_voucher_id := v_approval.reference_id;
                UPDATE payment_vouchers SET status='voided', notes=p_reject_reason WHERE id=v_rej_voucher_id AND status='pending_approval';
            END IF;
            voucher_id := v_approval.reference_id;
            SELECT pv.voucher_no INTO voucher_no FROM payment_vouchers pv WHERE pv.id = v_approval.reference_id;
            outcome := 'rejected';
            RETURN NEXT;
        END LOOP;
    END IF;

    IF cardinality(p_approve_ids) > 0 THEN
        UPDATE approval_requests SET status='approved', workflow_state='approved', approved_by=p_user_id, approved_at=v_now, notes=p_approve_notes
         WHERE id = ANY(p_approve_ids) AND status='pending';

        FOR v_approval IN SELECT id AS approval_id, reference_id AS voucher_id FROM approval_requests
            WHERE id=ANY(p_approve_ids) AND approved_by=p_user_id AND approved_at=v_now AND request_type='payment_voucher' ORDER BY created_at
        LOOP
            UPDATE payment_vouchers SET status='paid', approved_by=p_user_id, approved_at=v_now,
                   executed_by=p_user_id, executed_at=v_now,
                   payment_date=COALESCE(payment_vouchers.payment_date, v_today), notes=p_approve_notes
             WHERE id=v_approval.voucher_id AND status='pending_approval'
            RETURNING id, voucher_no, voucher_type, direction, amount, description, payee_name,
                      bank_account_id, target_pool, fund_source_id, loan_id, repayment_breakdown, reference_type, payment_date
              INTO v_voucher;
            IF NOT FOUND THEN RAISE EXCEPTION 'approve_voucher_batch_partial: race - voucher % flipped', v_approval.voucher_id; END IF;

            v_je_date := COALESCE(v_voucher.payment_date, v_today);
            v_je_period := DATE_TRUNC('month', v_je_date)::DATE;
            v_repay_date := LEAST(v_je_date, v_today);

            v_bank_gl_code := '3000';
            IF v_voucher.bank_account_id IS NOT NULL THEN
                SELECT gl_account_code, current_balance INTO v_bank FROM bank_accounts WHERE id=v_voucher.bank_account_id FOR UPDATE;
                IF FOUND THEN
                    v_bank_gl_code := COALESCE(v_bank.gl_account_code, '3000');
                    v_new_balance := CASE WHEN v_voucher.direction='credit' THEN v_bank.current_balance + v_voucher.amount ELSE v_bank.current_balance - v_voucher.amount END;
                    UPDATE bank_accounts SET current_balance=v_new_balance WHERE id=v_voucher.bank_account_id;
                END IF;
            END IF;

            IF v_voucher.direction='debit' THEN
                SELECT COUNT(*) INTO v_pvs_count FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id=v_voucher.id;
                IF v_pvs_count=0 THEN RAISE EXCEPTION 'approve_voucher_batch_partial: voucher % has no source rows', v_voucher.id; END IF;
                IF v_voucher.voucher_type <> 'internal_transfer' AND COALESCE(v_voucher.reference_type, '') <> 'dept_payment_request' THEN
                    FOR v_pvs_row IN SELECT pool, amount FROM payment_voucher_sources WHERE payment_voucher_sources.voucher_id=v_voucher.id
                    LOOP
                        PERFORM apply_pool_adjustment(v_pvs_row.pool, 'out', v_pvs_row.amount,
                            format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
                    END LOOP;
                END IF;
            ELSIF v_voucher.direction='credit' AND v_voucher.target_pool IS NOT NULL THEN
                PERFORM apply_pool_adjustment(v_voucher.target_pool, 'in', v_voucher.amount,
                    format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), p_user_id, v_approval.approval_id, v_now);
            END IF;

            IF v_voucher.repayment_breakdown IS NOT NULL AND (v_voucher.fund_source_id IS NOT NULL OR v_voucher.loan_id IS NOT NULL) THEN
                v_breakdown := v_voucher.repayment_breakdown;
                v_principal := COALESCE((v_breakdown->>'principal')::DECIMAL, 0);
                v_interest  := COALESCE((v_breakdown->>'interest')::DECIMAL,  0);
                v_penalty   := COALESCE((v_breakdown->>'penalty')::DECIMAL,   0);
                IF v_voucher.fund_source_id IS NOT NULL THEN
                    IF v_interest  > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_interest,  'interest',  v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                    IF v_penalty   > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_penalty,   'penalty',   v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                    IF v_principal > 0 THEN INSERT INTO fund_source_repayments(fund_source_id, amount, payment_type, payment_date, notes, payment_voucher_id, created_by) VALUES (v_voucher.fund_source_id, v_principal, 'principal', v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), v_voucher.id, p_user_id); END IF;
                ELSIF v_voucher.loan_id IS NOT NULL THEN
                    IF v_interest  > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_interest,  'interest',  v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                    IF v_penalty   > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_penalty,   'penalty',   v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                    IF v_principal > 0 THEN INSERT INTO repayments(loan_id, amount, payment_type, payment_date, notes, created_by) VALUES (v_voucher.loan_id, v_principal, 'principal', v_repay_date, format('Auto-synced from voucher %s', v_voucher.voucher_no), p_user_id); END IF;
                    IF v_principal > 0 THEN INSERT INTO venture_pool(transaction_type, amount, description, reference_id, reference_table, created_by) VALUES ('loan_repayment_in', v_principal, format('Loan principal repayment — PV %s', v_voucher.voucher_no), v_voucher.loan_id, 'loans', p_user_id); END IF;
                    SELECT id INTO v_overdue_id FROM overdue_records WHERE loan_id=v_voucher.loan_id AND status='pending' ORDER BY period_month DESC LIMIT 1;
                    IF v_overdue_id IS NOT NULL THEN UPDATE overdue_records SET status='paid' WHERE id=v_overdue_id; END IF;
                END IF;
            END IF;

            v_seq := nextval('journal_entry_no_seq');
            v_entry_no := format('JE-%s-%s', TO_CHAR(v_je_date, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));

            IF v_voucher.direction='credit' THEN
                INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
                VALUES (v_entry_no, v_je_date, v_je_period, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
                RETURNING id INTO v_entry_id;
                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_bank_gl_code, v_voucher.amount, NULL, format('Bank deposit - %s', v_voucher.voucher_no)),
                    (v_entry_id, '3030', NULL, v_voucher.amount, format('Payment received - %s', v_voucher.payee_name));
            ELSIF v_voucher.voucher_type IN ('payroll_bank_transfer', 'internal_transfer', 'expense', 'claim_payout') THEN
                v_voucher_default_dr := CASE
                    WHEN v_voucher.voucher_type IN ('payroll_bank_transfer', 'internal_transfer') THEN '9030'
                    ELSE '9000'
                END;
                v_first_entry_id := NULL;
                FOR v_pvs_row IN
                    SELECT pvs.pool, pvs.amount, pvs.account_code, pvs.override_gl_account_code
                      FROM payment_voucher_sources pvs
                     WHERE pvs.voucher_id = v_voucher.id
                     ORDER BY pvs.pool
                LOOP
                    v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.account_code, v_voucher_default_dr);

                    IF v_first_entry_id IS NOT NULL THEN
                        v_seq := nextval('journal_entry_no_seq');
                        v_entry_no := format('JE-%s-%s', TO_CHAR(v_je_date, 'YYYYMM'), LPAD(v_seq::TEXT, 4, '0'));
                    END IF;

                    INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by, segment)
                    VALUES (v_entry_no, v_je_date, v_je_period,
                            format('PV %s: %s [%s]', v_voucher.voucher_no, v_voucher.description, v_pvs_row.pool),
                            'payment_voucher', v_voucher.id, v_pvs_row.amount, p_user_id,
                            pool_key_to_segment(v_pvs_row.pool))
                    RETURNING id INTO v_entry_id;

                    INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                        (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                         format('%s - %s (%s)', v_voucher.voucher_type, v_voucher.payee_name, v_pvs_row.pool)),
                        (v_entry_id, v_bank_gl_code, NULL, v_pvs_row.amount,
                         format('Bank payment - %s (%s)', v_voucher.voucher_no, v_pvs_row.pool));

                    IF v_first_entry_id IS NULL THEN v_first_entry_id := v_entry_id; END IF;
                END LOOP;
                v_entry_id := v_first_entry_id;
            ELSE
                v_voucher_default_dr := CASE
                    WHEN v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment' THEN '3020'
                    WHEN v_voucher.reference_type = 'dept_payment_request' THEN '4050'
                    WHEN v_voucher.voucher_type = 'loan_repayment'    THEN '4000'
                    WHEN v_voucher.voucher_type = 'billing_payment'   THEN '4050'
                    WHEN v_voucher.voucher_type = 'salary_payout'     THEN '4020'
                    ELSE '9000'
                END;

                INSERT INTO journal_entries(entry_no, transaction_date, period_month, description, reference_type, reference_id, total_amount, created_by)
                VALUES (v_entry_no, v_je_date, v_je_period, format('PV %s: %s', v_voucher.voucher_no, v_voucher.description), 'payment_voucher', v_voucher.id, v_voucher.amount, p_user_id)
                RETURNING id INTO v_entry_id;

                FOR v_pvs_row IN SELECT pvs.pool, pvs.amount, pvs.account_code, pvs.override_gl_account_code, pvs.account_code AS category_gl
                    FROM payment_voucher_sources pvs WHERE pvs.voucher_id=v_voucher.id
                LOOP
                    v_resolved_dr := COALESCE(v_pvs_row.override_gl_account_code, v_pvs_row.category_gl, v_voucher_default_dr);
                    IF (v_voucher.loan_id IS NOT NULL AND v_voucher.voucher_type <> 'loan_repayment')
                       OR v_voucher.reference_type = 'dept_payment_request'
                       OR v_voucher.voucher_type IN ('loan_repayment', 'billing_payment', 'salary_payout') THEN
                        v_resolved_dr := v_voucher_default_dr;
                    END IF;
                    INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                        (v_entry_id, v_resolved_dr, v_pvs_row.amount, NULL,
                         format('%s - %s%s', v_voucher.voucher_type, v_voucher.payee_name,
                                CASE WHEN v_pvs_row.account_code IS NOT NULL THEN ' (' || v_pvs_row.account_code || ')' ELSE '' END));
                END LOOP;

                INSERT INTO journal_lines(entry_id, account_code, debit, credit, description) VALUES
                    (v_entry_id, v_bank_gl_code, NULL, v_voucher.amount, format('Bank payment - %s', v_voucher.voucher_no));
            END IF;

            UPDATE payment_vouchers SET journal_entry_id = v_entry_id WHERE id = v_voucher.id;
            voucher_id := v_voucher.id;
            voucher_no := v_voucher.voucher_no;
            outcome := 'approved';
            RETURN NEXT;
        END LOOP;
    END IF;
    RETURN;
END;
$function$;
