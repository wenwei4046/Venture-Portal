import { describe, expect, it } from 'vitest'
import type { MatrixRow } from './monthly-matrix'
import type { PnlAccount } from './pnl-custom'
import { OTHERS_COLOR } from './dept-charts'
import { deptCashFlowSheet, deptPnlSheet, deptSheetColumns } from './dept-statement'

// 2026-10-25 — a department's statement in its charts' dress: each block opens on its side's total, money out and
// expenses as positive, a % base per row, nothing in the period left out, the accounts squared in their colours.

const colors = { in: new Map([['3033', '#3f7a64']]), out: new Map([['4070', '#e99a53']]) }
const row = (key: string, label: string, kind: MatrixRow['kind'], values: number[], more: Partial<MatrixRow> = {}): MatrixRow => ({ key, label, depth: 0, kind, values, ...more })

describe('the columns', () => {
  it('call the Accumulated Total and star the month still running', () => {
    const cols = deptSheetColumns(
      [
        { key: 'acc', label: 'Accumulated' },
        { key: '2026-10', label: 'Oct 2026' },
        { key: '2026-09', label: 'Sep 2026' },
      ],
      '2026-10',
    )
    expect(cols).toEqual([
      { key: 'acc', label: 'Total', tone: 'acc' },
      { key: '2026-10', label: 'Oct 2026 *', tone: 'now' },
      { key: '2026-09', label: 'Sep 2026' },
    ])
  })
})

describe('a department’s Cash Flow', () => {
  const ROWS: MatrixRow[] = [
    row('in:grp-3030', 'Accounts Receivable - Subs', 'category', [300, 200, 100], { isParent: true }),
    row('in:grp-3030:3033', 'AR - Carres', 'account', [300, 200, 100], { code: '3033', depth: 1 }),
    row('in:grp-3030:3034', 'AR - Dream Crafter', 'account', [0, 0, 0], { code: '3034', depth: 1 }),
    row('in:total', '流入合计 · Total money in', 'subtotal', [300, 200, 100]),
    row('out:grp-4201', 'Salary & Statutory', 'category', [-120, -60, -60], { isParent: true }),
    row('out:grp-4201:4070', 'Accrual - Salary', 'account', [-100, -50, -50], { code: '4070', depth: 1 }),
    row('out:grp-4201:4071', 'Accrual - EPF', 'account', [-20, -10, -10], { code: '4071', depth: 1 }),
    row('out:total', '流出合计 · Total money out', 'subtotal', [-120, -60, -60]),
    row('NET_CHANGE', 'Net change in cash', 'subtotal', [180, 140, 40]),
    row('OPENING_CASH', 'Opening cash', 'subtotal', [1000, 1040, 1000]),
    row('CLOSING_CASH', 'Closing cash', 'subtotal', [1180, 1180, 1040]),
  ]

  it('runs Opening cash, Money in and its sources, Money out and its uses, Net change, Closing cash', () => {
    const rows = deptCashFlowSheet(ROWS, colors)
    expect(rows.map((r) => [r.kind, r.label])).toEqual([
      ['total', 'Opening cash'],
      ['title', 'Money in'],
      ['account', 'Accounts Receivable - Subs'],
      ['account', 'AR - Carres'],
      ['title', 'Money out'],
      ['account', 'Salary & Statutory'],
      ['account', 'Accrual - Salary'],
      ['account', 'Accrual - EPF'],
      ['total', 'Net change'],
      ['total', 'Closing cash'],
    ])
  })

  it('puts each side’s total on its title and money out as positive, the categories one level up', () => {
    const rows = deptCashFlowSheet(ROWS, colors)
    const at = (label: string) => rows.find((r) => r.label === label)!
    expect(at('Money in')).toMatchObject({ values: [300, 200, 100], side: 'in', pctBase: [300, 200, 100] })
    expect(at('Money out')).toMatchObject({ values: [120, 60, 60], side: 'out', pctBase: [120, 60, 60] })
    expect(at('Salary & Statutory')).toMatchObject({ depth: 1, isParent: true, values: [120, 60, 60] })
    expect(at('Accrual - Salary')).toMatchObject({ depth: 2, code: '4070', values: [100, 50, 50], side: 'out' })
  })

  it('takes Net change as a share of money in and leaves the balances without a %', () => {
    const rows = deptCashFlowSheet(ROWS, colors)
    expect(rows.find((r) => r.label === 'Net change')).toMatchObject({ pctBase: [300, 200, 100], strong: true })
    expect(rows.find((r) => r.label === 'Opening cash')?.pctBase).toBeNull()
    expect(rows.find((r) => r.label === 'Closing cash')?.pctBase).toBeNull()
  })

  it('squares an account in its chart colour, grey when the charts fold it into Others, a category not at all', () => {
    const rows = deptCashFlowSheet(ROWS, colors)
    expect(rows.find((r) => r.label === 'AR - Carres')?.swatch).toBe('#3f7a64')
    expect(rows.find((r) => r.label === 'Accrual - EPF')?.swatch).toBe(OTHERS_COLOR)
    expect(rows.find((r) => r.label === 'Salary & Statutory')?.swatch).toBeUndefined()
  })
})

describe('a department’s P&L', () => {
  const ACCOUNTS: PnlAccount[] = [
    { code: '5012', name: 'Revenue - Lead Gen', defaultCategory: 'revenue', values: [], ancestry: [] },
    { code: '6100', name: 'Materials', defaultCategory: 'cost', values: [], ancestry: [] },
    { code: '9094', name: 'Office Rental', defaultCategory: 'expense', values: [], ancestry: [] },
  ]
  const base = [900, 450, 450]
  const sheet = (cogs: number[]) =>
    deptPnlSheet(
      [
        row('revenue:5012', 'Revenue - Lead Gen', 'account', [900, 450, 450], { code: '5012', depth: 1 }),
        row('cat:revenue', 'Revenue', 'subtotal', [900, 450, 450]),
        ...(cogs.some((v) => v !== 0) ? [row('cost:6100', 'Materials', 'account', cogs, { code: '6100', depth: 1 })] : []),
        row('cat:cost', 'Cost of Goods Sold', 'subtotal', cogs),
        row('GROSS_PROFIT', 'Gross Profit', 'subtotal', [900 + cogs[0], 450 + cogs[1], 450 + cogs[2]]),
        row('cat:other_income', 'Other Income', 'subtotal', [0, 0, 0]),
        row('expense:9094', 'Office Rental', 'account', [-300, -150, -150], { code: '9094', depth: 1 }),
        row('cat:expense', 'Expenses', 'subtotal', [-300, -150, -150]),
        row('NET_INCOME', 'Net Income / (Loss)', 'subtotal', [600 + cogs[0], 300 + cogs[1], 300 + cogs[2]]),
      ],
      ACCOUNTS,
      { in: new Map(), out: new Map() },
      base,
    )

  it('leaves out a category with nothing in the period, and the Gross profit that would only repeat the revenue', () => {
    expect(sheet([0, 0, 0]).map((r) => [r.kind, r.label])).toEqual([
      ['title', 'Revenue'],
      ['account', 'Revenue - Lead Gen'],
      ['title', 'Expenses'],
      ['account', 'Office Rental'],
      ['total', 'Net profit'],
    ])
  })

  it('keeps the cost and the Gross profit when there is a cost', () => {
    const rows = sheet([-90, -45, -45])
    expect(rows.map((r) => r.label)).toEqual(['Revenue', 'Revenue - Lead Gen', 'Cost of Goods Sold', 'Materials', 'Gross profit', 'Expenses', 'Office Rental', 'Net profit'])
    expect(rows.find((r) => r.label === 'Cost of Goods Sold')).toMatchObject({ side: 'out', values: [90, 45, 45] })
  })

  it('reads each block on its side, expenses as positive, every % of that month’s revenue', () => {
    const rows = sheet([0, 0, 0])
    expect(rows.find((r) => r.label === 'Revenue')).toMatchObject({ kind: 'title', side: 'in', values: [900, 450, 450], pctBase: base })
    expect(rows.find((r) => r.label === 'Office Rental')).toMatchObject({ side: 'out', values: [300, 150, 150], pctBase: base, swatch: OTHERS_COLOR })
    expect(rows.find((r) => r.label === 'Net profit')).toMatchObject({ values: [600, 300, 300], pctBase: base, strong: true })
  })
})
