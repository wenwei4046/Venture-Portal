'use client'

import Link from 'next/link'
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

// The status as a chip in its colour (2026-10-07, the sheet): issued waits,
// paid is done, a draft is quiet.
function StatementStatus({ status }: { status: string }) {
  const tone = status === 'paid' ? ' ledger' : status === 'issued' ? ' alert' : ''
  return (
    <span className={`chip${tone}`}>
      <i className="dot" />
      {status}
    </span>
  )
}

export default function StatementsPeriodTable({ rows, canSetDefault = false }: { rows: StatementRow[]; canSetDefault?: boolean }) {
  // 2026-10-02: no View column. A double-click opens the statement; a
  // right-click offers the same, and a new tab. The sheet (2026-10-07) adds
  // an Open → at the end of the row for the mouse, and the phone's panel.
  const links = useRowLinks<StatementRow>({
    href: (s) => `/statements/${s.id}`,
    title: (s) => `${s.companyName} · ${s.status}`,
  })
  return (
    <div className="fin-queue">
      <SortableTable<StatementRow>
        layoutId="statements.period"
        layoutTitle="Statements"
        canSetDefault={canSetDefault}
        onRowOpen={links.onRowOpen}
        onRowContextMenu={links.onRowContextMenu}
        openLabel="Open the statement →"
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
            mobile: 'keep',
            render: (s) => (
              <>
                <div className="font-serif text-[15px] text-ink">{s.companyName}</div>
                <div className="font-mono text-[11px] text-graphite mt-0.5">{s.companyCode}</div>
                {/* The phone's small print: the status, then the code. */}
                <span className="q-sub md:hidden">
                  <span className="q-sub-by">
                    <span className="by">
                      <StatementStatus status={s.status} />
                    </span>
                  </span>
                </span>
              </>
            ),
            sortValue: (s) => s.companyName,
          },
          {
            key: 'totalInvoice',
            group: '金额',
            label: 'Invoice',
            align: 'right',
            mobile: 'detail',
            render: (s) =>
              s.totalInvoice > 0 ? formatMoney(s.totalInvoice) : <span className="text-muted">—</span>,
            sortValue: (s) => s.totalInvoice,
          },
          {
            key: 'totalContra',
            group: '金额',
            label: 'Contra',
            align: 'right',
            mobile: 'detail',
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
            mobile: 'keep',
            render: (s) => <span className={s.netAmount < 0 ? 'neg' : undefined}>{formatMoney(s.netAmount)}</span>,
            sortValue: (s) => s.netAmount,
            cellClassName: 'font-semibold whitespace-nowrap',
          },
          {
            key: 'status',
            group: '基本',
            label: 'Status',
            mobile: 'drop',
            render: (s) => <StatementStatus status={s.status} />,
            sortValue: (s) => s.status,
            filterable: true,
            filterValue: (s) => s.status,
          },
          {
            key: 'open',
            label: '',
            sortable: false,
            pinned: 'end',
            resizable: false,
            mobile: 'drop',
            render: (s) => (
              <Link href={`/statements/${s.id}`} className="font-mono text-[11px] text-accent whitespace-nowrap">
                Open →
              </Link>
            ),
          },
        ]}
        footer={(visible) => (
          <tr>
            <td colSpan={1000} className="q-foot">
              <span>
                {visible.length} {visible.length === 1 ? 'company' : 'companies'}
              </span>
              <span className="num">
                Invoice {formatMoney(visible.reduce((t, s) => t + s.totalInvoice, 0))} · Contra{' '}
                {formatMoney(-visible.reduce((t, s) => t + s.totalContra, 0))} · Net{' '}
                {formatMoney(visible.reduce((t, s) => t + s.netAmount, 0))}
              </span>
            </td>
          </tr>
        )}
      />
      {links.menu}
    </div>
  )
}
