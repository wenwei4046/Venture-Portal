// The Repayment Schedule's We collect / We pay as a list of the month (2026-11-04 — the user: "我想要看到的是我每个月要收和
// 要给的，要有status，要有日期，要可以print out", the mockup approved: "Yes, build it"). One row an instalment, on its day,
// read off the same entries as the Calendar (lib/repayment-calendar, each deal's repayment plan), so the two can never
// disagree. A compounding deal's month is a row too, in the same table (the user: 放在同一个表): its interest rolls into
// the balance, so it is no cash to collect — "Rolls in" / "Rolled in", nothing owed, left out of the cash totals. A deal
// with no instalment this month on its plan (a compounding or no-fixed-term deal's future month) stands on the month's
// last day with the interest the page worked out for it.

import type { CalendarEntry } from './repayment-calendar'

export type ListStatus = 'paid' | 'partial' | 'overdue' | 'due' | 'rolled'

export interface ListDeal {
  counterparty: string
  detail: string
  source?: string | null
  /** A repayment PV for it awaits approval (We pay). */
  pending?: boolean
}

/** A compounding or no-fixed-term deal the page lists for the month, for when its plan has no row in it. */
export interface ListExtra {
  id: string
  /** Its interest this month. */
  interest: number
  /** What came in (or went out) on it this month. */
  received: number
}

export interface ListRow {
  key: string
  id: string
  /** YYYY-MM-DD */
  date: string
  counterparty: string
  detail: string
  source: string | null
  /** Its number in the plan and how many the plan has; null for a month of a deal with no fixed term. */
  no: number | null
  months: number | null
  principal: number
  interest: number
  due: number
  received: number
  /** What is still to come in cash; null on a row that rolls into the balance. */
  owed: number | null
  status: ListStatus
  /** The day it was paid in full, when it was. */
  paidOn: string | null
  pending: boolean
}

const EPS = 0.005
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

const lastDay = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

function cashStatus(due: number, received: number, date: string, today: string): ListStatus {
  if (received >= due - EPS) return 'paid'
  if (received > EPS) return 'partial'
  return date < today ? 'overdue' : 'due'
}

export function scheduleList(input: {
  entries: CalendarEntry[]
  /** Every deal of this side the page lists, by id. */
  deals: Map<string, ListDeal>
  /** The deals whose unpaid interest rolls into the balance. */
  compounding: Set<string>
  /** Compounding and no-fixed-term deals, for a month their plan has no row in. */
  extras: ListExtra[]
  /** YYYY-MM */
  month: string
  /** YYYY-MM-DD, the office's */
  today: string
}): ListRow[] {
  const { entries, deals, compounding, extras, month, today } = input
  const rows: ListRow[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    const id = e.id ?? e.href
    seen.add(id)
    const deal = deals.get(id)
    const rolls = e.rolled > EPS || (compounding.has(id) && e.outstanding > EPS)
    const status: ListStatus = rolls ? 'rolled' : e.status
    rows.push({
      key: `${id}:${e.no}`,
      id,
      date: e.date,
      counterparty: deal?.counterparty ?? e.name,
      detail: deal?.detail ?? '',
      source: deal?.source ?? null,
      no: e.months == null ? null : e.no,
      months: e.months,
      principal: r2(e.instPrincipal),
      interest: r2(e.instInterest),
      due: r2(e.amount),
      received: r2(e.paid),
      owed: rolls ? null : r2(e.outstanding),
      status,
      paidOn: status === 'paid' ? e.paidOn : null,
      pending: !!deal?.pending,
    })
  }
  for (const x of extras) {
    if (seen.has(x.id) || x.interest <= EPS) continue
    seen.add(x.id)
    const deal = deals.get(x.id)
    const date = lastDay(month)
    const received = r2(x.received)
    const rolls = compounding.has(x.id) && received < x.interest - EPS
    const status = rolls ? 'rolled' : cashStatus(x.interest, received, date, today)
    rows.push({
      key: `${x.id}:${month}`,
      id: x.id,
      date,
      counterparty: deal?.counterparty ?? '—',
      detail: deal?.detail ?? '',
      source: deal?.source ?? null,
      no: null,
      months: null,
      principal: 0,
      interest: r2(x.interest),
      due: r2(x.interest),
      received,
      owed: rolls ? null : r2(Math.max(0, x.interest - received)),
      status,
      paidOn: null,
      pending: !!deal?.pending,
    })
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.counterparty.localeCompare(b.counterparty))
}

/** The cards and the foot: cash due and owed leave a rolling row out; what came in counts every row. A part-paid
 *  row counts as overdue once its day has passed. */
export function listTotals(rows: ListRow[], today: string) {
  const cash = rows.filter((r) => r.status !== 'rolled')
  const overdue = rows.filter((r) => r.status === 'overdue' || (r.status === 'partial' && (r.owed ?? 0) > EPS && r.date < today))
  return {
    due: r2(cash.reduce((s, r) => s + r.due, 0)),
    received: r2(rows.reduce((s, r) => s + r.received, 0)),
    owed: r2(cash.reduce((s, r) => s + (r.owed ?? 0), 0)),
    rolled: r2(rows.filter((r) => r.status === 'rolled').reduce((s, r) => s + r.due - r.received, 0)),
    overdue: r2(overdue.reduce((s, r) => s + (r.owed ?? 0), 0)),
    overdueCount: overdue.length,
  }
}

export const STATUS_ORDER: ListStatus[] = ['overdue', 'due', 'partial', 'paid', 'rolled']

/** What a row's status says: "Overdue · 3d", "Due in 8d", "Due today", "Part paid", "Paid", "Rolls in" / "Rolled in". */
export function statusWords(r: Pick<ListRow, 'status' | 'date'>, today: string): string {
  const days = Math.round((Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  switch (r.status) {
    case 'paid':
      return 'Paid'
    case 'partial':
      return days < 0 ? `Part paid · ${-days}d late` : 'Part paid'
    case 'overdue':
      return `Overdue · ${-days}d`
    case 'due':
      return days === 0 ? 'Due today' : `Due in ${days}d`
    case 'rolled':
      // The interest rolls in at the month's end: a month gone by rolled, this month's and later ones roll.
      return r.date.slice(0, 7) < today.slice(0, 7) ? 'Rolled in' : 'Rolls in'
  }
}

/** The filter's words for each status. */
export const STATUS_LABEL: Record<ListStatus, string> = {
  overdue: 'Overdue',
  due: 'Due',
  partial: 'Part paid',
  paid: 'Paid',
  rolled: 'Rolled in',
}
