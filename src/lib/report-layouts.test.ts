import { describe, it, expect } from 'vitest'
import { ancestorChain, placeLeavesInLayout } from './report-layouts'

// COA: 3020 ─┬─ 3051 / 3052 ; 4000 ─┬─ 4100 ─┬─ 4051 / 4052
//                                   └─ 4200 ─── 4054
const PARENT: Record<string, string | null> = {
  '3020': null, '3051': '3020', '3052': '3020',
  '4000': null, '4100': '4000', '4200': '4000', '4051': '4100', '4052': '4100', '4054': '4200',
  '9091': null,
}
const anc = (code: string) => ancestorChain(code, (c) => PARENT[c])

describe('placeLeavesInLayout', () => {
  const leaves = ['3051', '3052', '4051', '4052', '4054', '9091']

  it('a listed PARENT claims every leaf beneath it', () => {
    const p = placeLeavesInLayout(leaves, [{ id: 'loans', accounts: ['3020'] }, { id: 'fund', accounts: ['4000'] }], anc)
    expect(p.byCategory.get('loans')).toEqual(['3051', '3052'])
    expect(p.byCategory.get('fund')).toEqual(['4051', '4052', '4054'])
    expect(p.leftovers).toEqual(['9091'])
  })

  it('an explicit leaf beats its parent, and the nearest listed ancestor beats a farther one', () => {
    const p = placeLeavesInLayout(
      leaves,
      [
        { id: 'fund', accounts: ['4000'] },
        { id: 'director', accounts: ['4200'] }, // nearer to 4054 than 4000
        { id: 'special', accounts: ['4052'] }, // explicit leaf
      ],
      anc,
    )
    expect(p.byCategory.get('fund')).toEqual(['4051'])
    expect(p.byCategory.get('director')).toEqual(['4054'])
    expect(p.byCategory.get('special')).toEqual(['4052'])
  })

  it('keeps category order and leaf order; empty categories stay (empty)', () => {
    const p = placeLeavesInLayout(leaves, [{ id: 'b', accounts: ['9091'] }, { id: 'a', accounts: ['3052', '3051'] }, { id: 'none', accounts: [] }], anc)
    expect([...p.byCategory.keys()]).toEqual(['b', 'a', 'none'])
    expect(p.byCategory.get('a')).toEqual(['3051', '3052']) // leaf order as given, not listing order
    expect(p.byCategory.get('none')).toEqual([])
  })

  it('first category to list a code owns it (duplicates) — but an explicit leaf still beats a parent', () => {
    const p = placeLeavesInLayout(leaves, [{ id: 'x', accounts: ['3020'] }, { id: 'y', accounts: ['3020', '3051'] }], anc)
    expect(p.byCategory.get('x')).toEqual(['3052'])
    expect(p.byCategory.get('y')).toEqual(['3051'])
  })

  it('tolerates a missing accounts array', () => {
    const p = placeLeavesInLayout(['3051'], [{ id: 'x' }], anc)
    expect(p.leftovers).toEqual(['3051'])
  })
})

describe('ancestorChain', () => {
  it('walks nearest-first and stops on a cycle', () => {
    expect(anc('4054')).toEqual(['4200', '4000'])
    expect(anc('9091')).toEqual([])
    const loop = ancestorChain('a', (c) => ({ a: 'b', b: 'a' })[c])
    expect(loop).toEqual(['b'])
  })
})
