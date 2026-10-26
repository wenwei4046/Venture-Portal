// Receipt & Payment statement export (xlsx/pdf) — same engine + blocks as
// the page: the Cash Flow statement grammar PLUS the 未收 To-collect section.

import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { listsPayrollByPerson } from '@/lib/roles'
import {
  applyGlRefs,
  buildCashFlow,
  fetchAllJournalLines,
  fetchCoaAccounts,
  fetchGlRefs,
  monthPeriod,
  type ReportSection,
} from '@/lib/gl-reports'
import { cashFlowBlocks, type ReportBlock } from '@/lib/gl-report-blocks'
import { buildCashFlowSideSections } from '@/lib/cash-flow-sections'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import {
  fetchInterBillingCashFlow,
  interBillTransferAccount,
  payrollCustodyAccount,
} from '@/lib/inter-billing-cash-flow'
import { fetchDeptOutstanding } from '@/lib/dept-receipt-payment'
import { glStatementExportResponse } from '@/lib/export/gl-statement'
import { segmentFilterFor } from '../../_components/report-segments'
import { reportsCompanyWide } from '@/lib/surfaces'

const YM = /^\d{4}-\d{2}$/
const r2 = (n: number) => Math.round(n * 100) / 100

export async function GET(req: Request) {
  const user = await requireActionOn('/reports/receipt-payment', 'dept_reports', 'export')
  // As the page: for whoever reads the reports company-wide (the Dept Manager's
  // own-segment export went with the kind, 2026-10-17).
  if (!reportsCompanyWide(user)) return Response.json({ error: 'Not found' }, { status: 404 })
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? ('pdf' as const) : ('xlsx' as const)
  const period = url.searchParams.get('period') ?? officeMonth()
  const compare = url.searchParams.get('compare') ?? ''
  const segment = url.searchParams.get('segment') ?? ''
  if (!YM.test(period) || (compare && !YM.test(compare))) {
    return Response.json({ error: 'invalid period/compare (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()
  const consolidated = !segment
  // 未收 block — needs a concrete segment (the consolidated export just skips
  // it, like the page).
  const arSegment = segment || null

  // Every read at once, as on the page (2026-10-08): the bridge gets the
  // pending bank-code read and is skipped where its lines are dropped.
  const bankCodesRead = Promise.resolve(supabase.rpc('bank_gl_codes' as never)).then(
    ({ data: banks }) => new Set((banks ?? []) as unknown as string[]),
  )
  const [rawLines, accounts, glRefs, bankCodes, ib, inLayoutRaw, outLayoutRaw, arReads] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    // Salary lines by department for whoever reads payroll that way (2026-10-13).
    fetchGlRefs(supabase, { payrollByPerson: listsPayrollByPerson(user) }),
    bankCodesRead,
    consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
    arSegment
      ? Promise.all([
          fetchDeptOutstanding(supabase as never, { segment: arSegment }),
          supabase.from('companies').select('id, name'),
        ])
      : null,
  ])
  const lines = [...applyGlRefs(rawLines, glRefs), ...(ib ? ib.lines : [])]

  const cf = buildCashFlow(
    lines,
    [...accounts, interBillTransferAccount, payrollCustodyAccount],
    {
      current: monthPeriod(period),
      previous: monthPeriod(compare || period),
      segment: segmentFilterFor(segment),
    },
    bankCodes,
  )

  const coaWithSynthetic = [...accounts, interBillTransferAccount, payrollCustodyAccount]
  const blocks = cashFlowBlocks(cf, {
    inflow: buildCashFlowSideSections(cf.inflowLeaves, coaWithSynthetic, inLayoutRaw as ReportLayout | null, '实收 · Money in', 'in'),
    outflow: buildCashFlowSideSections(cf.outflowLeaves, coaWithSynthetic, outLayoutRaw as ReportLayout | null, '支出 · Money out', 'out'),
  })

  const arBlocks: ReportBlock[] = []
  if (arReads) {
    const [outstanding, { data: companies }] = arReads
    const companyMap = new Map(
      ((companies ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
    )
    const total = r2(outstanding.reduce((s, o) => s + o.outstanding, 0))
    const section: ReportSection = {
      key: 'to_collect',
      label: '未收 · To collect (所有月份的未收清发票)',
      current: total,
      previous: 0,
      nodes: outstanding.map((o) => ({
        code: '—',
        name: `${o.invoiceNo ?? o.id.slice(0, 8)} · ${
          o.companyId ? companyMap.get(o.companyId) ?? '—' : o.partyFallback ?? '—'
        } · ${dayjs(o.periodMonth).format('MMM YY')}`,
        current: o.outstanding,
        previous: 0,
        txns: [
          {
            date: o.invoiceDate ?? o.periodMonth,
            entryNo: null,
            description: `Billed ${o.totalAmount.toFixed(2)}${o.receipts > 0 ? ` · received ${o.receipts.toFixed(2)}` : ''}${o.credits > 0 ? ` · CN -${o.credits.toFixed(2)}` : ''}`,
            segment,
            party: o.companyId ? companyMap.get(o.companyId) ?? null : o.partyFallback,
            amount: o.outstanding,
            debit: o.outstanding,
            credit: 0,
            otherSide: null,
            refNo: o.invoiceNo,
          },
        ],
        children: [],
      })),
    }
    arBlocks.push(
      { kind: 'section', section },
      {
        kind: 'summary',
        row: {
          label: '未收合计 · Total to collect',
          current: total,
          previous: 0,
          emphasis: 'strong',
          tone: total > 0 ? 'danger' : 'ledger',
        },
      },
    )
  }

  return glStatementExportResponse({
    format,
    filename: `receipt-payment-${period}${segment ? `-${segment}` : ''}`,
    title: 'Receipt & Payment',
    periodLabel: `${dayjs(`${period}-01`).format('MMMM YYYY')}${segment ? ` · ${segment}` : ''}`,
    currentLabel: dayjs(`${period}-01`).format('MMM YYYY'),
    compareLabel: compare ? dayjs(`${compare}-01`).format('MMM YYYY') : '',
    blocks: [...blocks, ...arBlocks],
  })
}
