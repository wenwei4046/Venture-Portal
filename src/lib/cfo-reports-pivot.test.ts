import { describe, it, expect } from 'vitest'
import { pivotCashflowByPool } from './cfo-reports-pivot'
import type { CashflowStatement } from './cfo-reports'

const stmt: CashflowStatement = {
  netChange: 300,
  openingCash: 0,
  closingCash: 300,
  sections: [
    {
      category: 'operating',
      net: 250,
      pools: [
        { pool: 'dept_pool_marketing', poolLabel: 'Marketing',
          inflowLines: [{ label: 'Billing in', amount: 200 }],
          outflowLines: [{ label: 'Ad spend', amount: 50 }], net: 150 },
        { pool: 'venture_pool', poolLabel: 'Venture Pool',
          inflowLines: [{ label: 'Loan interest', amount: 100 }],
          outflowLines: [], net: 100 },
      ],
    },
    {
      category: 'investing',
      net: 0,
      pools: [],
    },
    {
      category: 'financing',
      net: 50,
      pools: [
        { pool: 'venture_pool', poolLabel: 'Venture Pool',
          inflowLines: [{ label: 'New deposit', amount: 50 }],
          outflowLines: [], net: 50 },
      ],
    },
  ],
}

describe('pivotCashflowByPool', () => {
  it('groups every section under its pool, preserving operating→investing→financing order', () => {
    const out = pivotCashflowByPool(stmt)
    const venture = out.pools.find((p) => p.pool === 'venture_pool')!
    expect(venture.sections.map((s) => s.category)).toEqual(['operating', 'investing', 'financing'])
    expect(venture.sections[0].net).toBe(100)
    expect(venture.sections[1].inflowLines).toEqual([])
    expect(venture.sections[2].net).toBe(50)
  })

  it('excludes pools with zero activity across all sections', () => {
    const out = pivotCashflowByPool(stmt)
    expect(out.pools.map((p) => p.pool).sort()).toEqual(['dept_pool_marketing', 'venture_pool'])
  })

  it('per-pool section nets sum back to the original section nets (no double count)', () => {
    const out = pivotCashflowByPool(stmt)
    const sumByCat = (cat: string) =>
      out.pools.reduce((acc, p) => acc + (p.sections.find((s) => s.category === cat)?.net ?? 0), 0)
    expect(sumByCat('operating')).toBe(250)
    expect(sumByCat('financing')).toBe(50)
  })

  it('orders pools via comparePools (known pools first, venture before dept pools)', () => {
    const out = pivotCashflowByPool(stmt)
    expect(out.pools[0].pool).toBe('venture_pool')
  })
})
