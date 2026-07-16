import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { executeHrCosting } from '../../hr-costing/actions'

interface DeptSummaryRow {
  department_id?: string
  staff_count?: number
  total_basic?: number
  total_statutory?: number
  total_allowance?: number
  total_ctc?: number
}

interface SubmissionRow {
  id: string
  period_month: string
  submitted_at: string
  submitted_by_name: string | null
  execution_state: string
  dept_summaries: Record<string, DeptSummaryRow> | null
}

function executionLabel(state: string): { text: string; className: string } {
  switch (state) {
    case 'pending':
      return { text: 'Pending Principal', className: 'text-warning' }
    case 'approved_for_execution':
      return { text: 'Approved', className: 'text-accent' }
    case 'executed':
      return { text: 'Executed', className: 'text-success' }
    default:
      return { text: state, className: 'text-muted' }
  }
}

export default async function PastMonthSubmissionsPage() {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()

  const { data: raw } = await supabase.rpc('get_hr_cost_submissions_list')
  const submissions = ((raw ?? []) as unknown) as SubmissionRow[]

  return (
    <div>
      <Link
        href="/dept-pool"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Department Pools
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · HR COST SUBMISSIONS
          </div>
          <h1 className="page-title">HR Past Month Submission</h1>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg">No submissions yet.</p>
          <p className="font-serif italic text-muted text-sm mt-2">
            HR submits the monthly snapshot from <em>HR Costing</em>.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {submissions.map(sub => {
            const depts = Object.entries(sub.dept_summaries ?? {}).sort((a, b) =>
              Number(b[1].total_ctc ?? 0) - Number(a[1].total_ctc ?? 0),
            )
            const total = depts.reduce(
              (acc, [, d]) => acc + Number(d.total_ctc ?? 0),
              0,
            )
            const label = executionLabel(sub.execution_state)
            return (
              <details
                key={sub.id}
                className="border border-hairline rounded-md bg-surface"
              >
                <summary className="cursor-pointer px-5 py-4 flex items-baseline justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-serif text-lg text-ink">
                      {dayjs(sub.period_month).format('MMMM YYYY')}
                    </div>
                    <div className="font-mono text-xs text-muted mt-1">
                      Submitted {dayjs(sub.submitted_at).format('D MMM YYYY · HH:mm')}
                      {sub.submitted_by_name && ` · ${sub.submitted_by_name}`}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-6">
                    <em className={`font-serif italic text-sm ${label.className}`}>
                      {label.text}
                    </em>
                    <span className="num text-num-ink text-xl tracking-[-0.01em]">
                      {formatMoney(total)}
                    </span>
                    {(user.role === 'finance' || user.role === 'principal') && sub.execution_state === 'approved_for_execution' && (
                      <form action={executeHrCosting}>
                        <input type="hidden" name="id" value={sub.id} />
                        <button
                          type="submit"
                          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-md transition-colors"
                        >
                          Mark executed
                        </button>
                      </form>
                    )}
                  </div>
                </summary>

                <div className="border-t border-hairline px-5 pb-5 pt-4">
                  {depts.length === 0 ? (
                    <p className="font-serif italic text-muted text-sm">
                      Empty submission.
                    </p>
                  ) : (
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Department</th>
                          <th className="right">Staff</th>
                          <th className="right">Basic</th>
                          <th className="right">Stat ER</th>
                          <th className="right">Allowance</th>
                          <th className="right">Total CTC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {depts.map(([deptName, d]) => (
                          <tr key={deptName}>
                            <td>
                              <div className="font-serif text-ink">{deptName}</div>
                            </td>
                            <td className="num text-graphite">{d.staff_count ?? 0}</td>
                            <td className="num text-graphite">{formatMoney(Number(d.total_basic ?? 0))}</td>
                            <td className="num text-graphite">{formatMoney(Number(d.total_statutory ?? 0))}</td>
                            <td className="num text-graphite">{formatMoney(Number(d.total_allowance ?? 0))}</td>
                            <td className="num">{formatMoney(Number(d.total_ctc ?? 0))}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-hairline bg-surface-2/40">
                          <td className="font-serif italic text-accent" colSpan={5}>
                            Total
                          </td>
                          <td className="num text-num-ink font-semibold">{formatMoney(total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}
