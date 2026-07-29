// Assembles the Loan Aging report (user request 2026-07-24): BOTH directions —
// 应收 (Fund OUT loans we collect) and 应付 (Fund IN sources we repay) — each
// with an installment aging table plus a separate not-aged section for
// compounding / no-fixed-term positions (they have no due dates; user Q6:
// show them below in their own block).

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { fundingSourceFromTerms } from '@/lib/utils'
import { buildInstallmentAging, sumBuckets, type AgingBuckets, EMPTY_BUCKETS } from './loan-aging'
import type { MatrixColumn, MatrixRow } from './monthly-matrix'

const r2 = (n: number) => Math.round(n * 100) / 100

export interface AgingLine {
  key: string
  counterparty: string
  detail: string
  buckets: AgingBuckets
  /** 资金来源 badge (loans only — parsed from repayment_terms). */
  source?: string | null
}

export interface NoTermLine {
  key: string
  counterparty: string
  detail: string
  outstanding: number
  monthlyInterest: number
  source?: string | null
}

export interface AgingSide {
  aged: AgingLine[]
  totals: AgingBuckets
  noTerm: NoTermLine[]
  noTermOutstanding: number
}

export interface LoanAgingData {
  asOfYM: string
  collect: AgingSide
  repay: AgingSide
}

const money = (n: number) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function fetchLoanAgingData(supabase: SupabaseClient): Promise<LoanAgingData> {
  const asOfYM = dayjs().format('YYYY-MM')

  const [
    { data: loans },
    { data: loanOut },
    { data: companies },
    loanReps,
    { data: fsrcs },
    { data: fsOut },
    fsReps,
    { data: directors },
    { data: departments },
  ] = await Promise.all([
    supabase
      .from('loans')
      .select('id, company_id, principal, effective_rate, tenure_months, status, repayment_terms, compound_interest, disbursement_date')
      .eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding'),
    supabase.from('companies').select('id, name, short_code'),
    fetchAllRows((lo, hi) =>
      supabase.from('repayments').select('loan_id, amount').order('id', { ascending: true }).range(lo, hi),
    ),
    supabase
      .from('fund_sources')
      .select('id, source_type, from_company_id, from_director_id, from_department_id, from_freetext_name, amount, cost_rate, lock_in_months, effective_date, status, compound_interest')
      .in('status', ['active', 'matured']),
    supabase.from('fund_source_outstanding').select('fund_source_id, outstanding'),
    fetchAllRows((lo, hi) =>
      supabase.from('fund_source_repayments').select('fund_source_id, amount').order('id', { ascending: true }).range(lo, hi),
    ),
    supabase.from('directors').select('id, name, code'),
    supabase.from('departments').select('id, name'),
  ])

  const coById = new Map((companies ?? []).map((c) => [c.id as string, c]))
  const dirById = new Map((directors ?? []).map((d) => [d.id as string, d]))
  const deptById = new Map((departments ?? []).map((d) => [d.id as string, d]))
  const loanOutBy = new Map((loanOut ?? []).map((o) => [o.loan_id as string, Number(o.outstanding)]))
  const fsOutBy = new Map((fsOut ?? []).map((o) => [o.fund_source_id as string, Number(o.outstanding)]))

  const paidByLoan = new Map<string, number>()
  for (const rp of loanReps ?? []) {
    const id = rp.loan_id as string
    paidByLoan.set(id, r2((paidByLoan.get(id) ?? 0) + Number(rp.amount)))
  }
  const paidByFs = new Map<string, number>()
  for (const rp of fsReps ?? []) {
    const id = rp.fund_source_id as string
    paidByFs.set(id, r2((paidByFs.get(id) ?? 0) + Number(rp.amount)))
  }

  // ── 应收 — loans we collect ──
  const collectAged: AgingLine[] = []
  const collectNoTerm: NoTermLine[] = []
  for (const l of loans ?? []) {
    const co = l.company_id ? coById.get(l.company_id as string) : null
    const counterparty = (co?.short_code as string) ?? (co?.name as string) ?? '—'
    const principal = Number(l.principal)
    const rate = Number(l.effective_rate)
    const tenure = Number(l.tenure_months)
    const compounding = (l as { compound_interest?: boolean }).compound_interest === true
    const unscheduled = isLoanUnscheduled(l.repayment_terms as string | null)
    const source = fundingSourceFromTerms(l.repayment_terms as string | null)
    if (compounding || unscheduled || !(tenure > 0)) {
      collectNoTerm.push({
        key: l.id as string,
        counterparty,
        detail: `RM ${money(principal)} @ ${(rate * 100).toFixed(3)}%/mo · ${compounding ? '利滚利 compounding' : 'no fixed term'}`,
        outstanding: loanOutBy.get(l.id as string) ?? principal,
        monthlyInterest: r2(principal * rate),
        source,
      })
      continue
    }
    const disbYM = ((l.disbursement_date as string | null) ?? '').slice(0, 7)
    if (!disbYM) continue
    const buckets = buildInstallmentAging({
      principal,
      monthlyRate: rate,
      tenureMonths: tenure,
      firstDueYM: dayjs(`${disbYM}-01`).add(1, 'month').format('YYYY-MM'),
      asOfYM,
      totalPaid: paidByLoan.get(l.id as string) ?? 0,
    })
    if (buckets.total <= 0) continue // fully on track — aging is an exceptions report
    collectAged.push({
      key: l.id as string,
      counterparty,
      detail: `RM ${money(principal)} @ ${(rate * 100).toFixed(3)}%/mo · ${tenure}mo`,
      buckets,
      source,
    })
  }

  // ── 应付 — fund sources we repay ──
  const repayAged: AgingLine[] = []
  const repayNoTerm: NoTermLine[] = []
  for (const s of fsrcs ?? []) {
    const from = (s.from_company_id && coById.get(s.from_company_id as string)?.name) ||
      (s.from_department_id && deptById.get(s.from_department_id as string)?.name) ||
      (s.from_freetext_name as string | null) ||
      (s.from_director_id && dirById.get(s.from_director_id as string)?.name) ||
      '—'
    const amount = Number(s.amount)
    const rate = Number(s.cost_rate)
    const lockIn = s.lock_in_months == null ? null : Number(s.lock_in_months)
    const compounding = (s as { compound_interest?: boolean }).compound_interest === true
    if (compounding || !lockIn || lockIn <= 0) {
      repayNoTerm.push({
        key: s.id as string,
        counterparty: from as string,
        detail: `RM ${money(amount)} @ ${(rate * 100).toFixed(3)}%/mo · ${compounding ? '利滚利 compounding' : 'no fixed term'}${s.status === 'matured' ? ' · matured' : ''}`,
        outstanding: fsOutBy.get(s.id as string) ?? amount,
        monthlyInterest: r2(amount * rate),
      })
      continue
    }
    const effYM = ((s.effective_date as string | null) ?? '').slice(0, 7)
    if (!effYM) continue
    const buckets = buildInstallmentAging({
      principal: amount,
      monthlyRate: rate,
      tenureMonths: lockIn,
      firstDueYM: dayjs(`${effYM}-01`).add(1, 'month').format('YYYY-MM'),
      asOfYM,
      totalPaid: paidByFs.get(s.id as string) ?? 0,
    })
    if (buckets.total <= 0) continue
    repayAged.push({
      key: s.id as string,
      counterparty: from as string,
      detail: `RM ${money(amount)} @ ${(rate * 100).toFixed(3)}%/mo · ${lockIn}mo`,
      buckets,
    })
  }

  const side = (aged: AgingLine[], noTerm: NoTermLine[]): AgingSide => ({
    aged: aged.sort((a, b) => b.buckets.total - a.buckets.total),
    totals: aged.length ? sumBuckets(aged.map((a) => a.buckets)) : { ...EMPTY_BUCKETS },
    noTerm: noTerm.sort((a, b) => b.outstanding - a.outstanding),
    noTermOutstanding: r2(noTerm.reduce((s, x) => s + x.outstanding, 0)),
  })

  return { asOfYM, collect: side(collectAged, collectNoTerm), repay: side(repayAged, repayNoTerm) }
}

// ── Matrix shape (page render + xlsx/pdf export reuse the monthly-matrix kit) ──

export const AGING_COLUMNS: MatrixColumn[] = [
  { key: 'current', label: 'Due this month' },
  { key: 'm1', label: '1 month late' },
  { key: 'm2', label: '2 months late' },
  { key: 'm3', label: '3+ months late' },
  { key: 'total', label: 'Total due' },
]

export function agingSideRows(sideLabel: string, s: AgingSide): MatrixRow[] {
  const rows: MatrixRow[] = []
  for (const a of s.aged) {
    rows.push({
      key: `${sideLabel}:${a.key}`,
      label: `${a.counterparty} — ${a.detail}${a.source ? ` · SC ${a.source}` : ''}`,
      depth: 1,
      kind: 'account',
      values: [a.buckets.current, a.buckets.m1, a.buckets.m2, a.buckets.m3, a.buckets.total],
    })
  }
  rows.push({
    key: `${sideLabel}:total`,
    label: `${sideLabel} — Total`,
    depth: 0,
    kind: 'subtotal',
    tone: 'auto',
    values: [s.totals.current, s.totals.m1, s.totals.m2, s.totals.m3, s.totals.total],
  })
  for (const n of s.noTerm) {
    rows.push({
      key: `${sideLabel}:noterm:${n.key}`,
      label: `${n.counterparty} — ${n.detail} (not aged)`,
      depth: 1,
      kind: 'account',
      values: [0, 0, 0, 0, n.outstanding],
    })
  }
  if (s.noTerm.length > 0) {
    rows.push({
      key: `${sideLabel}:noterm-total`,
      label: `${sideLabel} — No fixed term outstanding (not aged)`,
      depth: 0,
      kind: 'subtotal',
      tone: 'ledger',
      values: [0, 0, 0, 0, s.noTermOutstanding],
    })
  }
  return rows
}
