/**
 * What Comm Cal's month page says about payroll (2026-09-27).
 *
 * The page works a month's commission out LIVE — the engine runs over the
 * ERP's bills every time it opens. Payroll holds only what was SENT, and it
 * had read as if the two were the same thing (user 2026-09-27: 本来它就一直都在
 * sync 的，不是吗？). September, the portal's first paying month, had never been
 * sent at all. So the page now says, in one place, which of these it is:
 *
 *   settled  — a month before the portal pays: settled by hand, nothing to send
 *   closed   — the month's payroll has left draft: nothing here can change it
 *   not_sent — nothing in payroll yet, and what has to be settled first
 *   sent     — in payroll, and whether the live figure still matches it
 *
 * It only SAYS. The sending is per salesperson (user 2026-09-27: Send =
 * Complete — tick five and send them, or send everybody not yet sent).
 *
 * Pure, so the rule is tested where it is written.
 */

export type RunStatus = 'draft' | 'computed' | 'applied' | 'locked'

/**
 * The one thing the server adds to the engine's list: bills whose seller is
 * nobody on the roster never reach the engine, so its result would look clean
 * while quietly leaving real sales out.
 */
export function unmatchedWarnings(orderNos: readonly string[]): string[] {
  return orderNos.length > 0
    ? [`${orderNos.length} order(s) carry an agent who is not a salesperson in the portal and were excluded. Match them in the import wizard.`]
    : []
}

const PERSON_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/**
 * The engine names people by id ("Staff e2a52899-… has sales this period but
 * no rank") — HR knows them by name. An id nobody can name stays as it is.
 */
export function nameWarnings(
  warnings: readonly string[],
  nameOf: (staffId: string) => string | undefined,
): string[] {
  return warnings.map(w => w.replace(PERSON_ID, id => nameOf(id) ?? nameOf(id.toLowerCase()) ?? id))
}

export interface PayrollFacts {
  /** The month's saved run, when there is one. */
  status: RunStatus | null
  /** What the run in payroll paid — read only while it IS in payroll. */
  sent: { total: number; byStaff: ReadonlyMap<string, number> } | null
  sentAt: string | null
  /** "September 2026" when this month was settled by hand, before the portal pays. */
  settledBefore: string | null
  /**
   * Why the month's payroll can take no more commission, in the words the
   * guard refuses with (`commission_payroll_closed`) — or null while it can.
   */
  payrollClosed: string | null
}

/** The month as the page works it out now. */
export interface LiveFigure {
  total: number
  byStaff: ReadonlyMap<string, number>
  /** Everything that stops a send, already in HR's words. */
  blockers: string[]
}

export type PayrollState =
  | { kind: 'settled'; settledBefore: string }
  | { kind: 'closed'; closedAs: string; sentTotal: number | null }
  | { kind: 'not_sent'; total: number; blockers: string[] }
  | {
      kind: 'sent'
      sentTotal: number
      sentAt: string | null
      total: number
      /** The live figure still matches payroll, person by person. */
      current: boolean
      /** How many people's commission differs from what payroll holds. */
      changedPeople: number
      blockers: string[]
    }

const CENT = 0.005

/** People whose live commission differs from what payroll holds for them. */
export function changedPeople(
  sent: ReadonlyMap<string, number>,
  live: ReadonlyMap<string, number>,
): number {
  const everyone = new Set([...sent.keys(), ...live.keys()])
  let changed = 0
  for (const staffId of everyone) {
    if (Math.abs((sent.get(staffId) ?? 0) - (live.get(staffId) ?? 0)) >= CENT) changed++
  }
  return changed
}

export function payrollState(facts: PayrollFacts, live: LiveFigure): PayrollState {
  const inPayroll = facts.status === 'applied' || facts.status === 'locked'

  if (facts.settledBefore && !inPayroll) return { kind: 'settled', settledBefore: facts.settledBefore }

  const closedAs = facts.status === 'locked' ? 'locked' : facts.payrollClosed
  if (closedAs) return { kind: 'closed', closedAs, sentTotal: inPayroll ? facts.sent?.total ?? 0 : null }

  if (!inPayroll) return { kind: 'not_sent', total: live.total, blockers: live.blockers }

  const sentTotal = facts.sent?.total ?? 0
  const changed = changedPeople(facts.sent?.byStaff ?? new Map(), live.byStaff)
  return {
    kind: 'sent',
    sentTotal,
    sentAt: facts.sentAt,
    total: live.total,
    current: changed === 0 && Math.abs(sentTotal - live.total) < CENT,
    changedPeople: changed,
    blockers: live.blockers,
  }
}
