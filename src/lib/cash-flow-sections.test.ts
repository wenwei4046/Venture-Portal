import { describe, it, expect } from 'vitest'
import { buildCashFlowSideSections, defaultSideLayout, OTHER_SECTION_LABEL } from './cash-flow-sections'
import type { CashFlowLeaf, CoaAccount } from './gl-reports'
import type { ReportLayout } from './report-layouts'

const ACCOUNTS: CoaAccount[] = [
  { code: '3020', name: 'Loans Receivable', type: 'asset', parent_code: null, cash_flow_category: 'investing' },
  { code: '3053', name: 'Due from The Cont', type: 'asset', parent_code: '3020', cash_flow_category: 'investing' },
  { code: '3054', name: 'Due from 2990', type: 'asset', parent_code: '3020', cash_flow_category: 'investing' },
  { code: '9085', name: 'Staff Refreshment', type: 'expense', parent_code: null, cash_flow_category: 'operating' },
  { code: '9091', name: 'Water & Electricity', type: 'expense', parent_code: null, cash_flow_category: 'operating' },
  { code: '9094', name: 'Office Rental', type: 'expense', parent_code: null, cash_flow_category: 'operating' },
]

const leaf = (code: string, current: number): CashFlowLeaf => ({ code, current, previous: 0, txns: [] })

const LEAVES = [leaf('3053', -200), leaf('3054', -60), leaf('9085', -10), leaf('9091', -30), leaf('9094', -100)]

const LAYOUT: ReportLayout = {
  categories: [
    { id: 'lending', name: '借贷与还款', accounts: ['3053', '3054'] },
    { id: 'daily', name: '日常开销', accounts: ['9085', '9091'] },
  ],
}

describe('buildCashFlowSideSections', () => {
  it('honours the layout order and names', () => {
    const s = buildCashFlowSideSections(LEAVES, ACCOUNTS, LAYOUT, 'fallback')
    expect(s.map((x) => x.label)).toEqual(['借贷与还款', '日常开销', OTHER_SECTION_LABEL])
  })

  it('rebuilds the COA tree INSIDE each section', () => {
    const s = buildCashFlowSideSections(LEAVES, ACCOUNTS, LAYOUT, 'fallback')
    const lending = s[0]
    expect(lending.nodes.map((n) => n.code)).toEqual(['3020']) // header, not the leaves
    expect(lending.nodes[0].children.map((c) => c.code)).toEqual(['3053', '3054'])
    expect(lending.current).toBe(-260)
  })

  it('sweeps unassigned accounts into 其他 — nothing is dropped', () => {
    const s = buildCashFlowSideSections(LEAVES, ACCOUNTS, LAYOUT, 'fallback')
    const other = s.find((x) => x.label === OTHER_SECTION_LABEL)!
    expect(other.nodes.map((n) => n.code)).toEqual(['9094'])
    const grand = s.reduce((sum, x) => sum + x.current, 0)
    expect(Math.round(grand * 100) / 100).toBe(-400) // = every leaf
  })

  it('no layout → one section holding everything', () => {
    const s = buildCashFlowSideSections(LEAVES, ACCOUNTS, null, '现金流出')
    expect(s).toHaveLength(1)
    expect(s[0].label).toBe('现金流出')
    expect(s[0].current).toBe(-400)
  })

  it('ignores codes that are not on this side', () => {
    const stale: ReportLayout = { categories: [{ id: 'x', name: 'Stale', accounts: ['9999'] }] }
    const s = buildCashFlowSideSections(LEAVES, ACCOUNTS, stale, 'fallback')
    expect(s.map((x) => x.label)).toEqual([OTHER_SECTION_LABEL]) // empty category dropped
    expect(s[0].current).toBe(-400)
  })
})

describe('defaultSideLayout', () => {
  it('seeds one section per top-level COA parent', () => {
    const l = defaultSideLayout(LEAVES, ACCOUNTS)
    expect(l.categories.map((c) => c.name)).toEqual([
      'Loans Receivable', 'Staff Refreshment', 'Water & Electricity', 'Office Rental',
    ])
    expect(l.categories[0].accounts).toEqual(['3053', '3054'])
  })
})
