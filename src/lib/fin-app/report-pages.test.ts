import { describe, expect, it } from 'vitest'
import type { TbBlock } from '@/lib/trial-balance-groups'
import type { CounterpartyRow, PositionRow } from '@/lib/counterparty-statement'
import type { CashFlowReport } from '@/lib/gl-reports'
import {
  asAtOf,
  baseRateModel,
  companyStatementModel,
  fromReportModel,
  keepOf,
  ledgerModel,
  monthPlace,
  receiptPaymentModel,
  signedBalance,
  trialBalanceModel,
} from './report-pages'
import { monthEnd, shiftMonth } from './page-model'

// The Report section's pages with no top tab in the Finance phone app
// (2026-10-15, part 5b): each desktop page's own figures as a hub of cards,
// each card's lines summing to it.

describe('a month on show', () => {
  it('names the month and the segment in the address — none for this month, none for all segments', () => {
    expect(keepOf('2026-10', '2026-10')).toBe('')
    expect(keepOf('2026-09', '2026-10', 'marketing')).toBe('m=2026-09&s=marketing')
  })
  it('steps back freely, never past the office’s month; each segment keeps the month', () => {
    const p = monthPlace({ href: '/fin-app/page/tb', title: 'Trial Balance', roman: 'III.', ym: '2026-10', thisMonth: '2026-10', label: 'As at 15 Oct 2026', segment: 'hr', segments: [{ value: '', label: 'All' }, { value: 'hr', label: 'HR' }] })
    expect(p.keep).toBe('s=hr')
    expect(p.period).toEqual({ label: 'As at 15 Oct 2026', prev: 'm=2026-09&s=hr', next: null })
    expect(p.segments?.map((x) => x.keep)).toEqual(['', 's=hr'])
  })
  it('reads a past month as at its last day, this month as at today', () => {
    expect(asAtOf('2026-09', '2026-10-15')).toBe('2026-09-30')
    expect(asAtOf('2026-10', '2026-10-15')).toBe('2026-10-15')
    expect(monthEnd('2024-02')).toBe('2024-02-29')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('trialBalanceModel', () => {
  const blocks: TbBlock[] = [
    { type: 'asset', title: 'Assets', total: 'Total assets', debit: 1500, credit: 0, groups: [{ code: '3000', name: 'Cash & Bank', debit: 1500, credit: 0, items: [{ code: '3000', name: 'Cash & Bank - Hong Leong', debit: 1500, credit: 0 }] }] },
    { type: 'liability', title: 'Liabilities', total: 'Total liabilities', debit: 0, credit: 1500, groups: [{ code: '4000', name: 'Payables', debit: 0, credit: 1500, items: [{ code: '4001', name: 'Fund sources payable', debit: 0, credit: 1500 }] }] },
  ]
  it('the total debit, whether it ties, a card a type on its own side', () => {
    const m = trialBalanceModel({ rows: [1, 2], totals: { debit: 1500, credit: 1500 }, reconciles: true }, blocks, '2026-10-15')
    expect(m.hero).toEqual({ value: 'RM 1,500.00', label: 'Total debit · as at 15 Oct 2026' })
    expect(m.chip).toEqual({ text: 'Debits = credits', tone: 'ledger' })
    expect(m.cards.map((c) => [c.label, c.value])).toEqual([
      ['Assets', 'RM 1,500.00'],
      ['Liabilities', 'RM 1,500.00'],
    ])
    expect(m.cards[1].groups[0].lines[0]).toMatchObject({ label: 'Fund sources payable', sub: '4001', value: 'Cr 1,500.00' })
  })
  it('a trial balance that does not tie says by how much', () => {
    const m = trialBalanceModel({ rows: [], totals: { debit: 1500, credit: 1400 }, reconciles: false }, blocks, '2026-10-15')
    expect(m.chip).toEqual({ text: 'Does not reconcile · RM 100.00', tone: 'danger' })
  })
})

describe('baseRateModel', () => {
  it('the current rate, its change, the quarters by each measure', () => {
    const m = baseRateModel(
      [
        { quarter: '2026-Q4', base_rate: '0.0095', weighted_cost: '0.007', op_margin: '0.0025', approved_at: '2026-10-01T02:00:00Z' },
        { quarter: '2026-Q3', base_rate: '0.009', weighted_cost: '0.0065', op_margin: '0.0025', approved_at: null },
      ],
      () => '1 Oct 2026',
    )
    expect(m.hero).toEqual({ value: '0.950%/mo', label: 'Current base rate · 2026-Q4' })
    expect(m.chip).toEqual({ text: '+0.050% vs 2026-Q3', tone: 'def' })
    expect(m.cards.map((c) => [c.label, c.value])).toEqual([
      ['History', '0.950%/mo'],
      ['Weighted cost', '0.700%'],
      ['Op margin', '0.250%'],
    ])
    expect(m.cards[0].groups[0].lines.map((l) => l.sub)).toEqual(['Weighted 0.700% · Margin 0.250% · Approved 1 Oct 2026', 'Weighted 0.650% · Margin 0.250% · Not approved'])
  })
})

describe('companyStatementModel', () => {
  const pos = (over: Partial<PositionRow> & { id: string; side: 'collect' | 'repay' }): PositionRow => ({
    counterparty: 'CAR',
    kind: 'flat',
    principal: 100000,
    monthlyRate: 0.04,
    tenureMonths: 3,
    principalPaid: 0,
    principalOutstanding: 100000,
    interestOutstanding: 12000,
    monthlyInterest: 4000,
    remainingPeriods: 3,
    finishYM: '2026-12',
    startYM: '2026-10',
    startDate: '2026-09-15',
    minPayInterest: false,
    ...over,
  })
  const rows: CounterpartyRow[] = [
    { counterparty: 'CAR', collectPrincipal: 100000, collectInterest: 12000, repayPrincipal: 0, repayInterest: 0, net: 112000, items: [pos({ id: 'loan-1', side: 'collect' })] },
    { counterparty: 'Mr Liang', collectPrincipal: 0, collectInterest: 0, repayPrincipal: 80000, repayInterest: 0, net: -80000, items: [pos({ id: 'fs-1', side: 'repay', counterparty: 'Mr Liang', kind: 'no_term', principal: 80000, principalOutstanding: 80000, interestOutstanding: 0, monthlyInterest: 800, finishYM: null })] },
  ]
  const totals = { collectPrincipal: 100000, collectInterest: 12000, repayPrincipal: 80000, repayInterest: 0, net: 32000 }
  const m = companyStatementModel(rows, totals, '2026-10-15')

  it('which way the net goes, to collect and to repay each a card', () => {
    expect(m.hero).toEqual({ value: 'Collect RM 32,000.00', label: 'Net · as at 15 Oct 2026' })
    expect(m.cards.map((c) => [c.label, c.value])).toEqual([
      ['To collect', 'RM 112,000.00'],
      ['To repay', 'RM 80,000.00'],
      ['Counterparties', 'Collect RM 32,000.00'],
    ])
  })

  it('a counterparty opens onto its deals in the desktop’s words, each into the app', () => {
    const car = m.cards[0].groups[0].lines[0]
    expect(car).toMatchObject({ label: 'CAR', value: '112,000.00', sub: 'Principal 100,000.00 · Interest 12,000.00 · 1 deal' })
    expect(car.detail?.groups[0].lines[0]).toMatchObject({
      label: '4.000%/mo · 3mo · starts 2026-10',
      sub: 'RM 100,000.00 · due 100,000.00 + 12,000.00 interest · 3 left · by 2026-12',
      value: '112,000.00',
      open: { href: '/fin-app/fund/out?id=loan-1' },
    })
    const liang = m.cards[1].groups[0].lines[0].detail?.groups[0].lines[0]
    expect(liang).toMatchObject({ label: '4.000%/mo · no fixed term · starts 2026-10', sub: 'RM 80,000.00 · due 80,000.00 · TBD · ~RM 800.00/mo interest', open: { href: '/fin-app/fund/in?id=fs-1' } })
  })
})

describe('receiptPaymentModel', () => {
  const section = (label: string, current: number) => ({ key: label, label, current, previous: 0, nodes: [{ code: '4100', name: label, current, previous: 0, txns: [], children: [] }] })
  const cf = {
    inflow: section('Money in', 5000),
    outflow: section('Money out', 3000),
    inflowLeaves: [],
    outflowLeaves: [],
    openingCash: { current: 10000, previous: 0 },
    netChange: { current: 2000, previous: 0 },
    closingCash: { current: 12000, previous: 0 },
    check: { current: 0, previous: 0 },
  } as unknown as CashFlowReport
  it('the Cash Flow’s figures named as the page names them, and a segment’s invoices still owed', () => {
    const m = receiptPaymentModel(cf, { inflow: [], outflow: [] }, '2026-10', true, [
      { id: 'inv-1', invoiceNo: 'HV-INV-202610-0024', party: 'Carres', periodMonth: '2026-10-01', totalAmount: 5000, receipts: 1000, credits: 0, outstanding: 4000 },
    ])
    expect(m.hero).toEqual({ value: 'RM 2,000.00', label: 'Net · October 2026' })
    expect(m.cards.map((c) => [c.label, c.value])).toEqual([
      ['Receipts', 'RM 5,000.00'],
      ['Payments', 'RM 3,000.00'],
      ['Bank balances', 'RM 12,000.00'],
      ['To collect', 'RM 4,000.00'],
    ])
    expect(m.cards[3].groups[0].lines[0]).toMatchObject({ label: 'HV-INV-202610-0024 · Carres', sub: 'October 2026 · total 5,000.00 · received 1,000.00', value: '4,000.00', open: { href: '/fin-app/daily/invoices?id=inv-1' } })
  })
  it('consolidated: no To collect (the desktop needs a segment for it)', () => {
    expect(receiptPaymentModel(cf, { inflow: [], outflow: [] }, '2026-10', true, null).cards.map((c) => c.key)).toEqual(['in', 'out', 'bank'])
  })
})

describe('ledgerModel', () => {
  const led = {
    code: '3000',
    accountName: 'Cash & Bank - Hong Leong',
    accountType: 'asset',
    openingBalance: 1000,
    closingBalance: 1300,
    periodTotals: { debit: 500, credit: 200 },
    lines: [
      { entryDate: '', entryNo: '', description: 'BALANCE B/F', ref: '', debit: 0, credit: 0, runningBalance: 1000 },
      { entryDate: '2026-10-01', entryNo: 'JE-202610-0006', description: 'Settle invoice', ref: 'HV-OR-202610-0526', debit: 500, credit: 0, runningBalance: 1500 },
      { entryDate: '2026-10-02', entryNo: 'JE-202610-0805', description: 'Claude AI Claim', ref: '', debit: 0, credit: 200, runningBalance: 1300 },
    ],
  }
  const m = ledgerModel([led], '2026-10-01', '2026-10-15', 'October 2026')
  it('what was posted, an account’s balance the desktop’s way', () => {
    expect(m.hero).toEqual({ value: 'RM 500.00', label: 'Debits posted · October 2026' })
    expect(m.chip).toEqual({ text: 'Credits posted 200.00', tone: 'alert' })
    expect(m.cards[0]).toMatchObject({ label: 'Assets', value: '1,300.00 Dr' })
    expect(signedBalance(-50)).toBe('50.00 Cr')
    expect(signedBalance(0)).toBe('—')
  })
  it('an account opens onto its entries: brought forward, each with its running balance, carried forward', () => {
    const lines = m.cards[0].groups[0].lines[0].detail!.groups[0].lines
    expect(lines.map((l) => [l.label, l.sub, l.value])).toEqual([
      ['Balance B/F', '1 Oct 2026', '1,000.00 Dr'],
      ['Settle invoice', '1 Oct · bal 1,500.00 Dr · JE-202610-0006 · HV-OR-202610-0526', '500.00 Dr'],
      ['Claude AI Claim', '2 Oct · bal 1,300.00 Dr · JE-202610-0805', '200.00 Cr'],
      ['Balance C/F', '15 Oct 2026', '1,300.00 Dr'],
    ])
  })
})

describe('fromReportModel', () => {
  it('a line’s record in the app becomes its address', () => {
    const page = fromReportModel({
      hub: 'debtor',
      hero: { value: 'RM 1.00', label: 'x' },
      chip: null,
      eyebrow: 'e',
      cards: [{ key: 'b', tone: 'all', icon: 'doc', label: 'B', sub: 's', value: 'v', groups: [{ key: 'g', title: 'G', count: '1', lines: [{ key: 'l', label: 'L', value: '1.00', open: { hub: 'invoices', id: 'inv-9' } }] }] }],
    })
    expect(page.cards[0].groups[0].lines[0].open).toEqual({ href: '/fin-app/daily/invoices?id=inv-9' })
  })
})
