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
import { fetchAllRows, fetchAllRowsParallel, fetchByKeys } from './paginate'
import { lineAttributions, segmentToPoolKey } from './invoice-settlement'
import { primedModeToPool, primedSegmentToPool } from './dept-registry'
import type { AccountType, CashFlowCategory } from './coa'
import { CASH_FLOW_CATEGORIES } from './coa'
import type { Database } from './supabase/database.types'
import { accountFamily } from './ar-accounts'

type GlSegment = Database['public']['Enums']['gl_segment']

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

// Opening-balance / adjustment P&L posted as MANUAL journal vouchers
// (journal_entries.reference_type = 'manual_jv'). These do NOT flow through the
// operational subledgers (PV sources / invoices / inter-billing) the rest of
// the report derives P&L from, so without this they'd be invisible to the
// Income Statement and the Balance Sheet's retained earnings would be short.
// One row per (segment, account) so the income statement lists each GL account
// as its own line (not a single "Manual JV" lump). Already net of treasury-
// managed codes (those are aggregated by gatherTreasury to avoid double-count).
export interface RawManualJvPnlRow {
  segment: GlSegment
  label: string // account name (the income-statement line label)
  kind: 'revenue' | 'other_income' | 'expense' | 'cost'
  amount: number // signed: revenue/other_income = cr−dr; expense/cost = dr−cr
}

export interface ClassifyInput {
  pvSources: RawPvSourceRow[]
  invoices: RawInvoiceRow[]
  treasury: RawTreasury
  fundSourceInflows?: RawFundSourceInflow[]
  repaymentPrincipalInflows?: RawRepaymentPrincipalInflow[]
  interBillingExpenses?: RawInterBillingExpenseRow[]
  manualJvPnl?: RawManualJvPnlRow[]
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
  openingCash: number // GL bank balance at start of period (transaction_date < from)
  closingCash: number // GL bank balance at end of period (transaction_date <= to); ties to BS bank
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
  // Dynamic full departments (2026-08-24): a provisioned dept's own billing
  // mode routes to its pool; anything else stays Venture as before.
  if (billingMode) {
    const primed = primedModeToPool()[billingMode]
    if (primed) return primed
  }
  return VENTURE_POOL
}

// ────────────────────────────────────────────────────────────────────────────
// gl_segment → P&L pool map (manual-JV P&L only). Departmental segments map to
// their dept pools; treasury / corporate / unallocated have no dedicated dept
// pool, so they fall into the Venture Pool — the same place treasury interest
// and unmapped invoices already land.
// ────────────────────────────────────────────────────────────────────────────
// Record<string,…> (not Record<GlSegment,…>): gl_segment now GROWS at runtime
// when departments are provisioned — dynamic segments resolve through the
// primed registry fallback below, so this map stays cores-only.
export const MANUAL_JV_SEGMENT_TO_POOL: Record<string, string> = {
  marketing: 'dept_pool_marketing',
  hr: 'dept_pool_hr',
  finance: 'dept_pool_finance',
  director_office: 'dept_pool_director_office',
  director: 'dept_pool_director',
  treasury: VENTURE_POOL,
  corporate: VENTURE_POOL,
  unallocated: VENTURE_POOL,
}

export function manualJvPoolForSegment(segment: GlSegment | string): string {
  return (
    (MANUAL_JV_SEGMENT_TO_POOL as Record<string, string>)[segment] ??
    primedSegmentToPool()[segment] ??
    VENTURE_POOL
  )
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
    // Treated as Cost (sits above gross profit) per user request, not Expense.
    if (interestExpense !== 0) bump(vp.cost, 'Interest expense — Fund sources', interestExpense)
  }
  const treasuryNet = r2(interestIncome + penaltyIncome - interestExpense)

  // ── 4a: manual-JV P&L (opening balances / adjustments) folded into pools ──
  // These are journal_entries with reference_type='manual_jv'; they bypass the
  // operational subledgers above. Treasury-managed codes are already excluded
  // upstream (gatherManualJvPnl), so there's no double-count with section 4.
  // P&L only — no cash-flow effect (opening balances move no cash).
  const manualJvPnl = input.manualJvPnl ?? []
  for (const m of manualJvPnl) {
    const amount = r2(Number(m.amount ?? 0))
    if (amount === 0) continue
    const p = acc(manualJvPoolForSegment(m.segment))
    const target =
      m.kind === 'revenue' ? p.revenue
      : m.kind === 'other_income' ? p.otherIncome
      : m.kind === 'expense' ? p.expense
      : p.cost
    bump(target, m.label, amount)
  }

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
    // openingCash/closingCash are GL-derived (need DB access) and are filled in
    // by fetchCashflowStatement; classifyRows is pure so it leaves them at 0.
    openingCash: 0,
    closingCash: 0,
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

/** A read started ahead of the step that awaits it (2026-10-08), marked
 *  handled: if an earlier step throws or returns first, nothing awaits it, and
 *  an unawaited rejection would be an unhandled one. Awaiting it still throws. */
function startedEarly<T>(read: Promise<T>): Promise<T> {
  read.catch(() => {})
  return read
}

/** Σ (Dr − Cr) per account over every line of a non-reversed journal entry
 *  dated strictly BEFORE `before`, `codes` narrowing it (null = every account).
 *  Summed by the database — `gl_net_by_account`, mig 20261008180000 — instead
 *  of downloading the lines to add them up here (2026-10-08: the Ledger's
 *  opening balances were ~3,860 lines in four pages, the Trial Balance all
 *  ~4,230 in five; the sum is one row per account, ~29 ms). SECURITY INVOKER,
 *  so RLS answers as it did for the lines. */
async function fetchNetByAccount(
  supabase: SupabaseClient,
  before: string,
  codes: string[] | null,
  label: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('gl_net_by_account', {
    p_before: before,
    ...(codes ? { p_codes: codes } : {}),
  })
  if (error) throw new Error(`${label}: ${error.message}`)
  return new Map(
    ((data ?? []) as Array<{ account_code: string; net: number | string }>).map((r) => [r.account_code, Number(r.net)]),
  )
}

/** A real `YYYY-MM-DD` day — not `2026-02-31`, which dayjs would roll into
 *  March and Postgres would refuse. */
export function isCalendarDay(day: string | null | undefined): day is string {
  return !!day && /^\d{4}-\d{2}-\d{2}$/.test(day) && dayjs(day).format('YYYY-MM-DD') === day
}

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

interface PvSourceRow {
  id: string
  voucher_id: string
  pool: string
  account_code: string | null
  amount: number | string | null
}

async function gatherPvSources(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawPvSourceRow[]> {
  const { from, to } = args
  // 3) (started first — it needs nothing below) Account lookup → name + type +
  //    cash_flow_category.
  const accountIndexRead = startedEarly(fetchAccountIndex(supabase))

  // 1) Paid vouchers in window.
  const vouchers = await fetchAllRows((lo, hi) => supabase
    .from('payment_vouchers')
    .select('id, voucher_type, direction, amount, payment_date, status')
    .eq('status', 'paid')
    .gte('payment_date', from)
    .lte('payment_date', to)
    .order('id', { ascending: true })
    .range(lo, hi))

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
  //    Chunked by voucher (fetchByKeys, 2026-10-08). Every paid voucher's id
  //    in ONE `.in()` is a URL that grows with the books: the all-time accrual
  //    view (Dept Pool) had 418 → ~16 KB, which already fails off production,
  //    and 507 ids is where the same kind of list broke before (paginate.ts).
  //    Each chunk still pages — 100 vouchers could pass 1,000 source rows —
  //    and the rows are put back in source-row id order, the order the one
  //    query answered in: classifyRows sums in that order and breaks ties by
  //    it (linesFrom, the balance movements). `id` is read for that alone.
  const sources = await fetchByKeys<PvSourceRow, string>(voucherIds, async (chunk) => ({
    data: await fetchAllRows<PvSourceRow>((lo, hi) => supabase
      .from('payment_voucher_sources')
      .select('id, voucher_id, pool, account_code, amount')
      .in('voucher_id', chunk)
      .order('id', { ascending: true })
      .range(lo, hi)),
    error: null,
  }))
  // uuid order = byte order = plain string order of the lowercase hex form.
  sources.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const accountByCode = await accountIndexRead

  const rows: RawPvSourceRow[] = []
  for (const src of sources) {
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
  const invoices = await fetchAllRows((lo, hi) => supabase
    .from('invoices')
    .select('invoice_no, description, total_amount, billing_mode, period_month, status, company_id, category_code, id')
    .gte('period_month', from)
    .lte('period_month', to)
    .in('status', INVOICE_REVENUE_STATUSES as unknown as string[])
    .order('id', { ascending: true })
    .range(lo, hi))
  if (!invoices || invoices.length === 0) return []

  const companyIds = Array.from(new Set(invoices.map((i) => i.company_id as string)))
  const { data: companies } = companyIds.length
    ? await supabase.from('companies').select('id, short_code').in('id', companyIds)
    : { data: [] as { id: string; short_code: string }[] }
  const shortCodeById = new Map((companies ?? []).map((c) => [c.id as string, c.short_code as string]))

  // Consolidated payroll invoices route revenue PER LINE (each line's segment →
  // its own dept pool), so the P&L must expand them into one row per department
  // instead of attributing the whole invoice to a single pool.
  const consolidatedIds = invoices
    .filter((i) => (i.billing_mode as string) === 'payroll_consolidated')
    .map((i) => i.id as string)
  const clinesByInvoice = new Map<
    string,
    Array<{ amount: number; segment: string | null; category_code: string | null }>
  >()
  if (consolidatedIds.length > 0) {
    // Chunked by invoice (fetchByKeys, 2026-10-08): over an all-time window
    // these ids are a list that only grows, in one URL. Every line of an
    // invoice lands in ONE chunk, in id order — the per-invoice order the one
    // query gave, and the only order read below.
    const cLines = await fetchByKeys(consolidatedIds, async (chunk) => ({
      data: await fetchAllRows((lo, hi) => supabase
        .from('invoice_lines')
        .select('invoice_id, amount, segment, category_code')
        .in('invoice_id', chunk)
        .order('id', { ascending: true })
        .range(lo, hi)),
      error: null,
    }))
    for (const ln of cLines ?? []) {
      const arr = clinesByInvoice.get(ln.invoice_id as string) ?? []
      arr.push({
        amount: Number(ln.amount),
        segment: (ln.segment as string | null) ?? null,
        category_code: (ln.category_code as string | null) ?? null,
      })
      clinesByInvoice.set(ln.invoice_id as string, arr)
    }
  }

  const catCodes = Array.from(
    new Set(
      [
        ...invoices.map((i) => i.category_code as string | null),
        ...[...clinesByInvoice.values()].flat().map((l) => l.category_code),
      ].filter((c): c is string => !!c),
    ),
  )
  const { data: coa } = catCodes.length
    ? await supabase.from('chart_of_accounts').select('code, name').in('code', catCodes)
    : { data: [] as { code: string; name: string }[] }
  const coaNameByCode = new Map((coa ?? []).map((c) => [c.code as string, c.name as string]))

  return invoices.flatMap((inv): RawInvoiceRow[] => {
    const base = {
      invoiceNo: (inv.invoice_no as string) ?? '—',
      description: ((inv.description as string | null) ?? '').trim(),
      companyShortCode: shortCodeById.get(inv.company_id as string) ?? '—',
    }
    if ((inv.billing_mode as string) === 'payroll_consolidated') {
      const lines = clinesByInvoice.get(inv.id as string) ?? []
      const catForSeg = new Map<string, string>()
      for (const l of lines) {
        if (l.segment && l.category_code && !catForSeg.has(l.segment)) catForSeg.set(l.segment, l.category_code)
      }
      return lineAttributions(lines, inv.billing_mode as string).map((g) => {
        const cat = catForSeg.get(g.segment) ?? (inv.category_code as string | null) ?? ''
        return {
          ...base,
          pool: segmentToPoolKey(g.segment),
          amount: g.amount,
          categoryCode: cat,
          categoryName: coaNameByCode.get(cat) ?? 'Uncategorised revenue',
        }
      })
    }
    return [
      {
        ...base,
        pool: invoicePoolForBillingMode(inv.billing_mode as string | null),
        amount: Number(inv.total_amount ?? 0),
        categoryCode: (inv.category_code as string | null) ?? '',
        categoryName: coaNameByCode.get((inv.category_code as string | null) ?? '') ?? 'Uncategorised revenue',
      },
    ]
  })
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

  const watchCodes = Array.from(managedCodes)
  if (watchCodes.length === 0) {
    return { interestIncome: 0, penaltyIncome: 0, interestExpense: 0, managedCodes }
  }

  // Single join-filtered query. The old two-step (fetch the period's JE ids,
  // then .in('entry_id', ids)) stuffed every id into the request URL — past a
  // few thousand entries PostgREST rejects it with a bare 400 Bad Request
  // (the 2026-08-13 Ledger failure class). Filtering through the embedded
  // join keeps the URL constant-size no matter how much history exists.
  const lines = (await fetchAllRows((lo, hi) => supabase
    .from('journal_lines')
    .select('account_code, debit, credit, journal_entries!inner(transaction_date, is_reversed)')
    .in('account_code', watchCodes)
    .gte('journal_entries.transaction_date', from)
    .lte('journal_entries.transaction_date', to)
    .eq('journal_entries.is_reversed', false)
    .order('id', { ascending: true })
    .range(lo, hi))) as Record<string, unknown>[]

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

// Manual-JV P&L: opening-balance / adjustment journal entries posted with
// reference_type='manual_jv'. Grouped by journal_entries.segment × account
// type. Treasury-managed account codes (interest income / penalty income /
// interest expense, per gatherTreasury) are EXCLUDED so the same line isn't
// counted both here and in the treasury aggregation. Mirrors gatherTreasury's
// two-query style (JE id set, then journal_lines), reusing the COA index.
async function gatherManualJvPnl(
  supabase: SupabaseClient,
  args: { from: string; to: string; managedCodes: Set<string> },
): Promise<RawManualJvPnlRow[]> {
  const { from, to, managedCodes } = args

  // Join-filtered in one query (no JE-id list in the URL — see gatherTreasury);
  // the JE's segment rides along on the embedded join.
  const lines = (await fetchAllRows((lo, hi) => supabase
    .from('journal_lines')
    .select('entry_id, account_code, debit, credit, journal_entries!inner(segment, reference_type, is_reversed, transaction_date)')
    .eq('journal_entries.reference_type', 'manual_jv')
    .eq('journal_entries.is_reversed', false)
    .gte('journal_entries.transaction_date', from)
    .lte('journal_entries.transaction_date', to)
    .order('id', { ascending: true })
    .range(lo, hi))) as Record<string, unknown>[]
  if (lines.length === 0) return []

  const accountByCode = await fetchAccountIndex(supabase)

  // Aggregate per (segment, account) so each GL account becomes its own line.
  type Kind = 'revenue' | 'other_income' | 'expense' | 'cost'
  const acc = new Map<string, { segment: GlSegment; label: string; kind: Kind; amount: number }>()

  for (const l of lines ?? []) {
    const code = l.account_code as string | null
    if (!code) continue
    // Skip treasury-managed codes — already aggregated by gatherTreasury.
    if (managedCodes.has(code)) continue
    const account = accountByCode.get(code)
    if (!account) continue
    const seg = (l.journal_entries as { segment: GlSegment | null } | null)?.segment
    if (!seg) continue
    const t = account.accountType
    if (t !== 'revenue' && t !== 'other_income' && t !== 'expense' && t !== 'cost') continue
    const dr = Number(l.debit ?? 0)
    const cr = Number(l.credit ?? 0)
    const signed = (t === 'revenue' || t === 'other_income') ? cr - dr : dr - cr
    const key = `${seg}|${code}`
    const existing = acc.get(key)
    if (existing) {
      existing.amount += signed
    } else {
      acc.set(key, { segment: seg, label: account.name, kind: t as Kind, amount: signed })
    }
  }

  return Array.from(acc.values()).map((r) => ({ ...r, amount: r2(r.amount) }))
}

// Fund-IN inflows: fund_sources rows activated within [from, to].
async function gatherFundSourceInflows(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawFundSourceInflow[]> {
  const { from, to } = args
  const data = await fetchAllRows((lo, hi) => supabase
    .from('fund_sources')
    .select(
      'id, source_type, amount, effective_date, status, from_company_id, from_department_id, from_freetext_name',
    )
    .eq('status', 'active')
    .gte('effective_date', from)
    .lte('effective_date', to)
    .order('id', { ascending: true })
    .range(lo, hi))
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
  const data = await fetchAllRows((lo, hi) => supabase
    .from('repayments')
    .select('id, loan_id, amount, payment_type, payment_date')
    .eq('payment_type', 'principal')
    .gte('payment_date', from)
    .lte('payment_date', to)
    .order('id', { ascending: true })
    .range(lo, hi))
  if (!data || data.length === 0) return []

  const loanIds = Array.from(new Set(data.map((r) => r.loan_id as string)))
  // Chunked (fetchByKeys, 2026-10-08): over an all-time window every repaid
  // loan's id went into one URL. A failed read still only leaves the labels
  // at '—', as before (this read's error was never checked).
  const loans = loanIds.length
    ? await fetchByKeys<{ id: string; company_id: string }, string>(loanIds, (chunk) =>
        supabase.from('loans').select('id, company_id').in('id', chunk),
      ).catch(() => [] as { id: string; company_id: string }[])
    : ([] as { id: string; company_id: string }[])
  const companyIdByLoanId = new Map(loans.map((l) => [l.id, l.company_id]))

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
  const invoices = await fetchAllRows((lo, hi) => supabase
    .from('invoices')
    .select('invoice_no, total_amount, billable_to_department_id')
    .gte('period_month', from)
    .lte('period_month', to)
    .in('status', INVOICE_REVENUE_STATUSES as unknown as string[])
    .eq('billable_to_type', 'dept_pool')
    .not('billable_to_department_id', 'is', null)
    .order('id', { ascending: true })
    .range(lo, hi))
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
  // Manual-JV P&L runs after treasury so it can reuse treasury.managedCodes to
  // exclude interest income / penalty income / interest expense (avoids
  // double-counting with the treasury aggregation).
  const manualJvPnl = await gatherManualJvPnl(supabase, {
    from: args.from,
    to: args.to,
    managedCodes: treasury.managedCodes,
  })
  return {
    pvSources,
    invoices,
    treasury,
    fundSourceInflows,
    repaymentPrincipalInflows,
    interBillingExpenses,
    manualJvPnl,
  }
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
  const { from, to } = args
  const input = await gatherAll(supabase, args)
  const base = classifyRows(input).cashflow

  // ── Opening / closing cash — mirror fetchBalanceSheet's `bank` derivation so
  //    closingCash (asOf=to) equals the Balance Sheet bank figure. The CFS
  //    sections are operational-only (payment_voucher_sources) and never see
  //    the manual-JV opening balances, so we must derive cash from the GL.
  const bankCodes = await fetchActiveBankCodes(supabase)

  // Join-filtered as-of sums (opening = the day before `from`) — the old
  // fetchJeIdsBefore/-OnOrBefore id lists 400 once history grows.
  const dayBeforeFrom = dayjs(from).subtract(1, 'day').format('YYYY-MM-DD')
  const openingCash = r2(
    await sumGlNetAcrossCodes(supabase, { asOf: dayBeforeFrom, codes: bankCodes, sign: 'dr-cr' }),
  )
  const closingCash = r2(
    await sumGlNetAcrossCodes(supabase, { asOf: to, codes: bankCodes, sign: 'dr-cr' }),
  )

  // ── Reconciliation: openingCash + netChange MUST equal closingCash.
  //    The operational netChange omits manual-JV bank movements (e.g. the loaded
  //    opening balances). The true GL movement this period = closingCash -
  //    openingCash; the residual it doesn't explain goes into financing as an
  //    explicit "Opening balances / adjustments" line so the sections re-sum.
  const glMovement = r2(closingCash - openingCash)
  const residual = r2(glMovement - base.netChange)

  let sections = base.sections
  if (Math.abs(residual) >= 0.005) {
    sections = base.sections.map((sec) => {
      if (sec.category !== 'financing') return sec
      const adjBlock: CashflowPoolBlock = {
        pool: '_adjustments',
        poolLabel: 'Opening balances / adjustments',
        inflowLines: residual >= 0 ? [{ label: 'Opening balances / adjustments', amount: residual }] : [],
        outflowLines: residual < 0 ? [{ label: 'Opening balances / adjustments', amount: -residual }] : [],
        net: residual,
      }
      return {
        ...sec,
        pools: [...sec.pools, adjBlock],
        net: r2(sec.net + residual),
      }
    })
  }

  const netChange = r2(sections.reduce((s, sec) => s + sec.net, 0))

  return { sections, netChange, openingCash, closingCash }
}

// Distinct GL codes of active bank_accounts — same source the Balance Sheet
// uses for its `bank` line (see fetchBalanceSheet step 3).
async function fetchActiveBankCodes(supabase: SupabaseClient): Promise<string[]> {
  const { data: bankRows } = await supabase
    .from('bank_accounts')
    .select('gl_account_code')
    .eq('status', 'active')
  return Array.from(
    new Set(
      (bankRows ?? [])
        .map((b) => (b.gl_account_code as string | null) ?? '')
        .filter((c): c is string => !!c),
    ),
  )
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
  args: { asOf: string; codes: string[]; sign: 'dr-cr' | 'cr-dr' },
): Promise<number> {
  const { asOf, codes, sign } = args
  if (codes.length === 0) return 0
  // Join-filtered — the old jeIds-in-the-URL version 400s once history grows
  // past a few thousand entries (see gatherTreasury).
  const lines = (await fetchAllRows((lo, hi) => supabase
    .from('journal_lines')
    .select('debit, credit, journal_entries!inner(transaction_date, is_reversed)')
    .in('account_code', codes)
    .lte('journal_entries.transaction_date', asOf)
    .eq('journal_entries.is_reversed', false)
    .order('id', { ascending: true })
    .range(lo, hi))) as Record<string, unknown>[]
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

  // ── 1: (removed) — balances are summed via join-filtered queries keyed on
  //    asOf; no JE id set is materialised (URL-size failure class).

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
  const bank = await sumGlNetAcrossCodes(supabase, { asOf, codes: bankCodes, sign: 'dr-cr' })

  // ── 4: Named asset line items (post-mig 238 codes):
  //    Accounts Receivable = 3030, Loans Receivable = 3020.
  // Both are headers with a child per counterparty — 3020 always was, 3030
  // since 2026-09-29 — and the postings live on the children, so the family
  // has to be summed. Reading the bare parent returned zero.
  const [arCodes, loanCodes] = await Promise.all([
    accountFamily(supabase, AR_CODE),
    accountFamily(supabase, LOANS_RECEIVABLE_CODE),
  ])
  const invoiceReceivable = await sumGlNetAcrossCodes(
    supabase,
    { asOf, codes: arCodes, sign: 'dr-cr' },
  )
  const loanReceivable = await sumGlNetAcrossCodes(
    supabase,
    { asOf, codes: loanCodes, sign: 'dr-cr' },
  )

  // ── 5: Fixed assets total (2xxx range, fixed_asset type).
  const fixedAssets = await sumGlNetAcrossCodes(
    supabase,
    { asOf, codes: codesByType.fixed_asset, sign: 'dr-cr' },
  )

  // ── 6: Total assets across every asset-type + fixed_asset account.
  //    otherAssets = residual once named line items are subtracted.
  const currentAssetsTotal = await sumGlNetAcrossCodes(
    supabase,
    { asOf, codes: codesByType.asset, sign: 'dr-cr' },
  )
  const totalAssets = currentAssetsTotal + fixedAssets
  const otherAssets = currentAssetsTotal - bank - invoiceReceivable - loanReceivable

  // ── 7: Total liabilities — sum every liability-type account.
  const fundSourcesPayable = await sumGlNetAcrossCodes(
    supabase,
    { asOf, codes: codesByType.liability, sign: 'cr-dr' },
  )

  // ── 8: Permanent equity balances (excl. retained earnings YTD).
  // Mig 248 split: equityBalances = real equity only; internal-fund rows are
  // listed individually so the BS UI can render them in a separate section.
  const equityBalances = await sumGlNetAcrossCodes(
    supabase,
    { asOf, codes: realEquityCodes, sign: 'cr-dr' },
  )
  const internalFundLines: InternalFundLine[] = []
  for (const acc of internalFundAccounts) {
    const balance = await sumGlNetAcrossCodes(
      supabase,
      { asOf, codes: [acc.code], sign: 'cr-dr' },
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
  if (!isCalendarDay(asOf)) throw new Error(`fetchTrialBalance: ${asOf} is not a date`)

  // The balances need nothing from the chart of accounts, so both start at
  // once (2026-10-08 — it was the COA, then five pages of every journal line
  // one after another). The COA's failure is still the one reported first.
  const netRead = startedEarly(
    fetchNetByAccount(supabase, dayjs(asOf).add(1, 'day').format('YYYY-MM-DD'), null, 'fetchTrialBalance lines'),
  )

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

  // ── 2-3: Per-leaf-account net (Dr − Cr) over all non-reversed entries dated
  //    on/before asOf — summed by the database (fetchNetByAccount), so the
  //    PostgREST 1,000-row cap that once truncated this sum (2026-06-16: 1,939
  //    lines → TB short by ~RM 100k) has nothing left to cut: one row per
  //    account.
  const leafSet = new Set(leafAccounts.map((a) => a.code))
  const netByCode = new Map<string, number>()
  for (const [code, net] of await netRead) {
    if (leafSet.has(code)) netByCode.set(code, net)
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
  segment: string    // journal_entries.segment (department / pool tag)
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
  segment: string
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
      segment: '',
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
      segment: raw.segment,
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
  if (refs.length === 0) return new Map<string, string>()
  return sourceDescriptionsFrom(
    await readLedgerSourceRows(supabase, refs, SOURCE_DESCRIPTION_COLUMNS, 'resolveSourceDescriptions'),
  )
}

// ── The rows behind both resolvers (2026-10-08) ──────────────────────────────
// The Ledger used to ask for the SAME invoices and payment vouchers twice — once
// for descriptions, once for Journal Type + Ref — four reads in a row. Now one
// read per table serves both, the two tables go at once, and the ids are
// chunked (fetchByKeys): a period's worth of ids in one `.in()` builds the URL
// that fails outright past a few hundred ids (paginate.ts), and an unpaged
// `.in()` past 1,000 ids would silently drop rows. A table's failure is still
// reported as it was — invoices before payment_vouchers.

interface LedgerSourceRow {
  id: string
  description?: string | null
  invoice_no?: string | null
  voucher_no?: string | null
  direction?: string | null
}

interface LedgerSourceRows {
  invoices: LedgerSourceRow[]
  vouchers: LedgerSourceRow[]
}

const SOURCE_DESCRIPTION_COLUMNS = { invoices: 'id, description', vouchers: 'id, description' }
const SOURCE_META_COLUMNS = { invoices: 'id, invoice_no', vouchers: 'id, voucher_no, direction' }
const LEDGER_SOURCE_COLUMNS = {
  invoices: 'id, description, invoice_no',
  vouchers: 'id, description, voucher_no, direction',
}

async function readLedgerSourceRows(
  supabase: SupabaseClient,
  refs: Array<{ referenceType: string; referenceId: string }>,
  columns: { invoices: string; vouchers: string },
  label: string,
): Promise<LedgerSourceRows> {
  const invoiceIds = new Set<string>()
  const pvIds = new Set<string>()
  for (const r of refs) {
    if (r.referenceType === 'invoice') invoiceIds.add(r.referenceId)
    else if (r.referenceType === 'payment_voucher') pvIds.add(r.referenceId)
  }
  type Chunk = PromiseLike<{ data: LedgerSourceRow[] | null; error: { message: string } | null }>
  const [invoices, vouchers] = await Promise.allSettled([
    fetchByKeys<LedgerSourceRow, string>(
      Array.from(invoiceIds),
      (chunk) => supabase.from('invoices').select(columns.invoices).in('id', chunk) as unknown as Chunk,
      `${label} invoices`,
    ),
    fetchByKeys<LedgerSourceRow, string>(
      Array.from(pvIds),
      (chunk) => supabase.from('payment_vouchers').select(columns.vouchers).in('id', chunk) as unknown as Chunk,
      `${label} payment_vouchers`,
    ),
  ])
  if (invoices.status === 'rejected') throw invoices.reason
  if (vouchers.status === 'rejected') throw vouchers.reason
  return { invoices: invoices.value, vouchers: vouchers.value }
}

function sourceDescriptionsFrom(rows: LedgerSourceRows): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows.invoices) {
    const desc = r.description?.trim()
    if (desc) out.set(`invoice:${r.id}`, desc)
  }
  for (const r of rows.vouchers) {
    const desc = r.description?.trim()
    if (desc) out.set(`payment_voucher:${r.id}`, desc)
  }
  return out
}

function sourceMetaFrom(rows: LedgerSourceRows): Map<string, { journalType: string; ref: string }> {
  const out = new Map<string, { journalType: string; ref: string }>()
  for (const r of rows.invoices) {
    out.set(`invoice:${r.id}`, { journalType: 'SALES', ref: r.invoice_no ?? '' })
  }
  for (const r of rows.vouchers) {
    out.set(`payment_voucher:${r.id}`, {
      journalType: r.direction === 'credit' ? 'RECEIPT' : 'PAYMENT',
      ref: r.voucher_no ?? '',
    })
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
  if (refs.length === 0) return new Map<string, { journalType: string; ref: string }>()
  return sourceMetaFrom(await readLedgerSourceRows(supabase, refs, SOURCE_META_COLUMNS, 'resolveLedgerSourceMeta'))
}

// ────────────────────────────────────────────────────────────────────────────
// Multi-account General Ledger — batched fetch for N accounts at once.
//
// codes=[] means "every postable leaf account". One round-trip set for opening
// balances (all accounts), one for period JEs, one for period lines, one
// source-description lookup. Returns one Ledger per requested account, in the
// canonical TB type order (asset · fixed_asset · liability · equity · revenue ·
// cost · other_income · expense), then by code within each type.
//
// Nothing waits for what it does not need (2026-10-08). The page used to cost
// 12 round trips in a row: the COA twice, the opening balance's four pages,
// the period JEs, the source lookups four reads deep, then the period lines.
// Now the period JEs (and the source lookups behind them) start at once; the
// opening and period lines start as soon as the leaf codes are known — at
// once too when the codes are given, since valid codes ARE the leaf set — and
// the pages of each go together. Every read is still AWAITED in the old order,
// so the first failure reported is the one the old code reported; a read
// started early is marked handled, so one left unawaited (an earlier step
// threw or returned) is not an unhandled rejection.
// ────────────────────────────────────────────────────────────────────────────

/** The chart_of_accounts columns fetchLedgers reads. */
export interface LedgerCoaRow {
  code: string
  name: string
  type: string
  parent_code: string | null
  is_active: boolean
}

export async function fetchLedgers(
  supabase: SupabaseClient,
  args: {
    codes: string[]
    from: string
    to: string
    /** The caller's own read of the ACTIVE chart of accounts, when it has one
     *  (the Ledger page needs it for its picker — it was read twice). Same
     *  columns and filter as the read below; its order does not matter, the
     *  accounts are sorted here. */
    coa?: PromiseLike<{ data: LedgerCoaRow[] | null; error: { message: string } | null }>
  },
): Promise<Ledger[]> {
  const { codes, from, to } = args

  // ── 3 (started first): Period JEs with metadata for the description
  //    override — they need nothing from the accounts. ──
  const periodJesRead = startedEarly(
    fetchAllRowsParallel(
      (lo, hi, withCount) =>
        supabase
          .from('journal_entries')
          .select('id, entry_no, transaction_date, description, reference_type, reference_id, segment', withCount ? { count: 'exact' } : undefined)
          .gte('transaction_date', from)
          .lte('transaction_date', to)
          .eq('is_reversed', false)
          .order('transaction_date', { ascending: true })
          .order('entry_no', { ascending: true })
          .order('id', { ascending: true })
          .range(lo, hi),
      'fetchLedgers period entries',
    ),
  )
  // ── 4 (started as soon as the JEs are in): source-description override and
  //    Journal Type / Ref (invoices / payment_vouchers) — ONE read per table
  //    serves both (it was two). ──
  const sourcesRead = startedEarly(
    periodJesRead.then((periodJes) => {
      const refs: Array<{ referenceType: string; referenceId: string }> = []
      for (const j of periodJes) {
        const t = j.reference_type as string | null
        const id = j.reference_id as string | null
        if (t && id) refs.push({ referenceType: t, referenceId: id })
      }
      return refs.length === 0
        ? { invoices: [], vouchers: [] }
        : readLedgerSourceRows(supabase, refs, LEDGER_SOURCE_COLUMNS, 'resolveSourceDescriptions')
    }),
  )

  // ── 2 + 5: once the leaf codes are known — the opening balances summed by
  //    the database (fetchNetByAccount: one row per account, not every line
  //    before the period), the period's lines join-filtered (the old version
  //    materialised EVERY pre-from JE id into the request URL and started
  //    400ing — "Bad Request", found 2026-08-13 — once history passed a few
  //    thousand entries). ──
  const readOpening = (leafCodes: string[]) =>
    startedEarly(fetchNetByAccount(supabase, from, leafCodes, 'fetchLedgers opening'))
  const readPeriodLines = (leafCodes: string[]) =>
    startedEarly(
      fetchAllRowsParallel(
        (lo, hi, withCount) =>
          supabase
            .from('journal_lines')
            .select('id, entry_id, account_code, debit, credit, journal_entries!inner(transaction_date, is_reversed)', withCount ? { count: 'exact' } : undefined)
            .in('account_code', leafCodes)
            .gte('journal_entries.transaction_date', from)
            .lte('journal_entries.transaction_date', to)
            .eq('journal_entries.is_reversed', false)
            .order('id', { ascending: true })
            .range(lo, hi),
        'fetchLedgers lines',
      ),
    )
  // Given codes need nothing from the COA: if they are valid leaves (checked
  // below, before any line is used) they are exactly the leaf set.
  const givenCodes = codes.length > 0 ? Array.from(new Set(codes)) : null
  let openingRead = givenCodes ? readOpening(givenCodes) : null
  let periodLinesRead = givenCodes ? readPeriodLines(givenCodes) : null

  // ── 1: Resolve the leaf accounts. If codes given, use those (and verify
  //    none are headers); else pick every leaf. ──
  const { data: coaRows, error: coaErr }: { data: LedgerCoaRow[] | null; error: { message: string } | null } =
    await (args.coa ??
      supabase
        .from('chart_of_accounts')
        .select('code, name, type, parent_code, is_active')
        .eq('is_active', true))
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
  openingRead ??= readOpening(leafCodes)
  periodLinesRead ??= readPeriodLines(leafCodes)

  // ── 2: Opening balances. Σ (Dr − Cr) for every line on a non-reversed JE
  //    with transaction_date < from, per account. ──
  const openingByCode = await openingRead

  // ── 3: Period JEs (read since the start). ──
  const periodJes2 = await periodJesRead

  // ── 4: Source-description override + Journal Type / Ref. ──
  const sourceRows = await sourcesRead
  const descOverrides = sourceDescriptionsFrom(sourceRows)
  const srcMeta = sourceMetaFrom(sourceRows)

  const jeById = new Map<
    string,
    { entryNo: string; transactionDate: string; description: string; journalType: string; ref: string; segment: string }
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
      segment: (j.segment as string | null) ?? '',
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
    segment: string
    debit: number
    credit: number
  }
  const linesByCode = new Map<string, LineWithMeta[]>()
  for (const c of leafCodes) linesByCode.set(c, [])
  {
    // Join-filtered — same URL-size fix as the opening query; JE metadata
    // still comes from jeById (built above from the period JE fetch).
    const lines = (await periodLinesRead) as Record<string, unknown>[]
    for (const l of lines) {
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
        segment: je.segment,
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
      segment: l.segment,
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
