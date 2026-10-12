// Monthly Receipt & Payment (2026-08-20, user: "我也有要看到monthly 和在
// monthly 看accumulated"). The month-matrix twin of /reports/receipt-payment,
// exactly like Monthly Cash Flow (Accumulated + one column per month, shared
// cash-flow layout) PLUS the receivables rows the cash matrix doesn't have —
// built by lib/monthly-rnp so the export route renders the identical rows.
// The 支出对象 paid-to breakdown was removed on request (2026-08-24: "我只是
// 要还没收回的就好").

import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
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
import SheetReport from '../_components/SheetReport'
import { sheetColumns, sheetFromMatrix } from '@/lib/report-sheet'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'
import ReportViewToggle from '../_components/ReportViewToggle'
import { reportsCompanyWide } from '@/lib/surfaces'
import { formatMoney } from '@/lib/utils'
import { sliceMatrixMonths } from '@/lib/monthly-matrix'
import { fromChoices, rangeLabel, reportRange, toChoices } from '@/lib/report-range'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { REPORT_SEGMENTS } from '../_components/report-segments'
import ReportToolbar from '../_components/ReportToolbar'
import ReportModeSwitch from '../_components/ReportModeSwitch'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string; from?: string }>
}

export default async function MonthlyReceiptPaymentPage({ searchParams }: Props) {
  await requirePage('/reports/monthly-receipt-payment')
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : officeMonth()
  const isDeptMgr = !reportsCompanyWide(user) // own segment only (Q7: by cell, not kind)
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

  // Whoever reads the reports company-wide (2026-10-09, the user's Claude
  // Design handoff): the period From – To, the two views and the exports in
  // the head, the cards, one control row, the months separated. A department
  // manager keeps the page below, as it was.
  if (!isDeptMgr) {
    const nowYM = officeMonth()
    const range = reportRange({ from: params.from, period }, nowYM)
    const cut = sliceMatrixMonths(data.columns, rows, range.from)
    // A card reads the Accumulated of its line as cut to From: a flow adds up, an
    // opening reads its first month, a closing or a balance its last.
    const pick = (values: number[], key = 'flow') => sliceMatrixMonths(data.columns, [{ key, values }], range.from).rows[0].values[0]
    const segments = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
    const segName = (segments.find((s) => s.value === segment) ?? segments[0]).label
    const exportHref = (format: 'xlsx' | 'pdf') => {
      const qs = new URLSearchParams({ format, period: range.to })
      if (segment) qs.set('segment', segment)
      if (!range.wholeYear) qs.set('from', range.from)
      return `/reports/monthly-receipt-payment/export?${qs.toString()}`
    }
    // Each line as a % of the month's receipts (2026-10-10, the handoff).
    const receipts = sliceMatrixMonths(data.columns, [{ key: 'flow', values: data.inflowTotalByCol }], range.from).rows[0].values
    return (
      <div>
        <div className="page-head">
          <div className="min-w-0">
            <div className="page-eyebrow">
              <em>I.</em> REPORTS · RECEIPT &amp; PAYMENT · {rangeLabel(range.from, range.to).toUpperCase()}
            </div>
            <h1 className="page-title">Receipt &amp; Payment</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReportModeSwitch pair="receipt-payment" active="monthly" period={range.to} segment={segment || undefined} />
            <Link href="/reports/cash-flow/layout" className="btn-quiet-sheet">
              Edit layout
            </Link>
            <a href={exportHref('xlsx')} className="btn-quiet-sheet">
              Excel
            </a>
            <a href={exportHref('pdf')} className="btn-quiet-sheet">
              PDF
            </a>
          </div>
        </div>

        <StatCards label="Receipt and payment">
          <StatCard label="Receipts" value={formatMoney(pick(data.inflowTotalByCol))} icon="inbox" tone="ledger" note="Selected period" />
          <StatCard label="Payments" value={formatMoney(pick(data.outflowTotalByCol))} icon="send" tone="danger" note="Selected period" />
          <StatCard label="Net" value={formatMoney(pick(data.netChangeByCol))} icon="swap" tone="primary" note="Receipts − payments" />
          <StatCard
            label="Outstanding at month end"
            value={formatMoney(pick(rows.find((r) => r.key === 'AR_OUTSTANDING')?.values ?? data.columns.map(() => 0), 'AR_OUTSTANDING'))}
            icon="receipt"
            note="Invoices not yet received"
          />
        </StatCards>

        <ReportSearchProvider level={3}>
          <section className="mb-6">
            <div className="sect-head">
              <h2>Monthly receipt &amp; payment</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {segName.toUpperCase()} · {rangeLabel(range.from, range.to).toUpperCase()}
              </span>
            </div>
            <ReportToolbar
              from={range.from}
              to={range.to}
              fromOptions={fromChoices(range.to)}
              toOptions={toChoices(nowYM)}
              segment={segment}
              segments={segments}
            />
            <SheetReport columns={sheetColumns(cut.columns, nowYM)} rows={sheetFromMatrix(cut.rows)} pctBase={receipts} />
          </section>
        </ReportSearchProvider>
      </div>
    )
  }

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
