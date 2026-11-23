import { describe, expect, it } from 'vitest'
import { fixedAssetsSheet } from './fixed-assets-sheet'
import type { FaData } from './fixed-assets'

// 2026-11-24 — the year's schedule, for the auditor.
describe('the fixed asset sheet', () => {
  const data: FaData = {
    classes: [{ id: 'c1', name: 'Computer & equipment', lifeMonths: 36, residualPct: 0, startRule: 'purchase_month', assetAccount: '2000', accumAccount: '2090', expenseAccount: '9100', isActive: true }],
    lines: [],
    postings: [],
    assets: [{ id: 'a1', name: 'Desktop', classId: 'c1', inServiceDate: '2026-03-06', lifeMonths: null, disposedOn: null, notes: null, draft: false, lineIds: ['l1'], cost: 3600, voucher: 'PV-000003' }],
  }
  it('says the year asset by asset: brought forward, each month, the year, carried forward, the book value', () => {
    const s = fixedAssetsSheet(data, '2026-07', '2027-06')
    expect(s.header.slice(0, 7)).toEqual(['Asset', 'Voucher', 'Class', 'In service', 'Life (months)', 'Cost', 'Accumulated b/f'])
    expect(s.header).toHaveLength(7 + 12 + 3)
    const [row, total] = s.rows
    expect(row.slice(0, 7)).toEqual(['Desktop', 'PV-000003', 'Computer & equipment', '2026-03-06', 36, 3600, 400])
    expect(row.slice(-3)).toEqual([1200, 1600, 2000])
    expect(total[0]).toBe('TOTAL')
    expect(total.slice(-3)).toEqual([1200, 1600, 2000])
  })
})
