/**
 * How a spreadsheet's preview is drawn (2026-10-11, the handoff's `isSheet`) —
 * the parts the page needs without Excel's reader, which `sheet.ts` loads
 * only when a sheet is opened.
 */

export const SHEET_ROWS = 200
export const SHEET_COLS = 26

export interface SheetPreview {
  /** Every row the same width (`columns`), each cell its displayed text. */
  rows: string[][]
  columns: number
  /** There were more rows (or columns) than the preview shows. */
  more: boolean
}

/** Excel's own column letters: A … Z, AA … */
export function columnLetter(i: number): string {
  let n = i + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** A cell that reads as a figure — money, a count, a percentage — sits right, in figures' type. */
export function looksNumeric(text: string): boolean {
  const t = text.trim()
  return t !== '' && /^[-+(]?\s*(RM\s*)?[\d,]*\d(\.\d+)?\)?\s*%?$/i.test(t)
}

/**
 * The columns of figures — as the handoff's Price column: right-aligned in
 * figures' type, its header too. A column counts when most of its filled cells
 * below the header read as figures.
 */
export function figureColumns(rows: readonly string[][]): boolean[] {
  const width = rows[0]?.length ?? 0
  return Array.from({ length: width }, (_, j) => {
    const filled = rows.slice(1).map(r => r[j] ?? '').filter(c => c.trim() !== '')
    return filled.length > 0 && filled.filter(looksNumeric).length >= Math.ceil(filled.length * 0.6)
  })
}
