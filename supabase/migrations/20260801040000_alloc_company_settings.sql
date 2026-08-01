-- Allocator-scoped company participation (2026-08-01, user: "我要能自己
-- maintain 哪些公司出现") — the port of the sheet's Companies/Status column.
--
-- Absence of a row = participating (default on). Disabling here only removes
-- the company from the ALLOCATOR's pickers, Equal splits and calc targets —
-- it does NOT touch companies.is_active (loans/invoices elsewhere unaffected),
-- and historical allocator records keep resolving their labels.

CREATE TABLE IF NOT EXISTS alloc_company_settings (
    company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE alloc_company_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alloc_company_settings_finance_all ON alloc_company_settings;
CREATE POLICY alloc_company_settings_finance_all ON alloc_company_settings
    FOR ALL
    USING (current_user_role() IN ('finance', 'principal'))
    WITH CHECK (current_user_role() IN ('finance', 'principal'));
