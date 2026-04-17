-- ============================================================================
-- 20260101000134_relax_pvs_max_rows.sql
-- Spec 4 (HR Payroll Redesign) — remove the 3-row cap on voucher sources
-- HOUZS Venture Portal
--
-- The pvs_enforce_max_three() trigger (migration 103) was a guardrail from
-- when vouchers only debited up to 3 pools (HR + Finance + Marketing). Spec 4
-- introduces payroll_bank_transfer which routinely debits 4+ sources
-- (HR, Finance, Director OPEX, sometimes Marketing, plus one-off adjustments).
-- The user confirmed Q4 on 2026-04-17: drop the cap entirely, no replacement.
--
-- No CHECK replacement — a voucher may reasonably have 1 to N sources; the
-- sum-equals-parent-amount invariant is enforced by pvs_sum_matches_trigger
-- which remains in place.
-- ============================================================================

DROP TRIGGER IF EXISTS pvs_max_three_trigger ON payment_voucher_sources;
DROP FUNCTION IF EXISTS pvs_enforce_max_three();

COMMENT ON TABLE payment_voucher_sources IS
    'Phase 7: multiple pool debits per voucher. Sum-matches-parent invariant enforced by pvs_sum_matches_trigger. No upper bound on source count (pvs_enforce_max_three trigger was dropped in migration 134 to support Spec 4 bank transfers with 5+ sources).';
