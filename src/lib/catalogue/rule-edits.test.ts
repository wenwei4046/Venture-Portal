import { describe, expect, it } from 'vitest'
import { EditError, kpiAddKey, parseRatio, teamCost, validateCostSetting, validateKpiItems } from './rule-edits'
import { kpiItemKind } from '@/lib/commission/kpi'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('parseRatio', () => {
  it('reads a ratio as typed', () => {
    expect(parseRatio('0.6', 'r')).toBe(0.6)
    expect(parseRatio(' .65 ', 'r')).toBe(0.65)
    expect(parseRatio('1', 'r')).toBe(1)
    expect(parseRatio('0.7000', 'r')).toBe(0.7)
    expect(parseRatio('10', 'r')).toBe(10)
  })

  it('reads blank as none', () => {
    expect(parseRatio('', 'r')).toBeNull()
    expect(parseRatio('  ', 'r')).toBeNull()
    expect(parseRatio(null, 'r')).toBeNull()
  })

  it('refuses what is not a ratio', () => {
    expect(() => parseRatio('0', 'Fair')).toThrow(/above 0 and at most 10/)
    expect(() => parseRatio('10.5', 'Fair')).toThrow(/above 0 and at most 10/)
    expect(() => parseRatio('-0.6', 'Fair')).toThrow(/not a ratio/)
    expect(() => parseRatio('70%', 'Fair')).toThrow(/not a ratio/)
    expect(() => parseRatio('0.65432', 'Fair')).toThrow(/four decimals/)
  })
})

describe('validateCostSetting', () => {
  it("splits SKUs' ratios into set and back-to-the-department", () => {
    expect(
      validateCostSetting({
        divisor: '0.7',
        ratios: [
          { erpId: 'p-1', ratio: '0.6' },
          { erpId: 'p-2', ratio: '' },
        ],
      }),
    ).toEqual({ divisor: 0.7, ratios: [{ erp_product_id: 'p-1', ratio: 0.6 }], removes: ['p-2'], brands: [] })
  })

  // 2026-11-07: a rider SKU's ratio for a brand — set, or blank to take it off.
  it("carries a rider SKU's brands: a ratio set, a blank one taken off", () => {
    expect(
      validateCostSetting({
        ratios: [],
        brands: [
          { erpId: 'trion-k', brand: 'DUNLOP', ratio: '0.6', label: 'TRION (A)-(K)' },
          { erpId: 'trion-k', brand: 'ERGOTEX', ratio: ' .5 ' },
          { erpId: 'trion-k', brand: 'AKEMI', ratio: '' },
        ],
      }),
    ).toEqual({
      divisor: null,
      ratios: [],
      removes: [],
      brands: [
        { erp_product_id: 'trion-k', brand_code: 'DUNLOP', ratio: 0.6 },
        { erp_product_id: 'trion-k', brand_code: 'ERGOTEX', ratio: 0.5 },
        { erp_product_id: 'trion-k', brand_code: 'AKEMI', ratio: null },
      ],
    })
  })

  it('refuses a brand named twice for a SKU, a brand that is no code, and a ratio that is none', () => {
    expect(() => validateCostSetting({ ratios: [], brands: [
      { erpId: 'trion-k', brand: 'DUNLOP', ratio: '0.6', label: 'TRION (A)-(K)' },
      { erpId: 'trion-k', brand: 'DUNLOP', ratio: '0.5', label: 'TRION (A)-(K)' },
    ] })).toThrow('TRION (A)-(K) · DUNLOP appears twice')
    expect(() => validateCostSetting({ ratios: [], brands: [{ erpId: 'trion-k', brand: '', ratio: '0.6' }] })).toThrow('A row names no brand')
    expect(() => validateCostSetting({ ratios: [], brands: [{ erpId: 'trion-k', brand: 'AK;DROP', ratio: '0.6' }] })).toThrow('A row names no brand')
    expect(() => validateCostSetting({ ratios: [], brands: [{ erpId: 'trion-k', brand: 'DUNLOP', ratio: '0', label: 'TRION' }] }))
      .toThrow('TRION · DUNLOP: a ratio must be above 0 and at most 10')
    expect(() => validateCostSetting({ ratios: [], brands: [] })).toThrow('Nothing to save')
  })

  it("leaves the department's ratio alone unless it is sent", () => {
    expect(validateCostSetting({ ratios: [{ erpId: 'p-1', ratio: '0.6' }] }).divisor).toBeNull()
  })

  it("never blanks the department's ratio", () => {
    expect(() => validateCostSetting({ divisor: ' ', ratios: [] })).toThrow(/cannot be blank/)
  })

  it('names the SKU a bad ratio belongs to', () => {
    expect(() => validateCostSetting({ ratios: [{ erpId: 'p-1', ratio: 'abc', label: 'AK-ULTIMATE (K)' }] })).toThrow(
      /AK-ULTIMATE \(K\): "abc" is not a ratio/,
    )
  })

  it('refuses a SKU twice, a row with no SKU, and nothing at all', () => {
    expect(() => validateCostSetting({ ratios: [{ erpId: 'p-1', ratio: '0.6' }, { erpId: 'p-1', ratio: '0.5' }] })).toThrow(
      /appears twice/,
    )
    expect(() => validateCostSetting({ ratios: [{ erpId: 'bad id!', ratio: '0.6' }] })).toThrow(/names no SKU/)
    expect(() => validateCostSetting({ ratios: [] })).toThrow(EditError)
  })

  it('judges a cost at its ratio', () => {
    expect(teamCost(1000, 0.7)).toBeCloseTo(1428.5714, 4)
    expect(teamCost(1800, 0.6)).toBe(3000)
  })
})

describe('validateKpiItems', () => {
  it('reads adds, changes and removes into the rows the database takes', () => {
    expect(
      validateKpiItems({
        adds: [
          { source: 'sku', erpId: 'mfg-pillow', amount: '50' },
          { source: 'option', optionPool: 'bedframe_specials', optionValue: ' HB Straight ', amount: '200.00' },
        ],
        changes: [{ id: A, amount: '1,250.5' }],
        removes: [B, B],
      }),
    ).toEqual({
      adds: [
        { source: 'sku', erp_product_id: 'mfg-pillow', kpi_amount: 50 },
        { source: 'option', option_pool: 'bedframe_specials', option_value: 'HB Straight', kpi_amount: 200 },
      ],
      changes: [{ id: A, kpi_amount: 1250.5 }],
      removes: [B],
    })
  })

  it('keeps a zero amount — it still counts toward the monthly bonus', () => {
    expect(validateKpiItems({ adds: [{ source: 'sku', erpId: 'p', amount: '0' }], changes: [], removes: [] }).adds[0].kpi_amount).toBe(0)
  })

  it('refuses a blank or a negative amount, naming the item', () => {
    expect(() =>
      validateKpiItems({ adds: [{ source: 'option', optionPool: 'sofa_specials', optionValue: 'Nylon Fabric', amount: '' }], changes: [], removes: [] }),
    ).toThrow(/Nylon Fabric: give it a KPI amount/)
    expect(() => validateKpiItems({ adds: [], changes: [{ id: A, amount: '-5', label: 'HB Straight' }], removes: [] })).toThrow(
      /HB Straight: a KPI amount cannot be negative/,
    )
    expect(() => validateKpiItems({ adds: [], changes: [{ id: A, amount: '12.345' }], removes: [] })).toThrow(/two decimals/)
  })

  it("takes only a bed frame's or a sofa's special or fabric series", () => {
    expect(() =>
      validateKpiItems({ adds: [{ source: 'option', optionPool: 'bedframe_sizes', optionValue: 'Queen', amount: '5' }], changes: [], removes: [] }),
    ).toThrow(/bed frame's or a sofa's special or fabric series/)
  })

  // 2026-10-29: a fabric series is an option item of its own pool.
  it('takes a fabric series, a bed frame’s and a sofa’s apart', () => {
    expect(validateKpiItems({
      adds: [
        { source: 'option', optionPool: 'sofa_fabric_series', optionValue: ' PC151 ', amount: '50' },
        { source: 'option', optionPool: 'bedframe_fabric_series', optionValue: 'PC151', amount: '30' },
      ],
      changes: [],
      removes: [],
    }).adds).toEqual([
      { source: 'option', option_pool: 'sofa_fabric_series', option_value: 'PC151', kpi_amount: 50 },
      { source: 'option', option_pool: 'bedframe_fabric_series', option_value: 'PC151', kpi_amount: 30 },
    ])
    expect(() =>
      validateKpiItems({ adds: [{ source: 'option', optionPool: 'sofa_fabric_series', optionValue: '  ', amount: '5' }], changes: [], removes: [] }),
    ).toThrow(/fabric series has no name/)
  })

  it('refuses the same item twice, however it is spelled', () => {
    expect(() =>
      validateKpiItems({
        adds: [
          { source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', amount: '200' },
          { source: 'option', optionPool: 'bedframe_specials', optionValue: 'hb  straight', amount: '150' },
        ],
        changes: [],
        removes: [],
      }),
    ).toThrow(/added twice/)
  })

  it('refuses a row both changed and removed, and rows naming nothing', () => {
    expect(() => validateKpiItems({ adds: [], changes: [{ id: A, amount: '5' }], removes: [A] })).toThrow(/both changed and removed/)
    expect(() => validateKpiItems({ adds: [], changes: [{ id: 'nope', amount: '5' }], removes: [] })).toThrow(/names no KPI item/)
    expect(() => validateKpiItems({ adds: [], changes: [], removes: ['nope'] })).toThrow(/names no KPI item/)
    expect(() => validateKpiItems({ adds: [], changes: [], removes: [] })).toThrow(/Nothing to save/)
  })

  it('keys an item by what it is', () => {
    expect(kpiAddKey({ source: 'sku', erpId: 'p-1' })).toBe('sku:p-1')
    expect(kpiAddKey({ source: 'option', optionPool: 'sofa_specials', optionValue: ' Wooden  ARM ' })).toBe('option:sofa_specials:wooden arm')
  })

  it('says how a bill counts each kind', () => {
    expect(kpiItemKind({ source: 'sku' })).toEqual({ kind: 'SKU', counted: 'Per unit' })
    expect(kpiItemKind({ source: 'option', optionPool: 'bedframe_specials' })).toEqual({ kind: 'Bed frame special', counted: 'Per bed frame' })
    expect(kpiItemKind({ source: 'option', optionPool: 'sofa_specials' })).toEqual({ kind: 'Sofa special', counted: 'Once per sofa bill' })
  })

  // 2026-11-13 — Rules › KPI items edits a brand's own items (2990s; the user: "KPI item 那边我是可以手动去加的"):
  // a sofa special of the brand's, a name of its own, and what a unit pays by the month's units.
  describe("a brand's own item", () => {
    const BRAND = '383ddd53-18fd-4dfd-b31e-57df4e1d42d9'
    const latex = { source: 'option' as const, optionPool: 'sofa_specials', optionValue: 'Latex Seat', amount: '50', brandId: BRAND }

    it('is added under its brand with its name and its tiers — a blank tier row is no tier', () => {
      expect(validateKpiItems({
        adds: [{
          ...latex, optionValue: ' Latex Seat ', name: '  Upgrade   latex seat ',
          tiers: [{ minQty: '5', amount: '70' }, { minQty: '', amount: ' ' }, { minQty: ' 10 ', amount: '100.00' }],
        }],
        changes: [],
        removes: [],
      }).adds).toEqual([{
        source: 'option', option_pool: 'sofa_specials', option_value: 'Latex Seat', kpi_amount: 50, brand_id: BRAND,
        label: 'Upgrade latex seat', unit_tiers: [{ min_qty: 5, amount: 70 }, { min_qty: 10, amount: 100 }],
      }])
    })

    it('carries no name and no tiers when none were typed — the special names it, every unit pays the bonus', () => {
      expect(validateKpiItems({ adds: [{ ...latex, name: null, tiers: [] }], changes: [], removes: [] }).adds).toEqual([
        { source: 'option', option_pool: 'sofa_specials', option_value: 'Latex Seat', kpi_amount: 50, brand_id: BRAND },
      ])
    })

    it("is its brand's alone: the sub-department may list the same special, the brand not twice", () => {
      expect(kpiAddKey(latex)).toBe(`brand:${BRAND}:option:sofa_specials:latex seat`)
      expect(validateKpiItems({
        adds: [latex, { source: 'option', optionPool: 'sofa_specials', optionValue: 'Latex Seat', amount: '80' }],
        changes: [],
        removes: [],
      }).adds).toHaveLength(2)
      expect(() => validateKpiItems({ adds: [latex, { ...latex, optionValue: 'LATEX  seat', name: 'Latex again' }], changes: [], removes: [] }))
        .toThrow(/Latex again is added twice/)
    })

    it('is a sofa special, of a brand that is named, under a name of 120 characters at most', () => {
      expect(() => validateKpiItems({ adds: [{ ...latex, optionPool: 'bedframe_specials' }], changes: [], removes: [] }))
        .toThrow(/A brand's own KPI item is a sofa special/)
      expect(() => validateKpiItems({ adds: [{ ...latex, optionPool: 'sofa_fabric_series' }], changes: [], removes: [] }))
        .toThrow(/A brand's own KPI item is a sofa special/)
      expect(() => validateKpiItems({ adds: [{ ...latex, brandId: '2990S' }], changes: [], removes: [] })).toThrow(/names no brand/)
      expect(() => validateKpiItems({ adds: [{ ...latex, name: 'x'.repeat(121) }], changes: [], removes: [] })).toThrow(/at most 120 characters/)
      expect(validateKpiItems({ adds: [{ ...latex, name: 'x'.repeat(120) }], changes: [], removes: [] }).adds).toHaveLength(1)
    })

    it("refuses a name or tiers on an item that is not a brand's", () => {
      const own = { source: 'option' as const, optionPool: 'sofa_specials', optionValue: 'Nylon Fabric', amount: '50' }
      expect(() => validateKpiItems({ adds: [{ ...own, tiers: [{ minQty: '5', amount: '70' }] }], changes: [], removes: [] }))
        .toThrow(/Only a brand's own KPI item has a name and tiers of its own/)
      expect(() => validateKpiItems({ adds: [{ ...own, name: 'Upgrade' }], changes: [], removes: [] }))
        .toThrow(/Only a brand's own KPI item has a name and tiers of its own/)
    })

    it('reads a tier as whole units from 2 up, each above the one before, with what a unit then pays', () => {
      const withTiers = (tiers: Array<{ minQty: string | null; amount: string | null }>) =>
        () => validateKpiItems({ adds: [{ ...latex, name: 'Upgrade latex seat', tiers }], changes: [], removes: [] })
      expect(withTiers([{ minQty: '5.5', amount: '70' }])).toThrow(/Upgrade latex seat: a tier starts at a whole number of units/)
      expect(withTiers([{ minQty: 'five', amount: '70' }])).toThrow(/whole number of units/)
      expect(withTiers([{ minQty: '1', amount: '70' }])).toThrow(/a tier starts from 2 units — below that every unit pays the bonus/)
      expect(withTiers([{ minQty: '10', amount: '100' }, { minQty: '5', amount: '70' }])).toThrow(/each tier starts above the one before/)
      expect(withTiers([{ minQty: '5', amount: '70' }, { minQty: '5', amount: '80' }])).toThrow(/each tier starts above the one before/)
      expect(withTiers([{ minQty: '5', amount: '' }])).toThrow(/say what a unit pays from 5 units/)
      expect(withTiers([{ minQty: '', amount: '70' }])).toThrow(/whole number of units/)
      expect(withTiers([{ minQty: '5', amount: '-1' }])).toThrow(/a tier cannot pay less than nothing/)
      expect(withTiers([{ minQty: '5', amount: '1000000.01' }])).toThrow(/at most RM 1,000,000 a unit/)
      expect(withTiers([{ minQty: '5', amount: '70.123' }])).toThrow(/two decimals/)
      expect(withTiers([2, 3, 4, 5, 6, 7, 8].map(n => ({ minQty: String(n), amount: '10' })))).toThrow(/at most 6 tiers/)
      // RM 0 from some number of units on is a tier: it pays nothing more from there.
      expect(withTiers([{ minQty: '2', amount: '0' }])().adds[0]).toMatchObject({ unit_tiers: [{ min_qty: 2, amount: 0 }] })
    })

    it('a change sends only what it names — the bonus, the tiers whole, or both; no tiers left clears them', () => {
      const change = (c: { amount?: string | null; tiers?: Array<{ minQty: string; amount: string }>; label?: string }) =>
        validateKpiItems({ adds: [], changes: [{ id: A, ...c }], removes: [] }).changes
      expect(change({ amount: '60' })).toEqual([{ id: A, kpi_amount: 60 }])
      expect(change({ tiers: [{ minQty: '5', amount: '80' }] })).toEqual([{ id: A, unit_tiers: [{ min_qty: 5, amount: 80 }] }])
      expect(change({ tiers: [] })).toEqual([{ id: A, unit_tiers: [] }])
      expect(change({ amount: '60', tiers: [{ minQty: '5', amount: '80' }] })).toEqual([{ id: A, kpi_amount: 60, unit_tiers: [{ min_qty: 5, amount: 80 }] }])
      expect(() => change({ label: 'Upgrade fabric' })).toThrow(/Upgrade fabric: nothing changed/)
      // A bonus box emptied is refused, with or without tiers.
      expect(() => change({ amount: null, tiers: [], label: 'Upgrade fabric' })).toThrow(/Upgrade fabric: give it a KPI amount/)
      expect(() => change({ tiers: [{ minQty: '1', amount: '80' }], label: 'Upgrade fabric' })).toThrow(/Upgrade fabric: a tier starts from 2 units/)
    })
  })
})
