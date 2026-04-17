import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import ApproveRejectButtons from './_components/ApproveRejectButtons'

interface PageProps {
  params: Promise<{ id: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    draft: 'text-graphite',
    submitted: 'text-warning',
    approved: 'text-success',
    paid: 'text-success',
    rejected: 'text-danger',
  }
  return (
    <span className={`${styles[status] ?? 'text-ink'} font-sans text-sm uppercase tracking-wide`}>
      {status}
    </span>
  )
}

export default async function PayrollRunApprovalPage({ params }: PageProps) {
  const user = await requireAuth()
  if (!['principal', 'hr', 'finance'].includes(user.role)) notFound()

  const { id } = await params
  const supabase = await createClient()

  const { data: run } = await supabase
    .from('payroll_runs')
    .select(`
      id, period_month, status,
      marketing_opex_total, hr_opex_total, finance_opex_total,
      director_salary_total, total_amount,
      submitted_by, submitted_at, approved_by, approved_at,
      paid_at, rejected_at, rejection_reason
    `)
    .eq('id', id)
    .maybeSingle()

  if (!run) notFound()

  // Per-employee detail: only for principal + hr (Finance sees aggregates only)
  const canDrillDown = user.role === 'principal' || user.role === 'hr'

  let detailRows: Array<{
    id: string
    employeeName: string
    deptName: string
    gross: number
    net: number
    totalStatEr: number
  }> = []
  let directorRows: Array<{
    id: string
    directorName: string
    gross: number
    net: number
  }> = []

  if (canDrillDown) {
    const { data: hmp } = await supabase
      .from('hr_monthly_payroll')
      .select('id, gross, net, epf_er, socso_er, eis_er, hr_staff_costs(employee_name, departments(name))')
      .eq('period_month', run.period_month)
    detailRows = (hmp ?? []).map(r => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const staff = (r as any).hr_staff_costs
      return {
        id: r.id,
        employeeName: staff?.employee_name ?? '—',
        deptName: staff?.departments?.name ?? '—',
        gross: Number(r.gross),
        net: Number(r.net),
        totalStatEr: Number(r.epf_er) + Number(r.socso_er) + Number(r.eis_er),
      }
    })

    const { data: dp } = await supabase
      .from('director_payouts')
      .select('id, gross_amount, payroll_net, directors(name)')
      .eq('period_month', run.period_month)
    directorRows = (dp ?? []).map(r => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const director = (r as any).directors
      return {
        id: r.id,
        directorName: director?.name ?? '—',
        gross: Number(r.gross_amount ?? 0),
        net: Number(r.payroll_net ?? 0),
      }
    })
  }

  const canAct = user.role === 'principal' && run.status === 'submitted' && run.submitted_by !== user.id

  return (
    <div>
      <Link href="/approvals" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Approvals
      </Link>

      <div className="flex items-baseline justify-between mt-6 mb-8">
        <div>
          <h1 className="font-serif text-3xl text-ink">
            Payroll Run · {formatPeriodLabel(run.period_month)}
          </h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            {statusBadge(run.status)}
            {run.submitted_at && (
              <span className="ml-3 text-muted">
                submitted {new Date(run.submitted_at).toLocaleString('en-MY')}
              </span>
            )}
          </p>
        </div>
        {canAct && (
          <ApproveRejectButtons runId={run.id} totalAmount={Number(run.total_amount)} />
        )}
      </div>

      {run.status === 'rejected' && run.rejection_reason && (
        <div className="mb-8 border-l-4 border-danger bg-danger-surface px-4 py-3">
          <div className="font-serif italic text-danger text-sm uppercase tracking-wide">Rejected</div>
          <div className="font-serif text-ink mt-1">{run.rejection_reason}</div>
        </div>
      )}

      {run.status === 'paid' && run.paid_at && (
        <div className="mb-8 border-l-4 border-success bg-surface px-4 py-3">
          <div className="font-serif italic text-success text-sm uppercase tracking-wide">Paid</div>
          <div className="font-serif text-graphite mt-1">
            Approved {new Date(run.approved_at!).toLocaleString('en-MY')} · payment date {new Date(run.paid_at).toLocaleDateString('en-MY')}
          </div>
        </div>
      )}

      {/* 4-OPEX summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <OpexCard label="Marketing OPEX" amount={Number(run.marketing_opex_total)} />
        <OpexCard label="HR OPEX" amount={Number(run.hr_opex_total)} />
        <OpexCard label="Finance OPEX" amount={Number(run.finance_opex_total)} />
        <OpexCard label="Director Salary" amount={Number(run.director_salary_total)} />
      </div>
      <div className="border-y border-hairline py-4 mb-10 flex items-baseline justify-between">
        <span className="font-serif italic text-graphite text-sm uppercase tracking-wide">
          Total payroll outflow
        </span>
        <span className="font-mono tabular text-2xl text-ink font-semibold">
          {formatMoney(Number(run.total_amount))}
        </span>
      </div>

      {canDrillDown ? (
        <>
          {detailRows.length > 0 && (
            <div className="mb-10">
              <h2 className="font-serif text-lg text-ink mb-4">Staff</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-2 pr-4 font-medium">Name</th>
                    <th className="text-left py-2 pr-4 font-medium">Dept</th>
                    <th className="text-right py-2 pr-4 font-medium">Gross</th>
                    <th className="text-right py-2 pr-4 font-medium">Stat ER</th>
                    <th className="text-right py-2 pr-4 font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map(r => (
                    <tr key={r.id} className="border-b border-hairline last:border-0">
                      <td className="py-2 pr-4 font-serif text-ink">{r.employeeName}</td>
                      <td className="py-2 pr-4 font-serif italic text-graphite">{r.deptName}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular text-ink">{formatMoney(r.gross)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular text-graphite">{formatMoney(r.totalStatEr)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular text-ink font-medium">{formatMoney(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {directorRows.length > 0 && (
            <div className="mb-10">
              <h2 className="font-serif text-lg text-ink mb-4">Directors</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-2 pr-4 font-medium">Name</th>
                    <th className="text-right py-2 pr-4 font-medium">Gross</th>
                    <th className="text-right py-2 pr-4 font-medium">Payroll Net</th>
                  </tr>
                </thead>
                <tbody>
                  {directorRows.map(r => (
                    <tr key={r.id} className="border-b border-hairline last:border-0">
                      <td className="py-2 pr-4 font-serif text-ink">{r.directorName}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular text-graphite">{formatMoney(r.gross)}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular text-ink font-medium">{formatMoney(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="mb-10 py-8 border border-hairline rounded-md bg-surface px-6 text-center">
          <p className="font-serif italic text-graphite">
            Finance sees the 4 OPEX totals above. Per-employee salary detail is restricted to Principal and HR (PDPA).
          </p>
        </div>
      )}
    </div>
  )
}

function OpexCard({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="border border-hairline rounded-md p-4 bg-surface">
      <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">{label}</div>
      <div className="font-mono tabular text-xl text-ink mt-2">{formatMoney(amount)}</div>
    </div>
  )
}
