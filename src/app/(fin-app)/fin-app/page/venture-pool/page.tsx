import { requirePage, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getPeriodMonth } from '@/lib/utils'
import { readVenturePool } from '@/app/(portal)/venture-pool/_lib/venture-read'
import { venturePoolModel } from '@/lib/fin-app/venture-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import PageApp from '@/components/fin-app/PageApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/venture-pool` — Department › Venture Pool in the Finance phone
 * app (2026-10-15, part E3): the page's own gates (its tabs, Venture Pool), the
 * very lines the desktop page reads (`readVenturePool`), and its Export — the
 * whole ledger as a spreadsheet, for every reader of the pool, as the desktop's.
 */
export default async function FinAppVenturePool({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/venture-pool')
  await requirePermission('venture_pool')
  const sp = await searchParams
  const supabase = await createClient()
  const period = getPeriodMonth()
  const read = await readVenturePool(supabase, period)
  return (
    <PageApp
      place={{ href: '/fin-app/page/venture-pool', title: 'Venture Pool', roman: 'IV.', keep: '' }}
      model={venturePoolModel(read, period.slice(0, 7))}
      search={searchOf(sp)}
      files={[{ key: 'xlsx', label: 'Export', href: '/venture-pool/export', format: 'xlsx' }]}
    />
  )
}
