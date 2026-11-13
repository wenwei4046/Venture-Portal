import Link from 'next/link'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { canDo } from '@/lib/permission-actions'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import ScheduleView, { type SchedRow, type CompoundRow, type MinInterestRow } from './_components/ScheduleView'
import MonthNav from './_components/MonthNav'
import ExportMenu from './_components/ExportMenu'
import { loadRepaymentSchedule } from './_lib/schedule-data'
import { scheduleList, type ListDeal } from '@/lib/schedule-list'
import { byCompany, historyOf } from '@/lib/schedule-by-company'
import type { NoTermRow } from './_components/ScheduleView'

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
    arrears,
    deals,
    window,
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

  // The cards (2026-10-09, the handoff): the calendar's read the month's
  // instalments; a list tab's (2026-10-10) read that side's minimum interest
  // in cards 4–5 — what is in so far, what is not. 2026-11-02 (the user: "card
  // 可以做小，就一排就好"): small, the five in one row — the first three as a list,
  // which StatCards counts card by card (as a fragment they counted as one, and
  // the five stood three over two).
  const headCards = (collectNote: string, payNote: string) => [
    <StatCard key="collect" tone="ledger" label="To collect" value={formatMoney(toCollect)} icon="inbox" note={collectNote} />,
    <StatCard key="pay" tone="danger" label="To pay" value={formatMoney(toPay)} icon="send" note={payNote} />,
    <StatCard key="net" tone="primary" label="Net this month" value={formatMoney(netMonth)} icon="swap" note={netMonth >= 0 ? 'Collect more than we pay' : 'Pay more than we collect'} />,
  ]
  // We collect / We pay a month at a time (2026-11-04): one row an instalment, read off the calendar's entries; a
  // compounding or no-fixed-term deal whose plan has no row this month stands on the month's last day.
  const listOf = (
    kind: 'collect' | 'pay',
    rowsBy: { rows: SchedRow[]; min: MinInterestRow[]; compound: CompoundRow[]; noTerm: NoTermRow[] },
  ) => {
    const deals = new Map<string, ListDeal>()
    for (const r of [...rowsBy.min, ...rowsBy.compound, ...rowsBy.noTerm]) deals.set(r.key, { counterparty: r.counterparty, detail: r.detail, source: 'source' in r ? r.source : null })
    for (const r of rowsBy.rows) deals.set(r.key, { counterparty: r.counterparty, detail: r.detail, source: r.source ?? null, pending: r.pending })
    return scheduleList({
      entries: [...arrears, ...events].filter((e) => e.kind === kind),
      deals,
      compounding: new Set(rowsBy.compound.map((r) => r.key)),
      extras: [
        ...rowsBy.compound.map((r) => ({ id: r.key, interest: r.thisMonthInterest, received: r.received ?? 0 })),
        ...rowsBy.noTerm.map((r) => ({ id: r.key, interest: r.monthlyInterest, received: r.received ?? 0 })),
      ],
      month: currentYM,
      today,
    })
  }
  const collectList = listOf('collect', { rows: collectRows, min: collectMin, compound: collectCompound, noTerm: collectNoTerm })
  const payList = listOf('pay', { rows: repayRows, min: repayMin, compound: repayCompound, noTerm: repayNoTerm })

  // By company (2026-11-13): the month's companies, both sides each, and the six months to this one.
  const companies = byCompany({ facts: deals, collectList, payList, month: currentYM })
  const history = historyOf(deals, window)

  const cards = {
    cal: (
      <StatCards label="Repayment Schedule" size="small">
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
          <h1 className="page-title">Repayment Schedule</h1>
        </div>
      </div>

      <ScheduleView
        // The month and Export on the tabs' row (2026-11-02, the user: "帮我把日期选择器和export 做在这一排");
        // Export — Excel or PDF, the month's two due tables — only for Treasury · Export, which its route asks.
        tools={
          <>
            <MonthNav month={currentYM} isCurrent={isCurrentMonth} />
            <ExportMenu month={currentYM} canExport={canDo(user, 'treasury', 'export')} />
          </>
        }
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
        collectList={collectList}
        payList={payList}
        companies={companies}
        history={history}
      />
    </div>
  )
}
