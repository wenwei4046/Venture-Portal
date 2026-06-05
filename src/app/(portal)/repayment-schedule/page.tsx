import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { loanMonthlyInstallment, sumSchedule } from '@/lib/treasury-schedule'
import { listPayableFundSources } from '../fund-in/actions'

export const dynamic = 'force-dynamic'

interface Row {
  key: string
  counterparty: string
  detail: string
  principalDue: number
  interestDue: number
  totalDue: number
}

export default async function RepaymentSchedulePage() {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  // ── 应收 (To collect): active loans HV lent out ──
  const [{ data: loans }, { data: loanOut }, { data: companies }] = await Promise.all([
    supabase
      .from('loans')
      .select('id, company_id, principal, effective_rate, tenure_months, status')
      .eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, short_code, name'),
  ])
  const outById = new Map((loanOut ?? []).map((o) => [o.loan_id as string, o]))
  const coById = new Map((companies ?? []).map((c) => [c.id as string, c]))

  const collectRows: Row[] = []
  for (const l of loans ?? []) {
    const out = outById.get(l.id as string)
    const inst = loanMonthlyInstallment({
      principal: Number(l.principal),
      effectiveRate: Number(l.effective_rate),
      tenureMonths: Number(l.tenure_months),
      principalPaid: Number(out?.total_principal_paid ?? 0),
    })
    if (inst.remainingPeriods <= 0) continue // outside tenure — nothing due
    const co = l.company_id ? coById.get(l.company_id as string) : null
    collectRows.push({
      key: l.id as string,
      counterparty: co?.short_code ?? co?.name ?? '—',
      detail: `RM ${Number(l.principal).toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(Number(l.effective_rate) * 100).toFixed(3)}%/mo · ${l.tenure_months}mo · ${inst.remainingPeriods} left`,
      principalDue: inst.principalDue,
      interestDue: inst.interestDue,
      totalDue: inst.totalDue,
    })
  }
  collectRows.sort((a, b) => b.totalDue - a.totalDue)

  // ── 应付 (To repay): active fund sources HV received (reuse existing calc) ──
  const payable = await listPayableFundSources()
  const repayRows: Row[] = payable
    .filter((p) => p.remaining_periods > 0)
    .map((p) => ({
      key: p.id,
      counterparty: p.label.split(' · ')[0] ?? '—',
      detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · ${p.total_periods}mo · ${p.remaining_periods} left`,
      principalDue: p.monthly_principal,
      interestDue: p.monthly_interest,
      totalDue: p.monthly_payment,
    }))
    .sort((a, b) => b.totalDue - a.totalDue)

  const collectTot = sumSchedule(collectRows)
  const repayTot = sumSchedule(repayRows)
  const net = Math.round((collectTot.total - repayTot.total) * 100) / 100

  return (
    <div>
      <div className="flex items-center gap-4 mb-2">
        <Link href="/fund-in" className="text-sm text-muted hover:text-accent font-sans transition-colors">← Fund In</Link>
        <Link href="/fund-out" className="text-sm text-muted hover:text-accent font-sans transition-colors">← Fund Out</Link>
      </div>

      <div className="page-head">
        <div>
          <div className="page-eyebrow"><em>I.</em> TREASURY · 本月还款排程 · MONTHLY SCHEDULE</div>
          <h1 className="page-title">本月应收 / 应付</h1>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        本月每笔 active 贷款的应收、每笔 active 资金来源的应付(固定摊还:本金 = 原额 ÷ 期数,利息 = 原额 × 月利率)。
        已结束(超过期数)的不列。
      </p>

      {/* Hero totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10 max-w-3xl">
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">本月应收 · To collect</div>
          <div className="font-serif text-3xl text-num-ink tabular tracking-[-0.01em] text-ledger">{formatMoney(collectTot.total)}</div>
        </div>
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">本月应付 · To repay</div>
          <div className="font-serif text-3xl text-num-ink tabular tracking-[-0.01em]"><span className="neg">{formatMoney(-repayTot.total)}</span></div>
        </div>
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">净额 · Net</div>
          <div className={`font-serif text-3xl tabular tracking-[-0.01em] ${net >= 0 ? 'text-ledger' : 'text-danger'}`}>
            {net < 0 ? <span className="neg">{formatMoney(net)}</span> : formatMoney(net)}
          </div>
        </div>
      </div>

      <ScheduleSection title="应收 · To collect (loans lent out)" rows={collectRows} totals={collectTot} tone="credit" />
      <ScheduleSection title="应付 · To repay (fund sources)" rows={repayRows} totals={repayTot} tone="debit" />
    </div>
  )
}

function ScheduleSection({
  title,
  rows,
  totals,
  tone,
}: {
  title: string
  rows: Row[]
  totals: { principal: number; interest: number; total: number }
  tone: 'credit' | 'debit'
}) {
  return (
    <section className="mb-12 max-w-4xl">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${tone === 'credit' ? 'text-ledger' : 'text-danger'}`}>{formatMoney(totals.total)}</span>
      </div>

      {rows.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">本月没有。</p>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>对方 · Counterparty</th>
              <th className="num">本金 · Principal</th>
              <th className="num">利息 · Interest</th>
              <th className="num">合计 · Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <div className="font-serif text-md text-ink">{r.counterparty}</div>
                  <div className="font-mono text-xs text-muted">{r.detail}</div>
                </td>
                <td className="num">{formatMoney(r.principalDue)}</td>
                <td className="num">{formatMoney(r.interestDue)}</td>
                <td className="num font-medium">{formatMoney(r.totalDue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-hairline">
              <td className="font-serif italic text-ink font-medium">小计 · Subtotal</td>
              <td className="num font-semibold">{formatMoney(totals.principal)}</td>
              <td className="num font-semibold">{formatMoney(totals.interest)}</td>
              <td className={`num font-semibold ${tone === 'credit' ? 'text-ledger' : 'text-danger'}`}>{formatMoney(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}
