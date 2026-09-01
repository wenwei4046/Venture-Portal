import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import dayjs from 'dayjs'
import PayslipNav from './_components/PayslipNav'

// Payslip for a director actual-payroll row (InfoTech import). Display-only —
// figures are edited inline on the Director Payroll grid, this page mirrors
// the staff payslip layout for printing/PDF.

interface PageProps {
  params: Promise<{ id: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function DirectorPayslipPage({ params }: PageProps) {
  await requirePermission('director_salary')
  const { id } = await params

  const supabase = await createClient()

  const { data: row } = await supabase
    .from('director_monthly_payroll')
    .select(`
      id, period_month, employee_code, employee_name, dept_name, source,
      basic_salary, statutory_allowance, non_statutory_allowance,
      ot_amount, commission_amount, no_pay_amount,
      deduction_amount, skbbk_amount,
      epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb,
      gross, net,
      directors (code, name)
    `)
    .eq('id', id)
    .maybeSingle()

  if (!row) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const director = (row as any).directors

  const totalDeductions =
    Number(row.epf_ee) + Number(row.socso_ee) + Number(row.eis_ee) + Number(row.pcb) +
    Number(row.skbbk_amount ?? 0)
  const totalEr = Number(row.epf_er) + Number(row.socso_er) + Number(row.eis_er)

  return (
    <div className="payslip-container max-w-3xl mx-auto p-8 print:p-0 print:max-w-full">
      <PayslipNav backHref={`/director-salary?period=${dayjs(row.period_month).format('YYYY-MM')}`} />

      <div className="border-2 border-ink rounded-none p-8 print:border print:p-6 bg-paper">
        {/* Company header */}
        <div className="text-center mb-6 pb-4 border-b border-hairline">
          <div className="font-serif text-xl text-ink tracking-wide">HOUZS VENTURE SDN BHD</div>
          <div className="font-serif italic text-graphite text-sm mt-1">
            Director Payslip · {formatPeriodLabel(row.period_month)}
          </div>
        </div>

        {/* Director block */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">Director</div>
            <div className="font-serif text-md text-ink mt-0.5">{row.employee_name}</div>
            <div className="font-mono text-xs text-graphite">
              {director?.code ? `${director.code}` : 'unmatched'}
              {row.employee_code ? ` · Code: ${row.employee_code}` : ''}
            </div>
          </div>
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">Department</div>
            <div className="font-serif text-md text-ink mt-0.5">{row.dept_name || '—'}</div>
          </div>
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">Period</div>
            <div className="font-mono text-sm text-ink mt-0.5">{row.period_month}</div>
          </div>
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">Source</div>
            <div className="font-mono text-sm text-ink mt-0.5 uppercase">{row.source}</div>
          </div>
        </div>

        {/* Earnings */}
        <section className="mb-5">
          <div className="font-serif italic text-graphite text-sm uppercase tracking-wide mb-2 pb-1 border-b border-hairline">
            Earnings
          </div>
          <div className="space-y-1 text-sm">
            <Line label="Basic Salary" value={row.basic_salary} />
            <Line label="Statutory Allowance" value={row.statutory_allowance} />
            <Line label="Non-Statutory Allowance" value={row.non_statutory_allowance} />
            <Line label="OT" value={row.ot_amount} />
            <Line label="Commission" value={row.commission_amount} />
            {Number(row.no_pay_amount) > 0 && (
              <Line label="No Pay" value={-Number(row.no_pay_amount)} />
            )}
            {Number(row.deduction_amount) > 0 && (
              <Line label="Deduction" value={-Number(row.deduction_amount)} />
            )}
            <div className="border-t border-hairline pt-2 mt-2 flex justify-between">
              <span className="font-serif text-ink">Gross Pay</span>
              <span className="num text-num-ink font-semibold">{formatMoney(Number(row.gross))}</span>
            </div>
          </div>
        </section>

        {/* Deductions */}
        <section className="mb-5">
          <div className="font-serif italic text-graphite text-sm uppercase tracking-wide mb-2 pb-1 border-b border-hairline">
            Deductions
          </div>
          <div className="space-y-1 text-sm">
            <Line label="EPF (Employee)" value={row.epf_ee} />
            <Line label="SOCSO (Employee)" value={row.socso_ee} />
            <Line label="EIS (Employee)" value={row.eis_ee} />
            <Line label="PCB" value={row.pcb} />
            {Number(row.skbbk_amount ?? 0) > 0 && <Line label="SKBBK" value={row.skbbk_amount} />}
            <div className="border-t border-hairline pt-2 mt-2 flex justify-between">
              <span className="font-serif text-ink">Total Deductions</span>
              <span className="num text-num-ink font-semibold">{formatMoney(totalDeductions)}</span>
            </div>
          </div>
        </section>

        {/* Net pay */}
        <section className="mb-6 pt-3 border-t-2 border-ink">
          <div className="flex justify-between items-baseline">
            <span className="font-serif text-lg text-ink">Net Pay</span>
            <span className="num text-num-ink text-2xl font-semibold tracking-[-0.01em]">
              {formatMoney(Number(row.net))}
            </span>
          </div>
          <div className="font-serif italic text-graphite text-xs mt-1">
            Figures imported verbatim from the InfoTech payroll run
            {row.source === 'manual' ? ' (manually adjusted in the portal)' : ''}.
          </div>
        </section>

        {/* Employer contributions (informational) */}
        <section className="mb-6 pt-3 border-t border-hairline">
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide mb-2">
            Employer Contributions <span className="italic normal-case">(paid on your behalf, not deducted from you)</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-graphite">EPF ER</div>
              <div className="num">{formatMoney(Number(row.epf_er))}</div>
            </div>
            <div>
              <div className="text-xs text-graphite">SOCSO ER</div>
              <div className="num">{formatMoney(Number(row.socso_er))}</div>
            </div>
            <div>
              <div className="text-xs text-graphite">EIS ER</div>
              <div className="num">{formatMoney(Number(row.eis_er))}</div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-hairline flex justify-between">
            <span className="text-xs text-graphite">Total Employer Contribution</span>
            <span className="num text-graphite text-sm">{formatMoney(totalEr)}</span>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pt-4 border-t border-hairline">
          <div className="font-mono text-xs text-muted mt-1">
            Generated {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}HOUZS Venture Portal
          </div>
        </div>
      </div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="flex justify-between">
      <span className="font-sans text-graphite">{label}</span>
      <span className="num">{formatMoney(Number(value ?? 0))}</span>
    </div>
  )
}
