'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useProductDraftState } from './ProductWorkspace'
import { plural } from './ui'
import c from './products.module.css'

export type ProductTab = 'sku' | 'modular' | 'maintenance' | 'combos' | 'gaps' | 'costing' | 'kpi'

export const PRODUCT_TABS: ReadonlyArray<{ key: ProductTab; label: string }> = [
  { key: 'sku', label: 'SKU Master' },
  { key: 'modular', label: 'Modular' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'combos', label: 'Combo Pricing' },
  { key: 'gaps', label: 'Costing gaps' },
  { key: 'costing', label: 'Costing Setting' },
  { key: 'kpi', label: 'Add-on / KPI Items' },
]

/** The query a tab opens at; the two settings tabs carry the sub-department, any tab may carry a search. */
export function productTabHref(pathname: string, key: ProductTab, keep: { sub?: string | null; department?: string | null; q?: string | null } = {}): string {
  const q = new URLSearchParams()
  if (key !== 'sku') q.set('tab', key)
  if ((key === 'costing' || key === 'kpi') && keep.sub) q.set('sub', keep.sub)
  if (keep.q) q.set('q', keep.q)
  if (keep.department) q.set('department', keep.department)
  const s = q.toString()
  return s ? `${pathname}?${s}` : pathname
}

/**
 * The Product List's rail, on the header's rule — the ERP Products page's own
 * tabs (SKU Master, Modular, Maintenance, Combo Pricing), the work list and
 * the two settings — and under it the bar that asks before unsaved changes are
 * thrown away (the prototype's leave guard).
 *
 * Switching IS a round trip: each tab reads a different part of the catalogue
 * (the SKU master alone is 2,350 rows), so the server renders only the one
 * being read. `?tab=` still opens the page where a link meant it to.
 */
export default function ProductListTabs({ active }: { active: ProductTab }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const { changes, saving, requestLeave, leave, keepEditing } = useProductDraftState()

  function navigate(key: ProductTab) {
    startTransition(() => router.push(productTabHref(pathname, key, { sub: params.get('sub'), department: params.get('department') }), { scroll: false }))
  }

  return (
    <>
      <nav className={c.tabs} aria-label="Product list views" aria-busy={pending || saving}>
        {PRODUCT_TABS.map(({ key, label }) => {
          const on = active === key
          return (
            <button
              key={key}
              type="button"
              className={c.tab}
              aria-current={on ? 'page' : undefined}
              disabled={saving || pending}
              onClick={() => {
                if (!on) requestLeave({ label, go: () => navigate(key) })
              }}
            >
              {label}
              {on && changes > 0 ? <span className={c.tabDot} aria-label={`${changes} unsaved`} /> : null}
            </button>
          )
        })}
      </nav>
      {leave ? (
        <div className={c.leave} role="alert">
          <span className={c.leaveText}>
            You have {plural(changes, 'unsaved change')}. Discard {changes === 1 ? 'it' : 'them'} and open {leave.label}?
          </span>
          <button type="button" className={c.leaveKeep} onClick={keepEditing}>Keep editing</button>
          <button type="button" className={c.leaveDiscard} disabled={saving} onClick={() => { const go = leave.go; keepEditing(); go() }}>
            Discard and switch
          </button>
        </div>
      ) : null}
    </>
  )
}
