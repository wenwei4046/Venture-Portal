import type { CompanyTier } from '@/types'

/**
 * Tier order from best (T1) to worst (T4). Used by the escalation workflow
 * to downgrade a company one step when an overdue record reaches the final
 * escalation stage and Principal approves it.
 */
export const TIER_ORDER: readonly CompanyTier[] = ['T1', 'T2', 'T3', 'T4'] as const

/**
 * Returns the next (worse) tier after a downgrade, or null if the company
 * is already at T4 (no further downgrade possible).
 *
 *   T1 → T2 → T3 → T4 → null
 *
 * @see src/app/(portal)/approvals/actions.ts — escalation approval handler
 * @see .gstack/qa-reports/qa-report-phase1-2026-04-10.md — M3 finding
 */
export function computeDowngradedTier(current: CompanyTier): CompanyTier | null {
  const idx = TIER_ORDER.indexOf(current)
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null
  return TIER_ORDER[idx + 1]
}
