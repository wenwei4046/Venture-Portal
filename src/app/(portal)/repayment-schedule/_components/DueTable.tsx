'use client'

import Link from 'next/link'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import { fromCalendar } from '@/lib/deal-return'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { DUE_TYPE_LABEL, dueTotals, type DueRow, type DueType } from './due-rows'

// "Due to collect" / "Due to pay" on the sheet (2026-10-10, the user's Claude
// Design handoff): every deal due this month in one table — a Type chip, what
// came in (or went out) this month, what is Short ("clear" when nothing is) —
// with a Total (the note under it went 2026-10-12: the descriptions clutter the
// view). A short row offers its deal's own record form; a double-click opens
// the deal.

const TYPE: Record<DueType, { label: string; tone: string }> = {
  scheduled: { label: DUE_TYPE_LABEL.scheduled, tone: 'accent' },
  min: { label: DUE_TYPE_LABEL.min, tone: 'info' },
  rolled: { label: DUE_TYPE_LABEL.rolled, tone: 'alert' },
  open: { label: DUE_TYPE_LABEL.open, tone: '' },
}

const dash = <span className="text-graphite">—</span>
const fig = (n: number) => (Math.abs(n) >= 0.005 ? formatMoneyBare(n) : dash)

export default function DueTable({
  side,
  rows,
  monthLong,
  monthShort,
  linkMonth,
  canRecord = false,
  canSetDefault = false,
}: {
  side: 'collect' | 'pay'
  rows: DueRow[]
  /** "October 2026" */
  monthLong: string
  /** "Oct" */
  monthShort: string
  /** The month as the page's URL names it (null: this month) — the deal's Back returns to it. */
  linkMonth: string | null
  /** Treasury · Create: the deal pages' record forms. */
  canRecord?: boolean
  canSetDefault?: boolean
}) {
  const collect = side === 'collect'
  const word = collect ? 'Received' : 'Paid'
  const deal = (r: DueRow) => fromCalendar(`/fund-${collect ? 'out' : 'in'}/${r.id}`, linkMonth)
  // The deal's own record form: a loan's Record repayment, a fund source's.
  const recordHref = (r: DueRow) => `${deal(r)}${collect ? '#repayment-form' : '#repay_principal'}`
  const links = useRowLinks<DueRow>({ href: deal, title: (r) => r.counterparty })

  const columns: SortableColumn<DueRow>[] = [
    {
      key: 'counterparty',
      label: 'Counterparty',
      mobile: 'keep',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">
            {r.counterparty}
            {r.source ? (
              <span className="chip info ml-2" title={`Source of capital: ${r.source}`}>
                SC {r.source}
              </span>
            ) : null}
          </div>
          <div className="text-[11px] text-graphite mt-0.5">{r.detail}</div>
        </div>
      ),
      sortValue: (r) => r.counterparty,
      filterable: true,
    },
    {
      key: 'type',
      label: 'Type',
      mobile: 'detail',
      render: (r) => (
        <span className={`chip${TYPE[r.type].tone ? ` ${TYPE[r.type].tone}` : ''}`}>
          <i className="dot" />
          {TYPE[r.type].label}
        </span>
      ),
      // By type = the handoff's order (scheduled, min, rolled, open-ended).
      sortValue: (r) => r.order,
      filterable: true,
      filterValue: (r) => TYPE[r.type].label,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'principal',
      label: 'Principal',
      align: 'right',
      mobile: 'detail',
      render: (r) => fig(r.principal),
      sortValue: (r) => r.principal,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'interest',
      label: 'Interest',
      align: 'right',
      mobile: 'detail',
      render: (r) => fig(r.interest),
      sortValue: (r) => r.interest,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'total',
      label: 'Total due',
      align: 'right',
      mobile: 'keep',
      render: (r) => <span className="font-medium">{formatMoneyBare(r.total)}</span>,
      sortValue: (r) => r.total,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'received',
      label: `${word} · ${monthShort}`,
      align: 'right',
      mobile: 'detail',
      render: (r) => (r.received != null ? <span className="text-ledger">{formatMoneyBare(r.received)}</span> : dash),
      sortValue: (r) => r.received ?? 0,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'short',
      label: 'Short',
      align: 'right',
      mobile: 'detail',
      render: (r) =>
        r.short == null ? (
          dash
        ) : r.short >= 0.005 ? (
          <span className="text-danger">{formatMoneyBare(-r.short)}</span>
        ) : (
          <span className="chip ledger">
            <i className="dot" />
            clear
          </span>
        ),
      sortValue: (r) => r.short ?? -1,
      filterable: true,
      filterValue: (r) => (r.short == null ? '—' : r.short >= 0.005 ? formatMoneyBare(-r.short) : 'clear'),
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'action',
      label: '',
      mobile: 'detail',
      pinned: 'end',
      sortable: false,
      resizable: false,
      hideable: false,
      render: (r) =>
        r.pending ? (
          <span className="chip wait" title="A repayment PV for it awaits approval">
            <i className="dot" />
            pending PV
          </span>
        ) : canRecord && r.short != null && r.short >= 0.005 ? (
          <Link href={recordHref(r)} className="sch-row-btn border-0">
            {collect ? 'Record receipt' : 'Record payment'}
          </Link>
        ) : null,
      cellClassName: 'text-right whitespace-nowrap',
    },
  ]

  return (
    <section className="mb-8">
      <div className="sect-head">
        <h2>{collect ? 'Due to collect' : 'Due to pay'}</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {rows.length} {rows.length === 1 ? 'ITEM' : 'ITEMS'} · {monthLong.toUpperCase()}
        </span>
      </div>
      <div className="fin-queue">
        <SortableTable<DueRow>
          layoutId={collect ? 'repayment.due-collect' : 'repayment.due-pay'}
          layoutTitle={collect ? 'Due to collect' : 'Due to pay'}
          canSetDefault={canSetDefault}
          scrollBox
          resizeMode="neighbour"
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.key}
          defaultSort={{ key: 'type', dir: 'asc' }}
          onRowOpen={links.onRowOpen}
          onRowContextMenu={links.onRowContextMenu}
          emptyState={<span className="text-sm text-graphite">Nothing due in {monthLong}.</span>}
          footer={(visible) => {
            const t = dueTotals(visible)
            return (
              <tr>
                <td colSpan={1000} className="q-foot">
                  <span>
                    Total · {visible.length} {visible.length === 1 ? 'item' : 'items'} · principal {formatMoney(t.principal)} · interest{' '}
                    {formatMoney(t.interest)}
                  </span>
                  <span className="num">
                    Due {formatMoney(t.total)} · {word.toLowerCase()} {formatMoney(t.received)} · short{' '}
                    <span className={t.short >= 0.005 ? 'text-danger' : undefined}>{formatMoney(t.short >= 0.005 ? -t.short : 0)}</span>
                  </span>
                </td>
              </tr>
            )
          }}
        />
        {links.menu}
      </div>
    </section>
  )
}
