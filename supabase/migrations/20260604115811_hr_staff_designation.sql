-- ============================================================================
-- Migration 280: hr_staff_costs.designation — job title from the InfoTech
--                Employee List import (user 2026-06-04, R1)
-- ============================================================================
-- The InfoTech staff parser already reads designation (col 4) but the import
-- dropped it because hr_staff_costs had no column. Plain nullable TEXT —
-- informational only, no statutory/costing impact.

ALTER TABLE hr_staff_costs ADD COLUMN designation TEXT;

COMMENT ON COLUMN hr_staff_costs.designation IS
    'Mig 280: job title / designation, filled by the InfoTech Employee List import or the staff form.';
