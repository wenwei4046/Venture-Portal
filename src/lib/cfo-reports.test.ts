import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyRows, buildTrialBalance, buildLedger, resolveSourceDescriptions, groupRevenueByAccount } from './cfo-reports'
import type { RawPvSourceRow, RawInvoiceRow, RawTreasury, CoaLeafAccount, RawLedgerLine } from './cfo-reports'

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
      { invoiceNo: 'INV-1', description: 'Svc', companyShortCode: 'CONTS', pool: 'dept_pool_hr', amount: 4000, categoryCode: '5000', categoryName: 'Service Revenue - Subs' },
      { invoiceNo: 'INV-2', description: 'Svc', companyShortCode: 'OHANA', pool: 'venture_pool', amount: 1500, categoryCode: '5000', categoryName: 'Service Revenue - Subs' },
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
      ...p.revenueGroups.flatMap((g) => [g.accountName, ...g.items.map((it) => it.label)]),
      ...p.costLines.map((l) => l.label),
      ...p.otherIncomeLines.map((l) => l.label),
      ...p.expenseLines.map((l) => l.label),
    ])
    expect(allLabels).not.toContain('Uncategorised')
    expect(allLabels).toContain('Office Rental')
    // every revenue group + item must carry a real (non-empty) label
    for (const p of out.income.pools) {
      for (const g of p.revenueGroups) {
        expect(g.accountName).not.toBe('')
        for (const it of g.items) expect(it.label).not.toBe('')
      }
    }
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
        { invoiceNo: 'INV-1', description: 'Svc', companyShortCode: 'CAR', pool: 'venture_pool', amount: 10000, categoryCode: '5000', categoryName: 'Service Revenue - Subs' },
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

  it('inter-billing: paying dept books expense + cash outflow, receiver books AR collection + cash inflow (mig 253)', () => {
    // Scenario: Marketing bills HR 1000 (inter-billing). Settlement is a
    // credit voucher with payment_method='netting'. createPaymentVoucher
    // inserts TWO payment_voucher_sources rows:
    //   - pool=dept_pool_marketing, account=3030 (asset) — receiving side
    //   - pool=dept_pool_hr,        account=9053 (expense) — paying side (CF only)
    // Plus an invoice row tagged to dept_pool_marketing (revenue accrued at
    // issue time) and an interBillingExpenses row for HR (expense at invoice date).
    // Expected:
    //   Marketing P&L: revenue +1000 (from invoice), margin +1000
    //   HR P&L: expense +1000 (from interBillingExpenses), margin -1000
    //   Group: revenue 1000, expense 1000, netProfit 0 (internal nets out)
    //   Marketing cfIn.operating +1000 (AR collected at settlement).
    //   HR cfOut.operating +1000 (at settlement, from billing_payment mirror, CF-only).
    //   BS movement: Marketing AR -1000.
    const out = classifyRows({
      pvSources: [
        pv({ voucherType: 'billing_payment', direction: 'credit', accountType: 'asset', cashFlowCategory: 'operating', amount: 1000, pool: 'dept_pool_marketing', accountCode: '3030', accountName: 'AR — Subs' }),
        pv({ voucherType: 'billing_payment', direction: 'credit', accountType: 'expense', cashFlowCategory: 'operating', amount: 1000, pool: 'dept_pool_hr', accountCode: '9053', accountName: 'Inter-billing — HR' }),
      ],
      invoices: [
        { invoiceNo: 'INV-IB-1', description: 'Svc', companyShortCode: 'HV', pool: 'dept_pool_marketing', amount: 1000, categoryCode: '5000', categoryName: 'Service Revenue - Subs' },
      ],
      interBillingExpenses: [
        { invoiceNo: 'INV-IB-1', payingPool: 'dept_pool_hr', amount: 1000 },
      ],
      treasury: noTreasury,
    })
    const mk = out.income.pools.find((p) => p.pool === 'dept_pool_marketing')!
    expect(mk.revenue).toBe(1000)
    expect(mk.expense).toBe(0)
    expect(mk.margin).toBe(1000)
    const hr = out.income.pools.find((p) => p.pool === 'dept_pool_hr')!
    expect(hr.revenue).toBe(0)
    expect(hr.expense).toBe(1000)
    expect(hr.margin).toBe(-1000)
    expect(out.income.groupNetProfit).toBe(0)
    const opSection = out.cashflow.sections.find((s) => s.category === 'operating')!
    const mkOp = opSection.pools.find((p) => p.pool === 'dept_pool_marketing')!
    expect(mkOp.inflowLines.reduce((s, l) => s + l.amount, 0)).toBe(1000)
    expect(mkOp.outflowLines.reduce((s, l) => s + l.amount, 0)).toBe(0)
    const hrOp = opSection.pools.find((p) => p.pool === 'dept_pool_hr')!
    expect(hrOp.outflowLines.reduce((s, l) => s + l.amount, 0)).toBe(1000)
    expect(hrOp.inflowLines.reduce((s, l) => s + l.amount, 0)).toBe(0)
    // BS movements: only the receiver's AR collection. No equity movement
    // for the paying side — expense closes to equity at period end.
    expect(out.balanceMovements.find((m) => m.label === 'AR — Subs')?.amount).toBe(-1000)
    expect(out.balanceMovements.find((m) => m.label === 'Inter-billing — HR')).toBeUndefined()
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
        { invoiceNo: 'INV-1', description: 'Svc', companyShortCode: 'CAR', pool: 'dept_pool_marketing', amount: 10000, categoryCode: '5000', categoryName: 'Service Revenue - Subs' },
      ],
      treasury: noTreasury,
    })
    const mk = out.income.pools.find((p) => p.pool === 'dept_pool_marketing')!
    expect(mk.revenue).toBe(10000)
    expect(mk.cost).toBe(3000)
    expect(mk.grossProfit).toBe(7000)
  })

  it('revenue detail label: description present → "desc · invNo", empty → "shortCode · invNo" fallback (ed27e3d)', () => {
    const out = classifyRows({
      pvSources: [],
      invoices: [
        { invoiceNo: 'I-1', description: 'Office rent Feb', companyShortCode: 'DC', pool: 'dept_pool_marketing', amount: 1000, categoryCode: '5000', categoryName: 'Service Revenue - Subs' },
        { invoiceNo: 'I-2', description: '', companyShortCode: 'KG', pool: 'dept_pool_marketing', amount: 2000, categoryCode: '5000', categoryName: 'Service Revenue - Subs' },
      ],
      treasury: noTreasury,
    })
    const mk = out.income.pools.find((p) => p.pool === 'dept_pool_marketing')!
    const grp = mk.revenueGroups.find((g) => g.accountName === 'Service Revenue - Subs')!
    expect(grp.items).toEqual(
      expect.arrayContaining([
        { label: 'Office rent Feb · I-1', amount: 1000 },
        { label: 'KG · I-2', amount: 2000 },
      ]),
    )
  })
})

describe('buildTrialBalance', () => {
  it('splits a signed net into Dr/Cr columns, totals reconcile', () => {
    const accounts: CoaLeafAccount[] = [
      { code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset' },
      { code: '4000', name: 'Fund Sources Payable',     type: 'liability' },
    ]
    const netByCode = new Map<string, number>([
      ['3000', 1000],   // Dr 1000 (asset normal balance)
      ['4000', -1000],  // Cr 1000 (liability normal balance, signed -)
    ])
    const tb = buildTrialBalance({
      accounts,
      netByCode,
      asOf: '2026-05-15',
      showZeroBalance: false,
    })
    expect(tb.rows).toHaveLength(2)
    expect(tb.rows[0]).toMatchObject({ code: '3000', debit: 1000, credit: 0 })
    expect(tb.rows[1]).toMatchObject({ code: '4000', debit: 0, credit: 1000 })
    expect(tb.totals).toEqual({ debit: 1000, credit: 1000 })
    expect(tb.reconciles).toBe(true)
  })

  it('drops zero-balance rows when showZeroBalance=false, keeps them when true', () => {
    const accounts: CoaLeafAccount[] = [
      { code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset' },
      { code: '4000', name: 'Fund Sources Payable',     type: 'liability' },
      { code: '9000', name: 'General & Admin Expenses', type: 'expense' },
    ]
    const netByCode = new Map<string, number>([
      ['3000', 1000],
      ['4000', -1000],
      ['9000', 0],
    ])
    const hidden = buildTrialBalance({
      accounts, netByCode, asOf: '2026-05-15', showZeroBalance: false,
    })
    expect(hidden.rows.map((r) => r.code)).toEqual(['3000', '4000'])
    const shown = buildTrialBalance({
      accounts, netByCode, asOf: '2026-05-15', showZeroBalance: true,
    })
    expect(shown.rows.map((r) => r.code)).toEqual(['3000', '4000', '9000']) // sorted by type (BS then P&L), then code
    expect(shown.rows.find((r) => r.code === '9000')).toMatchObject({ debit: 0, credit: 0 })
  })

  it('treats sub-cent balances as zero for the showZeroBalance filter', () => {
    const accounts: CoaLeafAccount[] = [
      { code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset' },
      { code: '3010', name: 'Cash & Bank — Alliance',   type: 'asset' },
    ]
    const netByCode = new Map<string, number>([
      ['3000', 1000],
      ['3010', 0.004], // rounds to 0 — should be filtered out
    ])
    const hidden = buildTrialBalance({
      accounts, netByCode, asOf: '2026-05-15', showZeroBalance: false,
    })
    expect(hidden.rows.map((r) => r.code)).toEqual(['3000'])
    const shown = buildTrialBalance({
      accounts, netByCode, asOf: '2026-05-15', showZeroBalance: true,
    })
    expect(shown.rows).toHaveLength(2)
    expect(shown.rows.find((r) => r.code === '3010')).toMatchObject({ debit: 0, credit: 0 })
  })
})

describe('buildLedger', () => {
  it('closing balance = opening + period Dr − period Cr', () => {
    const account: CoaLeafAccount = {
      code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset',
    }
    const rawLines: RawLedgerLine[] = [
      { entryDate: '2026-05-03', entryNo: 'JE-001', description: 'inv 1', accountDesc: '', journalType: '', ref: '', debit: 500, credit: 0 },
      { entryDate: '2026-05-10', entryNo: 'JE-002', description: 'pmt', accountDesc: '', journalType: '', ref: '', debit: 0, credit: 200 },
    ]
    const led = buildLedger({
      account, openingBalance: 1000, rawLines,
      from: '2026-05-01', to: '2026-05-31',
    })
    expect(led.openingBalance).toBe(1000)
    expect(led.periodTotals).toEqual({ debit: 500, credit: 200 })
    expect(led.closingBalance).toBe(1300)
    // lines[0] is the injected BALANCE B/F line; 2 real lines follow
    expect(led.lines).toHaveLength(3)
  })

  it('running balance accumulates Dr − Cr line by line', () => {
    const account: CoaLeafAccount = {
      code: '3000', name: 'Cash & Bank — Hong Leong', type: 'asset',
    }
    const rawLines: RawLedgerLine[] = [
      { entryDate: '2026-05-03', entryNo: 'JE-001', description: 'in',  accountDesc: '', journalType: '', ref: '', debit: 100, credit: 0 },
      { entryDate: '2026-05-05', entryNo: 'JE-002', description: 'out', accountDesc: '', journalType: '', ref: '', debit: 0,   credit: 30 },
      { entryDate: '2026-05-08', entryNo: 'JE-003', description: 'in',  accountDesc: '', journalType: '', ref: '', debit: 50,  credit: 0 },
    ]
    const led = buildLedger({
      account, openingBalance: 0, rawLines,
      from: '2026-05-01', to: '2026-05-31',
    })
    // lines[0] is the injected BALANCE B/F line; real lines shifted by 1
    expect(led.lines[1].runningBalance).toBe(100)
    expect(led.lines[2].runningBalance).toBe(70)
    expect(led.lines[3].runningBalance).toBe(120)
    expect(led.closingBalance).toBe(120)
  })
})

describe('buildLedger GL fields', () => {
  const account = { code: '5700', name: 'Rental Income', type: 'revenue' as const }

  it('injects a BALANCE B/F line as lines[0] carrying the opening balance', () => {
    const led = buildLedger({
      account, openingBalance: -112894.42, from: '2026-02-01', to: '2026-02-28',
      rawLines: [
        { entryDate: '2026-02-09', entryNo: 'JE-1', description: 'KL Gateway',
          debit: 0, credit: 7159.12, accountDesc: 'Rental Income',
          journalType: 'SALES', ref: 'I-2602-0043' },
      ],
    })
    expect(led.lines[0]).toEqual({
      entryDate: '', entryNo: '', description: 'BALANCE B/F',
      accountDesc: 'Rental Income', journalType: '', ref: '',
      debit: 0, credit: 0, runningBalance: -112894.42,
    })
  })

  it('passes accountDesc/journalType/ref through and keeps running balance algorithm', () => {
    const led = buildLedger({
      account, openingBalance: 0, from: '2026-02-01', to: '2026-02-28',
      rawLines: [
        { entryDate: '2026-02-09', entryNo: 'JE-1', description: 'x',
          debit: 0, credit: 1000, accountDesc: 'Rental Income',
          journalType: 'SALES', ref: 'I-1' },
        { entryDate: '2026-02-10', entryNo: 'JE-2', description: 'y',
          debit: 200, credit: 0, accountDesc: 'Rental Income',
          journalType: 'PAYMENT', ref: 'HV-PV-1' },
      ],
    })
    expect(led.lines[1]).toMatchObject({ journalType: 'SALES', ref: 'I-1', accountDesc: 'Rental Income', runningBalance: -1000 })
    expect(led.lines[2]).toMatchObject({ journalType: 'PAYMENT', ref: 'HV-PV-1', runningBalance: -800 })
    expect(led.periodTotals).toEqual({ debit: 200, credit: 1000 })
    expect(led.closingBalance).toBe(-800)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Mock supabase client for resolveSourceDescriptions — `.from(table).select(_).in(_, ids)`
// is the only chain it uses. We return canned rows per table.
// ────────────────────────────────────────────────────────────────────────────

function mockSupabaseForDescriptions(
  data: { invoices?: Array<{ id: string; description: string | null }>; payment_vouchers?: Array<{ id: string; description: string | null }> },
): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          const rows =
            table === 'invoices'
              ? (data.invoices ?? []).filter((r) => ids.includes(r.id))
              : table === 'payment_vouchers'
                ? (data.payment_vouchers ?? []).filter((r) => ids.includes(r.id))
                : []
          return { data: rows, error: null }
        },
      }),
    }),
  } as unknown as SupabaseClient
}

describe('resolveSourceDescriptions', () => {
  it('returns empty map when no refs given (no DB queries needed)', async () => {
    const client = mockSupabaseForDescriptions({})
    const out = await resolveSourceDescriptions(client, [])
    expect(out.size).toBe(0)
  })

  it('overrides JE description with invoices.description when present', async () => {
    const client = mockSupabaseForDescriptions({
      invoices: [
        { id: 'inv-1', description: 'Office rent — May 2026' },
        { id: 'inv-2', description: null }, // null source → skipped
        { id: 'inv-3', description: '   ' }, // whitespace-only → skipped
      ],
    })
    const out = await resolveSourceDescriptions(client, [
      { referenceType: 'invoice', referenceId: 'inv-1' },
      { referenceType: 'invoice', referenceId: 'inv-2' },
      { referenceType: 'invoice', referenceId: 'inv-3' },
    ])
    expect(out.get('invoice:inv-1')).toBe('Office rent — May 2026')
    expect(out.has('invoice:inv-2')).toBe(false)
    expect(out.has('invoice:inv-3')).toBe(false)
  })

  it('overrides JE description with payment_vouchers.description', async () => {
    const client = mockSupabaseForDescriptions({
      payment_vouchers: [{ id: 'pv-1', description: 'Petty cash reimbursement' }],
    })
    const out = await resolveSourceDescriptions(client, [
      { referenceType: 'payment_voucher', referenceId: 'pv-1' },
    ])
    expect(out.get('payment_voucher:pv-1')).toBe('Petty cash reimbursement')
  })

  it('ignores reference types it does not handle (loan, fund_source, etc.)', async () => {
    const client = mockSupabaseForDescriptions({})
    const out = await resolveSourceDescriptions(client, [
      { referenceType: 'loan', referenceId: 'loan-1' },
      { referenceType: 'fund_source', referenceId: 'fs-1' },
      { referenceType: 'payroll_run', referenceId: 'pr-1' },
    ])
    expect(out.size).toBe(0)
  })

  it('handles a mix of invoice and PV refs in one call', async () => {
    const client = mockSupabaseForDescriptions({
      invoices: [{ id: 'inv-1', description: 'Service fee' }],
      payment_vouchers: [{ id: 'pv-1', description: 'Office supplies' }],
    })
    const out = await resolveSourceDescriptions(client, [
      { referenceType: 'invoice', referenceId: 'inv-1' },
      { referenceType: 'payment_voucher', referenceId: 'pv-1' },
      { referenceType: 'loan', referenceId: 'loan-1' },
    ])
    expect(out.size).toBe(2)
    expect(out.get('invoice:inv-1')).toBe('Service fee')
    expect(out.get('payment_voucher:pv-1')).toBe('Office supplies')
  })
})

describe('groupRevenueByAccount', () => {
  it('groups invoice items by account, sums subtotals, sorts groups + items desc, drops zero', () => {
    const groups = groupRevenueByAccount({
      invoiceItems: [
        { accountCode: '5000', accountName: 'Service Revenue - Subs', label: 'DC · I-1', amount: 1000 },
        { accountCode: '5000', accountName: 'Service Revenue - Subs', label: 'DC · I-2', amount: 3000 },
        { accountCode: '5100', accountName: 'Rental Income', label: 'KG · I-3', amount: 500 },
        { accountCode: '5100', accountName: 'Rental Income', label: 'KG · I-4', amount: 0 },
      ],
      flatLines: [{ label: 'Interest income — Loans', amount: 250 }],
    })
    expect(groups.map((g) => [g.accountName, g.subtotal])).toEqual([
      ['Service Revenue - Subs', 4000],
      ['Rental Income', 500],
      ['Interest income — Loans', 250],
    ])
    const subs = groups.find((g) => g.accountName === 'Service Revenue - Subs')!
    expect(subs.items).toEqual([
      { label: 'DC · I-2', amount: 3000 },
      { label: 'DC · I-1', amount: 1000 },
    ])
    const interest = groups.find((g) => g.accountName === 'Interest income — Loans')!
    expect(interest.items).toEqual([{ label: 'Interest income — Loans', amount: 250 }])
    expect(groups.find((g) => g.accountName === 'Rental Income')!.items).toEqual([
      { label: 'KG · I-3', amount: 500 },
    ])
  })

  it('returns [] when no revenue', () => {
    expect(groupRevenueByAccount({ invoiceItems: [], flatLines: [] })).toEqual([])
  })
})
