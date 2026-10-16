import { describe, expect, it } from 'vitest'
import { formatSourcesLabel } from './voucher-detail'

type Source = Parameters<typeof formatSourcesLabel>[0][number]
const source = (pool: string, amount: number): Source => ({ pool, amount, account_code: null, account_label: null })

describe('formatSourcesLabel', () => {
  it('names each pool a voucher draws on, once (2026-10-17: a loan repayment read "Venture Pool + Venture Pool")', () => {
    expect(formatSourcesLabel([source('venture_pool', 10000), source('venture_pool', 1800)], null)).toBe('Venture Pool')
    expect(formatSourcesLabel([source('venture_pool', 10000), source('dept_pool_director', 1800), source('venture_pool', 5)], null)).toBe('Venture Pool + Director Pool')
  })

  it('falls back to the voucher’s own source pool when it has no lines', () => {
    expect(formatSourcesLabel([], 'dept_pool_marketing')).toBe('Marketing Dept Pool')
    expect(formatSourcesLabel([], null)).toBeNull()
  })
})
