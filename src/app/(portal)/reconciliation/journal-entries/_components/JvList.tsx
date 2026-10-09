'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import JvRowActions from './JvRowActions'
import LedgerRow from '@/components/LedgerRow'

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

export default function JvList({ rows, canCreate = false, canEdit = false }: { rows: JvRow[]; canCreate?: boolean; canEdit?: boolean }) {
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

  const total = Math.round(filtered.reduce((s, r) => s + Number(r.total_amount), 0) * 100) / 100

  return (
    <section>
      <div className="gl-toolbar">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search voucher, description, segment, amount…"
            className="w-full bg-white border border-hairline rounded-md pl-3 pr-8 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
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
        {query ? <span className="text-xs text-graphite">{filtered.length} of {rows.length}</span> : null}
      </div>

      <div className="sect-head">
        <h2>Vouchers</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {rows.length} {rows.length === 1 ? 'ENTRY' : 'ENTRIES'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm">
            No entries match &ldquo;{q.trim()}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="table-frame">
        <div className="table-frame-scroll">
        <table className="ledger-table [&_td.num]:whitespace-nowrap">
          <thead>
            <tr>
              <th>Voucher</th>
              <th className="m-hide">Date</th>
              <th className="m-hide">Description</th>
              <th className="m-hide">Segment</th>
              <th className="right">Amount</th>
              <th className="right m-hide">Actions</th>
              <th className="lt-toggle" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <LedgerRow key={entry.id}>
                <td>
                  {/* The voucher's own page (2026-10-09, the handoff). */}
                  <Link href={`/reconciliation/journal-entries/${entry.id}`} className="font-mono text-[12.5px] font-medium">
                    {entry.entry_no}
                  </Link>
                  {entry.auto ? (
                    <span className="chip info ml-2" title="System-posted payroll accrual — open it to see the lines or fix mistakes">
                      <span className="dot" />
                      AUTO
                    </span>
                  ) : null}
                  <div className="text-[11px] text-graphite mt-0.5">
                    {entry.lineCount} {entry.lineCount === 1 ? 'line' : 'lines'}
                  </div>
                </td>
                <td className="font-mono text-[12px] whitespace-nowrap m-hide" data-label="Date">
                  {dayjs(entry.transaction_date).format('D MMM YYYY')}
                </td>
                <td className="m-hide" data-label="Description">{entry.description}</td>
                <td className="m-hide capitalize" data-label="Segment">
                  {segLabel(entry.segment)}
                </td>
                <td className="num">{formatMoneyBare(Number(entry.total_amount))}</td>
                <td className="m-hide">
                  <JvRowActions id={entry.id} entryNo={entry.entry_no} canCreate={canCreate} canEdit={canEdit} />
                </td>
              </LedgerRow>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="m-hide" />
              <td className="m-hide" />
              <td className="m-hide" />
              <td className="num">{formatMoneyBare(total)}</td>
              <td className="m-hide" />
              <td className="lt-toggle" aria-hidden />
            </tr>
          </tfoot>
        </table>
        </div>
        </div>
      )}
    </section>
  )
}
