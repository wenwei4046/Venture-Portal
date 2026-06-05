import Link from 'next/link'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { loanMonthlyInstallment, isLoanUnscheduled } from '@/lib/treasury-schedule'
import { listPayableFundSources } from '../fund-in/actions'
import ScheduleView, { type SchedRow, type NoTermRow } from './_components/ScheduleView'

export const dynamic = 'force-dynamic'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export default async function RepaymentSchedulePage() {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD')

  // ── 应收 (loans) + this-month collections ──
  const [{ data: loans }, { data: loanOut }, { data: companies }, { data: loanReps }] = await Promise.all([
    supabase
      .from('loans')
      .select('id, company_id, principal, effective_rate, tenure_months, status, repayment_terms')
      .eq('status', 'active'),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, short_code, name'),
    supabase
      .from('repayments')
      .select('loan_id, payment_type, payment_date')
      .eq('payment_type', 'principal')
      .gte('payment_date', monthStart)
      .lte('payment_date', monthEnd),
  ])
  const outById = new Map((loanOut ?? []).map((o) => [o.loan_id as string, o]))
  const coById = new Map((companies ?? []).map((c) => [c.id as string, c]))
  const loanDoneThisMonth = new Set((loanReps ?? []).map((r) => r.loan_id as string))

  const collectRows: SchedRow[] = []
  const collectNoTerm: NoTermRow[] = []
  for (const l of loans ?? []) {
    const out = outById.get(l.id as string)
    const co = l.company_id ? coById.get(l.company_id as string) : null
    const counterparty = co?.short_code ?? co?.name ?? '—'
    const principal = Number(l.principal)
    const rate = Number(l.effective_rate)
    if (isLoanUnscheduled(l.repayment_terms as string | null)) {
      collectNoTerm.push({
        key: l.id as string,
        counterparty,
        detail: `RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · 未定`,
        outstanding: Number(out?.outstanding ?? principal),
        monthlyInterest: r2(principal * rate),
      })
      continue
    }
    const inst = loanMonthlyInstallment({
      principal,
      effectiveRate: rate,
      tenureMonths: Number(l.tenure_months),
      principalPaid: Number(out?.total_principal_paid ?? 0),
    })
    if (inst.remainingPeriods <= 0) continue
    collectRows.push({
      key: l.id as string,
      counterparty,
      detail: `RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · ${l.tenure_months}mo · ${inst.remainingPeriods} left`,
      principalDue: inst.principalDue,
      interestDue: inst.interestDue,
      totalDue: inst.totalDue,
      done: loanDoneThisMonth.has(l.id as string),
    })
  }
  collectRows.sort((a, b) => Number(a.done) - Number(b.done) || b.totalDue - a.totalDue)
  collectNoTerm.sort((a, b) => b.outstanding - a.outstanding)

  // ── 应付 (fund sources) + this-month repayments + pending repayment PVs ──
  const [payable, { data: fsReps }, { data: pendingPvs }] = await Promise.all([
    listPayableFundSources(),
    supabase
      .from('fund_source_repayments')
      .select('fund_source_id, payment_type, payment_date')
      .eq('payment_type', 'principal')
      .gte('payment_date', monthStart)
      .lte('payment_date', monthEnd),
    supabase
      .from('payment_vouchers')
      .select('fund_source_id, repayment_breakdown, status, voucher_no')
      .not('fund_source_id', 'is', null)
      .not('repayment_breakdown', 'is', null)
      .in('status', ['draft', 'pending_approval', 'approved']),
  ])
  const fsDoneThisMonth = new Set((fsReps ?? []).map((r) => r.fund_source_id as string))
  const pendingPvByFs = new Map<string, { principal: number; interest: number; voucherNo: string }>()
  for (const pv of pendingPvs ?? []) {
    const fsId = pv.fund_source_id as string
    const bd = (pv.repayment_breakdown ?? {}) as { principal?: number; interest?: number }
    pendingPvByFs.set(fsId, {
      principal: Number(bd.principal ?? 0),
      interest: Number(bd.interest ?? 0),
      voucherNo: (pv.voucher_no as string) ?? '',
    })
  }

  const repayRows: SchedRow[] = []
  const repayNoTerm: NoTermRow[] = []
  for (const p of payable) {
    const cp = p.label.split(' · ')[0] ?? '—'
    const done = fsDoneThisMonth.has(p.id)
    if (p.lock_in_months != null && p.remaining_periods > 0) {
      repayRows.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · ${p.total_periods}mo · ${p.remaining_periods} left`,
        principalDue: p.monthly_principal,
        interestDue: p.monthly_interest,
        totalDue: p.monthly_payment,
        done,
      })
    } else if (pendingPvByFs.has(p.id)) {
      const bd = pendingPvByFs.get(p.id)!
      repayRows.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · 待审批 ${bd.voucherNo}`,
        principalDue: r2(bd.principal),
        interestDue: r2(bd.interest),
        totalDue: r2(bd.principal + bd.interest),
        done: false,
        pending: true,
      })
    } else {
      repayNoTerm.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · 无固定期限`,
        outstanding: p.outstanding,
        monthlyInterest: p.monthly_interest,
      })
    }
  }
  repayRows.sort((a, b) => Number(a.done) - Number(b.done) || b.totalDue - a.totalDue)
  repayNoTerm.sort((a, b) => b.outstanding - a.outstanding)

  const collectNoTermOutstanding = r2(collectNoTerm.reduce((s, r) => s + r.outstanding, 0))
  const collectNoTermInterest = r2(collectNoTerm.reduce((s, r) => s + r.monthlyInterest, 0))
  const repayNoTermOutstanding = r2(repayNoTerm.reduce((s, r) => s + r.outstanding, 0))
  const repayNoTermInterest = r2(repayNoTerm.reduce((s, r) => s + r.monthlyInterest, 0))

  return (
    <div>
      <div className="flex items-center gap-4 mb-2">
        <Link href="/fund-in" className="text-sm text-muted hover:text-accent font-sans transition-colors">← Fund In</Link>
        <Link href="/fund-out" className="text-sm text-muted hover:text-accent font-sans transition-colors">← Fund Out</Link>
      </div>

      <div className="page-head">
        <div>
          <div className="page-eyebrow"><em>I.</em> TREASURY · 本月还款排程 · {dayjs().format('MMMM YYYY').toUpperCase()}</div>
          <h1 className="page-title">本月应收 / 应付</h1>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        固定摊还:本金 = 原额 ÷ 期数,利息 = 原额 × 月利率。待审批的还款 PV 会显示「待审批」标签,直到 approve 才算已付。
      </p>

      <ScheduleView
        collectRows={collectRows}
        collectNoTerm={collectNoTerm}
        collectNoTermOutstanding={collectNoTermOutstanding}
        collectNoTermInterest={collectNoTermInterest}
        repayRows={repayRows}
        repayNoTerm={repayNoTerm}
        repayNoTermOutstanding={repayNoTermOutstanding}
        repayNoTermInterest={repayNoTermInterest}
      />
    </div>
  )
}
