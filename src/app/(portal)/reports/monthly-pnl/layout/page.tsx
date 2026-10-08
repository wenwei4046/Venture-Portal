import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { buildPnlAccounts, defaultPnlLayout } from '@/lib/pnl-custom'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import ReportLayoutEditor from '../../_components/ReportLayoutEditor'

export const dynamic = 'force-dynamic'

export default async function PnlLayoutPage() {
  await requirePermission('reports')
  const supabase = await createClient()

  const period = officeMonth()
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const [lines, accounts, savedRaw] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    readReportLayout(supabase, 'pnl'),
  ])

  const data = buildPnlAccounts(lines, accounts, { year, throughMonth })
  const accountsMeta = data.accounts.map((a) => ({ code: a.code, name: a.name }))
  const saved = (savedRaw ?? null) as ReportLayout | null
  const initial = saved && Array.isArray(saved.categories) && saved.categories.length > 0
    ? saved
    : defaultPnlLayout(data.accounts)

  return (
    <div>
      <Link href="/reports/monthly-pnl" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Monthly P&amp;L
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · P&amp;L · EDIT LAYOUT
          </div>
          <h1 className="page-title">P&amp;L layout</h1>
        </div>
      </div>

      <ReportLayoutEditor reportKey="pnl" accounts={accountsMeta} initial={initial} />
    </div>
  )
}
