'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'

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
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'text-graphite',
  pending_approval: 'text-alert',
  approved: 'text-info',
  paid: 'text-ledger',
  received: 'text-ledger',
  voided: 'text-muted',
}

export default function VouchersTable({ rows }: { rows: VoucherRow[] }) {
  return (
    <SortableTable<VoucherRow>
      rows={rows}
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
          label: '',
          sortable: false,
          align: 'right',
          render: (v) => (
            <Link
              href={v.href ?? `/payments/${v.id}`}
              className="text-sm text-accent hover:text-accent-hover font-serif italic"
            >
              View
            </Link>
          ),
        },
      ]}
    />
  )
}
