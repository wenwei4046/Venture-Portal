import { describe, expect, it } from 'vitest'
import {
  addMonths, buildTally, commissionByMonth, countsInTally, defaultTallyMonth, houzsMonthOf, monthOf, tallyDay, tallyMonthLong,
  tallyMonthShort, tallyOtherSide, twoMonthOrderIds, type TallyBrand, type TallyOrder,
} from './tally'

// The Tally (2026-11-12): Houzs pays by the SO date, we pay the salesperson by
// the fair date — the same bill in two calendars, month by month.

const BRANDS: TallyBrand[] = [
  { code: 'AKEMI', name: 'Akemi', refPrefixes: ['HC'], hcBillPct: 0.14, ownScheme: false },
  { code: 'ZANOTTI', name: 'Zanotti', refPrefixes: ['ZNT'], hcBillPct: 0.13, ownScheme: false },
  { code: '2990S', name: '2990s', refPrefixes: [], hcBillPct: null, ownScheme: true },
]

let seq = 0
function bill(over: Partial<TallyOrder> = {}): TallyOrder {
  seq += 1
  return {
    orderId: `o${seq}`,
    orderNo: `HC-SO-${String(seq).padStart(4, '0')}`,
    refNo: `HC${1000 + seq}`,
    periodMonth: '2026-11-01',
    orderDate: '2026-11-08',
    salesperson: 'ANTHONY',
    customer: 'MR TAN',
    brandCode: 'AKEMI',
    commissionable: 1000,
    cancelled: false,
    excludedReason: null,
    depositMet: true,
    ...over,
  }
}

const OPTS = { feedFloor: '2026-08-01', from: '2026-09-01' }

describe('the months a bill sits in', () => {
  it('reads the SO date for Houzs and the portal month for us', () => {
    expect(monthOf('2026-12-01')).toBe('2026-12-01')
    expect(monthOf('2026-11-30')).toBe('2026-11-01')
    expect(houzsMonthOf({ orderDate: '2026-12-01', periodMonth: '2026-11-01' }, '2026-08-01')).toBe('2026-12-01')
  })

  it('puts an old bill topped up in the month its top-up landed, on both sides', () => {
    // ZNT4813: sold 10 Mar 2026, before the feed window; topped up in November.
    expect(houzsMonthOf({ orderDate: '2026-03-10', periodMonth: '2026-11-01' }, '2026-08-01')).toBe('2026-11-01')
    // With no window nothing is an old bill.
    expect(houzsMonthOf({ orderDate: '2026-03-10', periodMonth: '2026-11-01' }, null)).toBe('2026-03-01')
  })

  it('steps months across a year end', () => {
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2027-01-01', -1)).toBe('2026-12-01')
    expect(addMonths('2026-09-01', -3)).toBe('2026-06-01')
  })

  it('leaves out a bill the ERP cancelled or somebody took out', () => {
    expect(countsInTally({ cancelled: false, excludedReason: null })).toBe(true)
    expect(countsInTally({ cancelled: true, excludedReason: null })).toBe(false)
    expect(countsInTally({ cancelled: false, excludedReason: 'manual' })).toBe(false)
  })
})

describe('buildTally', () => {
  it('counts a bill once on each side — in the same month when its two dates agree', () => {
    const report = buildTally([bill(), bill()], BRANDS, OPTS)
    const nov = report.months.find(m => m.month === '2026-11-01')!
    expect(nov.so).toEqual({ bills: 2, sales: 2000, bill: 280 })
    expect(nov.fair).toEqual({ bills: 2, sales: 2000, bill: 280 })
    expect(nov.gap).toEqual({ bills: 0, sales: 0, bill: 0 })
    expect(nov.carried).toEqual({ bills: 0, sales: 0, bill: 0 })
    expect(report.twoMonthBills).toBe(0)
  })

  it('the user’s case: sold at a fair on 8 Nov, keyed on 1 Dec — ours in November, Houzs’s in December', () => {
    const late = bill({ periodMonth: '2026-11-01', orderDate: '2026-12-01', commissionable: 5000 })
    const report = buildTally(
      [bill(), late, bill({ periodMonth: '2026-12-01', orderDate: '2026-12-05' })],
      BRANDS,
      { ...OPTS, fairDates: new Map([[late.orderId, '2026-11-08']]) },
    )
    const [dec, nov] = report.months
    expect([dec.month, nov.month]).toEqual(['2026-12-01', '2026-11-01'])

    // November: we pay on 6,000 of sales, Houzs on 1,000.
    expect(nov.fair).toEqual({ bills: 2, sales: 6000, bill: 840 })
    expect(nov.so).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(nov.gap).toEqual({ bills: 1, sales: 5000, bill: 700 })
    expect(nov.ours.map(b => b.orderId)).toEqual([late.orderId])
    expect(nov.theirs).toEqual([])
    // Still to come from Houzs when November ends.
    expect(nov.carried).toEqual({ bills: 1, sales: 5000, bill: 700 })

    // December: Houzs pays for it; we already have.
    expect(dec.so).toEqual({ bills: 2, sales: 6000, bill: 840 })
    expect(dec.fair).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(dec.gap).toEqual({ bills: -1, sales: -5000, bill: -700 })
    expect(dec.theirs.map(b => b.orderId)).toEqual([late.orderId])
    expect(dec.carried).toEqual({ bills: 0, sales: 0, bill: 0 })

    expect(report.twoMonthBills).toBe(1)
    expect(nov.ours[0]).toMatchObject({ ourMonth: '2026-11-01', houzsMonth: '2026-12-01', soDate: '2026-12-01', fairDate: '2026-11-08' })
  })

  it('every month’s gap is exactly its two-month bills', () => {
    const orders = [
      bill({ periodMonth: '2026-09-01', orderDate: '2026-09-10' }),
      bill({ periodMonth: '2026-09-01', orderDate: '2026-10-10', commissionable: 3888 }),
      bill({ periodMonth: '2026-10-01', orderDate: '2026-10-12' }),
      bill({ periodMonth: '2026-10-01', orderDate: '2026-11-02', commissionable: 9500, refNo: 'ZNT6389', brandCode: 'ZANOTTI' }),
      bill({ periodMonth: '2026-11-01', orderDate: '2026-10-30', commissionable: 700 }), // keyed before its fair day
    ]
    const report = buildTally(orders, BRANDS, OPTS)
    for (const m of report.months) {
      const mine = m.ours.reduce((t, b) => t + (b.bill ?? 0), 0)
      const theirs = m.theirs.reduce((t, b) => t + (b.bill ?? 0), 0)
      expect(m.gap.bill).toBeCloseTo(mine - theirs, 2)
      expect(m.gap.bills).toBe(m.ours.length - m.theirs.length)
    }
    // What is carried after a month is the running total of the gaps up to it.
    const oldestFirst = [...report.months].reverse()
    let running = 0
    for (const m of oldestFirst) {
      running += m.gap.bill
      expect(m.carried.bill).toBeCloseTo(running, 2)
    }
    // And it ends at nothing: every bill has been counted on both sides.
    expect(report.months[0].carried.bill).toBe(0)
  })

  it('a bill keyed before its fair day is Houzs’s first — carried the other way', () => {
    const early = bill({ periodMonth: '2026-11-01', orderDate: '2026-10-30', commissionable: 700 })
    const report = buildTally([early], BRANDS, OPTS)
    const oct = report.months.find(m => m.month === '2026-10-01')!
    const nov = report.months.find(m => m.month === '2026-11-01')!
    expect(oct.so.bill).toBe(98)
    expect(oct.fair.bill).toBe(0)
    expect(oct.carried).toEqual({ bills: 1, sales: -700, bill: -98 })
    expect(nov.carried.bill).toBe(0)
    expect(tallyOtherSide(nov.ours[0], 'ours', report.from)).toEqual({ text: 'Houzs paid Oct 2026', tone: 'info' })
    expect(tallyOtherSide(oct.theirs[0], 'theirs', report.from)).toEqual({ text: 'We pay Nov 2026', tone: 'info' })
  })

  it('starts at the first month the portal pays; a bill settled by hand before it is Houzs’s side only', () => {
    // Sold at a July fair (settled on the claim form), keyed in September.
    const july = bill({ periodMonth: '2026-07-01', orderDate: '2026-09-03', commissionable: 2000 })
    // Both months before September: not tallied at all.
    const august = bill({ periodMonth: '2026-07-01', orderDate: '2026-08-20' })
    const report = buildTally([july, august, bill({ periodMonth: '2026-09-01', orderDate: '2026-09-12' })], BRANDS, OPTS)
    expect(report.from).toBe('2026-09-01')
    expect(report.months.map(m => m.month)).toEqual(['2026-09-01'])
    const sep = report.months[0]
    expect(sep.so).toEqual({ bills: 2, sales: 3000, bill: 420 })
    expect(sep.fair).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(sep.theirs.map(b => b.orderId)).toEqual([july.orderId])
    // Counted by us before the tally began and by Houzs inside it: nothing is carried.
    expect(sep.carried).toEqual({ bills: 0, sales: 0, bill: 0 })
    expect(tallyOtherSide(sep.theirs[0], 'theirs', report.from)).toEqual({
      text: 'By hand · Jul 2026', tone: 'plain', title: 'Settled by hand — July 2026 was paid before the portal paid',
    })
  })

  it('with no first paid month it starts at the first month a bill sits in', () => {
    const report = buildTally([bill({ periodMonth: '2026-07-01', orderDate: '2026-08-02' })], BRANDS, { feedFloor: null, from: null })
    expect(report.from).toBe('2026-07-01')
    expect(report.months.map(m => m.month)).toEqual(['2026-08-01', '2026-07-01'])
  })

  it('lists the months in between, though no bill sits in them', () => {
    const report = buildTally([bill({ periodMonth: '2026-09-01', orderDate: '2026-11-04', commissionable: 1000 })], BRANDS, OPTS)
    expect(report.months.map(m => m.month)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    const oct = report.months[1]
    expect(oct.so.bills + oct.fair.bills).toBe(0)
    expect(oct.carried).toEqual({ bills: 1, sales: 1000, bill: 140 })
  })

  it('an old bill topped up sits in one month on both sides', () => {
    const old = bill({ periodMonth: '2026-11-01', orderDate: '2026-03-10', refNo: 'ZNT4813', brandCode: 'ZANOTTI', commissionable: 6000 })
    const report = buildTally([old], BRANDS, OPTS)
    expect(report.months.map(m => m.month)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    const nov = report.months[0]
    expect(nov.so).toEqual({ bills: 1, sales: 6000, bill: 780 })
    expect(nov.fair).toEqual({ bills: 1, sales: 6000, bill: 780 })
    expect(report.twoMonthBills).toBe(0)
    expect(twoMonthOrderIds([old], '2026-08-01')).toEqual([])
  })

  it('leaves out cancelled and excluded bills', () => {
    const report = buildTally([
      bill({ cancelled: true, orderDate: '2026-12-01' }),
      bill({ excludedReason: 'ignored_agent', orderDate: '2026-12-01' }),
      bill(),
    ], BRANDS, OPTS)
    expect(report.months.map(m => m.month)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    expect(report.months[0].fair.bills).toBe(1)
    expect(report.twoMonthBills).toBe(0)
  })

  it('reads the brand off the Ref No. prefix, else the bill’s own — as the month’s export does', () => {
    const report = buildTally([
      bill({ refNo: 'ZNT6389', brandCode: 'AKEMI', commissionable: 1000, orderDate: '2026-12-01' }),
      bill({ refNo: 'HC-SO-2611-022', brandCode: 'zanotti', commissionable: 1000, orderDate: '2026-12-02' }),
      bill({ refNo: null, brandCode: null, commissionable: 1000, orderDate: '2026-12-03' }),
    ], BRANDS, OPTS)
    const [a, b, c] = report.months.find(m => m.month === '2026-11-01')!.ours
    expect(a).toMatchObject({ brandCode: 'ZANOTTI', brandName: 'Zanotti', pct: 0.13, bill: 130 })
    expect(b).toMatchObject({ brandCode: 'ZANOTTI', brandName: 'Zanotti', pct: 0.13, bill: 130 })
    expect(c).toMatchObject({ brandCode: '', brandName: 'No brand', pct: null, bill: null })
    expect(report.noPctBills).toBe(1)
  })

  it('a bill of a brand on its own scheme is that brand’s whatever its paper says; no % set, no Bill to HC', () => {
    const report = buildTally([bill({ refNo: 'HC12345', brandCode: '2990S', commissionable: 2990 })], BRANDS, OPTS)
    const nov = report.months[0]
    expect(nov.fair).toEqual({ bills: 1, sales: 2990, bill: 0 })
    expect(report.noPctBills).toBe(1)
  })

  it('says a bill still under its deposit', () => {
    const report = buildTally([bill({ depositMet: false, orderDate: '2026-12-01' })], BRANDS, OPTS)
    expect(report.months.find(m => m.month === '2026-11-01')!.ours[0].belowDeposit).toBe(true)
  })

  it('has nothing to say with no bills', () => {
    expect(buildTally([], BRANDS, OPTS)).toEqual({ from: null, months: [], twoMonthBills: 0, noPctBills: 0 })
    // Every bill before the first month the portal pays.
    expect(buildTally([bill({ periodMonth: '2026-07-01', orderDate: '2026-08-02' })], BRANDS, OPTS).months).toEqual([])
  })

  it('names the bills whose fair day is worth reading', () => {
    const late = bill({ periodMonth: '2026-11-01', orderDate: '2026-12-01' })
    expect(twoMonthOrderIds([bill(), late, bill({ cancelled: true, orderDate: '2026-12-01' })], '2026-08-01')).toEqual([late.orderId])
  })
})

describe('what a month pays its salespeople', () => {
  it('sums each month’s closes to the sen and counts them', () => {
    expect(commissionByMonth([
      { month: '2026-10-01', total: 1234.56 },
      { month: '2026-10-01', total: 0.1 },
      { month: '2026-10-01', total: 0.2 },
      { month: '2026-09-01', total: 500 },
    ])).toEqual({
      '2026-10-01': { total: 1234.86, closed: 3 },
      '2026-09-01': { total: 500, closed: 1 },
    })
    expect(commissionByMonth([])).toEqual({})
  })
})

describe('the words', () => {
  it('writes a month in three letters, and long for a heading', () => {
    expect(tallyMonthShort('2026-09-01')).toBe('Sep 2026')
    expect(tallyMonthLong('2026-09-01')).toBe('September 2026')
    expect(tallyDay('2026-11-08')).toBe('8 Nov 2026')
  })

  it('says what the other side does with a bill', () => {
    const report = buildTally([bill({ periodMonth: '2026-11-01', orderDate: '2026-12-01' })], BRANDS, OPTS)
    const nov = report.months.find(m => m.month === '2026-11-01')!
    const dec = report.months.find(m => m.month === '2026-12-01')!
    expect(tallyOtherSide(nov.ours[0], 'ours', report.from)).toEqual({ text: 'Houzs pays Dec 2026', tone: 'alert' })
    expect(tallyOtherSide(dec.theirs[0], 'theirs', report.from)).toEqual({ text: 'We paid Nov 2026', tone: 'ledger' })
  })

  it('opens on the latest month with a bill in two months, else the latest', () => {
    const report = buildTally([
      bill({ periodMonth: '2026-09-01', orderDate: '2026-10-10' }),
      bill({ periodMonth: '2026-11-01', orderDate: '2026-11-08' }),
    ], BRANDS, OPTS)
    expect(defaultTallyMonth(report)).toBe('2026-10-01')
    expect(defaultTallyMonth(buildTally([bill()], BRANDS, OPTS))).toBe('2026-11-01')
    expect(defaultTallyMonth(buildTally([], BRANDS, OPTS))).toBeNull()
  })
})
