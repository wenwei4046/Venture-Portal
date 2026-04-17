-- ============================================================================
-- 20260101000139_hr_staff_bank_account.sql
-- Spec 5 (HR Payroll Redesign) — bank account fields for bulk transfer files
-- HOUZS Venture Portal
--
-- The HL Connect / Maybank2E / RHB Reflex / PBB eAF bulk payment files all
-- need each employee's receiving bank + account number. We didn't need
-- them for the grid + approval flow, but the transfer file is the moment
-- HR needs them exported.
--
-- Both columns nullable so existing rows stay valid; HR backfills via the
-- Edit Staff form before generating a transfer file for the first time.
-- Same PDPA sensitivity as salary — no separate RLS.
-- ============================================================================

ALTER TABLE hr_staff_costs
    ADD COLUMN bank_name TEXT,
    ADD COLUMN bank_account_no TEXT;

COMMENT ON COLUMN hr_staff_costs.bank_name IS
    'Spec 5: receiving bank (e.g., Maybank, Hong Leong, RHB, Public Bank). Free text so HR can enter whatever matches the bulk-transfer format.';

COMMENT ON COLUMN hr_staff_costs.bank_account_no IS
    'Spec 5: receiving account number. Digits only; no formatting. HR validates before export.';
