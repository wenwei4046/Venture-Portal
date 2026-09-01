import { describe, it, expect, beforeEach } from 'vitest'
import {
  readSelection,
  writeSelection,
  dropSelectionsForPath,
  resetSelections,
} from './selection-store'
import { navRootPaths } from '@/components/layout/nav-config'

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
    dropSelectionsForPath('/approvals', navRootPaths)
    expect(surviving()).toEqual(['a', 'b'])
  })

  it('keeps it while reading one row detail page — the reported bug', () => {
    dropSelectionsForPath('/approvals/some-request-id', navRootPaths)
    expect(surviving()).toEqual(['a', 'b'])
  })

  it('keeps it down a drill chain that leaves the module', () => {
    // Approval detail links out to the loan it authorises.
    dropSelectionsForPath('/approvals/req-1', navRootPaths)
    dropSelectionsForPath('/fund-out/loan-1', navRootPaths)
    expect(surviving()).toEqual(['a', 'b'])
  })

  it('drops it on a tab switch', () => {
    dropSelectionsForPath('/payments', navRootPaths)
    expect(surviving()).toEqual([])
  })

  it('drops it on a nested nav destination too', () => {
    dropSelectionsForPath('/hr-costing/payroll', navRootPaths)
    expect(surviving()).toEqual([])
  })

  it('does not touch a sibling scope that is still in view', () => {
    writeSelection('/payments', new Set(['p1']))
    dropSelectionsForPath('/payments', navRootPaths)
    expect(surviving()).toEqual([])
    expect([...readSelection('/payments')]).toEqual(['p1'])
  })

  it('is not fooled by a prefix that is not a path segment', () => {
    writeSelection('/receipt', new Set(['r1']))
    dropSelectionsForPath('/receipts', navRootPaths)
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
      expect(navRootPaths.has(path)).toBe(true)
    }
  })

  it('strips the query so ?tab= links land as one destination', () => {
    expect(navRootPaths.has('/settings')).toBe(true)
    expect([...navRootPaths].some((p) => p.includes('?'))).toBe(false)
  })

  it('holds no detail path — those are drill-downs, never tabs', () => {
    expect(navRootPaths.has('/approvals/req-1')).toBe(false)
    expect(navRootPaths.has('/fund-out/loan-1')).toBe(false)
  })
})
