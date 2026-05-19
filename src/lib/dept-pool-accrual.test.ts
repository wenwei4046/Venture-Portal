import { describe, it, expect } from 'vitest'
import { deptNameToPoolKey, splitPoolAccrual } from './dept-pool-accrual'
import type { PoolPnl } from './cfo-reports'

function pnl(over: Partial<PoolPnl>): PoolPnl {
  return {
    pool: 'dept_pool_marketing',
    poolLabel: 'Marketing',
    revenueGroups: [],
    costLines: [],
    otherIncomeLines: [],
    expenseLines: [],
    revenue: 0,
    cost: 0,
    otherIncome: 0,
    expense: 0,
    grossProfit: 0,
    margin: 0,
    ...over,
  }
}

describe('deptNameToPoolKey', () => {
  it('maps each department name to its pool slug', () => {
    expect(deptNameToPoolKey('Marketing')).toBe('dept_pool_marketing')
    expect(deptNameToPoolKey('HR')).toBe('dept_pool_hr')
    expect(deptNameToPoolKey('Finance')).toBe('dept_pool_finance')
    expect(deptNameToPoolKey('Director Office')).toBe('dept_pool_director_office')
    expect(deptNameToPoolKey('Director')).toBe('dept_pool_director')
  })
  it('returns null for an unknown department', () => {
    expect(deptNameToPoolKey('Sales')).toBeNull()
    expect(deptNameToPoolKey('')).toBeNull()
  })
})

describe('splitPoolAccrual', () => {
  it('splits inter-billing out of expense; expense+interBilling === pool.expense; netMargin === pool.margin', () => {
    const p = pnl({
      revenue: 11000,
      cost: 0,
      expense: 6080,
      expenseLines: [
        { label: 'FB Ads', amount: 123 },
        { label: 'Inter-billing — HV-INV-202605-0006', amount: 5000 },
        { label: 'Inter-billing — HV-INV-202605-0009', amount: 957 },
      ],
      margin: 4920,
    })
    const r = splitPoolAccrual(p)
    expect(r.revenue).toBe(11000)
    expect(r.cost).toBe(0)
    expect(r.interBilling).toBe(5957)
    expect(r.expense).toBe(123)
    expect(r.expense + r.interBilling).toBe(p.expense)
    expect(r.netMargin).toBe(4920)
  })

  it('no inter-billing lines → interBilling 0, expense unchanged', () => {
    const p = pnl({ revenue: 3000, expense: 500, expenseLines: [{ label: 'Postage', amount: 500 }], margin: 2500 })
    const r = splitPoolAccrual(p)
    expect(r.interBilling).toBe(0)
    expect(r.expense).toBe(500)
    expect(r.netMargin).toBe(2500)
  })

  it('null/undefined pool → all zeros', () => {
    expect(splitPoolAccrual(null)).toEqual({ revenue: 0, cost: 0, expense: 0, interBilling: 0, netMargin: 0 })
    expect(splitPoolAccrual(undefined)).toEqual({ revenue: 0, cost: 0, expense: 0, interBilling: 0, netMargin: 0 })
  })

  it('rounds the derived expense to 2dp (no float noise)', () => {
    const p = pnl({ expense: 100.3, expenseLines: [{ label: 'Inter-billing — X', amount: 0.1 }, { label: 'A', amount: 100.2 }], margin: -100.3 })
    const r = splitPoolAccrual(p)
    expect(r.interBilling).toBe(0.1)
    expect(r.expense).toBe(100.2)
  })
})
