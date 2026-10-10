'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import { useJvRowActions } from './JvRowActions'

export interface JvRow {
  id: string
  entry_no: string
  transaction_date: string
  description: string | null
  segment: string | null
  total_amount: number
  lineCount: number
  /** System-posted (payroll accrual) — tagged AUTO; its Edit is "Fix mistakes". */
  auto?: boolean
}

/** "director_office" → "Director Office"; no segment is a top-level adjustment. */
function segLabel(seg: string | null): string {
  return (seg ?? 'unallocated').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const dateText = (iso: string) => dayjs(iso).format('DD MMM YYYY')

export default function JvList({
  rows,
  canCreate = false,
  canEdit = false,
  canSetDefault = false,
}: {
  rows: JvRow[]
  canCreate?: boolean
  canEdit?: boolean
  /** The viewer may keep the arrangement on show as everyone's default. */
  canSetDefault?: boolean
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()

  // Pre-compute a lowercase haystack per row (voucher no / description / segment /
  // date / amount) so search matches anything the user sees in the table.
  const indexed = useMemo(
    () =>
      rows.map((r) => ({
        row: r,
        hay: `${r.entry_no} ${r.description ?? ''} ${segLabel(r.segment)} ${dayjs(r.transaction_date).format('D MMM YYYY')} ${dateText(
          r.transaction_date,
        )} ${r.total_amount}${r.auto ? ' auto' : ''}`.toLowerCase(),
      })),
    [rows],
  )

  const filtered = useMemo(
    () => (query ? indexed.filter((x) => x.hay.includes(query)) : indexed).map((x) => x.row),
    [indexed, query],
  )

  // 2026-10-10 — the handoff's sheet table: a double-click opens the voucher;
  // a right-click offers that, a new tab, and what the row's Actions column
  // used to hold (Edit / Copy / Delete).
  const actions = useJvRowActions({ canCreate, canEdit })
  const links = useRowLinks<JvRow>({
    href: (r) => `/reconciliation/journal-entries/${r.id}`,
    title: (r) => r.entry_no,
    more: (r) => actions.items(r),
  })

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

      {actions.error ? <div className="sheet-danger mb-4">{actions.error}</div> : null}

      {filtered.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm">
            No entries match &ldquo;{q.trim()}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="fin-queue">
          <SortableTable<JvRow>
            layoutId="reconciliation.journal-entries"
            layoutTitle="Journal entries"
            canSetDefault={canSetDefault}
            scrollBox
            resizeMode="neighbour"
            onRowOpen={links.onRowOpen}
            onRowContextMenu={links.onRowContextMenu}
            rows={filtered}
            getRowKey={(r) => r.id}
            defaultSort={{ key: 'transaction_date', dir: 'desc' }}
            footer={(visible) => (
              <tr>
                <td colSpan={1000} className="q-foot">
                  <span>Total</span>
                  <span className="num">{formatMoneyBare(Math.round(visible.reduce((s, r) => s + Number(r.total_amount), 0) * 100) / 100)}</span>
                </td>
              </tr>
            )}
            columns={[
              {
                key: 'entry_no',
                label: 'Voucher',
                mobile: 'keep',
                render: (r) => (
                  <>
                    {/* The voucher's own page; a link, so Ctrl-click opens a new tab.
                        The number in the body face (2026-10-10, the handoff). */}
                    <Link
                      href={`/reconciliation/journal-entries/${r.id}`}
                      className="font-sans text-[12.5px] font-medium text-ink hover:text-accent underline-offset-2 hover:underline"
                    >
                      {r.entry_no}
                    </Link>
                    {r.auto ? (
                      <span className="adm-tag" title="System-posted payroll accrual — open it to see the lines or fix mistakes">
                        AUTO
                      </span>
                    ) : null}
                    <span className="adm-sub">
                      {r.lineCount} {r.lineCount === 1 ? 'line' : 'lines'}
                    </span>
                    {/* The phone's small print: what it is for, and when. */}
                    <span className="q-sub md:hidden">
                      <span className="q-sub-no">{r.description}</span>
                      <span className="q-sub-no">{dateText(r.transaction_date)}</span>
                    </span>
                  </>
                ),
                sortValue: (r) => r.entry_no,
                filterable: true,
                filterValue: (r) => r.entry_no,
              },
              {
                key: 'transaction_date',
                label: 'Date',
                mobile: 'detail',
                render: (r) => dateText(r.transaction_date),
                sortValue: (r) => r.transaction_date,
                filterable: true,
                filterValue: (r) => dateText(r.transaction_date),
                range: 'date',
                cellClassName: 'whitespace-nowrap',
              },
              {
                key: 'description',
                label: 'Description',
                mobile: 'detail',
                render: (r) => r.description ?? '',
                sortValue: (r) => r.description ?? '',
                filterable: true,
              },
              {
                key: 'segment',
                label: 'Segment',
                mobile: 'detail',
                render: (r) => segLabel(r.segment),
                sortValue: (r) => segLabel(r.segment),
                filterable: true,
                cellClassName: 'whitespace-nowrap',
              },
              {
                key: 'total_amount',
                label: 'Amount',
                mobile: 'keep',
                align: 'right',
                render: (r) => formatMoneyBare(Number(r.total_amount)),
                sortValue: (r) => Number(r.total_amount),
                filterable: true,
                range: 'number',
                cellClassName: 'whitespace-nowrap',
              },
            ]}
          />
          {links.menu}
        </div>
      )}
    </section>
  )
}
