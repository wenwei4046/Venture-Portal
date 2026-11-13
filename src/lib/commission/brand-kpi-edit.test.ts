import { describe, expect, it } from 'vitest'
import { validateKpiItems } from '@/lib/catalogue/rule-edits'
import {
  bonusDiffers,
  brandItemEdited,
  brandKpiChanges,
  brandKpiEditOf,
  brandKpiTitle,
  EMPTY_BRAND_KPI_DRAFT,
  specialsLeft,
  tierDrafts,
  tiersDiffer,
  toBrandKpiListed,
  type BrandKpiDraft,
  type BrandKpiListed,
} from './brand-kpi-edit'

// 2026-11-13 — Rules › KPI items edits a brand's own items (2990s). Production's two on that day: Upgrade fabric
// (Sofa Full Fabric, RM 50 a unit) and Upgrade latex seat (Latex Seat, RM 50; 5+ · 70; 10+ · 100).
const BRAND = '383ddd53-18fd-4dfd-b31e-57df4e1d42d9'
const FABRIC_ID = '11111111-1111-4111-8111-111111111111'
const LATEX_ID = '22222222-2222-4222-8222-222222222222'
const FABRIC: BrandKpiListed = { id: FABRIC_ID, special: 'Sofa Full Fabric', name: 'Upgrade fabric', amount: 50, tiers: [] }
const LATEX: BrandKpiListed = {
  id: LATEX_ID, special: 'Latex Seat', name: 'Upgrade latex seat', amount: 50,
  tiers: [{ minQty: 5, amount: 70 }, { minQty: 10, amount: 100 }],
}
const LISTED = [FABRIC, LATEX]
const draft = (over: Partial<BrandKpiDraft> = {}): BrandKpiDraft => ({ ...EMPTY_BRAND_KPI_DRAFT, ...over })
// The ERP's sofa specials of 2990s' own company on 2026-11-13.
const POOL = ['Sofa Full Fabric', 'Latex Seat', 'Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing'].map(value => ({ value, removed: false }))

describe("a brand's KPI items as Rules lists them", () => {
  it('reads a stored row: the special, its own name, the bonus, the tiers lowest first', () => {
    expect(toBrandKpiListed({
      id: LATEX_ID, option_value: ' Latex Seat ', product_name: ' Upgrade latex seat ', kpi_amount: '50.00',
      unit_tiers: [{ min_qty: 10, amount: 100 }, { min_qty: 5, amount: 70 }],
    })).toEqual(LATEX)
    // No name of its own: the special names it.
    const bare = toBrandKpiListed({ id: FABRIC_ID, option_value: 'Sofa Full Fabric', product_name: null, kpi_amount: 50 })
    expect(bare).toEqual({ ...FABRIC, name: null })
    expect(brandKpiTitle(bare)).toBe('Sofa Full Fabric')
    expect(brandKpiTitle(FABRIC)).toBe('Upgrade fabric')
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
      added: [{ key: 'new:nylon fabric', special: 'Nylon Fabric', name: '', amount: '30', tiers: [] }],
    }))).toBe(3)
  })
})

describe('the specials still to pick', () => {
  it("offers the pool's specials that are no item of the brand, in the pool's order", () => {
    expect(specialsLeft(POOL, LISTED, EMPTY_BRAND_KPI_DRAFT)).toEqual(['Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing'])
  })

  it('never one the ERP removed, one picked already, or a second spelling of one', () => {
    const pool = [...POOL, { value: 'Wooden Arm', removed: true }, { value: ' nylon  FABRIC ', removed: false }, { value: '  ', removed: false }]
    const picked = draft({ added: [{ key: 'new:neylon fabric', special: 'Neylon Fabric', name: '', amount: '', tiers: [] }] })
    expect(specialsLeft(pool, LISTED, picked)).toEqual(['Nylon Fabric', 'Separate Backrest Packing'])
    // An item is matched to the pool whatever its spelling.
    expect(specialsLeft(POOL, [{ ...LATEX, special: 'LATEX  seat' }], EMPTY_BRAND_KPI_DRAFT)).not.toContain('Latex Seat')
  })

  it('offers an item again once it is coming off — taken off and added again under another name in one save', () => {
    expect(specialsLeft(POOL, LISTED, draft({ removing: new Set([LATEX_ID]) }))).toEqual([
      'Latex Seat', 'Neylon Fabric', 'Nylon Fabric', 'Separate Backrest Packing',
    ])
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

  it("an added item goes under the brand: the special, its name when one was typed, its bonus and its tiers", () => {
    const edit = brandKpiEditOf(BRAND, LISTED, draft({
      added: [
        { key: 'new:nylon fabric', special: 'Nylon Fabric', name: ' Upgrade nylon ', amount: ' 30 ', tiers: [{ minQty: '5', amount: '40' }, { minQty: ' ', amount: '' }] },
        { key: 'new:separate backrest packing', special: 'Separate Backrest Packing', name: '  ', amount: '', tiers: [] },
      ],
    }))
    expect(edit.adds).toEqual([
      {
        source: 'option', optionPool: 'sofa_specials', optionValue: 'Nylon Fabric', amount: '30', brandId: BRAND,
        name: 'Upgrade nylon', tiers: [{ minQty: '5', amount: '40' }], label: 'Upgrade nylon',
      },
      {
        source: 'option', optionPool: 'sofa_specials', optionValue: 'Separate Backrest Packing', amount: null, brandId: BRAND,
        name: null, tiers: [], label: 'Separate Backrest Packing',
      },
    ])
    // The second has no bonus yet: refused by the special's name.
    expect(() => validateKpiItems(edit)).toThrow(/Separate Backrest Packing: give it a KPI amount/)
  })

  it('is what the database takes once checked', () => {
    const edit = brandKpiEditOf(BRAND, LISTED, draft({
      amounts: new Map([[FABRIC_ID, '60']]),
      tiers: new Map([[LATEX_ID, [{ minQty: '5', amount: '70' }]]]),
      added: [{ key: 'new:nylon fabric', special: 'Nylon Fabric', name: 'Upgrade nylon', amount: '30', tiers: [{ minQty: '3', amount: '40' }] }],
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
