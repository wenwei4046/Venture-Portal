import { describe, expect, it } from 'vitest'
import { validateKpiItems } from '@/lib/catalogue/rule-edits'
import {
  amountDiffers,
  draftChanges,
  EMPTY_KPI_DRAFT,
  kpiItemsEditOf,
  kpiSkuSearchFilter,
  listedKeys,
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
