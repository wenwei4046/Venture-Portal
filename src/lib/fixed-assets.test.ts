import { describe, expect, it } from 'vitest'
import { assetsOf, figuresOf, listingOf, postRows, scheduleOf, voucherOf, wordsOf, type FaAsset, type FaClass, type FaData, type FaLine } from './fixed-assets'

// 2026-11-24 — the user: "能做一个折旧表在系统吗？" … "这个我要自己能维护". The lines are production's purchases on 2000.

const computer: FaClass = {
  id: 'c1', name: 'Computer & equipment', ratePct: 100 / 3, residualPct: 0, startRule: 'purchase_month',
  assetAccount: '2000', accumAccount: '2090', expenseAccount: '9100', isActive: true,
}
const line = (id: string, date: string, entryDescription: string, description: string, amount: number, assetId: string | null = null): FaLine => ({
  id, date, entryNo: null, entryDescription, description, account: '2000', amount, assetId,
})
const LINES: FaLine[] = [
  line('l1', '2026-03-06', 'PV-000003 [director] — PURCHASE 1 UNIT OF DESKTOP', 'PURCHASE 1 UNIT OF DESKTOP', 3000),
  line('l2', '2026-03-06', 'PV-000003 [marketing] — PURCHASE 1 UNIT OF DESKTOP', 'PURCHASE 1 UNIT OF DESKTOP', 2600),
  line('l3', '2026-03-16', 'PV-000014 — PURCHASE 1 UNIT USED TAMRON 17-28MM F2.8 DI III RXD SONY', 'PURCHASE 1 UNIT USED TAMRON 17-28MM F2.8 DI III RXD SONY', 2250),
  line('l4', '2026-03-16', 'PV-000014 — PURCHASE 1 UNIT USED TAMRON 17-28MM F2.8 DI III RXD SONY', 'PURCHASE 1 UNIT XIAOMI 2K MONITOR', 502.89),
  line('l5', '2026-06-25', 'PV HV-PV-202606-0069: Purchase of Computer - RM 4,600\r\nClaude Ai Claim - RM 427.57 [dept_pool_marketing]', 'expense - KHO WEI JIE (dept_pool_marketing)', 1600),
  line('l6', '2026-06-25', 'PV HV-PV-202606-0069: Purchase of Computer - RM 4,600\r\nClaude Ai Claim - RM 427.57 [venture_pool]', 'expense - KHO WEI JIE (venture_pool)', 3000),
]

describe('the register', () => {
  it('makes one asset of a voucher’s lines for one thing, and keeps two things on one voucher apart', () => {
    const assets = assetsOf([], LINES, [computer])
    expect(assets.map((a) => [a.voucher, a.name, a.cost])).toEqual([
      ['PV-000003', 'PURCHASE 1 UNIT OF DESKTOP', 5600],
      ['PV-000014', 'PURCHASE 1 UNIT USED TAMRON 17-28MM F2.8 DI III RXD SONY', 2250],
      ['PV-000014', 'PURCHASE 1 UNIT XIAOMI 2K MONITOR', 502.89],
      ['HV-PV-202606-0069', 'Purchase of Computer - RM 4,600', 4600],
    ])
    expect(assets.every((a) => a.draft && a.classId === 'c1')).toBe(true)
  })
  it('reads the voucher and the words', () => {
    expect(voucherOf({ entryNo: null, entryDescription: 'PV HV-PV-202608-0225: Computer - RM 3,200 [venture_pool]' })).toBe('HV-PV-202608-0225')
    expect(wordsOf({ description: 'expense - KHO WEI JIE (venture_pool)', entryDescription: 'PV HV-PV-202608-0225: Computer - RM 3,200 (RM 3,000 company, RM200 Marketing)\r\nHiggsfiled AI [venture_pool]' }))
      .toBe('Computer - RM 3,200 (RM 3,000 company, RM200 Marketing)')
  })
  it('keeps a kept asset’s own lines and name', () => {
    const kept = assetsOf([{ id: 'a1', name: 'Director desktop', classId: 'c1', inServiceDate: '2026-03-06', ratePct: null, disposedOn: null, notes: null }],
      LINES.map((l) => (l.id === 'l1' || l.id === 'l2' ? { ...l, assetId: 'a1' } : l)), [computer])
    expect(kept[0]).toMatchObject({ id: 'a1', name: 'Director desktop', draft: false, cost: 5600, lineIds: ['l1', 'l2'] })
    expect(kept).toHaveLength(4)
  })
})

const asset = (over: Partial<FaAsset> = {}): FaAsset => ({
  id: 'a1', name: 'Desktop', classId: 'c1', inServiceDate: '2026-03-06', ratePct: null, disposedOn: null, notes: null,
  draft: false, lineIds: ['l1'], cost: 3600, voucher: 'PV-000003', ...over,
})

describe('the schedule', () => {
  it('charges the rate a month from the purchase month, the last month taking the rest', () => {
    const m = scheduleOf(asset({ cost: 1000 }), computer, new Map(), '2030-01')
    expect(m).toHaveLength(36)
    expect(m[0]).toMatchObject({ month: '2026-03', amount: 27.78, accumulated: 27.78 })
    expect(m[35].month).toBe('2029-02')
    expect(m[35].accumulated).toBe(1000)
    expect(m[35].nbv).toBe(0)
  })
  it('runs ten years at 10%, as the Carres listing', () => {
    const m = scheduleOf(asset({ cost: 2000 }), { ...computer, ratePct: 10 }, new Map(), '2040-01')
    expect(m[0].amount).toBe(16.67)
    expect(m).toHaveLength(120)
    expect(m[119].accumulated).toBe(2000)
  })
  it('starts the month after when the class says so, and keeps the residual', () => {
    const m = scheduleOf(asset(), { ...computer, startRule: 'next_month', residualPct: 10 }, new Map(), '2026-06')
    expect(m.map((r) => r.month)).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(m[0].amount).toBe(90) // 3,600 × 90% × 33⅓% ÷ 12
  })
  it('stops with the month it was disposed of', () => {
    expect(scheduleOf(asset({ disposedOn: '2026-05-20' }), computer, new Map(), '2026-12').map((r) => r.month)).toEqual(['2026-03', '2026-04', '2026-05'])
  })
  it('keeps a posted month and charges the asset’s own rate from then on', () => {
    const posted = new Map([['2026-03', 100], ['2026-04', 100]])
    const m = scheduleOf(asset({ ratePct: 50 }), computer, posted, '2028-12')
    expect(m[0]).toMatchObject({ amount: 100, posted: true })
    expect(m[2].amount).toBe(150) // 3,600 × 50% ÷ 12
    expect(m[m.length - 1].accumulated).toBe(3600)
    expect(m[m.length - 1].amount).toBe(100) // what was left
  })
})

describe('the PPE listing', () => {
  const data: FaData = {
    classes: [computer, { ...computer, id: 'c2', name: 'Renovation', ratePct: 10, assetAccount: '2001' }],
    lines: [],
    postings: [],
    assets: [
      asset(),
      asset({ id: 'a2', name: 'Monitor', inServiceDate: '2026-08-04', cost: 1200 }),
      asset({ id: 'a3', name: 'Old screen', inServiceDate: '2026-03-06', cost: 600, disposedOn: '2026-09-10' }),
      asset({ id: 'a4', name: 'Floor', classId: 'c2', inServiceDate: '2025-06-01', cost: 12000 }),
    ],
  }
  it('says each class’s cost and depreciation brought forward, added, disposed of, carried forward, and the book value', () => {
    const [comp, reno] = listingOf(data, '2026-07', '2026-11')
    expect(comp.cls.name).toBe('Computer & equipment')
    expect(comp.rows.map((r) => [r.asset.name, r.costBf, r.addition, r.disposal, r.accBf, r.charge, r.accDisposal, r.accCf, r.nbv])).toEqual([
      ['Desktop', 3600, 0, 0, 400, 500, 0, 900, 2700],
      ['Monitor', 0, 1200, 0, 0, 133.32, 0, 133.32, 1066.68],
      ['Old screen', 600, 0, -600, 66.68, 50.01, -116.69, 0, 0],
    ])
    expect(comp.total).toMatchObject({ costBf: 4200, addition: 1200, disposal: -600, costCf: 4800, nbv: 3766.68 })
    expect(reno.rows[0]).toMatchObject({ rate: 10, costBf: 12000, accBf: 1300, charge: 500, nbv: 10200 })
  })
  it('leaves out what was disposed of before the year, and what came after its end', () => {
    expect(listingOf(data, '2026-10', '2026-11')[0].rows.map((r) => r.asset.name)).toEqual(['Desktop', 'Monitor'])
    expect(listingOf(data, '2025-01', '2026-06')[0].rows.map((r) => r.asset.name)).toEqual(['Desktop', 'Old screen'])
  })
})

describe('posting', () => {
  const data: FaData = {
    classes: [computer],
    lines: [],
    assets: [asset(), asset({ id: 'a2', name: 'Lens', inServiceDate: '2026-06-25', cost: 720, voucher: 'HV-PV-202606-0069' }), asset({ id: 'new:l9', draft: true })],
    postings: [{ assetId: 'a1', month: '2026-03', amount: 100 }],
  }
  it('writes one entry a month for what is not posted, asset by asset, drafts left out', () => {
    const rows = postRows(data, '2026-06')
    expect(rows.map((r) => r.month)).toEqual(['2026-04', '2026-05', '2026-06'])
    const june = rows[2]
    expect(june.date).toBe('2026-06-30')
    expect(june.postings).toEqual([{ asset_id: 'a1', amount: 100 }, { asset_id: 'a2', amount: 20 }])
    expect(june.lines).toHaveLength(4)
    expect(june.lines[0]).toMatchObject({ account_code: '9100', debit: 100, credit: 0 })
    expect(june.lines[1]).toMatchObject({ account_code: '2090', debit: 0, credit: 100 })
    expect(june.lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0)
  })
  it('sums the figures as at a month', () => {
    const [desk] = figuresOf(data, '2026-06')
    expect(desk).toMatchObject({ monthly: 100, accumulated: 400, nbv: 3200 })
  })
})
