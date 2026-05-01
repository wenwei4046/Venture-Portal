-- ============================================================================
-- 20260101000231_credit_note_billing_mode_and_category.sql
-- Phase 11 Step 2/2: Add billing_mode + category_code to credit_notes.
--
-- Why: credit_notes inherited pool/category implicitly from parent invoice.
-- After Loo's "multi-pool credit note" redesign each CN carries its own pool
-- (billing_mode) and category — letting one parent invoice be credited back
-- across multiple pools, each posting its own contra JE.
--
-- Nullable on purpose: existing rows pre-Phase-11 stay valid (legacy CNs
-- inherit from invoice on application). App-layer validation requires both
-- on new CNs.
-- ============================================================================

ALTER TABLE credit_notes
    ADD COLUMN billing_mode  billing_mode,
    ADD COLUMN category_code VARCHAR(30) REFERENCES payment_categories(code);

CREATE INDEX idx_cn_category_code
    ON credit_notes(category_code)
    WHERE category_code IS NOT NULL;

COMMENT ON COLUMN credit_notes.billing_mode IS
    'Phase 11: pool to debit on settlement. NULL for legacy rows (inherits from parent invoice).';
COMMENT ON COLUMN credit_notes.category_code IS
    'Phase 11: GL routing category. NULL for legacy rows. References payment_categories.code.';
