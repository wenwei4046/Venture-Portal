'use client'

import { useRouter } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type CommissionTab = 'months' | 'org-chart' | 'rules' | 'products'

const HREF: Record<CommissionTab, string> = {
  months: '/hr-costing/commission',
  'org-chart': '/hr-costing/commission/org-chart',
  rules: '/hr-costing/commission/rules',
  products: '/hr-costing/commission/products',
}

/**
 * The Commission module's own tab rail.
 *
 * The rules used to be a tab inside Settings, which put the configuration of
 * one department's payroll behind an admin page HR has no other reason to open
 * — and no sidebar link to reach (the Settings group is principal + finance
 * only, so HR could get there by URL alone). They belong beside the months they
 * govern.
 *
 * Real routes rather than `?tab=`: `org-chart` already was one, and each of
 * these loads a genuinely different set of data.
 */
export default function CommissionTabs({
  active,
  canSeeProducts,
}: {
  active: CommissionTab
  /** What a product COSTS stays with the Principal (user 2026-08-31). */
  canSeeProducts: boolean
}) {
  const router = useRouter()

  const items: TabItem[] = [
    { key: 'months', label: 'Months' },
    { key: 'org-chart', label: 'Org chart' },
    { key: 'rules', label: 'Rules' },
    ...(canSeeProducts ? [{ key: 'products', label: 'Product list' }] : []),
  ]

  return (
    <SlidingTabs
      items={items}
      active={active}
      onTabChange={key => router.push(HREF[key as CommissionTab])}
    />
  )
}
