'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export interface SubRef {
  slug: string
  name: string
}

/**
 * Which sub-department Costing Setting and Add-on / KPI Items are set for —
 * Fair and IR each keep their own ratio and their own KPI items (user
 * 2026-09-27). Switching is a round trip (`?sub=`), and like a tab switch it
 * asks before it throws away what has not been saved.
 */
export default function SubDepartmentChips({
  subs,
  active,
  tab,
  dirty,
  saving,
}: {
  subs: SubRef[]
  active: string
  tab: 'costing' | 'kpi'
  dirty: boolean
  saving: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [leaveFor, setLeaveFor] = useState<SubRef | null>(null)

  function open(sub: SubRef) {
    setLeaveFor(null)
    startTransition(() => router.push(`${pathname}?tab=${tab}&sub=${encodeURIComponent(sub.slug)}`, { scroll: false }))
  }

  return (
    <>
      <div className="sku-categories" data-only role="group" aria-label="Sub-department" aria-busy={pending || undefined}>
        {subs.map(sub => (
          <button
            key={sub.slug}
            type="button"
            className="sku-chip"
            aria-pressed={sub.slug === active}
            disabled={saving || pending}
            onClick={() => {
              if (sub.slug === active) return
              if (dirty) setLeaveFor(sub)
              else open(sub)
            }}
          >
            {sub.name}
          </button>
        ))}
      </div>
      {leaveFor ? (
        <div className="product-unsaved-notice" role="alert">
          <p>You have unsaved changes. Discard them and open {leaveFor.name}?</p>
          <div className="sku-action-buttons">
            <button type="button" className="sku-secondary-button" onClick={() => setLeaveFor(null)}>Keep editing</button>
            <button type="button" className="sku-primary-button" disabled={saving} onClick={() => open(leaveFor)}>Discard and switch</button>
          </div>
        </div>
      ) : null}
    </>
  )
}
