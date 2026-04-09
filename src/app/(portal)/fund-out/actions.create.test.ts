import { describe } from 'vitest'

/**
 * PLACEHOLDER — M1 (non-atomic loan + approval insert) is explicitly deferred
 * per the Phase 2 unattended-run decision ("M1 fix → still deferred, rare race,
 * not worth the risk during Phase 2"). When we pick M1 up later, convert this
 * file to real tests covering:
 *
 *   - happy path: createLoan returns both loan_id and approval_id via RPC
 *   - simulated approval_request INSERT failure → loan rolled back, no orphan
 *
 * @see docs/plan-phase1-5.md Step 4 — original fix spec
 * @see docs/plan-phase2.md — M1 deferral rationale
 */
describe.todo('createLoan — M1 atomicity regression (deferred)')
