import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { listsPayrollByPerson } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { fetchLedgers } from '@/lib/cfo-reports'
import { hasLedgerActivity, ledgerExportHref } from '@/lib/ledger-view'
import { askedMonth, searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import { monthWords } from '@/lib/fin-app/page-model'
import { asAtOf, ledgerModel, monthPlace } from '@/lib/fin-app/report-pages'
import PageApp from '@/components/fin-app/PageApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/ledger` — Report › General Ledger in the Finance phone app
 * (2026-10-15, part 5b): the page's own gates (its tabs, Reports), the month's
 * ledgers exactly as the desktop reads them (`fetchLedgers` — every postable
 * account, salary lines by department for whoever reads payroll that way), the
 * accounts with activity by type, each opening onto its entries; the files for
 * whoever may export.
 */
export default async function FinAppLedger({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/ledger')
  const user = await requirePermission('reports')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const from = `${ym}-01`
  const to = asAtOf(ym, officeToday())
  const supabase = await createClient()
  const coa = Promise.resolve(supabase.from('chart_of_accounts').select('code, name, type, parent_code, is_active').eq('is_active', true).order('code'))
  const ledgers = (await fetchLedgers(supabase, { codes: [], from, to, coa, payrollByPerson: listsPayrollByPerson(user) })).filter(hasLedgerActivity)
  const args = { codes: [] as string[], from, to, showZero: false }
  return (
    <PageApp
      key={ym}
      place={monthPlace({ href: '/fin-app/page/ledger', title: 'General Ledger', roman: 'III.', ym, thisMonth, label: monthWords(ym) })}
      model={ledgerModel(ledgers, from, to, monthWords(ym))}
      search={searchOf(sp)}
      files={
        canDo(user, 'reports', 'export')
          ? [
              { key: 'pdf', label: 'Export PDF', href: ledgerExportHref('pdf', args), format: 'pdf' as const },
              { key: 'xlsx', label: 'Export Excel', href: ledgerExportHref('xlsx', args), format: 'xlsx' as const },
            ]
          : []
      }
    />
  )
}
