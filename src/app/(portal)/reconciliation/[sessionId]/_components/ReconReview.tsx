'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import { contraBookLines, dissolveGroup, manualMatch, setLineIgnored, unmatchLine } from '../../actions'

export interface ReviewStatementLine {
  id: string
  date: string
  description: string
  amount: number
  matchKind: string | null
}

/** N statement lines ↔ M journal lines, totals equal. */
export interface ReviewMatchGroup {
  id: string
  statementLineIds: string[]
  journalLineIds: string[]
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
  sessionId,
  periodMonth,
  statementLines,
  groups,
  contraGroups,
  unmatchedBook,
  bookInfo,
  statementOpening = null,
  statementClosing = null,
  glClosing = null,
}: {
  sessionId: string
  /** First day of the statement month (YYYY-MM-DD). */
  periodMonth: string
  statementLines: ReviewStatementLine[]
  groups: ReviewMatchGroup[]
  /** Book-only Dr/Cr sets that never hit the bank (Σ = 0). */
  contraGroups: Array<{ id: string; journalLineIds: string[] }>
  unmatchedBook: ReviewBookLine[]
  bookInfo: Record<string, ReviewBookLine>
  statementOpening?: number | null
  statementClosing?: number | null
  /** GL balance on the bank's account code at the statement month-end. */
  glClosing?: number | null
}) {
  const router = useRouter()
  // BOTH sides multi-select — N statement lines ↔ M book lines with equal
  // totals (user 2026-08-08: 一对多 and 两笔加起来等于gl 的多对多).
  const [selS, setSelS] = useState<Set<string>>(new Set())
  const [selB, setSelB] = useState<Set<string>>(new Set())
  const [qS, setQS] = useState('')
  const [qB, setQB] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const lineById = new Map(statementLines.map(l => [l.id, l]))
  const matched = statementLines.filter(l => l.matchKind === 'auto' || l.matchKind === 'manual')
  const ignored = statementLines.filter(l => l.matchKind === 'ignored')
  const openS = statementLines.filter(l => l.matchKind == null)

  // Prior-month rows: the window reaches only back to the bank's first recon
  // month (pre-era legacy is excluded at the query — user 2026-08-11: "四月
  // 之前的…旧系统已对完"), so whatever lands here is a genuine in-transit
  // candidate — visible by default, Hide stays available.
  const [showPrior, setShowPrior] = useState(true)
  const priorBook = unmatchedBook.filter(l => l.date < periodMonth)
  const monthBook = unmatchedBook.filter(l => l.date >= periodMonth)
  const visibleBook = showPrior ? unmatchedBook : monthBook

  const needleS = qS.trim().toLowerCase()
  const needleB = qB.trim().toLowerCase()
  const filteredS = needleS
    ? openS.filter(l => `${l.description} ${l.amount} ${l.date}`.toLowerCase().includes(needleS))
    : openS
  const filteredB = needleB
    ? visibleBook.filter(l =>
        `${l.description} ${l.entryNo} ${l.amount} ${l.date}`.toLowerCase().includes(needleB),
      )
    : visibleBook

  const sSelLines = openS.filter(l => selS.has(l.id))
  const sSum = Math.round(sSelLines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  const bSelLines = unmatchedBook.filter(l => selB.has(l.id))
  const bSum = Math.round(bSelLines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  const amountsEqual =
    sSelLines.length > 0 && bSelLines.length > 0 && Math.abs(sSum - bSum) <= 0.005

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (id: string) =>
    setter(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleS = toggleIn(setSelS)
  const toggleB = toggleIn(setSelB)

  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (r.error) setError(r.error)
      else {
        setSelS(new Set())
        setSelB(new Set())
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
          <div className="font-serif italic text-graphite text-sm mb-1">Bank vs GL (month-end)</div>
          {statementOpening != null && statementClosing != null ? (
            <div className="font-mono text-[12px] tabular">
              <span className="text-muted">Bank:</span> {formatMoneyBare(statementOpening)} →{' '}
              <span className="text-ink font-semibold">{formatMoneyBare(statementClosing)}</span>
            </div>
          ) : null}
          {glClosing != null ? (
            <div className="font-mono text-[12px] tabular mt-0.5">
              <span className="text-muted">GL:</span>{' '}
              <span className="text-ink font-semibold">{formatMoneyBare(glClosing)}</span>
              {statementClosing != null ? (
                Math.abs(glClosing - statementClosing) <= 0.005 ? (
                  <span className="text-ledger ml-2">✓ tie</span>
                ) : (
                  <span className="text-danger ml-2">
                    diff {formatMoneyBare(Math.round((statementClosing - glClosing) * 100) / 100)}
                  </span>
                )
              ) : null}
            </div>
          ) : null}
          <div className="font-mono text-[11px] text-muted mt-1">
            in {formatMoneyBare(Math.round(totalIn * 100) / 100)} · out{' '}
            {formatMoneyBare(Math.round(Math.abs(totalOut) * 100) / 100)}
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
          <div className="font-serif text-xl text-num-ink tabular">{monthBook.length}</div>
          {priorBook.length > 0 ? (
            <div className="font-mono text-[11px] text-muted mt-1">+{priorBook.length} earlier</div>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm font-sans text-danger mb-4">{error}</p> : null}

      {/* ── Manual pairing — full-width tidy tables (user 2026-08-08) ── */}
      {openS.length > 0 || unmatchedBook.length > 0 ? (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3 sticky top-0 z-10 bg-paper py-2">
            <h2 className="font-serif text-xl text-ink">Unmatched — pick one from each table</h2>
            <div className="flex items-center gap-3">
              {sSelLines.length > 0 ? (
                <span className="font-mono text-xs text-graphite">
                  Statement Σ ({sSelLines.length}): {formatMoneyBare(sSum)}
                </span>
              ) : null}
              {bSelLines.length > 0 ? (
                <span
                  className={`font-mono text-xs ${sSelLines.length > 0 && !amountsEqual ? 'text-danger' : 'text-graphite'}`}
                >
                  Book Σ ({bSelLines.length}): {formatMoneyBare(bSum)}
                  {sSelLines.length > 0 && !amountsEqual
                    ? ` · off by ${formatMoneyBare(Math.round((sSum - bSum) * 100) / 100)}`
                    : ''}
                  {amountsEqual ? ' ✓' : ''}
                </span>
              ) : null}
              <button
                type="button"
                disabled={!amountsEqual || isPending}
                onClick={() =>
                  run(() => manualMatch(sSelLines.map(l => l.id), bSelLines.map(l => l.id)))
                }
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-40"
                title={
                  sSelLines.length > 0 && bSelLines.length > 0 && !amountsEqual
                    ? 'The two selections must SUM to the same amount'
                    : 'Match N statement lines ↔ M book lines (totals must be equal)'
                }
              >
                {isPending ? 'Working…' : `Match ${sSelLines.length || '…'} ↔ ${bSelLines.length || '…'} →`}
              </button>
              {sSelLines.length === 0 && bSelLines.length >= 2 ? (
                <button
                  type="button"
                  disabled={Math.abs(bSum) > 0.005 || isPending}
                  onClick={() => run(() => contraBookLines(sessionId, bSelLines.map(l => l.id)))}
                  className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-40"
                  title="Book-only Dr/Cr that never hit the bank — selection must sum to 0.00"
                >
                  Mark contra (Σ=0) →
                </button>
              ) : null}
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
                      onClick={() => toggleS(l.id)}
                      className={`border-b border-hairline/60 cursor-pointer ${
                        selS.has(l.id) ? 'bg-accent/15' : 'hover:bg-surface-2/50'
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
                Book (GL) — not on statement ({monthBook.length})
              </span>
              <span className="flex items-center gap-2">
                {priorBook.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPrior(v => !v)}
                    className={`text-xs font-sans border border-hairline rounded px-2 py-1 transition-colors ${
                      showPrior ? 'bg-surface-2 text-ink' : 'bg-paper text-muted hover:text-ink'
                    }`}
                    title="Prior-month entries in the buffer window — usually settled by their own month's statement"
                  >
                    {showPrior ? 'Hide' : 'Show'} earlier items ({priorBook.length})
                  </button>
                ) : null}
                <input
                  type="text"
                  value={qB}
                  onChange={e => setQB(e.target.value)}
                  placeholder="Filter…"
                  className="bg-paper border border-hairline rounded px-2 py-1 text-xs text-ink w-48 focus:outline-none focus:border-accent-border"
                />
              </span>
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
                      onClick={() => toggleB(l.id)}
                      className={`border-b border-hairline/60 cursor-pointer ${
                        selB.has(l.id) ? 'bg-accent/15' : 'hover:bg-surface-2/50'
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
                        {visibleBook.length === 0
                          ? 'Every book line is on the statement ✓'
                          : 'No rows match the filter'}
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

      {/* ── Matched groups ── */}
      <section className="mb-10">
        <h2 className="font-serif text-xl text-ink mb-2">
          Matched ({matched.length} statement lines · {groups.length} groups)
        </h2>
        {groups.length === 0 ? (
          <p className="font-serif italic text-muted text-sm">Nothing matched yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Statement</th>
                  <th className="num">Amount</th>
                  <th>Book entries</th>
                  <th>How</th>
                  <th className="right"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const sLines = g.statementLineIds
                    .map(id => lineById.get(id))
                    .filter(Boolean) as ReviewStatementLine[]
                  const books = g.journalLineIds.map(id => bookInfo[id]).filter(Boolean)
                  const gSum =
                    Math.round(sLines.reduce((s, l) => s + l.amount, 0) * 100) / 100
                  const kind = sLines[0]?.matchKind ?? 'manual'
                  return (
                    <tr key={g.id}>
                      <td>
                        <div className="space-y-0.5">
                          {sLines.map(l => (
                            <div key={l.id}>
                              <span className="font-mono text-[11px] text-graphite mr-2">
                                {dayjs(l.date).format('D MMM')}
                              </span>
                              <span className="font-serif text-[14px] text-ink">
                                {l.description || '—'}
                              </span>
                              {sLines.length > 1 ? (
                                <span className="font-mono text-[11px] text-graphite ml-2">
                                  {formatMoneyBare(l.amount)}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="num">{money(gSum)}</td>
                      <td>
                        {books.length === 0 ? (
                          '—'
                        ) : (
                          <div className="space-y-0.5">
                            {books.map(b => (
                              <div key={b.id}>
                                <span className="font-mono text-[11px] text-muted mr-2">{b.entryNo}</span>
                                <span className="font-serif text-[14px] text-graphite">{b.description}</span>
                                {books.length > 1 ? (
                                  <span className="font-mono text-[11px] text-graphite ml-2">
                                    {formatMoneyBare(b.amount)}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <em className={`font-serif text-xs ${kind === 'auto' ? 'text-info' : 'text-graphite'}`}>
                          {kind}
                          {sLines.length > 1 || books.length > 1
                            ? ` · ${sLines.length}↔${books.length}`
                            : ''}
                        </em>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => sLines[0] && run(() => unmatchLine(sLines[0].id))}
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

      {/* ── Contra — book Dr/Cr with no bank movement ── */}
      {contraGroups.length > 0 ? (
        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-2">
            Contra — no bank movement ({contraGroups.length})
          </h2>
          <div className="space-y-2 max-w-4xl">
            {contraGroups.map(g => {
              const books = g.journalLineIds.map(id => bookInfo[id]).filter(Boolean)
              return (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-4 border border-hairline rounded-md bg-surface px-3 py-2"
                >
                  <div className="space-y-0.5">
                    {books.map(b => (
                      <div key={b.id} className="text-sm">
                        <span className="font-mono text-[11px] text-graphite mr-2">
                          {dayjs(b.date).format('D MMM')}
                        </span>
                        <span className="font-mono text-[11px] text-muted mr-2">{b.entryNo}</span>
                        <span className="font-serif text-graphite">{b.description}</span>
                        <span className="font-mono text-[11px] text-ink ml-2">
                          {formatMoneyBare(b.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => dissolveGroup(g.id))}
                    className="font-serif italic text-xs text-muted hover:text-danger shrink-0"
                  >
                    Dissolve
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

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
