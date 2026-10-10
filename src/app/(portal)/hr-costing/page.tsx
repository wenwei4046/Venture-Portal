import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import Link from 'next/link'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import SubmitHRCostButton from './_components/SubmitHRCostButton'
import { executeHrCosting } from './actions'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import DepartmentModeCard from '@/components/department/DepartmentModeCard'

interface DeptSummary {
  department_id: string
  staff_count: number
  total_basic: number
  total_statutory: number
  total_allowance: number
  total_ctc: number
}

interface LiveDeptRow {
  department_id: string | null
  department_name: string | null
  staff_count: number | null
  total_basic: number | null
  total_statutory: number | null
  total_allowance: number | null
  total_ctc: number | null
}

export default async function HRCostingPage() {
  await requirePage('/hr-costing')
  // Finance no longer accesses this page — they see aggregates on Dept Pool
  // and execute approved snapshots from /dept-pool/submissions.
  const user = await requirePermission('hr_costing')
  const supabase = await createClient()

  const currentPeriod = getPeriodMonth()

  // Live aggregate via Phase 1 RPC — shows what WOULD be snapshotted right now
  const { data: liveRows } = await supabase.rpc('get_hr_cost_summary')

  // Submission history (last 12 periods)
  const { data: submissions } = await supabase
    .from('hr_cost_submissions')
    .select('id, period_month, submitted_at, submitted_by, dept_summaries, execution_state')
    .order('period_month', { ascending: false })
    .limit(12)

  const submissionList = submissions ?? []
  const currentSubmission = submissionList.find(
    (s) => s.period_month === currentPeriod
  )

  // Submitter name lookup
  const submitterIds = Array.from(new Set(submissionList.map((s) => s.submitted_by)))
  const { data: submitterUsers } = submitterIds.length
    ? await supabase.from('users').select('id, name').in('id', submitterIds)
    : { data: [] }
  const submitterName = new Map(
    (submitterUsers ?? []).map((u) => [u.id, u.name as string])
  )

  const liveRowList = (liveRows ?? []) as LiveDeptRow[]

  const liveTotals = liveRowList.reduce(
    (acc, row) => {
      acc.staff_count += Number(row.staff_count ?? 0)
      acc.total_basic += Number(row.total_basic ?? 0)
      acc.total_statutory += Number(row.total_statutory ?? 0)
      acc.total_allowance += Number(row.total_allowance ?? 0)
      acc.total_ctc += Number(row.total_ctc ?? 0)
      return acc
    },
    {
      staff_count: 0,
      total_basic: 0,
      total_statutory: 0,
      total_allowance: 0,
      total_ctc: 0,
    }
  )

  // The submission is raised in HR Costing; executing it is Treasury's (2026-10-08, PR2).
  const canSubmit = canDo(user, 'hr_costing', 'create')
  const canExecute = canDo(user, 'treasury', 'edit')

  const monthLabel = dayjs(currentPeriod).format('MMMM YYYY')

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · MONTHLY COSTING · {monthLabel.toUpperCase()}
          </div>
          <h1 className="page-title">HR Costing</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/team/people"
            className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            Manage Staff
          </Link>
          {/* Monthly Payroll is navigation, not a decision. Keep it as an
              outline button so the one orange action stays reserved for the
              Submit button below (the terminal decision in this flow). */}
          <Link
            href="/hr-costing/payroll"
            className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            Monthly Payroll
          </Link>
          {canSubmit && !currentSubmission ? (
            <SubmitHRCostButton defaultPeriod={currentPeriod} />
          ) : null}
        </div>
      </div>

      {/* Cost center or centralized — HR's own switch (2026-09-30). */}
      <DepartmentModeCard segmentKey="hr" />

      {/* ───────── The month in five figures ─────────
          Total CTC is the figure the page is opened for, so it is the sheet's
          one walnut card — the sum of the three before it. */}
      <StatCards label={`HR cost for ${monthLabel}`}>
        <StatCard label="Basic" value={formatMoney(liveTotals.total_basic)} icon="wallet" note="Contract basic pay" />
        <StatCard label="Statutory" value={formatMoney(liveTotals.total_statutory)} icon="shield" note="Employer EPF · SOCSO · EIS" />
        <StatCard label="Allowance" value={formatMoney(liveTotals.total_allowance)} icon="gift" />
        <StatCard
          label="Total CTC"
          value={formatMoney(liveTotals.total_ctc)}
          icon="coin"
          tone="primary"
          note={
            currentSubmission
              ? `Snapshotted ${officeTime(currentSubmission.submitted_at).format('D MMM HH:mm')} by ${submitterName.get(currentSubmission.submitted_by) ?? '—'}`
              : `Live preview · ${monthLabel}`
          }
        />
        <StatCard
          label="Active staff"
          value={String(liveTotals.staff_count)}
          icon="people"
          note={`${liveRowList.length} ${liveRowList.length === 1 ? 'department' : 'departments'}`}
        />
      </StatCards>

      {/* ───────── Live aggregate by department (HR + Principal only) ───────── */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>By department</h2>
          <span className="rule" aria-hidden />
          <span className="count">LIVE · HR + PRINCIPAL ONLY</span>
        </div>

        {liveRowList.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">
              No active staff on record. Add your first employee from the Staff page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="right m-hide">Staff</th>
                  <th className="right m-hide">Basic</th>
                  <th className="right m-hide">Statutory</th>
                  <th className="right m-hide">Allowance</th>
                  <th className="right">Total CTC</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {liveRowList.map((row) => (
                  <LedgerRow key={row.department_id ?? row.department_name ?? 'unknown'}>
                    <td className="font-medium">
                      {row.department_name ?? '—'}
                    </td>
                    <td className="num m-hide" data-label="Staff">{row.staff_count ?? 0}</td>
                    <td className="num m-hide" data-label="Basic">{formatMoney(Number(row.total_basic ?? 0))}</td>
                    <td className="num m-hide" data-label="Statutory">{formatMoney(Number(row.total_statutory ?? 0))}</td>
                    <td className="num m-hide" data-label="Allowance">{formatMoney(Number(row.total_allowance ?? 0))}</td>
                    <td className="num font-bold">{formatMoney(Number(row.total_ctc ?? 0))}</td>
                  </LedgerRow>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>All departments</td>
                  <td className="num m-hide">{liveTotals.staff_count}</td>
                  <td className="num m-hide">{formatMoney(liveTotals.total_basic)}</td>
                  <td className="num m-hide">{formatMoney(liveTotals.total_statutory)}</td>
                  <td className="num m-hide">{formatMoney(liveTotals.total_allowance)}</td>
                  <td className="num font-bold">{formatMoney(liveTotals.total_ctc)}</td>
                  <td className="lt-toggle" aria-hidden />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ───────── Submission history ───────── */}
      <section>
        <div className="sect-head">
          <h2>Submission history</h2>
          <span className="rule" aria-hidden />
          <span className="count">LAST {Math.min(submissionList.length, 12)} PERIODS · IMMUTABLE</span>
        </div>

        {submissionList.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">
              No submissions yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="m-hide">Submitted by</th>
                  <th className="m-hide">State</th>
                  <th className="right m-hide">Basic</th>
                  <th className="right">Total CTC</th>
                  <th className="right m-hide"></th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {submissionList.map((s) => {
                  const summaries = ((s.dept_summaries ?? {}) as unknown) as Record<
                    string,
                    DeptSummary
                  >
                  const totalBasic = Object.values(summaries).reduce(
                    (acc, d) => acc + Number(d.total_basic ?? 0),
                    0
                  )
                  const totalCtc = Object.values(summaries).reduce(
                    (acc, d) => acc + Number(d.total_ctc ?? 0),
                    0
                  )
                  const state = s.execution_state ?? 'approved_for_execution'
                  return (
                    <LedgerRow key={s.id}>
                      <td className="font-medium">
                        {dayjs(s.period_month).format('MMMM YYYY')}
                      </td>
                      <td className="m-hide" data-label="Submitted by">
                        {submitterName.get(s.submitted_by) ?? '—'}
                      </td>
                      <td className="m-hide" data-label="State">
                        <StateBadge state={state} />
                      </td>
                      <td className="num m-hide" data-label="Basic">{formatMoney(totalBasic)}</td>
                      <td className="num font-bold">{formatMoney(totalCtc)}</td>
                      <td className="right m-hide">
                        {canExecute && state === 'approved_for_execution' ? (
                          <form action={executeHrCosting}>
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              className="bg-accent hover:bg-accent-hover text-xs font-medium px-3 py-1.5 rounded-control transition-colors"
                            >
                              Execute transfers
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs">—</span>
                        )}
                      </td>
                    </LedgerRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// A state is a word on a wash (the sheet never says a thing in coloured
// lettering alone): amber waits on somebody, orange is ready to act on,
// green is done.
function StateBadge({ state }: { state: string }) {
  if (state === 'pending')
    return <span className="chip alert"><span className="dot" />awaiting Principal</span>
  if (state === 'approved_for_execution')
    return <span className="chip accent"><span className="dot" />ready to execute</span>
  if (state === 'executed')
    return <span className="chip ledger"><span className="dot" />executed</span>
  return <span className="chip"><span className="dot" />{state}</span>
}
