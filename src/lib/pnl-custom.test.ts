import { describe, it, expect } from 'vitest'
import { buildCustomPnlRows, type MonthlyPnlAccounts, type PnlAccount } from './pnl-custom'
import type { ReportLayout } from './report-layouts'

function acct(code: string, cat: PnlAccount['defaultCategory'], val: number): PnlAccount {
  return { code, name: code, defaultCategory: cat, values: [val], ancestry: [] }
}

const data: MonthlyPnlAccounts = {
  columns: [{ key: 'acc', label: 'Accumulated' }],
  // signed for display: revenue +, cost/expense −
  accounts: [acct('5000', 'revenue', 1000), acct('6000', 'cost', -300), acct('9000', 'expense', -200)],
  salesByColumn: [1000],
}

const layout: ReportLayout = {
  categories: [
    { id: 'revenue', name: 'Revenue', accounts: ['5000'] },
    { id: 'cost', name: 'Cost of Goods Sold', accounts: ['6000'] },
    { id: 'expense', name: 'Expenses', accounts: ['9000'] },
  ],
}

describe('buildCustomPnlRows — Gross Profit', () => {
  const rows = buildCustomPnlRows(data, layout)
  const keys = rows.map((r) => r.key)

  it('emits a Gross Profit row = Revenue − COGS', () => {
    const gp = rows.find((r) => r.key === 'GROSS_PROFIT')
    expect(gp).toBeDefined()
    expect(gp!.values[0]).toBe(700) // 1000 + (−300)
  })

  it('places Gross Profit after COGS and before Expenses', () => {
    expect(keys.indexOf('GROSS_PROFIT')).toBeGreaterThan(keys.indexOf('cat:cost'))
    expect(keys.indexOf('GROSS_PROFIT')).toBeLessThan(keys.indexOf('cat:expense'))
  })

  it('still ends with Net Income = every account summed', () => {
    const net = rows.find((r) => r.key === 'NET_INCOME')
    expect(net!.values[0]).toBe(500) // 1000 − 300 − 200
  })
})

describe('buildCustomPnlRows — Gross Profit follows the layout, not COA type', () => {
  // The 9000 account is COA type 'expense', but the user dragged it into the
  // COGS category — Gross Profit must subtract it too.
  const movedLayout: ReportLayout = {
    categories: [
      { id: 'revenue', name: 'Revenue', accounts: ['5000'] },
      { id: 'cost', name: 'Cost of Goods Sold', accounts: ['6000', '9000'] },
      { id: 'expense', name: 'Expenses', accounts: [] },
    ],
  }
  const rows = buildCustomPnlRows(data, movedLayout)

  it('counts whatever sits in the COGS category, even expense-type accounts', () => {
    const gp = rows.find((r) => r.key === 'GROSS_PROFIT')
    expect(gp!.values[0]).toBe(500) // 1000 − 300 − 200 (salary now inside COGS)
  })
})
