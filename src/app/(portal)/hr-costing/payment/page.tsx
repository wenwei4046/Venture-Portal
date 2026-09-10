import Link from 'next/link'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoneyBare, getPeriodMonth } from '@/lib/utils'
import {
  cyclePhase,
  cycleTotals,
  daysUntil,
  directorsFunded,
  groupDepartments,
  normaliseCycle,
  round2,
  shortDate,
  statutoryRows,
} from '@/lib/payment-cycle'
import RequestPayrollPaymentButton, { type RequestState } from '../payroll/_components/RequestPayrollPaymentButton'
import CycleStrip, { type StripCell } from './_components/CycleStrip'
import PaymentBoard from './_components/PaymentBoard'

type Tone = 'walnut' | 'paper' | 'white'

/**
 * HR › Payment — proposal B (user 2026-09-10): the month as a cycle strip,
 * one card per department, a window for the people, four statutory bodies.
 * One RPC (payment_cycle) feeds the page; every judgement about what it
 * returned is a pure helper in lib/payment-cycle.ts.
 */
export default async function HRPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; tone?: string }>
}) {
  await requirePermission('hr_costing')
  const supabase = await createClient()

  // ?period=YYYY-MM-01 — a payroll cycle often finishes in the FOLLOWING
  // calendar month (August's payout ran on 5 September).
  const { period: periodParam, tone: toneParam } = await searchParams
  const period = /^\d{4}-\d{2}-01$/.test(periodParam ?? '') ? (periodParam as string) : getPeriodMonth()
  const prevPeriod = dayjs(period).subtract(1, 'month').format('YYYY-MM-01')
  const nextPeriod = dayjs(period).add(1, 'month').format('YYYY-MM-01')
  const tone: Tone = toneParam === 'paper' || toneParam === 'white' ? toneParam : 'walnut'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('payment_cycle', { p_period: period })
  if (error) throw new Error(error.message)

  const cycle = normaliseCycle(data)
  const groups = groupDepartments(cycle.people)
  const rows = statutoryRows(cycle, groups)
  const totals = cycleTotals(cycle, rows)
  const phase = cyclePhase(cycle)
  const staffFunded = phase === 'funded'
  const dirFunded = directorsFunded(cycle)
  const hasDirectors = totals.directorCount > 0
  const today = dayjs().format('YYYY-MM-DD')

  const periodLabel = dayjs(period).format('MMMM YYYY')
  const prevMonthName = dayjs(period).subtract(1, 'month').format('MMMM')

  // ── The four cells ────────────────────────────────────────────────────────
  const run = cycle.run
  const fs = cycle.funding.staff
  const fd = cycle.funding.directors
  const staffCtc = run ? run.total_amount : round2(totals.staffNet + cycle.people.filter((p) => p.scope === 'staff').reduce((s, p) => s + p.epf_er + p.socso_er + p.eis_er, 0))
  const dirCtc = fd ? fd.amount : round2(totals.directorNet + cycle.people.filter((p) => p.scope === 'directors').reduce((s, p) => s + p.epf_er + p.socso_er + p.eis_er, 0))
  const fundedAll = staffFunded && (!hasDirectors || dirFunded)
  const fundedAmount = round2((staffFunded ? fs?.amount ?? staffCtc : 0) + (dirFunded ? fd?.amount ?? 0 : 0))
  const salaryGenerated = groups.reduce((s, g) => s + g.generated, 0)
  const salaryPending = groups.reduce((s, g) => s + g.pending, 0)
  const salaryPaid = groups.reduce((s, g) => s + g.paid, 0)
  const payable = groups.reduce((s, g) => s + g.headcount, 0)
  const salaryDone = payable > 0 && groups.every((g) => g.stage === 'paid' || g.headcount === 0)
  const salaryPayDate = groups.map((g) => g.vouchers[0]?.payment_date).find(Boolean) ?? null
  const statGen = rows.filter((r) => r.pv != null).length
  const statPaid = rows.filter((r) => r.stage === 'paid').length
  const statDone = rows.length > 0 && statPaid === rows.length
  const statDue = rows.find((r) => r.scheme === 'KWSP')?.due ?? ''
  const statDays = statDue ? daysUntil(statDue, new Date(today + 'T00:00:00Z')) : null
  const poolAfterSalary = round2(cycle.pool_balance - (salaryDone ? 0 : totals.net - groups.reduce((s, g) => s + g.people.filter((p) => p.voucher?.status === 'paid').reduce((t, p) => t + p.net, 0), 0)))
  const bank = cycle.payout_bank
  const bankLabel = bank ? `${bank.name} ···${bank.last4}` : 'the Alliance payroll account'

  const cells: StripCell[] = [
    {
      n: '1',
      title: 'Payroll submitted',
      state: run ? 'done' : cycle.people.length > 0 ? 'now' : 'wait',
      stateText: run ? `Submitted ${shortDate(run.submitted_at)} · ${totals.people} people` : cycle.people.length > 0 ? 'Drafts not submitted yet' : 'No payroll for this month',
      amount: round2(staffCtc + dirCtc),
      sub: `CTC · staff ${formatMoneyBare(staffCtc)} · directors ${formatMoneyBare(dirCtc)}`,
      current: !run,
    },
    {
      n: '2',
      title: 'Funded by Finance',
      state: fundedAll ? 'done' : run ? 'now' : 'wait',
      stateText: fundedAll
        ? `Complete ${shortDate(fs?.pv_date ?? fd?.pv_date)} · ${[fs, fd].filter((f) => f?.status === 'completed').length} funding PV${[fs, fd].filter((f) => f?.status === 'completed').length === 1 ? '' : 's'}`
        : staffFunded
          ? 'Staff funded · directors awaiting'
          : phase === 'pv-generated'
            ? 'Funding PV with Principal'
            : phase === 'request-submitted'
              ? 'Request with Finance'
              : phase === 'approved-ready'
                ? 'No active funding request'
                : 'After submission',
      amount: fundedAll ? fundedAmount : round2(staffCtc + dirCtc),
      sub: `${fs?.pv_no ?? '—'} · ${fd?.pv_no ?? '—'}${bank ? ` → ${bank.name}` : ''}`,
      say: `HR pool holds RM ${formatMoneyBare(cycle.pool_balance)} now`,
      current: !!run && !fundedAll,
    },
    {
      n: '3',
      title: 'Salary PVs',
      state: salaryDone ? 'done' : staffFunded || dirFunded ? 'now' : 'wait',
      stateText: salaryDone
        ? `Paid ${shortDate(salaryPayDate)} · ${payable} of ${payable}`
        : salaryGenerated > 0
          ? `${salaryPending} with Principal · ${salaryPaid} paid`
          : staffFunded || dirFunded
            ? 'Ready — nothing generated'
            : 'After funding',
      amount: totals.net,
      sub: `net · ${totals.staffCount} staff + ${totals.directorCount} directors`,
      say: salaryDone
        ? `RM ${formatMoneyBare(totals.net)} left ${bankLabel} on ${shortDate(salaryPayDate)}`
        : `RM ${formatMoneyBare(totals.net)} leaves ${bankLabel} on the pay date`,
      current: fundedAll && !salaryDone,
    },
    {
      n: '4',
      title: 'Statutory PVs',
      state: statDone ? 'done' : statGen > 0 || salaryDone ? 'now' : 'wait',
      stateText: statDone
        ? `Paid · ${statPaid} of ${rows.length}`
        : statGen > 0
          ? `${statGen - statPaid} with Principal · ${statPaid} paid`
          : salaryDone
            ? `Ready · due ${shortDate(statDue)}${statDays != null ? (statDays < 0 ? ` · overdue ${-statDays}d` : ` · in ${statDays}d`) : ''}`
            : `After salaries · due ${shortDate(statDue)}`,
      amount: totals.statutory,
      sub: `4 bodies · 5 PVs · staff ${formatMoneyBare(totals.statutoryStaff)} + directors ${formatMoneyBare(totals.statutoryDirectors)}`,
      say: statDone
        ? 'All five bodies paid'
        : poolAfterSalary >= totals.statutory
          ? `Pool after salaries RM ${formatMoneyBare(poolAfterSalary)} covers it`
          : `Pool after salaries RM ${formatMoneyBare(poolAfterSalary)} · short RM ${formatMoneyBare(round2(totals.statutory - poolAfterSalary))}`,
      current: salaryDone && !statDone,
    },
  ]

  // Funding request state for the re-file / status button (unchanged flow).
  let requestState: RequestState = { kind: 'none' }
  if (fs) {
    if (fs.status === 'submitted') requestState = { kind: 'submitted', requestId: fs.id, requestedAt: fs.requested_at ?? '' }
    else if (fs.status === 'pv_generated') requestState = { kind: 'pv_generated', pvId: fs.pv_id ?? '', requestId: fs.id, paidAmount: round2(fs.paid_amount ?? 0) }
    else if (fs.status === 'completed') requestState = { kind: 'completed', pvId: fs.pv_id ?? '', completedAt: null }
  }

  // Default pay date: the 28th of the period month, or today if that has passed.
  const twentyEighth = period.slice(0, 8) + '28'
  const defaultDate = twentyEighth < today ? today : twentyEighth

  return (
    <div className="pay-board" data-tone={tone}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Payment</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/hr-costing/payment?period=${prevPeriod}${tone !== 'walnut' ? `&tone=${tone}` : ''}`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-mono text-sm px-3 py-1.5 rounded-md transition-colors"
            aria-label="Previous month"
          >
            ←
          </Link>
          <span className="font-serif italic text-graphite text-sm w-32 text-center">{periodLabel}</span>
          <Link
            href={`/hr-costing/payment?period=${nextPeriod}${tone !== 'walnut' ? `&tone=${tone}` : ''}`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-mono text-sm px-3 py-1.5 rounded-md transition-colors"
            aria-label="Next month"
          >
            →
          </Link>
        </div>
      </div>

      {phase === 'no-payroll' ? (
        <div className="py-12 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-4">No payroll imported for this month yet.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/hr-costing/payroll" className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors">
              Go to Payroll →
            </Link>
            {cycle.latest_run_period && cycle.latest_run_period !== period ? (
              <Link
                href={`/hr-costing/payment?period=${cycle.latest_run_period}`}
                className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
              >
                View the {dayjs(cycle.latest_run_period).format('MMMM YYYY')} cycle →
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <CycleStrip cells={cells} dark={tone === 'walnut'} />

          {phase === 'drafts-pending' ? (
            <div className="py-10 text-center border border-hairline rounded-md bg-surface mb-10">
              <p className="font-serif italic text-graphite text-lg mb-2">Payroll hasn&apos;t been submitted to Finance yet.</p>
              <p className="font-serif italic text-muted text-sm mb-6">Finish editing the drafts and click Submit to Finance on the Payroll grid first.</p>
              <Link href="/hr-costing/payroll" className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors">
                Open Payroll grid →
              </Link>
            </div>
          ) : null}

          {(phase === 'approved-ready' || phase === 'request-submitted' || phase === 'pv-generated') && run ? (
            <div className="border border-hairline rounded-md bg-surface p-6 mb-10">
              <h2 className="font-serif italic text-ink text-md mb-2">Funding from Finance</h2>
              <p className="font-serif italic text-graphite text-sm mb-5">
                {phase === 'approved-ready' ? (
                  <>
                    No active funding request — the previous one was cancelled. Re-file the <strong className="num text-num-ink">RM {formatMoneyBare(run.total_amount)}</strong> staff request below.
                  </>
                ) : (
                  <>
                    The staff funding request for <strong className="num text-num-ink">RM {formatMoneyBare(run.total_amount)}</strong> was filed when the payroll was submitted (directors fund separately from the Director Salary submission).
                  </>
                )}{' '}
                Finance generates the Payment Voucher; Principal approves it, which moves the cash into the Alliance payroll account and parks it in the HR pool.
              </p>
              <RequestPayrollPaymentButton runId={run.id} totalAmount={run.total_amount} state={requestState} />
            </div>
          ) : null}

          {phase !== 'drafts-pending' ? (
            <PaymentBoard
              period={period}
              periodLabel={periodLabel}
              prevMonthName={prevMonthName}
              groups={groups}
              rows={rows}
              totals={totals}
              phase={phase}
              staffFunded={staffFunded}
              directorsFunded={dirFunded}
              payoutBank={bank}
              today={today}
              defaultDate={defaultDate}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
