import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { fundingSourceFromTerms } from '@/lib/utils'
import { loadRepaymentBook } from '@/lib/repayment-book'
import { overdueOf } from '@/lib/repayment-calendar'
import { withCode, type FundRecord, type FundStatus } from '@/lib/fund-hub'

// Fund OUT's hub reads (2026-10-15, the Finance revamp v2 — D12): every loan
// with its borrower, what is still owed on it (`loan_outstanding`), whether an
// instalment is past its day unpaid (its repayment plan, as everywhere Fund
// OUT says overdue — OVERDUE IS READ LIVE), who made and approved it, and a
// pending one's approval request where this reader may see it.

type LoanRow = {
  id: string
  company_id: string
  principal: number | string
  effective_rate: number | string
  tenure_months: number | null
  disbursement_date: string | null
  repayment_terms: string | null
  status: 'pending_approval' | 'active' | 'fully_repaid' | 'cancelled'
  compound_interest: boolean | null
  min_pay_interest: boolean | null
  created_by: string | null
  created_at: string
  approved_by: string | null
  approved_at: string | null
}

const STATUS: Record<LoanRow['status'], FundStatus> = { pending_approval: 'pending_approval', active: 'active', fully_repaid: 'repaid', cancelled: 'cancelled' }

export async function loadLoanHub(supabase: SupabaseClient, today: string): Promise<FundRecord[]> {
  const [{ data: loans, error }, { data: companies }, { data: outstandingRows }, book, { data: pendingRequests }] = await Promise.all([
    supabase
      .from('loans')
      .select('id, company_id, principal, effective_rate, tenure_months, disbursement_date, repayment_terms, status, compound_interest, min_pay_interest, created_by, created_at, approved_by, approved_at')
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    // Overdue = an instalment past its day unpaid, on each active loan's plan.
    loadRepaymentBook(supabase, today, { only: 'collect' }),
    // A pending loan's request, and a cancellation filed on an active one — what this reader's rows show (it may come back empty).
    supabase.from('approval_requests').select('id, reference_id, request_type, submitted_by').eq('reference_table', 'loans').in('request_type', ['new_loan', 'loan_cancel']).eq('status', 'pending'),
  ])
  if (error) throw new Error('Unable to load the loans. Please try again.')
  const rows = (loans ?? []) as LoanRow[]

  const userIds = [...new Set(rows.flatMap((l) => [l.created_by, l.approved_by]).filter((x): x is string => !!x))]
  const people = await fetchByKeys<{ id: string; name: string }, string>(userIds, (chunk) => supabase.from('users').select('id, name').in('id', chunk), 'loan hub users').catch(() => [])
  const names = new Map(people.map((u) => [u.id, u.name]))
  const company = new Map(((companies ?? []) as Array<{ id: string; name: string; short_code: string | null }>).map((c) => [c.id, c]))
  const owed = new Map(((outstandingRows ?? []) as Array<{ loan_id: string; outstanding: number | string; total_principal_paid: number | string }>).map((o) => [o.loan_id, o]))
  const lateBy = new Map<string, { amount: number; since: string; days: number }>()
  for (const deal of book) {
    const late = overdueOf(deal.plan, today)
    if (late) lateBy.set(deal.id, { amount: late.outstanding, since: late.oldestDue, days: late.daysPast })
  }
  const pendingReqs = (pendingRequests ?? []) as Array<{ id: string; reference_id: string; request_type: string; submitted_by: string | null }>
  const requests = new Map(pendingReqs.filter((r) => r.request_type === 'new_loan').map((r) => [r.reference_id, { id: r.id, submittedBy: r.submitted_by }]))
  const cancelling = new Set(pendingReqs.filter((r) => r.request_type === 'loan_cancel').map((r) => r.reference_id))

  return rows.map((l) => {
    const c = company.get(l.company_id)
    const o = owed.get(l.id)
    const status = STATUS[l.status] ?? 'cancelled'
    const unscheduled = isLoanUnscheduled(l.repayment_terms)
    return {
      id: l.id,
      side: 'out',
      party: c ? withCode(c.name, c.short_code) : '—',
      type: 'loan',
      typeLabel: 'Loan out',
      amount: Number(l.principal),
      outstanding: status === 'active' ? Number(o?.outstanding ?? l.principal) : null,
      rate: Number(l.effective_rate),
      status,
      overdue: status === 'active' ? (lateBy.get(l.id) ?? null) : null,
      date: l.disbursement_date,
      createdAt: l.created_at,
      createdBy: l.created_by ? (names.get(l.created_by) ?? null) : null,
      approvedAt: l.approved_at,
      approvedBy: l.approved_by ? (names.get(l.approved_by) ?? null) : null,
      maturity: !unscheduled && l.disbursement_date && l.tenure_months ? addMonths(l.disbursement_date, Number(l.tenure_months)) : null,
      months: unscheduled || !l.tenure_months ? null : Number(l.tenure_months),
      compound: l.compound_interest === true,
      minPayInterest: l.min_pay_interest === true,
      fundingSource: fundingSourceFromTerms(l.repayment_terms),
      notes: l.repayment_terms,
      bank: null,
      account: null,
      approval: status === 'pending_approval' ? (requests.get(l.id) ?? null) : null,
      decidable: false,
      cancelPending: status === 'active' && cancelling.has(l.id),
      repaid: Number(o?.total_principal_paid ?? 0),
      repaidAt: null,
      repaidBy: null,
    }
  })
}

/** "2026-01-31" + 1 month → "2026-02-28" — the day the term ends, clamped to the month's last. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}
