import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildXlsxBuffer } from './excel'

describe('buildXlsxBuffer', () => {
  it('returns a non-empty .xlsx buffer (PK zip signature) for a basic sheet', () => {
    const buf = buildXlsxBuffer({
      sheetName: 'Sheet1',
      headerRow: ['Code', 'Name', 'Amount'],
      rows: [
        ['3000', 'Cash & Bank', 1000],
        ['3030', 'AR — Subs',   2000],
      ],
    })
    expect(buf.length).toBeGreaterThan(100)
    // .xlsx files are ZIPs — first 4 bytes are 'PK\x03\x04'.
    expect(buf[0]).toBe(0x50) // P
    expect(buf[1]).toBe(0x4b) // K
    expect(buf[2]).toBe(0x03)
    expect(buf[3]).toBe(0x04)
  })

  it('inserts section break rows between data rows', () => {
    const buf = buildXlsxBuffer({
      sheetName: 'TB',
      headerRow: ['Account', 'Debit', 'Credit'],
      rows: [
        ['3000', 1000, null],
        ['3030', 2000, null],
        ['4000', null, 1500],
      ],
      sectionBreaks: [
        { afterRow: 1, title: 'ASSETS' },
        { afterRow: 3, title: 'LIABILITIES' },
      ],
    })
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets['TB']
    const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    const flat = grid.flat().map(String)
    expect(flat).toContain('ASSETS')
    expect(flat).toContain('LIABILITIES')
  })
})
