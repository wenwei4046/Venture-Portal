import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { getPeriodMonth } from '@/lib/utils'
import { officeToday } from '@/lib/office-time'
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
  salaryPaidAmount,
  statutoryRows,
  type HeadlineInput,
} from '@/lib/payment-cycle'
import MonthRail from './_components/MonthRail'
import PaymentBoard from './_components/PaymentBoard'
import type { Facts } from './_components/Overview'
import './payment-statement.css'

/** HR Payment: a monthly statement above separate Salary and Statutory tabs. */
export default async function HRPaymentPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  // ?period=YYYY-MM-01 — a payroll cycle often finishes in the FOLLOWING
  // calendar month (August's payout ran on 5 September).
  const { period: periodParam } = await searchParams
  const period = /^\d{4}-\d{2}-01$/.test(periodParam ?? '') ? (periodParam as string) : getPeriodMonth()
  const railFrom = dayjs(period).subtract(4, 'month').format('YYYY-MM-01')
  const railTo = dayjs(period).add(1, 'month').format('YYYY-MM-01')

  // The cycle and the rail's runs are asked for while the permission is
  // checked (payment_cycle refuses a reader without it on its own); nothing is
  // read from them unless the check passes (2026-09-26: one round trip fewer).
  const supabase = await createClient()
  const firstReads = Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)('payment_cycle', { p_period: period }) as Promise<{ data: unknown; error: { message: string } | null }>,
    supabase.from('payroll_runs').select('id, period_month, status').gte('period_month', railFrom).lte('period_month', railTo),
  ])
  firstReads.catch(() => {})
  await requirePermission('hr_costing')
  const [cycleRes, runsRes] = await firstReads
  if (cycleRes.error) throw new Error(cycleRes.error.message)
  const runs = (runsRes.data ?? []).map((r) => ({ id: String(r.id), period_month: String(r.period_month), status: String(r.status) }))
  const runIds = runs.map((r) => r.id)
  const cycle = normaliseCycle(cycleRes.data)
  const fs = cycle.funding.staff
  const fd = cycle.funding.directors

  // The requests, the statutory PVs and what the funding PVs paid depend only
  // on the runs and the cycle, not on each other: one round trip, not three.
  const [fundRes, statRes, fundingPaid] = await Promise.all([
    runIds.length
      ? supabase.from('payroll_payment_requests').select('payroll_run_id, status').in('payroll_run_id', runIds)
      : Promise.resolve({ data: [] as Array<{ payroll_run_id: string | null; status: string }> }),
    runIds.length
      ? supabase
          .from('payment_vouchers')
          .select('reference_id, status')
          .eq('reference_type', 'payroll_statutory')
          .in('reference_id', runIds)
      : Promise.resolve({ data: [] as Array<{ reference_id: string | null; status: string }> }),
    // A request can be funded by several PVs. The same aggregate RPC covers
    // partial staff AND director funding; pending vouchers never count as cash.
    Promise.all([fs, fd].filter((funding) => funding != null).map(async (funding) => {
      const { data, error } = await supabase.rpc('get_payroll_funding_paid', { p_request_id: funding.id })
      if (error) throw new Error(error.message)
      return Number(data ?? 0)
    })),
  ])
  const rail = monthRail(
    period,
    runs,
    (statRes.data ?? []).map((v) => ({ reference_id: String(v.reference_id ?? ''), status: String(v.status) })),
    (fundRes.data ?? []).map((f) => ({ payroll_run_id: String(f.payroll_run_id ?? ''), status: String(f.status) })),
    4, 1, cycle.statutory_completion,
  )

  const groups = groupDepartments(cycle.people)
  const rows = statutoryRows(cycle, groups)
  const totals = cycleTotals(cycle, rows)
  const band = contributionTotals(cycle.people)
  const phase = cyclePhase(cycle)
  const staffFunded = phase === 'funded'
  const dirFunded = directorsFunded(cycle)
  const today = officeToday()

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

  // Funding and reporting facts use the same payroll rows as the PV tables.
  const run = cycle.run
  const staffGroups = groups.filter((g) => g.scope === 'staff' && g.headcount > 0)
  const dirGroups = groups.filter((g) => g.scope === 'directors' && g.headcount > 0)
  const staffPaid = staffGroups.length > 0 && staffGroups.every((g) => g.stage === 'paid')
  const dirPaid = dirGroups.length > 0 && dirGroups.every((g) => g.stage === 'paid')
  const salaryDone = totals.people > 0 && groups.every((g) => g.stage === 'paid' || g.headcount === 0)
  const paidNet = groups.reduce((s, g) => s + g.people.reduce((t, p) => t + salaryPaidAmount(p), 0), 0)
  const statDone = rows.length > 0 && rows.every((r) => r.stage === 'paid')
  const facts: Facts = {
    ctc: band.cost,
    fundedAmount: round2(fundingPaid.reduce((sum, amount) => sum + amount, 0)),
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

  // Funding is filed per batch on HR › Payroll (unified Payroll, 2026-09-27);
  // here it is a count and a way there.
  const fundingSlot = run ? (
    <Link href={`/hr-costing/payroll/${period}`} className="pay-btn sec" title="Each batch's funding request lives with the batch on HR › Payroll">
      {fs?.batches ? `${fs.batches_funded ?? 0} of ${fs.batches} batch${fs.batches === 1 ? '' : 'es'} funded` : 'Funding requests'} · Payroll →
    </Link>
  ) : null

  return (
    <div className="pay-board payment-statement">
      <div className="page-head">
        <div>
          <div className="page-eyebrow"><em>I.</em> HR · Monthly payment statement</div>
          <h1 className="page-title">Payment</h1>
          <p className="text-sm mt-3">
            {periodLabel} · {totals.people > 0 ? `${totals.staffCount} staff + ${totals.directorCount} directors` : 'no payroll yet'}
          </p>
        </div>
        <MonthRail months={rail} />
      </div>

      <PaymentBoard
        key={period}
        period={period}
        periodLabel={periodLabel}
        periodRange={periodRange}
        prevMonthName={prevMonthName}
        groups={groups}
        rows={rows}
        statutoryCoverage={cycle.statutory_coverage}
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
        fundingSlot={fundingSlot}
      />
    </div>
  )
}
