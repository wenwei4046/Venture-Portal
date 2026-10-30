// The Repayment schedule on a fund source's and a loan's page (2026-10-09,
// the user's Claude Design handoff — "the repayment schedule replaces the
// repayment history, with Balance / Outstanding / Remark columns").
//
// One row per installment by the terms in force (lib/treasury-terms: a rate
// that changed mid-life re-bases from the month it took effect, on the
// principal still owed then). The money received is set against the rows
// oldest first — principal against principal, interest against interest; a
// penalty pays neither — so a lump that covers three months covers the three
// oldest, and a late payment clears the month it was late for. A row reads:
//   Paid <date> · <voucher>        paid in full (green)
//   Part paid RM x · short RM y    some of it (amber)
//   Overdue n days                 nothing yet, and its day has passed (red)
//   Settled early · <date>         the principal was all repaid before it (grey)
// Balance is what the plan still has to collect after the row; Outstanding
// what is unpaid on the row itself.
//
// A deal with no fixed term runs month by month to date: interest on the base
// (the flat convention, user 2026-09-22), principal as it came in, Balance =
// principal still owed — principal repaid before its first month too (BI#7,
// 2026-10-24: the 5 Apr 2025 payment, made the day the money came, had been
// left on the balance). A deal that turned no-fixed-term later still asks its
// earlier fixed months' principal: those rows read as a fixed plan's do
// (BI#7's May–Dec 2025, 1,000 + 300 = 1,300, had read 300). A compounding
// deal (利滚利) rolls an unpaid month's interest into the balance
// (lib/treasury-schedule compoundInterestState) — from the terms' first
// compounding month, as the Company Statement's roll does (lib/treasury-terms
// compoundRoll): a deal that was flat before keeps those months as their terms
// asked them (LO#7, 2026-10-24: 0.5% flat to December 2025, 1,000 + 300 a
// month, then 4% compounding from January on the 51,000 still owed). Its rows
// also say what came in and what was rolled in, and its plan the figures over
// the table and where the terms change (`compound`).
// A repaid deal's month-by-month rows stop at the month it was repaid.

import dayjs from 'dayjs'
import { addMonthsYM, buildTermsSegments, principalDueIn, type PositionTerms, type TermsSegment } from './treasury-terms'

const r2 = (n: number) => Math.round(n * 100) / 100
const EPS = 0.005
// A row's slack: 1% of what it asks. A stored rate's rounding leaves each
// month a few sen short (300,000 at 0.5556% asks 1,666.80 and 1,666.67 is
// paid) and a few sen over one month sit on the next; neither is a shortfall.
const slack = (amount: number) => Math.max(EPS, amount * 0.01)
// The principal counts as all repaid within a ringgit.
const PAID_UP = 1
const money = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d: string) => dayjs(d).format('D MMM YYYY')

export interface PlanPayment {
  /** YYYY-MM-DD */
  date: string
  /** principal / interest / penalty / netting */
  type: string
  amount: number
  /** The voucher it came in on, when known. */
  ref: string | null
}

export type PlanTone = 'ledger' | 'alert' | 'danger' | 'info' | ''

export interface PlanRow {
  no: number
  /** YYYY-MM */
  ym: string
  /** YYYY-MM-DD — the installment's day in its month. */
  due: string
  installment: number
  /** null = no principal falls due (a no-fixed-term month with none repaid). */
  principal: number | null
  interest: number
  balance: number
  outstanding: number
  remark: string
  tone: PlanTone
  /** Its day has passed with something still unpaid on it. */
  late?: boolean
  /** 利滚利 plans: what came in against the row — a compounding month's payments, a flat month's share of them. */
  paid?: number
  /** 利滚利 plans: a past month's unpaid interest, rolled into the balance. */
  toBalance?: number
}

/** A 利滚利 plan's figures over its table, and where its terms change (2026-10-24, the user's tidied LO#7). */
export interface CompoundFacts {
  /** A line over the row that starts each set of terms: "Apr 2025 – Dec 2025" · "0.500% /mo flat · …". */
  breaks: Array<{ no: number; head: string; rest: string }>
  /** The balance after the last row: what is owed now, the rolled-in interest with it. */
  owedNow: number
  /** What came in — principal and interest (a penalty not). */
  paidToDate: number
  /** The unpaid interest rolled into the balance, and the months it was. */
  addedToBalance: number
  addedFrom: string | null
  addedTo: string | null
}

export interface RepaymentPlan {
  /** fixed = installments by the terms; open = month by month to date; none = no schedule. */
  kind: 'fixed' | 'open' | 'none'
  rows: PlanRow[]
  /** Installments in the plan (fixed); null when open. */
  months: number | null
  paidCount: number
  /** Σ outstanding over the rows. */
  outstandingDue: number
  /** What is overdue today: Σ outstanding over the rows whose day has passed (lib/repayment-calendar overdueOf's rule). */
  overdue: number
  /** The oldest of those rows' day, and the days since it. */
  overdueSince: string | null
  overdueDays: number
  firstDue: string | null
  firstInstallment: number
  totalInterest: number
  principalPaid: number
  interestPaid: number
  principalOwed: number
  /** 利滚利 (a compounding deal) — null otherwise. */
  compound: CompoundFacts | null
  /** The next installment (2026-10-26, the schedule's fourth card — the user: "改成 next installment"); null when nothing
   *  more falls due. Set by buildRepaymentPlan. */
  next?: PlanNext | null
}

export interface PlanNext {
  /** Its day, YYYY-MM-DD. */
  due: string
  amount: number
  /** The principal it asks (0 with no fixed term) and the interest. */
  principal: number
  interest: number
}

export interface PlanInput {
  terms: PositionTerms
  payments: readonly PlanPayment[]
  /** Which payment types repay principal (loans: principal; fund sources: principal + netting). */
  isPrincipal: (type: string) => boolean
  /** The office's today, YYYY-MM-DD. */
  today: string
  /** The day of the month an installment falls due (the record's own day); 1 when unknown. */
  dueDay?: number
  /** The record's status: cancelled has no schedule; pending shows the plan untouched. */
  status: string
}

function dueOn(ym: string, dueDay: number): string {
  const last = dayjs(`${ym}-01`).daysInMonth()
  return `${ym}-${String(Math.min(Math.max(1, dueDay), last)).padStart(2, '0')}`
}

interface Reach {
  date: string
  ref: string | null
}

/** The payment at which a pool's running total first reaches `target`. */
function reach(pays: readonly PlanPayment[], target: number): Reach | null {
  if (target <= EPS) return null
  let run = 0
  for (const p of pays) {
    run = r2(run + p.amount)
    if (run >= target - EPS) return { date: p.date, ref: p.ref }
  }
  return null
}

const later = (a: Reach | null, b: Reach | null): Reach | null => (!a ? b : !b ? a : a.date >= b.date ? a : b)
const paidRemark = (at: Reach | null) => (at ? `Paid ${day(at.date)}${at.ref ? ` · ${at.ref}` : ''}` : 'Paid')
const overdue = (today: string, due: string) => `Overdue ${dayjs(today).diff(dayjs(due), 'day')} days`

function summary(
  kind: RepaymentPlan['kind'],
  rows: PlanRow[],
  months: number | null,
  paidCount: number,
  principal: number,
  principalPaid: number,
  interestPaid: number,
  compound: CompoundFacts | null = null,
): RepaymentPlan {
  return {
    kind,
    rows,
    months,
    paidCount,
    outstandingDue: r2(rows.reduce((s, r) => s + r.outstanding, 0)),
    overdue: 0,
    overdueSince: null,
    overdueDays: 0,
    firstDue: rows[0]?.due ?? null,
    firstInstallment: rows[0]?.installment ?? 0,
    totalInterest: r2(rows.reduce((s, r) => s + r.interest, 0)),
    principalPaid,
    interestPaid,
    principalOwed: r2(Math.max(0, principal - principalPaid)),
    compound,
  }
}

export function buildRepaymentPlan(input: PlanInput): RepaymentPlan {
  const plan = planOf(input)
  // What is overdue today — a row whose day has passed with something still unpaid (a plan waiting for approval owes nothing yet).
  if (input.status === 'pending_approval') return plan
  const late = plan.rows.filter((r) => r.due < input.today && r.outstanding > EPS)
  for (const r of late) r.late = true
  plan.overdue = r2(late.reduce((s, r) => s + r.outstanding, 0))
  plan.overdueSince = late[0]?.due ?? null
  plan.overdueDays = late[0] ? dayjs(input.today).diff(dayjs(late[0].due), 'day') : 0
  return plan
}

function planOf(input: PlanInput): RepaymentPlan {
  const { terms, isPrincipal, status } = input
  const dueDay = input.dueDay ?? 1
  const pending = status === 'pending_approval'
  const sorted = [...input.payments].sort((a, b) => a.date.localeCompare(b.date))
  const principalPays = pending ? [] : sorted.filter((p) => isPrincipal(p.type))
  const interestPays = pending ? [] : sorted.filter((p) => !isPrincipal(p.type) && p.type !== 'penalty')
  const principalPaid = r2(principalPays.reduce((s, p) => s + p.amount, 0))
  const interestPaid = r2(interestPays.reduce((s, p) => s + p.amount, 0))
  if (status === 'cancelled') return summary('none', [], null, 0, terms.principal, principalPaid, interestPaid)

  const principalByMonth: Record<string, number> = {}
  for (const p of principalPays) principalByMonth[p.date.slice(0, 7)] = r2((principalByMonth[p.date.slice(0, 7)] ?? 0) + p.amount)
  const segments = buildTermsSegments(terms, principalByMonth)
  if (segments[0].fromYM === '0000-00') return summary('none', [], null, 0, terms.principal, principalPaid, interestPaid)

  const pools = { principalPays, interestPays, principalPaid, interestPaid }
  const plan = segments.some((s) => s.compounding)
    ? compoundPlan(input, segments, pools, dueDay)
    : !segments[segments.length - 1].months
      ? openPlan(input, segments, pools, dueDay)
      : fixedPlan(input, segments, pools, dueDay)
  plan.next = nextOf(plan, input, segments, dueDay)
  return plan
}

/**
 * The next installment: the first row still to fall due — else, on a plan that runs month by month to today (no
 * fixed term, 利滚利), the month after its last: the interest on what is owed then (利滚利: the whole balance; else the
 * terms' monthly interest) with any principal its terms ask. Nothing on a plan paid up, repaid, or past its term.
 */
function nextOf(plan: RepaymentPlan, input: PlanInput, segments: TermsSegment[], dueDay: number): PlanNext | null {
  if (input.status === 'repaid' || input.status === 'fully_repaid' || input.status === 'cancelled') return null
  const upcoming = plan.rows.find((r) => r.due > input.today)
  if (upcoming) {
    const interest = upcoming.interest
    return { due: upcoming.due, amount: upcoming.installment, principal: r2(Math.max(0, upcoming.installment - interest)), interest }
  }
  const last = plan.rows[plan.rows.length - 1]
  if (plan.kind !== 'open' || !last || last.balance <= PAID_UP) return null
  const ym = addMonthsYM(last.ym, 1)
  const seg = segmentFor(segments, ym)
  const interest = seg.compounding ? r2(last.balance * seg.rate) : seg.interestPerMonth
  const principal = seg.months && !seg.compounding && (!seg.scheduledEndYM || ym <= seg.scheduledEndYM) ? seg.principalPerMonth : 0
  return { due: dueOn(ym, dueDay), amount: r2(principal + interest), principal, interest }
}

interface Pools {
  principalPays: PlanPayment[]
  interestPays: PlanPayment[]
  principalPaid: number
  interestPaid: number
}

function fixedPlan(input: PlanInput, segments: TermsSegment[], pools: Pools, dueDay: number): RepaymentPlan {
  const { terms, status, today } = input
  const { principalPays, interestPays, principalPaid, interestPaid } = pools
  const pending = status === 'pending_approval'
  // The plan: each segment's months, up to where the next one takes over.
  const plan: Array<{ ym: string; principal: number; interest: number; change: TermsSegment | null }> = []
  segments.forEach((seg, s) => {
    const nextFrom = segments[s + 1]?.fromYM ?? null
    const end = seg.scheduledEndYM ?? seg.fromYM
    let ym = seg.fromYM
    let k = 0
    while (ym <= end && (!nextFrom || ym < nextFrom)) {
      k++
      // The segment's last installment takes the cents its equal parts left over.
      const isLast = !nextFrom && ym === end
      const principal = isLast && seg.months ? r2(seg.base - seg.principalPerMonth * (seg.months - 1)) : seg.principalPerMonth
      plan.push({ ym, principal, interest: seg.interestPerMonth, change: k === 1 && seg.changed ? seg : null })
      ym = addMonthsYM(ym, 1)
    }
  })

  const planTotal = r2(plan.reduce((s, q) => s + q.principal + q.interest, 0))
  const owed = r2(Math.max(0, terms.principal - principalPaid))
  const payoff = owed <= PAID_UP && principalPaid > 0 ? reach(principalPays, principalPaid) : null
  const rows: PlanRow[] = []
  let cumDue = 0
  let cumP = 0
  let cumI = 0
  let poolP = principalPaid
  let poolI = interestPaid
  let paidCount = 0
  plan.forEach((q, i) => {
    const installment = r2(q.principal + q.interest)
    cumDue = r2(cumDue + installment)
    cumP = r2(cumP + q.principal)
    cumI = r2(cumI + q.interest)
    const due = dueOn(q.ym, dueDay)
    let outstanding = installment
    let remark = ''
    let tone: PlanTone = ''
    if (!pending) {
      // Oldest first: what is left of each pool goes to this row.
      const fullP = q.principal <= EPS || poolP >= q.principal - slack(q.principal)
      const fullI = q.interest <= EPS || poolI >= q.interest - slack(q.interest)
      const pc = fullP ? q.principal : Math.max(0, poolP)
      const ic = fullI ? q.interest : Math.max(0, poolI)
      poolP = Math.max(0, r2(poolP - q.principal))
      poolI = Math.max(0, r2(poolI - q.interest))
      const paid = r2(pc + ic)
      outstanding = r2(Math.max(0, installment - paid))
      if (fullP && fullI) {
        outstanding = 0
        tone = 'ledger'
        paidCount++
        remark = paidRemark(
          later(
            q.principal > EPS ? reach(principalPays, Math.min(cumP, principalPaid)) : null,
            q.interest > EPS ? reach(interestPays, Math.min(cumI, interestPaid)) : null,
          ),
        )
      } else if (payoff && q.ym > payoff.date.slice(0, 7)) {
        outstanding = 0
        tone = 'info'
        remark = `Settled early · ${day(payoff.date)}`
      } else if (paid > slack(installment)) {
        tone = 'alert'
        remark = `Part paid ${money(paid)} · short ${money(outstanding)}`
      } else if (due < today) {
        tone = 'danger'
        remark = overdue(today, due)
      }
    }
    if (q.change) {
      const note = `Rate change from ${q.change.fromYM}: ${(q.change.rate * 100).toFixed(3)}%`
      remark = remark ? `${remark} · ${note}` : note
      if (!tone) tone = 'alert'
    }
    rows.push({ no: i + 1, ym: q.ym, due, installment, principal: q.principal, interest: q.interest, balance: r2(planTotal - cumDue), outstanding, remark, tone })
  })
  return summary('fixed', rows, rows.length, paidCount, terms.principal, principalPaid, interestPaid)
}

const segmentFor = (segments: TermsSegment[], ym: string): TermsSegment =>
  [...segments].reverse().find((s) => s.fromYM <= ym) ?? segments[0]

/** A month-by-month plan runs to this month — or, once repaid, to the month
 *  of the last payment. */
function endMonth(input: PlanInput, pays: readonly PlanPayment[]): string {
  const repaid = input.status === 'repaid' || input.status === 'fully_repaid'
  if (repaid && pays.length > 0) return pays.reduce((m, p) => (p.date > m ? p.date : m), '').slice(0, 7)
  return input.today.slice(0, 7)
}

function openPlan(input: PlanInput, segments: TermsSegment[], pools: Pools, dueDay: number): RepaymentPlan {
  const { terms, today, status } = input
  const { principalPays, interestPays, principalPaid, interestPaid } = pools
  const pending = status === 'pending_approval'
  const endYM = endMonth(input, [...principalPays, ...interestPays])
  const rows: PlanRow[] = []
  let cumI = 0
  let cumP = 0
  let poolI = interestPaid
  let poolP = principalPaid
  const firstYM = segments[0].fromYM
  // Principal repaid before the first month — the day the money moved, say — is off the balance all the same.
  let principalSoFar = r2(principalPays.filter((p) => p.date.slice(0, 7) < firstYM).reduce((s, p) => s + p.amount, 0))
  let paidCount = 0
  let ym = firstYM
  while (ym <= endYM && rows.length < 600) {
    const seg = segmentFor(segments, ym)
    const interest = seg.interestPerMonth
    // A month an earlier fixed segment governs, within its schedule, still asks that segment's principal.
    const scheduled = seg.months && !seg.compounding && (!seg.scheduledEndYM || ym <= seg.scheduledEndYM) ? principalDueIn(seg, ym) : 0
    const installment = r2(scheduled + interest)
    cumI = r2(cumI + interest)
    cumP = r2(cumP + scheduled)
    const monthPrincipal = r2(principalPays.filter((p) => p.date.slice(0, 7) === ym).reduce((s, p) => s + p.amount, 0))
    principalSoFar = r2(principalSoFar + monthPrincipal)
    const due = dueOn(ym, dueDay)
    let outstanding = installment
    let remark = ''
    let tone: PlanTone = ''
    if (installment <= EPS) {
      // Nothing falls due this month (no interest, no scheduled principal), only principal as it came.
      outstanding = 0
    } else if (!pending) {
      // Oldest first, as a fixed plan sets it: interest against interest, a fixed month's principal against principal.
      const fullI = interest <= EPS || poolI >= interest - slack(interest)
      const fullP = scheduled <= EPS || poolP >= scheduled - slack(scheduled)
      const ic = fullI ? interest : Math.max(0, poolI)
      const pc = fullP ? scheduled : Math.max(0, poolP)
      poolI = Math.max(0, r2(poolI - interest))
      poolP = Math.max(0, r2(poolP - scheduled))
      const paid = r2(ic + pc)
      outstanding = r2(Math.max(0, installment - paid))
      if (fullI && fullP) {
        outstanding = 0
        tone = 'ledger'
        paidCount++
        remark = paidRemark(
          later(
            scheduled > EPS ? reach(principalPays, Math.min(cumP, principalPaid)) : null,
            interest > EPS ? reach(interestPays, Math.min(cumI, interestPaid)) : null,
          ),
        )
      } else if (paid > slack(installment)) {
        tone = 'alert'
        remark = `Part paid ${money(paid)} · short ${money(outstanding)}`
      } else if (due < today) {
        tone = 'danger'
        remark = overdue(today, due)
      }
    }
    // A no-fixed-term month says the principal that came in; a fixed month's Principal is what it asks.
    if (!pending && monthPrincipal > 0 && scheduled <= EPS) remark = remark ? `${remark} · principal ${money(monthPrincipal)}` : `Principal ${money(monthPrincipal)} repaid`
    const balance = r2(Math.max(0, terms.principal - principalSoFar))
    rows.push({ no: rows.length + 1, ym, due, installment, principal: scheduled > EPS ? scheduled : monthPrincipal > 0 ? monthPrincipal : null, interest, balance, outstanding, remark, tone })
    if (balance <= PAID_UP) break
    ym = addMonthsYM(ym, 1)
  }
  return summary('open', rows, null, paidCount, terms.principal, principalPaid, interestPaid)
}

const figure = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const monthWords = (ym: string) => dayjs(`${ym}-01`).format('MMM YYYY')

/** The line over the row that starts a set of terms in a 利滚利 plan. */
function termsBreak(seg: TermsSegment, toYM: string, rolledFrom: number | null): { head: string; rest: string } {
  const rate = `${(seg.rate * 100).toFixed(3)}% /mo`
  if (!seg.compounding) {
    return {
      head: `${monthWords(seg.fromYM)} – ${monthWords(toYM)}`,
      rest: `${rate} flat · ${seg.months ? `RM ${figure(seg.principalPerMonth)} + ${figure(seg.interestPerMonth)} a month` : `interest RM ${figure(seg.interestPerMonth)} a month`}`,
    }
  }
  return {
    head: `From ${monthWords(seg.fromYM)}`,
    rest: `${rate} compounding · ${seg.months ? `${seg.months} months` : 'no fixed term'}${rolledFrom != null ? ` · rolls from RM ${figure(rolledFrom)} owed` : ''}`,
  }
}

function compoundPlan(input: PlanInput, segments: TermsSegment[], pools: Pools, dueDay: number): RepaymentPlan {
  const { terms, today, status, isPrincipal } = input
  const { principalPays, interestPays, principalPaid, interestPaid } = pools
  const pending = status === 'pending_approval'
  const pays = [...principalPays, ...interestPays].sort((a, b) => a.date.localeCompare(b.date))
  const endYM = endMonth(input, pays)
  const nowYM = today.slice(0, 7)
  const rows: PlanRow[] = []
  const breaks: CompoundFacts['breaks'] = []
  let paidCount = 0
  // 利滚利 rolls from the terms' first compounding month (lib/treasury-terms compoundRoll — the Company Statement's):
  // compounding from day one, the original principal from the first month; flat before and compounding from X, the
  // flat months as their terms asked them — principal and interest, the payments before X set against them oldest
  // first, as an open plan sets them — and the roll from X on the principal still owed then (the segment's base). The
  // flat months' interest was paid apart: none of it is rolled in.
  const k = Math.max(0, segments.findIndex((s) => s.compounding))
  const rollYM = segments[k].fromYM
  let ym = segments[0].fromYM
  if (k > 0) {
    const early = (p: PlanPayment) => p.date.slice(0, 7) < rollYM
    const flatP = principalPays.filter(early)
    const flatI = interestPays.filter(early)
    const paidP = r2(flatP.reduce((s, p) => s + p.amount, 0))
    const paidI = r2(flatI.reduce((s, p) => s + p.amount, 0))
    let poolP = paidP
    let poolI = paidI
    let cumP = 0
    let cumI = 0
    // Principal repaid before the first month is off the balance all the same (openPlan's rule).
    let principalSoFar = r2(flatP.filter((p) => p.date.slice(0, 7) < ym).reduce((s, p) => s + p.amount, 0))
    while (ym < rollYM && ym <= endYM && rows.length < 600) {
      const seg = segmentFor(segments, ym)
      if (ym === seg.fromYM || rows.length === 0) {
        const next = segments.find((s) => s.fromYM > ym)
        breaks.push({ no: rows.length + 1, ...termsBreak(seg, addMonthsYM(next ? next.fromYM : rollYM, -1), null) })
      }
      const scheduled = seg.months && (!seg.scheduledEndYM || ym <= seg.scheduledEndYM) ? principalDueIn(seg, ym) : 0
      const interest = seg.interestPerMonth
      const installment = r2(scheduled + interest)
      cumP = r2(cumP + scheduled)
      cumI = r2(cumI + interest)
      principalSoFar = r2(principalSoFar + flatP.filter((p) => p.date.slice(0, 7) === ym).reduce((s, p) => s + p.amount, 0))
      const due = dueOn(ym, dueDay)
      let outstanding = installment
      let paid = 0
      let remark = ''
      let tone: PlanTone = ''
      if (!pending && installment > EPS) {
        const fullI = interest <= EPS || poolI >= interest - slack(interest)
        const fullP = scheduled <= EPS || poolP >= scheduled - slack(scheduled)
        paid = r2((fullI ? interest : Math.max(0, poolI)) + (fullP ? scheduled : Math.max(0, poolP)))
        poolI = Math.max(0, r2(poolI - interest))
        poolP = Math.max(0, r2(poolP - scheduled))
        outstanding = r2(Math.max(0, installment - paid))
        if (fullI && fullP) {
          outstanding = 0
          paid = installment
          tone = 'ledger'
          paidCount++
          remark = paidRemark(
            later(scheduled > EPS ? reach(flatP, Math.min(cumP, paidP)) : null, interest > EPS ? reach(flatI, Math.min(cumI, paidI)) : null),
          )
        } else if (paid > slack(installment)) {
          tone = 'alert'
          remark = `Part paid ${money(paid)} · short ${money(outstanding)}`
        } else if (due < today) {
          tone = 'danger'
          remark = overdue(today, due)
        }
      } else if (installment <= EPS) {
        outstanding = 0
      }
      const balance = r2(Math.max(0, terms.principal - principalSoFar))
      rows.push({ no: rows.length + 1, ym, due, installment, principal: scheduled > EPS ? scheduled : null, interest, balance, outstanding, remark, tone, paid, toBalance: 0 })
      ym = addMonthsYM(ym, 1)
    }
  }
  let balance = k > 0 ? segments[k].base : terms.principal
  while (ym <= endYM && rows.length < 600) {
    const seg = segmentFor(segments, ym)
    if (segments.length > 1 && ym === seg.fromYM) breaks.push({ no: rows.length + 1, ...termsBreak(seg, ym, k > 0 && seg === segments[k] ? balance : null) })
    const interest = r2(balance * seg.rate)
    const month = pays.filter((p) => p.date.slice(0, 7) === ym)
    const paid = r2(month.reduce((s, p) => s + p.amount, 0))
    const monthPrincipal = r2(month.filter((p) => isPrincipal(p.type)).reduce((s, p) => s + p.amount, 0))
    const due = dueOn(ym, dueDay)
    const last = month[month.length - 1] ?? null
    let outstanding = 0
    let toBalance = 0
    let remark = ''
    let tone: PlanTone = ''
    if (paid > 0 && paid >= interest - slack(interest)) {
      tone = 'ledger'
      paidCount++
      remark = paidRemark(last ? { date: last.date, ref: last.ref } : null)
    } else if (ym === nowYM) {
      outstanding = r2(interest - paid)
      if (paid > EPS) {
        tone = 'alert'
        remark = `Part paid · short ${figure(outstanding)}`
      } else if (due < today && !pending) {
        tone = 'danger'
        remark = overdue(today, due)
      }
    } else if (!pending) {
      toBalance = r2(interest - paid)
      tone = 'alert'
      remark = `${paid > EPS ? 'Part paid' : 'Unpaid'} · ${figure(toBalance)} to balance`
    }
    balance = r2(Math.max(0, balance + interest - paid))
    rows.push({ no: rows.length + 1, ym, due, installment: interest, principal: monthPrincipal > 0 ? monthPrincipal : null, interest, balance, outstanding, remark, tone, paid, toBalance })
    if (balance <= PAID_UP) break
    ym = addMonthsYM(ym, 1)
  }
  const added = rows.filter((r) => (r.toBalance ?? 0) > EPS)
  return summary('open', rows, null, paidCount, terms.principal, principalPaid, interestPaid, {
    breaks,
    owedNow: rows.length > 0 ? rows[rows.length - 1].balance : terms.principal,
    paidToDate: r2(principalPaid + interestPaid),
    addedToBalance: r2(added.reduce((s, r) => s + (r.toBalance ?? 0), 0)),
    addedFrom: added[0]?.ym ?? null,
    addedTo: added[added.length - 1]?.ym ?? null,
  })
}
