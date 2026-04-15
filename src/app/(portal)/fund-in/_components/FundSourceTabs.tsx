'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs } from '@/components/motion/SlidingTabs'

const TABS = [
  { key: 'pending_approval', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'matured', label: 'Matured' },
  { key: 'repaid', label: 'Repaid' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
]

export default function FundSourceTabs() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('status') ?? 'active'

  return (
    <SlidingTabs
      items={TABS}
      active={current}
      onTabChange={(key) => {
        const params = new URLSearchParams(searchParams.toString())
        if (key === 'active') {
          params.delete('status')
        } else {
          params.set('status', key)
        }
        router.push(`/fund-in?${params.toString()}`)
      }}
    />
  )
}
