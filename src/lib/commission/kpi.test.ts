import { describe, expect, it } from 'vitest'
import {
  indexKpiItems,
  kpiAmountOf,
  kpiItemKey,
  lineSpecialsOf,
  mainAfterKpi,
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

describe('mainAfterKpi — never past zero', () => {
  it('takes the KPI items off', () => {
    expect(mainAfterKpi(10_000, 200)).toEqual({ main: 9_800, capped: false })
  })

  it('stops at zero when the add-ons come to more than the bill', () => {
    expect(mainAfterKpi(100, 200)).toEqual({ main: 0, capped: true })
  })

  it('leaves a credit note alone unless the KPI flips its sign', () => {
    expect(mainAfterKpi(-1_000, -200)).toEqual({ main: -800, capped: false })
    expect(mainAfterKpi(-100, -200)).toEqual({ main: 0, capped: true })
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
