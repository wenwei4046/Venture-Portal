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

// ─── buildSideMatrixRows (2026-09-18: parent codes, category rows, zero rows) ─
import { buildSideMatrixRows, type SideAccount } from './cash-flow-custom'

const LOANS = { code: '3020', name: 'Loans Receivable' }
const FUND = { code: '4000', name: 'Fund Sources Payable' }
const FUND_CO = { code: '4100', name: 'Amount Due to - Company' }
const sideAcc = (code: string, name: string, values: number[], ancestry: { code: string; name: string }[] = []): SideAccount => ({
  code, name, values, ancestry,
})
const SIDE: SideAccount[] = [
  sideAcc('3053', 'Due from The Cont', [100, 60, 40], [LOANS]),
  sideAcc('3054', 'Due from 2990', [20, 0, 20], [LOANS]),
  sideAcc('3057', 'Due from CMI', [0, 0, 0], [LOANS]), // all zero → hidden
  sideAcc('4051', 'Due to 2990', [30, 30, 0], [FUND, FUND_CO]),
  sideAcc('5027', 'Loan Interest', [5, 5, 0]),
]
const layoutOf = (cats: { id: string; name: string; accounts: string[] }[]) => ({ categories: cats })
const TOTAL = [155, 95, 60]

describe('buildSideMatrixRows', () => {
  it('a parent code gathers its leaves under ONE category row that carries the totals', () => {
    const rows = buildSideMatrixRows(SIDE, layoutOf([{ id: 'loans', name: 'Loans Receivable', accounts: ['3020'] }]), 3, 'in', 'Total in', TOTAL)
    const loans = rows.find((r) => r.key === 'in:loans')!
    expect(loans.kind).toBe('category')
    expect(loans.code).toBe('3020') // merged: the COA root IS the category row
    expect(loans.isParent).toBe(true)
    expect(loans.values).toEqual([120, 60, 60])
    // children lifted to depth 1, straight under the category row
    const kids = rows.filter((r) => r.key.startsWith('in:loans:'))
    expect(kids.map((r) => [r.code, r.depth])).toEqual([['3054', 1], ['3053', 1]]) // A→Z by name
    // no "— 小计" row anywhere
    expect(rows.some((r) => r.label.includes('小计'))).toBe(false)
  })

  it('a category with a different name keeps the COA root as a parent row beneath it', () => {
    const rows = buildSideMatrixRows(SIDE, layoutOf([{ id: 'x', name: '借贷', accounts: ['3020'] }]), 3, 'in', 'Total in', TOTAL)
    const cat = rows.find((r) => r.key === 'in:x')!
    expect(cat.kind).toBe('category')
    expect(cat.code).toBeUndefined()
    expect(rows.find((r) => r.key === 'in:x:3020')?.depth).toBe(1)
    expect(rows.find((r) => r.key === 'in:x:3053')?.depth).toBe(2)
  })

  it('all-zero accounts are left out; 其他 sweeps the rest; side total is last', () => {
    const rows = buildSideMatrixRows(SIDE, layoutOf([{ id: 'loans', name: 'Loans Receivable', accounts: ['3020'] }]), 3, 'in', 'Total in', TOTAL)
    expect(rows.some((r) => r.code === '3057')).toBe(false)
    const other = rows.find((r) => r.key === 'in:other')!
    expect(other.kind).toBe('category')
    expect(other.values).toEqual([35, 35, 0]) // 4051 + 5027
    expect(rows[rows.length - 1]).toMatchObject({ key: 'in:total', kind: 'subtotal', emphasis: 'strong', values: TOTAL })
  })

  it('a lone leaf named like its category is the category row itself, not expandable', () => {
    const rows = buildSideMatrixRows(SIDE, layoutOf([{ id: 'li', name: 'Loan Interest', accounts: ['5027'] }]), 3, 'in', 'Total in', TOTAL)
    const li = rows.find((r) => r.key === 'in:li')!
    expect(li).toMatchObject({ kind: 'category', code: '5027', isParent: false, values: [5, 5, 0] })
    expect(rows.some((r) => r.key === 'in:li:5027')).toBe(false)
  })

  it('a category whose accounts are all zero disappears entirely', () => {
    const rows = buildSideMatrixRows(SIDE, layoutOf([{ id: 'cmi', name: 'CMI', accounts: ['3057'] }]), 3, 'in', 'Total in', TOTAL)
    expect(rows.some((r) => r.key === 'in:cmi')).toBe(false)
  })
})
