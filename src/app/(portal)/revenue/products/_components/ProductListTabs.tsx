'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

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
}: {
  active: ProductTab
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()

  const items: { key: ProductTab; label: string }[] = [
    { key: 'sku', label: 'SKU Master' },
    { key: 'modular', label: 'Modular' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'combos', label: 'Combo Pricing' },
    { key: 'gaps', label: 'Costing gaps' },
  ]

  return (
    <nav className="product-tabs" aria-label="Product list views" aria-busy={pending}>
      {items.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-current={active === key ? 'page' : undefined}
          onClick={() => startTransition(() => router.push(key === 'sku' ? pathname : `${pathname}?tab=${key}`, { scroll: false }))}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
