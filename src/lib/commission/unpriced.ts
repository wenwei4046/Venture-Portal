import { classifyLine, indexItemGroups, round2 } from './engine'
import type { EngineInput } from './types'

/**
 * A bill the customer has paid on while its goods are priced RM 0 in the ERP
 * (2026-09-27, Stanley's HC-SO-2609-114: four lines keyed at RM 0, a RM 2,839
 * card payment recorded, confirmed anyway). The engine can only pay on what a
 * bill is priced at, so such a bill earns NOTHING until the prices are filled
 * in the ERP — and closing its salesperson would lock that nothing in.
 *
 * Goods are the lines in groups the scheme pays on, never transport or
 * service, so a disposal-only order is not one of these. A free replacement is priced RM 0 AND paid nothing, so it is not one
 * either. A package priced on one line with free items beside it has goods
 * worth more than RM 0, so it is not one either.
 *
 * The user chose a reminder over a block in the ERP (2026-09-27): the ERP
 * still lets such a bill through; the month page names it, the salesperson's
 * row and ledger carry it, and Close asks before locking somebody who has one.
 */
export interface UnpricedBill {
  orderId: string
  orderNo: string
  /** Whose bill it is — the owner when it is shared. */
  staffId: string
  orderDate: string
  periodMonth: string
  /** What the customer has paid so far, RM. */
  paidAmount: number
}

export function unpricedBills(input: Pick<EngineInput, 'orders' | 'scheme'>): UnpricedBill[] {
  const groupIndex = indexItemGroups(input.scheme.itemGroups)
  // A shared bill reaches the engine once per holder — the owner's part first
  // — each part carrying its share of what was paid: one entry per bill, in
  // the owner's name, with the parts' payments added back together.
  const byId = new Map<string, UnpricedBill & { goods: number; priced: number }>()
  for (const order of input.orders) {
    // An upsale or a drop is not a bill.
    if (order.upsale) continue
    const goods = order.lines.filter(line => classifyLine(line, groupIndex) === 'commissionable')
    const priced = goods.reduce((sum, line) => sum + line.lineAmount, 0)
    const seen = byId.get(order.id)
    if (seen) {
      seen.goods += goods.length
      seen.priced += priced
      seen.paidAmount = round2(seen.paidAmount + order.paidAmount)
      continue
    }
    byId.set(order.id, {
      orderId: order.id,
      orderNo: order.orderNo,
      staffId: order.staffId,
      orderDate: order.orderDate,
      periodMonth: order.periodMonth,
      paidAmount: round2(order.paidAmount),
      goods: goods.length,
      priced,
    })
  }
  return [...byId.values()]
    .filter(bill => bill.goods > 0 && round2(bill.priced) === 0 && bill.paidAmount > 0)
    .map(bill => ({
      orderId: bill.orderId, orderNo: bill.orderNo, staffId: bill.staffId,
      orderDate: bill.orderDate, periodMonth: bill.periodMonth, paidAmount: bill.paidAmount,
    }))
    .sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.orderNo.localeCompare(b.orderNo))
}

/** The same bills, by whose they are. */
export function unpricedByStaff(bills: readonly UnpricedBill[]): Map<string, UnpricedBill[]> {
  const byStaff = new Map<string, UnpricedBill[]>()
  for (const bill of bills) {
    const list = byStaff.get(bill.staffId)
    if (list) list.push(bill)
    else byStaff.set(bill.staffId, [bill])
  }
  return byStaff
}
