'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney, lentToFromNotes } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'

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
  return (
    <SortableTable<FundSourceRow>
      rows={rows}
      getRowKey={(s) => s.id}
      defaultSort={{ key: 'effectiveDate', dir: 'desc' }}
      searchKeys={['fromLabel', 'typeLabel', 'notes']}
      searchPlaceholder="Search from / type / notes…"
      columns={[
        {
          key: 'typeLabel',
          label: 'Type',
          render: (s) => s.typeLabel,
          sortValue: (s) => s.typeLabel,
          filterable: true,
          cellClassName: 'font-serif italic text-graphite',
        },
        {
          key: 'fromLabel',
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
                    借给 {lentTo}
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
          label: 'Date',
          align: 'right',
          render: (s) => dayjs(s.effectiveDate).format('D MMM YYYY'),
          sortValue: (s) => new Date(s.effectiveDate),
        },
        {
          key: 'amount',
          label: 'Amount',
          align: 'right',
          render: (s) => formatMoney(s.amount),
          sortValue: (s) => s.amount,
        },
        {
          key: 'outstanding',
          label: 'Outstanding',
          align: 'right',
          render: (s) =>
            s.outstanding != null ? formatMoney(s.outstanding) : <span className="text-muted">—</span>,
          sortValue: (s) => s.outstanding ?? -1,
        },
        {
          key: 'rate',
          label: 'Rate',
          align: 'right',
          render: (s) => `${(s.costRate * 100).toFixed(3)}%`,
          sortValue: (s) => s.costRate,
        },
        {
          key: 'lockIn',
          label: 'Lock-in',
          align: 'right',
          render: (s) =>
            s.lockInMonths ? `${s.lockInMonths} mo` : <span className="text-muted">—</span>,
          sortValue: (s) => s.lockInMonths ?? -1,
        },
        {
          key: 'maturity',
          label: 'Maturity',
          align: 'right',
          render: (s) =>
            s.maturityDate ? dayjs(s.maturityDate).format('D MMM YYYY') : <span className="text-muted">—</span>,
          sortValue: (s) => (s.maturityDate ? new Date(s.maturityDate) : null),
        },
        {
          key: 'status',
          label: 'Status',
          render: (s) => <StatusLabel status={s.status} maturityDate={s.maturityDate} />,
          sortValue: (s) => s.status,
          filterable: true,
          filterValue: (s) => s.status.replace('_', ' '),
        },
        {
          key: 'action',
          label: '',
          sortable: false,
          align: 'right',
          render: (s) => (
            <Link
              href={`/fund-in/${s.id}`}
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
