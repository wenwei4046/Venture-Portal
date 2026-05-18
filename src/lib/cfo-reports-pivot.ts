// Cash Flow pivot — transposes the section-first CashflowStatement
// (Operating/Investing/Financing → pool) into a pool-first view
// (pool → Operating/Investing/Financing). Used by the department-segmented
// tab navigation on the Cash Flow report, where one department/pool is shown
// per tab.
//
// Every pool block lists ALL THREE section slots in the fixed
// operating → investing → financing order; sections where the pool had no
// activity are synthesized as empty (no lines, net 0). Pools with zero
// activity across every section never enter the result at all.

import type { CashflowStatement, Line } from './cfo-reports'
import type { CashFlowCategory } from './coa'
import { comparePools } from './pools'

const SECTION_ORDER: CashFlowCategory[] = ['operating', 'investing', 'financing']

export interface CashflowPoolSection {
  category: CashFlowCategory
  inflowLines: Line[]
  outflowLines: Line[]
  net: number
}

export interface CashflowByPoolBlock {
  pool: string
  poolLabel: string
  sections: CashflowPoolSection[]
  net: number
}

export interface CashflowByPool {
  pools: CashflowByPoolBlock[]
  netChange: number
}

export function pivotCashflowByPool(stmt: CashflowStatement): CashflowByPool {
  // Group section data by pool. A pool only enters this map if it appeared in
  // at least one section, so the "exclude zero-activity pools" requirement is
  // satisfied naturally.
  const byPool = new Map<
    string,
    { poolLabel: string; sections: Map<CashFlowCategory, CashflowPoolSection> }
  >()

  for (const section of stmt.sections) {
    for (const pb of section.pools) {
      let entry = byPool.get(pb.pool)
      if (!entry) {
        entry = { poolLabel: pb.poolLabel, sections: new Map() }
        byPool.set(pb.pool, entry)
      }
      entry.sections.set(section.category, {
        category: section.category,
        inflowLines: pb.inflowLines,
        outflowLines: pb.outflowLines,
        net: pb.net,
      })
    }
  }

  const pools: CashflowByPoolBlock[] = [...byPool.entries()]
    .map(([pool, e]) => {
      // Synthesize ALL three section slots in fixed order; empty where absent
      // so every pool block exposes operating→investing→financing.
      const sections: CashflowPoolSection[] = SECTION_ORDER.map(
        (cat) =>
          e.sections.get(cat) ?? {
            category: cat,
            inflowLines: [],
            outflowLines: [],
            net: 0,
          },
      )
      return {
        pool,
        poolLabel: e.poolLabel,
        sections,
        net: sections.reduce((a, s) => a + s.net, 0),
      }
    })
    .sort((a, b) => comparePools(a.pool, b.pool))

  return { pools, netChange: stmt.netChange }
}
