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
 *
 * EVERY PAPER (2026-10-31): a Ref No. may name several papers — HC9882+ZNT4864
 * — and a bill is on each of them (`sales_orders.bill_refs`, mig
 * 20261031013000), so the database answers one row per paper and bill. Papers
 * on exactly the same bills are ONE question here: three documents each naming
 * HC12931+HC12932+HC12933 are asked about once, under all three numbers.
 */

export interface DoubleClaimBill {
  /** The paper this row is about; in a group, the group's first paper. */
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
  /** The paper the group goes by — the first of `billRefs`, and what an answer is saved under. */
  billRef: string
  /** Every paper these bills share, sorted. */
  billRefs: string[]
  bills: DoubleClaimBill[]
  /** The months the paper turns up in, oldest first. */
  months: string[]
  /** A human checked exactly these bills and said they are separate sales. */
  dismissed: boolean
}

export function groupDoubleClaims(rows: readonly DoubleClaimBill[]): DoubleClaimGroup[] {
  // The bills on each paper, each bill once …
  const byRef = new Map<string, Map<string, DoubleClaimBill>>()
  for (const row of rows) {
    const bills = byRef.get(row.billRef) ?? new Map<string, DoubleClaimBill>()
    if (!bills.has(row.orderId)) bills.set(row.orderId, row)
    byRef.set(row.billRef, bills)
  }
  // … and the papers on exactly the same bills, together.
  const bySet = new Map<string, { refs: string[]; bills: DoubleClaimBill[] }>()
  for (const [ref, bills] of byRef) {
    if (bills.size < 2) continue
    const key = [...bills.keys()].sort().join(',')
    const entry = bySet.get(key) ?? { refs: [], bills: [...bills.values()] }
    entry.refs.push(ref)
    bySet.set(key, entry)
  }
  return [...bySet.values()]
    .map(({ refs, bills }) => {
      const billRefs = [...refs].sort()
      const billRef = billRefs[0]
      const sorted = bills
        .map(b => ({ ...b, billRef }))
        .sort((a, b) =>
          a.periodMonth.localeCompare(b.periodMonth) || a.orderDate.localeCompare(b.orderDate) || a.orderNo.localeCompare(b.orderNo))
      return {
        billRef,
        billRefs,
        bills: sorted,
        months: [...new Set(sorted.map(b => b.periodMonth))],
        dismissed: sorted.every(b => b.dismissed),
      }
    })
    .sort((a, b) => a.months[0].localeCompare(b.months[0]) || a.billRef.localeCompare(b.billRef))
}

/** "HC11366", or "HC12931 · HC12932 · HC12933" — the papers a group is on, as the page writes them. */
export function groupPapers(group: Pick<DoubleClaimGroup, 'billRefs'>): string {
  return group.billRefs.join(' · ')
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
