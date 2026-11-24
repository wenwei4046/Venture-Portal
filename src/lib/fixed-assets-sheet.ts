import { listingOf, sumRows, type FaData, type ListingRow } from './fixed-assets'
import type { XCell, XSheet, XStyle } from './export/styled-xlsx'

// The PPE listing as a workbook (2026-11-24 — the user's Carres listing as the sample; then "export 出来的可以好看一点吗？"):
// the company, the title and the date over a two-row head — COST and ACCUM. DEPRECIATION over their four columns, NBV
// over its date — then each class under its title, its total ruled above, the total ruled above and doubled below.
// Lines between the columns, a firmer one where cost, depreciation and the book value begin, as the page draws them.

type Totals = Omit<ListingRow, 'asset' | 'rate'>

const INK = '33241B'
const HEAD = 'DFE4EE'
const CLASS = 'F4EFE7'
const SUB = 'F8F6F2'
const TOTAL = 'EEF3F8'
const MONEY = '#,##0.00;(#,##0.00);"-"'

const COLS = 13
/** Where a firmer line starts: Cost B/F, Accum. B/F, NBV. */
const SPLIT = new Set([4, 8, 12])

function cellStyle(col: number, base: XStyle, extra: { top?: 'thin' | 'medium'; bottom?: 'thin' | 'double' } = {}): XStyle {
  return {
    ...base,
    border: {
      left: SPLIT.has(col) ? 'medium' : 'thin',
      right: SPLIT.has(col + 1) ? 'medium' : 'thin',
      top: extra.top ?? 'thin',
      bottom: extra.bottom ?? 'thin',
    },
  }
}

export function ppeWorkbook(data: FaData, from: string, asAt: string, words: { company: string; year: string; asAt: string }): XSheet {
  const groups = listingOf(data, from, asAt)
  const rows: (XCell | null)[][] = []
  const merges: string[] = []
  const heights: Record<number, number> = {}

  // The letterhead.
  rows.push([{ v: words.company.toUpperCase(), style: { bold: true, size: 14, color: INK } }])
  rows.push([{ v: 'PROPERTY, PLANT AND EQUIPMENT LISTING', style: { bold: true, size: 11, color: INK } }])
  rows.push([{ v: `${words.year} · as at ${words.asAt}`, style: { italic: true, color: '6B6B6B' } }])
  rows.push([])
  heights[0] = 20

  // The head: two rows.
  const head = (v: string, col: number, align: XStyle['align'] = 'center'): XCell => ({ v, style: cellStyle(col, { bold: true, fill: HEAD, color: INK, align, valign: 'center', wrap: true }) })
  const h1 = rows.length
  rows.push([
    head('Voucher', 0, 'left'), head('Description', 1, 'left'), head('Purchase date', 2), head('Rate', 3),
    head('COST', 4), head('', 5), head('', 6), head('', 7),
    head('ACCUM. DEPRECIATION', 8), head('', 9), head('', 10), head('', 11),
    head(`NBV ${words.asAt}`, 12, 'right'),
  ])
  rows.push([
    head('', 0), head('', 1), head('', 2), head('', 3),
    head('B/F', 4, 'right'), head('Addition', 5, 'right'), head('Disposal / written off', 6, 'right'), head('C/F', 7, 'right'),
    head('B/F', 8, 'right'), head('Charge for the year', 9, 'right'), head('Disposal / written off', 10, 'right'), head('C/F', 11, 'right'),
    head('', 12),
  ])
  const r1 = h1 + 1
  const r2 = h1 + 2
  merges.push(`A${r1}:A${r2}`, `B${r1}:B${r2}`, `C${r1}:C${r2}`, `D${r1}:D${r2}`, `E${r1}:H${r1}`, `I${r1}:L${r1}`, `M${r1}:M${r2}`)
  heights[h1] = 18
  heights[h1 + 1] = 30

  const figures = (t: Totals, base: XStyle, extra?: Parameters<typeof cellStyle>[2]): XCell[] =>
    [t.costBf, t.addition, t.disposal, t.costCf, t.accBf, t.charge, t.accDisposal, t.accCf, t.nbv].map((v, i) => ({
      v,
      style: cellStyle(4 + i, { ...base, numFmt: MONEY, align: 'right' }, extra),
    }))

  const plain: XStyle = { color: INK }
  for (const g of groups) {
    // The class's title across the row.
    const t = rows.length + 1
    rows.push([{ v: g.cls.name.toUpperCase(), style: cellStyle(0, { bold: true, fill: CLASS, color: INK }) }, ...Array.from({ length: COLS - 1 }, (_, i) => ({ v: null, style: cellStyle(i + 1, { fill: CLASS }) }))])
    merges.push(`A${t}:M${t}`)
    for (const r of g.rows) {
      rows.push([
        { v: r.asset.voucher, style: cellStyle(0, { ...plain, color: '6B6B6B' }) },
        { v: r.asset.name, style: cellStyle(1, plain) },
        { v: r.asset.inServiceDate, date: true, style: cellStyle(2, { ...plain, numFmt: 'dd/mm/yyyy', align: 'center' }) },
        { v: Math.round(r.rate * 100) / 100, style: cellStyle(3, { ...plain, numFmt: '0.00"%"', align: 'right' }) },
        ...figures(r, plain),
      ])
    }
    const sub: XStyle = { bold: true, fill: SUB, color: INK }
    rows.push([
      { v: null, style: cellStyle(0, sub) },
      { v: `Total ${g.cls.name}`, style: cellStyle(1, sub) },
      { v: null, style: cellStyle(2, sub) },
      { v: null, style: cellStyle(3, sub) },
      ...figures(g.total, sub),
    ])
    rows.push([])
  }
  const total: XStyle = { bold: true, fill: TOTAL, color: '1E3E62' }
  const edge = { top: 'medium', bottom: 'double' } as const
  rows.push([
    { v: null, style: cellStyle(0, total, edge) },
    { v: 'TOTAL', style: cellStyle(1, total, edge) },
    { v: null, style: cellStyle(2, total, edge) },
    { v: null, style: cellStyle(3, total, edge) },
    ...figures(sumRows(groups.map((g) => g.total)), total, edge),
  ])

  return {
    name: `PPE ${words.asAt}`,
    rows,
    merges,
    heights,
    widths: [20, 52, 13, 9, 15, 15, 15, 15, 15, 15, 15, 15, 16],
    freeze: { rows: h1 + 2, cols: 2 },
    landscape: true,
  }
}
