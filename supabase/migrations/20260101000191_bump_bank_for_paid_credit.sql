-- ============================================================================
-- 20260101000191_bump_bank_for_paid_credit.sql
-- Phase 9 hotfix — auto-complete credit PVs created by Finance were failing
-- to bump bank_accounts.current_balance because RLS on bank_accounts only
-- allows Principal to UPDATE. The Finance-initiated UPDATE in
-- createPaymentVoucher (src/app/(portal)/payments/actions.ts:214) ran
-- silently with 0 rows affected — no error surfaced, bank balance stayed
-- unchanged even though the ledger entries (pool + journal) went through.
--
-- Surfaced during E2E #2: Finance settled invoice HV-INV-202604-0001 for
-- RM 3,000 via the "Settle" flow. Marketing Pool got +3,000 (dept_pools
-- RLS permits finance INSERT) but Hong Leong stayed at RM 0.00 instead
-- of +3,000.
--
-- Fix: SECURITY DEFINER RPC that runs a controlled bank bump on a PV that
-- is already in status='paid' + direction='credit'. The RPC verifies the
-- voucher state as its own authorisation — caller (Finance or Principal)
-- can only trigger the bump for a voucher that has legitimately reached
-- paid via the INSERT path. RLS on bank_accounts stays locked down.
-- ============================================================================

CREATE OR REPLACE FUNCTION bump_bank_for_paid_credit(p_voucher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role    user_role;
    v_voucher RECORD;
BEGIN
    v_role := current_user_role();
    IF v_role NOT IN ('finance', 'principal') THEN
        RAISE EXCEPTION 'bump_bank_for_paid_credit: role % is not allowed', v_role;
    END IF;

    SELECT id, status, direction, amount, bank_account_id
      INTO v_voucher
      FROM payment_vouchers
     WHERE id = p_voucher_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'bump_bank_for_paid_credit: voucher % not found', p_voucher_id;
    END IF;

    -- Guard: only act on already-paid credit vouchers with a bank attached.
    IF v_voucher.status <> 'paid' OR v_voucher.direction <> 'credit' THEN
        RETURN;
    END IF;
    IF v_voucher.bank_account_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE bank_accounts
       SET current_balance = current_balance + v_voucher.amount
     WHERE id = v_voucher.bank_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION bump_bank_for_paid_credit(UUID) TO authenticated;
