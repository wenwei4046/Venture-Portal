import { describe } from 'vitest'

/**
 * PLACEHOLDER — real implementation lands in Phase 2 Step 2 (M2 fix).
 *
 * The cancelLoan Server Action currently carries M2 bug: it rejects the
 * approval_request but leaves the paired loan in `pending_approval` forever
 * because `loans_principal_update` RLS blocks Finance. Step 2 introduces a
 * `cancel_loan_and_approval()` Postgres function with SECURITY DEFINER and
 * internal role check to make the cancel atomic. This file will then exercise
 * the RPC path.
 *
 * Expected tests once Step 2 lands:
 *   - happy path: Finance cancels pending loan → loan flips to cancelled +
 *     approval rejected (single DB call, no orphan)
 *   - wrong status: cancelling an active loan → throws
 *   - unauthorized role: HR attempt → `insufficient_privilege` exception
 *
 * @see docs/plan-phase2.md Step 2 — M2 fix bundled decision
 * @see docs/plan-phase1-5.md Step 3 — original spec
 */
describe.todo('cancelLoan — M2 regression (atomic cancel via RPC, Phase 2 Step 2)')
