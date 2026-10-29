// Payments › Payroll Requests in the Finance phone app (2026-10-16, part E4 —
// a page the design does not draw, in its style): what its desktop page reads
// (`readPayrollRequests`) — what is still to fund as the headline, then
// *Awaiting your action* (each request's departments: the pool's balance,
// what it owes, what earlier rounds funded), *Awaiting Principal* (fully
// funded, its vouchers) and *Statutory payments* (HR's vouchers, to see).
// Pure; the round's arithmetic is lib/payroll-funding's, the desktop form's.

import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { deptRemaining, poolLabel, round2 } from '@/lib/payroll-funding'
import type { RequestRow, BreakdownRow, FundingInfo } from '@/app/(portal)/payments/payroll-requests/_lib/payroll-read'
import type { StatutoryPeriod } from '@/app/(portal)/payments/payroll-requests/_lib/payroll-read'
import type { HubCardItem } from '@/components/finv/Hub'
import { f2, plural, rm } from './page-model'

export type PayrollCard = 'fund' | 'principal' | 'statutory'
export const PAYROLL_CARDS: readonly PayrollCard[] = ['fund', 'principal', 'statutory']

export interface PoolLine {
  pool_key: string
  dept_name: string
  label: string
  required: number
  pool_balance: number
  committed: number
  /** What it still owes: the round's default. */
  remaining: number
}

export interface PayrollRequestLine {
  id: string
  label: string
  sub: string
  /** Still to fund (or, fully funded, the request). */
  value: string
  amount: number
  committed: number
  remaining: number
  isDirector: boolean
  batchId: string | null
  period: string
  /** Who and when, in words. */
  requested: string
  pools: PoolLine[]
  /** Its vouchers awaiting the Principal. */
  pendingPvs: Array<{ id: string; voucherNo: string; amount: number }>
  /** Nothing funded yet, a staff payroll with a period: it may go back to HR. */
  canSendBack: boolean
}

export interface PayrollRequestsModel {
  hero: { value: string; label: string }
  chip: string | null
  cards: HubCardItem[]
  fund: PayrollRequestLine[]
  principal: PayrollRequestLine[]
  statutory: Array<{ key: string; title: string; lines: Array<{ id: string; label: string; sub: string; value: string }> }>
}

const monthOf = (period: string) => (period ? dayjs(period).format('MMMM YYYY') : 'Unknown period')

export function payrollRequestsModel(input: {
  rows: RequestRow[]
  breakdown: Record<string, BreakdownRow[]>
  funding: Record<string, FundingInfo>
  statutory: StatutoryPeriod[]
}): PayrollRequestsModel {
  const line = (r: RequestRow): PayrollRequestLine => {
    const f = input.funding[r.id]
    const committed = f?.committedTotal ?? 0
    const remaining = round2(r.amount - committed)
    const pools = (input.breakdown[r.id] ?? []).map((b) => {
      const c = round2(f?.committedByPool[b.pool_key] ?? 0)
      return {
        pool_key: b.pool_key,
        dept_name: b.dept_name,
        label: poolLabel(b.pool_key, b.dept_name),
        required: b.required_amount,
        pool_balance: b.pool_balance,
        committed: c,
        remaining: deptRemaining({ required: b.required_amount, committed: c }),
      }
    })
    const pending = (f?.pvs ?? []).filter((p) => p.status === 'pending_approval')
    const funded = remaining <= 0.005
    return {
      id: r.id,
      label: `${monthOf(r.period_month)}${r.isDirector ? ' · Director salary' : ''}`,
      sub:
        [r.batchLabel, funded ? 'Fully funded' : committed > 0.005 ? `${f2(committed)} of ${f2(r.amount)} funded` : null].filter(Boolean).join(' · ') ||
        `Requested by ${r.requested_by_name}`,
      value: f2(funded ? r.amount : remaining),
      amount: r.amount,
      committed,
      remaining,
      isDirector: r.isDirector,
      batchId: r.batchId,
      period: r.period_month,
      requested: `${r.requested_by_name} · ${officeTime(r.requested_at).format('D MMM HH:mm')}`,
      pools,
      pendingPvs: pending.map((p) => ({ id: p.id, voucherNo: p.voucher_no ?? 'PV', amount: p.amount })),
      canSendBack: !r.isDirector && committed <= 0.005 && !!r.period_month,
    }
  }
  const all = input.rows.map(line)
  const fund = all.filter((l) => l.remaining > 0.005)
  const principal = all.filter((l) => l.remaining <= 0.005)
  const toFund = round2(fund.reduce((t, l) => t + l.remaining, 0))
  const statutory = input.statutory.map((p) => ({
    key: p.period_month,
    title: `${dayjs(p.period_month).format('MMMM YYYY')} payroll`,
    lines: p.pvs.map((v) => ({
      id: v.id,
      label: v.payee_name ?? '—',
      sub: `${v.voucher_no ?? 'PV'} · ${v.payment_date ? officeTime(`${v.payment_date}T00:00:00+08:00`).format('D MMM YYYY') : 'date to be set'}${v.status === 'paid' ? ' · paid' : ''}`,
      value: f2(v.amount),
    })),
  }))
  const statutoryVouchers = statutory.reduce((n, p) => n + p.lines.length, 0)
  return {
    hero: { value: rm(toFund), label: `To fund · ${plural(fund.length, 'request', 'requests')}` },
    chip: principal.length > 0 ? `${principal.length} awaiting the Principal` : null,
    cards: [
      { key: 'fund', tone: 'pending_approval', icon: 'payroll', label: 'Awaiting your action', sub: plural(fund.length, 'request', 'requests'), value: rm(toFund) },
      { key: 'principal', tone: 'approved', icon: 'approve', label: 'Awaiting Principal', sub: plural(principal.length, 'request', 'requests'), value: rm(round2(principal.reduce((t, l) => t + l.amount, 0))) },
      ...(statutory.length > 0
        ? [{ key: 'statutory', tone: 'quiet' as const, icon: 'receipt' as const, label: 'Statutory payments', sub: 'KWSP · SOCSO · EIS · LHDN · SKBBK', value: plural(statutoryVouchers, 'voucher', 'vouchers') }]
        : []),
    ],
    fund,
    principal,
    statutory,
  }
}
