import { describe, expect, it } from 'vitest'
import { validateKpiItems } from '@/lib/catalogue/rule-edits'
import {
  amountDiffers,
  draftChanges,
  EMPTY_KPI_DRAFT,
  fabricCount,
  fabricSeriesList,
  kpiItemsEditOf,
  kpiSkuSearchFilter,
  listedKeys,
  pickFabricSeries,
  pickSku,
  pickSpecial,
  skuCodeKey,
  skuIdKey,
  sortListed,
  specialKey,
  type KpiItemsDraft,
  type KpiListedItem,
} from './kpi-items-edit'

// Fair on 2026-10-08: HB Straight at RM 250 — plus a pillow and a sofa
// special for the shapes the list can hold.
const HB: KpiListedItem = {
  id: '2672a958-e9fb-4257-b5dc-61449f22efa8', source: 'option', erpId: null, code: null, name: null,
  optionPool: 'bedframe_specials', optionValue: 'HB Straight', amount: 250,
}
const PILLOW: KpiListedItem = {
  id: '11111111-1111-4111-8111-111111111111', source: 'sku', erpId: 'p-77', code: 'AK-CS AIRLOFT COMFY PIL',
  name: 'Cool Silk Airloft', optionPool: null, optionValue: null, amount: 50,
}
const ARM: KpiListedItem = {
  id: '22222222-2222-4222-8222-222222222222', source: 'option', erpId: null, code: null, name: null,
  optionPool: 'sofa_specials', optionValue: 'Wooden Arm', amount: 80,
}
const LIST = [PILLOW, ARM, HB]

const draft = (over: Partial<KpiItemsDraft> = {}): KpiItemsDraft => ({ ...EMPTY_KPI_DRAFT, ...over })

describe('the list on the tab', () => {
  it('reads bed frame specials, then sofa specials, then SKUs', () => {
    expect(sortListed(LIST).map(i => i.id)).toEqual([HB.id, ARM.id, PILLOW.id])
  })

  // 2026-10-29: the fabric series come after the specials, a bed frame's first.
  it('reads the fabric series after the specials, before the SKUs', () => {
    const sofaSeries: KpiListedItem = { ...ARM, id: '33333333-3333-4333-8333-333333333333', optionPool: 'sofa_fabric_series', optionValue: 'PC151' }
    const bedSeries: KpiListedItem = { ...ARM, id: '44444444-4444-4444-8444-444444444444', optionPool: 'bedframe_fabric_series', optionValue: 'PC151' }
    expect(sortListed([PILLOW, sofaSeries, ARM, bedSeries, HB]).map(i => i.id)).toEqual([HB.id, ARM.id, bedSeries.id, sofaSeries.id, PILLOW.id])
  })
})

describe('the fabric list as the picker offers it', () => {
  it('one row per series, its live fabrics counted, a series with none marked gone', () => {
    expect(fabricSeriesList([
      { fabric_code: 'PC151-02', series: 'PC151', removed_at: null },
      { fabric_code: 'PC151-01', series: 'PC151 ', removed_at: null },
      // The ERP lists some codes twice (AVANI's 18 colours are 36 rows): one fabric.
      { fabric_code: 'pc151-01', series: 'PC151', removed_at: null },
      { fabric_code: 'PC151-99', series: 'pc151', removed_at: '2026-10-01T00:00:00Z' },
      { fabric_code: 'OT-01', series: 'OLD-TWEED', removed_at: '2026-10-01T00:00:00Z' },
      { fabric_code: 'X', series: '  ', removed_at: null },
      { fabric_code: 'KS-01', series: 'KS', removed_at: null },
    ])).toEqual([
      { series: 'KS', fabrics: 1, removed: false },
      { series: 'OLD-TWEED', fabrics: 0, removed: true },
      { series: 'PC151', fabrics: 2, removed: false },
    ])
  })

  it('a picked series is an option item of its pool, named by its fabrics', () => {
    const picked = pickFabricSeries('sofa_fabric_series', { series: 'PC151', fabrics: 18 })
    expect(picked).toEqual({ key: 'option:sofa_fabric_series:pc151', source: 'option', pool: 'sofa_fabric_series', value: 'PC151', name: '18 fabrics' })
    expect(fabricCount(1)).toBe('1 fabric')
    expect(kpiItemsEditOf([], draft({ added: [picked], amounts: new Map([[picked.key, '50']]) })).adds)
      .toEqual([{ source: 'option', optionPool: 'sofa_fabric_series', optionValue: 'PC151', amount: '50', label: 'PC151' }])
  })

  it("a series on one pool's list is still offered to the other", () => {
    const bed: KpiListedItem = { ...HB, id: '55555555-5555-4555-8555-555555555555', optionPool: 'bedframe_fabric_series', optionValue: 'PC151' }
    const keys = listedKeys([bed], draft())
    expect(keys.has(specialKey('bedframe_fabric_series', 'pc151'))).toBe(true)
    expect(keys.has(specialKey('sofa_fabric_series', 'PC151'))).toBe(false)
  })
})

describe('what a draft holds', () => {
  it('counts nothing until something is picked, retyped or taken off', () => {
    expect(draftChanges(LIST, EMPTY_KPI_DRAFT)).toBe(0)
  })

  it('a retyped amount counts only when it is another figure', () => {
    expect(amountDiffers('250.00', 250)).toBe(false)
    expect(amountDiffers('1,250', 1250)).toBe(false)
    expect(amountDiffers('300', 250)).toBe(true)
    expect(amountDiffers('', 250)).toBe(true)
    expect(amountDiffers('abc', 250)).toBe(true)
    expect(draftChanges(LIST, draft({ amounts: new Map([[HB.id, '250.00']]) }))).toBe(0)
    expect(draftChanges(LIST, draft({ amounts: new Map([[HB.id, '300']]) }))).toBe(1)
  })

  it('an item coming off counts once, whatever was typed in it', () => {
    expect(draftChanges(LIST, draft({ removing: new Set([HB.id]), amounts: new Map([[HB.id, '300']]) }))).toBe(1)
  })

  it('picked items count one each', () => {
    const cable = pickSku({ erpId: 'p-90', code: 'HDMI CABLE 2M', name: 'HDMI cable' })
    expect(draftChanges(LIST, draft({ added: [cable] }))).toBe(1)
  })
})

describe('the picker never offers an item twice', () => {
  it('a listed SKU by its row and by its code; a special by its pool and spelling', () => {
    const keys = listedKeys(LIST, EMPTY_KPI_DRAFT)
    expect(keys.has(skuIdKey('p-77'))).toBe(true)
    expect(keys.has(skuCodeKey(' ak-cs airloft comfy pil '))).toBe(true)
    expect(keys.has(specialKey('bedframe_specials', 'hb  straight'))).toBe(true)
    // The same word in the other pool is another item.
    expect(keys.has(specialKey('sofa_specials', 'HB Straight'))).toBe(false)
  })

  it('an item coming off may be picked again; a picked one may not', () => {
    const cable = pickSku({ erpId: 'p-90', code: 'HDMI CABLE 2M', name: null })
    const keys = listedKeys(LIST, draft({ removing: new Set([HB.id]), added: [cable] }))
    expect(keys.has(specialKey('bedframe_specials', 'HB Straight'))).toBe(false)
    expect(keys.has(skuIdKey('p-90'))).toBe(true)
    expect(keys.has(skuCodeKey('HDMI CABLE 2M'))).toBe(true)
  })
})

describe('what Save sends', () => {
  it('the picked items with their amounts, the retyped amounts, and what comes off', () => {
    const cable = pickSku({ erpId: 'p-90', code: 'HDMI CABLE 2M', name: 'HDMI cable' })
    const drawer = pickSpecial({ pool: 'bedframe_specials', value: 'Right Drawer', label: 'Right Drawer' })
    const edit = kpiItemsEditOf(LIST, draft({
      added: [drawer, cable],
      amounts: new Map([[cable.key, '30'], [drawer.key, '40'], [PILLOW.id, '60'], [ARM.id, '80.00']]),
      removing: new Set([HB.id]),
    }))
    expect(edit).toEqual({
      adds: [
        { source: 'option', optionPool: 'bedframe_specials', optionValue: 'Right Drawer', amount: '40', label: 'Right Drawer' },
        { source: 'sku', erpId: 'p-90', amount: '30', label: 'HDMI CABLE 2M' },
      ],
      changes: [{ id: PILLOW.id, amount: '60', label: 'AK-CS AIRLOFT COMFY PIL' }],
      removes: [HB.id],
    })
    // …and it is exactly what the writer's validation takes.
    expect(validateKpiItems(edit)).toEqual({
      adds: [
        { source: 'option', option_pool: 'bedframe_specials', option_value: 'Right Drawer', kpi_amount: 40 },
        { source: 'sku', erp_product_id: 'p-90', kpi_amount: 30 },
      ],
      changes: [{ id: PILLOW.id, kpi_amount: 60 }],
      removes: [HB.id],
    })
  })

  it('a picked item with no amount is refused by name', () => {
    const cable = pickSku({ erpId: 'p-90', code: 'HDMI CABLE 2M', name: null })
    expect(() => validateKpiItems(kpiItemsEditOf(LIST, draft({ added: [cable] }))))
      .toThrow('HDMI CABLE 2M: give it a KPI amount')
  })
})

describe('finding a SKU', () => {
  it('matches the code or the description, any case', () => {
    expect(kpiSkuSearchFilter('cable')).toBe('item_code.ilike."*cable*",description.ilike."*cable*"')
  })

  it('keeps a comma, a dot and brackets inside the quoted value', () => {
    expect(kpiSkuSearchFilter('PILLOW (K), 1.5')).toBe('item_code.ilike."*PILLOW (K), 1.5*",description.ilike."*PILLOW (K), 1.5*"')
  })

  it('takes out what could end the quoting or widen the match', () => {
    expect(kpiSkuSearchFilter('a"b\\c*d')).toBe('item_code.ilike."*a b c d*",description.ilike."*a b c d*"')
  })

  it('sends nothing for nothing typed', () => {
    expect(kpiSkuSearchFilter('')).toBeNull()
    expect(kpiSkuSearchFilter('  " *  ')).toBeNull()
  })

  it('keeps a search to eighty characters', () => {
    const filter = kpiSkuSearchFilter('x'.repeat(200))!
    expect(filter).toContain(`"*${'x'.repeat(80)}*"`)
    expect(filter).not.toContain('x'.repeat(81))
  })
})
