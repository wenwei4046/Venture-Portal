-- 20260101000254_pvs_role_for_mirror_rows.sql
--
-- Inter-billing (mig 253) requires TWO payment_voucher_sources rows on a
-- single billing_payment credit voucher:
--   - primary: receiving side (Marketing pool, account 3030 AR, amount=N)
--   - mirror:  paying side    (HR pool,        account 9053 expense, amount=N)
-- Both rows carry the full voucher amount because they represent the two
-- sides of the same N-rupee transaction, not a split of it.
--
-- The existing pvs_enforce_sum_matches_voucher AFTER trigger sums ALL
-- pvs rows and requires the total to equal voucher.amount. With two
-- mirror rows of N each, the sum is 2N — trigger rejects. The 2026-05-14
-- session shipped the actions.ts insert without checking the supabase-js
-- error, so the rejection was silent: only the primary row landed and
-- the paying dept's P&L stayed empty.
--
-- Fix:
--   (1) Add payment_voucher_sources.role enum-like column:
--       'primary' (default) — counts toward sum
--       'mirror'            — the inter-billing opposite-side row
--   (2) Update pvs_enforce_sum_matches_voucher to SUM only role='primary'.
--
-- Going forward, any voucher that needs a "second side" entry (e.g. future
-- inter-company transfers) inserts a 'mirror' row instead of fighting the
-- sum constraint.

BEGIN;

-- ── 1. Add role column (default 'primary' keeps every existing row valid) ──
ALTER TABLE payment_voucher_sources
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'primary'
  CHECK (role IN ('primary', 'mirror'));

COMMENT ON COLUMN payment_voucher_sources.role IS
  'primary = counts toward the voucher.amount sum check. '
  'mirror  = paired entry for the other side of the transaction '
  '(e.g. inter-billing paying-dept expense row). Mirror rows are '
  'reported into the pool/account they reference but are excluded from '
  'the sum-matches trigger so the voucher.amount still represents a '
  'single transaction value.';

-- ── 2. Update the sum-check trigger to ignore mirror rows ──────────────────
CREATE OR REPLACE FUNCTION public.pvs_enforce_sum_matches_voucher()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_voucher_id UUID;
    v_voucher_amount DECIMAL;
    v_voucher_status TEXT;
    v_sum DECIMAL;
BEGIN
    v_voucher_id := COALESCE(NEW.voucher_id, OLD.voucher_id);

    SELECT amount, status::TEXT
    INTO v_voucher_amount, v_voucher_status
    FROM payment_vouchers WHERE id = v_voucher_id;

    -- Drafts may have partial sums while Finance is editing.
    -- Only enforce once the voucher is locked in (approved or paid).
    IF v_voucher_status NOT IN ('approved', 'paid') THEN
        RETURN NULL;
    END IF;

    -- Mirror rows (mig 254) are paired entries for the other side of the
    -- transaction (e.g. inter-billing paying-dept expense) — they don't
    -- represent a split of the voucher amount, so they're excluded from
    -- the integrity check.
    SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM payment_voucher_sources
    WHERE voucher_id = v_voucher_id
      AND role = 'primary';

    IF v_sum <> v_voucher_amount THEN
        RAISE EXCEPTION
            'payment_voucher_sources primary-row sum (%) does not match voucher.amount (%) for voucher %',
            v_sum, v_voucher_amount, v_voucher_id;
    END IF;

    RETURN NULL;
END;
$function$;

COMMIT;
