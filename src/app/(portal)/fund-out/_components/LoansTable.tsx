'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'

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
}

function StatusLabel({ status }: { status: LoanRow['status'] }) {
  if (status === 'active') return <em className="font-serif text-graphite text-sm">active</em>
  if (status === 'pending_approval')
    return <em className="font-serif text-alert text-sm">pending approval</em>
  if (status === 'fully_repaid')
    return <em className="font-serif text-ledger text-sm">fully repaid</em>
  return <em className="font-serif text-muted text-sm">cancelled</em>
}

export default function LoansTable({ rows }: { rows: LoanRow[] }) {
  return (
    <SortableTable<LoanRow>
      layoutId="fund-out.loans"
      rows={rows}
      getRowKey={(l) => l.id}
      defaultSort={{ key: 'disbursedAt', dir: 'desc' }}
      searchKeys={['companyName', 'companyCode']}
      searchPlaceholder="Search company name / code…"
      columns={[
        {
          key: 'companyName',
          label: 'Company',
          render: (l) => (
            <>
              <div className="font-serif text-[15px] text-ink">
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
              <div className="font-mono text-[11px] text-graphite mt-0.5">
                {l.companyCode} · {dayjs(l.createdAt).format('D MMM YYYY')}
              </div>
            </>
          ),
          sortValue: (l) => l.companyName,
        },
        {
          key: 'principal',
          label: 'Principal',
          align: 'right',
          render: (l) => formatMoney(l.principal),
          sortValue: (l) => l.principal,
        },
        {
          key: 'outstanding',
          label: 'Outstanding',
          align: 'right',
          render: (l) =>
            l.status === 'active' ? formatMoney(l.outstanding) : <span className="text-muted">—</span>,
          sortValue: (l) => (l.status === 'active' ? l.outstanding : -1),
        },
        {
          key: 'rate',
          label: 'Rate',
          align: 'right',
          render: (l) => `${(l.effectiveRate * 100).toFixed(3)}%`,
          sortValue: (l) => l.effectiveRate,
        },
        {
          key: 'status',
          label: 'Status',
          render: (l) => <StatusLabel status={l.status} />,
          sortValue: (l) => l.status,
        },
        {
          // 放款日 (business date), not record-creation date — created_at still
          // shows in the small line under the company name.
          key: 'disbursedAt',
          label: 'Disbursed',
          align: 'right',
          render: (l) =>
            l.disbursedAt ? dayjs(l.disbursedAt).format('D MMM YYYY') : <span className="text-muted">—</span>,
          sortValue: (l) => new Date(l.disbursedAt ?? l.createdAt),
          cellClassName: 'text-graphite text-xs',
        },
        {
          key: 'action',
          pinned: 'end',
          label: '',
          sortable: false,
          align: 'right',
          render: (l) => (
            <Link
              href={`/fund-out/${l.id}`}
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
