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
    ).toEqual({ divisor: 0.7, ratios: [{ erp_product_id: 'p-1', ratio: 0.6 }], removes: ['p-2'] })
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

  it('takes only a bed frame or a sofa special', () => {
    expect(() =>
      validateKpiItems({ adds: [{ source: 'option', optionPool: 'bedframe_sizes', optionValue: 'Queen', amount: '5' }], changes: [], removes: [] }),
    ).toThrow(/bed frame or a sofa special/)
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
})
