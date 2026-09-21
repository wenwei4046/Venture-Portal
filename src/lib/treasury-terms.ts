// Terms that change mid-life — 「从某月起生效」 (user 2026-09-21).
//
// A loan / fund source used to have ONE set of terms (rate, tenure, compound)
// that every engine read straight off the record and applied from day one,
// so a rate change in September re-stated April too. Now the record's
// columns hold the terms in force TODAY and `treasury_terms_history` keeps
// every earlier segment with the months it governed. This module turns the
// two into an ordered list of segments and answers the per-month questions
// the schedule, the Company Statement and the Loan Monitor ask.
//
// Conventions (all decided with the user 2026-09-21):
//   flat     segment 0: principal/month = original ÷ tenure, interest/month =
//            original × rate. A later segment starting at X: base = principal
//            still owed at the start of X (ACTUAL principal repaid, not the
//            scheduled amount), principal/month = base ÷ remaining months,
//            interest/month = base × new rate — flat on that base for the
//            whole segment.
//   compound the balance rolls month by month; the rate switches at X.
//   nothing already recorded (PVs, repayment rows, GL) moves — the only thing
//   that changes is what each month is DUE, and the statement shows the
//   difference (老 vs 新, 应付 vs 已付) for the months a change touched.

const r2 = (n: number) => Math.round(n * 100) / 100

export function addMonthsYM(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

/** Whole months from `fromYM` to `toYM` (negative when toYM is earlier). */
export function monthsBetweenYM(fromYM: string, toYM: string): number {
  const [fy, fm] = fromYM.split('-').map(Number)
  const [ty, tm] = toYM.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** First installment month: the agreed start when set, else the record's
 *  month + 1 (disbursement / effective date). */
export function resolveFirstDueYM(startMonth: string | null, baseDate: string | null): string | null {
  if (startMonth) return startMonth.slice(0, 7)
  if (!baseDate) return null
  return addMonthsYM(baseDate.slice(0, 7), 1)
}

export interface TermsHistoryRow {
  /** First / last month the segment governed, 'YYYY-MM' (inclusive). */
  validFrom: string
  validTo: string
  rate: number
  months: number | null
  compounding: boolean
  reason?: string | null
}

export interface PositionTerms {
  principal: number
  /** The record's own month (disbursement / effective date), 'YYYY-MM'. */
  startYM: string | null
  /** First installment month (agreed start, else startYM + 1). */
  firstDueYM: string | null
  /** Terms in force today — the record's columns. */
  current: {
    rate: number
    months: number | null
    compounding: boolean
    /** 'YYYY-MM' the current terms took effect; null = unchanged since day one. */
    effectiveFrom: string | null
    reason?: string | null
  }
  history: TermsHistoryRow[]
}

export interface TermsSegment {
  /** First month the segment governs. Segment 0 = firstDueYM (installments) or startYM. */
  fromYM: string
  /** Last month governed, inclusive; null = open-ended (no fixed term, or the
   *  current segment of a compounding deal). */
  toYM: string | null
  rate: number
  compounding: boolean
  months: number | null
  /** Flat base the segment's figures are computed on. */
  base: number
  principalPerMonth: number
  interestPerMonth: number
  /** Scheduled last installment month by the segment's OWN count (from + months − 1). */
  scheduledEndYM: string | null
  /** false only for the original terms. */
  changed: boolean
  reason?: string | null
}

/** Sum of principal repaid in months strictly before `ym`. */
function principalPaidBefore(byMonth: Record<string, number>, ym: string): number {
  let s = 0
  for (const [k, v] of Object.entries(byMonth)) if (k < ym) s += v
  return r2(s)
}

/** The ordered segments for a position. With no history and no
 *  effectiveFrom this is ONE segment equal to the legacy reading, so every
 *  existing figure is unchanged. */
export function buildTermsSegments(t: PositionTerms, principalPaidByMonth: Record<string, number> = {}): TermsSegment[] {
  const start = t.firstDueYM ?? t.startYM
  if (!start) {
    // No dates at all — a single segment anchored nowhere; callers treat it as legacy.
    const months = t.current.months
    return [
      {
        fromYM: '0000-00',
        toYM: null,
        rate: t.current.rate,
        compounding: t.current.compounding,
        months,
        base: t.principal,
        principalPerMonth: months ? r2(t.principal / Math.max(1, months)) : 0,
        interestPerMonth: r2(t.principal * t.current.rate),
        scheduledEndYM: null,
        changed: false,
        reason: null,
      },
    ]
  }

  const raw: { fromYM: string; toYM: string | null; rate: number; months: number | null; compounding: boolean; changed: boolean; reason?: string | null }[] = []
  // A history row is written when a change ENDS a segment, so its reason
  // belongs to the segment that follows it.
  const hist = [...t.history].sort((a, b) => a.validFrom.localeCompare(b.validFrom))
  hist.forEach((h, i) => {
    raw.push({
      fromYM: i === 0 ? start : h.validFrom,
      toYM: h.validTo,
      rate: h.rate,
      months: h.months,
      compounding: h.compounding,
      changed: i > 0,
      reason: i > 0 ? hist[i - 1].reason ?? null : null,
    })
  })
  const curFrom = t.current.effectiveFrom ?? (hist.length > 0 ? addMonthsYM(hist[hist.length - 1].validTo, 1) : start)
  raw.push({
    fromYM: hist.length === 0 ? start : curFrom,
    toYM: null,
    rate: t.current.rate,
    months: t.current.months,
    compounding: t.current.compounding,
    changed: hist.length > 0 || t.current.effectiveFrom != null,
    reason: (hist.length > 0 ? hist[hist.length - 1].reason : null) ?? t.current.reason ?? null,
  })

  const out: TermsSegment[] = []
  raw.forEach((seg, i) => {
    const prev = out[i - 1]
    const base = i === 0 ? t.principal : r2(Math.max(0, t.principal - principalPaidBefore(principalPaidByMonth, seg.fromYM)))
    // A segment that names no month count inherits the previous schedule's
    // END, i.e. keeps the same last installment month with the new rate.
    let months = seg.months
    if (months == null && prev && prev.scheduledEndYM) {
      months = Math.max(1, monthsBetweenYM(seg.fromYM, prev.scheduledEndYM) + 1)
    }
    const scheduledEndYM = months ? addMonthsYM(seg.fromYM, months - 1) : null
    // Flat: a segment ends where the next one starts or at its own schedule end.
    const toYM = seg.toYM ?? (seg.compounding ? null : scheduledEndYM)
    out.push({
      fromYM: seg.fromYM,
      toYM,
      rate: seg.rate,
      compounding: seg.compounding,
      months,
      base,
      principalPerMonth: months ? r2(base / months) : 0,
      interestPerMonth: r2(base * seg.rate),
      scheduledEndYM,
      changed: seg.changed,
      reason: seg.reason ?? null,
    })
  })
  return out
}

export const termsChanged = (segments: TermsSegment[]): boolean => segments.some((s) => s.changed)

/** The segment governing `ym`, or null before the first / after the last. */
export function segmentAt(segments: TermsSegment[], ym: string): TermsSegment | null {
  for (const s of segments) {
    if (ym < s.fromYM) return null
    if (s.toYM == null || ym <= s.toYM) return s
  }
  return null
}

/** The segment whose figures describe "now": the one governing currentYM,
 *  else the last one (plan finished / not started yet still reads the terms
 *  it will run on). */
export function currentSegment(segments: TermsSegment[], currentYM: string): TermsSegment {
  return segmentAt(segments, currentYM) ?? (currentYM < segments[0].fromYM ? segments[0] : segments[segments.length - 1])
}

/** Monthly rate for compounding accrual in `ym`. Months before the first
 *  segment use its rate (accrual starts the month the money moved, which is
 *  a month before the first installment). */
export function rateAt(segments: TermsSegment[], ym: string): number {
  let rate = segments[0].rate
  for (const s of segments) if (ym >= s.fromYM) rate = s.rate
  return rate
}

export interface CompoundRoll {
  /** Outstanding incl. capitalised interest at the START of currentYM. */
  balance: number
  /** Interest due for currentYM on that balance. */
  thisMonthInterest: number
  /** Month the roll started from and the balance it started with. */
  fromYM: string
  base: number
}

/** 利滚利 balance for a deal that compounds now. A deal that compounded from
 *  day one rolls from the record's own month on the original principal (the
 *  legacy reading, the rate switching where the terms did). A deal that was
 *  FLAT and turned compounding at X rolls from X on the principal still owed
 *  then — the flat months paid their interest separately, nothing to
 *  capitalise (user's example 2026-09-21: 60k @ 0.5% flat, 43k owed, "从一月
 *  才开始重新算 4% compound"). Null when the current terms don't compound. */
export function compoundRoll(
  segments: TermsSegment[],
  opts: {
    principal: number
    /** The record's own month (disbursement / effective), 'YYYY-MM'. */
    startYM: string | null
    currentYM: string
    /** Total repaid (all types) per calendar month. */
    paymentsByMonth: Record<string, number>
  },
): CompoundRoll | null {
  const last = segments[segments.length - 1]
  if (!last || !last.compounding) return null
  const k = segments.findIndex((s) => s.compounding)
  const seg = segments[k]
  const fromYM = k === 0 ? (opts.startYM ?? seg.fromYM) : seg.fromYM
  let balance = k === 0 ? opts.principal : seg.base
  let ym = fromYM
  let guard = 0
  while (ym < opts.currentYM && guard < 1200) {
    const interest = r2(balance * rateAt(segments, ym))
    const paid = opts.paymentsByMonth[ym] ?? 0
    balance = r2(balance + interest - paid)
    if (balance < 0) balance = 0
    ym = addMonthsYM(ym, 1)
    guard++
  }
  return { balance, thisMonthInterest: r2(balance * rateAt(segments, opts.currentYM)), fromYM, base: k === 0 ? opts.principal : seg.base }
}

/** Principal repaid in months on/after the segment's first month. */
export function principalPaidSince(byMonth: Record<string, number>, fromYM: string): number {
  let s = 0
  for (const [k, v] of Object.entries(byMonth)) if (k >= fromYM) s += v
  return r2(s)
}

/** Remaining flat installments of a segment given the principal repaid since
 *  it started (same rounding tolerance as loan-monitor's remainingPeriods). */
export function segmentRemainingPeriods(seg: TermsSegment, paidSinceFrom: number): number {
  if (!seg.months || seg.principalPerMonth <= 0) return 0
  const done = Math.floor((paidSinceFrom + 0.005) / seg.principalPerMonth)
  return Math.max(0, seg.months - done)
}

// ─── Aging across segments ─────────────────────────────────────────────────
// Same FIFO pooling as lib/loan-aging, but the installment amount is the one
// the governing segment prescribes for that month.

export interface AgingBucketsLike {
  current: number
  m1: number
  m2: number
  m3: number
  total: number
}

export function buildSegmentedAging(args: {
  segments: TermsSegment[]
  asOfYM: string
  totalPaid: number
}): AgingBucketsLike {
  const out: AgingBucketsLike = { current: 0, m1: 0, m2: 0, m3: 0, total: 0 }
  const first = args.segments[0]
  if (!first || first.fromYM === '0000-00') return out
  let paidLeft = args.totalPaid
  let ym = first.fromYM
  let guard = 0
  while (ym <= args.asOfYM && guard < 1200) {
    const seg = segmentAt(args.segments, ym)
    if (!seg) break // past the last scheduled installment
    const installment = r2(seg.principalPerMonth + seg.interestPerMonth)
    if (installment > 0) {
      const applied = Math.min(paidLeft, installment)
      paidLeft = r2(paidLeft - applied)
      const unpaid = r2(installment - applied)
      const age = monthsBetweenYM(ym, args.asOfYM)
      if (unpaid > 0) {
        if (age === 0) out.current = r2(out.current + unpaid)
        else if (age === 1) out.m1 = r2(out.m1 + unpaid)
        else if (age === 2) out.m2 = r2(out.m2 + unpaid)
        else out.m3 = r2(out.m3 + unpaid)
      }
    }
    ym = addMonthsYM(ym, 1)
    guard++
  }
  out.total = r2(out.current + out.m1 + out.m2 + out.m3)
  return out
}

// ─── 差价 — what a change did to the plan ──────────────────────────────────
// For the change that starts segment k: the OLD plan is segment k−1 carried
// on unchanged to its own scheduled end; the NEW plan is what the segments
// from k onward prescribe. Month by month from X to the later of the two
// ends, plus, for months already reached, what was actually paid.

export interface TermsChangeMonthRow {
  ym: string
  oldPrincipal: number
  oldInterest: number
  newPrincipal: number
  newInterest: number
  /** new − old, interest only / all-in. */
  diffInterest: number
  diffTotal: number
  /** Only for months ≤ currentYM. */
  paidPrincipal?: number
  paidInterest?: number
  /** (newPrincipal + newInterest) − paid; positive = still short. */
  shortfall?: number
}

export interface TermsChangeComparison {
  fromYM: string
  old: { rate: number; months: number | null; principalPerMonth: number; interestPerMonth: number; endYM: string | null; compounding: boolean }
  new: { rate: number; months: number | null; principalPerMonth: number; interestPerMonth: number; endYM: string | null; compounding: boolean; base: number }
  reason: string | null
  rows: TermsChangeMonthRow[]
  totals: {
    oldInterest: number
    newInterest: number
    diffInterest: number
    oldTotal: number
    newTotal: number
    diffTotal: number
    /** Σ shortfall over months ≤ currentYM. */
    shortfall: number
  }
}

export function compareTermsChange(
  segments: TermsSegment[],
  k: number,
  opts: { currentYM: string; paidByMonth?: Record<string, { principal: number; interest: number }> },
): TermsChangeComparison | null {
  const seg = segments[k]
  const prev = segments[k - 1]
  if (!seg || !prev || !seg.changed) return null
  const x = seg.fromYM
  const oldEnd = prev.scheduledEndYM
  const newEnd = segments[segments.length - 1].scheduledEndYM
  const last = [oldEnd, newEnd].filter((e): e is string => !!e).sort().pop() ?? null
  const rows: TermsChangeMonthRow[] = []
  if (last && !prev.compounding && !seg.compounding) {
    let ym = x
    let guard = 0
    while (ym <= last && guard < 1200) {
      const oldOn = oldEnd != null && ym <= oldEnd
      const s = segmentAt(segments, ym)
      const newOn = !!s && ym >= x
      const oldP = oldOn ? prev.principalPerMonth : 0
      const oldI = oldOn ? prev.interestPerMonth : 0
      const newP = newOn ? s!.principalPerMonth : 0
      const newI = newOn ? s!.interestPerMonth : 0
      const row: TermsChangeMonthRow = {
        ym,
        oldPrincipal: oldP,
        oldInterest: oldI,
        newPrincipal: newP,
        newInterest: newI,
        diffInterest: r2(newI - oldI),
        diffTotal: r2(newP + newI - oldP - oldI),
      }
      if (ym <= opts.currentYM) {
        const paid = opts.paidByMonth?.[ym] ?? { principal: 0, interest: 0 }
        row.paidPrincipal = r2(paid.principal)
        row.paidInterest = r2(paid.interest)
        row.shortfall = r2(newP + newI - paid.principal - paid.interest)
      }
      rows.push(row)
      ym = addMonthsYM(ym, 1)
      guard++
    }
  }
  const totals = rows.reduce(
    (acc, r) => ({
      oldInterest: r2(acc.oldInterest + r.oldInterest),
      newInterest: r2(acc.newInterest + r.newInterest),
      diffInterest: r2(acc.diffInterest + r.diffInterest),
      oldTotal: r2(acc.oldTotal + r.oldPrincipal + r.oldInterest),
      newTotal: r2(acc.newTotal + r.newPrincipal + r.newInterest),
      diffTotal: r2(acc.diffTotal + r.diffTotal),
      shortfall: r2(acc.shortfall + (r.shortfall ?? 0)),
    }),
    { oldInterest: 0, newInterest: 0, diffInterest: 0, oldTotal: 0, newTotal: 0, diffTotal: 0, shortfall: 0 },
  )
  return {
    fromYM: x,
    old: { rate: prev.rate, months: prev.months, principalPerMonth: prev.principalPerMonth, interestPerMonth: prev.interestPerMonth, endYM: oldEnd, compounding: prev.compounding },
    new: { rate: seg.rate, months: seg.months, principalPerMonth: seg.principalPerMonth, interestPerMonth: seg.interestPerMonth, endYM: seg.scheduledEndYM, compounding: seg.compounding, base: seg.base },
    reason: seg.reason ?? null,
    rows,
    totals,
  }
}

/** Every change on a position, oldest first. */
export function allTermsChanges(
  segments: TermsSegment[],
  opts: { currentYM: string; paidByMonth?: Record<string, { principal: number; interest: number }> },
): TermsChangeComparison[] {
  const out: TermsChangeComparison[] = []
  for (let k = 1; k < segments.length; k++) {
    const c = compareTermsChange(segments, k, opts)
    if (c) out.push(c)
  }
  return out
}
