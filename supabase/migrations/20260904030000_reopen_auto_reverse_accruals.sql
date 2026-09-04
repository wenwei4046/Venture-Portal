-- Reopen auto-reverse (user 2026-09-04 "要做"): when HR reopens an approved
-- payroll run, the period's ACTIVE staff accrual JVs now reverse automatically
-- (mirror JE + is_reversed pair, the exact mechanism reports already drop).
-- Before this, a reopen left the old-figure accruals live: the re-submit with
-- changed totals then failed loud ("reverse the old JV first") and Finance had
-- to reverse AND re-post by hand. Now: reopen → clean slate → re-submit posts
-- fresh accruals from live data. Director accruals (segment 'director') belong
-- to the separate director-submit flow and are never touched here.

CREATE OR REPLACE FUNCTION public.reverse_staff_payroll_accruals(p_period date, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role   user_role;
    v_je     RECORD;
    v_lines  jsonb;
    v_new_id uuid;
    v_net    numeric;
    v_count  integer := 0;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role NOT IN ('hr', 'finance', 'principal') THEN
        RAISE EXCEPTION 'reverse_staff_payroll_accruals: unauthorized role %', v_role
            USING ERRCODE = '42501';
    END IF;

    FOR v_je IN
        SELECT id, entry_no, segment, transaction_date
          FROM journal_entries
         WHERE reference_type = 'payroll_accrual'
           AND period_month = date_trunc('month', p_period)::date
           AND is_reversed = false
           AND segment <> 'director'
         ORDER BY entry_no
    LOOP
        SELECT jsonb_agg(jsonb_build_object(
                 'account_code', jl.account_code,
                 'debit',  jl.credit,
                 'credit', jl.debit,
                 'description', 'Reversal - ' || coalesce(jl.description, '')
               ) ORDER BY jl.id)
          INTO v_lines
          FROM journal_lines jl
         WHERE jl.entry_id = v_je.id;
        IF v_lines IS NULL THEN
            RAISE EXCEPTION 'reverse_staff_payroll_accruals: % has no lines', v_je.entry_no;
        END IF;

        v_new_id := post_journal_entry(
            v_je.transaction_date,
            'Reversal of ' || v_je.entry_no || ' - payroll reopened for edits',
            'payroll_accrual',
            v_je.id,
            p_user_id,
            v_lines,
            v_je.segment
        );

        -- Same pair-nets-to-zero guard as mark_journal_entry_reversed (that RPC
        -- gates finance/principal only, so the flagging is done inline here).
        SELECT round(sum(coalesce(debit, 0)) - sum(coalesce(credit, 0)), 2)
          INTO v_net
          FROM journal_lines
         WHERE entry_id IN (v_je.id, v_new_id);
        IF v_net IS NULL OR v_net <> 0 THEN
            RAISE EXCEPTION 'reverse_staff_payroll_accruals: pair %/% does not net to zero (net %)',
                v_je.entry_no, v_new_id, v_net;
        END IF;

        UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_new_id
         WHERE id = v_je.id;
        UPDATE journal_entries SET is_reversed = true, reversed_by_id = v_je.id
         WHERE id = v_new_id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.reopen_payroll_run(p_period date, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_role     user_role;
    v_run      payroll_runs%ROWTYPE;
    v_blocking INT;
    v_reversed INT;
BEGIN
    SELECT role INTO v_role FROM users WHERE id = p_user_id AND is_active = TRUE;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'reopen_payroll_run: unknown or inactive user %', p_user_id;
    END IF;
    IF v_role NOT IN ('hr', 'principal') THEN
        RAISE EXCEPTION 'reopen_payroll_run: role % cannot reopen payroll', v_role;
    END IF;

    SELECT * INTO v_run FROM payroll_runs
     WHERE period_month = p_period AND status <> 'rejected';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reopen_payroll_run: no live run for %', p_period;
    END IF;
    IF v_run.status <> 'approved' THEN
        RAISE EXCEPTION 'reopen_payroll_run: run is %, only approved (pre-payment) runs can be reopened', v_run.status;
    END IF;

    -- Funding request is auto-filed at submit; cancel a still-'submitted' one on reopen.
    UPDATE payroll_payment_requests
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_user_id,
           cancellation_reason = 'Auto-cancelled on payroll reopen'
     WHERE payroll_run_id = v_run.id AND status = 'submitted';

    SELECT COUNT(*) INTO v_blocking FROM payroll_payment_requests
     WHERE payroll_run_id = v_run.id AND status IN ('pv_generated', 'completed');
    IF v_blocking > 0 THEN
        RAISE EXCEPTION 'reopen_payroll_run: Finance has already generated a payment voucher for % — cancel that first; if it completed, money has already moved', p_period;
    END IF;

    -- Auto-reverse the period's active STAFF accrual JVs (2026-09-04) so the
    -- eventual re-submit posts fresh figures instead of tripping the
    -- conflicting-accrual guard. Runs before the status flip: if reversal
    -- fails (e.g. locked period), the whole reopen rolls back untouched.
    v_reversed := reverse_staff_payroll_accruals(p_period, p_user_id);

    UPDATE payroll_runs
       SET status = 'rejected', rejected_at = NOW(), rejection_reason = 'Reopened by HR for edits'
     WHERE id = v_run.id;

    UPDATE hr_monthly_payroll SET status = 'draft'
     WHERE period_month = p_period AND status = 'submitted';

    INSERT INTO access_log (user_id, resource_type, resource_id, action, metadata)
    VALUES (p_user_id, 'payroll_run', v_run.id::TEXT, 'reopen_to_draft',
        jsonb_build_object('period', p_period, 'total_amount', v_run.total_amount,
            'accruals_auto_reversed', v_reversed));

    RETURN v_run.id;
END;
$function$;
