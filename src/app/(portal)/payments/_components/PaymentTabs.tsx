'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SlidingTabs } from '@/components/motion/SlidingTabs'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_approval', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'voided', label: 'Voided' },
]
// Payroll batches have a tab of their own (2026-10-09, the Finance revamp) —
// on the ledger that counts them, which is the payment side.
const PAYROLL_TAB = { key: 'payroll', label: 'Payroll batches' }

/** `counts` — how many vouchers sit under each tab, shown beside its label
 *  (2026-10-07, the sheet's tabs). */
export default function PaymentTabs({ counts }: { counts?: Partial<Record<string, number>> }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('status') ?? 'all'

  return (
    <SlidingTabs
      items={[...TABS, ...(counts?.payroll !== undefined ? [PAYROLL_TAB] : [])].map((t) => ({ ...t, count: counts?.[t.key] }))}
      active={current}
      onTabChange={(key) => {
        const params = new URLSearchParams(searchParams.toString())
        if (key === 'all') {
          params.delete('status')
        } else {
          params.set('status', key)
        }
        // Pathname-relative so the same tabs work on /payments AND /receipts.
        router.push(`${pathname}?${params.toString()}`)
      }}
    />
  )
}
