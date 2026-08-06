// Company Statement (user 2026-08-06): 每家往来对象一行 — 我还要还多少 / 我还
// 要收多少, 本金和利息分开两栏, 点开像银行 statement 看每笔 outstanding 和几时
// 还完. 要收 = loans lent out; 要还 = fund sources taken in. Interest maths and
// counterparty resolution follow Loan Monitor / Repayment Schedule exactly —
// figures here must tie to those pages.

import dayjs from 'dayjs'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { isLoanUnscheduled } from '@/lib/treasury-schedule'
import { fundingSourceFromTerms } from '@/lib/utils'
import {
  buildPositionRow,
  groupStatement,
  type PositionInput,
  type PositionRow,
} from '@/lib/counterparty-statement'
import StatementView from './_components/StatementView'

export const dynamic = 'force-dynamic'

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function CompanyStatementPage() {
  await requireRole(['finance', 'principal'])
  // Untyped client — database.types.ts predates repayment_start_month (same
  // convention as lib/loan-monitor's caller).
  const supabase = (await createClient()) as unknown as SupabaseClient
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
      .select(
        'id, company_id, principal, effective_rate, tenure_months, status, repayment_terms, compound_interest, disbursement_date, repayment_start_month',
      )
      .eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, name, short_code'),
    fetchAllRows((lo, hi) =>
      supabase
        .from('repayments')
        .select('loan_id, amount, payment_date')
        .order('id', { ascending: true })
        .range(lo, hi),
    ),
    supabase
      .from('fund_sources')
      .select(
        'id, source_type, from_company_id, from_director_id, from_department_id, from_freetext_name, amount, cost_rate, lock_in_months, effective_date, status, compound_interest, repayment_start_month',
      )
      .in('status', ['active', 'matured']),
    supabase.from('fund_source_outstanding').select('fund_source_id, outstanding, total_principal_paid'),
    fetchAllRows((lo, hi) =>
      supabase
        .from('fund_source_repayments')
        .select('fund_source_id, amount, payment_date')
        .order('id', { ascending: true })
        .range(lo, hi),
    ),
    supabase.from('directors').select('id, name'),
    supabase.from('departments').select('id, name'),
  ])

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

  // The same company must label identically on BOTH sides so the two directions
  // merge into one row (short_code preferred, like the loans side of Monitor).
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
      source: fundingSourceFromTerms(l.repayment_terms as string | null),
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
    })
  }

  const positionRows = inputs
    .map(i => buildPositionRow(i, currentYM))
    .filter((r): r is PositionRow => r !== null)
  const { rows, totals } = groupStatement(positionRows)

  return (
    <div>
      <Link
        href="/reports"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Reports
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · AS AT {dayjs().format('D MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">Company Statement</h1>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        每家往来对象一行：我还要收（借出去的 loans）对 我还要还（收进来的 fund
        sources）。利息 — 定了期数的按剩余期数算到还完（原额 × 月息 × 剩余期）；
        利滚利显示到今天已滚未付；没定期限的不入总数，只按月息做参考。几时还完 —
        按时还的显示合约到期月，落后的按每月补一期推算。点一行展开明细。
      </p>

      <StatementView rows={rows} totals={totals} />
    </div>
  )
}
