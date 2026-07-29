// Loan Monitor data (user redefinition 2026-07-24, replacing the months-late
// aging buckets):
//   区1 本月应收/应付 — scheduled positions whose agreed plan has started:
//        this month's installment vs what was actually collected/paid this
//        month; a row DISAPPEARS once the month is settled ("收了或付了就不
//        会出现了").
//   区2 Outstanding 总览 — every open position's balance, split 定好日期
//        (fixed schedule) vs 还没定好 (no fixed term / compounding).
// The agreed start lives in loans/fund_sources.repayment_start_month (user
// sets it per position; NULL = default: the month AFTER disbursement /
// effective date). The stored month IS the first installment month.

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import { isLoanUnscheduled, loanMonthlyInstallment } from '@/lib/treasury-schedule'
import { fundingSourceFromTerms } from '@/lib/utils'

const r2 = (n: number) => Math.round(n * 100) / 100

/** First installment month: the agreed start when set, else disb/effective +1. */
export function resolveFirstDueYM(startMonth: string | null, baseDate: string | null): string | null {
  if (startMonth) return startMonth.slice(0, 7)
  if (!baseDate) return null
  return dayjs(`${baseDate.slice(0, 7)}-01`).add(1, 'month').format('YYYY-MM')
}

/** Remaining flat installments given principal already repaid. */
export function remainingPeriods(principal: number, tenure: number, principalPaid: number): number {
  if (tenure <= 0 || principal <= 0) return 0
  const per = principal / tenure
  const done = Math.floor((principalPaid + 0.005) / per)
  return Math.max(0, tenure - done)
}

export interface DueRow {
  key: string
  counterparty: string
  detail: string
  source?: string | null
  dueAmount: number
  paidThisMonth: number
  shortfall: number
}

export interface OutstandingRow {
  key: string
  counterparty: string
  detail: string
  source?: string | null
  outstanding: number
  startLabel: string
}

export interface MonitorSide {
  due: DueRow[]
  dueTotal: { dueAmount: number; paidThisMonth: number; shortfall: number }
  scheduled: OutstandingRow[]
  scheduledTotal: number
  noTerm: OutstandingRow[]
  noTermTotal: number
  grandTotal: number
}

export interface LoanMonitorData {
  currentYM: string
  collect: MonitorSide
  repay: MonitorSide
}

const money = (n: number) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function fetchLoanMonitorData(supabase: SupabaseClient): Promise<LoanMonitorData> {
  const currentYM = dayjs().format('YYYY-MM')

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
      .select('id, company_id, principal, effective_rate, tenure_months, status, repayment_terms, compound_interest, disbursement_date, repayment_start_month')
      .eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, name, short_code'),
    fetchAllRows((lo, hi) =>
      supabase.from('repayments').select('loan_id, amount, payment_date').order('id', { ascending: true }).range(lo, hi),
    ),
    supabase
      .from('fund_sources')
      .select('id, source_type, from_company_id, from_director_id, from_department_id, from_freetext_name, amount, cost_rate, lock_in_months, effective_date, status, compound_interest, repayment_start_month')
      .in('status', ['active', 'matured']),
    supabase.from('fund_source_outstanding').select('fund_source_id, outstanding, total_principal_paid'),
    fetchAllRows((lo, hi) =>
      supabase.from('fund_source_repayments').select('fund_source_id, amount, payment_date').order('id', { ascending: true }).range(lo, hi),
    ),
    supabase.from('directors').select('id, name, code'),
    supabase.from('departments').select('id, name'),
  ])

  const coById = new Map((companies ?? []).map((c) => [c.id as string, c]))
  const dirById = new Map((directors ?? []).map((d) => [d.id as string, d]))
  const deptById = new Map((departments ?? []).map((d) => [d.id as string, d]))
  const loanOutBy = new Map((loanOut ?? []).map((o) => [o.loan_id as string, o]))
  const fsOutBy = new Map((fsOut ?? []).map((o) => [o.fund_source_id as string, o]))

  const paidThisMonthByLoan = new Map<string, number>()
  for (const rp of loanReps ?? []) {
    if ((rp.payment_date as string).slice(0, 7) !== currentYM) continue
    const id = rp.loan_id as string
    paidThisMonthByLoan.set(id, r2((paidThisMonthByLoan.get(id) ?? 0) + Number(rp.amount)))
  }
  const paidThisMonthByFs = new Map<string, number>()
  for (const rp of fsReps ?? []) {
    if ((rp.payment_date as string).slice(0, 7) !== currentYM) continue
    const id = rp.fund_source_id as string
    paidThisMonthByFs.set(id, r2((paidThisMonthByFs.get(id) ?? 0) + Number(rp.amount)))
  }

  const startLabel = (startMonth: string | null, firstDueYM: string | null) =>
    startMonth ? `${startMonth.slice(0, 7)} 起` : firstDueYM ? `${firstDueYM} 起 (默认)` : '—'

  // ── 应收 side ──
  const collectDue: DueRow[] = []
  const collectSched: OutstandingRow[] = []
  const collectNoTerm: OutstandingRow[] = []
  for (const l of loans ?? []) {
    const co = l.company_id ? coById.get(l.company_id as string) : null
    const counterparty = (co?.short_code as string) ?? (co?.name as string) ?? '—'
    const principal = Number(l.principal)
    const rate = Number(l.effective_rate)
    const tenure = Number(l.tenure_months)
    const source = fundingSourceFromTerms(l.repayment_terms as string | null)
    const out = loanOutBy.get(l.id as string)
    const outstanding = Number(out?.outstanding ?? principal)
    const compounding = (l as { compound_interest?: boolean }).compound_interest === true
    const unscheduled = isLoanUnscheduled(l.repayment_terms as string | null)
    const startMonth = (l as { repayment_start_month?: string | null }).repayment_start_month ?? null
    const firstDueYM = resolveFirstDueYM(startMonth, l.disbursement_date as string | null)

    if (compounding || unscheduled || !(tenure > 0)) {
      if (outstanding > 0.005) {
        collectNoTerm.push({
          key: l.id as string,
          counterparty,
          detail: `RM ${money(principal)} @ ${(rate * 100).toFixed(3)}%/mo · ${compounding ? '利滚利 compounding' : 'no fixed term'}`,
          source,
          outstanding,
          startLabel: '未定',
        })
      }
      continue
    }

    if (outstanding > 0.005) {
      collectSched.push({
        key: l.id as string,
        counterparty,
        detail: `RM ${money(principal)} @ ${(rate * 100).toFixed(3)}%/mo · ${tenure}mo`,
        source,
        outstanding,
        startLabel: startLabel(startMonth, firstDueYM),
      })
    }

    const inst = loanMonthlyInstallment({
      principal,
      effectiveRate: rate,
      tenureMonths: tenure,
      principalPaid: Number(out?.total_principal_paid ?? 0),
    })
    if (inst.remainingPeriods <= 0) continue
    if (!firstDueYM || firstDueYM > currentYM) continue // plan not started yet
    const dueAmount = r2(inst.principalDue + inst.interestDue)
    const paid = paidThisMonthByLoan.get(l.id as string) ?? 0
    const shortfall = r2(dueAmount - paid)
    if (shortfall <= 0.005) continue // settled this month → disappears
    collectDue.push({
      key: l.id as string,
      counterparty,
      detail: `RM ${money(principal)} @ ${(rate * 100).toFixed(3)}%/mo · ${tenure}mo · ${inst.remainingPeriods} left`,
      source,
      dueAmount,
      paidThisMonth: paid,
      shortfall,
    })
  }

  // ── 应付 side ──
  const repayDue: DueRow[] = []
  const repaySched: OutstandingRow[] = []
  const repayNoTerm: OutstandingRow[] = []
  for (const s of fsrcs ?? []) {
    const from = (s.from_company_id && coById.get(s.from_company_id as string)?.name) ||
      (s.from_department_id && deptById.get(s.from_department_id as string)?.name) ||
      (s.from_freetext_name as string | null) ||
      (s.from_director_id && dirById.get(s.from_director_id as string)?.name) ||
      '—'
    const amount = Number(s.amount)
    const rate = Number(s.cost_rate)
    const lockIn = s.lock_in_months == null ? null : Number(s.lock_in_months)
    const out = fsOutBy.get(s.id as string)
    const outstanding = Number(out?.outstanding ?? amount)
    const compounding = (s as { compound_interest?: boolean }).compound_interest === true
    const startMonth = (s as { repayment_start_month?: string | null }).repayment_start_month ?? null
    const firstDueYM = resolveFirstDueYM(startMonth, s.effective_date as string | null)

    if (compounding || !lockIn || lockIn <= 0) {
      if (outstanding > 0.005) {
        repayNoTerm.push({
          key: s.id as string,
          counterparty: from as string,
          detail: `RM ${money(amount)} @ ${(rate * 100).toFixed(3)}%/mo · ${compounding ? '利滚利 compounding' : 'no fixed term'}${s.status === 'matured' ? ' · matured' : ''}`,
          outstanding,
          startLabel: '未定',
        })
      }
      continue
    }

    if (outstanding > 0.005) {
      repaySched.push({
        key: s.id as string,
        counterparty: from as string,
        detail: `RM ${money(amount)} @ ${(rate * 100).toFixed(3)}%/mo · ${lockIn}mo`,
        outstanding,
        startLabel: startLabel(startMonth, firstDueYM),
      })
    }

    const principalPaid = Number(out?.total_principal_paid ?? 0)
    const remaining = remainingPeriods(amount, lockIn, principalPaid)
    if (remaining <= 0) continue
    if (!firstDueYM || firstDueYM > currentYM) continue
    const dueAmount = r2(amount / lockIn + amount * rate)
    const paid = paidThisMonthByFs.get(s.id as string) ?? 0
    const shortfall = r2(dueAmount - paid)
    if (shortfall <= 0.005) continue
    repayDue.push({
      key: s.id as string,
      counterparty: from as string,
      detail: `RM ${money(amount)} @ ${(rate * 100).toFixed(3)}%/mo · ${lockIn}mo · ${remaining} left`,
      dueAmount,
      paidThisMonth: paid,
      shortfall,
    })
  }

  const side = (due: DueRow[], sched: OutstandingRow[], noTerm: OutstandingRow[]): MonitorSide => {
    due.sort((a, b) => b.shortfall - a.shortfall)
    sched.sort((a, b) => b.outstanding - a.outstanding)
    noTerm.sort((a, b) => b.outstanding - a.outstanding)
    const scheduledTotal = r2(sched.reduce((s, x) => s + x.outstanding, 0))
    const noTermTotal = r2(noTerm.reduce((s, x) => s + x.outstanding, 0))
    return {
      due,
      dueTotal: {
        dueAmount: r2(due.reduce((s, x) => s + x.dueAmount, 0)),
        paidThisMonth: r2(due.reduce((s, x) => s + x.paidThisMonth, 0)),
        shortfall: r2(due.reduce((s, x) => s + x.shortfall, 0)),
      },
      scheduled: sched,
      scheduledTotal,
      noTerm,
      noTermTotal,
      grandTotal: r2(scheduledTotal + noTermTotal),
    }
  }

  return {
    currentYM,
    collect: side(collectDue, collectSched, collectNoTerm),
    repay: side(repayDue, repaySched, repayNoTerm),
  }
}
