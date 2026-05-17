import * as XLSX from 'xlsx'

export interface XlsxSectionBreak {
  /**
   * Insert the section title row BEFORE this data-row index. Use 0 to put a
   * title at the top of the data; use `rows.length` to append one at the end.
   * `afterRow` semantics mirror Array.splice insertion points — the title is
   * inserted at the given index, pushing the original row to index+1.
   */
  afterRow: number
  title: string
}

export interface BuildXlsxArgs {
  sheetName: string
  headerRow: string[]
  rows: (string | number | null)[][]
  columnWidths?: number[]              // in characters, per column
  numberFormat?: string                // applied to numeric cells; default below
  sectionBreaks?: XlsxSectionBreak[]
}

const DEFAULT_NUMBER_FORMAT = '#,##0.00;(#,##0.00);—'

/**
 * Build an .xlsx file as a Node Buffer. Single-sheet, single-header, optional
 * section title rows interleaved between data rows.
 *
 * Per-cell number formatting is applied to numeric values only. String cells
 * are left untouched. `null` values render as blank cells.
 */
export function buildXlsxBuffer(args: BuildXlsxArgs): Buffer {
  const numberFormat = args.numberFormat ?? DEFAULT_NUMBER_FORMAT

  // 1. Interleave section title rows into the data rows.
  const rows: (string | number | null)[][] = []
  const breaks = (args.sectionBreaks ?? []).slice().sort((a, b) => a.afterRow - b.afterRow)
  let nextBreak = 0
  for (let i = 0; i <= args.rows.length; i++) {
    while (nextBreak < breaks.length && breaks[nextBreak].afterRow === i) {
      rows.push([breaks[nextBreak].title])
      nextBreak += 1
    }
    if (i < args.rows.length) {
      rows.push(args.rows[i])
    }
  }

  // 2. Build the sheet, with header at the top.
  const aoa: (string | number | null)[][] = [args.headerRow, ...rows]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  // 3. Apply column widths if supplied.
  if (args.columnWidths && args.columnWidths.length > 0) {
    sheet['!cols'] = args.columnWidths.map((w) => ({ wch: w }))
  }

  // 4. Apply number format to every numeric cell (skip header row at index 0).
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr] as { t?: string; v?: unknown; z?: string } | undefined
      if (cell && cell.t === 'n') {
        cell.z = numberFormat
      }
    }
  }

  // 5. Build the workbook + serialize to buffer.
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, args.sheetName.slice(0, 31))
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return out
}
