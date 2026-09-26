import { formatDate } from '@/lib/utils'

/**
 * A bill that does not count — taken out of its month by hand (2026-09-27).
 *
 * The rule is the database's (`sales_order_exclusions`, mig 20260927020000):
 * an excluded bill is `cancelled` with `excluded_reason = 'manual'`, exactly as
 * out as a bill the ERP cancelled — out of the month's sales, own and group
 * sales, override, KPI and Open Bill — and it stays out through every ERP
 * re-send until somebody counts it again. This file is the words the Sales
 * orders page uses for it, and what a bill's right-click menu may offer.
 */

/** What decides why a bill is out. */
export interface BillStanding {
  cancelled: boolean
  /** `ignored_agent` / `manual`; null when the ERP is the reason, or nothing is. */
  excludedReason: string | null
  erpStatus: string | null
  erpOnHold: boolean
}

/** Somebody's exclusion of one bill (a `sales_order_exclusions` row). */
export interface HandExclusion {
  note: string | null
  byName: string | null
  /** ISO timestamp. */
  at: string
}

/** The status a bill taken out by hand shows. */
export const NOT_COUNTED = 'Not counted'

/** The ERP's own commission rule, as `ingest_erp_sales_order` applies it: these earn nothing. */
const ERP_KEEPS_OUT = new Set(['CANCELLED', 'DRAFT', 'ON_HOLD', 'DELETED'])

function erpWords(status: string): string {
  return status === 'DELETED' ? 'Deleted in the ERP' : `${status.replace(/_/g, ' ').toLowerCase()} in the ERP`
}

/** Why a bill earns nothing, in words. Null when it earns. */
export function exclusionReason(o: BillStanding): string | null {
  if (!o.cancelled) return null
  // Asked before the ERP's own status: the one exclusion about a whole PERSON.
  // The document is live over there; the salesperson on it is not ours to pay.
  if (o.excludedReason === 'ignored_agent') return 'Not our salesperson'
  // Somebody took this one bill out, and it stays out whatever the ERP says.
  if (o.excludedReason === 'manual') return NOT_COUNTED
  if (o.erpOnHold) return 'On hold in the ERP'
  if (o.erpStatus) return erpWords(o.erpStatus)
  return 'Excluded'
}

/**
 * What would still keep a bill out once the hand lets go of it — the not-ours
 * list, or the ERP's own verdict. Null when counting it again brings it in.
 */
export function outWithoutTheHand(o: BillStanding): string | null {
  if (o.excludedReason === 'ignored_agent') return 'Not our salesperson'
  if (o.erpOnHold) return 'On hold in the ERP'
  if (o.erpStatus && ERP_KEEPS_OUT.has(o.erpStatus)) return erpWords(o.erpStatus)
  return null
}

/** "Taken out by Principal on 27 Sep 2026 — duplicate of HC-SO-013251" */
export function describeExclusion(ex: HandExclusion): string {
  // The day it happened in Malaysia, whatever clock the server keeps.
  const myt = new Date(Date.parse(ex.at) + 8 * 3_600_000).toISOString().slice(0, 10)
  const who = ex.byName ? `by ${ex.byName} ` : ''
  return `Taken out ${who}on ${formatDate(myt)}${ex.note ? ` — ${ex.note}` : ''}`
}

/** What a bill's right-click menu may do about whether it counts. */
export type BillCountAction =
  /** A live bill: it can be taken out. */
  | { kind: 'exclude' }
  /** Out by hand: it can be counted again. `stillOut` when something else keeps it out anyway. */
  | { kind: 'include'; stillOut: string | null }
  /** The month's run has paid: neither way until it is reopened. */
  | { kind: 'locked'; excludedByHand: boolean; reason: string }
  /** Out for a reason this menu cannot undo — the ERP's, or a salesperson who is not ours. */
  | { kind: 'unavailable'; reason: string }

export function billCountAction(
  o: BillStanding & { excludedByHand: boolean },
  { runLocked, monthLabel }: { runLocked: boolean; monthLabel: string },
): BillCountAction {
  if (runLocked) {
    return {
      kind: 'locked',
      excludedByHand: o.excludedByHand,
      reason: `The run for ${monthLabel} has paid — reopen it before changing which bills count`,
    }
  }
  if (o.excludedByHand) return { kind: 'include', stillOut: outWithoutTheHand(o) }
  if (o.cancelled) return { kind: 'unavailable', reason: exclusionReason(o) ?? 'Excluded' }
  return { kind: 'exclude' }
}
