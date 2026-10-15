import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeToday } from '@/lib/office-time'
import { fetchCounterpartyStatement } from '@/lib/counterparty-statement-data'
import { reportFiles, searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import { companyStatementModel } from '@/lib/fin-app/report-pages'
import PageApp from '@/components/fin-app/PageApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/stmt` — Report › Company Statement in the Finance phone app
 * (2026-10-15, part 5b): the page's own gates, the very statement the desktop
 * and its files read (`fetchCounterpartyStatement`) — what each counterparty
 * still owes HV and what HV still owes them, each deal opening in the app.
 */
export default async function FinAppCompanyStatement({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/company-statement')
  const user = await requirePermission('reports')
  const sp = await searchParams
  // Untyped, as the desktop page's (database.types.ts predates repayment_start_month).
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { rows, totals } = await fetchCounterpartyStatement(supabase)
  return (
    <PageApp
      place={{ href: '/fin-app/page/stmt', title: 'Company Statement', roman: 'III.', keep: '' }}
      model={companyStatementModel(rows, totals, officeToday())}
      search={searchOf(sp)}
      files={canDo(user, 'reports', 'export') ? reportFiles('/reports/company-statement/export', {}) : []}
    />
  )
}
