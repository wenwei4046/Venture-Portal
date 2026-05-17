import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'

type Filter = 'all' | 'in' | 'out'

interface Props {
  deptId: string
  filter?: Filter
}

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  in: 'In only',
  out: 'Out only',
}

export default async function HistoryTable({ deptId, filter = 'all' }: Props) {
  const supabase = await createClient()

  let query = supabase
    .from('dept_pools')
    .select('id, transaction_type, amount, description, created_at, period_month')
    .eq('department_id', deptId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filter === 'in') query = query.eq('transaction_type', 'np_in')
  if (filter === 'out') query = query.in('transaction_type', ['expense_out', 'inter_billing_out'])

  const { data: rows } = await query

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs uppercase tracking-wide text-muted font-sans">Filter</span>
        {(['all', 'in', 'out'] as Filter[]).map((f) => {
          const isActive = filter === f
          const params = new URLSearchParams()
          params.set('tab', 'history')
          if (f !== 'all') params.set('filter', f)
          return (
            <a
              key={f}
              href={`?${params.toString()}`}
              className={
                isActive
                  ? 'text-sm font-serif italic text-accent'
                  : 'text-sm font-serif italic text-graphite hover:text-ink'
              }
            >
              {FILTER_LABELS[f]}
            </a>
          )
        })}
      </div>

      {(rows ?? []).length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-6 text-center">
          <p className="font-serif italic text-muted text-sm">No transactions match this filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Date</th>
                <th className="text-left py-3 pr-4 font-medium">Type</th>
                <th className="text-left py-3 pr-4 font-medium">Period</th>
                <th className="text-left py-3 pr-4 font-medium">Description</th>
                <th className="text-right py-3 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row) => {
                const isIn = row.transaction_type === 'np_in'
                const signed = isIn ? Number(row.amount) : -Number(row.amount)
                return (
                  <tr key={row.id} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {dayjs(row.created_at).format('D MMM YYYY')}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          isIn
                            ? 'text-xs font-serif italic text-ledger'
                            : 'text-xs font-serif italic text-graphite'
                        }
                      >
                        {isIn ? 'In' : 'Out'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {row.period_month ? dayjs(row.period_month).format('MMM YYYY') : '—'}
                    </td>
                    <td className="py-3 pr-4 font-serif italic text-graphite">
                      {row.description ?? '—'}
                    </td>
                    <td
                      className={
                        isIn
                          ? 'py-3 text-right font-mono tabular font-medium text-ledger'
                          : 'py-3 text-right font-mono tabular font-medium text-ink'
                      }
                    >
                      {formatMoney(signed)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
