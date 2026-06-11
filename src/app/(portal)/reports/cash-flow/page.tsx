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
  buildCashFlow,
  fetchAllJournalLines,
  fetchCoaAccounts,
  monthPeriod,
  prevMonth,
} from '@/lib/gl-reports'
import GlReportView, { type ReportBlock } from '../_components/GlReportView'
import { REPORT_SEGMENTS } from '../_components/report-segments'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function CashFlowPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? dayjs().format('YYYY-MM')
  const compare = params.compare ?? prevMonth(period)
  const segment = params.segment ?? ''

  const [lines, accounts, { data: banks }] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    supabase.from('bank_accounts').select('gl_account_code'),
  ])
  const bankCodes = new Set(
    (banks ?? []).map((b) => b.gl_account_code as string | null).filter((c): c is string => !!c),
  )

  const cf = buildCashFlow(
    lines,
    accounts,
    {
      current: monthPeriod(period),
      previous: monthPeriod(compare),
      segment: segment || undefined,
    },
    bankCodes,
  )

  const blocks: ReportBlock[] = [
    { kind: 'section', section: cf.operating },
    {
      kind: 'summary',
      row: { label: 'Net cash — operating', current: cf.operating.current, previous: cf.operating.previous, tone: 'auto' },
    },
    { kind: 'section', section: cf.investing },
    {
      kind: 'summary',
      row: { label: 'Net cash — investing', current: cf.investing.current, previous: cf.investing.previous, tone: 'auto' },
    },
    { kind: 'section', section: cf.financing },
    {
      kind: 'summary',
      row: { label: 'Net cash — financing', current: cf.financing.current, previous: cf.financing.previous, tone: 'auto' },
    },
    {
      kind: 'summary',
      row: {
        label: 'Net change in cash',
        current: cf.netChange.current,
        previous: cf.netChange.previous,
        emphasis: 'strong',
        tone: 'auto',
      },
    },
    {
      kind: 'summary',
      row: { label: 'Opening cash', current: cf.openingCash.current, previous: cf.openingCash.previous },
    },
    {
      kind: 'summary',
      row: {
        label: 'Closing cash',
        current: cf.closingCash.current,
        previous: cf.closingCash.previous,
        emphasis: 'strong',
        tone: 'ledger',
      },
    },
    ...(Math.abs(cf.check.current) > 0.005 || Math.abs(cf.check.previous) > 0.005
      ? ([
          {
            kind: 'summary',
            row: {
              label: '⚠ Uncategorised cash movement (closing − opening − net change)',
              current: cf.check.current,
              previous: cf.check.previous,
              tone: 'danger',
            },
          },
        ] as ReportBlock[])
      : []),
  ]

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
        compareLabel={dayjs(`${compare}-01`).format('MMM YYYY')}
      />
    </div>
  )
}
