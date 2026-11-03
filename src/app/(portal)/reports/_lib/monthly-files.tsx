import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { officeMonth } from '@/lib/office-time'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { buildPnlAccounts, buildCustomPnlRows, defaultPnlLayout } from '@/lib/pnl-custom'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow, interBillTransferAccount, payrollCustodyAccount } from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { sliceMatrixMonths, type MatrixRow } from '@/lib/monthly-matrix'
import { rangeLabel, reportRange } from '@/lib/report-range'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'
import { segmentFilterFor } from '../_components/report-segments'

// The Monthly P&L's and Monthly Cash Flow's Excel and PDF — lifted out of their two export routes on 2026-10-28, word
// for word, so Marketing's own pool hands out the very files Finance takes for Marketing. Each route asks its own gate
// first and hands over the reader: the session's own client on Reports and Dept Pool; the service role's for
// Marketing's pool, its segment named in code.

export interface MonthlyFileAsk {
  format: 'xlsx' | 'pdf'
  /** To, `YYYY-MM`. */
  period: string
  /** From, when not January. */
  from?: string
  /** The report segment; '' = the whole company. */
  segment: string
}

/** Format, To and From as an export link spells them (the segment is the route's to say). */
export function monthlyFileAsk(url: URL): Omit<MonthlyFileAsk, 'segment'> {
  const periodRaw = url.searchParams.get('period') ?? ''
  return {
    format: url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx',
    period: /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : officeMonth(),
    from: url.searchParams.get('from') ?? undefined,
  }
}

/** The Monthly P&L's file. */
export async function monthlyPnlFile(supabase: SupabaseClient, { format, period, from, segment }: MonthlyFileAsk): Promise<Response> {
  // From – To (2026-10-09, the Finance revamp): the months cut as the page cuts them — a department's page may
  // reach back across the year (2026-10-25), its months then built from From.
  const range = reportRange({ from, period }, officeMonth(), { crossYear: true })
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  // Mirror the page: consolidated when no segment is picked.
  const consolidated = !segment
  const [rawLines, accounts, savedRaw, elim] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    readReportLayout(supabase, 'pnl'),
    consolidated ? fetchInterBillingElimination(supabase) : Promise.resolve(null),
  ])
  const lines = elim ? eliminateInterBilling(rawLines, elim) : rawLines
  const data = buildPnlAccounts(lines, accounts, { year, throughMonth, segment: segmentFilterFor(segment), ...(range.buildFrom ? { from: range.buildFrom } : {}) })
  const saved = (savedRaw ?? null) as ReportLayout | null
  const layout = saved && Array.isArray(saved.categories) && saved.categories.length > 0
    ? saved
    : defaultPnlLayout(data.accounts)
  const cut = sliceMatrixMonths(data.columns, buildCustomPnlRows(data, layout), range.from, { base: data.salesByColumn })
  const matrix = { columns: cut.columns, rows: cut.rows }

  const filename = `monthly-pnl-${range.wholeYear ? period : `${range.from}-${period}`}${segment ? `-${segment}` : ''}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Monthly P&L"
          subtitle={`${range.buildFrom ? '' : `FY ${year} · `}all amounts RM`}
          periodLabel={range.wholeYear ? `Up to ${dayjs(`${period}-01`).format('MMMM YYYY')}` : rangeLabel(range.from, range.to)}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Monthly P&L', matrix, cut.base ?? data.salesByColumn) })
}

/** The Monthly Cash Flow's file. */
export async function monthlyCashFlowFile(supabase: SupabaseClient, { format, period, from, segment }: MonthlyFileAsk): Promise<Response> {
  // From – To (2026-10-09, the Finance revamp): the months cut as the page cuts them — a department's page may
  // reach back across the year (2026-10-25), its months then built from From.
  const range = reportRange({ from, period }, officeMonth(), { crossYear: true })
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  // Per-segment only — cancels across segments, so drop it when consolidated;
  // there the bridge is not read at all, and elsewhere it starts beside the
  // journal read with the bank codes still pending (2026-10-08).
  const consolidated = !segment
  const bankCodesRead = Promise.resolve(
    supabase.rpc('bank_gl_codes' as never), // codes only, no balances
  ).then(({ data: banks }) => new Set((banks ?? []) as unknown as string[]))
  const [lines, accounts, bankCodes, ib, inSaved, outSaved] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    bankCodesRead,
    consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])
  const ibLines = ib ? ib.lines : []
  // Same shape as the Cash Flow STATEMENT (the reference view), month columns.
  const data = buildMonthlyCashFlowSides([...lines, ...ibLines], [...accounts, interBillTransferAccount, payrollCustodyAccount], bankCodes, {
    year,
    throughMonth,
    segment: segmentFilterFor(segment),
    ...(range.buildFrom ? { from: range.buildFrom } : {}),
  })
  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', 'Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', 'Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
  ]
  const cut = sliceMatrixMonths(data.columns, rows, range.from)
  const matrix = { columns: cut.columns, rows: cut.rows }

  const filename = `monthly-cash-flow-${range.wholeYear ? period : `${range.from}-${period}`}${segment ? `-${segment}` : ''}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Monthly Cash Flow"
          subtitle={`${range.buildFrom ? '' : `FY ${year} · `}all amounts RM · direct method`}
          periodLabel={range.wholeYear ? `Up to ${dayjs(`${period}-01`).format('MMMM YYYY')}` : rangeLabel(range.from, range.to)}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Monthly Cash Flow', matrix) })
}
