import { read, utils } from 'xlsx'
import { SHEET_COLS, SHEET_ROWS, type SheetPreview } from './sheet-view'

export { SHEET_COLS, SHEET_ROWS, columnLetter, looksNumeric, type SheetPreview } from './sheet-view'

/**
 * A spreadsheet's preview (2026-10-11, the handoff's `isSheet`: People ›
 * Documentation's View draws an Excel price list as a sheet — column letters
 * over the top, row numbers down the side, the first row its header). Read in
 * the BROWSER from the file's short link — this module, and Excel's reader
 * with it, is loaded only when a sheet is opened — the first sheet only, its
 * cells as they are displayed (the workbook's own number formats). Big sheets
 * are cut at SHEET_ROWS × SHEET_COLS and say so; nothing is kept.
 */
export function sheetPreview(data: ArrayBuffer): SheetPreview {
  // One row past the cut, to know whether there was more.
  const book = read(data, { type: 'array', sheetRows: SHEET_ROWS + 1 })
  const first = book.SheetNames[0]
  const sheet = first ? book.Sheets[first] : undefined
  if (!sheet) return { rows: [], columns: 0, more: false }
  const all = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false })
  const widest = all.reduce((w, r) => Math.max(w, Array.isArray(r) ? r.length : 0), 0)
  const columns = Math.min(SHEET_COLS, widest)
  const rows = all.slice(0, SHEET_ROWS).map(r => {
    const cells = (Array.isArray(r) ? r : []).slice(0, columns).map(c => (c === null || c === undefined ? '' : String(c)))
    return cells.length < columns ? [...cells, ...Array<string>(columns - cells.length).fill('')] : cells
  })
  return { rows, columns, more: all.length > SHEET_ROWS || widest > SHEET_COLS }
}
