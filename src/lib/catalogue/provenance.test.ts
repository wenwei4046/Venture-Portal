import { describe, expect, it } from 'vitest'
import { chargeText, costProvenance } from './provenance'

describe('where a line’s cost came from', () => {
  it('names the Product List, and a sofa grid’s cell and options', () => {
    expect(costProvenance('catalogue', { how: 'price', unit: 900 }, true)).toEqual({ label: 'Product List', missing: false })
    expect(
      costProvenance('catalogue', { how: 'grid', height: '30', tier: 'PRICE_2', surcharge: 80, unit: 1000 }, true),
    ).toEqual({ label: 'Product List · seat 30 · Tier 2 · + RM 80.00 options', missing: false })
  })

  it('names a bed frame still to be chosen by the size it was costed at (2026-10-31)', () => {
    expect(costProvenance('catalogue', { how: 'kiv', unit: 820, size: 'Q', named: ['Q'], size_from: 'words' }, true))
      .toEqual({ label: 'KIV bed frame · Queen', missing: false })
    // No size, or one the four do not set (SK): the dearest of the four.
    expect(costProvenance('catalogue', { how: 'kiv', unit: 1000 }, true).label).toBe('KIV bed frame · the dearest size')
    expect(costProvenance('catalogue', { how: 'kiv', unit: 1000, named: ['SK'], size_from: 'code' }, true).label)
      .toBe('KIV bed frame · the dearest size')
  })

  it('names the combo a module was costed at', () => {
    expect(
      costProvenance('catalogue_combo', { combo: { label: 'L-shape', price: 2000, sets: 1 } }, true),
    ).toEqual({ label: 'Combo L-shape · RM 2000.00 a set, spread', missing: false })
    expect(costProvenance('catalogue_combo', {}, true).label).toBe('Combo a combo, spread')
  })

  it('says why nothing could price a line, and that it blinds the bill', () => {
    expect(costProvenance(null, { reason: 'unpriced' }, false)).toEqual({ label: 'no price on the Product List', missing: true })
    expect(costProvenance(null, { reason: 'not_in_sku_master' }, false).label).toBe('not in the ERP’s SKU master')
    expect(costProvenance(null, { reason: 'no_height' }, false).label).toBe('no seat height the price grid knows')
    expect(costProvenance(undefined, undefined, false)).toEqual({ label: 'No cost', missing: true })
  })

  it('marks what landed on the old chain until a recost re-prices it', () => {
    for (const old of ['erp_line', 'sku_master', 'product_list']) {
      expect(costProvenance(old, null, true)).toEqual({ label: 'Old cost chain — recost to re-price', missing: false })
    }
    // A cost from before provenance was recorded at all.
    expect(costProvenance(null, null, true)).toEqual({ label: 'Old cost chain — recost to re-price', missing: false })
    expect(costProvenance('manual', null, true).label).toBe('Keyed by hand')
  })
})

describe('what a line’s options were charged for', () => {
  it('names each charged option from cost_detail.charges (20261005010000)', () => {
    const detail = {
      how: 'price',
      charges: [
        { pool: 'bedframe_divan_heights', value: '12"', price: 50 },
        { pool: 'bedframe_leg_heights', value: '6"', price: 100 },
        { pool: 'bedframe_gaps', value: '12"', price: 20 },
      ],
    }
    expect(chargeText(detail)).toBe('for divan 12" · leg 6" · gap 12"')
  })

  it('says so plainly when the line carries no explanation (a hand-costed line)', () => {
    expect(chargeText(null)).toBe('for its options')
    expect(chargeText({ how: 'price' })).toBe('for its options')
    expect(chargeText({ charges: [{ pool: 'mattress_tags', value: 'X' }, null, 'junk'] })).toBe('for its options')
  })

  // 2026-10-06: a special is charged too, and a sofa once per sofa, spread over its pieces.
  it('names a special by itself, and a sofa’s charge once for the sofa', () => {
    expect(chargeText({ charges: [{ pool: 'bedframe_specials', value: 'Hydraulic', price: 300 }] })).toBe('for Hydraulic')
    const sofa = {
      charges: [
        { pool: 'sofa_leg_heights', value: '6"', price: 100 },
        { pool: 'sofa_specials', value: 'Nylon Fabric', price: 50 },
      ],
      charge_set: { unit: 150, sets: 1, total: 150, lines: 5 },
    }
    expect(chargeText(sofa)).toBe('for leg 6" · Nylon Fabric — RM 150.00 once for the sofa, spread over its 5 pieces')
    expect(chargeText({ ...sofa, charge_set: { unit: 150, sets: 2, total: 300, lines: 3 } }))
      .toBe('for leg 6" · Nylon Fabric — RM 300.00 for 2 sofas, spread over its 3 pieces')
    expect(chargeText({ ...sofa, charge_set: { unit: 150, sets: 1, total: 150, lines: 1 } }))
      .toBe('for leg 6" · Nylon Fabric — RM 150.00 once for the sofa')
  })

  // 2026-10-27: a sofa special charged by quantity, once per compartment, says how many.
  it('says how many compartments a special charged by quantity was charged for', () => {
    expect(chargeText({
      charges: [
        { pool: 'sofa_specials', value: 'Change 8030 Backcushion', price: 200, count: 3, by_quantity: true },
        { pool: 'sofa_specials', value: 'Seat and Backcushion Firmer', price: 300, count: 1 },
      ],
      charge_set: { sets: 1, compartments: 3, total: 900, lines: 2 },
    })).toBe('for Change 8030 Backcushion ×3 · Seat and Backcushion Firmer — RM 900.00 once for the sofa, spread over its 2 pieces')
    // A part from 2026-10-26 (the bill's special order) reads as its name alone.
    expect(chargeText({ charges: [{ pool: 'sofa_specials', value: 'Change 8030 Backcushion', price: 600, special_order: true }] }))
      .toBe('for Change 8030 Backcushion')
  })

  // 2026-10-29: a fabric's upgrade (Maintenance › Fabrics › upgrades) names the series it was found by.
  it('names a fabric upgrade and its series', () => {
    expect(chargeText({
      charges: [
        { pool: 'bedframe_divan_heights', value: '12"', price: 100 },
        { pool: 'bedframe_fabric_upgrades', value: 'Upgrade fabric', series: 'PC151', price: 150 },
      ],
    })).toBe('for divan 12" · Upgrade fabric (PC151)')
    expect(chargeText({
      charges: [
        { pool: 'sofa_fabric_upgrades', value: 'Leather', series: 'LX', price: 500, count: 2 },
        { pool: 'sofa_leg_heights', value: '5"', price: 200, count: 2 },
      ],
      charge_set: { sets: 2, compartments: 6, total: 1400, lines: 3 },
    })).toBe('for Leather (LX) · leg 5" — RM 1400.00 for 2 sofas, spread over its 3 pieces')
  })
})
