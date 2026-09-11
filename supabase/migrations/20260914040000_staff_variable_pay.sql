-- ============================================================================
-- 20260914040000_staff_variable_pay.sql
-- Variable pay — a third employment type, for the Director department
-- HOUZS Venture Portal · 2026-09-11
--
-- A director's pay is not a fixed basic: the Director Salary engine works the
-- figure out every month (pool share, fixed floor, Vr KPI) and it is keyed in
-- for that month. Filing a director on the People roster therefore has no
-- basic or allowance to give, and asking for one (the form required RM14,400
-- to be typed in) recorded a number nothing reads.
--
-- The Add / Edit Staff forms now offer a "Variable pay" tick in the Director
-- department (`departments.segment_key = 'director'`), the way a commission
-- department offers "Fully commission based". Ticked, the record is saved as
-- employment_type = 'variable' with basic / statutory allowance /
-- non-statutory allowance all 0. The statutory categories stay: whatever is
-- keyed on a month's payroll row still attracts EPF / SOCSO / EIS / PCB by
-- them.
--
-- Additive only. No row changes meaning; nothing reads the new value except
-- the People forms (src/lib/staff-form.ts: isVariablePay / offersVariablePay).
-- ============================================================================

ALTER TYPE hr_employment_type ADD VALUE IF NOT EXISTS 'variable';

COMMENT ON TYPE hr_employment_type IS
    'salaried = fixed basic only; commission_eligible = basic + commission via commission_rules (Spec 1c); variable = no fixed basic, the month''s figure is keyed each month — the Director department (2026-09-11).';
