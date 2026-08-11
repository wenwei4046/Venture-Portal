'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import { manualMatch, setLineIgnored, unmatchLine } from '../../actions'

export interface ReviewStatementLine {
  id: string
  date: string
  description: string
  amount: number
  matchedJournalLineId: string | null
  matchKind: string | null
}

export interface ReviewBookLine {
  id: string
  date: string
  entryNo: string
  description: string
  amount: number
}

const money = (n: number) => (
  <span className={n < 0 ? 'text-danger' : 'text-ledger'}>
    {n < 0 ? '−' : '+'}
    {formatMoneyBare(Math.abs(n))}
  </span>
)

export default function ReconReview({
  statementLines,
  unmatchedBook,
  bookInfo,
  statementOpening = null,
  statementClosing = null,
}: {
  statementLines: ReviewStatementLine[]
  unmatchedBook: ReviewBookLine[]
  bookInfo: Record<string, ReviewBookLine>
  statementOpening?: number | null
  statementClosing?: number | null
}) {
  const router = useRouter()
  const [selS, setSelS] = useState<string | null>(null)
  const [selB, setSelB] = useState<string | null>(null)
  const [qS, setQS] = useState('')
  const [qB, setQB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const matched = statementLines.filter(l => l.matchedJournalLineId)
  const ignored = statementLines.filter(l => !l.matchedJournalLineId && l.matchKind === 'ignored')
  const openS = statementLines.filter(l => !l.matchedJournalLineId && l.matchKind !== 'ignored')

  const needleS = qS.trim().toLowerCase()
  const needleB = qB.trim().toLowerCase()
  const filteredS = needleS
    ? openS.filter(l => `${l.description} ${l.amount} ${l.date}`.toLowerCase().includes(needleS))
    : openS
  const filteredB = needleB
    ? unmatchedBook.filter(l =>
        `${l.description} ${l.entryNo} ${l.amount} ${l.date}`.toLowerCase().includes(needleB),
      )
    : unmatchedBook

  const sSel = openS.find(l => l.id === selS) ?? null
  const bSel = unmatchedBook.find(l => l.id === selB) ?? null
  const amountsEqual = !!sSel && !!bSel && Math.abs(sSel.amount - bSel.amount) <= 0.005

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r.error) setError(r.error)
      else {
        setSelS(null)
        setSelB(null)
        router.refresh()
      }
    })
  }

  const totalIn = statementLines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0)
  const totalOut = statementLines.filter(l => l.amount < 0).reduce((s, l) => s + l.amount, 0)

  return (
    <div>
      {/* ── Summary ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="border border-hairline rounded-md bg-surface p-4">
          <div className="font-serif italic text-graphite text-sm mb-1">Statement in / out</div>
          <div className="font-mono tabular text-sm">
            {money(Math.round(totalIn * 100) / 100)} · {money(Math.round(totalOut * 100) / 100)}
          </div>
          {statementOpening != null && statementClosing != null ? (
            <div className="font-mono text-[11px] text-muted mt-1">
              {formatMoneyBare(statementOpening)} → {formatMoneyBare(statementClosing)}
            </div>
          ) : null}
        </div>
        <div className="border border-hairline rounded-md bg-surface p-4">
          <div className="font-serif italic text-graphite text-sm mb-1">Matched</div>
          <div className="font-serif text-xl text-num-ink tabular">
            {matched.length} / {statementLines.length}
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-4">
          <div className="font-serif italic text-alert text-sm mb-1">Statement unmatched</div>
          <div className="font-serif text-xl text-num-ink tabular">{openS.length}</div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-4">
          <div className="font-serif italic text-alert text-sm mb-1">Book unmatched</div>
          <div className="font-serif text-xl text-num-ink tabular">{unmatchedBook.length}</div>
        </div>
      </div>

      {error ? <p className="text-sm font-sans text-danger mb-4">{error}</p> : null}

      {/* ── Manual pairing — full-width tidy tables (user 2026-08-08) ── */}
      {openS.length > 0 || unmatchedBook.length > 0 ? (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3 sticky top-0 z-10 bg-paper py-2">
            <h2 className="font-serif text-xl text-ink">Unmatched — pick one from each table</h2>
            <div className="flex items-center gap-3">
              {sSel ? (
                <span className="font-mono text-xs text-graphite">
                  Statement: {formatMoneyBare(sSel.amount)}
                </span>
              ) : null}
              {bSel ? (
                <span className="font-mono text-xs text-graphite">Book: {formatMoneyBare(bSel.amount)}</span>
              ) : null}
              <button
                type="button"
                disabled={!amountsEqual || isPending}
                onClick={() => sSel && bSel && run(() => manualMatch(sSel.id, bSel.id))}
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-40"
                title={
                  sSel && bSel && !amountsEqual
                    ? 'Amounts differ — only equal amounts can match'
                    : 'Match the selected pair'
                }
              >
                {isPending ? 'Working…' : 'Match selected pair →'}
              </button>
            </div>
          </div>

          {/* Statement side */}
          <div className="mb-6 border border-alert/40 rounded-md overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-alert/[0.06]">
              <span className="font-mono text-xs uppercase tracking-wider text-alert">
                Bank statement — not in the books ({openS.length})
              </span>
              <input
                type="text"
                value={qS}
                onChange={e => setQS(e.target.value)}
                placeholder="Filter…"
                className="bg-paper border border-hairline rounded px-2 py-1 text-xs text-ink w-48 focus:outline-none focus:border-accent-border"
              />
            </div>
            <div className="max-h-[440px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2">
                  <tr className="text-[11px] uppercase tracking-wide text-muted font-sans border-b border-hairline">
                    <th className="text-left py-1.5 px-3 font-medium w-20">Date</th>
                    <th className="text-left py-1.5 px-3 font-medium">Description</th>
                    <th className="text-right py-1.5 px-3 font-medium w-28">In (RM)</th>
                    <th className="text-right py-1.5 px-3 font-medium w-28">Out (RM)</th>
                    <th className="py-1.5 px-3 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {filteredS.map(l => (
                    <tr
                      key={l.id}
                      onClick={() => setSelS(prev => (prev === l.id ? null : l.id))}
                      className={`border-b border-hairline/60 cursor-pointer ${
                        selS === l.id ? 'bg-accent/15' : 'hover:bg-surface-2/50'
                      }`}
                    >
                      <td className="py-1.5 px-3 font-mono text-[11px] text-graphite whitespace-nowrap">
                        {dayjs(l.date).format('D MMM')}
                      </td>
                      <td className="py-1.5 px-3 font-serif text-[13.5px] text-ink">{l.description || '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono tabular text-ledger">
                        {l.amount > 0 ? formatMoneyBare(l.amount) : ''}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular text-danger">
                        {l.amount < 0 ? formatMoneyBare(-l.amount) : ''}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={e => {
                            e.stopPropagation()
                            run(() => setLineIgnored(l.id, true))
                          }}
                          className="font-serif italic text-xs text-muted hover:text-ink"
                          title="Ignore (e.g. bank fee you will book separately)"
                        >
                          ignore
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredS.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 px-3 text-center font-serif italic text-muted">
                        {openS.length === 0 ? 'All statement lines settled ✓' : 'No rows match the filter'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* Book side */}
          <div className="border border-info/40 rounded-md overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-info/[0.06]">
              <span className="font-mono text-xs uppercase tracking-wider text-info">
                Book (GL) — not on statement ({unmatchedBook.length})
              </span>
              <input
                type="text"
                value={qB}
                onChange={e => setQB(e.target.value)}
                placeholder="Filter…"
                className="bg-paper border border-hairline rounded px-2 py-1 text-xs text-ink w-48 focus:outline-none focus:border-accent-border"
              />
            </div>
            <div className="max-h-[440px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2">
                  <tr className="text-[11px] uppercase tracking-wide text-muted font-sans border-b border-hairline">
                    <th className="text-left py-1.5 px-3 font-medium w-20">Date</th>
                    <th className="text-left py-1.5 px-3 font-medium w-36">Entry</th>
                    <th className="text-left py-1.5 px-3 font-medium">Description</th>
                    <th className="text-right py-1.5 px-3 font-medium w-28">In (RM)</th>
                    <th className="text-right py-1.5 px-3 font-medium w-28">Out (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredB.map(l => (
                    <tr
                      key={l.id}
                      onClick={() => setSelB(prev => (prev === l.id ? null : l.id))}
                      className={`border-b border-hairline/60 cursor-pointer ${
                        selB === l.id ? 'bg-accent/15' : 'hover:bg-surface-2/50'
                      }`}
                    >
                      <td className="py-1.5 px-3 font-mono text-[11px] text-graphite whitespace-nowrap">
                        {dayjs(l.date).format('D MMM')}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-[11px] text-muted whitespace-nowrap">{l.entryNo}</td>
                      <td className="py-1.5 px-3 font-serif text-[13.5px] text-ink">{l.description || '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono tabular text-ledger">
                        {l.amount > 0 ? formatMoneyBare(l.amount) : ''}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular text-danger">
                        {l.amount < 0 ? formatMoneyBare(-l.amount) : ''}
                      </td>
                    </tr>
                  ))}
                  {filteredB.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 px-3 text-center font-serif italic text-muted">
                        {unmatchedBook.length === 0 ? 'Every book line is on the statement ✓' : 'No rows match the filter'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <p className="font-serif italic text-muted text-xs mt-2">
            Statement-only = money moved that the books miss (record it, come back and match).
            Book-only = uncleared / in-transit items.
          </p>
        </section>
      ) : null}

      {/* ── Matched pairs ── */}
      <section className="mb-10">
        <h2 className="font-serif text-xl text-ink mb-2">Matched ({matched.length})</h2>
        {matched.length === 0 ? (
          <p className="font-serif italic text-muted text-sm">Nothing matched yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Statement</th>
                  <th className="num">Amount</th>
                  <th>Book entry</th>
                  <th>How</th>
                  <th className="right"></th>
                </tr>
              </thead>
              <tbody>
                {matched.map(l => {
                  const b = l.matchedJournalLineId ? bookInfo[l.matchedJournalLineId] : undefined
                  return (
                    <tr key={l.id}>
                      <td>
                        <span className="font-mono text-[11px] text-graphite mr-2">
                          {dayjs(l.date).format('D MMM')}
                        </span>
                        <span className="font-serif text-[14px] text-ink">{l.description || '—'}</span>
                      </td>
                      <td className="num">{money(l.amount)}</td>
                      <td>
                        {b ? (
                          <>
                            <span className="font-mono text-[11px] text-muted mr-2">{b.entryNo}</span>
                            <span className="font-serif text-[14px] text-graphite">{b.description}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <em className={`font-serif text-xs ${l.matchKind === 'auto' ? 'text-info' : 'text-graphite'}`}>
                          {l.matchKind}
                        </em>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => run(() => unmatchLine(l.id))}
                          className="font-serif italic text-xs text-muted hover:text-danger"
                        >
                          Unmatch
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Ignored ── */}
      {ignored.length > 0 ? (
        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-2">Ignored ({ignored.length})</h2>
          <div className="space-y-1 max-w-2xl">
            {ignored.map(l => (
              <div key={l.id} className="flex items-baseline justify-between gap-3 px-2 py-1.5 text-sm border-b border-hairline/60">
                <span className="font-mono text-[11px] text-graphite shrink-0">{dayjs(l.date).format('D MMM')}</span>
                <span className="font-serif text-muted flex-1 truncate">{l.description || '—'}</span>
                <span className="font-mono tabular text-[13px] text-muted shrink-0">{formatMoneyBare(l.amount)}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => setLineIgnored(l.id, false))}
                  className="font-serif italic text-xs text-muted hover:text-ink shrink-0"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
