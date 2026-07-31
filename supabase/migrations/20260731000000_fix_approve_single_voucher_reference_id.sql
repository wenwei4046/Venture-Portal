-- approve_single_voucher: SELECT the reference_id it reads (2026-07-31).
--
-- Mig 20260727100000 taught the custody credit to follow the funding request's
-- target_pool (staff → dept_pool_hr, director → dept_pool_director):
--
--     COALESCE((SELECT ppr.target_pool FROM payroll_payment_requests ppr
--                WHERE v_voucher.reference_type = 'payroll_payment_request'
--                  AND ppr.id = v_voucher.reference_id), 'dept_pool_hr')
--
-- …but the SELECT that fills v_voucher never fetched pv.reference_id, so every
-- payroll_bank_transfer approval died at runtime with
--     record "v_voucher" has no field "reference_id"
-- (user hit it on HV-PV-202607-0184, Director salary bank transfer Jun 2026).
-- PL/pgSQL only resolves record fields when the line executes, which is why
-- this shipped green and broke on the first director round.
--
-- Anchored patch against the live definition: assert the SELECT list appears
-- exactly once, then add the column.

DO $mig$
DECLARE
  v_def text; v_new text; v_hits int;
  v_anchor text := 'pv.loan_id, pv.repayment_breakdown, pv.status, pv.reference_type, pv.payment_date';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'approve_single_voucher';
  IF v_def IS NULL THEN RAISE EXCEPTION 'approve_single_voucher not found'; END IF;

  -- Already patched (idempotent re-run).
  IF v_def LIKE '%pv.reference_type, pv.reference_id, pv.payment_date%' THEN RETURN; END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_hits <> 1 THEN RAISE EXCEPTION 'approve_single_voucher: anchor count = % (expected 1)', v_hits; END IF;

  v_new := replace(v_def, v_anchor,
    'pv.loan_id, pv.repayment_breakdown, pv.status, pv.reference_type, pv.reference_id, pv.payment_date');
  EXECUTE v_new;
END $mig$;
