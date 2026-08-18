-- Mig 20260818112833: re-point July 2026's director salary round at the HR
-- custody pool (user decision 2026-08-18, follow-up to mig 20260818110128).
--
-- 20260818110128 changed the FORWARD behaviour — future director rounds park
-- custody in dept_pool_hr. July 2026 had already run under the old scheme, so
-- its rows still sat entirely on dept_pool_director:
--
--     np_in       +65,309.67  custody   (PV 0255)        ← belonged on HR
--     expense_out −65,309.67  drain     (PV 0255)        ← correct, stays
--     expense_out −43,135.67  payouts   (PV 0271-0274)   ← belonged on HR
--
-- The first and third move to HR so July matches the new shape:
--
--     Director  −65,309.67   fund out
--     HR        +65,309.67   custody
--     HR        −43,135.67   the 4 directors
--                            (statutory 22,174.00 still to come, from HR)
--
-- Balances shift by exactly the unpaid statutory: Director 43,370.19 →
-- 21,196.19, HR 24,220.27 → 46,394.27. That 22,174.00 is July's outstanding
-- EPF/SOCSO/EIS/PCB, which under the new scheme waits in HR custody until the
-- statutory vouchers go out — and those now drain HR too (mig 20260818110128).
--
-- June 2026 is deliberately left alone (user decision) — it ran and closed
-- under the old scheme, statutory included.
--
-- GL is untouched: journal_lines carry no pool dimension, and the JE segment
-- stays 'director' because the cost is still borne by Director via the drain.
-- period_locks was empty for the affected months.
--
-- Idempotent: the block only fires while the rows are still on Director, so
-- re-running (or replaying migrations) is a no-op rather than an error.

BEGIN;

DO $$
DECLARE
  v_hr  UUID := (SELECT id FROM departments WHERE name = 'HR');
  v_dir UUID := (SELECT id FROM departments WHERE name = 'Director');
  v_cnt INT;
  v_pv  UUID[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM dept_pools
     WHERE department_id = v_dir AND transaction_type = 'np_in'
       AND description LIKE 'PV HV-PV-202608-0255:%custody pool'
  ) THEN
    RAISE NOTICE 'july_director_custody_backfill_to_hr: already applied, skipping';
    RETURN;
  END IF;

  -- Moving existing rows, not spending: the sufficiency trigger would judge
  -- each payout against HR's balance mid-move.
  PERFORM set_config('app.allow_pool_overdraw', 'on', true);

  SELECT array_agg(id) INTO v_pv FROM payment_vouchers
   WHERE voucher_no IN ('HV-PV-202608-0271','HV-PV-202608-0272',
                        'HV-PV-202608-0273','HV-PV-202608-0274');
  IF array_length(v_pv,1) <> 4 THEN
    RAISE EXCEPTION 'expected 4 director payout PVs, got %', array_length(v_pv,1);
  END IF;

  -- 1. custody np_in → HR (the drain expense_out stays on Director)
  UPDATE dept_pools SET department_id = v_hr
   WHERE department_id = v_dir AND transaction_type = 'np_in'
     AND description LIKE 'PV HV-PV-202608-0255:%custody pool';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'custody row: expected 1, got %', v_cnt; END IF;

  -- 2. the four payout expense_out rows → HR
  UPDATE dept_pools SET department_id = v_hr
   WHERE department_id = v_dir AND transaction_type = 'expense_out'
     AND description LIKE 'PV HV-PV-202608-027%Director salary Jul 2026%';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 4 THEN RAISE EXCEPTION 'payout rows: expected 4, got %', v_cnt; END IF;

  -- 3-4. the vouchers themselves + their source rows
  UPDATE payment_vouchers SET source_pool = 'dept_pool_hr' WHERE id = ANY(v_pv);
  UPDATE payment_voucher_sources SET pool = 'dept_pool_hr' WHERE voucher_id = ANY(v_pv);

  -- 5. the funding request, so the HR payment card reads the new shape
  UPDATE payroll_payment_requests SET target_pool = 'dept_pool_hr'
   WHERE payroll_run_id IS NULL AND period_month = '2026-07-01';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'funding request: expected 1, got %', v_cnt; END IF;
END $$;

COMMIT;
