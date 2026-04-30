-- ============================================================================
-- 20260101000225_invoice_credit_note_polymorphic_billable_to.sql
-- Item 5: invoices + credit_notes can now bill 4 kinds of party, not just
-- subsidiaries: subsidiary / director / dept_pool / freetext.
--
-- Schema strategy: keep existing company_id (used for subsidiary), make it
-- nullable, add a billable_to_type discriminator + 2 new columns covering
-- the other three options. Director uses the freetext column (per Item 4
-- lesson: directors aren't always in the system; free text wins).
--
-- RLS unaffected — existing policies are role-based, not scoped by company_id.
-- ============================================================================

CREATE TYPE billable_to_kind AS ENUM ('subsidiary', 'director', 'dept_pool', 'freetext');

-- ── INVOICES ────────────────────────────────────────────────────────────────
ALTER TABLE invoices
    ADD COLUMN billable_to_type billable_to_kind,
    ADD COLUMN billable_to_department_id UUID REFERENCES departments(id),
    ADD COLUMN billable_to_freetext_name TEXT;

UPDATE invoices SET billable_to_type = 'subsidiary' WHERE billable_to_type IS NULL;

ALTER TABLE invoices ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN billable_to_type SET NOT NULL;

ALTER TABLE invoices ADD CONSTRAINT inv_billable_to_exactly_one CHECK (
    (billable_to_type = 'subsidiary'
        AND company_id IS NOT NULL
        AND billable_to_department_id IS NULL
        AND billable_to_freetext_name IS NULL)
    OR (billable_to_type = 'director'
        AND billable_to_freetext_name IS NOT NULL
        AND company_id IS NULL
        AND billable_to_department_id IS NULL)
    OR (billable_to_type = 'dept_pool'
        AND billable_to_department_id IS NOT NULL
        AND company_id IS NULL
        AND billable_to_freetext_name IS NULL)
    OR (billable_to_type = 'freetext'
        AND billable_to_freetext_name IS NOT NULL
        AND company_id IS NULL
        AND billable_to_department_id IS NULL)
);

COMMENT ON COLUMN invoices.billable_to_type IS
    'Item 5: which kind of party is being billed. company_id used for subsidiary; billable_to_department_id for dept_pool; billable_to_freetext_name for director + freetext.';

-- ── CREDIT_NOTES ────────────────────────────────────────────────────────────
ALTER TABLE credit_notes
    ADD COLUMN billable_to_type billable_to_kind,
    ADD COLUMN billable_to_department_id UUID REFERENCES departments(id),
    ADD COLUMN billable_to_freetext_name TEXT;

UPDATE credit_notes SET billable_to_type = 'subsidiary' WHERE billable_to_type IS NULL;

ALTER TABLE credit_notes ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE credit_notes ALTER COLUMN billable_to_type SET NOT NULL;

ALTER TABLE credit_notes ADD CONSTRAINT cn_billable_to_exactly_one CHECK (
    (billable_to_type = 'subsidiary'
        AND company_id IS NOT NULL
        AND billable_to_department_id IS NULL
        AND billable_to_freetext_name IS NULL)
    OR (billable_to_type = 'director'
        AND billable_to_freetext_name IS NOT NULL
        AND company_id IS NULL
        AND billable_to_department_id IS NULL)
    OR (billable_to_type = 'dept_pool'
        AND billable_to_department_id IS NOT NULL
        AND company_id IS NULL
        AND billable_to_freetext_name IS NULL)
    OR (billable_to_type = 'freetext'
        AND billable_to_freetext_name IS NOT NULL
        AND company_id IS NULL
        AND billable_to_department_id IS NULL)
);

COMMENT ON COLUMN credit_notes.billable_to_type IS
    'Item 5: mirrors invoices.billable_to_type — credit notes can now be raised against directors, dept pools, or free-text parties.';
