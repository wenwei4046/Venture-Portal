-- ============================================================================
-- Migration 278: HR payroll submit goes STRAIGHT to Finance — Principal
--                approval removed from the HR costing side (user 2026-06-04)
-- ============================================================================
-- The HR-side Principal approval (Stage A approve) added friction without
-- moving money — mig 142 already made approve_payroll_run data-only. User
-- decision 2026-06-04: HR's Submit should land the numbers in Finance's lap
-- immediately; the Principal gates that REMAIN are all money-side (payment
-- voucher approvals, Stage E/F/G).
--
-- Changes:
--   1. submit_payroll_to_principal — rewritten (name kept for compatibility):
--        * run lands directly in status='approved', approved_at=NOW()
--          (approved_by stays NULL — nobody "approved"; the state means
--          "numbers confirmed, Finance may proceed"). Every downstream
--          consumer keys off status/approved_at and unlocks immediately:
--          BillingView OPEX cards, payment-request trigger (mig 143),
--          disbursement RPC (mig 213).
--        * NO approval_requests row — payroll costing no longer appears in
--          the Principal inbox.
--        * Director Salary DECOUPLED (user decision 2026-06-04 Q1): the
--          mig 266 director_payouts gate is dropped and
--          director_salary_total is written as 0. Director compensation
--          reaches Finance through its own Director Payroll Submission
--          flow (mig 279), not inside the staff payroll run.
--   2. reopen_payroll_run(p_period, p_user_id) — NEW. With approval (and its
--      reject/reopen path) gone, HR needs a self-service way to pull the
--      numbers back for edits (e.g. statutory corrections vs InfoTech).
--      Allowed only while no payment request is in flight. Marks the run
--      'rejected' with the marker reason 'Reopened by HR for edits' and
--      flips hr_monthly_payroll rows back to 'draft'.
--   3. get_payroll_breakdown_by_pool — Director row removed (4 staff pools
--      only) so the Generate-PV allocation grid foots to the staff-only
--      run total. Director PVs continue to draw from dept_pool_director in
--      Stage G — unchanged.
--   4. create_payroll_disbursement_vouchers — period lookups now ignore
--      rejected runs. Reopen makes (rejected + live) run pairs per period
--      common; the unique partial index guarantees at most one non-rejected.
--   5. Data migration: auto-approve any in-flight 'submitted' runs + close
--      their pending approval_requests. (None exist at apply time — the only
--      run is May 2026 'rejected' — kept for idempotency/safety.)
-- ============================================================================

BEGIN;

-- ── 1. Submit lands straight in 'approved' ──────────────────────────────────

CREATE OR REPLACE FUNCTION submit_payroll_to_principal(p_period DATE, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_submitter_role          user_role;
    v_marketing_dept          UUID;
    v_hr_dept                 UUID;
    v_finance_dept            UUID;
    v_director_office_dept    UUID;
    v_marketing_total         DECIMAL(15, 2);
    v_hr_total                DECIMAL(15, 2);
    v_finance_total           DECIMAL(15, 2);
    v_director_office_total   DECIMAL(15, 2);
    v_row_count               INT;
    v_submitted_or_paid_count INT;
    v_run_id                  UUID;
BEGIN
    SELECT role INTO v_submitter_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_submitter_role IS NULL THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: unknown or inactive user %', p_user_id;
    END IF;
    IF v_submitter_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: role % cannot submit payroll', v_submitter_role;
    END IF;

    SELECT COUNT(*) INTO v_row_count
    FROM hr_monthly_payroll
    WHERE period_month = p_period;
    IF v_row_count = 0 THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: no hr_monthly_payroll rows for period %', p_period;
    END IF;

    -- (mig 278) Director gate REMOVED — director salary is decoupled and
    -- submitted to Finance via its own flow. Staff payroll no longer waits.

    SELECT COUNT(*) INTO v_submitted_or_paid_count
    FROM hr_monthly_payroll
    WHERE period_month = p_period AND status IN ('submitted', 'paid');
    IF v_submitted_or_paid_count > 0 THEN
        RAISE EXCEPTION
            'submit_payroll_to_principal: % rows already submitted/paid for period %',
            v_submitted_or_paid_count, p_period;
    END IF;

    IF EXISTS (
        SELECT 1 FROM payroll_runs
        WHERE period_month = p_period AND status <> 'rejected'
    ) THEN
        RAISE EXCEPTION 'submit_payroll_to_principal: a live run already exists for %', p_period;
    END IF;

    SELECT id INTO v_marketing_dept       FROM departments WHERE name = 'Marketing';
    SELECT id INTO v_hr_dept              FROM departments WHERE name = 'HR';
    SELECT id INTO v_finance_dept         FROM departments WHERE name = 'Finance';
    SELECT id INTO v_director_office_dept FROM departments WHERE name = 'Director Office';

    -- Per-dept OPEX = sum(gross + EPF ER + SOCSO ER + EIS ER) for staff in the dept.
    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_marketing_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_marketing_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_hr_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_hr_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_finance_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_finance_dept;

    SELECT COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)
      INTO v_director_office_total
      FROM hr_monthly_payroll hmp
      JOIN hr_staff_costs hsc ON hsc.id = hmp.staff_id
     WHERE hmp.period_month = p_period
       AND hsc.department_id = v_director_office_dept;

    -- (mig 278) Straight to 'approved': numbers confirmed, Finance unblocked.
    -- director_salary_total = 0 — directors live in their own submission flow.
    INSERT INTO payroll_runs (
        period_month,
        marketing_opex_total,
        hr_opex_total,
        finance_opex_total,
        director_office_total,
        director_salary_total,
        status,
        submitted_by,
        submitted_at,
        approved_at
    ) VALUES (
        p_period,
        v_marketing_total,
        v_hr_total,
        v_finance_total,
        v_director_office_total,
        0,
        'approved',
        p_user_id,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_run_id;

    UPDATE hr_monthly_payroll
       SET status = 'submitted'
     WHERE period_month = p_period;

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'payroll_run', v_run_id::TEXT, 'submit_direct_to_finance',
        jsonb_build_object(
            'period', p_period,
            'staff_total', v_marketing_total + v_hr_total + v_finance_total + v_director_office_total,
            'semantics', 'no Principal approval — numbers visible to Finance immediately (mig 278)'
        )
    );

    RETURN v_run_id;
END;
$function$;

COMMENT ON FUNCTION submit_payroll_to_principal IS
    'Mig 278: name kept for compatibility, but submission now goes STRAIGHT '
    'to Finance — run lands in status=approved with approved_at=NOW(), no '
    'approval_requests row, no director_payouts gate, director_salary_total=0 '
    '(directors decoupled to the Director Payroll Submission flow).';

-- ── 2. Reopen: HR pulls an approved run back to draft ───────────────────────

CREATE OR REPLACE FUNCTION reopen_payroll_run(p_period DATE, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_role     user_role;
    v_run      payroll_runs%ROWTYPE;
    v_blocking INT;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'reopen_payroll_run: unknown or inactive user %', p_user_id;
    END IF;
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'reopen_payroll_run: role % cannot reopen payroll', v_role;
    END IF;

    SELECT * INTO v_run
      FROM payroll_runs
     WHERE period_month = p_period AND status <> 'rejected';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reopen_payroll_run: no live run for %', p_period;
    END IF;
    IF v_run.status <> 'approved' THEN
        RAISE EXCEPTION
            'reopen_payroll_run: run is %, only approved (pre-payment) runs can be reopened',
            v_run.status;
    END IF;

    -- Block once money is in motion: an active or completed payment request
    -- means Finance/Principal are (or were) acting on these numbers.
    SELECT COUNT(*) INTO v_blocking
      FROM payroll_payment_requests
     WHERE payroll_run_id = v_run.id
       AND status IN ('submitted', 'pv_generated', 'completed');
    IF v_blocking > 0 THEN
        RAISE EXCEPTION
            'reopen_payroll_run: a payment request exists for % — cancel it first; if it completed, money has already moved',
            p_period;
    END IF;

    UPDATE payroll_runs
       SET status           = 'rejected',
           rejected_at      = NOW(),
           rejection_reason = 'Reopened by HR for edits'
     WHERE id = v_run.id;

    UPDATE hr_monthly_payroll
       SET status = 'draft'
     WHERE period_month = p_period AND status = 'submitted';

    INSERT INTO access_log (
        user_id, resource_type, resource_id, action, metadata
    ) VALUES (
        p_user_id, 'payroll_run', v_run.id::TEXT, 'reopen_to_draft',
        jsonb_build_object('period', p_period, 'total_amount', v_run.total_amount)
    );

    RETURN v_run.id;
END;
$function$;

COMMENT ON FUNCTION reopen_payroll_run(DATE, UUID) IS
    'Mig 278: HR self-service reopen — flips an approved run to rejected '
    '(marker reason ''Reopened by HR for edits'') and its hr_monthly_payroll '
    'rows back to draft. Blocked once a payment request is in flight.';

GRANT EXECUTE ON FUNCTION reopen_payroll_run(DATE, UUID) TO authenticated;

-- ── 3. Breakdown grid: staff pools only (director decoupled) ────────────────

CREATE OR REPLACE FUNCTION get_payroll_breakdown_by_pool(p_request_id UUID)
RETURNS TABLE (
    pool_key TEXT,
    dept_name TEXT,
    required_amount DECIMAL(15, 2),
    pool_balance DECIMAL(15, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $function$
DECLARE
    v_period DATE;
BEGIN
    SELECT pr.period_month
      INTO v_period
      FROM payroll_payment_requests ppr
      JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id
     WHERE ppr.id = p_request_id;

    IF v_period IS NULL THEN
        RAISE EXCEPTION 'get_payroll_breakdown_by_pool: request % not found or not linked to a payroll_run', p_request_id;
    END IF;

    RETURN QUERY
    WITH hr_payroll_totals AS (
        -- Staff-side payroll aggregated from hr_monthly_payroll, one row per
        -- dept. Director row REMOVED (mig 278): director costing is decoupled
        -- from the staff run, so the allocation grid must foot to the
        -- staff-only run total. Director PVs still draw from
        -- dept_pool_director in Stage G.
        SELECT
            LOWER(d.name) AS dept_slug,
            d.name        AS d_name,
            d.id          AS d_id,
            COALESCE(SUM(hmp.gross + hmp.epf_er + hmp.socso_er + hmp.eis_er), 0)::DECIMAL(15, 2) AS total
          FROM departments d
          LEFT JOIN hr_staff_costs hsc ON hsc.department_id = d.id
          LEFT JOIN hr_monthly_payroll hmp
                 ON hmp.staff_id = hsc.id
                AND hmp.period_month = v_period
         WHERE d.name IN ('HR', 'Finance', 'Director Office', 'Marketing')
         GROUP BY d.id, d.name
    ),
    pool_balances AS (
        SELECT department_id, balance FROM dept_pool_balances
    )
    SELECT
        CASE hpt.dept_slug
            WHEN 'hr'              THEN 'dept_pool_hr'
            WHEN 'finance'         THEN 'dept_pool_finance'
            WHEN 'director office' THEN 'dept_pool_director_office'
            WHEN 'marketing'       THEN 'dept_pool_marketing'
        END AS pool_key,
        hpt.d_name AS dept_name,
        hpt.total  AS required_amount,
        COALESCE((SELECT balance FROM pool_balances WHERE department_id = hpt.d_id), 0)::DECIMAL(15, 2) AS pool_balance
      FROM hr_payroll_totals hpt
     ORDER BY CASE hpt.dept_slug
         WHEN 'hr'              THEN 1
         WHEN 'finance'         THEN 2
         WHEN 'director office' THEN 3
         WHEN 'marketing'       THEN 4
         ELSE 99
     END;
END;
$function$;

COMMENT ON FUNCTION get_payroll_breakdown_by_pool(UUID) IS
    'Mig 278: 4 staff dept-pool rows (HR / Finance / Director Office / '
    'Marketing). Director row removed — director costing decoupled from the '
    'staff payroll run.';

-- ── 4. Disbursement RPC: ignore rejected runs on period lookups ─────────────

CREATE OR REPLACE FUNCTION create_payroll_disbursement_vouchers(
    p_period DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    v_run_id UUID;
    v_run_status TEXT;
    v_request_status TEXT;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_disbursement_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    -- (mig 278) Reopen makes rejected+live run pairs common — only the live
    -- (non-rejected) run counts. The partial unique index guarantees <= 1.
    SELECT id, status INTO v_run_id, v_run_status
    FROM payroll_runs
    WHERE period_month = p_period AND status <> 'rejected';

    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %. Submit costing first.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state %. Submit costing before disbursement.', v_run_status;
    END IF;

    SELECT status INTO v_request_status
    FROM payroll_payment_requests
    WHERE payroll_run_id = v_run_id
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'HR Pool is not funded for period %. Wait for the funding PV to be approved and executed.', p_period;
    END IF;

    -- Dedupe: count staff + director disbursement vouchers already created.
    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    WHERE pv.reference_type = 'payroll_disbursement'
      AND (
        EXISTS (
          SELECT 1 FROM hr_monthly_payroll mp
          WHERE mp.id::text = pv.reference_id::text
            AND mp.period_month = p_period
        )
        OR EXISTS (
          SELECT 1 FROM director_payouts dp
          WHERE dp.id::text = pv.reference_id::text
            AND dp.period_month = p_period
        )
      );

    IF v_existing > 0 THEN
        RAISE EXCEPTION 'Disbursement vouchers already generated for period % (found % existing).', p_period, v_existing;
    END IF;

    v_group_id := gen_random_uuid();
    v_voucher_period := to_char(now(), 'YYYYMM');

    -- ── Staff vouchers (hr_monthly_payroll) ──────────────────────────────────
    FOR v_row IN
        SELECT
            mp.id AS payroll_id,
            mp.staff_id,
            mp.net,
            s.employee_name,
            s.bank_account_no,
            s.bank_name,
            d.name AS dept_name
        FROM hr_monthly_payroll mp
        JOIN hr_staff_costs s ON s.id = mp.staff_id
        LEFT JOIN departments d ON d.id = s.department_id
        WHERE mp.period_month = p_period
          AND mp.net > 0
        ORDER BY s.employee_name
    LOOP
        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency,
            payee_name, description,
            payment_method, payment_date,
            source_pool,
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
            'dept_pool_hr',
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

    -- ── Director vouchers (director_payouts) ─────────────────────────────────
    -- Unchanged from mig 213: source dept_pool_director, advance noted in
    -- description. Money-side Principal PV approval stays.
    FOR v_dir IN
        SELECT
            dp.id AS payout_id,
            dp.payroll_net,
            dp.advance_amount,
            d.name AS director_name
        FROM director_payouts dp
        JOIN directors d ON d.id = dp.director_id
        WHERE dp.period_month = p_period
          AND dp.payroll_net > 0
        ORDER BY d.name
    LOOP
        SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
        v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

        INSERT INTO payment_vouchers (
            voucher_no, voucher_type, direction, status,
            amount, currency,
            payee_name, description,
            payment_method, payment_date,
            source_pool,
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
            'dept_pool_director',
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
$function$;

COMMENT ON FUNCTION create_payroll_disbursement_vouchers(DATE) IS
    'Mig 278: period lookups ignore rejected runs (HR reopen support). Staff '
    'vouchers from dept_pool_hr, director vouchers from dept_pool_director — '
    'both still gated by Principal PV approval (money side unchanged).';

-- ── 5. Data migration: clear any in-flight submitted runs ───────────────────
-- Close their pending approval_requests first (references status='submitted'),
-- then auto-approve the runs. Idempotent; no rows at apply time.

UPDATE approval_requests ar
   SET status         = 'approved',
       workflow_state = 'approved',
       approved_at    = NOW()
  FROM payroll_runs pr
 WHERE pr.approval_id = ar.id
   AND pr.status = 'submitted'
   AND ar.status = 'pending';

UPDATE payroll_runs
   SET status      = 'approved',
       approved_at = NOW()
 WHERE status = 'submitted';

COMMIT;
