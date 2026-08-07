'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import JvRowActions from './JvRowActions'

export interface JvRow {
  id: string
  entry_no: string
  transaction_date: string
  description: string | null
  segment: string | null
  total_amount: number
  lineCount: number
  /** System-posted (payroll accrual) — shown read-only, no edit/delete. */
  auto?: boolean
}

function segLabel(seg: string | null): string {
  return (seg ?? 'unallocated').replace(/_/g, ' ')
}

export default function JvList({ rows }: { rows: JvRow[] }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()

  // Pre-compute a lowercase haystack per row (voucher no / description / segment /
  // date / amount) so search matches anything the user sees in the table.
  const indexed = useMemo(
    () =>
      rows.map((r) => ({
        row: r,
        hay: `${r.entry_no} ${r.description ?? ''} ${segLabel(r.segment)} ${dayjs(
          r.transaction_date,
        ).format('D MMM YYYY')} ${r.total_amount}${r.auto ? ' auto' : ''}`.toLowerCase(),
      })),
    [rows],
  )

  const filtered = useMemo(
    () => (query ? indexed.filter((x) => x.hay.includes(query)) : indexed).map((x) => x.row),
    [indexed, query],
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search voucher, description, segment, amount…"
            className="w-full bg-paper border border-hairline rounded-md pl-3 pr-8 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-sm leading-none"
            >
              ✕
            </button>
          ) : null}
        </div>
        <span className="font-mono text-xs text-muted">
          {query ? `${filtered.length} of ${rows.length}` : `${rows.length}`}{' '}
          {rows.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-graphite text-base">
            No entries match &ldquo;{q.trim()}&rdquo;.
          </p>
        </div>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Voucher</th>
              <th>Date</th>
              <th>Description</th>
              <th>Segment</th>
              <th className="right">Amount</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={entry.id}>
                <td>
                  {entry.auto ? (
                    <span className="font-mono text-[12px] text-ink">
                      {entry.entry_no}
                      <span
                        className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
                        title="System-posted payroll accrual — reverse it instead of editing"
                      >
                        AUTO
                      </span>
                    </span>
                  ) : (
                    <Link
                      href={`/reconciliation/journal-entries/${entry.id}/edit`}
                      className="font-mono text-[12px] text-accent hover:underline"
                    >
                      {entry.entry_no}
                    </Link>
                  )}
                  <div className="font-mono text-[11px] text-graphite mt-0.5">
                    {entry.lineCount} {entry.lineCount === 1 ? 'line' : 'lines'}
                  </div>
                </td>
                <td className="font-mono text-[12px] text-graphite">
                  {dayjs(entry.transaction_date).format('D MMM YYYY')}
                </td>
                <td className="font-serif text-[15px] text-ink">{entry.description}</td>
                <td className="font-mono text-[11px] uppercase tracking-wide text-graphite">
                  {segLabel(entry.segment)}
                </td>
                <td className="num">{formatMoney(Number(entry.total_amount))}</td>
                <td>
                  {entry.auto ? (
                    <span className="font-serif italic text-muted text-xs">auto · read-only</span>
                  ) : (
                    <JvRowActions id={entry.id} entryNo={entry.entry_no} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
