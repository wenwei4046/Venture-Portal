'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { useProductDraftState } from './ProductWorkspace'
import { productTabHref } from './ProductListTabs'
import { Chip, ChipRow } from './ui'

export interface SubRef {
  slug: string
  name: string
}

/**
 * Which sub-department Costing Setting is set for — Fair and IR each keep
 * their own ratio (user 2026-09-27). Switching is a round trip (`?sub=`), and
 * like a tab switch it asks — in the bar under the tabs — before it throws
 * away what has not been saved.
 */
export default function SubDepartmentChips({ subs, active, tab }: {
  subs: SubRef[]
  active: string
  tab: 'costing'
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const { saving, requestLeave } = useProductDraftState()

  function open(sub: SubRef) {
    startTransition(() => router.push(productTabHref(pathname, tab, { sub: sub.slug, department: params.get('department') }), { scroll: false }))
  }

  return (
    <ChipRow label="SUB-DEPARTMENT" ariaLabel="Sub-department">
      {subs.map(sub => (
        <Chip key={sub.slug} on={sub.slug === active} disabled={saving || pending}
          onClick={() => { if (sub.slug !== active) requestLeave({ label: sub.name, go: () => open(sub) }) }}>
          {sub.name}
        </Chip>
      ))}
    </ChipRow>
  )
}
