import { describe, it, expect } from 'vitest'
import { classifyRows } from './cfo-reports'
import type { RawPvSourceRow, RawInvoiceRow, RawTreasury } from './cfo-reports'

const pv = (o: Partial<RawPvSourceRow>): RawPvSourceRow => ({
  voucherId: 'v1', voucherType: 'expense', direction: 'debit',
  pool: 'dept_pool_marketing', categoryCode: 'logistics', categoryLabel: 'Logistics',
  accountType: 'expense', amount: 100, ...o,
})
const noTreasury: RawTreasury = { interestIncome: 0, penaltyIncome: 0, interestExpense: 0 }

describe('classifyRows', () => {
  it('routes revenue & expense rows into the P&L, by pool', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'expense', direction: 'debit', amount: 300, pool: 'dept_pool_marketing', categoryLabel: 'Logistics' }),
        pv({ accountType: 'revenue', direction: 'credit', amount: 1000, pool: 'dept_pool_marketing', categoryLabel: 'Service revenue', voucherType: 'other' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    const mk = out.income.pools.find((p) => p.pool === 'dept_pool_marketing')!
    expect(mk.revenue).toBe(1000)
    expect(mk.expense).toBe(300)
    expect(mk.margin).toBe(700)
    expect(out.income.groupNetProfit).toBe(700)
  })

  it('does NOT put asset/liability/equity rows into the P&L (loan disbursement is BS only)', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'asset', direction: 'debit', amount: 50000, voucherType: 'loan_disbursement', categoryLabel: 'Amount due from / (to) - 2990', pool: 'venture_pool' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    expect(out.income.groupNetProfit).toBe(0)
    expect(out.income.pools.find((p) => p.pool === 'venture_pool')?.expense ?? 0).toBe(0)
    // it shows up as a capital outflow in cash flow
    const vp = out.cashflow.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.outflow.capital.reduce((s, l) => s + l.amount, 0)).toBe(50000)
    // and as a balance-sheet movement (negative = asset acquired via cash out... here -amount)
    expect(out.balanceMovements.find((m) => m.label.includes('2990'))?.amount).toBe(-50000)
  })

  it('excludes internal_transfer vouchers entirely', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'expense', direction: 'debit', amount: 999, voucherType: 'internal_transfer' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    expect(out.income.groupExpense).toBe(0)
    expect(out.cashflow.netChange).toBe(0)
  })

  it('counts every invoice as revenue, mapped to its pool, regardless of billing mode', () => {
    const invoices: RawInvoiceRow[] = [
      { invoiceNo: 'INV-1', companyShortCode: 'CONTS', pool: 'dept_pool_hr', amount: 4000 },
      { invoiceNo: 'INV-2', companyShortCode: 'OHANA', pool: 'venture_pool', amount: 1500 },
    ]
    const out = classifyRows({ pvSources: [], invoices, treasury: noTreasury })
    expect(out.income.pools.find((p) => p.pool === 'dept_pool_hr')!.revenue).toBe(4000)
    expect(out.income.pools.find((p) => p.pool === 'venture_pool')!.revenue).toBe(1500)
    expect(out.income.groupRevenue).toBe(5500)
  })

  it('folds treasury interest into the Venture Pool margin (not double-counted)', () => {
    const out = classifyRows({
      pvSources: [], invoices: [],
      treasury: { interestIncome: 1268.25, penaltyIncome: 0, interestExpense: 8430 },
    })
    const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.revenue).toBeCloseTo(1268.25, 2)
    expect(vp.expense).toBeCloseTo(8430, 2)
    expect(vp.margin).toBeCloseTo(-7161.75, 2)
    expect(out.income.treasury.net).toBeCloseTo(-7161.75, 2)
    expect(out.income.groupNetProfit).toBeCloseTo(-7161.75, 2)  // only counted once
  })

  it('produces no "Uncategorised" lines — every line carries a real label', () => {
    const out = classifyRows({
      pvSources: [pv({ categoryLabel: 'Office Rental', accountType: 'expense' })],
      invoices: [], treasury: noTreasury,
    })
    const allLabels = out.income.pools.flatMap((p) => [...p.revenueLines, ...p.expenseLines].map((l) => l.label))
    expect(allLabels).not.toContain('Uncategorised')
    expect(allLabels).toContain('Office Rental')
  })
})
