import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { ppeWorkbook } from './fixed-assets-sheet'
import { buildStyledXlsx } from './export/styled-xlsx'
import type { FaClass, FaData } from './fixed-assets'

// 2026-11-24 — the PPE listing's file, as the user's Carres sample and "好看一点".
const cls = (id: string, name: string, ratePct: number, assetAccount: string): FaClass => ({
  id, name, ratePct, residualPct: 0, startRule: 'purchase_month', assetAccount, accumAccount: '2090', expenseAccount: '9100', isActive: true,
})
const data: FaData = {
  classes: [cls('c1', 'Computer & equipment', 100 / 3, '2000'), cls('c2', 'Renovation', 10, '2001')],
  lines: [],
  postings: [],
  assets: [
    { id: 'a1', name: 'Desktop', classId: 'c1', inServiceDate: '2026-03-06', ratePct: null, disposedOn: null, notes: null, draft: false, lineIds: ['l1'], cost: 3600, voucher: 'PV-000003' },
    { id: 'a2', name: 'Floor', classId: 'c2', inServiceDate: '2026-08-01', ratePct: null, disposedOn: null, notes: null, draft: false, lineIds: ['l2'], cost: 12000, voucher: 'PV-000050' },
  ],
}
const words = { company: 'HOUZS Venture Holding Sdn Bhd', year: 'Financial year Jul 2026 – Jun 2027', asAt: '30.06.2027' }

describe('the PPE listing file', () => {
  it('heads with the company and the title, the groups over their columns, each class under its title with its total, the total last', async () => {
    const sheet = ppeWorkbook(data, '2026-07', '2027-06', words)
    expect(sheet.merges).toEqual(expect.arrayContaining(['E5:H5', 'I5:L5', 'M5:M6', 'A7:M7']))
    expect(sheet.freeze).toEqual({ rows: 6, cols: 2 })
    const ws = XLSX.read(await buildStyledXlsx(sheet)).Sheets[sheet.name]
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, raw: true, defval: null })
    expect(rows[0][0]).toBe('HOUZS VENTURE HOLDING SDN BHD')
    expect(rows[1][0]).toBe('PROPERTY, PLANT AND EQUIPMENT LISTING')
    expect(rows[4].filter(Boolean)).toEqual(['Voucher', 'Description', 'Purchase date', 'Rate', 'COST', 'ACCUM. DEPRECIATION', 'NBV 30.06.2027'])
    expect(rows[6][0]).toBe('COMPUTER & EQUIPMENT')
    expect(rows[7]).toEqual(['PV-000003', 'Desktop', 46087, 33.33, 3600, 0, 0, 3600, 400, 1200, 0, 1600, 2000])
    expect(rows[8][1]).toBe('Total Computer & equipment')
    const last = rows[rows.length - 1]
    expect(last[1]).toBe('TOTAL')
    expect(last.slice(4)).toEqual([3600, 12000, 0, 15600, 400, 2300, 0, 2700, 12900])
  })
})
