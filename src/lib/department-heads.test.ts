import { describe, it, expect } from 'vitest'
import { headLines, headsLabel, layoutParent, reportsToHeads, sortHeads } from './department-heads'

const peter = { id: 'peter', name: 'PETER' }
const kris = { id: 'kris', name: 'KRIS' }

describe('sortHeads / headsLabel', () => {
  it('names the heads A→Z however they were stored', () => {
    expect(sortHeads([peter, kris]).map(h => h.id)).toEqual(['kris', 'peter'])
    expect(headsLabel([peter, kris])).toBe('KRIS · PETER')
    expect(headsLabel(['PETER', 'KRIS'])).toBe('KRIS · PETER')
  })

  it('is empty when nobody heads the sub-department', () => {
    expect(headsLabel([])).toBe('')
  })
})

describe('reportsToHeads / layoutParent', () => {
  it('sends the top of a tree to its heads, and the first head becomes the layout parent', () => {
    const leader = { id: 'stanley', reportsTo: null, leadIds: ['kris', 'peter'] }
    expect(reportsToHeads(leader)).toBe(true)
    expect(layoutParent(leader)).toBe('kris')
  })

  it('keeps a real manager as the parent — the derived line is only for the top of a tree', () => {
    const adrian = { id: 'adrian', reportsTo: 'stanley', leadIds: ['kris', 'peter'] }
    expect(reportsToHeads(adrian)).toBe(false)
    expect(layoutParent(adrian)).toBe('stanley')
  })

  it('leaves somebody with no heads reporting to nobody', () => {
    // A head themselves, until the CEO layer exists; or anybody outside a
    // commission department.
    const head = { id: 'peter', reportsTo: null, leadIds: [] }
    expect(reportsToHeads(head)).toBe(false)
    expect(layoutParent(head)).toBeNull()
  })
})

describe('headLines', () => {
  it('draws one line per head to every top-of-tree person, and none to anybody with a manager', () => {
    const lines = headLines([
      { id: 'stanley', reportsTo: null, leadIds: ['kris', 'peter'] },
      { id: 'adrian', reportsTo: 'stanley', leadIds: ['kris', 'peter'] },
      { id: 'weng-gi', reportsTo: null, leadIds: ['kris', 'peter'] },
      { id: 'peter', reportsTo: null, leadIds: [] },
    ])
    expect(lines).toEqual([
      { headId: 'kris', staffId: 'stanley' },
      { headId: 'peter', staffId: 'stanley' },
      { headId: 'kris', staffId: 'weng-gi' },
      { headId: 'peter', staffId: 'weng-gi' },
    ])
  })
})
