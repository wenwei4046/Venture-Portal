import { describe, it, expect } from 'vitest'
import { seatHeightCosts, resolveCost, categoryCounts, filterSkus, type SkuLike } from './sku-master'

const sku = (over: Partial<SkuLike> = {}): SkuLike => ({
  item_code: '8030-1A(LHF)',
  description: 'SOFA 8030 1A LHF',
  category: 'SOFA',
  size_display: null,
  brand_code: 'ZANOTTI',
  base_model: '8030',
  module_code: '1A(LHF)',
  cost_price: null,
  base_price: null,
  price_1: null,
  sell_price: 8338,
  seat_height_costs: null,
  active: true,
  ...over,
})

describe('seatHeightCosts', () => {
  it('keeps priced entries and their tier', () => {
    expect(seatHeightCosts([{ height: '30', tier: 'PRICE_2', price: 1650 }]))
      .toEqual([{ height: '30', tier: 'PRICE_2', price: 1650 }])
  })

  it('drops a zero-priced height — zero is not a cost', () => {
    expect(seatHeightCosts([{ height: '30', tier: null, price: 0 }])).toEqual([])
  })

  it('is empty for anything that is not an array', () => {
    expect(seatHeightCosts(null)).toEqual([])
    expect(seatHeightCosts({ '30': 1650 })).toEqual([])
  })
})

describe('resolveCost', () => {
  it('prefers the ERP cost field', () => {
    expect(resolveCost(sku({ cost_price: 1650, base_price: 900 })))
      .toMatchObject({ cost: 1650, field: 'cost_price' })
  })

  it('falls to the sofa seat-height grid, taking the cheapest priced height', () => {
    const r = resolveCost(sku({
      seat_height_costs: [
        { height: '30', tier: 'PRICE_2', price: 1650 },
        { height: '24', tier: 'PRICE_2', price: 1500 },
      ],
    }))
    expect(r).toMatchObject({ cost: 1500, field: 'seat_height', seatHeights: 2 })
  })

  it('then base_price ("PRICE 2"), then price_1 ("PRICE 1")', () => {
    expect(resolveCost(sku({ base_price: 900 }))).toMatchObject({ cost: 900, field: 'base_price' })
    expect(resolveCost(sku({ price_1: 750 }))).toMatchObject({ cost: 750, field: 'price_1' })
  })

  it('NEVER uses the selling price — that would read as a 0% margin', () => {
    expect(resolveCost(sku({ sell_price: 8338 }))).toMatchObject({ cost: null, field: null })
  })

  it('treats a zero as unpriced, not as free', () => {
    // This is the whole defect the mirror replaces: a 0 recorded as a real cost
    // makes a bill's margin read far too high and the penalty never fire.
    expect(resolveCost(sku({ cost_price: 0, base_price: 0, price_1: 0 })))
      .toMatchObject({ cost: null, field: null })
  })

  it('is null for a sofa module the ERP never priced — the live shape', () => {
    // 8030-1A(LHF) really does arrive with PRICE 1 and PRICE 2 both blank.
    expect(resolveCost(sku())).toMatchObject({ cost: null, field: null })
  })
})

describe('categoryCounts', () => {
  it('counts each category and how many of it can be costed, biggest first', () => {
    expect(categoryCounts([
      sku({ item_code: 'a', category: 'SOFA' }),
      sku({ item_code: 'b', category: 'SOFA' }),
      sku({ item_code: 'c', category: 'ACCESSORY', cost_price: 180 }),
    ])).toEqual([
      { category: 'SOFA', total: 2, costed: 0 },
      { category: 'ACCESSORY', total: 1, costed: 1 },
    ])
  })

  it('files a SKU with no category rather than dropping it', () => {
    expect(categoryCounts([sku({ category: null })])[0].category).toBe('UNCATEGORISED')
  })

  it('leaves inactive SKUs out of the counts', () => {
    expect(categoryCounts([sku({ active: false })])).toEqual([])
  })
})

describe('filterSkus', () => {
  const rows = [
    sku({ item_code: '8030-1A(LHF)', base_model: '8030' }),
    sku({ item_code: '1068 STOOL', description: 'THL STOOL- 1068', category: 'ACCESSORY', base_model: '1068 STOOL', module_code: null, cost_price: 180 }),
    sku({ item_code: 'OLD-1', active: false }),
  ]
  const base = { query: '', category: null, onlyUncosted: false, includeInactive: false }

  it('hides inactive SKUs unless asked', () => {
    expect(filterSkus(rows, base)).toHaveLength(2)
    expect(filterSkus(rows, { ...base, includeInactive: true })).toHaveLength(3)
  })

  it('matches on the base model, so "8030" finds every compartment of that sofa', () => {
    expect(filterSkus(rows, { ...base, query: '8030' }).map(r => r.item_code)).toEqual(['8030-1A(LHF)'])
  })

  it('matches on the description', () => {
    expect(filterSkus(rows, { ...base, query: 'thl stool' }).map(r => r.item_code)).toEqual(['1068 STOOL'])
  })

  it('narrows to a category', () => {
    expect(filterSkus(rows, { ...base, category: 'ACCESSORY' }).map(r => r.item_code)).toEqual(['1068 STOOL'])
  })

  it('shows only what cannot be costed', () => {
    expect(filterSkus(rows, { ...base, onlyUncosted: true }).map(r => r.item_code)).toEqual(['8030-1A(LHF)'])
  })
})
