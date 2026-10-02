'use client'

import dayjs from 'dayjs'
import { formatMoney, lentToFromNotes } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import { useRowLinks } from '@/components/row-links'

export type FundSourceStatus = 'pending_approval' | 'active' | 'matured' | 'repaid' | 'cancelled'

export interface FundSourceRow {
  id: string
  typeLabel: string
  fromLabel: string
  effectiveDate: string
  amount: number
  /** null → not applicable for this status, renders —. */
  outstanding: number | null
  costRate: number
  lockInMonths: number | null
  maturityDate: string | null
  status: FundSourceStatus
  /** Free-text notes — a 「借给: X」 remark renders as a badge under From
   *  (user 2026-08-06), other notes show truncated. */
  notes: string | null
}

function StatusLabel({ status, maturityDate }: { status: FundSourceStatus; maturityDate: string | null }) {
  if (status === 'pending_approval') {
    return <em className="font-serif text-alert text-sm">pending approval</em>
  }
  if (status === 'active') {
    if (maturityDate) {
      const days = dayjs(maturityDate).diff(dayjs(), 'day')
      if (days >= 0 && days <= 30) {
        return <em className="font-serif text-alert text-sm">matures in {days}d</em>
      }
      if (days < 0) {
        return <em className="font-serif text-alert text-sm">past maturity</em>
      }
    }
    return <em className="font-serif text-graphite text-sm">active</em>
  }
  if (status === 'matured') {
    return <em className="font-serif text-alert text-sm">matured</em>
  }
  if (status === 'repaid') {
    return <em className="font-serif text-ledger text-sm">repaid</em>
  }
  return <em className="font-serif text-muted text-sm">cancelled</em>
}

export default function FundSourcesTable({ rows }: { rows: FundSourceRow[] }) {
  // 2026-10-02: no View column. A double-click opens the source; a
  // right-click offers the same, and a new tab.
  const links = useRowLinks<FundSourceRow>({
    href: (s) => `/fund-in/${s.id}`,
    title: (s) => `${s.fromLabel} · ${s.typeLabel}`,
  })
  return (
    <>
      <SortableTable<FundSourceRow>
        layoutId="fund-in.sources"
        layoutTitle="Fund in"
        onRowOpen={links.onRowOpen}
        onRowContextMenu={links.onRowContextMenu}
        rows={rows}
        getRowKey={(s) => s.id}
        defaultSort={{ key: 'effectiveDate', dir: 'desc' }}
        searchKeys={['fromLabel', 'typeLabel', 'notes']}
        searchPlaceholder="Search from / type / notes…"
        columns={[
          {
            key: 'typeLabel',
            // Type and Date are what a phone keeps in the grid. Named, because
            // the default (first column + first right-aligned one) only picked
            // Date while Date was right-aligned.
            mobile: 'keep',
            group: '基本',
            label: 'Type',
            render: (s) => s.typeLabel,
            sortValue: (s) => s.typeLabel,
            filterable: true,
            cellClassName: 'font-serif italic text-graphite',
          },
          {
            key: 'fromLabel',
            group: '基本',
            label: 'From',
            render: (s) => {
              const lentTo = lentToFromNotes(s.notes)
              return (
                <div>
                  <div>{s.fromLabel}</div>
                  {lentTo ? (
                    <span
                      className="inline-block mt-0.5 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
                      title={s.notes ?? undefined}
                    >
                      LENT TO {lentTo}
                    </span>
                  ) : s.notes ? (
                    <div
                      className="font-serif italic text-muted text-xs mt-0.5 max-w-[220px] truncate"
                      title={s.notes}
                    >
                      {s.notes}
                    </div>
                  ) : null}
                </div>
              )
            },
            sortValue: (s) => s.fromLabel,
            cellClassName: 'font-serif text-[15px] text-ink',
          },
          {
            key: 'effectiveDate',
            mobile: 'keep',
            group: '日期',
            label: 'Date',
            render: (s) => dayjs(s.effectiveDate).format('D MMM YYYY'),
            sortValue: (s) => new Date(s.effectiveDate),
          },
          {
            key: 'amount',
            group: '金额',
            label: 'Amount',
            align: 'right',
            render: (s) => formatMoney(s.amount),
            sortValue: (s) => s.amount,
          },
          {
            key: 'outstanding',
            group: '金额',
            label: 'Outstanding',
            align: 'right',
            render: (s) =>
              s.outstanding != null ? formatMoney(s.outstanding) : <span className="text-muted">—</span>,
            sortValue: (s) => s.outstanding ?? -1,
          },
          {
            key: 'rate',
            group: '金额',
            label: 'Rate',
            align: 'right',
            render: (s) => `${(s.costRate * 100).toFixed(3)}%`,
            sortValue: (s) => s.costRate,
          },
          {
            key: 'lockIn',
            group: '日期',
            label: 'Lock-in',
            align: 'right',
            render: (s) =>
              s.lockInMonths ? `${s.lockInMonths} mo` : <span className="text-muted">—</span>,
            sortValue: (s) => s.lockInMonths ?? -1,
          },
          {
            key: 'maturity',
            group: '日期',
            label: 'Maturity',
            render: (s) =>
              s.maturityDate ? dayjs(s.maturityDate).format('D MMM YYYY') : <span className="text-muted">—</span>,
            sortValue: (s) => (s.maturityDate ? new Date(s.maturityDate) : null),
          },
          {
            key: 'status',
            group: '基本',
            label: 'Status',
            render: (s) => <StatusLabel status={s.status} maturityDate={s.maturityDate} />,
            sortValue: (s) => s.status,
            filterable: true,
            filterValue: (s) => s.status.replace('_', ' '),
          },
        ]}
      />
      {links.menu}
    </>
  )
}
