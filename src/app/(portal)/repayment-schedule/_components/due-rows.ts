// "Due to collect" / "Due to pay" (2026-10-10, the user's Claude Design
// handoff): the month's four kinds of deal in ONE table — the scheduled
// instalments (principal + interest), the minimum interest, the rolled
// (compounding) interest and the open-ended deals — each with what came in
// (or went out) on it this month and what is still short. Nothing here
// computes what is due — the dues are the page's own, as its four tables
// below show them; Short is a row's due less what came in, and a minimum
// interest row's shortfall as the page worked it out.

import type { CompoundRow, MinInterestRow, NoTermRow, SchedRow } from './ScheduleView'

export type DueType = 'scheduled' | 'min' | 'rolled' | 'open'

/** What the Type column says — the table's chip and the Export's cell. */
export const DUE_TYPE_LABEL: Record<DueType, string> = {
  scheduled: 'principal + interest',
  min: 'min interest',
  rolled: 'rolled interest',
  open: 'open-ended',
}

export interface DueRow {
  key: string
  /** The loan (we collect) or the fund source (we pay). */
  id: string
  counterparty: string
  /** "RM x @ y%/mo · 12mo · 5 left" */
  detail: string
  type: DueType
  /** Its place in the handoff's order: scheduled, min, rolled, open-ended. */
  order: number
  principal: number
  interest: number
  total: number
  /** What came in (or went out) on it this month; null when nothing did. */
  received: number | null
  /** What of the month's due is still to come; null when nothing is due in
   *  cash this month (rolled interest, open-ended). */
  short: number | null
  /** A repayment PV for it awaits approval. */
  pending?: boolean
  source?: string | null
}

const r2 = (n: number) => Math.round(n * 100) / 100
const got = (n: number | undefined) => (n && Math.abs(n) >= 0.005 ? r2(n) : null)

export function dueRows(parts: { rows: SchedRow[]; min: MinInterestRow[]; compound: CompoundRow[]; noTerm: NoTermRow[] }): DueRow[] {
  const out: DueRow[] = []
  const push = (r: Omit<DueRow, 'order'>) => out.push({ ...r, order: out.length })
  for (const r of parts.rows) {
    const received = got(r.received)
    push({
      key: `scheduled:${r.key}`,
      id: r.key,
      counterparty: r.counterparty,
      detail: r.detail,
      type: 'scheduled',
      principal: r.principalDue,
      interest: r.interestDue,
      total: r.totalDue,
      received,
      short: Math.max(0, r2(r.totalDue - (received ?? 0))),
      pending: r.pending,
      source: r.source,
    })
  }
  // A minimum-interest deal with its instalment this month IS that instalment
  // (the interest is in it): listed once, so the Total counts it once
  // (2026-10-10). Its minimum-interest check stays in the Full plans fold.
  const scheduled = new Set(parts.rows.map((r) => r.key))
  for (const r of parts.min) {
    if (scheduled.has(r.key)) continue
    push({
      key: `min:${r.key}`,
      id: r.key,
      counterparty: r.counterparty,
      detail: r.detail,
      type: 'min',
      principal: 0,
      interest: r.due,
      total: r.due,
      received: got(r.paid),
      short: r.met ? 0 : r.shortfall,
    })
  }
  for (const r of parts.compound) {
    push({
      key: `rolled:${r.key}`,
      id: r.key,
      counterparty: r.counterparty,
      detail: r.detail,
      type: 'rolled',
      principal: 0,
      interest: r.thisMonthInterest,
      total: r.thisMonthInterest,
      received: got(r.received),
      short: null,
      source: r.source,
    })
  }
  for (const r of parts.noTerm) {
    push({
      key: `open:${r.key}`,
      id: r.key,
      counterparty: r.counterparty,
      detail: r.detail,
      type: 'open',
      principal: 0,
      interest: r.monthlyInterest,
      total: r.monthlyInterest,
      received: got(r.received),
      short: null,
      source: r.source,
    })
  }
  return out
}

export function dueTotals(rows: DueRow[]) {
  const sum = (f: (r: DueRow) => number) => r2(rows.reduce((s, r) => s + f(r), 0))
  return {
    principal: sum((r) => r.principal),
    interest: sum((r) => r.interest),
    total: sum((r) => r.total),
    received: sum((r) => r.received ?? 0),
    short: sum((r) => r.short ?? 0),
  }
}
