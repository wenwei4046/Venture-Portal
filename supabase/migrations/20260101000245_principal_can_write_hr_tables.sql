-- 20260101000245_principal_can_write_hr_tables.sql
--
-- Decision 2026-05-14: Principal must be able to override HR data — fix
-- typos in CTC, payouts, staff records, and monthly payroll rows after HR
-- has submitted but before disbursement. The TS server actions in
-- director-salary/actions.ts and hr-costing/**/actions.ts already pass
-- requireRole(['hr', 'principal']), but the RLS policies still pinned
-- writes to 'hr' only. Result: Principal saw the form, the action ran
-- without error, but the row never changed (silent-fail same as
-- mig 243 / mig 244).
--
-- This migration expands the write policies on four tables so principal
-- and hr can both write. The status='draft' guard on hr_monthly_payroll
-- stays for HR (HR may only edit before submission); principal can write
-- in any status because principal is the override path.
--
-- Tables touched:
--   - director_ctc            (INSERT, UPDATE)
--   - director_payouts        (INSERT — UPDATE already covers principal)
--   - hr_staff_costs          (INSERT, UPDATE — DELETE already covers principal)
--   - hr_monthly_payroll      (INSERT, UPDATE, DELETE — split policy
--                              so HR keeps draft-only and principal gets
--                              all-status)

BEGIN;

-- ── director_ctc ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS director_ctc_hr_insert ON director_ctc;
CREATE POLICY director_ctc_hr_insert ON director_ctc
  FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['hr'::user_role, 'principal'::user_role]));

DROP POLICY IF EXISTS director_ctc_hr_update ON director_ctc;
CREATE POLICY director_ctc_hr_update ON director_ctc
  FOR UPDATE
  USING (current_user_role() = ANY (ARRAY['hr'::user_role, 'principal'::user_role]));


-- ── director_payouts ──────────────────────────────────────────────────────
-- UPDATE policy already allows (principal, hr, finance). Only INSERT is hr-only.
DROP POLICY IF EXISTS director_payouts_hr_insert ON director_payouts;
CREATE POLICY director_payouts_hr_insert ON director_payouts
  FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['hr'::user_role, 'principal'::user_role]));


-- ── hr_staff_costs ────────────────────────────────────────────────────────
-- DELETE policy already allows (principal, hr).
DROP POLICY IF EXISTS hr_staff_costs_hr_write ON hr_staff_costs;
CREATE POLICY hr_staff_costs_hr_write ON hr_staff_costs
  FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['hr'::user_role, 'principal'::user_role]));

DROP POLICY IF EXISTS hr_staff_costs_hr_update ON hr_staff_costs;
CREATE POLICY hr_staff_costs_hr_update ON hr_staff_costs
  FOR UPDATE
  USING (current_user_role() = ANY (ARRAY['hr'::user_role, 'principal'::user_role]));


-- ── hr_monthly_payroll ────────────────────────────────────────────────────
-- HR keeps the status='draft' guard (must only edit before submission).
-- Principal gets unconditional write (override path for post-submission
-- corrections per access-matrix.md §HR Costing).
DROP POLICY IF EXISTS hr_monthly_payroll_hr_insert ON hr_monthly_payroll;
CREATE POLICY hr_monthly_payroll_hr_insert ON hr_monthly_payroll
  FOR INSERT
  WITH CHECK (
    (current_user_role() = 'hr'::user_role AND status = 'draft'::hr_monthly_payroll_status)
    OR current_user_role() = 'principal'::user_role
  );

DROP POLICY IF EXISTS hr_monthly_payroll_hr_update ON hr_monthly_payroll;
CREATE POLICY hr_monthly_payroll_hr_update ON hr_monthly_payroll
  FOR UPDATE
  USING (
    (current_user_role() = 'hr'::user_role AND status = 'draft'::hr_monthly_payroll_status)
    OR current_user_role() = 'principal'::user_role
  );

DROP POLICY IF EXISTS hr_monthly_payroll_hr_delete ON hr_monthly_payroll;
CREATE POLICY hr_monthly_payroll_hr_delete ON hr_monthly_payroll
  FOR DELETE
  USING (
    (current_user_role() = 'hr'::user_role AND status = 'draft'::hr_monthly_payroll_status)
    OR current_user_role() = 'principal'::user_role
  );

COMMIT;
