'use client'

import { formatMoney } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'

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
  // 2026-10-02: no View column. A double-click opens the statement; a
  // right-click offers the same, and a new tab.
  const links = useRowLinks<StatementRow>({
    href: (s) => `/statements/${s.id}`,
    title: (s) => `${s.companyName} · ${s.status}`,
  })
  return (
    <>
      <SortableTable<StatementRow>
        layoutId="statements.period"
        layoutTitle="Statements"
        onRowOpen={links.onRowOpen}
        onRowContextMenu={links.onRowContextMenu}
        rows={rows}
        getRowKey={(s) => s.id}
        defaultSort={{ key: 'netAmount', dir: 'desc' }}
        searchKeys={['companyName', 'companyCode']}
        searchPlaceholder="Search company name / code…"
        columns={[
          {
            key: 'companyName',
            group: '基本',
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
            group: '金额',
            label: 'Invoice',
            align: 'right',
            render: (s) =>
              s.totalInvoice > 0 ? formatMoney(s.totalInvoice) : <span className="text-muted">—</span>,
            sortValue: (s) => s.totalInvoice,
          },
          {
            key: 'totalContra',
            group: '金额',
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
            group: '金额',
            label: 'Net',
            align: 'right',
            render: (s) => formatMoney(s.netAmount),
            sortValue: (s) => s.netAmount,
            cellClassName: 'font-semibold',
          },
          {
            key: 'status',
            group: '基本',
            label: 'Status',
            render: (s) => <StatementStatus status={s.status} />,
            sortValue: (s) => s.status,
          },
        ]}
      />
      {links.menu}
    </>
  )
}
