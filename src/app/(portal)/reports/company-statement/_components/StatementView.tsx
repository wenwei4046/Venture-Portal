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

function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null
  return (
    <span
      className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
      title={`资金来源: ${source}`}
    >
      SC {source}
    </span>
  )
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(3)}%/mo`
}

function kindLabel(item: PositionRow): string {
  if (item.kind === 'compound') return '利滚利'
  if (item.kind === 'no_term') return '无固定期'
  return `${item.tenureMonths}期`
}

function finishCell(item: PositionRow) {
  if (item.kind === 'no_term') {
    return (
      <span className="font-mono text-xs text-muted">
        未定 · ~RM {formatMoneyBare(item.monthlyInterest)}/月息
      </span>
    )
  }
  if (item.kind === 'compound') {
    return <span className="font-mono text-xs text-muted">未定 · 利息逐月滚入</span>
  }
  return (
    <span className="font-mono text-xs text-ink">
      剩 {item.remainingPeriods} 期{item.finishYM ? ` · ${item.finishYM} 还完` : ''}
    </span>
  )
}

function DetailTable({ items }: { items: PositionRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-muted font-sans border-b border-hairline">
          <th className="text-left py-1.5 px-3 font-medium">Position</th>
          <th className="text-right py-1.5 px-3 font-medium">原额</th>
          <th className="text-right py-1.5 px-3 font-medium">已还本金</th>
          <th className="text-right py-1.5 px-3 font-medium">未还本金</th>
          <th className="text-right py-1.5 px-3 font-medium">利息</th>
          <th className="text-right py-1.5 px-3 font-medium">几时还完</th>
          <th className="py-1.5 px-3" />
        </tr>
      </thead>
      <tbody>
        {items.map(item => (
          <tr key={item.id} className="border-b border-hairline/60 last:border-0">
            <td className="py-1.5 px-3">
              <span
                className={
                  'font-mono text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 mr-2 ' +
                  (item.side === 'collect'
                    ? 'text-ledger border border-ledger/40'
                    : 'text-alert border border-alert/40')
                }
              >
                {item.side === 'collect' ? '要收' : '要还'}
              </span>
              <span className="font-serif text-ink">
                {pct(item.monthlyRate)} · {kindLabel(item)}
                {item.startYM ? ` · ${item.startYM} 起` : ''}
              </span>
              <SourceBadge source={item.source} />
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular text-graphite">
              {formatMoneyBare(item.principal)}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular text-muted">
              {formatMoneyBare(item.principalPaid)}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular text-ink">
              {formatMoneyBare(item.principalOutstanding)}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular text-graphite">
              {item.kind === 'no_term' ? (
                <span className="text-muted">—</span>
              ) : (
                formatMoneyBare(item.interestOutstanding)
              )}
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
        ))}
      </tbody>
    </table>
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

  if (rows.length === 0) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-8 text-center">
        <p className="font-serif italic text-ledger text-base">两清 — 没有未结的往来。</p>
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
          <div className="font-serif italic text-ledger text-sm mb-1">我还要收</div>
          <div className="font-serif text-2xl text-num-ink tabular">
            RM {formatMoneyBare(totals.collectPrincipal + totals.collectInterest)}
          </div>
          <div className="font-mono text-[11px] text-graphite mt-1.5">
            本金 {formatMoneyBare(totals.collectPrincipal)} · 利息 {formatMoneyBare(totals.collectInterest)}
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-alert text-sm mb-1">我还要还</div>
          <div className="font-serif text-2xl text-num-ink tabular">
            RM {formatMoneyBare(totals.repayPrincipal + totals.repayInterest)}
          </div>
          <div className="font-mono text-[11px] text-graphite mt-1.5">
            本金 {formatMoneyBare(totals.repayPrincipal)} · 利息 {formatMoneyBare(totals.repayInterest)}
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-graphite text-sm mb-1">净额</div>
          <div
            className={`font-serif text-2xl tabular ${totals.net >= 0 ? 'text-ledger' : 'text-danger'}`}
          >
            {totals.net >= 0 ? '收 ' : '还 '}RM {formatMoneyBare(Math.abs(totals.net))}
          </div>
          <div className="font-mono text-[11px] text-graphite mt-1.5">
            {rows.length} 个往来对象
          </div>
        </div>
      </div>

      {/* ── Search + expand-all ── */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="搜索对象…"
          className="bg-paper border border-hairline rounded-md px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border w-56"
        />
        <button
          type="button"
          onClick={() =>
            setOpen(allOpen ? {} : Object.fromEntries(shown.map(g => [g.counterparty, true])))
          }
          className="text-xs font-sans text-graphite hover:text-ink border border-hairline rounded-md px-3 py-1.5 bg-surface hover:bg-surface-2 transition-colors"
        >
          {allOpen ? '收起全部' : '展开全部'}
        </button>
        {needle ? (
          <span className="font-mono text-xs text-muted">
            {shown.length} / {rows.length} 家
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
      <table className="ledger-table">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted font-sans">
            <th className="text-left py-2 px-3 font-medium" rowSpan={2}>
              对象
            </th>
            <th className="text-center py-1 px-3 font-medium border-b border-hairline" colSpan={2}>
              我还要收
            </th>
            <th className="text-center py-1 px-3 font-medium border-b border-hairline" colSpan={2}>
              我还要还
            </th>
            <th className="text-right py-2 px-3 font-medium" rowSpan={2}>
              净额
            </th>
          </tr>
          <tr className="text-[11px] uppercase tracking-wide text-muted font-sans border-b border-hairline">
            <th className="text-right py-1 px-3 font-medium">本金</th>
            <th className="text-right py-1 px-3 font-medium">利息</th>
            <th className="text-right py-1 px-3 font-medium">本金</th>
            <th className="text-right py-1 px-3 font-medium">利息</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-6 px-3 text-center font-serif italic text-muted">
                没有对象匹配「{q.trim()}」
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
                    <span className="font-mono text-[10px] text-muted mr-2">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className="font-serif text-ink">{g.counterparty}</span>
                    <span className="font-mono text-[10px] text-muted ml-2">
                      {g.items.length} 笔
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular">{num(g.collectPrincipal)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{num(g.collectInterest)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{num(g.repayPrincipal)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular">{num(g.repayInterest)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular font-semibold">
                    <span className={g.net >= 0 ? 'text-ledger' : 'text-danger'}>
                      {g.net >= 0 ? '收 ' : '还 '}
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
              Total{needle ? '（筛选后）' : ''}
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
                {shownTotals.net >= 0 ? '收 ' : '还 '}
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
