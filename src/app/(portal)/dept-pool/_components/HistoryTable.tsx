import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { SheetIcon } from '@/components/sheet/SheetIcon'
import { foldPayrollPoolRows, poolRowVoucherNo, type PayrollVoucherLike } from '@/lib/payroll-vouchers'

type Filter = 'all' | 'in' | 'out'

interface Props {
  deptId: string
  filter?: Filter
  /** false = the viewer may not see one person's pay (canSeePayrollPayouts):
   *  the rows payroll vouchers wrote fold into one line per batch per day. */
  seesPayroll: boolean
}

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  in: 'In only',
  out: 'Out only',
}

export default async function HistoryTable({ deptId, filter = 'all', seesPayroll }: Props) {
  const supabase = await createClient()

  let query = supabase
    .from('dept_pools')
    .select('id, transaction_type, amount, description, created_at, period_month')
    .eq('department_id', deptId)
    .order('created_at', { ascending: false })
    .limit(200)

  // *_in adds to the balance, *_out subtracts (void_* = void reversals,
  // jv_* = manual-JV bank movements; both balance-only, see mig 20260612060000).
  // Cast: void_*/jv_* (migs 20260611010000/20260612060000) are not yet in the
  // generated database.types.ts enum union.
  if (filter === 'in') query = query.in('transaction_type', ['np_in', 'void_in', 'jv_in'] as never[])
  if (filter === 'out') query = query.in('transaction_type', ['expense_out', 'inter_billing_out', 'void_out', 'jv_out'] as never[])

  const { data } = await query
  const rows = data ?? []

  // Without Payroll payouts (2026-10-05): the HR pool's ledger names each
  // person paid — "PV HV-PV-…: Payroll disbursement Aug 2026 — <person>". The
  // voucher behind each row says whether it is payroll's; those rows fold here,
  // on the server, into one line per batch per day. Nothing per person is sent.
  let shown: ReturnType<typeof foldPayrollPoolRows<(typeof rows)[number]>> = rows
  if (!seesPayroll && rows.length > 0) {
    const numbers = [...new Set(rows.map((r) => poolRowVoucherNo(r.description)).filter((n): n is string => n !== null))]
    const { data: vouchers } = numbers.length > 0
      ? await supabase
          .from('payment_vouchers')
          .select('voucher_no, reference_type, description, status, amount, payment_date, created_at')
          .in('voucher_no', numbers)
      : { data: [] as Array<PayrollVoucherLike & { voucher_no: string | null }> }
    const byNo = new Map<string, PayrollVoucherLike>()
    for (const v of (vouchers ?? []) as Array<PayrollVoucherLike & { voucher_no: string | null }>) {
      if (v.voucher_no) byNo.set(v.voucher_no, v)
    }
    shown = foldPayrollPoolRows(rows, byNo)
  }

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

      {shown.length === 0 ? (
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
              {shown.map((row) => {
                const isIn = ['np_in', 'void_in', 'jv_in'].includes(row.transaction_type as string)
                const signed = isIn ? Number(row.amount) : -Number(row.amount)
                const locked = 'locked' in row && row.locked
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
                      {locked ? (
                        <span title="这个帐号看不到里面每个人的明细">
                          <span className="inline-block w-3 mr-1.5 align-[-1px] text-muted [&>svg]:w-3 [&>svg]:h-3">
                            <SheetIcon name="lock" />
                          </span>
                          {row.description}
                        </span>
                      ) : (
                        row.description ?? '—'
                      )}
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
