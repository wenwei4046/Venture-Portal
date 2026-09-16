import { describe, it, expect } from 'vitest'
import {
  splitItemCode,
  toSeatHeightCosts,
  normaliseComboModules,
  comboSlotsKey,
  toPriceGrid,
  parseErpProductBatch,
  matchComboSlots,
  pickComboCost,
  ERP_PRODUCTS_MAX_ROWS,
  type CanonicalCombo,
} from './products'

// A row shaped the way scm.mfg_products really is — the column names were read
// off the ERP's own list select, not guessed: `code, name, category,
// base_model, size_code, size_label, base_price_sen, price1_sen, sell_price_sen,
// unit_m3_milli, status, branding, barcode, seat_height_prices`.
const skuRow = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  code: '8030-1A(LHF)',
  name: 'SOFA 8030 1A LHF',
  category: 'SOFA',
  base_model: '8030',
  size_code: '1A(LHF)',
  size_label: null,
  branding: 'zanotti',
  barcode: '9551234567890',
  uom: 'UNIT',
  unit_m3_milli: 1250,
  status: 'ACTIVE',
  cost_price_sen: 165000,
  base_price_sen: null,
  price1_sen: null,
  sell_price_sen: 833800,
  seat_height_prices: null,
  ...over,
})

describe('splitItemCode', () => {
  it('cuts a sectional at its first dash, like the ERP splitSofaCode', () => {
    expect(splitItemCode('8030-1A(LHF)')).toEqual({ baseModel: '8030', moduleCode: '1A(LHF)' })
  })

  it('keeps everything after the first dash when the module itself has one', () => {
    expect(splitItemCode('AK-SK + MICROFIL PIL')).toEqual({
      baseModel: 'AK',
      moduleCode: 'SK + MICROFIL PIL',
    })
  })

  it('leaves a dashless code as its own base with no module, so it can never match a combo slot', () => {
    expect(splitItemCode('1068 STOOL')).toEqual({ baseModel: '1068 STOOL', moduleCode: null })
  })

  it('does not treat a leading dash as a split', () => {
    expect(splitItemCode('-ODD')).toEqual({ baseModel: '-ODD', moduleCode: null })
  })
})

describe('toSeatHeightCosts', () => {
  it('converts sen to ringgit and keeps the tier', () => {
    expect(
      toSeatHeightCosts([
        { height: '30', tier: 'PRICE_2', priceSen: 165000 },
        { height: '24', tier: 'PRICE_1', priceSen: 150000 },
      ]),
    ).toEqual([
      { height: '30', tier: 'PRICE_2', price: 1650 },
      { height: '24', tier: 'PRICE_1', price: 1500 },
    ])
  })

  it('DROPS a zero-priced height rather than carrying it as free', () => {
    // A zero here would resolve as "this module costs nothing", which is the
    // exact defect the mirror exists to remove.
    expect(toSeatHeightCosts([{ height: '30', tier: 'PRICE_2', priceSen: 0 }])).toBeNull()
  })

  it('is null for a non-array (a sofa row that never populated the grid)', () => {
    expect(toSeatHeightCosts(null)).toBeNull()
    expect(toSeatHeightCosts({})).toBeNull()
  })
})

describe('normaliseComboModules', () => {
  it('sorts the codes inside a slot', () => {
    expect(normaliseComboModules([['2A(RHF)', '2A(LHF)']])).toEqual([['2A(LHF)', '2A(RHF)']])
  })

  it('accepts the legacy flat form, one code per slot', () => {
    expect(normaliseComboModules(['1A(LHF)', '1NA'])).toEqual([['1A(LHF)'], ['1NA']])
  })

  it('drops empty slots and blank codes', () => {
    expect(normaliseComboModules([[], ['  '], ['1NA']])).toEqual([['1NA']])
  })
})

describe('comboSlotsKey', () => {
  it('is the same for two spellings of one combo', () => {
    const a = comboSlotsKey([['L(RHF)', 'L(LHF)'], ['2A(LHF)', '2A(RHF)']])
    const b = comboSlotsKey([['2A(RHF)', '2A(LHF)'], ['L(LHF)', 'L(RHF)']])
    expect(a).toBe(b)
  })

  it('differs when the slot-set differs', () => {
    expect(comboSlotsKey([['1A(LHF)']])).not.toBe(comboSlotsKey([['1A(RHF)']]))
  })
})

describe('toPriceGrid', () => {
  it('converts each height from sen to ringgit', () => {
    expect(toPriceGrid({ '24': 519000, '30': 571000 })).toEqual({ '24': 5190, '30': 5710 })
  })

  it('keeps an unpriced height as null rather than zero', () => {
    // "not priced at this height" and "free at this height" are different
    // answers; only one may reach a margin.
    expect(toPriceGrid({ '24': null })).toEqual({ '24': null })
  })
})

describe('parseErpProductBatch', () => {
  it('reads the ERP row shape into the portal shape', () => {
    const r = parseErpProductBatch({ snapshotAt: '2026-09-17T00:00:00Z', products: [skuRow()] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.batch.products[0]).toMatchObject({
      itemCode: '8030-1A(LHF)',
      description: 'SOFA 8030 1A LHF',
      category: 'SOFA',
      brand: 'ZANOTTI',
      baseModel: '8030',
      moduleCode: '1A(LHF)',
      costPrice: 1650,
      sellPrice: 8338,
      unitM3: 1.25,
      active: true,
    })
  })

  it('never uses the selling price as a cost', () => {
    const r = parseErpProductBatch({ products: [skuRow({ cost_price_sen: null })] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.batch.products[0].costPrice).toBeNull()
    expect(r.batch.products[0].sellPrice).toBe(8338)
  })

  it('treats a SKU with no status as active — an unknown must not un-cost history', () => {
    const r = parseErpProductBatch({ products: [skuRow({ status: null })] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.batch.products[0].active).toBe(true)
  })

  it('honours an explicit inactive status', () => {
    const r = parseErpProductBatch({ products: [skuRow({ status: 'INACTIVE' })] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.batch.products[0].active).toBe(false)
  })

  it('skips a row with no code but keeps the rest of the batch', () => {
    const r = parseErpProductBatch({ products: [{ name: 'nameless' }, skuRow()] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.batch.products).toHaveLength(1)
  })

  it('reads a combo cost grid and selling grid off the same row', () => {
    const r = parseErpProductBatch({
      combos: [{
        id: 'c-1',
        base_model: '2376',
        modules: [['1A(RHF)'], ['1NA'], ['L(LHF)', 'L(RHF)']],
        tier: 'PRICE_2',
        prices_by_height: { '30': 227000 },
        selling_prices_by_height: { '30': 340000 },
        effective_from: '2026-08-09',
      }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.batch.combos[0]).toMatchObject({
      erpId: 'c-1',
      baseModel: '2376',
      tier: 'PRICE_2',
      costByHeight: { '30': 2270 },
      sellingByHeight: { '30': 3400 },
      effectiveFrom: '2026-08-09',
      supplierId: null,
    })
  })

  it('refuses a delivery carrying neither products nor combos', () => {
    expect(parseErpProductBatch({ products: [] })).toEqual({
      ok: false,
      error: 'delivery carried neither products nor combos',
    })
  })

  it('refuses a batch over the row cap', () => {
    const r = parseErpProductBatch({ products: new Array(ERP_PRODUCTS_MAX_ROWS + 1).fill(skuRow()) })
    expect(r.ok).toBe(false)
  })

  it('refuses a products field that is not an array', () => {
    expect(parseErpProductBatch({ products: {} })).toEqual({
      ok: false,
      error: 'products must be an array',
    })
  })
})

describe('matchComboSlots', () => {
  it('covers each slot with a distinct built module, ignoring order', () => {
    expect(matchComboSlots(['L(RHF)', '2A(LHF)'], [['2A(LHF)', '2A(RHF)'], ['L(LHF)', 'L(RHF)']]))
      .toEqual([0, 1])
  })

  it('allows extras — a build may carry more modules than the combo has slots', () => {
    expect(matchComboSlots(['1A(LHF)', '1NA', '1A(RHF)'], [['1A(LHF)'], ['1NA']]))
      .toEqual([0, 1])
  })

  it('returns null when a slot cannot be filled', () => {
    expect(matchComboSlots(['1A(LHF)'], [['1A(LHF)'], ['1NA']])).toBeNull()
  })

  it('does not strand a slot when OR-sets overlap', () => {
    // A left-to-right greedy pass takes X for the first slot and then cannot
    // fill the second. Maximum matching must still cover both.
    expect(matchComboSlots(['X', 'Y'], [['X', 'Y'], ['X']])).toEqual([0, 1])
  })

  it('will not consume one built module for two slots', () => {
    expect(matchComboSlots(['X'], [['X'], ['X']])).toBeNull()
  })
})

describe('pickComboCost', () => {
  const combo = (over: Partial<CanonicalCombo> = {}): CanonicalCombo => ({
    erpId: 'c-1',
    baseModel: '2376',
    modules: [['1A(RHF)'], ['1NA']],
    slotsKey: comboSlotsKey([['1A(RHF)'], ['1NA']]),
    tier: 'PRICE_2',
    customerId: null,
    supplierId: null,
    costByHeight: { '30': 2270 },
    sellingByHeight: { '30': 3400 },
    label: '1A(R)+1NA',
    effectiveFrom: '2026-08-09',
    deletedAt: null,
    ...over,
  })

  const query = { baseModel: '2376', modules: ['1A(RHF)', '1NA'], height: '30', asOf: '2026-09-17' }

  it('returns the cost and the selling price of the matched subset', () => {
    const hit = pickComboCost(query, [combo()])
    expect(hit).toMatchObject({ cost: 2270, selling: 3400 })
  })

  it('is null when the height is not priced — never zero', () => {
    expect(pickComboCost({ ...query, height: '35' }, [combo()])).toBeNull()
  })

  it('is null for a soft-deleted row', () => {
    expect(pickComboCost(query, [combo({ deletedAt: '2026-09-01T00:00:00Z' })])).toBeNull()
  })

  it('ignores a row that is not yet effective', () => {
    expect(pickComboCost(query, [combo({ effectiveFrom: '2026-12-01' })])).toBeNull()
  })

  it('prefers the sales-side master row over a supplier row', () => {
    const hit = pickComboCost(query, [
      combo({ erpId: 'sup', supplierId: 's-1', costByHeight: { '30': 1900 } }),
      combo({ erpId: 'master' }),
    ])
    expect(hit?.combo.erpId).toBe('master')
  })

  it('takes the freshest effective row within one scope', () => {
    const hit = pickComboCost(query, [
      combo({ erpId: 'old', effectiveFrom: '2026-07-01', costByHeight: { '30': 2000 } }),
      combo({ erpId: 'new', effectiveFrom: '2026-09-01', costByHeight: { '30': 2270 } }),
    ])
    expect(hit?.combo.erpId).toBe('new')
  })

  it('prefers the combo covering more of the build', () => {
    const wide = combo({
      erpId: 'wide',
      modules: [['1A(RHF)'], ['1NA'], ['L(LHF)']],
      costByHeight: { '30': 5190 },
    })
    const hit = pickComboCost(
      { ...query, modules: ['1A(RHF)', '1NA', 'L(LHF)'] },
      [combo(), wide],
    )
    expect(hit?.combo.erpId).toBe('wide')
  })

  it('does not match another base model', () => {
    expect(pickComboCost({ ...query, baseModel: '8030' }, [combo()])).toBeNull()
  })
})
