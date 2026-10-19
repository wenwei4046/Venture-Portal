import { describe, expect, it } from 'vitest'
import {
  EditError,
  parseMoney,
  validateComboPrices,
  validateComboRemovals,
  validateNewCombo,
  validateModelEdit,
  validateOptionPrices,
  validateSkuPrices,
  type ComboPriceEdit,
  type ModelEdit,
  type SkuPriceEdit,
} from './edits'
import { CALC_CATEGORIES } from './options'

/**
 * What the Principal types on the Product List, before it becomes the price a
 * margin is measured against. THE RULE: a price is a number or nothing — blank
 * clears it and is never read as 0 (a zero cost is a 100% margin).
 */

describe('parseMoney', () => {
  it.each<[string | number, number]>([
    ['1,234.50', 1234.5],
    ['1,234,567.89', 1234567.89],
    ['1234', 1234],
    [' 12.30 ', 12.3],
    ['0.29', 0.29],
    ['0.05', 0.05],
    ['0', 0],
    ['99,999,999', 99999999],
    [12.5, 12.5],
    [0, 0],
  ])('%j → %d', (raw, amount) => {
    expect(parseMoney(raw, 'Price')).toBe(amount)
  })

  it.each(['', '   ', null, undefined])('blank %j clears the price — null, never 0', raw => {
    expect(parseMoney(raw, 'Price')).toBeNull()
  })

  it.each(['1.234', '1.', '.5', '+1', '1e3', 'abc', '12 34', 'RM12', '12-', '--1', '１２'])('refuses %j — not an amount', raw => {
    expect(() => parseMoney(raw, 'Price')).toThrow(`Price: "${raw}" is not an amount (up to two decimals)`)
  })

  it('refuses a JS number carrying float noise rather than rounding it', () => {
    expect(() => parseMoney(0.1 + 0.2, 'Price')).toThrow('is not an amount')
  })

  it('names what was being typed in the message', () => {
    expect(() => parseMoney('x', 'Price at 30 · PRICE_2')).toThrow('Price at 30 · PRICE_2: "x" is not an amount')
  })

  it('refuses a negative price…', () => {
    expect(() => parseMoney('-5', 'Price')).toThrow('Price: a price cannot be negative')
  })

  it('…unless asked to allow one: a surcharge may take money off', () => {
    expect(parseMoney('-40', 'No Side Panel', true)).toBe(-40)
    expect(parseMoney('-0.50', 'x', true)).toBe(-0.5)
  })

  it('caps at 99,999,999 either way', () => {
    expect(parseMoney('99999999', 'Price')).toBe(99999999)
    expect(() => parseMoney('100000000', 'Price')).toThrow('Price: "100000000" is out of range')
    expect(() => parseMoney('99999999.01', 'Price')).toThrow('out of range')
    expect(() => parseMoney('-100000000', 'x', true)).toThrow('out of range')
  })

  it('throws an EditError, which the Server Action turns into the message', () => {
    expect(() => parseMoney('abc', 'Price')).toThrow(EditError)
  })
})

describe('validateSkuPrices', () => {
  const edit = (over: Partial<SkuPriceEdit> = {}): SkuPriceEdit => ({ erpId: 'mfg-1', price: '100', ...over })

  it('one row per SKU, in the table’s shape', () => {
    expect(validateSkuPrices([edit({ price: '1,200.00' }), edit({ erpId: 'mfg-2', price: '35.5' })])).toEqual([
      { erp_product_id: 'mfg-1', price: 1200, price_grid: null },
      { erp_product_id: 'mfg-2', price: 35.5, price_grid: null },
    ])
  })

  it.each(['', '  ', null])('a blank price (%j) clears it — null, never 0', price => {
    expect(validateSkuPrices([edit({ price })])[0].price).toBeNull()
  })

  it('a typed 0 is a price of 0, not a blank', () => {
    expect(validateSkuPrices([edit({ price: '0' })])[0].price).toBe(0)
  })

  it('refuses a negative price', () => {
    expect(() => validateSkuPrices([edit({ price: '-1' })])).toThrow('Price: a price cannot be negative')
  })

  it('refuses nothing to save', () => {
    expect(() => validateSkuPrices([])).toThrow('Nothing to save')
    expect(() => validateSkuPrices('mfg-1' as unknown as SkuPriceEdit[])).toThrow('Nothing to save')
  })

  it('takes 5,000 SKUs at once and refuses one more', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => edit({ erpId: `mfg-${i}` }))
    expect(validateSkuPrices(many(5000))).toHaveLength(5000)
    expect(() => validateSkuPrices(many(5001))).toThrow('Save at most 5,000 SKUs at a time')
  })

  it('refuses a SKU named twice', () => {
    expect(() => validateSkuPrices([edit(), edit({ price: '200' })])).toThrow('SKU mfg-1 appears twice')
  })

  it.each(['', 'a b', 'x'.repeat(81), 'mfg/1', 'mfg-1;', "mfg'1"])('refuses the SKU id %j', erpId => {
    expect(() => validateSkuPrices([edit({ erpId })])).toThrow('A row names no SKU')
  })

  it('refuses a row that is not a row, or whose id is not text', () => {
    expect(() => validateSkuPrices([null as unknown as SkuPriceEdit])).toThrow('A row names no SKU')
    expect(() => validateSkuPrices([{ erpId: 7, price: '1' } as unknown as SkuPriceEdit])).toThrow('A row names no SKU')
  })

  it('accepts the ERP id alphabet up to 80 characters', () => {
    expect(validateSkuPrices([edit({ erpId: 'mfg-1_2.3:4' }), edit({ erpId: 'x'.repeat(80) })])).toHaveLength(2)
  })

  describe('a sofa module’s grid', () => {
    const cell = (height: string, tier: string, price: string | null) => ({ height, tier, price })

    it('keeps each priced cell: height trimmed but as typed, tier upper-cased, price parsed', () => {
      expect(validateSkuPrices([edit({ price: null, grid: [cell(' 30" ', 'price_2', '1,200')] })])[0]).toEqual({
        erp_product_id: 'mfg-1',
        price: null,
        price_grid: [{ height: '30"', tier: 'PRICE_2', price: 1200 }],
      })
    })

    it('drops a blank cell — a blank is no price, never 0', () => {
      const grid = [cell('30', 'PRICE_1', ''), cell('30', 'PRICE_2', '120'), cell('35', 'PRICE_2', null)]
      expect(validateSkuPrices([edit({ grid })])[0].price_grid).toEqual([{ height: '30', tier: 'PRICE_2', price: 120 }])
    })

    it('an all-blank grid, or no grid at all, clears the grid (null)', () => {
      expect(validateSkuPrices([edit({ grid: [cell('30', 'PRICE_2', '')] })])[0].price_grid).toBeNull()
      expect(validateSkuPrices([edit({ grid: [] })])[0].price_grid).toBeNull()
      expect(validateSkuPrices([edit({ grid: null })])[0].price_grid).toBeNull()
      expect(validateSkuPrices([edit()])[0].price_grid).toBeNull()
    })

    it('the same height at another tier is another cell', () => {
      const grid = [cell('30', 'PRICE_1', '100'), cell('30', 'PRICE_2', '120')]
      expect(validateSkuPrices([edit({ grid })])[0].price_grid).toHaveLength(2)
    })

    it('refuses two prices for one cell — two spellings of one height count as one', () => {
      const grid = [cell('30', 'PRICE_2', '120'), cell('30"', 'price_2', '125')]
      expect(() => validateSkuPrices([edit({ grid })])).toThrow('Two prices for 30" · PRICE_2')
    })

    it('a blank repeat of a cell is not a second price', () => {
      const grid = [cell('30', 'PRICE_2', '120'), cell('30', 'PRICE_2', '')]
      expect(validateSkuPrices([edit({ grid })])[0].price_grid).toEqual([{ height: '30', tier: 'PRICE_2', price: 120 }])
    })

    it.each(['PRICE_4', 'P2', '', 'PRICE 2'])('refuses the fabric tier %j', tier => {
      expect(() => validateSkuPrices([edit({ grid: [cell('30', tier, '120')] })])).toThrow('Unknown fabric tier')
    })

    it('refuses an unknown tier even on a blank cell', () => {
      expect(() => validateSkuPrices([edit({ grid: [cell('30', 'PRICE_9', '')] })])).toThrow('Unknown fabric tier PRICE_9')
    })

    it.each(['', '   ', 'x'.repeat(21)])('refuses a cell whose seat height is %j', height => {
      expect(() => validateSkuPrices([edit({ grid: [cell(height, 'PRICE_2', '120')] })])).toThrow('A grid cell has no seat height')
    })

    it('takes a seat height of up to 20 characters', () => {
      expect(validateSkuPrices([edit({ grid: [cell('x'.repeat(20), 'PRICE_2', '1')] })])[0].price_grid).toHaveLength(1)
    })

    it('a grid price follows the same money rules, named by its cell', () => {
      expect(() => validateSkuPrices([edit({ grid: [cell('30', 'PRICE_2', '-5')] })])).toThrow(
        'Price at 30 · PRICE_2: a price cannot be negative',
      )
      expect(() => validateSkuPrices([edit({ grid: [cell('30', 'PRICE_2', '1.234')] })])).toThrow(
        'Price at 30 · PRICE_2: "1.234" is not an amount',
      )
    })
  })
})

describe('validateModelEdit', () => {
  const MODEL_ID = '3c1c9c1e-0000-4000-8000-000000000012'
  const edit = (over: Partial<ModelEdit> = {}): ModelEdit => ({
    erpModelId: MODEL_ID,
    offered: true,
    enabled: {},
    gift: null,
    calcCategory: null,
    brandCode: null,
    skuOffered: {},
    ...over,
  })

  it('passes a clean edit through in the tables’ shape', () => {
    expect(
      validateModelEdit(
        edit({
          enabled: { sizes: ['30', '35'], specials: ['Nylon Fabric'] },
          gift: true,
          calcCategory: 'Sofa',
          brandCode: 'zanotti',
          skuOffered: { 'mfg-1': true, 'mfg-2': false },
        }),
      ),
    ).toEqual({
      model: {
        erp_model_id: MODEL_ID,
        offered: true,
        enabled: { sizes: ['30', '35'], specials: ['Nylon Fabric'] },
        gift: true,
        calc_category: 'Sofa',
        brand_code: 'ZANOTTI',
      },
      skus: [
        { erp_product_id: 'mfg-1', offered: true },
        { erp_product_id: 'mfg-2', offered: false },
      ],
    })
  })

  it.each(['', 'not-a-uuid', 'mfg-1', `${MODEL_ID}x`, MODEL_ID.replace(/-/g, '')])('refuses the model id %j', erpModelId => {
    expect(() => validateModelEdit(edit({ erpModelId }))).toThrow('No model named')
  })

  it('accepts a model id in capitals', () => {
    expect(validateModelEdit(edit({ erpModelId: MODEL_ID.toUpperCase() })).model.erp_model_id).toBe(MODEL_ID.toUpperCase())
  })

  it('trims and de-duplicates each option list, dropping blanks', () => {
    expect(validateModelEdit(edit({ enabled: { sizes: [' 30 ', '30', '', '  ', '35'] } })).model.enabled).toEqual({ sizes: ['30', '35'] })
  })

  it('de-duplicates exactly — case is kept', () => {
    expect(validateModelEdit(edit({ enabled: { leg_heights: ['Default', 'DEFAULT'] } })).model.enabled.leg_heights).toEqual([
      'Default',
      'DEFAULT',
    ])
  })

  it('drops a value longer than 80 characters rather than refusing the save', () => {
    const long = 'x'.repeat(81)
    expect(validateModelEdit(edit({ enabled: { specials: [long, 'x'.repeat(80)] } })).model.enabled.specials).toEqual(['x'.repeat(80)])
  })

  it.each(['sizes', 'leg_heights', 'specials', 'divan_heights', 'total_heights', 'gaps'])('accepts the option list %s', key => {
    expect(validateModelEdit(edit({ enabled: { [key]: ['a'] } })).model.enabled).toEqual({ [key]: ['a'] })
  })

  // A sofa's compartments and a bed frame's sizes are its SKUs, ticked per SKU.
  it.each(['compartments', 'fabrics', 'Sizes', ''])('refuses the option list %j', key => {
    expect(() => validateModelEdit(edit({ enabled: { [key]: ['a'] } }))).toThrow(`Unknown option list "${key}"`)
  })

  it('refuses an option list that is not a list', () => {
    const enabled = { sizes: '30' } as unknown as Record<string, string[]>
    expect(() => validateModelEdit(edit({ enabled }))).toThrow('sizes must be a list')
  })

  it('offered and gift are true only when literally true; a null gift stays null (derived)', () => {
    const loose = edit({ offered: 'true' as unknown as boolean, gift: 'yes' as unknown as boolean })
    expect(validateModelEdit(loose).model).toMatchObject({ offered: false, gift: false })
    expect(validateModelEdit(edit({ gift: false })).model.gift).toBe(false)
    expect(validateModelEdit(edit({ gift: null })).model.gift).toBeNull()
    expect(validateModelEdit(edit({ gift: undefined as unknown as null })).model.gift).toBeNull()
  })

  it.each([...CALC_CATEGORIES])('accepts the calculator section %s', calcCategory => {
    expect(validateModelEdit(edit({ calcCategory })).model.calc_category).toBe(calcCategory)
  })

  it('refuses a section spelled any other way; blank means derived', () => {
    expect(() => validateModelEdit(edit({ calcCategory: 'sofa' }))).toThrow('Unknown calculator section "sofa"')
    expect(() => validateModelEdit(edit({ calcCategory: 'Bedframe' }))).toThrow('Unknown calculator section "Bedframe"')
    expect(validateModelEdit(edit({ calcCategory: '' })).model.calc_category).toBeNull()
  })

  it('a brand code is trimmed and upper-cased', () => {
    expect(validateModelEdit(edit({ brandCode: ' akemi ' })).model.brand_code).toBe('AKEMI')
    expect(validateModelEdit(edit({ brandCode: 'dunlop_2-x' })).model.brand_code).toBe('DUNLOP_2-X')
    expect(validateModelEdit(edit({ brandCode: 'B'.repeat(30) })).model.brand_code).toBe('B'.repeat(30))
    expect(validateModelEdit(edit({ brandCode: '' })).model.brand_code).toBeNull()
  })

  it.each(['AK EMI', 'AKEMI!', 'B'.repeat(31), '   '])('refuses the brand code %j', brandCode => {
    expect(() => validateModelEdit(edit({ brandCode }))).toThrow('Brand code is not valid')
  })

  it('SKU ticks: only the SKUs listed, offered only when literally true', () => {
    const skuOffered = { 'mfg-1': true, 'mfg-2': 'yes' } as unknown as Record<string, boolean>
    expect(validateModelEdit(edit({ skuOffered })).skus).toEqual([
      { erp_product_id: 'mfg-1', offered: true },
      { erp_product_id: 'mfg-2', offered: false },
    ])
  })

  it('refuses a SKU tick that names no SKU', () => {
    expect(() => validateModelEdit(edit({ skuOffered: { 'mfg 1': true } }))).toThrow('A SKU tick names no SKU')
  })

  // 2026-10-19: a sofa's name of the portal's own — sent only when it changed.
  it('carries a model name only when the edit names one: tidied, and blank is none', () => {
    expect(validateModelEdit(edit()).model).not.toHaveProperty('model_name')
    expect(validateModelEdit(edit({ modelName: '  Roma   Grande ' })).model.model_name).toBe('Roma Grande')
    expect(validateModelEdit(edit({ modelName: ' \t ' })).model.model_name).toBeNull()
    expect(validateModelEdit(edit({ modelName: null })).model.model_name).toBeNull()
    expect(validateModelEdit(edit({ modelName: 'x'.repeat(80) })).model.model_name).toBe('x'.repeat(80))
  })

  it('refuses a model name past 80 characters, or one that is not text', () => {
    expect(() => validateModelEdit(edit({ modelName: 'x'.repeat(81) }))).toThrow('A model name is at most 80 characters')
    expect(() => validateModelEdit(edit({ modelName: 5066 as unknown as string }))).toThrow('A model name is text')
  })

  it('no enabled lists and no ticks is a valid save', () => {
    const e = edit({ enabled: undefined as unknown as Record<string, string[]>, skuOffered: undefined as unknown as Record<string, boolean> })
    const saved = validateModelEdit(e)
    expect(saved.model.enabled).toEqual({})
    expect(saved.skus).toEqual([])
  })
})

describe('validateOptionPrices', () => {
  it('upserts what is priced and clears what is blank', () => {
    expect(
      validateOptionPrices('bedframe_divan_heights', [
        { value: '10"', price: '30' },
        { value: ' 8" ', price: '' },
        { value: '12"', price: null },
        { value: '14"', price: '0' },
      ]),
    ).toEqual({
      upserts: [
        { pool: 'bedframe_divan_heights', value: '10"', price: 30 },
        // A typed 0 is a price: choosing it adds nothing, on purpose.
        { pool: 'bedframe_divan_heights', value: '14"', price: 0 },
      ],
      clears: ['8"', '12"'],
    })
  })

  // 2026-10-06: every price on Maintenance is what the customer pays — never negative,
  // a special or a sofa's leg as much as a bed frame's divan.
  it.each(['bedframe_specials', 'sofa_leg_heights', 'sofa_specials'])('refuses a negative price on %s — a charge is never negative', pool => {
    expect(() => validateOptionPrices(pool, [{ value: 'No Side Panel', price: '-40' }])).toThrow('a price cannot be negative')
  })

  it('prices a special and a sofa’s leg — what the customer pays for them', () => {
    expect(validateOptionPrices('bedframe_specials', [{ value: 'Hydraulic', price: '300' }]).upserts).toEqual([
      { pool: 'bedframe_specials', value: 'Hydraulic', price: 300 },
    ])
    expect(validateOptionPrices('sofa_leg_heights', [{ value: '6"', price: '100' }]).upserts).toEqual([
      { pool: 'sofa_leg_heights', value: '6"', price: 100 },
    ])
  })

  it.each(['sofa_sizes'])('refuses a price on %s — that list carries no price', pool => {
    expect(() => validateOptionPrices(pool, [{ value: '12"', price: '5' }])).toThrow('That list carries no price')
  })

  // 2026-10-05: a bed frame's gap is charged to the customer, like its divan and leg.
  it('prices a gap — what the customer pays for it', () => {
    expect(validateOptionPrices('bedframe_gaps', [{ value: '12"', price: '20' }]).upserts).toEqual([
      { pool: 'bedframe_gaps', value: '12"', price: 20 },
    ])
  })

  it.each(['bedframe_divan_heights', 'bedframe_leg_heights', 'bedframe_gaps', 'bedframe_total_heights'])('a charge on %s cannot be negative', pool => {
    expect(() => validateOptionPrices(pool, [{ value: '6"', price: '-10' }])).toThrow('a price cannot be negative')
  })

  it.each(['', 'mattress_sizes', 'Sofa_specials', 'sofa-specials', 'bedframe_', 'sofa_specials; drop', 'sofa_Specials'])(
    'refuses the pool %j',
    pool => {
      expect(() => validateOptionPrices(pool, [{ value: 'x', price: '1' }])).toThrow('Unknown pool')
    },
  )

  it('refuses a pool it does not know — only the priced pools carry a price', () => {
    expect(() => validateOptionPrices('sofa_armrests', [{ value: 'x', price: '1' }])).toThrow('That list carries no price')
  })

  it('refuses an option with no value', () => {
    expect(() => validateOptionPrices('sofa_specials', [{ value: '  ', price: '1' }])).toThrow('An option names no value')
  })

  it('two decimals at most, the error naming the option', () => {
    expect(() => validateOptionPrices('sofa_leg_heights', [{ value: '6"', price: '1.234' }])).toThrow('6": "1.234" is not an amount')
  })

  it('an empty save is not an error', () => {
    expect(validateOptionPrices('sofa_specials', [])).toEqual({ upserts: [], clears: [] })
  })
})

describe('validateComboPrices', () => {
  const edit = (over: Partial<ComboPriceEdit> = {}): ComboPriceEdit => ({
    baseModel: '8030',
    slotsKey: '[["1S"], ["2S"], ["3S"]]',
    tier: null,
    prices: { '30': '3,200' },
    ...over,
  })

  it('a price per seat height; a blank height is left out, never 0', () => {
    expect(validateComboPrices([edit({ prices: { '30': '3,200', '35': '', '28': null } })])).toEqual([
      { base_model: '8030', slots_key: '[["1S"], ["2S"], ["3S"]]', tier: '', price_by_height: { '30': 3200 } },
    ])
  })

  it('passes the stored slots key through verbatim, trimmed', () => {
    expect(validateComboPrices([edit({ slotsKey: ' [["1S"]] ' })])[0].slots_key).toBe('[["1S"]]')
  })

  it('no tier means any tier, stored as ""', () => {
    expect(validateComboPrices([edit({ tier: null })])[0].tier).toBe('')
    expect(validateComboPrices([edit({ tier: '' })])[0].tier).toBe('')
  })

  it('a tier is upper-cased and must be a known one', () => {
    expect(validateComboPrices([edit({ tier: 'price_1' })])[0].tier).toBe('PRICE_1')
    expect(() => validateComboPrices([edit({ tier: 'PRICE_4' })])).toThrow('Unknown tier PRICE_4')
  })

  it('a height is trimmed; a blank or over-long height is skipped', () => {
    const prices = { ' 30 ': '1', '': '2', '  ': '3', ['x'.repeat(21)]: '4', ['y'.repeat(20)]: '5' }
    expect(validateComboPrices([edit({ prices })])[0].price_by_height).toEqual({ '30': 1, ['y'.repeat(20)]: 5 })
  })

  it('a typed 0 is kept as 0 — the engines are what ignore a combo priced at nothing', () => {
    expect(validateComboPrices([edit({ prices: { '30': '0' } })])[0].price_by_height).toEqual({ '30': 0 })
  })

  it('every height blank → an empty map, which the save turns into deleting the price row', () => {
    expect(validateComboPrices([edit({ prices: { '30': '', '35': null } })])[0].price_by_height).toEqual({})
    expect(validateComboPrices([edit({ prices: undefined as unknown as Record<string, string | null> })])[0].price_by_height).toEqual({})
  })

  it('refuses a negative combo price, naming the combo and the height', () => {
    expect(() => validateComboPrices([edit({ prices: { '30': '-1' } })])).toThrow('8030 at 30: a price cannot be negative')
  })

  it.each<[Partial<ComboPriceEdit>]>([[{ baseModel: '  ' }], [{ slotsKey: '' }], [{ slotsKey: '1S,2S' }], [{ slotsKey: '{"a":1}' }]])(
    'refuses an incomplete row %j',
    over => {
      expect(() => validateComboPrices([edit(over)])).toThrow('A combo row is incomplete')
    },
  )

  it('refuses nothing to save', () => {
    expect(() => validateComboPrices([])).toThrow('Nothing to save')
  })
})

// Found by the twin audit (2026-09-24): what the database would have refused
// with a raw constraint error, or quietly stored wrong, is caught here instead.
describe('the audit fixes', () => {
  it('never answers minus zero', () => {
    expect(Object.is(parseMoney('-0', 'x', true), 0)).toBe(true)
  })

  it('refuses the same option twice in one save, however it is spelled', () => {
    expect(() =>
      validateOptionPrices('bedframe_divan_heights', [{ value: '10"', price: '5' }, { value: '10”', price: '6' }]),
    ).toThrow(EditError)
  })

  it('upper-cases a combo base model and refuses two prices for one seat height', () => {
    const [row] = validateComboPrices([{ baseModel: '8030 ', slotsKey: '[["1A"]]', tier: null, prices: { '30': '2000' } }])
    expect(row.base_model).toBe('8030')
    expect(validateComboPrices([{ baseModel: 'abc', slotsKey: '[["1A"]]', tier: null, prices: {} }])[0].base_model).toBe('ABC')
    expect(() =>
      validateComboPrices([{ baseModel: '8030', slotsKey: '[["1A"]]', tier: null, prices: { '30': '2000', '30"': '2100' } }]),
    ).toThrow(EditError)
  })

  it('drops a null option value instead of storing the word "null"', () => {
    const { model } = validateModelEdit({
      erpModelId: '95ce74c0-c936-48c2-8d5a-f596fe1e4b2b',
      offered: true,
      enabled: { leg_heights: [null as unknown as string, 'Default', undefined as unknown as string] },
      gift: null,
      calcCategory: null,
      brandCode: null,
      skuOffered: {},
    })
    expect(model.enabled.leg_heights).toEqual(['Default'])
  })
})

describe('validateComboRemovals', () => {
  it('keys each set once, the way the table does', () => {
    expect(validateComboRemovals([
      { baseModel: ' 8030 ', slotsKey: '[["1NA"], ["2NA"]]' },
      { baseModel: '8030', slotsKey: '[["1NA"], ["2NA"]]' },
    ])).toEqual([{ base_model: '8030', slots_key: '[["1NA"], ["2NA"]]' }])
  })

  it('refuses nothing, too many, or a row without its key', () => {
    expect(() => validateComboRemovals([])).toThrow(EditError)
    expect(() => validateComboRemovals(Array.from({ length: 501 }, (_, i) => ({ baseModel: String(i), slotsKey: '[]' })))).toThrow('at most 500')
    expect(() => validateComboRemovals([{ baseModel: '', slotsKey: '[]' }])).toThrow('A combo row is incomplete')
    expect(() => validateComboRemovals([{ baseModel: '8030', slotsKey: '1NA+2NA' }])).toThrow('A combo row is incomplete')
  })
})

describe('validateNewCombo — a piece may be either side (2026-10-08)', () => {
  const base = { baseModel: ' 2376 ', label: '1A(R) + 1NA', prices: { PRICE_2: { '30': 1900 } } }

  it('keeps a slot of the modules it may be, trimmed, as the ERP writes one', () => {
    expect(validateNewCombo({ ...base, modules: [[' 1A(R)(LHF) ', '1A(R)(RHF)'], ['1NA']] }).modules)
      .toEqual([['1A(R)(LHF)', '1A(R)(RHF)'], ['1NA']])
  })

  it('refuses an empty piece, more than four, or one module twice', () => {
    expect(() => validateNewCombo({ ...base, modules: [[], ['1NA']] })).toThrow('Each piece is one compartment.')
    expect(() => validateNewCombo({ ...base, modules: [['A', 'B', 'C', 'D', 'E'], ['1NA']] })).toThrow('A compartment may be one of four modules at most.')
    expect(() => validateNewCombo({ ...base, modules: [['1A(LHF)', ' 1A(LHF)'], ['1NA']] })).toThrow('A compartment names the same module twice.')
    expect(() => validateNewCombo({ ...base, modules: [['1A(LHF)', 'a "b'], ['1NA']] })).toThrow('is not a compartment code')
  })
})
