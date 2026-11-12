import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { tallyBills, tallyMonthExport, type TallyBrand, type TallyOrder } from '@/lib/commission/tally'
import { buildTallyXlsx, houzsColumn, ourColumn } from './tally-xlsx'

// Comm Cal › Tally's workbook (2026-11-12): one month whole — every bill Houzs
// pays, every bill we pay, each brand on both sides, the bills paid apart and
// the ones under their deposit, which neither pays.

const BRANDS: TallyBrand[] = [
  { code: 'AKEMI', name: 'Akemi', refPrefixes: ['HC'], hcBillPct: 0.14, ownScheme: false },
  { code: 'ZANOTTI', name: 'Zanotti', refPrefixes: ['ZNT'], hcBillPct: 0.13, ownScheme: false },
  { code: '2990S', name: '2990s', refPrefixes: [], hcBillPct: null, ownScheme: true },
]

/** A bill paid in full the day it was keyed, at a fair, not closed yet — unless said otherwise. */
function order(over: Partial<TallyOrder>): TallyOrder {
  const orderDate = over.orderDate ?? '2026-10-05'
  return {
    orderId: 'o', orderNo: 'HC-SO-2610-001', refNo: 'HC1001', periodMonth: '2026-10-01', orderDate,
    staffId: 'anthony', salesperson: 'ANTHONY', customer: 'MR TAN', brandCode: 'AKEMI', goods: 1000,
    cancelled: false, excludedReason: null, depositMet: true, reachedOn: orderDate, hasFair: true, fairDate: null, releasedMonth: null,
    ...over,
  }
}

const ORDERS: TallyOrder[] = [
  // September's bill, paid in full at its fair on 19 Sep, keyed on 10 Oct; September's close paid it.
  order({ orderId: 's2', orderNo: 'HC-SO-2610-145', refNo: 'HC13509', periodMonth: '2026-09-01', orderDate: '2026-10-10', reachedOn: '2026-09-19', fairDate: '2026-09-19', goods: 3888, salesperson: 'SALLY', staffId: 'sally', releasedMonth: '2026-09-01' }),
  // October's own, paid by October's close.
  order({ orderId: 'x1', orderNo: 'HC-SO-2610-020', orderDate: '2026-10-08', goods: 2000, releasedMonth: '2026-10-01' }),
  // Sold on 30 Oct, keyed on 2 Nov; STANLEY is not closed yet.
  order({ orderId: 'x2', orderNo: 'HC-SO-2611-022', refNo: 'ZNT6389', brandCode: 'ZANOTTI', orderDate: '2026-11-02', reachedOn: '2026-10-30', fairDate: '2026-10-30', goods: 9500, salesperson: 'STANLEY', staffId: 'stanley' }),
  // 2990s — no Bill to HC % — paid by October's close.
  order({ orderId: 'z1', orderNo: '2990-SO-2610-009', refNo: 'TNN0209', brandCode: '2990S', orderDate: '2026-10-20', goods: 2990, customer: null, releasedMonth: '2026-10-01' }),
  // Under its deposit: neither side pays it.
  order({ orderId: 'h1', orderNo: 'HC-SO-2610-077', refNo: 'HC1400', orderDate: '2026-10-07', goods: 18400, depositMet: false, reachedOn: null, salesperson: 'WEI PIN', staffId: 'weipin' }),
  // The ERP names no fair on it: ours alone.
  order({ orderId: 'f1', orderNo: 'HC-SO-2610-090', refNo: 'HC1500', orderDate: '2026-10-14', goods: 1780, hasFair: false, releasedMonth: '2026-10-01' }),
]

const OPTS = { feedFloor: '2026-08-01', from: '2026-09-01' }

function workbook() {
  const month = tallyMonthExport(tallyBills(ORDERS, BRANDS, OPTS), '2026-09-01', '2026-10-01')!
  const buffer = buildTallyXlsx({ title: 'Revenue Team · Fair', month, commission: { total: 95390.86, closed: 13 } })
  return XLSX.read(buffer, { type: 'buffer' })
}

/** A sheet as rows of cells: an empty cell is null, and a row ends at its last value. */
function rows(wb: XLSX.WorkBook, name: string): (string | number | null)[][] {
  return XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name], { header: 1, defval: null }).map(row => {
    const cells = row.map(cell => (cell === '' ? null : cell))
    while (cells.length > 0 && cells[cells.length - 1] === null) cells.pop()
    return cells
  })
}

const HEAD = [
  'ERP no.', 'Ref No.', 'Salesperson', 'Customer', 'Brand', 'Fair day', 'SO date', 'Deposit reached',
  'Sales', 'Bill to HC %', 'Bill to HC', 'We pay', 'Houzs pays', 'Note',
]

describe('the Tally workbook', () => {
  it('has a Summary, each side whole, the bills paid apart and the ones under their deposit', () => {
    expect(workbook().SheetNames).toEqual(['Summary', 'Houzs pays', 'We pay', 'Paid apart', 'Below deposit'])
  })

  it('sums the month on its Summary, then each brand on both sides', () => {
    const s = rows(workbook(), 'Summary')
    expect(s[0][0]).toBe('Revenue Team · Fair · Tally · October 2026')
    expect(s[2]).toEqual([null, 'Bills', 'Sales', 'Bill to HC'])
    // Houzs pays: September's bill keyed in October, October's own, and the 2990s bill (no %).
    expect(s[3]).toEqual(['Houzs pays', 3, 8878, 824.32])
    // We pay: October's own, the one with no fair, the 2990s bill, and the one keyed in November — not closed yet.
    expect(s[4]).toEqual(['We pay', 4, 16270, 1764.2])
    expect(s[5]).toEqual(['  of which not closed yet', 1, 9500, 1235])
    expect(s[6]).toEqual(['Gap (we − Houzs)', 1, 7392, 939.88])
    // Still owed by Houzs when October ends: the one it pays in November, and the one with no fair.
    expect(s[7]).toEqual(['Carried after October 2026', 2, 11280, 1484.2])
    expect(s[8]).toEqual(['Below deposit — neither pays', 1, 18400, 2576])
    expect(s[10]).toEqual(['Commission paid to salespeople', '13 closed', null, 95390.86])

    const head = s.findIndex(r => r[0] === 'Brand')
    expect(s[head]).toEqual([
      'Brand', 'Bill to HC %', 'Houzs pays · bills', 'Houzs pays · sales', 'Houzs pays · Bill to HC',
      'We pay · bills', 'We pay · sales', 'We pay · Bill to HC', 'Gap · Bill to HC',
    ])
    expect(s[head + 1]).toEqual(['Akemi', 0.14, 2, 5888, 824.32, 2, 3780, 529.2, -295.12])
    expect(s[head + 2]).toEqual(['Zanotti', 0.13, 0, 0, 0, 1, 9500, 1235, 1235])
    expect(s[head + 3]).toEqual(['2990s', 'Not set', 1, 2990, 0, 1, 2990, 0, 0])
    expect(s[head + 4]).toEqual(['Total', null, 3, 8878, 824.32, 4, 16270, 1764.2, 939.88])
  })

  it('lists every bill Houzs pays, with the month we pay each', () => {
    const houzs = rows(workbook(), 'Houzs pays')
    expect(houzs[0]).toEqual(HEAD)
    expect(houzs[1]).toEqual(['HC-SO-2610-020', 'HC1001', 'ANTHONY', 'MR TAN', 'Akemi', null, '2026-10-08', '2026-10-08', 2000, 0.14, 280, 'Oct 2026', 'Oct 2026'])
    expect(houzs[2]).toEqual(['HC-SO-2610-145', 'HC13509', 'SALLY', 'MR TAN', 'Akemi', '2026-09-19', '2026-10-10', '2026-09-19', 3888, 0.14, 544.32, 'Sep 2026', 'Oct 2026'])
    expect(houzs[3]).toEqual(['2990-SO-2610-009', 'TNN0209', 'ANTHONY', null, '2990s', null, '2026-10-20', '2026-10-20', 2990, null, null, 'Oct 2026', 'Oct 2026', 'No Bill to HC % set'])
    expect(houzs[4]).toEqual(['3 bills', null, null, null, null, null, null, null, 8878, null, 824.32])
  })

  it('lists every bill we pay, with what Houzs does with each', () => {
    const we = rows(workbook(), 'We pay')
    expect(we.map(r => r[0])).toEqual(['ERP no.', 'HC-SO-2610-020', 'HC-SO-2610-090', '2990-SO-2610-009', 'HC-SO-2611-022', '4 bills'])
    expect(we[2]).toEqual(['HC-SO-2610-090', 'HC1500', 'ANTHONY', 'MR TAN', 'Akemi', null, '2026-10-14', '2026-10-14', 1780, 0.14, 249.2, 'Oct 2026', 'No fair in ERP'])
    expect(we[4]).toEqual(['HC-SO-2611-022', 'ZNT6389', 'STANLEY', 'MR TAN', 'Zanotti', '2026-10-30', '2026-11-02', '2026-10-30', 9500, 0.13, 1235, 'Oct 2026 · not closed yet', 'Nov 2026'])
  })

  it('lists the bills paid apart as the page does', () => {
    const apart = rows(workbook(), 'Paid apart')
    expect(apart[0][0]).toBe('We pay in Oct 2026 · Houzs does not')
    expect(apart[1]).toEqual(HEAD)
    expect([apart[2][0], apart[3][0], apart[4][0]]).toEqual(['HC-SO-2610-090', 'HC-SO-2611-022', '2 bills'])
    const theirs = apart.findIndex(r => r[0] === 'Houzs pays in Oct 2026 · we do not')
    expect(apart[theirs + 2][0]).toBe('HC-SO-2610-145')
    expect(apart[theirs + 3]).toEqual(['1 bill', null, null, null, null, null, null, null, 3888, null, 544.32])
  })

  it('lists the bills under their deposit, which neither side pays', () => {
    const below = rows(workbook(), 'Below deposit')
    expect(below[0][0]).toBe('Below deposit in Oct 2026 · neither pays')
    expect(below[1]).toEqual(HEAD)
    expect(below[2]).toEqual(['HC-SO-2610-077', 'HC1400', 'WEI PIN', 'MR TAN', 'Akemi', null, '2026-10-07', null, 18400, 0.14, 2576, 'Held · below deposit', 'Below deposit'])
    expect(below[3]).toEqual(['1 bill', null, null, null, null, null, null, null, 18400, null, 2576])
  })

  it('says so when nobody is closed yet', () => {
    const month = tallyMonthExport(tallyBills(ORDERS, BRANDS, OPTS), '2026-09-01', '2026-10-01')!
    const wb = XLSX.read(buildTallyXlsx({ title: 'Revenue Team · Fair', month, commission: null }), { type: 'buffer' })
    expect(rows(wb, 'Summary')[10]).toEqual(['Commission paid to salespeople', 'Nobody closed yet'])
  })

  it('notes an old bill topped up, and a month settled by hand', () => {
    const [old, byHand] = tallyBills([
      order({ orderId: 'old', periodMonth: '2026-11-01', orderDate: '2026-03-10', reachedOn: '2026-11-02', refNo: 'ZNT4813', brandCode: 'ZANOTTI' }),
      order({ orderId: 'aug', periodMonth: '2026-08-01', orderDate: '2026-09-02' }),
    ], BRANDS, OPTS)
    expect([ourColumn(old), houzsColumn(old)]).toEqual(['Nov 2026 · not closed yet', 'Nov 2026'])
    expect([ourColumn(byHand), houzsColumn(byHand)]).toEqual(['Aug 2026 · by hand', 'Sep 2026'])
    const month = tallyMonthExport([old, byHand], '2026-09-01', '2026-11-01')!
    const wb = XLSX.read(buildTallyXlsx({ title: 'Revenue Team · Fair', month, commission: null }), { type: 'buffer' })
    expect(rows(wb, 'We pay')[1][13]).toBe('Old bill topped up · sold 10 Mar 2026')
  })
})
