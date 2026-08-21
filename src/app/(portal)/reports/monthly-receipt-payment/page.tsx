// Monthly Receipt & Payment (2026-08-20, user: "我也有要看到monthly 和在
// monthly 看accumulated"). The month-matrix twin of /reports/receipt-payment,
// exactly like Monthly Cash Flow (Accumulated + one column per month, shared
// cash-flow layout) PLUS the receivables rows the cash matrix doesn't have:
//   开单 Billed        = Dr 3030 per month (invoice issues, segment-tagged)
//   收回/CN Collected  = Cr 3030 per month (settlements + approved CNs)
//   月末未收 Outstanding = running AR balance at each month-end (all-time
//                        cumulative — accounting-true, ties to the GL)
// dept_manager is RLS-locked to their own segment; the consolidated view's
// receivables rows are the whole company's AR.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts, type GlLine } from '@/lib/gl-reports'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow } from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { monthColumns, r2, type MatrixRow } from '@/lib/monthly-matrix'
import { segmentFilterFor } from '../_components/report-segments'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'

export const dynamic = 'force-dynamic'

// Every invoice's AR leg posts to 3030 (issue Dr / settle & CN Cr), always
// segment-tagged — so the per-segment running balance IS that segment's 未收.
const AR_CODE = '3030'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string }>
}

export default async function MonthlyReceiptPaymentPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : dayjs().format('YYYY-MM')
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (params.segment ?? '')
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const [lines, accounts, { data: banks }, inSaved, outSaved] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    supabase.rpc('bank_gl_codes' as never),
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])
  const bankCodes = new Set((banks ?? []) as unknown as string[])
  const ib = await fetchInterBillingCashFlow(supabase, bankCodes)
  const consolidated = !isDeptMgr && !segment
  const ibLines = consolidated ? [] : ib.lines

  const data = buildMonthlyCashFlowSides(
    [...lines, ...ibLines],
    [...accounts, ib.account, ib.payrollAccount],
    bankCodes,
    { year, throughMonth, segment: segmentFilterFor(segment) },
  )

  // ── Receivables rows (the part Monthly Cash Flow doesn't have) ────────────
  const { months, accPeriod } = monthColumns(year, throughMonth)
  const segList = segmentFilterFor(segment)
  const inSeg = (l: GlLine) => !segList || segList.includes(l.segment)
  const arLines = (lines as GlLine[]).filter((l) => l.account_code === AR_CODE && inSeg(l))

  const billedInMonth = (ym: string) =>
    r2(arLines.filter((l) => l.date.startsWith(ym)).reduce((s, l) => s + Number(l.debit ?? 0), 0))
  const collectedInMonth = (ym: string) =>
    r2(arLines.filter((l) => l.date.startsWith(ym)).reduce((s, l) => s + Number(l.credit ?? 0), 0))
  const balanceAt = (toDate: string) =>
    r2(
      arLines
        .filter((l) => l.date <= toDate)
        .reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0),
    )
  const monthEnd = (ym: string) => dayjs(`${ym}-01`).endOf('month').format('YYYY-MM-DD')

  // Values aligned to data.columns: ['acc', latest month, …, Jan].
  const billedByCol = [
    r2(months.reduce((s, ym) => s + billedInMonth(ym), 0)),
    ...months.map(billedInMonth),
  ]
  const collectedByCol = [
    r2(months.reduce((s, ym) => s + collectedInMonth(ym), 0)),
    ...months.map(collectedInMonth),
  ]
  const outstandingByCol = [balanceAt(accPeriod.to), ...months.map((ym) => balanceAt(monthEnd(ym)))]

  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', '流入合计 · Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', '流出合计 · Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
    { key: 'AR_BILLED', label: '开单 · Billed (应收 ↑)', depth: 0, kind: 'subtotal', tone: 'ledger', values: billedByCol },
    { key: 'AR_COLLECTED', label: '收回/CN · Collected (应收 ↓)', depth: 0, kind: 'subtotal', tone: 'auto', values: collectedByCol.map((v) => -v) },
    { key: 'AR_OUTSTANDING', label: '月末未收 · Outstanding (AR balance)', depth: 0, kind: 'subtotal', tone: 'danger', emphasis: 'strong', values: outstandingByCol },
  ]

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>·</em> REPORTS · MONTHLY RECEIPT &amp; PAYMENT · FY {year}
          </div>
          <h1 className="page-title">Monthly Receipt &amp; Payment</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            FY {year} · read-only · all amounts RM
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isDeptMgr && (
            <Link
              href={`/reports/cash-flow/layout`}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors"
            >
              Edit layout
            </Link>
          )}
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        跟 Monthly Cash Flow 同一个格子:Accumulated + 每个月一栏。多出最下面三行:
        每月<em>开单</em>、每月<em>收回/CN</em>,和 <em>月末未收</em> — 应收账款 (3030)
        在每个月底的累计余额,开单加上去、收款和 credit note 减下来,和总账完全对得上。
      </p>

      <ReportSearchProvider>
        <div className="flex gap-8 items-start">
          <MonthlyReportControls period={period} segment={segment} hideSegment={isDeptMgr} />
          <div className="min-w-0 flex-1">
            <MonthlyMatrix columns={data.columns} rows={rows} />
          </div>
        </div>
      </ReportSearchProvider>
    </div>
  )
}
