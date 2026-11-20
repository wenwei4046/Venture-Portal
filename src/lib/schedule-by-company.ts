// The Repayment Schedule by company (2026-11-13 — the user: "其实这个we collect 和 wepay 可以不可以根据每笔loan 来显示 /
// 显示company … 同一家的话就不需要we pay we collect 了吧？ … 我需要很清晰的看到每个月we pay 和we collect 后的公司是赚还是亏";
// the mockup approved: "照这个做"). We collect and We pay become one table, a row a company with both its sides — what
// we collect from it, what we pay it, the net, the interest profit — its deals under it, each marked Collect or Pay.
//
// One reading of the month (2026-11-20 — the user: "这样我就认为不需要分actual 和by right 了吧"), each side adding up:
//   This month + Overdue at the month's 1st = Settled so far + Still to settle.
//   This month      — the month's own instalments (a compounding month that rolls into the balance asks no cash).
//   Overdue         — what earlier months still owed as the month began: the plan read with the repayments before the
//                     1st only, so what came in this month does not take it down (the office's month only).
//   Settled so far  — repaid in the month, a contra (netting) with it; a penalty is no instalment and stays out.
//   Still to settle — this month's and earlier months' instalments still owed now.
// Net and Interest + penalty read the cash: what came in − what went out, a contra left out, being no cash.
// A company is who the deal is with BY ID (2026-11-15): two deals that only share a name — a lender typed as text, a
// loan with no company — stand apart; a lender typed as text joins its company once the deal names it.
// The month's rows are the We collect / We pay lists' (lib/schedule-list), so the two never disagree. The six months
// of the chart read each deal's own plan month by month (what fell due in it) and its repayments (what came in).

import type { CalendarEntry } from './repayment-calendar'
import type { ListRow } from './schedule-list'

const EPS = 0.005
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type Side = 'collect' | 'pay'
export type Basis = 'act' | 'due'

/** A month of a deal: by right (due, its interest), the cash (got, its interest — a penalty with it) and what was
 *  settled (cash and contra, no penalty). */
export interface DealMonth {
  due: number
  dueInterest: number
  got: number
  gotInterest: number
  settled: number
}

/** What the page knows of a deal beside the month's rows (lib/repayment-schedule's loader). */
export interface DealFacts {
  id: string
  side: Side
  /** Who it is with: the company's short code (a fund source's lender otherwise) — the words only. */
  company: string
  /** Who it is with, by id (2026-11-15 — the user: "按 id"): `co:<company id>`, a fund source's `dir:` / `dept:`
   *  lender, or the deal's own (`loan:` / `fs:`) when it names no one by id — a lender typed as text, a loan with no
   *  company. Deals stand under one company only when this is the same; two that merely share a name do not. */
  companyKey: string
  /** Its tag as Finance writes it in its terms ("LO#5", "BI#1"); null when none. */
  tag: string | null
  /** "RM 90,000.00 @ 4.000% /mo · 8mo · compound" ("48.000% /yr · 4.000% /mo" for a deal agreed a year's rate). */
  words: string
  /** Its page (Back returns to the month). */
  href: string
  /** Its next instalment after today. */
  next: { due: string; amount: number } | null
  /** The day of its last cash repayment. */
  last: string | null
  /** What is owed on it now, principal and interest (0 once repaid). */
  owe: number
  /** By month, YYYY-MM → its month (only the months the page reads). */
  months: Record<string, DealMonth>
  /** What earlier months still owed in cash as the page's month began (the office's month only; 0 otherwise). */
  bf?: number
}

export interface CoDeal {
  id: string
  side: Side
  tag: string | null
  words: string
  href: string
  /** This month's own instalments in cash. */
  now: number
  /** What earlier months still owed as the month began. */
  bf: number
  /** Still owed from months before this one, now (the Still overdue filter). */
  earlier: number
  /** Settled in the month: cash and contra, no penalty. */
  settled: number
  /** Cash: came in (went out) this month, its interest and penalty. */
  got: number
  gotInterest: number
  /** Still to settle in cash on the month's rows, this month's and earlier ones'. */
  open: number
  next: DealFacts['next']
  last: string | null
  owe: number
  /** A repayment PV for it awaits approval (We pay). */
  pending: boolean
}

export interface Company {
  /** Its DealFacts.companyKey — what the table keys a row by. */
  key: string
  name: string
  deals: CoDeal[]
  /** Both sides: we collect from it and pay it. */
  both: boolean
  /** What they owe us − what we owe them, every deal with it (a sign to contra). */
  position: number
}

/** A company's (or the page's) figures, each side. */
export interface Figures {
  /** This month's own instalments. */
  nowCollect: number
  nowPay: number
  /** Overdue as the month began. */
  bfCollect: number
  bfPay: number
  /** Settled in the month, cash and contra. */
  settledCollect: number
  settledPay: number
  /** Still to settle, this month's and overdue. */
  openCollect: number
  openPay: number
  /** Cash that came in − went out. */
  net: number
  /** Interest and penalty in cash, each way, and in − out. */
  interestIn: number
  interestOut: number
  profit: number
  /** Still owed from months before, both sides together, now (the Still overdue filter). */
  earlier: number
}

export interface HistMonth {
  /** YYYY-MM */
  ym: string
  due: { interestIn: number; interestOut: number; cashIn: number; cashOut: number }
  act: { interestIn: number; interestOut: number; cashIn: number; cashOut: number }
}

const emptyMonth = (): DealMonth => ({ due: 0, dueInterest: 0, got: 0, gotInterest: 0, settled: 0 })

/** The `count` months up to and with `ym`, oldest first. */
export function monthsTo(ym: string, count: number): string[] {
  const [y, m] = ym.split('-').map(Number)
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** A month's instalments by right: the cash they ask (a month that rolls into the balance asks none) and their interest. */
export function dueOfEntries(entries: CalendarEntry[], compounding: boolean): { due: number; dueInterest: number } {
  let due = 0
  let dueInterest = 0
  for (const e of entries) {
    const rolls = e.rolled > EPS || (compounding && e.outstanding > EPS)
    if (!rolls) due += e.amount
    dueInterest += e.instInterest
  }
  return { due: r2(due), dueInterest: r2(dueInterest) }
}

/** A deal's repayments by month — the cash (a contra, netting, is none), the interest and penalty among it, and what
 *  was settled (cash and contra; a penalty is no instalment) — and the day of its last cash. */
export function actualsOf(payments: Array<{ date: string; type: string; amount: number }>): {
  byMonth: Record<string, { got: number; gotInterest: number; settled: number }>
  last: string | null
} {
  const byMonth: Record<string, { got: number; gotInterest: number; settled: number }> = {}
  let last: string | null = null
  for (const p of payments) {
    const ym = p.date.slice(0, 7)
    const m = (byMonth[ym] ??= { got: 0, gotInterest: 0, settled: 0 })
    if (p.type !== 'penalty') m.settled = r2(m.settled + p.amount)
    if (p.type === 'netting') continue
    m.got = r2(m.got + p.amount)
    if (p.type !== 'principal') m.gotInterest = r2(m.gotInterest + p.amount)
    if (!last || p.date > last) last = p.date
  }
  return { byMonth, last }
}

/** The month by company: each deal with something in the month (due, owed from before, or paid), under its company. */
export function byCompany(input: { facts: DealFacts[]; collectList: ListRow[]; payList: ListRow[]; month: string }): Company[] {
  const { facts, collectList, payList, month } = input
  const start = `${month}-01`
  const factById = new Map(facts.map((f) => [`${f.side}:${f.id}`, f]))
  const rowsBy = new Map<string, ListRow[]>()
  for (const [side, list] of [['collect', collectList], ['pay', payList]] as const)
    for (const r of list) {
      const k = `${side}:${r.id}`
      rowsBy.set(k, [...(rowsBy.get(k) ?? []), r])
      // A row whose deal the loader did not read (should not happen): it still stands, under its own name.
      if (!factById.has(k))
        factById.set(k, { id: r.id, side, company: r.counterparty, companyKey: k, tag: null, words: r.detail, href: '', next: null, last: null, owe: 0, months: {} })
    }

  const deals = new Map<string, CoDeal[]>()
  const nameOf = new Map<string, string>()
  for (const [k, f] of factById) {
    const rows = rowsBy.get(k) ?? []
    const now = rows.filter((r) => r.date >= start)
    const before = rows.filter((r) => r.date < start)
    const act = f.months[month] ?? emptyMonth()
    const d: CoDeal = {
      id: f.id,
      side: f.side,
      tag: f.tag,
      words: f.words,
      href: f.href,
      now: r2(now.filter((r) => r.status !== 'rolled').reduce((s, r) => s + r.due, 0)),
      bf: r2(f.bf ?? 0),
      earlier: r2(before.reduce((s, r) => s + (r.owed ?? 0), 0)),
      settled: act.settled,
      got: act.got,
      gotInterest: act.gotInterest,
      open: r2(rows.reduce((s, r) => s + (r.owed ?? 0), 0)),
      next: f.next,
      last: f.last,
      owe: f.owe,
      pending: rows.some((r) => r.pending),
    }
    if (rows.length === 0 && d.now < EPS && d.bf < EPS && d.settled < EPS && d.got < EPS) continue
    deals.set(f.companyKey, [...(deals.get(f.companyKey) ?? []), d])
    if (!nameOf.has(f.companyKey)) nameOf.set(f.companyKey, f.company)
  }

  const position = new Map<string, number>()
  for (const f of factById.values()) position.set(f.companyKey, r2((position.get(f.companyKey) ?? 0) + (f.side === 'collect' ? f.owe : -f.owe)))

  return [...deals.entries()]
    .map(([key, ds]) => ({
      key,
      name: nameOf.get(key) ?? key,
      deals: ds.sort((a, b) => (a.side === b.side ? (a.tag ?? a.words).localeCompare(b.tag ?? b.words) : a.side === 'collect' ? -1 : 1)),
      both: ds.some((d) => d.side === 'collect') && ds.some((d) => d.side === 'pay'),
      position: position.get(key) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
}

/** Deals' figures: each side's this month, overdue as the month began, settled and still to settle; the cash net
 *  and its interest. */
export function figuresOf(deals: CoDeal[]): Figures {
  const sum = (side: Side, k: 'now' | 'bf' | 'settled' | 'open' | 'got' | 'gotInterest') =>
    r2(deals.filter((d) => d.side === side).reduce((s, d) => s + d[k], 0))
  const interestIn = sum('collect', 'gotInterest')
  const interestOut = sum('pay', 'gotInterest')
  return {
    nowCollect: sum('collect', 'now'),
    nowPay: sum('pay', 'now'),
    bfCollect: sum('collect', 'bf'),
    bfPay: sum('pay', 'bf'),
    settledCollect: sum('collect', 'settled'),
    settledPay: sum('pay', 'settled'),
    openCollect: sum('collect', 'open'),
    openPay: sum('pay', 'open'),
    net: r2(sum('collect', 'got') - sum('pay', 'got')),
    interestIn,
    interestOut,
    profit: r2(interestIn - interestOut),
    earlier: r2(deals.reduce((s, d) => s + d.earlier, 0)),
  }
}

/** The chart's months: each side's interest and cash, by right and actual. */
export function historyOf(facts: DealFacts[], months: string[]): HistMonth[] {
  return months.map((ym) => {
    const t = { due: { interestIn: 0, interestOut: 0, cashIn: 0, cashOut: 0 }, act: { interestIn: 0, interestOut: 0, cashIn: 0, cashOut: 0 } }
    for (const f of facts) {
      const m = f.months[ym]
      if (!m) continue
      const c = f.side === 'collect'
      t.due[c ? 'cashIn' : 'cashOut'] += m.due
      t.due[c ? 'interestIn' : 'interestOut'] += m.dueInterest
      t.act[c ? 'cashIn' : 'cashOut'] += m.got
      t.act[c ? 'interestIn' : 'interestOut'] += m.gotInterest
    }
    const round = (o: typeof t.due) => ({ interestIn: r2(o.interestIn), interestOut: r2(o.interestOut), cashIn: r2(o.cashIn), cashOut: r2(o.cashOut) })
    return { ym, due: round(t.due), act: round(t.act) }
  })
}
