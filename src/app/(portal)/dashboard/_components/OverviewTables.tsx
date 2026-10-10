'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import { officeTime } from '@/lib/office-time'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import type { BookEntry } from '@/lib/repayment-book'
import { DecisionChip, DirectionChip, PositionLabel, RequestChip, SignedFigure, directionLabel, requestLabel, signedText } from './cells'

// 2026-10-10 — the handoff (HANDOFF.md audit l, item 5): the treasury
// Overview's lists are the sheet's tables. A heading sorts; ▽ filters by
// picking values, or by a Range on an amount or a date; a heading's edge
// resizes against its neighbour and a heading drags to another place (kept
// per person); the list sits in a box under a sticky header. A row with a page
// of its own opens on a double-click, and a right-click also offers it in a
// new tab. Rows, links and totals are the ones the page drew before.

/** A moment on the office's clock, written as if it were UTC: it sorts in
 *  time order, and a Range's From / To days are the days the cells show. */
const officeStamp = (at: string) => officeTime(at).format('YYYY-MM-DD[T]HH:mm:ss[Z]')
const officeDay = (at: string) => officeTime(at).format('D MMM')
/** An instalment's due day — a date column, read as it is. */
const dueDay = (e: BookEntry) => dayjs(e.due).format('D MMM YYYY')
const money = (v: number | null) => (v != null ? formatMoney(v) : '—')
const cents = (v: number) => Math.round(v * 100) / 100

/** An approval request, as the Principal's queue and Finance's decisions list it. */
interface RequestLine {
  id: string
  /** The request's own page (approvals/[id], or a payroll run's). */
  href: string
  description: string | null
  requestType: string
  /** The live amount of what the request is for (lib/approval-amounts). */
  amount: number | null
}

export interface PendingLine extends RequestLine {
  by: string | null
  /** ISO moment. */
  submittedAt: string
}

export interface DecidedLine extends RequestLine {
  decision: string
  /** ISO moment: decided, or sent when no decision time was kept. */
  decidedAt: string
}

export interface SubsidiaryLine {
  id: string
  name: string
  shortCode: string
  savings: number
  loans: number
  net: number
  position: 'creditor' | 'debtor' | 'even'
  hasOverdue: boolean
}

/** A phone keeps two columns, the row's name and its figure; what else the
 *  row says sits under the name as small print (`.fin-queue .q-sub`), and in
 *  full behind the row's arrow. */
function SmallPrint({ children }: { children: ReactNode }) {
  return <span className="q-sub md:hidden">{children}</span>
}

function descriptionColumn<T extends RequestLine>(sub: (r: T) => ReactNode): SortableColumn<T> {
  return {
    key: 'description',
    label: 'Description',
    group: '基本',
    mobile: 'keep',
    filterable: true,
    render: (r) => (
      <>
        <span className="q-desc">
          <Link href={r.href}>{r.description ?? '—'}</Link>
        </span>
        <SmallPrint>{sub(r)}</SmallPrint>
      </>
    ),
    sortValue: (r) => r.description ?? '',
  }
}

function requestColumn<T extends RequestLine>(): SortableColumn<T> {
  return {
    key: 'request',
    label: 'Request',
    group: '基本',
    mobile: 'detail',
    filterable: true,
    render: (r) => <RequestChip type={r.requestType} />,
    sortValue: (r) => requestLabel(r.requestType),
  }
}

function amountColumn<T extends RequestLine>(): SortableColumn<T> {
  return {
    key: 'amount',
    label: 'Amount',
    group: '金额',
    align: 'right',
    mobile: 'keep',
    filterable: true,
    range: 'number',
    render: (r) => money(r.amount),
    sortValue: (r) => r.amount,
    filterValue: (r) => money(r.amount),
    cellClassName: 'whitespace-nowrap',
  }
}

function momentColumn<T>(key: string, label: string, at: (row: T) => string): SortableColumn<T> {
  return {
    key,
    label,
    group: '日期',
    mobile: 'detail',
    filterable: true,
    range: 'date',
    render: (r) => officeDay(at(r)),
    sortValue: (r) => officeStamp(at(r)),
    filterValue: (r) => officeDay(at(r)),
    cellClassName: 'font-mono text-xs whitespace-nowrap',
  }
}

/** The Principal's "Pending your hand": what waits on their decision. */
export function PendingTable({ rows, canSetDefault = false }: { rows: PendingLine[]; canSetDefault?: boolean }) {
  const links = useRowLinks<PendingLine>({ href: (r) => r.href, title: (r) => r.description ?? requestLabel(r.requestType) })
  const columns: SortableColumn<PendingLine>[] = [
    descriptionColumn((r) => `${r.by ?? '—'} · ${officeDay(r.submittedAt)}`),
    requestColumn(),
    amountColumn(),
    {
      key: 'by',
      label: 'By',
      group: '基本',
      mobile: 'detail',
      filterable: true,
      render: (r) => r.by ?? '—',
      sortValue: (r) => r.by ?? '',
      cellClassName: 'whitespace-nowrap',
    },
    momentColumn('submitted', 'Submitted', (r) => r.submittedAt),
  ]
  return (
    <div className="fin-queue">
      <SortableTable<PendingLine>
        layoutId="overview.pending"
        layoutTitle="Pending your hand"
        canSetDefault={canSetDefault}
        scrollBox
        resizeMode="neighbour"
        onRowOpen={links.onRowOpen}
        onRowContextMenu={links.onRowContextMenu}
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.id}
        defaultSort={{ key: 'submitted', dir: 'desc' }}
      />
      {links.menu}
    </div>
  )
}

/** Finance's "Recent actions": their requests the Principal has decided. */
export function DecidedTable({ rows, canSetDefault = false }: { rows: DecidedLine[]; canSetDefault?: boolean }) {
  const links = useRowLinks<DecidedLine>({ href: (r) => r.href, title: (r) => r.description ?? requestLabel(r.requestType) })
  const columns: SortableColumn<DecidedLine>[] = [
    descriptionColumn((r) => (
      <span className="q-sub-by">
        <span className="by">
          <DecisionChip decision={r.decision} />
        </span>
        <span className="on">{officeDay(r.decidedAt)}</span>
      </span>
    )),
    requestColumn(),
    {
      key: 'decision',
      label: 'Decision',
      group: '基本',
      mobile: 'detail',
      filterable: true,
      render: (r) => <DecisionChip decision={r.decision} />,
      sortValue: (r) => r.decision,
    },
    amountColumn(),
    momentColumn('decided', 'Decided', (r) => r.decidedAt),
  ]
  return (
    <div className="fin-queue">
      <SortableTable<DecidedLine>
        layoutId="overview.recent"
        layoutTitle="Recent actions"
        canSetDefault={canSetDefault}
        scrollBox
        resizeMode="neighbour"
        onRowOpen={links.onRowOpen}
        onRowContextMenu={links.onRowContextMenu}
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.id}
        defaultSort={{ key: 'decided', dir: 'desc' }}
      />
      {links.menu}
    </div>
  )
}

function figureColumn(key: string, label: string, of: (s: SubsidiaryLine) => number): SortableColumn<SubsidiaryLine> {
  return {
    key,
    label,
    group: '金额',
    align: 'right',
    mobile: 'detail',
    filterable: true,
    range: 'number',
    render: (s) => (of(s) > 0 ? formatMoney(of(s)) : '—'),
    sortValue: of,
    filterValue: (s) => (of(s) > 0 ? formatMoney(of(s)) : '—'),
    cellClassName: 'whitespace-nowrap',
  }
}

/** Each subsidiary's savings with HV against its loans from HV. No page of its own: the rows do not open. */
export function SubsidiariesTable({ rows, canSetDefault = false }: { rows: SubsidiaryLine[]; canSetDefault?: boolean }) {
  const columns: SortableColumn<SubsidiaryLine>[] = [
    {
      key: 'company',
      label: 'Company',
      group: '基本',
      mobile: 'keep',
      filterable: true,
      render: (s) => (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{s.name}</span>
            {s.hasOverdue ? (
              <span className="chip danger">
                <span className="dot" />
                overdue
              </span>
            ) : null}
          </div>
          <div className="font-mono text-[11px] mt-0.5">{s.shortCode}</div>
        </>
      ),
      sortValue: (s) => s.name,
    },
    figureColumn('savings', 'Savings', (s) => s.savings),
    figureColumn('loans', 'Loans', (s) => s.loans),
    {
      key: 'net',
      label: 'Net',
      group: '金额',
      align: 'right',
      mobile: 'keep',
      filterable: true,
      range: 'number',
      render: (s) => <SignedFigure value={s.net} />,
      sortValue: (s) => s.net,
      filterValue: (s) => signedText(s.net),
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'position',
      label: 'Position',
      group: '基本',
      mobile: 'detail',
      filterable: true,
      render: (s) => <PositionLabel position={s.position} />,
      sortValue: (s) => s.position,
    },
  ]
  return (
    <div className="fin-queue">
      <SortableTable<SubsidiaryLine>
        layoutId="overview.subsidiaries"
        layoutTitle="Subsidiaries"
        canSetDefault={canSetDefault}
        scrollBox
        resizeMode="neighbour"
        rows={rows}
        columns={columns}
        getRowKey={(s) => s.id}
        // By name, as dashboard_summary lists them.
        defaultSort={{ key: 'company', dir: 'asc' }}
        // The total of the companies on show — every one of them until a ▽ narrows the list.
        footer={(visible) => {
          const sum = (of: (s: SubsidiaryLine) => number) => cents(visible.reduce((t, s) => t + of(s), 0))
          return (
            <tr>
              <td colSpan={1000} className="q-foot">
                <span>
                  {visible.length === rows.length ? 'All subsidiaries' : `${visible.length} of ${rows.length} subsidiaries`} · Savings{' '}
                  {formatMoney(sum((s) => s.savings))} · Loans {formatMoney(sum((s) => s.loans))}
                </span>
                <span className="num">
                  Net <SignedFigure value={sum((s) => s.net)} />
                </span>
              </td>
            </tr>
          )
        }}
      />
    </div>
  )
}

/**
 * Installments from the deals' repayment plans: due day, the counterparty
 * with the installment's place in the plan, which way the money goes, what is
 * unpaid on it, and the deal's own page — opened with `?from=overview`, so it
 * says "← Back to Overview" (lib/deal-return.ts).
 */
export function InstalmentsTable({
  entries,
  late,
  net = false,
  canSetDefault = false,
}: {
  entries: BookEntry[]
  /** Behind: the figure is what is still outstanding, in red. */
  late: boolean
  /** Close on the net of the instalments on show (Coming up). */
  net?: boolean
  canSetDefault?: boolean
}) {
  const hrefOf = (e: BookEntry) => `${e.href}?from=overview`
  const links = useRowLinks<BookEntry>({ href: hrefOf, title: (e) => `${e.name} · instalment ${e.no}` })
  const columns: SortableColumn<BookEntry>[] = [
    {
      key: 'due',
      label: 'Due',
      group: '日期',
      mobile: 'detail',
      filterable: true,
      range: 'date',
      render: (e) => dueDay(e),
      sortValue: (e) => e.due,
      filterValue: (e) => dueDay(e),
      cellClassName: 'font-mono text-xs whitespace-nowrap',
    },
    {
      key: 'counterparty',
      label: 'Counterparty',
      group: '基本',
      mobile: 'keep',
      filterable: true,
      render: (e) => (
        <>
          <Link href={hrefOf(e)} className="font-medium">
            {e.name}
          </Link>
          <div className="text-[11px] text-graphite mt-0.5">
            Instalment {e.no}
            {e.months ? ` of ${e.months}` : ''}
          </div>
          <SmallPrint>{`${dueDay(e)} · ${directionLabel(e.kind)}`}</SmallPrint>
        </>
      ),
      sortValue: (e) => e.name,
    },
    {
      key: 'direction',
      label: 'Direction',
      group: '基本',
      mobile: 'detail',
      filterable: true,
      render: (e) => <DirectionChip kind={e.kind} />,
      sortValue: (e) => directionLabel(e.kind),
    },
    {
      key: 'amount',
      label: late ? 'Outstanding' : 'Amount',
      group: '金额',
      align: 'right',
      mobile: 'keep',
      filterable: true,
      range: 'number',
      render: (e) => (late ? <span className="text-danger">{formatMoneyBare(e.outstanding)}</span> : formatMoneyBare(e.outstanding)),
      sortValue: (e) => e.outstanding,
      filterValue: (e) => formatMoneyBare(e.outstanding),
      cellClassName: 'whitespace-nowrap',
    },
    {
      // The row's own way in, as the handoff draws it; a phone opens the row instead.
      key: 'open',
      label: '',
      header: <span className="sr-only">Open</span>,
      sortable: false,
      resizable: false,
      pinned: 'end',
      mobile: 'drop',
      render: (e) => (
        <Link href={hrefOf(e)} className="btn-quiet-sheet">
          Open
        </Link>
      ),
      cellClassName: 'text-right',
    },
  ]
  return (
    <div className="fin-queue">
      <SortableTable<BookEntry>
        layoutId={late ? 'overview.overdue' : 'overview.upcoming'}
        layoutTitle={late ? 'Overdue instalments' : 'Coming up'}
        canSetDefault={canSetDefault}
        scrollBox
        resizeMode="neighbour"
        onRowOpen={links.onRowOpen}
        onRowContextMenu={links.onRowContextMenu}
        rows={entries}
        columns={columns}
        getRowKey={(e) => `${e.kind}-${e.id}-${e.no}`}
        // Soonest first, as the book lists them (ties keep its order).
        defaultSort={{ key: 'due', dir: 'asc' }}
        footer={
          net
            ? (visible) => {
                const total = cents(visible.reduce((s, e) => s + (e.kind === 'collect' ? e.outstanding : -e.outstanding), 0))
                return (
                  <tr>
                    <td colSpan={1000} className="q-foot">
                      <span>Net</span>
                      <span className="num">
                        <span className={total < 0 ? 'text-danger' : 'text-ledger'}>{formatMoney(total)}</span>
                      </span>
                    </td>
                  </tr>
                )
              }
            : undefined
        }
      />
      {links.menu}
    </div>
  )
}
