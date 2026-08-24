// Monthly Receipt & Payment (2026-08-20, user: "我也有要看到monthly 和在
// monthly 看accumulated"). The month-matrix twin of /reports/receipt-payment,
// exactly like Monthly Cash Flow (Accumulated + one column per month, shared
// cash-flow layout) PLUS the receivables rows the cash matrix doesn't have —
// built by lib/monthly-rnp so the export route renders the identical rows.
// The 支出对象 paid-to breakdown was removed on request (2026-08-24: "我只是
// 要还没收回的就好").

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts, fetchGlRefs, type GlLine } from '@/lib/gl-reports'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow } from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { monthColumns, type MatrixRow } from '@/lib/monthly-matrix'
import { buildRnpMatrixRows } from '@/lib/monthly-rnp'
import { segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'

export const dynamic = 'force-dynamic'

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

  const [lines, accounts, { data: banks }, inSaved, outSaved, glRefs, receiptPartiesRes, { data: companyRows }] =
    await Promise.all([
      fetchAllJournalLines(supabase),
      fetchCoaAccounts(supabase),
      supabase.rpc('bank_gl_codes' as never),
      readReportLayout(supabase, 'cash_flow_in'),
      readReportLayout(supabase, 'cash_flow_out'),
      fetchGlRefs(supabase),
      supabase.rpc('voucher_party_refs' as never),
      supabase.from('companies').select('id, name, short_code'),
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

  const { months, accPeriod } = monthColumns(year, throughMonth)
  const payeeByVoucherId = new Map<string, string>(
    (Array.isArray((receiptPartiesRes as { data?: unknown })?.data)
      ? ((receiptPartiesRes as { data: unknown }).data as Array<{ id: string; payee: string }>)
      : []
    ).map((r) => [r.id, r.payee]),
  )
  const shortByName = new Map<string, string>(
    ((companyRows ?? []) as Array<{ name: string; short_code: string | null }>).flatMap((c) =>
      c.short_code ? [[c.name, c.short_code] as [string, string]] : [],
    ),
  )

  const rnpRows = buildRnpMatrixRows({
    lines: lines as GlLine[],
    glRefs,
    payeeByVoucherId,
    shortByName,
    months,
    accPeriod,
    segList: segmentFilterFor(segment),
    closingByCol: data.closingByCol,
  })

  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', '流入合计 · Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', '流出合计 · Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
    ...rnpRows,
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
          <a
            href={`/reports/monthly-receipt-payment/export?format=xlsx&period=${period}${segment ? `&segment=${segment}` : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Excel
          </a>
          <a
            href={`/reports/monthly-receipt-payment/export?format=pdf&period=${period}${segment ? `&segment=${segment}` : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            PDF
          </a>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        跟 Monthly Cash Flow 同一个格子:Accumulated + 每个月一栏。多出最下面:每月<em>开单</em>、
        每月<em>收回/CN</em>、<em>月末未收</em>(每家欠钱的公司一行,只列还没收清的)和
        <em>部门总资金</em>(现金 + 未收)。
      </p>

      <ReportSearchProvider>
        <div className="flex gap-8 items-start">
          <MonthlyReportControls period={period} segment={segment} hideSegment={isDeptMgr} extraSegments={extraReportSegments(primedRegistryRows())} />
          <div className="min-w-0 flex-1">
            <MonthlyMatrix columns={data.columns} rows={rows} />
          </div>
        </div>
      </ReportSearchProvider>
    </div>
  )
}
