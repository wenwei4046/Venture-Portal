/**
 * What a month's Open Bill picks add up to.
 *
 * The pick is made one bill at a time on the Sales orders page — which of a
 * salesperson's bills was the 1st, 2nd and 3rd of an event day. This is the
 * other end of that fact: how many picks the month carries, whose they are,
 * and what the uplift cost. "How much incentive did I give away" is a
 * question about the month, not about a bill, and no page answered it.
 *
 * TWO POPULATIONS MEET HERE, AND THEY ARE NOT THE SAME.
 *
 *   the picks   every live bill of this month carrying a rank, whether or not
 *               a run has ever looked at them. Always available — August has
 *               211 picks and has never been computed.
 *   what paid   the `open_bill` lines of THIS month's run. A run also pays
 *               Open Bill on bills carried in from earlier months: a bill
 *               under the deposit gate pays in the month its deposit clears,
 *               and it brings its pick with it.
 *
 * So the money is not a function of this month's picks, and folding the two
 * together would quietly credit August's bills to September. Each bill
 * carries what the run paid ON IT; whatever the run paid on bills this month
 * never wrote is reported on its own line.
 */

export const OPEN_BILL_RANKS = [1, 2, 3] as const
export type OpenBillRank = (typeof OPEN_BILL_RANKS)[number]

export const OPEN_BILL_ORDINAL: Record<OpenBillRank, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
}

export function isOpenBillRank(v: number | null | undefined): v is OpenBillRank {
  return v === 1 || v === 2 || v === 3
}

/** A live order of the month, as `revenue_month_orders` returns it. */
export interface OpenBillOrderInput {
  orderId: string
  orderNo: string
  orderDate: string
  eventDate: string
  customerName: string | null
  venue: string | null
  venueGroupName: string | null
  staffId: string | null
  employeeName: string | null
  agentName: string
  orderTotal: number
  /** What a rate is paid on — zero means there is nothing for an uplift to lift. */
  commissionable: number
  depositMet: boolean
  openBillRank: number | null
  openBillAuto: boolean | null
}

export interface OpenBillBill {
  orderId: string
  orderNo: string
  orderDate: string
  eventDate: string
  customerName: string | null
  /** The place, when the register has folded the spelling into one. */
  venue: string | null
  /** Who the bill pays — the key the person rows are grouped under. */
  personKey: string
  staffId: string | null
  name: string
  /** False when the ERP's agent is nobody in the portal, so the bill pays nobody. */
  matched: boolean
  rank: OpenBillRank
  /** Still the importer's guess — nobody has agreed with it. */
  suggested: boolean
  salesValue: number
  /** Zero when no line of the bill earns a rate, so no uplift can ride on it. */
  commissionable: number
  /** What this month's run paid on it. Null when no run has paid it. */
  paid: number | null
  /** Under the deposit gate: it pays in the month the deposit clears. */
  held: boolean
  /**
   * The run paid nothing on it and none of the ordinary reasons apply — it is
   * simply not in the run, which is what a bill that arrived after the run was
   * computed looks like.
   */
  missingFromRun: boolean
}

export interface OpenBillRankRow {
  rank: OpenBillRank
  /** The uplift the scheme pays for this rank, as a fraction. Null when unset. */
  pct: number | null
  bills: number
  salesValue: number
  paid: number
  suggested: number
}

export interface OpenBillPersonRow {
  key: string
  staffId: string | null
  name: string
  matched: boolean
  /** How many 1st / 2nd / 3rd bills. */
  byRank: Record<OpenBillRank, number>
  bills: number
  salesValue: number
  paid: number
  /** Bills of theirs the deposit gate is still holding. */
  held: number
}

export interface OpenBillSummary {
  /** Every picked bill of the month, in the order the days wrote them. */
  bills: OpenBillBill[]
  byRank: OpenBillRankRow[]
  /** Biggest payer first; before a run, the most picks first. */
  byPerson: OpenBillPersonRow[]
  totals: {
    bills: number
    salesValue: number
    paid: number
    suggested: number
    held: number
    /** Picks a run ought to have paid and did not — see `missingFromRun`. */
    missingFromRun: number
  }
  /**
   * What this month's run paid on bills this month did not write — carried in
   * from an earlier month with their picks when their deposits cleared.
   */
  carriedIn: { bills: number; paid: number }
  /** Every ringgit of Open Bill this month's run paid, wherever the bill is from. */
  paidInAll: number
}

export interface OpenBillSummaryInput {
  /** Ringgit of Open Bill this month's run paid, by order. Empty before a run. */
  paidByOrder?: ReadonlyMap<string, number>
  /** `comm_open_bill_rules`: the uplift each rank earns, as a fraction. */
  rates?: ReadonlyMap<number, number>
}

export function summariseOpenBill(
  orders: readonly OpenBillOrderInput[],
  { paidByOrder, rates }: OpenBillSummaryInput = {},
): OpenBillSummary {
  const paid = paidByOrder ?? new Map<string, number>()

  const bills: OpenBillBill[] = []
  for (const o of orders) {
    if (!isOpenBillRank(o.openBillRank)) continue
    const matched = Boolean(o.staffId)
    const paidHere = paid.has(o.orderId) ? paid.get(o.orderId)! : null
    bills.push({
      orderId: o.orderId,
      orderNo: o.orderNo,
      orderDate: o.orderDate,
      eventDate: o.eventDate,
      customerName: o.customerName,
      venue: o.venueGroupName ?? o.venue,
      personKey: o.staffId ?? `agent:${o.agentName}`,
      staffId: o.staffId,
      name: matched ? (o.employeeName ?? o.agentName) : `${o.agentName} (unmatched)`,
      matched,
      rank: o.openBillRank,
      suggested: o.openBillAuto === true,
      salesValue: o.orderTotal,
      commissionable: o.commissionable,
      paid: paidHere,
      held: !o.depositMet,
      missingFromRun: paidHere === null && matched && o.depositMet && o.commissionable > 0,
    })
  }
  bills.sort(
    (a, b) =>
      a.eventDate.localeCompare(b.eventDate) ||
      a.orderDate.localeCompare(b.orderDate) ||
      a.orderNo.localeCompare(b.orderNo),
  )

  const byRank: OpenBillRankRow[] = OPEN_BILL_RANKS.map(rank => {
    const mine = bills.filter(b => b.rank === rank)
    return {
      rank,
      pct: rates?.get(rank) ?? null,
      bills: mine.length,
      salesValue: round2(mine.reduce((a, b) => a + b.salesValue, 0)),
      paid: round2(mine.reduce((a, b) => a + (b.paid ?? 0), 0)),
      suggested: mine.filter(b => b.suggested).length,
    }
  })

  const people = new Map<string, OpenBillPersonRow>()
  for (const b of bills) {
    const row =
      people.get(b.personKey) ??
      {
        key: b.personKey,
        staffId: b.staffId,
        name: b.name,
        matched: b.matched,
        byRank: { 1: 0, 2: 0, 3: 0 } as Record<OpenBillRank, number>,
        bills: 0,
        salesValue: 0,
        paid: 0,
        held: 0,
      }
    row.byRank[b.rank] += 1
    row.bills += 1
    row.salesValue = round2(row.salesValue + b.salesValue)
    row.paid = round2(row.paid + (b.paid ?? 0))
    if (b.held) row.held += 1
    people.set(b.personKey, row)
  }
  const byPerson = [...people.values()].sort(
    (a, b) =>
      b.paid - a.paid ||
      b.bills - a.bills ||
      b.salesValue - a.salesValue ||
      a.name.localeCompare(b.name),
  )

  // Everything the run paid that no picked bill of this month accounts for.
  const mine = new Set(bills.map(b => b.orderId))
  let carriedBills = 0
  let carriedPaid = 0
  for (const [orderId, amount] of paid) {
    if (mine.has(orderId)) continue
    carriedBills += 1
    carriedPaid = round2(carriedPaid + amount)
  }

  const paidHere = round2(byRank.reduce((a, r) => a + r.paid, 0))

  return {
    bills,
    byRank,
    byPerson,
    totals: {
      bills: bills.length,
      salesValue: round2(byRank.reduce((a, r) => a + r.salesValue, 0)),
      paid: paidHere,
      suggested: bills.filter(b => b.suggested).length,
      held: bills.filter(b => b.held).length,
      missingFromRun: bills.filter(b => b.missingFromRun).length,
    },
    carriedIn: { bills: carriedBills, paid: carriedPaid },
    paidInAll: round2(paidHere + carriedPaid),
  }
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}
