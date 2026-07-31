-- Statutory PV descriptions must state the shares they actually carry
-- (2026-07-31, user: "帮我改描述，去掉 directors").
--
-- create_payroll_statutory_vouchers sums staff (hr_monthly_payroll) +
-- directors (director_monthly_payroll) per scheme, but the description was the
-- HARDCODED string '… payroll (staff + directors)'. The five Jun-2026 vouchers
-- (HV-PV-202607-0173..0177) were generated on 16 Jul, before the directors'
-- InfoTech actuals existed — v_dir_amt was 0, every amount tied to the staff
-- accruals to the cent, yet each label claimed the directors were in. Anyone
-- reading the ledger would think the director statutory was already paid.
--
-- 1) Generator: label from the actual shares —
--      both > 0            → ' (staff + directors)'
--      directors only      → ' (directors)'
--      staff only (or 0)   → ' (staff)'
--    Anchored patch on the live definition (mig-156 pattern), idempotent.
-- 2) Data: rewrite the five Jun vouchers' text everywhere it was copied —
--    payment_vouchers, their journal_entries, dept_pools drain rows.
--    (approval_requests never carried the suffix.) Text only; no amounts,
--    no GL effect.

DO $mig$
DECLARE
  v_def text; v_new text; v_hits int;
  v_anchor text := '|| '' payroll (staff + directors)'',';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_payroll_statutory_vouchers';
  IF v_def IS NULL THEN RAISE EXCEPTION 'create_payroll_statutory_vouchers not found'; END IF;

  IF v_def NOT LIKE '%'' (directors)''%' THEN
    v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_hits <> 1 THEN RAISE EXCEPTION 'label anchor count = % (expected 1)', v_hits; END IF;
    v_new := replace(v_def, v_anchor,
      '|| '' payroll'' || CASE WHEN COALESCE(v_dir_amt,0) > 0 AND COALESCE(v_staff_amt,0) > 0 THEN '' (staff + directors)'' WHEN COALESCE(v_dir_amt,0) > 0 THEN '' (directors)'' ELSE '' (staff)'' END,');
    EXECUTE v_new;
  END IF;
END $mig$;

-- Data fix for the five Jun-2026 vouchers (idempotent: LIKE-guarded).
WITH pvs AS (
  SELECT id FROM payment_vouchers
  WHERE voucher_no IN ('HV-PV-202607-0173','HV-PV-202607-0174','HV-PV-202607-0175',
                       'HV-PV-202607-0176','HV-PV-202607-0177')
),
u1 AS (
  UPDATE payment_vouchers SET description = replace(description, ' (staff + directors)', ' (staff)')
  WHERE id IN (SELECT id FROM pvs) AND description LIKE '%(staff + directors)%' RETURNING 1
),
u2 AS (
  UPDATE journal_entries SET description = replace(description, ' (staff + directors)', ' (staff)')
  WHERE reference_type = 'payment_voucher' AND reference_id IN (SELECT id FROM pvs)
    AND description LIKE '%(staff + directors)%' RETURNING 1
),
u3 AS (
  UPDATE dept_pools SET description = replace(description, ' (staff + directors)', ' (staff)')
  WHERE description SIMILAR TO '%HV-PV-202607-017[3-7]%'
    AND description LIKE '%(staff + directors)%' RETURNING 1
)
SELECT (SELECT count(*) FROM u1), (SELECT count(*) FROM u2), (SELECT count(*) FROM u3);
