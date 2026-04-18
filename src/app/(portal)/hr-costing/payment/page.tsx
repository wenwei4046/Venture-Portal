import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import RequestPayrollPaymentButton, {
  type RequestState,
} from '../payroll/_components/RequestPayrollPaymentButton'
import CreateDisbursementButton from './_components/CreateDisbursementButton'

function currentPeriod(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

interface DeptBreakdown {
  dept_name: string
  staff_count: number
  total_net: number
  total_gross: number
}

export default async function HRPaymentPage() {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const period = currentPeriod()

  const [{ data: run }, { data: hrDept }, { data: payrollRows }] = await Promise.all([
    supabase
      .from('payroll_runs')
      .select('id, status, total_amount, rejection_reason')
      .eq('period_month', period)
      .maybeSingle(),
    supabase
      .from('departments')
      .select('id')
      .eq('name', 'HR')
      .single(),
    supabase
      .from('hr_monthly_payroll')
      .select('id, net, gross, status, hr_staff_costs(employee_name, departments(name))')
      .eq('period_month', period),
  ])

  const { data: poolRow } = hrDept
    ? await supabase
        .from('dept_pool_balances')
        .select('balance')
        .eq('department_id', hrDept.id)
        .maybeSingle()
    : { data: null }
  const poolBal = Number(poolRow?.balance ?? 0)
  const rows = payrollRows ?? []
  const totalNet = rows.reduce((s, r) => s + Number(r.net), 0)
  const totalGross = rows.reduce((s, r) => s + Number(r.gross), 0)
  const totalAmount = Number(run?.total_amount ?? totalGross)
  const staffCount = rows.length
  const hasPayroll = staffCount > 0

  // ── Per-department breakdown ──────────────────────────────────────────────
  const byDept = new Map<string, DeptBreakdown>()
  for (const r of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (r as any).hr_staff_costs
    const deptName = staff?.departments?.name ?? '—'
    if (!byDept.has(deptName)) {
      byDept.set(deptName, {
        dept_name: deptName,
        staff_count: 0,
        total_net: 0,
        total_gross: 0,
      })
    }
    const b = byDept.get(deptName)!
    b.staff_count++
    b.total_net += Number(r.net)
    b.total_gross += Number(r.gross)
  }
  const deptBreakdown = Array.from(byDept.values()).sort(
    (a, b) => b.total_gross - a.total_gross,
  )

  // ── Funding-request state ─────────────────────────────────────────────────
  const { data: requestRow } = run
    ? await supabase
        .from('payroll_payment_requests')
        .select('id, status, pv_id, requested_at')
        .eq('payroll_run_id', run.id)
        .in('status', ['submitted', 'pv_generated', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  // ── Disbursement voucher state — check if batch already generated ─────────
  const payrollIds = rows.map(r => r.id as string)
  const { data: disbursementVouchers } = payrollIds.length
    ? await supabase
        .from('payment_vouchers')
        .select('id, reference_id')
        .eq('reference_type', 'payroll_disbursement')
        .in('reference_id', payrollIds)
    : { data: null }
  const disbursementCount = disbursementVouchers?.length ?? 0
  const alreadyDisbursed = disbursementCount > 0

  // Find the approval group_id for the batch
  let disbursementGroupId: string | null = null
  if (alreadyDisbursed && disbursementVouchers && disbursementVouchers.length > 0) {
    const voucherIds = disbursementVouchers.map(v => v.id as string)
    const { data: approvalRow } = await supabase
      .from('approval_requests')
      .select('group_id')
      .in('reference_id', voucherIds)
      .eq('reference_table', 'payment_vouchers')
      .not('group_id', 'is', null)
      .limit(1)
      .maybeSingle()
    disbursementGroupId = approvalRow?.group_id ?? null
  }

  type Phase =
    | 'no-payroll'
    | 'drafts-pending'
    | 'awaiting-approval'
    | 'rejected'
    | 'approved-ready'
    | 'request-submitted'
    | 'pv-generated'
    | 'funded'

  let phase: Phase = 'no-payroll'
  if (!hasPayroll) phase = 'no-payroll'
  else if (!run) phase = 'drafts-pending'
  else if (run.status === 'submitted') phase = 'awaiting-approval'
  else if (run.status === 'rejected') phase = 'rejected'
  else if (run.status === 'approved') {
    if (!requestRow) phase = 'approved-ready'
    else if (requestRow.status === 'submitted') phase = 'request-submitted'
    else if (requestRow.status === 'pv_generated') phase = 'pv-generated'
    else if (requestRow.status === 'completed') phase = 'funded'
  } else if (run.status === 'paid') phase = 'funded'

  let requestState: RequestState = { kind: 'none' }
  if (requestRow) {
    if (requestRow.status === 'submitted') {
      requestState = {
        kind: 'submitted',
        requestId: requestRow.id,
        requestedAt: requestRow.requested_at,
      }
    } else if (requestRow.status === 'pv_generated') {
      requestState = {
        kind: 'pv_generated',
        pvId: requestRow.pv_id ?? '',
        requestId: requestRow.id,
      }
    } else if (requestRow.status === 'completed') {
      requestState = {
        kind: 'completed',
        pvId: requestRow.pv_id ?? '',
        completedAt: null,
      }
    }
  }

  const periodLabel = new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <div>
      <div className="mt-2 mb-10">
        <div className="font-serif italic text-accent text-base mb-1">HR · {periodLabel}</div>
        <h1 className="font-serif text-3xl text-ink">Payment</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Request payroll funding from Finance, then disburse to staff from the HR Pool.
        </p>
      </div>

      {/* Hero — Total Amount + HR Pool balance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10 pb-10 border-b border-hairline">
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide mb-2">
            Total amount this month
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {formatMoney(totalAmount)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {hasPayroll
              ? `${staffCount} staff · ${formatMoney(totalNet)} net`
              : 'No payroll imported yet'}
          </div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-xs uppercase tracking-wide mb-2">
            HR Pool balance
          </div>
          <div
            className={`font-serif text-[44px] md:text-hero leading-none ${
              poolBal >= 0 ? 'text-ink' : 'text-danger'
            }`}
          >
            {formatMoney(poolBal)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            Isolated salary disbursement account
          </div>
        </div>
      </div>

      {/* Per-department breakdown */}
      {hasPayroll && (
        <section className="mb-10">
          <h2 className="font-serif text-xl text-ink mb-1">By department</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Gross is what Finance funds; net is what lands in staff accounts.
          </p>
          <div className="overflow-x-auto border border-hairline rounded-md bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 px-5 font-medium">Department</th>
                  <th className="text-right py-3 px-5 font-medium">Staff</th>
                  <th className="text-right py-3 px-5 font-medium">Net</th>
                  <th className="text-right py-3 px-5 font-medium">Gross</th>
                </tr>
              </thead>
              <tbody>
                {deptBreakdown.map(d => (
                  <tr
                    key={d.dept_name}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="py-3 px-5 font-serif text-md text-ink">
                      {d.dept_name}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular text-graphite">
                      {d.staff_count}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular text-graphite">
                      {formatMoney(d.total_net)}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular font-medium text-ink">
                      {formatMoney(d.total_gross)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-surface-2/40 border-t-2 border-hairline">
                  <td className="py-3 px-5 font-serif italic text-ink">Total</td>
                  <td className="py-3 px-5 text-right font-mono tabular font-semibold text-ink">
                    {staffCount}
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular font-semibold text-ink">
                    {formatMoney(totalNet)}
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular font-semibold text-ink">
                    {formatMoney(totalGross)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Phase-driven action */}
      <div className="mb-12">
        {phase === 'no-payroll' && (
          <div className="py-12 text-center border border-hairline rounded-md bg-surface">
            <p className="font-serif italic text-graphite text-lg mb-4">
              No payroll imported for this month yet.
            </p>
            <Link
              href="/hr-costing/payroll"
              className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Go to Payroll →
            </Link>
          </div>
        )}

        {phase === 'drafts-pending' && (
          <div className="py-12 text-center border border-hairline rounded-md bg-surface">
            <p className="font-serif italic text-graphite text-lg mb-2">
              Payroll hasn&apos;t been submitted to Principal yet.
            </p>
            <p className="font-serif italic text-muted text-sm mb-6">
              Finish editing drafts and click Submit for Approval first.
            </p>
            <Link
              href="/hr-costing/payroll"
              className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Open Payroll grid →
            </Link>
          </div>
        )}

        {phase === 'awaiting-approval' && (
          <div className="py-10 px-6 text-center border border-accent-border rounded-md bg-surface">
            <em className="font-serif italic text-accent text-lg">
              Submitted to Principal — awaiting approval of costing
            </em>
            <p className="font-serif italic text-muted text-sm mt-3">
              You can request payment once Principal approves.
            </p>
          </div>
        )}

        {phase === 'rejected' && (
          <div className="py-10 px-6 text-center border border-danger rounded-md bg-surface">
            <em className="font-serif italic text-danger text-lg">
              Costing rejected by Principal
            </em>
            {run?.rejection_reason && (
              <p className="font-serif italic text-graphite text-sm mt-2">
                Reason: {run.rejection_reason}
              </p>
            )}
            <Link
              href="/hr-costing/payroll"
              className="inline-block mt-4 bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
            >
              Edit &amp; re-submit →
            </Link>
          </div>
        )}

        {(phase === 'approved-ready' ||
          phase === 'request-submitted' ||
          phase === 'pv-generated') &&
          run && (
            <div className="border border-hairline rounded-md bg-surface p-8">
              <h2 className="font-serif text-xl text-ink mb-2">
                Request Fund out from Finance
              </h2>
              <p className="font-serif italic text-graphite text-sm mb-6">
                Finance generates a Payment Voucher for <strong>RM {formatMoney(totalAmount).replace('RM ', '')}</strong>.
                Principal approves the PV and money moves from the HV operating account into the HR Pool.
              </p>
              <RequestPayrollPaymentButton
                runId={run.id}
                totalAmount={totalAmount}
                state={requestState}
              />
            </div>
          )}

        {phase === 'funded' && (
          <div className="border border-ledger/40 bg-surface rounded-md p-8">
            <div className="mb-4">
              <em className="font-serif italic text-ledger text-lg">✓ HR Pool funded</em>
              <p className="font-serif italic text-graphite text-sm mt-1">
                Ready to disburse to staff.
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-hairline">
              <h3 className="font-serif text-md text-ink mb-1">Pay staff</h3>
              <p className="font-serif italic text-graphite text-sm mb-5">
                Generate individual payment vouchers (one per staff, sent to
                Principal for approval as a batch), then download the Alliance
                Bank file for the actual bank transfer.
              </p>

              <div className="mb-5">
                <CreateDisbursementButton
                  period={period}
                  totalNet={totalNet}
                  staffCount={staffCount}
                  alreadyGenerated={alreadyDisbursed}
                  groupId={disbursementGroupId}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-hairline">
                <Link
                  href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance`}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
                >
                  Download Alliance Bank CSV
                </Link>
                <span className="font-serif italic text-muted text-xs">
                  The bank file that actually moves money to staff accounts.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
