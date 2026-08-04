import Link from 'next/link'
import dayjs from 'dayjs'

export interface StatutoryPeriod {
  period_month: string
  /** Existing non-voided statutory PVs for this period's run. */
  pvs: {
    id: string
    voucher_no: string | null
    payee_name: string | null
    amount: number
    status: string
    payment_date: string | null
  }[]
}

interface Props {
  periods: StatutoryPeriod[]
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Read-only view for Finance (mig 20260721000000): HR generates and dates the
 * statutory vouchers on hr-costing → Payment (HR makes those payments in real
 * life); Finance sees status here.
 */
export default function StatutorySection({ periods }: Props) {
  if (periods.length === 0) return null

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif text-2xl text-ink">Statutory payments</h2>
        <span className="font-mono text-xs text-muted">KWSP · SOCSO · EIS · LHDN · SKBBK</span>
      </div>
      <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
        {periods.map(p => (
          <div key={p.period_month} className="px-5 py-4">
            <div className="font-serif text-md text-ink">
              {dayjs(p.period_month).format('MMMM YYYY')} payroll
            </div>
            {p.pvs.length === 0 ? (
              <div className="font-serif italic text-graphite text-sm mt-0.5">
                Not generated yet — HR creates these on HR Costing → Payment.
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {p.pvs.map(v => (
                  <Link
                    key={v.id}
                    href={`/payments/${v.id}`}
                    className="font-mono text-xs text-accent hover:text-accent-hover"
                  >
                    {v.voucher_no ?? 'PV'} · {v.payee_name ?? '—'} · RM {fmt(v.amount)}
                    {v.payment_date ? ` · ${v.payment_date}` : ' · date TBD'}
                    {v.status === 'paid' ? ' ✓' : ''} →
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
