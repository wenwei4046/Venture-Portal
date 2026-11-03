import { describe, expect, it } from 'vitest'
import {
  fabricSeriesLabel,
  indexFabricSeries,
  indexKpiItems,
  kpiAmountOf,
  kpiItemKey,
  kpiItemKind,
  kpiItemLabel,
  lineKpiFactsOf,
  lineSpecialsOf,
  coverKpi,
  orderKpiHits,
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

  it('names a series with whose it is, the way the writer stores it', () => {
    expect(kpiItemLabel(PC151_SOFA)).toBe('PC151 · Sofa fabric')
    expect(kpiItemLabel(PC151_BED)).toBe('pc151 · Bed frame fabric')
    expect(fabricSeriesLabel('bedframe_fabric_series', ' KS ')).toBe('KS · Bed frame fabric')
    expect(kpiItemKind(PC151_SOFA)).toEqual({ kind: 'Sofa fabric series', counted: 'Once per sofa set' })
    expect(kpiItemKind(PC151_BED)).toEqual({ kind: 'Bed frame fabric series', counted: 'Per bed frame' })
  })
})
