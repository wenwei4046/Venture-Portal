import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { buildCashFlowAccounts, defaultCashFlowLayout, type CashFlowLayout } from '@/lib/cash-flow-custom'
import { readReportLayout } from '@/lib/report-layouts'
import ReportLayoutEditor from '../../_components/ReportLayoutEditor'

export const dynamic = 'force-dynamic'

export default async function CashFlowLayoutPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  // The account list comes from the current fiscal year's cash-flow activity.
  const period = dayjs().format('YYYY-MM')
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const [lines, accounts, { data: banks }, savedRaw] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    supabase.from('bank_accounts').select('gl_account_code'),
    readReportLayout(supabase, 'cash_flow'),
  ])
  const bankCodes = new Set(
    (banks ?? []).map((b) => b.gl_account_code as string | null).filter((c): c is string => !!c),
  )

  const data = buildCashFlowAccounts(lines, accounts, bankCodes, { year, throughMonth })
  const accountsMeta = data.accounts.map((a) => ({
    code: a.code,
    name: a.name,
    defaultCategory: a.defaultCategory,
  }))

  const saved = (savedRaw ?? null) as CashFlowLayout | null
  const initial = saved && Array.isArray(saved.categories) && saved.categories.length > 0
    ? saved
    : defaultCashFlowLayout(data.accounts)

  return (
    <div>
      <Link
        href="/reports/monthly-cash-flow"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Monthly Cash Flow
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · CASH FLOW · EDIT LAYOUT
          </div>
          <h1 className="page-title">Cash Flow layout</h1>
        </div>
      </div>

      <ReportLayoutEditor reportKey="cash_flow" accounts={accountsMeta} initial={initial} />
    </div>
  )
}
