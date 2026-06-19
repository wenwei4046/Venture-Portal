import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import PrintButton from './_components/PrintButton'
import EditableStatLine from './_components/EditableStatLine'
import ResetStaffStatutoryButton from './_components/ResetStaffStatutoryButton'

interface PageProps {
  params: Promise<{ period: string; staffId: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function PayslipPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { period, staffId } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const supabase = await createClient()

  const { data: row } = await supabase
    .from('hr_monthly_payroll')
    .select(`
      id, staff_id, period_month,
      basic_salary, statutory_allowance, non_statutory_allowance,
      ot_hours, ot_amount, commission_amount, unpaid_leave_days,
      prorata_days_worked, prorata_days_in_month,
      epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb,
      gross, net, status, statutory_overridden_at,
      hr_staff_costs (
        employee_name, employee_code, epf_category, socso_category, pcb_category,
        departments(name)
      )
    `)
    .eq('staff_id', staffId)
    .eq('period_month', period)
    .maybeSingle()

  if (!row) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staff = (row as any).hr_staff_costs
  const deptName = staff?.departments?.name ?? '—'

  const totalDeductions = Number(row.epf_ee) + Number(row.socso_ee) + Number(row.eis_ee) + Number(row.pcb)
  const totalEr = Number(row.epf_er) + Number(row.socso_er) + Number(row.eis_er)

  const prorated = `${row.prorata_days_worked}/${row.prorata_days_in_month} days`

  return (
    <div className="payslip-container max-w-3xl mx-auto p-8 print:p-0 print:max-w-full">
      <PrintButton />

      <div className="border-2 border-ink rounded-none p-8 print:border print:p-6 bg-paper">
        {/* Company header */}
        <div className="text-center mb-6 pb-4 border-b border-hairline">
          <div className="font-serif text-xl text-ink tracking-wide">HOUZS VENTURE SDN BHD</div>
          <div className="font-serif italic text-graphite text-sm mt-1">Payslip · {formatPeriodLabel(period)}</div>
        </div>

        {/* Employee block */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">Employee</div>
            <div className="font-serif text-md text-ink mt-0.5">{staff.employee_name}</div>
            {staff.employee_code && (
              <div className="font-mono text-xs text-graphite">Code: {staff.employee_code}</div>
            )}
          </div>
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">Department</div>
            <div className="font-serif text-md text-ink mt-0.5">{deptName}</div>
          </div>
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">Period</div>
            <div className="font-mono text-sm text-ink mt-0.5">{row.period_month}</div>
          </div>
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">Days Worked</div>
            <div className="font-mono text-sm text-ink mt-0.5">{prorated}</div>
          </div>
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">EPF Part</div>
            <div className="font-mono text-sm text-ink mt-0.5">{staff.epf_category}</div>
          </div>
          <div>
            <div className="font-sans text-xs uppercase tracking-wide text-graphite">SOCSO Cat</div>
            <div className="font-mono text-sm text-ink mt-0.5">{staff.socso_category}</div>
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
            <Line label={`OT (${row.ot_hours} hrs)`} value={row.ot_amount} />
            <Line label="Commission" value={row.commission_amount} />
            {Number(row.unpaid_leave_days) > 0 && (
              <Line label={`Unpaid Leave (${row.unpaid_leave_days} days)`} value={0} muted />
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
            <div className="flex items-baseline justify-between">
              <span className="font-serif">EPF (Employee)</span>
              <EditableStatLine payrollId={row.id} field="epf_ee" value={Number(row.epf_ee)} readOnly={row.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif">SOCSO (Employee)</span>
              <EditableStatLine payrollId={row.id} field="socso_ee" value={Number(row.socso_ee)} readOnly={row.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif">EIS (Employee)</span>
              <EditableStatLine payrollId={row.id} field="eis_ee" value={Number(row.eis_ee)} readOnly={row.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif">PCB ({staff.pcb_category})</span>
              <EditableStatLine payrollId={row.id} field="pcb" value={Number(row.pcb)} readOnly={row.status !== 'draft'} />
            </div>
            <div className="border-t border-hairline pt-2 mt-2 flex justify-between">
              <span className="font-serif text-ink">Total Deductions</span>
              <span className="num text-num-ink font-semibold">{formatMoney(totalDeductions)}</span>
            </div>
            {row.status === 'draft' && row.statutory_overridden_at ? (
              <ResetStaffStatutoryButton
                payrollId={row.id}
                overridden={true}
                overriddenLabel={dayjs(row.statutory_overridden_at).format('D MMM YYYY HH:mm')}
              />
            ) : null}
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
            Credited to the employee&apos;s bank account on payroll approval.
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
              <div><EditableStatLine payrollId={row.id} field="epf_er" value={Number(row.epf_er)} readOnly={row.status !== 'draft'} /></div>
            </div>
            <div>
              <div className="text-xs text-graphite">SOCSO ER</div>
              <div><EditableStatLine payrollId={row.id} field="socso_er" value={Number(row.socso_er)} readOnly={row.status !== 'draft'} /></div>
            </div>
            <div>
              <div className="text-xs text-graphite">EIS ER</div>
              <div><EditableStatLine payrollId={row.id} field="eis_er" value={Number(row.eis_er)} readOnly={row.status !== 'draft'} /></div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-hairline flex justify-between">
            <span className="text-xs text-graphite">Total Employer Contribution</span>
            <span className="num text-graphite text-sm">{formatMoney(totalEr)}</span>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pt-4 border-t border-hairline">
          <div className="font-serif italic text-muted text-xs">
            Status: <span className="uppercase tracking-wide">{row.status}</span>
            {row.status === 'paid' && ' · This payslip is final.'}
          </div>
          <div className="font-mono text-xs text-muted mt-1">
            Generated {new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}HOUZS Venture Portal
          </div>
        </div>
      </div>
    </div>
  )
}

function Line({ label, value, muted }: { label: string; value: number | string | null; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={`font-sans ${muted ? 'text-muted italic' : 'text-graphite'}`}>{label}</span>
      <span className={`num ${muted ? 'text-muted' : ''}`}>{formatMoney(Number(value ?? 0))}</span>
    </div>
  )
}
