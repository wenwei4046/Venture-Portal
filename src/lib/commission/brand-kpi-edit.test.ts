import { describe, expect, it } from 'vitest'
import { validateKpiItems } from '@/lib/catalogue/rule-edits'
import {
  bonusDiffers,
  brandCompartmentList,
  brandFabricSeriesList,
  brandItemEdited,
  brandKpiChanges,
  brandKpiEditOf,
  brandKpiKey,
  brandKpiTaken,
  brandKpiTitle,
  brandModelList,
  EMPTY_BRAND_KPI_DRAFT,
  pickBrandItem,
  tierDrafts,
  tiersDiffer,
  toBrandKpiListed,
  type BrandKpiDraft,
  type BrandKpiListed,
} from './brand-kpi-edit'

// 2026-11-13 — Rules › KPI items edits a brand's own items (2990s). Production's two on that day: Upgrade fabric
// (Sofa Full Fabric, RM 50 a unit) and Upgrade latex seat (Latex Seat, RM 50; 5+ · 70; 10+ · 100). Since 2026-11-14 an
// item is any kind of the brand's own catalogue and carries only its bonus and its tiers (the user: "我只需要像 Fair 一样
// 选 KPI 就好，不需要去选它的 cost").
const BRAND = '383ddd53-18fd-4dfd-b31e-57df4e1d42d9'
const FABRIC_ID = '11111111-1111-4111-8111-111111111111'
const LATEX_ID = '22222222-2222-4222-8222-222222222222'
const PILLOW_ID = '33333333-3333-4333-8333-333333333333'
const FABRIC: BrandKpiListed = {
  id: FABRIC_ID, source: 'option', pool: 'sofa_specials', value: 'Sofa Full Fabric', erpId: null, name: 'Upgrade fabric', amount: 50, tiers: [],
}
const LATEX: BrandKpiListed = {
  id: LATEX_ID, source: 'option', pool: 'sofa_specials', value: 'Latex Seat', erpId: null, name: 'Upgrade latex seat', amount: 50,
  tiers: [{ minQty: 5, amount: 70 }, { minQty: 10, amount: 100 }],
}
const LISTED = [FABRIC, LATEX]
const draft = (over: Partial<BrandKpiDraft> = {}): BrandKpiDraft => ({ ...EMPTY_BRAND_KPI_DRAFT, ...over })

describe("a brand's KPI items as Rules lists them", () => {
  it('reads a stored special: its pool and spelling, its own name, the bonus, the tiers lowest first', () => {
    expect(toBrandKpiListed({
      id: LATEX_ID, source: 'option', option_pool: 'sofa_specials', option_value: ' Latex Seat ', product_name: ' Upgrade latex seat ',
      kpi_amount: '50.00', unit_tiers: [{ min_qty: 10, amount: 100 }, { min_qty: 5, amount: 70 }],
    })).toEqual(LATEX)
    // No source stored (a row from before the column): its pool says it is an option. No name: its value names it.
    const bare = toBrandKpiListed({ id: FABRIC_ID, option_pool: 'sofa_specials', option_value: 'Sofa Full Fabric', product_name: null, kpi_amount: 50 })
    expect(bare).toEqual({ ...FABRIC, name: null })
    expect(brandKpiTitle(bare)).toBe('Sofa Full Fabric')
    expect(brandKpiTitle(FABRIC)).toBe('Upgrade fabric')
  })

  it('reads a stored SKU by its code and the SKU Master row it was picked from; a model and a compartment by their pool', () => {
    expect(toBrandKpiListed({
      id: PILLOW_ID, source: 'sku', product_code: ' SQUARE PILLOW-M ', erp_product_id: '4711', option_pool: null, option_value: null,
      product_name: 'Square pillow (M)', kpi_amount: 10,
    })).toEqual({ id: PILLOW_ID, source: 'sku', pool: null, value: 'SQUARE PILLOW-M', erpId: '4711', name: 'Square pillow (M)', amount: 10, tiers: [] })
    expect(toBrandKpiListed({ id: LATEX_ID, source: 'option', option_pool: 'models', option_value: 'Boaat', product_name: null, kpi_amount: 40 }))
      .toMatchObject({ source: 'option', pool: 'models', value: 'Boaat', erpId: null })
    expect(toBrandKpiListed({ id: LATEX_ID, source: 'option', option_pool: 'compartments', option_value: 'CNR', product_name: null, kpi_amount: 30 }))
      .toMatchObject({ source: 'option', pool: 'compartments', value: 'CNR' })
  })

  it('shows stored tiers as the inputs hold them', () => {
    expect(tierDrafts(LATEX.tiers)).toEqual([{ minQty: '5', amount: '70' }, { minQty: '10', amount: '100' }])
    expect(tierDrafts([])).toEqual([])
  })
})

describe('what counts as a change', () => {
  it('a bonus retyped to the same amount is none; a blank or a word is one', () => {
    expect(bonusDiffers('50', 50)).toBe(false)
    expect(bonusDiffers(' 50.00 ', 50)).toBe(false)
    expect(bonusDiffers('1,250.5', 1250.5)).toBe(false)
    expect(bonusDiffers('60', 50)).toBe(true)
    expect(bonusDiffers('', 50)).toBe(true)
    expect(bonusDiffers('fifty', 50)).toBe(true)
  })

  it('tiers retyped to the same steps are none — a wholly blank row is no step', () => {
    expect(tiersDiffer(tierDrafts(LATEX.tiers), LATEX.tiers)).toBe(false)
    expect(tiersDiffer([{ minQty: ' 5 ', amount: '70.00' }, { minQty: '', amount: ' ' }, { minQty: '10', amount: '100' }], LATEX.tiers)).toBe(false)
    expect(tiersDiffer([], [])).toBe(false)
    expect(tiersDiffer([{ minQty: '', amount: '' }], [])).toBe(false)
  })

  it('a step added, dropped, retyped, half typed or out of order is a change', () => {
    expect(tiersDiffer([{ minQty: '5', amount: '80' }, { minQty: '10', amount: '100' }], LATEX.tiers)).toBe(true)
    expect(tiersDiffer([{ minQty: '6', amount: '70' }, { minQty: '10', amount: '100' }], LATEX.tiers)).toBe(true)
    expect(tiersDiffer([{ minQty: '5', amount: '70' }], LATEX.tiers)).toBe(true)
    expect(tiersDiffer([...tierDrafts(LATEX.tiers), { minQty: '20', amount: '120' }], LATEX.tiers)).toBe(true)
    expect(tiersDiffer([{ minQty: '5', amount: '' }, { minQty: '10', amount: '100' }], LATEX.tiers)).toBe(true)
    expect(tiersDiffer([{ minQty: '10', amount: '100' }, { minQty: '5', amount: '70' }], LATEX.tiers)).toBe(true)
    expect(tiersDiffer([{ minQty: '5', amount: '70' }], [])).toBe(true)
  })

  it('counts each item coming off, each item changed and each item added once', () => {
    expect(brandKpiChanges(LISTED, EMPTY_BRAND_KPI_DRAFT)).toBe(0)
    // Touched, then typed back: nothing to save.
    const back = draft({ amounts: new Map([[FABRIC_ID, '50']]), tiers: new Map([[LATEX_ID, tierDrafts(LATEX.tiers)]]) })
    expect(brandItemEdited(FABRIC, back)).toBe(false)
    expect(brandKpiChanges(LISTED, back)).toBe(0)
    // A bonus and the tiers of one item are one change.
    const both = draft({ amounts: new Map([[LATEX_ID, '60']]), tiers: new Map([[LATEX_ID, [{ minQty: '5', amount: '80' }]]]) })
    expect(brandItemEdited(LATEX, both)).toBe(true)
    expect(brandKpiChanges(LISTED, both)).toBe(1)
    // An item coming off counts once, however it was retyped before.
    expect(brandKpiChanges(LISTED, { ...both, removing: new Set([LATEX_ID]) })).toBe(1)
    expect(brandKpiChanges(LISTED, draft({
      amounts: new Map([[FABRIC_ID, '55']]),
      removing: new Set([LATEX_ID]),
      added: [pickBrandItem({ source: 'option', pool: 'models', value: 'Boaat' }, '40')],
    }))).toBe(3)
  })
})

describe('the picker — what it offers and what it adds', () => {
  it('knows a SKU by its code, an option by its pool and its spelling in any case', () => {
    expect(brandKpiKey({ source: 'sku', pool: null, value: ' square pillow-m ' })).toBe('sku:SQUARE PILLOW-M')
    expect(brandKpiKey({ source: 'option', pool: 'models', value: ' Boaat ' })).toBe('option:models:boaat')
    expect(brandKpiKey(LATEX)).toBe('option:sofa_specials:latex seat')
    // A model and a special of one spelling are two items.
    expect(brandKpiKey({ source: 'option', pool: 'models', value: 'Latex Seat' })).not.toBe(brandKpiKey(LATEX))
  })

  it('never offers again what is listed or being added, whatever its spelling; one coming off it offers again', () => {
    const picked = draft({ added: [pickBrandItem({ source: 'sku', code: 'SQUARE PILLOW-M', erpId: '4711', label: 'Square pillow (M)' })] })
    expect([...brandKpiTaken(LISTED, picked)].sort()).toEqual([
      'option:sofa_specials:latex seat', 'option:sofa_specials:sofa full fabric', 'sku:SQUARE PILLOW-M',
    ])
    expect(brandKpiTaken([{ ...LATEX, value: 'LATEX  seat' }], EMPTY_BRAND_KPI_DRAFT).has(brandKpiKey(LATEX))).toBe(true)
    // Taken off and added again under another name in one save.
    expect([...brandKpiTaken(LISTED, draft({ removing: new Set([LATEX_ID]) }))]).toEqual(['option:sofa_specials:sofa full fabric'])
  })

  it('adds a pick as the list keys it, with the bonus typed for it, no name of its own and no tiers', () => {
    expect(pickBrandItem({ source: 'sku', code: ' SQUARE PILLOW-M ', erpId: '4711', label: ' Square pillow (M) ' }, '10')).toEqual({
      key: 'new:sku:SQUARE PILLOW-M', source: 'sku', pool: null, value: 'SQUARE PILLOW-M', erpId: '4711', label: 'Square pillow (M)',
      name: '', amount: '10', tiers: [],
    })
    expect(pickBrandItem({ source: 'option', pool: 'compartments', value: 'CNR' })).toEqual({
      key: 'new:option:compartments:cnr', source: 'option', pool: 'compartments', value: 'CNR', erpId: null, label: null,
      name: '', amount: '', tiers: [],
    })
  })
})

describe('what a Save sends', () => {
  it('only what changed: a bonus alone, tiers alone (whole), both — never an untouched figure', () => {
    expect(brandKpiEditOf(BRAND, LISTED, draft({ amounts: new Map([[FABRIC_ID, ' 60 ']]) }))).toEqual({
      adds: [], changes: [{ id: FABRIC_ID, amount: '60', label: 'Upgrade fabric' }], removes: [],
    })
    // The latex seat's bonus was never touched: a change of its tiers does not send it.
    const tiers = [{ minQty: '5', amount: '80' }, { minQty: '', amount: '' }, { minQty: '12', amount: '120' }]
    expect(brandKpiEditOf(BRAND, LISTED, draft({ tiers: new Map([[LATEX_ID, tiers]]) }))).toEqual({
      adds: [],
      changes: [{ id: LATEX_ID, label: 'Upgrade latex seat', tiers: [{ minQty: '5', amount: '80' }, { minQty: '12', amount: '120' }] }],
      removes: [],
    })
    // A bonus retyped to what it was is not sent beside changed tiers either.
    expect(brandKpiEditOf(BRAND, LISTED, draft({ amounts: new Map([[LATEX_ID, '50.00']]), tiers: new Map([[LATEX_ID, []]]) }))).toEqual({
      adds: [], changes: [{ id: LATEX_ID, label: 'Upgrade latex seat', tiers: [] }], removes: [],
    })
    expect(brandKpiEditOf(BRAND, LISTED, draft({ amounts: new Map([[LATEX_ID, '55']]), tiers: new Map([[LATEX_ID, tiers.slice(0, 1)]]) })).changes).toEqual([
      { id: LATEX_ID, amount: '55', label: 'Upgrade latex seat', tiers: [{ minQty: '5', amount: '80' }] },
    ])
  })

  it('an emptied bonus goes as null, so the Save is refused by name', () => {
    const edit = brandKpiEditOf(BRAND, LISTED, draft({ amounts: new Map([[FABRIC_ID, '  ']]) }))
    expect(edit.changes).toEqual([{ id: FABRIC_ID, amount: null, label: 'Upgrade fabric' }])
    expect(() => validateKpiItems(edit)).toThrow(/Upgrade fabric: give it a KPI amount/)
  })

  it('an item coming off is removed and never also changed', () => {
    expect(brandKpiEditOf(BRAND, LISTED, draft({ amounts: new Map([[LATEX_ID, '60']]), removing: new Set([LATEX_ID]) }))).toEqual({
      adds: [], changes: [], removes: [LATEX_ID],
    })
  })

  it('an added item of every kind goes under the brand: its SKU or its pool and value, its name when one was typed, its bonus, its tiers', () => {
    const edit = brandKpiEditOf(BRAND, LISTED, draft({
      added: [
        {
          ...pickBrandItem({ source: 'sku', code: 'SQUARE PILLOW-M', erpId: '4711', label: 'Square pillow (M)' }, ' 10 '),
          name: ' Pillow M ', tiers: [{ minQty: '5', amount: '15' }, { minQty: ' ', amount: '' }],
        },
        pickBrandItem({ source: 'option', pool: 'models', value: 'Boaat' }, '40'),
        pickBrandItem({ source: 'option', pool: 'compartments', value: 'CNR' }, '30'),
        pickBrandItem({ source: 'option', pool: 'sofa_fabric_series', value: 'EZ', label: 'EZ · Sofa fabric' }, '50'),
        pickBrandItem({ source: 'option', pool: 'bedframe_specials', value: 'HB Straight' }),
      ],
    }))
    expect(edit.adds).toEqual([
      { source: 'sku', erpId: '4711', amount: '10', brandId: BRAND, name: 'Pillow M', tiers: [{ minQty: '5', amount: '15' }], label: 'Pillow M' },
      { source: 'option', optionPool: 'models', optionValue: 'Boaat', amount: '40', brandId: BRAND, name: null, tiers: [], label: 'Boaat' },
      { source: 'option', optionPool: 'compartments', optionValue: 'CNR', amount: '30', brandId: BRAND, name: null, tiers: [], label: 'CNR' },
      {
        source: 'option', optionPool: 'sofa_fabric_series', optionValue: 'EZ', amount: '50', brandId: BRAND, name: null, tiers: [],
        label: 'EZ · Sofa fabric',
      },
      { source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', amount: null, brandId: BRAND, name: null, tiers: [], label: 'HB Straight' },
    ])
    // The last has no bonus yet: refused by its name.
    expect(() => validateKpiItems(edit)).toThrow(/HB Straight: give it a KPI amount/)
    // The rest is what the database takes: a name only where one was typed — the database names the others.
    expect(validateKpiItems({ ...edit, adds: edit.adds.slice(0, 4) }).adds).toEqual([
      { source: 'sku', erp_product_id: '4711', kpi_amount: 10, brand_id: BRAND, label: 'Pillow M', unit_tiers: [{ min_qty: 5, amount: 15 }] },
      { source: 'option', option_pool: 'models', option_value: 'Boaat', kpi_amount: 40, brand_id: BRAND },
      { source: 'option', option_pool: 'compartments', option_value: 'CNR', kpi_amount: 30, brand_id: BRAND },
      { source: 'option', option_pool: 'sofa_fabric_series', option_value: 'EZ', kpi_amount: 50, brand_id: BRAND },
    ])
  })

  it('a SKU with no name typed is refused by its description', () => {
    const edit = brandKpiEditOf(BRAND, [], draft({ added: [pickBrandItem({ source: 'sku', code: 'SQUARE PILLOW-M', erpId: '4711', label: 'Square pillow (M)' })] }))
    expect(() => validateKpiItems(edit)).toThrow(/Square pillow \(M\): give it a KPI amount/)
  })

  it('is what the database takes once checked', () => {
    const edit = brandKpiEditOf(BRAND, LISTED, draft({
      amounts: new Map([[FABRIC_ID, '60']]),
      tiers: new Map([[LATEX_ID, [{ minQty: '5', amount: '70' }]]]),
      added: [{
        ...pickBrandItem({ source: 'option', pool: 'sofa_specials', value: 'Nylon Fabric' }, '30'),
        name: 'Upgrade nylon', tiers: [{ minQty: '3', amount: '40' }],
      }],
    }))
    expect(validateKpiItems(edit)).toEqual({
      adds: [{
        source: 'option', option_pool: 'sofa_specials', option_value: 'Nylon Fabric', kpi_amount: 30, brand_id: BRAND,
        label: 'Upgrade nylon', unit_tiers: [{ min_qty: 3, amount: 40 }],
      }],
      changes: [{ id: FABRIC_ID, kpi_amount: 60 }, { id: LATEX_ID, unit_tiers: [{ min_qty: 5, amount: 70 }] }],
      removes: [],
    })
  })
})

describe("the brand's catalogue — what the picker lists", () => {
  it('a fabric series a row: its list’s series, a fabric with none in its code’s family; how many fabrics it still has', () => {
    expect(brandFabricSeriesList([
      { fabric_code: 'HG1313-01', series: 'BELONG' },
      { fabric_code: 'HG1313-02', series: 'BELONG' },
      { fabric_code: 'EZ-001', series: null },
      { fabric_code: 'EZ-002', series: '' },
      { fabric_code: 'ez-002', series: null },
      { fabric_code: 'BROWNIE-02', series: 'HOMELY' },
      { fabric_code: 'OLD-01', series: 'MONS', removed_at: '2026-10-01' },
      { fabric_code: 'Velvet Interlace - Bronze', series: null },
      { fabric_code: '  ', series: null },
    ])).toEqual([
      { series: 'BELONG', fabrics: 2, removed: false },
      { series: 'EZ', fabrics: 2, removed: false },
      { series: 'HOMELY', fabrics: 1, removed: false },
      { series: 'MONS', fabrics: 0, removed: true },
      { series: 'Velvet Interlace', fabrics: 1, removed: false },
    ])
  })

  const SKUS = [
    { item_code: 'BOAAT-1A(P)(LHF)', base_model: 'BOAAT', category: 'SOFA', description: 'Boaat 1A left' },
    { item_code: 'BOAAT-CNR', base_model: 'BOAAT', category: 'SOFA', description: 'Boaat corner' },
    { item_code: 'BOAAT-2A', base_model: 'Boaat', category: 'SOFA', description: null },
    { item_code: 'ARIA-(Q)', base_model: 'ARIA', category: 'BEDFRAME', description: 'Aria queen' },
    { item_code: 'GONE-2A', base_model: 'GONE', category: 'SOFA', description: null, removed_at: '2026-10-01' },
    { item_code: 'SVC-DELIVERY', base_model: null, category: 'SERVICE', description: 'Delivery' },
    { item_code: 'XAMMAR-CNR', base_model: 'XAMMAR', category: 'SOFA', description: 'Xammar corner' },
    { item_code: 'XAMMAR-2A(LHF)', base_model: 'XAMMAR', category: 'sofa', description: null },
    { item_code: 'CNRCHAIR', base_model: 'CNRCHAIR', category: 'SOFA', description: null },
  ]

  it('a model a row: its live SKUs, one spelling, its category and a description to know it by', () => {
    expect(brandModelList(SKUS)).toEqual([
      { model: 'ARIA', category: 'BEDFRAME', skus: 1, sample: 'Aria queen' },
      { model: 'BOAAT', category: 'SOFA', skus: 3, sample: 'Boaat 1A left' },
      { model: 'CNRCHAIR', category: 'SOFA', skus: 1, sample: null },
      { model: 'XAMMAR', category: 'SOFA', skus: 2, sample: 'Xammar corner' },
    ])
  })

  it('a compartment a row: its live sofas’ pieces’ modules, the most models first', () => {
    expect(brandCompartmentList(SKUS)).toEqual([
      { compartment: '2A', models: 2 },
      { compartment: 'CNR', models: 2 },
      { compartment: '1A', models: 1 },
    ])
  })
})
