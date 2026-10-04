import { describe, expect, it } from 'vitest'
import { chargeText, costProvenance } from './provenance'

describe('where a line’s cost came from', () => {
  it('names the Product List, and a sofa grid’s cell and options', () => {
    expect(costProvenance('catalogue', { how: 'price', unit: 900 }, true)).toEqual({ label: 'Product List', missing: false })
    expect(
      costProvenance('catalogue', { how: 'grid', height: '30', tier: 'PRICE_2', surcharge: 80, unit: 1000 }, true),
    ).toEqual({ label: 'Product List · seat 30 · Tier 2 · + RM 80.00 options', missing: false })
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

describe('what a line’s bed frame options were charged for', () => {
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
    expect(chargeText(null)).toBe('for bed frame options')
    expect(chargeText({ how: 'price' })).toBe('for bed frame options')
    expect(chargeText({ charges: [{ pool: 'bedframe_specials', value: 'X' }, null, 'junk'] })).toBe('for bed frame options')
  })
})
