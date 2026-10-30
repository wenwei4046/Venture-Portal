/**
 * A bill with no sales of its own whose cost is known (2026-10-30 — the user: "show, no sales. but consider margin
 * negative as well. make sure in the calculation of monthly"): a gift on a bill of its own at RM 0. It has no margin
 * to read — nothing to divide by — yet its cost is real and counts against the month (`noSalesCost` in the engine,
 * `member_order_facts.no_sales_cost`). Read off a month's bill as `revenue_month_orders` gives it: no margin, no margin
 * revenue, and a cost above nothing — a bill still waiting for a cost has none, and a fee alone (transport, disposal)
 * costs nothing.
 */
export function readsNoSales(bill: { marginPct: number | null; marginRevenue: number; marginCost: number | null }): boolean {
  return bill.marginPct === null && bill.marginRevenue <= 0 && bill.marginCost !== null && bill.marginCost > 0
}
