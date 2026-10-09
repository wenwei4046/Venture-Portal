'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs } from '@/components/motion/SlidingTabs'

/** Fund OUT (they owe us) and Fund IN (we owe), each counted (2026-10-09). */
export default function OverdueTabs({ counts }: { counts: { out: number; in: number } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('tab') === 'in' ? 'in' : 'out'
  return (
    <SlidingTabs
      items={[
        { key: 'out', label: 'Fund OUT · they owe us', count: counts.out },
        { key: 'in', label: 'Fund IN · we owe', count: counts.in },
      ]}
      active={current}
      variant="control"
      onTabChange={(key) => router.push(key === 'in' ? '/overdue?tab=in' : '/overdue')}
    />
  )
}
