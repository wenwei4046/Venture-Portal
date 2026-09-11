import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'

// Each dept has one canonical billing_mode for revenue it issues outward.
const BILLING_MODE: Record<string, string> = {
  HR: 'hr_attribution',
  Finance: 'finance_attribution',
  'Director Office': 'director_office_attribution',
}

interface Props {
  deptId: string
  deptName: string
  period: string // YYYY-MM-01
}

export default async function DeptPnlView({ deptId, deptName, period }: Props) {
  const supabase = await createClient()
  const monthStart = dayjs(period).startOf('month').format('YYYY-MM-DD')
  const nextMonth = dayjs(period).add(1, 'month').startOf('month').format('YYYY-MM-DD')

  const billingMode = BILLING_MODE[deptName]

  const [
    { data: revenueRows },
    { data: settledExpenseRows },
    { data: pendingInvoiceRows },
    { data: directExpenseRows },
  ] = await Promise.all([
    // Revenue: invoices this dept issued this period (any billable_to_type).
    billingMode
      ? supabase
          .from('invoices')
          .select('total_amount')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .eq('billing_mode', billingMode as any)
          .eq('period_month', period)
          .in('status', ['issued', 'paid'])
      : Promise.resolve({ data: [] as { total_amount: string | number }[], error: null }),

    // Settled inter-billing (already in dept_pools after netting settlement).
    supabase
      .from('dept_pools')
      .select('amount, description, created_at')
      .eq('department_id', deptId)
      .eq('transaction_type', 'inter_billing_out')
      .gte('created_at', monthStart)
      .lt('created_at', nextMonth)
      .order('created_at', { ascending: false }),

    // Pending inter-billing: invoices billed TO this dept that haven't been
    // settled yet (status='issued'). These represent accrued obligations —
    // show them so the dept sees the full picture before Finance settles.
    supabase
      .from('invoices')
      .select('id, invoice_no, billing_mode, total_amount, period_month, created_at')
      .eq('billable_to_department_id', deptId)
      .eq('billable_to_type', 'dept_pool')
      .eq('period_month', period)
      .eq('status', 'issued')
      .order('created_at', { ascending: false }),

    // Direct expenses (expense_out rows, e.g. vendor payments from this pool).
    supabase
      .from('dept_pools')
      .select('amount')
      .eq('department_id', deptId)
      .eq('transaction_type', 'expense_out')
      .gte('created_at', monthStart)
      .lt('created_at', nextMonth),
  ])

  const revenue = (revenueRows ?? []).reduce((s, r) => s + Number(r.total_amount), 0)
  const settledIb = (settledExpenseRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const pendingIb = (pendingInvoiceRows ?? []).reduce((s, r) => s + Number(r.total_amount), 0)
  const directExp = (directExpenseRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const totalExpenses = settledIb + pendingIb + directExp
  const net = revenue - totalExpenses

  const BILLING_LABEL: Record<string, string> = {
    marketing_project: 'Marketing',
    hr_attribution: 'HR',
    finance_attribution: 'Finance',
    director_office_attribution: 'Director Office',
  }

  return (
    <div className="space-y-10">
      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-6 border-b border-hairline">
        <Kpi label="Revenue" amount={revenue} subtitle="Invoices issued this period" />
        <Kpi
          label="Inter-billing (settled)"
          amount={-settledIb}
          subtitle="Netting-settled this month"
        />
        <Kpi
          label="Inter-billing (pending)"
          amount={-pendingIb}
          subtitle="Issued, awaiting settlement"
        />
        <Kpi label="Net" amount={net} accent />
      </div>

      {/* Pending invoices table */}
      {(pendingInvoiceRows ?? []).length > 0 ? (
        <section>
          <h2 className="font-serif text-xl text-ink mb-4">Pending charges (not yet settled)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Invoice</th>
                  <th className="text-left py-3 pr-4 font-medium">From dept</th>
                  <th className="text-left py-3 pr-4 font-medium">Period</th>
                  <th className="text-right py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(pendingInvoiceRows ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs text-graphite">
                      {r.invoice_no ?? '—'}
                    </td>
                    <td className="py-3 pr-4 font-serif italic text-graphite">
                      {BILLING_LABEL[r.billing_mode] ?? r.billing_mode}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {dayjs(r.period_month).format('MMM YYYY')}
                    </td>
                    <td className="py-3 text-right font-mono tabular font-medium text-ink">
                      {formatMoney(-Number(r.total_amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section>
          <h2 className="font-serif text-xl text-ink mb-1">Pending charges</h2>
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No pending inter-billing charges this period.
            </p>
          </div>
        </section>
      )}

      {/* Settled inter-billing */}
      {settledIb > 0 ? (
        <section>
          <h2 className="font-serif text-xl text-ink mb-4">Settled charges</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Date</th>
                  <th className="text-left py-3 pr-4 font-medium">Description</th>
                  <th className="text-right py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(settledExpenseRows ?? []).map((r, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {dayjs(r.created_at).format('D MMM YYYY')}
                    </td>
                    <td className="py-3 pr-4 font-serif italic text-graphite">
                      {r.description ?? '—'}
                    </td>
                    <td className="py-3 text-right font-mono tabular font-medium text-ink">
                      {formatMoney(-Number(r.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function Kpi({
  label,
  amount,
  subtitle,
  accent,
}: {
  label: string
  amount: number
  subtitle?: string
  accent?: boolean
}) {
  const colour = accent
    ? amount < 0
      ? 'text-danger'
      : 'text-accent'
    : 'text-ink'
  return (
    <div>
      <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">{label}</div>
      <div className={`statement-amount mt-1 ${colour}`}>{formatMoney(amount)}</div>
      {subtitle ? <p className="font-serif italic text-muted text-xs mt-1">{subtitle}</p> : null}
    </div>
  )
}
