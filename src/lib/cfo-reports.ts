// CFO-view report helpers (Item 7+8) — label-based aggregation that replaces
// the GL-account view. Reads from payment_voucher_sources joined to
// payment_categories (so Finance can rename a category in Settings and the
// report updates without touching code), and uses journal_entries.segment
// (mig 215+217) to attribute outflows to the right department / corporate
// bucket.

import type { SupabaseClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'

export type GlSegment =
  | 'treasury'
  | 'marketing'
  | 'hr'
  | 'finance'
  | 'director_office'
  | 'corporate'
  | 'unallocated'

export const SEGMENT_LABEL: Record<GlSegment, string> = {
  treasury: 'Treasury',
  marketing: 'Marketing',
  hr: 'HR',
  finance: 'Finance',
  director_office: 'Director Office',
  corporate: 'Corporate (group)',
  unallocated: 'Unallocated',
}

// Departments whose outflows roll up into "Dept outflow" bucket (B). Anything
// else (treasury / corporate / unallocated) flows into "General expenses" (C).
export const DEPT_SEGMENTS: GlSegment[] = ['marketing', 'hr', 'finance', 'director_office']

export interface CashflowLine {
  label: string
  amount: number
}

export interface CashflowBuckets {
  // A — money in
  sourceOfFund: CashflowLine[]
  totalIn: number
  // B — per-dept outflow, ordered, with sub-rows
  deptOutflow: Array<{ segment: GlSegment; lines: CashflowLine[]; total: number }>
  totalDeptOut: number
  // C — group-level expenses
  generalExpenses: CashflowLine[]
  totalGeneral: number
  // Net
  netChange: number
}

const FALLBACK_LABEL = 'Uncategorised'

// ────────────────────────────────────────────────────────────────────────────
// Cashflow: 3-bucket, label-based
// ────────────────────────────────────────────────────────────────────────────
export async function fetchCashflowBuckets(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<CashflowBuckets> {
  const { from, to } = args

  // 1) Paid vouchers in window (debit = out, credit = in)
  const { data: vouchers, error: vErr } = await supabase
    .from('payment_vouchers')
    .select('id, direction, amount, payment_date, status')
    .eq('status', 'paid')
    .gte('payment_date', from)
    .lte('payment_date', to)
  if (vErr) throw new Error(`fetchCashflowBuckets vouchers: ${vErr.message}`)

  const voucherIds = (vouchers ?? []).map((v) => v.id as string)
  if (voucherIds.length === 0) {
    return {
      sourceOfFund: [],
      totalIn: 0,
      deptOutflow: [],
      totalDeptOut: 0,
      generalExpenses: [],
      totalGeneral: 0,
      netChange: 0,
    }
  }

  // 2) Source rows for those vouchers (category_code + amount per source pool)
  const { data: sources, error: sErr } = await supabase
    .from('payment_voucher_sources')
    .select('voucher_id, category_code, amount')
    .in('voucher_id', voucherIds)
  if (sErr) throw new Error(`fetchCashflowBuckets sources: ${sErr.message}`)

  // 3) JE segment per voucher (mig 217 derives this; we just look it up)
  const { data: jes, error: jErr } = await supabase
    .from('journal_entries')
    .select('reference_id, segment')
    .eq('reference_type', 'payment_voucher')
    .eq('is_reversed', false)
    .in('reference_id', voucherIds)
  if (jErr) throw new Error(`fetchCashflowBuckets JEs: ${jErr.message}`)

  const segmentByVoucher = new Map<string, GlSegment>()
  for (const je of jes ?? []) {
    segmentByVoucher.set(je.reference_id as string, (je.segment ?? 'unallocated') as GlSegment)
  }

  // 4) Category labels — we want human names, not codes. Pull all (active +
  // inactive) so historical vouchers still resolve a label.
  const { data: cats, error: cErr } = await supabase
    .from('payment_categories')
    .select('code, label')
  if (cErr) throw new Error(`fetchCashflowBuckets categories: ${cErr.message}`)
  const labelByCode = new Map<string, string>()
  for (const c of cats ?? []) {
    labelByCode.set(c.code as string, (c.label as string) ?? c.code)
  }

  // Build voucher → direction map (in/out)
  const directionByVoucher = new Map<string, 'in' | 'out'>()
  for (const v of vouchers ?? []) {
    directionByVoucher.set(v.id as string, v.direction === 'credit' ? 'in' : 'out')
  }

  // Aggregators
  const inflowsByLabel = new Map<string, number>()
  const outflowsByDept = new Map<GlSegment, Map<string, number>>()
  const generalByLabel = new Map<string, number>()

  for (const src of sources ?? []) {
    const voucherId = src.voucher_id as string
    const direction = directionByVoucher.get(voucherId)
    if (!direction) continue
    const segment = segmentByVoucher.get(voucherId) ?? 'unallocated'
    const label = labelByCode.get(src.category_code as string) ?? FALLBACK_LABEL
    const amt = Number(src.amount ?? 0)
    if (amt === 0) continue

    if (direction === 'in') {
      inflowsByLabel.set(label, (inflowsByLabel.get(label) ?? 0) + amt)
      continue
    }

    // direction === 'out'
    if (DEPT_SEGMENTS.includes(segment)) {
      const m = outflowsByDept.get(segment) ?? new Map<string, number>()
      m.set(label, (m.get(label) ?? 0) + amt)
      outflowsByDept.set(segment, m)
    } else {
      generalByLabel.set(label, (generalByLabel.get(label) ?? 0) + amt)
    }
  }

  // Materialise + sort
  const sourceOfFund: CashflowLine[] = Array.from(inflowsByLabel.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)
  const totalIn = sourceOfFund.reduce((s, x) => s + x.amount, 0)

  const deptOutflow = DEPT_SEGMENTS.map((segment) => {
    const m = outflowsByDept.get(segment)
    const lines: CashflowLine[] = m
      ? Array.from(m.entries()).map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
      : []
    const total = lines.reduce((s, x) => s + x.amount, 0)
    return { segment, lines, total }
  }).filter((b) => b.lines.length > 0)
  const totalDeptOut = deptOutflow.reduce((s, b) => s + b.total, 0)

  const generalExpenses: CashflowLine[] = Array.from(generalByLabel.entries())
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)
  const totalGeneral = generalExpenses.reduce((s, x) => s + x.amount, 0)

  const netChange = totalIn - totalDeptOut - totalGeneral

  return {
    sourceOfFund,
    totalIn,
    deptOutflow,
    totalDeptOut,
    generalExpenses,
    totalGeneral,
    netChange,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Income Statement: per-dept P&L + group general expenses
// ────────────────────────────────────────────────────────────────────────────

export interface DeptPnl {
  segment: GlSegment
  revenue: number   // invoices issued in window with billing_mode mapping to this segment
  cost: number      // dept_pools expense_out + payroll
  margin: number
}

export interface IncomeStatement {
  perDept: DeptPnl[]
  groupGeneral: CashflowLine[]
  groupGeneralTotal: number
  groupRevenue: number
  groupDeptCost: number
  groupNetProfit: number
}

const BILLING_MODE_TO_SEGMENT: Record<string, GlSegment> = {
  marketing_project: 'marketing',
  hr_attribution: 'hr',
  finance_attribution: 'finance',
  director_office_attribution: 'director_office',
  director_attribution: 'director_office', // director CTC routed through Director Office segment
}

export async function fetchIncomeStatement(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<IncomeStatement> {
  const { from, to } = args

  // Revenue = invoices in window, allocated by billing_mode → segment.
  // invoice_status enum: draft | issued | paid | paid_via_netting (no 'cancelled').
  // Issued/paid/paid_via_netting all count as recognised revenue; draft means
  // not yet booked, so we exclude it.
  const { data: invoices, error: iErr } = await supabase
    .from('invoices')
    .select('total_amount, billing_mode, period_month, status')
    .gte('period_month', from)
    .lte('period_month', to)
    .in('status', ['issued', 'paid', 'paid_via_netting'])
  if (iErr) throw new Error(`fetchIncomeStatement invoices: ${iErr.message}`)

  const revenueBySegment = new Map<GlSegment, number>()
  for (const inv of invoices ?? []) {
    const seg = BILLING_MODE_TO_SEGMENT[inv.billing_mode as string]
    if (!seg) continue
    revenueBySegment.set(seg, (revenueBySegment.get(seg) ?? 0) + Number(inv.total_amount ?? 0))
  }

  // Dept costs = expense_out from dept_pools (already segment-aware via the
  // department_id → name → segment mapping).
  const { data: depts, error: dErr } = await supabase
    .from('departments')
    .select('id, name')
  if (dErr) throw new Error(`fetchIncomeStatement depts: ${dErr.message}`)
  const deptIdToSegment = new Map<string, GlSegment>()
  for (const d of depts ?? []) {
    const seg = mapDeptNameToSegment(d.name as string)
    if (seg) deptIdToSegment.set(d.id as string, seg)
  }

  const { data: deptPools, error: dpErr } = await supabase
    .from('dept_pools')
    .select('department_id, transaction_type, amount, created_at')
    .eq('transaction_type', 'expense_out')
    .gte('created_at', from)
    .lte('created_at', dayjs(to).endOf('day').toISOString())
  if (dpErr) throw new Error(`fetchIncomeStatement dept_pools: ${dpErr.message}`)

  const costBySegment = new Map<GlSegment, number>()
  for (const r of deptPools ?? []) {
    const seg = deptIdToSegment.get(r.department_id as string)
    if (!seg) continue
    costBySegment.set(seg, (costBySegment.get(seg) ?? 0) + Number(r.amount ?? 0))
  }

  // Build per-dept P&L
  const perDept: DeptPnl[] = DEPT_SEGMENTS.map((segment) => {
    const revenue = revenueBySegment.get(segment) ?? 0
    const cost = costBySegment.get(segment) ?? 0
    return { segment, revenue, cost, margin: revenue - cost }
  })

  // Group general expenses (corporate / unallocated) — pulled via the
  // cashflow general bucket so it stays aligned with the cashflow report.
  const buckets = await fetchCashflowBuckets(supabase, { from, to })
  const groupGeneral = buckets.generalExpenses
  const groupGeneralTotal = buckets.totalGeneral

  const groupRevenue = perDept.reduce((s, d) => s + d.revenue, 0)
  const groupDeptCost = perDept.reduce((s, d) => s + d.cost, 0)
  const groupNetProfit = groupRevenue - groupDeptCost - groupGeneralTotal

  return {
    perDept,
    groupGeneral,
    groupGeneralTotal,
    groupRevenue,
    groupDeptCost,
    groupNetProfit,
  }
}

function mapDeptNameToSegment(name: string): GlSegment | null {
  const n = name.toLowerCase()
  if (n === 'marketing') return 'marketing'
  if (n === 'hr') return 'hr'
  if (n === 'finance') return 'finance'
  if (n === 'director office') return 'director_office'
  return null
}

// ────────────────────────────────────────────────────────────────────────────
// Balance Sheet: per-segment snapshot
// ────────────────────────────────────────────────────────────────────────────

export interface BalanceLine {
  label: string
  amount: number
}

export interface SegmentSnapshot {
  segment: GlSegment | 'group'
  assets: BalanceLine[]
  liabilities: BalanceLine[]
  equity: BalanceLine[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
}

export interface BalanceSheet {
  asOf: string
  bank: number
  invoiceReceivable: number
  loanReceivable: number
  fundSourcesPayable: number
  retainedEarnings: number
  // Pre-computed group totals for the balance check
  totalAssets: number
  totalLiabilitiesEquity: number
  reconciles: boolean
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
  const { data: loanOuts } = await supabase
    .from('loan_outstanding')
    .select('outstanding')
  const loanReceivable = (loanOuts ?? []).reduce((s, l) => s + Number(l.outstanding ?? 0), 0)

  // 4) Fund sources payable — outstanding balances we owe to subs/directors/outsource
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
