import Link from 'next/link'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { formatMoneyBare } from '@/lib/utils'

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

export default function NonBillableList({ transactions, period, canAdd }: Props) {
  const monthLabel = dayjs(period).format('MMM YYYY')
  const totalOut = transactions
    .filter((t) => OUT_TYPES.has(t.transaction_type))
    .reduce((sum, t) => sum + Number(t.amount), 0)

  return (
    <section className="fin-queue mt-10">
      <div className="sect-head">
        <h2>Non-billable</h2>
        <span className="rule" aria-hidden />
        <span className="count">{transactions.length} · {monthLabel.toUpperCase()}</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-end gap-4 mb-4">
        {canAdd ? (
          <Link
            href="/payments/new?preset=non_billable"
            className="shrink-0 btn-secondary text-sm"
          >
            + Add non-billable expense
          </Link>
        ) : null}
      </div>

      {transactions.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-6 text-center">
          <p className="font-serif italic text-muted text-sm">
            No Venture Pool transactions in {monthLabel}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-hairline rounded-md bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 px-4 font-medium">Date</th>
                <th className="text-left py-3 px-4 font-medium">Type</th>
                <th className="text-left py-3 px-4 font-medium">Description</th>
                <th className="text-left py-3 px-4 font-medium">Source</th>
                <th className="text-right py-3 px-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const isOut = OUT_TYPES.has(t.transaction_type)
                const src =
                  t.reference_table === 'payment_vouchers'
                    ? 'voucher'
                    : t.reference_table === 'dept_pools'
                      ? 'dept transfer'
                      : t.reference_table ?? 'auto'
                return (
                  <tr key={t.id} className="border-b border-hairline last:border-0">
                    <td className="py-3 px-4 font-mono text-xs text-muted">
                      {officeTime(t.created_at).format('DD MMM')}
                    </td>
                    <td className="py-3 px-4">
                      <em
                        className={`font-serif text-sm ${isOut ? 'text-danger' : 'text-ledger'}`}
                      >
                        {t.transaction_type.replace(/_/g, ' ')}
                      </em>
                    </td>
                    <td className="py-3 px-4 font-sans text-sm text-graphite max-w-md">
                      {t.description ?? '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-muted">{src}</td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular font-semibold ${isOut ? 'text-danger' : 'text-ledger'}`}
                    >
                      {isOut
                        ? `(${formatMoneyBare(t.amount)})`
                        : `+${formatMoneyBare(t.amount)}`}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-hairline bg-paper">
                <td colSpan={4} className="py-3 px-4 font-sans text-sm text-graphite text-right">
                  Total deducted this period
                </td>
                <td className="py-3 px-4 text-right font-mono tabular font-semibold text-danger">
                  ({formatMoneyBare(totalOut)})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
