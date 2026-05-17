'use client'

import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'

export interface StatementRow {
  id: string
  companyName: string
  companyCode: string
  totalInvoice: number
  totalContra: number
  netAmount: number
  status: string
}

function StatementStatus({ status }: { status: string }) {
  if (status === 'draft') return <em className="font-serif text-graphite text-sm">draft</em>
  if (status === 'issued') return <em className="font-serif text-alert text-sm">issued</em>
  if (status === 'paid') return <em className="font-serif text-ledger text-sm">paid</em>
  return <em className="font-serif text-muted text-sm">{status}</em>
}

export default function StatementsPeriodTable({ rows }: { rows: StatementRow[] }) {
  return (
    <SortableTable<StatementRow>
      rows={rows}
      getRowKey={(s) => s.id}
      defaultSort={{ key: 'netAmount', dir: 'desc' }}
      searchKeys={['companyName', 'companyCode']}
      searchPlaceholder="Search company name / code…"
      columns={[
        {
          key: 'companyName',
          label: 'Company',
          render: (s) => (
            <>
              <div className="font-serif text-[15px] text-ink">{s.companyName}</div>
              <div className="font-mono text-[11px] text-graphite mt-0.5">{s.companyCode}</div>
            </>
          ),
          sortValue: (s) => s.companyName,
        },
        {
          key: 'totalInvoice',
          label: 'Invoice',
          align: 'right',
          render: (s) =>
            s.totalInvoice > 0 ? formatMoney(s.totalInvoice) : <span className="text-muted">—</span>,
          sortValue: (s) => s.totalInvoice,
        },
        {
          key: 'totalContra',
          label: 'Contra',
          align: 'right',
          render: (s) =>
            s.totalContra > 0 ? (
              <span className="neg">{formatMoney(-s.totalContra)}</span>
            ) : (
              <span className="text-muted">—</span>
            ),
          sortValue: (s) => s.totalContra,
        },
        {
          key: 'netAmount',
          label: 'Net',
          align: 'right',
          render: (s) => formatMoney(s.netAmount),
          sortValue: (s) => s.netAmount,
          cellClassName: 'font-semibold',
        },
        {
          key: 'status',
          label: 'Status',
          render: (s) => <StatementStatus status={s.status} />,
          sortValue: (s) => s.status,
        },
        {
          key: 'action',
          label: '',
          sortable: false,
          align: 'right',
          render: (s) => (
            <Link
              href={`/statements/${s.id}`}
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
