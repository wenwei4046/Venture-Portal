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
import { EMPTY_PERIOD, r2 } from '@/lib/monthly-matrix'
import { drillRowKey, sheetTxnsOf, type SheetTxn } from '@/lib/report-sheet'
import { segmentFilterFor } from '../_components/report-segments'

// A month-by-month report's rows, opened (2026-10-24 — the user: "monthly 也要能点开"; 2026-10-26, the mockup's fifth
// round: each line a row of the sheet, its amount under its month, and L4 opening them all): the rows' journal lines
// over the report's months, read as the report reads them — the P&L with inter-billing eliminated when every
// segment is shown, the Cash Flow (and Receipt & Payment, the same cash) with the bridge lines for one segment — and
// as the single month's drill-down reads them: what each line was, who with, its document, the salary lines by
// department for whoever reads payroll that way. One read for however many rows are asked (L4 asks for all).

type Client = Awaited<ReturnType<typeof createClient>>

export interface MonthlyDrillRow {
  /** The row's account. */
  code: string
  /** A cash row's side; null on the P&L. */
  side: 'in' | 'out' | null
}

export interface MonthlyDrillAsk {
  /** pnl = Monthly P&L; cash-flow = Monthly Cash Flow and Monthly Receipt & Payment (the same cash rows). */
  report: 'pnl' | 'cash-flow'
  /** The segment the page shows ('' = every segment, consolidated). */
  segment: string
  /** The sheet's first and last months, 'YYYY-MM'. */
  from: string
  to: string
  /** The rows to read: the one opened, or every one on show (L4). */
  rows: MonthlyDrillRow[]
}

/** As many rows as a sheet has, never more. */
const MAX_ROWS = 600

/** An ask as a page sent it, made what it says: a known report, strings, at most a sheet's rows. */
export function cleanDrillAsk(ask: MonthlyDrillAsk): MonthlyDrillAsk {
  return {
    report: ask.report === 'cash-flow' ? 'cash-flow' : 'pnl',
    segment: typeof ask.segment === 'string' ? ask.segment : '',
    from: String(ask.from ?? ''),
    to: String(ask.to ?? ''),
    rows: (Array.isArray(ask.rows) ? ask.rows : []).slice(0, MAX_ROWS).map((r) => ({
      code: String(r?.code ?? '').slice(0, 40),
      side: r?.side === 'in' || r?.side === 'out' ? r.side : null,
    })),
  }
}

/** A read that failed, in words for the sheet. */
export function drillFailure(e: unknown): { ok: false; reason: string } {
  return { ok: false, reason: e instanceof Error && e.message ? e.message : 'The lines could not be read just now. Try again.' }
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

/**
 * Each row's lines over the months asked, filed by `drillRowKey`, oldest first, each signed as its row reads on
 * Reports — the P&L credit-positive (revenue +, costs −), the cash as it moved — so a month's lines add up to its
 * figure. A row that names nothing real gets none; an ask for no real row reads nothing.
 */
export async function readMonthlyDrill(supabase: Client, user: User, ask: MonthlyDrillAsk): Promise<Record<string, SheetTxn[]>> {
  const rows = ask.rows.filter((r) => !!r.code && (ask.report === 'pnl' ? r.side === null : r.side === 'in' || r.side === 'out'))
  const out: Record<string, SheetTxn[]> = Object.fromEntries(rows.map((r) => [drillRowKey(r.code, r.side), [] as SheetTxn[]]))
  if (!MONTH.test(ask.from) || !MONTH.test(ask.to) || ask.from > ask.to || rows.length === 0) return out
  const period = { from: `${ask.from}-01`, to: monthPeriod(ask.to).to }
  const segment = segmentFilterFor(ask.segment)
  const consolidated = !ask.segment

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
    const sections = [pnl.revenue, pnl.cost, pnl.otherIncome, pnl.expense]
    for (const r of rows) {
      const key = drillRowKey(r.code, r.side)
      const node = findLeaf(sections, r.code)
      // The P&L sheet reads every account credit-positive (lib/pnl-custom): its lines with it.
      if (node) out[key] = sheetTxnsOf(key, node.txns).map((t) => ({ ...t, value: r2(t.credit - t.debit) }))
    }
    return out
  }

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
  for (const r of rows) {
    const key = drillRowKey(r.code, r.side)
    const leaf = (r.side === 'in' ? cf.inflowLeaves : cf.outflowLeaves).find((l) => l.code === r.code)
    if (leaf) out[key] = sheetTxnsOf(key, [...leaf.txns].sort((a, b) => a.date.localeCompare(b.date)))
  }
  return out
}
