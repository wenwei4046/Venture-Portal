-- 20260101000235_pvs_category_code_required.sql
-- Every payment_voucher_sources row must carry a category that exists in
-- payment_categories. Pre-req: all transactional data wiped (no rows).
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM payment_voucher_sources s
    WHERE s.category_code IS NULL
       OR NOT EXISTS (SELECT 1 FROM payment_categories c WHERE c.code = s.category_code)
  ) THEN
    RAISE EXCEPTION 'payment_voucher_sources has rows with NULL/unknown category_code — clean up before applying';
  END IF;
END $$;
ALTER TABLE payment_voucher_sources ALTER COLUMN category_code SET NOT NULL;
ALTER TABLE payment_voucher_sources
  ADD CONSTRAINT pvs_category_code_fk
  FOREIGN KEY (category_code) REFERENCES payment_categories(code);
COMMIT;
