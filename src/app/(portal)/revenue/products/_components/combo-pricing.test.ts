import { describe, expect, it } from 'vitest'
import { validateComboPrices } from '@/lib/catalogue/edits'
import type { ComboRow } from '../load'
import { buildComboPriceEdits, comboHeightColumns, comboKey, comboPriceAt, type ComboDrafts } from './combo-pricing'

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
