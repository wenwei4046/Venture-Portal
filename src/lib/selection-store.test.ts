import { describe, it, expect, beforeEach } from 'vitest'
import {
  readSelection,
  writeSelection,
  dropSelectionsForPath,
  resetSelections,
} from './selection-store'
import { navRootPaths, emptyNavData } from '@/components/layout/nav-config'

// The constant destinations. `navRootPaths` also folds in the Revenue
// sub-departments, which are database rows — covered separately below.
const roots = navRootPaths(emptyNavData)

describe('selection-store', () => {
  beforeEach(() => resetSelections())

  it('reads back what was written', () => {
    writeSelection('/approvals', new Set(['a', 'b']))
    expect([...readSelection('/approvals')].sort()).toEqual(['a', 'b'])
  })

  it('hands back a copy, not the stored set', () => {
    writeSelection('/approvals', new Set(['a']))
    readSelection('/approvals').add('b')
    expect([...readSelection('/approvals')]).toEqual(['a'])
  })

  it('drops the entry when written empty', () => {
    writeSelection('/approvals', new Set(['a']))
    writeSelection('/approvals', new Set())
    expect(readSelection('/approvals').size).toBe(0)
  })

  it('is empty for a scope nobody wrote', () => {
    expect(readSelection('/payments').size).toBe(0)
  })
})

describe('dropSelectionsForPath', () => {
  beforeEach(() => {
    resetSelections()
    writeSelection('/approvals', new Set(['a', 'b']))
  })

  const surviving = () => [...readSelection('/approvals')].sort()

  it('keeps the selection on the list itself', () => {
    dropSelectionsForPath('/approvals', roots)
    expect(surviving()).toEqual(['a', 'b'])
  })

  it('keeps it while reading one row detail page — the reported bug', () => {
    dropSelectionsForPath('/approvals/some-request-id', roots)
    expect(surviving()).toEqual(['a', 'b'])
  })

  it('keeps it down a drill chain that leaves the module', () => {
    // Approval detail links out to the loan it authorises.
    dropSelectionsForPath('/approvals/req-1', roots)
    dropSelectionsForPath('/fund-out/loan-1', roots)
    expect(surviving()).toEqual(['a', 'b'])
  })

  it('drops it on a tab switch', () => {
    dropSelectionsForPath('/payments', roots)
    expect(surviving()).toEqual([])
  })

  it('drops it on a nested nav destination too', () => {
    dropSelectionsForPath('/hr-costing/payroll', roots)
    expect(surviving()).toEqual([])
  })

  it('does not touch a sibling scope that is still in view', () => {
    writeSelection('/payments', new Set(['p1']))
    dropSelectionsForPath('/payments', roots)
    expect(surviving()).toEqual([])
    expect([...readSelection('/payments')]).toEqual(['p1'])
  })

  it('is not fooled by a prefix that is not a path segment', () => {
    writeSelection('/receipt', new Set(['r1']))
    dropSelectionsForPath('/receipts', roots)
    expect([...readSelection('/receipt')]).toEqual([])
  })
})

describe('navRootPaths', () => {
  it('holds the portal tabs the drop rule keys off', () => {
    for (const path of [
      '/dashboard',
      '/approvals',
      '/payments',
      '/receipts',
      '/fund-out',
      '/hr-costing/payroll',
      '/reports/ledger',
    ]) {
      expect(roots.has(path)).toBe(true)
    }
  })

  it('strips the query so ?tab= links land as one destination', () => {
    expect(roots.has('/settings')).toBe(true)
    expect([...roots].some((p) => p.includes('?'))).toBe(false)
  })

  it('holds no detail path — those are drill-downs, never tabs', () => {
    expect(roots.has('/approvals/req-1')).toBe(false)
    expect(roots.has('/fund-out/loan-1')).toBe(false)
  })

  it('holds each Revenue sub-department — they are tabs, not drill-downs', () => {
    const withSubs = navRootPaths({
      revenueSubDepts: [
        { slug: 'fair', name: 'Fair' },
        { slug: 'ir', name: 'IR' },
      ],
    })
    expect(withSubs.has('/revenue/fair')).toBe(true)
    expect(withSubs.has('/revenue/ir')).toBe(true)
    // A month under one is a drill-down, so a selection survives opening it.
    expect(withSubs.has('/revenue/fair/2026-08-01')).toBe(false)
  })

  it('leaves the sub-departments out when none are passed', () => {
    expect(roots.has('/revenue/fair')).toBe(false)
    // The department-wide child is a constant, so it is always there.
    expect(roots.has('/revenue/products')).toBe(true)
  })
})
