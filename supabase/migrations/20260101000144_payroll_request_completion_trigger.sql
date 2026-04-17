-- ============================================================================
-- 20260101000144_payroll_request_completion_trigger.sql
-- Auto-flip payroll_payment_requests → 'completed' when the linked PV is paid.
-- HOUZS Venture Portal — payroll flow refactor commit 3b of 4
--
-- Chain of effects when Principal approves + executes a payroll PV:
--   1. payment_vouchers.status = 'paid'
--   2. existing fan_out_payroll_bank_transfer trigger (migration 138) moves
--      money: operating_pools debits → alliance_bank_pool credit
--   3. THIS trigger marks the linked payroll_payment_requests row as
--      'completed' so the HR-side UI reflects "HR Pool funded"
--
-- Matches by payroll_payment_requests.pv_id. Idempotent: only flips rows
-- currently in 'pv_generated' (won't touch already-completed or cancelled).
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_payroll_request_on_pv_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Fire only when a payment voucher transitions into 'paid'.
    IF NEW.status <> 'paid' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
        RETURN NEW;
    END IF;

    UPDATE payroll_payment_requests
       SET status = 'completed',
           updated_at = NOW()
     WHERE pv_id = NEW.id
       AND status = 'pv_generated';

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_payroll_request_on_pv_paid ON payment_vouchers;

CREATE TRIGGER trg_complete_payroll_request_on_pv_paid
    AFTER INSERT OR UPDATE OF status ON payment_vouchers
    FOR EACH ROW
    EXECUTE FUNCTION complete_payroll_request_on_pv_paid();

COMMENT ON FUNCTION complete_payroll_request_on_pv_paid() IS
    'Stage F completion hook: when a payment_voucher linked via '
    'payroll_payment_requests.pv_id flips to paid, mark the request '
    'completed so the HR dashboard reflects "HR Pool funded".';
