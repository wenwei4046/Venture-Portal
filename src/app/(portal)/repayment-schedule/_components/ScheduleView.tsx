'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/utils'

export interface SchedRow {
  key: string
  counterparty: string
  detail: string
  principalDue: number
  interestDue: number
  totalDue: number
  /** This month's installment already collected/paid (principal repayment recorded this month). */
  done: boolean
  /** A repayment PV exists but is not yet approved (应付 only). */
  pending?: boolean
  /** Interest is computed with monthly compounding (利滚利). */
  compound?: boolean
}

export interface NoTermRow {
  key: string
  counterparty: string
  detail: string
  outstanding: number
  monthlyInterest: number
}

export interface CompoundRow {
  key: string
  counterparty: string
  detail: string
  /** Outstanding balance incl. capitalised interest (本金 + 已滚利息). */
  balance: number
  /** Interest rolled into the balance so far (累计已滚利息). */
  accrued: number
  /** Interest the balance accrues this month (本月利息). */
  thisMonthInterest: number
}

export interface CompoundTotals {
  balance: number
  accrued: number
  thisMonthInterest: number
}

type Mode = 'all' | 'outstanding'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export default function ScheduleView({
  collectRows,
  collectNoTerm,
  collectNoTermOutstanding,
  collectNoTermInterest,
  collectCompound,
  collectCompoundTotals,
  repayRows,
  repayNoTerm,
  repayNoTermOutstanding,
  repayNoTermInterest,
  repayCompound,
  repayCompoundTotals,
}: {
  collectRows: SchedRow[]
  collectNoTerm: NoTermRow[]
  collectNoTermOutstanding: number
  collectNoTermInterest: number
  collectCompound: CompoundRow[]
  collectCompoundTotals: CompoundTotals
  repayRows: SchedRow[]
  repayNoTerm: NoTermRow[]
  repayNoTermOutstanding: number
  repayNoTermInterest: number
  repayCompound: CompoundRow[]
  repayCompoundTotals: CompoundTotals
}) {
  const [mode, setMode] = useState<Mode>('all')

  const visible = (rows: SchedRow[]) => (mode === 'all' ? rows : rows.filter((r) => !r.done))
  const sum = (rows: SchedRow[]) => rows.reduce((s, r) => r2(s + r.totalDue), 0)

  const collectVisible = visible(collectRows)
  const repayVisible = visible(repayRows)
  const collectTot = sum(collectVisible)
  const repayTot = sum(repayVisible)
  const net = r2(collectTot - repayTot)

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center gap-2 mb-8">
        <span className="font-mono text-xs text-muted mr-1">视图:</span>
        <button
          type="button"
          onClick={() => setMode('all')}
          className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${mode === 'all' ? 'bg-accent text-white border-accent' : 'bg-surface text-graphite border-hairline hover:text-ink'}`}
        >
          全额计划(含已收/已付)
        </button>
        <button
          type="button"
          onClick={() => setMode('outstanding')}
          className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${mode === 'outstanding' ? 'bg-accent text-white border-accent' : 'bg-surface text-graphite border-hairline hover:text-ink'}`}
        >
          只看未收/未还(已 approve 的消失)
        </button>
      </div>

      {/* Hero totals (reflect the active view) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10 max-w-3xl">
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">本月应收 · To collect</div>
          <div className="font-serif text-3xl text-num-ink tabular tracking-[-0.01em] text-ledger">{formatMoney(collectTot)}</div>
        </div>
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">本月应付 · To repay</div>
          <div className="font-serif text-3xl text-num-ink tabular tracking-[-0.01em]"><span className="neg">{formatMoney(-repayTot)}</span></div>
        </div>
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">净额 · Net</div>
          <div className={`font-serif text-3xl tabular tracking-[-0.01em] ${net >= 0 ? 'text-ledger' : 'text-danger'}`}>
            {net < 0 ? <span className="neg">{formatMoney(net)}</span> : formatMoney(net)}
          </div>
        </div>
      </div>

      <ScheduleSection title="应收 · To collect — 按期 (scheduled loans)" rows={collectVisible} tone="credit" />
      <CompoundSection
        title="应收 · 利滚利挂账 (本金未定还款 · 利息逐月滚入)"
        note="这些贷款本金暂不收回 —— 每月利息滚进余额、越滚越多,不计入上方本月应收现金。「累计已滚利息」= 到目前为止滚进去的利息总额。"
        rows={collectCompound}
        totals={collectCompoundTotals}
        tone="credit"
      />
      <NoTermSection
        title="应收 · 无固定期限 (未定 — undecided plan)"
        note="还款利息/期数/方式未定的贷款 —— 不计入本月应收。列出尚欠本金与每月利息。"
        rows={collectNoTerm}
        outstanding={collectNoTermOutstanding}
        interest={collectNoTermInterest}
      />

      <ScheduleSection title="应付 · To repay — 按期 (scheduled fund sources)" rows={repayVisible} tone="debit" />
      <CompoundSection
        title="应付 · 利滚利挂账 (本金未定还款 · 利息逐月滚入)"
        note="这些资金来源本金暂不偿还 —— 每月利息滚进余额,不计入上方本月应付现金。"
        rows={repayCompound}
        totals={repayCompoundTotals}
        tone="debit"
      />
      <NoTermSection
        title="应付 · 无固定期限 (on-demand / at maturity)"
        note="没有约定还款期数、也没有待审批 PV 的资金来源 —— 不计入本月应付。要分期请到 Fund In 编辑该笔、填还款期数。"
        rows={repayNoTerm}
        outstanding={repayNoTermOutstanding}
        interest={repayNoTermInterest}
      />
    </div>
  )
}

function ScheduleSection({ title, rows, tone }: { title: string; rows: SchedRow[]; tone: 'credit' | 'debit' }) {
  const principal = rows.reduce((s, r) => r2(s + r.principalDue), 0)
  const interest = rows.reduce((s, r) => r2(s + r.interestDue), 0)
  const total = rows.reduce((s, r) => r2(s + r.totalDue), 0)
  return (
    <section className="mb-12 max-w-4xl">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${tone === 'credit' ? 'text-ledger' : 'text-danger'}`}>{formatMoney(total)}</span>
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
                  <div className="font-serif text-md text-ink">
                    {r.counterparty}
                    {r.compound ? <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5">利滚利</span> : null}
                    {r.done ? <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-ledger border border-hairline rounded px-1.5 py-0.5">本月已收/付</span> : null}
                    {r.pending ? <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-alert border border-hairline rounded px-1.5 py-0.5">待审批 PV</span> : null}
                  </div>
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
              <td className="num font-semibold">{formatMoney(principal)}</td>
              <td className="num font-semibold">{formatMoney(interest)}</td>
              <td className={`num font-semibold ${tone === 'credit' ? 'text-ledger' : 'text-danger'}`}>{formatMoney(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}

function CompoundSection({
  title,
  note,
  rows,
  totals,
  tone,
}: {
  title: string
  note: string
  rows: CompoundRow[]
  totals: CompoundTotals
  tone: 'credit' | 'debit'
}) {
  if (rows.length === 0) return null
  return (
    <section className="mb-12 max-w-4xl">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className="count text-info">{formatMoney(totals.balance)}</span>
      </div>
      <p className="font-serif italic text-muted text-xs mb-3">{note}</p>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>对方 · Counterparty</th>
            <th className="num">当前余额 · Balance</th>
            <th className="num">累计已滚利息 · Rolled interest</th>
            <th className="num">本月利息 · This month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <div className="font-serif text-md text-ink">
                  {r.counterparty}
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5">利滚利</span>
                </div>
                <div className="font-mono text-xs text-muted">{r.detail}</div>
              </td>
              <td className="num font-medium">{formatMoney(r.balance)}</td>
              <td className="num text-info">{formatMoney(r.accrued)}</td>
              <td className="num">{formatMoney(r.thisMonthInterest)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-hairline">
            <td className="font-serif italic text-ink font-medium">小计 · Subtotal</td>
            <td className={`num font-semibold ${tone === 'credit' ? 'text-ledger' : 'text-danger'}`}>{formatMoney(totals.balance)}</td>
            <td className="num font-semibold text-info">{formatMoney(totals.accrued)}</td>
            <td className="num font-semibold">{formatMoney(totals.thisMonthInterest)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
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
  rows: NoTermRow[]
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
