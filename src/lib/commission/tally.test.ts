import { describe, expect, it } from 'vitest'
import {
  addMonths, buildTally, commissionByMonth, countsInTally, defaultTallyMonth, houzsSide, houzsWord, monthOf, ourSide, ourWord,
  tallyBills, tallyChips, tallyDay, tallyMonthExport, tallyMonthLong, tallyMonthShort, tallyOf, type TallyBrand, type TallyOrder,
} from './tally'

// The Tally (2026-11-12): Houzs pays a bill once its deposit is reached — by its
// SO date, or the day the deposit came when that is later; we pay it in the
// month whose close released it. The same bill on two sides, month by month.

const BRANDS: TallyBrand[] = [
  { code: 'AKEMI', name: 'Akemi', refPrefixes: ['HC'], hcBillPct: 0.14, ownScheme: false },
  { code: 'ZANOTTI', name: 'Zanotti', refPrefixes: ['ZNT'], hcBillPct: 0.13, ownScheme: false },
  { code: '2990S', name: '2990s', refPrefixes: [], hcBillPct: null, ownScheme: true },
]

let seq = 0
/** A bill paid in full the day it was keyed, at a fair, nobody closed yet — unless said otherwise. */
function bill(over: Partial<TallyOrder> = {}): TallyOrder {
  seq += 1
  const orderDate = over.orderDate ?? '2026-11-08'
  return {
    orderId: `o${seq}`,
    orderNo: `HC-SO-${String(seq).padStart(4, '0')}`,
    refNo: `HC${1000 + seq}`,
    periodMonth: '2026-11-01',
    orderDate,
    staffId: 'anthony',
    salesperson: 'ANTHONY',
    customer: 'MR TAN',
    brandCode: 'AKEMI',
    goods: 1000,
    cancelled: false,
    excludedReason: null,
    depositMet: true,
    reachedOn: orderDate,
    hasFair: true,
    fairDate: null,
    releasedMonth: null,
    ...over,
  }
}

const OPTS = { feedFloor: '2026-08-01', from: '2026-09-01' }
const NOBODY_CLOSED: ReadonlySet<string> = new Set()
const monthRow = (report: ReturnType<typeof buildTally>, month: string) => report.months.find(m => m.month === month)!

describe('the month Houzs pays a bill in', () => {
  it('is its SO date’s month once the deposit is reached by then', () => {
    expect(monthOf('2026-12-01')).toBe('2026-12-01')
    expect(monthOf('2026-11-30')).toBe('2026-11-01')
    expect(houzsSide({ orderDate: '2026-11-08', reachedOn: '2026-11-08', hasFair: true })).toEqual({ month: '2026-11-01', state: 'pays' })
    // Paid at the fair on 30 Oct, keyed on 1 Nov: Houzs counts it by the day it was keyed.
    expect(houzsSide({ orderDate: '2026-11-01', reachedOn: '2026-10-30', hasFair: true })).toEqual({ month: '2026-11-01', state: 'pays' })
  })

  it('is the month the deposit was reached when that is later', () => {
    // RM 500 of RM 5,000 at the fair, topped up on 3 Nov.
    expect(houzsSide({ orderDate: '2026-10-06', reachedOn: '2026-11-03', hasFair: true })).toEqual({ month: '2026-11-01', state: 'pays' })
    // An old bill topped up — ZNT4813: sold 10 Mar 2026, at its deposit on 2 Nov.
    expect(houzsSide({ orderDate: '2026-03-10', reachedOn: '2026-11-02', hasFair: true })).toEqual({ month: '2026-11-01', state: 'pays' })
  })

  it('is no month while the bill is under its deposit — the user: "for those below depo, houzs will not pay to venture as well"', () => {
    expect(houzsSide({ orderDate: '2026-10-07', reachedOn: null, hasFair: true })).toEqual({ month: null, state: 'below_deposit' })
  })

  it('is no month for an order the ERP names no fair on: it is in neither of the ERP’s reports', () => {
    expect(houzsSide({ orderDate: '2026-10-14', reachedOn: '2026-10-14', hasFair: false })).toEqual({ month: null, state: 'no_fair' })
    expect(houzsSide({ orderDate: '2026-10-14', reachedOn: null, hasFair: false })).toEqual({ month: null, state: 'no_fair' })
  })
})

describe('the month we pay a bill in', () => {
  const order = (over: Partial<TallyOrder> = {}) => ({ periodMonth: '2026-10-01', staffId: 'anthony', depositMet: true, releasedMonth: null, ...over })

  it('is the month whose close released it — the real payout', () => {
    expect(ourSide(order({ releasedMonth: '2026-10-01' }), '2026-09-01', NOBODY_CLOSED)).toEqual({ month: '2026-10-01', state: 'paid' })
    // It came in after October's close; November's paid it.
    expect(ourSide(order({ releasedMonth: '2026-11-01' }), '2026-09-01', NOBODY_CLOSED)).toEqual({ month: '2026-11-01', state: 'paid' })
  })

  it('is its own month, by hand, before the portal paid', () => {
    expect(ourSide(order({ periodMonth: '2026-08-01' }), '2026-09-01', NOBODY_CLOSED)).toEqual({ month: '2026-08-01', state: 'by_hand' })
    // Under its deposit or not: the claim form settled that month.
    expect(ourSide(order({ periodMonth: '2026-08-01', depositMet: false }), '2026-09-01', NOBODY_CLOSED)).toEqual({ month: '2026-08-01', state: 'by_hand' })
    // With no first paid month nothing is by hand.
    expect(ourSide(order({ periodMonth: '2026-08-01' }), null, NOBODY_CLOSED)).toEqual({ month: '2026-08-01', state: 'open' })
  })

  it('is no month while it is under its deposit', () => {
    expect(ourSide(order({ depositMet: false }), '2026-09-01', NOBODY_CLOSED)).toEqual({ month: null, state: 'below_deposit' })
  })

  it('not paid yet: the first month from its own in which its salesperson is not closed', () => {
    expect(ourSide(order(), '2026-09-01', NOBODY_CLOSED)).toEqual({ month: '2026-10-01', state: 'open' })
    // Closed for October without it — a late key-in, a deposit topped up since: November pays it.
    expect(ourSide(order(), '2026-09-01', new Set(['anthony|2026-10-01']))).toEqual({ month: '2026-11-01', state: 'open' })
    expect(ourSide(order(), '2026-09-01', new Set(['anthony|2026-10-01', 'anthony|2026-11-01']))).toEqual({ month: '2026-12-01', state: 'open' })
    // Somebody else's close is nothing to this bill; nor is a bill nobody is matched to ever closed.
    expect(ourSide(order(), '2026-09-01', new Set(['sally|2026-10-01']))).toEqual({ month: '2026-10-01', state: 'open' })
    expect(ourSide(order({ staffId: null }), '2026-09-01', new Set(['anthony|2026-10-01']))).toEqual({ month: '2026-10-01', state: 'open' })
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
  it('counts a bill once on each side — in the same month when both pay it there', () => {
    const report = buildTally([bill({ releasedMonth: '2026-11-01' }), bill()], BRANDS, OPTS)
    const nov = monthRow(report, '2026-11-01')
    expect(nov.houzs).toEqual({ bills: 2, sales: 2000, bill: 280 })
    expect(nov.we).toEqual({ bills: 2, sales: 2000, bill: 280 })
    // One of the two is still waiting for its salesperson's close.
    expect(nov.open).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(nov.gap).toEqual({ bills: 0, sales: 0, bill: 0 })
    expect(nov.carried).toEqual({ bills: 0, sales: 0, bill: 0 })
    expect([nov.ours, nov.theirs, nov.held]).toEqual([[], [], []])
    expect(report.apartBills).toBe(0)
  })

  it('the user’s case: sold at a fair on 8 Nov, keyed on 1 Dec — ours in November, Houzs’s in December', () => {
    const late = bill({ periodMonth: '2026-11-01', orderDate: '2026-12-01', reachedOn: '2026-11-08', fairDate: '2026-11-08', goods: 5000, releasedMonth: '2026-11-01' })
    const report = buildTally(
      [bill({ releasedMonth: '2026-11-01' }), late, bill({ periodMonth: '2026-12-01', orderDate: '2026-12-05' })],
      BRANDS,
      OPTS,
    )
    const [dec, nov] = report.months
    expect([dec.month, nov.month]).toEqual(['2026-12-01', '2026-11-01'])

    // November: we paid on 6,000 of sales, Houzs on 1,000.
    expect(nov.we).toEqual({ bills: 2, sales: 6000, bill: 840 })
    expect(nov.open.bills).toBe(0)
    expect(nov.houzs).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(nov.gap).toEqual({ bills: 1, sales: 5000, bill: 700 })
    expect(nov.ours.map(b => b.orderId)).toEqual([late.orderId])
    expect(nov.theirs).toEqual([])
    // Still to come from Houzs when November ends.
    expect(nov.carried).toEqual({ bills: 1, sales: 5000, bill: 700 })

    // December: Houzs pays for it; we already have.
    expect(dec.houzs).toEqual({ bills: 2, sales: 6000, bill: 840 })
    expect(dec.we).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(dec.gap).toEqual({ bills: -1, sales: -5000, bill: -700 })
    expect(dec.theirs.map(b => b.orderId)).toEqual([late.orderId])
    expect(dec.carried).toEqual({ bills: 0, sales: 0, bill: 0 })

    expect(report.apartBills).toBe(1)
    expect(nov.ours[0]).toMatchObject({
      saleMonth: '2026-11-01', ourMonth: '2026-11-01', ours: 'paid', houzsMonth: '2026-12-01', houzs: 'pays',
      soDate: '2026-12-01', fairDate: '2026-11-08', reachedOn: '2026-11-08',
    })
  })

  it('a bill under its deposit is paid by neither side: in no total, listed where it was sold', () => {
    const held = bill({ periodMonth: '2026-10-01', orderDate: '2026-10-07', depositMet: false, reachedOn: null, goods: 18400 })
    const report = buildTally([held, bill({ periodMonth: '2026-10-01', orderDate: '2026-10-08' })], BRANDS, OPTS)
    const oct = monthRow(report, '2026-10-01')
    expect(oct.houzs).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(oct.we).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(oct.held.map(b => b.orderId)).toEqual([held.orderId])
    expect(oct.held[0]).toMatchObject({ ourMonth: null, ours: 'below_deposit', houzsMonth: null, houzs: 'below_deposit', bill: 2576 })
    expect([oct.gap.bill, oct.carried.bill, report.apartBills]).toEqual([0, 0, 0])
  })

  it('a deposit topped up later: Houzs pays in the month it came, and so does the close that released it', () => {
    // RM 500 of RM 5,000 at the October fair, topped up on 3 Nov; ANTHONY's October was closed with it held.
    const topped = bill({ periodMonth: '2026-10-01', orderDate: '2026-10-06', reachedOn: '2026-11-03', releasedMonth: '2026-11-01', goods: 5000 })
    const report = buildTally([topped], BRANDS, OPTS)
    const oct = monthRow(report, '2026-10-01')
    const nov = monthRow(report, '2026-11-01')
    expect([oct.houzs.bills, oct.we.bills]).toEqual([0, 0])
    expect(nov.houzs).toEqual({ bills: 1, sales: 5000, bill: 700 })
    expect(nov.we).toEqual({ bills: 1, sales: 5000, bill: 700 })
    expect(report.apartBills).toBe(0)
  })

  it('topped up and not paid yet: the month still open for its salesperson pays it', () => {
    const topped = bill({ periodMonth: '2026-10-01', orderDate: '2026-10-06', reachedOn: '2026-11-03', goods: 5000 })
    // ANTHONY's October is closed: November's close will pay it — the month Houzs pays it in.
    const closed = buildTally([topped], BRANDS, { ...OPTS, closes: [{ staffId: 'anthony', month: '2026-10-01' }] })
    expect(monthRow(closed, '2026-11-01').we).toEqual({ bills: 1, sales: 5000, bill: 700 })
    expect(monthRow(closed, '2026-11-01').open.bills).toBe(1)
    expect(closed.apartBills).toBe(0)
    // His October is still open: its close will pay it, a month before Houzs does.
    const open = buildTally([topped], BRANDS, OPTS)
    const oct = monthRow(open, '2026-10-01')
    expect(oct.we).toEqual({ bills: 1, sales: 5000, bill: 700 })
    expect(oct.ours.map(b => b.orderId)).toEqual([topped.orderId])
    expect(oct.carried.bill).toBe(700)
    expect(monthRow(open, '2026-11-01').theirs.map(b => b.orderId)).toEqual([topped.orderId])
  })

  it('a bill that came in after its salesperson’s close is paid by the next month’s — after Houzs', () => {
    const lateIn = bill({ periodMonth: '2026-10-01', orderDate: '2026-10-28', releasedMonth: '2026-11-01', goods: 2000 })
    const report = buildTally([lateIn], BRANDS, OPTS)
    const oct = monthRow(report, '2026-10-01')
    const nov = monthRow(report, '2026-11-01')
    expect(oct.houzs).toEqual({ bills: 1, sales: 2000, bill: 280 })
    expect(oct.we.bills).toBe(0)
    expect(oct.theirs.map(b => b.orderId)).toEqual([lateIn.orderId])
    // Houzs has paid and we have not yet: carried the other way.
    expect(oct.carried).toEqual({ bills: 1, sales: -2000, bill: -280 })
    expect(nov.we).toEqual({ bills: 1, sales: 2000, bill: 280 })
    expect(nov.ours.map(b => b.orderId)).toEqual([lateIn.orderId])
    expect(nov.carried.bill).toBe(0)
  })

  it('an order with no fair in the ERP is ours alone — carried until Houzs counts it', () => {
    const noFair = bill({ periodMonth: '2026-10-01', orderDate: '2026-10-14', hasFair: false, releasedMonth: '2026-10-01', goods: 1780 })
    const report = buildTally([noFair, bill()], BRANDS, OPTS)
    const oct = monthRow(report, '2026-10-01')
    const nov = monthRow(report, '2026-11-01')
    expect(oct.we).toEqual({ bills: 1, sales: 1780, bill: 249.2 })
    expect(oct.houzs.bills).toBe(0)
    expect(oct.ours.map(b => b.orderId)).toEqual([noFair.orderId])
    expect(oct.carried).toEqual({ bills: 1, sales: 1780, bill: 249.2 })
    // Nothing clears it: it is still carried a month on.
    expect(nov.carried).toEqual({ bills: 1, sales: 1780, bill: 249.2 })
    expect(report.apartBills).toBe(1)
  })

  it('Houzs has paid a bill we still hold: Houzs’s side alone, carried the other way', () => {
    const odd = bill({ periodMonth: '2026-10-01', orderDate: '2026-10-09', depositMet: false })
    const report = buildTally([odd, bill()], BRANDS, OPTS)
    const oct = monthRow(report, '2026-10-01')
    expect(oct.houzs).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(oct.we.bills).toBe(0)
    expect(oct.theirs.map(b => b.orderId)).toEqual([odd.orderId])
    expect(oct.held).toEqual([])
    expect(monthRow(report, '2026-11-01').carried).toEqual({ bills: 1, sales: -1000, bill: -140 })
  })

  it('every month’s gap is exactly the bills the two sides pay apart', () => {
    const orders = [
      bill({ periodMonth: '2026-09-01', orderDate: '2026-09-10', releasedMonth: '2026-09-01' }),
      bill({ periodMonth: '2026-09-01', orderDate: '2026-10-10', reachedOn: '2026-09-19', goods: 3888, releasedMonth: '2026-09-01' }),
      bill({ periodMonth: '2026-10-01', orderDate: '2026-10-12' }),
      bill({ periodMonth: '2026-10-01', orderDate: '2026-11-02', goods: 9500, refNo: 'ZNT6389', brandCode: 'ZANOTTI' }),
      bill({ periodMonth: '2026-11-01', orderDate: '2026-10-30', goods: 700 }), // keyed before its fair day
      bill({ periodMonth: '2026-10-01', orderDate: '2026-10-06', reachedOn: '2026-11-03', goods: 5000 }), // topped up
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
    // And it ends at nothing: every bill here is paid on both sides in the end.
    expect(report.months[0].carried.bill).toBe(0)
  })

  it('a bill keyed before its fair day is Houzs’s first — carried the other way', () => {
    const early = bill({ periodMonth: '2026-11-01', orderDate: '2026-10-30', goods: 700 })
    const report = buildTally([early], BRANDS, OPTS)
    const oct = monthRow(report, '2026-10-01')
    const nov = monthRow(report, '2026-11-01')
    expect(oct.houzs.bill).toBe(98)
    expect(oct.we.bill).toBe(0)
    expect(oct.carried).toEqual({ bills: 1, sales: -700, bill: -98 })
    expect(nov.carried.bill).toBe(0)
    expect(tallyChips(nov.ours[0], 'ours')).toEqual([
      { text: 'Houzs paid Oct 2026', tone: 'info', title: 'SO date 30 Oct 2026' },
      { text: 'Not closed yet', tone: 'plain', title: 'ANTHONY is not closed for November 2026 yet' },
    ])
    expect(tallyChips(oct.theirs[0], 'theirs')).toEqual([
      { text: 'We pay Nov 2026', tone: 'info', title: 'ANTHONY is not closed for November 2026 yet' },
    ])
  })

  it('starts at the first month the portal pays; a bill settled by hand before it is Houzs’s side only', () => {
    // Sold at a July fair (settled on the claim form), keyed in September.
    const july = bill({ periodMonth: '2026-07-01', orderDate: '2026-09-03', goods: 2000 })
    // Both months before September: not tallied at all.
    const august = bill({ periodMonth: '2026-07-01', orderDate: '2026-08-20' })
    const report = buildTally([july, august, bill({ periodMonth: '2026-09-01', orderDate: '2026-09-12' })], BRANDS, OPTS)
    expect(report.from).toBe('2026-09-01')
    expect(report.months.map(m => m.month)).toEqual(['2026-09-01'])
    const sep = report.months[0]
    expect(sep.houzs).toEqual({ bills: 2, sales: 3000, bill: 420 })
    expect(sep.we).toEqual({ bills: 1, sales: 1000, bill: 140 })
    expect(sep.theirs.map(b => b.orderId)).toEqual([july.orderId])
    // Paid by us before the tally began and by Houzs inside it: nothing is carried.
    expect(sep.carried).toEqual({ bills: 0, sales: 0, bill: 0 })
    expect(tallyChips(sep.theirs[0], 'theirs')).toEqual([{
      text: 'By hand · Jul 2026', tone: 'plain', title: 'Settled by hand — July 2026 was paid before the portal paid',
    }])
  })

  it('with no first paid month it starts at the first month a bill sits in', () => {
    const report = buildTally([bill({ periodMonth: '2026-07-01', orderDate: '2026-08-02' })], BRANDS, { feedFloor: null, from: null })
    expect(report.from).toBe('2026-07-01')
    expect(report.months.map(m => m.month)).toEqual(['2026-08-01', '2026-07-01'])
  })

  it('lists the months in between, though no bill sits in them', () => {
    const report = buildTally([bill({ periodMonth: '2026-09-01', orderDate: '2026-11-04' })], BRANDS, OPTS)
    expect(report.months.map(m => m.month)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    const oct = report.months[1]
    expect(oct.houzs.bills + oct.we.bills).toBe(0)
    expect(oct.carried).toEqual({ bills: 1, sales: 1000, bill: 140 })
  })

  it('an old bill topped up is paid on both sides when its top-up comes', () => {
    // ZNT4813: sold 10 Mar 2026, before the feed window; at its deposit on 2 Nov, in November's month.
    const old = bill({ periodMonth: '2026-11-01', orderDate: '2026-03-10', reachedOn: '2026-11-02', refNo: 'ZNT4813', brandCode: 'ZANOTTI', goods: 6000 })
    const report = buildTally([old], BRANDS, OPTS)
    expect(report.months.map(m => m.month)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    const nov = report.months[0]
    expect(nov.houzs).toEqual({ bills: 1, sales: 6000, bill: 780 })
    expect(nov.we).toEqual({ bills: 1, sales: 6000, bill: 780 })
    expect(report.apartBills).toBe(0)
    expect(tallyBills([old], BRANDS, OPTS)[0].oldBill).toBe(true)
    // With no window nothing is an old bill.
    expect(tallyBills([old], BRANDS, { feedFloor: null, from: null })[0].oldBill).toBe(false)
  })

  it('leaves out cancelled and excluded bills', () => {
    const report = buildTally([
      bill({ cancelled: true, orderDate: '2026-12-01' }),
      bill({ excludedReason: 'ignored_agent', orderDate: '2026-12-01' }),
      bill(),
    ], BRANDS, OPTS)
    expect(report.months.map(m => m.month)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    expect(report.months[0].we.bills).toBe(1)
    expect(report.apartBills).toBe(0)
  })

  it('reads the brand off the Ref No. prefix, else the bill’s own — as the month’s export does', () => {
    const report = buildTally([
      bill({ refNo: 'ZNT6389', brandCode: 'AKEMI', orderDate: '2026-12-01', reachedOn: '2026-11-08' }),
      bill({ refNo: 'HC-SO-2611-022', brandCode: 'zanotti', orderDate: '2026-12-02', reachedOn: '2026-11-08' }),
      bill({ refNo: null, brandCode: null, orderDate: '2026-12-03', reachedOn: '2026-11-08' }),
    ], BRANDS, OPTS)
    const [a, b, c] = monthRow(report, '2026-11-01').ours
    expect(a).toMatchObject({ brandCode: 'ZANOTTI', brandName: 'Zanotti', pct: 0.13, bill: 130 })
    expect(b).toMatchObject({ brandCode: 'ZANOTTI', brandName: 'Zanotti', pct: 0.13, bill: 130 })
    expect(c).toMatchObject({ brandCode: '', brandName: 'No brand', pct: null, bill: null })
    expect(report.noPctBills).toBe(1)
  })

  it('a bill of a brand on its own scheme is that brand’s whatever its paper says; no % set, no Bill to HC', () => {
    const report = buildTally([bill({ refNo: 'HC12345', brandCode: '2990S', goods: 2990 })], BRANDS, OPTS)
    const nov = report.months[0]
    expect(nov.we).toEqual({ bills: 1, sales: 2990, bill: 0 })
    expect(report.noPctBills).toBe(1)
  })

  it('has nothing to say with no bills', () => {
    expect(buildTally([], BRANDS, OPTS)).toEqual({ from: null, months: [], apartBills: 0, noPctBills: 0 })
    // Every bill before the first month the portal pays.
    expect(buildTally([bill({ periodMonth: '2026-07-01', orderDate: '2026-08-02' })], BRANDS, OPTS).months).toEqual([])
  })
})

describe('a month whole — its export', () => {
  const sep = bill({ periodMonth: '2026-09-01', orderDate: '2026-10-10', reachedOn: '2026-09-19', fairDate: '2026-09-19', goods: 3888, releasedMonth: '2026-09-01' })
  const own = bill({ periodMonth: '2026-10-01', orderDate: '2026-10-08', fairDate: '2026-10-04', goods: 2000, releasedMonth: '2026-10-01' })
  const late = bill({ periodMonth: '2026-10-01', orderDate: '2026-11-02', reachedOn: '2026-10-31', goods: 9500, refNo: 'ZNT6389', brandCode: 'ZANOTTI' })
  const nov = bill({ periodMonth: '2026-11-01', orderDate: '2026-11-06', goods: 500 })
  const held = bill({ periodMonth: '2026-10-01', orderDate: '2026-10-07', depositMet: false, reachedOn: null, goods: 18400 })
  const bills = () => tallyBills(
    [sep, own, late, nov, held, bill({ cancelled: true, periodMonth: '2026-10-01', orderDate: '2026-10-09' })],
    BRANDS,
    { feedFloor: '2026-08-01', from: '2026-09-01' },
  )

  it('lists EVERY bill on each side, not only the ones paid apart', () => {
    const month = tallyMonthExport(bills(), '2026-09-01', '2026-10-01')!
    // Houzs pays: September's bill keyed in October, and October's own.
    expect(month.houzs.map(b => b.orderId)).toEqual([own.orderId, sep.orderId])
    // We pay: October's own, and the one keyed in November.
    expect(month.we.map(b => b.orderId)).toEqual([own.orderId, late.orderId])
    // The fair day comes along with every bill.
    expect(month.we[0].fairDate).toBe('2026-10-04')
    // The row is the page's.
    expect(month.row.houzs).toEqual({ bills: 2, sales: 5888, bill: 824.32 })
    expect(month.row.we).toEqual({ bills: 2, sales: 11500, bill: 1515 })
    expect(month.row.open).toEqual({ bills: 1, sales: 9500, bill: 1235 })
    expect(month.row.carried.bill).toBe(1235)
    expect(month.row.held.map(b => b.orderId)).toEqual([held.orderId])
    expect(month.from).toBe('2026-09-01')
  })

  it('splits both sides by brand, the biggest first', () => {
    const month = tallyMonthExport(bills(), '2026-09-01', '2026-10-01')!
    expect(month.brands).toEqual([
      { code: 'ZANOTTI', name: 'Zanotti', pct: 0.13, houzs: { bills: 0, sales: 0, bill: 0 }, we: { bills: 1, sales: 9500, bill: 1235 } },
      { code: 'AKEMI', name: 'Akemi', pct: 0.14, houzs: { bills: 2, sales: 5888, bill: 824.32 }, we: { bills: 1, sales: 2000, bill: 280 } },
    ])
    // Each side's brands add up to its row.
    expect(month.brands.reduce((t, b) => t + b.houzs.bill, 0)).toBeCloseTo(month.row.houzs.bill, 2)
    expect(month.brands.reduce((t, b) => t + b.we.bill, 0)).toBeCloseTo(month.row.we.bill, 2)
  })

  it('is nothing for a month the Tally does not list', () => {
    expect(tallyMonthExport(bills(), '2026-09-01', '2026-08-01')).toBeNull()
    expect(tallyMonthExport(bills(), '2026-09-01', '2027-01-01')).toBeNull()
    expect(tallyMonthExport([], '2026-09-01', '2026-10-01')).toBeNull()
  })

  it('tallyOf over the bills is buildTally', () => {
    const orders = [sep, own, late, nov, held]
    const options = { feedFloor: '2026-08-01', from: '2026-09-01', closes: [{ staffId: 'anthony', month: '2026-09-01' }] }
    expect(tallyOf(tallyBills(orders, BRANDS, options), options.from)).toEqual(buildTally(orders, BRANDS, options))
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
  const only = (order: TallyOrder) => tallyBills([order], BRANDS, OPTS)[0]

  it('writes a month in three letters, and long for a heading', () => {
    expect(tallyMonthShort('2026-09-01')).toBe('Sep 2026')
    expect(tallyMonthLong('2026-09-01')).toBe('September 2026')
    expect(tallyDay('2026-11-08')).toBe('8 Nov 2026')
  })

  it('says what Houzs does with a bill we pay', () => {
    // Keyed a month after its fair: Houzs is still to pay, and that is ours to chase.
    expect(houzsWord(only(bill({ orderDate: '2026-12-01', reachedOn: '2026-11-08', releasedMonth: '2026-11-01' }))))
      .toEqual({ text: 'Houzs pays Dec 2026', tone: 'alert', title: 'SO date 1 Dec 2026' })
    // The deposit came a month after the SO date.
    expect(houzsWord(only(bill({ periodMonth: '2026-10-01', orderDate: '2026-10-06', reachedOn: '2026-11-03' }))))
      .toEqual({ text: 'Houzs pays Nov 2026', tone: 'alert', title: 'Deposit reached 3 Nov 2026' })
    expect(houzsWord(only(bill({ orderDate: '2026-10-30' }))))
      .toEqual({ text: 'Houzs paid Oct 2026', tone: 'info', title: 'SO date 30 Oct 2026' })
    expect(houzsWord(only(bill({ hasFair: false })))).toMatchObject({ text: 'No fair in ERP', tone: 'alert' })
    expect(houzsWord(only(bill({ reachedOn: null })))).toMatchObject({ text: 'Houzs · below deposit', tone: 'alert' })
  })

  it('says what we do with a bill Houzs pays', () => {
    expect(ourWord(only(bill({ orderDate: '2026-12-01', reachedOn: '2026-11-08', releasedMonth: '2026-11-01' }))))
      .toEqual({ text: 'We paid Nov 2026', tone: 'ledger', title: 'Paid by ANTHONY\'s close of November 2026' })
    expect(ourWord(only(bill({ orderDate: '2026-10-30' }))))
      .toEqual({ text: 'We pay Nov 2026', tone: 'info', title: 'ANTHONY is not closed for November 2026 yet' })
    expect(ourWord(only(bill({ depositMet: false })))).toMatchObject({ text: 'We hold · below deposit', tone: 'alert' })
    expect(ourWord(only(bill({ periodMonth: '2026-08-01', orderDate: '2026-09-02' })))).toMatchObject({ text: 'By hand · Aug 2026', tone: 'plain' })
  })

  it('a row’s words follow the list it is in', () => {
    const paidFirst = only(bill({ orderDate: '2026-12-01', reachedOn: '2026-11-08', releasedMonth: '2026-11-01' }))
    expect(tallyChips(paidFirst, 'ours').map(c => c.text)).toEqual(['Houzs pays Dec 2026'])
    expect(tallyChips(paidFirst, 'theirs').map(c => c.text)).toEqual(['We paid Nov 2026'])
    // Not paid yet: the list says so beside what Houzs does.
    const waiting = only(bill({ orderDate: '2026-12-01', reachedOn: '2026-11-08' }))
    expect(tallyChips(waiting, 'ours').map(c => c.text)).toEqual(['Houzs pays Dec 2026', 'Not closed yet'])
    // Paid by neither: under its deposit — and, with no fair, Houzs would not pay it even then.
    expect(tallyChips(only(bill({ depositMet: false, reachedOn: null })), 'held').map(c => c.text)).toEqual(['Below deposit'])
    expect(tallyChips(only(bill({ depositMet: false, reachedOn: null, hasFair: false })), 'held').map(c => c.text)).toEqual(['Below deposit', 'No fair in ERP'])
  })

  it('opens on the latest month with a bill paid apart, else the latest', () => {
    const report = buildTally([
      bill({ periodMonth: '2026-09-01', orderDate: '2026-10-10', reachedOn: '2026-09-19' }),
      bill({ periodMonth: '2026-11-01', orderDate: '2026-11-08' }),
    ], BRANDS, OPTS)
    expect(defaultTallyMonth(report)).toBe('2026-10-01')
    expect(defaultTallyMonth(buildTally([bill()], BRANDS, OPTS))).toBe('2026-11-01')
    expect(defaultTallyMonth(buildTally([], BRANDS, OPTS))).toBeNull()
    // A bill under its deposit is nobody's gap: it does not pick the month.
    const held = buildTally([bill({ periodMonth: '2026-09-01', orderDate: '2026-09-07', depositMet: false, reachedOn: null }), bill()], BRANDS, OPTS)
    expect(defaultTallyMonth(held)).toBe('2026-11-01')
  })
})
