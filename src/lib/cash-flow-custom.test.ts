import { describe, it, expect } from 'vitest'
import {
  buildCustomCashFlowRows,
  type MonthlyCashFlowAccounts,
  type CashFlowAccount,
  type CashFlowLayout,
} from './cash-flow-custom'
import type { MatrixColumn } from './monthly-matrix'

function acc(code: string, defaultCategory: CashFlowAccount['defaultCategory'], v: number): CashFlowAccount {
  return { code, name: code, defaultCategory, values: [v], ancestry: [] }
}

function data(accounts: CashFlowAccount[]): MonthlyCashFlowAccounts {
  return {
    columns: [{ key: 'c1', label: 'C1' } as unknown as MatrixColumn],
    accounts,
    openingByCol: [0],
    closingByCol: [accounts.reduce((s, a) => s + a.values[0], 0)],
    netChangeByCol: [accounts.reduce((s, a) => s + a.values[0], 0)],
  }
}

const val = (rows: ReturnType<typeof buildCustomCashFlowRows>, key: string) =>
  rows.find((r) => r.key === key)?.values[0]

describe('buildCustomCashFlowRows auto-filing', () => {
  it('files un-placed accounts into the category matching their default (no red Unassigned)', () => {
    const layout: CashFlowLayout = {
      categories: [
        { id: 'operating', name: 'Operating Activities', accounts: ['3030'] },
        { id: 'financing', name: 'Financing Activities', accounts: [] },
      ],
    }
    const rows = buildCustomCashFlowRows(
      data([
        acc('3030', 'operating', -50), // explicitly placed
        acc('9999', 'operating', -100), // un-placed → auto Operating
        acc('IB-XFER', 'financing', -30), // un-placed → auto Financing
      ]),
      layout,
    )
    expect(rows.find((r) => r.key === 'cat:unassigned')).toBeUndefined()
    expect(val(rows, 'cat:operating')).toBe(-150) // 3030 + 9999
    expect(val(rows, 'cat:financing')).toBe(-30)
  })

  it('still flags a truly orphan account (its default category has no matching category)', () => {
    const layout: CashFlowLayout = {
      categories: [{ id: 'operating', name: 'Operating Activities', accounts: [] }],
    }
    const rows = buildCustomCashFlowRows(data([acc('2000', 'investing', -5)]), layout)
    expect(val(rows, 'cat:unassigned')).toBe(-5)
  })
})
