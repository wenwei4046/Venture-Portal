import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { loadAllocatorData } from '@/app/(portal)/billing-allocator/_lib/allocator-data'
import { openAllocationPage } from '@/app/(portal)/billing-allocator/page-actions'
import AllocatorApp from '@/components/fin-app/AllocatorApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/daily/billing` — Daily › Billing in the Finance phone app
 * (2026-10-15, M12): the Billing Allocator's own page asked first (its tabs,
 * Billing), the desktop hub's read for the month the address names
 * (`?m=YYYY-MM`, the office's month without one), each button asking what its
 * action asks, and — a link or a refresh landing on an allocation (`?id=`) —
 * its page read with it, so nothing is asked after the navigation (speed.md).
 */
export default async function FinAppBilling({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/billing-allocator')
  const user = await requirePermission('billing')
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  const thisMonth = officeMonth()
  const month = typeof sp.m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : thisMonth
  const id = typeof sp.id === 'string' ? sp.id : null
  // alloc_* tables aren't in the generated database.types yet — the untyped client, as the portal's page.
  const supabase = (await createClient()) as unknown as SupabaseClient
  const [data, read] = await Promise.all([loadAllocatorData(supabase, month), id ? openAllocationPage(id) : Promise.resolve(null)])
  return (
    <AllocatorApp
      key={data.period}
      data={data}
      can={{ create: canDo(user, 'billing', 'create'), edit: canDo(user, 'billing', 'edit') }}
      search={search}
      thisMonth={thisMonth}
      record={read && read.ok ? read.page : null}
      refused={read && !read.ok ? read.reason : null}
    />
  )
}
