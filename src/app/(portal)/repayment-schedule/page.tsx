import Link from 'next/link'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { loanMonthlyInstallment, isLoanUnscheduled, compoundInterestState } from '@/lib/treasury-schedule'
import { listPayableFundSources } from '../fund-in/actions'
import ScheduleView, { type SchedRow, type NoTermRow, type CompoundRow } from './_components/ScheduleView'

export const dynamic = 'force-dynamic'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export default async function RepaymentSchedulePage() {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const currentYM = dayjs().format('YYYY-MM')

  // ── 应收 (loans) + repayment history (for done-this-month + compounding) ──
  const [{ data: loans }, { data: loanOut }, { data: companies }, { data: loanReps }] = await Promise.all([
    supabase
      .from('loans')
      .select('id, company_id, principal, effective_rate, tenure_months, status, repayment_terms, compound_interest, disbursement_date')
      .in('status', ['active', 'fully_repaid']),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, short_code, name'),
    supabase.from('repayments').select('loan_id, amount, payment_date, payment_type'),
  ])
  const outById = new Map((loanOut ?? []).map((o) => [o.loan_id as string, o]))
  const coById = new Map((companies ?? []).map((c) => [c.id as string, c]))
  // Per-loan repayments grouped by calendar month + this-month done set.
  const loanPayByMonth = new Map<string, Record<string, number>>()
  const loanDoneThisMonth = new Set<string>()
  // This-month actuals split by type, for rendering 已收 rows of loans that
  // were fully repaid this month (and so dropped off the active schedule).
  const loanThisMonthByType = new Map<string, { principal: number; interest: number }>()
  for (const rp of loanReps ?? []) {
    const lid = rp.loan_id as string
    const ym = (rp.payment_date as string).slice(0, 7)
    const m = loanPayByMonth.get(lid) ?? {}
    m[ym] = r2((m[ym] ?? 0) + Number(rp.amount))
    loanPayByMonth.set(lid, m)
    if (ym === currentYM) {
      loanDoneThisMonth.add(lid)
      const cur = loanThisMonthByType.get(lid) ?? { principal: 0, interest: 0 }
      if ((rp.payment_type as string) === 'principal') cur.principal = r2(cur.principal + Number(rp.amount))
      else cur.interest = r2(cur.interest + Number(rp.amount)) // interest + penalty + netting
      loanThisMonthByType.set(lid, cur)
    }
  }

  const collectRows: SchedRow[] = []
  const collectNoTerm: NoTermRow[] = []
  const collectCompound: CompoundRow[] = []
  for (const l of loans ?? []) {
    const out = outById.get(l.id as string)
    const co = l.company_id ? coById.get(l.company_id as string) : null
    const counterparty = co?.short_code ?? co?.name ?? '—'
    const principal = Number(l.principal)
    const rate = Number(l.effective_rate)
    // Loan fully repaid: it no longer has a scheduled installment, but if the
    // settlement happened THIS month surface it as a 已收 row (full-plan view)
    // showing what was actually collected — otherwise it vanishes silently.
    if ((l.status as string) !== 'active') {
      const tm = loanThisMonthByType.get(l.id as string)
      if (!tm || r2(tm.principal + tm.interest) <= 0) continue
      collectRows.push({
        key: l.id as string,
        counterparty,
        detail: `RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · 本月结清`,
        principalDue: tm.principal,
        interestDue: tm.interest,
        totalDue: r2(tm.principal + tm.interest),
        done: true,
      })
      continue
    }
    // 利滚利挂账: 本金不计入本月应收(未定还款),只逐月把利息滚进余额。
    // 单独成区,显示当前余额 / 累计已滚利息 / 本月利息。不论有没有期数都走这里。
    const compounding = (l as { compound_interest?: boolean }).compound_interest === true && rate > 0
    if (compounding) {
      const startYM = ((l.disbursement_date as string | null) ?? '').slice(0, 7) || currentYM
      const cs = compoundInterestState({ principal, monthlyRate: rate, startYM, currentYM, paymentsByMonth: loanPayByMonth.get(l.id as string) ?? {} })
      const remainingPrincipal = r2(principal - Number(out?.total_principal_paid ?? 0))
      collectCompound.push({
        key: l.id as string,
        counterparty,
        detail: `原 RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · 自 ${startYM} 利滚利`,
        balance: cs.balance,
        accrued: r2(cs.balance - remainingPrincipal),
        thisMonthInterest: cs.thisMonthInterest,
      })
      continue
    }
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
      totalDue: r2(inst.principalDue + inst.interestDue),
      done: loanDoneThisMonth.has(l.id as string),
    })
  }
  collectRows.sort((a, b) => Number(a.done) - Number(b.done) || b.totalDue - a.totalDue)
  collectNoTerm.sort((a, b) => b.outstanding - a.outstanding)
  collectCompound.sort((a, b) => b.balance - a.balance)

  // ── 应付 (fund sources) + repayment history + compounding meta + pending PVs ──
  const [payable, { data: fsMetaRows }, { data: fsReps }, { data: pendingPvs }] = await Promise.all([
    listPayableFundSources({ includeSettledInMonth: currentYM }),
    supabase.from('fund_sources').select('id, compound_interest, effective_date'),
    supabase.from('fund_source_repayments').select('fund_source_id, amount, payment_date, payment_type'),
    supabase
      .from('payment_vouchers')
      .select('fund_source_id, repayment_breakdown, status, voucher_no')
      .not('fund_source_id', 'is', null)
      .not('repayment_breakdown', 'is', null)
      .in('status', ['draft', 'pending_approval', 'approved']),
  ])
  const fsMeta = new Map((fsMetaRows ?? []).map((m) => [m.id as string, m as { compound_interest?: boolean; effective_date?: string | null }]))
  const fsPayByMonth = new Map<string, Record<string, number>>()
  const fsDoneThisMonth = new Set<string>()
  const fsThisMonthByType = new Map<string, { principal: number; interest: number }>()
  for (const rp of fsReps ?? []) {
    const fid = rp.fund_source_id as string
    const ym = (rp.payment_date as string).slice(0, 7)
    const m = fsPayByMonth.get(fid) ?? {}
    m[ym] = r2((m[ym] ?? 0) + Number(rp.amount))
    fsPayByMonth.set(fid, m)
    if (ym === currentYM) {
      fsDoneThisMonth.add(fid)
      const cur = fsThisMonthByType.get(fid) ?? { principal: 0, interest: 0 }
      if ((rp.payment_type as string) === 'principal') cur.principal = r2(cur.principal + Number(rp.amount))
      else cur.interest = r2(cur.interest + Number(rp.amount))
      fsThisMonthByType.set(fid, cur)
    }
  }
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
  const repayCompound: CompoundRow[] = []
  for (const p of payable) {
    const cp = p.label.split(' · ')[0] ?? '—'
    // 利滚利挂账 (应付侧): 本金未定还款,只滚利息,单独成区。
    const fsm = fsMeta.get(p.id)
    if (!p.settled_in_month && fsm?.compound_interest === true && p.cost_rate > 0) {
      const startYM = (fsm?.effective_date ?? '').slice(0, 7) || currentYM
      const cs = compoundInterestState({ principal: p.original_amount, monthlyRate: p.cost_rate, startYM, currentYM, paymentsByMonth: fsPayByMonth.get(p.id) ?? {} })
      repayCompound.push({
        key: p.id,
        counterparty: cp,
        detail: `原 RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · 自 ${startYM} 利滚利`,
        balance: cs.balance,
        accrued: r2(cs.balance - p.outstanding),
        thisMonthInterest: cs.thisMonthInterest,
      })
      continue
    }
    // Fund source fully repaid this month → 已付 row showing actuals.
    if (p.settled_in_month) {
      const tm = fsThisMonthByType.get(p.id) ?? { principal: 0, interest: 0 }
      if (r2(tm.principal + tm.interest) <= 0) continue
      repayRows.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · 本月结清`,
        principalDue: tm.principal,
        interestDue: tm.interest,
        totalDue: r2(tm.principal + tm.interest),
        done: true,
      })
      continue
    }
    const done = fsDoneThisMonth.has(p.id)
    if (p.lock_in_months != null && p.remaining_periods > 0) {
      const meta = fsMeta.get(p.id)
      const compounding = meta?.compound_interest === true && p.cost_rate > 0
      let interestDue = p.monthly_interest
      let extra = ''
      if (compounding) {
        const startYM = (meta?.effective_date ?? '').slice(0, 7) || currentYM
        const cs = compoundInterestState({ principal: p.original_amount, monthlyRate: p.cost_rate, startYM, currentYM, paymentsByMonth: fsPayByMonth.get(p.id) ?? {} })
        interestDue = cs.thisMonthInterest
        extra = ` · 利滚利 余额 RM ${cs.balance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
      }
      repayRows.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · ${p.total_periods}mo · ${p.remaining_periods} left${extra}`,
        principalDue: p.monthly_principal,
        interestDue,
        totalDue: r2(p.monthly_principal + interestDue),
        done,
        compound: compounding,
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
  repayCompound.sort((a, b) => b.balance - a.balance)

  const sumCompound = (rows: CompoundRow[]) => ({
    balance: r2(rows.reduce((s, r) => s + r.balance, 0)),
    accrued: r2(rows.reduce((s, r) => s + r.accrued, 0)),
    thisMonthInterest: r2(rows.reduce((s, r) => s + r.thisMonthInterest, 0)),
  })
  const collectCompoundTotals = sumCompound(collectCompound)
  const repayCompoundTotals = sumCompound(repayCompound)

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
        collectCompound={collectCompound}
        collectCompoundTotals={collectCompoundTotals}
        repayRows={repayRows}
        repayNoTerm={repayNoTerm}
        repayNoTermOutstanding={repayNoTermOutstanding}
        repayNoTermInterest={repayNoTermInterest}
        repayCompound={repayCompound}
        repayCompoundTotals={repayCompoundTotals}
      />
    </div>
  )
}
