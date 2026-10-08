import { describe, expect, it } from 'vitest'
import { validateComboPrices } from '@/lib/catalogue/edits'
import type { ComboRow } from '../load'
import { buildComboPriceEdits, comboHeightColumns, comboKey, comboPriceAt, comboSets, parsePastedGrid, slotGroups, type ComboDrafts } from './combo-pricing'

const combo: ComboRow = {
  erpId: 'combo-a', baseModel: '2376', modelName: '2376', label: 'A',
  slots: [['1S'], ['1A(LHF)', '1A(RHF)']], slotsKey: '[["1S"], ["1A(LHF)", "1A(RHF)"]]', tier: 'PRICE_2',
  heights: ['DEFAULT', '30', '24'], effectiveFrom: '2026-09-24',
  prices: { '24"': 1200, '30': 1400, '75CM': 1800, DEFAULT: 1100 }, isNew: false,
}

describe('combo price draft reconciliation', () => {
  it('keeps the ERP order and resolves old equivalent labels without hiding their price', () => {
    expect(comboHeightColumns([combo])).toEqual(['DEFAULT', '30', '24', '75CM'])
    expect(comboPriceAt(combo, '24')).toBe(1200)
    expect(comboPriceAt(combo, '75cm')).toBe(1800)
    expect(comboPriceAt({ ...combo, prices: { '24"': 0 } }, '24')).toBe(0)
    expect(comboPriceAt(combo, '36')).toBeNull()
    expect(comboPriceAt(combo, '')).toBeNull()
  })

  it('preserves untouched and historical prices, raw saved labels, zero and blank semantics', () => {
    const drafts: ComboDrafts = new Map([[comboKey(combo), {
      '24': { height: '24', value: '0' },
      default: { height: 'DEFAULT', value: '' },
    }]])
    const edits = buildComboPriceEdits([combo], drafts)
    expect(edits).toEqual([{
      baseModel: '2376', slotsKey: combo.slotsKey, tier: 'PRICE_2',
      prices: { '24"': '0', '30': '1400', '75CM': '1800', DEFAULT: '' },
    }])
    expect(validateComboPrices(edits)[0].price_by_height).toEqual({ '24"': 0, '30': 1400, '75CM': 1800 })
  })

  it('rejects missing combo definitions and sizes absent from both ERP and saved history', () => {
    const drafts: ComboDrafts = new Map([[comboKey(combo), { '36': { height: '36', value: '1000' } }]])
    expect(() => buildComboPriceEdits([], drafts)).toThrow('no longer available')
    expect(() => buildComboPriceEdits([combo], drafts)).toThrow('Seat size 36 is not available')
  })
})

describe('reading a set', () => {
  it('puts the tiers of one set on one row and keeps different sets apart', () => {
    const p3 = { ...combo, erpId: 'combo-b', tier: 'PRICE_3', isNew: true }
    const other = { ...combo, erpId: 'combo-c', slotsKey: '[["1S"]]', slots: [['1S']] }
    const sets = comboSets([combo, p3, other])
    expect(sets).toHaveLength(2)
    expect([...sets[0].byTier.keys()]).toEqual(['PRICE_2', 'PRICE_3'])
    expect(sets[0].isNew).toBe(true)
  })

  it('counts repeated modules and reads a slot of several modules as A or B, as the prototype does', () => {
    expect(slotGroups([['1S(R)'], ['1A(R)(LHF)', '1A(R)(RHF)'], ['1A(R)(LHF)', '1A(R)(RHF)'], ['1NA'], ['2S', '3S']])).toEqual([
      { code: '1S(R)', alternatives: null, count: 1 },
      { code: '1A(R)(LHF)', alternatives: 'or 1A(R)(RHF)', count: 2 },
      { code: '1NA', alternatives: null, count: 1 },
      { code: '2S', alternatives: 'or 3S', count: 1 },
    ])
  })

  it('reads an Excel block and leaves a single value to the input', () => {
    expect(parsePastedGrid('1,200.00\t1300\r\nRM 900\t\r\n')).toEqual([['1200.00', '1300'], ['900', '']])
    expect(parsePastedGrid('1500')).toBeNull()
  })
})
