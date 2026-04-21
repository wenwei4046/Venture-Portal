-- ============================================================================
-- 20260101000204_soft_wipe_payment_categories.sql
-- Soft-delete all 15 seed payment_categories. User wants a clean slate to
-- rebuild with only the categories they actually use. Soft delete preserves
-- FK integrity on existing payment_vouchers.category_code and keeps historical
-- voucher rows displaying their category label.
--
-- Hard delete blocked by:
--   - RLS policy pc_no_delete (mig 61) forbids DELETE
--   - FK payment_vouchers.category_code → payment_categories.code (default
--     RESTRICT) would break any voucher still referencing a seed category
-- ============================================================================

BEGIN;

UPDATE payment_categories
SET is_active = FALSE
WHERE code IN (
    'logistics', 'food', 'rental', 'advertising', 'utilities',
    'stationery', 'travel', 'professional', 'salary_ctc',
    'loan_interest', 'loan_principal', 'marketing', 'maintenance',
    'insurance', 'other'
);

COMMIT;
