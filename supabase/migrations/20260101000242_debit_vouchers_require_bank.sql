-- ============================================================================
-- 20260101000242_debit_vouchers_require_bank.sql
--
-- Bug surfaced on test project 2026-05-14: Balance Sheet showed bank cash =
-- RM (40,500.00) after a single loan disbursement, while bank_accounts.
-- current_balance still read positive. Root cause: the loan- and payroll-
-- disbursement RPCs INSERT payment_vouchers WITHOUT bank_account_id, and the
-- approval RPCs (mig 241) gate BOTH the insufficient-funds guard AND the
-- bank-cache UPDATE on `bank_account_id IS NOT NULL`. So when bank_account_id
-- is NULL:
--   - The insufficient-funds check is silently skipped (any amount allowed).
--   - The bank cache is never decremented (drifts above GL).
--   - The journal entry STILL credits bank code '3000' via fallback.
-- Result: cache ↗, GL ↘, divergence accumulates.
--
-- Fix (this migration):
--   (1) Recreate create_loan_with_approval (10-arg, was mig 239) so the
--       disbursement voucher is created WITH bank_account_id pointing at
--       the primary active bank.
--   (2) Recreate create_payroll_disbursement_vouchers (was mig 213) so
--       staff vouchers carry the Alliance bank id (HR payroll account, GL
--       3010) and director vouchers carry the primary Hong Leong id
--       (GL 3000).
--   (3) Add CHECK constraint on payment_vouchers: every debit voucher MUST
--       declare bank_account_id. This is the structural backstop — any
--       future caller that forgets fails loudly instead of silently
--       draining the GL.
--
-- Manual PV form (payments/actions.ts) is patched in the TS layer to
-- require bank_account_id on debit submissions; this migration's CHECK
-- constraint enforces the same rule at the DB level.
--
-- PRE-REQUISITE: wipe-all-business-data.mjs --confirm must have run, OR
-- there must be zero existing debit vouchers with NULL bank_account_id.
-- The safety check at the top of this migration enforces that.
-- ============================================================================

BEGIN;

-- ── (0) Safety: refuse to apply if drift state still present ───────────────
DO $$
DECLARE
  v_bad INT;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM payment_vouchers
  WHERE direction = 'debit' AND bank_account_id IS NULL;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'mig 242: found % debit payment_vouchers with NULL bank_account_id. Run scripts/wipe-all-business-data.mjs --confirm before applying.',
      v_bad;
  END IF;
END $$;


-- ── (1) create_loan_with_approval — recreate with bank_account_id ─────────
DROP FUNCTION IF EXISTS create_loan_with_approval(
  UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, DATE, TEXT
);

CREATE OR REPLACE FUNCTION create_loan_with_approval(
    p_company_id UUID,
    p_principal DECIMAL,
    p_base_rate DECIMAL,
    p_risk_premium DECIMAL,
    p_effective_rate DECIMAL,
    p_tenure_months INTEGER,
    p_repayment_terms TEXT DEFAULT NULL,
    p_company_name TEXT DEFAULT '',
    p_disbursement_date DATE DEFAULT NULL,
    p_disbursement_account_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller_id UUID;
    v_loan_id UUID;
    v_voucher_id UUID;
    v_group_id UUID;
    v_voucher_no VARCHAR(30);
    v_period TEXT;
    v_seq INTEGER;
    v_description TEXT;
    v_bank_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role <> 'finance' THEN
        RAISE EXCEPTION 'create_loan_with_approval: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller_id := auth.uid();

    IF p_principal <= 0 THEN
        RAISE EXCEPTION 'Principal must be greater than 0';
    END IF;
    IF p_principal > 100000000 THEN
        RAISE EXCEPTION 'Principal exceeds RM 100M ceiling';
    END IF;
    IF p_tenure_months IS NULL OR p_tenure_months < 1 OR p_tenure_months > 12 THEN
        RAISE EXCEPTION 'Tenure must be between 1 and 12 months';
    END IF;
    IF p_disbursement_account_code IS NULL OR length(trim(p_disbursement_account_code)) = 0 THEN
        RAISE EXCEPTION 'Disbursement account code is required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM chart_of_accounts
      WHERE code = p_disbursement_account_code
        AND is_active = true
        AND type IN ('asset', 'fixed_asset', 'liability', 'equity')
    ) THEN
        RAISE EXCEPTION 'Disbursement account % is unknown, inactive, or not a Balance Sheet account',
          p_disbursement_account_code;
    END IF;

    -- Mig 242: every debit voucher must carry the bank it draws from so the
    -- approval RPC can apply both the insufficient-funds guard and the
    -- cache decrement. Loan disbursements come from the primary bank.
    SELECT id INTO v_bank_id
      FROM bank_accounts
     WHERE is_primary = true AND status = 'active'
     LIMIT 1;
    IF v_bank_id IS NULL THEN
        RAISE EXCEPTION 'create_loan_with_approval: no primary active bank account found — seed bank_accounts first';
    END IF;

    v_group_id := gen_random_uuid();
    v_description := 'New loan to ' || p_company_name;

    -- (1) Loan
    INSERT INTO loans (
        company_id, principal, base_rate, risk_premium, effective_rate,
        tenure_months, repayment_terms, status, created_by, disbursement_date
    ) VALUES (
        p_company_id, p_principal, p_base_rate, p_risk_premium, p_effective_rate,
        p_tenure_months, p_repayment_terms, 'pending_approval', v_caller_id, p_disbursement_date
    )
    RETURNING id INTO v_loan_id;

    -- (2) Loan approval_request (group_id)
    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state, group_id
    ) VALUES (
        'new_loan', v_loan_id, 'loans',
        v_caller_id,
        v_description,
        p_principal, 'pending', 'submitted', v_group_id
    );

    -- (3) Voucher number
    v_period := to_char(now(), 'YYYYMM');
    SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
    v_voucher_no := 'HV-PV-' || v_period || '-' || LPAD(v_seq::TEXT, 4, '0');

    -- (4) Voucher (pending_approval, debit, source=Venture Pool, bank=primary)
    INSERT INTO payment_vouchers (
        voucher_no, voucher_type, direction, status, amount,
        payee_name, payee_company_id,
        reference_type, reference_id,
        source_pool, bank_account_id,
        description, payment_method, created_by
    ) VALUES (
        v_voucher_no, 'other', 'debit', 'pending_approval', p_principal,
        p_company_name, p_company_id,
        'loan', v_loan_id,
        'venture_pool', v_bank_id,
        'Loan disbursement to ' || p_company_name,
        'bank_transfer', v_caller_id
    )
    RETURNING id INTO v_voucher_id;

    -- (5) Voucher source row
    INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
    VALUES (v_voucher_id, 'venture_pool', p_principal, p_disbursement_account_code);

    -- (6) Voucher approval_request (same group_id)
    INSERT INTO approval_requests (
        request_type, reference_id, reference_table,
        submitted_by, description, amount, status, workflow_state, group_id
    ) VALUES (
        'payment_voucher', v_voucher_id, 'payment_vouchers',
        v_caller_id,
        v_voucher_no || ': Loan disbursement to ' || p_company_name,
        p_principal, 'pending', 'submitted', v_group_id
    );

    RETURN v_loan_id;
END;
$$;

COMMENT ON FUNCTION create_loan_with_approval(
  UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, DATE, TEXT
) IS
    'Mig 222 + 238 + 239 + 242: sets bank_account_id on the disbursement '
    'voucher so the approval RPC can run the insufficient-funds guard and '
    'keep bank_accounts.current_balance in sync with the bank GL.';

GRANT EXECUTE ON FUNCTION create_loan_with_approval(
  UUID, DECIMAL, DECIMAL, DECIMAL, DECIMAL, INTEGER, TEXT, TEXT, DATE, TEXT
) TO authenticated;


-- ── (2) create_payroll_disbursement_vouchers — recreate with bank_account_id
DROP FUNCTION IF EXISTS create_payroll_disbursement_vouchers(DATE);

CREATE OR REPLACE FUNCTION create_payroll_disbursement_vouchers(
    p_period DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role user_role;
    v_caller UUID;
    v_group_id UUID;
    v_row RECORD;
    v_dir RECORD;
    v_voucher_no TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
    v_voucher_period TEXT;
    v_count INTEGER := 0;
    v_total DECIMAL(15, 2) := 0;
    v_existing INTEGER;
    v_run_status TEXT;
    v_request_status TEXT;
    v_alliance_bank_id UUID;
    v_primary_bank_id UUID;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    SELECT status INTO v_run_status FROM payroll_runs WHERE period_month = p_period;
    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %. Submit costing first.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state %. Need Principal approval of costing before disbursement.', v_run_status;
    END IF;

    SELECT status INTO v_request_status
      FROM payroll_payment_requests
     WHERE payroll_run_id = (SELECT id FROM payroll_runs WHERE period_month = p_period)
       AND status = 'completed'
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'HR Pool is not funded for period %. Wait for the funding PV to be approved and executed.', p_period;
    END IF;

    SELECT COUNT(*) INTO v_existing
      FROM payment_vouchers pv
     WHERE pv.reference_type = 'payroll_disbursement'
       AND (
         EXISTS (SELECT 1 FROM hr_monthly_payroll mp
                  WHERE mp.id::text = pv.reference_id::text AND mp.period_month = p_period)
         OR EXISTS (SELECT 1 FROM director_payouts dp
                     WHERE dp.id::text = pv.reference_id::text AND dp.period_month = p_period)
       );

    IF v_existing > 0 THEN
        RAISE EXCEPTION 'Disbursement vouchers already generated for period % (found % existing).', p_period, v_existing;
    END IF;

    -- Mig 242: resolve bank ids once. Staff payouts ride the HR account
    -- (Alliance, GL 3010); director payouts ride the primary account
    -- (Hong Leong, GL 3000). Fall back to primary if Alliance is missing
    -- so legacy single-bank installs still work.
    SELECT id INTO v_alliance_bank_id
      FROM bank_accounts
     WHERE status = 'active' AND gl_account_code = '3010'
     LIMIT 1;
    SELECT id INTO v_primary_bank_id
      FROM bank_accounts
     WHERE status = 'active' AND is_primary = true
     LIMIT 1;
    IF v_primary_bank_id IS NULL THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: no primary active bank account found';
    END IF;
    IF v_alliance_bank_id IS NULL THEN
        v_alliance_bank_id := v_primary_bank_id;
    END IF;

    v_group_id := gen_random_uuid();
    v_voucher_period := to_char(now(), 'YYYYMM');

    -- ── Staff vouchers (Alliance / HR account) ─────────────────────────
    FOR v_row IN
        SELECT mp.id AS payroll_id, mp.staff_id, mp.net,
               s.employee_name, s.bank_account_no, s.bank_name,
               d.name AS dept_name
          FROM hr_monthly_payroll mp
          JOIN hr_staff_costs s ON s.id = mp.staff_id
          LEFT JOIN departments d ON d.id = s.department_id
         WHERE mp.period_month = p_period AND mp.net > 0
         ORDER BY s.employee_name
    LOOP
        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency,
            payee_name, description,
            payment_method, payment_date,
            source_pool, bank_account_id,
            reference_type, reference_id,
            created_by
        ) VALUES (
            v_voucher_no, 'other', 'debit', 'pending_approval',
            v_row.net, 'MYR',
            v_row.employee_name,
            'Payroll disbursement ' || to_char(p_period, 'Mon YYYY') ||
                ' — ' || v_row.employee_name ||
                COALESCE(' (' || v_row.dept_name || ')', ''),
            'bank_transfer', CURRENT_DATE,
            'dept_pool_hr', v_alliance_bank_id,
            'payroll_disbursement', v_row.payroll_id,
            v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'dept_pool_hr', v_row.net);

        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount,
            status, workflow_state, group_id
        ) VALUES (
            'payment_voucher', v_voucher_id, 'payment_vouchers',
            v_caller,
            v_voucher_no || ': ' || v_row.employee_name ||
                ' — RM ' || to_char(v_row.net, 'FM999,999.00'),
            v_row.net,
            'pending', 'submitted', v_group_id
        );

        v_count := v_count + 1;
        v_total := v_total + v_row.net;
    END LOOP;

    -- ── Director vouchers (Hong Leong / primary) ───────────────────────
    FOR v_dir IN
        SELECT dp.id AS payout_id, dp.payroll_net, dp.advance_amount,
               d.name AS director_name
          FROM director_payouts dp
          JOIN directors d ON d.id = dp.director_id
         WHERE dp.period_month = p_period AND dp.payroll_net > 0
         ORDER BY d.name
    LOOP
        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency,
            payee_name, description,
            payment_method, payment_date,
            source_pool, bank_account_id,
            reference_type, reference_id,
            created_by
        ) VALUES (
            v_voucher_no, 'other', 'debit', 'pending_approval',
            v_dir.payroll_net, 'MYR',
            v_dir.director_name,
            'Director salary ' || to_char(p_period, 'Mon YYYY') ||
                ' — ' || v_dir.director_name ||
                CASE WHEN COALESCE(v_dir.advance_amount, 0) > 0
                     THEN ' (incl. advance RM ' || to_char(v_dir.advance_amount, 'FM999,999.00') || ')'
                     ELSE '' END,
            'bank_transfer', CURRENT_DATE,
            'dept_pool_director', v_primary_bank_id,
            'payroll_disbursement', v_dir.payout_id,
            v_caller
        )
        RETURNING id INTO v_voucher_id;

        INSERT INTO payment_voucher_sources (voucher_id, pool, amount)
        VALUES (v_voucher_id, 'dept_pool_director', v_dir.payroll_net);

        INSERT INTO approval_requests (
            request_type, reference_id, reference_table,
            submitted_by, description, amount,
            status, workflow_state, group_id
        ) VALUES (
            'payment_voucher', v_voucher_id, 'payment_vouchers',
            v_caller,
            v_voucher_no || ': ' || v_dir.director_name ||
                ' — RM ' || to_char(v_dir.payroll_net, 'FM999,999.00') ||
                CASE WHEN COALESCE(v_dir.advance_amount, 0) > 0
                     THEN ' (incl. advance RM ' || to_char(v_dir.advance_amount, 'FM999,999.00') || ')'
                     ELSE '' END,
            v_dir.payroll_net,
            'pending', 'submitted', v_group_id
        );

        v_count := v_count + 1;
        v_total := v_total + v_dir.payroll_net;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No payroll rows with net > 0 found for period % (staff or directors).', p_period;
    END IF;

    RETURN json_build_object(
        'group_id', v_group_id,
        'count', v_count,
        'total', v_total
    );
END;
$$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers(DATE) IS
    'Mig 213 + 242: sets bank_account_id on every disbursement voucher '
    '(staff → Alliance, director → primary) so the approval RPC can apply '
    'the bank guard and keep current_balance in sync with the GL.';

GRANT EXECUTE ON FUNCTION create_payroll_disbursement_vouchers(DATE) TO authenticated;


-- ── (3) Structural backstop: debit vouchers must declare a bank ────────────
ALTER TABLE payment_vouchers
  ADD CONSTRAINT debit_voucher_requires_bank
  CHECK (direction <> 'debit' OR bank_account_id IS NOT NULL)
  NOT VALID;
-- NOT VALID lets the constraint take effect for new rows without rescanning
-- existing rows. The safety guard above already verified there are zero
-- offending rows, so VALIDATE will succeed.
ALTER TABLE payment_vouchers VALIDATE CONSTRAINT debit_voucher_requires_bank;

COMMIT;
