/**
 * Possible double claims (2026-09-26).
 *
 * Two ways a bill gets paid twice, and the month page says both out loud:
 *
 *  1. ONE PAPER, TWO BILLS. A month worked out by hand carries the bill under
 *     its paper number (HC11366); the ERP keeps sending documents, and when one
 *     of them carries the same paper into another month — re-keyed, re-dated,
 *     a customer's second document under the first one's number — the run
 *     would pay it again. `revenue_possible_double_claims` finds every paper
 *     number on more than one payable (or paid) bill; these helpers shape it.
 *
 *  2. CARRIED FROM A MONTH NO RUN PAID. The run pays every earlier bill that no
 *     applied run has released. A month that was paid by hand has released
 *     nothing, so all of its bills ride into the next run — CH's June and July
 *     bills in August's figures, 2026-09-26. The page cannot know a month was
 *     paid by hand; it can say which months no run of the portal ever paid.
 */

export interface DoubleClaimBill {
  billRef: string
  orderId: string
  orderNo: string
  periodMonth: string
  orderDate: string
  staffId: string | null
  employeeName: string | null
  agentName: string
  orderTotal: number
  /** 'erp_sync' = a document the ERP sent; 'file' = imported or worked out by hand. */
  source: string
  /** An applied run already paid this bill. */
  paidByRun: boolean
  dismissed: boolean
}

export interface DoubleClaimGroup {
  billRef: string
  bills: DoubleClaimBill[]
  /** The months the paper turns up in, oldest first. */
  months: string[]
  /** A human checked exactly these bills and said they are separate sales. */
  dismissed: boolean
}

export function groupDoubleClaims(rows: readonly DoubleClaimBill[]): DoubleClaimGroup[] {
  const byRef = new Map<string, DoubleClaimBill[]>()
  for (const row of rows) byRef.set(row.billRef, [...(byRef.get(row.billRef) ?? []), row])
  return [...byRef.entries()]
    .filter(([, bills]) => bills.length > 1)
    .map(([billRef, bills]) => {
      const sorted = [...bills].sort((a, b) =>
        a.periodMonth.localeCompare(b.periodMonth) || a.orderDate.localeCompare(b.orderDate) || a.orderNo.localeCompare(b.orderNo))
      return {
        billRef,
        bills: sorted,
        months: [...new Set(sorted.map(b => b.periodMonth))],
        dismissed: sorted.every(b => b.dismissed),
      }
    })
    .sort((a, b) => a.months[0].localeCompare(b.months[0]) || a.billRef.localeCompare(b.billRef))
}

/** The groups a month's page must ask about: any of their bills is in it. */
export function claimsInMonth(groups: readonly DoubleClaimGroup[], period: string): DoubleClaimGroup[] {
  return groups.filter(g => g.bills.some(b => b.periodMonth === period))
}

/** Unanswered groups per month, for the list of months. A group in two months counts in both. */
export function openClaimsByMonth(groups: readonly DoubleClaimGroup[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const group of groups) {
    if (group.dismissed) continue
    for (const month of group.months) out.set(month, (out.get(month) ?? 0) + 1)
  }
  return out
}

export interface CarriedMonth {
  periodMonth: string
  bills: number
  value: number
}

/**
 * The bills in this month's calculation that belong to an earlier month no
 * applied run has paid, month by month. Shared parts carry the bill's own id,
 * so a bill is counted once and its parts add back to its value.
 */
export function carriedFromUnpaidMonths(
  orders: readonly { id: string; periodMonth: string; orderTotal: number; upsale?: boolean }[],
  period: string,
  paidMonths: ReadonlySet<string>,
): CarriedMonth[] {
  const byMonth = new Map<string, { ids: Set<string>; value: number }>()
  for (const order of orders) {
    if (order.upsale || order.periodMonth >= period || paidMonths.has(order.periodMonth)) continue
    const entry = byMonth.get(order.periodMonth) ?? { ids: new Set<string>(), value: 0 }
    entry.ids.add(order.id)
    entry.value += order.orderTotal
    byMonth.set(order.periodMonth, entry)
  }
  return [...byMonth.entries()]
    .map(([periodMonth, { ids, value }]) => ({ periodMonth, bills: ids.size, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth))
}
