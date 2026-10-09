// The book around today (2026-10-09, the user's Claude Design handoff — the
// Overview's "Overdue instalments" and "Coming up · next 14 days"): every live
// deal's repayment plan (lib/repayment-plan), the same rows as its own page's
// Repayment schedule, read for the installments that still have something
// unpaid on them — before today, or within the days ahead.

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './paginate'
import { buildRepaymentPlan, type PlanPayment, type RepaymentPlan } from './repayment-plan'
import { fetchTermsHistory, isFundSourcePrincipal, isLoanPrincipal, termsForFundSource, termsForLoan } from './treasury-terms-data'

export interface BookDeal {
  /** collect = a loan (Fund OUT, they owe us); pay = a fund source (Fund IN, we owe). */
  kind: 'collect' | 'pay'
  id: string
  name: string
  href: string
  plan: RepaymentPlan
}

export interface BookEntry {
  kind: 'collect' | 'pay'
  id: string
  name: string
  href: string
  /** YYYY-MM-DD */
  due: string
  no: number
  months: number | null
  /** What is unpaid on the installment. */
  outstanding: number
}

/** The installments still unpaid: before today (overdue), and from today to `days` ahead (upcoming). */
export function bookWindow(deals: readonly BookDeal[], today: string, days = 14): { overdue: BookEntry[]; upcoming: BookEntry[] } {
  const end = dayjs(today).add(days, 'day').format('YYYY-MM-DD')
  const overdue: BookEntry[] = []
  const upcoming: BookEntry[] = []
  for (const d of deals) {
    for (const r of d.plan.rows) {
      if (r.outstanding <= 0.005) continue
      const entry: BookEntry = { kind: d.kind, id: d.id, name: d.name, href: d.href, due: r.due, no: r.no, months: d.plan.months, outstanding: r.outstanding }
      if (r.due < today) overdue.push(entry)
      else if (r.due <= end) upcoming.push(entry)
    }
  }
  const byDue = (a: BookEntry, b: BookEntry) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name) || a.no - b.no
  return { overdue: overdue.sort(byDue), upcoming: upcoming.sort(byDue) }
}

type Row = Record<string, unknown>

/**
 * The live book: active loans and active / matured fund sources, each with
 * its plan. Reads what the deals' own pages read (their terms over time and
 * every repayment, paginated).
 */
export async function loadRepaymentBook(supabase: SupabaseClient, today: string): Promise<BookDeal[]> {
  const [{ data: loans }, { data: sources }, { data: companies }, { data: departments }, loanReps, sourceReps] = await Promise.all([
    supabase
      .from('loans')
      .select('id, company_id, principal, effective_rate, tenure_months, status, repayment_terms, compound_interest, disbursement_date, repayment_start_month, terms_effective_from')
      .eq('status', 'active'),
    supabase
      .from('fund_sources')
      .select('id, status, amount, cost_rate, lock_in_months, compound_interest, effective_date, repayment_start_month, terms_effective_from, from_company_id, from_department_id, from_freetext_name')
      .in('status', ['active', 'matured']),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('departments').select('id, name'),
    fetchAllRows<Row>((lo, hi) => supabase.from('repayments').select('loan_id, amount, payment_date, payment_type').order('id', { ascending: true }).range(lo, hi)),
    fetchAllRows<Row>((lo, hi) =>
      supabase.from('fund_source_repayments').select('fund_source_id, amount, payment_date, payment_type').order('id', { ascending: true }).range(lo, hi),
    ),
  ])
  const loanList = (loans ?? []) as Row[]
  const sourceList = (sources ?? []) as Row[]
  const [loanHist, sourceHist] = await Promise.all([
    loanList.length ? fetchTermsHistory(supabase, 'loan', loanList.map((l) => l.id as string)) : Promise.resolve(new Map()),
    sourceList.length ? fetchTermsHistory(supabase, 'fund_source', sourceList.map((s) => s.id as string)) : Promise.resolve(new Map()),
  ])
  const companyOf = new Map(((companies ?? []) as Row[]).map((c) => [c.id as string, c]))
  const deptName = new Map(((departments ?? []) as Row[]).map((d) => [d.id as string, d.name as string]))
  const grouped = (rows: Row[], key: string) => {
    const by = new Map<string, PlanPayment[]>()
    for (const r of rows) {
      const list = by.get(r[key] as string) ?? []
      list.push({ date: String(r.payment_date).slice(0, 10), type: r.payment_type as string, amount: Number(r.amount), ref: null })
      by.set(r[key] as string, list)
    }
    return by
  }
  const loanPays = grouped(loanReps, 'loan_id')
  const sourcePays = grouped(sourceReps, 'fund_source_id')
  const dayOf = (d: unknown) => (d ? dayjs(d as string).date() : 1)

  const deals: BookDeal[] = []
  for (const l of loanList) {
    const id = l.id as string
    const co = l.company_id ? companyOf.get(l.company_id as string) : undefined
    deals.push({
      kind: 'collect',
      id,
      name: ((co?.name ?? co?.short_code) as string | undefined) ?? 'Loan',
      href: `/fund-out/${id}`,
      plan: buildRepaymentPlan({
        terms: termsForLoan(l as Parameters<typeof termsForLoan>[0], loanHist.get(id) ?? []),
        payments: loanPays.get(id) ?? [],
        isPrincipal: isLoanPrincipal,
        today,
        dueDay: dayOf(l.disbursement_date),
        status: l.status as string,
      }),
    })
  }
  for (const s of sourceList) {
    const id = s.id as string
    const co = s.from_company_id ? companyOf.get(s.from_company_id as string) : undefined
    deals.push({
      kind: 'pay',
      id,
      name: ((co?.name as string | undefined) ?? (s.from_freetext_name as string | null) ?? (s.from_department_id ? deptName.get(s.from_department_id as string) : null) ?? 'Fund source') as string,
      href: `/fund-in/${id}`,
      plan: buildRepaymentPlan({
        terms: termsForFundSource(s as Parameters<typeof termsForFundSource>[0], sourceHist.get(id) ?? []),
        payments: sourcePays.get(id) ?? [],
        isPrincipal: isFundSourcePrincipal,
        today,
        dueDay: dayOf(s.effective_date),
        status: s.status as string,
      }),
    })
  }
  return deals
}
