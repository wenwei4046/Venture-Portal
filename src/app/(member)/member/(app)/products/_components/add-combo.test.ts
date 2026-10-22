import { describe, expect, it } from 'vitest'
import type { CatalogueSku, ComboRow } from '../load'
import { checkCombo, comboModels, comboModules, comboPieces, draftDirty, moduleSide, moduleSum, sameCompartments, setLine, type ComboDraft } from './add-combo'

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
    const picked = [{ module: '1NA', modules: ['1NA'], n: 1 }, { module: '2NA', modules: ['2NA'], n: 2 }]
    expect(setLine(picked)).toBe('1NA + 2×2NA')
    expect(comboModules(picked)).toEqual([['1NA'], ['2NA'], ['2NA']])
  })

  it('adds the module prices up at a tier and height, and says nothing when a piece is not sold there', () => {
    const pieces = comboPieces(skus, '8030').map(p => ({ ...p, n: p.module === '2NA' ? 2 : 1 }))
    expect(moduleSum(pieces, 'PRICE_2', '28')).toBe(1000 + 2 * 1500)
    expect(moduleSum(pieces, 'PRICE_2', '30')).toBeNull()
    expect(moduleSum([], 'PRICE_2', '28')).toBeNull()
  })

  it('a piece priced 0 there is not sold there (2026-10-21: 0 = 还没定价) — never a set total at RM 0', () => {
    const zero = comboPieces([sku('8069-1A(LHF)', '1A(LHF)', { baseModel: '8069', grid: [{ height: '35', tier: 'PRICE_1', price: 0 }, { height: '28', tier: 'PRICE_1', price: 750 }] })], '8069')
      .map(p => ({ ...p, n: 1 }))
    expect(moduleSum(zero, 'PRICE_1', '35')).toBeNull()
    expect(moduleSum(zero, 'PRICE_1', '28')).toBe(750)
  })

  it('knows the same compartments whatever their order', () => {
    expect(sameCompartments(erp, [['CNR'], ['1NA']])).toBe(true)
    expect(sameCompartments(erp, [['1NA'], ['2NA']])).toBe(false)
  })

  // 2026-10-21: the ERP keeps the SOFFIO console as 8030-Console and a retired 8030-CONSOLE. Two cards let a set be
  // made on the one no quote sells — and it never costed a quote.
  describe('a module spelled two ways (2026-10-21)', () => {
    const consoles = [
      sku('8030-1A(LHF)', '1A(LHF)'),
      sku('8030-1A(RHF)', '1A(RHF)'),
      sku('8030-CONSOLE', 'CONSOLE', { active: false }),
      sku('8030-Console', 'Console', { grid: [{ height: '35', tier: 'PRICE_1', price: 700 }] }),
    ]
    const made: ComboRow = {
      ...erp, label: '1A(LHF) + 1A(RHF) + CONSOLE', slots: [['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']],
      slotsKey: '[["1A(LHF)"], ["1A(RHF)"], ["CONSOLE"]]', tier: 'PRICE_1',
    }

    it("is one card, the live SKU's spelling and prices, where the module first shows", () => {
      const pieces = comboPieces(consoles, '8030')
      expect(pieces.map(p => [p.key, p.code])).toEqual([
        ['1A(LHF)', '8030-1A(LHF)'], ['1A(RHF)', '8030-1A(RHF)'], ['either:1A', 'LHF / RHF'], ['Console', '8030-Console'],
      ])
      expect(pieces[3].grid).toEqual([{ height: '35', tier: 'PRICE_1', price: 700 }])
    })

    it('keeps a retired spelling only when no live SKU has the module', () => {
      expect(comboPieces([sku('8030-CONSOLE', 'CONSOLE', { active: false })], '8030').map(p => p.code)).toEqual(['8030-CONSOLE'])
    })

    it('knows a set the model has in another case', () => {
      expect(sameCompartments(made, [['Console'], ['1A(RHF)'], ['1A(LHF)']])).toBe(true)
      const check = checkCombo(
        draft({ pcs: { '1A(LHF)': 1, '1A(RHF)': 1, Console: 1 }, prices: { 'PRICE_1#35': '2140' } }),
        comboPieces(consoles, '8030'), ['35'], [made],
      )
      expect(check.problem).toBe('This model already has a combo with these compartments.')
    })
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

  describe('a piece that may be either side (2026-10-08)', () => {
    const sided = [
      sku('2376-1A(R)(LHF)', '1A(R)(LHF)', { baseModel: '2376', grid: [{ height: '30', tier: 'PRICE_2', price: 900 }, { height: '24', tier: 'PRICE_2', price: 850 }] }),
      sku('2376-1NA', '1NA', { baseModel: '2376' }),
      sku('2376-1A(R)(RHF)', '1A(R)(RHF)', { baseModel: '2376', grid: [{ height: '30', tier: 'PRICE_2', price: 950 }] }),
      sku('2376-L(LHF)', 'L(LHF)', { baseModel: '2376' }),
      sku('2376-2A-RHF', '2A-RHF', { baseModel: '2376' }),
      sku('2376-2A-LHF', '2A-LHF', { baseModel: '2376' }),
    ]

    it('reads the side a module code faces, in the ways the ERP writes it', () => {
      expect(moduleSide('1A(R)(LHF)')).toEqual({ pair: '1A(R)', side: 'LHF', twin: '1A(R)(RHF)' })
      expect(moduleSide('2A-RHF')).toEqual({ pair: '2A', side: 'RHF', twin: '2A-LHF' })
      expect(moduleSide('L LHF')).toEqual({ pair: 'L', side: 'LHF', twin: 'L RHF' })
      expect(moduleSide('1NA')).toBeNull()
      expect(moduleSide('LHF')).toBeNull()
    })

    it('offers the pair right after its second side, and only when the model has both sides', () => {
      expect(comboPieces(sided, '2376').map(p => [p.key, p.module, p.code, p.modules])).toEqual([
        ['1A(R)(LHF)', '1A(R)(LHF)', '2376-1A(R)(LHF)', ['1A(R)(LHF)']],
        ['1NA', '1NA', '2376-1NA', ['1NA']],
        ['1A(R)(RHF)', '1A(R)(RHF)', '2376-1A(R)(RHF)', ['1A(R)(RHF)']],
        ['either:1A(R)', '1A(R)', 'LHF / RHF', ['1A(R)(LHF)', '1A(R)(RHF)']],
        ['L(LHF)', 'L(LHF)', '2376-L(LHF)', ['L(LHF)']],
        ['2A-RHF', '2A-RHF', '2376-2A-RHF', ['2A-RHF']],
        ['2A-LHF', '2A-LHF', '2376-2A-LHF', ['2A-LHF']],
        ['either:2A', '2A', 'LHF / RHF', ['2A-LHF', '2A-RHF']],
      ])
    })

    it('writes each such piece as a slot of both sides, as the ERP does', () => {
      const pieces = comboPieces(sided, '2376')
      const ok = checkCombo(draft({ model: '2376', pcs: { 'either:1A(R)': 2, '1NA': 1 }, prices: { 'PRICE_2#30': '2500' } }), pieces, ['30'], [])
      expect(ok.problem).toBeNull()
      expect(ok.label).toBe('1NA + 2×1A(R)')
      expect(ok.modules).toEqual([['1NA'], ['1A(R)(LHF)', '1A(R)(RHF)'], ['1A(R)(LHF)', '1A(R)(RHF)']])
      const picked = pieces.filter(p => p.key === 'either:1A(R)').map(p => ({ ...p, n: 2 }))
      expect(setLine(picked, '×', true)).toBe('2×1A(R) (LHF or RHF)')
    })

    it('adds a pair up at the dearer side, so a copied set price never under-books', () => {
      const pair = comboPieces(sided, '2376').find(p => p.either && p.module === '1A(R)')!
      expect(moduleSum([{ ...pair, n: 1 }], 'PRICE_2', '30')).toBe(950)
      expect(moduleSum([{ ...pair, n: 1 }], 'PRICE_2', '24')).toBe(850)
    })

    it('knows a set adopted from the ERP with either side in a slot, whichever side is listed first', () => {
      const adopted: ComboRow = { ...erp, baseModel: '2376', label: '1A(R)+1NA', slots: [['1A(R)(RHF)', '1A(R)(LHF)'], ['1NA']] }
      const pieces = comboPieces(sided, '2376')
      expect(checkCombo(draft({ model: '2376', pcs: { 'either:1A(R)': 1, '1NA': 1 }, prices: { 'PRICE_2#30': '1900' } }), pieces, ['30'], [adopted]).problem)
        .toBe('This model already has a combo with these compartments.')
      // One side only would meet the same bill as the either-side set: one bill, one combo.
      expect(checkCombo(draft({ model: '2376', label: 'Left only', pcs: { '1A(R)(LHF)': 1, '1NA': 1 }, prices: { 'PRICE_2#30': '1900' } }), pieces, ['30'], [adopted]).problem)
        .toBe('Model 2376 already has a combo for these pieces: "1A(R)+1NA".')
      // A piece more is another set.
      expect(checkCombo(draft({ model: '2376', label: 'With L', pcs: { 'either:1A(R)': 1, '1NA': 1, 'L(LHF)': 1 }, prices: { 'PRICE_2#30': '2900' } }), pieces, ['30'], [adopted]).problem)
        .toBeNull()
    })
  })

  it('counts a half-typed set as unsaved — the model chosen is enough', () => {
    expect(draftDirty(draft({ model: '' }))).toBe(false)
    expect(draftDirty(draft())).toBe(true)
    expect(draftDirty(draft({ model: '', prices: { 'PRICE_1#28': ' ' } }))).toBe(false)
  })
})
