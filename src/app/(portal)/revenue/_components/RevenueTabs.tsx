'use client'

import { useRouter } from 'next/navigation'
import { revenuePath } from '@/lib/revenue'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type RevenueTab = 'calculation' | 'hierarchy' | 'rules'

/**
 * One sub-department's three views.
 *
 * The rail is scoped to a sub-department, not to the department: the rules a
 * run reads, the chart the override is computed from and the run itself all
 * belong to the same `comm_schemes` row, and putting them behind one slug is
 * what stops Fair's ladder being edited on IR's page. The Product List is
 * deliberately NOT here — `comm_products` carries no `scheme_id`; it is the
 * department's one cost master, so it hangs off `/revenue` instead.
 *
 * Real routes rather than `?tab=`: each loads a genuinely different set of
 * data, and a month drilled into from Calculation keeps a URL worth sharing.
 */
export default function RevenueTabs({
  slug,
  active,
}: {
  slug: string
  active: RevenueTab
}) {
  const router = useRouter()

  const items: TabItem[] = [
    { key: 'calculation', label: 'Commission Calculation' },
    { key: 'hierarchy', label: 'Staff Hierarchy' },
    { key: 'rules', label: 'Rules' },
  ]

  return (
    <SlidingTabs
      items={items}
      active={active}
      onTabChange={key =>
        router.push(key === 'calculation' ? revenuePath(slug) : revenuePath(slug, key))
      }
    />
  )
}
