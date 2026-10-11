import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { utils, write } from 'xlsx'
import { SHEET_COLS, SHEET_ROWS, columnLetter, looksNumeric, sheetPreview } from './sheet'
import { figureColumns } from './sheet-view'

const SRC = path.resolve(__dirname, '../..')

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return files(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
  })
}

// People › Documentation's View draws a spreadsheet as the handoff's sheet (2026-10-11).

function workbook(rows: unknown[][], type: 'xlsx' | 'csv' = 'xlsx'): ArrayBuffer {
  const book = utils.book_new()
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), 'Prices')
  if (type === 'csv') return new TextEncoder().encode(utils.sheet_to_csv(book.Sheets.Prices)).buffer as ArrayBuffer
  const out = write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return out
}

describe('a spreadsheet, previewed', () => {
  it('reads the first sheet as it is displayed, every row as wide as the widest', () => {
    const preview = sheetPreview(workbook([
      ['Item', 'Brand', 'Size', 'Price (RM)'],
      ['Akemi Cool Touch mattress', 'Akemi', 'Queen', '2,890'],
      ['Akemi bamboo pillow', 'Akemi'],
    ]))
    expect(preview).toEqual({
      columns: 4,
      more: false,
      rows: [
        ['Item', 'Brand', 'Size', 'Price (RM)'],
        ['Akemi Cool Touch mattress', 'Akemi', 'Queen', '2,890'],
        ['Akemi bamboo pillow', 'Akemi', '', ''],
      ],
    })
  })

  it('reads a CSV the same way', () => {
    expect(sheetPreview(workbook([['Name', 'Amount'], ['Kar Jun', 480]], 'csv')).rows).toEqual([['Name', 'Amount'], ['Kar Jun', '480']])
  })

  it('cuts a big sheet and says so', () => {
    const big = Array.from({ length: SHEET_ROWS + 30 }, (_, i) => Array.from({ length: SHEET_COLS + 4 }, (_, j) => `${i}:${j}`))
    const preview = sheetPreview(workbook(big))
    expect(preview.rows).toHaveLength(SHEET_ROWS)
    expect(preview.columns).toBe(SHEET_COLS)
    expect(preview.more).toBe(true)
  })

  it('an empty sheet is nothing to draw', () => {
    expect(sheetPreview(workbook([]))).toEqual({ rows: [], columns: 0, more: false })
  })

  it('letters its columns as Excel does', () => {
    expect([0, 3, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'D', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  })

  it('sets figures right — money, counts, percentages — and words left', () => {
    expect(['2,890', 'RM 1,450.00', '(120)', '-3.5', '45%', '12'].every(looksNumeric)).toBe(true)
    expect(['Queen', 'Price (RM)', '', '140 cm', 'Q4 2026'].some(looksNumeric)).toBe(false)
  })

  it('a column of figures is the handoff Price column, header and all', () => {
    expect(figureColumns([['Item', 'Brand', 'Price (RM)'], ['Akemi pillow', 'Akemi', '189'], ['Zanotti sofa', 'Zanotti', '6,800'], ['Gift', '', '']])).toEqual([false, false, true])
    expect(figureColumns([['Only a header']])).toEqual([false])
  })

  it('a file somebody uploaded is read only inside its own worker, never on the page', () => {
    const reader = /(?:from\s+|import\(\s*)['"](?:@\/lib\/documentation\/sheet|\.\/sheet)['"]/
    const readers = files(SRC)
      .filter(f => reader.test(fs.readFileSync(f, 'utf8')))
      .map(f => path.relative(SRC, f).replace(/\\/g, '/'))
    expect(readers).toEqual(['lib/documentation/sheet.worker.ts'])
  })
})
