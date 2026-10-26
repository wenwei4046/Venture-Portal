import type { createClient } from '@/lib/supabase/server'
import type { User } from '@/types'
import { listsPayrollByPerson } from '@/lib/roles'
import {
  applyGlRefs,
  buildCashFlow,
  buildPnl,
  fetchAllJournalLines,
  fetchCoaAccounts,
  fetchGlRefs,
  monthPeriod,
  type AccountNode,
  type ReportSection,
} from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { fetchInterBillingCashFlow, interBillTransferAccount, payrollCustodyAccount } from '@/lib/inter-billing-cash-flow'
import { EMPTY_PERIOD } from '@/lib/monthly-matrix'
import { sheetTxnsOf, type SheetTxn } from '@/lib/report-sheet'
import { segmentFilterFor } from '../_components/report-segments'

// A month-by-month report's row, opened (2026-10-24 — the user: "monthly 也要能点开", and Monthly opens as A: the
// row lists its months, a month its lines): the row's journal lines over the report's months, read as the report
// reads them — the P&L with inter-billing eliminated when every segment is shown, the Cash Flow (and Receipt &
// Payment, the same cash) with the bridge lines for one segment — and as the single month's drill-down reads them:
// each line's document and party, the salary lines by department for whoever reads payroll that way.

type Client = Awaited<ReturnType<typeof createClient>>

export interface MonthlyDrillAsk {
  /** pnl = Monthly P&L; cash-flow = Monthly Cash Flow and Monthly Receipt & Payment (the same cash rows). */
  report: 'pnl' | 'cash-flow'
  /** The segment the page shows ('' = every segment, consolidated). */
  segment: string
  /** The sheet's first and last months, 'YYYY-MM'. */
  from: string
  to: string
  /** The row's account. */
  code: string
  /** A cash row's side; null on the P&L. */
  side: 'in' | 'out' | null
}

const MONTH = /^\d{4}-\d{2}$/

const findLeaf = (sections: ReportSection[], code: string): AccountNode | null => {
  const walk = (nodes: AccountNode[]): AccountNode | null => {
    for (const n of nodes) {
      if (n.code === code && n.children.length === 0) return n
      const hit = walk(n.children)
      if (hit) return hit
    }
    return null
  }
  for (const s of sections) {
    const hit = walk(s.nodes)
    if (hit) return hit
  }
  return null
}

/** The row's lines over the months asked, oldest first; none for an ask that names no real row. */
export async function readMonthlyDrill(supabase: Client, user: User, ask: MonthlyDrillAsk): Promise<SheetTxn[]> {
  if (!MONTH.test(ask.from) || !MONTH.test(ask.to) || ask.from > ask.to || !ask.code) return []
  const period = { from: `${ask.from}-01`, to: monthPeriod(ask.to).to }
  const segment = segmentFilterFor(ask.segment)
  const consolidated = !ask.segment
  const rowKey = `${ask.side ?? 'pnl'}:${ask.code}`

  if (ask.report === 'pnl') {
    const [rawLines, accounts, glRefs, elim] = await Promise.all([
      fetchAllJournalLines(supabase),
      fetchCoaAccounts(supabase),
      // Salary lines by department for whoever reads payroll that way (2026-10-13).
      fetchGlRefs(supabase, { payrollByPerson: listsPayrollByPerson(user) }),
      consolidated ? fetchInterBillingElimination(supabase) : Promise.resolve(null),
    ])
    let lines = applyGlRefs(rawLines, glRefs)
    if (elim) lines = eliminateInterBilling(lines, elim)
    const pnl = buildPnl(lines, accounts, { current: period, previous: EMPTY_PERIOD, segment })
    const node = findLeaf([pnl.revenue, pnl.cost, pnl.otherIncome, pnl.expense], ask.code)
    return node ? sheetTxnsOf(rowKey, node.txns) : []
  }

  if (ask.side !== 'in' && ask.side !== 'out') return []
  // bank GL codes via RPC — codes only, no balances; sent once, awaited twice (the bridge needs them too).
  const bankCodesRead = Promise.resolve(supabase.rpc('bank_gl_codes' as never)).then(
    ({ data: banks }) => new Set((banks ?? []) as unknown as string[]),
  )
  const [rawLines, accounts, glRefs, bankCodes, ib] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    fetchGlRefs(supabase, { payrollByPerson: listsPayrollByPerson(user) }),
    bankCodesRead,
    // The internal-transfer bridge: one segment only — it cancels across segments (the statement's rule).
    consolidated ? null : fetchInterBillingCashFlow(supabase, bankCodesRead),
  ])
  const lines = [...applyGlRefs(rawLines, glRefs), ...(ib ? ib.lines : [])]
  const cf = buildCashFlow(lines, [...accounts, interBillTransferAccount, payrollCustodyAccount], { current: period, previous: EMPTY_PERIOD, segment }, bankCodes)
  const leaf = (ask.side === 'in' ? cf.inflowLeaves : cf.outflowLeaves).find((l) => l.code === ask.code)
  return leaf ? sheetTxnsOf(rowKey, [...leaf.txns].sort((a, b) => a.date.localeCompare(b.date))) : []
}
