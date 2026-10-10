'use client'

import Link from 'next/link'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import { useFinView } from '@/components/layout/fin-view'
import ColumnFoot from '../../billing/_components/ColumnFoot'

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

const companyLabel = (s: StatementRow) => (s.companyCode ? `${s.companyName} (${s.companyCode})` : s.companyName)

export default function StatementsPeriodTable({ rows, canSetDefault = false }: { rows: StatementRow[]; canSetDefault?: boolean }) {
  const fin = useFinView()
  // 2026-10-02: no View column. A double-click opens the statement; a
  // right-click offers the same, and a new tab. The sheet (2026-10-07) adds
  // an Open → at the end of the row for the mouse, and the phone's panel.
  const links = useRowLinks<StatementRow>({
    href: (s) => `/statements/${s.id}`,
    title: (s) => `${s.companyName} · ${s.status}`,
  })

  // 2026-10-10 — the handoff's month table, on the Finance view only (a
  // Director reading treasury keeps the one below): Company / Total invoice /
  // Total contra / Net / Status, no Open column (a double-click opens), ▽ on
  // every column with a Range on the figures, a scroll box, neighbour resize,
  // an "All companies" row summing each column, negatives red, and on a phone
  // "Invoice x − contra y" under the company.
  if (fin) {
    return (
      <div className="fin-queue">
        <SortableTable<StatementRow>
          layoutId="statements.period"
          layoutTitle="Statements"
          canSetDefault={canSetDefault}
          scrollBox
          resizeMode="neighbour"
          onRowOpen={links.onRowOpen}
          onRowContextMenu={links.onRowContextMenu}
          openLabel="Open the statement →"
          rows={rows}
          getRowKey={(s) => s.id}
          defaultSort={{ key: 'netAmount', dir: 'desc' }}
          columns={[
            {
              key: 'companyName',
              label: 'Company',
              mobile: 'keep',
              filterable: true,
              render: (s) => (
                <>
                  <span className="text-ink">{companyLabel(s)}</span>
                  <span className="q-sub md:hidden">
                    <span className="q-sub-no">
                      Invoice {formatMoneyBare(s.totalInvoice)}
                      {s.totalContra > 0 ? ` − contra ${formatMoneyBare(s.totalContra)}` : ''}
                    </span>
                    <span className="q-sub-by">
                      <span className="by">
                        <StatementStatus status={s.status} />
                      </span>
                    </span>
                  </span>
                </>
              ),
              sortValue: (s) => companyLabel(s),
              filterValue: (s) => companyLabel(s),
            },
            {
              key: 'totalInvoice',
              label: 'Total invoice',
              align: 'right',
              mobile: 'detail',
              filterable: true,
              range: 'number',
              render: (s) => (s.totalInvoice !== 0 ? formatMoney(s.totalInvoice) : <span className="text-muted">—</span>),
              sortValue: (s) => s.totalInvoice,
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'totalContra',
              label: 'Total contra',
              align: 'right',
              mobile: 'detail',
              filterable: true,
              range: 'number',
              render: (s) =>
                s.totalContra > 0 ? <span className="text-danger">{formatMoney(-s.totalContra)}</span> : <span className="text-muted">—</span>,
              // Shown as a deduction, so it sorts and ranges as one.
              sortValue: (s) => -s.totalContra,
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'netAmount',
              label: 'Net',
              align: 'right',
              mobile: 'keep',
              filterable: true,
              range: 'number',
              render: (s) => <span className={s.netAmount < 0 ? 'text-danger' : undefined}>{formatMoney(s.netAmount)}</span>,
              sortValue: (s) => s.netAmount,
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'status',
              label: 'Status',
              mobile: 'drop',
              filterable: true,
              render: (s) => <StatementStatus status={s.status} />,
              sortValue: (s) => s.status,
            },
          ]}
          footer={(visible) => {
            const invoice = visible.reduce((t, s) => t + s.totalInvoice, 0)
            const contra = visible.reduce((t, s) => t + s.totalContra, 0)
            const net = visible.reduce((t, s) => t + s.netAmount, 0)
            return (
              <ColumnFoot
                label="All companies"
                cells={{
                  totalInvoice: formatMoney(invoice),
                  totalContra: contra > 0 ? <span className="text-danger">{formatMoney(-contra)}</span> : '—',
                  netAmount: <span className={net < 0 ? 'text-danger' : undefined}>{formatMoney(net)}</span>,
                }}
              />
            )
          }}
        />
        {links.menu}
      </div>
    )
  }

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
