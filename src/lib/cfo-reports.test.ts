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

  it('does NOT double-count invoice revenue on billing_payment (invoice already accrued revenue at issue)', () => {
    // Scenario: issued invoice INV-1 for RM 10,000 → revenue accrues. Customer pays
    // → a billing_payment PV source row exists. The PV source row must NOT add to
    // P&L revenue (would double-count); it should appear only as cash inflow + BS AR drop.
    const out = classifyRows({
      pvSources: [
        pv({ voucherType: 'billing_payment', direction: 'credit', accountType: 'revenue', amount: 10000, pool: 'venture_pool', categoryLabel: 'Revenue (paid)' }),
      ],
      invoices: [
        { invoiceNo: 'INV-1', companyShortCode: 'CAR', pool: 'venture_pool', amount: 10000 },
      ],
      treasury: noTreasury,
    })
    const vpIncome = out.income.pools.find((p) => p.pool === 'venture_pool')!
    // Revenue is RM 10,000 (from invoice), NOT RM 20,000.
    expect(vpIncome.revenue).toBeCloseTo(10000, 2)
    expect(out.income.groupNetProfit).toBeCloseTo(10000, 2)
    // The billing_payment shows as cash inflow + BS AR-down (-amount)
    const vpCash = out.cashflow.pools.find((p) => p.pool === 'venture_pool')!
    expect(vpCash.inflow.fundIn.reduce((s, l) => s + l.amount, 0)).toBe(10000)
    expect(out.balanceMovements.find((m) => m.label === 'Revenue (paid)')?.amount).toBe(-10000)
  })

  it('does NOT double-count loan interest (revenue PV source on loan_repayment is ignored; treasury is sole source)', () => {
    const out = classifyRows({
      pvSources: [
        // Hypothetical: a loan_repayment voucher with two source rows — principal (asset, BS) + interest (revenue).
        pv({ voucherType: 'loan_repayment', direction: 'credit', accountType: 'asset', amount: 10000, pool: 'venture_pool', categoryLabel: 'Loan principal received' }),
        pv({ voucherType: 'loan_repayment', direction: 'credit', accountType: 'revenue', amount: 200, pool: 'venture_pool', categoryLabel: 'Interest income (PV-side)' }),
      ],
      invoices: [],
      treasury: { interestIncome: 200, penaltyIncome: 0, interestExpense: 0 },
    })
    const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
    // Revenue is 200 (from treasury), NOT 400. The PV revenue source is skipped.
    expect(vp.revenue).toBeCloseTo(200, 2)
    // The principal row appears as BS movement + cash fundIn
    expect(out.balanceMovements.find((m) => m.label === 'Loan principal received')?.amount).toBe(10000)
  })

  it('counts fund_sources (deposits received) as cash inflow + BS liability increase, never P&L', () => {
    const out = classifyRows({
      pvSources: [], invoices: [], treasury: noTreasury,
      fundSourceInflows: [{ fundSourceId: 'fs1', pool: 'venture_pool', label: 'Subsidiary deposit — CONTS', amount: 100000 }],
      repaymentPrincipalInflows: [],
    })
    expect(out.income.groupNetProfit).toBe(0)
    const vp = out.cashflow.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.inflow.fundIn.reduce((s, l) => s + l.amount, 0)).toBe(100000)
    expect(out.balanceMovements.find((m) => m.label.includes('CONTS'))?.amount).toBe(100000)
  })

  it('counts loan principal received as cash inflow + BS asset decrease, never P&L', () => {
    const out = classifyRows({
      pvSources: [], invoices: [], treasury: noTreasury,
      fundSourceInflows: [],
      repaymentPrincipalInflows: [{ repaymentId: 'r1', pool: 'venture_pool', label: 'Loan principal — HOOKA', amount: 30000 }],
    })
    expect(out.income.groupNetProfit).toBe(0)
    const vp = out.cashflow.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.inflow.fundIn.reduce((s, l) => s + l.amount, 0)).toBe(30000)
    expect(out.balanceMovements.find((m) => m.label.includes('HOOKA'))?.amount).toBe(-30000)  // reduces Loans Receivable
  })
})
