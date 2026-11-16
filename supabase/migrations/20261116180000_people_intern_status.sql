-- ============================================================================
-- 20261116180000_people_intern_status.sql
-- Intern — a fifth employment status (2026-11-16, the user: "employee status 可以加多一个option Intern吗？").
-- ============================================================================
--
-- hr_staff_costs.employment_status + 'intern' (Probation, Contract, Permanent, Part time, Intern; NULL = not set yet).
-- No period, as Part time: probation_months and contract_months stay NULL (their checks already require it for
-- anything but 'probation' / 'contract'), so probation_end and contract_end stay NULL too.
-- Production's constraint before this (checked 2026-11-16) is 20261025013000's, word for word.

ALTER TABLE public.hr_staff_costs DROP CONSTRAINT IF EXISTS hr_staff_costs_employment_status_check;
ALTER TABLE public.hr_staff_costs ADD CONSTRAINT hr_staff_costs_employment_status_check
  CHECK (employment_status IS NULL OR employment_status IN ('probation', 'contract', 'permanent', 'part_time', 'intern'));
