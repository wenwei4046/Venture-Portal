import { describe, it, expect } from 'vitest'
import { TIER_ORDER, computeDowngradedTier } from './tier'

/**
 * M3 regression test — escalation approval tier downgrade.
 *
 * Context: Phase 1 /qa finding M3 flagged the escalation approval handler
 * for missing a tier downgrade side effect. The fix (commit a7d6c5a) added
 * inline logic to downgrade T1→T2, T2→T3, T3→T4, and stop at T4. Phase 1.5
 * Step 1 extracted that logic to `src/lib/tier.ts` for unit-testability.
 * This test locks the contract in place against future refactors.
 */
describe('TIER_ORDER', () => {
  it('contains all 4 tiers from best to worst', () => {
    expect(TIER_ORDER).toEqual(['T1', 'T2', 'T3', 'T4'])
  })
})

describe('computeDowngradedTier — M3 regression', () => {
  it('downgrades T1 to T2', () => {
    expect(computeDowngradedTier('T1')).toBe('T2')
  })

  it('downgrades T2 to T3', () => {
    expect(computeDowngradedTier('T2')).toBe('T3')
  })

  it('downgrades T3 to T4', () => {
    expect(computeDowngradedTier('T3')).toBe('T4')
  })

  it('returns null at T4 (no further downgrade possible)', () => {
    expect(computeDowngradedTier('T4')).toBeNull()
  })
})
