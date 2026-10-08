'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/utils'
import { officeDay } from '@/lib/office-time'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import { SheetIcon } from '@/components/sheet/SheetIcon'
import AmendRepaymentButton from './AmendRepaymentButton'
import AmendDateButton from './AmendDateButton'

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
  /** A payroll batch standing as its total, for an account that may not see
   *  one person's pay (2026-10-02 — lib/payroll-vouchers.ts). The server sends
   *  this row INSTEAD of the batch's vouchers; it opens nothing. */
  locked?: boolean
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'text-graphite',
  pending_approval: 'text-alert',
  approved: 'text-info',
  paid: 'text-ledger',
  received: 'text-ledger',
  voided: 'text-muted',
}

interface Batch {
  key: string
  members: VoucherRow[]
  total: number
  latest: string
  /** e.g. "26 paid" or "20 paid · 6 pending approval". */
  statusText: string
}

function groupBatches(rows: VoucherRow[]): { plain: VoucherRow[]; batches: Batch[] } {
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
        .map(([s, n]) => `${n} ${s.replace('_', ' ')}`)
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
}: {
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
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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
        ? [{ key: 'redate', label: '改日期', hint: '日期录错时用', onSelect: () => setRedate({ row: v, nonce: Date.now() }) }]
        : []),
      ...(v.id.startsWith('rpy-')
        ? [{ key: 'amend', label: '改金额', hint: '金额录错时用', onSelect: () => setAmend({ row: v, nonce: Date.now() }) }]
        : []),
    ],
  })
  const { plain, batches } = collapseBatches ? groupBatches(rows) : { plain: rows, batches: [] as Batch[] }
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div>
      {batches.length > 0 ? (
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
                    <span className="font-mono text-sm font-semibold">−{formatMoney(b.total).replace('RM ', '')}</span>
                    <span className="font-mono text-xs text-graphite">{b.latest ? officeDay(b.latest).format('D MMM') : ''}</span>
                    <span className="text-xs font-serif italic text-accent">{open ? '收起' : '展开'}</span>
                  </span>
                </button>
                {open ? (
                  <div className="px-3 pb-3 pt-1 bg-paper">
                    <VouchersTable rows={b.members} collapseBatches={false} layoutId={layoutId} layoutTitle={layoutTitle} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
      {plain.length === 0 && batches.length > 0 ? null : (
        <SortableTable<VoucherRow>
      layoutId={layoutId}
      layoutTitle={layoutTitle}
      canSetDefault={canSetDefault}
      onRowOpen={links.onRowOpen}
      onRowContextMenu={links.onRowContextMenu}
      rowOpens={(v) => !v.locked}
      rows={plain}
      getRowKey={(v) => v.id}
      // Date (not voucher #) so unnumbered synthetic rows interleave
      // chronologically with HV-* vouchers.
      defaultSort={{ key: 'date', dir: 'desc' }}
      searchKeys={['voucher_no', 'payee_name', 'catLabel', 'poolLabel', 'description']}
      searchPlaceholder="Search voucher # / payee / category / description…"
      columns={[
        {
          key: 'voucher_no',
          group: '基本',
          label: 'Voucher #',
          render: (v) => v.voucher_no ?? '—',
          sortValue: (v) => v.voucher_no ?? '',
          cellClassName: 'font-mono text-[12px] text-ink font-medium',
        },
        {
          key: 'catLabel',
          group: '入账',
          label: 'Category',
          render: (v) => v.catLabel,
          sortValue: (v) => v.catLabel,
          filterable: true,
          cellClassName: 'font-serif italic text-graphite capitalize',
        },
        {
          key: 'poolLabel',
          group: '入账',
          label: 'Pool',
          render: (v) => v.poolLabel,
          sortValue: (v) => v.poolLabel,
          filterable: true,
          cellClassName: 'font-mono text-[11px] text-graphite',
        },
        {
          key: 'payee_name',
          group: '基本',
          label: 'Payee',
          render: (v) =>
            v.locked ? (
              // The name is the whole of what this row says, month last: it wraps
              // rather than being cut at the column's width.
              <span className="whitespace-normal" title={`${v.payee_name} · 这个帐号看不到里面每个人的明细`}>
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
          cellClassName: 'font-serif text-[15px] text-ink truncate max-w-[200px]',
        },
        {
          key: 'description',
          group: '基本',
          label: 'Description',
          render: (v) => {
            const d = v.description?.trim()
            if (!d) return <span className="text-muted">—</span>
            const firstLine = d.split(/\r?\n/)[0]
            const text = firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine
            return <span title={d}>{text}</span>
          },
          sortValue: (v) => v.description ?? '',
          filterable: true,
          cellClassName: 'font-serif italic text-graphite text-sm',
        },
        {
          key: 'amount',
          group: '金额',
          label: 'Amount',
          align: 'right',
          render: (v) => (
            <span className={v.direction === 'credit' ? 'text-ledger font-semibold' : 'font-semibold'}>
              {v.direction === 'credit' ? '+' : '−'}
              {formatMoney(v.amount).replace('RM ', '')}
            </span>
          ),
          sortValue: (v) => (v.direction === 'credit' ? v.amount : -v.amount),
        },
        {
          key: 'status',
          group: '基本',
          label: 'Status',
          render: (v) => (
            <em className={`font-serif text-sm ${STATUS_STYLES[v.status] ?? 'text-muted'}`}>
              {v.status.replace('_', ' ')}
            </em>
          ),
          sortValue: (v) => v.status,
          filterValue: (v) => v.status.replace('_', ' '),
          filterable: true,
        },
        {
          key: 'date',
          group: '基本',
          label: 'Date',
          // A payment date as it is, a creation moment on the office clock: on
          // the machine's clock the server (UTC) and the browser printed two
          // different days for one voucher (2026-10-08, lib/office-time.ts).
          render: (v) => officeDay(v.paymentOrCreatedDate).format('D MMM'),
          sortValue: (v) => new Date(v.paymentOrCreatedDate),
          cellClassName: 'text-graphite',
        },
      ]}
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
