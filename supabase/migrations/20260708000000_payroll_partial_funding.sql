-- ============================================================================
-- 20260708000000_payroll_partial_funding.sql
-- Partial payroll funding + dept-pool overdraw for the funding PV (user 2026-07-08).
--
-- WHY
--   Finance can now fund a payroll_payment_request across SEVERAL PVs instead of
--   one all-or-nothing PV, and each dept-pool contribution may drive that pool
--   negative (预支 / advance — plain negative cash, NOT a booked inter-co loan).
--   The Generate-PV grid was dead-locking when a pool was short or the source
--   bank looked short (the funding PV is an accrual — Dr 9030 / Cr 4020 — and
--   never moves the source bank's cash, so that bank check was stale).
--
-- TWO DB CHANGES
--   (1) complete_payroll_request_on_pv_paid — was keyed on the single pv_id and
--       flipped 'pv_generated' → 'completed' on the first paid PV. Now it keys on
--       reference_id and only completes once the CUMULATIVE paid across all
--       funding PVs (reference_type='payroll_payment_request') reaches the request
--       total. Until then the request stays fundable so Finance can pay the rest.
--   (2) approve_single_voucher — auto-allow dept-pool overdraw for
--       voucher_type='payroll_bank_transfer'. Applied by transforming the LIVE
--       definition (string-replace of the single overdraw guard) rather than
--       re-emitting the 240-line body, so every other branch stays byte-identical.
--       Covers both approval entry points (/payments approveVoucher and
--       /approvals performApproval) in one place.
--
-- NOT changed: the accrual GL (Dr 9030 / Cr 4020), the bank sufficiency check for
-- every OTHER voucher type, and the disbursement guard (still needs the request
-- 'completed' = fully funded).
-- ============================================================================

-- ── (1) Completion keys on cumulative paid, not a single pv_id ───────────────
CREATE OR REPLACE FUNCTION complete_payroll_request_on_pv_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total DECIMAL(15, 2);
    v_paid  DECIMAL(15, 2);
BEGIN
    -- Fire only when a payment voucher transitions into 'paid'.
    IF NEW.status <> 'paid' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
        RETURN NEW;
    END IF;

    -- Only funding PVs advance a request. Disbursement PVs
    -- (reference_type='payroll_disbursement') and everything else are ignored.
    IF NEW.reference_type <> 'payroll_payment_request' OR NEW.reference_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT amount INTO v_total
      FROM payroll_payment_requests
     WHERE id = NEW.reference_id;
    IF v_total IS NULL THEN
        RETURN NEW;
    END IF;

    -- Cumulative PAID across all (possibly several partial) funding PVs for this
    -- request. Voided/pending PVs don't count.
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
      FROM payment_vouchers
     WHERE reference_type = 'payroll_payment_request'
       AND reference_id = NEW.reference_id
       AND status = 'paid';

    -- Complete only once fully funded (cent tolerance). Idempotent: only touches
    -- rows still open (submitted / pv_generated).
    IF v_paid >= v_total - 0.005 THEN
        UPDATE payroll_payment_requests
           SET status = 'completed', updated_at = NOW()
         WHERE id = NEW.reference_id
           AND status IN ('submitted', 'pv_generated');
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION complete_payroll_request_on_pv_paid() IS
    'Mig 20260708: keyed on reference_id + cumulative paid across all funding PVs '
    '(supports partial funding). Flips the request completed only when the paid '
    'sum reaches the request total; stays fundable until then.';

-- ── (2) Auto-allow dept-pool overdraw for payroll funding PVs ────────────────
-- Transform the live approve_single_voucher: widen the single overdraw guard so a
-- payroll_bank_transfer approval floats short dept pools (they go negative). Every
-- other line of the function is preserved exactly. Idempotent + fails loud if the
-- expected guard text is absent (e.g. the function was refactored upstream).
DO $mig$
DECLARE
    v_def text;
    v_from text := 'IF p_allow_overdraw THEN PERFORM set_config(''app.allow_pool_overdraw'', ''on'', true); END IF;';
    v_to   text := 'IF p_allow_overdraw OR v_voucher.voucher_type = ''payroll_bank_transfer'' THEN PERFORM set_config(''app.allow_pool_overdraw'', ''on'', true); END IF;';
BEGIN
    v_def := pg_get_functiondef('public.approve_single_voucher(uuid,uuid,text,boolean)'::regprocedure);

    IF position(v_to IN v_def) > 0 THEN
        RAISE NOTICE 'approve_single_voucher already carries the payroll overdraw guard — skipping.';
        RETURN;
    END IF;

    IF position(v_from IN v_def) = 0 THEN
        RAISE EXCEPTION 'approve_single_voucher: expected overdraw guard not found — aborting to avoid a bad rewrite.';
    END IF;

    v_def := replace(v_def, v_from, v_to);
    EXECUTE v_def;
END $mig$;
