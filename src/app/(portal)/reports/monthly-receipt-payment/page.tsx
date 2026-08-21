// Monthly Receipt & Payment (2026-08-20, user: "我也有要看到monthly 和在
// monthly 看accumulated"). The month-matrix twin of /reports/receipt-payment,
// exactly like Monthly Cash Flow (Accumulated + one column per month, shared
// cash-flow layout) PLUS the receivables rows the cash matrix doesn't have:
//   开单 Billed        = Dr 3030 per month (invoice issues, segment-tagged)
//   收回/CN Collected  = Cr 3030 per month (settlements + approved CNs)
//   月末未收 Outstanding = running AR balance at each month-end (all-time
//                        cumulative — accounting-true, ties to the GL)
// dept_manager is RLS-locked to their own segment; the consolidated view's
// receivables rows are the whole company's AR.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { applyGlRefs, fetchAllJournalLines, fetchCoaAccounts, fetchGlRefs, type GlLine } from '@/lib/gl-reports'
import { buildMonthlyCashFlowSides, buildSideMatrixRows } from '@/lib/cash-flow-custom'
import { fetchInterBillingCashFlow } from '@/lib/inter-billing-cash-flow'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { monthColumns, r2, type MatrixRow } from '@/lib/monthly-matrix'
import { segmentFilterFor } from '../_components/report-segments'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'

export const dynamic = 'force-dynamic'

// Every invoice's AR leg posts to 3030 (issue Dr / settle & CN Cr), always
// segment-tagged — so the per-segment running balance IS that segment's 未收.
const AR_CODE = '3030'

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
      // Voucher payee names (both directions) via SECURITY DEFINER (mig
      // 20260820050000) — dept_manager RLS blocks payment_vouchers, which
      // dumped their collections into 未标示; the payments breakdown below
      // needs the debit-direction payees too.
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

  // ── Receivables rows (the part Monthly Cash Flow doesn't have) ────────────
  const { months, accPeriod } = monthColumns(year, throughMonth)
  const segList = segmentFilterFor(segment)
  const inSeg = (l: GlLine) => !segList || segList.includes(l.segment)
  // applyGlRefs resolves WHO each 3030 movement belongs to (invoice bill-to /
  // receipt payee / CN parent invoice) so 月末未收 can split per debtor.
  const arLines = applyGlRefs(
    (lines as GlLine[]).filter((l) => l.account_code === AR_CODE && inSeg(l)),
    glRefs,
  )

  const billedInMonth = (ym: string) =>
    r2(arLines.filter((l) => l.date.startsWith(ym)).reduce((s, l) => s + Number(l.debit ?? 0), 0))
  const collectedInMonth = (ym: string) =>
    r2(arLines.filter((l) => l.date.startsWith(ym)).reduce((s, l) => s + Number(l.credit ?? 0), 0))
  const balanceAt = (toDate: string) =>
    r2(
      arLines
        .filter((l) => l.date <= toDate)
        .reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0),
    )
  const monthEnd = (ym: string) => dayjs(`${ym}-01`).endOf('month').format('YYYY-MM-DD')

  // Values aligned to data.columns: ['acc', latest month, …, Jan].
  const billedByCol = [
    r2(months.reduce((s, ym) => s + billedInMonth(ym), 0)),
    ...months.map(billedInMonth),
  ]
  const collectedByCol = [
    r2(months.reduce((s, ym) => s + collectedInMonth(ym), 0)),
    ...months.map(collectedInMonth),
  ]
  const outstandingByCol = [balanceAt(accPeriod.to), ...months.map((ym) => balanceAt(monthEnd(ym)))]

  // Per-debtor split of the running AR balance (user 2026-08-20: "我比较在意
  // 的是还没收回的钱，因为那个也是我的部门的钱"). Party sources, unified onto
  // ONE key per company: invoice legs carry the company SHORT CODE, receipt
  // legs carry the payee FULL NAME (or nothing at all under dept_manager RLS
  // — receipt_party_refs fills that) — normalise names → short codes so a
  // debtor's billing and collections net in the same bucket.
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
  const partyOf = (l: GlLine) => {
    const raw =
      (l as GlLine & { party?: string | null }).party ??
      (l.ref_type === 'payment_voucher' || l.ref_type === 'payment_voucher_void'
        ? (l.ref_id ? payeeByVoucherId.get(l.ref_id) ?? null : null)
        : null)
    if (!raw) return '未标示 · Unattributed'
    return shortByName.get(raw) ?? raw
  }
  const parties = [...new Set(arLines.map(partyOf))]
  const partyBalanceAt = (p: string, toDate: string) =>
    r2(
      arLines
        .filter((l) => partyOf(l) === p && l.date <= toDate)
        .reduce((s, l) => s + Number(l.debit ?? 0) - Number(l.credit ?? 0), 0),
    )
  const partyRows: MatrixRow[] = parties
    .map((p) => ({
      p,
      values: [partyBalanceAt(p, accPeriod.to), ...months.map((ym) => partyBalanceAt(p, monthEnd(ym)))],
    }))
    // 只看还没收回的 (user 2026-08-20): only debtors whose balance is still
    // POSITIVE — netted-off buckets, credit noise and the unattributed
    // remainder are hidden. The 月末未收 parent row above stays the full GL
    // figure, so the visible children may sum to slightly more than it.
    .filter((r) => r.values[0] > 0.005)
    .sort((a, b) => b.values[0] - a.values[0])
    .map((r) => ({
      key: `AR_P_${r.p}`,
      label: r.p,
      depth: 1,
      kind: 'account' as const,
      values: r.values,
    }))

  // ── 支出对象 Paid-to breakdown (user 2026-08-20: "payment 那边我也要看到
  // 花出去的钱的breakdown") — money-out bank lines grouped by WHO was paid.
  // Real payments attribute via voucher payees; the synthetic bridge legs
  // label themselves as internal transfers so the block still reconciles
  // with the outflow totals above.
  const paidLines = applyGlRefs(
    [...(lines as GlLine[]), ...ibLines].filter(
      (l) => bankCodes.has(l.account_code) && Number(l.credit ?? 0) > 0 && inSeg(l),
    ),
    glRefs,
  )
  const paidPartyOf = (l: GlLine) => {
    if (l.ref_type === 'inter_billing_transfer') {
      return (l.entry_description ?? '').toLowerCase().includes('payroll')
        ? 'HR Payroll custody (internal)'
        : 'Inter-billing (internal)'
    }
    return partyOf(l)
  }
  const paidSumIn = (p: string, ym: string) =>
    r2(
      paidLines
        .filter((l) => paidPartyOf(l) === p && l.date.startsWith(ym))
        .reduce((s, l) => s + Number(l.credit ?? 0), 0),
    )
  const paidParties = [...new Set(paidLines.map(paidPartyOf))]
  const paidPartyRows: MatrixRow[] = paidParties
    .map((p) => {
      const perMonth = months.map((ym) => paidSumIn(p, ym))
      return { p, values: [r2(perMonth.reduce((s, v) => s + v, 0)), ...perMonth] }
    })
    .filter((r) => r.values[0] > 0.005)
    .sort((a, b) => b.values[0] - a.values[0])
    .map((r) => ({
      key: `PAID_P_${r.p}`,
      label: r.p,
      depth: 1,
      kind: 'account' as const,
      values: r.values.map((v) => -v),
    }))
  const paidTotalByCol = [0, ...months.map(() => 0)].map((_, i) =>
    r2(paidPartyRows.reduce((s, row) => s + row.values[i], 0)),
  )

  const nCols = data.columns.length
  const rows: MatrixRow[] = [
    ...buildSideMatrixRows(data.inflow, inSaved as ReportLayout | null, nCols, 'in', '流入合计 · Total money in', data.inflowTotalByCol),
    ...buildSideMatrixRows(data.outflow, outSaved as ReportLayout | null, nCols, 'out', '流出合计 · Total money out', data.outflowTotalByCol),
    { key: 'NET_CHANGE', label: 'Net change in cash', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: data.netChangeByCol },
    { key: 'OPENING_CASH', label: 'Opening cash', depth: 0, kind: 'subtotal', tone: 'ledger', values: data.openingByCol },
    { key: 'CLOSING_CASH', label: 'Closing cash', depth: 0, kind: 'subtotal', tone: 'ledger', emphasis: 'strong', values: data.closingByCol },
    // 支出对象 — who the money went to, one row per payee (internal transfers
    // labelled as such). Negative = money out, matching the outflow section.
    { key: 'PAID_TO', label: '支出对象 · Paid to (钱花给了谁)', depth: 0, kind: 'subtotal', tone: 'auto', emphasis: 'strong', values: paidTotalByCol },
    ...paidPartyRows,
    { key: 'AR_BILLED', label: '开单 · Billed (应收 ↑)', depth: 0, kind: 'subtotal', tone: 'ledger', values: billedByCol },
    { key: 'AR_COLLECTED', label: '收回/CN · Collected (应收 ↓)', depth: 0, kind: 'subtotal', tone: 'auto', values: collectedByCol.map((v) => -v) },
    { key: 'AR_OUTSTANDING', label: '月末未收 · Outstanding (AR balance)', depth: 0, kind: 'subtotal', tone: 'danger', emphasis: 'strong', values: outstandingByCol },
    // Who owes it — one row per debtor, running balance at each month-end.
    ...partyRows,
    // 未收也是部门的钱: cash on hand + still-to-collect = the dept's position.
    {
      key: 'TOTAL_POSITION',
      label: '部门总资金 · Cash + 未收 (Total position)',
      depth: 0,
      kind: 'subtotal',
      tone: 'ledger',
      emphasis: 'strong',
      values: data.closingByCol.map((c, i) => r2(c + (outstandingByCol[i] ?? 0))),
    },
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
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        跟 Monthly Cash Flow 同一个格子:Accumulated + 每个月一栏。多出最下面三行:
        每月<em>开单</em>、每月<em>收回/CN</em>,和 <em>月末未收</em> — 应收账款 (3030)
        在每个月底的累计余额,开单加上去、收款和 credit note 减下来,和总账完全对得上。
      </p>

      <ReportSearchProvider>
        <div className="flex gap-8 items-start">
          <MonthlyReportControls period={period} segment={segment} hideSegment={isDeptMgr} />
          <div className="min-w-0 flex-1">
            <MonthlyMatrix columns={data.columns} rows={rows} />
          </div>
        </div>
      </ReportSearchProvider>
    </div>
  )
}
