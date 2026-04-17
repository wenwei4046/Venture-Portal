-- ============================================================================
-- 20260101000141_hr_staff_basic_nonneg.sql
-- Spec 6 fix — allow zero basic_salary for commission-only staff
-- HOUZS Venture Portal
--
-- Original CHECK (migration 000007) required basic_salary > 0. HV020
-- Rachael Lim is commission-only with basic 0 in InfoTech. Constraint
-- relaxed to >= 0 so commission-eligible staff can be imported.
-- ============================================================================

ALTER TABLE hr_staff_costs
    DROP CONSTRAINT basic_salary_positive;

ALTER TABLE hr_staff_costs
    ADD CONSTRAINT basic_salary_non_negative
    CHECK (basic_salary >= 0);
