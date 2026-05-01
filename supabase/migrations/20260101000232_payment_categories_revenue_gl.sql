-- ============================================================================
-- 20260101000232_payment_categories_revenue_gl.sql
-- Phase 11.1: optional revenue_gl_account_code on payment_categories.
--
-- Why: payment_categories.gl_account_code was seeded with the EXPENSE side
-- (5040/5050) for /payments/new outflow. When the same category appears on an
-- invoice, the credit side must hit a revenue-type account. Phase 11 falls
-- back to billing_mode→4030/4040 when the category's GL is non-revenue.
--
-- Phase 11.1 lets Finance opt-in per category by setting a revenue_gl_account_code
-- pointing at a chart_of_accounts row of type='revenue'. NULL keeps the
-- fallback. Hybrid path: no new revenue sub-accounts are created up front —
-- Finance maps to 4030/4040 today, can add 4031/4032/etc. later.
-- ============================================================================

ALTER TABLE payment_categories
    ADD COLUMN revenue_gl_account_code VARCHAR(20) REFERENCES chart_of_accounts(code);

COMMENT ON COLUMN payment_categories.revenue_gl_account_code IS
    'Phase 11.1: GL account credited when this category appears on an invoice. '
    'Must point at a chart_of_accounts row of type=''revenue''. NULL falls back '
    'to billing_mode→4030/4040 mapping. Set per-category via Settings → Categories.';
