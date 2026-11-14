import { describe, expect, it } from 'vitest'
import {
  brandFabricSeriesOf,
  fabricSeriesLabel,
  indexBrandKpiItems,
  indexFabricFamilies,
  indexFabricSeries,
  indexKpiItems,
  kpiAmountOf,
  kpiItemKey,
  kpiItemKind,
  kpiItemLabel,
  kpiPaidOf,
  kpiUnitPay,
  lineKpiFactsOf,
  lineSpecialsOf,
  coverKpi,
  orderKpiHits,
  sofaModuleOf,
  toUnitTiers,
  type KpiItem,
  type KpiLine,
} from './kpi'

const HB_STRAIGHT: KpiItem = { source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', kpiAmount: 200 }
const WOODEN_ARM: KpiItem = { source: 'option', optionPool: 'sofa_specials', optionValue: 'Wooden Arm', kpiAmount: 150 }
const PILLOW: KpiItem = { source: 'sku', productCode: 'AK-CS AIRLOFT COMFY PIL', label: 'Airloft pillow', kpiAmount: 50 }

const index = indexKpiItems([HB_STRAIGHT, WOODEN_ARM, PILLOW])

function line(id: string, itemGroup: string, productCode: string, qty: number, specials?: string[]): KpiLine {
  return { id, itemGroup, productCode, qty, specials }
}

describe('orderKpiHits — what a bill carries', () => {
  it('finds a SKU by its code, trimmed and in any case, per unit', () => {
    const hits = orderKpiHits({ lines: [line('p', 'ACC', '  ak-cs airloft comfy pil ', 3)] }, index)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ lineId: 'p', qty: 3, amount: 150, itemKey: 'sku:AK-CS AIRLOFT COMFY PIL' })
  })

  // The user's own example (2026-09-27): a bed frame with HB Straight.
  it('finds a bed frame special among the specials the line carries', () => {
    const hits = orderKpiHits({ lines: [line('b', 'bedframe', 'TRION (A)-(Q)', 1, ['HB Fully Cover', 'HB Straight'])] }, index)
    expect(hits.map(h => [h.itemKey, h.qty, h.amount])).toEqual([['option:bedframe_specials:hb straight', 1, 200]])
  })

  it('counts a bed frame special once per bed frame — two bed frames, two add-ons', () => {
    const hits = orderKpiHits({
      lines: [
        line('b1', 'BEDFRAME', 'TRION (A)-(K)', 1, ['HB Straight']),
        line('b2', 'BEDFRAME', 'CODY-(Q)', 2, ['HB Straight']),
      ],
    }, index)
    expect(kpiAmountOf(hits)).toBe(600) // (1 + 2) × 200
  })

  // A sofa prints its specials on every module line (Nylon Fabric: 127 lines
  // over 51 September bills) — one sofa, one add-on.
  it('counts a sofa special once per bill however many modules print it', () => {
    const hits = orderKpiHits({
      lines: [
        line('s1', 'sofa', '5530-1A(LHF)', 1, ['Wooden Arm']),
        line('s2', 'sofa', '5530-2A', 1, ['Wooden Arm', 'Nylon Fabric']),
        line('s3', 'sofa', '5530-1A(RHF)', 1, ['wooden arm']),
      ],
    }, index)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ lineId: 's1', qty: 1, amount: 150 })
  })

  it('reads the ERP spelling: case, spacing and a trailing "(…)"', () => {
    const hits = orderKpiHits({ lines: [line('b', 'BEDFRAME', 'X-(K)', 1, ['hb  STRAIGHT (to wall)'])] }, index)
    expect(kpiAmountOf(hits)).toBe(200)
  })

  it('finds a special only in its own category', () => {
    // A sofa that happens to print "HB Straight" is not a bed frame.
    const hits = orderKpiHits({ lines: [line('s', 'SOFA', '5530-2A', 1, ['HB Straight'])] }, index)
    expect(hits).toEqual([])
  })

  it('counts one special once on a line that prints it twice', () => {
    const hits = orderKpiHits({ lines: [line('b', 'BEDFRAME', 'X-(K)', 1, ['HB Straight', 'hb straight'])] }, index)
    expect(kpiAmountOf(hits)).toBe(200)
  })

  it('finds both a SKU and a special on one line', () => {
    const both = indexKpiItems([HB_STRAIGHT, { source: 'sku', productCode: 'TRION (A)-(K)', kpiAmount: 80 }])
    const hits = orderKpiHits({ lines: [line('b', 'BEDFRAME', 'TRION (A)-(K)', 1, ['HB Straight'])] }, both)
    expect(kpiAmountOf(hits)).toBe(280)
  })

  it('never finds anything on an upsale HR recorded', () => {
    expect(orderKpiHits({ upsale: true, lines: [line('u', 'ACC', 'AK-CS AIRLOFT COMFY PIL', 1)] }, index)).toEqual([])
    expect(orderKpiHits({ lines: [{ ...line('u', 'ACC', 'AK-CS AIRLOFT COMFY PIL', 1), upsale: true }] }, index)).toEqual([])
  })

  it('takes a returned item back', () => {
    const hits = orderKpiHits({ lines: [line('r', 'BEDFRAME', 'X-(K)', -1, ['HB Straight'])] }, index)
    expect(kpiAmountOf(hits)).toBe(-200)
  })

  it('treats an item with no source but a code as a SKU (rows before 2026-09-27)', () => {
    const legacy = indexKpiItems([{ productCode: 'PILLOW', kpiAmount: 20 }])
    expect(kpiAmountOf(orderKpiHits({ lines: [line('p', 'ACC', 'pillow', 2)] }, legacy))).toBe(40)
  })

  it('keys an item stably across spellings', () => {
    expect(kpiItemKey({ source: 'option', optionPool: 'bedframe_specials', optionValue: ' HB  Straight ' }))
      .toBe(kpiItemKey(HB_STRAIGHT))
  })
})

describe('coverKpi — a bill pays its KPI items only when its sales cover them', () => {
  it('takes the KPI items off a bill that covers them', () => {
    expect(coverKpi(10_000, 200)).toEqual({ main: 9_800, covered: true })
    expect(coverKpi(200, 200)).toEqual({ main: 0, covered: true })
  })

  // Two RM 0.00 exchanges in September 2026 still print the sofa's specials.
  it('pays a bill that cannot cover them as sales, taking nothing off', () => {
    expect(coverKpi(0, 150)).toEqual({ main: 0, covered: false })
    expect(coverKpi(100, 200)).toEqual({ main: 100, covered: false })
  })

  it('reads a credit note the same way round', () => {
    expect(coverKpi(-1_000, -200)).toEqual({ main: -800, covered: true })
    expect(coverKpi(-100, -200)).toEqual({ main: -100, covered: false })
  })

  it('always covers nothing', () => {
    expect(coverKpi(0, 0)).toEqual({ main: 0, covered: true })
  })
})

describe('lineSpecialsOf — the ERP says, in two ways', () => {
  it('reads raw.variants when the ERP sent them', () => {
    expect(lineSpecialsOf('bedframe', 'divan:10inch+noleg/m.gap:12inch', { specials: ['HB Straight'], gap: '12"' }))
      .toEqual(['HB Straight'])
  })

  it("else reads the ERP's description2 grammar", () => {
    expect(lineSpecialsOf('BEDFRAME', 'PC151-01 / DIVAN 8" + NO LEG / GAP 12" / SPECIAL: HB Fully Cover + HB Straight', null))
      .toEqual(['HB Fully Cover', 'HB Straight'])
  })

  it('reads nothing from hand-typed AutoCount-era text', () => {
    expect(lineSpecialsOf('BEDFRAME', 'HEADBOARD DO FULLY COVER/HEADBOARD DO STRAIGHT/Col:PC151-14', null)).toBeUndefined()
  })

  it('reads only bed frames and sofas', () => {
    expect(lineSpecialsOf('mattress', 'X / SPECIAL: HB Straight', null)).toBeUndefined()
  })
})

// ─── Fabric series (2026-10-29) ─────────────────────────────────────────────
// The user: "kpi item can selected with fabric series as well. for sofa and
// bedframe"; a sofa's "每组算一次" — once per sofa set — a bed frame's per frame.

const FABRIC_LIST = indexFabricSeries([
  { fabric_code: 'PC151-01', series: 'PC151', removed_at: null, active: true, synced_at: '2026-10-27T04:00:00+00:00' },
  { fabric_code: 'PC151-18', series: 'PC151', removed_at: null, active: true, synced_at: '2026-10-27T04:00:00+00:00' },
  { fabric_code: 'KS-08', series: 'KS', removed_at: null, active: true, synced_at: '2026-10-27T04:00:00+00:00' },
  { fabric_code: 'ZL-12', series: 'ZL', removed_at: null, active: true, synced_at: '2026-10-27T04:00:00+00:00' },
  // Merged away on the ERP: no series of its own.
  { fabric_code: 'AM275-1-IVORY', series: null, removed_at: null, active: false, synced_at: '2026-10-27T04:00:00+00:00' },
  // Listed twice: the live row's series wins over a removed one.
  { fabric_code: 'BN125-04', series: 'OLD BN', removed_at: '2026-10-01T00:00:00+00:00', active: true, synced_at: '2026-10-28T04:00:00+00:00' },
  { fabric_code: 'bn125-04 ', series: 'BN125', removed_at: null, active: true, synced_at: '2026-10-20T04:00:00+00:00' },
])

const PC151_SOFA: KpiItem = { source: 'option', optionPool: 'sofa_fabric_series', optionValue: 'PC151', label: 'PC151 · Sofa fabric', kpiAmount: 50 }
const PC151_BED: KpiItem = { source: 'option', optionPool: 'bedframe_fabric_series', optionValue: 'pc151', kpiAmount: 30 }
const fabricIndex = indexKpiItems([PC151_SOFA, PC151_BED, WOODEN_ARM])

function piece(id: string, itemGroup: string, productCode: string, qty: number, fabricSeries?: string, specials?: string[]): KpiLine {
  return { id, itemGroup, productCode, qty, ...(fabricSeries ? { fabricSeries } : {}), ...(specials ? { specials } : {}) }
}

describe('indexFabricSeries — the ERP fabric list, code → series', () => {
  it('compares a code trimmed and in any case, and leaves out a fabric with no series', () => {
    expect(FABRIC_LIST.get('PC151-18')).toBe('PC151')
    expect(FABRIC_LIST.has('AM275-1-IVORY')).toBe(false)
  })

  it('takes the live row where the list holds a code twice', () => {
    expect(FABRIC_LIST.get('BN125-04')).toBe('BN125')
  })
})

describe('lineKpiFactsOf — the specials and the fabric series a line carries', () => {
  it("reads the fabric from raw.variants and finds its series", () => {
    expect(lineKpiFactsOf('SOFA', '(1EL+1C)28inch/Col:ZL-12', { fabricCode: 'zl-12', specials: ['Nylon Fabric'] }, FABRIC_LIST))
      .toEqual({ specials: ['Nylon Fabric'], fabricSeries: 'ZL' })
  })

  it("else reads the first word of the ERP's description2", () => {
    expect(lineKpiFactsOf('bedframe', 'KS-08 SEA PINK / DIVAN 8" + NO LEG / GAP 12" / T.Heights 20"', null, FABRIC_LIST))
      .toEqual({ fabricSeries: 'KS' })
  })

  // An order keyed with its fabric TBC finds nothing until the ERP sends it again with the fabric.
  it('finds no series for a fabric still TBC, or one the list does not hold', () => {
    expect(lineKpiFactsOf('SOFA', null, { fabricCode: 'TBC' }, FABRIC_LIST)).toEqual({})
    expect(lineKpiFactsOf('SOFA', null, { fabricCode: 'CHINO-01' }, FABRIC_LIST)).toEqual({})
  })

  it('reads only bed frames and sofas', () => {
    expect(lineKpiFactsOf('MATTRESS', null, { fabricCode: 'PC151-01' }, FABRIC_LIST)).toEqual({})
  })
})

describe('orderKpiHits — a fabric series', () => {
  it('counts a bed frame series per bed frame, matched in any case', () => {
    const hits = orderKpiHits({ lines: [piece('b1', 'BEDFRAME', 'CODY-(Q)', 2, 'PC151'), piece('b2', 'BEDFRAME', 'TRION-(K)', 1, 'KS')] }, fabricIndex)
    expect(hits.map(h => [h.lineId, h.itemKey, h.qty, h.amount])).toEqual([['b1', 'option:bedframe_fabric_series:pc151', 2, 60]])
  })

  it('counts a sofa series once per sofa set however many pieces carry it', () => {
    const hits = orderKpiHits({
      lines: [
        piece('s1', 'SOFA', '8030-1A(LHF)', 1, 'PC151'),
        piece('s2', 'SOFA', '8030-CNR', 1, 'PC151'),
        piece('s3', 'SOFA', '8030-1A(RHF)', 1, 'PC151'),
      ],
    }, fabricIndex)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ lineId: 's1', qty: 1, amount: 50 })
  })

  // The user chose "Sofa 每组算一次": two PC151 sofas on one bill are two.
  it('counts two sofas in the series on one bill twice — two models, or one model ×2 everywhere', () => {
    const twoModels = orderKpiHits({
      lines: [piece('a1', 'SOFA', '8030-1A(LHF)', 1, 'PC151'), piece('a2', 'SOFA', '9058-2A', 1, 'PC151')],
    }, fabricIndex)
    expect(kpiAmountOf(twoModels)).toBe(100)
    const doubled = orderKpiHits({
      lines: [piece('d1', 'SOFA', '8030-1A(LHF)', 2, 'PC151'), piece('d2', 'SOFA', '8030-1A(RHF)', 2, 'PC151')],
    }, fabricIndex)
    expect(doubled.map(h => h.qty)).toEqual([2])
  })

  it('takes a returned sofa back, and finds none on the exchange of a piece', () => {
    const returned = orderKpiHits({ lines: [piece('r1', 'SOFA', '8030-1A(LHF)', -1, 'PC151'), piece('r2', 'SOFA', '8030-2A', -1, 'PC151')] }, fabricIndex)
    expect(returned.map(h => [h.qty, h.amount])).toEqual([[-1, -50]])
    const exchanged = orderKpiHits({ lines: [piece('e1', 'SOFA', '8030-1A(LHF)', -1, 'PC151'), piece('e2', 'SOFA', '8030-1A(RHF)', 1, 'PC151')] }, fabricIndex)
    expect(exchanged).toEqual([])
  })

  it("finds a series only in its own category, beside a sofa special counted once per bill", () => {
    const hits = orderKpiHits({
      lines: [
        piece('s1', 'SOFA', '8030-1A', 1, 'PC151', ['Wooden Arm']),
        piece('s2', 'SOFA', '9058-1A', 1, 'PC151', ['Wooden Arm']),
        piece('x', 'MATTRESS', 'AK-APEX', 1, 'PC151'),
      ],
    }, fabricIndex)
    expect(hits.map(h => [h.itemKey, h.qty]).sort()).toEqual([
      ['option:sofa_fabric_series:pc151', 1],
      ['option:sofa_fabric_series:pc151', 1],
      ['option:sofa_specials:wooden arm', 1],
    ])
  })

  // 2026-11-13 — the sub-department's KPI switch went on. Until then each holder of a shared bill was given the
  // whole unit of an item counted once a bill or once a set (TODOS: a shared bill's once-a-bill KPI item).
  it("gives a part of a shared bill its part of a unit counted once a set or once a bill — the parts add up to one", () => {
    const share = { parts: [{ staffId: 'owner', pct: 0.5 }, { staffId: 'mate', pct: 0.5 }] }
    // Half a bill: the lines' quantities are halved (splitOrdersByShares).
    const half = [
      piece('s1', 'SOFA', '8030-1A(LHF)', 0.5, 'PC151', ['Wooden Arm']),
      piece('s2', 'SOFA', '8030-1A(RHF)', 0.5, 'PC151', ['Wooden Arm']),
      piece('b1', 'BEDFRAME', 'CODY-(Q)', 0.5, 'PC151'),
    ]
    for (const staffId of ['owner', 'mate']) {
      expect(orderKpiHits({ lines: half, staffId, share }, fabricIndex).map(h => [h.itemKey, h.qty, h.amount, h.paid]).sort()).toEqual([
        ['option:bedframe_fabric_series:pc151', 0.5, 15, 15],
        ['option:sofa_fabric_series:pc151', 0.5, 25, 25],
        ['option:sofa_specials:wooden arm', 0.5, 75, 75],
      ])
    }
    // A third of two sofas of one model: two thirds of a unit — and of a returned sofa, as much taken back.
    const third = { parts: [{ staffId: 'owner', pct: 2 / 3 }, { staffId: 'mate', pct: 1 / 3 }] }
    const two = orderKpiHits({ lines: [piece('s1', 'SOFA', '8030-2A', 2 / 3, 'PC151')], staffId: 'mate', share: third }, fabricIndex)
    expect(two[0].qty).toBeCloseTo(2 / 3, 10)
    expect(two[0].amount).toBe(33.33)
    const back = orderKpiHits({ lines: [piece('s1', 'SOFA', '8030-2A', -0.5, 'PC151', ['Wooden Arm'])], staffId: 'mate', share }, fabricIndex)
    expect(back.map(h => [h.itemKey, h.qty]).sort()).toEqual([['option:sofa_fabric_series:pc151', -0.5], ['option:sofa_specials:wooden arm', -0.5]])
    // A bill nobody shares counts as before.
    expect(orderKpiHits({ lines: [piece('s1', 'SOFA', '8030-2A', 1, 'PC151', ['Wooden Arm'])] }, fabricIndex).map(h => h.qty)).toEqual([1, 1])
  })

  it('names a series with whose it is, the way the writer stores it', () => {
    expect(kpiItemLabel(PC151_SOFA)).toBe('PC151 · Sofa fabric')
    expect(kpiItemLabel(PC151_BED)).toBe('pc151 · Bed frame fabric')
    expect(fabricSeriesLabel('bedframe_fabric_series', ' KS ')).toBe('KS · Bed frame fabric')
    expect(kpiItemKind(PC151_SOFA)).toEqual({ kind: 'Sofa fabric series', counted: 'Once per sofa set' })
    expect(kpiItemKind(PC151_BED)).toEqual({ kind: 'Bed frame fabric series', counted: 'Per bed frame' })
  })
})

// 2026-11-12 — a brand on its own commission scheme has KPI items of its own (2990s; the user: "这个 KPI item 是独立的，
// 属于 2990 专属的 KPI item"; "Upgrade fabric … Bonus RM50 — Upgrade latex seat … Bonus by tier (units): 1 - 4 per units
// RM50; 5-9 per units RM70; 10 above per units RM100"; "升级的钱只拿 bonus").
const UPGRADE_FABRIC: KpiItem = { source: 'option', optionPool: 'sofa_specials', optionValue: 'Sofa Full Fabric', label: 'Upgrade fabric', kpiAmount: 50, brandCode: '2990S' }
const UPGRADE_LATEX: KpiItem = {
  source: 'option', optionPool: 'sofa_specials', optionValue: 'Latex Seat', label: 'Upgrade latex seat', kpiAmount: 50, brandCode: '2990S',
  unitTiers: [{ minQty: 5, amount: 70 }, { minQty: 10, amount: 100 }],
}
/** The sub-department's own item of the same special. */
const OWN_LATEX: KpiItem = { source: 'option', optionPool: 'sofa_specials', optionValue: 'Latex Seat', kpiAmount: 40 }
const ALL_ITEMS = [HB_STRAIGHT, WOODEN_ARM, PILLOW, OWN_LATEX, UPGRADE_FABRIC, UPGRADE_LATEX]
const brandIndex = indexBrandKpiItems(ALL_ITEMS).get('2990S')!

/** A sofa piece carrying specials, with what its special order charges for each (by the special's name, lower case). */
function sofaPiece(id: string, productCode: string, qty: number, specials: string[], money: Record<string, number> = {}): KpiLine {
  return { id, itemGroup: 'SOFA', productCode, qty, specials, ...(Object.keys(money).length ? { specialMoney: money } : {}) }
}

describe("a brand's own KPI items — whose they are", () => {
  it('keeps them out of the sub-department’s index, and indexes each brand’s own', () => {
    const own = indexKpiItems(ALL_ITEMS)
    expect(own.size).toBe(4)
    expect(own.byOption.get('sofa_specials')?.get('latex seat')).toBe(OWN_LATEX)
    expect([...indexBrandKpiItems(ALL_ITEMS).keys()]).toEqual(['2990S'])
    expect(brandIndex.size).toBe(2)
    expect(brandIndex.byOption.get('sofa_specials')?.get('latex seat')).toBe(UPGRADE_LATEX)
  })

  it('takes a brand’s item of every kind (2026-11-14), the brand’s code in any case', () => {
    const odd: KpiItem[] = [
      { source: 'sku', productCode: 'SQUARE PILLOW-M', kpiAmount: 10, brandCode: '2990S' },
      { source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', kpiAmount: 10, brandCode: '2990S' },
      { source: 'option', optionPool: 'models', optionValue: 'Boaat', kpiAmount: 10, brandCode: '2990S' },
      { source: 'option', optionPool: 'compartments', optionValue: 'CNR', kpiAmount: 10, brandCode: '2990S' },
      { ...UPGRADE_FABRIC, brandCode: ' 2990s ' },
    ]
    const made = indexBrandKpiItems(odd)
    expect([...made.keys()]).toEqual(['2990S'])
    expect(made.get('2990S')?.size).toBe(5)
    expect(made.get('2990S')?.brand).toBe(true)
    // …and none of them is the sub-department's.
    expect(indexKpiItems(odd).size).toBe(0)
  })

  it('tells it from the sub-department’s item of the same special', () => {
    expect(kpiItemKey(UPGRADE_LATEX)).toBe('brand:2990S:option:sofa_specials:latex seat')
    expect(kpiItemKey(OWN_LATEX)).toBe('option:sofa_specials:latex seat')
    expect(kpiItemLabel(UPGRADE_LATEX)).toBe('Upgrade latex seat')
    expect(kpiItemKind(UPGRADE_LATEX)).toEqual({ kind: 'Sofa special', counted: 'Once per sofa set' })
    expect(kpiItemKind(OWN_LATEX)).toEqual({ kind: 'Sofa special', counted: 'Once per sofa bill' })
  })
})

describe("a brand's own KPI items — what a bill carries", () => {
  it('finds one where the bill charges for it: a unit a sofa, what it charged off the bill, the item’s amount paid', () => {
    // 2990-SO-2611-017: one sofa of two pieces, Latex Seat RM 500 written on both.
    const hits = orderKpiHits({ lines: [
      sofaPiece('a', 'BOAAT-1A(P)(LHF)', 1, ['Latex Seat'], { 'latex seat': 500 }),
      sofaPiece('b', 'BOAAT-1A(P)(RHF)', 1, ['Latex Seat'], { 'latex seat': 500 }),
    ] }, brandIndex)
    expect(hits).toEqual([{
      item: UPGRADE_LATEX, itemKey: 'brand:2990S:option:sofa_specials:latex seat', lineId: 'a', qty: 1, amount: 500, paid: 50,
    }])
    expect(kpiAmountOf(hits)).toBe(500)
    expect(kpiPaidOf(hits)).toBe(50)
  })

  // 2026-11-13 — the user: "主要 detect 到有这个 KPI item，就算他有卖到 KPI，不需要去 detect 他有没有收钱。因为有时候
  // 他们是直接把价钱写在 remark 栏上，导致他的那个 amount 并没有填写在 KPI item 里". Until then: only where it charged.
  it('finds one wherever the sofa names it, charged or not — a unit, the bonus, and nothing off a bill that charges nothing', () => {
    const unit = [{ qty: 1, amount: 0, paid: 50 }]
    const read = (hits: ReturnType<typeof orderKpiHits>) => hits.map(h => ({ qty: h.qty, amount: h.amount, paid: h.paid }))
    // No special order at all (the price written in the remark), one that charges RM 0, one that charges for something else.
    expect(read(orderKpiHits({ lines: [sofaPiece('a', 'QUBBU-2A', 1, ['Latex Seat'])] }, brandIndex))).toEqual(unit)
    expect(read(orderKpiHits({ lines: [sofaPiece('a', 'QUBBU-2A', 1, ['Latex Seat'], { 'latex seat': 0 })] }, brandIndex))).toEqual(unit)
    expect(read(orderKpiHits({ lines: [sofaPiece('a', 'QUBBU-2A', 1, ['Latex Seat'], { miscellaneous: 10 })] }, brandIndex))).toEqual(unit)
    expect(kpiAmountOf(orderKpiHits({ lines: [sofaPiece('a', 'QUBBU-2A', 1, ['Latex Seat'])] }, brandIndex))).toBe(0)
    // One piece of the set charged, the other not: the set's dearest copy comes off, once.
    expect(read(orderKpiHits({ lines: [
      sofaPiece('a', 'QUBBU-1A(LHF)', 1, ['Latex Seat']),
      sofaPiece('b', 'QUBBU-2A(RHF)', 1, ['Latex Seat'], { 'latex seat': 500 }),
    ] }, brandIndex))).toEqual([{ qty: 1, amount: 500, paid: 50 }])
    // Two sofas of one model, neither charged: two units.
    expect(read(orderKpiHits({ lines: [sofaPiece('a', 'LOTTI-2A', 2, ['Sofa Full Fabric'])] }, brandIndex))).toEqual([{ qty: 2, amount: 0, paid: 100 }])
  })

  it('finds none where the special is only typed into the special order — the sofa does not name it', () => {
    expect(orderKpiHits({ lines: [sofaPiece('a', 'QUBBU-2A', 1, [], { 'latex seat': 500 })] }, brandIndex)).toEqual([])
    expect(orderKpiHits({ lines: [sofaPiece('a', 'QUBBU-2A', 1, ['Nylon Fabric'], { 'latex seat': 500 })] }, brandIndex)).toEqual([])
  })

  it('counts each sofa on the bill, at its own surcharge — a corner’s RM 1,000', () => {
    const hits = orderKpiHits({ lines: [
      sofaPiece('a', 'BOAAT-2A', 1, ['Latex Seat'], { 'latex seat': 500 }),
      sofaPiece('b', 'KABBIN-2A(LHF)', 1, ['Latex Seat'], { 'latex seat': 1_000 }),
      sofaPiece('c', 'KABBIN-L(RHF)', 1, ['Latex Seat'], { 'latex seat': 1_000 }),
    ] }, brandIndex)
    expect(hits.map(h => [h.lineId, h.qty, h.amount, h.paid])).toEqual([['a', 1, 500, 50], ['b', 1, 1_000, 50]])
  })

  it('counts one model twice as two sofas, and takes a returned sofa back', () => {
    const twice = orderKpiHits({ lines: [
      sofaPiece('a', 'LOTTI-2A(LHF)', 2, ['Latex Seat'], { 'latex seat': 500 }),
      sofaPiece('b', 'LOTTI-L(RHF)', 2, ['Latex Seat'], { 'latex seat': 500 }),
    ] }, brandIndex)
    expect(twice.map(h => [h.qty, h.amount, h.paid])).toEqual([[2, 1_000, 100]])
    const returned = orderKpiHits({ lines: [sofaPiece('a', 'LOTTI-2A(LHF)', -1, ['Latex Seat'], { 'latex seat': 500 })] }, brandIndex)
    expect(returned.map(h => [h.qty, h.amount, h.paid])).toEqual([[-1, -500, -50]])
  })

  it('reads a special with words in brackets as the item without them, at what that spelling was charged', () => {
    const hits = orderKpiHits({ lines: [sofaPiece('a', 'KABBIN-2A(LHF)', 1, ['Latex Seat (Corner)'], { 'latex seat (corner)': 1_000 })] }, brandIndex)
    expect(hits.map(h => [h.item, h.amount])).toEqual([[UPGRADE_LATEX, 1_000]])
  })

  it('finds both upgrades on one sofa, each on its own', () => {
    const hits = orderKpiHits({ lines: [sofaPiece('a', 'TELLUC-2A', 1, ['Sofa Full Fabric', 'Latex Seat'], { 'sofa full fabric': 250, 'latex seat': 500 })] }, brandIndex)
    expect(hits.map(h => [kpiItemLabel(h.item), h.amount, h.paid]).sort()).toEqual([['Upgrade fabric', 250, 50], ['Upgrade latex seat', 500, 50]])
  })

  it('carries a part of a shared bill its part of the unit and of what the bill charged', () => {
    // Half a bill: the lines' quantities are halved (splitOrdersByShares); the surcharge is the sofa's, not scaled.
    const share = { parts: [{ staffId: 'owner', pct: 0.5 }, { staffId: 'mate', pct: 0.5 }] }
    const half = [sofaPiece('a', 'TELLUC-2A(LHF)', 0.5, ['Sofa Full Fabric'], { 'sofa full fabric': 250 }), sofaPiece('b', 'TELLUC-L(RHF)', 0.5, ['Sofa Full Fabric'], { 'sofa full fabric': 250 })]
    for (const staffId of ['owner', 'mate']) {
      expect(orderKpiHits({ lines: half, staffId, share }, brandIndex).map(h => [h.qty, h.amount, h.paid])).toEqual([[0.5, 125, 25]])
    }
    // A third of two sofas of one model: two thirds of a unit.
    const third = { parts: [{ staffId: 'owner', pct: 2 / 3 }, { staffId: 'mate', pct: 1 / 3 }] }
    const hits = orderKpiHits({ lines: [sofaPiece('a', 'LOTTI-2A', 2 / 3, ['Latex Seat'], { 'latex seat': 500 })], staffId: 'mate', share: third }, brandIndex)
    expect(hits[0].qty).toBeCloseTo(2 / 3, 10)
    expect(hits[0].amount).toBe(333.33)
  })

  it('is never found by the sub-department’s index, nor the sub-department’s by the brand’s', () => {
    const lines = [sofaPiece('a', 'BOAAT-2A', 1, ['Latex Seat', 'Wooden Arm'], { 'latex seat': 500, 'wooden arm': 300 })]
    expect(orderKpiHits({ lines }, indexKpiItems(ALL_ITEMS)).map(h => [h.itemKey, h.amount, h.paid]).sort()).toEqual([
      ['option:sofa_specials:latex seat', 40, 40],
      ['option:sofa_specials:wooden arm', 150, 150],
    ])
    expect(orderKpiHits({ lines }, brandIndex).map(h => [h.itemKey, h.amount, h.paid])).toEqual([['brand:2990S:option:sofa_specials:latex seat', 500, 50]])
  })
})

// 2026-11-14 — 2990s' own items are picked as the sub-department's are (the user: "我只需要像 Fair 一样选 KPI 就好，不需要去
// 选它的 cost"; "by model、by special 或者是 by compartment"); what an item takes off is what the bill charged for it
// ("扣掉再发 bonus"), a compartment once a sofa set ("每组沙发算 1 个"). The twin of comm_kpi_hits (20261114230000;
// tests/member-sql/validate-brand-kpi-any-item.mjs holds the same bills).
describe("a brand's own KPI items of every kind — what a bill carries and takes off", () => {
  const brand = (item: Omit<KpiItem, 'brandCode'>): KpiItem => ({ ...item, brandCode: '2990S' })
  const PILLOW_M = brand({ source: 'sku', productCode: 'SQUARE PILLOW-M', label: 'Square pillow', kpiAmount: 10 })
  const LOTTI_CNR = brand({ source: 'sku', productCode: 'LOTTI-CNR', label: 'Lotti corner', kpiAmount: 5 })
  const DELIVERY = brand({ source: 'sku', productCode: 'SVC-DELIVERY', label: 'Delivery', kpiAmount: 5 })
  const BOAAT = brand({ source: 'option', optionPool: 'models', optionValue: 'Boaat', kpiAmount: 40 })
  const ARIA = brand({ source: 'option', optionPool: 'models', optionValue: 'aria', kpiAmount: 25 })
  const CNR = brand({ source: 'option', optionPool: 'compartments', optionValue: 'CNR', kpiAmount: 30 })
  const HB = brand({ source: 'option', optionPool: 'bedframe_specials', optionValue: 'HB Straight', kpiAmount: 20 })
  const EZ = brand({ source: 'option', optionPool: 'sofa_fabric_series', optionValue: 'EZ', label: 'EZ · Sofa fabric', kpiAmount: 50 })
  const HOMELY = brand({ source: 'option', optionPool: 'sofa_fabric_series', optionValue: 'HOMELY', label: 'HOMELY · Sofa fabric', kpiAmount: 60 })
  const BELONG = brand({ source: 'option', optionPool: 'bedframe_fabric_series', optionValue: 'BELONG', label: 'BELONG · Bed frame fabric', kpiAmount: 15 })
  const every = indexBrandKpiItems([PILLOW_M, LOTTI_CNR, DELIVERY, BOAAT, CNR, HB, EZ, HOMELY, BELONG, UPGRADE_FABRIC, UPGRADE_LATEX]).get('2990S')!
  // The scheme's groups: a delivery earns no commission.
  const commissionable = (group: string) => ['SOFA', 'ACCESSORY', 'BEDFRAME', 'MATTRESS'].includes(group.trim().toUpperCase())
  const piece = (id: string, itemGroup: string, productCode: string, qty: number, lineAmount: number, more: Partial<KpiLine> = {}): KpiLine =>
    ({ id, itemGroup, productCode, qty, lineAmount, ...more })
  const read = (hits: ReturnType<typeof orderKpiHits>) =>
    hits.map(h => `${kpiItemLabel(h.item)} ×${Math.round(h.qty * 1000) / 1000} off ${h.amount} pays ${h.paid}`).sort()

  it('a model: the whole sofa once a set; its latex seat found but nothing more off; a SKU per unit at its line; a delivery nothing off', () => {
    // B1: a Boaat in an EZ fabric naming Latex Seat (RM 500), two square pillows, its delivery.
    const lines = [
      piece('a', 'SOFA', 'BOAAT-1A(P)(LHF)', 1, 1870, { model: 'Boaat', specials: ['Latex Seat'], specialMoney: { 'latex seat': 500 }, fabricSeries: 'EZ' }),
      piece('b', 'SOFA', 'BOAAT-1A(P)(RHF)', 1, 1870, { model: 'Boaat', specials: ['Latex Seat'], specialMoney: { 'latex seat': 500 }, fabricSeries: 'EZ' }),
      piece('c', 'ACCESSORY', 'SQUARE PILLOW-M', 2, 50, { model: 'SQUARE PILLOW' }),
      piece('d', 'SERVICE', 'SVC-DELIVERY', 1, 250, { model: 'SVC-DELIVERY' }),
    ]
    const hits = orderKpiHits({ lines }, every, commissionable)
    expect(read(hits)).toEqual([
      'Boaat ×1 off 3740 pays 40', 'Delivery ×1 off 0 pays 5', 'EZ · Sofa fabric ×1 off 0 pays 50',
      'Square pillow ×2 off 50 pays 20', 'Upgrade latex seat ×1 off 0 pays 50',
    ])
    expect(coverKpi(3_790, kpiAmountOf(hits))).toEqual({ main: 0, covered: true })
  })

  it('a compartment: once a sofa set, the pieces’ money — a U with two corners one unit, two corner sofas two', () => {
    // B2: a corner sofa naming Latex Seat (RM 1,000) in BROWNIE-02 (HOMELY): the corner off, the latex seat nothing more.
    expect(read(orderKpiHits({ lines: [
      piece('a', 'SOFA', 'BOOQIT-2A(LHF)', 1, 2000, { model: 'Booqit', specials: ['Latex Seat'], specialMoney: { 'latex seat': 1000 }, fabricSeries: 'HOMELY' }),
      piece('b', 'SOFA', 'BOOQIT-CNR', 1, 1500, { model: 'Booqit', specials: ['Latex Seat'], specialMoney: { 'latex seat': 1000 }, fabricSeries: 'HOMELY' }),
      piece('c', 'SOFA', 'BOOQIT-2A(RHF)', 1, 2000, { model: 'Booqit', specials: ['Latex Seat'], specialMoney: { 'latex seat': 1000 }, fabricSeries: 'HOMELY' }),
    ] }, every, commissionable))).toEqual(['CNR ×1 off 1500 pays 30', 'HOMELY · Sofa fabric ×1 off 0 pays 60', 'Upgrade latex seat ×1 off 0 pays 50'])
    // B3: a U.
    expect(read(orderKpiHits({ lines: [
      piece('a', 'SOFA', 'XAMMAR-2A(LHF)', 1, 1500), piece('b', 'SOFA', 'XAMMAR-CNR', 1, 1000), piece('c', 'SOFA', 'XAMMAR-2A', 1, 1500),
      piece('d', 'SOFA', 'XAMMAR-CNR', 1, 1000), piece('e', 'SOFA', 'XAMMAR-2A(RHF)', 1, 1500),
    ] }, every, commissionable))).toEqual(['CNR ×1 off 2000 pays 30'])
    // B4: every piece twice.
    expect(read(orderKpiHits({ lines: [
      piece('a', 'SOFA', 'KABBIN-2A(LHF)', 2, 6000), piece('b', 'SOFA', 'KABBIN-CNR', 2, 2000), piece('c', 'SOFA', 'KABBIN-1A(RHF)', 2, 3000),
    ] }, every, commissionable))).toEqual(['CNR ×2 off 2000 pays 60'])
  })

  it('a piece is one whole item: its SKU before its model before its compartment', () => {
    // B5: LOTTI-CNR is a SKU item — no compartment's.
    expect(read(orderKpiHits({ lines: [piece('a', 'SOFA', 'LOTTI-2A', 1, 2200), piece('b', 'SOFA', 'LOTTI-CNR', 1, 1200)] }, every, commissionable)))
      .toEqual(['Lotti corner ×1 off 1200 pays 5'])
    // B6: a Boaat's corner is its model's.
    expect(read(orderKpiHits({ lines: [
      piece('a', 'SOFA', 'BOAAT-2A', 1, 2000, { model: 'Boaat' }), piece('b', 'SOFA', 'BOAAT-CNR', 1, 1000, { model: 'Boaat' }),
    ] }, every, commissionable))).toEqual(['Boaat ×1 off 3000 pays 40'])
  })

  it('a bed frame’s special per bed frame at its charge, its fabric series nothing off — and a model’s bed frame per unit', () => {
    const bed = piece('a', 'BEDFRAME', 'ARIA-(Q)', 2, 1600, { model: 'aria', specials: ['HB Straight'], specialMoney: { 'hb straight': 150 }, fabricSeries: 'BELONG' })
    expect(read(orderKpiHits({ lines: [bed] }, every, commissionable)))
      .toEqual(['BELONG · Bed frame fabric ×2 off 0 pays 30', 'HB Straight ×2 off 300 pays 40'])
    // Aria a model item: the bed frames come off whole, their HB Straight nothing more.
    const withAria = indexBrandKpiItems([ARIA, HB]).get('2990S')!
    expect(read(orderKpiHits({ lines: [bed] }, withAria, commissionable))).toEqual(['HB Straight ×2 off 0 pays 40', 'aria ×2 off 1600 pays 50'])
  })

  it('takes a returned unit back, and gives a part of a shared bill its part', () => {
    expect(read(orderKpiHits({ lines: [piece('a', 'ACCESSORY', 'SQUARE PILLOW-M', -1, -25)] }, every, commissionable)))
      .toEqual(['Square pillow ×-1 off -25 pays -10'])
    // Half a corner sofa: the lines carry their quantities and amounts halved (splitOrdersByShares).
    const share = { parts: [{ staffId: 'owner', pct: 0.5 }, { staffId: 'mate', pct: 0.5 }] }
    const half = [piece('a', 'SOFA', 'KABBIN-2A(LHF)', 0.5, 3000), piece('b', 'SOFA', 'KABBIN-CNR', 0.5, 1000)]
    expect(read(orderKpiHits({ lines: half, staffId: 'mate', share }, every, commissionable))).toEqual(['CNR ×0.5 off 1000 pays 15'])
  })

  it('finds none of a brand’s on the sub-department’s bill', () => {
    const lines = [piece('a', 'SOFA', 'BOAAT-2A', 1, 2000, { model: 'Boaat', specials: ['Latex Seat', 'Wooden Arm'], specialMoney: { 'latex seat': 500 } })]
    expect(orderKpiHits({ lines }, indexKpiItems([...ALL_ITEMS, BOAAT, CNR]), commissionable).map(h => h.itemKey).sort())
      .toEqual(['option:sofa_specials:latex seat', 'option:sofa_specials:wooden arm'])
  })

  it('names the kinds as the tabs print them', () => {
    expect([PILLOW_M, BOAAT, CNR, HB, EZ, BELONG, UPGRADE_LATEX].map(item => kpiItemKind(item))).toEqual([
      { kind: 'SKU', counted: 'Per unit' },
      { kind: 'Model', counted: 'Once per sofa set, else per unit' },
      { kind: 'Compartment', counted: 'Once per sofa set' },
      { kind: 'Bed frame special', counted: 'Per bed frame' },
      { kind: 'Sofa fabric series', counted: 'Once per sofa set' },
      { kind: 'Bed frame fabric series', counted: 'Per bed frame' },
      { kind: 'Sofa special', counted: 'Once per sofa set' },
    ])
    expect(kpiItemKey(CNR)).toBe('brand:2990S:option:compartments:cnr')
  })

  it('reads a piece’s module as the costing does — the code after its last “-”, no spaces, before its brackets', () => {
    expect(['BOOQIT-CNR', 'xammar-cnr (p)', 'XAMMAR-CNR(P)(LHF)', '8030-2A(LHF)', 'CNRX-2A', 'CNR', ' '].map(sofaModuleOf))
      .toEqual(['CNR', 'CNR', 'CNR', '2A', '2A', 'CNR', ''])
  })
})

describe("a brand's bill's fabric series — its own company's list, else the code's family", () => {
  const LIST = [
    { fabric_code: 'BROWNIE-02', series: 'HOMELY' }, { fabric_code: 'EZ-007', series: null },
    { fabric_code: 'X1-01', series: 'HOMELY', removed_at: '2026-10-01' }, { fabric_code: 'X1-01', series: null },
  ]
  const families = indexFabricFamilies(LIST)

  it('reads a fabric’s series, a fabric with none — or none on the list — in its code’s family', () => {
    expect(['BROWNIE-02', 'ez-007', 'D-004', 'Velvet Interlace - Bronze', 'MONZA FL 113', '', null].map(f => brandFabricSeriesOf(f, families)))
      .toEqual(['HOMELY', 'ez', 'D', 'Velvet Interlace', 'MONZA FL 113', undefined, undefined])
  })

  it('picks the live row first, whether it has a series or not', () => {
    expect(brandFabricSeriesOf('X1-01', families)).toBe('X1')
  })

  it('reads a brand’s line by its families, every other line as before', () => {
    expect(lineKpiFactsOf('SOFA', null, { fabricCode: 'EZ-007' }, undefined, families)).toEqual({ fabricSeries: 'EZ' })
    expect(lineKpiFactsOf('SOFA', null, { fabricCode: 'EZ-007' }, indexFabricSeries([{ fabric_code: 'EZ-007', series: 'EASY' }])))
      .toEqual({ fabricSeries: 'EASY' })
    expect(lineKpiFactsOf('MATTRESS', null, { fabricCode: 'EZ-007' }, undefined, families)).toEqual({})
  })
})

describe('kpiUnitPay — what a unit pays in a month', () => {
  it('pays the item’s amount below the first tier, and the tier the month’s units reach from it — whole', () => {
    const pay = (units: number) => kpiUnitPay(UPGRADE_LATEX, units)
    expect([1, 4, 4.5, 5, 6, 9, 9.99, 10, 25].map(pay)).toEqual([50, 50, 50, 70, 70, 70, 70, 100, 100])
    // The user's month: six latex seats are 6 × RM 70.
    expect(6 * pay(6)).toBe(420)
  })

  it('pays an item without tiers its amount, whatever the month', () => {
    expect([1, 50].map(units => kpiUnitPay(UPGRADE_FABRIC, units))).toEqual([50, 50])
    expect(kpiUnitPay(PILLOW, 99)).toBe(50)
  })

  it('reads the column’s tiers lowest first, leaving out what is not a tier', () => {
    expect(toUnitTiers([{ min_qty: 10, amount: 100 }, { min_qty: 5, amount: '70' }])).toEqual([{ minQty: 5, amount: 70 }, { minQty: 10, amount: 100 }])
    expect(toUnitTiers([{ min_qty: 5 }, { amount: 70 }, null, 'x', { min_qty: 0, amount: 70 }, { min_qty: 5, amount: -1 }, { min_qty: null, amount: 70 }])).toEqual([])
    expect(toUnitTiers(null)).toEqual([])
    expect(toUnitTiers({ min_qty: 5, amount: 70 })).toEqual([])
  })
})
