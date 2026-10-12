import Link from 'next/link'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { canDo } from '@/lib/permission-actions'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import ScheduleView, { type SchedRow, type CompoundRow, type MinInterestRow } from './_components/ScheduleView'
import MonthNav from './_components/MonthNav'
import { loadRepaymentSchedule } from './_lib/schedule-data'

export const dynamic = 'force-dynamic'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export default async function RepaymentSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  await requirePage('/repayment-schedule')
  const user = await requirePermission('treasury')
  const supabase = await createClient()

  const { month } = await searchParams
  const {
    currentYM,
    isCurrentMonth,
    today,
    collectRows,
    collectMin,
    collectCompound,
    collectNoTerm,
    repayRows,
    repayMin,
    repayCompound,
    repayNoTerm,
    events,
  } = await loadRepaymentSchedule(supabase, month)
  const monthLabel = dayjs(`${currentYM}-01`).format('MMM YYYY')

  const sumCompound = (rows: CompoundRow[]) => ({
    balance: r2(rows.reduce((s, r) => s + r.balance, 0)),
    accrued: r2(rows.reduce((s, r) => s + r.accrued, 0)),
    thisMonthInterest: r2(rows.reduce((s, r) => s + r.thisMonthInterest, 0)),
  })
  const collectCompoundTotals = sumCompound(collectCompound)
  const repayCompoundTotals = sumCompound(repayCompound)

  const collectNoTermOutstanding = r2(collectNoTerm.reduce((s, r) => s + r.outstanding, 0))
  const collectNoTermInterest = r2(collectNoTerm.reduce((s, r) => s + r.monthlyInterest, 0))
  const repayNoTermOutstanding = r2(repayNoTerm.reduce((s, r) => s + r.outstanding, 0))
  const repayNoTermInterest = r2(repayNoTerm.reduce((s, r) => s + r.monthlyInterest, 0))

  // ── The cards: the month's scheduled cash, what is done, what is short.
  const sumDue = (rows: SchedRow[]) => r2(rows.reduce((t, r) => t + r.totalDue, 0))
  const toCollect = sumDue(collectRows)
  const toPay = sumDue(repayRows)
  const collected = sumDue(collectRows.filter((r) => r.done))
  const paid = sumDue(repayRows.filter((r) => r.done))
  const shortOf = (kind: 'collect' | 'pay') =>
    r2(events.filter((e) => e.kind === kind && e.date <= today && (e.status === 'overdue' || e.status === 'partial')).reduce((t, e) => t + e.outstanding, 0))
  const shortCollect = shortOf('collect')
  const shortPay = shortOf('pay')
  const netMonth = r2(toCollect - toPay)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const monShort = dayjs(`${currentYM}-01`).format('MMM')
  const minOf = (rows: MinInterestRow[]) => ({
    got: r2(rows.reduce((t, r) => t + r.paid, 0)),
    short: r2(rows.reduce((t, r) => t + r.shortfall, 0)),
  })

  // The cards (2026-10-09, the handoff): the calendar's read the month's
  // instalments; a list tab's (2026-10-10) read that side's minimum interest
  // in cards 4–5 — what is in so far, what is not.
  const headCards = (collectNote: string, payNote: string) => (
    <>
      <StatCard tone="ledger" label="To collect" value={formatMoney(toCollect)} icon="inbox" note={collectNote} />
      <StatCard tone="danger" label="To pay" value={formatMoney(toPay)} icon="send" note={payNote} />
      <StatCard tone="primary" label="Net this month" value={formatMoney(netMonth)} icon="swap" note={netMonth >= 0 ? 'Collect more than we pay' : 'Pay more than we collect'} />
    </>
  )
  const sideCards = (word: 'Received' | 'Paid', min: { got: number; short: number }) => (
    <StatCards label="Repayment Schedule">
      {headCards('From borrowers', 'To fund sources')}
      <StatCard tone="ledger" label={`${word} so far`} value={formatMoney(min.got)} icon="check" note={`Min interest · ${monShort}`} />
      <StatCard tone={min.short > 0 ? 'danger' : 'default'} label="Short" value={formatMoney(min.short)} icon="alert" note="Min interest not yet in" />
    </StatCards>
  )
  const cards = {
    cal: (
      <StatCards label="Repayment Schedule">
        {headCards(`${plural(collectRows.length, 'instalment', 'instalments')} · Fund OUT`, `${plural(repayRows.length, 'instalment', 'instalments')} · Fund IN`)}
        <StatCard label="Done so far" value={formatMoney(r2(collected + paid))} icon="check" note={`Received ${formatMoney(collected)} · paid ${formatMoney(paid)}`} />
        <StatCard
          tone={shortCollect + shortPay > 0 ? 'danger' : 'default'}
          label="Overdue / short"
          value={formatMoney(r2(shortCollect + shortPay))}
          icon="alert"
          note={`Collect ${formatMoney(shortCollect)} · pay ${formatMoney(shortPay)}`}
        />
      </StatCards>
    ),
    collect: sideCards('Received', minOf(collectMin)),
    pay: sideCards('Paid', minOf(repayMin)),
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-2">
        <Link href="/fund-in" className="text-sm text-muted hover:text-accent font-sans transition-colors">← Fund In</Link>
        <Link href="/fund-out" className="text-sm text-muted hover:text-accent font-sans transition-colors">← Fund Out</Link>
      </div>

      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow"><em>I.</em> TREASURY · {isCurrentMonth ? 'DUE THIS MONTH' : 'SCHEDULE FOR'} · {dayjs(`${currentYM}-01`).format('MMMM YYYY').toUpperCase()}</div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">Repayment Schedule</h1>
            <MonthNav month={currentYM} isCurrent={isCurrentMonth} />
          </div>
        </div>
        {canDo(user, 'treasury', 'export') ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* The month's two due tables as a spreadsheet (2026-10-10, the handoff). */}
            <a href={`/repayment-schedule/export?month=${currentYM}`} className="btn-quiet-sheet" download>
              Export
            </a>
          </div>
        ) : null}
      </div>

      <ScheduleView
        monthLabel={monthLabel}
        month={currentYM}
        linkMonth={month ?? null}
        today={today}
        events={events}
        cards={cards}
        canRecord={canDo(user, 'treasury', 'create')}
        canSetDefault={canDo(user, 'treasury', 'create')}
        collectRows={collectRows}
        collectMin={collectMin}
        repayMin={repayMin}
        collectNoTerm={collectNoTerm}
        collectNoTermOutstanding={collectNoTermOutstanding}
        collectNoTermInterest={collectNoTermInterest}
        collectCompound={collectCompound}
        collectCompoundTotals={collectCompoundTotals}
        repayRows={repayRows}
        repayNoTerm={repayNoTerm}
        repayNoTermOutstanding={repayNoTermOutstanding}
        repayNoTermInterest={repayNoTermInterest}
        repayCompound={repayCompound}
        repayCompoundTotals={repayCompoundTotals}
      />
    </div>
  )
}
