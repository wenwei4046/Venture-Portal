import type { PoolPnl } from './cfo-reports'

// Department.name (from the `departments` table) → cfo-reports pool slug
// (see src/lib/pools.ts POOL_LABEL). Names not present here have no P&L pool.
const DEPT_NAME_TO_POOL: Record<string, string> = {
  Marketing: 'dept_pool_marketing',
  HR: 'dept_pool_hr',
  Finance: 'dept_pool_finance',
  'Director Office': 'dept_pool_director_office',
  Director: 'dept_pool_director',
}

export function deptNameToPoolKey(name: string): string | null {
  return DEPT_NAME_TO_POOL[name] ?? null
}

export interface DeptPoolAccrual {
  revenue: number
  cost: number
  expense: number // non-inter-billing expense (inter-billing split out for display)
  interBilling: number // the inter-billing portion carved out of pool.expense
  netMargin: number // = pool.margin (engine value; ties to /reports/income-statement)
}

// classifyRows folds inter-billing into expense as lines labelled
// `Inter-billing — <invoiceNo>` (cfo-reports.ts:488). This carves that portion
// back out for a dedicated display column — a presentational split only;
// expense + interBilling === pool.expense and netMargin === pool.margin.
const INTER_BILLING_PREFIX = 'Inter-billing — '

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export function splitPoolAccrual(pool: PoolPnl | null | undefined): DeptPoolAccrual {
  if (!pool) return { revenue: 0, cost: 0, expense: 0, interBilling: 0, netMargin: 0 }
  const interBilling = r2(
    pool.expenseLines
      .filter((l) => l.label.startsWith(INTER_BILLING_PREFIX))
      .reduce((s, l) => s + l.amount, 0),
  )
  return {
    revenue: pool.revenue,
    cost: pool.cost,
    expense: r2(pool.expense - interBilling),
    interBilling,
    netMargin: pool.margin,
  }
}
