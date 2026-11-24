import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { buildStyledXlsx, colName, excelDay } from './styled-xlsx'

// 2026-11-24 — a formatted .xlsx written by hand (the PPE listing's file: "可以好看一点吗？").
describe('a styled workbook', () => {
  it('names columns and days as Excel does', () => {
    expect([colName(0), colName(25), colName(26), colName(27)]).toEqual(['A', 'Z', 'AA', 'AB'])
    expect(excelDay('2026-06-30')).toBe(46203)
  })

  it('opens with its values, merges, styles and frozen head', async () => {
    const buf = await buildStyledXlsx({
      name: 'PPE 30.06.2026',
      rows: [
        [{ v: 'TITLE & <CO>', style: { bold: true, size: 14 } }],
        [{ v: 'Cost', style: { bold: true, fill: 'DFE4EE', border: { bottom: 'thin' } } }, { v: 1234.5, style: { numFmt: '#,##0.00' } }, { v: '2026-03-06', date: true, style: { numFmt: 'dd/mm/yyyy' } }],
      ],
      merges: ['A1:C1'],
      widths: [20, 12, 12],
      freeze: { rows: 1, cols: 1 },
      landscape: true,
    })
    const wb = XLSX.read(buf)
    const ws = wb.Sheets['PPE 30.06.2026']
    expect(ws.A1.v).toBe('TITLE & <CO>')
    expect(ws.B2.v).toBe(1234.5)
    expect(ws.C2.v).toBe(46087)
    expect(ws['!merges']?.map((m) => XLSX.utils.encode_range(m))).toEqual(['A1:C1'])
    const zip = await JSZip.loadAsync(buf)
    const styles = await zip.file('xl/styles.xml')!.async('string')
    expect(styles).toContain('<b/>')
    expect(styles).toContain('rgb="FFDFE4EE"')
    expect(styles).toContain('formatCode="dd/mm/yyyy"')
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(sheet).toContain('state="frozen"')
    expect(sheet).toContain('showGridLines="0"')
    expect(sheet).toContain('orientation="landscape"')
  })
})
