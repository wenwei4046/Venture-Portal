'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { formatMoneyBare } from '@/lib/utils'
import SortableTable from '@/components/SortableTable'
import ColumnFoot from './ColumnFoot'

interface Transaction {
  id: string
  created_at: string
  transaction_type: string
  amount: number
  description: string | null
  reference_table: string | null
}

interface Props {
  transactions: Transaction[]
  period: string
  canAdd: boolean
}

const OUT_TYPES = new Set(['expense_out', 'loan_out', 'saving_out'])

// The month's Venture Pool movements that bill nobody. 2026-10-10 — the
// handoff's sheet table: sortable with ▽ filters (a Range on the date and the
// amount), the type as a chip, the source in words, "N TRANSACTIONS", money
// out in red brackets and in in green, and what left the pool at the foot.

/** Where a movement came from, in words. */
function sourceOf(t: Transaction): string {
  if (t.reference_table === 'payment_vouchers') return 'Payment voucher'
  if (t.reference_table === 'dept_pools') return 'Dept transfer'
  if (!t.reference_table) return 'Auto'
  const words = t.reference_table.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export default function NonBillableList({ transactions, period, canAdd }: Props) {
  const monthLabel = dayjs(period).format('MMM YYYY')
  const isOut = (t: Transaction) => OUT_TYPES.has(t.transaction_type)

  return (
    <section className="fin-queue mt-10">
      <div className="sect-head">
        <h2>Non-billable</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {transactions.length} {transactions.length === 1 ? 'TRANSACTION' : 'TRANSACTIONS'} · {dayjs(period).format('MMMM YYYY').toUpperCase()}
        </span>
      </div>

      {transactions.length === 0 ? (
        <>
          {canAdd ? (
            <div className="flex justify-end mb-3">
              <Link href="/payments/new?preset=non_billable" className="bil-btn">
                + Add non-billable expense
              </Link>
            </div>
          ) : null}
          <div className="bil-empty">No Venture Pool transactions in {monthLabel}.</div>
        </>
      ) : (
        <SortableTable<Transaction>
          layoutId="billing.non-billable"
          layoutTitle="Non-billable"
          resizeMode="neighbour"
          rows={transactions}
          getRowKey={(t) => t.id}
          defaultSort={{ key: 'date', dir: 'desc' }}
          toolbarRight={
            canAdd ? (
              <Link href="/payments/new?preset=non_billable" className="bil-btn">
                + Add non-billable expense
              </Link>
            ) : undefined
          }
          footer={(visible) => {
            const out = visible.filter(isOut).reduce((s, t) => s + Number(t.amount), 0)
            return (
              <ColumnFoot
                label="Total deducted"
                cells={{ amount: <span className="text-danger">({formatMoneyBare(out)})</span> }}
              />
            )
          }}
          columns={[
            {
              key: 'date',
              label: 'Date',
              mobile: 'detail',
              filterable: true,
              range: 'date',
              render: (t) => officeTime(t.created_at).format('D MMM YYYY'),
              sortValue: (t) => new Date(t.created_at),
              cellClassName: 'whitespace-nowrap',
            },
            {
              key: 'type',
              label: 'Type',
              mobile: 'detail',
              filterable: true,
              render: (t) => (
                <span className="chip">
                  <i className="dot" />
                  {t.transaction_type.replace(/_/g, ' ')}
                </span>
              ),
              sortValue: (t) => t.transaction_type.replace(/_/g, ' '),
            },
            {
              key: 'description',
              label: 'Description',
              mobile: 'keep',
              filterable: true,
              render: (t) => t.description ?? '—',
              sortValue: (t) => t.description ?? '',
            },
            {
              key: 'source',
              label: 'Source',
              mobile: 'detail',
              filterable: true,
              render: (t) => sourceOf(t),
              sortValue: (t) => sourceOf(t),
            },
            {
              key: 'amount',
              label: 'Amount',
              align: 'right',
              mobile: 'keep',
              filterable: true,
              range: 'number',
              render: (t) =>
                isOut(t) ? (
                  <span className="text-danger">({formatMoneyBare(t.amount)})</span>
                ) : (
                  <span className="text-ledger">+{formatMoneyBare(t.amount)}</span>
                ),
              // Money out counts below zero, so a range reads as the column does.
              sortValue: (t) => (isOut(t) ? -Number(t.amount) : Number(t.amount)),
              cellClassName: 'whitespace-nowrap',
            },
          ]}
        />
      )}
    </section>
  )
}
