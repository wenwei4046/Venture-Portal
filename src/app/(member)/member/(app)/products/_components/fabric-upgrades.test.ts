import { describe, expect, it } from 'vitest'
import type { FabricRow, FabricUpgradeRow } from '../load'
import {
  addUpgrade, dropNew, EMPTY_UPGRADES_DRAFT, seriesOptions, shownUpgrade, takenSeries, touchNew, touchUpgrade,
  upgradesChanges, upgradesEditOf, upgradesOf,
} from './fabric-upgrades'

const UP = 'up-1'
const LEATHER = 'up-2'
const saved: FabricUpgradeRow[] = [
  { id: UP, category: 'SOFA', name: 'Upgrade fabric', price: 200, series: ['KS', 'PC151'] },
  { id: LEATHER, category: 'SOFA', name: 'Leather', price: 500, series: ['LX'] },
  { id: 'up-3', category: 'BEDFRAME', name: 'Upgrade fabric', price: 150, series: ['PC151'] },
]
const sofa = upgradesOf(saved, 'SOFA')
const fabric = (code: string, series: string | null, removed = false): FabricRow => ({
  erpId: code, code, description: null, series, category: null, sofaTier: null, bedframeTier: null, priceTier: null, active: true, removed,
})

describe('the fabric upgrades draft (Maintenance › Fabrics, 2026-10-29)', () => {
  it("lists one category's upgrades by name", () => {
    expect(sofa.map(u => u.name)).toEqual(['Leather', 'Upgrade fabric'])
    expect(upgradesOf(saved, 'BEDFRAME').map(u => u.id)).toEqual(['up-3'])
  })

  it('offers each live series once, its fabrics counted once', () => {
    expect(seriesOptions([
      fabric('AVANI-01', 'AVANI'), fabric('avani-01 ', 'avani'), fabric('AVANI-02', 'AVANI'),
      fabric('KS-08', 'KS'), fabric('OT-01', 'OLD-TWEED', true), fabric('ZZ-01', null), fabric('BL-01', '  '),
    ])).toEqual([{ series: 'AVANI', fabrics: 2 }, { series: 'KS', fabrics: 1 }])
  })

  it('counts a change per upgrade, and sends only what changed', () => {
    expect(upgradesChanges(sofa, EMPTY_UPGRADES_DRAFT)).toBe(0)
    // Typed back to what is saved: nothing.
    let draft = touchUpgrade(EMPTY_UPGRADES_DRAFT, UP, { name: ' Upgrade  fabric ', price: '200.00', series: ['PC151', 'ks'] })
    expect(upgradesChanges(sofa, draft)).toBe(0)
    expect(upgradesEditOf(sofa, draft)).toEqual({ adds: [], changes: [], removes: [] })

    draft = touchUpgrade(EMPTY_UPGRADES_DRAFT, UP, { price: '250' })
    draft = touchUpgrade(draft, UP, { series: ['PC151', 'ZL'] })
    draft = touchUpgrade(draft, LEATHER, { removing: true })
    draft = touchNew(addUpgrade(draft, 'new-1'), 'new-1', { name: 'Velvet', price: '300', series: ['KS'] })
    expect(upgradesChanges(sofa, draft)).toBe(3)
    expect(upgradesEditOf(sofa, draft)).toEqual({
      adds: [{ name: 'Velvet', price: '300', series: ['KS'] }],
      changes: [{ id: UP, label: 'Upgrade fabric', price: '250', addSeries: ['ZL'], dropSeries: ['KS'] }],
      removes: [LEATHER],
    })
    expect(shownUpgrade(sofa[1], draft)).toEqual({ name: 'Upgrade fabric', price: '250', series: ['PC151', 'ZL'], removing: false })
    expect(upgradesChanges(sofa, dropNew(draft, 'new-1'))).toBe(2)
  })

  it("keeps a series ticked under one upgrade: the others are not offered it", () => {
    let draft = touchUpgrade(EMPTY_UPGRADES_DRAFT, UP, { series: ['PC151'] })
    draft = touchNew(addUpgrade(draft, 'new-1'), 'new-1', { series: ['KS'] })
    expect([...takenSeries(sofa, draft, LEATHER)].sort()).toEqual(['ks', 'pc151'])
    expect([...takenSeries(sofa, draft, 'new-1')].sort()).toEqual(['lx', 'pc151'])
    // An upgrade coming off frees its series.
    expect([...takenSeries(sofa, touchUpgrade(draft, LEATHER, { removing: true }), UP)].sort()).toEqual(['ks'])
  })
})
