import { notFound } from 'next/navigation'
import { officeTime } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney, formatIntlDate } from '@/lib/utils'
import { OFFICE_TZ } from '@/lib/office-clock'
import { calculateRevenuePayrollSplit } from '@/lib/revenue-payroll'
import { normalisePayLine, payLineKind, payLineLabel } from '@/lib/revenue-pay-lines'
import { round2 } from '@/lib/payroll-funding'
import PrintButton from './_components/PrintButton'
import EditableStatLine from './_components/EditableStatLine'
import ResetStaffStatutoryButton from './_components/ResetStaffStatutoryButton'
import RevenuePayoutBreakdown from '../../../_components/RevenuePayoutBreakdown'

interface PageProps {
  params: Promise<{ period: string; staffId: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function roundProrataRatio(ratio: number): number {
  return Math.round(ratio * 1_000_000) / 1_000_000
}

// The slip's lettering, in the sheet's tone: small caps for a fact's label
// and for a section's head, upright throughout.
const FACT_LABEL = 'text-[10px] font-medium uppercase tracking-[0.08em]'
const SECTION_HEAD = 'text-[11px] font-bold uppercase tracking-[0.1em]'

// A row's status as a word on a wash: amber while HR can still edit it, grey
// once submitted (read only), green once paid.
const STATUS_TONE: Record<string, string> = {
  draft: 'alert',
  submitted: 'info',
  paid: 'ledger',
}

export default async function PayslipPage({ params }: PageProps) {
  await requirePermission('hr_costing')
  const { period, staffId } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const supabase = await createClient()

  const { data: row } = await supabase
    .from('hr_monthly_payroll')
    .select(`
      id, staff_id, period_month, source,
      basic_salary, statutory_allowance, non_statutory_allowance,
      ot_hours, ot_amount, commission_amount, commission_balance, payout_split_version, basic_pay_net, pcb_override_amount, unpaid_leave_days,
      commission_synced_amount, commission_adjustment_amount, commission_adjustment_reason,
      deduction_amount, skbbk_amount, pay_line_earnings, pay_line_deductions,
      prorata_days_worked, prorata_days_in_month,
      epf_er, epf_ee, socso_er, socso_ee, eis_er, eis_ee, pcb, withholding_tax,
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
  const ratio = row.prorata_days_in_month > 0 ? roundProrataRatio(row.prorata_days_worked / row.prorata_days_in_month) : 0
  const split = row.source === 'commission' && row.commission_balance != null ? calculateRevenuePayrollSplit(row) : null
  const netBasicSplit = row.payout_split_version === 2

  // A Revenue row's pay lines (2026-09-27) — a special claim, an allowance, an
  // incentive, a deduction, typed on the salesperson's ledger on Comm Cal. The
  // row carries only their totals; the slip names each one.
  const payLineEarnings = Number(row.pay_line_earnings ?? 0)
  const payLineDeductions = Number(row.pay_line_deductions ?? 0)
  const { data: lineRows, error: lineError } = row.source === 'commission' && (payLineEarnings > 0 || payLineDeductions > 0)
    ? await supabase
        .from('revenue_pay_lines')
        .select('id, staff_id, kind, description, amount, version, claim_id')
        .eq('staff_id', staffId)
        .eq('period_month', period)
        .order('sort_order')
        .order('created_at')
    : { data: [], error: null }
  if (lineError) throw new Error(`Could not load the pay lines: ${lineError.message}`)
  const payLines = (lineRows ?? []).map(normalisePayLine)
  const earningLines = payLines.filter(line => !payLineKind(line.kind).deduction)
  const deductionLines = payLines.filter(line => payLineKind(line.kind).deduction)

  // PCB and Withholding Tax are mutually exclusive — whichever the staff record
  // selects applies and the other is 0 — but both belong in the total, or a
  // Revenue salesperson's payslip would show a Net Pay that does not equal
  // Gross minus Total Deductions. Deduction pay lines come off net the same way.
  const withholding = Number(row.withholding_tax ?? 0)
  const totalDeductions =
    Number(row.epf_ee) + Number(row.socso_ee) + Number(row.eis_ee) + Number(row.pcb) +
    withholding + Number(row.skbbk_amount ?? 0) + payLineDeductions
  const totalEr = Number(row.epf_er) + Number(row.socso_er) + Number(row.eis_er)

  const prorated = `${row.prorata_days_worked}/${row.prorata_days_in_month} days`

  return (
    <div className="payslip-container max-w-3xl mx-auto p-8 print:p-0 print:max-w-full">
      <PrintButton />

      {/* A document on the sheet: a hairline card on screen; on paper the
          same thin ink frame and square corners it always printed with. */}
      <div className="border border-hairline rounded-card p-8 print:border print:border-ink print:rounded-none print:p-6 bg-surface">
        {/* Company header */}
        <div className="text-center mb-6 pb-4 border-b border-hairline">
          <div className="text-lg font-bold tracking-[0.06em]">HOUZS VENTURE SDN BHD</div>
          <div className="text-sm mt-1">Payslip · {formatPeriodLabel(period)}</div>
        </div>

        {/* Employee block */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <div className={FACT_LABEL}>Employee</div>
            <div className="text-md font-medium mt-0.5">{staff.employee_name}</div>
            {staff.employee_code && (
              <div className="font-mono text-xs">Code: {staff.employee_code}</div>
            )}
          </div>
          <div>
            <div className={FACT_LABEL}>Department</div>
            <div className="text-md font-medium mt-0.5">{deptName}</div>
          </div>
          <div>
            <div className={FACT_LABEL}>Period</div>
            <div className="font-mono text-sm text-ink mt-0.5">{row.period_month}</div>
          </div>
          <div>
            <div className={FACT_LABEL}>Days Worked</div>
            <div className="font-mono text-sm text-ink mt-0.5">{prorated}</div>
          </div>
          <div>
            <div className={FACT_LABEL}>EPF Part</div>
            <div className="font-mono text-sm text-ink mt-0.5">{staff.epf_category}</div>
          </div>
          <div>
            <div className={FACT_LABEL}>SOCSO Cat</div>
            <div className="font-mono text-sm text-ink mt-0.5">{staff.socso_category}</div>
          </div>
        </div>

        {/* Earnings */}
        <section className="mb-5">
          <div className={`${SECTION_HEAD} mb-2 pb-1 border-b border-hairline`}>
            Earnings
          </div>
          <div className="space-y-1 text-sm">
            <Line label="Basic Salary" value={split ? split.basicGross : row.basic_salary} />
            <Line label="Statutory Allowance" value={split ? round2(Number(row.statutory_allowance) * ratio) : row.statutory_allowance} />
            <Line label="Non-Statutory Allowance" value={row.non_statutory_allowance} />
            <Line label={`OT (${row.ot_hours} hrs)`} value={split ? round2(Number(row.ot_amount) * ratio) : row.ot_amount} />
            <Line label={netBasicSplit ? 'Commission after basic and employer statutory' : split ? 'Commission after basic and employer EPF' : 'Commission'} value={netBasicSplit && split
              ? round2(Number(row.commission_amount) - split.basicGross - totalEr)
              : split ? round2(split.commissionBalance + Number(row.epf_ee)) : row.commission_amount} />
            {earningLines.map(line => <Line key={line.id} label={payLineLabel(line)} value={line.amount} />)}
            {Number(row.unpaid_leave_days) > 0 && (
              <Line label={`Unpaid Leave (${row.unpaid_leave_days} days)`} value={0} muted />
            )}
            {Number(row.deduction_amount) > 0 && (
              <Line label="Deduction" value={-Number(row.deduction_amount)} />
            )}
            <div className="border-t border-hairline pt-2 mt-2 flex justify-between">
              <span className="font-bold">Gross Pay</span>
              <span className="num text-num-ink font-bold">{formatMoney(Number(row.gross))}</span>
            </div>
          </div>
        </section>

        {split && (
          <section className="mb-5 border border-hairline rounded-lg p-4 print:rounded-none">
            <h2 className={`${SECTION_HEAD} mb-2`}>Revenue pay split</h2>
            <div className="space-y-1 text-sm">
              <Line label="Gross commission · after adjustments" value={row.commission_amount} />
              <Line label={netBasicSplit ? 'Net basic · salary PV' : 'Basic pay'} value={split.basicPay} />
              <Line label="Commission balance" value={split.commissionBalance} />
              {netBasicSplit && <Line label="Total to employee" value={split.totalPayout} />}
            </div>
            {netBasicSplit ? <RevenuePayoutBreakdown row={row} /> : <p className="text-xs mt-3">
              Commission balance = gross commission − basic pay − employer EPF − employee EPF.
              Employee EPF is included in this split once. Other allowances, deductions and tax are reflected in Net Pay below.
            </p>}
            {split.shortfall > 0 && <p className="text-danger text-xs mt-2">Commission shortfall: {formatMoney(split.shortfall)}. Resolve before submitting payroll.</p>}
            {split.basicShortfall > 0 && <p className="text-danger text-xs mt-2">Basic deductions exceed basic salary: {formatMoney(split.basicShortfall)}. Resolve before submitting payroll.</p>}
          </section>
        )}

        {/* Deductions */}
        <section className="mb-5">
          <div className={`${SECTION_HEAD} mb-2 pb-1 border-b border-hairline`}>
            Deductions
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-baseline justify-between">
              <span>EPF (Employee)</span>
              <EditableStatLine payrollId={row.id} field="epf_ee" value={Number(row.epf_ee)} readOnly={row.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span>SOCSO (Employee)</span>
              <EditableStatLine payrollId={row.id} field="socso_ee" value={Number(row.socso_ee)} readOnly={row.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span>EIS (Employee)</span>
              <EditableStatLine payrollId={row.id} field="eis_ee" value={Number(row.eis_ee)} readOnly={row.status !== 'draft'} />
            </div>
            {withholding > 0 ? (
              <div className="flex items-baseline justify-between">
                <span>Withholding Tax</span>
                <span className="num">{formatMoney(withholding)}</span>
              </div>
            ) : (
              <div className="flex items-baseline justify-between">
                <span>PCB ({staff.pcb_category})</span>
                <EditableStatLine payrollId={row.id} field="pcb" value={Number(row.pcb)} readOnly={row.status !== 'draft'} />
              </div>
            )}
            {Number(row.skbbk_amount ?? 0) > 0 && (
              <div className="flex items-baseline justify-between">
                <span>SKBBK</span>
                <span className="num">{formatMoney(Number(row.skbbk_amount))}</span>
              </div>
            )}
            {deductionLines.map(line => (
              <div key={line.id} className="flex items-baseline justify-between">
                <span>{payLineLabel(line)}</span>
                <span className="num">{formatMoney(line.amount)}</span>
              </div>
            ))}
            <div className="border-t border-hairline pt-2 mt-2 flex justify-between">
              <span className="font-bold">Total Deductions</span>
              <span className="num text-num-ink font-bold">{formatMoney(totalDeductions)}</span>
            </div>
            {row.status === 'draft' && row.statutory_overridden_at ? (
              <ResetStaffStatutoryButton
                payrollId={row.id}
                overridden={true}
                overriddenLabel={officeTime(row.statutory_overridden_at).format('D MMM YYYY HH:mm')}
              />
            ) : null}
          </div>
        </section>

        {/* Net pay — the figure the slip is for, under the document's one
            heavy rule (it prints). */}
        <section className="mb-6 pt-3 border-t-2 border-ink">
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-bold">Net Pay</span>
            <span className="num text-num-ink text-2xl font-bold tracking-[-0.01em]">
              {formatMoney(Number(row.net))}
            </span>
          </div>
          <div className="text-xs mt-1">
            Credited to the employee&apos;s bank account on payroll approval.
          </div>
        </section>

        {/* Employer contributions (informational) */}
        <section className="mb-6 pt-3 border-t border-hairline">
          <div className={`${SECTION_HEAD} mb-2`}>
            Employer Contributions <span className="font-normal normal-case tracking-normal">{split ? '(employer EPF funded from gross commission)' : '(paid on your behalf, not deducted from you)'}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs">EPF ER</div>
              <div><EditableStatLine payrollId={row.id} field="epf_er" value={Number(row.epf_er)} readOnly={row.status !== 'draft'} /></div>
            </div>
            <div>
              <div className="text-xs">SOCSO ER</div>
              <div><EditableStatLine payrollId={row.id} field="socso_er" value={Number(row.socso_er)} readOnly={row.status !== 'draft'} /></div>
            </div>
            <div>
              <div className="text-xs">EIS ER</div>
              <div><EditableStatLine payrollId={row.id} field="eis_er" value={Number(row.eis_er)} readOnly={row.status !== 'draft'} /></div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-hairline flex justify-between">
            <span className="text-xs">Total Employer Contribution</span>
            <span className="num text-sm">{formatMoney(totalEr)}</span>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center pt-4 border-t border-hairline">
          <div className="text-xs">
            Status: <span className={`chip ${STATUS_TONE[row.status] ?? ''}`}><span className="dot" />{row.status}</span>
            {row.status === 'paid' && ' · This payslip is final.'}
          </div>
          <div className="font-mono text-xs mt-1">
            Generated {formatIntlDate(new Date(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: OFFICE_TZ })}
            {' · '}HOUZS Venture Portal
          </div>
        </div>
      </div>
    </div>
  )
}

// A muted line (unpaid leave, shown for the record at 0.00) steps down a size
// rather than turning grey: the sheet's lettering is black throughout.
function Line({ label, value, muted }: { label: string; value: number | string | null; muted?: boolean }) {
  return (
    <div className={`flex justify-between${muted ? ' text-xs' : ''}`}>
      <span>{label}</span>
      <span className={`num${muted ? ' text-xs font-normal' : ''}`}>{formatMoney(Number(value ?? 0))}</span>
    </div>
  )
}
