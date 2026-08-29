// GL-driven Cash Flow export (xlsx/pdf) — same engine + blocks as the page.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { buildCashFlow, fetchAllJournalLines, fetchCoaAccounts, monthPeriod } from '@/lib/gl-reports'
import { cashFlowBlocks } from '@/lib/gl-report-blocks'
import { buildCashFlowSideSections } from '@/lib/cash-flow-sections'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { fetchInterBillingCashFlow } from '@/lib/inter-billing-cash-flow'
import { glStatementExportResponse } from '@/lib/export/gl-statement'
import { segmentFilterFor } from '../../_components/report-segments'

const YM = /^\d{4}-\d{2}$/

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? ('pdf' as const) : ('xlsx' as const)
  const period = url.searchParams.get('period') ?? dayjs().format('YYYY-MM')
  const compare = url.searchParams.get('compare') ?? '' // '' = single-month export
  const segment = url.searchParams.get('segment') ?? ''
  if (!YM.test(period) || (compare && !YM.test(compare))) {
    return Response.json({ error: 'invalid period/compare (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()
  const [lines, accounts, { data: banks }] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    supabase.rpc('bank_gl_codes' as never), // codes only; dept_managers can't read bank_accounts
  ])
  const bankCodes = new Set((banks ?? []) as unknown as string[])
  const ib = await fetchInterBillingCashFlow(supabase, bankCodes)
  // Mirror the page: internal-transfer bridge lines only make sense inside a
  // single segment; consolidated exports drop them (this route is
  // principal/finance only, so no-segment == consolidated).
  const ibLines = segment ? ib.lines : []

  const cf = buildCashFlow(
    [...lines, ...ibLines],
    [...accounts, ib.account, ib.payrollAccount],
    {
      current: monthPeriod(period),
      previous: monthPeriod(compare || period),
      segment: segmentFilterFor(segment),
    },
    bankCodes,
  )

  // Same user-arranged sections the page renders.
  const coaWithSynthetic = [...accounts, ib.account, ib.payrollAccount]
  const [inLayoutRaw, outLayoutRaw] = await Promise.all([
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])

  return glStatementExportResponse({
    format,
    filename: `cash-flow-${period}${segment ? `-${segment}` : ''}`,
    title: 'Cash Flow Statement',
    periodLabel: `${dayjs(`${period}-01`).format('MMMM YYYY')}${segment ? ` · ${segment}` : ''}`,
    currentLabel: dayjs(`${period}-01`).format('MMM YYYY'),
    compareLabel: compare ? dayjs(`${compare}-01`).format('MMM YYYY') : '',
    blocks: cashFlowBlocks(cf, {
      inflow: buildCashFlowSideSections(cf.inflowLeaves, coaWithSynthetic, inLayoutRaw as ReportLayout | null, '现金流入 · Money in', 'in'),
      outflow: buildCashFlowSideSections(cf.outflowLeaves, coaWithSynthetic, outLayoutRaw as ReportLayout | null, '现金流出 · Money out', 'out'),
    }),
  })
}
