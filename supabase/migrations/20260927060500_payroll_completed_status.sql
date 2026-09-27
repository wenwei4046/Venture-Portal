-- ════════════════════════════════════════════════════════════════════════════
-- A payroll row can be COMPLETED (2026-09-27, the unified Payroll)
--
-- One value, in a migration of its own: Postgres will not let a transaction
-- use an enum value it added itself, and 20260927061000 uses it everywhere.
--
--   draft → completed → submitted → paid
--
-- `completed` is "checked and closed, not sent yet": HR ticked the person and
-- pressed Complete (or, for a salesperson, closed them on Comm Cal). Nothing
-- reads it until 20260927061000, so on its own this changes nothing.
--
-- Rollback: an enum value cannot be dropped in place; it is harmless unused.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TYPE public.hr_monthly_payroll_status ADD VALUE IF NOT EXISTS 'completed' AFTER 'draft';
