-- 20260101000251_credit_vouchers_require_bank.sql
--
-- Audit on 2026-05-14 turned up RM 33,500 drift between
-- bank_accounts.current_balance (cache) and the GL on Hong Leong
-- (account 3000). Root cause: six paid billing_payment (credit)
-- vouchers had bank_account_id = NULL. The approve_single_voucher
-- RPC's cache-update block is gated on `bank_account_id IS NOT NULL`,
-- so it was skipped. But the JE post fell through to the '3000'
-- fallback and credited the GL anyway — GL +33,500, cache untouched.
--
-- mig 242 added a CHECK constraint requiring debit vouchers to carry
-- bank_account_id. This migration broadens it to ALSO require
-- bank_account_id on PAID credit vouchers, except when payment_method
-- is 'netting' (a true cashless offset, no bank touched).
--
-- Pre-req before VALIDATEing: any existing debit-or-credit row that
-- violates the new check must be backfilled or excluded. The DO block
-- at the top of this migration sets bank_account_id to the primary
-- active bank for any paid credit voucher that's missing one, so the
-- VALIDATE step succeeds. (Same shape as mig 242's pre-check.) The
-- helper script alongside this commit also bumps bank_accounts.
-- current_balance to match the GL — that's a one-time data resync,
-- not part of the migration itself.

BEGIN;

DO $$
DECLARE
  v_primary_bank UUID;
  v_backfilled INT;
BEGIN
  SELECT id INTO v_primary_bank
    FROM bank_accounts
   WHERE is_primary = true AND status = 'active'
   LIMIT 1;
  IF v_primary_bank IS NULL THEN
    RAISE EXCEPTION 'mig 251: no primary active bank — cannot backfill voucher bank_account_id';
  END IF;
  UPDATE payment_vouchers
     SET bank_account_id = v_primary_bank
   WHERE direction = 'credit'
     AND status = 'paid'
     AND bank_account_id IS NULL
     AND COALESCE(payment_method, '') <> 'netting';
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;
  RAISE NOTICE 'mig 251: backfilled bank_account_id on % paid credit vouchers', v_backfilled;
END $$;

-- Drop the mig 242 narrow CHECK and replace with the broader one. The
-- combined rule: any voucher in a settled status (paid / pending) must
-- declare bank_account_id unless it's a netting transaction (which never
-- touches a real bank account).
ALTER TABLE payment_vouchers
  DROP CONSTRAINT IF EXISTS debit_voucher_requires_bank;

ALTER TABLE payment_vouchers
  ADD CONSTRAINT voucher_requires_bank
  CHECK (
    -- Only enforce on rows that actually move money. Draft / voided
    -- rows can have NULL while Finance is still composing them.
    status NOT IN ('paid', 'pending_approval')
    OR COALESCE(payment_method, '') = 'netting'
    OR bank_account_id IS NOT NULL
  ) NOT VALID;

ALTER TABLE payment_vouchers VALIDATE CONSTRAINT voucher_requires_bank;

COMMIT;
