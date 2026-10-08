// Server-side data builder for the Company Statement — one source of truth
// shared by the /reports/company-statement page AND its xlsx/pdf export, so
// screen and file can't drift apart. Query set + counterparty resolution
// mirror lib/loan-monitor; maths live in lib/counterparty-statement.

import { officeMonth } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { buildTermsSegments } from '@/lib/treasury-terms'
import {
  fetchTermsHistory,
  isFundSourcePrincipal,
  isLoanPrincipal,
  paidByMonthByType,
  principalPaidByMonth,
  termsForFundSource,
  termsForLoan,
} from '@/lib/treasury-terms-data'
import { fundingSourceFromTerms, lentToFromNotes } from '@/lib/utils'
import {
  buildPositionRow,
  groupStatement,
  type CounterpartyRow,
  type PositionInput,
  type PositionRow,
  type StatementTotals,
} from '@/lib/counterparty-statement'

export interface CounterpartyStatementData {
  rows: CounterpartyRow[]
  totals: StatementTotals
  currentYM: string
}

export async function fetchCounterpartyStatement(
  supabase: SupabaseClient,
): Promise<CounterpartyStatementData> {
  const currentYM = officeMonth()

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
      .select(
        'id, company_id, principal, effective_rate, tenure_months, status, repayment_terms, compound_interest, disbursement_date, repayment_start_month, min_pay_interest, terms_effective_from',
      )
      .eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, name, short_code'),
    fetchAllRows((lo, hi) =>
      supabase
        .from('repayments')
        .select('loan_id, amount, payment_date, payment_type')
        .order('id', { ascending: true })
        .range(lo, hi),
    ),
    supabase
      .from('fund_sources')
      .select(
        'id, source_type, from_company_id, from_director_id, from_department_id, from_freetext_name, amount, cost_rate, lock_in_months, effective_date, status, compound_interest, repayment_start_month, notes, min_pay_interest, terms_effective_from',
      )
      .in('status', ['active', 'matured']),
    supabase.from('fund_source_outstanding').select('fund_source_id, outstanding, total_principal_paid'),
    fetchAllRows((lo, hi) =>
      supabase
        .from('fund_source_repayments')
        .select('fund_source_id, amount, payment_date, payment_type')
        .order('id', { ascending: true })
        .range(lo, hi),
    ),
    supabase.from('directors').select('id, name'),
    supabase.from('departments').select('id, name'),
  ])

  const r2 = (n: number) => Math.round(n * 100) / 100
  // Terms that changed mid-life (2026-09-21): earlier segments per record,
  // plus the per-month repayment splits a later segment re-bases on / the
  // statement compares against.
  const [loanHist, fsHist] = await Promise.all([
    fetchTermsHistory(supabase, 'loan', (loans ?? []).map(l => l.id as string)),
    fetchTermsHistory(supabase, 'fund_source', (fsrcs ?? []).map(s => s.id as string)),
  ])
  const loanRepRows = (loanReps ?? []).map(rp => ({ id: rp.loan_id as string, amount: Number(rp.amount), payment_date: rp.payment_date as string, payment_type: (rp as { payment_type?: string }).payment_type ?? 'principal' }))
  const fsRepRows = (fsReps ?? []).map(rp => ({ id: rp.fund_source_id as string, amount: Number(rp.amount), payment_date: rp.payment_date as string, payment_type: (rp as { payment_type?: string }).payment_type ?? 'principal' }))
  const loanPrincipalByMonth = principalPaidByMonth(loanRepRows, isLoanPrincipal)
  const fsPrincipalByMonth = principalPaidByMonth(fsRepRows, isFundSourcePrincipal)
  const loanPaidByType = paidByMonthByType(loanRepRows, isLoanPrincipal)
  const fsPaidByType = paidByMonthByType(fsRepRows, isFundSourcePrincipal)
  const coById = new Map((companies ?? []).map(c => [c.id as string, c]))
  const dirById = new Map((directors ?? []).map(d => [d.id as string, d]))
  const deptById = new Map((departments ?? []).map(d => [d.id as string, d]))
  const loanOutBy = new Map((loanOut ?? []).map(o => [o.loan_id as string, o]))
  const fsOutBy = new Map((fsOut ?? []).map(o => [o.fund_source_id as string, o]))

  // All-time repayments per position grouped by calendar month — feeds the
  // 利滚利 balance roll-forward.
  const loanPayByMonth = new Map<string, Record<string, number>>()
  for (const rp of loanReps ?? []) {
    const id = rp.loan_id as string
    const ym = (rp.payment_date as string).slice(0, 7)
    const m = loanPayByMonth.get(id) ?? {}
    m[ym] = r2((m[ym] ?? 0) + Number(rp.amount))
    loanPayByMonth.set(id, m)
  }
  const fsPayByMonth = new Map<string, Record<string, number>>()
  for (const rp of fsReps ?? []) {
    const id = rp.fund_source_id as string
    const ym = (rp.payment_date as string).slice(0, 7)
    const m = fsPayByMonth.get(id) ?? {}
    m[ym] = r2((m[ym] ?? 0) + Number(rp.amount))
    fsPayByMonth.set(id, m)
  }

  // The same company must label identically on BOTH sides so the two
  // directions merge into one row (short_code preferred).
  const companyLabel = (id: string | null) => {
    if (!id) return null
    const co = coById.get(id)
    return co ? ((co.short_code as string | null) ?? (co.name as string)) : null
  }

  const inputs: PositionInput[] = []

  for (const l of loans ?? []) {
    const out = loanOutBy.get(l.id as string)
    inputs.push({
      id: l.id as string,
      side: 'collect',
      counterparty: companyLabel(l.company_id as string | null) ?? '—',
      principal: Number(l.principal),
      monthlyRate: Number(l.effective_rate),
      tenureMonths: l.tenure_months == null ? null : Number(l.tenure_months),
      compounding: (l as { compound_interest?: boolean }).compound_interest === true,
      unscheduled: isLoanUnscheduled(l.repayment_terms as string | null),
      startDate: l.disbursement_date as string | null,
      startMonth: (l as { repayment_start_month?: string | null }).repayment_start_month ?? null,
      principalPaid: Number(out?.total_principal_paid ?? 0),
      outstanding: Number(out?.outstanding ?? l.principal),
      paymentsByMonth: loanPayByMonth.get(l.id as string) ?? {},
      minPayInterest: (l as { min_pay_interest?: boolean }).min_pay_interest === true,
      source: fundingSourceFromTerms(l.repayment_terms as string | null),
      segments: buildTermsSegments(termsForLoan(l, loanHist.get(l.id as string) ?? []), loanPrincipalByMonth.get(l.id as string) ?? {}),
      principalByMonth: loanPrincipalByMonth.get(l.id as string) ?? {},
      paidByMonth: loanPaidByType.get(l.id as string) ?? {},
    })
  }

  for (const s of fsrcs ?? []) {
    const out = fsOutBy.get(s.id as string)
    // Resolution order mirrors Loan Monitor: company → department → freetext →
    // director.
    const counterparty =
      companyLabel(s.from_company_id as string | null) ??
      (s.from_department_id ? (deptById.get(s.from_department_id as string)?.name as string | undefined) : undefined) ??
      (s.from_freetext_name as string | null) ??
      (s.from_director_id ? (dirById.get(s.from_director_id as string)?.name as string | undefined) : undefined) ??
      '—'
    inputs.push({
      id: s.id as string,
      side: 'repay',
      counterparty,
      principal: Number(s.amount),
      monthlyRate: Number(s.cost_rate),
      tenureMonths: s.lock_in_months == null ? null : Number(s.lock_in_months),
      compounding: (s as { compound_interest?: boolean }).compound_interest === true,
      unscheduled: false,
      startDate: s.effective_date as string | null,
      startMonth: (s as { repayment_start_month?: string | null }).repayment_start_month ?? null,
      principalPaid: Number(out?.total_principal_paid ?? 0),
      outstanding: Number(out?.outstanding ?? s.amount),
      paymentsByMonth: fsPayByMonth.get(s.id as string) ?? {},
      minPayInterest: (s as { min_pay_interest?: boolean }).min_pay_interest === true,
      // Loan-to tag from the fund source's notes. 「借给: X」 parses to X, but
      // Finance fills plain labels too ("Conts - 60k", "Hookka" — 11 HC rows
      // 2026-08-06), so a note without the prefix IS the tag, verbatim.
      source:
        lentToFromNotes(s.notes as string | null) ??
        (((s.notes as string | null) ?? '').trim().slice(0, 60) || null),
      segments: buildTermsSegments(termsForFundSource(s, fsHist.get(s.id as string) ?? []), fsPrincipalByMonth.get(s.id as string) ?? {}),
      principalByMonth: fsPrincipalByMonth.get(s.id as string) ?? {},
      paidByMonth: fsPaidByType.get(s.id as string) ?? {},
    })
  }

  const positionRows = inputs
    .map(i => buildPositionRow(i, currentYM))
    .filter((r): r is PositionRow => r !== null)
  const { rows, totals } = groupStatement(positionRows)
  return { rows, totals, currentYM }
}
