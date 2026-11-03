import { describe, expect, it } from 'vitest'
import {
  carriedFromUnpaidMonths,
  claimsInMonth,
  groupDoubleClaims,
  groupPapers,
  openClaimsByMonth,
  type DoubleClaimBill,
} from './double-claims'

const bill = (billRef: string, orderNo: string, periodMonth: string, extra: Partial<DoubleClaimBill> = {}): DoubleClaimBill => ({
  billRef, orderId: `${orderNo}-id`, orderNo, periodMonth, orderDate: periodMonth.replace(/01$/, '15'),
  staffId: 'ch', employeeName: 'CHEA HUAN', agentName: 'Chea Huan', orderTotal: 8290,
  source: 'erp_sync', paidByRun: false, dismissed: false, ...extra,
})

describe('possible double claims', () => {
  // August worked out by hand carries HC11366; the ERP re-keys it in September.
  const rows = [
    bill('HC11366', 'HC-SO-2610-001', '2026-09-01'),
    bill('HC11366', 'HC11366', '2026-08-01', { source: 'file' }),
    bill('ZNT6185', 'HC-SO-013385', '2026-08-01', { orderTotal: 8000, dismissed: true }),
    bill('ZNT6185', 'HC-SO-013384', '2026-08-01', { orderTotal: 8000, dismissed: true }),
    bill('HC12843', 'HC12843', '2026-08-01'),
  ]

  it('groups bills by paper number, oldest month first, and drops a paper on one bill', () => {
    const groups = groupDoubleClaims(rows)
    expect(groups.map(g => [g.billRef, g.months, g.bills.map(b => b.orderNo), g.dismissed])).toEqual([
      ['HC11366', ['2026-08-01', '2026-09-01'], ['HC11366', 'HC-SO-2610-001'], false],
      ['ZNT6185', ['2026-08-01'], ['HC-SO-013384', 'HC-SO-013385'], true],
    ])
  })

  it("a month's page asks about every group with a bill in it; the month list counts unanswered ones", () => {
    const groups = groupDoubleClaims(rows)
    expect(claimsInMonth(groups, '2026-09-01').map(g => g.billRef)).toEqual(['HC11366'])
    expect(claimsInMonth(groups, '2026-08-01').map(g => g.billRef)).toEqual(['HC11366', 'ZNT6185'])
    expect([...openClaimsByMonth(groups)]).toEqual([['2026-08-01', 1], ['2026-09-01', 1]])
  })

  it('a group is only answered when every bill in it was', () => {
    const groups = groupDoubleClaims([
      bill('HC11366', 'A', '2026-08-01', { dismissed: true }),
      bill('HC11366', 'B', '2026-09-01', { dismissed: false }),
    ])
    expect(groups[0].dismissed).toBe(false)
  })
})

describe('every paper a Ref No. names (2026-10-31)', () => {
  // The database answers one row per paper and bill: three documents naming the same three papers in three orders.
  const three = ['HC12932', 'HC12931', 'HC12933'].flatMap(ref => [
    bill(ref, 'HC-SO-013268', '2026-09-01'),
    bill(ref, 'HC-SO-013271', '2026-09-01'),
    bill(ref, 'HC-SO-013319', '2026-09-01'),
  ])

  it('papers on exactly the same bills are one question, under all of them', () => {
    const groups = groupDoubleClaims(three)
    expect(groups.map(g => [g.billRef, g.billRefs, g.bills.map(b => b.orderNo)])).toEqual([
      ['HC12931', ['HC12931', 'HC12932', 'HC12933'], ['HC-SO-013268', 'HC-SO-013271', 'HC-SO-013319']],
    ])
    // Each bill carries the paper the group goes by, the one an answer is saved under.
    expect(groups[0].bills.map(b => b.billRef)).toEqual(['HC12931', 'HC12931', 'HC12931'])
    expect(groupPapers(groups[0])).toBe('HC12931 · HC12932 · HC12933')
  })

  it("a bill's second paper on another bill is a group of its own — the first paper's pair stays as it was", () => {
    // HC-SO-2610-300 is HC9882+ZNT4864: ZNT4864 is the August claim form's; HC9882 is also on HC-SO-2610-301.
    const groups = groupDoubleClaims([
      bill('HC9882', 'HC-SO-2610-300', '2026-10-01'),
      bill('HC9882', 'HC-SO-2610-301', '2026-10-01'),
      bill('ZNT4864', 'HC-SO-2610-300', '2026-10-01'),
      bill('ZNT4864', 'ZNT4864', '2026-08-01', { source: 'file' }),
    ])
    expect(groups.map(g => [g.billRefs, g.bills.map(b => b.orderNo)])).toEqual([
      [['ZNT4864'], ['ZNT4864', 'HC-SO-2610-300']],
      [['HC9882'], ['HC-SO-2610-300', 'HC-SO-2610-301']],
    ])
  })

  it('a paper on one bill alone is nothing to ask, even when that bill shares another paper', () => {
    const groups = groupDoubleClaims([
      bill('HC13375', 'HC-SO-2609-268', '2026-09-01'),
      bill('HC13375', 'HC-SO-2609-389', '2026-09-01'),
      bill('ZNT6737', 'HC-SO-2609-268', '2026-09-01'),
    ])
    expect(groups.map(g => g.billRefs)).toEqual([['HC13375']])
  })

  it('answered together: the merged group is answered when its bills were', () => {
    const answered = three.map(b => ({ ...b, dismissed: true }))
    expect(groupDoubleClaims(answered)[0].dismissed).toBe(true)
  })
})

describe('bills carried from a month no run paid', () => {
  it("counts CH's June and July bills in August — once each, shared parts added back, upsales left out", () => {
    const carried = carriedFromUnpaidMonths([
      { id: 'jun', periodMonth: '2026-06-01', orderTotal: 3888 },
      { id: 'jul-1', periodMonth: '2026-07-01', orderTotal: 9500 },
      { id: 'jul-2', periodMonth: '2026-07-01', orderTotal: 7000 },
      // One bill shared 50/50: two parts, one bill.
      { id: 'jul-3', periodMonth: '2026-07-01', orderTotal: 1250 },
      { id: 'jul-3', periodMonth: '2026-07-01', orderTotal: 1250 },
      { id: 'aug', periodMonth: '2026-08-01', orderTotal: 6150 },
      { id: 'up', periodMonth: '2026-07-01', orderTotal: 700, upsale: true },
    ], '2026-08-01', new Set())
    expect(carried).toEqual([
      { periodMonth: '2026-06-01', bills: 1, value: 3888 },
      { periodMonth: '2026-07-01', bills: 3, value: 19000 },
    ])
  })

  it('a month an applied run paid is not reported — only its unreleased bills ride along, and rightly', () => {
    expect(carriedFromUnpaidMonths([
      { id: 'jul', periodMonth: '2026-07-01', orderTotal: 9500 },
    ], '2026-08-01', new Set(['2026-07-01']))).toEqual([])
  })
})
