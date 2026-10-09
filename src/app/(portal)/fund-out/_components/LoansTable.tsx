'use client'

import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'
import type { RowMenuItem } from '@/components/RowMenu'

export interface LoanRow {
  id: string
  companyName: string
  companyCode: string
  createdAt: string
  /** 放款日 — the business date money went out (loans.disbursement_date).
   *  Optional so the stray `page - Copy.tsx` snapshot (user's file, off-limits)
   *  still type-checks; absent → renders — and sorts by createdAt. */
  disbursedAt?: string | null
  principal: number
  outstanding: number
  effectiveRate: number
  status: 'pending_approval' | 'active' | 'fully_repaid' | 'cancelled'
  /** Funding-source remark parsed out of repayment_terms (资金来源: …), null if none. */
  fundingSource: string | null
  /** An active loan with an open overdue record (the Overdue page's). */
  overdue?: boolean
}

/** The status as the sheet's chip (2026-10-09, the Finance revamp): active
 *  green, overdue red, pending blue, fully repaid grey. */
export function LoanStatusChip({ status, overdue = false }: { status: LoanRow['status']; overdue?: boolean }) {
  const [tone, label] =
    status === 'active'
      ? overdue
        ? ['danger', 'overdue']
        : ['ledger', 'active']
      : status === 'pending_approval'
        ? ['wait', 'pending approval']
        : status === 'fully_repaid'
          ? ['info', 'fully repaid']
          : ['', 'cancelled']
  return (
    <span className={`chip${tone ? ` ${tone}` : ''}`}>
      <i className="dot" />
      {label}
    </span>
  )
}

export default function LoansTable({
  rows,
  canSetDefault = false,
  canAmend = false,
}: {
  rows: LoanRow[]
  /** The viewer may keep the arrangement on show as everyone's default. */
  canSetDefault?: boolean
  /** Amend terms (Treasury · Approve) is offered on an active loan's menu. */
  canAmend?: boolean
}) {
  // 2026-10-02: no View column. A double-click opens the loan; a right-click
  // offers the same, a new tab, its schedule to print and, while it is
  // active, its terms to amend (2026-10-09, the handoff).
  const links = useRowLinks<LoanRow>({
    href: (l) => `/fund-out/${l.id}`,
    title: (l) => `${l.companyName} · ${l.companyCode}`,
    more: (l) => {
      const items: RowMenuItem[] = []
      if (l.status !== 'cancelled') {
        items.push({ key: 'print', label: 'Print schedule', onSelect: () => window.open(`/fund-out/${l.id}?print=1`, '_blank', 'noopener,noreferrer') })
      }
      if (canAmend && l.status === 'active') {
        items.push({ key: 'amend', label: 'Amend terms', onSelect: () => window.location.assign(`/fund-out/${l.id}/edit`) })
      }
      return items
    },
  })
  return (
    <>
      <SortableTable<LoanRow>
        layoutId="fund-out.loans"
        layoutTitle="Fund out"
        canSetDefault={canSetDefault}
        scrollBox
        resizeMode="neighbour"
        onRowOpen={links.onRowOpen}
        onRowContextMenu={links.onRowContextMenu}
        rows={rows}
        getRowKey={(l) => l.id}
        defaultSort={{ key: 'disbursedAt', dir: 'desc' }}
        searchKeys={['companyName', 'companyCode']}
        searchPlaceholder="Search company name / code…"
        footer={(visible) => {
          const principal = visible.reduce((t, l) => t + l.principal, 0)
          const outstanding = visible.filter((l) => l.status === 'active').reduce((t, l) => t + l.outstanding, 0)
          return (
            <tr>
              <td colSpan={1000} className="q-foot">
                <span>
                  {visible.length} {visible.length === 1 ? 'loan' : 'loans'} · principal {formatMoney(principal)}
                </span>
                <span className="num">Outstanding {formatMoney(outstanding)}</span>
              </td>
            </tr>
          )
        }}
        columns={[
          {
            key: 'companyName',
            mobile: 'keep',
            group: '基本',
            label: 'Company',
            render: (l) => (
              <>
                <div className="text-ink">
                  {l.companyName}
                  {l.fundingSource ? (
                    <span
                      className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
                      title={`资金来源: ${l.fundingSource}`}
                    >
                      SC {l.fundingSource}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-graphite mt-0.5">
                  {l.companyCode} · {officeTime(l.createdAt).format('D MMM YYYY')}
                </div>
                {/* The phone's small print: the status and the disbursement. */}
                <span className="q-sub md:hidden">
                  <span className="q-sub-by">
                    <span className="by">
                      <LoanStatusChip status={l.status} overdue={l.overdue} />
                    </span>
                    <span className="on">{l.disbursedAt ? dayjs(l.disbursedAt).format('D MMM YYYY') : ''}</span>
                  </span>
                </span>
              </>
            ),
            sortValue: (l) => l.companyName,
          },
          {
            key: 'principal',
            mobile: 'detail',
            group: '金额',
            label: 'Principal',
            align: 'right',
            render: (l) => formatMoney(l.principal),
            sortValue: (l) => l.principal,
            filterable: true,
            range: 'number',
            cellClassName: 'whitespace-nowrap',
          },
          {
            key: 'outstanding',
            mobile: 'keep',
            group: '金额',
            label: 'Outstanding',
            align: 'right',
            render: (l) =>
              l.status === 'active' ? <span className="font-semibold">{formatMoney(l.outstanding)}</span> : <span className="text-muted">—</span>,
            sortValue: (l) => (l.status === 'active' ? l.outstanding : -1),
            cellClassName: 'whitespace-nowrap',
          },
          {
            key: 'rate',
            mobile: 'detail',
            group: '金额',
            label: 'Rate',
            align: 'right',
            render: (l) => `${(l.effectiveRate * 100).toFixed(3)}%`,
            sortValue: (l) => l.effectiveRate,
          },
          {
            key: 'status',
            mobile: 'detail',
            group: '基本',
            label: 'Status',
            render: (l) => <LoanStatusChip status={l.status} overdue={l.overdue} />,
            sortValue: (l) => (l.overdue ? 'overdue' : l.status),
            filterable: true,
            filterValue: (l) => (l.status === 'active' && l.overdue ? 'overdue' : l.status.replace('_', ' ')),
            cellClassName: 'whitespace-nowrap',
          },
          {
            // 放款日 (business date), not record-creation date — created_at still
            // shows in the small line under the company name.
            key: 'disbursedAt',
            mobile: 'detail',
            group: '日期',
            label: 'Disbursed',
            render: (l) => (l.disbursedAt ? dayjs(l.disbursedAt).format('D MMM YYYY') : <span className="text-muted">—</span>),
            sortValue: (l) => new Date(l.disbursedAt ?? l.createdAt),
            filterable: true,
            range: 'date',
            cellClassName: 'text-graphite whitespace-nowrap',
          },
        ]}
      />
      {links.menu}
    </>
  )
}
