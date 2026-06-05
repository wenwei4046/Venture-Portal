import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { loanMonthlyInstallment, sumSchedule, isLoanUnscheduled } from '@/lib/treasury-schedule'
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
      .select('id, company_id, principal, effective_rate, tenure_months, status, repayment_terms')
      .eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, short_code, name'),
  ])
  const outById = new Map((loanOut ?? []).map((o) => [o.loan_id as string, o]))
  const coById = new Map((companies ?? []).map((c) => [c.id as string, c]))

  const collectRows: Row[] = []
  const collectNoTermRows: Array<{ key: string; counterparty: string; detail: string; outstanding: number; monthlyInterest: number }> = []
  for (const l of loans ?? []) {
    const out = outById.get(l.id as string)
    const co = l.company_id ? coById.get(l.company_id as string) : null
    const counterparty = co?.short_code ?? co?.name ?? '—'
    // No confirmed plan (未定 / 无还款方式) → separate table, not a this-month installment.
    if (isLoanUnscheduled(l.repayment_terms as string | null)) {
      collectNoTermRows.push({
        key: l.id as string,
        counterparty,
        detail: `RM ${Number(l.principal).toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(Number(l.effective_rate) * 100).toFixed(3)}%/mo · 未定`,
        outstanding: Number(out?.outstanding ?? l.principal),
        monthlyInterest: Math.round(Number(l.principal) * Number(l.effective_rate) * 100) / 100,
      })
      continue
    }
    const inst = loanMonthlyInstallment({
      principal: Number(l.principal),
      effectiveRate: Number(l.effective_rate),
      tenureMonths: Number(l.tenure_months),
      principalPaid: Number(out?.total_principal_paid ?? 0),
    })
    if (inst.remainingPeriods <= 0) continue // outside tenure — nothing due
    collectRows.push({
      key: l.id as string,
      counterparty,
      detail: `RM ${Number(l.principal).toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(Number(l.effective_rate) * 100).toFixed(3)}%/mo · ${l.tenure_months}mo · ${inst.remainingPeriods} left`,
      principalDue: inst.principalDue,
      interestDue: inst.interestDue,
      totalDue: inst.totalDue,
    })
  }
  collectRows.sort((a, b) => b.totalDue - a.totalDue)
  collectNoTermRows.sort((a, b) => b.outstanding - a.outstanding)
  const collectNoTermOutstanding = Math.round(collectNoTermRows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100
  const collectNoTermInterest = Math.round(collectNoTermRows.reduce((s, r) => s + r.monthlyInterest, 0) * 100) / 100

  // ── 应付 (To repay): active fund sources HV received (reuse existing calc) ──
  // Split: sources WITH a fixed repayment term (lock_in_months set) show a
  // this-month installment; no-term (on-demand / at-maturity) sources go to a
  // separate table — they have no scheduled monthly principal.
  const payable = await listPayableFundSources()
  const repayRows: Row[] = payable
    .filter((p) => p.lock_in_months != null && p.remaining_periods > 0)
    .map((p) => ({
      key: p.id,
      counterparty: p.label.split(' · ')[0] ?? '—',
      detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · ${p.total_periods}mo · ${p.remaining_periods} left`,
      principalDue: p.monthly_principal,
      interestDue: p.monthly_interest,
      totalDue: p.monthly_payment,
    }))
    .sort((a, b) => b.totalDue - a.totalDue)

  // No fixed term — listed separately (outstanding + monthly interest carry cost)
  const noTermRows = payable
    .filter((p) => p.lock_in_months == null)
    .map((p) => ({
      key: p.id,
      counterparty: p.label.split(' · ')[0] ?? '—',
      detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · 无固定期限`,
      outstanding: p.outstanding,
      monthlyInterest: p.monthly_interest,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
  const noTermOutstanding = Math.round(noTermRows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100
  const noTermInterest = Math.round(noTermRows.reduce((s, r) => s + r.monthlyInterest, 0) * 100) / 100

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

      <ScheduleSection title="应收 · To collect — 按期 (scheduled loans)" rows={collectRows} totals={collectTot} tone="credit" />
      <NoTermSection
        title="应收 · 无固定期限 (未定 — undecided plan)"
        note="还款利息/期数/方式未定的贷款 —— 不计入本月应收。列出尚欠本金与每月利息。"
        rows={collectNoTermRows}
        outstanding={collectNoTermOutstanding}
        interest={collectNoTermInterest}
      />

      <ScheduleSection title="应付 · To repay — 按期 (scheduled fund sources)" rows={repayRows} totals={repayTot} tone="debit" />
      <NoTermSection
        title="应付 · 无固定期限 (on-demand / at maturity)"
        note="没有约定还款期数的资金来源 —— 不计入本月应付。列出尚欠本金与每月利息(持有成本)。要分期请到 Fund In 编辑该笔、填还款期数。"
        rows={noTermRows}
        outstanding={noTermOutstanding}
        interest={noTermInterest}
      />
    </div>
  )
}

function NoTermSection({
  title,
  note,
  rows,
  outstanding,
  interest,
}: {
  title: string
  note: string
  rows: Array<{ key: string; counterparty: string; detail: string; outstanding: number; monthlyInterest: number }>
  outstanding: number
  interest: number
}) {
  return (
    <section className="mb-12 max-w-4xl">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className="count">{formatMoney(outstanding)}</span>
      </div>
      <p className="font-serif italic text-muted text-xs mb-3">{note}</p>
      {rows.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">无。</p>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>对方 · Counterparty</th>
              <th className="num">尚欠本金 · Outstanding</th>
              <th className="num">月利息 · Monthly interest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <div className="font-serif text-md text-ink">{r.counterparty}</div>
                  <div className="font-mono text-xs text-muted">{r.detail}</div>
                </td>
                <td className="num">{formatMoney(r.outstanding)}</td>
                <td className="num">{formatMoney(r.monthlyInterest)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-hairline">
              <td className="font-serif italic text-ink font-medium">小计 · Subtotal</td>
              <td className="num font-semibold">{formatMoney(outstanding)}</td>
              <td className="num font-semibold">{formatMoney(interest)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
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
