import type { CommissionOrderRow, CommissionOrderStatus } from './workbench'

/** What the live calculation pays on ONE bill, every shared part added back together. */
export interface BillCommission {
  status: CommissionOrderStatus
  brands: string[]
  categories: string[]
  /** What on the bill earns commission, every shared part added back. */
  commissionable: number
  product: number
  kpi: number
  marginIncentive: number
  openBill: number
  total: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * The All bills page lists a month's bills one row each, but the workbench
 * builds one PERSONAL row per (holder, bill) — a shared bill is two or three
 * parts, each paid at its holder's own rate. This folds the parts back into
 * the bill. Bills carried in from earlier months belong to their own month's
 * list, so only `period`'s bills are kept. Overriding is left out: it is the
 * upline's money, not the bill's.
 */
export function commissionByBill(rows: readonly CommissionOrderRow[], period: string): Map<string, BillCommission> {
  const out = new Map<string, BillCommission>()
  for (const row of rows) {
    if (row.upsale || row.periodMonth !== period) continue
    const bill = out.get(row.originalOrderId) ?? {
      status: row.status, brands: [], categories: [],
      commissionable: 0, product: 0, kpi: 0, marginIncentive: 0, openBill: 0, total: 0,
    }
    bill.brands = [...new Set([...bill.brands, ...row.brands])]
    bill.categories = [...new Set([...bill.categories, ...row.categories])]
    bill.commissionable = round2(bill.commissionable + row.commissionableValue)
    bill.product = round2(bill.product + row.productCommission)
    bill.kpi = round2(bill.kpi + row.kpiBase + row.kpiBonus)
    bill.marginIncentive = round2(bill.marginIncentive + row.marginIncentive)
    bill.openBill = round2(bill.openBill + row.openBillBonus)
    bill.total = round2(bill.total + row.totalCommission)
    out.set(row.originalOrderId, bill)
  }
  return out
}
