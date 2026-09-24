'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useProductDraftState } from './ProductWorkspace'

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
  const [leaveFor, setLeaveFor] = useState<ProductTab | null>(null)
  const { dirty, saving } = useProductDraftState()

  function navigate(key: ProductTab) {
    setLeaveFor(null)
    startTransition(() => router.push(key === 'sku' ? pathname : `${pathname}?tab=${key}`, { scroll: false }))
  }

  const items: { key: ProductTab; label: string }[] = [
    { key: 'sku', label: 'SKU Master' },
    { key: 'modular', label: 'Modular' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'combos', label: 'Combo Pricing' },
    { key: 'gaps', label: 'Costing gaps' },
  ]

  return (
    <>
    <nav className="product-tabs" aria-label="Product list views" aria-busy={pending || saving}>
      {items.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-current={active === key ? 'page' : undefined}
          disabled={saving || pending}
          onClick={() => {
            if (key === active) return
            if (dirty) setLeaveFor(key)
            else navigate(key)
          }}
        >
          {label}
        </button>
      ))}
    </nav>
    {leaveFor ? (
      <div className="product-unsaved-notice" role="alert">
        <p>You have unsaved changes. Discard them and open {items.find(item => item.key === leaveFor)?.label}?</p>
        <div className="sku-action-buttons">
          <button type="button" className="sku-secondary-button" onClick={() => setLeaveFor(null)}>Keep editing</button>
          <button type="button" className="sku-primary-button" disabled={saving} onClick={() => navigate(leaveFor)}>Discard and switch</button>
        </div>
      </div>
    ) : null}
    </>
  )
}
