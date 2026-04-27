-- ============================================================================
-- 20260101000221_pvs_delete_pending_approval.sql
-- /review C1 fix from 2026-04-28 PV-edit audit:
--
-- Mig 103 created `pvs_finance_delete` allowing DELETE only when the parent
-- voucher's status = 'draft'. The new updatePaymentVoucher action (commit
-- 31b5314) needs to replace source rows on `pending_approval` vouchers too.
-- Without this fix, DELETE silently matches 0 rows (RLS hides the rows) and
-- the subsequent INSERT doubles the source-row count, corrupting GL routing
-- on Principal approve.
--
-- Allowing DELETE on `pending_approval` is safe: at this status the voucher
-- has not posted any journal entries yet (those are written by
-- approve_single_voucher / approve_voucher_batch when status transitions to
-- 'paid'), so source rows are still mutable. Once approved/paid/voided the
-- policy still blocks DELETE.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS pvs_finance_delete ON payment_voucher_sources;

CREATE POLICY pvs_finance_delete ON payment_voucher_sources
    FOR DELETE USING (
        current_user_role() IN ('principal', 'finance')
        AND EXISTS (
            SELECT 1 FROM payment_vouchers pv
            WHERE pv.id = payment_voucher_sources.voucher_id
              AND pv.status IN ('draft', 'pending_approval')
        )
    );

COMMENT ON POLICY pvs_finance_delete ON payment_voucher_sources IS
    'Finance + Principal may delete PVS rows while the parent voucher is editable (draft or pending_approval). Once approved/paid/voided the policy blocks DELETE — source rows are part of the audit chain.';

COMMIT;
