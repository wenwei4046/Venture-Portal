import type { SupabaseClient } from '@supabase/supabase-js'
import type { createClient } from '@/lib/supabase/server'
import type { User } from '@/types'
import { officeMonth, officeTime, officeToday } from '@/lib/office-time'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { canDo } from '@/lib/permission-actions'
import { fundingSourceFromTerms } from '@/lib/utils'
import { buildRepaymentPlan, type RepaymentPlan } from '@/lib/repayment-plan'
import { loanStart, type RepaymentStart } from '@/lib/repayment-start'
import { overdueOf, type OverdueSummary } from '@/lib/repayment-calendar'
import { dealChangeLine, type DealChange } from '@/lib/deal-audit'
import { withCode } from '@/lib/fund-hub'
import { fullDay, type FullStep } from '@/components/finv/FullParts'
import { allTermsChanges, buildTermsSegments, currentSegment, type TermsChangeComparison, type TermsSegment } from '@/lib/treasury-terms'
import { fetchTermsHistory, isLoanPrincipal, paidByMonthByType, principalPaidByMonth, termsForLoan } from '@/lib/treasury-terms-data'
import { addMonths } from '../../_lib/loan-hub'

// A loan's page, read (2026-10-15 — moved out of `/fund-out/[id]/page.tsx`
// word for word, so the Finance phone app's record reads the same): the loan,
// its borrower, what is outstanding, its repayments, its terms over time and
// their changes, the repayment plan and what of it is late, a cancellation
// filed, the trail and the audit log (what the reader's permissions open), and
// what this reader may do to it.

type Client = Awaited<ReturnType<typeof createClient>>

/** "Auto-synced from voucher HV-OR-…" — the voucher a repayment came in on. */
const voucherOf = (notes: string | null) => notes?.match(/voucher\s+(\S+)/i)?.[1] ?? null
const stamp = (at: string) => officeTime(at).format('DD MMM YYYY · HH:mm')

export interface LoanRepaymentRow {
  id: string
  date: string
  type: string
  amount: number
  notes: string | null
}

export interface LoanPageModel {
  id: string
  /** pending_approval · active · fully_repaid · cancelled */
  status: string
  companyName: string
  /** "Carres (CAR)". */
  borrower: string
  principal: number
  disbursementDate: string | null
  createdBy: string | null
  /** `DD MMM YYYY · HH:mm`. */
  createdAt: string
  noFixedTerm: boolean
  tenureMonths: number
  maturity: string | null
  fundingSource: string | null
  repaymentTerms: string | null
  plan: RepaymentPlan
  repayments: LoanRepaymentRow[]
  termsSegments: TermsSegment[]
  termsChanges: TermsChangeComparison[]
  start: RepaymentStart
  minPayInterest: boolean
  late: OverdueSummary | null
  monthlyInterest: number
  outstanding: number
  totalPrincipalPaid: number
  rate: { effective: number; base: number; premium: number }
  tone: string
  chip: string
  trail: FullStep[]
  audit: Array<{ at: string; who: string; what: string }>
  /** A cancellation filed and waiting for the Principal. */
  pendingCancel: { by: string; at: string } | null
  can: {
    /** Treasury · Edit — the repayment settings (funding source, start, minimum pay). */
    edit: boolean
    /** Treasury · Void — cancel, request a cancellation, reverse a repayment. */
    void: boolean
    /** Treasury · Approve — amend a booked loan's terms, revert a change. */
    amend: boolean
    /** Treasury · Create, on an active loan. */
    recordRepayment: boolean
  }
}

/** The loan's page, or null when the reader may not see it (or it is not there). */
export async function loadLoanPage(supabase: Client, user: User, id: string): Promise<LoanPageModel | null> {
  const { data: loan, error } = await supabase.from('loans').select('*').eq('id', id).single()
  if (error || !loan) return null

  const [{ data: company }, { data: outstanding }, { data: repayments }, { data: approver }, { data: creator }] = await Promise.all([
    supabase.from('companies').select('name, short_code').eq('id', loan.company_id).single(),
    supabase.from('loan_outstanding').select('outstanding, total_principal_paid, total_interest_paid, total_penalty_paid').eq('loan_id', loan.id).single(),
    supabase.from('repayments').select('*').eq('loan_id', loan.id).order('payment_date', { ascending: false }),
    loan.approved_by ? supabase.from('users').select('name').eq('id', loan.approved_by).single() : Promise.resolve({ data: null }),
    supabase.from('users').select('name').eq('id', loan.created_by).single(),
  ])

  // Terms over time (2026-09-21): segments + each 从某月起 change with its 差价.
  const termsHistory = await fetchTermsHistory(supabase, 'loan', [loan.id])
  const repRows = (repayments ?? []).map((r) => ({ id: loan.id, amount: Number(r.amount), payment_date: r.payment_date as string, payment_type: r.payment_type as string }))
  const terms = termsForLoan(loan, termsHistory.get(loan.id) ?? [])
  const termsSegments = buildTermsSegments(terms, principalPaidByMonth(repRows, isLoanPrincipal).get(loan.id) ?? {})
  const termsChanges = allTermsChanges(termsSegments, { currentYM: officeMonth(), paidByMonth: paidByMonthByType(repRows, isLoanPrincipal).get(loan.id) ?? {} })

  // A filed-but-not-yet-approved cancellation (Finance can't see /approvals, so the page says it).
  // audit_changes postdates database.types.ts — asked through the untyped client.
  const db = supabase as unknown as SupabaseClient
  const [{ data: pendingCancel }, audit] = await Promise.all([
    supabase
      .from('approval_requests')
      .select('created_at, submitted_by, users:submitted_by(name)')
      .eq('reference_id', loan.id)
      .eq('reference_table', 'loans')
      .eq('request_type', 'loan_cancel')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .maybeSingle(),
    // The audit log: the loan's own changes and its repayments' (what this reader's permissions open).
    Promise.all([
      db.rpc('audit_changes', { p_tables: ['loans'], p_row: loan.id, p_limit: 60 }).then((r) => r),
      ...(repayments ?? []).slice(0, 12).map((r) => db.rpc('audit_changes', { p_tables: ['repayments'], p_row: r.id as string, p_limit: 5 }).then((x) => x)),
    ]),
  ])

  const outstandingAmount = Number(outstanding?.outstanding ?? loan.principal)
  const totalPrincipalPaid = Number(outstanding?.total_principal_paid ?? 0)
  const repaymentList = repayments ?? []
  const tenureMonths = Number(loan.tenure_months ?? 0)
  // No-fixed-term loans store tenure_months=1 as a placeholder (isLoanUnscheduled reads the terms).
  const noFixedTerm = isLoanUnscheduled(loan.repayment_terms as string | null)

  const isPendingApproval = loan.status === 'pending_approval'
  const isActive = loan.status === 'active'
  const isRepaid = loan.status === 'fully_repaid'

  // The repayment start (2026-10-12): the date the first instalment falls due, and every instalment's day.
  const start = loanStart(loan)
  const today = officeToday()
  const plan = buildRepaymentPlan({
    terms,
    payments: repaymentList.map((r) => ({
      date: String(r.payment_date).slice(0, 10),
      type: r.payment_type as string,
      amount: Number(r.amount),
      ref: voucherOf(r.notes as string | null),
    })),
    isPrincipal: isLoanPrincipal,
    today,
    dueDay: start.day,
    status: loan.status,
  })
  // Overdue (2026-10-12): an instalment past its day unpaid, on this plan.
  const late = isActive ? overdueOf(plan, today) : null
  const thisRow = plan.rows.find((r) => r.ym === officeMonth()) ?? plan.rows[plan.rows.length - 1] ?? null
  const monthlyInterest = thisRow?.interest ?? currentSegment(termsSegments, officeMonth()).interestPerMonth
  const maturity = !noFixedTerm && loan.disbursement_date && tenureMonths > 0 ? addMonths(String(loan.disbursement_date), tenureMonths) : null

  const [tone, chip] = late
    ? ['danger', 'overdue']
    : isActive
      ? ['ledger', 'active']
      : isPendingApproval
        ? ['wait', 'pending approval']
        : isRepaid
          ? ['info', 'repaid']
          : ['def', 'cancelled']

  const trail: FullStep[] = [
    { label: 'Created', by: creator?.name ?? null, when: stamp(loan.created_at), state: 'done' },
    loan.approved_at || isActive || isRepaid
      ? { label: 'Disbursed', by: approver?.name ?? null, when: loan.approved_at ? stamp(loan.approved_at) : fullDay(loan.disbursement_date), state: 'done' as const }
      : loan.status === 'cancelled'
        ? { label: 'Cancelled', by: null, when: null, state: 'bad' as const }
        : { label: 'Disbursed', by: null, when: null, state: 'todo' as const },
  ]
  if (isRepaid) trail.push({ label: 'Repaid', by: null, when: null, state: 'done' })
  if (loan.status === 'cancelled' && trail[1].label !== 'Cancelled') trail.push({ label: 'Cancelled', by: null, when: null, state: 'bad' })

  const changes = audit
    .flatMap((r) => (r.error ? [] : ((r.data ?? []) as unknown as Array<DealChange & { id: number; occurred_at: string; actor_id: string | null; actor_name: string | null }>)))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : b.id - a.id))
    .map((c) => ({ at: stamp(c.occurred_at), who: c.actor_name ?? (c.actor_id ? 'Removed account' : 'System'), what: dealChangeLine(c) }))

  return {
    id: loan.id as string,
    status: loan.status as string,
    companyName: company?.name ?? '—',
    borrower: company ? withCode(company.name, company.short_code) : '—',
    principal: Number(loan.principal),
    disbursementDate: (loan.disbursement_date as string | null) ?? null,
    createdBy: creator?.name ?? null,
    createdAt: stamp(loan.created_at),
    noFixedTerm,
    tenureMonths,
    maturity,
    fundingSource: fundingSourceFromTerms(loan.repayment_terms as string | null),
    repaymentTerms: (loan.repayment_terms as string | null) ?? null,
    plan,
    repayments: repaymentList.map((r) => ({
      id: r.id as string,
      date: r.payment_date as string,
      type: r.payment_type as string,
      amount: Number(r.amount),
      notes: (r.notes as string | null) ?? null,
    })),
    termsSegments,
    termsChanges,
    start,
    minPayInterest: (loan as { min_pay_interest?: boolean }).min_pay_interest === true,
    late,
    monthlyInterest,
    outstanding: outstandingAmount,
    totalPrincipalPaid,
    rate: { effective: Number(loan.effective_rate), base: Number(loan.base_rate), premium: Number(loan.risk_premium) },
    tone,
    chip,
    trail,
    audit: changes,
    pendingCancel: pendingCancel ? { by: ((pendingCancel.users as { name?: string } | null)?.name) ?? 'Finance', at: stamp(pendingCancel.created_at) } : null,
    // Each step asks for the action its Server Action asks (2026-10-08, PR2).
    can: {
      edit: canDo(user, 'treasury', 'edit'),
      void: canDo(user, 'treasury', 'void'),
      amend: canDo(user, 'treasury', 'approve'),
      recordRepayment: canDo(user, 'treasury', 'create') && isActive,
    },
  }
}
