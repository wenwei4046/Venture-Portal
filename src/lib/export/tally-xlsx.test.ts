import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { tallyBills, tallyMonthExport, type TallyBrand, type TallyOrder } from '@/lib/commission/tally'
import { buildTallyXlsx } from './tally-xlsx'

// Comm Cal › Tally's workbook (2026-11-12): one month whole — every bill on
// each side, each brand on both, the bills in two months.

const BRANDS: TallyBrand[] = [
  { code: 'AKEMI', name: 'Akemi', refPrefixes: ['HC'], hcBillPct: 0.14, ownScheme: false },
  { code: 'ZANOTTI', name: 'Zanotti', refPrefixes: ['ZNT'], hcBillPct: 0.13, ownScheme: false },
  { code: '2990S', name: '2990s', refPrefixes: [], hcBillPct: null, ownScheme: true },
]

function order(over: Partial<TallyOrder>): TallyOrder {
  return {
    orderId: 'o', orderNo: 'HC-SO-2610-001', refNo: 'HC1001', periodMonth: '2026-10-01', orderDate: '2026-10-05',
    salesperson: 'ANTHONY', customer: 'MR TAN', brandCode: 'AKEMI', commissionable: 1000,
    cancelled: false, excludedReason: null, depositMet: true, ...over,
  }
}

const ORDERS: TallyOrder[] = [
  order({ orderId: 's2', orderNo: 'HC-SO-2610-145', refNo: 'HC13509', periodMonth: '2026-09-01', orderDate: '2026-10-10', commissionable: 3888, salesperson: 'SALLY' }),
  order({ orderId: 'x1', orderNo: 'HC-SO-2610-020', periodMonth: '2026-10-01', orderDate: '2026-10-08', commissionable: 2000 }),
  order({ orderId: 'x2', orderNo: 'HC-SO-2611-022', refNo: 'ZNT6389', brandCode: 'ZANOTTI', periodMonth: '2026-10-01', orderDate: '2026-11-02', commissionable: 9500, salesperson: 'STANLEY', depositMet: false }),
  order({ orderId: 'z1', orderNo: '2990-SO-2610-009', refNo: 'TNN0209', brandCode: '2990S', periodMonth: '2026-10-01', orderDate: '2026-10-20', commissionable: 2990, customer: null }),
]

function workbook() {
  const bills = tallyBills(ORDERS, BRANDS, { feedFloor: '2026-08-01', fairDates: new Map([['s2', '2026-09-19'], ['x2', '2026-10-30']]) })
  const month = tallyMonthExport(bills, '2026-09-01', '2026-10-01')!
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

describe('the Tally workbook', () => {
  it('has a Summary, each side whole, and the bills in two months', () => {
    expect(workbook().SheetNames).toEqual(['Summary', 'By SO date', 'By fair date', 'In two months'])
  })

  it('sums the month on its Summary, then each brand on both sides', () => {
    const s = rows(workbook(), 'Summary')
    expect(s[0][0]).toBe('Revenue Team · Fair · Tally · October 2026')
    expect(s[2]).toEqual([null, 'Bills', 'Sales', 'Bill to HC'])
    // By SO date: September's bill keyed in October, October's own, and the 2990s bill (no %).
    expect(s[3]).toEqual(['By SO date — Houzs pays', 3, 8878, 824.32])
    expect(s[4]).toEqual(['By fair date — we pay', 3, 14490, 1515])
    expect(s[5]).toEqual(['Gap (fair − SO)', 0, 5612, 690.68])
    expect(s[6]).toEqual(['Carried after October 2026', 1, 9500, 1235])
    expect(s[8]).toEqual(['Commission paid to salespeople', '13 closed', null, 95390.86])

    const head = s.findIndex(r => r[0] === 'Brand')
    expect(s[head + 1]).toEqual(['Zanotti', 0.13, 0, 0, 0, 1, 9500, 1235, 1235])
    expect(s[head + 2]).toEqual(['Akemi', 0.14, 2, 5888, 824.32, 1, 2000, 280, -544.32])
    expect(s[head + 3]).toEqual(['2990s', 'Not set', 1, 2990, 0, 1, 2990, 0, 0])
    expect(s[head + 4]).toEqual(['Total', null, 3, 8878, 824.32, 3, 14490, 1515, 690.68])
  })

  it('lists every bill by SO date, with what we do with one of another month', () => {
    const so = rows(workbook(), 'By SO date')
    expect(so[0]).toEqual([
      'ERP no.', 'Ref No.', 'Salesperson', 'Customer', 'Brand', 'Fair day', 'SO date',
      'Sales', 'Bill to HC %', 'Bill to HC', 'Fair month (we pay)', 'SO month (Houzs pays)', 'Note',
    ])
    expect(so[1]).toEqual(['HC-SO-2610-020', 'HC1001', 'ANTHONY', 'MR TAN', 'Akemi', null, '2026-10-08', 2000, 0.14, 280, 'Oct 2026', 'Oct 2026'])
    expect(so[2]).toEqual(['HC-SO-2610-145', 'HC13509', 'SALLY', 'MR TAN', 'Akemi', '2026-09-19', '2026-10-10', 3888, 0.14, 544.32, 'Sep 2026', 'Oct 2026', 'We paid Sep 2026'])
    expect(so[3]).toEqual(['2990-SO-2610-009', 'TNN0209', 'ANTHONY', null, '2990s', null, '2026-10-20', 2990, null, null, 'Oct 2026', 'Oct 2026', 'No Bill to HC % set'])
    expect(so[4]).toEqual(['3 bills', null, null, null, null, null, null, 8878, null, 824.32])
  })

  it('lists every bill by fair date, with when Houzs pays one of another month', () => {
    const fair = rows(workbook(), 'By fair date')
    expect(fair.map(r => r[0])).toEqual(['ERP no.', 'HC-SO-2610-020', '2990-SO-2610-009', 'HC-SO-2611-022', '3 bills'])
    expect(fair[3]).toEqual(['HC-SO-2611-022', 'ZNT6389', 'STANLEY', 'MR TAN', 'Zanotti', '2026-10-30', '2026-11-02', 9500, 0.13, 1235, 'Oct 2026', 'Nov 2026', 'Houzs pays Nov 2026 · Below deposit'])
  })

  it('lists the bills in two months as the page does', () => {
    const two = rows(workbook(), 'In two months')
    expect(two[0][0]).toBe('Fair date in Oct 2026 · SO date in another month')
    expect(two[2][0]).toBe('HC-SO-2611-022')
    expect(two[3][0]).toBe('1 bill')
    const theirs = two.findIndex(r => r[0] === 'SO date in Oct 2026 · fair date in another month')
    expect(two[theirs + 2][0]).toBe('HC-SO-2610-145')
    expect(two[theirs + 3]).toEqual(['1 bill', null, null, null, null, null, null, 3888, null, 544.32])
  })

  it('says so when nobody is closed yet', () => {
    const bills = tallyBills(ORDERS, BRANDS, { feedFloor: '2026-08-01' })
    const month = tallyMonthExport(bills, '2026-09-01', '2026-10-01')!
    const wb = XLSX.read(buildTallyXlsx({ title: 'Revenue Team · Fair', month, commission: null }), { type: 'buffer' })
    expect(rows(wb, 'Summary')[8]).toEqual(['Commission paid to salespeople', 'Nobody closed yet'])
  })
})
