/**
 * A bill's brand, by hand (2026-09-27): Sales orders › right-click › Brand for
 * the margin.
 *
 * The margin ladder is the bill's brand. A bill that nothing names a brand for
 * — no Branding, no pick in the ERP, no branded fair, no branded line — can be
 * given one here (user: 没有任何 brand 存在的单，可以在这边 allocate), and a
 * brand picked here can be changed or taken off. A bill with a brand of its
 * own never offers the row. The rule is the database's
 * (`revenue_set_order_brand`: 23BRD / 23RUN); this only decides what the menu
 * shows, and says what happened.
 */

/** A brand the portal has a margin ladder for (`comm_brands`). */
export interface BrandOption {
  code: string
  name: string
}

export type BillBrandAction =
  /** No brand of its own (`picked` null), or one picked here. */
  | { kind: 'pick'; picked: string | null }
  /** Would be offered, but the month or the salesperson is closed. */
  | { kind: 'locked'; picked: string | null; reason: string }

export function billBrandAction(
  bill: { brandCode: string | null; picked: string | null; cancelled: boolean },
  ctx: { runLocked: boolean; closedReason: string | null; monthLabel: string; hasOptions: boolean },
): BillBrandAction | null {
  if (!ctx.hasOptions || bill.cancelled) return null
  if (bill.picked === null && bill.brandCode !== null) return null
  if (ctx.runLocked) {
    return { kind: 'locked', picked: bill.picked, reason: `The run for ${ctx.monthLabel} has paid — reopen it before changing a bill’s brand` }
  }
  if (ctx.closedReason) return { kind: 'locked', picked: bill.picked, reason: ctx.closedReason }
  return { kind: 'pick', picked: bill.picked }
}

/** What the right-click did, in words. */
export function brandOutcomeMessage(
  outcome: { orderNo: string; brandCode: string | null; picked: string | null },
  nameOf: (code: string) => string,
): string {
  if (outcome.picked) return `${outcome.orderNo} now follows ${nameOf(outcome.picked)}’s margin ladder.`
  if (outcome.brandCode) return `${outcome.orderNo}’s pick is off — it follows ${nameOf(outcome.brandCode)}, from its own bill.`
  return `${outcome.orderNo} has no brand again.`
}
