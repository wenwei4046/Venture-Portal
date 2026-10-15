import { describe, expect, it } from 'vitest'
import type { BaRow } from '@/app/(portal)/ba/_components/BaView'
import { baHubModel, baRecordModel, baState } from './ba-model'

// Fund › Invoice Financing in the Finance phone app (2026-10-15, part 5c): the
// desktop register's figures as a hub, a financing as its page with what this
// reader may do to it.

const ba = (over: Partial<BaRow> & { id: string }): BaRow => ({
  baNo: null,
  bankName: null,
  faceAmount: 10_000,
  bankAnnualRate: 0,
  startDate: '2026-10-01',
  tenorDays: 90,
  maturityDate: '2026-12-30',
  chargeRateMonthly: 0.025,
  hcRateMonthly: 0.015,
  borrower: 'HS',
  borrowerCompanyId: 'hs',
  status: 'active',
  notes: null,
  interestInvoice: null,
  interestPv: null,
  attachments: [],
  ...over,
})

const A = ba({ id: 'aaaaaaaa-1', baNo: 'BA-2610-01', bankName: 'Maybank', faceAmount: 50_000, bankAnnualRate: 0.045 })
const B = ba({
  id: 'bbbbbbbb-2',
  bankName: 'CIMB',
  faceAmount: 20_000,
  startDate: '2026-07-20',
  maturityDate: '2026-10-18',
  borrower: 'HM',
  borrowerCompanyId: 'hm',
  interestInvoice: { no: 'INV-1', status: 'issued' },
  interestPv: { no: 'PV-9', status: 'pending_approval' },
})
const C = ba({ id: 'cccccccc-3', status: 'settled', maturityDate: '2026-09-30' })
const LIMITS = [
  { companyId: 'hs', label: 'HOUZS Sofa (HS)', limit: 100_000, used: 50_000 },
  { companyId: 'hm', label: 'HOUZS Mattress (HM)', limit: 0, used: 20_000 },
  { companyId: 'hx', label: 'HOUZS X (HX)', limit: 0, used: 0 },
]
const TODAY = '2026-10-15'

describe('baHubModel', () => {
  const m = baHubModel({ rows: [A, B, C], limits: LIMITS }, TODAY)

  it('the active face over the desktop page’s cards — charge, owe HC, margin — then the register and the limits', () => {
    expect(m.hero).toEqual({ value: 'RM 70,000.00', label: 'Active face · 2 active' })
    expect(m.chip).toEqual({ text: '1 maturing in 14 days', tone: 'alert' })
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['To charge borrowers', 'Bill the borrower · 5028', 'RM 5,250.00'],
      ['To pay HC', 'Pay HC · 6001', 'RM 3,150.00'],
      ['HV margin', 'Charge − owe HC', 'RM 2,100.00'],
      ['Financing register', '2 active · 1 settled', '3 BAs'],
      ['Limits', 'of 100,000.00 · 2 companies · 70% used', 'RM 70,000.00'],
    ])
  })

  it('a list row is the borrower, its state · terms · bank · ref, the figure — soonest maturity first', () => {
    expect(m.lists.charge.map((r) => [r.title, r.desc, r.amount])).toEqual([
      ['HM', 'billed INV-1 · 2.5%/mo · 90d · CIMB', '1,500.00'],
      ['HS', 'to bill · 2.5%/mo · 90d · Maybank · BA-2610-01', '3,750.00'],
    ])
    expect(m.lists.owe.map((r) => r.desc)).toEqual(['PV PV-9 · pending approval · 1.5%/mo · 90d · CIMB', 'HC not paid · 1.5%/mo · 90d · Maybank · BA-2610-01'])
    expect(m.lists.register.active.map((r) => r.desc)).toEqual(['matures in 3d · 90d · 20 Jul – 18 Oct · CIMB', 'matures in 76d · 90d · 1 Oct – 30 Dec · Maybank · BA-2610-01'])
    expect(m.lists.register.settled.map((r) => r.id)).toEqual(['cccccccc-3'])
  })

  it('the limit cards: used of limit, available, the bank’s average rate, each active financing; another company to set', () => {
    expect(m.limits[0]).toMatchObject({ label: 'HOUZS Sofa (HS)', pct: 50, tone: 'ledger', available: 50_000, avgRatePa: 0.045 })
    expect(m.limits[0].active).toEqual([{ id: 'aaaaaaaa-1', label: 'RM 50,000.00 — Maybank', sub: 'matures 30 Dec 2026 (76d) · BA-2610-01', late: false, soon: false }])
    expect(m.limits[1]).toMatchObject({ label: 'HOUZS Mattress (HM)', pct: null, tone: 'none', avgRatePa: null })
    expect(m.others).toEqual([{ id: 'hx', label: 'HOUZS X (HX)' }])
  })

  it('past maturity says overdue, ahead of maturing soon', () => {
    const late = baHubModel({ rows: [{ ...B, maturityDate: '2026-10-10' }], limits: [] }, TODAY)
    expect(late.chip).toEqual({ text: '1 overdue', tone: 'danger' })
    expect(baState({ status: 'active', maturityDate: '2026-10-10' }, TODAY)).toEqual({ words: 'overdue 5d', light: 'danger' })
  })
})

describe('baRecordModel', () => {
  const facility = (row: BaRow) => ({ row, shortCode: 'HS', limit: 100_000, used: 50_000, banks: [{ id: 'b1', label: 'Maybank — 123' }] })
  const all = { create: true, edit: true, void: true }

  it('a financing still to bill and pay: Generate PV, Bill interest, Mark settled; Edit and Delete open', () => {
    const r = baRecordModel(facility(A), TODAY, all)
    expect(r).toMatchObject({
      ref: 'BA-2610-01',
      state: { words: 'matures in 76d', light: 'info' },
      face: 'RM 50,000.00',
      note: 'Matures 30 Dec 2026 · 76 days left',
      oweToHc: 2250,
      can: { pv: true, bill: true, settle: true, reopen: false, edit: true, remove: true, files: true },
      locked: null,
    })
    expect(r.groups.map((g) => g.title)).toEqual(['Terms', 'Dates', 'Billing', 'Facility · HS'])
    expect(r.groups[3].lines.map((l) => [l.label, l.value])).toEqual([
      ['Limit', '100,000.00'],
      ['Active (used)', '50,000.00'],
      ['Available', '50,000.00'],
      ['Of limit', '50%'],
    ])
  })

  it('billed and paid: no PV, no bill; Edit and Delete shut, saying why', () => {
    const r = baRecordModel(facility(B), TODAY, all)
    expect(r).toMatchObject({ ref: 'BA-bbbbbbbb', can: { pv: false, bill: false, settle: true }, locked: 'void the invoice / PV first' })
  })

  it('settled: Reopen; and only what the reader’s boxes give', () => {
    expect(baRecordModel(facility(C), TODAY, all)).toMatchObject({ can: { settle: false, reopen: true }, note: 'Settled — the limit is released' })
    expect(baRecordModel(facility(A), TODAY, { create: false, edit: false, void: false }).can).toEqual({ pv: false, bill: false, settle: false, reopen: false, edit: false, remove: false, files: false })
  })
})
