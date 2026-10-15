import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeToday } from '@/lib/office-time'
import { readBaRegister } from '@/app/(portal)/ba/_lib/ba-read'
import { openBaFinancing } from '@/app/(portal)/ba/page-actions'
import { baHubModel } from '@/lib/fin-app/ba-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import BaApp from '@/components/fin-app/BaApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/ba` — Fund › Invoice Financing in the Finance phone app
 * (2026-10-15, part 5c): the page's own gates (its tabs, the treasury), the
 * register the desktop page reads (`readBaRegister`), and — a link or a refresh
 * landing on a financing (`?id=`) — that financing read with the page.
 */
export default async function FinAppInvoiceFinancing({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/ba')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = (await createClient()) as unknown as SupabaseClient
  const [register, read] = await Promise.all([readBaRegister(supabase), id ? openBaFinancing(id) : Promise.resolve(null)])
  const today = officeToday()
  return (
    <BaApp
      hub={baHubModel(register, today)}
      search={searchOf(sp)}
      today={today}
      companies={register.companies}
      limits={register.limits}
      autoRead={Boolean(process.env.ANTHROPIC_API_KEY)}
      may={{ create: canDo(user, 'treasury', 'create'), edit: canDo(user, 'treasury', 'edit') }}
      record={read && read.ok ? read.record : null}
      refused={read && !read.ok ? read.reason : null}
    />
  )
}
