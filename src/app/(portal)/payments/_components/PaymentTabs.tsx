'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs } from '@/components/motion/SlidingTabs'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'voided', label: 'Voided' },
]

export default function PaymentTabs() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('status') ?? 'all'

  return (
    <SlidingTabs
      items={TABS}
      active={current}
      onTabChange={(key) => {
        const params = new URLSearchParams(searchParams.toString())
        if (key === 'all') {
          params.delete('status')
        } else {
          params.set('status', key)
        }
        router.push(`/payments?${params.toString()}`)
      }}
    />
  )
}
