import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { statementMonths } from '@/lib/billing-sheet'
import { readStatementList } from '@/app/(portal)/statements/_lib/statement-read'
import { openStatement } from '@/app/(portal)/statements/[id]/page-actions'
import { askedStatementMonth, statementHubModel, statementsPlace } from '@/lib/fin-app/statement-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import StatementsApp from '@/components/fin-app/StatementsApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/statements` — Fund › Statements in the Finance phone app
 * (2026-10-15, part 5c): the page's own gates (its tabs, the treasury), every
 * month's statements the desktop page reads (`readStatementList`) — the month
 * `?m=` names, else the newest with statements — and, a link or a refresh
 * landing on a statement (`?id=`), that statement read with the page.
 */
export default async function FinAppStatements({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/statements/monthly')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = await createClient()
  const [{ statements, companies }, read] = await Promise.all([readStatementList(supabase), id ? openStatement(id) : Promise.resolve(null)])
  const months = statementMonths(statements)
  const month = askedStatementMonth(sp.m, months, officeMonth())
  return (
    <StatementsApp
      key={month}
      place={statementsPlace(month, months[0] ?? null)}
      month={month}
      hub={statementHubModel(statements, companies, month)}
      search={searchOf(sp)}
      canGenerate={canDo(user, 'treasury', 'create')}
      canExport={canDo(user, 'treasury', 'export')}
      record={read && read.ok ? read.record : null}
      refused={read && !read.ok ? read.reason : null}
    />
  )
}
