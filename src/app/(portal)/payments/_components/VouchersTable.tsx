'use client'

import { useState } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import AmendRepaymentButton from './AmendRepaymentButton'

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
  /** Override for the View link — synthetic rows (loan repayments, fund-in
   *  receipts on /receipts) point at their own module instead of /payments. */
  href?: string
  /** Rows sharing a batchKey collapse into one summary line (user 2026-09-15
   *  "hr 的 payroll voucher 我不想要显示这么多"): payroll disbursements are
   *  one voucher per person, 26 a month, and drowned the ledger. */
  batchKey?: string
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
}: {
  /** Names the table for the saved column layout — Payments and Receipts
   *  are arranged separately. */
  layoutId?: string
  rows: VoucherRow[]
  /** false = render every row flat (used for the expanded members and when a
   *  text search is active, so a searched-for person is not hidden). */
  collapseBatches?: boolean
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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
                    <span className="font-mono text-xs text-graphite">{b.latest ? dayjs(b.latest).format('D MMM') : ''}</span>
                    <span className="text-xs font-serif italic text-accent">{open ? '收起' : '展开'}</span>
                  </span>
                </button>
                {open ? (
                  <div className="px-3 pb-3 pt-1 bg-paper">
                    <VouchersTable rows={b.members} collapseBatches={false} layoutId={layoutId} />
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
          label: 'Voucher #',
          render: (v) => v.voucher_no ?? '—',
          sortValue: (v) => v.voucher_no ?? '',
          cellClassName: 'font-mono text-[12px] text-ink font-medium',
        },
        {
          key: 'catLabel',
          label: 'Category',
          render: (v) => v.catLabel,
          sortValue: (v) => v.catLabel,
          filterable: true,
          cellClassName: 'font-serif italic text-graphite capitalize',
        },
        {
          key: 'poolLabel',
          label: 'Pool',
          render: (v) => v.poolLabel,
          sortValue: (v) => v.poolLabel,
          filterable: true,
          cellClassName: 'font-mono text-[11px] text-graphite',
        },
        {
          key: 'payee_name',
          label: 'Payee',
          render: (v) => v.payee_name,
          sortValue: (v) => v.payee_name,
          filterable: true,
          cellClassName: 'font-serif text-[15px] text-ink truncate max-w-[200px]',
        },
        {
          key: 'description',
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
          label: 'Date',
          align: 'right',
          render: (v) => dayjs(v.paymentOrCreatedDate).format('D MMM'),
          sortValue: (v) => new Date(v.paymentOrCreatedDate),
          cellClassName: 'text-graphite',
        },
        {
          key: 'action',
          pinned: 'end',
          label: '',
          sortable: false,
          align: 'right',
          render: (v) => (
            <span className="whitespace-nowrap">
              <Link
                href={v.href ?? `/payments/${v.id}`}
                className="text-sm text-accent hover:text-accent-hover font-serif italic"
              >
                View
              </Link>
              {/* Synthetic loan-repayment rows (id 'rpy-<repayment uuid>') get
                  an in-place amount fix (user 2026-09-03: "不能直接点开
                  receipt 的单去edit?"). */}
              {v.id.startsWith('rpy-') ? (
                <AmendRepaymentButton
                  repaymentId={v.id.slice(4)}
                  currentAmount={v.amount}
                  label={v.catLabel}
                />
              ) : null}
            </span>
          ),
        },
      ]}
        />
      )}
    </div>
  )
}
