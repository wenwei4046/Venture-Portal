// The Repayment Schedule by company (2026-11-13 — the user: "其实这个we collect 和 wepay 可以不可以根据每笔loan 来显示 /
// 显示company … 同一家的话就不需要we pay we collect 了吧？ … 我需要很清晰的看到每个月we pay 和we collect 后的公司是赚还是亏";
// the mockup approved: "照这个做"). We collect and We pay become one table, a row a company with both its sides — what
// we collect from it, what we pay it, the net, the interest profit — its deals under it, each marked Collect or Pay.
//
// Two ways to read a month, one switch for the whole page (the user: "Actual 就好 / 上面的卡可以根据status 去换吗？"):
//   Actual   — what really came in and went out in the month: the deals' repayments dated in it, a contra (netting)
//              left out, being no cash; interest = the interest (and penalty) among them.
//   By right — what the month asks: its instalments (a compounding month that rolls into the balance asks no cash) and,
//              in the office's month, what is still owed from months before; interest = the instalments' interest
//              (a rolling month's too — it is earned) and the earlier ones' unpaid interest, interest first.
// The month's rows are the We collect / We pay lists' (lib/schedule-list), so the two never disagree. The six months
// of the chart read each deal's own plan month by month (what fell due in it) and its repayments (what came in).

import type { CalendarEntry } from './repayment-calendar'
import type { ListRow } from './schedule-list'

const EPS = 0.005
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type Side = 'collect' | 'pay'
export type Basis = 'act' | 'due'

/** A month of a deal: by right (due, its interest) and actual (got, its interest). */
export interface DealMonth {
  due: number
  dueInterest: number
  got: number
  gotInterest: number
}

/** What the page knows of a deal beside the month's rows (lib/repayment-schedule's loader). */
export interface DealFacts {
  id: string
  side: Side
  /** Who it is with: the company's short code (a fund source's lender otherwise). */
  company: string
  /** Its tag as Finance writes it in its terms ("LO#5", "BI#1"); null when none. */
  tag: string | null
  /** "RM 90,000.00 @ 4.000%/mo · 8mo · compound". */
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
}

export interface CoDeal {
  id: string
  side: Side
  tag: string | null
  words: string
  href: string
  /** By right: this month's instalments in cash + what is still owed from earlier months. */
  due: number
  dueInterest: number
  /** Still owed from months before this one. */
  earlier: number
  /** Actual: came in (went out) this month. */
  got: number
  gotInterest: number
  /** Still to settle in cash on the month's rows. */
  open: number
  next: DealFacts['next']
  last: string | null
  owe: number
  /** A repayment PV for it awaits approval (We pay). */
  pending: boolean
}

export interface Company {
  name: string
  deals: CoDeal[]
  /** Both sides: we collect from it and pay it. */
  both: boolean
  /** What they owe us − what we owe them, every deal with it (a sign to contra). */
  position: number
}

/** A company's (or the page's) figures under a basis. */
export interface Figures {
  collect: number
  pay: number
  net: number
  interestIn: number
  interestOut: number
  profit: number
  earlier: number
  gotCollect: number
  gotPay: number
}

export interface HistMonth {
  /** YYYY-MM */
  ym: string
  due: { interestIn: number; interestOut: number; cashIn: number; cashOut: number }
  act: { interestIn: number; interestOut: number; cashIn: number; cashOut: number }
}

const emptyMonth = (): DealMonth => ({ due: 0, dueInterest: 0, got: 0, gotInterest: 0 })

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

/** A deal's repayments by month — cash only (a contra, netting, is none) — and the day of its last. */
export function actualsOf(payments: Array<{ date: string; type: string; amount: number }>): { byMonth: Record<string, { got: number; gotInterest: number }>; last: string | null } {
  const byMonth: Record<string, { got: number; gotInterest: number }> = {}
  let last: string | null = null
  for (const p of payments) {
    if (p.type === 'netting') continue
    const ym = p.date.slice(0, 7)
    const m = (byMonth[ym] ??= { got: 0, gotInterest: 0 })
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
        factById.set(k, { id: r.id, side, company: r.counterparty, tag: null, words: r.detail, href: '', next: null, last: null, owe: 0, months: {} })
    }

  const deals = new Map<string, CoDeal[]>()
  for (const [k, f] of factById) {
    const rows = rowsBy.get(k) ?? []
    const now = rows.filter((r) => r.date >= start)
    const before = rows.filter((r) => r.date < start)
    const act = f.months[month] ?? emptyMonth()
    const earlier = r2(before.reduce((s, r) => s + (r.owed ?? 0), 0))
    const d: CoDeal = {
      id: f.id,
      side: f.side,
      tag: f.tag,
      words: f.words,
      href: f.href,
      due: r2(now.filter((r) => r.status !== 'rolled').reduce((s, r) => s + r.due, 0) + earlier),
      dueInterest: r2(
        now.reduce((s, r) => s + r.interest, 0) +
          before.reduce((s, r) => s + Math.min(r.owed ?? 0, Math.max(0, r.interest - r.received)), 0),
      ),
      earlier,
      got: act.got,
      gotInterest: act.gotInterest,
      open: r2(rows.reduce((s, r) => s + (r.owed ?? 0), 0)),
      next: f.next,
      last: f.last,
      owe: f.owe,
      pending: rows.some((r) => r.pending),
    }
    if (rows.length === 0 && d.due < EPS && d.dueInterest < EPS && d.got < EPS) continue
    deals.set(f.company, [...(deals.get(f.company) ?? []), d])
  }

  const position = new Map<string, number>()
  for (const f of factById.values()) position.set(f.company, r2((position.get(f.company) ?? 0) + (f.side === 'collect' ? f.owe : -f.owe)))

  return [...deals.entries()]
    .map(([name, ds]) => ({
      name,
      deals: ds.sort((a, b) => (a.side === b.side ? (a.tag ?? a.words).localeCompare(b.tag ?? b.words) : a.side === 'collect' ? -1 : 1)),
      both: ds.some((d) => d.side === 'collect') && ds.some((d) => d.side === 'pay'),
      position: position.get(name) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Deals' figures under a basis: Actual reads what came in and went out, By right what the month asks. */
export function figuresOf(deals: CoDeal[], basis: Basis): Figures {
  const sum = (side: Side, k: keyof CoDeal) => r2(deals.filter((d) => d.side === side).reduce((s, d) => s + (d[k] as number), 0))
  const A = basis === 'act'
  const collect = sum('collect', A ? 'got' : 'due')
  const pay = sum('pay', A ? 'got' : 'due')
  const interestIn = sum('collect', A ? 'gotInterest' : 'dueInterest')
  const interestOut = sum('pay', A ? 'gotInterest' : 'dueInterest')
  return {
    collect,
    pay,
    net: r2(collect - pay),
    interestIn,
    interestOut,
    profit: r2(interestIn - interestOut),
    earlier: r2(deals.reduce((s, d) => s + d.earlier, 0)),
    gotCollect: sum('collect', 'got'),
    gotPay: sum('pay', 'got'),
  }
}

/** The cards' extra figures: what is still open on each side, and how much of everything due is settled. */
export function openOf(deals: CoDeal[]): { collect: number; pay: number; settledShare: number | null } {
  const sum = (side: Side, k: 'open' | 'due') => r2(deals.filter((d) => d.side === side).reduce((s, d) => s + d[k], 0))
  const due = sum('collect', 'due') + sum('pay', 'due')
  const open = sum('collect', 'open') + sum('pay', 'open')
  return { collect: sum('collect', 'open'), pay: sum('pay', 'open'), settledShare: due > EPS ? Math.max(0, Math.min(1, (due - open) / due)) : null }
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
