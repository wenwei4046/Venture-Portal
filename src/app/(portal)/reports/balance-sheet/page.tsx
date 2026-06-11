// GL-driven Balance Sheet (2026-06-11 rebuild). As-at balances aggregated from
// journal_lines; Equity carries a synthetic "Retained & current earnings" line
// (cumulative P&L to date) so Assets = Liabilities + Equity ties exactly.
// Note: with a Segment filter the check line is EXPECTED to be non-zero —
// equity/liabilities mostly live in the corporate segment.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import {
  applyInvoiceRefs,
  buildBalanceSheet,
  fetchAllJournalLines,
  fetchCoaAccounts,
  fetchInvoiceRefs,
  monthPeriod,
} from '@/lib/gl-reports'
import { balanceSheetBlocks } from '@/lib/gl-report-blocks'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS } from '../_components/report-segments'
import ExportLinks from '../_components/ExportLinks'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function BalanceSheetPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? dayjs().format('YYYY-MM')
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  const segment = params.segment ?? ''

  const [rawLines, accounts, invoiceRefs] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    fetchInvoiceRefs(supabase),
  ])
  const lines = applyInvoiceRefs(rawLines, invoiceRefs)

  const bs = buildBalanceSheet(lines, accounts, {
    current: monthPeriod(period),
    previous: monthPeriod(compare || period),
    segment: segment || undefined,
  })

  const blocks = balanceSheetBlocks(bs, segment || undefined)
  const asAt = (ym: string) => dayjs(monthPeriod(ym).to).format('D MMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · BALANCE SHEET · AS AT {asAt(period).toUpperCase()}
          </div>
          <h1 className="page-title">Balance Sheet</h1>
        </div>
        <ExportLinks basePath="/reports/balance-sheet/export" period={period} compare={compare} segment={segment} />
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        As-at balances built straight from the general ledger. Equity includes a
        &ldquo;Retained &amp; current earnings&rdquo; line (cumulative P&amp;L to date) so
        Assets = Liabilities + Equity ties to the cent. Click ▸ on an account to see
        its movements in the selected month.
      </p>

      <GlReportView
        basePath="/reports/balance-sheet"
        period={period}
        compare={compare}
        segment={segment}
        segments={REPORT_SEGMENTS}
        blocks={blocks}
        currentLabel={asAt(period)}
        compareLabel={compare ? asAt(compare) : ''}
      />
    </div>
  )
}
