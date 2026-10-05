import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseLineFacts } from './facts'
import {
  CHARGED_POOLS,
  gridPrice,
  isPricedPool,
  lineCharge,
  OptionPrices,
  poolPriceOf,
  POOLS,
  priceGridOf,
  roundCents,
  sofaSetCharges,
  TIERS,
  unitPrice,
  type OptionPrice,
  type PriceCell,
} from './pricing'

/**
 * The twins of catalogue_grid_price, catalogue_unit_price and
 * catalogue_option_price (migration 20260924030000 §6–§8), catalogue_line_charge
 * and the sofa's once-a-set charge of catalogue_apply_sofa_charges
 * (20261006050000). Every expectation in the agreeing blocks is what the
 * SQL returned for the same input (the migration loaded verbatim into PGlite).
 * `it.fails` marks an input the twins answer differently: the assertion is the
 * SQL's answer.
 */

const MIRROR_SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20260924020000_erp_catalogue_mirror.sql'), 'utf8')

/** The quoted values of the first `<constraint> CHECK (… IN ( … ))` list. */
function checkList(constraint: string): string[] {
  const at = MIRROR_SQL.indexOf(`CONSTRAINT ${constraint} CHECK`)
  if (at < 0) throw new Error(`${constraint} not found`)
  const open = MIRROR_SQL.indexOf(' IN (', at) + 5
  const list = MIRROR_SQL.slice(open, MIRROR_SQL.indexOf(')', open))
  return [...list.matchAll(/'([^']*)'/g)].map(m => m[1])
}

/** A sofa module's grid: PRICE_2 is missing at 35, and 28 only knows PRICE_3. */
const GRID: PriceCell[] = [
  { height: '30', tier: 'PRICE_1', price: 100 },
  { height: '30', tier: 'PRICE_2', price: 120 },
  { height: '30', tier: 'PRICE_3', price: 150 },
  { height: '35', tier: 'PRICE_1', price: 110 },
  { height: '35', tier: 'PRICE_3', price: 160 },
  { height: '28', tier: 'PRICE_3', price: 170 },
]

describe('priceGridOf', () => {
  it('keeps well-formed cells, height and tier trimmed', () => {
    expect(priceGridOf([{ height: ' 30 ', tier: ' PRICE_2 ', price: 120 }])).toEqual([{ height: '30', tier: 'PRICE_2', price: 120 }])
  })

  it('reads a price stored as a numeric string', () => {
    expect(priceGridOf([{ height: '30', tier: 'PRICE_2', price: '120.50' }])).toEqual([{ height: '30', tier: 'PRICE_2', price: 120.5 }])
  })

  it('keeps a zero — zero is a price', () => {
    expect(priceGridOf([{ height: '30', tier: 'PRICE_2', price: 0 }])).toEqual([{ height: '30', tier: 'PRICE_2', price: 0 }])
  })

  it.each<[unknown]>([[null], [undefined], [{}], ['[]'], [42]])('%j is not a grid → []', raw => {
    expect(priceGridOf(raw)).toEqual([])
  })

  it('drops a cell with no height or no tier, and anything that is not a cell', () => {
    const raw = [
      { tier: 'PRICE_2', price: 1 },
      { height: '  ', tier: 'PRICE_2', price: 1 },
      { height: '30', price: 1 },
      { height: '30', tier: '', price: 1 },
      null,
      'cell',
      7,
      { height: '35', tier: 'PRICE_1', price: 2 },
    ]
    expect(priceGridOf(raw)).toEqual([{ height: '35', tier: 'PRICE_1', price: 2 }])
  })

  it.each<[unknown]>([[-1], [Number.NaN], [Number.POSITIVE_INFINITY], ['abc'], [null], [undefined], [true]])(
    'drops a cell whose price is %j',
    price => {
      expect(priceGridOf([{ height: '30', tier: 'PRICE_2', price }])).toEqual([])
    },
  )

  // Number('') is 0, so a BLANK cell comes back as a price of 0 — the one thing
  // a blank must never become (a margin of 100%). catalogue_grid_price only
  // reads a cell whose price text matches ^\d+(\.\d+)?$, so SQL skips it.
  it('a blank price string is no price, never RM 0 (the SQL twin skips it too)', () => {
    expect(priceGridOf([{ height: '30', tier: 'PRICE_2', price: '' }])).toEqual([])
  })
})

describe('gridPrice — catalogue_grid_price', () => {
  it('the exact (height, tier) cell', () => {
    expect(gridPrice(GRID, '30', 'PRICE_1')).toBe(100)
    expect(gridPrice(GRID, '30', 'PRICE_3')).toBe(150)
  })

  it('no tier means PRICE_2 — the ERP’s legacy default', () => {
    expect(gridPrice(GRID, '30', null)).toBe(120)
  })

  it('a tier the grid does not carry falls back to PRICE_2 at that height', () => {
    expect(gridPrice(GRID, '30', 'PRICE_9')).toBe(120)
  })

  it('no PRICE_2 at that height → the lowest tier there', () => {
    expect(gridPrice(GRID, '35', 'PRICE_2')).toBe(110)
    expect(gridPrice(GRID, '35', null)).toBe(110)
  })

  it('only PRICE_3 at that height → PRICE_3, whatever tier was asked for', () => {
    expect(gridPrice(GRID, '28', 'PRICE_1')).toBe(170)
  })

  it('the height is matched by its key: inch marks, curly quotes and case fold', () => {
    expect(gridPrice(GRID, '30"', 'PRICE_1')).toBe(100)
    expect(gridPrice(GRID, '30”', 'PRICE_2')).toBe(120)
    expect(gridPrice([{ height: '75cm', tier: 'PRICE_2', price: 5 }], '75CM', 'PRICE_2')).toBe(5)
  })

  it('never borrows another height’s price', () => {
    expect(gridPrice(GRID, '24', 'PRICE_2')).toBeNull()
  })

  it.each(['', '  ', '"', null])('no height (%j) reads nothing', height => {
    expect(gridPrice(GRID, height, 'PRICE_2')).toBeNull()
  })

  it('an empty grid knows nothing', () => {
    expect(gridPrice([], '30', 'PRICE_2')).toBeNull()
  })
})

describe('unitPrice — catalogue_unit_price', () => {
  const ONE_HEIGHT: PriceCell[] = [{ height: '30', tier: 'PRICE_2', price: 120 }]
  const TWO_HEIGHTS: PriceCell[] = [
    { height: '30', tier: 'PRICE_2', price: 120 },
    { height: '35', tier: 'PRICE_2', price: 140 },
  ]

  it('no portal row for the SKU → unpriced', () => {
    expect(unitPrice(null, '30', 'PRICE_2')).toEqual({ price: null, how: 'unpriced' })
  })

  it('the one figure', () => {
    expect(unitPrice({ price: 999, grid: null }, '30', 'PRICE_2')).toEqual({ price: 999, how: 'price' })
  })

  it('a zero figure is a price, not "unpriced"', () => {
    expect(unitPrice({ price: 0, grid: null }, '30', null)).toEqual({ price: 0, how: 'price' })
  })

  it('the grid at the build’s height and tier, before the one figure', () => {
    expect(unitPrice({ price: 999, grid: GRID }, '35', 'PRICE_3')).toEqual({ price: 160, how: 'grid' })
  })

  it('a grid of ONE seat height answers without a height', () => {
    expect(unitPrice({ price: null, grid: ONE_HEIGHT }, null, null)).toEqual({ price: 120, how: 'grid' })
    expect(unitPrice({ price: null, grid: ONE_HEIGHT }, '  ', null)).toEqual({ price: 120, how: 'grid' })
  })

  it('…including one height spelled two ways', () => {
    const grid: PriceCell[] = [
      { height: '30', tier: 'PRICE_2', price: 120 },
      { height: '30"', tier: 'PRICE_1', price: 100 },
    ]
    expect(unitPrice({ price: null, grid }, null, 'PRICE_1')).toEqual({ price: 100, how: 'grid' })
  })

  it('a grid of several heights needs one: the one figure if there is one, else no_height', () => {
    expect(unitPrice({ price: 50, grid: TWO_HEIGHTS }, null, null)).toEqual({ price: 50, how: 'price' })
    expect(unitPrice({ price: null, grid: TWO_HEIGHTS }, null, null)).toEqual({ price: null, how: 'no_height' })
  })

  it('a height the grid does not know is never priced at another height', () => {
    expect(unitPrice({ price: 50, grid: ONE_HEIGHT }, '35', null)).toEqual({ price: 50, how: 'price' })
    expect(unitPrice({ price: null, grid: ONE_HEIGHT }, '35', null)).toEqual({ price: null, how: 'no_height' })
  })

  it('reads the grid at a height written with an inch mark', () => {
    expect(unitPrice({ price: null, grid: TWO_HEIGHTS }, '35"', 'PRICE_3')).toEqual({ price: 140, how: 'grid' })
  })

  it('an empty or missing grid is no grid', () => {
    expect(unitPrice({ price: null, grid: [] }, '30', null)).toEqual({ price: null, how: 'unpriced' })
    expect(unitPrice({ price: null, grid: null }, '30', null)).toEqual({ price: null, how: 'unpriced' })
  })
})

describe('isPricedPool / poolPriceOf / POOLS / TIERS', () => {
  it('a sofa’s seat sizes carry no price; every other pool does', () => {
    expect(POOLS.filter(p => !isPricedPool(p))).toEqual(['sofa_sizes'])
  })

  // 2026-10-06 (user): "我要那些价钱是不会算进 margin 的" — every price keyed on Maintenance is the customer's.
  it('every priced pool is charged to the customer; none is a cost', () => {
    expect(POOLS.map(p => [p, poolPriceOf(p)])).toEqual([
      ['bedframe_divan_heights', 'charge'],
      ['bedframe_total_heights', 'charge'],
      ['bedframe_gaps', 'charge'],
      ['bedframe_leg_heights', 'charge'],
      ['bedframe_specials', 'charge'],
      ['sofa_sizes', null],
      ['sofa_leg_heights', 'charge'],
      ['sofa_specials', 'charge'],
    ])
    expect([...CHARGED_POOLS].sort()).toEqual(POOLS.filter(p => p !== 'sofa_sizes').sort())
  })

  it('POOLS is exactly the pool list erp_maintenance_options allows', () => {
    expect([...POOLS].sort()).toEqual(checkList('erp_maintenance_options_pool_valid').sort())
  })

  it('TIERS is exactly what catalogue_combo_prices allows besides "" (any tier)', () => {
    expect([...TIERS]).toEqual(checkList('catalogue_combo_prices_tier_valid').filter(t => t !== ''))
  })
})

/** The Maintenance tab's surcharges — a bed frame and a sofa pool each. */
const OPTIONS: OptionPrice[] = [
  { pool: 'bedframe_divan_heights', value: '10"', price: 30 },
  { pool: 'bedframe_leg_heights', value: 'No Leg', price: 0 },
  { pool: 'bedframe_leg_heights', value: '4"', price: 15 },
  { pool: 'bedframe_total_heights', value: '24"', price: 20 },
  { pool: 'bedframe_specials', value: 'Right Drawer', price: 50 },
  { pool: 'bedframe_specials', value: 'No Side Panel', price: -40 },
  { pool: 'sofa_leg_heights', value: 'Default', price: 0 },
  { pool: 'sofa_leg_heights', value: '6"', price: 25 },
  { pool: 'sofa_specials', value: 'Nylon Fabric', price: 80 },
  { pool: 'sofa_specials', value: 'Right Drawer (10")', price: 70 },
  { pool: 'sofa_specials', value: 'Right Drawer', price: 60 },
]
const prices = new OptionPrices(OPTIONS)

describe('OptionPrices — catalogue_option_price', () => {
  it('looks a value up by its folded spelling', () => {
    expect(prices.get('bedframe_divan_heights', '10”')).toBe(30)
    expect(prices.get('bedframe_leg_heights', 'NO LEG')).toBe(0)
    expect(prices.get('sofa_leg_heights', 'DEFAULT')).toBe(0)
  })

  it('a zero surcharge is a price, not "unpriced"', () => {
    expect(prices.get('bedframe_leg_heights', 'No Leg')).toBe(0)
  })

  it('keeps the pools apart', () => {
    expect(prices.get('bedframe_leg_heights', '4"')).toBe(15)
    expect(prices.get('sofa_leg_heights', '4"')).toBeNull()
  })

  it('a special printed with its choices falls back to its bare code', () => {
    expect(prices.get('bedframe_specials', 'Right Drawer (10")')).toBe(50)
    expect(prices.get('sofa_specials', 'Right Drawer (12", Soft Close)')).toBe(60)
  })

  it('…and an exact match on the printed choices wins over the bare code', () => {
    expect(prices.get('sofa_specials', 'Right Drawer (10")')).toBe(70)
  })

  it('reads a price as stored — a negative one too, though the table refuses one since 2026-10-06', () => {
    expect(prices.get('bedframe_specials', 'No Side Panel')).toBe(-40)
  })

  it('an unknown or blank value has no price', () => {
    expect(prices.get('sofa_specials', 'Wooden Arm')).toBeNull()
    expect(prices.get('sofa_specials', null)).toBeNull()
    expect(prices.get('sofa_specials', '   ')).toBeNull()
    expect(prices.get('sofa_specials', '(10")')).toBeNull()
  })

  it('an empty price list prices nothing', () => {
    expect(new OptionPrices([]).get('sofa_specials', 'Nylon Fabric')).toBeNull()
  })
})

describe('lineCharge — catalogue_line_charge', () => {
  /** The dry run's prices (20261005010000 / 20261006050000). */
  const charged = new OptionPrices([
    { pool: 'bedframe_leg_heights', value: '6"', price: 100 },
    { pool: 'bedframe_divan_heights', value: '12"', price: 50 },
    { pool: 'bedframe_gaps', value: '12"', price: 20 },
    { pool: 'bedframe_gaps', value: '4"', price: 0 },
    { pool: 'bedframe_total_heights', value: '30"', price: 40 },
    { pool: 'bedframe_specials', value: 'Right Drawer', price: 50 },
    { pool: 'bedframe_specials', value: 'HYDRAULIC', price: 300 },
    { pool: 'sofa_leg_heights', value: '6"', price: 100 },
    { pool: 'sofa_leg_heights', value: 'Default', price: 0 },
    { pool: 'sofa_specials', value: 'Nylon Fabric', price: 50 },
  ])
  const none = { divan: null, leg: null, gap: null, total: null, specials: [] as string[] }

  it('a bed frame: divan, leg, gap and total height priced above zero, in that order', () => {
    const facts = parseLineFacts('NB-04 / DIVAN 12" + LEG 6" / GAP 12" / T.Heights 30"')
    expect(lineCharge('BEDFRAME', facts, charged)).toEqual({
      amount: 210,
      parts: [
        { pool: 'bedframe_divan_heights', value: '12"', price: 50 },
        { pool: 'bedframe_leg_heights', value: '6"', price: 100 },
        { pool: 'bedframe_gaps', value: '12"', price: 20 },
        { pool: 'bedframe_total_heights', value: '30"', price: 40 },
      ],
    })
  })

  it('an option nobody priced, or priced at 0, is FOC — it is not listed', () => {
    expect(lineCharge('BEDFRAME', { ...none, divan: '10"', leg: 'No Leg', gap: '4"', total: '24"' }, charged)).toEqual({ amount: 0, parts: [] })
  })

  it('looks the value up by its folded spelling, as the SQL does', () => {
    expect(lineCharge('bedframe', { ...none, leg: '6”' }, charged).amount).toBe(100)
  })

  // 2026-10-06: a bed frame's special is the customer's too — no longer a cost.
  it('a bed frame’s specials are charged after its heights, a special named twice once', () => {
    const facts = parseLineFacts('PC151-01 / DIVAN 12" + NO LEG / GAP 14" / SPECIAL: Right Drawer + Hydraulic')
    expect(lineCharge('BEDFRAME', facts, charged)).toEqual({
      amount: 400,
      parts: [
        { pool: 'bedframe_divan_heights', value: '12"', price: 50 },
        { pool: 'bedframe_specials', value: 'Right Drawer', price: 50 },
        { pool: 'bedframe_specials', value: 'Hydraulic', price: 300 },
      ],
    })
    expect(lineCharge('BEDFRAME', { ...none, specials: ['Right Drawer', 'RIGHT  DRAWER', 'Unknown'] }, charged).amount).toBe(50)
  })

  it('a sofa line: its leg height and specials — a divan, gap or total height on it is ignored', () => {
    expect(lineCharge('SOFA', { divan: '12"', leg: '6"', gap: '12"', total: '30"', specials: ['Nylon Fabric', 'Wooden Arm'] }, charged)).toEqual({
      amount: 150,
      parts: [
        { pool: 'sofa_leg_heights', value: '6"', price: 100 },
        { pool: 'sofa_specials', value: 'Nylon Fabric', price: 50 },
      ],
    })
    expect(lineCharge('SOFA', { ...none, leg: 'DEFAULT' }, charged)).toEqual({ amount: 0, parts: [] })
  })

  it.each(['MATTRESS', 'ACCESSORY', '', null])('%j is never charged', category => {
    expect(lineCharge(category, { divan: '12"', leg: '6"', gap: '12"', total: '30"', specials: ['Nylon Fabric', 'Right Drawer'] }, charged)).toEqual({ amount: 0, parts: [] })
  })

  it('the category is case-folded but not trimmed, as UPPER(COALESCE(…)) is', () => {
    expect(lineCharge('sofa', { ...none, leg: '6"' }, charged).amount).toBe(100)
    expect(lineCharge(' SOFA', { ...none, leg: '6"' }, charged)).toEqual({ amount: 0, parts: [] })
  })

  it('sums in floating point; roundCents lands it where the SQL’s NUMERIC does', () => {
    const tenths = new OptionPrices([
      { pool: 'sofa_specials', value: 'A', price: 0.1 },
      { pool: 'sofa_specials', value: 'B', price: 0.2 },
    ])
    const r = lineCharge('SOFA', { ...none, specials: ['A', 'B'] }, tenths)
    expect(r.amount).toBeCloseTo(0.3, 10)
    expect(roundCents(r.amount)).toBe(0.3)
  })
})

// 2026-10-06 (user): "整组 sofa 只加一次" — a sofa's options once per sofa, not per piece.
describe('sofaSetCharges — catalogue_apply_sofa_charges', () => {
  const p = new OptionPrices([
    { pool: 'sofa_leg_heights', value: '6"', price: 100 },
    { pool: 'sofa_leg_heights', value: 'Default', price: 0 },
    { pool: 'sofa_specials', value: 'Nylon Fabric', price: 50 },
    { pool: 'sofa_specials', value: 'Wooden Arm', price: 30 },
  ])
  const piece = (group: string, qty: number, leg: string | null, specials: string[] = []) => ({ group, qty, leg, specials })
  const LEG = { pool: 'sofa_leg_heights', value: '6"', price: 100 }
  const NYLON = { pool: 'sofa_specials', value: 'Nylon Fabric', price: 50 }

  it('three pieces of one sofa are charged once: RM 100 + RM 50 = RM 150, not three times', () => {
    const lines = [piece('8030', 1, '6"', ['Nylon Fabric']), piece('8030', 1, '6"', ['Nylon Fabric']), piece('8030', 1, '6"', ['Nylon Fabric'])]
    expect(sofaSetCharges(lines, p)).toEqual([{ group: '8030', sets: 1, unit: 150, total: 150, parts: [LEG, NYLON] }])
  })

  it('×2 on every piece is two sofas; ×1 / ×2 / ×1 is one sofa with two middle pieces', () => {
    expect(sofaSetCharges([piece('810', 2, '6"'), piece('810', 2, '6"'), piece('810', 2, '6"')], p)[0]).toMatchObject({ sets: 2, total: 200 })
    expect(sofaSetCharges([piece('810', 1, '6"'), piece('810', 2, '6"'), piece('810', 1, '6"')], p)[0]).toMatchObject({ sets: 1, total: 100 })
  })

  it('a special any piece names is the whole sofa’s — Wooden Arm on the two arm pieces is charged once', () => {
    const lines = [piece('810', 1, null, ['Wooden Arm']), piece('810', 1, null), piece('810', 1, null, ['WOODEN  ARM'])]
    expect(sofaSetCharges(lines, p)).toEqual([{ group: '810', sets: 1, unit: 30, total: 30, parts: [{ pool: 'sofa_specials', value: 'Wooden Arm', price: 30 }] }])
  })

  it('two models in one bill are two sofas', () => {
    const r = sofaSetCharges([piece('810', 1, '6"'), piece('5030', 1, '6"', ['Nylon Fabric'])], p)
    expect(r.map(s => [s.group, s.total])).toEqual([['810', 100], ['5030', 150]])
  })

  it('a sofa nothing is charged for is left out: a FOC leg, an unpriced special, nothing named', () => {
    expect(sofaSetCharges([piece('810', 1, 'Default', ['Seat Firmer']), piece('9050', 1, null)], p)).toEqual([])
  })

  it('a piece with no quantity is no piece', () => {
    expect(sofaSetCharges([piece('810', 0, '6"')], p)).toEqual([])
    // …nor do the options it names count: the sofa is its other pieces.
    expect(sofaSetCharges([piece('810', 0, '6"'), piece('810', 2, null)], p)).toEqual([])
    expect(sofaSetCharges([piece('810', 0, '6"'), piece('810', 2, '6"')], p)[0]).toMatchObject({ sets: 2, total: 200 })
  })

  it('reads values by their folded spelling', () => {
    expect(sofaSetCharges([piece('810', 1, '6”', ['NYLON FABRIC'])], p)[0].total).toBe(150)
  })
})

describe('roundCents — ROUND(x, 2)', () => {
  it.each([
    [1.005, 1.01],
    [2.675, 2.68],
    [0.125, 0.13],
    [0.285, 0.29],
    [1.255, 1.26],
    [8.345, 8.35],
    [1234.565, 1234.57],
    [0.1 + 0.2, 0.3],
    [1.45, 1.45],
    [4.999, 5],
    [-2.5, -2.5],
    [1e-9, 0],
  ])('%d → %d, as ROUND(x, 2) does', (n, cents) => {
    expect(roundCents(n)).toBe(cents)
  })

  // ROUND(numeric) rounds half AWAY from zero; Math.round rounds -100.5 UP, to -100.
  it('rounds like the SQL: ROUND(-1.005, 2) = -1.01', () => {
    expect(roundCents(-1.005)).toBe(-1.01)
  })

  // A unit of 20.15 at a quantity of 0.5: exactly 10.075 in NUMERIC, which ROUND
  // takes to 10.08. The double is 10.07499…, and at this magnitude adding
  // Number.EPSILON no longer lifts it over the half.
  it('rounds like the SQL: ROUND(20.15 * 0.5, 2) = 10.08', () => {
    expect(roundCents(20.15 * 0.5)).toBe(10.08)
  })
})
