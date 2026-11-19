import { describe, expect, it } from 'vitest'
import { byBrand, isOutletIdList, outletScopeWords, personOutletsFromJson, sameOutletTicks, toggleOutlet } from './lead-outlet-ticks'

const A = '00000000-0000-4000-8000-000000000001'
const B = '00000000-0000-4000-8000-000000000002'
const C = '00000000-0000-4000-8000-000000000003'
const json = {
  outlets: [
    { id: A, name: 'Kelana Jaya', brandId: 'b1', brand: '2990s' },
    { id: B, name: 'Puchong', brandId: 'b1', brand: '2990s' },
    { id: C, name: 'Taman Maluri', brandId: 'b2', brand: 'Carress' },
    { id: 'not-a-uuid', name: 'x', brandId: 'b2', brand: 'Carress' },
  ],
  ticked: [B, 'gone', A],
}

// 2026-11-19: a person's Lead View outlets, ticked in People › Permissions (mig 20261119200000).
describe('Lead View outlets per person', () => {
  it('reads the window: live outlets, ticks among them only, sorted', () => {
    const p = personOutletsFromJson(json)
    expect(p.outlets.map(o => o.id)).toEqual([A, B, C])
    expect(p.ticked).toEqual([A, B])
    expect(personOutletsFromJson(null)).toEqual({ outlets: [], ticked: [] })
  })
  it('groups by brand in the order given', () => {
    expect(byBrand(personOutletsFromJson(json).outlets).map(g => [g.brand, g.outlets.length])).toEqual([['2990s', 2], ['Carress', 1]])
  })
  it('a pill toggles; none ticked is every outlet', () => {
    expect(toggleOutlet([], A)).toEqual([A])
    expect(toggleOutlet([A, B], A)).toEqual([B])
    const p = personOutletsFromJson(json)
    expect(outletScopeWords(p, [])).toBe('All outlets')
    expect(outletScopeWords(p, [C])).toBe('Only Taman Maluri')
  })
  it('compares and checks lists as the Server Action takes them', () => {
    expect(sameOutletTicks([B, A], [A, B])).toBe(true)
    expect(sameOutletTicks([A], [A, B])).toBe(false)
    expect([isOutletIdList([A, B]), isOutletIdList([A, A]), isOutletIdList(['x']), isOutletIdList('x')]).toEqual([true, false, false, false])
  })
})
