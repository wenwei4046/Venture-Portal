import dayjs from 'dayjs'
import { figuresOf, monthsOf, type FaData } from './fixed-assets'

// The fixed asset schedule as a sheet (2026-11-24, for the auditor): one row an asset — cost, accumulated before the
// financial year, each of its months, the year, accumulated and net book value at its end — and a total row.

const r2 = (n: number) => Math.round(n * 100) / 100

export function fixedAssetsSheet(data: FaData, from: string, to: string): { header: string[]; rows: (string | number | null)[][]; widths: number[] } {
  const months = monthsOf(from, to)
  const figures = figuresOf(data, to)
  const classes = new Map(data.classes.map((c) => [c.id, c]))
  const header = ['Asset', 'Voucher', 'Class', 'In service', 'Life (months)', 'Cost', 'Accumulated b/f', ...months.map((m) => dayjs(`${m}-01`).format('MMM YYYY')), 'This year', 'Accumulated c/f', 'Net book value']
  const rows: (string | number | null)[][] = figures.map((f) => {
    const before = r2(f.months.filter((m) => m.month < from).reduce((s, m) => s + m.amount, 0))
    const by = new Map(f.months.map((m) => [m.month, m.amount]))
    const year = r2(months.reduce((s, m) => s + (by.get(m) ?? 0), 0))
    return [
      f.asset.name, f.asset.voucher, classes.get(f.asset.classId)?.name ?? '', f.asset.inServiceDate,
      f.asset.lifeMonths ?? f.cls?.lifeMonths ?? null, f.asset.cost, before || null,
      ...months.map((m) => by.get(m) ?? null), year || null, f.accumulated || null, f.nbv,
    ]
  })
  const sum = (i: number) => r2(rows.reduce((s, r) => s + (typeof r[i] === 'number' ? (r[i] as number) : 0), 0))
  const total: (string | number | null)[] = ['TOTAL', null, null, null, null]
  for (let i = 5; i < header.length; i++) total.push(sum(i))
  rows.push(total)
  return { header, rows, widths: [40, 18, 22, 12, 12, 14, 14, ...months.map(() => 11), 14, 14, 14] }
}
