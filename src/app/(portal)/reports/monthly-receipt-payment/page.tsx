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
import { requirePermission } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import {
  fetchInterBillingCashFlow,
  interBillTransferAccount,
  payrollCustodyAccount,
} from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { monthColumns, type MatrixRow } from '@/lib/monthly-matrix'
import { buildRnpMatrixRows, fetchRnpInvoiceEvents } from '@/lib/monthly-rnp'
import { segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'
import ReportViewToggle from '../_components/ReportViewToggle'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string }>
}

export default async function MonthlyReceiptPaymentPage({ searchParams }: Props) {
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : dayjs().format('YYYY-MM')
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (params.segment ?? '')
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const consolidated = !isDeptMgr && !segment
  // The bridge starts beside the journal read with the bank codes still
  // pending (2026-10-08), and is not read where its lines are dropped.
  const bankCodesRead = Promise.resolve(supabase.rpc('bank_gl_codes' as never)).then(
    ({ data: banks }) => new Set((banks ?? []) as unknown as string[]),
  )
  const [lines, accounts, bankCodes, ib, inSaved, outSaved, events, { data: companyRows }] =
    await Promise.all([
      fetchAllJournalLines(supabase),
      fetchCoaAccounts(supabase),
      bankCodesRead,
      consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
      readReportLayout(supabase, 'cash_flow_in'),
      readReportLayout(supabase, 'cash_flow_out'),
      // Every event, paged past PostgREST's cap (lib/monthly-rnp.ts).
      fetchRnpInvoiceEvents(supabase, isDeptMgr || !segment ? {} : { p_segment: segment }),
      supabase.from('companies').select('id, name, short_code'),
    ])
  const ibLines = ib ? ib.lines : []

  const data = buildMonthlyCashFlowSides(
    [...lines, ...ibLines],
    [...accounts, interBillTransferAccount, payrollCustodyAccount],
    bankCodes,
    { year, throughMonth, segment: segmentFilterFor(segment) },
  )

  const { months, accPeriod } = monthColumns(year, throughMonth)
  const companyLabelById = new Map<string, string>(
    ((companyRows ?? []) as Array<{ id: string; name: string; short_code: string | null }>).map(
      (c) => [c.id, c.short_code ?? c.name],
    ),
  )

  const rnpRows = buildRnpMatrixRows({ events, companyLabelById, months, accPeriod })

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

      <ReportViewToggle pair="receipt-payment" active="monthly" period={period} segment={segment || undefined} />

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        跟 Monthly Cash Flow 同一个格子:Accumulated + 每个月一栏。多出最下面一块:
        <em>月末未收</em> — 按<em>发票</em>算:每个月月底还没收清的发票余额(开单 − 已收 − CN),
        付清了就消失,底下每家还欠钱的公司一行。
      </p>

      <ReportSearchProvider>
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch lg:items-start">
          <MonthlyReportControls period={period} segment={segment} hideSegment={isDeptMgr} extraSegments={extraReportSegments(primedRegistryRows())} />
          <div className="min-w-0 flex-1">
            <MonthlyMatrix columns={data.columns} rows={rows} nowKey={period} />
          </div>
        </div>
      </ReportSearchProvider>
    </div>
  )
}
