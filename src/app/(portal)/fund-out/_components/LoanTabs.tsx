'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs } from '@/components/motion/SlidingTabs'

// Overdue (2026-10-09, the Finance revamp): an active loan with an instalment
// past its day unpaid (read live since 2026-10-12). Since 2026-10-14, when the
// Overdue page went, the Overdue card above opens this tab.
const TABS = [
  { key: 'pending_approval', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'fully_repaid', label: 'Repaid' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
]

/** The status tabs, each with how many it holds. */
export default function LoanTabs({ counts }: { counts?: Record<string, number> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('status') ?? 'active'

  return (
    <SlidingTabs
      items={TABS.map((t) => (counts ? { ...t, count: counts[t.key] ?? 0 } : t))}
      active={current}
      variant="control"
      onTabChange={(key) => {
        const params = new URLSearchParams(searchParams.toString())
        if (key === 'active') {
          params.delete('status')
        } else {
          params.set('status', key)
        }
        router.push(`/fund-out?${params.toString()}`)
      }}
    />
  )
}
