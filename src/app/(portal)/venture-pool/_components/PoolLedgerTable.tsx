'use client'

import dayjs from 'dayjs'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import { formatMoneyBare } from '@/lib/utils'

// The pool ledger (2026-10-09, the user's Claude Design handoff): sortable,
// searched by description or type, each line's direction a chip — in green,
// out in the info tone — and its amount signed.

export interface PoolLine {
  id: string
  /** YYYY-MM-DD */
  date: string
  type: string
  dir: 'in' | 'out'
  description: string
  /** Signed: + in, − out. */
  amount: number
}

const COLUMNS: SortableColumn<PoolLine>[] = [
  {
    key: 'date',
    label: 'Date',
    render: (l) => <span className="font-mono text-xs whitespace-nowrap">{dayjs(l.date).format('D MMM YYYY')}</span>,
    sortValue: (l) => l.date,
    range: 'date',
    mobile: 'detail',
  },
  { key: 'type', label: 'Type', render: (l) => l.type, sortValue: (l) => l.type, filterable: true, mobile: 'detail' },
  {
    key: 'dir',
    label: 'Direction',
    render: (l) => (
      <span className={`chip ${l.dir === 'in' ? 'ledger' : 'info'}`}>
        <span className="dot" />
        {l.dir}
      </span>
    ),
    sortValue: (l) => l.dir,
    filterValue: (l) => l.dir,
    filterable: true,
    mobile: 'detail',
  },
  { key: 'description', label: 'Description', render: (l) => l.description, sortValue: (l) => l.description, mobile: 'keep' },
  {
    key: 'amount',
    label: 'Amount',
    align: 'right',
    render: (l) => <span className={l.amount < 0 ? 'text-danger' : 'text-ledger'}>{formatMoneyBare(l.amount)}</span>,
    sortValue: (l) => l.amount,
    range: 'number',
    mobile: 'keep',
  },
]

export default function PoolLedgerTable({ lines }: { lines: PoolLine[] }) {
  return (
    <SortableTable
      rows={lines}
      columns={COLUMNS}
      defaultSort={{ key: 'date', dir: 'desc' }}
      getRowKey={(l) => l.id}
      searchKeys={['description', 'type']}
      searchPlaceholder="Search description, type…"
    />
  )
}
