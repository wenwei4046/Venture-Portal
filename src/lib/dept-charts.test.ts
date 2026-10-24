import { describe, expect, it } from 'vitest'
import type { MonthlyCashFlowSides } from './cash-flow-custom'
import type { MonthlyPnlAccounts } from './pnl-custom'
import { OTHERS_COLOR, cashFlowCharts, donutSlices, niceScale, pnlCharts, rankRows, shareOf, shortMoney, type DeptChartSide } from './dept-charts'

// 2026-10-25 — a department's charts read the statement's own matrix, cut to the period as the table is: money in
// by source, money out by use (as positive), the net; palette A for the six largest, grey past them.

// Accumulated, then Oct … Aug (latest first), as the builders lay them out.
const COLUMNS = [
  { key: 'acc', label: 'Accumulated' },
  { key: '2026-10', label: 'Oct 2026' },
  { key: '2026-09', label: 'Sep 2026' },
  { key: '2026-08', label: 'Aug 2026' },
]
const side = (code: string, name: string, values: number[]) => ({ code, name, values, ancestry: [] })

const CASH: MonthlyCashFlowSides = {
  columns: COLUMNS,
  inflow: [side('3033', 'AR - Carres', [600, 300, 200, 100]), side('3034', 'AR - Dream Crafter', [90, 0, 90, 0])],
  outflow: [side('4070', 'Accrual - Salary', [-450, -150, -150, -150]), side('9094', 'Office Rental', [-30, -10, -10, -10])],
  inflowTotalByCol: [690, 300, 290, 100],
  outflowTotalByCol: [-480, -160, -160, -160],
  openingByCol: [1000, 1270, 1140, 1000],
  closingByCol: [1210, 1410, 1270, 1140],
  netChangeByCol: [210, 140, 130, -60],
}

describe('the Cash Flow’s charts', () => {
  it('lists the months oldest first, each side’s Total and months, money out as positive', () => {
    const c = cashFlowCharts(CASH, '2026-01')
    expect(c.months).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(c.in).toMatchObject({ total: 690, months: [100, 290, 300] })
    expect(c.out).toMatchObject({ total: 480, months: [160, 160, 160] })
    expect(c.net).toEqual({ total: 210, months: [-60, 130, 140] })
    expect(c.out.pieces.map((p) => [p.name, p.total, p.months])).toEqual([
      ['Accrual - Salary', 450, [150, 150, 150]],
      ['Office Rental', 30, [10, 10, 10]],
    ])
  })

  it('cuts to From as the statement does — the Total what the months kept add up to', () => {
    const c = cashFlowCharts(CASH, '2026-09')
    expect(c.months).toEqual(['2026-09', '2026-10'])
    expect(c.in.total).toBe(590)
    expect(c.in.pieces.find((p) => p.code === '3034')).toMatchObject({ total: 90, months: [90, 0] })
    expect(c.net.total).toBe(270)
  })

  it('colours each side’s largest in its own colour, the sides never alike', () => {
    const c = cashFlowCharts(CASH, '2026-01')
    expect(c.in.pieces.map((p) => p.color)).toEqual(['#3f7a64', '#5b7ba6'])
    expect(c.out.pieces.map((p) => p.color)).toEqual(['#e99a53', '#2f6e7c'])
  })

  it('greys every account past the six largest', () => {
    const many = Array.from({ length: 8 }, (_, i) => side(`90${i}`, `Cost ${i}`, [-(80 - i), -(80 - i), 0, 0]))
    const c = cashFlowCharts({ ...CASH, outflow: many }, '2026-01')
    expect(c.out.pieces.slice(6).map((p) => p.color)).toEqual([OTHERS_COLOR, OTHERS_COLOR])
  })
})

describe('the P&L’s charts', () => {
  const PNL: MonthlyPnlAccounts = {
    columns: COLUMNS,
    accounts: [
      { code: '5012', name: 'Revenue - Lead Gen', defaultCategory: 'revenue', values: [900, 300, 300, 300], ancestry: [] },
      { code: '5050', name: 'Salary Income', defaultCategory: 'other_income', values: [60, 20, 20, 20], ancestry: [] },
      { code: '9030', name: 'Salary Expense', defaultCategory: 'expense', values: [-600, -200, -200, -200], ancestry: [] },
    ],
    salesByColumn: [900, 300, 300, 300],
  }

  it('takes revenue and other income in, cost and expenses out, and the net profit the statement’s', () => {
    const c = pnlCharts(PNL, [360, 120, 120, 120], '2026-01')
    expect(c.in.pieces.map((p) => p.code)).toEqual(['5012', '5050'])
    expect(c.in.total).toBe(960)
    expect(c.out).toMatchObject({ total: 600, months: [200, 200, 200] })
    expect(c.net.total).toBe(360)
  })
})

const SIDE: DeptChartSide = {
  total: 1000,
  months: [1000],
  pieces: [
    { code: 'a', name: 'A', total: 600, months: [600], color: '#1' },
    { code: 'b', name: 'B', total: 250, months: [250], color: '#2' },
    { code: 'c', name: 'C', total: 100, months: [100], color: '#3' },
    { code: 'd', name: 'D', total: 30, months: [30], color: '#4' },
    { code: 'e', name: 'E', total: 20, months: [20], color: '#5' },
  ],
}

describe('a donut', () => {
  it('draws the five largest of at least 4% in their colours, the rest one grey Others with its members', () => {
    expect(donutSlices(SIDE, -1)).toEqual([
      { code: 'a', name: 'A', value: 600, color: '#1' },
      { code: 'b', name: 'B', value: 250, color: '#2' },
      { code: 'c', name: 'C', value: 100, color: '#3' },
      {
        code: 'others',
        name: 'Others (2)',
        value: 50,
        color: OTHERS_COLOR,
        members: [
          { name: 'D', value: 30 },
          { name: 'E', value: 20 },
        ],
      },
    ])
  })

  it('keeps a lone small piece’s own name, in grey', () => {
    const s = { ...SIDE, pieces: SIDE.pieces.slice(0, 4) }
    expect(donutSlices(s, 0).at(-1)).toEqual({ code: 'd', name: 'D', value: 30, color: OTHERS_COLOR })
  })

  it('leaves out what did not move its way', () => {
    const s = { ...SIDE, pieces: [{ code: 'x', name: 'Discount', total: -50, months: [-50], color: '#9' }] }
    expect(donutSlices(s, -1)).toEqual([])
  })
})

describe('the ranked bars', () => {
  it('rank by the month picked, the rest past `keep` in Others, the shares of the whole', () => {
    const { rows, total } = rankRows(SIDE, 0, 3)
    expect(rows.map((r) => [r.name, r.value])).toEqual([
      ['A', 600],
      ['B', 250],
      ['C', 100],
      ['Others (2)', 50],
    ])
    expect(rows[3]).toMatchObject({ color: OTHERS_COLOR, total: 50, members: [{ name: 'D', value: 30 }, { name: 'E', value: 20 }] })
    expect(total).toBe(1000)
  })
})

describe('the figures', () => {
  it('rounds an axis to steps of 1, 2, 2.5 or 5', () => {
    expect(niceScale(0, 950).ticks).toEqual([0, 250, 500, 750, 1000])
    expect(niceScale(-60, 300).ticks).toEqual([-100, 0, 100, 200, 300])
  })
  it('shortens a chart’s money and gives a share to one place', () => {
    expect(shortMoney(1234567)).toBe('1.23m')
    expect(shortMoney(45250)).toBe('45.3k')
    expect(shortMoney(-950)).toBe('-950')
    expect(shortMoney(-0.2)).toBe('0')
    expect(shareOf(250, 1000)).toBe('25.0%')
    expect(shareOf(-0.01, 100000)).toBe('0.0%')
    expect(shareOf(5, 0)).toBe('')
  })
})
