// CFO-view report helpers — classification-driven aggregation.
//
// The Income Statement / Cash Flow / Balance Sheet are driven by:
//   - payment_categories.account_type  (asset | liability | equity | revenue | expense)
//     → decides WHICH statement a line belongs to and WHICH section (revenue vs expense)
//   - payment_voucher_sources.pool     → decides WHICH pool the money moved through
//
// This replaces the old GlSegment / journal_entries.segment bucketing.
// Loan/deposit *principal* movements (account_type asset/liability) go to the
// Balance Sheet & Cash Flow only — never the P&L. Treasury *interest*
// (GL 4010/4020 income, 5010 expense) is folded into the Venture Pool's P&L.
//
// The pure classification logic lives in `classifyRows` (testable without
// Supabase); the `fetch*` functions are thin wrappers that gather rows and
// call it.

import type { SupabaseClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'
import { poolLabel, comparePools } from './pools'

const VENTURE_POOL = 'venture_pool'

// ────────────────────────────────────────────────────────────────────────────
// Raw input row shapes (what `classifyRows` consumes)
// ────────────────────────────────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

export interface RawPvSourceRow {
  voucherId: string
  voucherType: string // 'expense' | 'loan_disbursement' | 'loan_repayment' | 'internal_transfer' | ...
  direction: 'credit' | 'debit' // credit = money in, debit = money out
  pool: string // payment_voucher_sources.pool
  categoryCode: string
  categoryLabel: string // payment_categories.label
  accountType: AccountType
  amount: number
}

export interface RawInvoiceRow {
  invoiceNo: string
  companyShortCode: string
  pool: string // derived from billing_mode (see INVOICE_BILLING_MODE_TO_POOL)
  amount: number // total_amount; counts as revenue inflow
}

export interface RawTreasury {
  interestIncome: number // GL 4010 net credit
  penaltyIncome: number // GL 4020 net credit
  interestExpense: number // GL 5010 net debit
}

// Fund-IN doesn't create a payment_voucher (the PV system is the single exit
// point for money OUT only — see mig 20260101000050). To make deposits
// received show up as cash inflow + BS liability increase we surface
// fund_sources rows separately.
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
  expenseLines: Line[]
  revenue: number
  expense: number
  margin: number
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
  groupExpense: number
  groupNetProfit: number
}

export interface PoolCashflow {
  pool: string
  poolLabel: string
  inflow: { fundIn: Line[]; revenue: Line[]; total: number }
  outflow: { capital: Line[]; expense: Line[]; total: number }
  net: number
}

export interface CashflowStatement {
  pools: PoolCashflow[]
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
//   marketing_project                       → dept_pool_marketing
//   hr_attribution / hr_pool_split          → dept_pool_hr
//   finance_attribution                     → dept_pool_finance
//   director_office_attribution /
//   director_attribution                    → dept_pool_director_office
//   fixed_split / non_billable / (other)    → venture_pool
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

interface PoolAcc {
  revenue: Map<string, number>
  expense: Map<string, number>
  inFundIn: Map<string, number>
  inRevenue: Map<string, number>
  outCapital: Map<string, number>
  outExpense: Map<string, number>
}

function emptyPoolAcc(): PoolAcc {
  return {
    revenue: new Map(),
    expense: new Map(),
    inFundIn: new Map(),
    inRevenue: new Map(),
    outCapital: new Map(),
    outExpense: new Map(),
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
    // via the journal-derived treasury section (GL 4010/4020/5010 in
    // `fetchTreasury`). If a categorised PV source row also tries to land in
    // P&L revenue/expense, it would double-count. Only honour BS-classified
    // rows (asset/liability/equity = principal movement) on these vouchers.
    if (
      (src.voucherType === 'loan_repayment' || src.voucherType === 'loan_disbursement') &&
      (src.accountType === 'revenue' || src.accountType === 'expense')
    ) {
      continue
    }
    const amt = Number(src.amount ?? 0)
    if (amt === 0) continue
    const isCredit = src.direction === 'credit'
    const p = acc(src.pool)
    const label = src.categoryLabel

    if (src.accountType === 'revenue') {
      // revenue row → P&L revenue (+amt if credit, -amt if debit) + cash inflow `revenue`
      const signed = isCredit ? amt : -amt
      bump(p.revenue, label, signed)
      bump(p.inRevenue, label, signed)
    } else if (src.accountType === 'expense') {
      // expense row → P&L expense (+amt if debit, -amt if credit) + cash outflow `expense`
      const signed = isCredit ? -amt : amt
      bump(p.expense, label, signed)
      bump(p.outExpense, label, signed)
    } else {
      // asset / liability / equity row → Balance-Sheet movement + Cash Flow only.
      //   credit → BS movement +amt, cash inflow `fundIn`
      //   debit  → BS movement -amt, cash outflow `capital`
      if (isCredit) {
        bump(p.inFundIn, label, amt)
        pushBalanceMovement(src.pool, label, amt)
      } else {
        bump(p.outCapital, label, amt)
        pushBalanceMovement(src.pool, label, -amt)
      }
    }
  }

  // ── 3: invoices — every invoice counts as revenue for its mapped pool ──
  for (const inv of invoices) {
    const amt = Number(inv.amount ?? 0)
    if (amt === 0) continue
    const p = acc(inv.pool)
    const label = `${inv.companyShortCode} · ${inv.invoiceNo}`
    bump(p.revenue, label, amt)
    bump(p.inRevenue, label, amt)
  }

  // ── 3b: fund_sources deposits received — cash inflow + BS liability increase ──
  // These never touch the P&L (principal, not income). Liability side: HV
  // owes the depositor back the principal, so the BS movement is +amount
  // (Fund sources payable rises).
  for (const fs of fundSourceInflows) {
    const amt = Number(fs.amount ?? 0)
    if (amt === 0) continue
    const p = acc(fs.pool)
    bump(p.inFundIn, fs.label, amt)
    pushBalanceMovement(fs.pool, fs.label, amt)
  }

  // ── 3c: loan principal received — cash inflow + BS asset decrease ──
  // Loans Receivable (asset) drops by the principal portion received, so the
  // BS movement is -amount even though cash is positive. The interest portion
  // is captured separately via the journal-derived treasury section.
  for (const rp of repaymentPrincipalInflows) {
    const amt = Number(rp.amount ?? 0)
    if (amt === 0) continue
    const p = acc(rp.pool)
    bump(p.inFundIn, rp.label, amt)
    pushBalanceMovement(rp.pool, rp.label, -amt)
  }

  // ── 4: treasury interest folded into the Venture Pool's P&L lines ──
  // NOTE: the cash effect of interest is already captured via the PV source
  // rows for interest payments/receipts, so we do NOT also add treasury to the
  // cash flow — the journal-derived treasury figure is for the P&L only.
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
  const cfPools: PoolCashflow[] = []

  for (const key of poolKeys) {
    const p = pools.get(key)!
    const revenueLines = linesFrom(p.revenue)
    const expenseLines = linesFrom(p.expense)
    const revenue = r2(revenueLines.reduce((s, l) => s + l.amount, 0))
    const expense = r2(expenseLines.reduce((s, l) => s + l.amount, 0))
    if (revenueLines.length > 0 || expenseLines.length > 0) {
      pnlPools.push({
        pool: key,
        poolLabel: poolLabel(key),
        revenueLines,
        expenseLines,
        revenue,
        expense,
        margin: r2(revenue - expense),
      })
    }

    const fundIn = linesFrom(p.inFundIn)
    const inRevenue = linesFrom(p.inRevenue)
    const capital = linesFrom(p.outCapital)
    const outExpense = linesFrom(p.outExpense)
    const inTotal = r2([...fundIn, ...inRevenue].reduce((s, l) => s + l.amount, 0))
    const outTotal = r2([...capital, ...outExpense].reduce((s, l) => s + l.amount, 0))
    if (fundIn.length || inRevenue.length || capital.length || outExpense.length) {
      cfPools.push({
        pool: key,
        poolLabel: poolLabel(key),
        inflow: { fundIn, revenue: inRevenue, total: inTotal },
        outflow: { capital, expense: outExpense, total: outTotal },
        net: r2(inTotal - outTotal),
      })
    }
  }

  // ── 6: group totals ──
  const groupRevenue = r2(pnlPools.reduce((s, p) => s + p.revenue, 0))
  const groupExpense = r2(pnlPools.reduce((s, p) => s + p.expense, 0))
  // treasury interest is already inside the Venture Pool's revenue/expense
  // lines, so groupNetProfit = Σ pool.margin — nothing extra added.
  const groupNetProfit = r2(pnlPools.reduce((s, p) => s + p.margin, 0))

  const income: IncomeStatement = {
    pools: pnlPools,
    treasury: { interestIncome, penaltyIncome, interestExpense, net: treasuryNet },
    groupRevenue,
    groupExpense,
    groupNetProfit,
  }

  const cashflow: CashflowStatement = {
    pools: cfPools,
    netChange: r2(cfPools.reduce((s, p) => s + p.net, 0)),
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

async function gatherPvSources(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawPvSourceRow[]> {
  const { from, to } = args

  // 1) Paid vouchers in window (excluding internal_transfer is handled in
  //    classifyRows, but we also keep voucher_type around to feed it).
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
    voucherMeta.set(v.id as string, {
      voucherType: (v.voucher_type as string) ?? 'expense',
      direction: v.direction === 'credit' ? 'credit' : 'debit',
    })
  }

  // 2) Their source rows.
  const { data: sources, error: sErr } = await supabase
    .from('payment_voucher_sources')
    .select('voucher_id, pool, category_code, amount')
    .in('voucher_id', voucherIds)
  if (sErr) throw new Error(`cfo-reports pv sources: ${sErr.message}`)

  // 3) Category lookup → label + account_type.
  const { data: cats, error: cErr } = await supabase
    .from('payment_categories')
    .select('code, label, account_type')
  if (cErr) throw new Error(`cfo-reports categories: ${cErr.message}`)
  const catByCode = new Map<string, { label: string; accountType: AccountType }>()
  for (const c of cats ?? []) {
    catByCode.set(c.code as string, {
      label: (c.label as string) ?? (c.code as string),
      accountType: c.account_type as AccountType,
    })
  }

  const rows: RawPvSourceRow[] = []
  for (const src of sources ?? []) {
    const voucherId = src.voucher_id as string
    const meta = voucherMeta.get(voucherId)
    if (!meta) continue
    const code = src.category_code as string | null
    const cat = code ? catByCode.get(code) : undefined
    if (!code || !cat) {
      // Per the design: no "Uncategorised" fallback — surface the data problem.
      throw new Error(
        `cfo-reports: payment_voucher_sources row for voucher ${voucherId} has ` +
          `${code ? `unknown category_code "${code}"` : 'a null category_code'} ` +
          `(every source row must reference an existing payment_categories.code)`,
      )
    }
    rows.push({
      voucherId,
      voucherType: meta.voucherType,
      direction: meta.direction,
      pool: src.pool as string,
      categoryCode: code,
      categoryLabel: cat.label,
      accountType: cat.accountType,
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

// Treasury revenue/expense from journal_lines (mig 48). 4010 = Interest Income
// — Loans, 4020 = Penalty Income, 5010 = Interest Expense — Fund Sources.
async function gatherTreasury(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<RawTreasury> {
  const { from, to } = args

  const { data: jes, error: jeErr } = await supabase
    .from('journal_entries')
    .select('id, transaction_date, is_reversed')
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .eq('is_reversed', false)
  if (jeErr) throw new Error(`cfo-reports treasury JEs: ${jeErr.message}`)

  const entryIds = (jes ?? []).map((j) => j.id as string)
  if (entryIds.length === 0) return { interestIncome: 0, penaltyIncome: 0, interestExpense: 0 }

  const { data: lines, error: lErr } = await supabase
    .from('journal_lines')
    .select('account_code, debit, credit, entry_id')
    .in('entry_id', entryIds)
    .in('account_code', ['4010', '4020', '5010'])
  if (lErr) throw new Error(`cfo-reports treasury lines: ${lErr.message}`)

  let interestIncome = 0
  let penaltyIncome = 0
  let interestExpense = 0
  for (const l of lines ?? []) {
    // Revenue accounts increase via credit; expense accounts increase via debit.
    if (l.account_code === '4010') interestIncome += Number(l.credit ?? 0) - Number(l.debit ?? 0)
    if (l.account_code === '4020') penaltyIncome += Number(l.credit ?? 0) - Number(l.debit ?? 0)
    if (l.account_code === '5010') interestExpense += Number(l.debit ?? 0) - Number(l.credit ?? 0)
  }
  return { interestIncome, penaltyIncome, interestExpense }
}

// Fund-IN inflows: fund_sources rows activated within [from, to]. The PV
// system is the single exit point for money OUT only (mig 50), so a fund-in
// deposit never creates a PV — gather it directly from fund_sources to make
// it visible on the Cash Flow + Balance Sheet. Pool = venture_pool (all
// deposits land in the Venture Pool, including the dept_pool → HV transfer
// in source_type='department_pool').
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

// Loan principal received from subsidiaries during the window. Interest /
// penalty / netting portions are captured via the journal-derived treasury
// section (and would double-count if we added them here).
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
// Balance Sheet — existing point-in-time snapshot, plus this-period capital
// movements (asset/liability/equity PV source rows) grouped by pool.
// The movement window is [startOfMonth(asOf) … asOf] — i.e. the current month
// up to the as-of date — matching the month picker the report pages use.
// ────────────────────────────────────────────────────────────────────────────

export interface BalanceSheet {
  asOf: string
  bank: number
  invoiceReceivable: number
  loanReceivable: number
  fundSourcesPayable: number
  retainedEarnings: number
  totalAssets: number
  totalLiabilitiesEquity: number
  reconciles: boolean
  movements: BalanceMovementLine[]
}

export async function fetchBalanceSheet(
  supabase: SupabaseClient,
  args: { asOf: string },
): Promise<BalanceSheet> {
  const { asOf } = args

  // 1) Bank cash = sum of bank_accounts.current_balance
  const { data: banks } = await supabase
    .from('bank_accounts')
    .select('current_balance')
    .eq('status', 'active')
  const bank = (banks ?? []).reduce((s, b) => s + Number(b.current_balance ?? 0), 0)

  // 2) AR — invoices issued but not yet paid
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total_amount, status, period_month')
    .lte('period_month', asOf)
    .in('status', ['issued', 'draft'])
  const invoiceReceivable = (invoices ?? []).reduce((s, i) => s + Number(i.total_amount ?? 0), 0)

  // 3) Loans receivable — sum loan_outstanding view
  const { data: loanOuts } = await supabase.from('loan_outstanding').select('outstanding')
  const loanReceivable = (loanOuts ?? []).reduce((s, l) => s + Number(l.outstanding ?? 0), 0)

  // 4) Fund sources payable — outstanding balances we owe
  const { data: fundSources } = await supabase
    .from('fund_sources')
    .select('amount, status')
    .in('status', ['active', 'matured'])
  const fundSourcesPayable = (fundSources ?? []).reduce((s, f) => s + Number(f.amount ?? 0), 0)

  // 5) Retained earnings YTD — net profit from start-of-fiscal to asOf
  const fiscalFrom = dayjs(asOf).startOf('year').format('YYYY-MM-DD')
  const ytd = await fetchIncomeStatement(supabase, { from: fiscalFrom, to: asOf })
  const retainedEarnings = ytd.groupNetProfit

  const totalAssets = bank + invoiceReceivable + loanReceivable
  const totalLiabilitiesEquity = fundSourcesPayable + retainedEarnings
  const reconciles = Math.abs(totalAssets - totalLiabilitiesEquity) < 1 // RM 1 tolerance

  // 6) Capital cash movements this period (current month up to asOf).
  const movFrom = startOfMonth(asOf)
  const movInput = await gatherAll(supabase, { from: movFrom, to: asOf })
  const movements = classifyRows(movInput).balanceMovements

  return {
    asOf,
    bank,
    invoiceReceivable,
    loanReceivable,
    fundSourcesPayable,
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
