import { listingOf, sumRows, type FaData } from './fixed-assets'

// The PPE listing as a sheet (2026-11-24 — the user's Carres listing as the sample): by class, a title row, its assets
// — voucher, description, purchase date, rate, cost B/F · addition · disposal · C/F, accumulated depreciation B/F ·
// the year's · disposal · C/F, net book value — and its subtotal; the total at the foot.

export interface FixedAssetsSheet {
  header: string[]
  rows: (string | number | null)[][]
  /** A class's title before its first row. */
  sectionBreaks: { afterRow: number; title: string }[]
  widths: number[]
}

const blank = (n: number) => (Math.abs(n) < 0.005 ? null : n)

export function fixedAssetsSheet(data: FaData, from: string, asAt: string, asAtWords: string): FixedAssetsSheet {
  const groups = listingOf(data, from, asAt)
  const header = [
    'Voucher', 'Description', 'Purchase date', 'Rate %',
    'Cost B/F', 'Addition', 'Disposal / written off', 'Cost C/F',
    'Accum. dep. B/F', 'Charge for the year', 'Disposal / written off', 'Accum. dep. C/F',
    `NBV ${asAtWords}`,
  ]
  const rows: (string | number | null)[][] = []
  const sectionBreaks: FixedAssetsSheet['sectionBreaks'] = []
  const figures = (t: ReturnType<typeof sumRows>) =>
    [t.costBf, t.addition, t.disposal, t.costCf, t.accBf, t.charge, t.accDisposal, t.accCf].map(blank).concat([t.nbv])
  for (const g of groups) {
    sectionBreaks.push({ afterRow: rows.length, title: g.cls.name.toUpperCase() })
    for (const r of g.rows) rows.push([r.asset.voucher, r.asset.name, r.asset.inServiceDate, Math.round(r.rate * 100) / 100, ...figures(r)])
    rows.push([null, `Total ${g.cls.name}`, null, null, ...figures(g.total)])
    rows.push([])
  }
  rows.push([null, 'TOTAL', null, null, ...figures(sumRows(groups.map((g) => g.total)))])
  return { header, rows, sectionBreaks, widths: [18, 44, 13, 8, 14, 14, 14, 14, 14, 14, 14, 14, 14] }
}
