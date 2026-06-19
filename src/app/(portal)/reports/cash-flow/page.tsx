// GL-driven Cash Flow (2026-06-11 rebuild). Direct method: every journal entry
// that moves a bank account is allocated across its non-bank counter legs and
// categorised by the counter account's cash_flow_category (operating /
// investing / financing — set per account on the COA). Opening + net change =
// closing, reconciled against the banks' GL balances.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  applyGlRefs,
  buildCashFlow,
  fetchAllJournalLines,
  fetchCoaAccounts,
  fetchGlRefs,
  monthPeriod,
} from '@/lib/gl-reports'
import { cashFlowBlocks } from '@/lib/gl-report-blocks'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import ExportLinks from '../_components/ExportLinks'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function CashFlowPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? dayjs().format('YYYY-MM')
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  const segment = params.segment ?? ''

  const [rawLines, accounts, glRefs, { data: banks }] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    fetchGlRefs(supabase),
    supabase.from('bank_accounts').select('gl_account_code'),
  ])
  const lines = applyGlRefs(rawLines, glRefs)
  const bankCodes = new Set(
    (banks ?? []).map((b) => b.gl_account_code as string | null).filter((c): c is string => !!c),
  )

  const cf = buildCashFlow(
    lines,
    accounts,
    {
      current: monthPeriod(period),
      previous: monthPeriod(compare || period),
      segment: segmentFilterFor(segment),
    },
    bankCodes,
  )

  const blocks = cashFlowBlocks(cf)
  const periodLabel = dayjs(`${period}-01`).format('MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · CASH FLOW · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Cash Flow Statement</h1>
        </div>
        <ExportLinks basePath="/reports/cash-flow/export" period={period} compare={compare} segment={segment} />
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Direct method from the general ledger: every bank movement is allocated to its
        counter account and grouped by that account&apos;s cash-flow category (set in
        Settings → Chart of Account). Bank↔bank internal transfers cancel out. Opening +
        net change reconciles to closing cash. Click ▸ on a row to see the underlying
        transactions.
      </p>

      <GlReportView
        basePath="/reports/cash-flow"
        period={period}
        compare={compare}
        segment={segment}
        segments={REPORT_SEGMENTS}
        blocks={blocks}
        currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
        compareLabel={compare ? dayjs(`${compare}-01`).format('MMM YYYY') : ''}
      />
    </div>
  )
}
