import { describe, it, expect } from 'vitest'
import { poolLabel, KNOWN_POOLS, POOL_LABEL } from './pools'

describe('poolLabel', () => {
  it('maps known pool keys to display labels', () => {
    expect(poolLabel('venture_pool')).toBe('Venture Pool')
    expect(poolLabel('dept_pool_marketing')).toBe('Marketing')
    expect(poolLabel('invoice_payout_pool')).toBe('Invoice Payout Pool')
    expect(poolLabel('operating_fund')).toBe('Operating Fund')
  })
  it('falls back to a humanised version of an unknown key', () => {
    expect(poolLabel('something_new')).toBe('Something New')
  })
  it('KNOWN_POOLS lists every key in POOL_LABEL, ordered', () => {
    expect(KNOWN_POOLS.every((k) => k in POOL_LABEL)).toBe(true)
    expect(KNOWN_POOLS[0]).toBe('venture_pool')
  })
})
