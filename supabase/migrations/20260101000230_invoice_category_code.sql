-- ============================================================================
-- 20260101000230_invoice_category_code.sql
-- Phase 11 Step 1/2: Add category_code to invoices for GL routing.
--
-- Why: invoices were created with billing_mode (pool selector) only — no
-- category for GL P&L line classification. After Loo's "multi-pool invoice"
-- redesign each invoice carries a category_code so settlement JEs route to
-- the right account in chart_of_accounts via payment_categories.gl_account_code.
--
-- Nullable on purpose: existing rows pre-Phase-11 stay valid. App-layer
-- validation requires category on new rows; reports COALESCE NULL → 'other'.
-- ============================================================================

ALTER TABLE invoices
    ADD COLUMN category_code VARCHAR(30) REFERENCES payment_categories(code);

CREATE INDEX idx_invoices_category_code
    ON invoices(category_code)
    WHERE category_code IS NOT NULL;

COMMENT ON COLUMN invoices.category_code IS
    'Phase 11: GL routing category. NULL for legacy rows. References payment_categories.code.';
