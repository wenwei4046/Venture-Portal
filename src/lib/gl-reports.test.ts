import { describe, it, expect } from 'vitest'
import {
  applyGlRefs,
  foldPayrollGlLines,
  buildPnl,
  buildBalanceSheet,
  buildCashFlow,
  monthPeriod,
  prevMonth,
  type GlLine,
  type CoaAccount,
  type ReportFilter,
} from './gl-reports'

// ─── Synthetic ledger ─────────────────────────────────────────────────────────
// May 2026:  cash sale 1,000 · expense 200
// June 2026: cash sale 1,500 · COGS 300 · loan in 5,000 · interest 50
//            · bank↔bank transfer 100 (must cancel out of the cash flow)
//            · loan disbursed 500 to 3051 (child of header 3020)

const ACCOUNTS: CoaAccount[] = [
  { code: '1000', name: 'Capital', type: 'equity', parent_code: null, cash_flow_category: 'financing' },
  { code: '3000', name: 'Bank HL', type: 'asset', parent_code: null, cash_flow_category: 'operating' },
  { code: '3010', name: 'Bank Alliance', type: 'asset', parent_code: null, cash_flow_category: 'operating' },
  { code: '3020', name: 'Loans Receivable', type: 'asset', parent_code: null, cash_flow_category: 'investing' },
  { code: '3051', name: 'Due from Carres', type: 'asset', parent_code: '3020', cash_flow_category: 'investing' },
  { code: '4000', name: 'Loan Payable', type: 'liability', parent_code: null, cash_flow_category: 'financing' },
  { code: '5000', name: 'Service Revenue', type: 'revenue', parent_code: null, cash_flow_category: 'operating' },
  { code: '6000', name: 'COGS', type: 'cost', parent_code: null, cash_flow_category: 'operating' },
  { code: '7000', name: 'Interest Income', type: 'other_income', parent_code: null, cash_flow_category: 'operating' },
  { code: '9000', name: 'G&A Expense', type: 'expense', parent_code: null, cash_flow_category: 'operating' },
]

const r2 = (n: number) => Math.round(n * 100) / 100

let seq = 0
function entry(date: string, legs: Array<[string, number, number]>, segment = 'corporate'): GlLine[] {
  const id = `e${++seq}`
  return legs.map(([code, debit, credit]) => ({
    account_code: code,
    debit,
    credit,
    description: null,
    entry_id: id,
    date,
    entry_no: `JE-${id}`,
    entry_description: `entry ${id}`,
    segment,
    ref_type: null,
    ref_id: null,
  }))
}

const LINES: GlLine[] = [
  ...entry('2026-05-10', [['3000', 1000, 0], ['5000', 0, 1000]]),
  ...entry('2026-05-15', [['9000', 200, 0], ['3000', 0, 200]]),
  ...entry('2026-06-05', [['3000', 1500, 0], ['5000', 0, 1500]]),
  ...entry('2026-06-08', [['6000', 300, 0], ['3000', 0, 300]]),
  ...entry('2026-06-12', [['3000', 5000, 0], ['4000', 0, 5000]]),
  ...entry('2026-06-20', [['3000', 50, 0], ['7000', 0, 50]], 'treasury'),
  ...entry('2026-06-25', [['3010', 100, 0], ['3000', 0, 100]]), // internal transfer
  ...entry('2026-06-28', [['3051', 500, 0], ['3000', 0, 500]]), // loan disbursed
]

const FILTER: ReportFilter = {
  current: monthPeriod('2026-06'),
  previous: monthPeriod('2026-05'),
}

const BANKS = new Set(['3000', '3010'])

describe('buildPnl', () => {
  const pnl = buildPnl(LINES, ACCOUNTS, FILTER)

  it('computes revenue / cost / other income for both periods', () => {
    expect(pnl.revenue.current).toBe(1500)
    expect(pnl.revenue.previous).toBe(1000)
    expect(pnl.cost.current).toBe(300)
    expect(pnl.otherIncome.current).toBe(50)
    expect(pnl.expense.current).toBe(0)
    expect(pnl.expense.previous).toBe(200)
  })

  it('derives gross profit and net income', () => {
    expect(pnl.grossProfit.current).toBe(1200)
    expect(pnl.netIncome.current).toBe(1250)
    expect(pnl.netIncome.previous).toBe(800)
  })

  it('collects inline transactions for the current period', () => {
    const rev = pnl.revenue.nodes.find((n) => n.code === '5000')
    expect(rev?.txns).toHaveLength(1)
    expect(rev?.txns[0].amount).toBe(1500)
  })

  // 2026-10-24 — the drill-down's ledger: each line's own debit and credit, and the entry's other side.
  it('gives each drill-down line its debit, credit and the entry’s other side', () => {
    const [sale] = pnl.revenue.nodes.find((n) => n.code === '5000')!.txns
    expect(sale).toMatchObject({ debit: 0, credit: 1500, otherSide: '3000 · Bank HL', refNo: null })
    // An entry with more than one other account names the largest, and counts the rest.
    const split = [...LINES, ...entry('2026-06-26', [['9000', 1000, 0], ['3000', 0, 600], ['4000', 0, 400]])]
    const [fee] = buildPnl(split, ACCOUNTS, FILTER).expense.nodes.find((n) => n.code === '9000')!.txns
    expect(fee).toMatchObject({ debit: 1000, credit: 0, otherSide: '3000 · Bank HL +1' })
  })

  it('respects the segment filter', () => {
    const treasuryOnly = buildPnl(LINES, ACCOUNTS, { ...FILTER, segment: 'treasury' })
    expect(treasuryOnly.otherIncome.current).toBe(50)
    expect(treasuryOnly.revenue.current).toBe(0)
  })
})

describe('buildBalanceSheet', () => {
  const bs = buildBalanceSheet(LINES, ACCOUNTS, FILTER)

  it('rolls a child account up into its header (3051 under 3020)', () => {
    const header = bs.assets.nodes.find((n) => n.code === '3020')
    expect(header).toBeTruthy()
    expect(header?.children.map((c) => c.code)).toEqual(['3051'])
    expect(header?.current).toBe(500)
  })

  it('balances to the cent: Assets = Liabilities + Equity + earnings', () => {
    // Banks 6,450 + 100 + receivable 500 = 7,050 assets
    expect(bs.totalAssets.current).toBe(7050)
    expect(bs.liabilities.current).toBe(5000)
    expect(bs.earnings.current).toBe(2050) // 800 (May) + 1,250 (June)
    expect(bs.check.current).toBe(0)
    expect(bs.check.previous).toBe(0)
  })
})

describe('buildCashFlow', () => {
  const cf = buildCashFlow(LINES, ACCOUNTS, FILTER, BANKS)

  it('categorises counter accounts by cash_flow_category', () => {
    expect(cf.operating.current).toBe(1250) // +1,500 sale − 300 COGS + 50 interest
    expect(cf.financing.current).toBe(5000) // loan received
    expect(cf.investing.current).toBe(-500) // loan disbursed to 3051
  })

  it('drops bank↔bank internal transfers', () => {
    const all = [...cf.operating.nodes, ...cf.investing.nodes, ...cf.financing.nodes]
    expect(all.find((n) => n.code === '3010')).toBeUndefined()
  })

  it('reconciles opening + net change = closing', () => {
    expect(cf.openingCash.current).toBe(800) // May: 1,000 − 200
    expect(cf.netChange.current).toBe(5750)
    expect(cf.closingCash.current).toBe(6550)
    expect(cf.check.current).toBe(0)
    expect(cf.check.previous).toBe(0)
  })

  // 收钱先、出钱后 gross split (user 2026-07-30).
  it('splits inflows and outflows, and they still tie to net change', () => {
    expect(cf.inflow.current).toBe(6550) // 1,500 sale + 5,000 loan + 50 interest
    expect(cf.outflow.current).toBe(-800) // 300 COGS + 500 loan disbursed
    expect(r2(cf.inflow.current + cf.outflow.current)).toBe(cf.netChange.current)
  })

  it('lists an account that both received and paid on BOTH sides, gross', () => {
    // 5000 takes a 400 refund out in the same month as its 1,500 sale.
    const withRefund = [...LINES, ...entry('2026-06-27', [['5000', 400, 0], ['3000', 0, 400]])]
    const cf2 = buildCashFlow(withRefund, ACCOUNTS, FILTER, BANKS)
    expect(cf2.inflow.nodes.find((n) => n.code === '5000')?.current).toBe(1500)
    expect(cf2.outflow.nodes.find((n) => n.code === '5000')?.current).toBe(-400)
    // Net still nets: the O/I/F view keeps showing 5000 once, at 1,100.
    expect(cf2.operating.nodes.find((n) => n.code === '5000')?.current).toBe(1100)
    expect(r2(cf2.inflow.current + cf2.outflow.current)).toBe(cf2.netChange.current)
  })

  it('nests accounts under their COA parent on each side', () => {
    // 3051 (Due from Carres) hangs under the 3020 header — the outflow section
    // must show the header with the leaf inside it, not a flat 3051 row.
    const header = cf.outflow.nodes.find((n) => n.code === '3020')
    expect(header).toBeDefined()
    expect(header!.current).toBe(-500) // rolled up from its child
    expect(header!.children.map((c) => c.code)).toEqual(['3051'])
    expect(cf.outflow.nodes.find((n) => n.code === '3051')).toBeUndefined()
  })

  it('gives each side its own drill-down transactions', () => {
    const withRefund = [...LINES, ...entry('2026-06-27', [['5000', 400, 0], ['3000', 0, 400]])]
    const cf2 = buildCashFlow(withRefund, ACCOUNTS, FILTER, BANKS)
    expect(cf2.inflow.nodes.find((n) => n.code === '5000')?.txns.map((t) => t.amount)).toEqual([1500])
    expect(cf2.outflow.nodes.find((n) => n.code === '5000')?.txns.map((t) => t.amount)).toEqual([-400])
  })

  // 2026-10-24 — the drill-down's Debit / Credit on the cash rows: as far as the cash went, so they add up to the row.
  it('writes a cash line’s debit and credit at the cash it moved', () => {
    const [sale] = cf.inflow.nodes.find((n) => n.code === '5000')!.txns
    expect(sale).toMatchObject({ amount: 1500, debit: 0, credit: 1500, otherSide: '3000 · Bank HL' })
    // 1,000 of fees, 600 paid from the bank and 400 left owing: the bank's 600 shared out over the two.
    const split = [...LINES, ...entry('2026-06-26', [['9000', 1000, 0], ['3000', 0, 600], ['4000', 0, 400]])]
    const cf2 = buildCashFlow(split, ACCOUNTS, FILTER, BANKS)
    const [fee] = cf2.outflow.nodes.find((n) => n.code === '9000')!.txns
    expect(fee).toMatchObject({ amount: -428.57, debit: 428.57, credit: 0, otherSide: '3000 · Bank HL +1' })
    const owing = cf2.outflow.nodes.find((n) => n.code === '4000')!.txns.find((t) => t.date === '2026-06-26')!
    expect(owing).toMatchObject({ amount: -171.43, debit: 0, credit: 171.43 })
  })
})

describe('gl-report-blocks flatten (export path)', async () => {
  const { pnlBlocks, balanceSheetBlocks, flattenGlReport } = await import('./gl-report-blocks')

  it('flattens P&L blocks with section breaks + summary rows', () => {
    const pnl = buildPnl(LINES, ACCOUNTS, FILTER)
    const flat = flattenGlReport(pnlBlocks(pnl), { pctBase: pnl.revenue.current })
    // Sections in statement order.
    expect(flat.sectionBreaks.map((b) => b.title)).toEqual([
      'Revenue', 'Cost of Goods Sold', 'Other Income', 'Expenses',
    ])
    // Summary rows present with margin subs folded into the label.
    const labels = flat.rows.map((r) => r[0])
    expect(labels).toContain('Total Revenue')
    expect(labels.some((l) => String(l).startsWith('Gross Profit ('))).toBe(true)
    expect(labels.some((l) => String(l).startsWith('Net Income / (Loss) ('))).toBe(true)
    // % Rev column on every row.
    expect(flat.rows[0]).toHaveLength(5)
  })

  it('indents child accounts under their header in the Balance Sheet', () => {
    const bs = buildBalanceSheet(LINES, ACCOUNTS, FILTER)
    const flat = flattenGlReport(balanceSheetBlocks(bs), {})
    const child = flat.rows.find((r) => String(r[0]).includes('3051'))
    expect(String(child?.[0]).startsWith('    ')).toBe(true)
    expect(flat.rows[0]).toHaveLength(4) // no % Rev column
  })
})

describe('applyGlRefs', () => {
  const refs = {
    invoices: new Map([
      ['inv-1', { invoice_no: 'HV-INV-202605-0044', description: "Salary - HR - May'26", billTo: 'HC' }],
    ]),
    voucherPayees: new Map([['pv-1', 'TNB Berhad']]),
  }

  // 2026-10-26: the line keeps its own words; the invoice's stand beside them (lib/line-words picks).
  it('enriches invoice JEs with the invoice no, its words and the bill-to party', () => {
    const line: GlLine = {
      ...entry('2026-06-01', [['5000', 0, 100]])[0],
      ref_type: 'invoice',
      ref_id: 'inv-1',
      description: 'Service billing revenue recognised',
    }
    const [enriched] = applyGlRefs([line], refs)
    expect(enriched).toMatchObject({
      description: 'Service billing revenue recognised',
      doc_text: "Salary - HR - May'26",
      ref_no: 'HV-INV-202605-0044',
      party: 'HC',
    })
  })

  it('enriches voucher JEs with the payee, leaving the description alone', () => {
    const line: GlLine = {
      ...entry('2026-06-01', [['9091', 100, 0]])[0],
      ref_type: 'payment_voucher',
      ref_id: 'pv-1',
      description: 'PV HV-PV-202606-0001: Utilities',
    }
    const [enriched] = applyGlRefs([line], refs)
    expect(enriched.description).toBe('PV HV-PV-202606-0001: Utilities')
    expect(enriched.party).toBe('TNB Berhad')
  })

  it('leaves unmatched lines untouched', () => {
    const line: GlLine = {
      ...entry('2026-06-01', [['9000', 100, 0]])[0],
      ref_type: 'repayment',
      ref_id: 'x',
    }
    expect(applyGlRefs([line], refs)[0].party).toBeUndefined()
  })

  // 2026-10-24 — the drill-down's Ref. 2: the source document's number; an invoice's words stand without it.
  it('carries each line’s document number to the drill-down', () => {
    const withNos = { ...refs, voucherNos: new Map([['pv-1', 'HV-PV-202606-0001']]), creditNoteNos: new Map([['cn-1', 'HV-CN-202606-0002']]) }
    const sale = entry('2026-06-02', [['3000', 100, 0], ['5000', 0, 100]]).map((l) => ({ ...l, ref_type: 'invoice', ref_id: 'inv-1' }))
    const paid = entry('2026-06-03', [['9000', 100, 0], ['3000', 0, 100]]).map((l) => ({ ...l, ref_type: 'payment_voucher', ref_id: 'pv-1' }))
    const credited = entry('2026-06-04', [['5000', 30, 0], ['3000', 0, 30]]).map((l) => ({ ...l, ref_type: 'credit_note', ref_id: 'cn-1' }))
    const lines = applyGlRefs([...sale, ...paid, ...credited], withNos)
    expect(lines.map((l) => l.ref_no)).toEqual([
      'HV-INV-202605-0044', 'HV-INV-202605-0044', 'HV-PV-202606-0001', 'HV-PV-202606-0001', 'HV-CN-202606-0002', 'HV-CN-202606-0002',
    ])
    const pnl = buildPnl(lines, ACCOUNTS, FILTER)
    const revenue = pnl.revenue.nodes.find((n) => n.code === '5000')!.txns
    expect(revenue.find((t) => t.date === '2026-06-02')).toMatchObject({ description: "Salary - HR - May'26", party: 'HC', refNo: 'HV-INV-202605-0044' })
    expect(revenue.find((t) => t.date === '2026-06-04')).toMatchObject({ refNo: 'HV-CN-202606-0002' })
    expect(pnl.expense.nodes.find((n) => n.code === '9000')!.txns[0]).toMatchObject({ party: 'TNB Berhad', refNo: 'HV-PV-202606-0001' })
  })
})

// 2026-10-13 — the user: "就算能看到 pv，应该也是看到 by 整个部门才对".
describe('foldPayrollGlLines', () => {
  const salary = (id: string, date: string, amount: number, refType = 'payment_voucher', segment = 'hr'): GlLine[] => [
    { account_code: '4070', debit: amount, credit: 0, description: `other - Person ${id} (4070)`, entry_id: `e-${id}`, date, entry_no: `JE-${id}`, entry_description: `PV HV-PV-${id}: Payroll net Sep 2026 — Person ${id} (Marketing)`, segment, ref_type: refType, ref_id: `pv-${id}`, party: `Person ${id}` },
    { account_code: '3010', debit: 0, credit: amount, description: `Bank payment - HV-PV-${id}`, entry_id: `e-${id}`, date, entry_no: `JE-${id}`, entry_description: `PV HV-PV-${id}: Payroll net Sep 2026 — Person ${id} (Marketing)`, segment, ref_type: refType, ref_id: `pv-${id}`, party: `Person ${id}` },
  ]
  const fold = { label: 'Payroll net Sep 2026', department: 'Marketing' }
  const byVoucher = new Map([['pv-1', fold], ['pv-2', fold], ['pv-3', fold], ['pv-4', fold]])

  it('a day’s vouchers of one batch and department stand as one entry, one line per account', () => {
    const out = foldPayrollGlLines([...salary('1', '2026-10-06', 100), ...salary('2', '2026-10-06', 250.5)], byVoucher)
    expect(out.map((l) => [l.entry_id, l.account_code, l.debit, l.credit, l.entry_description, l.party, l.entry_no])).toEqual([
      ['payroll:2026-10-06|hr|Payroll net Sep 2026|Marketing', '4070', 350.5, 0, 'Payroll net Sep 2026 · Marketing · 2 vouchers', 'Marketing', null],
      ['payroll:2026-10-06|hr|Payroll net Sep 2026|Marketing', '3010', 0, 350.5, 'Payroll net Sep 2026 · Marketing · 2 vouchers', 'Marketing', null],
    ])
    expect(JSON.stringify(out)).not.toMatch(/Person|HV-PV-/)
  })

  it('keeps a day apart from the next, a segment from another, and a void from what it voids', () => {
    const out = foldPayrollGlLines([
      ...salary('1', '2026-10-06', 100),
      ...salary('2', '2026-10-07', 200),
      ...salary('3', '2026-10-06', 300, 'payment_voucher', 'director'),
      ...salary('4', '2026-10-06', 400, 'payment_voucher_void'),
    ], byVoucher)
    expect(new Set(out.map((l) => l.entry_id)).size).toBe(4)
    expect(out.filter((l) => l.account_code === '4070').map((l) => l.debit)).toEqual([100, 200, 300, 400])
  })

  it('every other line passes through as it was', () => {
    const rent: GlLine = { ...entry('2026-10-06', [['9000', 900, 0]])[0], ref_type: 'payment_voucher', ref_id: 'pv-rent' }
    expect(foldPayrollGlLines([rent], byVoucher)).toEqual([rent])
  })
})

describe('flattenGlReport withCompare=false (single-month export)', async () => {
  const { pnlBlocks, flattenGlReport } = await import('./gl-report-blocks')
  it('drops the compare and Δ% columns', () => {
    const pnl = buildPnl(LINES, ACCOUNTS, FILTER)
    const flat = flattenGlReport(pnlBlocks(pnl), { pctBase: pnl.revenue.current, withCompare: false })
    expect(flat.rows[0]).toHaveLength(3) // Account | current | % Rev
  })
})

describe('period helpers', () => {
  it('monthPeriod covers the full month', () => {
    expect(monthPeriod('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(monthPeriod('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('prevMonth wraps the year boundary', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(prevMonth('2026-06')).toBe('2026-05')
  })
})
