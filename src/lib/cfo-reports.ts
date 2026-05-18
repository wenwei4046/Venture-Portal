// CFO-view report helpers — classification-driven aggregation.
//
// The Income Statement / Cash Flow / Balance Sheet are driven by:
//   - chart_of_accounts.type  (8-value account_type enum)
//     → decides WHICH statement / section a line belongs to:
//       revenue → P&L revenue
//       cost → P&L cost  (NEW: Gross Profit = Revenue − Cost)
//       other_income → P&L other income
//       expense → P&L operating expense
//       asset / fixed_asset / liability / equity → Balance Sheet movement
//   - chart_of_accounts.cash_flow_category (operating | investing | financing)
//     → decides WHICH section of the Cash Flow Statement a cash line lands in
//   - payment_voucher_sources.pool → decides WHICH pool the money moved through
//
// Treasury *interest* (GL revenue/expense codes) is folded into the Venture
// Pool's P&L; the cash effect is captured via the PV source rows themselves.
//
// The pure classification logic lives in `classifyRows` (testable without
// Supabase); the `fetch*` functions are thin wrappers that gather rows and
// call it.

import type { SupabaseClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'
import { poolLabel, comparePools } from './pools'
import type { AccountType, CashFlowCategory } from './coa'
import { CASH_FLOW_CATEGORIES } from './coa'

const VENTURE_POOL = 'venture_pool'

// Named line-item codes used by the Balance Sheet snapshot. These mirror the
// seeded chart_of_accounts codes post-migration 238 (current asset range = 3xxx).
export const AR_CODE = '3030'
export const LOANS_RECEIVABLE_CODE = '3020'

// ────────────────────────────────────────────────────────────────────────────
// Raw input row shapes (what `classifyRows` consumes)
// ────────────────────────────────────────────────────────────────────────────

export interface RawPvSourceRow {
  voucherId: string
  voucherType: string // 'expense' | 'loan_disbursement' | 'loan_repayment' | 'internal_transfer' | ...
  direction: 'credit' | 'debit' // credit = money in, debit = money out
  pool: string // payment_voucher_sources.pool
  accountCode: string // payment_voucher_sources.account_code (post-mig 238 rename)
  accountName: string // chart_of_accounts.name
  accountType: AccountType // 8-value enum
  cashFlowCategory: CashFlowCategory // drives Op/Inv/Fin bucketing
  amount: number
}

export interface RawInvoiceRow {
  invoiceNo: string
  description: string // invoices.description, trimmed; '' when null/blank
  companyShortCode: string
  pool: string // derived from billing_mode (see INVOICE_BILLING_MODE_TO_POOL)
  amount: number // total_amount; counts as revenue inflow
  categoryCode: string // chart_of_accounts code (revenue account)
  categoryName: string // chart_of_accounts name; 'Uncategorised revenue' fallback
}

export interface RawTreasury {
  interestIncome: number // GL Interest Income net credit
  penaltyIncome: number // GL Penalty Income net credit
  interestExpense: number // GL Interest Expense net debit
  // COA codes treasury claims as its own — interest income / penalty income /
  // interest expense (and any children thereof). classifyRows skips PV
  // source rows pointing at these codes so the same JE isn't double-counted
  // both as a PV-derived P&L line AND as treasury.
  managedCodes: Set<string>
}

// Fund-IN doesn't create a payment_voucher (the PV system is the single exit
// point for money OUT only — see mig 50). To make deposits received show up
// as cash inflow + BS liability increase we surface fund_sources rows
// separately.
export interface RawFundSourceInflow {
  fundSourceId: string
  pool: string // target pool the funds went INTO — typically 'venture_pool'
  label: string // e.g. "Subsidiary deposit — CONTS"
  amount: number // positive principal received
}

// Loan-repayment principal received from subsidiaries. The interest portion
// is captured via the journal-derived treasury section; the principal portion
// reduces Loans Receivable (BS asset) and lands as a cash inflow.
export interface RawRepaymentPrincipalInflow {
  repaymentId: string
  pool: string // typically 'venture_pool' (loans live in Venture Pool)
  label: string // e.g. "Loan principal — CONTS"
  amount: number // positive principal portion received
}

export interface RawInterBillingExpenseRow {
  invoiceNo: string
  payingPool: string // dept_pool_hr, dept_pool_finance, etc.
  amount: number
}

export interface ClassifyInput {
  pvSources: RawPvSourceRow[]
  invoices: RawInvoiceRow[]
  treasury: RawTreasury
  fundSourceInflows?: RawFundSourceInflow[]
  repaymentPrincipalInflows?: RawRepaymentPrincipalInflow[]
  interBillingExpenses?: RawInterBillingExpenseRow[]
}

// ────────────────────────────────────────────────────────────────────────────
// Output shapes
// ────────────────────────────────────────────────────────────────────────────

export interface Line {
  label: string
  amount: number
}

export interface PoolPnl {
  pool: string
  poolLabel: string
  revenueGroups: RevenueGroup[]
  costLines: Line[]
  otherIncomeLines: Line[]
  expenseLines: Line[]
  revenue: number
  cost: number
  otherIncome: number
  expense: number
  grossProfit: number // = revenue - cost
  margin: number // = grossProfit + otherIncome - expense
}

export interface TreasuryBreakdown {
  interestIncome: number
  penaltyIncome: number
  interestExpense: number
  net: number
}

export interface IncomeStatement {
  pools: PoolPnl[]
  treasury: TreasuryBreakdown
  groupRevenue: number
  groupCost: number
  groupOtherIncome: number
  groupExpense: number
  groupGrossProfit: number // = groupRevenue - groupCost
  groupNetProfit: number // = groupGrossProfit + groupOtherIncome - groupExpense
}

export interface CashflowPoolBlock {
  pool: string
  poolLabel: string
  inflowLines: Line[]
  outflowLines: Line[]
  net: number
}

export interface CashflowSection {
  category: CashFlowCategory // 'operating' | 'investing' | 'financing'
  pools: CashflowPoolBlock[]
  net: number
}

export interface CashflowStatement {
  sections: CashflowSection[] // length 3, always [operating, investing, financing]
  netChange: number
}

export interface BalanceMovementLine {
  pool: string
  poolLabel: string
  label: string
  amount: number
}

export interface ClassifyOutput {
  income: IncomeStatement
  cashflow: CashflowStatement
  balanceMovements: BalanceMovementLine[]
}

// Pool-first pivot of the Cash Flow statement (department-segmented nav).
export {
  pivotCashflowByPool,
  type CashflowByPool,
  type CashflowByPoolBlock,
  type CashflowPoolSection,
} from './cfo-reports-pivot'

// ────────────────────────────────────────────────────────────────────────────
// Invoice billing_mode → pool map. Every billing mode resolves to a pool; an
// unknown billing mode defaults to the Venture Pool (never dropped).
// ────────────────────────────────────────────────────────────────────────────
export const INVOICE_BILLING_MODE_TO_POOL: Record<string, string> = {
  marketing_project: 'dept_pool_marketing',
  hr_attribution: 'dept_pool_hr',
  hr_pool_split: 'dept_pool_hr',
  finance_attribution: 'dept_pool_finance',
  director_office_attribution: 'dept_pool_director_office',
  // Bug fix 2026-05-14: was mistakenly mapped to dept_pool_director_office,
  // so director_attribution invoices landed in the wrong pool both at
  // settlement time and in P&L reports. Director Pool (1070) and
  // Director Office Pool (1060) are separate.
  director_attribution: 'dept_pool_director',
  fixed_split: VENTURE_POOL,
  non_billable: VENTURE_POOL,
}

export function invoicePoolForBillingMode(billingMode: string | null | undefined): string {
  if (billingMode && billingMode in INVOICE_BILLING_MODE_TO_POOL) {
    return INVOICE_BILLING_MODE_TO_POOL[billingMode]
  }
  return VENTURE_POOL
}

// ────────────────────────────────────────────────────────────────────────────
// Pure classification
// ────────────────────────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

// Per-pool accumulators. P&L slots: revenue, cost, otherIncome, expense.
// CFS slots: per-cash-flow-category inflow/outflow maps.
interface PoolAcc {
  revenue: Map<string, number>
  revenueInvoiceItems: RevenueInvoiceItem[]
  cost: Map<string, number>
  otherIncome: Map<string, number>
  expense: Map<string, number>
  // Per-CFS-category cash flows
  cfIn: Record<CashFlowCategory, Map<string, number>>
  cfOut: Record<CashFlowCategory, Map<string, number>>
}

function emptyPoolAcc(): PoolAcc {
  return {
    revenue: new Map(),
    revenueInvoiceItems: [],
    cost: new Map(),
    otherIncome: new Map(),
    expense: new Map(),
    cfIn: {
      operating: new Map(),
      investing: new Map(),
      financing: new Map(),
    },
    cfOut: {
      operating: new Map(),
      investing: new Map(),
      financing: new Map(),
    },
  }
}

function bump(m: Map<string, number>, key: string, delta: number): void {
  m.set(key, (m.get(key) ?? 0) + delta)
}

function linesFrom(m: Map<string, number>): Line[] {
  return Array.from(m.entries())
    .map(([label, amount]) => ({ label, amount: r2(amount) }))
    .filter((l) => l.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
}

export interface RevenueGroup {
  accountCode: string
  accountName: string
  subtotal: number
  items: Line[]
}

export interface RevenueInvoiceItem {
  accountCode: string
  accountName: string
  label: string
  amount: number
}

export function groupRevenueByAccount(input: {
  invoiceItems: RevenueInvoiceItem[]
  flatLines: Line[]
}): RevenueGroup[] {
  // Grouped by accountCode (falling back to accountName when the code is empty/unmapped — that bucket is the consistent 'Uncategorised revenue' / code ''). Code-first keying means distinct codes never merge even if they share a name, and the carried accountCode/accountName (taken from the first item of the key) is deterministic because the invoice query is ordered and every item under a non-empty-code key shares the same code.
  const byAccount = new Map<string, { accountCode: string; accountName: string; items: Line[] }>()
  for (const it of input.invoiceItems) {
    if (it.amount === 0) continue
    const key = it.accountCode || it.accountName
    let g = byAccount.get(key)
    if (!g) {
      g = { accountCode: it.accountCode, accountName: it.accountName, items: [] }
      byAccount.set(key, g)
    }
    g.items.push({ label: it.label, amount: r2(it.amount) })
  }
  const groups: RevenueGroup[] = [...byAccount.values()].map((g) => ({
    accountCode: g.accountCode,
    accountName: g.accountName,
    items: g.items.slice().sort((a, b) => b.amount - a.amount),
    subtotal: r2(g.items.reduce((s, i) => s + i.amount, 0)),
  }))
  for (const fl of input.flatLines) {
    if (fl.amount === 0) continue
    groups.push({
      accountCode: '',
      accountName: fl.label,
      subtotal: r2(fl.amount),
      items: [{ label: fl.label, amount: r2(fl.amount) }],
    })
  }
  return groups
    .filter((g) => g.subtotal !== 0)
    .sort((a, b) => b.subtotal - a.subtotal)
}

export function classifyRows(input: ClassifyInput): ClassifyOutput {
  const { pvSources, invoices, treasury } = input
  const fundSourceInflows = input.fundSourceInflows ?? []
  const repaymentPrincipalInflows = input.repaymentPrincipalInflows ?? []
  const interBillingExpenses = input.interBillingExpenses ?? []

  const pools = new Map<string, PoolAcc>()
  const acc = (pool: string): PoolAcc => {
    let p = pools.get(pool)
    if (!p) {
      p = emptyPoolAcc()
      pools.set(pool, p)
    }
    return p
  }

  const balanceMovements: Array<{ pool: string; label: string; amount: number }> = []
  const pushBalanceMovement = (pool: string, label: string, amount: number) => {
    balanceMovements.push({ pool, label, amount })
  }

  // ── 1+2: payment_voucher_sources rows ──
  for (const src of pvSources) {
    // Rule 1: skip internal_transfer vouchers entirely (bank-to-bank moves).
    if (src.voucherType === 'internal_transfer') continue
    // Rule 1b: treasury accounts (interest income / penalty income /
    // interest expense + any sub-accounts) are aggregated by gatherTreasury
    // straight from journal_lines. If a PV source row points at one of
    // those codes, classifyRows must skip it — otherwise the same 2,000
    // RM interest charge counts once as a PV-derived expense and once as
    // treasury, breaking A = L + E by the duplicated amount. Replaces the
    // older voucher_type-only skip (which only fired on
    // loan_repayment / loan_disbursement and silently double-counted
    // interest paid via a generic 'expense' voucher).
    if (treasury.managedCodes.has(src.accountCode)) continue
    // Rule 1c: on loan_repayment / loan_disbursement vouchers, also skip
    // any other P&L-typed source rows (defensive: pre-treasury-skip data
    // sometimes carried interest as a generic expense category not picked
    // up by the name match above).
    if (
      (src.voucherType === 'loan_repayment' || src.voucherType === 'loan_disbursement') &&
      (src.accountType === 'revenue' ||
        src.accountType === 'cost' ||
        src.accountType === 'other_income' ||
        src.accountType === 'expense')
    ) {
      continue
    }
    const amt = Number(src.amount ?? 0)
    if (amt === 0) continue
    const isCredit = src.direction === 'credit'
    const p = acc(src.pool)
    const label = src.accountName
    const cfCat = src.cashFlowCategory

    // Rule 1c: billing_payment vouchers settle an invoice. They carry up to
    // TWO source rows:
    //   - Receiving side (always): asset row (3030 AR) tagged with the
    //     receiver's pool. Revenue was already accrued at invoice issue;
    //     this row records AR collection only — operating cash inflow + BS
    //     asset decrease, NEVER P&L.
    //   - Paying side (inter-billing only, mig 253): expense row (9051-9055)
    //     tagged with the paying dept's pool. classifyRows treats the credit
    //     as a debit-in-the-paying-pool's-books — bumps that pool's expense
    //     and operating cash outflow. Without this branch, only the receiver
    //     saw revenue and group net profit was over-stated.
    //   - Any other type (revenue / liability / equity) is treated like AR
    //     collection — defensive: prevents double-counting if a future code
    //     path lands an unexpected type here.
    if (src.voucherType === 'billing_payment') {
      if (src.accountType === 'expense') {
        // Inter-billing paying side — CF only. P&L expense is recognised at
        // invoice issue date via the interBillingExpenses loop below (driven
        // by gatherInterBillingExpenses reading invoices.period_month). The
        // mirror PV source row exists solely to track the cash-flow timing
        // of settlement, keeping PNL (invoice date) and CF (settlement date)
        // on separate time axes as intended.
        if (isCredit) {
          bump(p.cfOut.operating, label, amt)
        } else {
          bump(p.cfIn.operating, label, amt)
        }
      } else if (isCredit) {
        // Receiving side / AR collection — operating cash inflow + BS AR down.
        bump(p.cfIn.operating, label, amt)
        pushBalanceMovement(src.pool, label, -amt)
      } else {
        // Refund of a billing_payment (uncommon): operating cash out, AR up.
        bump(p.cfOut.operating, label, amt)
        pushBalanceMovement(src.pool, label, amt)
      }
      continue
    }

    if (src.accountType === 'revenue') {
      const signed = isCredit ? amt : -amt
      bump(p.revenue, label, signed)
      if (isCredit) {
        bump(p.cfIn[cfCat], label, amt)
      } else {
        bump(p.cfOut[cfCat], label, amt)
      }
    } else if (src.accountType === 'cost') {
      const signed = isCredit ? -amt : amt
      bump(p.cost, label, signed)
      if (isCredit) {
        bump(p.cfIn[cfCat], label, amt)
      } else {
        bump(p.cfOut[cfCat], label, amt)
      }
    } else if (src.accountType === 'other_income') {
      const signed = isCredit ? amt : -amt
      bump(p.otherIncome, label, signed)
      if (isCredit) {
        bump(p.cfIn[cfCat], label, amt)
      } else {
        bump(p.cfOut[cfCat], label, amt)
      }
    } else if (src.accountType === 'expense') {
      const signed = isCredit ? -amt : amt
      bump(p.expense, label, signed)
      if (isCredit) {
        bump(p.cfIn[cfCat], label, amt)
      } else {
        bump(p.cfOut[cfCat], label, amt)
      }
    } else {
      // asset / fixed_asset / liability / equity row → Balance-Sheet movement
      // + Cash Flow only (no P&L). The cash side is bucketed by the account's
      // cash_flow_category (e.g. Loans Receivable → investing, Director Loan
      // payable → financing).
      //   credit → BS movement +amt, cash inflow in [cfCat]
      //   debit  → BS movement -amt, cash outflow in [cfCat]
      if (isCredit) {
        bump(p.cfIn[cfCat], label, amt)
        pushBalanceMovement(src.pool, label, amt)
      } else {
        bump(p.cfOut[cfCat], label, amt)
        pushBalanceMovement(src.pool, label, -amt)
      }
    }
  }

  // ── 3: invoices — accrued P&L revenue ONLY, not cash flow ──
  // Invoices are accrual events: revenue is recognised at issue time, but no
  // cash moves until the customer pays (handled via the billing_payment PV
  // branch above, which adds the operating cash inflow).
  for (const inv of invoices) {
    const amt = Number(inv.amount ?? 0)
    if (amt === 0) continue
    const p = acc(inv.pool)
    p.revenueInvoiceItems.push({
      accountCode: inv.categoryCode,
      accountName: inv.categoryName,
      label: inv.description
        ? `${inv.description} · ${inv.invoiceNo}`
        : `${inv.companyShortCode} · ${inv.invoiceNo}`,
      amount: amt,
    })
  }

  // ── 3a: inter-billing expenses — recognised at invoice date (symmetric with revenue) ──
  // The paying dept's expense is posted when the invoice is issued, matching
  // the receiving dept's revenue recognised in the invoices loop above. The
  // cash-flow effect (settlement date) is tracked separately via the mirror
  // billing_payment PV source row, keeping PNL and CF on independent time axes.
  for (const exp of interBillingExpenses) {
    const amt = Number(exp.amount ?? 0)
    if (amt === 0) continue
    const p = acc(exp.payingPool)
    bump(p.expense, `Inter-billing — ${exp.invoiceNo}`, amt)
  }

  // ── 3b: fund_sources deposits received — cash inflow + BS liability increase ──
  // Subsidiary deposits / director loans are financing inflows; HV owes the
  // depositor back the principal, so the BS movement is +amount.
  for (const fs of fundSourceInflows) {
    const amt = Number(fs.amount ?? 0)
    if (amt === 0) continue
    const p = acc(fs.pool)
    bump(p.cfIn.financing, fs.label, amt)
    pushBalanceMovement(fs.pool, fs.label, amt)
  }

  // ── 3c: loan principal received — cash inflow + BS asset decrease ──
  // Loans Receivable (asset, investing) drops by the principal portion
  // received. The interest portion is captured separately via the treasury
  // section.
  for (const rp of repaymentPrincipalInflows) {
    const amt = Number(rp.amount ?? 0)
    if (amt === 0) continue
    const p = acc(rp.pool)
    bump(p.cfIn.investing, rp.label, amt)
    pushBalanceMovement(rp.pool, rp.label, -amt)
  }

  // ── 4: treasury interest folded into the Venture Pool's P&L lines ──
  // The cash effect of interest is captured via the PV source rows themselves,
  // so we do NOT also add treasury to the cash flow — the journal-derived
  // treasury figure is for the P&L only.
  const interestIncome = r2(Number(treasury.interestIncome ?? 0))
  const penaltyIncome = r2(Number(treasury.penaltyIncome ?? 0))
  const interestExpense = r2(Number(treasury.interestExpense ?? 0))
  if (interestIncome !== 0 || penaltyIncome !== 0 || interestExpense !== 0) {
    const vp = acc(VENTURE_POOL)
    if (interestIncome !== 0) bump(vp.revenue, 'Interest income — Loans', interestIncome)
    if (penaltyIncome !== 0) bump(vp.revenue, 'Penalty income', penaltyIncome)
    if (interestExpense !== 0) bump(vp.expense, 'Interest expense — Fund sources', interestExpense)
  }
  const treasuryNet = r2(interestIncome + penaltyIncome - interestExpense)

  // ── 5: materialise per-pool structures ──
  const poolKeys = Array.from(pools.keys()).sort(comparePools)

  const pnlPools: PoolPnl[] = []
  // Per-CFS-section pool blocks
  const cfBlocksByCat: Record<CashFlowCategory, CashflowPoolBlock[]> = {
    operating: [],
    investing: [],
    financing: [],
  }

  for (const key of poolKeys) {
    const p = pools.get(key)!
    const revenueGroups = groupRevenueByAccount({
      invoiceItems: p.revenueInvoiceItems,
      flatLines: linesFrom(p.revenue),
    })
    const costLines = linesFrom(p.cost)
    const otherIncomeLines = linesFrom(p.otherIncome)
    const expenseLines = linesFrom(p.expense)
    const revenue = r2(revenueGroups.reduce((s, g) => s + g.subtotal, 0))
    const cost = r2(costLines.reduce((s, l) => s + l.amount, 0))
    const otherIncome = r2(otherIncomeLines.reduce((s, l) => s + l.amount, 0))
    const expense = r2(expenseLines.reduce((s, l) => s + l.amount, 0))
    const grossProfit = r2(revenue - cost)
    const margin = r2(grossProfit + otherIncome - expense)
    if (
      revenueGroups.length > 0 ||
      costLines.length > 0 ||
      otherIncomeLines.length > 0 ||
      expenseLines.length > 0
    ) {
      pnlPools.push({
        pool: key,
        poolLabel: poolLabel(key),
        revenueGroups,
        costLines,
        otherIncomeLines,
        expenseLines,
        revenue,
        cost,
        otherIncome,
        expense,
        grossProfit,
        margin,
      })
    }

    for (const cat of CASH_FLOW_CATEGORIES) {
      const inflowLines = linesFrom(p.cfIn[cat])
      const outflowLines = linesFrom(p.cfOut[cat])
      if (inflowLines.length === 0 && outflowLines.length === 0) continue
      const inTotal = r2(inflowLines.reduce((s, l) => s + l.amount, 0))
      const outTotal = r2(outflowLines.reduce((s, l) => s + l.amount, 0))
      cfBlocksByCat[cat].push({
        pool: key,
        poolLabel: poolLabel(key),
        inflowLines,
        outflowLines,
        net: r2(inTotal - outTotal),
      })
    }
  }

  // ── 6: group totals ──
  const groupRevenue = r2(pnlPools.reduce((s, p) => s + p.revenue, 0))
  const groupCost = r2(pnlPools.reduce((s, p) => s + p.cost, 0))
  const groupOtherIncome = r2(pnlPools.reduce((s, p) => s + p.otherIncome, 0))
  const groupExpense = r2(pnlPools.reduce((s, p) => s + p.expense, 0))
  const groupGrossProfit = r2(groupRevenue - groupCost)
  // treasury interest is already inside the Venture Pool's revenue/expense
  // lines, so groupNetProfit = Σ pool.margin.
  const groupNetProfit = r2(pnlPools.reduce((s, p) => s + p.margin, 0))

  const income: IncomeStatement = {
    pools: pnlPools,
    treasury: { interestIncome, penaltyIncome, interestExpense, net: treasuryNet },
    groupRevenue,
    groupCost,
    groupOtherIncome,
    groupExpense,
    groupGrossProfit,
    groupNetProfit,
  }

  // ── 7: assemble CFS sections in canonical order ──
  const sections: CashflowSection[] = CASH_FLOW_CATEGORIES.map((cat) => {
    const blocks = cfBlocksByCat[cat]
    return {
      category: cat,
      pools: blocks,
      net: r2(blocks.reduce((s, b) => s + b.net, 0)),
    }
  })
  const cashflow: CashflowStatement = {
    sections,
    netChange: r2(sections.reduce((s, sec) => s + sec.net, 0)),
  }

  const movements: BalanceMovementLine[] = balanceMovements
    .map((m) => ({ pool: m.pool, poolLabel: poolLabel(m.pool), label: m.label, amount: r2(m.amount) }))
    .filter((m) => m.amount !== 0)
    .sort((a, b) => {
      const c = comparePools(a.pool, b.pool)
      if (c !== 0) return c
      return Math.abs(b.amount) - Math.abs(a.amount)
    })

  return { income, cashflow, balanceMovements: movements }
}

// ────────────────────────────────────────────────────────────────────────────
// Supabase-backed gathering + fetch wrappers
// ────────────────────────────────────────────────────────────────────────────

const INVOICE_REVENUE_STATUSES = ['issued', 'paid', 'paid_via_netting'] as const

interface AccountMeta {
  name: string
  accountType: AccountType
  cashFlowCategory: CashFlowCategory
}

async function fetchAccountIndex(supabase: SupabaseClient): Promise<Map<string, AccountMeta>> {
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, cash_flow_category')
  if (error) throw new Error(`cfo-reports chart_of_accounts: ${error.message}`)
  const byCode = new Map<string, AccountMeta>()
  for (const a of data ?? []) {
    const code = a.code as string
    byCode.set(code, {
      name: (a.name as string) ?? code,
      accountType: a.type as AccountType,
      cashFlowCategory: a.cash_flow_category as CashFlowCategory,
    })
  }
  return byCode
}

async function gatherPvSources(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawPvSourceRow[]> {
  const { from, to } = args

  // 1) Paid vouchers in window.
  const { data: vouchers, error: vErr } = await supabase
    .from('payment_vouchers')
    .select('id, voucher_type, direction, amount, payment_date, status')
    .eq('status', 'paid')
    .gte('payment_date', from)
    .lte('payment_date', to)
  if (vErr) throw new Error(`cfo-reports vouchers: ${vErr.message}`)

  const voucherIds = (vouchers ?? []).map((v) => v.id as string)
  if (voucherIds.length === 0) return []

  const voucherMeta = new Map<string, { voucherType: string; direction: 'credit' | 'debit' }>()
  for (const v of vouchers ?? []) {
    // Defense in depth: voucher_type / direction are NOT NULL at the DB level
    // (mig 50) but the supabase generated types still mark them nullable.
    // Refuse to classify silently if either is missing.
    const rawType = v.voucher_type as string | null
    const rawDir = v.direction as string | null
    if (rawType === null || rawType === undefined) {
      throw new Error(
        `payment_voucher row ${v.id} has NULL voucher_type — refuse to classify silently`,
      )
    }
    if (rawDir !== 'credit' && rawDir !== 'debit') {
      throw new Error(
        `payment_voucher row ${v.id} has NULL/invalid direction "${rawDir}" — refuse to classify silently`,
      )
    }
    voucherMeta.set(v.id as string, {
      voucherType: rawType,
      direction: rawDir,
    })
  }

  // 2) Their source rows. Column was renamed category_code → account_code
  //    in migration 238.
  const { data: sources, error: sErr } = await supabase
    .from('payment_voucher_sources')
    .select('voucher_id, pool, account_code, amount')
    .in('voucher_id', voucherIds)
  if (sErr) throw new Error(`cfo-reports pv sources: ${sErr.message}`)

  // 3) Account lookup → name + type + cash_flow_category.
  const accountByCode = await fetchAccountIndex(supabase)

  const rows: RawPvSourceRow[] = []
  for (const src of sources ?? []) {
    const voucherId = src.voucher_id as string
    const meta = voucherMeta.get(voucherId)
    if (!meta) continue
    const code = src.account_code as string | null
    const account = code ? accountByCode.get(code) : undefined
    if (!code || !account) {
      // Per the design: no "Uncategorised" fallback — surface the data problem.
      throw new Error(
        `cfo-reports: payment_voucher_sources row for voucher ${voucherId} has ` +
          `${code ? `unknown account_code "${code}"` : 'a null account_code'} ` +
          `(every source row must reference an existing chart_of_accounts.code)`,
      )
    }
    rows.push({
      voucherId,
      voucherType: meta.voucherType,
      direction: meta.direction,
      pool: src.pool as string,
      accountCode: code,
      accountName: account.name,
      accountType: account.accountType,
      cashFlowCategory: account.cashFlowCategory,
      amount: Number(src.amount ?? 0),
    })
  }
  return rows
}

async function gatherInvoices(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawInvoiceRow[]> {
  const { from, to } = args
  const { data: invoices, error: iErr } = await supabase
    .from('invoices')
    .select('invoice_no, description, total_amount, billing_mode, period_month, status, company_id, category_code')
    .gte('period_month', from)
    .lte('period_month', to)
    .in('status', INVOICE_REVENUE_STATUSES as unknown as string[])
    .order('id', { ascending: true })
  if (iErr) throw new Error(`cfo-reports invoices: ${iErr.message}`)
  if (!invoices || invoices.length === 0) return []

  const companyIds = Array.from(new Set(invoices.map((i) => i.company_id as string)))
  const { data: companies } = companyIds.length
    ? await supabase.from('companies').select('id, short_code').in('id', companyIds)
    : { data: [] as { id: string; short_code: string }[] }
  const shortCodeById = new Map((companies ?? []).map((c) => [c.id as string, c.short_code as string]))

  const catCodes = Array.from(
    new Set(invoices.map((i) => i.category_code as string | null).filter((c): c is string => !!c)),
  )
  const { data: coa } = catCodes.length
    ? await supabase.from('chart_of_accounts').select('code, name').in('code', catCodes)
    : { data: [] as { code: string; name: string }[] }
  const coaNameByCode = new Map((coa ?? []).map((c) => [c.code as string, c.name as string]))

  return invoices.map((inv) => ({
    invoiceNo: (inv.invoice_no as string) ?? '—',
    description: ((inv.description as string | null) ?? '').trim(),
    companyShortCode: shortCodeById.get(inv.company_id as string) ?? '—',
    pool: invoicePoolForBillingMode(inv.billing_mode as string | null),
    amount: Number(inv.total_amount ?? 0),
    categoryCode: (inv.category_code as string | null) ?? '',
    categoryName: coaNameByCode.get((inv.category_code as string | null) ?? '') ?? 'Uncategorised revenue',
  }))
}

// Treasury revenue/expense from journal_lines. The unified COA seed
// places Interest Income / Penalty Income / Interest Expense in the revenue,
// other_income, and expense ranges respectively; we look them up via
// chart_of_accounts.name rather than hard-coded codes (the seed codes changed
// post-mig 238).
async function gatherTreasury(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawTreasury> {
  const { from, to } = args

  const accountByCode = await fetchAccountIndex(supabase)
  // Identify the COA codes treasury claims. Multiple matches are allowed so
  // future sub-accounts ("9011 Interest Expense — Director Loan",
  // "7002 Penalty Income — Carres", etc.) automatically join the set.
  // - interest income: revenue OR other_income (mig 238 reseeded 7000 as
  //   other_income; older deployments may still classify it as revenue)
  // - penalty income: same dual type
  // - interest expense: expense
  const interestIncomeCodes = new Set<string>()
  const penaltyIncomeCodes = new Set<string>()
  const interestExpenseCodes = new Set<string>()
  for (const [code, a] of accountByCode.entries()) {
    const n = a.name.toLowerCase()
    if (
      (a.accountType === 'revenue' || a.accountType === 'other_income') &&
      n.includes('interest income')
    ) {
      interestIncomeCodes.add(code)
    } else if (
      (a.accountType === 'revenue' || a.accountType === 'other_income') &&
      n.includes('penalty income')
    ) {
      penaltyIncomeCodes.add(code)
    } else if (a.accountType === 'expense' && n.includes('interest expense')) {
      interestExpenseCodes.add(code)
    }
  }
  const managedCodes = new Set<string>([
    ...interestIncomeCodes,
    ...penaltyIncomeCodes,
    ...interestExpenseCodes,
  ])

  const { data: jes, error: jeErr } = await supabase
    .from('journal_entries')
    .select('id, transaction_date, is_reversed')
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .eq('is_reversed', false)
  if (jeErr) throw new Error(`cfo-reports treasury JEs: ${jeErr.message}`)

  const entryIds = (jes ?? []).map((j) => j.id as string)
  if (entryIds.length === 0) {
    return { interestIncome: 0, penaltyIncome: 0, interestExpense: 0, managedCodes }
  }

  const watchCodes = Array.from(managedCodes)
  if (watchCodes.length === 0) {
    return { interestIncome: 0, penaltyIncome: 0, interestExpense: 0, managedCodes }
  }

  const { data: lines, error: lErr } = await supabase
    .from('journal_lines')
    .select('account_code, debit, credit, entry_id')
    .in('entry_id', entryIds)
    .in('account_code', watchCodes)
  if (lErr) throw new Error(`cfo-reports treasury lines: ${lErr.message}`)

  let interestIncome = 0
  let penaltyIncome = 0
  let interestExpense = 0
  for (const l of lines ?? []) {
    const code = l.account_code as string
    if (interestIncomeCodes.has(code)) interestIncome += Number(l.credit ?? 0) - Number(l.debit ?? 0)
    if (penaltyIncomeCodes.has(code)) penaltyIncome += Number(l.credit ?? 0) - Number(l.debit ?? 0)
    if (interestExpenseCodes.has(code)) interestExpense += Number(l.debit ?? 0) - Number(l.credit ?? 0)
  }
  return { interestIncome, penaltyIncome, interestExpense, managedCodes }
}

// Fund-IN inflows: fund_sources rows activated within [from, to].
async function gatherFundSourceInflows(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawFundSourceInflow[]> {
  const { from, to } = args
  const { data, error } = await supabase
    .from('fund_sources')
    .select(
      'id, source_type, amount, effective_date, status, from_company_id, from_department_id, from_freetext_name',
    )
    .eq('status', 'active')
    .gte('effective_date', from)
    .lte('effective_date', to)
  if (error) throw new Error(`cfo-reports fund_sources: ${error.message}`)
  if (!data || data.length === 0) return []

  const companyIds = Array.from(
    new Set(data.map((d) => d.from_company_id as string | null).filter(Boolean) as string[]),
  )
  const departmentIds = Array.from(
    new Set(data.map((d) => d.from_department_id as string | null).filter(Boolean) as string[]),
  )
  const [{ data: companies }, { data: departments }] = await Promise.all([
    companyIds.length
      ? supabase.from('companies').select('id, short_code').in('id', companyIds)
      : Promise.resolve({ data: [] as { id: string; short_code: string }[] }),
    departmentIds.length
      ? supabase.from('departments').select('id, name').in('id', departmentIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const shortCodeById = new Map((companies ?? []).map((c) => [c.id as string, c.short_code as string]))
  const deptNameById = new Map((departments ?? []).map((d) => [d.id as string, d.name as string]))

  const TYPE_LABEL: Record<string, string> = {
    subsidiary: 'Subsidiary deposit',
    director_loan: 'Director loan',
    department_pool: 'Dept pool transfer',
    director_saving: 'Director saving',
    outsource: 'Outsource',
  }

  return data.map((d) => {
    const sourceType = (d.source_type as string) ?? 'subsidiary'
    let counterparty = '—'
    if (d.from_company_id) {
      counterparty = shortCodeById.get(d.from_company_id as string) ?? 'Company'
    } else if (d.from_department_id) {
      counterparty = `from ${deptNameById.get(d.from_department_id as string) ?? 'Department'}`
    } else if (d.from_freetext_name) {
      counterparty = d.from_freetext_name as string
    }
    const typeLabel = TYPE_LABEL[sourceType] ?? sourceType
    return {
      fundSourceId: d.id as string,
      pool: 'venture_pool',
      label: `${typeLabel} — ${counterparty}`,
      amount: Number(d.amount ?? 0),
    }
  })
}

// Loan principal received from subsidiaries during the window.
async function gatherRepaymentPrincipalInflows(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawRepaymentPrincipalInflow[]> {
  const { from, to } = args
  const { data, error } = await supabase
    .from('repayments')
    .select('id, loan_id, amount, payment_type, payment_date')
    .eq('payment_type', 'principal')
    .gte('payment_date', from)
    .lte('payment_date', to)
  if (error) throw new Error(`cfo-reports repayments: ${error.message}`)
  if (!data || data.length === 0) return []

  const loanIds = Array.from(new Set(data.map((r) => r.loan_id as string)))
  const { data: loans } = loanIds.length
    ? await supabase.from('loans').select('id, company_id').in('id', loanIds)
    : { data: [] as { id: string; company_id: string }[] }
  const companyIdByLoanId = new Map((loans ?? []).map((l) => [l.id as string, l.company_id as string]))

  const companyIds = Array.from(new Set(Array.from(companyIdByLoanId.values())))
  const { data: companies } = companyIds.length
    ? await supabase.from('companies').select('id, short_code').in('id', companyIds)
    : { data: [] as { id: string; short_code: string }[] }
  const shortCodeById = new Map((companies ?? []).map((c) => [c.id as string, c.short_code as string]))

  return data.map((r) => {
    const companyId = companyIdByLoanId.get(r.loan_id as string)
    const shortCode = companyId ? shortCodeById.get(companyId) ?? '—' : '—'
    return {
      repaymentId: r.id as string,
      pool: 'venture_pool',
      label: `Loan principal — ${shortCode}`,
      amount: Number(r.amount ?? 0),
    }
  })
}

// Inter-billing expenses: invoices billed from one internal dept to another
// (billable_to_type='dept_pool'). The expense is recognised at the invoice's
// period_month (same date as the receiver's revenue) so PNL is symmetric.
// Cash flow is captured separately via the billing_payment PV source row at
// settlement time.
async function gatherInterBillingExpenses(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawInterBillingExpenseRow[]> {
  const { from, to } = args
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('invoice_no, total_amount, billable_to_department_id')
    .gte('period_month', from)
    .lte('period_month', to)
    .in('status', INVOICE_REVENUE_STATUSES as unknown as string[])
    .eq('billable_to_type', 'dept_pool')
    .not('billable_to_department_id', 'is', null)
  if (error) throw new Error(`cfo-reports inter-billing expenses: ${error.message}`)
  if (!invoices || invoices.length === 0) return []

  const deptIds = Array.from(
    new Set(invoices.map((i) => i.billable_to_department_id as string).filter(Boolean)),
  )
  const { data: departments } = deptIds.length
    ? await supabase.from('departments').select('id, name').in('id', deptIds)
    : { data: [] as { id: string; name: string }[] }
  const deptNameById = new Map(
    (departments ?? []).map((d) => [d.id as string, d.name as string]),
  )

  return invoices.map((inv) => {
    const deptId = inv.billable_to_department_id as string
    const deptName = deptNameById.get(deptId) ?? 'Unknown'
    return {
      invoiceNo: (inv.invoice_no as string) ?? '—',
      payingPool: `dept_pool_${deptName.toLowerCase().replace(/\s+/g, '_')}`,
      amount: Number(inv.total_amount ?? 0),
    }
  })
}

async function gatherAll(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<ClassifyInput> {
  const [pvSources, invoices, treasury, fundSourceInflows, repaymentPrincipalInflows, interBillingExpenses] =
    await Promise.all([
      gatherPvSources(supabase, args),
      gatherInvoices(supabase, args),
      gatherTreasury(supabase, args),
      gatherFundSourceInflows(supabase, args),
      gatherRepaymentPrincipalInflows(supabase, args),
      gatherInterBillingExpenses(supabase, args),
    ])
  return { pvSources, invoices, treasury, fundSourceInflows, repaymentPrincipalInflows, interBillingExpenses }
}

export async function fetchIncomeStatement(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<IncomeStatement> {
  const input = await gatherAll(supabase, args)
  return classifyRows(input).income
}

export async function fetchCashflowStatement(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<CashflowStatement> {
  const input = await gatherAll(supabase, args)
  return classifyRows(input).cashflow
}

// ────────────────────────────────────────────────────────────────────────────
// Balance Sheet — point-in-time snapshot driven by chart_of_accounts type +
// journal_lines aggregation.
// ────────────────────────────────────────────────────────────────────────────

export interface InternalFundLine {
  code: string
  name: string
  balance: number
}

export interface BalanceSheet {
  asOf: string
  bank: number
  invoiceReceivable: number
  loanReceivable: number
  fixedAssets: number
  otherAssets: number // residual non-named asset-type accounts
  fundSourcesPayable: number // total liabilities (all liability-type COA)
  // Mig 248: split equity into "real" (share capital, retained earnings) vs
  // "internal funds" (pool sub-ledgers living in the equity range). Math
  // unchanged — internalFundsTotal + equityBalances + retainedEarnings is
  // the same number as the old equityBalances + retainedEarnings.
  equityBalances: number // equity-type COA where is_internal_fund=false (excl. retained earnings YTD)
  internalFundLines: InternalFundLine[] // per-account breakdown of is_internal_fund=true rows
  internalFundsTotal: number // sum of internalFundLines.balance
  retainedEarnings: number // YTD net income from the income statement
  totalAssets: number
  totalLiabilitiesEquity: number
  reconciles: boolean
  movements: BalanceMovementLine[]
}

// Sum journal_lines net amount across the given account codes, restricted to
// non-reversed journal entries dated on/before `asOf`. `sign='dr-cr'` is used
// for assets / expenses (normal debit balance); `sign='cr-dr'` for liabilities,
// equity, and revenue (normal credit balance).
async function sumGlNetAcrossCodes(
  supabase: SupabaseClient,
  args: { jeIds: string[]; codes: string[]; sign: 'dr-cr' | 'cr-dr' },
): Promise<number> {
  const { jeIds, codes, sign } = args
  if (jeIds.length === 0 || codes.length === 0) return 0
  const { data: lines } = await supabase
    .from('journal_lines')
    .select('debit, credit')
    .in('entry_id', jeIds)
    .in('account_code', codes)
  let net = 0
  for (const l of lines ?? []) {
    const dr = Number(l.debit ?? 0)
    const cr = Number(l.credit ?? 0)
    net += sign === 'dr-cr' ? dr - cr : cr - dr
  }
  return net
}

export async function fetchBalanceSheet(
  supabase: SupabaseClient,
  args: { asOf: string },
): Promise<BalanceSheet> {
  const { asOf } = args

  // ── 1: Period-bounded JE id set ──
  const { data: jes } = await supabase
    .from('journal_entries')
    .select('id')
    .lte('transaction_date', asOf)
    .eq('is_reversed', false)
  const jeIds = (jes ?? []).map((j) => j.id as string)

  // ── 2: Chart of accounts grouped by type. Source of truth for the
  //    Total Assets / Total Liab / Total Equity sums (double-entry).
  //    Mig 248 added is_internal_fund so equity rows can be split into
  //    "real equity" vs internal pool sub-ledgers on the BS.
  const { data: coaRows } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, is_internal_fund')
  const codesByType: Record<AccountType, string[]> = {
    equity: [],
    fixed_asset: [],
    asset: [],
    liability: [],
    revenue: [],
    cost: [],
    other_income: [],
    expense: [],
  }
  const internalFundAccounts: Array<{ code: string; name: string }> = []
  const realEquityCodes: string[] = []
  for (const r of coaRows ?? []) {
    const code = r.code as string
    const name = (r.name as string) ?? code
    const t = r.type as AccountType
    if (code && t in codesByType) codesByType[t].push(code)
    if (t === 'equity') {
      if ((r as { is_internal_fund: boolean }).is_internal_fund) {
        internalFundAccounts.push({ code, name })
      } else {
        realEquityCodes.push(code)
      }
    }
  }

  // ── 3: Bank cash — sum the GL codes of active bank_accounts.
  const { data: bankRows } = await supabase
    .from('bank_accounts')
    .select('gl_account_code')
    .eq('status', 'active')
  const bankCodes = Array.from(
    new Set(
      (bankRows ?? [])
        .map((b) => (b.gl_account_code as string | null) ?? '')
        .filter((c): c is string => !!c),
    ),
  )
  const bank = await sumGlNetAcrossCodes(supabase, { jeIds, codes: bankCodes, sign: 'dr-cr' })

  // ── 4: Named asset line items (post-mig 238 codes):
  //    Accounts Receivable = 3030, Loans Receivable = 3020.
  const invoiceReceivable = await sumGlNetAcrossCodes(
    supabase,
    { jeIds, codes: [AR_CODE], sign: 'dr-cr' },
  )
  const loanReceivable = await sumGlNetAcrossCodes(
    supabase,
    { jeIds, codes: [LOANS_RECEIVABLE_CODE], sign: 'dr-cr' },
  )

  // ── 5: Fixed assets total (2xxx range, fixed_asset type).
  const fixedAssets = await sumGlNetAcrossCodes(
    supabase,
    { jeIds, codes: codesByType.fixed_asset, sign: 'dr-cr' },
  )

  // ── 6: Total assets across every asset-type + fixed_asset account.
  //    otherAssets = residual once named line items are subtracted.
  const currentAssetsTotal = await sumGlNetAcrossCodes(
    supabase,
    { jeIds, codes: codesByType.asset, sign: 'dr-cr' },
  )
  const totalAssets = currentAssetsTotal + fixedAssets
  const otherAssets = currentAssetsTotal - bank - invoiceReceivable - loanReceivable

  // ── 7: Total liabilities — sum every liability-type account.
  const fundSourcesPayable = await sumGlNetAcrossCodes(
    supabase,
    { jeIds, codes: codesByType.liability, sign: 'cr-dr' },
  )

  // ── 8: Permanent equity balances (excl. retained earnings YTD).
  // Mig 248 split: equityBalances = real equity only; internal-fund rows are
  // listed individually so the BS UI can render them in a separate section.
  const equityBalances = await sumGlNetAcrossCodes(
    supabase,
    { jeIds, codes: realEquityCodes, sign: 'cr-dr' },
  )
  const internalFundLines: InternalFundLine[] = []
  for (const acc of internalFundAccounts) {
    const balance = await sumGlNetAcrossCodes(
      supabase,
      { jeIds, codes: [acc.code], sign: 'cr-dr' },
    )
    internalFundLines.push({ code: acc.code, name: acc.name, balance })
  }
  internalFundLines.sort((a, b) => a.code.localeCompare(b.code))
  const internalFundsTotal = internalFundLines.reduce((s, l) => s + l.balance, 0)

  // ── 9: Retained earnings YTD — net profit from start-of-fiscal-year to asOf.
  const fiscalFrom = dayjs(asOf).startOf('year').format('YYYY-MM-DD')
  const ytd = await fetchIncomeStatement(supabase, { from: fiscalFrom, to: asOf })
  const retainedEarnings = ytd.groupNetProfit

  // ── 10: Balance check via the fundamental accounting equation.
  // Internal funds are still on the right-hand side (they're equity-typed
  // accounts in the GL); the split is purely a rendering concern.
  const totalLiabilitiesEquity =
    fundSourcesPayable + equityBalances + internalFundsTotal + retainedEarnings
  const reconciles = Math.abs(totalAssets - totalLiabilitiesEquity) < 1 // RM 1 tolerance

  // ── 11: Capital cash movements this period (current month up to asOf).
  const movFrom = startOfMonth(asOf)
  const movInput = await gatherAll(supabase, { from: movFrom, to: asOf })
  const movements = classifyRows(movInput).balanceMovements

  return {
    asOf,
    bank,
    invoiceReceivable,
    loanReceivable,
    fixedAssets,
    otherAssets,
    fundSourcesPayable,
    equityBalances,
    internalFundLines,
    internalFundsTotal,
    retainedEarnings,
    totalAssets,
    totalLiabilitiesEquity,
    reconciles,
    movements,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Trial Balance — every leaf GL account's net balance at a date, split into
// Dr / Cr columns. Σ Dr must equal Σ Cr. Sourced from journal_lines via the
// existing sumGlNetAcrossCodes helper (used by fetchTrialBalance — Task 2).
// ────────────────────────────────────────────────────────────────────────────

export interface CoaLeafAccount {
  code: string
  name: string
  type: AccountType
}

export interface TrialBalanceRow {
  code: string
  name: string
  type: AccountType
  debit: number  // positive when account has a Dr balance; 0 otherwise
  credit: number // positive when account has a Cr balance; 0 otherwise
}

export interface TrialBalance {
  asOf: string
  rows: TrialBalanceRow[]
  totals: { debit: number; credit: number }
  reconciles: boolean // |totals.debit - totals.credit| < 0.01
  showZeroBalance: boolean
}

// Display order matches the spec — Asset · Fixed Asset · Liability · Equity ·
// Revenue · Cost · Other Income · Expense.
const TB_TYPE_ORDER = [
  'asset', 'fixed_asset', 'liability', 'equity',
  'revenue', 'cost', 'other_income', 'expense',
] as const satisfies readonly AccountType[]

export function buildTrialBalance(args: {
  accounts: CoaLeafAccount[]
  netByCode: Map<string, number> // signed: Dr − Cr (positive = debit balance)
  asOf: string
  showZeroBalance: boolean
}): TrialBalance {
  const { accounts, netByCode, asOf, showZeroBalance } = args
  const rows: TrialBalanceRow[] = []
  let totalDebit = 0
  let totalCredit = 0
  for (const acc of accounts) {
    const net = netByCode.get(acc.code) ?? 0
    const debit = net > 0 ? net : 0
    const credit = net < 0 ? -net : 0
    const debitR = r2(debit)
    const creditR = r2(credit)
    if (!showZeroBalance && debitR === 0 && creditR === 0) continue
    rows.push({ code: acc.code, name: acc.name, type: acc.type, debit: debitR, credit: creditR })
    totalDebit += debit
    totalCredit += credit
  }
  rows.sort((a, b) => {
    const ai = TB_TYPE_ORDER.indexOf(a.type)
    const bi = TB_TYPE_ORDER.indexOf(b.type)
    if (ai !== bi) return ai - bi
    return a.code.localeCompare(b.code)
  })
  const totals = { debit: r2(totalDebit), credit: r2(totalCredit) }
  const reconciles = Math.abs(totals.debit - totals.credit) < 0.01
  return { asOf, rows, totals, reconciles, showZeroBalance }
}

export async function fetchTrialBalance(
  supabase: SupabaseClient,
  args: { asOf: string; showZeroBalance: boolean },
): Promise<TrialBalance> {
  const { asOf, showZeroBalance } = args

  // ── 1: Resolve the set of leaf accounts. A leaf is an account that is NOT
  //    a header — its code is not referenced by any other row's parent_code.
  const { data: coaRows, error: coaErr } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, parent_code')
    .eq('is_active', true)
  if (coaErr) throw new Error(`fetchTrialBalance COA: ${coaErr.message}`)
  const allCoa = coaRows ?? []
  const headerCodes = new Set(
    allCoa.map((r) => r.parent_code).filter((p): p is string => !!p),
  )
  const leafAccounts: CoaLeafAccount[] = allCoa
    .filter((r) => !headerCodes.has(r.code as string))
    .map((r) => ({
      code: r.code as string,
      name: r.name as string,
      type: r.type as AccountType,
    }))

  // ── 2: Period-bounded JE id set (non-reversed, transaction_date <= asOf).
  const { data: jes, error: jeErr } = await supabase
    .from('journal_entries')
    .select('id')
    .lte('transaction_date', asOf)
    .eq('is_reversed', false)
  if (jeErr) throw new Error(`fetchTrialBalance JEs: ${jeErr.message}`)
  const jeIds = (jes ?? []).map((j) => j.id as string)

  // ── 3: Per-leaf-account net (Dr − Cr). Single batched journal_lines query
  //    is far cheaper than one call per account.
  const netByCode = new Map<string, number>()
  if (jeIds.length > 0) {
    const leafCodes = leafAccounts.map((a) => a.code)
    const { data: lines, error: jlErr } = await supabase
      .from('journal_lines')
      .select('account_code, debit, credit')
      .in('entry_id', jeIds)
      .in('account_code', leafCodes)
    if (jlErr) throw new Error(`fetchTrialBalance lines: ${jlErr.message}`)
    for (const l of lines ?? []) {
      const code = l.account_code as string
      const dr = Number(l.debit ?? 0)
      const cr = Number(l.credit ?? 0)
      netByCode.set(code, (netByCode.get(code) ?? 0) + dr - cr)
    }
  }

  return buildTrialBalance({ accounts: leafAccounts, netByCode, asOf, showZeroBalance })
}

// ────────────────────────────────────────────────────────────────────────────
// General Ledger — chronological journal_lines for a single account over a
// period, with running balance.
// ────────────────────────────────────────────────────────────────────────────

export interface RawLedgerLine {
  entryDate: string  // YYYY-MM-DD
  entryNo: string
  description: string
  accountDesc: string
  journalType: string
  ref: string
  debit: number      // positive amount; 0 when this side wasn't touched
  credit: number     // positive amount; 0 when this side wasn't touched
}

export interface LedgerLine {
  entryDate: string
  entryNo: string
  description: string
  accountDesc: string
  journalType: string
  ref: string
  debit: number
  credit: number
  runningBalance: number  // signed Dr − Cr (positive = debit balance after this line)
}

export interface Ledger {
  code: string
  accountName: string
  accountType: AccountType
  from: string
  to: string
  openingBalance: number   // signed Dr − Cr at start of period
  closingBalance: number   // signed Dr − Cr at end of period
  periodTotals: { debit: number; credit: number }
  lines: LedgerLine[]
}

export function buildLedger(args: {
  account: CoaLeafAccount
  openingBalance: number
  rawLines: RawLedgerLine[]
  from: string
  to: string
}): Ledger {
  const { account, openingBalance, rawLines, from, to } = args
  let running = openingBalance
  let totalDebit = 0
  let totalCredit = 0
  const lines: LedgerLine[] = [
    {
      entryDate: '',
      entryNo: '',
      description: 'BALANCE B/F',
      accountDesc: account.name,
      journalType: '',
      ref: '',
      debit: 0,
      credit: 0,
      runningBalance: r2(openingBalance),
    },
  ]
  for (const raw of rawLines) {
    running += raw.debit - raw.credit
    totalDebit += raw.debit
    totalCredit += raw.credit
    lines.push({
      entryDate: raw.entryDate,
      entryNo: raw.entryNo,
      description: raw.description,
      accountDesc: raw.accountDesc,
      journalType: raw.journalType,
      ref: raw.ref,
      debit: r2(raw.debit),
      credit: r2(raw.credit),
      runningBalance: r2(running),
    })
  }
  return {
    code: account.code,
    accountName: account.name,
    accountType: account.type,
    from,
    to,
    openingBalance: r2(openingBalance),
    closingBalance: r2(running),
    periodTotals: { debit: r2(totalDebit), credit: r2(totalCredit) },
    lines,
  }
}

export async function fetchLedger(
  supabase: SupabaseClient,
  args: { code: string; from: string; to: string },
): Promise<Ledger> {
  const ledgers = await fetchLedgers(supabase, { codes: [args.code], from: args.from, to: args.to })
  if (ledgers.length === 0) {
    throw new Error(`fetchLedger: account ${args.code} not found`)
  }
  return ledgers[0]
}

// ────────────────────────────────────────────────────────────────────────────
// Source-description resolver
//
// JE.description is system-generated (`"Invoice X issued"`, `"PV X: <user>"`).
// The user-typed description lives on the originating row — invoices.description
// and payment_vouchers.description. Reading those back lets the ledger display
// what the user actually wrote, not the wrapper string.
//
// Returns a map keyed by `${reference_type}:${reference_id}` → user description
// (only present when the source row has a non-empty description). Reference
// types not handled here (`fund_source`, `loan`, etc.) fall through to the
// JE.description, which for those flows already contains the user's text via
// approval.description.
// ────────────────────────────────────────────────────────────────────────────

export async function resolveSourceDescriptions(
  supabase: SupabaseClient,
  refs: Array<{ referenceType: string; referenceId: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (refs.length === 0) return out

  const invoiceIds = new Set<string>()
  const pvIds = new Set<string>()
  for (const r of refs) {
    if (r.referenceType === 'invoice') invoiceIds.add(r.referenceId)
    else if (r.referenceType === 'payment_voucher') pvIds.add(r.referenceId)
  }

  if (invoiceIds.size > 0) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, description')
      .in('id', Array.from(invoiceIds))
    if (error) throw new Error(`resolveSourceDescriptions invoices: ${error.message}`)
    for (const r of data ?? []) {
      const desc = (r.description as string | null)?.trim()
      if (desc) out.set(`invoice:${r.id as string}`, desc)
    }
  }

  if (pvIds.size > 0) {
    const { data, error } = await supabase
      .from('payment_vouchers')
      .select('id, description')
      .in('id', Array.from(pvIds))
    if (error) throw new Error(`resolveSourceDescriptions payment_vouchers: ${error.message}`)
    for (const r of data ?? []) {
      const desc = (r.description as string | null)?.trim()
      if (desc) out.set(`payment_voucher:${r.id as string}`, desc)
    }
  }

  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Source-meta resolver — Journal Type + Ref per originating row.
//
// invoice            → journalType 'SALES',   ref = invoices.invoice_no
// payment_voucher    → journalType 'RECEIPT' (direction 'credit') /
//                       'PAYMENT' (otherwise), ref = payment_vouchers.voucher_no
//
// Returns a map keyed by `${reference_type}:${reference_id}`. Reference types
// not handled here fall through to the manual-JE defaults in fetchLedgers
// (journalType 'JOURNAL', ref = JE.entry_no), except fund_source / loan which
// get a meaningful Journal Type via REF_TYPE_JOURNAL below (ref still falls
// back to JE.entry_no — those rows have no separate doc number).
// ────────────────────────────────────────────────────────────────────────────

// Reference types with no dedicated source-meta resolver but a meaningful
// Journal Type: fund_source (subsidiary deposit) → DEPOSIT, loan → LOAN.
// Everything else (manual / null) falls through to 'JOURNAL'.
const REF_TYPE_JOURNAL: Record<string, string> = { fund_source: 'DEPOSIT', loan: 'LOAN' }

export async function resolveLedgerSourceMeta(
  supabase: SupabaseClient,
  refs: Array<{ referenceType: string; referenceId: string }>,
): Promise<Map<string, { journalType: string; ref: string }>> {
  const out = new Map<string, { journalType: string; ref: string }>()
  if (refs.length === 0) return out

  const invoiceIds = new Set<string>()
  const pvIds = new Set<string>()
  for (const r of refs) {
    if (r.referenceType === 'invoice') invoiceIds.add(r.referenceId)
    else if (r.referenceType === 'payment_voucher') pvIds.add(r.referenceId)
  }

  if (invoiceIds.size > 0) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_no')
      .in('id', Array.from(invoiceIds))
    if (error) throw new Error(`resolveLedgerSourceMeta invoices: ${error.message}`)
    for (const r of data ?? []) {
      out.set(`invoice:${r.id as string}`, {
        journalType: 'SALES',
        ref: (r.invoice_no as string | null) ?? '',
      })
    }
  }

  if (pvIds.size > 0) {
    const { data, error } = await supabase
      .from('payment_vouchers')
      .select('id, voucher_no, direction')
      .in('id', Array.from(pvIds))
    if (error) throw new Error(`resolveLedgerSourceMeta payment_vouchers: ${error.message}`)
    for (const r of data ?? []) {
      const dir = r.direction as string | null
      out.set(`payment_voucher:${r.id as string}`, {
        journalType: dir === 'credit' ? 'RECEIPT' : 'PAYMENT',
        ref: (r.voucher_no as string | null) ?? '',
      })
    }
  }

  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Multi-account General Ledger — batched fetch for N accounts at once.
//
// codes=[] means "every postable leaf account". One round-trip set for opening
// balances (all accounts), one for period JEs, one for period lines, one
// source-description lookup. Returns one Ledger per requested account, in the
// canonical TB type order (asset · fixed_asset · liability · equity · revenue ·
// cost · other_income · expense), then by code within each type.
// ────────────────────────────────────────────────────────────────────────────

export async function fetchLedgers(
  supabase: SupabaseClient,
  args: { codes: string[]; from: string; to: string },
): Promise<Ledger[]> {
  const { codes, from, to } = args

  // ── 1: Resolve the leaf accounts. If codes given, use those (and verify
  //    none are headers); else pick every leaf. ──
  const { data: coaRows, error: coaErr } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, parent_code, is_active')
    .eq('is_active', true)
  if (coaErr) throw new Error(`fetchLedgers COA: ${coaErr.message}`)
  const allCoa = coaRows ?? []
  const headerCodes = new Set(
    allCoa.map((r) => r.parent_code).filter((p): p is string => !!p),
  )
  const codeFilter = codes.length > 0 ? new Set(codes) : null
  const accounts: CoaLeafAccount[] = allCoa
    .filter((r) => !headerCodes.has(r.code as string))
    .filter((r) => (codeFilter ? codeFilter.has(r.code as string) : true))
    .map((r) => ({
      code: r.code as string,
      name: r.name as string,
      type: r.type as AccountType,
    }))

  if (codeFilter) {
    const found = new Set(accounts.map((a) => a.code))
    for (const c of codeFilter) {
      if (!found.has(c)) {
        const row = allCoa.find((r) => r.code === c)
        if (!row) throw new Error(`fetchLedgers: account ${c} not found`)
        if (headerCodes.has(c)) {
          throw new Error(`fetchLedgers: account ${c} is a header — pick a leaf account instead`)
        }
        throw new Error(`fetchLedgers: account ${c} is inactive`)
      }
    }
  }

  accounts.sort((a, b) => {
    const ai = TB_TYPE_ORDER.indexOf(a.type)
    const bi = TB_TYPE_ORDER.indexOf(b.type)
    if (ai !== bi) return ai - bi
    return a.code.localeCompare(b.code)
  })

  if (accounts.length === 0) return []
  const leafCodes = accounts.map((a) => a.code)

  // ── 2: Opening balances. Σ (Dr − Cr) for every line on a non-reversed JE
  //    with transaction_date < from. Single batched query. ──
  const { data: openingJes, error: openJeErr } = await supabase
    .from('journal_entries')
    .select('id')
    .lt('transaction_date', from)
    .eq('is_reversed', false)
  if (openJeErr) throw new Error(`fetchLedgers opening JEs: ${openJeErr.message}`)
  const openingJeIds = (openingJes ?? []).map((j) => j.id as string)
  const openingByCode = new Map<string, number>()
  if (openingJeIds.length > 0) {
    const { data: openLines, error: openJlErr } = await supabase
      .from('journal_lines')
      .select('account_code, debit, credit')
      .in('entry_id', openingJeIds)
      .in('account_code', leafCodes)
    if (openJlErr) throw new Error(`fetchLedgers opening lines: ${openJlErr.message}`)
    for (const l of openLines ?? []) {
      const code = l.account_code as string
      openingByCode.set(
        code,
        (openingByCode.get(code) ?? 0) + Number(l.debit ?? 0) - Number(l.credit ?? 0),
      )
    }
  }

  // ── 3: Period JEs with metadata for the description override. ──
  const { data: periodJes, error: periodJeErr } = await supabase
    .from('journal_entries')
    .select('id, entry_no, transaction_date, description, reference_type, reference_id')
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .eq('is_reversed', false)
    .order('transaction_date', { ascending: true })
    .order('entry_no', { ascending: true })
  if (periodJeErr) throw new Error(`fetchLedgers period JEs: ${periodJeErr.message}`)
  const periodJes2 = periodJes ?? []
  const periodJeIds = periodJes2.map((j) => j.id as string)

  // ── 4: Source-description override (invoices / payment_vouchers). ──
  const refs: Array<{ referenceType: string; referenceId: string }> = []
  for (const j of periodJes2) {
    const t = j.reference_type as string | null
    const id = j.reference_id as string | null
    if (t && id) refs.push({ referenceType: t, referenceId: id })
  }
  const descOverrides = await resolveSourceDescriptions(supabase, refs)
  const srcMeta = await resolveLedgerSourceMeta(supabase, refs)

  const jeById = new Map<
    string,
    { entryNo: string; transactionDate: string; description: string; journalType: string; ref: string }
  >()
  for (const j of periodJes2) {
    const fallback = (j.description as string) ?? ''
    const refKey =
      j.reference_type && j.reference_id ? `${j.reference_type}:${j.reference_id}` : null
    const description = refKey ? descOverrides.get(refKey) ?? fallback : fallback
    const meta = refKey ? srcMeta.get(refKey) : undefined
    jeById.set(j.id as string, {
      entryNo: (j.entry_no as string | null) ?? '',
      transactionDate: j.transaction_date as string,
      description,
      journalType:
        meta?.journalType ??
        (j.reference_type ? REF_TYPE_JOURNAL[j.reference_type as string] : undefined) ??
        'JOURNAL',
      ref: meta?.ref || (j.entry_no as string),
    })
  }

  // ── 5: Period journal_lines for all requested accounts in one query. ──
  type LineWithMeta = {
    code: string
    id: string
    entryNo: string
    entryDate: string
    description: string
    journalType: string
    ref: string
    debit: number
    credit: number
  }
  const linesByCode = new Map<string, LineWithMeta[]>()
  for (const c of leafCodes) linesByCode.set(c, [])
  if (periodJeIds.length > 0) {
    const { data: lines, error: jlErr } = await supabase
      .from('journal_lines')
      .select('id, entry_id, account_code, debit, credit')
      .in('entry_id', periodJeIds)
      .in('account_code', leafCodes)
    if (jlErr) throw new Error(`fetchLedgers period lines: ${jlErr.message}`)
    for (const l of lines ?? []) {
      const je = jeById.get(l.entry_id as string)
      if (!je) continue
      const code = l.account_code as string
      linesByCode.get(code)?.push({
        code,
        id: l.id as string,
        entryNo: je.entryNo,
        entryDate: je.transactionDate,
        description: je.description,
        journalType: je.journalType,
        ref: je.ref,
        debit: Number(l.debit ?? 0),
        credit: Number(l.credit ?? 0),
      })
    }
  }

  // ── 6: Build a Ledger per account. ──
  const out: Ledger[] = []
  for (const account of accounts) {
    const rawByCode = linesByCode.get(account.code) ?? []
    rawByCode.sort((a, b) => {
      if (a.entryDate !== b.entryDate) return a.entryDate.localeCompare(b.entryDate)
      if (a.entryNo !== b.entryNo) return (a.entryNo ?? '').localeCompare(b.entryNo ?? '')
      return a.id.localeCompare(b.id)
    })
    const rawLines: RawLedgerLine[] = rawByCode.map((l) => ({
      entryDate: l.entryDate,
      entryNo: l.entryNo,
      description: l.description,
      accountDesc: account.name,
      journalType: l.journalType,
      ref: l.ref,
      debit: l.debit,
      credit: l.credit,
    }))
    out.push(
      buildLedger({
        account,
        openingBalance: openingByCode.get(account.code) ?? 0,
        rawLines,
        from,
        to,
      }),
    )
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Date helpers
// ────────────────────────────────────────────────────────────────────────────
export function startOfMonth(d?: string): string {
  return dayjs(d ?? undefined).startOf('month').format('YYYY-MM-DD')
}
export function endOfMonth(d?: string): string {
  return dayjs(d ?? undefined).endOf('month').format('YYYY-MM-DD')
}
