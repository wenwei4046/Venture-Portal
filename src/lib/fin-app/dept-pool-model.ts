// Department › Dept Pool in the Finance phone app (2026-10-15, part E3 — a page
// the design does not draw, in its style): the desktop page's two bases as a
// hub each — Cash (the departments' balance to date, the total the physical
// bank holds, each department's in / out and its HR costing, each bank's
// slices, the HR costing submissions) and Accrual P&L (each department's
// revenue, cost, expense and inter-billing to date, the net margin). The
// figures are `readPoolCash` / `readPoolAccrual`'s, the page's own. Pure.

import type { HubCardItem } from '@/components/finv/Hub'
import type { HRCostSubmissionRow, PoolAccrualRead, PoolCashRead } from '@/app/(portal)/dept-pool/_lib/pool-read'
import { dayWords, f2, monthWords, plural, r2, rm } from './page-model'

export type DeptPoolCard = 'depts' | 'banks' | 'hr'
export const DEPT_POOL_CARDS: readonly DeptPoolCard[] = ['depts', 'banks', 'hr']

/** A department's own page in the app (its statements), when the reader's sidebar has it. */
export type SlugOf = (name: string) => string | null

const HR_STATE: Record<string, { text: string; tone: 'ledger' | 'accent' | 'wait' }> = {
  executed: { text: 'executed', tone: 'ledger' },
  approved_for_execution: { text: 'ready to execute', tone: 'accent' },
  pending: { text: 'awaiting Principal', tone: 'wait' },
}
export const hrState = (state: string) => HR_STATE[state] ?? { text: state, tone: 'wait' as const }
const signedRm = (n: number) => `${n < 0 ? '−' : ''}RM ${f2(Math.abs(n))}`
const signedF = (n: number) => `${n < 0 ? '−' : ''}${f2(Math.abs(n))}`

export interface PoolDeptLine {
  key: string
  name: string
  /** Cash: the balance (hidden until the reader shows the column, as the desktop's). */
  balance: number | null
  sub: string
  /** Accrual: the net margin, written. */
  value: string | null
  tone: 'out' | null
  chip: { text: string; tone: 'ledger' | 'accent' | 'wait' } | null
  /** `dp-<slug>` — the department's page in the app; null when there is none for this reader. */
  slug: string | null
}

export interface PoolSubmissionLine {
  id: string
  label: string
  sub: string
  value: string
  state: { text: string; tone: 'ledger' | 'accent' | 'wait' }
  ready: boolean
  parts: Array<{ key: string; label: string; sub: string; value: string }>
}

export interface DeptPoolHubModel {
  basis: 'cash' | 'accrual'
  hero: { value: string; label: string }
  chip: { text: string; tone: 'danger' | 'def' | 'ledger' } | null
  cards: Array<HubCardItem & { key: DeptPoolCard }>
  depts: PoolDeptLine[]
  /** Cash: each department's slice of each bank, and the banks' totals. */
  banks: { lines: Array<{ key: string; label: string; sub: string; value: string; tone: 'out' | null }>; totals: string } | null
  /** Cash: every HR costing submission, newest first (the submissions page's), when the reader opens that page. */
  submissions: PoolSubmissionLine[] | null
}

function submissionLine(s: HRCostSubmissionRow, when: (iso: string) => string): PoolSubmissionLine {
  const depts = Object.entries(s.dept_summaries ?? {}).sort((a, b) => Number(b[1].total_ctc ?? 0) - Number(a[1].total_ctc ?? 0))
  const total = r2(depts.reduce((t, [, d]) => t + Number(d.total_ctc ?? 0), 0))
  return {
    id: s.id,
    label: monthWords(s.period_month.slice(0, 7)),
    sub: `Submitted ${when(s.submitted_at)}${s.submitted_by_name ? ` · ${s.submitted_by_name}` : ''}`,
    value: f2(total),
    state: hrState(s.execution_state),
    ready: s.execution_state === 'approved_for_execution',
    parts: depts.map(([name, d]) => ({
      key: name,
      label: name,
      sub: `${plural(Number(d.staff_count ?? 0), 'staff', 'staff')} · basic ${f2(Number(d.total_basic ?? 0))} · stat ER ${f2(Number(d.total_statutory ?? 0))} · allowance ${f2(Number(d.total_allowance ?? 0))}`,
      value: f2(Number(d.total_ctc ?? 0)),
    })),
  }
}

/** Cash: `when` writes a submission's moment in the office's day (the page's `D MMM YYYY · HH:mm`). */
export function poolCashModel(read: PoolCashRead, slugOf: SlugOf, opts: { seesSubmissions: boolean; when: (iso: string) => string }): DeptPoolHubModel {
  const venture = read.ventureCash
  const rows = read.visible.map((d) => {
    const io = read.inOutByDept.get(d.id) ?? { in_amt: 0, out_amt: 0 }
    return { d, io, balance: read.balanceMap.get(d.id) ?? 0, costing: read.costingByDept.get(d.id) ?? 0, hr: read.latestHr.get(d.id) ?? null }
  })
  const inAll = r2(rows.reduce((s, r) => s + r.io.in_amt, 0) + (venture?.in_amt ?? 0))
  const outAll = r2(rows.reduce((s, r) => s + r.io.out_amt, 0) + (venture?.out_amt ?? 0))
  const below = [...rows.filter((r) => r.balance < -0.005).map((r) => r.d.name), ...(venture && venture.balance < -0.005 ? ['Venture (Office)'] : [])]
  const deptCount = `${plural(rows.length, 'department', 'departments')}${venture ? ' + Venture' : ''}`
  const ready = read.submissions.filter((s) => s.execution_state === 'approved_for_execution').length
  const awaiting = read.submissions.filter((s) => s.execution_state === 'pending').length

  const depts: PoolDeptLine[] = [
    ...rows.map((r) => ({
      key: r.d.id,
      name: r.d.name,
      balance: r.balance,
      sub: `In ${f2(r.io.in_amt)} · Out ${f2(r.io.out_amt)} · net ${signedF(r2(r.io.in_amt - r.io.out_amt))}${r.costing ? ` · HR ${f2(r.costing)}` : ''}`,
      value: null,
      tone: r.balance < -0.005 ? ('out' as const) : null,
      chip: r.hr ? hrState(r.hr.state) : null,
      slug: slugOf(r.d.name),
    })),
    ...(venture
      ? [
          {
            key: 'venture',
            name: 'Venture (Office)',
            balance: venture.balance,
            sub: `In ${f2(venture.in_amt)} · Out ${f2(venture.out_amt)} · net ${signedF(r2(venture.in_amt - venture.out_amt))}`,
            value: null,
            tone: venture.balance < -0.005 ? ('out' as const) : null,
            chip: null,
            slug: slugOf('Venture'),
          },
        ]
      : []),
  ]

  const pb = read.perBankBreakdown
  const head = (b: { code: string; name: string }) => (pb && pb.banks.filter((x) => x.name === b.name).length > 1 ? `${b.name} (${b.code})` : b.name)
  const banks = pb
    ? {
        lines: pb.rows.map((r) => ({
          key: r.segment,
          label: r.label,
          sub: pb.banks.map((b) => `${head(b)} ${signedF(r.perBank[b.code] ?? 0)}`).join(' · '),
          value: signedF(r.total),
          tone: r.total < -0.005 ? ('out' as const) : null,
        })),
        totals: pb.banks.map((b) => `${head(b)} ${f2(pb.totals.perBank[b.code] ?? 0)}`).join(' · '),
      }
    : null

  return {
    basis: 'cash',
    hero: { value: rm(r2(read.totalDeployed)), label: `Total balance · ${deptCount}` },
    chip: below.length > 0 ? { text: `${below.length} below zero`, tone: 'danger' } : { text: 'Every pool above zero', tone: 'ledger' },
    cards: [
      { key: 'depts', tone: 'all', icon: 'org', label: 'By department', sub: `In ${f2(inAll)} · Out ${f2(outAll)} · to date`, value: signedRm(r2(inAll - outAll)) },
      ...(banks && pb ? [{ key: 'banks' as const, tone: 'company' as const, icon: 'tree' as const, label: 'Balance by bank', sub: plural(pb.banks.length, 'bank', 'banks'), value: rm(pb.totals.grand) }] : []),
      ...(opts.seesSubmissions
        ? [
            {
              key: 'hr' as const,
              tone: 'payroll' as const,
              icon: 'payroll' as const,
              label: 'HR costing',
              sub: ready > 0 ? `${ready} ready to execute${awaiting ? ` · ${awaiting} awaiting Principal` : ''}` : awaiting > 0 ? `${awaiting} awaiting Principal` : 'Every submission executed',
              value: plural(read.submissions.length, 'submission', 'submissions'),
            },
          ]
        : []),
    ],
    depts,
    banks,
    submissions: opts.seesSubmissions ? read.submissions.map((s) => submissionLine(s, opts.when)) : null,
  }
}

/** Accrual P&L, cumulative to `asAt` (the month's last day). */
export function poolAccrualModel(read: PoolAccrualRead, slugOf: SlugOf, asAt: string): DeptPoolHubModel {
  const all = [...read.rows.map((r) => r.a), ...(read.ventureAccrual ? [read.ventureAccrual] : [])]
  const sum = (f: (a: (typeof all)[number]) => number) => r2(all.reduce((s, a) => s + f(a), 0))
  const net = sum((a) => a.netMargin)
  const line = (key: string, name: string, a: (typeof all)[number], slug: string | null): PoolDeptLine => ({
    key,
    name,
    balance: null,
    sub: `Revenue ${f2(a.revenue)} · cost ${f2(a.cost)} · expense ${f2(a.expense)} · inter-billing ${f2(a.interBilling)}`,
    value: signedF(a.netMargin),
    tone: a.netMargin < -0.005 ? 'out' : null,
    chip: null,
    slug,
  })
  const depts = [
    ...read.rows.map((r) => line(r.dept.id, r.dept.name, r.a, slugOf(r.dept.name))),
    ...(read.ventureAccrual ? [line('venture', 'Venture (Office)', read.ventureAccrual, slugOf('Venture'))] : []),
  ]
  return {
    basis: 'accrual',
    hero: { value: signedRm(net), label: `Net margin · to ${dayWords(asAt)}` },
    chip: { text: 'Accrual · to date', tone: 'def' },
    cards: [
      {
        key: 'depts',
        tone: 'all',
        icon: 'org',
        label: 'By department',
        sub: `Revenue ${f2(sum((a) => a.revenue))} · cost ${f2(sum((a) => a.cost))} · expense ${f2(sum((a) => a.expense))} · inter-billing ${f2(sum((a) => a.interBilling))}`,
        value: signedRm(net),
      },
    ],
    depts,
    banks: null,
    submissions: null,
  }
}
