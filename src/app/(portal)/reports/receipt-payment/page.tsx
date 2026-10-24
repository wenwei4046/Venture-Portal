// Receipt & Payment report (2026-08-20; reformatted same day — user: "我要做
// 到像cash flow 那样，report 的格式"). Exactly the Cash Flow statement's
// grammar — counter-account sections with ▸ drill-down, 流入/流出 totals,
// opening/closing, compare column — PLUS the block cash flow doesn't have:
// 未收 To collect, every issued invoice's balance net of receipts/approved
// CNs (dept_invoice_settlements RPC), because "类似cash flow但还需要include
// 还没收回的钱". The standard segment rail (未收 needs a specific segment —
// the consolidated view leaves it out instead of guessing one).

import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { canDo } from '@/lib/permission-actions'
import { officeMonth } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
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
import GlReportView from '../_components/GlReportView'
import ExportLinks from '../_components/ExportLinks'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import { reportsCompanyWide } from '@/lib/surfaces'
import { formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import ReportModeSwitch from '../_components/ReportModeSwitch'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function ReceiptPaymentPage({ searchParams }: Props) {
  await requirePage('/reports/receipt-payment')
  const user = await requirePermission('dept_reports')
  // For whoever reads the reports company-wide (Reports · View at All); the
  // Dept Manager's own-segment page went with the kind (2026-10-17).
  if (!reportsCompanyWide(user)) notFound()
  // The files only for whoever may take them out — as the export route asks (2026-10-16).
  const canExport = canDo(user, 'dept_reports', 'export')
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : officeMonth()
  const compare = params.compare ?? ''
  const segment = params.segment ?? ''
  const consolidated = !segment
  // ── 未收 To collect — the block Cash Flow doesn't have ────────────────────
  // It needs a concrete segment; the consolidated view has no 未收 block.
  const arSegment = segment || null
  const showAr = !!arSegment

  // Every read starts at once (2026-10-08) — the bridge, the layouts and the
  // 未收 reads each used to wait for the one before. The bridge is handed the
  // pending bank-code read (it needs it only to build its lines) and is not
  // read at all where its lines are dropped (consolidated).
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
    showAr
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
            entryNo: null,
            description: `开单 ${dayjs(i.invoiceDate ?? i.periodMonth).format('DD MMM YYYY')} · 总额 ${i.totalAmount.toFixed(2)}${
              i.receipts > 0 ? ` · 已收 ${i.receipts.toFixed(2)}` : ''
            }${i.credits > 0 ? ` · CN −${i.credits.toFixed(2)}` : ''}`,
            segment,
            party: i.companyId ? companyMap.get(i.companyId) ?? null : i.partyFallback,
            amount: i.outstanding,
            // The invoice still owed as the drill-down's one line (2026-10-24): its number the document (Ref. 2),
            // what is owed a debit.
            debit: i.outstanding,
            credit: 0,
            otherSide: null,
            refNo: i.invoiceNo,
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

  // The page (2026-10-09, the user's Claude Design handoff): the two views and
  // the exports in the head, the cards, the controls on one row over the
  // statement.
  const segChoices = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
  const segName = (segChoices.find((s) => s.value === segment) ?? segChoices[0]).label
  const mon = dayjs(`${period}-01`).format('MMM')
  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · RECEIPT &amp; PAYMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Receipt &amp; Payment</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ReportModeSwitch pair="receipt-payment" active="single" period={period} segment={segment || undefined} />
          {canExport ? (
            <ExportLinks variant="sheet" basePath="/reports/receipt-payment/export" period={period} compare={compare} segment={segment} />
          ) : null}
        </div>
      </div>

      <StatCards label="Receipt and payment">
        <StatCard label="Receipts" value={formatMoney(cf.inflow.current)} icon="inbox" tone="ledger" note={periodLabel} />
        <StatCard label="Payments" value={formatMoney(cf.outflow.current)} icon="send" tone="danger" note={periodLabel} />
        <StatCard label="Net" value={formatMoney(cf.netChange.current)} icon="swap" tone="primary" note="Receipts − payments" />
      </StatCards>

      <section className="mb-6">
        <div className="sect-head">
          <h2>Receipt &amp; payment</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {segName.toUpperCase()} · {mon.toUpperCase()} {period.slice(0, 4)}
          </span>
        </div>
        <GlReportView
          period={period}
          compare={compare}
          segment={segment}
          segments={segChoices}
          blocks={[...blocks, ...arBlocks]}
          // Each line as a % of the month's receipts (2026-10-10, the handoff).
          pctBase={{ current: cf.inflow.current, previous: cf.inflow.previous }}
          currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
          compareLabel={compare ? dayjs(`${compare}-01`).format('MMM YYYY') : ''}
        />
      </section>
    </div>
  )
}
