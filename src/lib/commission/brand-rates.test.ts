import { describe, expect, it } from 'vitest'
import {
  BRAND_RATE_FIELD,
  brandRateEdits,
  brandRateOf,
  brandRatesChanged,
  isOwnSchemeBill,
  namesBrandRate,
  ownSchemeCodes,
  readBrandRates,
  remapBrandRates,
  withBrandRateEdits,
  type BrandRated,
} from './brand-rates'

// A rank's rate for a brand that follows its own scheme (2026-11-11 — 2990s; the user: "它的 top rank 抽成是 8%
// （以此类推，每级往下调 1%）": Team Leader 8%, Senior Team Assistant 7%, Team Assistant 6%, Senior Revenue
// Specialist 5%, Revenue Specialist 4%).

const B = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

// Fair's catalogue as production holds it: seven ranks, five of them naming a 2990s rate.
const rank = (sortOrder: number, productRate: number, brandRate?: number): BrandRated =>
  ({ sortOrder, productRate, ...(brandRate === undefined ? {} : { brandRates: { [B]: brandRate } }) })
const F = rank(10, 0.05, 0.04)
const E = rank(20, 0.06, 0.05)
const D = rank(30, 0.07, 0.06)
const C = rank(40, 0.08, 0.07)
const TL = rank(50, 0.09, 0.08)
const STL = rank(60, 0.10)
const DIRECTOR = rank(70, 0.12)
const LADDER = [F, E, D, C, TL, STL, DIRECTOR]

describe('brandRateOf', () => {
  it('pays each rank the rate it names for the brand', () => {
    expect([F, E, D, C, TL].map(r => brandRateOf(r, B, LADDER))).toEqual([0.04, 0.05, 0.06, 0.07, 0.08])
  })

  it('pays a rank that names none the nearest rank below that does — the brand’s top rate stays its top rate', () => {
    expect([brandRateOf(STL, B, LADDER), brandRateOf(DIRECTOR, B, LADDER)]).toEqual([0.08, 0.08])
  })

  it('reads the nearest below, not the highest: a rank between two named ones takes the one under it', () => {
    const between = rank(35, 0.075)
    expect(brandRateOf(between, B, [...LADDER, between])).toBe(0.06)
  })

  it('with none below, pays the rank its own rate, never above the nearest named rate over it', () => {
    const trainee = rank(5, 0.03)
    const generous = rank(6, 0.045)
    expect(brandRateOf(trainee, B, [...LADDER, trainee])).toBe(0.03)
    // Its own 4.5% would beat the Revenue Specialist's 4% above it.
    expect(brandRateOf(generous, B, [...LADDER, generous])).toBe(0.04)
  })

  it('pays every rank its own rate for a brand no rank names', () => {
    expect([F, TL, DIRECTOR].map(r => brandRateOf(r, OTHER, LADDER))).toEqual([0.05, 0.09, 0.12])
  })

  it('pays nobody nothing', () => {
    expect(brandRateOf(undefined, B, LADDER)).toBe(0)
  })

  it('finds the brand whatever the case and the spaces of its key — a code as the brand list spells it, or an id', () => {
    const byCode: BrandRated = { sortOrder: 10, productRate: 0.05, brandRates: { '2990S': 0.04 } }
    expect([brandRateOf(byCode, ' 2990s ', [byCode]), brandRateOf(F, B.toUpperCase(), LADDER)]).toEqual([0.04, 0.04])
  })

  it('takes a rate of nothing as a rate — a rank may be paid nothing on the brand', () => {
    const none = rank(55, 0.095, 0)
    expect([brandRateOf(none, B, [...LADDER, none]), namesBrandRate(none, B)]).toEqual([0, true])
  })

  it('says which ranks name their own', () => {
    expect([namesBrandRate(TL, B), namesBrandRate(STL, B), namesBrandRate(TL, OTHER)]).toEqual([true, false, false])
  })
})

describe('readBrandRates', () => {
  it('reads brand id → rate, the id in lower case', () => {
    expect(readBrandRates({ [B.toUpperCase()]: 0.08, [OTHER]: 0 })).toEqual({ [B]: 0.08, [OTHER]: 0 })
  })

  it('drops what is no rate: a rate in quotes, one outside 0–1, a list, nothing', () => {
    expect(readBrandRates({ a: '0.08', b: 8, c: -0.01, d: null, e: Number.NaN })).toEqual({})
    expect([readBrandRates([0.08]), readBrandRates(null), readBrandRates(undefined), readBrandRates('x')]).toEqual([{}, {}, {}, {}])
  })
})

describe('the rank form’s brand rates', () => {
  const brands = [{ id: B, name: '2990s' }, { id: OTHER, name: 'Outlet' }]
  const form = (fields: Record<string, string>) => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
  }

  it('keeps a typed percentage as a rate, exactly', () => {
    expect(brandRateEdits(form({ [`${BRAND_RATE_FIELD}${B}`]: '7' }), brands)).toEqual({ set: { [B]: 0.07 }, clear: [] })
    expect(brandRateEdits(form({ [`${BRAND_RATE_FIELD}${B}`]: ' 7.25 ' }), brands).set[B]).toBe(0.0725)
    expect(brandRateEdits(form({ [`${BRAND_RATE_FIELD}${B}`]: '0' }), brands).set[B]).toBe(0)
  })

  it('clears a rate whose box was emptied', () => {
    expect(brandRateEdits(form({ [`${BRAND_RATE_FIELD}${B}`]: '  ' }), brands)).toEqual({ set: {}, clear: [B] })
  })

  it('touches only the brands the form carries a box for', () => {
    // A page opened before the second brand existed sends one box.
    const edits = brandRateEdits(form({ [`${BRAND_RATE_FIELD}${B}`]: '8', product_rate: '9' }), brands)
    expect(edits).toEqual({ set: { [B]: 0.08 }, clear: [] })
    expect(withBrandRateEdits({ [B]: 0.07, [OTHER]: 0.03 }, edits)).toEqual({ [B]: 0.08, [OTHER]: 0.03 })
    expect(brandRateEdits(form({ product_rate: '9' }), brands)).toEqual({ set: {}, clear: [] })
  })

  it('ignores a box for a brand that is not one of the scheme’s own-scheme brands', () => {
    expect(brandRateEdits(form({ [`${BRAND_RATE_FIELD}not-a-brand`]: '50' }), brands)).toEqual({ set: {}, clear: [] })
  })

  it('refuses a rate that is no percentage, naming the brand', () => {
    for (const typed of ['abc', '-1', '100.5', '8%']) {
      expect(() => brandRateEdits(form({ [`${BRAND_RATE_FIELD}${B}`]: typed }), brands)).toThrow('2990s rate must be between 0 and 100%')
    }
  })

  it('lays the edits over what is stored: set, clear, the rest as it was', () => {
    expect(withBrandRateEdits({ [B]: 0.08, [OTHER]: 0.03 }, { set: { [OTHER]: 0.02 }, clear: [B] })).toEqual({ [OTHER]: 0.02 })
    expect(withBrandRateEdits(null, { set: { [B]: 0.04 }, clear: [] })).toEqual({ [B]: 0.04 })
  })

  it('says whether anything moved — a save that moves nothing writes no rates', () => {
    expect(brandRatesChanged({ [B]: 0.08 }, { set: { [B]: 0.08 }, clear: [] })).toBe(false)
    expect(brandRatesChanged({ [B]: 0.08 }, { set: {}, clear: [OTHER] })).toBe(false)
    expect(brandRatesChanged({ [B]: 0.08 }, { set: {}, clear: [] })).toBe(false)
    expect(brandRatesChanged({ [B]: 0.08 }, { set: { [B]: 0.085 }, clear: [] })).toBe(true)
    expect(brandRatesChanged({ [B]: 0.08 }, { set: {}, clear: [B] })).toBe(true)
    expect(brandRatesChanged({}, { set: { [B]: 0 }, clear: [] })).toBe(true)
  })
})

describe('remapBrandRates', () => {
  it('carries a rank’s rates to a copied scheme under the copied brands’ ids', () => {
    const copy = '33333333-3333-4333-8333-333333333333'
    expect(remapBrandRates({ [B]: 0.08 }, new Map([[B, copy]]))).toEqual({ [copy]: 0.08 })
  })

  it('drops a rate whose brand was not copied', () => {
    expect(remapBrandRates({ [B]: 0.08, [OTHER]: 0.03 }, new Map([[B, 'x']]))).toEqual({ x: 0.08 })
    expect(remapBrandRates(null, new Map())).toEqual({})
  })
})

describe('a bill of a brand on its own scheme', () => {
  const codes = ownSchemeCodes([{ code: '2990S', ownScheme: true }, { code: 'AKEMI' }, { code: 'ZANOTTI', ownScheme: false }])

  it('knows the brands on their own scheme', () => {
    expect([...codes]).toEqual(['2990S'])
  })

  it('asks a bill’s brand code of them, trimmed and in any case', () => {
    expect([isOwnSchemeBill('2990S', codes), isOwnSchemeBill(' 2990s ', codes), isOwnSchemeBill('AKEMI', codes),
      isOwnSchemeBill(null, codes), isOwnSchemeBill(undefined, codes), isOwnSchemeBill('', codes)])
      .toEqual([true, true, false, false, false, false])
  })
})
