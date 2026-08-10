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
}: {
  statementLines: ReviewStatementLine[]
  unmatchedBook: ReviewBookLine[]
  bookInfo: Record<string, ReviewBookLine>
}) {
  const router = useRouter()
  const [selS, setSelS] = useState<string | null>(null)
  const [selB, setSelB] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const matched = statementLines.filter(l => l.matchedJournalLineId)
  const ignored = statementLines.filter(l => !l.matchedJournalLineId && l.matchKind === 'ignored')
  const openS = statementLines.filter(l => !l.matchedJournalLineId && l.matchKind !== 'ignored')

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

      {/* ── Manual pairing ── */}
      {openS.length > 0 || unmatchedBook.length > 0 ? (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-3">
            <h2 className="font-serif text-xl text-ink">Unmatched — pick one from each side</h2>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-alert/40 rounded-md bg-alert/[0.04] p-3">
              <div className="font-mono text-xs uppercase tracking-wider text-alert mb-2">
                Bank statement ({openS.length})
              </div>
              <div className="space-y-1 max-h-[420px] overflow-y-auto">
                {openS.map(l => (
                  <div
                    key={l.id}
                    onClick={() => setSelS(prev => (prev === l.id ? null : l.id))}
                    className={`flex items-baseline justify-between gap-3 px-2 py-1.5 rounded cursor-pointer text-sm ${
                      selS === l.id ? 'bg-accent/15 border border-accent/50' : 'hover:bg-surface-2/60 border border-transparent'
                    }`}
                  >
                    <span className="font-mono text-[11px] text-graphite shrink-0">
                      {dayjs(l.date).format('D MMM')}
                    </span>
                    <span className="font-serif text-ink flex-1 truncate" title={l.description}>
                      {l.description || '—'}
                    </span>
                    <span className="font-mono tabular text-[13px] shrink-0">{money(l.amount)}</span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={e => {
                        e.stopPropagation()
                        run(() => setLineIgnored(l.id, true))
                      }}
                      className="font-serif italic text-xs text-muted hover:text-ink shrink-0"
                      title="Ignore (e.g. bank fee you will book separately)"
                    >
                      ignore
                    </button>
                  </div>
                ))}
                {openS.length === 0 ? (
                  <p className="font-serif italic text-ledger text-sm px-2 py-2">All statement lines settled ✓</p>
                ) : null}
              </div>
            </div>
            <div className="border border-info/40 rounded-md bg-info/[0.04] p-3">
              <div className="font-mono text-xs uppercase tracking-wider text-info mb-2">
                Book (GL) not on statement ({unmatchedBook.length})
              </div>
              <div className="space-y-1 max-h-[420px] overflow-y-auto">
                {unmatchedBook.map(l => (
                  <div
                    key={l.id}
                    onClick={() => setSelB(prev => (prev === l.id ? null : l.id))}
                    className={`flex items-baseline justify-between gap-3 px-2 py-1.5 rounded cursor-pointer text-sm ${
                      selB === l.id ? 'bg-accent/15 border border-accent/50' : 'hover:bg-surface-2/60 border border-transparent'
                    }`}
                  >
                    <span className="font-mono text-[11px] text-graphite shrink-0">
                      {dayjs(l.date).format('D MMM')}
                    </span>
                    <span className="font-mono text-[10px] text-muted shrink-0">{l.entryNo}</span>
                    <span className="font-serif text-ink flex-1 truncate" title={l.description}>
                      {l.description || '—'}
                    </span>
                    <span className="font-mono tabular text-[13px] shrink-0">{money(l.amount)}</span>
                  </div>
                ))}
                {unmatchedBook.length === 0 ? (
                  <p className="font-serif italic text-ledger text-sm px-2 py-2">Every book line is on the statement ✓</p>
                ) : null}
              </div>
            </div>
          </div>
          <p className="font-serif italic text-muted text-xs mt-2">
            Statement-only lines = money moved that the books miss (record it, then re-open here).
            Book-only lines = uncleared / in-transit items.
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
