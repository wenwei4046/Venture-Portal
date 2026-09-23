'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type ProductTab = 'sku' | 'modular' | 'maintenance' | 'combos' | 'gaps'

/**
 * The Product List's rail, on the header's rule — the ERP Products page's own
 * tabs (SKU Master, Modular, Maintenance, Combo Pricing) and the work list.
 *
 * Unlike the Comm Cal month's rail, switching here IS a round trip: each tab
 * reads a different part of the catalogue (the SKU master alone is 2,350 rows),
 * so the server renders only the one being read. `?tab=` still opens the page
 * where a link meant it to.
 */
export default function ProductListTabs({
  active,
  counts,
}: {
  active: ProductTab
  counts: { sku: number; modular: number; maintenance: number; combos: number }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  const items: TabItem[] = [
    { key: 'sku', label: 'SKU Master', count: counts.sku },
    { key: 'modular', label: 'Modular', count: counts.modular },
    { key: 'maintenance', label: 'Maintenance', count: counts.maintenance },
    { key: 'combos', label: 'Combo Pricing', count: counts.combos },
    { key: 'gaps', label: 'Costing gaps' },
  ]

  return (
    <div className={pending ? 'opacity-70 transition-opacity' : undefined}>
      <SlidingTabs
        items={items}
        active={active}
        variant="control"
        onTabChange={key =>
          startTransition(() => router.push(key === 'sku' ? pathname : `${pathname}?tab=${key}`, { scroll: false }))
        }
      />
    </div>
  )
}
