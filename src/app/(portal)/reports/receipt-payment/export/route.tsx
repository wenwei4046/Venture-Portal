// Receipt & Payment statement export (xlsx/pdf) — same engine + blocks as
// the page: the Cash Flow statement grammar PLUS the 未收 To-collect section.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
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
import { deptNameToSegment } from '@/lib/billing'
import { glStatementExportResponse } from '@/lib/export/gl-statement'
import { segmentFilterFor } from '../../_components/report-segments'

const YM = /^\d{4}-\d{2}$/
const r2 = (n: number) => Math.round(n * 100) / 100

export async function GET(req: Request) {
  // dept_manager may export their own segment (RLS + the settlements RPC
  // both scope to it).
  const user = await requirePermission('dept_reports')
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? ('pdf' as const) : ('xlsx' as const)
  const period = url.searchParams.get('period') ?? dayjs().format('YYYY-MM')
  const compare = url.searchParams.get('compare') ?? ''
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (url.searchParams.get('segment') ?? '')
  if (!YM.test(period) || (compare && !YM.test(compare))) {
    return Response.json({ error: 'invalid period/compare (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()
  const consolidated = !isDeptMgr && !segment
  // 未收 block — dept_manager scoped by the RPC; finance/principal need a
  // concrete segment (the consolidated export just skips it, like the page).
  const arSegment = isDeptMgr ? null : segment || null

  // Every read at once, as on the page (2026-10-08): the bridge gets the
  // pending bank-code read and is skipped where its lines are dropped.
  const bankCodesRead = Promise.resolve(supabase.rpc('bank_gl_codes' as never)).then(
    ({ data: banks }) => new Set((banks ?? []) as unknown as string[]),
  )
  const [rawLines, accounts, glRefs, bankCodes, ib, inLayoutRaw, outLayoutRaw, arReads] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    fetchGlRefs(supabase),
    bankCodesRead,
    consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
    isDeptMgr || arSegment
      ? Promise.all([
          fetchDeptOutstanding(supabase as never, { segment: arSegment }),
          supabase.from('companies').select('id, name'),
          isDeptMgr && user.department_id
            ? supabase.from('departments').select('name, segment_key').eq('id', user.department_id).single()
            : null,
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
    const [outstanding, { data: companies }, deptRead] = arReads
    const companyMap = new Map(
      ((companies ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
    )
    let ownSeg = segment
    if (isDeptMgr && user.department_id) {
      const dept = deptRead?.data
      ownSeg = ((dept as { segment_key?: string | null } | null)?.segment_key ?? null) || (deptNameToSegment(dept?.name) ?? '')
    }
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
            entryNo: o.invoiceNo,
            description: `Billed ${o.totalAmount.toFixed(2)}${o.receipts > 0 ? ` · received ${o.receipts.toFixed(2)}` : ''}${o.credits > 0 ? ` · CN -${o.credits.toFixed(2)}` : ''}`,
            segment: ownSeg || arSegment || '',
            party: o.companyId ? companyMap.get(o.companyId) ?? null : o.partyFallback,
            amount: o.outstanding,
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
