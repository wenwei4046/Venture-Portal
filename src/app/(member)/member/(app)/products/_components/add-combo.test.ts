import { describe, expect, it } from 'vitest'
import type { CatalogueSku, ComboRow } from '../load'
import { checkCombo, comboModels, comboModules, comboPieces, draftDirty, moduleSum, sameCompartments, setLine, type ComboDraft } from './add-combo'

function sku(code: string, module: string, extra: Partial<CatalogueSku> = {}): CatalogueSku {
  return {
    erpId: code, code, description: `SOFA ${code}`, category: 'SOFA', modelId: 'm-8030', modelCode: '8030', modelName: 'Soffio',
    baseModel: '8030', moduleCode: module, sizeCode: null, sizeLabel: null, optionLabel: module, branding: 'ZANOTTI', brand: 'ZANOTTI',
    active: true, removed: false, isNew: false, price: null,
    grid: [
      { height: '28', tier: 'PRICE_2', price: 1000 },
      { height: '30', tier: 'PRICE_2', price: 1100 },
    ],
    offered: false, modelOffered: false, adopted: false, ...extra,
  }
}
const skus = [
  sku('8030-1NA', '1NA'),
  sku('8030-2NA', '2NA', { grid: [{ height: '28', tier: 'PRICE_2', price: 1500 }] }),
  sku('8030-2NA-X', '2NA'),
  sku('00913-3S', '3S', { baseModel: '00913', modelCode: '00913-3S', modelName: '00913-3S' }),
]
const erp: ComboRow = {
  erpId: 'c1', baseModel: '8030', modelName: 'Soffio', label: '1NA+CNR', slots: [['1NA'], ['CNR']],
  slotsKey: '[["1NA"], ["CNR"]]', tier: 'PRICE_2', heights: ['28'], effectiveFrom: '2026-09-01', prices: {}, isNew: false,
}
const draft = (d: Partial<ComboDraft> = {}): ComboDraft => ({ model: '8030', label: '', pcs: {}, prices: {}, ...d })

describe('Add combo', () => {
  it('lists each sofa model once by its base model, named as the ERP names it', () => {
    expect(comboModels(skus)).toEqual([
      { code: '00913', label: '00913' },
      { code: '8030', label: '8030 · Soffio' },
    ])
  })

  it("offers one compartment per module code, in the SKU Master's order", () => {
    expect(comboPieces(skus, '8030').map(p => [p.module, p.code])).toEqual([['1NA', '8030-1NA'], ['2NA', '8030-2NA']])
  })

  it('writes the set as the strip, the name and the ERP each read it', () => {
    const picked = [{ module: '1NA', n: 1 }, { module: '2NA', n: 2 }]
    expect(setLine(picked)).toBe('1NA + 2×2NA')
    expect(comboModules(picked)).toEqual([['1NA'], ['2NA'], ['2NA']])
  })

  it('adds the module prices up at a tier and height, and says nothing when a piece is not sold there', () => {
    const pieces = comboPieces(skus, '8030').map(p => ({ ...p, n: p.module === '2NA' ? 2 : 1 }))
    expect(moduleSum(pieces, 'PRICE_2', '28')).toBe(1000 + 2 * 1500)
    expect(moduleSum(pieces, 'PRICE_2', '30')).toBeNull()
    expect(moduleSum([], 'PRICE_2', '28')).toBeNull()
  })

  it('knows the same compartments whatever their order', () => {
    expect(sameCompartments(erp, [['CNR'], ['1NA']])).toBe(true)
    expect(sameCompartments(erp, [['1NA'], ['2NA']])).toBe(false)
  })

  it('checks in the window order: model, pieces, a number, a price, the set, the name', () => {
    const pieces = comboPieces(skus, '8030')
    const heights = ['28', '30']
    expect(checkCombo(draft({ model: '' }), pieces, heights, [erp]).problem).toBe('Pick a sofa model.')
    expect(checkCombo(draft({ pcs: { '1NA': 1 } }), pieces, heights, [erp]).problem).toBe('Add at least two compartments.')
    expect(checkCombo(draft({ pcs: { '1NA': 1, '2NA': 1 }, prices: { 'PRICE_2#28': 'abc' } }), pieces, heights, [erp]).problem).toBe('A price is not a number.')
    expect(checkCombo(draft({ pcs: { '1NA': 1, '2NA': 1 }, prices: { 'PRICE_2#28': '0' } }), pieces, heights, [erp]).problem).toBe('Fill at least one price.')
    expect(checkCombo(draft({ pcs: { '1NA': 2 }, prices: { 'PRICE_2#28': '900' } }), pieces, heights, [{ ...erp, slots: [['1NA'], ['1NA']] }]).problem)
      .toBe('This model already has a combo with these compartments.')
    expect(checkCombo(draft({ label: '1na+cnr', pcs: { '1NA': 1, '2NA': 1 }, prices: { 'PRICE_2#28': '900' } }), pieces, heights, [erp]).problem)
      .toBe('Model 8030 already has a set called "1na+cnr".')
    const ok = checkCombo(draft({ pcs: { '1NA': 1, '2NA': 1 }, prices: { 'PRICE_2#28': '2,400', 'PRICE_3#30': '2600.5', 'PRICE_1#28': '' } }), pieces, heights, [erp])
    expect(ok).toEqual({
      problem: null, label: '1NA + 2NA', pieces: 2, filled: 2, modules: [['1NA'], ['2NA']],
      prices: { PRICE_2: { '28': 2400 }, PRICE_3: { '30': 2600.5 } },
    })
  })

  it('counts a half-typed set as unsaved — the model chosen is enough', () => {
    expect(draftDirty(draft({ model: '' }))).toBe(false)
    expect(draftDirty(draft())).toBe(true)
    expect(draftDirty(draft({ model: '', prices: { 'PRICE_1#28': ' ' } }))).toBe(false)
  })
})
