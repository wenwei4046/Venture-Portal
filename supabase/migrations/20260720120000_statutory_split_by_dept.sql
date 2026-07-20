-- Mig 20260720120000: statutory vouchers can split per department.
--
-- User requirement (2026-07-20): 缴款 PV 可能分不同 PV、不同日期、不同部门 —
-- statutory payments may be made as separate vouchers per department, each on
-- its own date. create_payroll_statutory_vouchers gains p_split_by_dept:
--   false (default) — one PV per body (KWSP / PERKESO / LHDN / SKBBK), PVS
--                     split per staff dept pool inside it (previous behaviour);
--   true            — one PV per (body × department) with money, single PVS
--                     row, so each can carry its own payment date and be
--                     approved independently.
-- payment_date stays NULL either way — Finance sets it per PV. Dedupe guard
-- unchanged (any non-voided payroll_statutory PV for the run blocks a
-- regenerate; void them all to redo).

BEGIN;

DROP FUNCTION IF EXISTS public.create_payroll_statutory_vouchers(date, uuid);

CREATE OR REPLACE FUNCTION public.create_payroll_statutory_vouchers(
    p_period date,
    p_bank_account_id uuid,
    p_split_by_dept boolean DEFAULT false
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role user_role;
    v_caller UUID;
    v_run_id UUID;
    v_run_status TEXT;
    v_request_status TEXT;
    v_existing INTEGER;
    v_bank RECORD;
    v_body RECORD;
    v_dept RECORD;
    v_voucher_no TEXT;
    v_voucher_period TEXT;
    v_seq INTEGER;
    v_voucher_id UUID;
    v_pv_total DECIMAL(15, 2);
    v_count INTEGER := 0;
    v_grand DECIMAL(15, 2) := 0;
    v_vouchers JSONB := '[]'::JSONB;
    v_period_label TEXT;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'create_payroll_statutory_vouchers: unauthorized role %', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_caller := auth.uid();

    SELECT id, status INTO v_run_id, v_run_status
    FROM payroll_runs
    WHERE period_month = p_period AND status <> 'rejected';
    IF v_run_status IS NULL THEN
        RAISE EXCEPTION 'No payroll run exists for period %.', p_period;
    END IF;
    IF v_run_status NOT IN ('approved', 'paid') THEN
        RAISE EXCEPTION 'Payroll run is in state % — statutory vouchers need an approved run.', v_run_status;
    END IF;

    SELECT status INTO v_request_status
    FROM payroll_payment_requests
    WHERE payroll_run_id = v_run_id AND status = 'completed'
    ORDER BY created_at DESC LIMIT 1;
    IF v_request_status IS NULL AND v_run_status <> 'paid' THEN
        RAISE EXCEPTION 'Payroll funding for period % is not completed yet.', p_period;
    END IF;

    SELECT COUNT(*) INTO v_existing
    FROM payment_vouchers pv
    WHERE pv.reference_type = 'payroll_statutory'
      AND pv.reference_id = v_run_id
      AND pv.status <> 'voided';
    IF v_existing > 0 THEN
        RAISE EXCEPTION 'Statutory vouchers already exist for period % (% non-voided). Void them first to regenerate.', p_period, v_existing;
    END IF;

    SELECT id, bank_name, status INTO v_bank FROM bank_accounts WHERE id = p_bank_account_id;
    IF v_bank.id IS NULL OR v_bank.status <> 'active' THEN
        RAISE EXCEPTION 'create_payroll_statutory_vouchers: bank % is not an active bank', p_bank_account_id;
    END IF;

    v_voucher_period := to_char(now(), 'YYYYMM');
    v_period_label := to_char(p_period, 'Mon YYYY');

    FOR v_body IN
        SELECT * FROM (VALUES
            ('KWSP',    'KWSP (EPF) — '),
            ('PERKESO', 'PERKESO (SOCSO + EIS) — '),
            ('LHDN',    'LHDN (PCB) — '),
            ('SKBBK',   'SKBBK — ')
        ) AS b(payee, descr_prefix)
    LOOP
        v_pv_total := 0;

        SELECT COALESCE(SUM(
            CASE v_body.payee
                WHEN 'KWSP'    THEN COALESCE(mp.epf_er, 0)   + COALESCE(mp.epf_ee, 0)
                WHEN 'PERKESO' THEN COALESCE(mp.socso_er, 0) + COALESCE(mp.socso_ee, 0)
                                  + COALESCE(mp.eis_er, 0)   + COALESCE(mp.eis_ee, 0)
                WHEN 'LHDN'    THEN COALESCE(mp.pcb, 0)
                WHEN 'SKBBK'   THEN COALESCE(mp.skbbk_amount, 0)
                ELSE 0
            END), 0)
          INTO v_pv_total
          FROM hr_monthly_payroll mp
         WHERE mp.period_month = p_period;

        IF v_pv_total <= 0 THEN
            CONTINUE;
        END IF;

        IF NOT p_split_by_dept THEN
            -- One PV for the whole body; PVS split per dept pool inside it.
            SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
            v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

            INSERT INTO payment_vouchers (
                voucher_no, voucher_type, direction, status,
                amount, currency, payee_name, description,
                payment_method, payment_date, bank_account_id,
                reference_type, reference_id, created_by
            ) VALUES (
                v_voucher_no, 'expense', 'debit', 'pending_approval',
                v_pv_total, 'MYR', v_body.payee,
                v_body.descr_prefix || v_period_label || ' payroll',
                'bank_transfer', NULL, v_bank.id,
                'payroll_statutory', v_run_id, v_caller
            )
            RETURNING id INTO v_voucher_id;

            FOR v_dept IN
                SELECT
                    CASE d.name
                        WHEN 'HR'              THEN 'dept_pool_hr'
                        WHEN 'Finance'         THEN 'dept_pool_finance'
                        WHEN 'Marketing'       THEN 'dept_pool_marketing'
                        WHEN 'Director Office' THEN 'dept_pool_director_office'
                        WHEN 'Director'        THEN 'dept_pool_director'
                        ELSE NULL
                    END AS pool_key,
                    d.name AS dept_name,
                    SUM(
                        CASE v_body.payee
                            WHEN 'KWSP'    THEN COALESCE(mp.epf_er, 0)   + COALESCE(mp.epf_ee, 0)
                            WHEN 'PERKESO' THEN COALESCE(mp.socso_er, 0) + COALESCE(mp.socso_ee, 0)
                                              + COALESCE(mp.eis_er, 0)   + COALESCE(mp.eis_ee, 0)
                            WHEN 'LHDN'    THEN COALESCE(mp.pcb, 0)
                            WHEN 'SKBBK'   THEN COALESCE(mp.skbbk_amount, 0)
                            ELSE 0
                        END) AS amt
                FROM hr_monthly_payroll mp
                JOIN hr_staff_costs s ON s.id = mp.staff_id
                LEFT JOIN departments d ON d.id = s.department_id
                WHERE mp.period_month = p_period
                GROUP BY d.name
                HAVING SUM(
                    CASE v_body.payee
                        WHEN 'KWSP'    THEN COALESCE(mp.epf_er, 0)   + COALESCE(mp.epf_ee, 0)
                        WHEN 'PERKESO' THEN COALESCE(mp.socso_er, 0) + COALESCE(mp.socso_ee, 0)
                                          + COALESCE(mp.eis_er, 0)   + COALESCE(mp.eis_ee, 0)
                        WHEN 'LHDN'    THEN COALESCE(mp.pcb, 0)
                        WHEN 'SKBBK'   THEN COALESCE(mp.skbbk_amount, 0)
                        ELSE 0
                    END) > 0
            LOOP
                IF v_dept.pool_key IS NULL THEN
                    RAISE EXCEPTION 'create_payroll_statutory_vouchers: department "%" has no mapped dept pool — fix the staff records first',
                        COALESCE(v_dept.dept_name, '(none)');
                END IF;
                INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
                VALUES (v_voucher_id, v_dept.pool_key, v_dept.amt, '4020');
            END LOOP;

            INSERT INTO approval_requests (
                request_type, reference_id, reference_table,
                submitted_by, description, amount, status, workflow_state
            ) VALUES (
                'payment_voucher', v_voucher_id, 'payment_vouchers', v_caller,
                v_voucher_no || ': ' || v_body.payee || ' — ' || v_period_label ||
                    ' payroll — RM ' || to_char(v_pv_total, 'FM999,999,999.00'),
                v_pv_total, 'pending', 'submitted'
            );

            v_count := v_count + 1;
            v_grand := v_grand + v_pv_total;
            v_vouchers := v_vouchers || jsonb_build_object(
                'id', v_voucher_id, 'voucher_no', v_voucher_no,
                'payee', v_body.payee, 'amount', v_pv_total);
        ELSE
            -- One PV per (body × department) — each independently dated/approved.
            FOR v_dept IN
                SELECT
                    CASE d.name
                        WHEN 'HR'              THEN 'dept_pool_hr'
                        WHEN 'Finance'         THEN 'dept_pool_finance'
                        WHEN 'Marketing'       THEN 'dept_pool_marketing'
                        WHEN 'Director Office' THEN 'dept_pool_director_office'
                        WHEN 'Director'        THEN 'dept_pool_director'
                        ELSE NULL
                    END AS pool_key,
                    d.name AS dept_name,
                    SUM(
                        CASE v_body.payee
                            WHEN 'KWSP'    THEN COALESCE(mp.epf_er, 0)   + COALESCE(mp.epf_ee, 0)
                            WHEN 'PERKESO' THEN COALESCE(mp.socso_er, 0) + COALESCE(mp.socso_ee, 0)
                                              + COALESCE(mp.eis_er, 0)   + COALESCE(mp.eis_ee, 0)
                            WHEN 'LHDN'    THEN COALESCE(mp.pcb, 0)
                            WHEN 'SKBBK'   THEN COALESCE(mp.skbbk_amount, 0)
                            ELSE 0
                        END) AS amt
                FROM hr_monthly_payroll mp
                JOIN hr_staff_costs s ON s.id = mp.staff_id
                LEFT JOIN departments d ON d.id = s.department_id
                WHERE mp.period_month = p_period
                GROUP BY d.name
                HAVING SUM(
                    CASE v_body.payee
                        WHEN 'KWSP'    THEN COALESCE(mp.epf_er, 0)   + COALESCE(mp.epf_ee, 0)
                        WHEN 'PERKESO' THEN COALESCE(mp.socso_er, 0) + COALESCE(mp.socso_ee, 0)
                                          + COALESCE(mp.eis_er, 0)   + COALESCE(mp.eis_ee, 0)
                        WHEN 'LHDN'    THEN COALESCE(mp.pcb, 0)
                        WHEN 'SKBBK'   THEN COALESCE(mp.skbbk_amount, 0)
                        ELSE 0
                    END) > 0
            LOOP
                IF v_dept.pool_key IS NULL THEN
                    RAISE EXCEPTION 'create_payroll_statutory_vouchers: department "%" has no mapped dept pool — fix the staff records first',
                        COALESCE(v_dept.dept_name, '(none)');
                END IF;

                SELECT COUNT(*) + 1 INTO v_seq FROM payment_vouchers;
                v_voucher_no := 'HV-PV-' || v_voucher_period || '-' || LPAD(v_seq::TEXT, 4, '0');

                INSERT INTO payment_vouchers (
                    voucher_no, voucher_type, direction, status,
                    amount, currency, payee_name, description,
                    payment_method, payment_date,
                    source_pool, bank_account_id,
                    reference_type, reference_id, created_by
                ) VALUES (
                    v_voucher_no, 'expense', 'debit', 'pending_approval',
                    v_dept.amt, 'MYR', v_body.payee,
                    v_body.descr_prefix || v_period_label || ' payroll — ' || v_dept.dept_name,
                    'bank_transfer', NULL,
                    v_dept.pool_key, v_bank.id,
                    'payroll_statutory', v_run_id, v_caller
                )
                RETURNING id INTO v_voucher_id;

                INSERT INTO payment_voucher_sources (voucher_id, pool, amount, account_code)
                VALUES (v_voucher_id, v_dept.pool_key, v_dept.amt, '4020');

                INSERT INTO approval_requests (
                    request_type, reference_id, reference_table,
                    submitted_by, description, amount, status, workflow_state
                ) VALUES (
                    'payment_voucher', v_voucher_id, 'payment_vouchers', v_caller,
                    v_voucher_no || ': ' || v_body.payee || ' (' || v_dept.dept_name || ') — ' ||
                        v_period_label || ' — RM ' || to_char(v_dept.amt, 'FM999,999,999.00'),
                    v_dept.amt, 'pending', 'submitted'
                );

                v_count := v_count + 1;
                v_grand := v_grand + v_dept.amt;
                v_vouchers := v_vouchers || jsonb_build_object(
                    'id', v_voucher_id, 'voucher_no', v_voucher_no,
                    'payee', v_body.payee, 'dept', v_dept.dept_name, 'amount', v_dept.amt);
            END LOOP;
        END IF;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No statutory amounts found for period % — nothing to generate.', p_period;
    END IF;

    RETURN json_build_object('count', v_count, 'total', v_grand, 'vouchers', v_vouchers);
END;
$function$;

COMMENT ON FUNCTION create_payroll_statutory_vouchers(date, uuid, boolean) IS
    'Mig 20260720120000: one-click KWSP / PERKESO / LHDN / SKBBK payment vouchers. p_split_by_dept=false: one PV per body with per-dept PVS split; true: one PV per body × department (independent dates/approvals). payment_date NULL for Finance to set. Account 4020, clears the Stage-E accrual.';

COMMIT;
