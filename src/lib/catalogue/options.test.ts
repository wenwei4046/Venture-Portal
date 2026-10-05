import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateModelEdit } from './edits'
import {
  allowedValues,
  CALC_CATEGORIES,
  calcCategoryOf,
  defaultGift,
  erpAllows,
  isRestricted,
  isRiderModel,
  MAINTENANCE_SECTIONS,
  needsBrandPick,
  optionKeysOf,
  RIDER,
  sellsUnderBrand,
  sizeWordOf,
  skuKeyOf,
  skuOptionLabel,
} from './options'
import { isPricedPool, poolPriceOf, POOLS } from './pricing'

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

  // 2026-10-05: each is offered on the Quote only while turned ON here — with its
  // charge when Maintenance prices it, else as FOC — so every one is ticked.
  it('a bed frame offers divan, leg and total heights, gaps and specials — its sizes are SKUs', () => {
    const keys = optionKeysOf('BEDFRAME')
    expect(keys.map(k => k.key).sort()).toEqual(['divan_heights', 'gaps', 'leg_heights', 'specials', 'total_heights'])
    expect(keys.find(k => k.key === 'gaps')).toEqual({ key: 'gaps', pool: 'bedframe_gaps', label: 'Gap', priced: true })
    expect(keys.find(k => k.key === 'divan_heights')?.pool).toBe('bedframe_divan_heights')
  })

  // Its doc says "in the ERP's own order". The ERP's Modular tab
  // (ProductModelDetail.tsx) and MAINTENANCE_SECTIONS both list a bed frame's
  // pools divan, total, gaps, leg, specials.
  it('lists a bed frame’s pools in the ERP’s Modular order', () => {
    expect(optionKeysOf('BEDFRAME').map(k => k.key)).toEqual(['divan_heights', 'total_heights', 'gaps', 'leg_heights', 'specials'])
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

  it('marks priced exactly where isPricedPool does, and a charge exactly where poolPriceOf says so', () => {
    for (const p of MAINTENANCE_SECTIONS.flatMap(s => s.pools)) {
      expect(p.priced).toBe(isPricedPool(p.pool))
      expect(p.charge).toBe(poolPriceOf(p.pool) === 'charge')
    }
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

describe('erpAllows — an empty ERP list restricts nothing', () => {
  const pool = ['No Leg', '2"', '4"', '6"']

  it('a non-empty list is the model’s own', () => {
    expect(isRestricted({ leg_heights: ['4"'] }, 'leg_heights')).toBe(true)
    expect(erpAllows({ leg_heights: ['4"', { value: '6"' }] }, 'leg_heights', pool)).toEqual(['4"', '6"'])
  })

  // allowed-options-check.ts hasRestriction: Array.isArray(pool) && pool.length > 0.
  it.each<[string, unknown]>([
    ['an empty list', { leg_heights: [] }],
    ['a missing key', { specials: ['Hydraulic'] }],
    ['a JSON null', { leg_heights: null }],
    ['no allowed_options at all', null],
    ['allowed_options that is not an object', ['4"']],
  ])('%s is the whole pool', (_, allowed) => {
    expect(isRestricted(allowed, 'leg_heights')).toBe(false)
    expect(erpAllows(allowed, 'leg_heights', pool)).toEqual(pool)
  })

  it('a list of blanks restricts, as the ERP’s does — to nothing it can match', () => {
    expect(isRestricted({ leg_heights: [''] }, 'leg_heights')).toBe(true)
    expect(erpAllows({ leg_heights: [''] }, 'leg_heights', pool)).toEqual([])
  })

  it('hands back a copy of the pool, never the pool itself', () => {
    const out = erpAllows({}, 'gaps', pool)
    expect(out).toEqual(pool)
    expect(out).not.toBe(pool)
  })

  it('is the test catalogue_model_options applies', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260924040000_member_catalogue.sql'), 'utf8')
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION catalogue_model_options'))
    expect(fn.slice(0, fn.indexOf('$fn$;', fn.indexOf('AS $fn$') + 8))).toContain(
      "CASE WHEN jsonb_typeof(p_allowed) = 'array' THEN jsonb_array_length(p_allowed) = 0 ELSE TRUE END",
    )
  })
})

describe('isRiderModel — who joins any cart', () => {
  it.each<[string | null, string | null, boolean]>([
    ['BEDFRAME', null, true],
    ['ACCESSORY', null, true],
    [null, null, true],
    ['MATTRESS', null, false],
    ['sofa', null, false],
    ['MATTRESS', RIDER, true],
    // A bed frame or an accessory is a rider whatever is stored (2026-10-06).
    ['BEDFRAME', 'AKEMI', true],
    ['MATTRESS', 'AKEMI', false],
  ])('%s with pick %s → %s', (category, pick, rider) => {
    expect(isRiderModel(category, pick)).toBe(rider)
  })

  it('is the rule member_catalogue applies', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261006170000_modular_asks_only_without_a_brand.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(sql).toContain("(NOT erp.sells OR (erp.brand IS NULL AND COALESCE(cm.brand_code = 'RIDER', FALSE))) AS rider")
    expect(sql).toContain("UPPER(BTRIM(COALESCE(m.category, e.category, ''))) IN ('MATTRESS', 'SOFA') AS sells")
    expect(sql).toContain('WHERE o.brand = ANY (p_brands) OR o.rider')
    expect(RIDER).toBe('RIDER')
  })
})

describe('needsBrandPick — when Modular asks for a ladder and a section', () => {
  it.each<[string | null, string | null, boolean]>([
    // A mattress or a sofa the ERP gives no brand the portal knows (MYLATEX, none).
    ['MATTRESS', null, true],
    ['sofa', null, true],
    [' SOFA ', null, true],
    // Branded: the ERP's brand and section, nothing to ask.
    ['MATTRESS', 'AKEMI', false],
    ['SOFA', 'ZANOTTI', false],
    // A rider's margin follows the cart's brand: never asked.
    ['BEDFRAME', null, false],
    ['ACCESSORY', null, false],
    ['FABRIC_ACCESSORY', null, false],
    [null, null, false],
  ])('%j with ERP brand %j → %s', (category, derived, asked) => {
    expect(needsBrandPick(category, derived)).toBe(asked)
  })

  it('only a mattress or a sofa sells under a brand', () => {
    expect(['MATTRESS', 'SOFA', 'mattress'].map(sellsUnderBrand)).toEqual([true, true, true])
    expect(['BEDFRAME', 'ACCESSORY', 'BEDLINES', 'SERVICE', '', null].map(sellsUnderBrand)).toEqual([false, false, false, false, false, false])
  })

  it('is the rule member_catalogue applies: a pick is read only where the ERP gives a mattress or a sofa no brand', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261006170000_modular_asks_only_without_a_brand.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(sql).toContain('CASE WHEN erp.sells AND erp.brand IS NULL\n                    THEN COALESCE(cm.calc_category,')
    expect(sql).toContain('CASE WHEN NOT erp.sells THEN NULL\n                    WHEN erp.brand IS NOT NULL THEN erp.brand')
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
