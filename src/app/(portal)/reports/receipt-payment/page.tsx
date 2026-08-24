// Receipt & Payment report (2026-08-20; reformatted same day — user: "我要做
// 到像cash flow 那样，report 的格式"). Exactly the Cash Flow statement's
// grammar — counter-account sections with ▸ drill-down, 流入/流出 totals,
// opening/closing, compare column — PLUS the block cash flow doesn't have:
// 未收 To collect, every issued invoice's balance net of receipts/approved
// CNs (dept_invoice_settlements RPC), because "类似cash flow但还需要include
// 还没收回的钱". dept_manager is RLS-locked to their own segment;
// finance/principal use the standard segment rail (未收 needs a specific
// segment — the consolidated view says so instead of guessing one).

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
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
import { fetchInterBillingCashFlow } from '@/lib/inter-billing-cash-flow'
import { fetchDeptOutstanding } from '@/lib/dept-receipt-payment'
import { deptNameToSegment } from '@/lib/billing'
import GlReportView from '../_components/GlReportView'
import ExportLinks from '../_components/ExportLinks'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function ReceiptPaymentPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : dayjs().format('YYYY-MM')
  const compare = params.compare ?? ''
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (params.segment ?? '')

  const [rawLines, accounts, glRefs, { data: banks }] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    fetchGlRefs(supabase),
    supabase.rpc('bank_gl_codes' as never),
  ])
  const bankCodes = new Set((banks ?? []) as unknown as string[])
  const ib = await fetchInterBillingCashFlow(supabase, bankCodes)
  const consolidated = !isDeptMgr && !segment
  const lines = [...applyGlRefs(rawLines, glRefs), ...(consolidated ? [] : ib.lines)]

  const cf = buildCashFlow(
    lines,
    [...accounts, ib.account, ib.payrollAccount],
    {
      current: monthPeriod(period),
      previous: monthPeriod(compare || period),
      segment: segmentFilterFor(segment),
    },
    bankCodes,
  )

  const coaWithSynthetic = [...accounts, ib.account, ib.payrollAccount]
  const [inLayoutRaw, outLayoutRaw] = await Promise.all([
    readReportLayout(supabase, 'cash_flow_in'),
    readReportLayout(supabase, 'cash_flow_out'),
  ])
  const blocks = cashFlowBlocks(cf, {
    inflow: buildCashFlowSideSections(cf.inflowLeaves, coaWithSynthetic, inLayoutRaw as ReportLayout | null, '实收 · Money in'),
    outflow: buildCashFlowSideSections(cf.outflowLeaves, coaWithSynthetic, outLayoutRaw as ReportLayout | null, '支出 · Money out'),
  })

  // ── 未收 To collect — the block Cash Flow doesn't have ────────────────────
  // dept_manager: RPC keys off their own segment. finance/principal: needs a
  // concrete segment; the consolidated view shows a pointer row instead.
  const arSegment = isDeptMgr ? null : segment || null
  const showAr = isDeptMgr || !!arSegment
  const arBlocks: ReportBlock[] = []
  if (showAr) {
    const [outstanding, { data: companies }] = await Promise.all([
      fetchDeptOutstanding(supabase as never, { segment: arSegment }),
      supabase.from('companies').select('id, name'),
    ])
    const companyMap = new Map(
      ((companies ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
    )
    // For dept_manager the txn segment tag is their own; resolve for display.
    let ownSeg = segment
    if (isDeptMgr && user.department_id) {
      const { data: dept } = await supabase.from('departments').select('name').eq('id', user.department_id).single()
      ownSeg = deptNameToSegment(dept?.name) ?? ''
    }
    const total = r2(outstanding.reduce((s, i) => s + i.outstanding, 0))
    const section: ReportSection = {
      key: 'to_collect',
      label: '未收 · To collect (所有月份的未收清发票)',
      current: total,
      previous: 0,
      nodes: outstanding.map((i) => ({
        code: '—',
        name: `${i.invoiceNo ?? i.id.slice(0, 8)} · ${
          i.companyId ? companyMap.get(i.companyId) ?? '—' : i.partyFallback ?? '—'
        } · ${dayjs(i.periodMonth).format('MMM YY')}`,
        current: i.outstanding,
        previous: 0,
        txns: [
          {
            date: i.invoiceDate ?? i.periodMonth,
            entryNo: i.invoiceNo,
            description: `开单 ${dayjs(i.invoiceDate ?? i.periodMonth).format('DD MMM YYYY')} · 总额 ${i.totalAmount.toFixed(2)}${
              i.receipts > 0 ? ` · 已收 ${i.receipts.toFixed(2)}` : ''
            }${i.credits > 0 ? ` · CN −${i.credits.toFixed(2)}` : ''}`,
            segment: ownSeg || arSegment || '',
            party: i.companyId ? companyMap.get(i.companyId) ?? null : i.partyFallback,
            amount: i.outstanding,
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

  const periodLabel = dayjs(`${period}-01`).format('MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>·</em> REPORTS · RECEIPT &amp; PAYMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Receipt &amp; Payment</h1>
        </div>
        <ExportLinks basePath="/reports/receipt-payment/export" period={period} compare={compare} segment={segment} />
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        跟 Cash Flow 一样按科目分组:实收 (money in)、支出 (money out)、净变动与期初/期末现金,
        点 ▸ 看底下每一笔。最下面多一块 Cash Flow 没有的:<em>未收</em> — 所有月份还没收清的发票,
        扣掉已收和 credit note 后的净额。
        {!showAr ? ' (未收要选一个部门 segment 才会显示。)' : ''}
      </p>

      <GlReportView
        basePath="/reports/receipt-payment"
        period={period}
        compare={compare}
        segment={segment}
        segments={isDeptMgr ? [] : [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]}
        blocks={[...blocks, ...arBlocks]}
        currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
        compareLabel={compare ? dayjs(`${compare}-01`).format('MMM YYYY') : ''}
      />
    </div>
  )
}
