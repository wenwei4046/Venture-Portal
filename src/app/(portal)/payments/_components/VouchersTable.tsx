'use client'

import { useState, type ReactNode } from 'react'
import { formatMoney } from '@/lib/utils'
import { officeDay } from '@/lib/office-time'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import { useFinView } from '@/components/layout/fin-view'
import { SheetIcon } from '@/components/sheet/SheetIcon'
import AmendRepaymentButton from './AmendRepaymentButton'
import AmendDateButton from './AmendDateButton'
import TotalFoot from './TotalFoot'

/**
 * Row shape consumed by VouchersTable. The parent server page is
 * responsible for resolving display strings (catLabel, poolLabel) so
 * the client component stays free of database / context lookups.
 */
export interface VoucherRow {
  id: string
  voucher_no: string | null
  direction: 'credit' | 'debit'
  amount: number
  payee_name: string
  status: string
  catLabel: string
  poolLabel: string
  description: string | null
  paymentOrCreatedDate: string // ISO; client formats for display
  /** Override for the page a row opens — synthetic rows (loan repayments, fund-in
   *  receipts on /receipts) point at their own module instead of /payments. */
  href?: string
  /** Set when this row's DATE can be corrected in place (2026-10-02): a paid
   *  voucher that is not payroll's, or a loan repayment received directly.
   *  `id` is the voucher's or the repayment's own id; `date` is YYYY-MM-DD. */
  amendDate?: { kind: 'voucher' | 'repayment'; id: string; date: string }
  /** Rows sharing a batchKey collapse into one summary line (user 2026-09-15
   *  "hr 的 payroll voucher 我不想要显示这么多"): payroll disbursements are
   *  one voucher per person, 26 a month, and drowned the ledger. */
  batchKey?: string
  /** The bank a receipt came into (2026-10-09, the receipt side's Bank column). */
  bankLabel?: string
  /** A payroll batch standing as its total, for an account that may not see
   *  one person's pay (2026-10-02 — lib/payroll-vouchers.ts). The server sends
   *  this row INSTEAD of the batch's vouchers; it opens nothing. */
  locked?: boolean
  /** A locked batch's count and statuses ("26 paid"), for the Finance view to
   *  say in English (2026-10-10) — `description` keeps the Chinese line. */
  lockedNote?: { count: number; statusText: string }
}

// The status as a chip (2026-10-09, the Finance revamp): pending waits in
// blue, approved is the accent, paid green, voided grey.
const STATUS_TONE: Record<string, string> = {
  draft: '',
  pending_approval: 'wait',
  approved: 'accent',
  paid: 'ledger',
  received: 'ledger',
  voided: 'info',
}

/** A status as the list says it: "pending" on the Finance view (2026-10-10, the handoff). */
function statusWord(status: string, fin: boolean): string {
  return fin && status === 'pending_approval' ? 'pending' : status.replace('_', ' ')
}

/** The description's first line, cut to fit a cell. */
function firstLine(text: string): string {
  const line = text.split(/\r?\n/)[0]
  return line.length > 48 ? `${line.slice(0, 48)}…` : line
}

/** Opening a batch's voucher with one tap is a phone's double-click. */
const onPhone = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches

interface Batch {
  key: string
  members: VoucherRow[]
  total: number
  latest: string
  /** e.g. "26 paid" or "20 paid · 6 pending approval". */
  statusText: string
}

function groupBatches(rows: VoucherRow[], word: (status: string) => string = (s) => s.replace('_', ' ')): { plain: VoucherRow[]; batches: Batch[] } {
  const plain: VoucherRow[] = []
  const byKey = new Map<string, VoucherRow[]>()
  for (const r of rows) {
    if (!r.batchKey) {
      plain.push(r)
      continue
    }
    const list = byKey.get(r.batchKey) ?? []
    list.push(r)
    byKey.set(r.batchKey, list)
  }
  const batches: Batch[] = [...byKey.entries()].map(([key, members]) => {
    const counts = new Map<string, number>()
    for (const m of members) counts.set(m.status, (counts.get(m.status) ?? 0) + 1)
    return {
      key,
      members,
      total: Math.round(members.reduce((s, m) => s + m.amount, 0) * 100) / 100,
      latest: members.reduce((d, m) => (m.paymentOrCreatedDate > d ? m.paymentOrCreatedDate : d), ''),
      statusText: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `${n} ${word(s)}`)
        .join(' · '),
    }
  })
  batches.sort((a, b) => (a.latest < b.latest ? 1 : -1))
  return { plain, batches }
}

export default function VouchersTable({
  rows,
  collapseBatches = true,
  layoutId = 'payments.vouchers',
  layoutTitle = 'Payments',
  canSetDefault = false,
  side = 'payments',
  nested = false,
}: {
  /** The receipt side says Receipt # and Payer, and names the bank (2026-10-09). */
  side?: 'payments' | 'receipts'
  /** What the Columns panel calls this table. */
  layoutTitle?: string
  /** The viewer may set the arrangement on show as everyone's default (2026-10-07). */
  canSetDefault?: boolean
  /** Names the table for the saved column layout — Payments and Receipts
   *  are arranged separately. */
  layoutId?: string
  rows: VoucherRow[]
  /** false = render every row flat (used for the expanded members and when a
   *  text search is active, so a searched-for person is not hidden). */
  collapseBatches?: boolean
  /** A batch's members, drawn inside the batch: no scroll box of their own.
   *  The list itself is boxed whether or not its batches are folded (audit
   *  2026-10-09 l: it lost the box while a search was set). */
  nested?: boolean
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // English on the Finance view (2026-10-09).
  const fin = useFinView()
  const receipts = side === 'receipts'
  // 2026-10-02: the View column is gone (user: "view … 可以 remove,我希望双击
  // 点开"). A double-click opens the row; a right-click offers the same, and
  // 改金额 on the rows that have it. That dialog is mounted once, for the row
  // that asked — not in every row, as the link beside View was.
  const [amend, setAmend] = useState<{ row: VoucherRow; nonce: number } | null>(null)
  const [redate, setRedate] = useState<{ row: VoucherRow; nonce: number } | null>(null)
  const links = useRowLinks<VoucherRow>({
    href: (v) => v.href ?? `/payments/${v.id}`,
    title: (v) => `${v.voucher_no ?? v.catLabel} · ${v.status.replace('_', ' ')}`,
    // Synthetic loan-repayment rows (id 'rpy-<repayment uuid>') get an
    // in-place amount fix (user 2026-09-03: "不能直接点开 receipt 的单去 edit?").
    more: (v) => [
      ...(v.amendDate
        ? [{ key: 'redate', label: fin ? 'Change date' : '改日期', hint: fin ? 'when the date was keyed wrong' : '日期录错时用', onSelect: () => setRedate({ row: v, nonce: Date.now() }) }]
        : []),
      ...(v.id.startsWith('rpy-')
        ? [{ key: 'amend', label: fin ? 'Change amount' : '改金额', hint: fin ? 'loan repayment rows' : '金额录错时用', onSelect: () => setAmend({ row: v, nonce: Date.now() }) }]
        : []),
    ],
  })
  const word = (status: string) => statusWord(status, fin)
  const money = (n: number) => formatMoney(n).replace('RM ', '')
  // A locked batch's line, in English on the Finance view (2026-10-10).
  const describe = (v: VoucherRow): string | null =>
    fin && v.lockedNote
      ? `${v.lockedNote.count} ${v.lockedNote.count === 1 ? 'voucher' : 'vouchers'} · ${v.lockedNote.statusText} · total only`
      : v.description
  // 2026-10-10 — the handoff: on the Finance view a date is written in full
  // ("06 Oct 2026"), a batch's "05 Sep".
  const dateText = (v: VoucherRow) => officeDay(v.paymentOrCreatedDate).format(fin ? 'DD MMM YYYY' : 'D MMM')
  const { plain, batches } = collapseBatches ? groupBatches(rows, word) : { plain: rows, batches: [] as Batch[] }
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const chip = (status: string) => {
    const tone = STATUS_TONE[status] ?? ''
    return (
      <span className={`chip${tone ? ` ${tone}` : ''}`}>
        {/* A draft's chip carries its (black) dot on the Finance view, as the handoff's does. */}
        {tone || fin ? <i className="dot" /> : null}
        {word(status)}
      </span>
    )
  }

  // 2026-10-10 — the handoff's phone list: a row is its number (or, without
  // one, whom it is from), its figure, and under them the status and the
  // other columns in a line — "Category … Pool … Payee …".
  const phoneLine = (v: VoucherRow): ReactNode => {
    const description = describe(v)?.trim()
    const facts: Array<[label: string, value: string | null | undefined]> = [
      ['Category', v.catLabel],
      ['Pool', v.poolLabel],
      // A row without a number is already titled by its payee.
      [receipts ? 'Payer' : 'Payee', v.voucher_no ? v.payee_name : null],
      ['Description', description ? firstLine(description) : null],
      ...(receipts ? [['Bank', v.bankLabel] as [string, string | undefined]] : []),
      ['Date', dateText(v)],
    ]
    return (
      <span className="pay-msub md:hidden">
        {chip(v.status)}
        {facts
          .filter(([, value]) => value && value !== '—')
          .map(([label, value]) => (
            <span key={label} className="pay-mmeta">
              {' '}
              {label} <b>{value}</b>
            </span>
          ))}
      </span>
    )
  }

  const columns: SortableColumn<VoucherRow>[] = [
    {
      key: 'voucher_no',
      group: '基本',
      label: receipts ? 'Receipt #' : 'Voucher #',
      ...(fin ? { mobile: 'keep' as const } : {}),
      render: (v) =>
        fin ? (
          <>
            {v.voucher_no ? (
              <span className="pay-vno">{v.voucher_no}</span>
            ) : (
              <>
                <span className="hidden md:inline">—</span>
                <span className="pay-mtitle md:hidden">{v.payee_name}</span>
              </>
            )}
            {phoneLine(v)}
          </>
        ) : (
          v.voucher_no ?? '—'
        ),
      sortValue: (v) => v.voucher_no ?? '',
      // The number in the body face, not the mono (2026-10-09, the handoff).
      cellClassName: 'font-sans text-[12px] text-ink font-medium whitespace-nowrap',
    },
    {
      key: 'catLabel',
      group: '入账',
      label: 'Category',
      render: (v) => v.catLabel,
      sortValue: (v) => v.catLabel,
      filterable: true,
      cellClassName: fin ? 'text-ink capitalize' : 'font-serif italic text-graphite capitalize',
    },
    {
      key: 'poolLabel',
      group: '入账',
      label: 'Pool',
      render: (v) => v.poolLabel,
      sortValue: (v) => v.poolLabel,
      filterable: true,
      // Inter at the body's 12px, black, on the Finance view (2026-10-10, the handoff).
      cellClassName: fin ? 'text-ink' : 'font-mono text-[11px] text-graphite',
    },
    {
      key: 'payee_name',
      group: '基本',
      label: receipts ? 'Payer' : 'Payee',
      render: (v) =>
        v.locked ? (
          // The name is the whole of what this row says, month last: it wraps
          // rather than being cut at the column's width.
          <span className="whitespace-normal" title={`${v.payee_name} · ${fin ? 'this account sees the batch’s total only' : '这个帐号看不到里面每个人的明细'}`}>
            <span className="inline-block w-3 mr-1.5 align-[-1px] text-muted [&>svg]:w-3 [&>svg]:h-3">
              <SheetIcon name="lock" />
            </span>
            {v.payee_name}
          </span>
        ) : (
          v.payee_name
        ),
      sortValue: (v) => v.payee_name,
      filterable: true,
      cellClassName: fin ? 'text-ink' : 'font-serif text-[15px] text-ink truncate max-w-[200px]',
    },
    {
      key: 'description',
      group: '基本',
      label: 'Description',
      render: (v) => {
        const d = describe(v)?.trim()
        if (!d) return <span className="text-muted">—</span>
        return <span title={d}>{firstLine(d)}</span>
      },
      sortValue: (v) => describe(v) ?? '',
      filterable: true,
      cellClassName: fin ? 'text-ink' : 'font-serif italic text-graphite text-sm',
    },
    ...(receipts
      ? [
          {
            key: 'bank',
            group: '入账',
            label: 'Bank',
            render: (v: VoucherRow) => v.bankLabel ?? '—',
            sortValue: (v: VoucherRow) => v.bankLabel ?? '',
            filterable: true,
            cellClassName: fin ? 'text-ink' : 'text-graphite',
          },
        ]
      : []),
    {
      key: 'amount',
      group: '金额',
      label: 'Amount',
      align: 'right',
      ...(fin ? { mobile: 'keep' as const } : {}),
      filterable: true,
      range: 'number',
      // 2026-10-10 — the handoff: the figure as it is, no sign, at the regular
      // weight; money in green. Sorted and ranged by that same figure (a range
      // of 1k – 10k compared −1,200 and found nothing).
      render: (v) =>
        fin ? (
          <>
            <span className={v.direction === 'credit' ? 'text-ledger' : undefined}>{money(v.amount)}</span>
            <span className="pay-mlabel md:hidden">Amount</span>
          </>
        ) : (
          <span className={v.direction === 'credit' ? 'text-ledger font-semibold' : 'font-semibold'}>
            {v.direction === 'credit' ? '+' : '−'}
            {money(v.amount)}
          </span>
        ),
      sortValue: (v) => (fin || v.direction === 'credit' ? v.amount : -v.amount),
      // The phone sets the figure beside the row's title (payments.css).
      ...(fin ? { cellClassName: 'pay-amt-cell' } : {}),
    },
    {
      key: 'status',
      group: '基本',
      label: 'Status',
      render: (v) => chip(v.status),
      sortValue: (v) => v.status,
      filterValue: (v) => word(v.status),
      filterable: true,
    },
    {
      key: 'date',
      group: '基本',
      label: 'Date',
      // A payment date as it is, a creation moment on the office clock: on
      // the machine's clock the server (UTC) and the browser printed two
      // different days for one voucher (2026-10-08, lib/office-time.ts).
      render: (v) => dateText(v),
      sortValue: (v) => new Date(v.paymentOrCreatedDate),
      ...(fin ? { filterValue: (v: VoucherRow) => dateText(v) } : {}),
      filterable: true,
      range: 'date',
      cellClassName: fin ? 'text-ink whitespace-nowrap' : 'text-graphite whitespace-nowrap',
    },
  ]

  // The handoff's batch row (2026-10-10): what it is, how many, its total in
  // red, the day — and, opened, a short list of its vouchers.
  const finBatches = (
    <div className="pay-batches">
      {batches.map((b) => {
        const open = expanded.has(b.key)
        return (
          <div key={b.key} className="pay-batch">
            <button type="button" onClick={() => toggle(b.key)} aria-expanded={open} className="pay-batch-head">
              <span className="pay-batch-chev" aria-hidden>
                {open ? '▾' : '▸'}
              </span>
              <span className="pay-batch-title">
                <span className="pay-batch-name">{b.key}</span>
                <span className="pay-batch-meta">
                  {b.members.length} {b.members.length === 1 ? 'voucher' : 'vouchers'} · {b.statusText}
                </span>
              </span>
              <span className="pay-batch-amt">−{money(b.total)}</span>
              <span className="pay-batch-date">{b.latest ? officeDay(b.latest).format('DD MMM') : ''}</span>
              <span className="pay-batch-cta">{open ? 'Collapse' : 'Expand'}</span>
            </button>
            {open ? (
              <ul className="pay-batch-list" aria-label={b.key}>
                {b.members.map((m) => (
                  <li
                    key={m.id}
                    className="pay-batch-row"
                    tabIndex={0}
                    title="Double-click to open · right-click for more"
                    onDoubleClick={() => links.onRowOpen(m)}
                    onClick={() => onPhone() && links.onRowOpen(m)}
                    onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && links.onRowOpen(m)}
                    onContextMenu={(e) => links.onRowContextMenu(m, e)}
                  >
                    <span className="pay-batch-no">{m.voucher_no ?? '—'}</span>
                    <span className="pay-batch-who">{m.payee_name}</span>
                    <span className="pay-batch-sum">{money(m.amount)}</span>
                    <span className="pay-bpill" data-tone={STATUS_TONE[m.status] || undefined}>
                      {word(m.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className={fin ? 'pay-ledger' : undefined}>
      {batches.length > 0 ? (
        fin ? (
          finBatches
        ) : (
          <div className="mb-4 border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {batches.map((b) => {
              const open = expanded.has(b.key)
              return (
                <div key={b.key}>
                  <button
                    type="button"
                    onClick={() => toggle(b.key)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 px-4 py-2.5 text-left hover:bg-paper transition-colors"
                  >
                    <span className="min-w-0 flex items-baseline gap-3">
                      <span className="font-mono text-xs text-muted w-3 shrink-0">{open ? '▾' : '▸'}</span>
                      <span className="font-serif text-[15px] text-ink truncate">{b.key}</span>
                      <span className="font-mono text-xs text-muted whitespace-nowrap">
                        {b.members.length} 张 · {b.statusText}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-4 shrink-0">
                      <span className="font-mono text-sm font-semibold">−{money(b.total)}</span>
                      <span className="font-mono text-xs text-graphite">{b.latest ? officeDay(b.latest).format('D MMM') : ''}</span>
                      <span className="text-xs font-serif italic text-accent">{open ? '收起' : '展开'}</span>
                    </span>
                  </button>
                  {open ? (
                    <div className="px-3 pb-3 pt-1 bg-paper">
                      <VouchersTable rows={b.members} collapseBatches={false} nested layoutId={layoutId} layoutTitle={layoutTitle} side={side} />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )
      ) : null}
      {plain.length === 0 && batches.length > 0 ? null : (
        <SortableTable<VoucherRow>
          layoutId={layoutId}
          layoutTitle={layoutTitle}
          canSetDefault={canSetDefault}
          // The Finance revamp (2026-10-09): the list in a scroll box, columns
          // resized against their neighbour.
          scrollBox={!nested}
          resizeMode="neighbour"
          onRowOpen={links.onRowOpen}
          onRowContextMenu={links.onRowContextMenu}
          rowOpens={(v) => !v.locked}
          rows={plain}
          getRowKey={(v) => v.id}
          // Date (not voucher #) so unnumbered synthetic rows interleave
          // chronologically with HV-* vouchers.
          defaultSort={{ key: 'date', dir: 'desc' }}
          searchKeys={['voucher_no', 'payee_name', 'catLabel', 'poolLabel', 'description']}
          searchPlaceholder={
            fin
              ? receipts
                ? 'Search receipt #, from, description…'
                : 'Search voucher #, payee, description…'
              : 'Search voucher # / payee / category / description…'
          }
          // The handoff's Total row (2026-10-10): the rows on show, summed under Amount.
          footer={
            fin
              ? (visible) =>
                  visible.length > 0 ? (
                    <TotalFoot
                      label="Total"
                      values={{ amount: money(Math.round(visible.reduce((s, v) => s + v.amount, 0) * 100) / 100) }}
                      columns={columns.map((c) => ({ key: c.key, phone: c.mobile === 'keep' }))}
                    />
                  ) : null
              : undefined
          }
          columns={columns}
        />
      )}
      {links.menu}
      {amend ? (
        <AmendRepaymentButton
          key={`${amend.row.id}:${amend.nonce}`}
          autoOpen
          hideTrigger
          repaymentId={amend.row.id.slice(4)}
          currentAmount={amend.row.amount}
          label={amend.row.catLabel}
        />
      ) : null}
      {redate?.row.amendDate ? (
        <AmendDateButton
          key={`${redate.row.id}:${redate.nonce}`}
          autoOpen
          hideTrigger
          kind={redate.row.amendDate.kind}
          id={redate.row.amendDate.id}
          currentDate={redate.row.amendDate.date}
          label={redate.row.voucher_no ?? `${redate.row.catLabel} · ${redate.row.payee_name}`}
        />
      ) : null}
    </div>
  )
}
