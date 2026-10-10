import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { officeMonth, officeToday } from '@/lib/office-time'
import { fetchAllRows } from '@/lib/paginate'
import { loanMonthlyInstallment, isLoanUnscheduled, isBeforeFirstInstallment, compoundInterestState, minInterestStatus } from '@/lib/treasury-schedule'
import { resolveFirstDueYM } from '@/lib/loan-monitor'
import { buildTermsSegments, compoundRoll, currentSegment, principalPaidSince, segmentRemainingPeriods, termsChanged, type TermsSegment } from '@/lib/treasury-terms'
import { fetchTermsHistory, isFundSourcePrincipal, isLoanPrincipal, principalPaidByMonth, termsForFundSource, termsForLoan } from '@/lib/treasury-terms-data'
import { buildRepaymentPlan } from '@/lib/repayment-plan'
import { monthEvents, type CalendarEntry } from '@/lib/repayment-calendar'
import { fromCalendar } from '@/lib/deal-return'
import { fundingSourceFromTerms } from '@/lib/utils'
import { listPayableFundSources } from '../../fund-in/actions'
import type { SchedRow, NoTermRow, CompoundRow, MinInterestRow } from '../_components/ScheduleView'

// The Repayment Schedule's month (2026-10-10, lifted out of its page so the
// page and its Export — the user's Claude Design handoff — read the same
// rows): each side's scheduled instalments, minimum interest, compounding and
// no-fixed-term deals, and the month's calendar of instalments.

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface RepaymentSchedule {
  /** YYYY-MM: the month shown. */
  currentYM: string
  isCurrentMonth: boolean
  /** The office's today, YYYY-MM-DD. */
  today: string
  collectRows: SchedRow[]
  collectMin: MinInterestRow[]
  collectCompound: CompoundRow[]
  collectNoTerm: NoTermRow[]
  repayRows: SchedRow[]
  repayMin: MinInterestRow[]
  repayCompound: CompoundRow[]
  repayNoTerm: NoTermRow[]
  events: CalendarEntry[]
}

/** `month` as the page's URL names it (?month=YYYY-MM); anything else is this month. */
export async function loadRepaymentSchedule(supabase: SupabaseClient, month: string | null | undefined): Promise<RepaymentSchedule> {
  // Which month's schedule to show — default to the current month; ?month=YYYY-MM
  // lets Finance look back at a past month. The flat installment amounts are the
  // same every month; the "done / settled / this-month interest" figures come
  // from repayment dates in the selected month, so past months read correctly.
  const nowYM = officeMonth()
  const currentYM = /^\d{4}-\d{2}$/.test(month ?? '') ? month! : nowYM
  const isCurrentMonth = currentYM === nowYM

  // ── 应收 (loans) + repayment history (for done-this-month + compounding) ──
  const [{ data: loans }, { data: loanOut }, { data: companies }, { data: loanReps }] = await Promise.all([
    supabase
      .from('loans')
      .select('id, company_id, principal, effective_rate, tenure_months, status, repayment_terms, compound_interest, disbursement_date, min_pay_interest, repayment_start_month, terms_effective_from')
      .in('status', ['active', 'fully_repaid']),
    supabase.from('loan_outstanding').select('loan_id, outstanding, total_principal_paid'),
    supabase.from('companies').select('id, short_code, name'),
    fetchAllRows((lo, hi) => supabase.from('repayments').select('loan_id, amount, payment_date, payment_type').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
  ])
  const outById = new Map((loanOut ?? []).map((o) => [o.loan_id as string, o]))
  const coById = new Map((companies ?? []).map((c) => [c.id as string, c]))
  // Terms that changed mid-life (2026-09-21): this month's figures come from
  // the segment in force for this month, re-based on the principal still owed
  // when it began. Unchanged deals read exactly as before.
  const loanHist = await fetchTermsHistory(supabase, 'loan', (loans ?? []).map((l) => l.id as string))
  const loanPrincipalByMonth = principalPaidByMonth(
    (loanReps ?? []).map((rp) => ({ id: rp.loan_id as string, amount: Number(rp.amount), payment_date: rp.payment_date as string, payment_type: rp.payment_type as string })),
    isLoanPrincipal,
  )
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
  // What came in on a loan this month, every type (2026-10-10, the handoff's
  // "Received · <month>"): the sum the settled-this-month rows already show.
  const loanReceived = (id: string) => {
    const tm = loanThisMonthByType.get(id)
    return tm ? r2(tm.principal + tm.interest) : 0
  }

  const collectRows: SchedRow[] = []
  const collectNoTerm: NoTermRow[] = []
  const collectCompound: CompoundRow[] = []
  const collectMin: MinInterestRow[] = []
  for (const l of loans ?? []) {
    const out = outById.get(l.id as string)
    const co = l.company_id ? coById.get(l.company_id as string) : null
    const counterparty = co?.short_code ?? co?.name ?? '—'
    const principal = Number(l.principal)
    const segments = buildTermsSegments(termsForLoan(l, loanHist.get(l.id as string) ?? []), loanPrincipalByMonth.get(l.id as string) ?? {})
    const seg = termsChanged(segments) ? currentSegment(segments, currentYM) : null
    const rate = seg ? seg.rate : Number(l.effective_rate)
    const termsTag = seg ? ` · terms from ${seg.fromYM}` : ''
    const source = fundingSourceFromTerms(l.repayment_terms as string | null)
    // Loan fully repaid: it no longer has a scheduled installment, but if the
    // settlement happened THIS month surface it as a 已收 row (full-plan view)
    // showing what was actually collected — otherwise it vanishes silently.
    if ((l.status as string) !== 'active') {
      const tm = loanThisMonthByType.get(l.id as string)
      if (!tm || r2(tm.principal + tm.interest) <= 0) continue
      collectRows.push({
        key: l.id as string,
        counterparty,
        detail: `RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · settled this month`,
        principalDue: tm.principal,
        interestDue: tm.interest,
        totalDue: r2(tm.principal + tm.interest),
        done: true,
        received: loanReceived(l.id as string),
        source,
      })
      continue
    }
    // 最低还息单 (2026-09-04): flagged = "本金可以慢慢还,当月利息一定要还".
    // due 按这笔单自己的算法(flat 原额×月息 / compound 余额×月息),paid = 当月
    // interest 类还款(含 penalty/netting,同 已收行 的口径)。首期未到的月份不追。
    if ((l as { min_pay_interest?: boolean }).min_pay_interest === true && rate > 0) {
      const firstDueYM = resolveFirstDueYM(
        ((l as { repayment_start_month?: string | null }).repayment_start_month ?? null),
        l.disbursement_date as string | null,
      )
      if (!firstDueYM || firstDueYM <= currentYM) {
        const isCompound = (l as { compound_interest?: boolean }).compound_interest === true
        const due = isCompound
          ? (seg
              ? compoundRoll(segments, { principal, startYM: ((l.disbursement_date as string | null) ?? '').slice(0, 7) || null, currentYM, paymentsByMonth: loanPayByMonth.get(l.id as string) ?? {} })!
              : compoundInterestState({
                  principal,
                  monthlyRate: rate,
                  startYM: ((l.disbursement_date as string | null) ?? '').slice(0, 7) || currentYM,
                  currentYM,
                  paymentsByMonth: loanPayByMonth.get(l.id as string) ?? {},
                })
            ).thisMonthInterest
          : seg
            ? seg.interestPerMonth
            : r2(principal * rate)
        const st = minInterestStatus(due, loanThisMonthByType.get(l.id as string)?.interest ?? 0)
        collectMin.push({
          key: l.id as string,
          counterparty,
          detail: `RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo${isCompound ? ' · compound' : ''}${termsTag}`,
          ...st,
        })
      }
    }
    // 利滚利挂账: 本金不计入本月应收(未定还款),只逐月把利息滚进余额。
    // 单独成区,显示当前余额 / 累计已滚利息 / 本月利息。不论有没有期数都走这里。
    const compounding = (l as { compound_interest?: boolean }).compound_interest === true && rate > 0
    if (compounding) {
      const startYM = ((l.disbursement_date as string | null) ?? '').slice(0, 7) || currentYM
      const cs = seg
        ? compoundRoll(segments, { principal, startYM, currentYM, paymentsByMonth: loanPayByMonth.get(l.id as string) ?? {} })!
        : compoundInterestState({ principal, monthlyRate: rate, startYM, currentYM, paymentsByMonth: loanPayByMonth.get(l.id as string) ?? {} })
      const remainingPrincipal = r2(principal - Number(out?.total_principal_paid ?? 0))
      collectCompound.push({
        key: l.id as string,
        counterparty,
        detail: `RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · compounding since ${startYM}${termsTag}`,
        balance: cs.balance,
        accrued: r2(cs.balance - remainingPrincipal),
        thisMonthInterest: cs.thisMonthInterest,
        received: loanReceived(l.id as string),
        source,
      })
      continue
    }
    if (isLoanUnscheduled(l.repayment_terms as string | null)) {
      collectNoTerm.push({
        key: l.id as string,
        counterparty,
        detail: `RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · undecided${termsTag}`,
        outstanding: Number(out?.outstanding ?? principal),
        // A deal turned no-term from X keeps the flat interest on what was
        // owed at X (user 2026-09-22, convention A).
        monthlyInterest: seg ? seg.interestPerMonth : r2(principal * rate),
        received: loanReceived(l.id as string),
        source,
      })
      continue
    }
    // 放款当月不进本月应收 —— 首期下个月才到期。本月已实际收过款的仍显示(已收行)。
    if (
      isBeforeFirstInstallment(l.disbursement_date as string | null, currentYM) &&
      !loanDoneThisMonth.has(l.id as string)
    ) {
      continue
    }
    const inst = seg
      ? {
          principalDue: seg.principalPerMonth,
          interestDue: seg.interestPerMonth,
          remainingPeriods: segmentRemainingPeriods(seg, principalPaidSince(loanPrincipalByMonth.get(l.id as string) ?? {}, seg.fromYM)),
        }
      : loanMonthlyInstallment({
          principal,
          effectiveRate: rate,
          tenureMonths: Number(l.tenure_months),
          principalPaid: Number(out?.total_principal_paid ?? 0),
        })
    if (inst.remainingPeriods <= 0) continue
    collectRows.push({
      key: l.id as string,
      counterparty,
      detail: `RM ${principal.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(rate * 100).toFixed(3)}%/mo · ${seg ? seg.months : l.tenure_months}mo · ${inst.remainingPeriods} left${termsTag}`,
      principalDue: inst.principalDue,
      interestDue: inst.interestDue,
      totalDue: r2(inst.principalDue + inst.interestDue),
      done: loanDoneThisMonth.has(l.id as string),
      received: loanReceived(l.id as string),
      source,
    })
  }
  collectRows.sort((a, b) => Number(a.done) - Number(b.done) || b.totalDue - a.totalDue)
  collectNoTerm.sort((a, b) => b.outstanding - a.outstanding)
  collectCompound.sort((a, b) => b.balance - a.balance)

  // ── 应付 (fund sources) + repayment history + compounding meta + pending PVs ──
  const [payable, { data: fsMetaRows }, { data: fsReps }, { data: pendingPvs }, { data: fsDepts }] = await Promise.all([
    listPayableFundSources({ includeSettledInMonth: currentYM }),
    supabase.from('fund_sources').select('id, status, from_company_id, from_department_id, from_freetext_name, compound_interest, effective_date, min_pay_interest, repayment_start_month, amount, cost_rate, lock_in_months, terms_effective_from'),
    fetchAllRows((lo, hi) => supabase.from('fund_source_repayments').select('fund_source_id, amount, payment_date, payment_type').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    supabase
      .from('payment_vouchers')
      .select('fund_source_id, repayment_breakdown, status, voucher_no')
      .not('fund_source_id', 'is', null)
      .not('repayment_breakdown', 'is', null)
      .in('status', ['draft', 'pending_approval', 'approved']),
    supabase.from('departments').select('id, name'),
  ])
  const fsMeta = new Map((fsMetaRows ?? []).map((m) => [m.id as string, m as { compound_interest?: boolean; effective_date?: string | null; min_pay_interest?: boolean; repayment_start_month?: string | null; amount?: number | string; cost_rate?: number | string; lock_in_months?: number | null; terms_effective_from?: string | null }]))
  const fsHist = await fetchTermsHistory(supabase, 'fund_source', (fsMetaRows ?? []).map((m) => m.id as string))
  const fsPrincipalByMonth = principalPaidByMonth(
    (fsReps ?? []).map((rp) => ({ id: rp.fund_source_id as string, amount: Number(rp.amount), payment_date: rp.payment_date as string, payment_type: rp.payment_type as string })),
    (t) => t === 'principal' || t === 'netting',
  )
  // Segments of a fund source whose terms changed (compounding rows roll per
  // lib/treasury-terms compoundRoll); null when unchanged.
  const fsSegments = (id: string): TermsSegment[] | null => {
    const m = fsMeta.get(id)
    if (!m || !m.terms_effective_from) return null
    const segs = buildTermsSegments(
      termsForFundSource({ amount: m.amount ?? 0, cost_rate: m.cost_rate ?? 0, lock_in_months: m.lock_in_months ?? null, compound_interest: m.compound_interest, effective_date: m.effective_date ?? null, repayment_start_month: m.repayment_start_month, terms_effective_from: m.terms_effective_from }, fsHist.get(id) ?? []),
      fsPrincipalByMonth.get(id) ?? {},
    )
    return termsChanged(segs) ? segs : null
  }
  const fsCompound = (id: string, principal: number, rate: number, startYM: string) => {
    const segs = fsSegments(id)
    return segs
      ? compoundRoll(segs, { principal, startYM, currentYM, paymentsByMonth: fsPayByMonth.get(id) ?? {} })!
      : compoundInterestState({ principal, monthlyRate: rate, startYM, currentYM, paymentsByMonth: fsPayByMonth.get(id) ?? {} })
  }
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
      // Fund-source side: 'netting' is a non-cash PRINCIPAL knock-off (L32
      // convention; the fund_source_outstanding view counts it the same way).
      if (['principal', 'netting'].includes(rp.payment_type as string)) cur.principal = r2(cur.principal + Number(rp.amount))
      else cur.interest = r2(cur.interest + Number(rp.amount))
      fsThisMonthByType.set(fid, cur)
    }
  }
  // What went out to a fund source this month, every type (the handoff's "Paid · <month>").
  const fsPaid = (id: string) => {
    const tm = fsThisMonthByType.get(id)
    return tm ? r2(tm.principal + tm.interest) : 0
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
  const repayMin: MinInterestRow[] = []
  for (const p of payable) {
    const cp = p.label.split(' · ')[0] ?? '—'
    // 利滚利挂账 (应付侧): 本金未定还款,只滚利息,单独成区。
    const fsm = fsMeta.get(p.id)
    // 最低还息单 (应付侧, 2026-09-04): 当月最低要付的利息 vs 已付。口径同应收侧;
    // settled(本金已清)的不再追。
    if (fsm?.min_pay_interest === true && p.cost_rate > 0 && !p.settled_in_month) {
      const firstDueYM = resolveFirstDueYM(fsm.repayment_start_month ?? null, fsm.effective_date ?? null)
      if (!firstDueYM || firstDueYM <= currentYM) {
        const isCompound = fsm.compound_interest === true
        const due = isCompound
          ? fsCompound(p.id, p.original_amount, p.cost_rate, (fsm.effective_date ?? '').slice(0, 7) || currentYM).thisMonthInterest
          : p.terms_from
            ? p.monthly_interest
            : r2(p.original_amount * p.cost_rate)
        const st = minInterestStatus(due, fsThisMonthByType.get(p.id)?.interest ?? 0)
        repayMin.push({
          key: p.id,
          counterparty: cp,
          detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo${isCompound ? ' · compound' : ''}${p.terms_from ? ` · terms from ${p.terms_from}` : ''}`,
          ...st,
        })
      }
    }
    if (!p.settled_in_month && fsm?.compound_interest === true && p.cost_rate > 0) {
      const startYM = (fsm?.effective_date ?? '').slice(0, 7) || currentYM
      const cs = fsCompound(p.id, p.original_amount, p.cost_rate, startYM)
      repayCompound.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · compounding since ${startYM}${p.terms_from ? ` · terms from ${p.terms_from}` : ''}`,
        balance: cs.balance,
        accrued: r2(cs.balance - p.outstanding),
        thisMonthInterest: cs.thisMonthInterest,
        received: fsPaid(p.id),
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
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · settled this month`,
        principalDue: tm.principal,
        interestDue: tm.interest,
        totalDue: r2(tm.principal + tm.interest),
        done: true,
        received: fsPaid(p.id),
      })
      continue
    }
    const done = fsDoneThisMonth.has(p.id)
    // 对称于应收侧:本月才收到的资金来源首期下月才到期,不进本月应付。
    // 已有还款 PV(主动提前还)只在【当前真实月份】的排程显示 —— 之前不看月份,
    // 7 月新收的 HC 存款带着在途 PV 连 6 月的排程都乱入,虚增了历史月的应付
    // (user report 2026-07-24)。本月已还过的(已付行)仍照常显示。
    if (
      isBeforeFirstInstallment(fsm?.effective_date ?? null, currentYM) &&
      !(pendingPvByFs.has(p.id) && isCurrentMonth) &&
      !done
    ) {
      continue
    }
    if (p.lock_in_months != null && p.remaining_periods > 0) {
      const meta = fsMeta.get(p.id)
      const compounding = meta?.compound_interest === true && p.cost_rate > 0
      let interestDue = p.monthly_interest
      let extra = ''
      if (compounding) {
        const startYM = (meta?.effective_date ?? '').slice(0, 7) || currentYM
        const cs = fsCompound(p.id, p.original_amount, p.cost_rate, startYM)
        interestDue = cs.thisMonthInterest
        extra = ` · compound balance RM ${cs.balance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
      }
      if (p.terms_from) extra += ` · terms from ${p.terms_from}`
      repayRows.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · ${p.total_periods}mo · ${p.remaining_periods} left${extra}`,
        principalDue: p.monthly_principal,
        interestDue,
        totalDue: r2(p.monthly_principal + interestDue),
        done,
        received: fsPaid(p.id),
        compound: compounding,
      })
    } else if (pendingPvByFs.has(p.id) && isCurrentMonth) {
      // In-flight repayment PV rows belong to the real current month only —
      // viewing past/future months falls through to the no-term bucket below.
      const bd = pendingPvByFs.get(p.id)!
      repayRows.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · pending ${bd.voucherNo}`,
        principalDue: r2(bd.principal),
        interestDue: r2(bd.interest),
        totalDue: r2(bd.principal + bd.interest),
        done: false,
        received: fsPaid(p.id),
        pending: true,
      })
    } else {
      repayNoTerm.push({
        key: p.id,
        counterparty: cp,
        detail: `RM ${p.original_amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} @ ${(p.cost_rate * 100).toFixed(3)}%/mo · no fixed term`,
        outstanding: p.outstanding,
        monthlyInterest: p.monthly_interest,
        received: fsPaid(p.id),
      })
    }
  }
  repayRows.sort((a, b) => Number(a.done) - Number(b.done) || b.totalDue - a.totalDue)
  repayNoTerm.sort((a, b) => b.outstanding - a.outstanding)
  repayCompound.sort((a, b) => b.balance - a.balance)
  // 还没还够的排前面,差得多的更前。
  const minSort = (a: MinInterestRow, b: MinInterestRow) =>
    Number(a.met) - Number(b.met) || b.shortfall - a.shortfall || b.due - a.due
  collectMin.sort(minSort)
  repayMin.sort(minSort)

  // ── The calendar (2026-10-09, the handoff): each deal's repayment plan —
  // the same rows as its page's Repayment schedule — gives the month's
  // installments on their days.
  const today = officeToday()
  const events: CalendarEntry[] = []
  for (const l of loans ?? []) {
    const co = l.company_id ? coById.get(l.company_id as string) : null
    const plan = buildRepaymentPlan({
      terms: termsForLoan(l, loanHist.get(l.id as string) ?? []),
      payments: (loanReps ?? [])
        .filter((rp) => rp.loan_id === l.id)
        .map((rp) => ({ date: String(rp.payment_date).slice(0, 10), type: rp.payment_type as string, amount: Number(rp.amount), ref: null })),
      isPrincipal: isLoanPrincipal,
      today,
      dueDay: l.disbursement_date ? dayjs(l.disbursement_date as string).date() : 1,
      status: l.status as string,
    })
    events.push(
      ...monthEvents(plan, { kind: 'collect', name: (co?.short_code ?? co?.name ?? '—') as string, href: fromCalendar(`/fund-out/${l.id}`, month), rate: Number(l.effective_rate), principal: Number(l.principal) }, currentYM, today),
    )
  }
  const fsDeptName = new Map(((fsDepts ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))
  for (const m of (fsMetaRows ?? []) as Array<Record<string, unknown>>) {
    if (!['active', 'matured', 'repaid'].includes(m.status as string)) continue
    const id = m.id as string
    const co = m.from_company_id ? coById.get(m.from_company_id as string) : null
    const name = (co?.short_code ?? co?.name ?? (m.from_freetext_name as string | null) ?? (m.from_department_id ? fsDeptName.get(m.from_department_id as string) : null) ?? 'Fund source') as string
    const plan = buildRepaymentPlan({
      terms: termsForFundSource(
        {
          amount: (m.amount as number) ?? 0,
          cost_rate: (m.cost_rate as number) ?? 0,
          lock_in_months: (m.lock_in_months as number | null) ?? null,
          compound_interest: m.compound_interest as boolean | null,
          effective_date: (m.effective_date as string | null) ?? null,
          repayment_start_month: (m.repayment_start_month as string | null) ?? null,
          terms_effective_from: (m.terms_effective_from as string | null) ?? null,
        },
        fsHist.get(id) ?? [],
      ),
      payments: (fsReps ?? [])
        .filter((rp) => rp.fund_source_id === id)
        .map((rp) => ({ date: String(rp.payment_date).slice(0, 10), type: rp.payment_type as string, amount: Number(rp.amount), ref: null })),
      isPrincipal: isFundSourcePrincipal,
      today,
      dueDay: m.effective_date ? dayjs(m.effective_date as string).date() : 1,
      status: m.status as string,
    })
    events.push(...monthEvents(plan, { kind: 'pay', name, href: fromCalendar(`/fund-in/${id}`, month), rate: Number(m.cost_rate), principal: Number(m.amount) }, currentYM, today))
  }

  return {
    currentYM,
    isCurrentMonth,
    today,
    collectRows,
    collectMin,
    collectCompound,
    collectNoTerm,
    repayRows,
    repayMin,
    repayCompound,
    repayNoTerm,
    events,
  }
}
