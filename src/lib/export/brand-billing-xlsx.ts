import * as XLSX from 'xlsx'
import { reportWords, TYPE_LABEL, type BrandBillingReport, type ExportLine } from '@/lib/commission/brand-billing'

/**
 * The Sales by Brand & Billing workbook (2026-11-11) — laid out as the
 * user's own September file: Summary, All records, then one sheet per
 * salesperson. Money as `#,##0.00;(#,##0.00);–`, percentages as `0%`.
 */

const MONEY = '#,##0.00;(#,##0.00);–'
const PCT = '0%'
export const PCT_FINE = '0.##%'

export type Cell = string | number | null
export interface Fmt { col: number; z: string }

/** One sheet: rows of cells, which columns are money / percentages, widths. */
export class SheetDraft {
  rows: Cell[][] = []
  private formats: Map<number, Fmt[]> = new Map()

  add(row: Cell[], formats: Fmt[] = []) {
    this.formats.set(this.rows.length, formats)
    this.rows.push(row)
  }

  blank() {
    this.rows.push([])
  }

  build(widths: number[]): XLSX.WorkSheet {
    const sheet = XLSX.utils.aoa_to_sheet(this.rows)
    sheet['!cols'] = widths.map(wch => ({ wch }))
    this.formats.forEach((fmts, r) => {
      for (const { col, z } of fmts) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c: col })] as XLSX.CellObject | undefined
        if (cell && cell.t === 'n') cell.z = z
      }
    })
    return sheet
  }
}

export const money = (...cols: number[]): Fmt[] => cols.map(col => ({ col, z: MONEY }))

/** A record row: the 15 columns of the user's All records. */
function recordRow(line: ExportLine): Cell[] {
  return [
    line.name, TYPE_LABEL[line.type], line.erpNo, line.refNo, line.date, line.venue, line.customer, line.brandCode,
    line.wholeTotal, line.sharePct, line.sales, line.rate, line.commission, line.source, line.note,
  ]
}
const RECORD_FORMATS: Fmt[] = [...money(8, 10, 12), { col: 9, z: PCT }, { col: 11, z: PCT_FINE }]
const RECORD_WIDTHS = [15, 30, 18, 15, 11, 34, 22, 14, 13, 8, 13, 8, 12, 9, 50]

/** Sheet names: 31 characters, none of []:*?/\, each once. */
function sheetName(name: string, taken: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  for (let n = 2; taken.has(candidate.toUpperCase()); n++) candidate = `${base.slice(0, 27)} (${n})`
  taken.add(candidate.toUpperCase())
  return candidate
}

export function buildBrandBillingXlsx(report: BrandBillingReport): Buffer {
  const words = reportWords(report.period)
  const wb = XLSX.utils.book_new()
  const taken = new Set<string>()

  // ── Summary ────────────────────────────────────────────────────────────
  const s = new SheetDraft()
  s.add([`${report.title} · ${words.summaryTitle}`])
  s.add([words.summaryNote])
  s.blank()
  s.add(words.personHead)
  for (const p of report.people) {
    s.add([p.name, p.rate, p.bills, p.sales, p.belowDeposit, p.topup, p.upsell, p.drop, p.total], [{ col: 1, z: PCT_FINE }, ...money(3, 4, 5, 6, 7, 8)])
  }
  const t = report.totals
  s.add([words.total, null, t.bills, t.sales, t.belowDeposit, t.topup, t.upsell, t.drop, t.total], money(3, 4, 5, 6, 7, 8))

  s.blank()
  s.blank()
  s.add([words.byBrandTitle])
  s.add([words.name, ...report.brands.map(b => b.name), words.total])
  const brandCols = report.brands.map((_, i) => i + 1)
  const brandFmts = money(...brandCols, report.brands.length + 1)
  for (const p of report.people) {
    const mine = report.byBrand.get(p.staffId)
    s.add([p.name, ...report.brands.map(b => mine?.get(b.code) ?? 0), p.total], brandFmts)
  }
  s.add([words.total, ...report.brandTotals.map(b => b.total), t.total], brandFmts)

  s.blank()
  s.blank()
  s.add([words.brandSplitTitle])
  s.add(words.brandHead)
  for (const b of report.brandTotals) s.add([b.name, b.sales, b.topup, b.upsell, b.drop, b.total], money(1, 2, 3, 4, 5))
  s.add([words.total, t.sales, t.topup, t.upsell, t.drop, t.total], money(1, 2, 3, 4, 5))

  s.blank()
  s.blank()
  s.add([words.billTitle])
  s.add(words.billHead)
  for (const b of report.brandTotals) {
    s.add([b.name, b.total, b.hcBillPct ?? words.notSet, b.bill], [...money(1, 3), { col: 2, z: PCT_FINE }])
  }
  s.add([words.total, t.total, null, report.billTotal], money(1, 3))
  XLSX.utils.book_append_sheet(wb, s.build([17, 17, 14, 17, 17, 17, 17, 17, 17]), sheetName(words.summarySheet, taken))

  // ── All records ────────────────────────────────────────────────────────
  const all = new SheetDraft()
  all.add(words.recordHead)
  for (const line of report.lines) all.add(recordRow(line), RECORD_FORMATS)
  all.add([words.total, ...Array(9).fill(null), t.total, null, t.commission], money(10, 12))
  XLSX.utils.book_append_sheet(wb, all.build(RECORD_WIDTHS), sheetName(words.recordsSheet, taken))

  // ── One sheet per salesperson ─────────────────────────────────────────
  for (const p of report.people) {
    const sheet = new SheetDraft()
    sheet.add(words.recordHead)
    for (const line of report.lines) if (line.staffId === p.staffId) sheet.add(recordRow(line), RECORD_FORMATS)
    sheet.add([`${p.name} ${words.total}`, ...Array(9).fill(null), p.total, null, p.commission], money(10, 12))
    XLSX.utils.book_append_sheet(wb, sheet.build(RECORD_WIDTHS), sheetName(p.name, taken))
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer
}
