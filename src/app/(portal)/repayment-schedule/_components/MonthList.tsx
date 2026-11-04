'use client'

import { useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import RowMenu, { type RowMenuAnchor, type RowMenuItem } from '@/components/RowMenu'
import { useRowLinks } from '@/components/row-links'
import { fromCalendar } from '@/lib/deal-return'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { printListing } from '@/lib/print-listing'
import { STATUS_LABEL, STATUS_ORDER, listTotals, statusWords, type ListRow, type ListStatus } from '@/lib/schedule-list'

// We collect / We pay, a month at a time (2026-11-04 — the user: "我想要看到的是我每个月要收和要给的，要有status，要有
// 日期，要可以print out"; the mockup approved). One row an instalment, on its day, sorted by it: its company and deal,
// its number in the plan, what is due (principal · interest), what came in, what is still owed, its status, the day
// it was paid. The status chips over it filter it; a right-click on the header opens Print listing (the rows on show,
// as filtered and sorted) and the same filter. Double-click opens the deal.

const TONE: Record<ListStatus, string> = { paid: 'ledger', partial: 'alert', overdue: 'danger', due: 'info', rolled: '' }

const dash = <span className="text-graphite">—</span>
/** "9 Nov" — with its year when it is not this year's (an instalment still owed from last year). */
const dayIn = (thisYear: string) => (d: string | null) => (d ? dayjs(d).format(d.slice(0, 4) === thisYear ? 'D MMM' : 'D MMM YYYY') : '')

export default function MonthList({
  side,
  rows,
  today,
  monthLong,
  linkMonth,
  canRecord = false,
  canSetDefault = false,
}: {
  side: 'collect' | 'pay'
  rows: ListRow[]
  /** YYYY-MM-DD, the office's */
  today: string
  /** "November 2026" */
  monthLong: string
  /** The month as the page's URL names it (null: this month) — the deal's Back returns to it. */
  linkMonth: string | null
  /** Treasury · Create: the deal pages' record forms. */
  canRecord?: boolean
  canSetDefault?: boolean
}) {
  const collect = side === 'collect'
  const word = collect ? 'Received' : 'Paid'
  const day = dayIn(today.slice(0, 4))
  const [show, setShow] = useState<ListStatus | 'all'>('all')
  const [menu, setMenu] = useState<{ anchor: RowMenuAnchor; visible: ListRow[] } | null>(null)
  const [refused, setRefused] = useState(false)
  const deal = (r: ListRow) => fromCalendar(`/fund-${collect ? 'out' : 'in'}/${r.id}`, linkMonth)
  const recordHref = (r: ListRow) => `${deal(r)}${collect ? '#repayment-form' : '#repay_principal'}`
  const links = useRowLinks<ListRow>({ href: deal, title: (r) => r.counterparty })

  const counts = useMemo(() => {
    const c = new Map<ListStatus, number>()
    for (const r of rows) c.set(r.status, (c.get(r.status) ?? 0) + 1)
    return c
  }, [rows])
  const shown = show === 'all' ? rows : rows.filter((r) => r.status === show)

  const columns: SortableColumn<ListRow>[] = [
    {
      key: 'date',
      label: 'Due',
      mobile: 'keep',
      render: (r) => <span className="whitespace-nowrap">{day(r.date)}</span>,
      sortValue: (r) => r.date,
      filterable: true,
      filterValue: (r) => day(r.date),
      range: 'date',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'counterparty',
      label: 'Company',
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
          <div className="text-[11px] text-graphite mt-0.5">
            {r.principal >= 0.005 ? `P ${formatMoneyBare(r.principal)} · ` : ''}I {formatMoneyBare(r.interest)}
            {r.detail ? ` · ${r.detail}` : ''}
          </div>
        </div>
      ),
      sortValue: (r) => r.counterparty,
      filterable: true,
    },
    {
      key: 'no',
      label: '#',
      mobile: 'detail',
      render: (r) => (r.no != null && r.months != null ? <span className="text-graphite whitespace-nowrap">{r.no}/{r.months}</span> : dash),
      sortValue: (r) => r.no ?? 0,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'due',
      label: collect ? 'To collect' : 'To pay',
      align: 'right',
      mobile: 'keep',
      render: (r) => <span className="font-medium">{formatMoneyBare(r.due)}</span>,
      sortValue: (r) => r.due,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'received',
      label: word,
      align: 'right',
      mobile: 'detail',
      render: (r) => (r.received >= 0.005 ? <span className="text-ledger">{formatMoneyBare(r.received)}</span> : dash),
      sortValue: (r) => r.received,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'owed',
      label: 'Still owed',
      align: 'right',
      mobile: 'detail',
      render: (r) => (r.owed == null ? dash : r.owed >= 0.005 ? <span className="text-danger">{formatMoneyBare(r.owed)}</span> : dash),
      sortValue: (r) => r.owed ?? -1,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'status',
      label: 'Status',
      mobile: 'keep',
      render: (r) => (
        <span className={`chip${TONE[r.status] ? ` ${TONE[r.status]}` : ''}`}>
          <i className="dot" />
          {statusWords(r, today)}
        </span>
      ),
      sortValue: (r) => STATUS_ORDER.indexOf(r.status),
      filterable: true,
      filterValue: (r) => STATUS_LABEL[r.status],
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'paidOn',
      label: `${word} on`,
      mobile: 'detail',
      render: (r) => (r.paidOn ? day(r.paidOn) : dash),
      sortValue: (r) => r.paidOn ?? '',
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
        ) : canRecord && r.owed != null && r.owed >= 0.005 ? (
          <Link href={recordHref(r)} className="sch-row-btn border-0">
            {collect ? 'Record receipt' : 'Record payment'}
          </Link>
        ) : null,
      cellClassName: 'text-right whitespace-nowrap',
    },
  ]

  const print = (visible: ListRow[]) => {
    const t = listTotals(visible, today)
    const ok = printListing({
      title: `Repayment Schedule · ${collect ? 'We collect' : 'We pay'}`,
      subtitle: `${monthLong}${show === 'all' ? '' : ` · ${STATUS_LABEL[show]} only`}`,
      columns: [
        { label: 'Due' },
        { label: 'Company' },
        { label: '#' },
        { label: 'Principal', align: 'right' },
        { label: 'Interest', align: 'right' },
        { label: collect ? 'To collect' : 'To pay', align: 'right' },
        { label: word, align: 'right' },
        { label: 'Still owed', align: 'right' },
        { label: 'Status' },
        { label: `${word} on` },
      ],
      rows: visible.map((r) => [
        dayjs(r.date).format('D MMM YYYY'),
        `${r.counterparty}${r.source ? ` (SC ${r.source})` : ''}${r.detail ? ` — ${r.detail}` : ''}`,
        r.no != null && r.months != null ? `${r.no}/${r.months}` : '—',
        r.principal >= 0.005 ? formatMoneyBare(r.principal) : '—',
        formatMoneyBare(r.interest),
        formatMoneyBare(r.due),
        r.received >= 0.005 ? formatMoneyBare(r.received) : '—',
        r.owed == null || r.owed < 0.005 ? '—' : formatMoneyBare(r.owed),
        statusWords(r, today),
        r.paidOn ? dayjs(r.paidOn).format('D MMM YYYY') : '—',
      ]),
      foot: ['Total', `${visible.length} ${visible.length === 1 ? 'row' : 'rows'}`, '', '', '', formatMoneyBare(t.due), formatMoneyBare(t.received), formatMoneyBare(t.owed), '', ''],
      printedAt: `Printed ${dayjs().format('D MMM YYYY, HH:mm')}`,
    })
    setRefused(!ok)
  }

  const menuItems = (visible: ListRow[]): RowMenuItem[] => [
    { key: 'print', label: 'Print listing', hint: `The ${visible.length} rows on show, as filtered and sorted`, onSelect: () => print(visible) },
    'sep',
    { key: 'all', label: `${show === 'all' ? '✓ ' : ''}Show all · ${rows.length}`, onSelect: () => setShow('all') },
    ...STATUS_ORDER.filter((s) => counts.get(s)).map((s) => ({
      key: s,
      label: `${show === s ? '✓ ' : ''}${STATUS_LABEL[s]} · ${counts.get(s)}`,
      onSelect: () => setShow(s),
    })),
  ]

  const chip = (key: ListStatus | 'all', label: string, n: number) => (
    <button key={key} type="button" aria-pressed={show === key} onClick={() => setShow(key)} className={show === key ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
      {label} · {n}
    </button>
  )

  return (
    <section className="mb-8">
      <div className="sect-head">
        <h2>{collect ? 'Due to collect' : 'Due to pay'}</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {rows.length} {rows.length === 1 ? 'ITEM' : 'ITEMS'} · {monthLong.toUpperCase()}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Status">
        {chip('all', 'All', rows.length)}
        {STATUS_ORDER.filter((s) => counts.get(s)).map((s) => chip(s, STATUS_LABEL[s], counts.get(s) ?? 0))}
      </div>
      {refused ? <p className="text-sm text-danger mb-2">The browser blocked the print window — allow pop-ups for this site, then try again.</p> : null}
      <div className="fin-queue">
        <SortableTable<ListRow>
          key={show}
          layoutId={collect ? 'repayment.month-collect' : 'repayment.month-pay'}
          layoutTitle={collect ? 'Due to collect' : 'Due to pay'}
          canSetDefault={canSetDefault}
          scrollBox
          resizeMode="neighbour"
          rows={shown}
          columns={columns}
          getRowKey={(r) => r.key}
          defaultSort={{ key: 'date', dir: 'asc' }}
          onRowOpen={links.onRowOpen}
          onRowContextMenu={links.onRowContextMenu}
          onHeaderContextMenu={(visible, e: MouseEvent<HTMLElement>) => setMenu({ anchor: { x: e.clientX, y: e.clientY }, visible })}
          emptyState={<span className="text-sm text-graphite">Nothing {show === 'all' ? '' : `${STATUS_LABEL[show].toLowerCase()} `}in {monthLong}.</span>}
          footer={(visible) => {
            const t = listTotals(visible, today)
            return (
              <tr>
                <td colSpan={1000} className="q-foot">
                  <span>
                    Total · {visible.length} {visible.length === 1 ? 'row' : 'rows'}
                    {t.rolled >= 0.005 ? ` · ${formatMoney(t.rolled)} rolls into the balance` : ''}
                  </span>
                  <span className="num">
                    {collect ? 'To collect' : 'To pay'} {formatMoney(t.due)} · {word.toLowerCase()} {formatMoney(t.received)} · still owed{' '}
                    <span className={t.owed >= 0.005 ? 'text-danger' : undefined}>{formatMoney(t.owed)}</span>
                  </span>
                </td>
              </tr>
            )
          }}
        />
        {links.menu}
        {menu ? <RowMenu title={collect ? 'Due to collect' : 'Due to pay'} anchor={menu.anchor} items={menuItems(menu.visible)} onClose={() => setMenu(null)} /> : null}
      </div>
    </section>
  )
}
