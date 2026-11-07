import { describe, expect, it } from 'vitest'
import { gwpFreeParts, gwpFreeUnits, gwpRulesOf, type GwpLine, type GwpRule } from './gwp'

// The user's example (2026-11-08): a Dunlopillo mattress earns two microfibre pillows whose cost is not counted.
const ECO: GwpRule = { id: 'eco', buy: ['ECOBLISS (Q)', 'ECOBLISS (K)'], gift: ['MF PILLOW', 'LATEX PILLOW'], perUnit: 2 }

const line = (id: string, productCode: string, qty: number, costAmount: number | null = null): GwpLine =>
  ({ id, productCode, qty, costAmount })

describe('gwpFreeUnits — a gift with purchase', () => {
  it('frees perUnit units for every unit bought, and no more', () => {
    const lines = [line('a', 'ECOBLISS (Q)', 1, 1400), line('b', 'MF PILLOW', 3, 60)]
    expect(gwpFreeUnits(lines, [ECO])).toEqual(new Map([['b', 2]]))
    const two = [line('a', 'ECOBLISS (Q)', 2, 2800), line('b', 'MF PILLOW', 5, 100)]
    expect(gwpFreeUnits(two, [ECO])).toEqual(new Map([['b', 4]]))
  })

  it('reads every size it names, and codes in any case or spacing', () => {
    const lines = [line('a', ' ecobliss (k) ', 1, 1600), line('b', 'ECOBLISS (Q)', 1, 1400), line('c', 'mf pillow', 4, 80)]
    expect(gwpFreeUnits(lines, [ECO])).toEqual(new Map([['c', 4]]))
  })

  it('takes the cheapest gift units first, an uncosted one before any', () => {
    // Allowance 2 over a latex pillow (60 each), a microfibre one (20 each) and one with no cost yet.
    const lines = [
      line('a', 'ECOBLISS (Q)', 1, 1400),
      line('latex', 'LATEX PILLOW', 1, 60),
      line('mf', 'MF PILLOW', 1, 20),
      line('nocost', 'MF PILLOW', 1, null),
    ]
    expect(gwpFreeUnits(lines, [ECO])).toEqual(new Map([['nocost', 1], ['mf', 1]]))
  })

  it('breaks a tie in unit cost by the line id', () => {
    const lines = [line('a', 'ECOBLISS (Q)', 1, 1400), line('z2', 'MF PILLOW', 2, 40), line('z1', 'MF PILLOW', 2, 40)]
    expect(gwpFreeUnits(lines, [ECO])).toEqual(new Map([['z1', 2]]))
  })

  it('counts a gift whatever its price — the ERP puts most lines at RM 0', () => {
    // A line's amount is not even read: the bill carries no costs to price a gift by either.
    const lines = [line('a', 'ECOBLISS (Q)', 1), line('b', 'MF PILLOW', 2)]
    expect(gwpFreeUnits(lines, [ECO])).toEqual(new Map([['b', 2]]))
  })

  it('gives nothing without a purchase, or for SKUs it does not name', () => {
    expect(gwpFreeUnits([line('b', 'MF PILLOW', 2, 40)], [ECO]).size).toBe(0)
    expect(gwpFreeUnits([line('a', 'ECOBLISS (Q)', 1, 1400), line('b', 'BOLSTER', 2, 40)], [ECO]).size).toBe(0)
    expect(gwpFreeUnits([line('a', 'ECOBLISS (Q)', 1, 1400), line('b', 'MF PILLOW', 2, 40)], []).size).toBe(0)
  })

  it('lets two GWPs each take their own allowance, never more than a whole line', () => {
    const other: GwpRule = { id: 'other', buy: ['APEX (Q)'], gift: ['MF PILLOW'], perUnit: 1 }
    const lines = [line('a', 'ECOBLISS (Q)', 1, 1400), line('x', 'APEX (Q)', 1, 1200), line('b', 'MF PILLOW', 2, 40)]
    expect(gwpFreeUnits(lines, [ECO, other])).toEqual(new Map([['b', 2]]))
    const more = [line('a', 'ECOBLISS (Q)', 1, 1400), line('x', 'APEX (Q)', 1, 1200), line('b', 'MF PILLOW', 4, 80)]
    expect(gwpFreeUnits(more, [ECO, other])).toEqual(new Map([['b', 3]]))
  })

  it('reads a part of a line for a share of it', () => {
    const lines = [line('a', 'ECOBLISS (Q)', 1, 1400), line('b', 'MF PILLOW', 3, 60)]
    const parts = gwpFreeParts(lines, [ECO])
    expect(parts.get('b')).toBeCloseTo(2 / 3, 10)
    expect(parts.has('a')).toBe(false)
  })
})

describe('gwpRulesOf — the GWPs as the database hands them', () => {
  it('keeps the well-formed and drops the rest', () => {
    expect(gwpRulesOf([
      { id: 'g1', buy: ['ECOBLISS (Q)'], gift: ['MF PILLOW'], perUnit: 2 },
      { id: 'g2', buy: [], gift: ['MF PILLOW'], perUnit: 2 },
      { id: 'g3', buy: ['X'], gift: ['Y'], perUnit: 0 },
      'nonsense',
    ])).toEqual([{ id: 'g1', buy: ['ECOBLISS (Q)'], gift: ['MF PILLOW'], perUnit: 2 }])
    expect(gwpRulesOf(null)).toEqual([])
  })
})
