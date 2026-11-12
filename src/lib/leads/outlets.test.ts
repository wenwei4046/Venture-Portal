import { describe, expect, it } from 'vitest'
import { inboxOutletRows } from './outlets'

// The Inbox's Filters › OUTLET (2026-11-11 — the user: "筛选brand, outlet 的方式再容易看懂").
describe('inboxOutletRows', () => {
  const brands = [{ id: 'b1', name: '2990s' }, { id: 'b2', name: 'Carress' }, { id: 'b3', name: '2990s mini' }]
  const outlets = [
    { id: 'o1', brandId: 'b1', name: 'Kelana Jaya' },
    { id: 'o2', brandId: 'b2', name: 'Puchong' },
    { id: 'o3', brandId: 'b1', name: 'Cheras' },
  ]
  const draw = (brand: string) => inboxOutletRows(outlets, brands, brand).map(r => (r.kind === 'head' ? `# ${r.label}` : r.label))

  it('All brands: each brand’s outlets under its name, in the brands’ order, then No outlet', () => {
    expect(draw('all')).toEqual(['# 2990S', 'Kelana Jaya', 'Cheras', '# CARRESS', 'Puchong', 'No outlet'])
  })
  it('one brand picked: only its outlets', () => {
    expect(draw('b2')).toEqual(['# CARRESS', 'Puchong', 'No outlet'])
  })
  it('a brand with no outlets: only No outlet', () => {
    expect(draw('b3')).toEqual(['No outlet'])
  })
})
