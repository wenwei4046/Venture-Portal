'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'

interface Contract {
  id: string
  description: string | null
  amount: number | null
  status: string
  start_date: string | null
  end_date: string | null
  company_id: string
  approved_by: string | null
}

interface Props {
  contracts: Contract[]
  companyMap: Map<string, { name: string; code: string }>
  canCreate?: boolean
  /** contract id → its invoice this month (invoices.contract_id). */
  invoiceByContract?: Record<string, { id: string; no: string | null }>
  /** The page's month, `YYYY-MM-01`. */
  period: string
}

// Marketing project billing: Finance creates a service_contract per project
// with billing_mode = 'marketing_project' and a fixed amount. The contract
// flows through Principal approval (new_contract approval type → Step 2
// approval_cascade trigger activates it). Per spec, Marketing is the only
// dept with real P&L — these contracts feed the Marketing dept pool.
//
// 2026-10-10 — the handoff's sheet table: sortable, ▽ filters (a Range on the
// amount and the dates), the status as a chip, "N PROJECTS", and an Invoice
// button per project that opens the month's invoice for it (raised by
// + Create Invoice ▼ › Generate Marketing invoices). Edit and + New contract
// are the page's own and stay.

function ContractStatus({ status, approvedBy }: { status: string; approvedBy: string | null }) {
  // Active but not yet signed off waits on the Principal — blue.
  const [label, tone] =
    status === 'active' && !approvedBy
      ? ['pending approval', ' wait']
      : status === 'active'
        ? ['active', ' ledger']
        : [status, '']
  return (
    <span className={`chip${tone}`}>
      <i className="dot" />
      {label}
    </span>
  )
}

function statusLabel(c: Contract): string {
  return c.status === 'active' && !c.approved_by ? 'pending approval' : c.status
}

/** "16 Oct – 31 Oct 2026", "1 Oct 2026 – 15 Jan 2027", one end alone, or —. */
function datesOf(c: Contract): string {
  const s = c.start_date ? dayjs(c.start_date) : null
  const e = c.end_date ? dayjs(c.end_date) : null
  if (s && e) return s.year() === e.year() ? `${s.format('D MMM')} – ${e.format('D MMM YYYY')}` : `${s.format('D MMM YYYY')} – ${e.format('D MMM YYYY')}`
  if (s) return `from ${s.format('D MMM YYYY')}`
  if (e) return `to ${e.format('D MMM YYYY')}`
  return '—'
}

export default function MarketingProjectList({ contracts, companyMap, canCreate, invoiceByContract = {}, period }: Props) {
  const companyOf = (c: Contract) => {
    const co = companyMap.get(c.company_id)
    return co ? `${co.name} (${co.code})` : '—'
  }
  const month = dayjs(period).format('MMMM YYYY')

  return (
    <section className="fin-queue mt-10">
      <div className="sect-head">
        <h2>Marketing projects</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {contracts.length} {contracts.length === 1 ? 'PROJECT' : 'PROJECTS'}
        </span>
      </div>

      {contracts.length === 0 ? (
        <div className="bil-empty">
          No Marketing project contracts yet.{' '}
          {canCreate ? (
            <Link href="/billing/contracts/new" className="text-accent hover:underline">
              Create the first contract
            </Link>
          ) : (
            'Finance creates contracts via the Billing module.'
          )}
        </div>
      ) : (
        <SortableTable<Contract>
          layoutId="billing.marketing-projects"
          layoutTitle="Marketing projects"
          canSetDefault={canCreate}
          resizeMode="neighbour"
          rows={contracts}
          getRowKey={(c) => c.id}
          defaultSort={{ key: 'dates', dir: 'desc' }}
          toolbarRight={
            canCreate ? (
              <Link href="/billing/contracts/new" className="bil-btn">
                + New contract
              </Link>
            ) : undefined
          }
          columns={[
            {
              key: 'project',
              group: 'Project',
              label: 'Project',
              mobile: 'keep',
              filterable: true,
              render: (c) => c.description ?? '—',
              sortValue: (c) => c.description ?? '',
            },
            {
              key: 'company',
              group: 'Project',
              label: 'Company',
              mobile: 'detail',
              filterable: true,
              render: (c) => companyOf(c),
              sortValue: (c) => companyOf(c),
            },
            {
              key: 'amount',
              group: 'Amount',
              label: 'Amount',
              align: 'right',
              mobile: 'keep',
              filterable: true,
              range: 'number',
              render: (c) => (c.amount != null ? formatMoney(Number(c.amount)) : '—'),
              sortValue: (c) => (c.amount != null ? Number(c.amount) : null),
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'dates',
              group: 'Dates',
              label: 'Dates',
              mobile: 'detail',
              filterable: true,
              range: 'date',
              render: (c) => datesOf(c),
              sortValue: (c) => (c.start_date ? new Date(c.start_date) : null),
              filterValue: (c) => datesOf(c),
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'status',
              group: 'Project',
              label: 'Status',
              mobile: 'detail',
              filterable: true,
              render: (c) => <ContractStatus status={c.status} approvedBy={c.approved_by} />,
              sortValue: (c) => statusLabel(c),
            },
            {
              key: 'action',
              label: '',
              sortable: false,
              pinned: 'end',
              resizable: false,
              mobile: 'detail',
              render: (c) => {
                const inv = invoiceByContract[c.id]
                return (
                  <span className="flex items-center justify-end gap-3 whitespace-nowrap">
                    {inv ? (
                      <Link href={`/invoices/${inv.id}`} className="bil-row-btn" title={inv.no ?? undefined}>
                        Invoice
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="bil-row-btn"
                        disabled
                        title={`No invoice for this project in ${month} yet — + Create Invoice ▼ › Generate Marketing invoices raises them.`}
                      >
                        Invoice
                      </button>
                    )}
                    {canCreate ? (
                      <Link href={`/billing/contracts/${c.id}/edit`} className="text-xs text-accent hover:underline font-sans">
                        Edit
                      </Link>
                    ) : null}
                  </span>
                )
              },
            },
          ]}
        />
      )}
    </section>
  )
}
