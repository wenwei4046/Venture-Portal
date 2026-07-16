import dayjs from 'dayjs'
import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import SubmitHRCostButton from './_components/SubmitHRCostButton'
import { executeHrCosting } from './actions'

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
  // Finance no longer accesses this page — they see aggregates on Dept Pool
  // and execute approved snapshots from /dept-pool/submissions.
  const user = await requireRole(['principal', 'hr'])
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

  const canSubmit = user.role === 'hr' || user.role === 'principal'
  const canExecute = user.role === 'finance' || user.role === 'principal'

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · MONTHLY COSTING
          </div>
          <h1 className="page-title">HR Costing</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/hr-costing/staff"
            className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Manage Staff
          </Link>
          {/* Monthly Payroll is navigation, not a decision. Keep it as an
              outline button so the single rust accent stays reserved for the
              Submit button below (the terminal decision in this flow). */}
          <Link
            href="/hr-costing/payroll"
            className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Monthly Payroll
          </Link>
          {canSubmit && !currentSubmission ? (
            <SubmitHRCostButton defaultPeriod={currentPeriod} />
          ) : null}
        </div>
      </div>

      {/* ───────── Current period hero ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            {currentSubmission ? 'Submitted period' : 'Live preview'}
          </div>
          <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tracking-[-0.01em]">
            {dayjs(currentPeriod).format('MMMM YYYY')}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
            {currentSubmission
              ? `SNAPSHOTTED ${dayjs(currentSubmission.submitted_at).format('D MMM HH:mm').toUpperCase()} BY ${(submitterName.get(currentSubmission.submitted_by) ?? '—').toUpperCase()}`
              : `${liveTotals.staff_count} ACTIVE STAFF · ${liveRowList.length} DEPARTMENTS`}
          </div>
        </div>

        <div className="lg:col-span-5 space-y-2">
          <div className="flex items-baseline justify-between font-mono text-sm">
            <em className="font-serif text-md text-graphite">basic</em>
            <span className="text-num-ink tabular font-medium">{formatMoney(liveTotals.total_basic)}</span>
          </div>
          <div className="flex items-baseline justify-between font-mono text-sm">
            <em className="font-serif text-md text-graphite">statutory</em>
            <span className="text-num-ink tabular font-medium">{formatMoney(liveTotals.total_statutory)}</span>
          </div>
          <div className="flex items-baseline justify-between font-mono text-sm">
            <em className="font-serif text-md text-graphite">allowance</em>
            <span className="text-num-ink tabular font-medium">{formatMoney(liveTotals.total_allowance)}</span>
          </div>
          <div className="flex items-baseline justify-between font-mono text-sm border-t border-hairline pt-2 mt-2">
            <em className="font-serif text-md text-ink">total CTC</em>
            <span className="text-num-ink tabular font-semibold">
              {formatMoney(liveTotals.total_ctc)}
            </span>
          </div>
        </div>
      </div>

      {/* ───────── Live aggregate by department (HR + Principal only) ───────── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>By department</h2>
          <span className="rule" aria-hidden />
          <span className="count">LIVE · HR + PRINCIPAL ONLY</span>
        </div>

        {liveRowList.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No active staff on record. Add your first employee from the Staff page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="right">Staff</th>
                  <th className="right">Basic</th>
                  <th className="right">Statutory</th>
                  <th className="right">Allowance</th>
                  <th className="right">Total CTC</th>
                </tr>
              </thead>
              <tbody>
                {liveRowList.map((row) => (
                  <tr key={row.department_id ?? row.department_name ?? 'unknown'}>
                    <td className="font-serif text-[15px] text-ink">
                      {row.department_name ?? '—'}
                    </td>
                    <td className="num">{row.staff_count ?? 0}</td>
                    <td className="num">{formatMoney(Number(row.total_basic ?? 0))}</td>
                    <td className="num">{formatMoney(Number(row.total_statutory ?? 0))}</td>
                    <td className="num">{formatMoney(Number(row.total_allowance ?? 0))}</td>
                    <td className="num font-semibold">{formatMoney(Number(row.total_ctc ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───────── Submission history ───────── */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>Submission history</h2>
          <span className="rule" aria-hidden />
          <span className="count">LAST {Math.min(submissionList.length, 12)} PERIODS · IMMUTABLE</span>
        </div>

        {submissionList.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No submissions yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Submitted by</th>
                  <th>State</th>
                  <th className="right">Basic</th>
                  <th className="right">Total CTC</th>
                  <th className="right"></th>
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
                    <tr key={s.id}>
                      <td className="font-serif text-[15px] text-ink">
                        {dayjs(s.period_month).format('MMMM YYYY')}
                      </td>
                      <td className="font-serif italic text-graphite">
                        {submitterName.get(s.submitted_by) ?? '—'}
                      </td>
                      <td>
                        <StateBadge state={state} />
                      </td>
                      <td className="num">{formatMoney(totalBasic)}</td>
                      <td className="num font-semibold">{formatMoney(totalCtc)}</td>
                      <td className="right">
                        {canExecute && state === 'approved_for_execution' ? (
                          <form action={executeHrCosting}>
                            <input type="hidden" name="id" value={s.id} />
                            <button
                              type="submit"
                              className="text-sm text-accent hover:text-accent-hover font-serif italic transition-colors"
                            >
                              Execute transfers
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs font-mono text-muted">—</span>
                        )}
                      </td>
                    </tr>
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

function StateBadge({ state }: { state: string }) {
  if (state === 'pending')
    return <em className="font-serif italic text-alert text-xs">awaiting Principal</em>
  if (state === 'approved_for_execution')
    return <em className="font-serif italic text-accent text-xs">ready to execute</em>
  if (state === 'executed')
    return <em className="font-serif italic text-ledger text-xs">executed</em>
  return <em className="font-serif italic text-muted text-xs">{state}</em>
}
