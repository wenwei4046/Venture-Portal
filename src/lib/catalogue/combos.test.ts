import { describe, expect, it } from 'vitest'
import {
  comboSlotsKey,
  matchComboSlots,
  normaliseComboModules,
  pickCombo,
  combosCollide,
  spreadComboTotal,
  type PricedCombo,
} from './combos'

/**
 * The twins of erp_combo_slots_key, catalogue_match_slots and the combo pick +
 * spread inside catalogue_apply_combos (migrations 20260919010000 §5 and
 * 20260924030000 §10–§11), and through them of the ERP's own
 * scm/shared/sofa-combo-pricing.ts. Every expectation in the agreeing blocks
 * was checked against the SQL itself (PGlite; catalogue_apply_combos driven
 * over real rows). `it.fails` marks an input the twins answer differently: the
 * assertion is the SQL's answer.
 */

const TWO_PLUS_L = [
  ['2A(LHF)', '2A(RHF)'],
  ['L(LHF)', 'L(RHF)'],
]

describe('normaliseComboModules', () => {
  it('slots of OR-sets: codes trimmed and sorted within a slot, slot order kept', () => {
    expect(normaliseComboModules([['L(RHF)', ' L(LHF) '], ['2A(RHF)', '2A(LHF)']])).toEqual([
      ['L(LHF)', 'L(RHF)'],
      ['2A(LHF)', '2A(RHF)'],
    ])
  })

  it('the ERP’s legacy flat form: each code its own slot', () => {
    expect(normaliseComboModules(['1A', '2A'])).toEqual([['1A'], ['2A']])
  })

  it('flat codes and slots may be mixed', () => {
    expect(normaliseComboModules(['CONSOLE', ['2A', '1A']])).toEqual([['CONSOLE'], ['1A', '2A']])
  })

  it('drops blank codes, null entries and empty slots', () => {
    expect(normaliseComboModules([[' ', null, '1A'], [], null, '', '  ', [undefined]])).toEqual([['1A']])
  })

  it('numbers become codes', () => {
    expect(normaliseComboModules([101, [202]])).toEqual([['101'], ['202']])
  })

  it.each<[unknown]>([[null], [undefined], ['1A'], [{}], [42]])('%j is not a combo → []', raw => {
    expect(normaliseComboModules(raw)).toEqual([])
  })
})

describe('comboSlotsKey', () => {
  it('is order-independent: slot order and code order do not change it', () => {
    expect(comboSlotsKey([['L(RHF)', 'L(LHF)'], ['2A(RHF)', '2A(LHF)']])).toBe(comboSlotsKey(TWO_PLUS_L))
  })

  // The key the portal STORES (erp_combo_slots_key's jsonb text), not the
  // ERP's compact JSON.stringify form.
  it('prints the way the portal stores it — jsonb text, ", " between elements', () => {
    expect(comboSlotsKey([['2A(RHF)', '2A(LHF)'], ['L(LHF)']])).toBe('[["2A(LHF)", "2A(RHF)"], ["L(LHF)"]]')
  })

  it('the flat form keys the same as its slot form', () => {
    expect(comboSlotsKey(['1A', '2A'])).toBe(comboSlotsKey([['1A'], ['2A']]))
  })

  it('a single one-code slot is the same string in every twin', () => {
    // No comma, so jsonb's ", " spacing (below) cannot show.
    expect(comboSlotsKey([['CONSOLE']])).toBe('[["CONSOLE"]]')
  })

  it('nothing usable keys as []', () => {
    expect(comboSlotsKey([])).toBe('[]')
    expect(comboSlotsKey('1A')).toBe('[]')
    expect(comboSlotsKey([[], ['  ']])).toBe('[]')
  })

  // erp_combo_slots_key dumps JSONB_AGG(…)::TEXT, and jsonb prints ", " between
  // elements — the keys stored in erp_sofa_combos.slots_key on the portal's
  // database read `[["1S"], ["2S"], ["3S"]]`. That key is half of
  // catalogue_combo_prices' primary key, so a key computed here never finds a
  // price row. (Nothing calls this today: the Product List and
  // member_catalogue() both join on the stored slots_key in SQL.)
  // Slots are ordered by their JSON text, as the SQL orders them — the
  // portal's database answers `[["2", "3"], ["21"]]` for this input.
  it('orders slots by their JSON text, not by their codes joined', () => {
    expect(JSON.parse(comboSlotsKey([['21'], ['3', '2']]))).toEqual([['2', '3'], ['21']])
  })
})

describe('matchComboSlots — catalogue_match_slots', () => {
  // The SQL answers 1-based ({1,3}); these are the same picks, 0-based.
  it('covers every slot with a distinct built module; answers their indices ascending', () => {
    expect(matchComboSlots(['1A(LHF)', 'CONSOLE', '2A(RHF)'], [['2A(RHF)', '2A(LHF)'], ['1A(LHF)']])).toEqual([0, 2])
  })

  it('extras are allowed and are left out — they keep their own price', () => {
    expect(matchComboSlots(['2A(LHF)', 'CONSOLE', 'L(RHF)', '1A(LHF)'], TWO_PLUS_L)).toEqual([0, 2])
  })

  it('build order does not matter', () => {
    expect(matchComboSlots(['L(RHF)', '2A(LHF)'], TWO_PLUS_L)).toEqual([0, 1])
  })

  it('a slot no module can fill → null', () => {
    expect(matchComboSlots(['1A', '3A'], [['1A'], ['2A']])).toBeNull()
  })

  it('fewer modules than slots → null', () => {
    expect(matchComboSlots(['1A'], [['1A'], ['1A']])).toBeNull()
  })

  it('a module fills one slot only; two of a kind fill two', () => {
    expect(matchComboSlots(['1A', '1A'], [['1A'], ['1A']])).toEqual([0, 1])
  })

  it('backtracks, so a slot that CAN be covered always is', () => {
    // Greedy would give X to the first slot and strand the second.
    expect(matchComboSlots(['X', 'Y'], [['X', 'Y'], ['X']])).toEqual([0, 1])
    expect(matchComboSlots(['A', 'B', 'C'], [['A', 'B'], ['A', 'C'], ['A']])).toEqual([0, 1, 2])
  })

  it('picks the modules the ERP’s Kuhn matching picks where OR-sets overlap', () => {
    // Slot 2 wants A first; A is held by slot 1, which moves to C to free it.
    // So the combo consumes A and C and B stays an extra at its own price —
    // the ERP's matchComboSubset, and the SQL twin since 2026-09-24
    // (verified against catalogue_match_slots on the same inputs).
    expect(matchComboSlots(['A', 'B', 'C'], [['A', 'C'], ['A', 'B']])).toEqual([0, 2])
    expect(matchComboSlots(['C', 'B', 'A'], [['A', 'B', 'C'], ['A'], ['B']])).toEqual([0, 1, 2])
    expect(matchComboSlots(['B', 'A', 'C', 'A'], [['A', 'B'], ['A'], ['C', 'A']])).toEqual([0, 1, 3])
  })

  it('reads the legacy flat form', () => {
    expect(matchComboSlots(['2A', '1A', 'X'], ['1A', '2A'])).toEqual([0, 1])
  })

  it('built codes are trimmed', () => {
    expect(matchComboSlots([' 1A '], [['1A']])).toEqual([0])
  })

  // 2026-10-21: the ERP keeps the SOFFIO console as 8030-Console and a retired
  // 8030-CONSOLE; a set made on CONSOLE never met the Console the Quote sells,
  // and a 1A(LHF) + 1A(RHF) + Console quote read 19.8% instead of its set's 31.9%.
  it('codes compare ignoring case, on either side (migration 20261021210000)', () => {
    expect(matchComboSlots(['1A(LHF)', '1A(RHF)', 'Console'], [['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']])).toEqual([0, 1, 2])
    expect(matchComboSlots(['CONSOLE', '1a(rhf)'], [['1A(RHF)'], ['Console']])).toEqual([0, 1])
    expect(matchComboSlots(['console'], [['CONSOLE']])).toEqual([0])
  })

  it('ignoring case never lets one module fill a slot of another code', () => {
    expect(matchComboSlots(['1A(LHF)', 'Console', 'Console'], [['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']])).toBeNull()
  })

  it.each<[unknown]>([[[]], ['2+L'], [[null]], [null]])('slots %j can never be covered → null', slots => {
    expect(matchComboSlots(['1A', '2A'], slots)).toBeNull()
  })
})

describe('spreadComboTotal — the ERP’s spreadComboTotal, unit for unit', () => {
  // The first five are the ERP's own cases (sofa-combo-pricing.test.ts); the
  // SQL spread in catalogue_apply_combos lands on the same cents.
  it('in proportion to each line’s own cost', () => {
    expect(spreadComboTotal([60000, 40000], 90000)).toEqual([54000, 36000])
  })

  it('the rounding residual goes to the dearest line — the first, on a tie', () => {
    const out = spreadComboTotal([10000, 10000, 10000], 10000)
    expect(out.reduce((a, b) => a + b, 0)).toBe(10000)
    expect(out).toEqual([3334, 3333, 3333])
  })

  it('…to the dearest, not merely the first', () => {
    const out = spreadComboTotal([10000, 50000], 30001)
    expect(out.reduce((a, b) => a + b, 0)).toBe(30001)
    expect(out).toEqual([5000, 25001])
  })

  it('evenly when no line carries a cost', () => {
    const out = spreadComboTotal([0, 0, 0], 10000)
    expect(out.reduce((a, b) => a + b, 0)).toBe(10000)
    expect(out).toEqual([3334, 3333, 3333])
  })

  it('one line takes the whole total', () => {
    expect(spreadComboTotal([12345], 99999)).toEqual([99999])
  })

  it('no lines → no shares', () => {
    expect(spreadComboTotal([], 5000)).toEqual([])
  })

  it('the combo always wins — a combo dearer than its modules still spreads', () => {
    expect(spreadComboTotal([10000, 10000], 90000)).toEqual([45000, 45000])
  })

  it('two sets: the combo price × 2 spreads over the lines’ own totals', () => {
    // catalogue_apply_combos on two lines of qty 2 costing RM 1,200 and RM 800,
    // combo RM 900 a set, lands on RM 1,080 and RM 720.
    expect(spreadComboTotal([120000, 80000], 900 * 2 * 100)).toEqual([108000, 72000])
  })

  it('a line with a negative cost weighs nothing', () => {
    expect(spreadComboTotal([-500, 1000], 900)).toEqual([0, 900])
  })

  it('works in whole cents: fractional inputs are rounded first', () => {
    expect(spreadComboTotal([100.4, 99.6], 1000.4)).toEqual([500, 500])
  })

  it('a negative total spreads as nothing', () => {
    expect(spreadComboTotal([100, 200], -5)).toEqual([0, 0])
  })

  it('always sums to exactly the total, never below zero', () => {
    let seed = 20260924
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    for (let run = 0; run < 300; run++) {
      const own = Array.from({ length: 1 + next(6) }, () => (next(4) === 0 ? 0 : next(500000)))
      const total = next(2000000)
      const out = spreadComboTotal(own, total)
      expect(out).toHaveLength(own.length)
      expect(out.reduce((a, b) => a + b, 0)).toBe(total)
      expect(out.every(c => Number.isInteger(c) && c >= 0)).toBe(true)
    }
  })

  // catalogue_apply_combos picks the residual's line over the RAW weights
  // (`v_weights[k] > v_weights[v_target]`), as the ERP does over its raw base
  // costs; the TS compares them after clamping to 0, where every line ties and
  // the first wins.
  it('the residual goes to the dearest RAW cost, even when every cost is ≤ 0 (ERP and SQL alike)', () => {
    expect(spreadComboTotal([-100, -50], 10001)).toEqual([5000, 5001])
  })
})

function combo(over: Partial<PricedCombo> = {}): PricedCombo {
  return {
    erpId: 'c1',
    baseModel: '8030',
    modules: TWO_PLUS_L,
    tier: null,
    label: '2+L',
    effectiveFrom: '2026-01-01',
    createdAt: '2026-01-01T00:00:00Z',
    priceByHeight: { '30': 3200 },
    ...over,
  }
}

/** A 2A + L build at seat height 30, PRICE_2 fabric — exactly the 2+L set. */
function build(over: Partial<Parameters<typeof pickCombo>[0]> = {}): Parameters<typeof pickCombo>[0] {
  return { baseModel: '8030', modules: ['2A(LHF)', 'L(RHF)'], height: '30', tier: 'PRICE_2', ...over }
}

describe('pickCombo — the pick inside catalogue_apply_combos', () => {
  it('a build that IS the combo’s set is costed at the portal’s price for its height', () => {
    const hit = pickCombo(build(), [combo()])
    expect(hit).not.toBeNull()
    expect(hit!.combo.erpId).toBe('c1')
    expect(hit!.price).toBe(3200)
    expect(hit!.matched).toEqual([0, 1])
  })

  // User 2026-10-08 chose "完全一样才算": the ERP took a combo the build merely covered.
  it('a piece more or a piece less is not the set: no combo, every module at its own price', () => {
    expect(pickCombo(build({ modules: ['2A(LHF)', 'CONSOLE', 'L(RHF)'] }), [combo()])).toBeNull()
    expect(pickCombo(build({ modules: ['2A(LHF)'] }), [combo()])).toBeNull()
  })

  it('a 3+2+1 build takes 3+2+1 — never 3+2 — and with 3+2 alone takes none', () => {
    const threeTwo = combo({ erpId: 'c32', modules: [['3S'], ['2S']], label: '3+2', priceByHeight: { '30': 3100 } })
    const threeTwoOne = combo({ erpId: 'c321', modules: [['3S'], ['2S'], ['1S']], label: '3+2+1', priceByHeight: { '30': 3900 } })
    const b = build({ modules: ['3S', '2S', '1S'] })
    expect(pickCombo(b, [threeTwo, threeTwoOne])?.combo.label).toBe('3+2+1')
    expect(pickCombo(b, [threeTwo])).toBeNull()
    expect(pickCombo(build({ modules: ['2S', '3S'] }), [threeTwo, threeTwoOne])?.combo.label).toBe('3+2')
  })

  it('the base model matches regardless of case and surrounding space', () => {
    expect(pickCombo(build({ baseModel: ' soffio ' }), [combo({ baseModel: 'SOFFIO' })])?.price).toBe(3200)
  })

  it('so do the modules: a 1A(LHF) + 1A(RHF) + Console build is the CONSOLE set (2026-10-21)', () => {
    const soffio = combo({ erpId: 'portal:13d48e86', modules: [['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']], tier: 'PRICE_1',
      label: '1A(LHF) + 1A(RHF) + CONSOLE', priceByHeight: { '24': 1744, '35': 2140, '25"': 0 } })
    const pair = combo({ erpId: 'portal:aad8c7ba', modules: [['1A(LHF)'], ['1A(RHF)']], tier: 'PRICE_1',
      label: '1A(LHF) + 1A(RHF)', priceByHeight: { '35': 1720 } })
    const hit = pickCombo(build({ modules: ['1A(LHF)', '1A(RHF)', 'Console'], height: '35', tier: 'PRICE_1' }), [soffio, pair])
    expect(hit?.combo.label).toBe('1A(LHF) + 1A(RHF) + CONSOLE')
    expect(hit?.price).toBe(2140)
    expect(hit?.matched).toEqual([0, 1, 2])
  })

  it('another base model never matches', () => {
    expect(pickCombo(build({ baseModel: '8031' }), [combo()])).toBeNull()
  })

  it('a combo whose slots the build cannot cover is no candidate', () => {
    expect(pickCombo(build({ modules: ['2A(LHF)', 'CONSOLE'] }), [combo()])).toBeNull()
  })

  it('a tier-specific combo applies to its tier only; a null tier is any tier', () => {
    expect(pickCombo(build({ tier: 'PRICE_1' }), [combo({ tier: 'PRICE_2' })])).toBeNull()
    expect(pickCombo(build({ tier: 'PRICE_2' }), [combo({ tier: 'PRICE_2' })])?.price).toBe(3200)
    expect(pickCombo(build({ tier: 'PRICE_3' }), [combo({ tier: null })])?.price).toBe(3200)
  })

  it('a tier-specific combo beats an any-tier one, even a newer one', () => {
    const hit = pickCombo(build(), [
      combo({ erpId: 'any', tier: null, effectiveFrom: '2026-08-01', priceByHeight: { '30': 2800 } }),
      combo({ erpId: 'p2', tier: 'PRICE_2', effectiveFrom: '2026-01-01' }),
    ])
    expect(hit?.combo.erpId).toBe('p2')
  })

  it('then the newest effective row', () => {
    const hit = pickCombo(build(), [
      combo({ erpId: 'old', effectiveFrom: '2026-01-01', createdAt: '2026-09-01T00:00:00Z' }),
      combo({ erpId: 'new', effectiveFrom: '2026-06-01', createdAt: '2026-01-01T00:00:00Z' }),
    ])
    expect(hit?.combo.erpId).toBe('new')
  })

  it('then the newest created — a row with no createdAt loses', () => {
    expect(
      pickCombo(build(), [
        combo({ erpId: 'a', createdAt: '2026-03-01T00:00:00Z' }),
        combo({ erpId: 'b', createdAt: '2026-02-01T00:00:00Z' }),
      ])?.combo.erpId,
    ).toBe('a')
    expect(
      pickCombo(build(), [combo({ erpId: 'a', createdAt: null }), combo({ erpId: 'b', createdAt: '2020-01-01T00:00:00Z' })])
        ?.combo.erpId,
    ).toBe('b')
  })

  it('then the highest id', () => {
    expect(pickCombo(build(), [combo({ erpId: 'c-a' }), combo({ erpId: 'c-b' })])?.combo.erpId).toBe('c-b')
  })

  it('asOf leaves out a combo that is not yet effective; the day itself counts', () => {
    expect(pickCombo(build(), [combo({ effectiveFrom: '2026-12-01' })], '2026-09-01')).toBeNull()
    expect(pickCombo(build(), [combo({ effectiveFrom: '2026-09-01' })], '2026-09-01')?.price).toBe(3200)
  })

  it('the build’s height is matched to the price by its key', () => {
    expect(pickCombo(build({ height: '30' }), [combo({ priceByHeight: { '30"': 3300 } })])?.price).toBe(3300)
    expect(pickCombo(build({ height: '30”' }), [combo()])?.price).toBe(3200)
  })

  it('no price at the build’s height → no combo; another height’s price is never borrowed', () => {
    expect(pickCombo(build({ height: '35' }), [combo()])).toBeNull()
    expect(pickCombo(build({ height: '' }), [combo()])).toBeNull()
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('a price of %d is no price', price => {
    expect(pickCombo(build(), [combo({ priceByHeight: { '30': price } })])).toBeNull()
  })

  it('an unpriced combo does not shadow a priced one', () => {
    const hit = pickCombo(build(), [
      combo({ erpId: 'newer-unpriced', effectiveFrom: '2026-08-01', priceByHeight: { '35': 3500 } }),
      combo({ erpId: 'older-priced', modules: [['2A(LHF)'], ['L(RHF)']] }),
    ])
    expect(hit?.combo.erpId).toBe('older-priced')
  })

  it('no combos → null', () => {
    expect(pickCombo(build(), [])).toBeNull()
  })

  // catalogue_apply_combos filters `effective_from <= COALESCE(order_date,
  // CURRENT_DATE)`, and the ERP's pickComboMatch defaults asOf to today. The
  // TS applies no date filter at all when asOf is omitted. (Its one caller, the
  // member calculator, is fed by member_catalogue(), which already keeps only
  // combos effective by CURRENT_DATE.)
  // Without `asOf` nothing is dropped by date: the caller filters. The one
  // that matters, member_catalogue(), answers only combos in effect today —
  // the default the SQL twin and the ERP apply themselves.
  it('drops a combo not yet in effect only when given the date', () => {
    expect(pickCombo(build(), [combo({ effectiveFrom: '2999-01-01' })])).not.toBeNull()
    expect(pickCombo(build(), [combo({ effectiveFrom: '2999-01-01' })], '2026-09-24')).toBeNull()
  })

  // pickCombo takes ONE height and tier and no quantities, so the other two
  // rules of catalogue_apply_combos — one tier and one seat height across the
  // set, and a uniform quantity — belong to its caller: costLines in
  // lib/member/calculator.ts (one cart-level build; mixed quantities keep their
  // own costs), covered by lib/member/calculator-catalogue.test.ts.
})

describe('combosCollide — could one bill match both? (2026-10-08)', () => {
  it('pairs the pieces so each pair shares a module', () => {
    expect(combosCollide([['1A(R)(LHF)', '1A(R)(RHF)'], ['1NA']], [['1A(R)(LHF)'], ['1NA']])).toBe(true)
    expect(combosCollide([['2S'], ['3S']], [['3S'], ['2S']])).toBe(true)
    expect(combosCollide([['A(LHF)', 'A(RHF)'], ['A(LHF)', 'A(RHF)']], [['A(LHF)'], ['A(RHF)']])).toBe(true)
  })

  it('one side against the other, or a piece more, never collide', () => {
    expect(combosCollide([['1A(R)(LHF)'], ['1NA']], [['1A(R)(RHF)'], ['1NA']])).toBe(false)
    expect(combosCollide([['3S'], ['2S']], [['3S'], ['2S'], ['1S']])).toBe(false)
    expect(combosCollide([], [])).toBe(false)
  })

  it('a set spelled in another case is the same set — catalogue_combos_collide (2026-10-21)', () => {
    expect(combosCollide([['1A(LHF)'], ['1A(RHF)'], ['Console']], [['1A(LHF)'], ['1A(RHF)'], ['CONSOLE']])).toBe(true)
    expect(combosCollide([['1a(r)(lhf)', '1A(R)(RHF)'], ['1NA']], [['1A(R)(LHF)'], ['1na']])).toBe(true)
  })
})
