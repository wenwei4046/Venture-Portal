import { describe, expect, it } from 'vitest'
import type { AccountNode, BalanceSheetReport, CashFlowReport, PnlReport, ReportSection } from '@/lib/gl-reports'
import type { AgingView } from '@/lib/debtor-aging'
import type { LoanMonitorData, MonitorSide } from '@/lib/loan-monitor'
import { balanceSheetModel, cashFlowModel, debtorModel, loanModel, pnlModel, sectionLines } from './report-model'

// The Finance phone app's Report tab (2026-10-15, M15–M16): each report as a
// hub — its headline, a card per part, a list of lines — built from the
// statements the desktop's report pages draw.

const node = (code: string, name: string, current: number, children: AccountNode[] = []): AccountNode => ({ code, name, current, previous: 0, txns: [], children })
const section = (key: string, label: string, nodes: AccountNode[]): ReportSection => ({
  key,
  label,
  nodes,
  current: Math.round(nodes.reduce((s, n) => s + n.current, 0) * 100) / 100,
  previous: 0,
})

describe('sectionLines', () => {
  it('lists every account that moved, a parent by its children, and what the parent carries itself', () => {
    const s = section('expense', 'Expenses', [
      node('9000', 'Staff', 1500, [node('9030', 'Salary Expense', 1000), node('9031', 'EPF', 400)]),
      node('9094', 'Office Rental', 6000),
      node('9099', 'Stationery', 0),
    ])
    expect(sectionLines(s)).toEqual([
      { key: '9030', label: 'Salary Expense', sub: '9030', value: '1,000.00', tone: null },
      { key: '9031', label: 'EPF', sub: '9031', value: '400.00', tone: null },
      { key: '9000:own', label: 'Staff', sub: '9000', value: '100.00', tone: null },
      { key: '9094', label: 'Office Rental', sub: '9094', value: '6,000.00', tone: null },
    ])
  })

  it('reds a line that went the other way', () => {
    expect(sectionLines(section('x', 'X', [node('9030', 'Salary Expense', -63440)]))[0]).toMatchObject({ value: '-63,440.00', tone: 'out' })
  })
})

describe('pnlModel', () => {
  const pnl: PnlReport = {
    revenue: section('revenue', 'Revenue', [node('5010', 'Service fee income', 48200), node('5020', 'Salary income', 96120)]),
    cost: section('cost', 'Cost of Goods Sold', []),
    otherIncome: section('other_income', 'Other Income', [node('4600', 'Financing interest income', 9870.4)]),
    expense: section('expense', 'Expenses', [node('6100', 'Salaries & statutory', 112450.3), node('6200', 'Rental', 18000)]),
    grossProfit: { current: 144320, previous: 0 },
    netIncome: { current: 23740.1, previous: 0 },
  }

  it('heads with the net profit for the month over the statement’s four parts', () => {
    const m = pnlModel(pnl, '2026-10')
    expect(m.hero).toEqual({ value: 'RM 23,740.10', label: 'Net profit · October 2026' })
    expect(m.eyebrow).toBe('P&L · October 2026')
    expect(m.cards.map((c) => [c.label, c.sub, c.value, c.tone])).toEqual([
      ['Revenue', '2 lines', 'RM 144,320.00', 'paid'],
      ['Cost of Goods Sold', '0 lines', 'RM 0.00', 'issued'],
      ['Other Income', '1 line', 'RM 9,870.40', 'company'],
      ['Expenses', '2 lines', 'RM 130,450.30', 'approved'],
    ])
  })

  it('lists a part’s accounts and closes on its total; an empty part says so', () => {
    const m = pnlModel(pnl, '2026-10')
    const rev = m.cards[0].groups[0]
    expect(rev.lines.map((l) => [l.label, l.value])).toEqual([
      ['Service fee income', '48,200.00'],
      ['Salary income', '96,120.00'],
      ['Total revenue', '144,320.00'],
    ])
    expect(m.cards[1].groups[0]).toMatchObject({ lines: [], empty: 'Nothing this month.' })
  })
})

describe('cashFlowModel', () => {
  const cf = {
    inflow: section('in', 'Money in', [node('3051', 'Loans Receivable', 22950)]),
    outflow: section('out', 'Money out', [node('9030', 'Salary Expense', -112450.3)]),
    netChange: { current: -89500.3, previous: 0 },
    openingCash: { current: 1284500, previous: 0 },
    closingCash: { current: 1194999.7, previous: 0 },
    check: { current: 0, previous: 0 },
  } as unknown as CashFlowReport

  it('heads with the net change over Money in, Money out and the bank balances', () => {
    const m = cashFlowModel(cf, { inflow: [], outflow: [] }, '2026-09', false)
    expect(m.hero).toEqual({ value: 'RM -89,500.30', label: 'Net cash flow · September 2026' })
    expect(m.cards.map((c) => [c.label, c.value])).toEqual([
      ['Money in', 'RM 22,950.00'],
      ['Money out', 'RM -112,450.30'],
      ['Bank balances', 'RM 1,194,999.70'],
    ])
    expect(m.cards[2].groups[0].lines.map((l) => [l.label, l.value])).toEqual([
      ['Opening · 01 Sep', '1,284,500.00'],
      ['Net change', '-89,500.30'],
      ['Closing · 30 Sep', '1,194,999.70'],
    ])
  })

  it('groups a side by the user’s sections, and this month closes to date', () => {
    const lending = section('lend', '借贷 · Lending', [node('3051', 'Loans Receivable', 22950)])
    const m = cashFlowModel(cf, { inflow: [lending], outflow: [] }, '2026-10', true)
    expect(m.cards[0].groups[0]).toMatchObject({ title: '借贷 · Lending', count: 'RM 22,950.00' })
    expect(m.cards[2].groups[0].lines[2].label).toBe('Closing · to date')
  })

  it('says an uncategorised movement in the bank balances', () => {
    const m = cashFlowModel({ ...cf, check: { current: 12.5, previous: 0 } }, { inflow: [], outflow: [] }, '2026-09', false)
    expect(m.cards[2].groups[0].lines.at(-1)).toMatchObject({ label: 'Uncategorised cash movement', value: '12.50', tone: 'alert' })
  })
})

describe('balanceSheetModel', () => {
  const bs: BalanceSheetReport = {
    fixedAssets: section('fixed_asset', 'Fixed Assets', []),
    assets: section('asset', 'Current Assets', [node('1000', 'Cash at bank', 1149528.95)]),
    liabilities: section('liability', 'Liabilities', [node('4030', 'Director savings payable', 865000)]),
    equity: section('equity', 'Equity', [node('3000', 'Share capital', 100000)]),
    earnings: { current: 184528.95, previous: 0 },
    totalAssets: { current: 1149528.95, previous: 0 },
    totalLiabEquity: { current: 1149528.95, previous: 0 },
    check: { current: 0, previous: 0 },
  }

  it('heads with the total assets as at the month’s end; equity carries the cumulative P&L', () => {
    const m = balanceSheetModel(bs, '2026-10', '')
    expect(m.hero).toEqual({ value: 'RM 1,149,528.95', label: 'Total assets · 31 Oct 2026' })
    expect(m.chip).toBeNull()
    expect(m.cards.map((c) => c.label)).toEqual(['Current Assets', 'Liabilities', 'Equity']) // no fixed assets, no card
    const equity = m.cards[2]
    expect(equity.value).toBe('RM 284,528.95')
    expect(equity.groups[0].lines.map((l) => l.label)).toEqual(['Share capital', 'Retained & current earnings (cumulative P&L)', 'Total equity'])
  })

  it('says a segment’s slice will not balance, and an out-of-balance ledger', () => {
    expect(balanceSheetModel(bs, '2026-10', 'marketing').chip).toBe('Segment only · won’t balance')
    expect(balanceSheetModel({ ...bs, check: { current: 5, previous: 0 } }, '2026-10', '').chip).toBe('Out of balance')
  })
})

describe('debtorModel', () => {
  const view: AgingView = {
    asOf: '2026-10-15',
    columns: [],
    invoices: [
      { id: 'i1', invoiceNo: 'HV-INV-202608-0021', payer: 'Hookka', invoiceDate: '2026-08-17', dueDate: null, amount: 205.66, description: null, age: 59, bucket: 'd31_60' },
      { id: 'i2', invoiceNo: 'HV-INV-202607-0001', payer: 'Carres', invoiceDate: '2026-07-01', dueDate: null, amount: 1000, description: null, age: 106, bucket: 'd90_plus' },
      { id: 'i3', invoiceNo: 'HV-INV-202610-0024', payer: 'Hookka', invoiceDate: '2026-10-12', dueDate: null, amount: 63440, description: null, age: 3, bucket: 'd0_30' },
    ],
    byPayer: [],
    totals: { buckets: { d0_30: 63440, d31_60: 205.66, d61_90: 0, d90_plus: 1000 }, total: 64645.66, count: 3 },
  }

  it('heads with what is owed to HV as at the day, a card per age, each invoice opening in the app', () => {
    const m = debtorModel(view, '2026-10-15', false)
    expect(m.hero).toEqual({ value: 'RM 64,645.66', label: 'Owed to HV · as at 15 Oct 2026' })
    expect(m.chip).toBeNull()
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['0–30 days', '1 invoice', 'RM 63,440.00'],
      ['31–60 days', '1 invoice', 'RM 205.66'],
      ['61–90 days', '0 invoices', 'RM 0.00'],
      ['90+ days', '1 invoice', 'RM 1,000.00'],
    ])
    expect(m.cards[3].groups[0].lines[0]).toEqual({ key: 'i2', label: 'Carres', sub: 'HV-INV-202607-0001 · 106 days', value: '1,000.00', tone: 'out', open: { hub: 'invoices', id: 'i2' } })
    expect(m.cards[1].groups[0].lines[0].tone).toBeNull()
  })

  it('a past day says what it lists is unpaid as of today', () => {
    expect(debtorModel(view, '2026-09-30', true).chip).toBe('Unpaid as of today')
  })
})

describe('loanModel', () => {
  const side = (over: Partial<MonitorSide>): MonitorSide => ({
    due: [],
    dueTotal: { thisMonth: 0, m1: 0, m2: 0, m3: 0, m4: 0, m5plus: 0, total: 0 } as unknown as MonitorSide['dueTotal'],
    dueDaysTotal: { notDue: 0, d30: 0, d90: 0, d90plus: 0, total: 0 },
    scheduled: [],
    scheduledTotal: 0,
    noTerm: [],
    noTermTotal: 0,
    grandTotal: 0,
    ...over,
  })
  const data: LoanMonitorData = {
    currentYM: '2026-10',
    collect: side({
      due: [
        { key: 'l1', counterparty: 'Carres (CAR)', detail: '12 × 10,333.33', source: 'King', buckets: {} as never, days: { notDue: 0, d30: 10333.33, d90: 20666.66, d90plus: 0, total: 30999.99 } },
        { key: 'l2', counterparty: '2990', detail: '3 × 34,666.67', source: null, buckets: {} as never, days: { notDue: 0, d30: 0, d90: 0, d90plus: 104000, total: 104000 } },
      ],
      dueDaysTotal: { notDue: 0, d30: 10333.33, d90: 20666.66, d90plus: 104000, total: 134999.99 },
      scheduled: [{ key: 'l1', counterparty: 'Carres (CAR)', detail: '12 months', source: 'King', outstanding: 91666.67, startLabel: 'Apr 2026' }],
      scheduledTotal: 91666.67,
      noTerm: [{ key: 'l3', counterparty: 'CMI', detail: 'no fixed term', source: null, outstanding: 55540.08, startLabel: '' }],
      noTermTotal: 55540.08,
      grandTotal: 147206.75,
    }),
    repay: side({
      due: [{ key: 's1', counterparty: 'Chai Meng Keat (MK)', detail: '60 × 1,733.33', source: null, buckets: {} as never, days: { notDue: 0, d30: 1733.33, d90: 0, d90plus: 0, total: 1733.33 } }],
      dueDaysTotal: { notDue: 0, d30: 1733.33, d90: 0, d90plus: 0, total: 1733.33 },
      grandTotal: 63996,
    }),
  }

  it('heads with the loans outstanding over the days late, the lenders owed and the open balances', () => {
    const m = loanModel(data, '2026-10-15')
    expect(m.hero).toEqual({ value: 'RM 147,206.75', label: 'Loans outstanding · as at 15 Oct 2026' })
    expect(m.cards.map((c) => [c.label, c.sub, c.value])).toEqual([
      ['Not due', '0 loans', 'RM 0.00'],
      ['1–30 days', '1 loan', 'RM 10,333.33'],
      ['31–90 days', '1 loan', 'RM 20,666.66'],
      ['90+ days', '1 loan', 'RM 104,000.00'],
      ['To repay · Fund IN', '1 lender', 'RM 1,733.33'],
      ['Outstanding · to collect', '2 positions', 'RM 147,206.75'],
      ['Outstanding · to repay', '0 positions', 'RM 63,996.00'],
    ])
  })

  it('a line opens its deal — a borrower’s loan, a lender’s fund source', () => {
    const m = loanModel(data, '2026-10-15')
    expect(m.cards[1].groups[0].lines).toEqual([{ key: 'l1', label: 'Carres (CAR)', sub: 'SC King · 12 × 10,333.33', value: '10,333.33', open: { hub: 'fund-out', id: 'l1' } }])
    expect(m.cards[4].groups[0].lines[0].open).toEqual({ hub: 'fund-in', id: 's1' })
    expect(m.cards[5].groups.map((g) => [g.title, g.count, g.lines.length])).toEqual([
      ['Fixed schedule', 'RM 91,666.67', 1],
      ['No fixed term / compounding', 'RM 55,540.08', 1],
    ])
    expect(m.cards[5].groups[0].lines[0].sub).toBe('SC King · 12 months · starts Apr 2026')
  })
})
