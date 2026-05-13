-- 20260101000234_payment_categories_account_type_not_null.sql
-- Every payment category must declare a classification (Balance-Sheet vs P&L).
-- Pre-req: every row already has account_type set (verify before applying).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_categories WHERE account_type IS NULL) THEN
    RAISE EXCEPTION 'payment_categories has rows with NULL account_type — backfill before applying';
  END IF;
END $$;
ALTER TABLE payment_categories ALTER COLUMN account_type SET NOT NULL;
COMMIT;
