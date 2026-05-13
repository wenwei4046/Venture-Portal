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
  companyShortCode: string
  pool: string // derived from billing_mode (see INVOICE_BILLING_MODE_TO_POOL)
  amount: number // total_amount; counts as revenue inflow
}

export interface RawTreasury {
  interestIncome: number // GL Interest Income net credit
  penaltyIncome: number // GL Penalty Income net credit
  interestExpense: number // GL Interest Expense net debit
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

export interface ClassifyInput {
  pvSources: RawPvSourceRow[]
  invoices: RawInvoiceRow[]
  treasury: RawTreasury
  fundSourceInflows?: RawFundSourceInflow[]
  repaymentPrincipalInflows?: RawRepaymentPrincipalInflow[]
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
  revenueLines: Line[]
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
  director_attribution: 'dept_pool_director_office',
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

export function classifyRows(input: ClassifyInput): ClassifyOutput {
  const { pvSources, invoices, treasury } = input
  const fundSourceInflows = input.fundSourceInflows ?? []
  const repaymentPrincipalInflows = input.repaymentPrincipalInflows ?? []

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
    // Rule 1b: on loan_repayment / loan_disbursement vouchers, the P&L portion
    // (interest income, penalty income, interest expense) is already captured
    // via the journal-derived treasury section. If a categorised PV source row
    // also tries to land in P&L revenue/cost/other_income/expense, it would
    // double-count. Only honour BS-classified rows (asset/fixed_asset/
    // liability/equity = principal movement) on these vouchers.
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

    // Rule 1c: billing_payment vouchers are settling an invoice (AR collection).
    // The revenue was already accrued when the invoice was issued (booked in
    // the invoices array below); the cash side here is just AR going down +
    // bank going up. Treat every source row as AR collection regardless of
    // the account picked: operating cash inflow + BS asset decrease, NEVER P&L.
    if (src.voucherType === 'billing_payment') {
      if (isCredit) {
        // Operating cash inflow (customer paid the invoice). AR (asset) goes
        // down by the same amount on the balance sheet.
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
    const label = `${inv.companyShortCode} · ${inv.invoiceNo}`
    bump(p.revenue, label, amt)
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
    const revenueLines = linesFrom(p.revenue)
    const costLines = linesFrom(p.cost)
    const otherIncomeLines = linesFrom(p.otherIncome)
    const expenseLines = linesFrom(p.expense)
    const revenue = r2(revenueLines.reduce((s, l) => s + l.amount, 0))
    const cost = r2(costLines.reduce((s, l) => s + l.amount, 0))
    const otherIncome = r2(otherIncomeLines.reduce((s, l) => s + l.amount, 0))
    const expense = r2(expenseLines.reduce((s, l) => s + l.amount, 0))
    const grossProfit = r2(revenue - cost)
    const margin = r2(grossProfit + otherIncome - expense)
    if (
      revenueLines.length > 0 ||
      costLines.length > 0 ||
      otherIncomeLines.length > 0 ||
      expenseLines.length > 0
    ) {
      pnlPools.push({
        pool: key,
        poolLabel: poolLabel(key),
        revenueLines,
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
    .select('invoice_no, total_amount, billing_mode, period_month, status, company_id, category_code')
    .gte('period_month', from)
    .lte('period_month', to)
    .in('status', INVOICE_REVENUE_STATUSES as unknown as string[])
  if (iErr) throw new Error(`cfo-reports invoices: ${iErr.message}`)
  if (!invoices || invoices.length === 0) return []

  const companyIds = Array.from(new Set(invoices.map((i) => i.company_id as string)))
  const { data: companies } = companyIds.length
    ? await supabase.from('companies').select('id, short_code').in('id', companyIds)
    : { data: [] as { id: string; short_code: string }[] }
  const shortCodeById = new Map((companies ?? []).map((c) => [c.id as string, c.short_code as string]))

  return invoices.map((inv) => ({
    invoiceNo: (inv.invoice_no as string) ?? '—',
    companyShortCode: shortCodeById.get(inv.company_id as string) ?? '—',
    pool: invoicePoolForBillingMode(inv.billing_mode as string | null),
    amount: Number(inv.total_amount ?? 0),
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
  let interestIncomeCode: string | null = null
  let penaltyIncomeCode: string | null = null
  let interestExpenseCode: string | null = null
  for (const [code, a] of accountByCode.entries()) {
    const n = a.name.toLowerCase()
    if (a.accountType === 'revenue' && n.includes('interest income')) interestIncomeCode = code
    else if (
      (a.accountType === 'revenue' || a.accountType === 'other_income') &&
      n.includes('penalty income')
    )
      penaltyIncomeCode = code
    else if (a.accountType === 'expense' && n.includes('interest expense')) interestExpenseCode = code
  }

  const { data: jes, error: jeErr } = await supabase
    .from('journal_entries')
    .select('id, transaction_date, is_reversed')
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .eq('is_reversed', false)
  if (jeErr) throw new Error(`cfo-reports treasury JEs: ${jeErr.message}`)

  const entryIds = (jes ?? []).map((j) => j.id as string)
  if (entryIds.length === 0) return { interestIncome: 0, penaltyIncome: 0, interestExpense: 0 }

  const watchCodes = [interestIncomeCode, penaltyIncomeCode, interestExpenseCode].filter(
    (c): c is string => !!c,
  )
  if (watchCodes.length === 0) return { interestIncome: 0, penaltyIncome: 0, interestExpense: 0 }

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
    if (code === interestIncomeCode) interestIncome += Number(l.credit ?? 0) - Number(l.debit ?? 0)
    if (code === penaltyIncomeCode) penaltyIncome += Number(l.credit ?? 0) - Number(l.debit ?? 0)
    if (code === interestExpenseCode) interestExpense += Number(l.debit ?? 0) - Number(l.credit ?? 0)
  }
  return { interestIncome, penaltyIncome, interestExpense }
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

async function gatherAll(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<ClassifyInput> {
  const [pvSources, invoices, treasury, fundSourceInflows, repaymentPrincipalInflows] =
    await Promise.all([
      gatherPvSources(supabase, args),
      gatherInvoices(supabase, args),
      gatherTreasury(supabase, args),
      gatherFundSourceInflows(supabase, args),
      gatherRepaymentPrincipalInflows(supabase, args),
    ])
  return { pvSources, invoices, treasury, fundSourceInflows, repaymentPrincipalInflows }
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

export interface BalanceSheet {
  asOf: string
  bank: number
  invoiceReceivable: number
  loanReceivable: number
  fixedAssets: number
  otherAssets: number // residual non-named asset-type accounts
  fundSourcesPayable: number // total liabilities (all liability-type COA)
  equityBalances: number // permanent equity-type COA (excl. retained earnings)
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
  const { data: coaRows } = await supabase
    .from('chart_of_accounts')
    .select('code, type')
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
  for (const r of coaRows ?? []) {
    const code = r.code as string
    const t = r.type as AccountType
    if (code && t in codesByType) codesByType[t].push(code)
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
  const equityBalances = await sumGlNetAcrossCodes(
    supabase,
    { jeIds, codes: codesByType.equity, sign: 'cr-dr' },
  )

  // ── 9: Retained earnings YTD — net profit from start-of-fiscal-year to asOf.
  const fiscalFrom = dayjs(asOf).startOf('year').format('YYYY-MM-DD')
  const ytd = await fetchIncomeStatement(supabase, { from: fiscalFrom, to: asOf })
  const retainedEarnings = ytd.groupNetProfit

  // ── 10: Balance check via the fundamental accounting equation.
  const totalLiabilitiesEquity = fundSourcesPayable + equityBalances + retainedEarnings
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
    retainedEarnings,
    totalAssets,
    totalLiabilitiesEquity,
    reconciles,
    movements,
  }
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
