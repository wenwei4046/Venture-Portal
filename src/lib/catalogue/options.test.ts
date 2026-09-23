import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateModelEdit } from './edits'
import {
  allowedValues,
  CALC_CATEGORIES,
  calcCategoryOf,
  defaultGift,
  MAINTENANCE_SECTIONS,
  optionKeysOf,
  sizeWordOf,
  skuKeyOf,
  skuOptionLabel,
} from './options'
import { isPricedPool, POOLS } from './pricing'

/**
 * calcCategoryOf and defaultGift are the twins of catalogue_calc_category and
 * catalogue_default_gift (migration 20260924020000 §11); their expectations
 * were checked against the SQL itself. The rest maps the ERP's Modular tab
 * (scm.product_models.allowed_options) onto the portal's own ticks.
 */

const MIRROR_SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20260924020000_erp_catalogue_mirror.sql'), 'utf8')

describe('skuKeyOf', () => {
  it.each([
    ['SOFA', 'compartments'],
    ['sofa', 'compartments'],
    ['BEDFRAME', 'sizes'],
    ['MATTRESS', 'sizes'],
    ['Mattress', 'sizes'],
  ])('%s lists its SKUs under %s', (category, key) => {
    expect(skuKeyOf(category)).toBe(key)
  })

  it.each(['ACCESSORY', 'FABRIC_ACCESSORY', '', null])('%j has no SKU key', category => {
    expect(skuKeyOf(category)).toBeNull()
  })
})

describe('optionKeysOf', () => {
  it('a sofa offers seat height, leg height and specials — its compartments are SKUs', () => {
    expect(optionKeysOf('SOFA')).toEqual([
      { key: 'sizes', pool: 'sofa_sizes', label: 'Seat height', priced: false },
      { key: 'leg_heights', pool: 'sofa_leg_heights', label: 'Leg height', priced: true },
      { key: 'specials', pool: 'sofa_specials', label: 'Specials', priced: true },
    ])
  })

  it('a bed frame offers divan, leg and total heights, gaps and specials — its sizes are SKUs', () => {
    const keys = optionKeysOf('BEDFRAME')
    expect(keys.map(k => k.key).sort()).toEqual(['divan_heights', 'gaps', 'leg_heights', 'specials', 'total_heights'])
    expect(keys.find(k => k.key === 'gaps')).toEqual({ key: 'gaps', pool: 'bedframe_gaps', label: 'Gap', priced: false })
    expect(keys.find(k => k.key === 'divan_heights')?.pool).toBe('bedframe_divan_heights')
  })

  it('is case-insensitive on the category', () => {
    expect(optionKeysOf('sofa')).toEqual(optionKeysOf('SOFA'))
  })

  it.each(['MATTRESS', 'ACCESSORY', '', null])('%j offers no option pools', category => {
    expect(optionKeysOf(category)).toEqual([])
  })

  it.each(['SOFA', 'BEDFRAME'])('%s: priced follows the pool, every pool is a mirrored one, the SKU key is never an option', category => {
    for (const k of optionKeysOf(category)) {
      expect(k.priced).toBe(isPricedPool(k.pool))
      expect(POOLS).toContain(k.pool)
      expect(k.key).not.toBe(skuKeyOf(category))
    }
  })

  it.each(['SOFA', 'BEDFRAME'])('%s: every option key is one the Modular save accepts', category => {
    const enabled = Object.fromEntries(optionKeysOf(category).map(k => [k.key, ['x']]))
    const saved = validateModelEdit({
      erpModelId: '3c1c9c1e-0000-4000-8000-000000000012',
      offered: true,
      enabled,
      gift: null,
      calcCategory: null,
      brandCode: null,
      skuOffered: {},
    })
    expect(Object.keys(saved.model.enabled).sort()).toEqual(Object.keys(enabled).sort())
  })

  // Its doc says "in the ERP's own order". The ERP's Modular tab
  // (ProductModelDetail.tsx) and MAINTENANCE_SECTIONS both list a bed frame's
  // pools divan, total, gaps, leg, specials; optionKeysOf puts leg second.
  it('lists a bed frame’s pools in the ERP’s Modular order', () => {
    expect(optionKeysOf('BEDFRAME').map(k => k.key)).toEqual(['divan_heights', 'total_heights', 'gaps', 'leg_heights', 'specials'])
  })
})

describe('MAINTENANCE_SECTIONS', () => {
  it('Bedframe then Sofa, each in the ERP’s rail order', () => {
    expect(MAINTENANCE_SECTIONS.map(s => [s.section, s.pools.map(p => p.pool)])).toEqual([
      ['Bedframe', ['bedframe_divan_heights', 'bedframe_total_heights', 'bedframe_gaps', 'bedframe_leg_heights', 'bedframe_specials']],
      ['Sofa', ['sofa_sizes', 'sofa_leg_heights', 'sofa_specials']],
    ])
  })

  it('covers each of the eight mirrored pools exactly once', () => {
    const pools = MAINTENANCE_SECTIONS.flatMap(s => s.pools.map(p => p.pool))
    expect(pools).toHaveLength(POOLS.length)
    expect([...pools].sort()).toEqual([...POOLS].sort())
  })

  it('marks priced exactly where isPricedPool does', () => {
    for (const p of MAINTENANCE_SECTIONS.flatMap(s => s.pools)) expect(p.priced).toBe(isPricedPool(p.pool))
  })
})

describe('allowedValues', () => {
  it('reads strings and {value} objects, trimmed, first spelling kept, blanks and non-strings dropped', () => {
    const allowed = { sizes: ['30', ' 35 ', '30', '', '  ', { value: '28' }, { value: ' 24 ' }, { value: 5 }, 5, null, {}] }
    expect(allowedValues(allowed, 'sizes')).toEqual(['30', '35', '28', '24'])
  })

  it('de-duplicates exactly — case is kept', () => {
    expect(allowedValues({ leg_heights: ['Default', 'DEFAULT', 'Default'] }, 'leg_heights')).toEqual(['Default', 'DEFAULT'])
  })

  it('a key that is missing or not a list → []', () => {
    expect(allowedValues({ sizes: ['30'] }, 'gaps')).toEqual([])
    expect(allowedValues({ sizes: '30' }, 'sizes')).toEqual([])
  })

  it.each<[unknown]>([[null], [undefined], [[['30']]], ['sizes'], [42]])('allowed_options %j → []', allowed => {
    expect(allowedValues(allowed, 'sizes')).toEqual([])
  })
})

describe('calcCategoryOf — catalogue_calc_category', () => {
  it.each([
    ['MATTRESS', 'Akemi Cool Sleep', 'Mattress'],
    ['bedframe', 'Oslo', 'Bed frame'],
    ['SOFA', null, 'Sofa'],
    ['ACCESSORY', 'Latex Pillow', 'Pillow'],
    // PROTECTOR is asked first: a pillow protector is a protector.
    ['ACCESSORY', 'Pillow Protector', 'Protector'],
    ['ACCESSORY', 'mattress protector (k)', 'Protector'],
    ['accessory', 'pillow', 'Pillow'],
    ['ACCESSORY', 'Stool', 'Accessory'],
    ['ACCESSORY', null, 'Accessory'],
    ['FABRIC_ACCESSORY', 'Pillow Case', 'Accessory'],
    ['SERVICE', null, 'Other'],
    ['', 'Pillow', 'Other'],
    [null, null, 'Other'],
  ])('(%j, %j) → %s', (category, name, section) => {
    expect(calcCategoryOf(category, name)).toBe(section)
  })

  it('every answer is one of CALC_CATEGORIES', () => {
    for (const c of ['MATTRESS', 'BEDFRAME', 'SOFA', 'ACCESSORY', 'FABRIC_ACCESSORY', 'X', null]) {
      for (const n of ['Pillow', 'Protector', 'Stool', null]) expect(CALC_CATEGORIES).toContain(calcCategoryOf(c, n))
    }
  })

  it('CALC_CATEGORIES is exactly the list catalogue_models.calc_category allows', () => {
    const at = MIRROR_SQL.indexOf('CONSTRAINT catalogue_models_calc_category_valid CHECK')
    const open = MIRROR_SQL.indexOf(' IN (', at) + 5
    const allowed = [...MIRROR_SQL.slice(open, MIRROR_SQL.indexOf(')', open)).matchAll(/'([^']*)'/g)].map(m => m[1])
    expect([...CALC_CATEGORIES]).toEqual(allowed)
  })

  // The SQL asks UPPER(BTRIM(COALESCE(p_category, ''))); the TS does not trim.
  // (The mirror stores categories already trimmed, so no stored row trips it.)
  it('the category is trimmed before it is read, as the SQL trims it', () => {
    expect(calcCategoryOf(' SOFA ', null)).toBe('Sofa')
  })
})

describe('defaultGift — catalogue_default_gift', () => {
  it.each(['Pillow', 'Protector', 'Accessory'])('%s may ride a quote as a gift', section => {
    expect(defaultGift(section)).toBe(true)
  })

  it.each(['Mattress', 'Bed frame', 'Sofa', 'Other', 'pillow', ''])('%j may not', section => {
    expect(defaultGift(section)).toBe(false)
  })
})

describe('sizeWordOf', () => {
  it.each([
    ['K', 'King'],
    ['Q', 'Queen'],
    ['S', 'Single'],
    ['SS', 'Super Single'],
    ['SK', 'Super King'],
    ['SP', 'Special size'],
    ['q', 'Queen'],
    [' SS ', 'Super Single'],
  ])('size code %j → %s', (code, word) => {
    expect(sizeWordOf(code, null)).toBe(word)
  })

  it('a known code wins over the ERP’s label', () => {
    expect(sizeWordOf('K', 'King 6ft')).toBe('King')
  })

  it('an unknown code falls back to the label, then to the code itself', () => {
    expect(sizeWordOf('XL', ' Extra Long ')).toBe('Extra Long')
    expect(sizeWordOf('XL', null)).toBe('XL')
    expect(sizeWordOf(null, '6ft')).toBe('6ft')
    expect(sizeWordOf(null, null)).toBe('')
  })
})

describe('skuOptionLabel', () => {
  const sku = (over: Partial<Parameters<typeof skuOptionLabel>[0]>) => ({
    category: null,
    module_code: null,
    size_code: null,
    size_label: null,
    item_code: 'CODE-1',
    ...over,
  })

  it('a sofa module is its module', () => {
    expect(skuOptionLabel(sku({ category: 'SOFA', module_code: '1A(LHF)', item_code: '8030-1A(LHF)' }))).toBe('1A(LHF)')
  })

  it('a bed frame or mattress is its size word', () => {
    expect(skuOptionLabel(sku({ category: 'BEDFRAME', size_code: 'K', item_code: '1025-(K)' }))).toBe('King')
    expect(skuOptionLabel(sku({ category: 'mattress', size_label: 'Queen 5ft' }))).toBe('Queen 5ft')
  })

  it('anything else — or a SKU with no module or size — is its code', () => {
    expect(skuOptionLabel(sku({ category: 'SOFA', item_code: '8030-SET' }))).toBe('8030-SET')
    expect(skuOptionLabel(sku({ category: 'BEDFRAME', item_code: 'BF-1' }))).toBe('BF-1')
    expect(skuOptionLabel(sku({ category: 'ACCESSORY', size_code: 'K', module_code: 'X', item_code: 'PIL-1' }))).toBe('PIL-1')
  })
})
