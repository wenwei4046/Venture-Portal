-- Data fix (2026-08-19): the three Hookka compound loans were keyed in at 2%/mo
-- but the agreed rate was 4%/mo from day one (user: "1" = 录错的, retroactive).
-- Compound maths derives everything from loans.effective_rate rolled from
-- disbursement_date, so correcting the stored rate re-states the whole series
-- at 4% — exactly what was asked. Mirrors amend_loan's field behavior
-- (effective_rate + risk_premium = rate − base_rate + updated_at); applied
-- directly because amend_loan is principal-gated and this is Finance's
-- keying-error correction.
--
-- Targets (all compound, active, previously 0.02):
--   42,881.63 disb 2025-09-01 / 22,873.50 disb 2025-12-01 / 5,702.00 disb 2026-03-01
-- The 52,500 flat 0% Hookka loan is deliberately untouched.

UPDATE loans l
SET effective_rate = 0.04,
    risk_premium   = 0.04 - l.base_rate,
    updated_at     = now()
FROM companies c
WHERE c.id = l.company_id
  AND c.name = 'Hookka'
  AND l.status = 'active'
  AND l.compound_interest = true
  AND l.effective_rate = 0.02
  AND l.principal IN (42881.63, 22873.50, 5702.00);
