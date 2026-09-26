import { describe, expect, it } from 'vitest'
import { skeletonVariantFor } from './route-skeleton'

const UUID = '403255f0-02c9-4aad-b66c-50d91d959a78'

describe('skeletonVariantFor', () => {
  it('draws a ledger for lists and reports', () => {
    expect(skeletonVariantFor('/fund-in')).toBe('ledger')
    expect(skeletonVariantFor('/reports/trial-balance')).toBe('ledger')
    expect(skeletonVariantFor('/revenue/fair')).toBe('ledger')
    // A month is a period, not a record id.
    expect(skeletonVariantFor('/revenue/fair/2026-08-01')).toBe('ledger')
    expect(skeletonVariantFor('/revenue/fair/2026-08-01/orders')).toBe('ledger')
    expect(skeletonVariantFor('/dept-pool/marketing')).toBe('ledger')
  })

  it('draws a record for any path that carries an id', () => {
    expect(skeletonVariantFor(`/fund-in/${UUID}`)).toBe('detail')
    expect(skeletonVariantFor(`/revenue/fair/2026-08-01/orders/${UUID}`)).toBe('detail')
    expect(skeletonVariantFor(`/statements/${UUID}/print`)).toBe('detail')
    expect(skeletonVariantFor('/approvals/42')).toBe('detail')
  })

  it('draws a form for new, edit, import and invite', () => {
    expect(skeletonVariantFor('/fund-in/new')).toBe('form')
    expect(skeletonVariantFor(`/payments/${UUID}/edit`)).toBe('form')
    expect(skeletonVariantFor('/team/people/import')).toBe('form')
    expect(skeletonVariantFor('/team/people/invite')).toBe('form')
  })

  it('draws a board for the two hierarchy charts', () => {
    expect(skeletonVariantFor('/team/hierarchy')).toBe('board')
    expect(skeletonVariantFor('/revenue/fair/hierarchy')).toBe('board')
  })

  it('ignores the query, the hash and a trailing slash', () => {
    expect(skeletonVariantFor('/team/hierarchy?tab=levels')).toBe('board')
    expect(skeletonVariantFor('/fund-in/new/#top')).toBe('form')
    expect(skeletonVariantFor('/')).toBe('ledger')
  })
})
