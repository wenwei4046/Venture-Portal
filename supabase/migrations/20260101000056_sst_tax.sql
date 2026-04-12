-- ============================================================================
-- 20260101000056_sst_tax.sql
-- SST (Service Tax) support on invoices
-- HOUZS Venture Portal — Phase 4 Step 8
--
-- Design:
--   - Add sst_rate + sst_amount columns to invoices
--   - SST rate configurable in treasury_config (default 8%)
--   - total_amount = base_amount + sst_amount
--   - Statement lines break out SST as separate line
-- ============================================================================

-- Add SST columns to invoices
ALTER TABLE invoices
    ADD COLUMN sst_rate DECIMAL(7, 6) DEFAULT 0,
    ADD COLUMN sst_amount DECIMAL(15, 2) DEFAULT 0;

COMMENT ON COLUMN invoices.sst_rate IS
    'SST rate applied (e.g., 0.08 = 8%). 0 for exempt items.';
COMMENT ON COLUMN invoices.sst_amount IS
    'SST amount = base_amount × sst_rate. Included in total_amount.';

-- Add SST rate to treasury_config
INSERT INTO treasury_config (id, config_key, config_value, description)
VALUES (gen_random_uuid(), 'sst_rate', 0.08, 'Service Tax rate (8% default, 0 for exempt)')
ON CONFLICT (config_key) DO NOTHING;

-- Add SST statement category
INSERT INTO statement_categories (code, label, description, default_line_type, default_direction, sort_order)
VALUES ('sst', 'Service Tax (SST)', 'SST 8% on billable services', 'invoice', 'receivable', 160)
ON CONFLICT (code) DO NOTHING;
