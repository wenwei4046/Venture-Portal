import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { getPeriodMonth } from '@/lib/utils'
import {
  contributionTotals,
  cycleHeadline,
  cyclePhase,
  cycleTotals,
  directorsFunded,
  groupDepartments,
  milestones,
  monthRail,
  normaliseCycle,
  payVariances,
  round2,
  statutoryRows,
  type HeadlineInput,
} from '@/lib/payment-cycle'
import RequestPayrollPaymentButton, { type RequestState } from '../payroll/_components/RequestPayrollPaymentButton'
import MonthRail from './_components/MonthRail'
import PaymentBoard from './_components/PaymentBoard'
import type { Facts } from './_components/Overview'

/**
 * HR › Payment — the month laid out the way the researched HRMS lay it out
 * (2026-09-11): a month rail, a status card with the countdown and the one
 * action, due dates and pay variances beside it, one row per department,
 * one row per statutory body. One RPC (payment_cycle) feeds the page plus
 * two plain selects for the rail; every judgement about what they returned
 * is a pure helper in lib/payment-cycle.ts.
 */
export default async function HRPaymentPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requirePermission('hr_costing')
  const supabase = await createClient()

  // ?period=YYYY-MM-01 — a payroll cycle often finishes in the FOLLOWING
  // calendar month (August's payout ran on 5 September).
  const { period: periodParam } = await searchParams
  const period = /^\d{4}-\d{2}-01$/.test(periodParam ?? '') ? (periodParam as string) : getPeriodMonth()
  const railFrom = dayjs(period).subtract(4, 'month').format('YYYY-MM-01')
  const railTo = dayjs(period).add(1, 'month').format('YYYY-MM-01')

  const [cycleRes, runsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('payment_cycle', { p_period: period }) as Promise<{ data: unknown; error: { message: string } | null }>,
    supabase.from('payroll_runs').select('id, period_month, status').gte('period_month', railFrom).lte('period_month', railTo),
  ])
  if (cycleRes.error) throw new Error(cycleRes.error.message)
  const runs = (runsRes.data ?? []).map((r) => ({ id: String(r.id), period_month: String(r.period_month), status: String(r.status) }))
  const fundRes = runs.length
    ? await supabase
        .from('payroll_payment_requests')
        .select('payroll_run_id, status')
        .in(
          'payroll_run_id',
          runs.map((r) => r.id),
        )
    : { data: [] as Array<{ payroll_run_id: string | null; status: string }> }
  const statRes = runs.length
    ? await supabase
        .from('payment_vouchers')
        .select('reference_id, status')
        .eq('reference_type', 'payroll_statutory')
        .in(
          'reference_id',
          runs.map((r) => r.id),
        )
    : { data: [] as Array<{ reference_id: string | null; status: string }> }
  const rail = monthRail(
    period,
    runs,
    (statRes.data ?? []).map((v) => ({ reference_id: String(v.reference_id ?? ''), status: String(v.status) })),
    (fundRes.data ?? []).map((f) => ({ payroll_run_id: String(f.payroll_run_id ?? ''), status: String(f.status) })),
  )

  const cycle = normaliseCycle(cycleRes.data)
  const groups = groupDepartments(cycle.people)
  const rows = statutoryRows(cycle, groups)
  const totals = cycleTotals(cycle, rows)
  const band = contributionTotals(cycle.people)
  const phase = cyclePhase(cycle)
  const staffFunded = phase === 'funded'
  const dirFunded = directorsFunded(cycle)
  const today = dayjs().format('YYYY-MM-DD')

  // Default pay date: the 28th of the period month, or today if that has passed.
  const twentyEighth = period.slice(0, 8) + '28'
  const defaultDate = twentyEighth < today ? today : twentyEighth

  const input: HeadlineInput = { cycle, groups, rows, phase, staffFunded, directorsFunded: dirFunded, today, plannedStaffDate: defaultDate, plannedDirectorDate: defaultDate }
  const headline = cycleHeadline(input)
  const ms = milestones(input)
  const variances = payVariances(cycle.people)

  const periodLabel = dayjs(period).format('MMMM YYYY')
  const periodRange = `1–${dayjs(period).endOf('month').date()} ${dayjs(period).format('MMM YYYY')}`
  const prevMonthName = dayjs(period).subtract(1, 'month').format('MMMM')

  // ── BambooHR's explained figures ─────────────────────────────────────────
  const run = cycle.run
  const fs = cycle.funding.staff
  const fd = cycle.funding.directors
  const staffPeople = cycle.people.filter((p) => p.scope === 'staff')
  const dirPeople = cycle.people.filter((p) => p.scope === 'directors')
  const staffCtc = run ? run.total_amount : round2(totals.staffNet + staffPeople.reduce((s, p) => s + p.epf_er + p.socso_er + p.eis_er, 0))
  const dirCtc = fd ? fd.amount : round2(totals.directorNet + dirPeople.reduce((s, p) => s + p.epf_er + p.socso_er + p.eis_er, 0))
  const staffGroups = groups.filter((g) => g.scope === 'staff' && g.headcount > 0)
  const dirGroups = groups.filter((g) => g.scope === 'directors' && g.headcount > 0)
  const staffPaid = staffGroups.length > 0 && staffGroups.every((g) => g.stage === 'paid')
  const dirPaid = dirGroups.length > 0 && dirGroups.every((g) => g.stage === 'paid')
  const salaryDone = totals.people > 0 && groups.every((g) => g.stage === 'paid' || g.headcount === 0)
  const paidNet = groups.reduce((s, g) => s + g.people.filter((p) => p.voucher?.status === 'paid').reduce((t, p) => t + p.net, 0), 0)
  const statDone = rows.length > 0 && rows.every((r) => r.stage === 'paid')
  const facts: Facts = {
    ctc: round2(staffCtc + dirCtc),
    fundedAll: staffFunded && (dirGroups.length === 0 || dirFunded),
    fundedDate: fs?.pv_date ?? fd?.pv_date ?? null,
    fundingPvs: [fs?.pv_no, fd?.pv_no].filter((x): x is string => !!x),
    fundingWord:
      phase === 'pv-generated'
        ? 'funding PV with Principal'
        : phase === 'request-submitted'
          ? 'request with Finance'
          : phase === 'approved-ready'
            ? 'no active request'
            : staffFunded
              ? 'staff funded · directors awaiting'
              : 'after submission',
    poolBalance: cycle.pool_balance,
    staffNet: totals.staffNet,
    staffCount: totals.staffCount,
    staffDate: staffGroups.find((g) => g.vouchers[0]?.payment_date)?.vouchers[0]?.payment_date ?? (staffFunded ? defaultDate : null),
    staffPaid,
    dirNet: totals.directorNet,
    dirCount: totals.directorCount,
    dirDate: dirGroups[0]?.vouchers[0]?.payment_date ?? (dirFunded ? defaultDate : null),
    dirPaid,
    dirFunded,
    statutory: totals.statutory,
    statDue: rows.map((r) => r.due).sort()[0] ?? null,
    poolAfterSalary: round2(cycle.pool_balance - (salaryDone ? 0 : totals.net - paidNet)),
    statDone,
    statPaidDate: rows.map((r) => r.pv?.payment_date).filter((x): x is string => !!x).sort().pop() ?? null,
  }

  // Funding request state for the re-file / status button (unchanged flow).
  let requestState: RequestState = { kind: 'none' }
  if (fs) {
    if (fs.status === 'submitted') requestState = { kind: 'submitted', requestId: fs.id, requestedAt: fs.requested_at ?? '' }
    else if (fs.status === 'pv_generated') requestState = { kind: 'pv_generated', pvId: fs.pv_id ?? '', requestId: fs.id, paidAmount: round2(fs.paid_amount ?? 0) }
    else if (fs.status === 'completed') requestState = { kind: 'completed', pvId: fs.pv_id ?? '', completedAt: null }
  }

  return (
    <div className="pay-board">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Payment</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {periodLabel} · {totals.people > 0 ? `${totals.staffCount} staff + ${totals.directorCount} directors` : 'no payroll yet'} · one PV per department, four statutory bodies.
          </p>
        </div>
        <MonthRail months={rail} />
      </div>

      <PaymentBoard
        period={period}
        periodLabel={periodLabel}
        periodRange={periodRange}
        prevMonthName={prevMonthName}
        groups={groups}
        rows={rows}
        totals={totals}
        band={band}
        headline={headline}
        milestones={ms}
        variances={variances}
        facts={facts}
        phase={phase}
        staffFunded={staffFunded}
        directorsFunded={dirFunded}
        payoutBank={cycle.payout_bank}
        today={today}
        defaultDate={defaultDate}
        fundingSlot={run ? <RequestPayrollPaymentButton runId={run.id} totalAmount={run.total_amount} state={requestState} /> : null}
      />
    </div>
  )
}
