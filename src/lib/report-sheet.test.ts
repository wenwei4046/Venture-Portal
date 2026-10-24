import { describe, expect, it } from 'vitest'
import type { MatrixRow } from './monthly-matrix'
import type { ReportBlock } from './gl-report-blocks'
import type { AccountNode, ReportSection } from './gl-reports'
import { sheetFromBlocks, sheetFromMatrix, sideTitle } from './report-sheet'

// 2026-10-10 — the reports' table per the user's Claude Design handoff
// (rptSection): a blue block title, the block's groups and items, a Subtotal
// under an open group, a tinted "Total …" row, the net rows. These turn the
// reports' own rows into that shape; the figures are untouched.

const acc = (key: string, depth: number, values: number[], extra: Partial<MatrixRow> = {}): MatrixRow => ({
  key, label: key, code: key, depth, kind: 'account', values, ...extra,
})
const sub = (key: string, label: string, values: number[], extra: Partial<MatrixRow> = {}): MatrixRow => ({
  key, label, depth: 0, kind: 'subtotal', values, ...extra,
})
const shape = (rows: ReturnType<typeof sheetFromMatrix>) => rows.map((r) => `${r.kind}:${r.depth}:${r.label}`)

describe('sideTitle', () => {
  it('reads the block a total closes', () => {
    expect(sideTitle('流入合计 · Total money in')).toBe('Money in')
    expect(sideTitle('Total Expenses')).toBe('Expenses')
    expect(sideTitle('Net change in cash')).toBeNull()
  })
})

describe('the month-by-month rows', () => {
  it('heads each P&L category with its title and closes it on "Total …"', () => {
    const rows = sheetFromMatrix([
      acc('4000', 1, [10, 10], { isParent: true }),
      acc('4010', 2, [10, 10]),
      sub('cat:revenue', 'Revenue', [10, 10], { tone: 'auto' }),
      acc('5000', 1, [-4, -4]),
      sub('cat:cost', 'Cost of Sales', [-4, -4]),
      sub('GROSS_PROFIT', 'Gross Profit', [6, 6], { emphasis: 'strong' }),
      sub('NET_INCOME', 'Net Income / (Loss)', [6, 6], { emphasis: 'strong' }),
    ])
    expect(shape(rows)).toEqual([
      'title:0:Revenue',
      'account:1:4000',
      'account:2:4010',
      'total:0:Total Revenue',
      'title:0:Cost of Sales',
      'account:1:5000',
      'total:0:Total Cost of Sales',
      'total:0:Gross Profit',
      'total:0:Net Income / (Loss)',
    ])
    expect(rows[1]).toMatchObject({ isParent: true, code: '4000', values: [10, 10] })
    expect(rows[3].values).toEqual([10, 10])
  })

  it('keeps Gross Profit a total line even when the next category’s accounts follow it', () => {
    const rows = sheetFromMatrix([
      acc('5000', 1, [-4]),
      sub('cat:cost', 'Cost of Sales', [-4]),
      sub('GROSS_PROFIT', 'Gross Profit', [6], { emphasis: 'strong' }),
      acc('6000', 1, [-1]),
      sub('cat:expense', 'Expenses', [-1]),
    ])
    expect(shape(rows)).toEqual([
      'title:0:Cost of Sales',
      'account:1:5000',
      'total:0:Total Cost of Sales',
      'total:0:Gross Profit',
      'title:0:Expenses',
      'account:1:6000',
      'total:0:Total Expenses',
    ])
  })

  it('keeps a category with nothing in it as its total alone', () => {
    const rows = sheetFromMatrix([sub('cat:other_income', 'Other Income', [0, 0]), acc('6000', 1, [-1, -1]), sub('cat:expense', 'Expenses', [-1, -1])])
    expect(shape(rows)).toEqual(['total:0:Other Income', 'title:0:Expenses', 'account:1:6000', 'total:0:Total Expenses'])
  })

  it('makes a cash-flow category a group, its accounts the items, the side its block', () => {
    const rows = sheetFromMatrix([
      { key: 'in:ops', label: 'Operations', depth: 0, kind: 'category', isParent: true, values: [5, 5] },
      acc('in:ops:1010', 1, [5, 5]),
      { key: 'in:loan', label: 'Loans', code: '1200', depth: 0, kind: 'category', values: [3, 3] },
      sub('in:total', '流入合计 · Total money in', [8, 8], { emphasis: 'strong' }),
      acc('out:3000', 1, [-2, -2]),
      sub('out:total', '流出合计 · Total money out', [-2, -2], { emphasis: 'strong' }),
      sub('NET_CHANGE', 'Net change in cash', [6, 6], { emphasis: 'strong' }),
      sub('OPENING_CASH', 'Opening cash', [100, 100]),
      sub('CLOSING_CASH', 'Closing cash', [106, 106], { emphasis: 'strong' }),
    ])
    expect(shape(rows)).toEqual([
      'title:0:Money in',
      'account:1:Operations',
      'account:2:in:ops:1010',
      'account:1:Loans',
      'total:0:流入合计 · Total money in',
      'title:0:Money out',
      'account:1:out:3000',
      'total:0:流出合计 · Total money out',
      'total:0:Net change in cash',
      'total:0:Opening cash',
      'total:0:Closing cash',
    ])
    expect(rows[1]).toMatchObject({ isParent: true, values: [5, 5] })
    expect(rows[3]).toMatchObject({ code: '1200', isParent: undefined })
  })

  it('reads a total over its own rows (the receivables) as a block of its own', () => {
    const rows = sheetFromMatrix([
      sub('CLOSING_CASH', 'Closing cash', [106]),
      sub('AR_OUTSTANDING', '月末未收 · Outstanding', [900], { emphasis: 'strong' }),
      acc('AR_P_HC', 1, [600]),
      acc('AR_P_HM', 1, [300]),
    ])
    expect(shape(rows)).toEqual([
      'total:0:Closing cash',
      'title:0:月末未收 · Outstanding',
      'account:1:AR_P_HC',
      'account:1:AR_P_HM',
      'total:0:月末未收 · Outstanding',
    ])
    expect(rows[4].values).toEqual([900])
  })
})

const node = (code: string, name: string, current: number, previous: number, extra: Partial<AccountNode> = {}): AccountNode => ({
  code, name, current, previous, txns: [], children: [], ...extra,
})
const section = (key: string, label: string, nodes: AccountNode[], extra: Partial<ReportSection> = {}): ReportSection => ({
  key, label, nodes, current: nodes.reduce((s, n) => s + n.current, 0), previous: nodes.reduce((s, n) => s + n.previous, 0), ...extra,
})

describe('the single-month rows', () => {
  const pnl: ReportBlock[] = [
    {
      kind: 'section',
      section: section('revenue', 'Revenue', [
        node('4000', 'Service fees', 30, 20, { children: [node('4010', 'Marketing fees', 30, 20)] }),
        node('4100', 'Interest income', 10, 5, {
          txns: [{
            date: '2026-10-05', entryNo: 'HV-JV-202610-0012', description: 'Loan interest', segment: 'corporate', party: 'HOUZS Century', amount: 10,
            debit: 0, credit: 10, otherSide: '3000 · Cash & Bank - Hong Leong', refNo: null,
          }],
        }),
      ]),
    },
    { kind: 'summary', row: { label: 'Total Revenue', current: 40, previous: 25, emphasis: 'strong' } },
    { kind: 'summary', row: { label: 'Net Income / (Loss)', current: 40, previous: 25, emphasis: 'strong' } },
  ]

  it('titles a section, nests its accounts and closes on its totals', () => {
    const rows = sheetFromBlocks(pnl, false)
    expect(shape(rows)).toEqual([
      'title:0:Revenue',
      'account:1:4000 Service fees',
      'account:2:4010 Marketing fees',
      'account:1:4100 Interest income',
      'total:0:Total Revenue',
      'total:0:Net Income / (Loss)',
    ])
    expect(rows[1]).toMatchObject({ code: '4000', isParent: true, values: [30] })
    // Every total reads alike, the net rows too (the handoff's TOT row).
    expect(rows[4]).toEqual({ key: 'sum:1', label: 'Total Revenue', kind: 'total', depth: 0, values: [40] })
  })

  it('carries the month to compare beside it', () => {
    const rows = sheetFromBlocks(pnl, true)
    expect(rows[1].values).toEqual([30, 20])
    expect(rows[4].values).toEqual([40, 25])
  })

  it('keeps each account’s journal lines for the drill-down, with their debit, credit, other side and document', () => {
    const rows = sheetFromBlocks(pnl, false)
    expect(rows[3].txns).toEqual([
      {
        key: 'revenue:4100:t0', ref: 'HV-JV-202610-0012', date: '2026-10-05', text: 'Loan interest · HOUZS Century', value: 10,
        debit: 0, credit: 10, otherSide: '3000 · Cash & Bank - Hong Leong', ref2: null,
      },
    ])
  })

  it('makes a laid-out cash-flow side one block: the side as title, each category a group', () => {
    const rows = sheetFromBlocks([
      { kind: 'section', section: section('in:ops', 'Operations', [node('1010', 'Fees received', 5, 0)], { headed: true }) },
      {
        kind: 'section',
        section: section('in:loan', 'Loans Receivable', [node('1210', 'HC loan', 3, 0)], { headed: true, root: node('1200', 'Loans Receivable', 3, 0, { children: [node('1210', 'HC loan', 3, 0)] }) }),
      },
      { kind: 'summary', row: { label: '流入合计 · Total money in', current: 8, previous: 0, emphasis: 'strong' } },
      { kind: 'summary', row: { label: 'Net change in cash', current: 8, previous: 0, emphasis: 'strong' } },
    ], false)
    expect(shape(rows)).toEqual([
      'title:0:Money in',
      'account:1:Operations',
      'account:2:1010 Fees received',
      'account:1:Loans Receivable',
      'account:2:1210 HC loan',
      'total:0:流入合计 · Total money in',
      'total:0:Net change in cash',
    ])
    expect(rows[1]).toMatchObject({ isParent: true, values: [5] })
    expect(rows[3]).toMatchObject({ code: '1200', isParent: true, values: [3] })
  })
})
