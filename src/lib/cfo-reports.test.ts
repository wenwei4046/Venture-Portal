import { describe, it, expect } from 'vitest'
import { classifyRows } from './cfo-reports'
import type { RawPvSourceRow, RawInvoiceRow, RawTreasury } from './cfo-reports'

const pv = (o: Partial<RawPvSourceRow>): RawPvSourceRow => ({
  voucherId: 'v1', voucherType: 'expense', direction: 'debit',
  pool: 'dept_pool_marketing', accountCode: '9100', accountName: 'Logistics',
  accountType: 'expense', cashFlowCategory: 'operating', amount: 100, ...o,
})
const noTreasury: RawTreasury = {
  interestIncome: 0,
  penaltyIncome: 0,
  interestExpense: 0,
  managedCodes: new Set(),
}

describe('classifyRows', () => {
  it('routes revenue & expense rows into the P&L, by pool', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'expense', direction: 'debit', amount: 300, pool: 'dept_pool_marketing', accountName: 'Logistics' }),
        pv({ accountType: 'revenue', direction: 'credit', amount: 1000, pool: 'dept_pool_marketing', accountName: 'Service revenue', voucherType: 'other' }),
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
        pv({ accountType: 'asset', cashFlowCategory: 'investing', direction: 'debit', amount: 50000, voucherType: 'loan_disbursement', accountName: 'Loans Receivable — 2990', pool: 'venture_pool' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    expect(out.income.groupNetProfit).toBe(0)
    expect(out.income.pools.find((p) => p.pool === 'venture_pool')?.expense ?? 0).toBe(0)
    // it shows up as an INVESTING cash outflow
    const inv = out.cashflow.sections.find((s) => s.category === 'investing')!
    const vpInv = inv.pools.find((p) => p.pool === 'venture_pool')!
    expect(vpInv.outflowLines.reduce((s, l) => s + l.amount, 0)).toBe(50000)
    // and as a balance-sheet movement (negative = asset acquired via cash out)
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
      treasury: { interestIncome: 1268.25, penaltyIncome: 0, interestExpense: 8430, managedCodes: new Set() },
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
      pvSources: [pv({ accountName: 'Office Rental', accountType: 'expense' })],
      invoices: [], treasury: noTreasury,
    })
    const allLabels = out.income.pools.flatMap((p) => [
      ...p.revenueLines,
      ...p.costLines,
      ...p.otherIncomeLines,
      ...p.expenseLines,
    ].map((l) => l.label))
    expect(allLabels).not.toContain('Uncategorised')
    expect(allLabels).toContain('Office Rental')
  })

  it('does NOT double-count invoice revenue on billing_payment (invoice already accrued revenue at issue)', () => {
    // Scenario: issued invoice INV-1 for RM 10,000 → revenue accrues. Customer pays
    // → a billing_payment PV source row exists. The PV source row must NOT add to
    // P&L revenue (would double-count); it should appear only as cash inflow + BS AR drop.
    const out = classifyRows({
      pvSources: [
        pv({ voucherType: 'billing_payment', direction: 'credit', accountType: 'revenue', amount: 10000, pool: 'venture_pool', accountName: 'Revenue (paid)' }),
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
    // The billing_payment shows as OPERATING cash inflow + BS AR-down.
    const opSection = out.cashflow.sections.find((s) => s.category === 'operating')!
    const vpCash = opSection.pools.find((p) => p.pool === 'venture_pool')!
    expect(vpCash.inflowLines.reduce((s, l) => s + l.amount, 0)).toBe(10000)
    expect(vpCash.outflowLines.reduce((s, l) => s + l.amount, 0)).toBe(0)
    expect(vpCash.net).toBeCloseTo(10000, 2)
    expect(out.cashflow.netChange).toBeCloseTo(10000, 2)
    expect(out.balanceMovements.find((m) => m.label === 'Revenue (paid)')?.amount).toBe(-10000)
  })

  it('does NOT double-count loan interest (revenue PV source on loan_repayment is ignored; treasury is sole source)', () => {
    const out = classifyRows({
      pvSources: [
        // Hypothetical: a loan_repayment voucher with two source rows — principal (asset, BS) + interest (revenue).
        pv({ voucherType: 'loan_repayment', direction: 'credit', accountType: 'asset', cashFlowCategory: 'investing', amount: 10000, pool: 'venture_pool', accountName: 'Loan principal received' }),
        pv({ voucherType: 'loan_repayment', direction: 'credit', accountType: 'revenue', cashFlowCategory: 'operating', amount: 200, pool: 'venture_pool', accountName: 'Interest income (PV-side)' }),
      ],
      invoices: [],
      treasury: { interestIncome: 200, penaltyIncome: 0, interestExpense: 0, managedCodes: new Set() },
    })
    const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
    // Revenue is 200 (from treasury), NOT 400. The PV revenue source is skipped.
    expect(vp.revenue).toBeCloseTo(200, 2)
    // The principal row appears as BS movement + investing cash inflow
    expect(out.balanceMovements.find((m) => m.label === 'Loan principal received')?.amount).toBe(10000)
  })

  it('does NOT double-count interest when posted via a generic expense voucher (account_code 9010 PV source is skipped because treasury claims that code)', () => {
    // Regression for 2026-05-14: user paid interest via a manually-built
    // voucher_type='expense' PV with two source rows: principal → liability
    // 4001, interest → 9010 (Interest Expense). gatherTreasury reads JE
    // 9010 → interestExpense 2000. Without skipping the 9010 PV row, the
    // P&L double-counts the same 2000.
    const out = classifyRows({
      pvSources: [
        pv({ voucherType: 'expense', direction: 'debit', accountType: 'liability', cashFlowCategory: 'financing', amount: 8333.33, pool: 'venture_pool', accountCode: '4001', accountName: 'Amount due to — sub' }),
        pv({ voucherType: 'expense', direction: 'debit', accountType: 'expense', cashFlowCategory: 'operating', amount: 2000, pool: 'venture_pool', accountCode: '9010', accountName: 'Interest Expense — Fund Sources' }),
      ],
      invoices: [],
      treasury: { interestIncome: 0, penaltyIncome: 0, interestExpense: 2000, managedCodes: new Set(['9010']) },
    })
    const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
    // Expense is 2000 (from treasury), NOT 4000. The PV expense row on
    // account_code 9010 is skipped.
    expect(vp.expense).toBeCloseTo(2000, 2)
    expect(vp.margin).toBeCloseTo(-2000, 2)
  })

  it('counts fund_sources (deposits received) as cash inflow + BS liability increase, never P&L', () => {
    const out = classifyRows({
      pvSources: [], invoices: [], treasury: noTreasury,
      fundSourceInflows: [{ fundSourceId: 'fs1', pool: 'venture_pool', label: 'Subsidiary deposit — CONTS', amount: 100000 }],
      repaymentPrincipalInflows: [],
    })
    expect(out.income.groupNetProfit).toBe(0)
    const fin = out.cashflow.sections.find((s) => s.category === 'financing')!
    const vp = fin.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.inflowLines.reduce((s, l) => s + l.amount, 0)).toBe(100000)
    expect(out.balanceMovements.find((m) => m.label.includes('CONTS'))?.amount).toBe(100000)
  })

  it('counts loan principal received as cash inflow + BS asset decrease, never P&L', () => {
    const out = classifyRows({
      pvSources: [], invoices: [], treasury: noTreasury,
      fundSourceInflows: [],
      repaymentPrincipalInflows: [{ repaymentId: 'r1', pool: 'venture_pool', label: 'Loan principal — HOOKA', amount: 30000 }],
    })
    expect(out.income.groupNetProfit).toBe(0)
    const inv = out.cashflow.sections.find((s) => s.category === 'investing')!
    const vp = inv.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.inflowLines.reduce((s, l) => s + l.amount, 0)).toBe(30000)
    expect(out.balanceMovements.find((m) => m.label.includes('HOOKA'))?.amount).toBe(-30000)  // reduces Loans Receivable
  })

  // ── New tests added in Task 7 (unified COA) ──

  it('routes cost rows into the P&L cost section', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'cost', direction: 'debit', amount: 3000, pool: 'venture_pool', accountName: 'Cost of services' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.cost).toBe(3000)
    expect(vp.grossProfit).toBe(-3000)  // no revenue yet
  })

  it('routes other_income rows into the P&L other income section', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'other_income', direction: 'credit', amount: 200, pool: 'venture_pool', accountName: 'Penalty income', voucherType: 'other' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    const vp = out.income.pools.find((p) => p.pool === 'venture_pool')!
    expect(vp.otherIncome).toBe(200)
    expect(vp.margin).toBe(200)
  })

  it('groups CFS lines into operating / investing / financing by cashFlowCategory', () => {
    const out = classifyRows({
      pvSources: [
        // Loans Receivable: cash flow category = investing
        pv({ accountType: 'asset', cashFlowCategory: 'investing', direction: 'debit', amount: 50000, pool: 'venture_pool', accountName: 'Loans Receivable', voucherType: 'other' }),
        // Operating expense
        pv({ accountType: 'expense', cashFlowCategory: 'operating', direction: 'debit', amount: 500, pool: 'venture_pool', accountName: 'Postage' }),
        // Financing: liability inflow (e.g. director loan)
        pv({ accountType: 'liability', cashFlowCategory: 'financing', direction: 'credit', amount: 100000, pool: 'venture_pool', accountName: 'Director loan', voucherType: 'other' }),
      ],
      invoices: [], treasury: noTreasury,
    })
    const sections = out.cashflow.sections
    expect(sections.find((s) => s.category === 'investing')!.net).toBe(-50000)
    expect(sections.find((s) => s.category === 'operating')!.net).toBe(-500)
    expect(sections.find((s) => s.category === 'financing')!.net).toBe(100000)
    expect(out.cashflow.netChange).toBe(100000 - 50000 - 500)
  })

  it('Gross Profit = revenue - cost for each pool', () => {
    const out = classifyRows({
      pvSources: [
        pv({ accountType: 'cost', direction: 'debit', amount: 3000, pool: 'dept_pool_marketing', accountName: 'Cost' }),
      ],
      invoices: [
        { invoiceNo: 'INV-1', companyShortCode: 'CAR', pool: 'dept_pool_marketing', amount: 10000 },
      ],
      treasury: noTreasury,
    })
    const mk = out.income.pools.find((p) => p.pool === 'dept_pool_marketing')!
    expect(mk.revenue).toBe(10000)
    expect(mk.cost).toBe(3000)
    expect(mk.grossProfit).toBe(7000)
  })
})
