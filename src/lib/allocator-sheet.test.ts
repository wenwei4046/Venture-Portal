import { describe, expect, it } from 'vitest'
import { allocatorSummary, batchLabel, byCompanyRows, methodLabel, recordLine, shareLine, splitSummary, type SheetTxn } from './allocator-sheet'

// 2026-10-07 — the Billing Allocator on the sheet; 2026-10-09 — the user's
// Claude Design handoff (照设计档): the split is one column of text, and a
// record has a page of its own. The figures behind the summary cards, the
// Split column and the By company table, worked out here so the Records tab
// only draws them.

const d = (companyId: string | null, companyLabel: string, amount: number, isOwnShare = false) => ({
  companyId,
  companyLabel,
  detail: 'Head',
  amount,
  isOwnShare,
})

// September 2026, cut down: the rental billed under ALC-202609, the AI tools
// billed under -3, a third expense whose batch (-4) was voided — not billed.
const TXNS: SheetTxn[] = [
  {
    id: 't1', txnNo: 'ALC-202609-001', description: 'Office Rental', amount: 18980, method: 'headcount',
    billedRef: 'ALC-202609', locked: true,
    details: [
      d(null, 'HOUZS Venture (own)', 366.59, true),
      d('co-2990', '2990', 742.32),
      d('co-car', 'CAR', 3681.57),
      d('dept:mkt', 'Marketing (dept)', 4745),
    ],
  },
  {
    id: 't5', txnNo: 'ALC-202609-005', description: 'AI TOOLS - JUL26', amount: 1863.18, method: 'percentage',
    billedRef: 'ALC-202609-3', locked: true,
    details: [d(null, 'HOUZS Venture (own)', 745.27, true), d('co-2990', '2990', 372.64), d('co-car', 'CAR', 745.27)],
  },
  {
    id: 't6', txnNo: 'ALC-202609-006', description: "AI TOOLS-SEP'2026", amount: 2149.2, method: 'percentage',
    billedRef: 'ALC-202609-4', locked: false,
    details: [d(null, 'HOUZS Venture (own)', 859.68, true), d('co-2990', '2990', 429.84), d('co-car', 'CAR', 859.68)],
  },
]

const INVOICES = [
  { id: 'i7', invoiceNo: 'HV-INV-202609-0007', companyId: 'co-2990', companyLabel: '2990', status: 'issued', referenceNo: 'ALC-202609' },
  { id: 'i8', invoiceNo: 'HV-INV-202609-0008', companyId: 'co-car', companyLabel: 'CAR', status: 'paid', referenceNo: 'ALC-202609' },
  { id: 'i13', invoiceNo: 'HV-INV-202609-0013', companyId: 'dept:mkt', companyLabel: 'Marketing (dept)', status: 'paid', referenceNo: 'ALC-202609' },
  { id: 'i30', invoiceNo: 'HV-INV-202609-0030', companyId: 'co-2990', companyLabel: '2990', status: 'issued', referenceNo: 'ALC-202609-3' },
  { id: 'i31', invoiceNo: 'HV-INV-202609-0031', companyId: 'co-car', companyLabel: 'CAR', status: 'paid', referenceNo: 'ALC-202609-3' },
]

describe('allocatorSummary', () => {
  it('sums the month, what its unbilled allocations still have to bill, what is billed, and HV’s own share', () => {
    const s = allocatorSummary(TXNS, INVOICES)
    expect(s).toEqual({
      allocated: 22992.38,
      txnCount: 3,
      batchCount: 2, // ALC-202609 and -3 are live; -4 was voided
      toBill: 1289.52, // 429.84 + 859.68
      toBillCount: 1,
      toBillTargets: 2, // 2990 and CAR
      billed: 10286.8, // 742.32 + 3,681.57 + 4,745 + 372.64 + 745.27
      billedCount: 2,
      invoiceCount: 5,
      ownShare: 1971.54, // 366.59 + 745.27 + 859.68
    })
  })

  it('is empty-safe', () => {
    expect(allocatorSummary([], [])).toMatchObject({ allocated: 0, txnCount: 0, toBill: 0, billed: 0, ownShare: 0, invoiceCount: 0 })
  })
})

describe('splitSummary', () => {
  it('reads the split as each company’s share of the amount, HV own left out', () => {
    expect(splitSummary(TXNS[0])).toBe('2990 3.9% · CAR 19.4% · Marketing 25.0%')
    expect(splitSummary(TXNS[1])).toBe('2990 20.0% · CAR 40.0%')
  })

  it('is a dash when nothing is billed to anyone', () => {
    expect(splitSummary({ ...TXNS[0], details: [] })).toBe('—')
  })
})

describe('byCompanyRows', () => {
  it('gives each target its share, what is billed, what is still to bill, and its invoices — largest share first, HV own at the end', () => {
    const rows = byCompanyRows(TXNS, INVOICES)
    expect(rows.map((r) => [r.label, r.share, r.billed, r.toBill, r.invoices.map((i) => i.invoiceNo.slice(-4))])).toEqual([
      ['CAR', 5286.52, 4426.84, 859.68, ['0008', '0031']],
      ['Marketing', 4745, 4745, 0, ['0013']],
      ['2990', 1544.8, 1114.96, 429.84, ['0007', '0030']],
      ['HV own', 1971.54, 0, 0, []],
    ])
    expect(rows.map((r) => [r.own, r.dept])).toEqual([[false, false], [false, true], [false, false], [true, false]])
    expect(rows[0].invoices[0]).toEqual({ id: 'i8', invoiceNo: 'HV-INV-202609-0008', status: 'paid' })
  })
})

describe('batchLabel', () => {
  it('is the batch’s reference, or that it is not billed', () => {
    expect(batchLabel(TXNS[0])).toBe('ALC-202609')
    expect(batchLabel(TXNS[1])).toBe('ALC-202609-3')
    expect(batchLabel(TXNS[2])).toBe('not billed')
    expect(batchLabel({ ...TXNS[2], billedRef: null })).toBe('not billed')
  })
})

// 2026-10-14 — the revamp v2's D11: a record's line in Records and a share's in the drawer and the preview.
describe('recordLine', () => {
  it('says how it was split and its batch', () => {
    expect(recordLine(TXNS[0])).toBe('Headcount split · ALC-202609')
    expect(recordLine(TXNS[2])).toBe('Percentage split · not billed')
    expect(methodLabel('equal')).toBe('Equal')
  })
})

describe('shareLine', () => {
  it('names the heads behind a headcount share, an equal share as such, else its part of the amount', () => {
    expect(shareLine('Head: 3.25/16.75 (2026-09)', 3681.57, 18980)).toBe('3.25 staff · 19.4%')
    expect(shareLine('Head: 4.00/16.75 (current)', 4532.54, 18980)).toBe('4 staff · 23.9%')
    expect(shareLine('Equal: 1/7', 100, 700)).toBe('equal share')
    expect(shareLine('17.5%', 175, 1000)).toBe('17.5%')
    expect(shareLine('Custom', 250, 1000)).toBe('25.0%')
    expect(shareLine('Custom', 0, 0)).toBe('0.0%')
  })
})
