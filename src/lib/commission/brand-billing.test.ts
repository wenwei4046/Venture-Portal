import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { brandBillingReport, brandOfRef, exportLines, type BrandDef, type LineContext } from './brand-billing'
import { buildBrandBillingXlsx } from '@/lib/export/brand-billing-xlsx'
import { rowOrigin } from './row-origin'
import type { CommissionOrderRow, WorkbenchPerson } from './workbench'

// Sales by Brand & Billing (2026-11-11): the figures of the user's own
// September file — ADRIAN's sheet and the HC bill table.

const BRANDS: BrandDef[] = [
  { code: 'AKEMI', name: 'Akemi', refPrefixes: ['HC'], hcBillPct: 0.14 },
  { code: 'ZANOTTI', name: 'Zanotti', refPrefixes: ['ZNT'], hcBillPct: 0.13 },
  { code: 'DUNLOP', name: 'Dunlop', refPrefixes: ['PG'], hcBillPct: 0.13 },
  { code: 'ERGOTEX', name: 'Ergotex', refPrefixes: ['EGT'], hcBillPct: null },
]
const PERIOD = '2026-09-01'

function row(over: Partial<CommissionOrderRow>): CommissionOrderRow {
  const value = over.commissionableValue ?? 1000
  return {
    key: over.orderId ?? 'o', orderId: 'o', originalOrderId: 'o', orderNo: 'HC-SO-1', refNo: null, paperNo: null,
    orderDate: '2026-09-14', eventDate: '2026-09-14', periodMonth: PERIOD, staffId: 's1', staffName: 'ADRIAN',
    venue: 'MID VALLEY', eventName: null, organizer: null, location: null, brands: [], categories: [], upsale: false,
    orderTotal: value, commissionableValue: value, paidAmount: value, productRevenue: value, marginRevenue: value,
    marginCost: null, marginPct: null, marginSource: 'none', status: 'eligible', productRate: 0.06,
    productCommission: value * 0.06, kpiQty: 0, kpiBase: 0, kpiBonus: 0, kpiThresholdPct: 0, marginIncentive: 0,
    marginAllocationBasis: null, openBillRank: null, openBillRate: 0, openBillBonus: 0, penaltyMultiplier: 1,
    penaltyWithheld: 0, totalCommission: Math.round(value * 0.06 * 100) / 100, share: null,
    ...over,
  } as CommissionOrderRow
}

function person(staffId: string, name: string, rows: CommissionOrderRow[]): WorkbenchPerson {
  return {
    staffId, name, employeeCode: null, titleLabel: null, rankLabel: null, productRate: 0.06, statement: null,
    personalRows: rows.map(r => ({ ...r, staffId, staffName: name })), overridingRows: [], personalTotal: 0,
    overrideTotal: 0, monthlyGroupIncentive: 0, monthlyDirectorPay: 0, totalCommission: 0, reconciliationDifference: 0,
  }
}

const UPSALES: Record<string, { kind: 'upsale' | 'drop'; originalRef: string; erpDocNo: string | null; originalPeriod: string | null }> = {
  up1: { kind: 'upsale', originalRef: 'HC6316', erpDocNo: null, originalPeriod: '2026-08-01' },
  dr1: { kind: 'drop', originalRef: 'HC10722', erpDocNo: 'HC-SO-013367', originalPeriod: '2026-08-01' },
}

const ctx: LineContext = {
  originOf: r => rowOrigin(r, PERIOD, {
    upsale: UPSALES[r.orderId] ? { kind: UPSALES[r.orderId].kind, originalPeriod: UPSALES[r.orderId].originalPeriod } : null,
    closed: r.orderId === 'topup' ? 'held' : r.orderId === 'late' ? 'absent' : null,
  }),
  upsaleOf: r => UPSALES[r.orderId] ?? null,
  customerOf: id => (id === 'a1' ? 'Nik' : null),
  billBrandOf: id => (id === 'noref' ? 'ZANOTTI' : null),
}

describe('brandOfRef — the paper number names the brand', () => {
  it('reads the prefix when a digit follows it', () => {
    expect(brandOfRef('ZNT6724', BRANDS)).toBe('ZANOTTI')
    expect(brandOfRef('hc 6316', BRANDS)).toBe('AKEMI')
    expect(brandOfRef('PG10505', BRANDS)).toBe('DUNLOP')
  })
  it('an ERP document number standing in for the paper names nobody', () => {
    expect(brandOfRef('HC-SO-2609-071', BRANDS)).toBeNull()
    expect(brandOfRef('', BRANDS)).toBeNull()
    expect(brandOfRef(null, BRANDS)).toBeNull()
  })
  it('the longest prefix wins', () => {
    const brands = [...BRANDS, { code: 'HCX', name: 'HC Extra', refPrefixes: ['HCX'], hcBillPct: null }]
    expect(brandOfRef('HCX12', brands)).toBe('HCX')
  })
})

describe('exportLines — each ledger row as the file lists it', () => {
  const people = [
    person('s1', 'ADRIAN', [
      row({ orderId: 'a1', orderNo: 'HC-SO-2609-069', refNo: 'ZNT6724', commissionableValue: 3500 }),
      row({
        orderId: 'sh', orderNo: 'HC-SO-2609-271', refNo: 'ZNT6099', commissionableValue: 1750, orderTotal: 1750,
        share: { ownerStaffId: 's1', ownerName: 'ADRIAN', wholeTotal: 3500, parts: [{ staffId: 's1', name: 'ADRIAN', pct: 0.5 }, { staffId: 's2', name: 'ZACK', pct: 0.5 }] },
      }),
      row({ orderId: 'bd', refNo: 'HC1', commissionableValue: 2060, status: 'deposit_pending', paidAmount: 0, totalCommission: 0 }),
      row({ orderId: 'topup', refNo: 'HC6316', periodMonth: '2026-08-01', commissionableValue: 6990 }),
      row({ orderId: 'held', refNo: 'HC9', periodMonth: '2026-08-01', status: 'deposit_pending', commissionableValue: 999 }),
      row({ orderId: 'up1', upsale: true, orderTotal: 1260, commissionableValue: 1260 }),
      row({ orderId: 'dr1', upsale: true, orderTotal: -2577, commissionableValue: -2577 }),
      row({ orderId: 'ex', refNo: 'HC2', status: 'excluded' }),
      row({ orderId: 'noref', orderNo: 'HC-SO-2609-300', refNo: 'HC-SO-2609-300', commissionableValue: 500 }),
    ]),
  ]
  const lines = exportLines(people, PERIOD, BRANDS, ctx)

  it('leaves out a bill not counted and an earlier month’s bill still held', () => {
    expect(lines.map(l => l.erpNo)).not.toContain('ex')
    expect(lines.some(l => l.refNo === 'HC2' || l.refNo === 'HC9')).toBe(false)
  })
  it('types each line', () => {
    const typeOf = (ref: string) => lines.find(l => l.refNo === ref)?.type
    expect(typeOf('ZNT6724')).toBe('sales')
    expect(typeOf('ZNT6099')).toBe('shared')
    expect(typeOf('HC1')).toBe('below_deposit')
    expect(lines.find(l => l.type === 'topup')?.refNo).toBe('HC6316')
    expect(lines.find(l => l.type === 'upsell')).toMatchObject({ refNo: 'HC6316', sales: 1260, source: '人手', brandCode: 'AKEMI' })
    expect(lines.find(l => l.type === 'drop')).toMatchObject({ refNo: 'HC10722', erpNo: 'HC-SO-013367', sales: -2577, source: 'ERP' })
  })
  it('a shared bill says who holds the rest and the whole bill', () => {
    const shared = lines.find(l => l.type === 'shared')!
    expect(shared).toMatchObject({ sharePct: 0.5, wholeTotal: 3500, sales: 1750, brandCode: 'ZANOTTI' })
    expect(shared.note).toBe('Shared bill：跟 ZACK 50% 分（整张算佣金的 RM 3,500）')
  })
  it('below deposit earns nothing yet', () => {
    const below = lines.find(l => l.type === 'below_deposit')!
    expect(below.commission).toBe(0)
    expect(below.note).toContain('顾客付了 RM 0')
  })
  it('no paper number → the bill’s own brand, said so', () => {
    const noRef = lines.find(l => l.erpNo === 'HC-SO-2609-300')!
    expect(noRef.brandCode).toBe('ZANOTTI')
    expect(noRef.note).toContain('品牌用 ERP 的 ZANOTTI')
  })
  it('the customer comes with the bill', () => {
    expect(lines.find(l => l.refNo === 'ZNT6724')?.customer).toBe('Nik')
  })
  it('sales by date first, then top-up, upsales, drops', () => {
    expect(lines.slice(-3).map(l => l.type)).toEqual(['topup', 'upsell', 'drop'])
  })

  const report = brandBillingReport(lines, BRANDS, PERIOD, 'Fair')
  it('sums the person as the Summary does', () => {
    expect(report.title).toBe('Revenue Team · Fair · September 2026')
    expect(report.people[0]).toMatchObject({
      name: 'ADRIAN', bills: 4, sales: 3500 + 1750 + 2060 + 500, belowDeposit: 2060, topup: 6990, upsell: 1260, drop: -2577,
      total: 3500 + 1750 + 2060 + 500 + 6990 + 1260 - 2577,
    })
  })
  it('bills Houzs Century each brand’s total × its %; a brand with no % bills nothing', () => {
    const akemi = report.brandTotals.find(b => b.code === 'AKEMI')!
    expect(akemi.total).toBe(2060 + 6990 + 1260 - 2577)
    expect(akemi.bill).toBe(Math.round(akemi.total * 0.14 * 100) / 100)
    const zanotti = report.brandTotals.find(b => b.code === 'ZANOTTI')!
    expect(zanotti.total).toBe(3500 + 1750 + 500)
    expect(report.billTotal).toBe(Math.round((akemi.bill! + zanotti.bill!) * 100) / 100)
    expect(report.brandTotals[0].code).toBe('AKEMI') // the biggest first
  })

  it('the workbook has the Summary, All records and a sheet per person', () => {
    const wb = XLSX.read(buildBrandBillingXlsx(report), { type: 'buffer' })
    expect(wb.SheetNames).toEqual(['Summary', 'All records', 'ADRIAN'])
    const summary = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Summary, { header: 1 })
    expect(summary[3]).toEqual(['名字', '佣金 %', '单数', 'Sales（9 月的单）', '其中 below deposit', 'Top-up deposit', 'Upsales', 'Drop sales', '总 Sales'])
    expect(summary[4].slice(0, 3)).toEqual(['ADRIAN', 0.06, 4])
    const all = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['All records'], { header: 1 })
    expect(all[0][0]).toBe('名字')
    expect(all.at(-1)?.[0]).toBe('合计')
    const mine = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.ADRIAN, { header: 1 })
    expect(mine.at(-1)?.[0]).toBe('ADRIAN 合计')
    expect(mine.at(-1)?.[10]).toBe(report.people[0].total)
  })
})
