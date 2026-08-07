'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import type {
  CounterpartyRow,
  PositionRow,
  StatementTotals,
} from '@/lib/counterparty-statement'

function num(v: number, opts?: { danger?: boolean }) {
  if (!v) return <span className="num text-muted">—</span>
  return <span className={'num ' + (opts?.danger ? 'text-danger' : '')}>{formatMoneyBare(v)}</span>
}

// collect side: SC = the loan's 资金来源 remark (from repayment_terms).
// repay side: LENT TO = where the borrowed-in money was lent onward (the fund
// source's notes — user 2026-08-06). UI is English-only per user 2026-08-06
// ("整体显示英文，不要华语"), matching the exports.
function SourceBadge({ source, side }: { source?: string | null; side: 'collect' | 'repay' }) {
  if (!source) return null
  const label = side === 'collect' ? `SC ${source}` : `LENT TO ${source}`
  return (
    <span
      className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
      title={side === 'collect' ? `Source of capital: ${source}` : `Lent to: ${source}`}
    >
      {label}
    </span>
  )
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(3)}%/mo`
}

function kindLabel(item: PositionRow): string {
  if (item.kind === 'compound') return 'compounding'
  if (item.kind === 'no_term') return 'no fixed term'
  return `${item.tenureMonths}mo`
}

function finishCell(item: PositionRow) {
  if (item.kind === 'no_term') {
    return (
      <span className="font-mono text-xs text-muted">
        TBD · ~RM {formatMoneyBare(item.monthlyInterest)}/mo interest
      </span>
    )
  }
  if (item.kind === 'compound') {
    return <span className="font-mono text-xs text-muted">TBD · compounds monthly</span>
  }
  return (
    <span className="font-mono text-xs text-ink">
      {item.remainingPeriods} left{item.finishYM ? ` · by ${item.finishYM}` : ''}
    </span>
  )
}

// One side's positions with side-appropriate wording (已收/未收/几时收完 vs
// 已还/未还/几时还完 — user 2026-08-06: "展开只是会显示要还的…要收的看没有")
// and its own subtotal that ties back to the summary row.
function DetailSection({ items, side }: { items: PositionRow[]; side: 'collect' | 'repay' }) {
  // Column set per user 2026-08-06: original + whole-deal interest, a divider,
  // then what's still owed (principal / interest / total) and the payoff.
  // Total Interest only exists for fixed-term flat deals — compounding and
  // no-term positions are open-ended.
  const r2 = (n: number) => Math.round(n * 100) / 100
  const totalInterestOf = (i: PositionRow) =>
    i.kind === 'flat' && i.tenureMonths ? r2(i.tenureMonths * i.monthlyInterest) : null
  const oweTotalOf = (i: PositionRow) => r2(i.principalOutstanding + i.interestOutstanding)
  const sub = items.reduce(
    (acc, i) => ({
      principal: r2(acc.principal + i.principal),
      totalInterest: r2(acc.totalInterest + (totalInterestOf(i) ?? 0)),
      outstanding: r2(acc.outstanding + i.principalOutstanding),
      interest: r2(acc.interest + i.interestOutstanding),
      oweTotal: r2(acc.oweTotal + oweTotalOf(i)),
    }),
    { principal: 0, totalInterest: 0, outstanding: 0, interest: 0, oweTotal: 0 },
  )
  return (
    // 用格子围起来 + 底色分色 (user 2026-08-06): 要收绿底, 要还橙底 — 一眼分清.
    <div
      className={
        'rounded-md border p-3 ' +
        (side === 'collect' ? 'border-ledger/40 bg-ledger/[0.06]' : 'border-alert/40 bg-alert/[0.06]')
      }
    >
      <div
        className={
          'font-mono text-sm font-semibold uppercase tracking-wider inline-block rounded px-2.5 py-1 mb-2 border ' +
          (side === 'collect'
            ? 'text-ledger border-ledger/40 bg-ledger/10'
            : 'text-alert border-alert/40 bg-alert/10')
        }
      >
        {side === 'collect' ? 'TO COLLECT' : 'TO REPAY'} · {items.length}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted font-sans border-b border-hairline">
            <th className="text-left py-1.5 px-3 font-medium">Position</th>
            <th className="text-right py-1.5 px-3 font-medium">Original</th>
            <th className="text-right py-1.5 px-3 font-medium">Total Interest</th>
            <th className="text-right py-1.5 px-3 font-medium border-l border-hairline">
              Principal Due
            </th>
            <th className="text-right py-1.5 px-3 font-medium">Interest Due</th>
            <th className="text-right py-1.5 px-3 font-medium border-l border-hairline">
              Total Due
            </th>
            <th className="text-right py-1.5 px-3 font-medium">Payoff</th>
            <th className="py-1.5 px-3" />
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const totalInterest = totalInterestOf(item)
            return (
              <tr key={item.id} className="border-b border-hairline/60">
                <td className="py-1.5 px-3">
                  <span className="font-serif text-ink">
                    {pct(item.monthlyRate)} · {kindLabel(item)}
                    {item.startYM ? ` · starts ${item.startYM}` : ''}
                  </span>
                  <SourceBadge source={item.source} side={item.side} />
                </td>
                <td className="py-1.5 px-3 text-right font-mono tabular text-graphite">
                  {formatMoneyBare(item.principal)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono tabular text-graphite">
                  {totalInterest == null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    formatMoneyBare(totalInterest)
                  )}
                </td>
                <td className="py-1.5 px-3 text-right font-mono tabular text-ink border-l border-hairline">
                  {formatMoneyBare(item.principalOutstanding)}
                </td>
                <td className="py-1.5 px-3 text-right font-mono tabular text-graphite">
                  {item.kind === 'no_term' ? (
                    <span className="text-muted">—</span>
                  ) : (
                    formatMoneyBare(item.interestOutstanding)
                  )}
                </td>
                <td className="py-1.5 px-3 text-right font-mono tabular font-semibold text-ink border-l border-hairline">
                  {formatMoneyBare(oweTotalOf(item))}
                </td>
                <td className="py-1.5 px-3 text-right">{finishCell(item)}</td>
                <td className="py-1.5 px-3 text-right">
                  <Link
                    href={item.side === 'collect' ? `/fund-out/${item.id}` : `/fund-in/${item.id}`}
                    className="text-xs text-accent hover:text-accent-hover font-serif italic whitespace-nowrap"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            )
          })}
          <tr className="bg-surface/40">
            <td className="py-1.5 px-3 font-serif italic text-graphite">Subtotal</td>
            <td className="py-1.5 px-3 text-right font-mono tabular text-graphite">
              {formatMoneyBare(sub.principal)}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular text-graphite">
              {formatMoneyBare(sub.totalInterest)}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular font-semibold text-ink border-l border-hairline">
              {formatMoneyBare(sub.outstanding)}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular font-semibold text-ink">
              {formatMoneyBare(sub.interest)}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular font-semibold text-ink border-l border-hairline">
              {formatMoneyBare(sub.oweTotal)}
            </td>
            <td className="py-1.5 px-3" colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function DetailTable({ items }: { items: PositionRow[] }) {
  const collect = items.filter(i => i.side === 'collect')
  const repay = items.filter(i => i.side === 'repay')
  return (
    <div className="space-y-4 py-1">
      {collect.length > 0 ? <DetailSection items={collect} side="collect" /> : null}
      {repay.length > 0 ? <DetailSection items={repay} side="repay" /> : null}
    </div>
  )
}

export default function StatementView({
  rows,
  totals,
}: {
  rows: CounterpartyRow[]
  totals: StatementTotals
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  // Ticked counterparties → export only those (user 2026-08-06).
  const [sel, setSel] = useState<Set<string>>(new Set())

  if (rows.length === 0) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-8 text-center">
        <p className="font-serif italic text-ledger text-base">All square — nothing outstanding.</p>
      </div>
    )
  }

  const needle = q.trim().toLowerCase()
  const shown = needle
    ? rows.filter(g => g.counterparty.toLowerCase().includes(needle))
    : rows
  // Filtered view sums what's on screen so the footer always ties to the
  // rows above it; with no search this equals the server totals.
  const shownTotals: StatementTotals = needle
    ? shown.reduce(
        (acc, g) => ({
          collectPrincipal: acc.collectPrincipal + g.collectPrincipal,
          collectInterest: acc.collectInterest + g.collectInterest,
          repayPrincipal: acc.repayPrincipal + g.repayPrincipal,
          repayInterest: acc.repayInterest + g.repayInterest,
          net: acc.net + g.net,
        }),
        { collectPrincipal: 0, collectInterest: 0, repayPrincipal: 0, repayInterest: 0, net: 0 },
      )
    : totals
  const allOpen = shown.length > 0 && shown.every(g => open[g.counterparty])

  return (
    <div>
      {/* ── Summary tiles ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-ledger text-sm mb-1">To Collect</div>
          <div className="font-serif text-2xl text-num-ink tabular">
            RM {formatMoneyBare(totals.collectPrincipal + totals.collectInterest)}
          </div>
          <div className="font-mono text-[11px] text-graphite mt-1.5">
            Principal {formatMoneyBare(totals.collectPrincipal)} · Interest {formatMoneyBare(totals.collectInterest)}
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-alert text-sm mb-1">To Repay</div>
          <div className="font-serif text-2xl text-num-ink tabular">
            RM {formatMoneyBare(totals.repayPrincipal + totals.repayInterest)}
          </div>
          <div className="font-mono text-[11px] text-graphite mt-1.5">
            Principal {formatMoneyBare(totals.repayPrincipal)} · Interest {formatMoneyBare(totals.repayInterest)}
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-graphite text-sm mb-1">Net</div>
          <div
            className={`font-serif text-2xl tabular ${totals.net >= 0 ? 'text-ledger' : 'text-danger'}`}
          >
            {totals.net >= 0 ? 'Collect ' : 'Repay '}RM {formatMoneyBare(Math.abs(totals.net))}
          </div>
          <div className="font-mono text-[11px] text-graphite mt-1.5">
            {rows.length} counterparties
          </div>
        </div>
      </div>

      {/* ── Search + expand-all ── */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search counterparty…"
          className="bg-paper border border-hairline rounded-md px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border w-56"
        />
        <button
          type="button"
          onClick={() =>
            setOpen(allOpen ? {} : Object.fromEntries(shown.map(g => [g.counterparty, true])))
          }
          className="text-xs font-sans text-graphite hover:text-ink border border-hairline rounded-md px-3 py-1.5 bg-surface hover:bg-surface-2 transition-colors"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
        {needle ? (
          <span className="font-mono text-xs text-muted">
            {shown.length} / {rows.length} shown
          </span>
        ) : null}
        {sel.size > 0 ? (
          <span className="flex items-center gap-2 text-xs font-sans text-graphite border border-accent/40 bg-surface rounded-md px-3 py-1.5">
            {sel.size} selected · Export:
            <a
              href={`/reports/company-statement/export?format=xlsx&cp=${encodeURIComponent([...sel].join(','))}`}
              className="text-accent hover:text-accent-hover font-mono"
            >
              Excel
            </a>
            <a
              href={`/reports/company-statement/export?format=pdf&cp=${encodeURIComponent([...sel].join(','))}`}
              className="text-accent hover:text-accent-hover font-mono"
            >
              PDF
            </a>
            <button
              type="button"
              onClick={() => setSel(new Set())}
              className="text-muted hover:text-ink transition-colors"
            >
              Clear
            </button>
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
      <table className="ledger-table">
        {/* ledger-table's own `thead th` rule out-specifies Tailwind's
            text-* utilities — use its `right` class / inline centering. */}
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted font-sans">
            <th className="py-2 px-3 font-medium" rowSpan={2}>
              Counterparty
            </th>
            <th
              className="py-1 px-3 font-medium border-b border-hairline"
              style={{ textAlign: 'center' }}
              colSpan={2}
            >
              To Collect
            </th>
            <th
              className="py-1 px-3 font-medium border-b border-hairline"
              style={{ textAlign: 'center' }}
              colSpan={2}
            >
              To Repay
            </th>
            <th className="right py-2 px-3 font-medium" rowSpan={2}>
              Net
            </th>
          </tr>
          <tr className="text-[11px] uppercase tracking-wide text-muted font-sans border-b border-hairline">
            <th className="right py-1 px-3 font-medium">Principal</th>
            <th className="right py-1 px-3 font-medium">Interest</th>
            <th className="right py-1 px-3 font-medium">Principal</th>
            <th className="right py-1 px-3 font-medium">Interest</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 px-3 text-center font-serif italic text-muted">
                No counterparty matches &ldquo;{q.trim()}&rdquo;
              </td>
            </tr>
          ) : null}
          {shown.map(g => {
            const isOpen = !!open[g.counterparty]
            return (
              <Fragment key={g.counterparty}>
                <tr
                  onClick={() => setOpen(prev => ({ ...prev, [g.counterparty]: !isOpen }))}
                  className="border-b border-hairline cursor-pointer hover:bg-surface-2/40 transition-colors"
                >
                  <td className="py-2 px-3">
                    <span className="mr-2" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={sel.has(g.counterparty)}
                        onChange={() =>
                          setSel(prev => {
                            const next = new Set(prev)
                            if (next.has(g.counterparty)) next.delete(g.counterparty)
                            else next.add(g.counterparty)
                            return next
                          })
                        }
                        title="Tick to export only selected counterparties"
                        className="h-3.5 w-3.5 accent-[var(--accent)] align-middle"
                      />
                    </span>
                    <span className="font-mono text-[10px] text-muted mr-2">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="font-serif text-ink">{g.counterparty}</span>
                    <span className="font-mono text-[10px] text-muted ml-2">
                      {g.items.length} positions
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular">{num(g.collectPrincipal)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{num(g.collectInterest)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{num(g.repayPrincipal)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{num(g.repayInterest)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular font-semibold">
                    <span className={g.net >= 0 ? 'text-ledger' : 'text-danger'}>
                      {g.net >= 0 ? 'Collect ' : 'Repay '}
                      {formatMoneyBare(Math.abs(g.net))}
                    </span>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-hairline bg-paper/60">
                    <td colSpan={6} className="px-4 py-2">
                      <DetailTable items={g.items} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
          <tr className="bg-surface/40">
            <td className="py-2.5 px-3 font-serif italic text-accent">
              Total{needle ? ' (filtered)' : ''}
            </td>
            <td className="py-2.5 px-3 text-right font-mono tabular font-semibold text-ink">
              {formatMoneyBare(shownTotals.collectPrincipal)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono tabular font-semibold text-ink">
              {formatMoneyBare(shownTotals.collectInterest)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono tabular font-semibold text-ink">
              {formatMoneyBare(shownTotals.repayPrincipal)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono tabular font-semibold text-ink">
              {formatMoneyBare(shownTotals.repayInterest)}
            </td>
            <td className="py-2.5 px-3 text-right font-mono tabular font-semibold">
              <span className={shownTotals.net >= 0 ? 'text-ledger' : 'text-danger'}>
                {shownTotals.net >= 0 ? 'Collect ' : 'Repay '}
                {formatMoneyBare(Math.abs(shownTotals.net))}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  )
}
