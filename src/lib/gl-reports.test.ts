import { describe, it, expect } from 'vitest'
import {
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
