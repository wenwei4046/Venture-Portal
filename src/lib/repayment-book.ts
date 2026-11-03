// The book around today (2026-10-09, the user's Claude Design handoff — the
// Overview's "Overdue instalments" and "Coming up · next 14 days"): every live
// deal's repayment plan (lib/repayment-plan), the same rows as its own page's
// Repayment schedule, read for the installments that still have something
// unpaid on them — before today, or within the days ahead.

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './paginate'
import { buildRepaymentPlan, type PlanPayment, type RepaymentPlan } from './repayment-plan'
import { fundSourceStart, loanStart } from './repayment-start'
import { fetchTermsHistory, isFundSourcePrincipal, isLoanPrincipal, termsForFundSource, termsForLoan } from './treasury-terms-data'

export interface BookDeal {
  /** collect = a loan (Fund OUT, they owe us); pay = a fund source (Fund IN, we owe). */
  kind: 'collect' | 'pay'
  id: string
  name: string
  href: string
  /** The company it is with: a loan's borrower, the company a fund source came
   *  from; null for a director, a department or a name (2026-10-12). */
  companyId?: string | null
  plan: RepaymentPlan
}

export interface BookEntry {
  kind: 'collect' | 'pay'
  id: string
  name: string
  href: string
  companyId?: string | null
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
      const entry: BookEntry = { kind: d.kind, id: d.id, name: d.name, href: d.href, companyId: d.companyId ?? null, due: r.due, no: r.no, months: d.plan.months, outstanding: r.outstanding }
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
 * every repayment, paginated). `only` reads one side (2026-10-12): the
 * Overdue page's Fund OUT, the Fund OUT list and a company's overdue need the
 * loans alone.
 */
export async function loadRepaymentBook(supabase: SupabaseClient, today: string, opts: { only?: 'collect' | 'pay' } = {}): Promise<BookDeal[]> {
  const loansToo = opts.only !== 'pay'
  const sourcesToo = opts.only !== 'collect'
  const none = Promise.resolve({ data: [] as Row[] })
  const [{ data: loans }, { data: sources }, { data: companies }, { data: departments }, loanReps, sourceReps, { data: directors }] = await Promise.all([
    loansToo
      ? supabase
          .from('loans')
          .select('id, company_id, principal, effective_rate, tenure_months, status, repayment_terms, compound_interest, disbursement_date, repayment_start_month, repayment_start_date, terms_effective_from, principal_per_month')
          .eq('status', 'active')
      : none,
    sourcesToo
      ? supabase
          .from('fund_sources')
          .select('id, status, amount, cost_rate, lock_in_months, compound_interest, effective_date, repayment_start_month, repayment_date, terms_effective_from, principal_per_month, from_company_id, from_department_id, from_director_id, from_freetext_name')
          .in('status', ['active', 'matured'])
      : none,
    supabase.from('companies').select('id, name, short_code'),
    sourcesToo ? supabase.from('departments').select('id, name') : none,
    loansToo
      ? fetchAllRows<Row>((lo, hi) => supabase.from('repayments').select('loan_id, amount, payment_date, payment_type').order('id', { ascending: true }).range(lo, hi))
      : Promise.resolve([] as Row[]),
    sourcesToo
      ? fetchAllRows<Row>((lo, hi) =>
          supabase.from('fund_source_repayments').select('fund_source_id, amount, payment_date, payment_type').order('id', { ascending: true }).range(lo, hi),
        )
      : Promise.resolve([] as Row[]),
    // A director's fund source goes by the director's name (2026-10-12).
    sourcesToo ? supabase.from('directors').select('id, name') : none,
  ])
  const loanList = (loans ?? []) as Row[]
  const sourceList = (sources ?? []) as Row[]
  const [loanHist, sourceHist] = await Promise.all([
    loanList.length ? fetchTermsHistory(supabase, 'loan', loanList.map((l) => l.id as string)) : Promise.resolve(new Map()),
    sourceList.length ? fetchTermsHistory(supabase, 'fund_source', sourceList.map((s) => s.id as string)) : Promise.resolve(new Map()),
  ])
  const companyOf = new Map(((companies ?? []) as Row[]).map((c) => [c.id as string, c]))
  const deptName = new Map(((departments ?? []) as Row[]).map((d) => [d.id as string, d.name as string]))
  const directorName = new Map(((directors ?? []) as Row[]).map((d) => [d.id as string, d.name as string]))
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

  const deals: BookDeal[] = []
  for (const l of loanList) {
    const id = l.id as string
    const co = l.company_id ? companyOf.get(l.company_id as string) : undefined
    deals.push({
      kind: 'collect',
      id,
      name: ((co?.name ?? co?.short_code) as string | undefined) ?? 'Loan',
      href: `/fund-out/${id}`,
      companyId: (l.company_id as string | null) ?? null,
      plan: buildRepaymentPlan({
        terms: termsForLoan(l as Parameters<typeof termsForLoan>[0], loanHist.get(id) ?? []),
        payments: loanPays.get(id) ?? [],
        isPrincipal: isLoanPrincipal,
        today,
        // Each instalment on the repayment start's day (2026-10-12).
        dueDay: loanStart(l).day,
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
      name: ((co?.name as string | undefined) ??
        (s.from_freetext_name as string | null) ??
        (s.from_director_id ? directorName.get(s.from_director_id as string) : null) ??
        (s.from_department_id ? deptName.get(s.from_department_id as string) : null) ??
        'Fund source') as string,
      href: `/fund-in/${id}`,
      companyId: (s.from_company_id as string | null) ?? null,
      plan: buildRepaymentPlan({
        terms: termsForFundSource(s as Parameters<typeof termsForFundSource>[0], sourceHist.get(id) ?? []),
        payments: sourcePays.get(id) ?? [],
        isPrincipal: isFundSourcePrincipal,
        today,
        dueDay: fundSourceStart(s).day,
        status: s.status as string,
      }),
    })
  }
  return deals
}
