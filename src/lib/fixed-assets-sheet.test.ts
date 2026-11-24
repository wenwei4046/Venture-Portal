import { describe, expect, it } from 'vitest'
import { fixedAssetsSheet } from './fixed-assets-sheet'
import type { FaClass, FaData } from './fixed-assets'

// 2026-11-24 — the PPE listing, as the user's Carres sample: by class, a subtotal each, the total.
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

describe('the PPE listing sheet', () => {
  it('puts each class under its title with its subtotal, and the total at the foot', () => {
    const s = fixedAssetsSheet(data, '2026-07', '2027-06', '30.06.2027')
    expect(s.header[12]).toBe('NBV 30.06.2027')
    expect(s.sectionBreaks).toEqual([{ afterRow: 0, title: 'COMPUTER & EQUIPMENT' }, { afterRow: 3, title: 'RENOVATION' }])
    expect(s.rows[0]).toEqual(['PV-000003', 'Desktop', '2026-03-06', 33.33, 3600, null, null, 3600, 400, 1200, null, 1600, 2000])
    expect(s.rows[1].slice(0, 2)).toEqual([null, 'Total Computer & equipment'])
    expect(s.rows[3]).toEqual(['PV-000050', 'Floor', '2026-08-01', 10, null, 12000, null, 12000, null, 1100, null, 1100, 10900])
    expect(s.rows[s.rows.length - 1]).toEqual([null, 'TOTAL', null, null, 3600, 12000, null, 15600, 400, 2300, null, 2700, 12900])
  })
})
