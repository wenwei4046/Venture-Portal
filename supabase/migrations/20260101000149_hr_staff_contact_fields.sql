-- ============================================================================
-- 20260101000149_hr_staff_contact_fields.sql
-- HR Staff — personal contact + emergency contact fields
-- HOUZS Venture Portal
--
-- Staff details page needs phone, email, address, and emergency contact so HR
-- can look these up without opening an external HRMS. Same PDPA sensitivity
-- as salary and bank account — gated by the existing hr_staff_costs RLS
-- (HR + Principal only), no separate policy needed.
--
-- All columns nullable so existing rows stay valid; HR backfills via the
-- Edit Staff form.
-- ============================================================================

ALTER TABLE hr_staff_costs
    ADD COLUMN address TEXT,
    ADD COLUMN contact_number TEXT,
    ADD COLUMN email TEXT,
    ADD COLUMN emergency_contact_name TEXT,
    ADD COLUMN emergency_contact_phone TEXT,
    ADD COLUMN emergency_contact_relationship TEXT;

COMMENT ON COLUMN hr_staff_costs.address IS
    'Residential address. PDPA-sensitive — HR + Principal only via RLS.';

COMMENT ON COLUMN hr_staff_costs.contact_number IS
    'Primary phone number (Malaysian format, free text — HR validates).';

COMMENT ON COLUMN hr_staff_costs.email IS
    'Personal email — used for payslip distribution (future).';

COMMENT ON COLUMN hr_staff_costs.emergency_contact_name IS
    'Emergency contact full name.';

COMMENT ON COLUMN hr_staff_costs.emergency_contact_phone IS
    'Emergency contact phone number.';

COMMENT ON COLUMN hr_staff_costs.emergency_contact_relationship IS
    'Relationship to employee (spouse, parent, sibling, etc.).';
