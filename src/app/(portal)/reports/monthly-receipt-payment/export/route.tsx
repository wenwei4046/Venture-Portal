// Monthly Receipt & Payment export (xlsx/pdf) — same engine + rows as the
// page (lib/monthly-rnp), mirroring monthly-cash-flow/export.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts, fetchGlRefs, type GlLine } from '@/lib/gl-reports'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow } from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { monthColumns, type MatrixRow } from '@/lib/monthly-matrix'
import { buildRnpMatrixRows } from '@/lib/monthly-rnp'
import { segmentFilterFor } from '../../_components/report-segments'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildMatrixXlsx } from '@/lib/export/monthly-matrix-export'
import { MatrixPdf } from '@/lib/export/matrix-pdf'

export async function GET(req: Request) {
  // dept_manager may export their own segment (RLS scopes journal_lines).
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const periodRaw = url.searchParams.get('period') ?? ''
  const period = /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : dayjs().format('YYYY-MM')
  const segment = url.searchParams.get('segment') ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  const supabase = await createClient()
  const [lines, accounts, { data: banks }, inSaved, outSaved, glRefs, partiesRes, { data: companyRows }] =
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
  const ibLines = user.role !== 'dept_manager' && !segment ? [] : ib.lines

  const data = buildMonthlyCashFlowSides(
    [...lines, ...ibLines],
    [...accounts, ib.account, ib.payrollAccount],
    bankCodes,
    { year, throughMonth, segment: segmentFilterFor(segment) },
  )

  const { months, accPeriod } = monthColumns(year, throughMonth)
  const payeeByVoucherId = new Map<string, string>(
    (Array.isArray((partiesRes as { data?: unknown })?.data)
      ? ((partiesRes as { data: unknown }).data as Array<{ id: string; payee: string }>)
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
  })

  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', 'Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', 'Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
    ...rnpRows,
  ]
  const matrix = { columns: data.columns, rows }

  const filename = `monthly-receipt-payment-${period}${segment ? `-${segment}` : ''}`
  if (format === 'pdf') {
    return exportPdfResponse({
      filename,
      element: (
        <MatrixPdf
          title="Monthly Receipt & Payment"
          subtitle={`FY ${year} · all amounts RM · cash matrix + receivables`}
          periodLabel={`Up to ${dayjs(`${period}-01`).format('MMMM YYYY')}`}
          data={matrix}
        />
      ),
    })
  }
  return exportXlsxResponse({ filename, buffer: buildMatrixXlsx('Monthly Receipt & Payment', matrix) })
}
