-- Allocator targets can be DEPARTMENTS too (2026-08-01, user ruling during the
-- spreadsheet import: "marketing 算inter-billing。单还是要开").
--
-- The user's sheet allocated headcount to "Marketing Department" alongside the
-- subsidiaries, and billed it. The portal already invoices departments
-- (billable_to_type='dept_pool', settled via inter-billing netting), so the
-- allocator's target set becomes: subsidiary (company_id) XOR department
-- (department_id) XOR HV own (both NULL).

ALTER TABLE alloc_staff_splits ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE alloc_staff_history ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE alloc_txn_details ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alloc_staff_splits_one_target') THEN
        ALTER TABLE alloc_staff_splits
            ADD CONSTRAINT alloc_staff_splits_one_target CHECK (company_id IS NULL OR department_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alloc_txn_details_one_target') THEN
        ALTER TABLE alloc_txn_details
            ADD CONSTRAINT alloc_txn_details_one_target CHECK (company_id IS NULL OR department_id IS NULL);
    END IF;
END $$;
